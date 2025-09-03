import express from "express";
import {
  transcribe,
  audioUpload,
} from "../controllers/transcribe.controller.js";

const router = express.Router();

// This route will handle POST requests to /api/transcribe/
// It uses the audioUpload middleware from multer to process the file
// before passing it to the transcribe controller.
router.post("/", audioUpload, transcribe);

export default router;