import mongoose from "mongoose";

const usageSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    date: {
      type: String, // "YYYY-MM-DD" formatted in UTC
      required: true,
      index: true,
    },
    messageCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    imageCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    tokensUsed: {
      type: Number,
      default: 0,
      min: 0,
    },
    lastActiveAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
    collection: "user_usage",
  }
);

// Compound unique index ensuring one usage document per user per UTC day
usageSchema.index({ userId: 1, date: 1 }, { unique: true });

const Usage = mongoose.model("Usage", usageSchema);

export default Usage;
