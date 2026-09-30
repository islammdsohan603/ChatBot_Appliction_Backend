import Pricing from "../models/pricing.models.js";
import User from "../models/user.models.js";

const DEFAULT_PLANS = [
  {
    name: "Free Starter",
    slug: "free",
    description: "Essential AI chat capabilities for casual users and beginners.",
    priceMonthly: 0,
    priceYearly: 0,
    isPopular: false,
    highlightBadge: "",
    features: [
      "Access to Gemini 3.8 Flash model",
      "Up to 50 conversations per day",
      "Standard response streaming speeds",
      "Multimodal image analysis (up to 5MB)",
      "Community forum access",
      "Light & Dark UI themes",
    ],
    limits: {
      messagesPerDay: 50,
      models: ["gemini-3.8-flash"],
      visionEnabled: true,
      prioritySupport: false,
      exportHistory: false,
    },
    isActive: true,
  },
  {
    name: "Pro Developer",
    slug: "pro",
    description: "Enhanced power, higher limits, and priority model availability for developers.",
    priceMonthly: 19,
    priceYearly: 190,
    isPopular: true,
    highlightBadge: "Most Popular",
    features: [
      "Unlimited AI conversations & messages",
      "Access to Gemini 3.8 Flash & Gemini 3.5 Pro",
      "Priority response queue during peak hours",
      "Unlimited image vision attachments",
      "Full conversation history export (JSON & Markdown)",
      "Custom system instructions per session",
      "Direct Priority Support via Discord",
    ],
    limits: {
      messagesPerDay: 99999,
      models: ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.7-flash"],
      visionEnabled: true,
      prioritySupport: true,
      exportHistory: true,
    },
    isActive: true,
  },
  {
    name: "Enterprise Studio",
    slug: "enterprise",
    description: "Dedicated infrastructure, custom SLAs, and custom LLM tuning for organizations.",
    priceMonthly: 79,
    priceYearly: 790,
    isPopular: false,
    highlightBadge: "Best for Teams",
    features: [
      "Everything in Pro included",
      "Dedicated high-throughput Gemini quota",
      "Custom system instructions & domain knowledge base",
      "Team collaboration & shared workspace channels",
      "Enterprise audit logs & SOC2 compliance docs",
      "Custom API rate limits & Webhook integrations",
      "24/7 dedicated support engineer",
    ],
    limits: {
      messagesPerDay: 999999,
      models: ["gemini-3.8-flash", "gemini-3.5-flash", "gemini-3.7-flash", "gemini-flash-latest"],
      visionEnabled: true,
      prioritySupport: true,
      exportHistory: true,
    },
    isActive: true,
  },
];

/**
 * Get all available pricing plans (seeds defaults if database collection is empty)
 * GET /api/pricing/plans
 */
export const getPricingPlans = async (req, res) => {
  try {
    let plans = await Pricing.find({ isActive: true }).sort({ priceMonthly: 1 });

    if (!plans || plans.length === 0) {
      await Pricing.insertMany(DEFAULT_PLANS);
      plans = await Pricing.find({ isActive: true }).sort({ priceMonthly: 1 });
    }

    return res.status(200).json({ success: true, plans });
  } catch (error) {
    console.error("Get Pricing Plans Error:", error);
    return res.status(500).json({ error: "Failed to retrieve pricing plans" });
  }
};

/**
 * Update user subscription tier
 * POST /api/pricing/subscribe
 * Body: { planSlug: "free" | "pro" | "enterprise" }
 */
export const subscribeToPlan = async (req, res) => {
  try {
    const userId = req.userId;
    const { planSlug } = req.body;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const validTiers = ["free", "pro", "enterprise"];
    if (!planSlug || !validTiers.includes(planSlug.toLowerCase())) {
      return res.status(400).json({ error: "Invalid plan selection" });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { subscriptionTier: planSlug.toLowerCase() },
      { new: true }
    ).select("-password");

    return res.status(200).json({
      success: true,
      message: `Successfully updated subscription to ${planSlug.toUpperCase()}`,
      user: updatedUser,
    });
  } catch (error) {
    console.error("Subscribe Error:", error);
    return res.status(500).json({ error: "Failed to process subscription update" });
  }
};
