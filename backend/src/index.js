import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from 'cors';
import summaryRoutes from "./routes/summary.route.js";


const app = express();

app.use(express.json());

app.use(cors());

app.use("/api/summary",summaryRoutes);

const PORT = 3000;
app.listen(PORT, () => {
  console.log(`Server is running on http://localhost:${PORT}`);
});