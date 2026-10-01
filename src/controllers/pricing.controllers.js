import Stripe from "stripe";
import Pricing from "../models/pricing.models.js";
import User from "../models/user.models.js";

// Lazy initialization of Stripe; ensures env vars are loaded before creating the client.
let stripeInstance;
function getStripe() {
  if (!stripeInstance) {
    const secretKey = process.env.STRIPE_SECRET_KEY;
    if (!secretKey) {
      throw new Error("Stripe secret key not set in environment variables");
    }
    stripeInstance = new Stripe(secretKey);
  }
  return stripeInstance;
}

const CLIENT_URL = process.env.CLIENT_URL || "http://localhost:5173";

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
 * Create a Stripe Checkout Session for a paid plan
 * POST /api/pricing/create-checkout-session
 * Body: { planSlug: "pro" | "enterprise", billingCycle: "monthly" | "yearly" }
 */
export const createCheckoutSession = async (req, res) => {
  try {
    const userId = req.userId;
    const { planSlug, billingCycle = "monthly" } = req.body;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const validPaidTiers = ["pro", "enterprise"];
    if (!planSlug || !validPaidTiers.includes(planSlug.toLowerCase())) {
      return res.status(400).json({ error: "Invalid plan selection. Only Pro and Enterprise require payment." });
    }

    const user = await User.findById(userId).select("-password").lean();
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }

    if (user.subscriptionTier === planSlug.toLowerCase()) {
      return res.status(400).json({ error: `You are already on the ${planSlug.toUpperCase()} plan.` });
    }

    // Determine price based on plan and billing cycle
    const planData = DEFAULT_PLANS.find((p) => p.slug === planSlug.toLowerCase());
    if (!planData) {
      return res.status(400).json({ error: "Plan not found" });
    }

    const isYearly = billingCycle === "yearly";
    const unitAmount = isYearly ? planData.priceYearly * 100 : planData.priceMonthly * 100; // Stripe uses cents

    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      customer_email: user.email,
      metadata: {
        userId: userId.toString(),
        planSlug: planSlug.toLowerCase(),
        billingCycle,
        userName: user.userName || user.name || "",
      },
      line_items: [
        {
          price_data: {
            currency: "usd",
            product_data: {
              name: `${planData.name} Plan`,
              description: `${planData.description} (${isYearly ? "Annual" : "Monthly"} billing)`,
            },
            unit_amount: unitAmount,
          },
          quantity: 1,
        },
      ],
      success_url: `${CLIENT_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${CLIENT_URL}/payment/cancel`,
    });

    return res.status(200).json({
      success: true,
      sessionId: session.id,
      url: session.url,
    });
  } catch (error) {
    console.error("Create Checkout Session Error:", error);
    return res.status(500).json({ error: "Failed to create checkout session" });
  }
};

/**
 * Stripe Webhook handler — processes completed checkout events
 * POST /api/pricing/webhook
 * NOTE: This endpoint receives the RAW body (not JSON-parsed) for signature verification
 */
export const handleStripeWebhook = async (req, res) => {
  const sig = req.headers["stripe-signature"];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    if (webhookSecret) {
      event = getStripe().webhooks.constructEvent(req.body, sig, webhookSecret);
    } else {
      // In development without webhook secret, parse the event directly
      event = typeof req.body === "string" ? JSON.parse(req.body) : req.body;
      console.warn("⚠️  Stripe webhook secret not set — skipping signature verification (dev mode)");
    }
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  // Handle checkout.session.completed event
  if (event.type === "checkout.session.completed") {
    const session = event.data.object;
    const { userId, planSlug } = session.metadata || {};

    if (userId && planSlug) {
      try {
        await User.findByIdAndUpdate(userId, {
          subscriptionTier: planSlug,
        });
        console.log(`✅ Subscription updated: User ${userId} → ${planSlug.toUpperCase()}`);
      } catch (dbErr) {
        console.error("Failed to update subscription from webhook:", dbErr);
        return res.status(500).json({ error: "Database update failed" });
      }
    }
  }

  return res.status(200).json({ received: true });
};

/**
 * Verify a completed Stripe Checkout Session and update user's subscription
 * GET /api/pricing/verify-session?session_id=cs_xxx
 * Used by the success page to confirm payment and update the user's tier
 */
export const verifyCheckoutSession = async (req, res) => {
  try {
    const userId = req.userId;
    const { session_id } = req.query;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!session_id) {
      return res.status(400).json({ error: "Missing session_id parameter" });
    }

    const session = await getStripe().checkout.sessions.retrieve(session_id);

    if (!session) {
      return res.status(404).json({ error: "Checkout session not found" });
    }

    if (session.payment_status !== "paid") {
      return res.status(400).json({
        error: "Payment has not been completed",
        payment_status: session.payment_status,
      });
    }

    // Verify that this session belongs to the requesting user
    const sessionUserId = session.metadata?.userId;
    if (sessionUserId !== userId.toString()) {
      return res.status(403).json({ error: "Session does not belong to this user" });
    }

    const planSlug = session.metadata?.planSlug;
    if (!planSlug) {
      return res.status(400).json({ error: "Plan information missing from session" });
    }

    // Update user subscription tier (idempotent — safe to call multiple times)
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { subscriptionTier: planSlug },
      { new: true }
    ).select("-password");

    return res.status(200).json({
      success: true,
      message: `Successfully subscribed to ${planSlug.toUpperCase()} plan!`,
      plan: planSlug,
      user: updatedUser,
    });
  } catch (error) {
    console.error("Verify Checkout Session Error:", error);
    return res.status(500).json({ error: "Failed to verify checkout session" });
  }
};

/**
 * Update user subscription tier (for free plan downgrade or direct changes)
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

    // Only allow direct subscription for the free tier (downgrade)
    // Paid plans must go through Stripe Checkout
    if (planSlug !== "free") {
      return res.status(400).json({
        error: "Paid plans require payment via Stripe checkout. Use the checkout flow.",
      });
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { subscriptionTier: "free" },
      { new: true }
    ).select("-password");

    return res.status(200).json({
      success: true,
      message: "Successfully switched to the Free Starter plan",
      user: updatedUser,
    });
  } catch (error) {
    console.error("Subscribe Error:", error);
    return res.status(500).json({ error: "Failed to process subscription update" });
  }
};
