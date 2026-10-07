import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";

import connectDB from "./db/db.js";
import authRouter from "./routes/auth.routes.js";
import userRouter from "./routes/user.routes.js";
import chatRouter from "./routes/chat.routes.js";
import aiRouter from "./routes/ai.routes.js";
import conversationRouter from "./routes/conversation.routes.js";
import pricingRouter from "./routes/pricing.routes.js";
import communityRouter from "./routes/community.routes.js";
import dashboardRouter from "./routes/dashboard.routes.js";
import docsRouter from "./routes/docs.routes.js";

dotenv.config();

const app = express();
const port = process.env.PORT || 8000;

// Allowed origins for CORS
const clientUrls = (process.env.CLIENT_URL || "")
  .split(",")
  .map((u) => u.trim().replace(/\/+$/, ""))
  .filter(Boolean);

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  ...clientUrls,
];

// 1. Normalize double-slashes in incoming URLs (defense-in-depth against client trailing-slash errors)
app.use((req, res, next) => {
  if (req.url && req.url.includes("//")) {
    req.url = req.url.replace(/\/{2,}/g, "/");
  }
  next();
});

// 2. CORS Middleware
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (curl, mobile apps, Postman)
      if (!origin) return callback(null, true);
      const normalizedOrigin = origin.replace(/\/+$/, "");
      if (
        process.env.NODE_ENV !== "production" ||
        allowedOrigins.includes(normalizedOrigin) ||
        /\.vercel\.app$/.test(new URL(origin).hostname) ||
        /\.onrender\.com$/.test(new URL(origin).hostname)
      ) {
        callback(null, true);
      } else {
        callback(new Error(`CORS blocked for origin: ${origin}`));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "Cookie", "X-Requested-With"],
    exposedHeaders: ["Set-Cookie"],
  })
);

app.use((req, res, next) => {
  // Skip JSON body parsing for Stripe webhook route — it needs the raw body
  if (req.originalUrl === "/api/pricing/webhook") {
    next();
  } else {
    express.json()(req, res, next);
  }
});
app.use(cookieParser());

// Routes
app.use("/api/auth", authRouter);
app.use("/api/user", userRouter);
app.use("/api/chat", chatRouter);
app.use("/api/ai", aiRouter);
app.use("/api/conversations", conversationRouter);
app.use("/api/pricing", pricingRouter);
app.use("/api/community", communityRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/docs", docsRouter);

app.get("/", (req, res) => {
  res.send("Chat Application Backend is Running");
});

// Start Server
const startServer = async () => {
  try {
    if (!process.env.MONGO_DB_URL) {
      console.warn("⚠️ Warning: MONGO_DB_URL environment variable is not defined!");
    }
    if (!process.env.JWT_SECRET) {
      console.warn("⚠️ Warning: JWT_SECRET environment variable is not defined!");
    }
    await connectDB();

    app.listen(port, () => {
      console.log(`Server started on port ${port}`);
    });
  } catch (error) {
    console.error("Server startup error:", error);
  }
};

startServer();
