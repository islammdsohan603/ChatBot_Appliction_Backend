import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
    },

    userName: {
      type: String,
      required: true,
      unique: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
    },

    password: {
      type: String,
      required: true,
    },

    image: {
      type: String,
    },

    bio: {
      type: String,
    },

    subscriptionTier: {
      type: String,
      enum: ["free", "pro", "enterprise"],
      default: "free",
    },

    profile: {
      location: String,
      website: String,
      github: String,
      twitter: String,
      company: String,
    },
  },
  {
    timestamps: true,
    collection: "user",
  },
);

const User = mongoose.model("User", userSchema);

export default User;
