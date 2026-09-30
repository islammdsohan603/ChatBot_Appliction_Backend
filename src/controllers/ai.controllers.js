import { GoogleGenAI } from "@google/genai";
import AiChat from "../models/aiChat.models.js";

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

    const ai = getAIClient(userApiKey);

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

    // Model fallback chain: targetModel -> gemini-3.8-flash -> gemini-3.5-flash -> gemini-3.7-flash -> gemini-2.5-flash -> gemini-flash-latest
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

    let stream = null;
    let selectedModel = candidateModels[0];

    for (const currentModel of candidateModels) {
      try {
        stream = await ai.models.generateContentStream({
          model: currentModel,
          contents,
          config: systemInstruction ? { systemInstruction } : undefined,
        });
        selectedModel = currentModel;
        break;
      } catch (modelErr) {
        console.warn(`Model ${currentModel} failed, trying next candidate:`, modelErr?.message || modelErr);
        if (currentModel !== candidateModels[candidateModels.length - 1]) {
          await new Promise((r) => setTimeout(r, 600));
          continue;
        }
        throw modelErr;
      }
    }

    // Await user message persistence
    await userSavePromise;

    let isConnected = true;
    req.on("close", () => {
      isConnected = false;
    });

    let accumulatedText = "";

    // Stream text chunks to client with resilience
    try {
      for await (const chunk of stream) {
        if (!isConnected) break;
        const text = chunk.text;
        if (text) {
          accumulatedText += text;
          res.write(`data: ${JSON.stringify({ text })}\n\n`);
        }
      }
    } catch (streamErr) {
      console.warn("AI Stream interrupted:", streamErr?.message || streamErr);
      if (!accumulatedText.trim() && isConnected) {
        try {
          const fallbackRes = await ai.models.generateContent({
            model: selectedModel,
            contents,
            config: systemInstruction ? { systemInstruction } : undefined,
          });
          const fallbackText = fallbackRes.text || "";
          if (fallbackText) {
            accumulatedText = fallbackText;
            res.write(`data: ${JSON.stringify({ text: fallbackText })}\n\n`);
          }
        } catch (fallbackErr) {
          console.error("Non-streaming fallback failed:", fallbackErr?.message || fallbackErr);
          throw streamErr;
        }
      }
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
