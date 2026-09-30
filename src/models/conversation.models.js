import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
      default: "New Chat",
    },
    lastMessage: {
      type: String,
      default: "",
    },
    model: {
      type: String,
      default: "gemini-3.8-flash",
    },
  },
  {
    timestamps: true,
    collection: "conversations",
  }
);

// Compound index for fast chronological retrieval of a user's conversations
conversationSchema.index({ userId: 1, updatedAt: -1 });

const Conversation = mongoose.model("Conversation", conversationSchema);

export default Conversation;
