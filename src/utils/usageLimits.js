import Usage from "../models/usage.models.js";
import User from "../models/user.models.js";

/**
 * Feature capabilities and usage limits by subscription tier
 */
export const TIER_LIMITS = {
  free: {
    tier: "free",
    name: "Free Starter",
    badge: "Free",
    maxDailyMessages: 20,
    maxDailyImages: 5,
    allowedModels: [
      "gemini-flash-lite-latest",
      "gemini-3.1-flash-lite",
      "gemini-3.6-flash",
      "gemini-3.5-flash",
      "gemini-3.5-flash-lite",
      "gemini-3.8-flash",
      "gemini-flash-latest",
    ],
    proOnlyModels: [
      "gemini-3.5-pro",
      "gemini-3.7-flash",
      "gemini-pro-latest",
      "gemini-1.5-pro",
      "gemini-2.5-pro",
    ],
    visionEnabled: true,
    maxImageSizeMb: 4,
    canExportHistory: false,
    prioritySupport: false,
    maxPromptLength: 2500,
    features: [
      "20 AI messages / day",
      "Ultra-fast Gemini Flash Lite models",
      "Up to 5 image attachments / day",
      "High-speed streaming responses",
    ],
  },
  pro: {
    tier: "pro",
    name: "Pro Developer",
    badge: "Pro",
    maxDailyMessages: 10000, // Unlimited practical usage
    maxDailyImages: 1000,
    allowedModels: [
      "gemini-flash-lite-latest",
      "gemini-3.1-flash-lite",
      "gemini-3.6-flash",
      "gemini-3.5-flash",
      "gemini-3.5-flash-lite",
      "gemini-3.8-flash",
      "gemini-3.5-pro",
      "gemini-3.7-flash",
      "gemini-flash-latest",
      "gemini-pro-latest",
      "gemini-1.5-pro",
      "gemini-2.5-pro",
    ],
    proOnlyModels: [],
    visionEnabled: true,
    maxImageSizeMb: 20,
    canExportHistory: true,
    prioritySupport: true,
    maxPromptLength: 25000,
    features: [
      "Unlimited AI conversations & messages",
      "All models unlocked including Gemini 3.5 Pro & 3.7 Flash",
      "Unlimited high-resolution vision uploads",
      "Full conversation history export (JSON & Markdown)",
      "Priority response queue",
      "Direct Priority Support",
    ],
  },
  enterprise: {
    tier: "enterprise",
    name: "Enterprise Studio",
    badge: "Enterprise",
    maxDailyMessages: 100000,
    maxDailyImages: 10000,
    allowedModels: ["*"],
    proOnlyModels: [],
    visionEnabled: true,
    maxImageSizeMb: 50,
    canExportHistory: true,
    prioritySupport: true,
    maxPromptLength: 50000,
    features: [
      "Unlimited AI conversations & messages",
      "All Gemini models + custom fine-tunes",
      "Dedicated high-throughput quota",
      "SOC2 audit logs & compliance",
      "24/7 dedicated support",
    ],
  },
};

/**
 * Returns the current date in UTC format "YYYY-MM-DD"
 */
export const getUtcDateString = () => {
  const now = new Date();
  return now.toISOString().split("T")[0];
};

/**
 * Calculates milliseconds and ISO string for the next UTC midnight reset
 */
export const getNextResetTime = () => {
  const now = new Date();
  const nextReset = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, 0, 0, 0, 0)
  );
  return {
    resetsAt: nextReset.toISOString(),
    secondsRemaining: Math.max(0, Math.floor((nextReset.getTime() - now.getTime()) / 1000)),
  };
};

/**
 * Resolves tier limits for a given subscription tier name
 */
export const getTierLimits = (tier = "free") => {
  const cleanTier = (tier || "free").toLowerCase();
  return TIER_LIMITS[cleanTier] || TIER_LIMITS.free;
};

/**
 * Retrieves today's usage statistics for a user along with their tier limits
 */
