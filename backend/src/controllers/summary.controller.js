import { ChatOpenAI } from "@langchain/openai";
import { loadSummarizationChain } from "langchain/chains";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import PDFDocument from "pdfkit";
import fs from "fs";
import { OAuth2Client } from "google-auth-library";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import axios from "axios";
import { parseISO } from "date-fns";

// --- Helper functions for Gmail and Calendar (No changes needed here) ---
async function sendSummaryByEmail(
  accessToken,
  to,
  summaryText,
  attachmentBuffer
) {
  // This function is correct and remains unchanged.
  try {
    const mail = new MailComposer({
      to,
      from: to,
      subject: "Your Google Meet Summary & Action Items",
      text: summaryText,
      html: `<b>Details in attached PDF.</b>`,
      attachments: [
        {
          filename: "GMeet_Summary.pdf",
          content: attachmentBuffer,
          contentType: "application/pdf",
        },
      ],
    });
    const message = await mail.compile().build();
    const encodedMessage = Buffer.from(message)
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    await axios.post(
      "https://www.googleapis.com/gmail/v1/users/me/messages/send",
      { raw: encodedMessage },
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    console.log(`Email sent successfully to ${to} on behalf of the user.`);
  } catch (error) {
    console.error(
      "Error sending email with Gmail API:",
      error.response ? error.response.data : error.message
    );
    throw new Error("Failed to send summary email via Gmail API.");
  }
}

async function addDeadlinesToCalendar(accessToken, deadlines) {
  // This function is correct and remains unchanged.
  if (!deadlines || deadlines.length === 0) return 0;
  let createdCount = 0;
  for (const deadline of deadlines) {
    if (!deadline.summary || !deadline.dueDate) continue;
    try {
      const event = {
        summary: deadline.summary,
        description: deadline.description || "From GMeet Summarizer",
        start: { date: parseISO(deadline.dueDate).toISOString().split("T")[0] },
        end: { date: parseISO(deadline.dueDate).toISOString().split("T")[0] },
      };
      await axios.post(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        event,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      createdCount++;
    } catch (error) {
      console.error(
        `Failed to create calendar event for "${deadline.summary}"`
      );
    }
  }
  console.log(`Created ${createdCount} calendar event(s).`);
  return createdCount;
}

// ✅ NEW: Function to get summary prompt based on type
function getSummaryPrompt(summaryType) {
  const basePrompt =
    "You are an expert meeting summarizer. Analyze the following meeting transcript and create a ";

  switch (summaryType) {
    case "brief":
      return (
        basePrompt +
        `concise summary that includes:
      - 3-5 key discussion points
      - Main decisions made
      - Critical action items only
      - Next steps (if any)
      
      Keep the summary under 200 words and focus on the most essential information.`
      );

    case "detailed":
      return (
        basePrompt +
        `comprehensive summary that includes:
      - Detailed overview of all topics discussed
      - Key arguments and viewpoints presented
      - All decisions made with context
      - Complete list of action items and responsibilities
      - Background information and reasoning
      - Follow-up items and next steps
      - Important quotes or specific details mentioned
      
      Provide a thorough analysis while maintaining clarity and organization.`
      );

    default:
      // Fallback to brief if invalid type
      return (
        basePrompt +
        `concise summary focusing on key points, decisions, and action items. Keep it under 200 words.`
      );
  }
}

// --- Main Controller Logic ---
export const summary = async (req, res) => {
  // ✅ MODIFIED: Extract summaryType from request body (default to "brief")
  const {
    transcript,
    userEmail,
    accessToken,
    summaryType = "brief",
  } = req.body;

  if (!transcript || !userEmail || !accessToken) {
    return res
      .status(400)
      .json({ error: "Missing transcript, userEmail, or accessToken" });
  }

  const pdfPath = `./summary-${Date.now()}.pdf`;

  try {
    const model = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: "gpt-4",
      temperature: 0.1,
    });

    // ✅ MODIFIED: Summarization with dynamic prompt based on summary type
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 3000,
      chunkOverlap: 200,
    });
    const docs = await textSplitter.createDocuments([transcript]);

    // ✅ NEW: Use custom prompt for different summary types
    const customPrompt = getSummaryPrompt(summaryType);

    // For brief summaries, we can use a more direct approach
    if (summaryType === "brief") {
      console.log("Generating brief summary...");
      const briefSummaryPrompt = `${customPrompt}\n\nTranscript:\n---\n${transcript}\n---\n\nBrief Summary:`;
      const summaryResult = await model.invoke(briefSummaryPrompt);
      var summaryText = summaryResult.content;
    } else {
      // For detailed summaries, use the existing map-reduce chain
      console.log("Generating detailed summary...");
      const summaryChain = loadSummarizationChain(model, {
        type: "map_reduce",
        combinePrompt: customPrompt,
      });
      const summaryResult = await summaryChain.invoke({
        input_documents: docs,
      });
      var summaryText = summaryResult.text;
    }

    // --- 2. Deadline Extraction with a Stricter Prompt (No changes) ---
    console.log("Extracting deadlines...");
    const deadlineExtractionPrompt = `
      Analyze the following meeting transcript. Your task is to identify specific tasks, action items, or deadlines.
      Today's date is ${new Date().toISOString().split("T")[0]}.
      You MUST respond with a valid JSON array of objects. Do NOT add any introductory text, explanations, or markdown formatting like \`\`\`json. Your entire response must be ONLY the JSON array.
      Each object in the array must have these exact keys: "summary", "description", and "dueDate".
      The "dueDate" value must be in "YYYY-MM-DD" format.
      If there are no deadlines or action items, you MUST respond with an empty array: [].

      Transcript:
      ---
      ${transcript}
      ---

      JSON Output:
    `;

    const deadlineResult = await model.invoke(deadlineExtractionPrompt);
    let deadlines = [];
    try {
      // Clean the response just in case the AI adds markdown formatting despite instructions
      const cleanedResponse = deadlineResult.content
        .replace(/```json\n|```/g, "")
        .trim();
      deadlines = JSON.parse(cleanedResponse);
    } catch (e) {
      console.error(
        "Could not parse deadlines from AI response:",
        deadlineResult.content
      );
    }

    // --- 3. Add Deadlines to Calendar (No changes) ---
    const eventsCreated = await addDeadlinesToCalendar(accessToken, deadlines);

    // ✅ MODIFIED: Generate PDF with summary type indication
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    // ✅ NEW: Include summary type in PDF title
    const summaryTypeLabel = summaryType === "brief" ? "Brief" : "Detailed";
    doc
      .fontSize(20)
      .font("Helvetica-Bold")
      .text(`${summaryTypeLabel} Meeting Summary`, { align: "center" })
      .moveDown();

    doc.fontSize(12).font("Helvetica").text(summaryText, { align: "justify" });

    if (deadlines && deadlines.length > 0) {
      doc
        .addPage()
        .fontSize(20)
        .font("Helvetica-Bold")
        .text("Action Items & Deadlines", { align: "center" })
        .moveDown();
      deadlines.forEach((d) => {
        doc
          .fontSize(14)
          .font("Helvetica-Bold")
          .text(d.summary || "Untitled Task");
        doc
          .fontSize(11)
          .font("Helvetica")
          .text(`Due: ${d.dueDate || "N/A"}`);
        doc
          .fontSize(11)
          .font("Helvetica-Oblique")
          .text(d.description || "No description.");
        doc.moveDown(1.5);
      });
    }
    doc.end();
    await new Promise((resolve) => stream.on("finish", resolve));
    const pdfBuffer = fs.readFileSync(pdfPath);

    // --- 5. Send Email (No changes) ---
    await sendSummaryByEmail(accessToken, userEmail, summaryText, pdfBuffer);

    // ✅ MODIFIED: Include summary type in success message
    res.json({
      message: `${summaryTypeLabel} summary sent! ${eventsCreated} deadline(s) were added to your calendar.`,
    });
  } catch (error) {
    console.error("Error during summarization process:", error);
    if (
      error.response &&
      (error.response.status === 401 || error.response.status === 403)
    ) {
      return res.status(401).json({
        error:
          "Authentication failed. The user's token may be invalid or expired.",
      });
    }
    res.status(500).json({ error: "Failed to process summary." });
  } finally {
    if (fs.existsSync(pdfPath)) fs.unlinkSync(pdfPath);
  }
};
