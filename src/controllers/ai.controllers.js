import { GoogleGenAI } from "@google/genai";
import AiChat from "../models/aiChat.models.js";
import User from "../models/user.models.js";
import { verifyUsageAccess, incrementUsage } from "../utils/usageLimits.js";
import {
  isOpenAIConfigured,
  streamOpenAIResponse,
  generateOpenAIResponse,
} from "../utils/openaiBackup.js";

/**
 * Initializes GoogleGenAI client using server environment variable or user-provided key
 */
const getAIClient = (customKey) => {
  const apiKey =
    customKey ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGEL_API_KEY ||
    process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is not configured on the server or provided in request");
  }
  return new GoogleGenAI({ apiKey });
};

const extractErrorMessage = (error) => {
  if (!error) return "An unexpected error occurred";
  if (typeof error === "string") return error;
  if (error.message) {
    try {
      const parsed = JSON.parse(error.message);
      if (parsed.error?.message) {
        try {
          const nested = JSON.parse(parsed.error.message);
          if (nested.error?.message) return nested.error.message;
        } catch {
          return parsed.error.message;
        }
      }
    } catch {
      return error.message;
    }
    return error.message;
  }
  return String(error);
};

/**
 * Save an AI chat message to the database
 * POST /api/ai/message
 */
export const saveAiMessage = async (req, res) => {
  try {
    const { prompt, imageUrl, role, model } = req.body;
    const userId = req.userId || null;

    if (!role || (!prompt && !imageUrl)) {
      return res.status(400).json({ error: "Role and prompt or image are required" });
    }

    const saved = await AiChat.create({
      userId,
      role,
      prompt: prompt || "",
      imageUrl: imageUrl || null,
      model: model || "gemini-3.8-flash",
    });

    return res.status(201).json({ success: true, message: saved });
  } catch (error) {
    console.error("Save AI Message Error:", error);
    return res.status(500).json({ error: "Failed to persist AI message" });
  }
};

/**
 * Get AI chat history from the database
 * GET /api/ai/history
 */
export const getAiHistory = async (req, res) => {
  try {
    const userId = req.userId || null;
    const query = userId ? { userId } : { userId: null };

    // Fetch up to 50 recent messages sorted chronologically
    const history = await AiChat.find(query).sort({ createdAt: 1 }).limit(50);

    return res.status(200).json(history);
  } catch (error) {
    console.error("Get AI History Error:", error);
    return res.status(500).json({ error: "Failed to fetch chat history" });
  }
};

/**
 * Clear AI chat history from the database
 * DELETE /api/ai/history
 */
export const clearAiHistory = async (req, res) => {
  try {
    const userId = req.userId || null;
    const query = userId ? { userId } : { userId: null };

    await AiChat.deleteMany(query);

    return res.status(200).json({ success: true, message: "Chat history cleared" });
  } catch (error) {
    console.error("Clear AI History Error:", error);
    return res.status(500).json({ error: "Failed to clear chat history" });
  }
};

/**
 * Stream AI Chat controller via Server-Sent Events (SSE) with database persistence
 * POST /api/ai/chat/stream
 * Body: { prompt?: string, imageUrl?: string, messages?: Array<{ role: string, content?: string, text?: string }>, model?: string, systemInstruction?: string, apiKey?: string }
 */
