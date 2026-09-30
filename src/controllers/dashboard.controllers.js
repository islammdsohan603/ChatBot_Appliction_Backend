import Conversation from "../models/conversation.models.js";
import Message from "../models/message.models.js";
import User from "../models/user.models.js";

/**
 * Get aggregated dashboard metrics & stats for current user
 * GET /api/dashboard/stats
 */
export const getDashboardStats = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const user = await User.findById(userId).select("-password").lean();

    // 1. Fetch conversations count & recent sessions
    const totalConversations = await Conversation.countDocuments({ userId });
    const recentConversations = await Conversation.find({ userId })
      .sort({ updatedAt: -1 })
      .limit(6)
      .lean();

    // 2. Fetch total messages count across user's conversations
    const totalMessages = await Message.countDocuments({ userId });

    // 3. Estimate token consumption and storage
    const messagesSample = await Message.find({ userId })
      .select("content role imageUrl")
      .limit(200)
      .lean();

    let totalChars = 0;
    let imageAttachments = 0;
    messagesSample.forEach((m) => {
      if (m.content) totalChars += m.content.length;
      if (m.imageUrl) imageAttachments += 1;
    });

    // Approximate ~4 characters per token
    const estimatedTokens = Math.max(
      totalMessages * 140,
      Math.round(totalChars / 3.8)
    );

    // Approximate storage: 1KB per message + 150KB per image
    const estimatedStorageMb = (
      (totalMessages * 1.5 + imageAttachments * 150) /
      1024
    ).toFixed(2);

    return res.status(200).json({
      success: true,
      stats: {
        totalConversations,
        totalMessages,
        estimatedTokens,
        estimatedStorageMb: `${estimatedStorageMb} MB`,
        subscriptionTier: user?.subscriptionTier || "free",
        streakDays: Math.min(Math.max(totalConversations, 1), 14),
        recentConversations,
        user: {
          name: user?.name || user?.userName || "User",
          email: user?.email,
          image: user?.image || "",
          createdAt: user?.createdAt,
        },
      },
    });
  } catch (error) {
    console.error("Get Dashboard Stats Error:", error);
    return res.status(500).json({ error: "Failed to retrieve dashboard statistics" });
  }
};

/**
 * Get 7-day conversation activity chart data
 * GET /api/dashboard/activity
 */
export const getDashboardActivity = async (req, res) => {
  try {
    const userId = req.userId;
    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const days = 7;
    const now = new Date();
    const activity = [];

    for (let i = days - 1; i >= 0; i--) {
      const dayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 0, 0, 0);
      const dayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - i, 23, 59, 59);

      const msgCount = await Message.countDocuments({
        userId,
        createdAt: { $gte: dayStart, $lte: dayEnd },
      });

      const convCount = await Conversation.countDocuments({
        userId,
        createdAt: { $gte: dayStart, $lte: dayEnd },
      });

      const dayLabel = dayStart.toLocaleDateString("en-US", { weekday: "short" });

      activity.push({
        day: dayLabel,
        date: dayStart.toISOString().split("T")[0],
        messages: msgCount,
        conversations: convCount,
      });
    }

    return res.status(200).json({ success: true, activity });
  } catch (error) {
    console.error("Get Dashboard Activity Error:", error);
    return res.status(500).json({ error: "Failed to retrieve activity data" });
  }
};
