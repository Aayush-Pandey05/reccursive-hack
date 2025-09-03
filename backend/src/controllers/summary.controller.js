import { ChatOpenAI } from "@langchain/openai";
import { loadSummarizationChain } from "langchain/chains";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import PDFDocument from "pdfkit";
import fs from "fs";
import { OAuth2Client } from 'google-auth-library';
// ✅ FIXED: Updated the import path to be more specific for ES Modules
import MailComposer from 'nodemailer/lib/mail-composer/index.js';
import axios from 'axios';

// --- Final Solution: Gmail API Email Function ---
async function sendSummaryByEmail(to, summaryText, attachmentPath) {
  try {
    // 1. Create a new OAuth2 client with your credentials
    const oauth2Client = new OAuth2Client(
      process.env.GMAIL_CLIENT_ID,
      process.env.GMAIL_CLIENT_SECRET,
      "https://developers.google.com/oauthplayground" // Your redirect URI
    );

    // 2. Set the refresh token to get a new access token
    oauth2Client.setCredentials({
      refresh_token: process.env.GMAIL_REFRESH_TOKEN,
    });

    const { token } = await oauth2Client.getAccessToken();
    const accessToken = token;

    if (!accessToken) {
      throw new Error("Failed to generate access token for Gmail.");
    }

    // 3. Use Nodemailer's MailComposer to build the raw email message
    const mailOptions = {
      to: to,
      from: process.env.GMAIL_USER,
      subject: 'Your Google Meet Summary',
      text: 'Here is the summary of your recent meeting. The full summary is attached as a PDF.',
      html: '<b>Here is the summary of your recent meeting. The full summary is attached as a PDF.</b>',
      attachments: [{
        filename: 'summary.pdf',
        path: attachmentPath,
        contentType: 'application/pdf'
      }]
    };
    
    const mail = new MailComposer(mailOptions);
    const message = await mail.compile().build();

    // 4. Base64Url encode the raw email message
    const encodedMessage = Buffer.from(message).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

    // 5. Send the email using the Gmail API endpoint
    await axios.post(
      'https://www.googleapis.com/gmail/v1/users/me/messages/send',
      { raw: encodedMessage },
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );

    console.log(`Email sent successfully to ${to} via Gmail API`);

  } catch (error) {
    console.error('Error sending email with Gmail API:', error.response ? error.response.data : error.message);
    throw new Error('Failed to send summary email via Gmail API.');
  }
}


export const summary = async (req, res) => {
  const { transcript, userEmail } = req.body;
  
  if (!transcript || !userEmail) {
    return res
      .status(400)
      .json({ error: "Missing transcript or userEmail" });
  }
  
  const pdfPath = `./summary-${Date.now()}.pdf`;

  try {
    // 1. Summarize with LangChain
    console.log("Initializing model...");
    const model = new ChatOpenAI({
      openAIApiKey: process.env.OPENAI_API_KEY,
      modelName: "gpt-3.5-turbo",
      temperature: 0.3,
    });
    const textSplitter = new RecursiveCharacterTextSplitter({ chunkSize: 2000 });
    const docs = await textSplitter.createDocuments([transcript]);
    const chain = loadSummarizationChain(model, { type: "map_reduce" });
    console.log("Generating summary...");
    const summaryResult = await chain.invoke({ input_documents: docs });
    const summaryText = summaryResult.text;

    // 2. Generate PDF
    console.log("Generating PDF...");
    const doc = new PDFDocument();
    const stream = fs.createWriteStream(pdfPath);
    doc.pipe(stream);
    doc.fontSize(20).text("Meeting Summary", { align: "center" });
    doc.moveDown();
    doc.fontSize(12).text(summaryText);
    doc.end();

    await new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    // 3. Send Email using Gmail API
    console.log(`Sending email to ${userEmail}...`);
    await sendSummaryByEmail(userEmail, summaryText, pdfPath);

    res.json({ message: "Summary generated and sent successfully!" });

  } catch (error) {
    console.error("Error during summarization process:", error);
    res.status(500).json({ error: "Failed to process summary." });
  } finally {
    // 4. Clean up the PDF file
    if (fs.existsSync(pdfPath)) {
      fs.unlinkSync(pdfPath);
    }
  }
};

