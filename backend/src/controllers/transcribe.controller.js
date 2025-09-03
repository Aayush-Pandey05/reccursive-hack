import { OpenAI } from "openai";
import fs from "fs";
import multer from "multer";
import path from "path";

const upload = multer({ dest: "uploads/" });
export const audioUpload = upload.single("audio");

export const transcribe = async (req, res) => {
  const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });

  if (!req.file) {
    return res.status(400).json({ error: "No audio file uploaded." });
  }

  const tempPath = req.file.path;
  const targetPath = tempPath + path.extname(req.file.originalname);
  let transcription;

  try {
    fs.renameSync(tempPath, targetPath);

    console.log(`Transcribing audio file: ${targetPath}`);
    transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(targetPath),
      model: "whisper-1",
      language: "en", // ✅ Add this line to force English transcription
    });

    console.log("Transcription successful.");
    res.json({ transcript: transcription.text });
  } catch (error) {
    console.error("Error with OpenAI Whisper API:", error);
    res.status(500).json({ error: "Failed to transcribe audio." });
  } finally {
    if (fs.existsSync(targetPath)) {
      fs.unlinkSync(targetPath);
    }
  }
};
