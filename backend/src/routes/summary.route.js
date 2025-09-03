import express from "express";
import{ summary } from "../controllers/summary.controller.js";

const router = express.Router();

router.post("/summarize", summary );

export default router;