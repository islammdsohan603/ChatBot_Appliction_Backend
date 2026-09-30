import express from "express";
import { getPricingPlans, subscribeToPlan } from "../controllers/pricing.controllers.js";
import { isAuth } from "../middlewares/isAuth.js";

const router = express.Router();

// Public route to view plans
router.get("/plans", getPricingPlans);

// Protected route to update plan
router.post("/subscribe", isAuth, subscribeToPlan);

export default router;
