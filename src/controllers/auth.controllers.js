import bcrypt from "bcryptjs";
import User from "../models/user.models.js";
import genToken from "../config/token.js";

// ── User Sign Up ──
export const signUp = async (req, res) => {
  try {
    const { userName, email, password } = req.body;

    if (!userName || !userName.trim()) {
      return res.status(400).json({
        success: false,
        message: "Username is required.",
      });
    }

    if (!email || !email.trim() || !/\S+@\S+\.\S+/.test(email.trim())) {
      return res.status(400).json({
        success: false,
        message: "A valid email address is required.",
      });
    }

    if (!password || password.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Password must be at least 6 characters.",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedUserName = userName.trim();

    // Check duplicate email (status 409)
    const existingEmail = await User.findOne({ email: normalizedEmail });
    if (existingEmail) {
      return res.status(409).json({
        success: false,
        message: "Email already registered",
      });
    }

    // Check duplicate username (status 409)
    const existingUsername = await User.findOne({ userName: normalizedUserName });
    if (existingUsername) {
      return res.status(409).json({
        success: false,
        message: "Username already taken! Please choose another.",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const user = await User.create({
      userName: normalizedUserName,
      email: normalizedEmail,
      password: hashedPassword,
      subscriptionTier: "free",
    });

    const token = await genToken(user._id);

    const isProduction = process.env.NODE_ENV === "production";
    res.cookie("token", token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(201).json({
      success: true,
      message: "User registered successfully",
      token,
      user: {
        id: user._id,
        _id: user._id,
        userName: user.userName,
        email: user.email,
        subscriptionTier: user.subscriptionTier || "free",
      },
    });
  } catch (error) {
    console.error("signUp error:", error);

    // Handle Mongo duplicate key index error (code 11000)
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern || {})[0] || "email";
      return res.status(409).json({
        success: false,
        message: field === "userName" ? "Username already taken!" : "Email already registered",
      });
    }

    return res.status(500).json({
      success: false,
      message: error.message || "Server error occurred during signup",
    });
  }
};

// ── User Log In ──
export const logIn = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !email.trim() || !password) {
      return res.status(400).json({
        success: false,
        message: "Email and password are required.",
      });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "User does not exist!",
      });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({
        success: false,
        message: "Incorrect password.",
      });
    }

    const token = await genToken(user._id);

    const isProduction = process.env.NODE_ENV === "production";
    res.cookie("token", token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      success: true,
      message: "Login successful",
      token,
      user: {
        id: user._id,
        _id: user._id,
        userName: user.userName,
        email: user.email,
        subscriptionTier: user.subscriptionTier || "free",
      },
    });
  } catch (error) {
    console.error("logIn error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Server error occurred during login",
    });
  }
};

// ── User Log Out ──
export const logOut = async (req, res) => {
  try {
    const isProduction = process.env.NODE_ENV === "production";
    res.clearCookie("token", {
      httpOnly: true,
      secure: isProduction,
      sameSite: isProduction ? "none" : "lax",
    });

    return res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    console.error("logOut error:", error);

    return res.status(500).json({
      success: false,
      message: error.message || "Server error during logout",
    });
  }
};
