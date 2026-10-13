import express from "express";
import {
  streamConversationChat,
  getUserConversations,
  getConversationById,
  deleteConversation,
  createConversation,
  exportConversation,
} from "../controllers/conversation.controllers.js";
import { isAuth } from "../middlewares/isAuth.js";

const conversationRouter = express.Router();

// SSE Streaming endpoint with auto-session creation and message persistence
conversationRouter.post("/stream", isAuth, streamConversationChat);

// Retrieve all conversations for the authenticated user
conversationRouter.get("/", isAuth, getUserConversations);

// Create new conversation explicitly (REST fallback)
conversationRouter.post("/", isAuth, createConversation);

// Export conversation transcript (Pro Privilege)
conversationRouter.get("/:id/export", isAuth, exportConversation);

// Retrieve single conversation with all messages
conversationRouter.get("/:id", isAuth, getConversationById);

// Delete conversation and its messages
conversationRouter.delete("/:id", isAuth, deleteConversation);

export default conversationRouter;

