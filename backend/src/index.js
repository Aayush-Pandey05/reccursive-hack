import dotenv from "dotenv";
dotenv.config();


import express from "express";
import cors from "cors";
import summaryRoutes from "./routes/summary.route.js";
import transcribeRoutes from "./routes/transcribe.route.js"; // ✅ NEW: Import the transcription routes

const app = express();

app.use(express.json());
app.use(cors());

// Existing summary route
app.use("/api/summary", summaryRoutes);

// ✅ NEW: Use the transcription route
app.use("/api/transcribe", transcribeRoutes);

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});