export const streamAiChat = async (req, res) => {
  try {
    const { prompt, imageUrl, messages, model, systemInstruction, apiKey: bodyApiKey } = req.body;
    const userId = req.userId || null;
    const userApiKey = req.headers["x-goog-api-key"] || req.headers["x-api-key"] || bodyApiKey;

    if (!prompt && !imageUrl && (!Array.isArray(messages) || messages.length === 0)) {
      return res.status(400).json({ error: "A prompt, image, or messages array is required" });
    }

    // Google deprecated gemini-2.5-flash for new users; default to gemini-3.8-flash
    let targetModel = model || "gemini-3.8-flash";
    if (targetModel === "gemini-2.5-flash") {
      targetModel = "gemini-3.8-flash";
    }

    // Check usage limits if authenticated user
    if (userId) {
      const user = await User.findById(userId).select("subscriptionTier").lean();
      const userTier = user?.subscriptionTier || "free";

      const access = await verifyUsageAccess({
        userId,
        userTier,
        model: targetModel,
        hasImage: Boolean(imageUrl),
        promptLength: (prompt || "").length,
      });

      if (!access.allowed) {
        return res.status(403).json({
          success: false,
          error: access.error,
          reason: access.reason,
          tier: access.tier,
          limit: access.limit,
          used: access.used,
          remaining: access.remaining,
          resetsAt: access.resetsAt,
          upgradeUrl: access.upgradeUrl || "/pricing",
        });
      }
    }

    // 1. Persist user input to database concurrently/before querying AI
    let userSavePromise = Promise.resolve();
    if (prompt || imageUrl) {
      userSavePromise = AiChat.create({
        userId,
        role: "user",
        prompt: prompt || "",
        imageUrl: imageUrl || null,
        model: targetModel,
      }).catch((dbErr) => {
        console.error("Failed to persist user prompt:", dbErr);
      });
    }

    // Resolve optional custom OpenAI backup API key from request headers or body
    const userOpenAiKey =
      req.headers["x-openai-api-key"] ||
      req.headers["x-open-api-key"] ||
      req.body.openAiApiKey ||
      req.body.openApiKey;

    let ai = null;
    let lastError = null;
    try {
      ai = getAIClient(userApiKey);
    } catch (clientErr) {
      lastError = clientErr;
      console.warn("[Google AI] Client initialization skipped:", clientErr.message);
    }

const buildAlternatingContents = (historyMessages, currentPrompt, currentImageUrl) => {
  const turns = [];

  if (Array.isArray(historyMessages)) {
    for (const m of historyMessages) {
      const role = m.role === "assistant" || m.role === "model" ? "model" : "user";
      const text = (m.content || m.text || m.prompt || "").trim();
      const parts = [];

      if (m.imageUrl && typeof m.imageUrl === "string" && m.imageUrl.startsWith("data:")) {
        const [metaPart, base64Part] = m.imageUrl.split(";base64,");
        const mimeType = metaPart.replace("data:", "") || "image/jpeg";
        parts.push({
          inlineData: {
            data: base64Part,
            mimeType,
          },
        });
      }

      if (text) {
        parts.push({ text });
      }

      if (parts.length > 0) {
        turns.push({ role, parts });
      }
    }
  }

  // If prompt or image was passed directly and not in history, append it
  if (currentPrompt || currentImageUrl) {
    const parts = [];
    if (currentImageUrl && typeof currentImageUrl === "string" && currentImageUrl.startsWith("data:")) {
      const [metaPart, base64Part] = currentImageUrl.split(";base64,");
      const mimeType = metaPart.replace("data:", "") || "image/jpeg";
      parts.push({
        inlineData: {
          data: base64Part,
          mimeType,
        },
      });
    }
    if (currentPrompt) {
      parts.push({ text: currentPrompt.trim() });
    }
    if (parts.length > 0) {
      turns.push({ role: "user", parts });
    }
  }

  // Ensure first turn is 'user'
  while (turns.length > 0 && turns[0].role !== "user") {
    turns.shift();
  }

  // Merge consecutive same-role turns to strictly comply with Gemini API
  const cleanTurns = [];
  for (const turn of turns) {
    if (cleanTurns.length > 0 && cleanTurns[cleanTurns.length - 1].role === turn.role) {
      const prevTurn = cleanTurns[cleanTurns.length - 1];
      const prevTextPart = prevTurn.parts.find((p) => typeof p.text === "string");
      const newTextPart = turn.parts.find((p) => typeof p.text === "string");
      if (prevTextPart && newTextPart) {
        prevTextPart.text += "\n" + newTextPart.text;
      } else if (newTextPart) {
        prevTurn.parts.push(newTextPart);
      }
      const newImageParts = turn.parts.filter((p) => p.inlineData);
      prevTurn.parts.push(...newImageParts);
    } else {
      cleanTurns.push(turn);
    }
  }

  if (cleanTurns.length === 0) {
    cleanTurns.push({ role: "user", parts: [{ text: currentPrompt || "Hello" }] });
  } else if (cleanTurns[cleanTurns.length - 1].role !== "user") {
    cleanTurns.push({ role: "user", parts: [{ text: currentPrompt || "Continue" }] });
  }

  return cleanTurns;
};

    const contents = buildAlternatingContents(messages, prompt, imageUrl);

    // Set Server-Sent Events (SSE) headers
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    let selectedModel = targetModel;
    let streamSuccess = false;
    let accumulatedText = "";

    let isConnected = true;
    req.on("close", () => {
      isConnected = false;
    });

    // 1. Attempt Google Gemini first if client was successfully initialized
    if (ai) {
      const candidateModels = Array.from(
        new Set([
          targetModel,
          "gemini-3.8-flash",
          "gemini-3.5-flash",
          "gemini-3.7-flash",
          "gemini-2.5-flash",
          "gemini-flash-latest",
        ])
      ).filter(Boolean);

      selectedModel = candidateModels[0];

      for (const currentModel of candidateModels) {
        if (!isConnected) break;
        try {
          const stream = await ai.models.generateContentStream({
            model: currentModel,
            contents,
            config: systemInstruction ? { systemInstruction } : undefined,
          });

          for await (const chunk of stream) {
            if (!isConnected) break;
            const text = chunk.text;
            if (text) {
              accumulatedText += text;
              res.write(`data: ${JSON.stringify({ text })}\n\n`);
            }
          }

          selectedModel = currentModel;
          streamSuccess = true;
          break;
        } catch (modelErr) {
          lastError = modelErr;
          console.warn(`Model ${currentModel} failed:`, modelErr?.message || modelErr);
          if (accumulatedText.trim().length > 0) {
            break;
          }
          if (currentModel !== candidateModels[candidateModels.length - 1]) {
            await new Promise((r) => setTimeout(r, 400));
          }
        }
      }

      // Non-streaming Gemini fallback if streaming didn't produce tokens
      if (!streamSuccess && !accumulatedText.trim() && isConnected) {
        for (const currentModel of candidateModels) {
          try {
            const fallbackRes = await ai.models.generateContent({
              model: currentModel,
              contents,
              config: systemInstruction ? { systemInstruction } : undefined,
            });
            const fallbackText = fallbackRes.text || "";
            if (fallbackText) {
              accumulatedText = fallbackText;
              selectedModel = currentModel;
              res.write(`data: ${JSON.stringify({ text: fallbackText })}\n\n`);
              streamSuccess = true;
              break;
            }
          } catch (fallbackErr) {
            console.warn(`Non-streaming fallback model ${currentModel} failed:`, fallbackErr?.message || fallbackErr);
          }
        }
      }
    }

    // ── AUTOMATIC BACKUP: OPENAI (OPEN_API_KEY) ──
    // If Google cannot answer, immediately switch to OpenAI backup to fulfill the user's request
    if (!streamSuccess && !accumulatedText.trim() && isConnected && isOpenAIConfigured(userOpenAiKey)) {
      console.log(
        `[AI Fallback] Google Gemini unavailable (${lastError?.message || "unreachable"}). Rapidly switching to OpenAI backup (gpt-4o-mini)...`
      );
      try {
        const backupResult = await streamOpenAIResponse({
          messages,
          prompt,
          imageUrl,
          systemInstruction,
          customKey: userOpenAiKey,
          model: "gpt-4o-mini",
          onChunk: (delta) => {
            if (!isConnected) return;
            accumulatedText += delta;
            res.write(`data: ${JSON.stringify({ text: delta })}\n\n`);
          },
        });
        selectedModel = `${backupResult.model} (OpenAI Backup)`;
        streamSuccess = true;
      } catch (openAiStreamErr) {
        console.warn("[OpenAI Backup] Streaming failed, attempting non-streaming fallback:", openAiStreamErr?.message || openAiStreamErr);
        try {
          const nonStreamRes = await generateOpenAIResponse({
            messages,
            prompt,
            imageUrl,
            systemInstruction,
            customKey: userOpenAiKey,
            model: "gpt-4o-mini",
          });
          if (nonStreamRes.text && isConnected) {
            accumulatedText = nonStreamRes.text;
            selectedModel = `${nonStreamRes.model} (OpenAI Backup)`;
            res.write(`data: ${JSON.stringify({ text: nonStreamRes.text })}\n\n`);
            streamSuccess = true;
          }
        } catch (openAiNonStreamErr) {
          console.error("[OpenAI Backup] Non-streaming also failed:", openAiNonStreamErr?.message || openAiNonStreamErr);
          const combinedMsg = `Google AI was unavailable (${lastError?.message || "error"}), and OpenAI backup also failed (${openAiNonStreamErr?.message || "error"}).`;
          throw new Error(combinedMsg);
        }
      }
    }

    // Await user message persistence
    await userSavePromise;

    if (!streamSuccess && !accumulatedText.trim() && lastError) {
      throw lastError;
    }

    if (isConnected) {
      res.write("data: [DONE]\n\n");
      res.end();

      // 3. Persist assistant response to database on completion
      if (accumulatedText.trim()) {
        AiChat.create({
          userId,
          role: "assistant",
          prompt: accumulatedText.trim(),
          imageUrl: null,
          model: selectedModel,
        }).catch((dbErr) => {
          console.error("Failed to persist assistant response:", dbErr);
        });

        // Record daily usage consumption
        if (userId) {
          incrementUsage(userId, {
            messages: 1,
            images: imageUrl ? 1 : 0,
            tokens: Math.round(((prompt?.length || 0) + accumulatedText.length) / 3.8),
          }).catch((err) => console.error("Failed to increment usage in ai chat:", err));
        }
      }
    }
  } catch (error) {
    const cleanError = extractErrorMessage(error);
    console.error("AI Streaming Error:", cleanError);

    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: cleanError })}\n\n`);
      res.write("data: [DONE]\n\n");
      return res.end();
    }
    return res.status(500).json({ error: cleanError });
  }
};
