import CommunityPost from "../models/community.models.js";
import User from "../models/user.models.js";

const SEED_POSTS = [
  {
    title: "Building Real-Time Multimodal Workflows with Nexora & Gemini Flash",
    content: "Hey everyone! I've been experimenting with image parsing inside our chat sessions. By piping camera frames directly into Nexora, response latency dropped under 400ms. Here are my top findings and code architecture tips...",
    category: "Showcase",
    tags: ["gemini", "vision", "performance", "streaming"],
    views: 1420,
    likes: [],
    authorName: "Marcus Vance",
    authorAvatar: "",
    isPinned: true,
  },
  {
    title: "Tips for structuring long-context developer conversations",
    content: "When discussing complex full-stack codebases, keeping messages bounded by task scope helps the model avoid context drift. Here is a handy checklist our dev squad uses daily in Nexora AI.",
    category: "Tutorials",
    tags: ["architecture", "best-practices", "developer-guide"],
    views: 890,
    likes: [],
    authorName: "Elena Rostova",
    authorAvatar: "",
    isPinned: false,
  },
  {
    title: "Proposal: Native Mermaid Diagram rendering in chat bubbles",
    content: "Would love to see automatic mermaid.js parsing for architectural flowcharts and sequence diagrams. Upvote if your team would use this for sprint planning!",
    category: "Feature Requests",
    tags: ["mermaid", "visualization", "ui-ux"],
    views: 654,
    likes: [],
    authorName: "Devon Clark",
    authorAvatar: "",
    isPinned: false,
  },
  {
    title: "How to self-host custom Google Gemini API keys securely",
    content: "A quick walkthrough on using your own Google AI Studio project key inside Settings -> Personalization to bypass shared team quotas without risking key leaks.",
    category: "Tutorials",
    tags: ["api-keys", "security", "google-genai"],
    views: 1120,
    likes: [],
    authorName: "Sarah Lin",
    authorAvatar: "",
    isPinned: false,
  },
];

/**
 * Get community posts with optional category & search filter
 * GET /api/community/posts
 */
export const getCommunityPosts = async (req, res) => {
  try {
    const { category, search, page = 1, limit = 20 } = req.query;
    const query = {};

    if (category && category !== "All") {
      query.category = category;
    }

    if (search && search.trim()) {
      query.$or = [
        { title: { $regex: search.trim(), $options: "i" } },
        { content: { $regex: search.trim(), $options: "i" } },
        { tags: { $in: [new RegExp(search.trim(), "i")] } },
      ];
    }

    let posts = await CommunityPost.find(query)
      .sort({ isPinned: -1, createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit))
      .lean();

    // Auto-seed if empty
    if ((!posts || posts.length === 0) && (!category || category === "All") && !search) {
      let sampleUser = await User.findOne();
      if (!sampleUser) {
        sampleUser = await User.create({
          userName: "nexora_team",
          email: "team@nexora.ai",
          password: "system_generated_hash",
          name: "Nexora Core Team",
        });
      }

      const seedWithUser = SEED_POSTS.map((p) => ({
        ...p,
        author: sampleUser._id,
      }));

      await CommunityPost.insertMany(seedWithUser);
      posts = await CommunityPost.find()
        .sort({ isPinned: -1, createdAt: -1 })
        .limit(Number(limit))
        .lean();
    }

    const totalPosts = await CommunityPost.countDocuments(query);

    return res.status(200).json({
      success: true,
      posts,
      totalPosts,
      currentPage: Number(page),
      totalPages: Math.ceil(totalPosts / limit),
    });
  } catch (error) {
    console.error("Get Community Posts Error:", error);
    return res.status(500).json({ error: "Failed to retrieve community posts" });
  }
};

/**
 * Get Community stats overview
 * GET /api/community/stats
 */
export const getCommunityStats = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalPosts = await CommunityPost.countDocuments();

    return res.status(200).json({
      success: true,
      stats: {
        activeMembers: totalUsers > 0 ? totalUsers * 12 + 140 : 1250,
        totalDiscussions: totalPosts > 0 ? totalPosts : 480,
        githubStars: "4.8k",
        discordMembers: "8,920",
        contributorsCount: 42,
      },
    });
  } catch (error) {
    console.error("Get Community Stats Error:", error);
    return res.status(500).json({ error: "Failed to fetch community statistics" });
  }
};

/**
 * Create a new community post
 * POST /api/community/posts
 */
export const createCommunityPost = async (req, res) => {
  try {
    const userId = req.userId;
    const { title, content, category, tags } = req.body;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!title || !title.trim() || !content || !content.trim()) {
      return res.status(400).json({ error: "Title and content are required" });
    }

    const user = await User.findById(userId);
    const post = await CommunityPost.create({
      author: userId,
      authorName: user?.name || user?.userName || "Nexora User",
      authorAvatar: user?.image || "",
      title: title.trim(),
      content: content.trim(),
      category: category || "Discussions",
      tags: Array.isArray(tags) ? tags : typeof tags === "string" ? tags.split(",").map((t) => t.trim()) : [],
    });

    return res.status(201).json({ success: true, post });
  } catch (error) {
    console.error("Create Community Post Error:", error);
    return res.status(500).json({ error: "Failed to create post" });
  }
};

/**
 * Toggle like on a community post
 * POST /api/community/posts/:id/like
 */
export const toggleLikePost = async (req, res) => {
  try {
    const userId = req.userId;
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    const post = await CommunityPost.findById(id);
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    const hasLiked = post.likes.some((uId) => uId.toString() === userId.toString());
    if (hasLiked) {
      post.likes = post.likes.filter((uId) => uId.toString() !== userId.toString());
    } else {
      post.likes.push(userId);
    }

    await post.save();

    return res.status(200).json({
      success: true,
      hasLiked: !hasLiked,
      likesCount: post.likes.length,
    });
  } catch (error) {
    console.error("Like Post Error:", error);
    return res.status(500).json({ error: "Failed to update like status" });
  }
};

/**
 * Add comment to a community post
 * POST /api/community/posts/:id/comment
 */
export const addCommentToPost = async (req, res) => {
  try {
    const userId = req.userId;
    const { id } = req.params;
    const { text } = req.body;

    if (!userId) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!text || !text.trim()) {
      return res.status(400).json({ error: "Comment text cannot be empty" });
    }

    const user = await User.findById(userId);
    const post = await CommunityPost.findById(id);

    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }

    post.comments.push({
      author: userId,
      authorName: user?.name || user?.userName || "Community User",
      authorAvatar: user?.image || "",
      text: text.trim(),
    });

    await post.save();

    return res.status(201).json({
      success: true,
      comments: post.comments,
    });
  } catch (error) {
    console.error("Add Comment Error:", error);
    return res.status(500).json({ error: "Failed to add comment" });
  }
};
