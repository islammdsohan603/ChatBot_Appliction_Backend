import express from "express";
import { getDashboardStats, getDashboardActivity } from "../controllers/dashboard.controllers.js";
import { isAuth } from "../middlewares/isAuth.js";

const router = express.Router();

// Protected dashboard routes
router.get("/stats", isAuth, getDashboardStats);
router.get("/activity", isAuth, getDashboardActivity);

export default router;
