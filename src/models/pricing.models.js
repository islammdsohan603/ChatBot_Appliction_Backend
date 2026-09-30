import mongoose from "mongoose";

const pricingSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    slug: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    priceMonthly: {
      type: Number,
      required: true,
      default: 0,
    },
    priceYearly: {
      type: Number,
      required: true,
      default: 0,
    },
    isPopular: {
      type: Boolean,
      default: false,
    },
    highlightBadge: {
      type: String,
      default: "",
    },
    features: [
      {
        type: String,
        required: true,
      },
    ],
    limits: {
      messagesPerDay: {
        type: Number,
        default: 50,
      },
      models: [
        {
          type: String,
          default: "gemini-3.8-flash",
        },
      ],
      visionEnabled: {
        type: Boolean,
        default: true,
      },
      prioritySupport: {
        type: Boolean,
        default: false,
      },
      exportHistory: {
        type: Boolean,
        default: false,
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
    collection: "pricing_plans",
  }
);

const Pricing = mongoose.model("Pricing", pricingSchema);

export default Pricing;
