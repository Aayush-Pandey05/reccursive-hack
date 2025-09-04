# GMeet Summarizer ✨
An AI-powered Chrome extension to automatically transcribe, summarize, and manage action items from your Google Meet calls, delivering the results directly to your email and calendar.

<img width="501" height="762" alt="image" src="https://github.com/user-attachments/assets/810ca68f-8704-4b2f-9a39-ffd4344114c4" />


---

## 📝 Table of Contents
- [Problem Statement](#problem-statement)
- [Key Features](#key-features)
- [Workflow](#workflow)
- [Tech Stack](#tech-stack)
- [Setup and Installation](#setup-and-installation)
- [Usage](#usage)
- [Future Improvements](#future-improvements)
- [License](#license)
- [Creator's Note](#creators-note)

---

## Problem Statement
In today's world of remote collaboration, virtual meetings are frequent, but retaining key information is a significant challenge. Professionals and students face constant "meeting fatigue" and information overload. Key decisions, critical action items, and important deadlines are often lost in long conversations or require tedious manual note-taking. This leads to missed deadlines, miscommunication, and hours wasted deciphering messy notes or re-watching recordings.

**GMeet Summarizer** solves this by providing a seamless, AI-powered solution to capture and act on meeting intelligence automatically.

---

## Key Features
- 🎙️ **Dual-Mode Transcription**: Choose between scraping Google Meet's live captions for quick text or capturing high-fidelity audio via your microphone for transcription with OpenAI's Whisper API.  
- 🧠 **AI-Powered Summaries**: Generate either a concise *Brief* summary or a *Detailed* comprehensive overview of the entire conversation using OpenAI's GPT-4.  
- ✅ **Automatic Action Item Extraction**: The AI intelligently identifies tasks, deadlines, and responsibilities mentioned during the meeting.  
- 📅 **Seamless Google Workspace Integration**:  
  - Gmail: Automatically sends the generated summary and action items in a professional PDF to your email.  
  - Google Calendar: Automatically creates events for any extracted deadlines.  
- 🔒 **Secure Authentication**: Utilizes Google's standard OAuth2 flow for secure, permission-based access to your Google account. Your credentials are never stored.  
- 🎨 **Professional UI**: A clean, modern, and user-friendly interface available in both light and dark themes.  

---

## Workflow
The project follows a robust full-stack architecture:

```
    +---------------------------+       +----------------------------+
    |   Frontend (Chrome Ext)   |       |    Backend (Node.js/Express) |
    +---------------------------+       +----------------------------+
          |                                     ^
(User speaks) | 1. Record Mic (15s chunk) |
|------------------------------------->
          |                             | 2. Forward audio to Whisper
          |                             |---------------------------> [OpenAI Whisper API]
          |                             |                                     |
          | 4. Display transcript       | 3. Return text                     |
          |<------------------------------------|<-----------------------------|
(User clicks |
"Create Summary") | 5. Send transcript & auth token
|------------------------------------->
          |                             | 6. Summarize (GPT-4)
          |                             | 7. Extract Deadlines (GPT-4)
          |                             | 8. Create PDF
          |                             | 9. Send Email (Gmail API)
          |                             | 10. Create Events (Calendar API)
          |                             |
12. Display|<------------------------------------|
   Success | 11. Send success message            |
          | v
+------------------------------------------------------------------> [User's Email & Calendar]
```

---

## Tech Stack
**Frontend:**
- Framework: React  
- Build Tool: Vite  
- Styling: Tailwind CSS  
- Platform: Chrome Extension (Manifest V3)  

**Backend:**
- Runtime: Node.js  
- Framework: Express.js  
- Middleware: Multer (for audio file uploads)  

**AI & APIs:**
- AI Models: OpenAI GPT-4, OpenAI Whisper  
- AI Library: LangChain.js  
- Google APIs: Google Identity (OAuth2), Gmail API, Google Calendar API  

**Document Generation:**
- Library: PDFKit  

---

## Setup and Installation
### Prerequisites
- Node.js (v18 or later) and npm  
- An active OpenAI API Key with access to GPT-4 and Whisper.  
- A Google Cloud Platform project with the Gmail API and Google Calendar API enabled.  

### 1. Backend Setup
```bash
cd backend
npm install
```

Create a `.env` file inside the backend directory and add:
```env
OPENAI_API_KEY="sk-YourSecretKeyGoesHere"
```

Start the backend server:
```bash
node index.js
```
The backend server will run on http://localhost:3000.

### 2. Frontend (Chrome Extension) Setup
```bash
cd frontend
npm install
```

**Configure Google OAuth Client ID:**
1. Follow Google's guide to create an OAuth 2.0 Client ID for a Chrome Extension.
2. Build the extension (see below) and load it into Chrome to get your Extension ID.
3. Open `frontend/manifest.json` and replace the `oauth2.client_id` with your own.

**Build the extension:**
```bash
npm run build
```
This will generate a `dist` folder containing the production-ready extension files.

**Load into Chrome:**
1. Go to `chrome://extensions`
2. Enable Developer Mode
3. Click **Load unpacked**
4. Select the `frontend/dist` folder

---

## Usage
1. Pin the extension icon for quick access.
2. Join a Google Meet call.
3. Click the extension icon to open the popup.
4. Sign in with your Google account.
5. Select capture mode: **Captions** or **Audio (Whisper)**.
6. Start recording by clicking **Start Capturing** (grant mic permissions if needed).
7. Stop capturing and choose a summary type, then click **Create Summary**.
8. Check your email for the PDF and your Google Calendar for deadlines!

---

## Future Improvements
- **Speaker Diarization**: Identify and label different speakers in the transcript.
- **Multi-Language Support**: Transcription and summarization in multiple languages.
- **Web Dashboard**: Companion site to manage past meeting summaries.
- **Team Features**: Share summaries and action items with teammates.

---

## License
This project is licensed under the MIT License. See the LICENSE file for details.

---

## Creator's Note
This project was a deep dive into building a full-stack, AI-powered browser extension from the ground up. The journey involved extensive debugging across frontend rendering, browser APIs, backend logic, and AI integration.

Thank you for your interest in this project! 🚀
