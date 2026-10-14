import OpenAI from "openai";

/**
 * Resolves the OpenAI API key with multi-alias support:
 * Checks customKey, OPEN_API_KEY, OPENAI_API_KEY, and OPEN_API_KAY
 */
export const getOpenAIKey = (customKey) => {
  return (
    customKey ||
    process.env.OPEN_API_KEY ||
    process.env.OPENAI_API_KEY ||
    process.env.OPEN_API_KAY ||
    ""
  ).trim();
};

/**
 * Checks whether OpenAI backup is ready and configured
 */
export const isOpenAIConfigured = (customKey) => {
  const key = getOpenAIKey(customKey);
  return Boolean(key && key.startsWith("sk-") && key.length > 20);
};

/**
 * Instantiates an OpenAI SDK client
 */
export const getOpenAIClient = (customKey) => {
  const apiKey = getOpenAIKey(customKey);
  if (!apiKey) {
    throw new Error(
      "OPEN_API_KEY is not configured in backend/.env or provided in request headers"
    );
  }
  return new OpenAI({ apiKey });
};

/**
 * Converts conversation messages and multimodal attachments to OpenAI Chat format
 */
export const formatOpenAIMessages = ({
  messages = [],
  prompt = "",
  imageUrl = null,
  systemInstruction = "",
}) => {
  const formatted = [];

  // Add system instruction if present
  if (systemInstruction && typeof systemInstruction === "string" && systemInstruction.trim()) {
    formatted.push({
      role: "system",
      content: systemInstruction.trim(),
    });
  }

  // Format historical messages
  if (Array.isArray(messages)) {
    for (const m of messages) {
      const role = m.role === "assistant" || m.role === "model" ? "assistant" : "user";
      const text = (m.content || m.text || m.prompt || "").trim();
      const img = m.imageUrl;

      if (img && typeof img === "string" && (img.startsWith("data:") || img.startsWith("http"))) {
        formatted.push({
          role,
          content: [
            ...(text ? [{ type: "text", text }] : [{ type: "text", text: "Image reference" }]),
            { type: "image_url", image_url: { url: img } },
          ],
        });
      } else if (text) {
        formatted.push({
          role,
          content: text,
        });
      }
    }
  }

  // If prompt or image was provided and not in the last message, append it
  const hasPrompt = Boolean(prompt && prompt.trim());
  const hasImage = Boolean(imageUrl && typeof imageUrl === "string" && (imageUrl.startsWith("data:") || imageUrl.startsWith("http")));

  const lastMsg = formatted[formatted.length - 1];
  const lastText = typeof lastMsg?.content === "string" ? lastMsg.content : "";
  const isDuplicate = lastMsg?.role === "user" && lastText === (prompt || "").trim() && !hasImage;

  if ((hasPrompt || hasImage) && !isDuplicate) {
    if (hasImage) {
      formatted.push({
        role: "user",
        content: [
          ...(hasPrompt ? [{ type: "text", text: prompt.trim() }] : [{ type: "text", text: "Please analyze this image." }]),
          { type: "image_url", image_url: { url: imageUrl } },
        ],
      });
    } else if (hasPrompt) {
      formatted.push({
        role: "user",
        content: prompt.trim(),
      });
    }
  }

  // Safety fallback if formatted messages are empty
  if (formatted.length === 0) {
    formatted.push({
      role: "user",
      content: prompt || "Hello",
    });
  }

  return formatted;
};

/**
 * Stream completion from OpenAI backup provider
 * Yields tokens via onChunk callback or async generator
 */
export const streamOpenAIResponse = async ({
  messages = [],
  prompt = "",
  imageUrl = null,
  systemInstruction = "",
  customKey = null,
  model = "gpt-4o-mini",
  onChunk,
  signal,
}) => {
  const openai = getOpenAIClient(customKey);
  const openAiMessages = formatOpenAIMessages({
    messages,
    prompt,
    imageUrl,
    systemInstruction,
  });

  const candidateModels = Array.from(
    new Set([model || "gpt-4o-mini", "gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"])
  );

  let stream = null;
  let selectedModel = candidateModels[0];
  let lastError = null;

  for (const candidate of candidateModels) {
    try {
      stream = await openai.chat.completions.create(
        {
          model: candidate,
          messages: openAiMessages,
          stream: true,
        },
        { signal }
      );
      selectedModel = candidate;
      break;
    } catch (err) {
      lastError = err;
      console.warn(`[OpenAI Backup] Model ${candidate} failed:`, err?.message || err);
      // If error is 429 or auth, continuing might not help, but try next candidate if any
      if (candidate === candidateModels[candidateModels.length - 1]) {
        throw err;
      }
    }
  }

  if (!stream) {
    throw lastError || new Error("Failed to initialize OpenAI stream");
  }

  let accumulatedText = "";

  for await (const chunk of stream) {
    const delta = chunk.choices?.[0]?.delta?.content || "";
    if (delta) {
      accumulatedText += delta;
      if (onChunk) {
        onChunk(delta);
      }
    }
  }

  return {
    text: accumulatedText,
    model: selectedModel,
    provider: "openai-backup",
  };
};

/**
 * Non-streaming fallback for OpenAI backup provider
 */
export const generateOpenAIResponse = async ({
  messages = [],
  prompt = "",
  imageUrl = null,
  systemInstruction = "",
  customKey = null,
  model = "gpt-4o-mini",
}) => {
  const openai = getOpenAIClient(customKey);
  const openAiMessages = formatOpenAIMessages({
    messages,
    prompt,
    imageUrl,
    systemInstruction,
  });

  const candidateModels = Array.from(
    new Set([model || "gpt-4o-mini", "gpt-4o-mini", "gpt-4o", "gpt-3.5-turbo"])
  );

  let lastError = null;
  for (const candidate of candidateModels) {
    try {
      const response = await openai.chat.completions.create({
        model: candidate,
        messages: openAiMessages,
        stream: false,
      });

      const text = response.choices?.[0]?.message?.content || "";
      return {
        text,
        model: candidate,
        provider: "openai-backup",
      };
    } catch (err) {
      lastError = err;
      console.warn(`[OpenAI Backup] Non-streaming model ${candidate} failed:`, err?.message || err);
      if (candidate === candidateModels[candidateModels.length - 1]) {
        throw err;
      }
    }
  }

  throw lastError || new Error("OpenAI backup generation failed");
};
