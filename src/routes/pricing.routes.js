import express from "express";
import {
  getPricingPlans,
  subscribeToPlan,
  createCheckoutSession,
  handleStripeWebhook,
  verifyCheckoutSession,
} from "../controllers/pricing.controllers.js";
import { isAuth } from "../middlewares/isAuth.js";

const router = express.Router();

// Public route to view plans
router.get("/plans", getPricingPlans);

// Protected: Create Stripe Checkout Session for paid plans
router.post("/create-checkout-session", isAuth, createCheckoutSession);

// Protected: Verify a completed checkout session (used by success page)
router.get("/verify-session", isAuth, verifyCheckoutSession);

// Protected: Direct subscription change (free plan downgrade only)
router.post("/subscribe", isAuth, subscribeToPlan);

// Stripe Webhook — receives raw body for signature verification
// NOTE: This route uses express.raw() middleware. See index.js for setup.
router.post("/webhook", express.raw({ type: "application/json" }), handleStripeWebhook);

export default router;
