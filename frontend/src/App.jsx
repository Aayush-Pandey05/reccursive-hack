import React, { useState, useEffect, useRef } from "react";

function App() {
  const [user, setUser] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const [summaryType, setSummaryType] = useState("brief");
  const [captureMode, setCaptureMode] = useState("caption"); // ✅ NEW: 'caption' or 'audio'

  const activeTabId = useRef(null);
  // ✅ NEW: Refs for audio recording
  const mediaRecorderRef = useRef(null);
  const audioStreamRef = useRef(null);
  const transcriptionIntervalRef = useRef(null);

  // This effect runs once to load all persistent state from storage
  useEffect(() => {
    if (!window.chrome || !chrome.tabs) return;

    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]?.url?.startsWith("https://meet.google.com/")) {
        activeTabId.current = tabs[0].id;
      } else {
        setMessage("Please open and select a Google Meet tab.");
        setStatus("error");
      }
    });

    // Load user email, transcript, capturing state, and other preferences from storage
    chrome.storage.local.get(
      [
        "gmeet_user_email",
        "gmeet_transcript",
        "isCapturing",
        "summaryType",
        "captureMode",
      ],
      (result) => {
        if (result.gmeet_user_email)
          setUser({ email: result.gmeet_user_email });
        if (result.gmeet_transcript) setTranscript(result.gmeet_transcript);
        if (result.isCapturing) setIsCapturing(result.isCapturing);
        if (result.summaryType) setSummaryType(result.summaryType);
        if (result.captureMode) setCaptureMode(result.captureMode); // ✅ NEW
      }
    );

    const storageListener = (changes, area) => {
      if (area === "local" && changes.gmeet_transcript) {
        setTranscript(changes.gmeet_transcript.newValue || "");
      }
    };
    chrome.storage.onChanged.addListener(storageListener);

    return () => chrome.storage.onChanged.removeListener(storageListener);
  }, []);

  // --- Auth functions (handleAuth, handleSignOut) are unchanged ---
  const handleAuth = () => {
    if (!window.chrome || !chrome.identity) return;
    chrome.identity.getAuthToken({ interactive: true }, (token) => {
      if (chrome.runtime.lastError || !token) {
        setMessage(
          `Authentication failed: ${
            chrome.runtime.lastError?.message || "No token."
          }`
        );
        return setStatus("error");
      }
      fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
        headers: { Authorization: `Bearer ${token}` },
      })
        .then((res) =>
          res.ok ? res.json() : Promise.reject("Failed to fetch user info.")
        )
        .then((userInfo) => {
          if (!userInfo?.email)
            throw new Error("Could not retrieve a valid email.");
          const userData = { email: userInfo.email };
          setUser(userData);
          chrome.storage.local.set({ gmeet_user_email: userInfo.email });
          setMessage(`Signed in as ${userInfo.email}`);
          setStatus("idle");
        })
        .catch((err) => {
          setMessage(`Sign-in error: ${err.message}`);
          setStatus("error");
          chrome.identity.removeCachedAuthToken({ token: token }, () => {});
        });
    });
  };

  const handleSignOut = () => {
    setUser(null);
    chrome.storage.local.remove("gmeet_user_email");
    setMessage("You have been signed out.");
    setStatus("idle");
  };

  // ✅ MODIFIED: Main toggle function now directs to the correct helper function
  const handleToggleCapture = () => {
    if (!activeTabId.current) {
      setMessage(
        "Google Meet tab not found. Please select the tab and reopen."
      );
      setStatus("error");
      return;
    }

    if (isCapturing) {
      // --- STOP CAPTURING ---
      if (captureMode === "audio") {
        stopAudioCapture();
      } else {
        stopCaptionCapture();
      }
    } else {
      // --- START CAPTURING ---
      setTranscript(""); // Clear transcript for new session
      chrome.storage.local.set({ gmeet_transcript: "" });
      if (captureMode === "audio") {
        startAudioCapture();
      } else {
        startCaptionCapture();
      }
    }
  };

  // --- Logic for Caption Scraping (from your working code) ---
  const startAudioCapture = async () => {
    try {
      // This line captures your microphone audio stream
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // --- The rest of the function handles the recording and transcription ---

      audioStreamRef.current = stream;
      mediaRecorderRef.current = new MediaRecorder(stream, {
        mimeType: "audio/webm",
      });
      const audioChunks = [];

      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunks.push(event.data);
      };

      mediaRecorderRef.current.onstop = async () => {
        if (audioChunks.length === 0) return;

        const audioBlob = new Blob(audioChunks, { type: "audio/webm" });

        // The audio playback debugging code has been removed from this section.

        // This check prevents sending silent/empty audio clips to the API
        if (audioBlob.size < 1024) {
          console.log("Audio chunk is too small, skipping API call.");
          audioChunks.length = 0; // Clear chunks for the next interval
          return;
        }

        const formData = new FormData();
        formData.append("audio", audioBlob, "recording.webm");

        try {
          const response = await fetch("http://localhost:3000/api/transcribe", {
            method: "POST",
            body: formData,
          });
          const result = await response.json();
          if (!response.ok)
            throw new Error(result.error || "Transcription failed");

          const newText = result.transcript;
          if (newText) {
            setTranscript((prev) => {
              const updatedTranscript = (prev + " " + newText).trim();
              chrome.storage.local.set({ gmeet_transcript: updatedTranscript });
              return updatedTranscript;
            });
          }
        } catch (error) {
          setMessage(`Transcription Error: ${error.message}`);
          setStatus("error");
        }
        audioChunks.length = 0; // Clear chunks for the next interval
      };

      mediaRecorderRef.current.start();
      setIsCapturing(true);
      chrome.storage.local.set({ isCapturing: true });
      setStatus("capturing");
      setMessage("Recording audio... You can close this popup.");

      // Every 15 seconds, stop, send the chunk, and restart recording
      transcriptionIntervalRef.current = setInterval(() => {
        if (mediaRecorderRef.current?.state === "recording") {
          mediaRecorderRef.current.stop();
          mediaRecorderRef.current.start();
        }
      }, 15000);
    } catch (err) {
      // This code runs if the user denies the microphone permission prompt
      setMessage(
        `Microphone permission was denied. Please allow microphone access.`
      );
      setStatus("error");
    }
  };

  const stopAudioCapture = () => {
    clearInterval(transcriptionIntervalRef.current);
    if (mediaRecorderRef.current?.state === "recording") {
      mediaRecorderRef.current.stop();
    }
    audioStreamRef.current?.getTracks().forEach((track) => track.stop());
    setIsCapturing(false);
    chrome.storage.local.set({ isCapturing: false });
    setMessage("Audio recording stopped.");
    setStatus("idle");
  };

  // --- Other handlers and summarize function are unchanged ---
  const handleSummaryTypeChange = (type) => {
    setSummaryType(type);
    chrome.storage.local.set({ summaryType: type });
  };

  const handleSummarize = () => {
    if (!user?.email) return setMessage("Please sign in first.");
    if (!transcript) return setMessage("Please record a transcript first.");
    setStatus("summarizing");
    setMessage("Securing connection and processing summary...");

    chrome.identity.getAuthToken({ interactive: true }, async (token) => {
      if (chrome.runtime.lastError || !token) {
        setStatus("error");
        return setMessage(
          "Authentication failed. Please sign out and sign in again."
        );
      }
      try {
        const response = await fetch(
          "http://localhost:3000/api/summary/summarize",
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              transcript,
              userEmail: user.email,
              accessToken: token,
              summaryType,
            }),
          }
        );
        const result = await response.json();
        if (!response.ok) throw new Error(result.error || "Server error");
        setStatus("success");
        setMessage(result.message);
        setTranscript("");
        chrome.storage.local.set({ gmeet_transcript: "", isCapturing: false });
        setIsCapturing(false);
      } catch (error) {
        setStatus("error");
        setMessage(`Error: ${error.message}`);
      }
    });
  };

  const handleCaptureModeChange = (mode) => {
    setCaptureMode(mode);
    chrome.storage.local.set({ captureMode: mode });
  };

  const isLoading = status === "summarizing";

  return (
    <div className="w-[380px] bg-slate-50 text-slate-800 p-4 font-sans text-center">
      <header className="flex items-center justify-center gap-2 pb-3 mb-4 border-b border-slate-200">
        <img src="/vite.svg" className="h-8 w-8" alt="logo" />
        <h1 className="text-lg font-semibold text-slate-700">
          GMeet Summarizer
        </h1>
      </header>

      <main className="flex flex-col gap-4">
        {!user ? (
          <div className="p-4 bg-blue-100 rounded-md">
            <p className="text-sm font-medium text-blue-800 mb-3">
              Please sign in to save summaries and create calendar events.
            </p>
            <button
              onClick={handleAuth}
              className="w-full p-2.5 bg-blue-600 text-white font-semibold rounded-md hover:bg-blue-700"
            >
              Sign In with Google
            </button>
          </div>
        ) : (
          <>
            <div className="flex justify-between items-center text-xs text-slate-500 -mt-2">
              <span>
                Signed in as: <strong>{user.email}</strong>
              </span>
              <button
                onClick={handleSignOut}
                className="text-blue-600 hover:underline"
              >
                Sign Out
              </button>
            </div>

            {/* ✅ NEW: Capture Mode Selection UI */}
            <div className="text-left">
              <p className="text-sm font-medium text-slate-600 mb-2">
                Capture Mode:
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleCaptureModeChange("caption")}
                  disabled={isCapturing}
                  className={`flex-1 p-2 text-sm font-medium rounded-md transition-colors disabled:opacity-50 ${
                    captureMode === "caption"
                      ? "bg-blue-600 text-white"
                      : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                  }`}
                >
                  Captions
                </button>
                <button
                  onClick={() => handleCaptureModeChange("audio")}
                  disabled={isCapturing}
                  className={`flex-1 p-2 text-sm font-medium rounded-md transition-colors disabled:opacity-50 ${
                    captureMode === "audio"
                      ? "bg-blue-600 text-white"
                      : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                  }`}
                >
                  Audio (Whisper)
                </button>
              </div>
            </div>

            {/* --- Summary Type Selection (Unchanged) --- */}
            <div className="text-left">
              <p className="text-sm font-medium text-slate-600 mb-2">
                Summary Type:
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => handleSummaryTypeChange("brief")}
                  className={`flex-1 p-2 text-sm font-medium rounded-md transition-colors ${
                    summaryType === "brief"
                      ? "bg-blue-600 text-white"
                      : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                  }`}
                >
                  Brief
                </button>
                <button
                  onClick={() => handleSummaryTypeChange("detailed")}
                  className={`flex-1 p-2 text-sm font-medium rounded-md transition-colors ${
                    summaryType === "detailed"
                      ? "bg-blue-600 text-white"
                      : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                  }`}
                >
                  Detailed
                </button>
              </div>
            </div>

            <button
              onClick={handleToggleCapture}
              disabled={isLoading}
              className={`w-full p-2.5 text-white font-semibold rounded-md transition-colors ${
                isCapturing
                  ? "bg-red-600 hover:bg-red-700"
                  : "bg-blue-600 hover:bg-blue-700"
              }`}
            >
              {isCapturing ? "Stop Capturing" : "Start Capturing"}
            </button>

            <div className="text-left">
              <p className="text-sm font-medium text-slate-600 mb-1">
                Live Transcript:
              </p>
              <textarea
                value={transcript}
                readOnly
                placeholder={
                  isCapturing ? "Listening..." : "Recording is stopped."
                }
                rows={5}
                className="w-full p-2 text-sm bg-slate-100 border rounded-md font-mono"
              />
            </div>

            <button
              onClick={handleSummarize}
              disabled={isLoading || isCapturing || !transcript}
              className="w-full p-2.5 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 disabled:bg-slate-400"
            >
              {status === "summarizing"
                ? "Working..."
                : `Create ${
                    summaryType === "brief" ? "Brief" : "Detailed"
                  } Summary`}
            </button>
          </>
        )}
        {message && (
          <div
            className={`p-3 rounded-md text-sm font-medium ${
              status === "success"
                ? "bg-green-100 text-green-800"
                : status === "error"
                ? "bg-red-100 text-red-800"
                : "bg-blue-100 text-blue-800"
            }`}
          >
            <p>{message}</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
