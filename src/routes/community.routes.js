import express from "express";
import {
  getCommunityPosts,
  getCommunityStats,
  createCommunityPost,
  toggleLikePost,
  addCommentToPost,
} from "../controllers/community.controllers.js";
import { isAuth } from "../middlewares/isAuth.js";

const router = express.Router();

router.get("/posts", getCommunityPosts);
router.get("/stats", getCommunityStats);
router.post("/posts", isAuth, createCommunityPost);
router.post("/posts/:id/like", isAuth, toggleLikePost);
router.post("/posts/:id/comment", isAuth, addCommentToPost);

export default router;
