import mongoose from "mongoose";
import { GoogleGenAI } from "@google/genai";
import Conversation from "../models/conversation.models.js";
import Message from "../models/message.models.js";

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

/**
 * Derives a clean conversation title from the first prompt (35-40 chars, word-bounded)
 */
export const deriveTitle = (prompt) => {
  if (!prompt || typeof prompt !== "string") {
    return "Image Analysis";
  }

  const clean = prompt.trim().replace(/\s+/g, " ");
  if (clean.length <= 38) {
    return clean || "New Conversation";
  }

  // Find last space before 38 characters to avoid cutting words
  const truncated = clean.slice(0, 38);
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > 20) {
    return truncated.slice(0, lastSpace).trim() + "…";
  }
  return truncated.trim() + "…";
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
 * Stream AI Chat for a Conversation via Server-Sent Events (SSE)
 * POST /api/conversations/stream
 * Body: { conversationId?: string, prompt?: string, imageUrl?: string, model?: string, systemInstruction?: string, apiKey?: string }
 */
export const streamConversationChat = async (req, res) => {
  const userId = req.userId;
  if (!userId) {
    return res.status(401).json({ error: "Authentication required" });
  }

  const { conversationId, prompt, imageUrl, model, systemInstruction, apiKey: bodyApiKey } = req.body;
  const userApiKey = req.headers["x-goog-api-key"] || req.headers["x-api-key"] || bodyApiKey;

  if (!prompt && !imageUrl) {
    return res.status(400).json({ error: "A prompt or image is required" });
  }

  // Default to gemini-2.0-flash
  let targetModel = model || "gemini-2.0-flash";
  if (targetModel === "gemini-2.5-flash" || targetModel === "gemini-3.8-flash") {
    targetModel = "gemini-2.0-flash";
  }

  let activeConversation = null;
  let isNewSession = false;

  try {
    // 1. Resolve or create Conversation
    if (conversationId && conversationId !== "new") {
      if (!mongoose.Types.ObjectId.isValid(conversationId)) {
        return res.status(400).json({ error: "Invalid conversation ID format" });
      }
      activeConversation = await Conversation.findOne({
        _id: conversationId,
        userId,
      });

      if (!activeConversation) {
        return res.status(404).json({ error: "Conversation not found or unauthorized" });
      }
    } else {
      // Auto-create new conversation on first prompt submission
      const derivedTitle = deriveTitle(prompt);
      activeConversation = await Conversation.create({
        userId,
        title: derivedTitle,
        model: targetModel,
        lastMessage: prompt ? prompt.slice(0, 100) : "Image attachment",
      });
      isNewSession = true;
    }

    // 2. Step A: Persist user prompt immediately to MongoDB under this session
    const userMessageContent = prompt || (imageUrl ? "[Image attachment]" : "");
    const userMsg = await Message.create({
      conversationId: activeConversation._id,
      userId,
      role: "user",
      content: userMessageContent,
      imageUrl: imageUrl || null,
      model: targetModel,
    });

    // 3. Set SSE streaming headers
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    // 4. Step B: Emit session_created immediately if newly created
    if (isNewSession) {
      res.write(
        `data: ${JSON.stringify({
          type: "session_created",
          conversation: {
            _id: activeConversation._id,
            title: activeConversation.title,
            createdAt: activeConversation.createdAt,
            updatedAt: activeConversation.updatedAt,
            lastMessage: activeConversation.lastMessage,
            model: activeConversation.model,
          },
          userMessageId: userMsg._id,
        })}\n\n`
      );
    }

const buildAlternatingContents = (messages, currentPrompt, currentImageUrl) => {
  const turns = [];

  for (const m of messages) {
    const role = m.role === "assistant" || m.role === "model" ? "model" : "user";
    const text = (m.content || m.text || "").trim();
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

  // Ensure first turn is from 'user'
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

  // Fallback if turns ended up empty
  if (cleanTurns.length === 0) {
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
    parts.push({ text: currentPrompt || "Hello" });
    cleanTurns.push({ role: "user", parts });
  } else if (cleanTurns[cleanTurns.length - 1].role !== "user") {
    cleanTurns.push({ role: "user", parts: [{ text: currentPrompt || "Continue" }] });
  }

  return cleanTurns;
};

    // 5. Retrieve sliding window of historical messages for multi-turn context
    const recentMessages = await Message.find({
      conversationId: activeConversation._id,
    })
      .sort({ createdAt: 1 })
      .limit(20)
      .lean();

    // Prepare contents for Gemini with strictly alternating turns
    const ai = getAIClient(userApiKey);
    const contents = buildAlternatingContents(recentMessages, prompt, imageUrl);

    // Model fallback chain: targetModel -> gemini-2.0-flash -> gemini-1.5-flash -> gemini-1.5-pro -> gemini-flash-latest
    const candidateModels = Array.from(
      new Set([
        targetModel,
        "gemini-2.0-flash",
        "gemini-1.5-flash",
        "gemini-1.5-pro",
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

    let isConnected = true;
    req.on("close", () => {
      isConnected = false;
    });

    let accumulatedText = "";

    // 6. Stream tokens to client with resilience against mid-stream JSON errors
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
      console.warn("Stream interrupted:", streamErr?.message || streamErr);
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

    // 7. Step C: On completion, persist AI assistant response & update conversation
    if (isConnected) {
      res.write("data: [DONE]\n\n");
      res.end();

      if (accumulatedText.trim()) {
        await Message.create({
          conversationId: activeConversation._id,
          userId,
          role: "assistant",
          content: accumulatedText.trim(),
          imageUrl: null,
          model: selectedModel,
        });

        await Conversation.findByIdAndUpdate(activeConversation._id, {
          lastMessage: accumulatedText.trim().slice(0, 100),
          updatedAt: new Date(),
        });
      }
    }
  } catch (error) {
    const cleanError = extractErrorMessage(error);
    console.error("Conversation Streaming Error:", cleanError);

    if (res.headersSent) {
      res.write(`data: ${JSON.stringify({ error: cleanError })}\n\n`);
      res.write("data: [DONE]\n\n");
      return res.end();
    }
    return res.status(500).json({ error: cleanError });
  }
};

/**
 * Get all conversations for the authenticated user
 * GET /api/conversations
 */
export const getUserConversations = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const conversations = await Conversation.find({ userId })
      .sort({ updatedAt: -1 })
      .lean();

    return res.status(200).json(conversations);
  } catch (error) {
    console.error("Get User Conversations Error:", error);
    return res.status(500).json({ error: "Failed to fetch conversations" });
  }
};

/**
 * Get single conversation with its complete message history
 * GET /api/conversations/:id
 */
export const getConversationById = async (req, res) => {
  try {
    const userId = req.userId;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const conversation = await Conversation.findOne({ _id: id, userId }).lean();
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    const messages = await Message.find({ conversationId: id, userId })
      .sort({ createdAt: 1 })
      .lean();

    return res.status(200).json({
      conversation,
      messages,
    });
  } catch (error) {
    console.error("Get Conversation Error:", error);
    return res.status(500).json({ error: "Failed to fetch conversation messages" });
  }
};

/**
 * Delete a conversation and all its messages
 * DELETE /api/conversations/:id
 */
export const deleteConversation = async (req, res) => {
  try {
    const userId = req.userId;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ error: "Invalid conversation ID format" });
    }

    const conversation = await Conversation.findOne({ _id: id, userId });

    // Delete messages associated with this conversation
    await Message.deleteMany({ conversationId: id, userId });

    if (conversation) {
      await Conversation.deleteOne({ _id: id });
    }

    // Return 200 idempotent success so client state synchronizes cleanly
    return res.status(200).json({
      success: true,
      message: "Conversation and messages deleted successfully",
      conversationId: id,
    });
  } catch (error) {
    console.error("Delete Conversation Error:", error);
    return res.status(500).json({ error: "Failed to delete conversation" });
  }
};

/**
 * Explicitly create a new conversation (REST fallback)
 * POST /api/conversations
 */
export const createConversation = async (req, res) => {
  try {
    const userId = req.userId;
    const { title, model } = req.body;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const conversation = await Conversation.create({
      userId,
      title: title?.trim() || "New Chat",
      model: model || "gemini-3.8-flash",
    });

    return res.status(201).json({ success: true, conversation });
  } catch (error) {
    console.error("Create Conversation Error:", error);
    return res.status(500).json({ error: "Failed to create conversation" });
  }
};