export const getUserUsageAndLimits = async (userId, userTier = "free") => {
  const date = getUtcDateString();
  const limits = getTierLimits(userTier);
  const { resetsAt, secondsRemaining } = getNextResetTime();

  if (!userId) {
    return {
      date,
      tier: "free",
      limits: TIER_LIMITS.free,
      usage: {
        messageCount: 0,
        imageCount: 0,
        tokensUsed: 0,
      },
      remainingMessages: TIER_LIMITS.free.maxDailyMessages,
      remainingImages: TIER_LIMITS.free.maxDailyImages,
      isMessageLimitReached: false,
      isImageLimitReached: false,
      resetsAt,
      secondsRemaining,
    };
  }

  const record = await Usage.findOne({ userId, date }).lean();
  const messageCount = record?.messageCount || 0;
  const imageCount = record?.imageCount || 0;
  const tokensUsed = record?.tokensUsed || 0;

  const isProOrAbove = userTier === "pro" || userTier === "enterprise";
  const isMessageLimitReached = !isProOrAbove && messageCount >= limits.maxDailyMessages;
  const isImageLimitReached = !isProOrAbove && imageCount >= limits.maxDailyImages;

  const remainingMessages = isProOrAbove
    ? 999999
    : Math.max(0, limits.maxDailyMessages - messageCount);
  const remainingImages = isProOrAbove
    ? 999999
    : Math.max(0, limits.maxDailyImages - imageCount);

  return {
    date,
    tier: userTier,
    limits,
    usage: {
      messageCount,
      imageCount,
      tokensUsed,
    },
    remainingMessages,
    remainingImages,
    isMessageLimitReached,
    isImageLimitReached,
    resetsAt,
    secondsRemaining,
  };
};

/**
 * Atomically increments message and image usage for a user
 */
export const incrementUsage = async (
  userId,
  { messages = 1, images = 0, tokens = 0 } = {}
) => {
  if (!userId) return null;

  const date = getUtcDateString();
  try {
    const updated = await Usage.findOneAndUpdate(
      { userId, date },
      {
        $inc: {
          messageCount: messages,
          imageCount: images,
          tokensUsed: tokens,
        },
        $set: {
          lastActiveAt: new Date(),
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return updated;
  } catch (err) {
    console.error("Failed to increment usage:", err);
    return null;
  }
};

/**
 * Verifies if the user is allowed to perform the requested AI operation
 */
export const verifyUsageAccess = async ({
  userId,
  userTier = "free",
  model = "gemini-3.8-flash",
  hasImage = false,
  promptLength = 0,
}) => {
  const limits = getTierLimits(userTier);
  const isProOrAbove = userTier === "pro" || userTier === "enterprise";

  // 1. Model permission check
  const requestedModel = (model || "").toLowerCase();
  const isProOnlyModel = limits.proOnlyModels?.some((m) =>
    requestedModel.includes(m.toLowerCase())
  );

  if (!isProOrAbove && isProOnlyModel) {
    return {
      allowed: false,
      reason: "MODEL_RESTRICTED",
      error: `The model '${model}' requires a Pro subscription. Upgrade to Pro to unlock advanced reasoning models like Gemini 3.5 Pro and Gemini 3.7 Flash.`,
      tier: userTier,
      requiredTier: "pro",
      model,
    };
  }

  // 2. Prompt length check
  if (promptLength > limits.maxPromptLength) {
    return {
      allowed: false,
      reason: "PROMPT_LENGTH_EXCEEDED",
      error: `Your prompt length exceeds the ${limits.maxPromptLength} character limit for the ${limits.name} plan. Upgrade to Pro for extended context lengths.`,
      tier: userTier,
      limit: limits.maxPromptLength,
      length: promptLength,
    };
  }

  // 3. Daily usage checks (skip strict limits for Pro/Enterprise)
  if (isProOrAbove) {
    return {
      allowed: true,
      tier: userTier,
      isUnlimited: true,
    };
  }

  const {
    isMessageLimitReached,
    isImageLimitReached,
    remainingMessages,
    remainingImages,
    usage,
    resetsAt,
  } = await getUserUsageAndLimits(userId, userTier);

  if (isMessageLimitReached) {
    return {
      allowed: false,
      reason: "MESSAGE_LIMIT_REACHED",
      error: `You have reached your daily limit of ${limits.maxDailyMessages} messages on the Free Starter plan. Upgrade to Pro for unlimited AI conversations and priority performance.`,
      tier: userTier,
      limit: limits.maxDailyMessages,
      used: usage.messageCount,
      remaining: 0,
      resetsAt,
      upgradeUrl: "/pricing",
    };
  }

  if (hasImage && isImageLimitReached) {
    return {
      allowed: false,
      reason: "IMAGE_LIMIT_REACHED",
      error: `You have reached your daily limit of ${limits.maxDailyImages} vision attachments on the Free Starter plan. Upgrade to Pro for unlimited image analysis.`,
      tier: userTier,
      limit: limits.maxDailyImages,
      used: usage.imageCount,
      remaining: 0,
      resetsAt,
      upgradeUrl: "/pricing",
    };
  }

  return {
    allowed: true,
    tier: userTier,
    remainingMessages,
    remainingImages,
    usage,
  };
};
