import mongoose from "mongoose";

const messageSchema = new mongoose.Schema(
  {
    conversationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Conversation",
      required: true,
      index: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["user", "assistant"],
      required: true,
    },
    content: {
      type: String,
      required: true,
      trim: true,
    },
    imageUrl: {
      type: String,
      default: null,
    },
    model: {
      type: String,
      default: "gemini-3.8-flash",
    },
  },
  {
    timestamps: true,
    collection: "messages",
  }
);

// Compound index for querying conversation messages in chronological order
messageSchema.index({ conversationId: 1, createdAt: 1 });

const Message = mongoose.model("Message", messageSchema);

export default Message;
