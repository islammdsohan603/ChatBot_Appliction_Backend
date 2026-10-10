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

const clientUrls = (process.env.CLIENT_URL || "")
  .split(",")
  .map((url) => url.trim().replace(/\/+$/, ""))
  .filter(Boolean);

const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:5174",
  "http://localhost:3000",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  ...clientUrls,
];

// Normalize repeated slashes in the request path.
app.use((req, res, next) => {
  if (req.url && req.url.includes("//")) {
    req.url = req.url.replace(/\/{2,}/g, "/");
  }
  next();
});

// CORS
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true);

      let hostname;

      try {
        hostname = new URL(origin).hostname;
      } catch {
        return callback(new Error("Invalid request origin"));
      }

      const normalizedOrigin = origin.replace(/\/+$/, "");

      if (
        process.env.NODE_ENV !== "production" ||
        allowedOrigins.includes(normalizedOrigin) ||
        hostname.endsWith(".vercel.app") ||
        hostname.endsWith(".onrender.com")
      ) {
        return callback(null, true);
      }

      return callback(new Error(`CORS blocked for origin: ${origin}`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "Cookie",
      "X-Requested-With",
    ],
    exposedHeaders: ["Set-Cookie"],
  }),
);

// Preserve the raw body for Stripe webhook verification.
app.use((req, res, next) => {
  if (req.originalUrl.split("?")[0] === "/api/pricing/webhook") {
    return next();
  }

  return express.json()(req, res, next);
});

app.use(cookieParser());

// Cache the connection promise for this serverless instance.
let dbPromise;

const ensureDB = async (req, res, next) => {
  try {
    if (!dbPromise) {
      dbPromise = connectDB().catch((error) => {
        dbPromise = null;
        throw error;
      });
    }

    await dbPromise;
    next();
  } catch (error) {
    console.error("Database connection error:", error);

    res.status(503).json({
      success: false,
      message: "Database connection unavailable",
    });
  }
};

// Health check does not require a database connection.
app.get("/", (req, res) => {
  res.status(200).send("Chat Application Backend is Running");
});

// Connect to MongoDB before accessing API routes.
app.use("/api", ensureDB);

// API routes
app.use("/api/auth", authRouter);
app.use("/api/user", userRouter);
app.use("/api/chat", chatRouter);
app.use("/api/ai", aiRouter);
app.use("/api/conversations", conversationRouter);
app.use("/api/pricing", pricingRouter);
app.use("/api/community", communityRouter);
app.use("/api/dashboard", dashboardRouter);
app.use("/api/docs", docsRouter);

// Start a persistent server only for local development.
if (!process.env.VERCEL) {
  connectDB()
    .then(() => {
      app.listen(port, () => {
        console.log(`Server started on port ${port}`);
      });
    })
    .catch((error) => {
      console.error("Server startup error:", error);
      process.exit(1);
    });
}

export default app;
