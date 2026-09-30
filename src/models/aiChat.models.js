import mongoose from "mongoose";

const aiChatSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false,
    },
    role: {
      type: String,
      enum: ["user", "assistant"],
      required: true,
    },
    prompt: {
      type: String,
      default: "",
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
    collection: "chats",
  }
);

const AiChat = mongoose.model("AiChat", aiChatSchema);

export default AiChat;
