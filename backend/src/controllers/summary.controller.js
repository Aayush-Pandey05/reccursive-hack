import { ChatOpenAI } from "@langchain/openai";
import { loadSummarizationChain } from "langchain/chains";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import PDFDocument from "pdfkit";
import fs from "fs";
import { OAuth2Client } from "google-auth-library";
import MailComposer from "nodemailer/lib/mail-composer/index.js";
import axios from "axios";
import { parseISO } from "date-fns";

// --- Gmail API Email Function ---
async function sendSummaryByEmail(
  oauth2Client,
  to,
  summaryText,
  attachmentBuffer
) {
  try {
    const { token } = await oauth2Client.getAccessToken();
    const accessToken = token;
    if (!accessToken) throw new Error("Failed to get access token for Gmail.");

    const mail = new MailComposer({
      to,
      from: process.env.GMAIL_USER,
      subject: "Your Google Meet Summary & Action Items",
      text: summaryText,
      html: `<b>Here is the summary of your recent meeting. The full details are in the attached PDF.</b>`,
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
    console.log(`Email sent successfully to ${to} via Gmail API`);
  } catch (error) {
    console.error(
      "Error sending email with Gmail API:",
      error.response ? error.response.data : error.message
    );
    throw new Error("Failed to send summary email via Gmail API.");
  }
}

// --- Google Calendar Function ---
async function addDeadlinesToCalendar(oauth2Client, deadlines) {
  if (!deadlines || deadlines.length === 0) {
    console.log("No deadlines found to add to calendar.");
    return 0;
  }
  const { token } = await oauth2Client.getAccessToken();
  const accessToken = token;
  if (!accessToken) throw new Error("Failed to get access token for Calendar.");

  let createdCount = 0;
  for (const deadline of deadlines) {
    if (!deadline.summary || !deadline.dueDate) continue;

    try {
      const eventDate = parseISO(deadline.dueDate);
      const event = {
        summary: deadline.summary,
        description:
          deadline.description ||
          "Deadline identified from Google Meet session.",
        start: { date: eventDate.toISOString().split("T")[0] },
        end: { date: eventDate.toISOString().split("T")[0] },
      };
      await axios.post(
        "https://www.googleapis.com/calendar/v3/calendars/primary/events",
        event,
        { headers: { Authorization: `Bearer ${accessToken}` } }
      );
      console.log(`Created calendar event: "${deadline.summary}"`);
      createdCount++;
    } catch (error) {
      console.error(
        `Failed to create calendar event for "${deadline.summary}":`,
        error.response ? error.response.data : error.message
      );
    }
  }
  return createdCount;
}

export const summary = async (req, res) => {
  const { transcript, userEmail } = req.body;
  if (!transcript || !userEmail)
    return res.status(400).json({ error: "Missing transcript or userEmail" });

  const pdfPath = `./summary-${Date.now()}.pdf`;

  try {
    const model = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: "gpt-4",
      temperature: 0.2,
    });
    const oauth2Client = new OAuth2Client(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET
    );
    oauth2Client.setCredentials({
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
    });

    // --- 1. Summarize with LangChain ---
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 3000,
      chunkOverlap: 200,
    });
    const docs = await textSplitter.createDocuments([transcript]);
    const summaryChain = loadSummarizationChain(model, { type: "map_reduce" });
    console.log("Generating summary...");
    const summaryResult = await summaryChain.invoke({ input_documents: docs });
    const summaryText = summaryResult.text;

    // --- 2. Extract Deadlines using LangChain ---
    console.log("Extracting deadlines...");
    // ✅ IMPROVED PROMPT: Made the instructions more specific and robust.
    const deadlineExtractionPrompt = `
      You are an assistant that extracts structured data from meeting transcripts.
      Analyze the following transcript. Today's date is ${
        new Date().toISOString().split("T")[0]
      }.
      Your task is to identify any mention of specific tasks, action items, or deadlines.
      
      Extract the findings into a valid JSON array of objects. Each object must have three keys:
      1. "summary": A concise title for the task or action item.
      2. "description": A brief, one-sentence explanation of the task.
      3. "dueDate": The deadline for the task, formatted strictly as YYYY-MM-DD. Infer the date from context if relative terms like "next Friday" or "end of the month" are used.
      
      If no specific tasks or deadlines are mentioned, you MUST respond with an empty array: [].
      Do not include tasks that are already completed.

      Transcript:
      "${transcript}"

      JSON Output:`;
    const deadlineResult = await model.invoke(deadlineExtractionPrompt);
    let deadlines = [];
    try {
      // Attempt to parse the AI's response, which should be a JSON string.
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

    // --- 3. Add Deadlines to Google Calendar ---
    const eventsCreated = await addDeadlinesToCalendar(oauth2Client, deadlines);

    // --- 4. Generate PDF with Summary AND Deadlines ---
    console.log("Generating PDF...");
    const doc = new PDFDocument({ margin: 50 });
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);

    doc
      .fontSize(20)
      .font("Helvetica-Bold")
      .text("Meeting Summary", { align: "center" });
    doc.moveDown();
    doc.fontSize(12).font("Helvetica").text(summaryText, { align: "justify" });

    if (deadlines && deadlines.length > 0) {
      doc.addPage();
      doc
        .fontSize(20)
        .font("Helvetica-Bold")
        .text("Action Items & Deadlines", { align: "center" });
      doc.moveDown();
      deadlines.forEach((deadline) => {
        doc
          .fontSize(14)
          .font("Helvetica-Bold")
          .text(deadline.summary || "Untitled Task");
        doc
          .fontSize(11)
          .font("Helvetica")
          .text(`Due: ${deadline.dueDate || "N/A"}`);
        doc
          .fontSize(11)
          .font("Helvetica-Oblique")
          .text(deadline.description || "No description provided.");
        doc.moveDown(1.5);
      });
    }
    doc.end();

    await new Promise((resolve, reject) => {
      stream.on("finish", resolve);
      stream.on("error", reject);
    });

    // --- 5. Read the finished PDF into a buffer for sending ---
    const pdfBuffer = fs.readFileSync(pdfPath);

    // --- 6. Send Email using Gmail API ---
    console.log(`Sending email to ${userEmail}...`);
    await sendSummaryByEmail(oauth2Client, userEmail, summaryText, pdfBuffer);

    res.json({
      message: `Summary sent! ${eventsCreated} deadline(s) were added to your calendar.`,
    });
  } catch (error) {
    console.error("Error during summarization process:", error);
    res.status(500).json({ error: "Failed to process summary." });
  } finally {
    // --- 7. Clean up the PDF file ---
    if (fs.existsSync(pdfPath)) {
      fs.unlinkSync(pdfPath);
      console.log("Cleaned up PDF file.");
    }
  }
};
