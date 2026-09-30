import express from "express";
import { getDocsSections } from "../controllers/docs.controllers.js";

const router = express.Router();

router.get("/sections", getDocsSections);

export default router;
