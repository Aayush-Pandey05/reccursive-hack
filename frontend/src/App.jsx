import React, { useState, useEffect, useRef } from "react";

function App() {
  // ✅ MODIFIED: User state will now only store the email. The token will be fetched on demand.
  const [user, setUser] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [status, setStatus] = useState("idle");
  const [message, setMessage] = useState("");
  const activeTabId = useRef(null);

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

    // Load user email, transcript, and capturing state from storage
    chrome.storage.local.get(
      ["gmeet_user_email", "gmeet_transcript", "isCapturing"],
      (result) => {
        if (result.gmeet_user_email)
          setUser({ email: result.gmeet_user_email });
        if (result.gmeet_transcript) setTranscript(result.gmeet_transcript);
        if (result.isCapturing) setIsCapturing(result.isCapturing);
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
          // ✅ MODIFIED: Only save the user's email to storage.
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

  const handleToggleCapture = () => {
    // This function remains correct and does not need changes.
    if (!activeTabId.current) return;
    const newCapturingState = !isCapturing;
    const command = newCapturingState ? "start" : "stop";
    chrome.scripting.executeScript(
      { target: { tabId: activeTabId.current }, files: ["content.js"] },
      () => {
        if (chrome.runtime.lastError) return;
        chrome.tabs.sendMessage(activeTabId.current, { command }, () => {
          setIsCapturing(newCapturingState);
          chrome.storage.local.set({ isCapturing: newCapturingState });
          if (command === "start") {
            setTranscript("");
            setMessage("Recording... You can close this popup.");
          } else {
            setMessage("Recording stopped.");
          }
          setStatus(command === "start" ? "capturing" : "idle");
        });
      }
    );
  };

  // ✅ FINAL, ROBUST VERSION of handleSummarize
  const handleSummarize = () => {
    if (!user?.email) return setMessage("Please sign in first.");
    if (!transcript) return setMessage("Please record a transcript first.");

    setStatus("summarizing");
    setMessage("Securing connection and processing summary...");

    // Get a fresh, guaranteed valid token right before we make the API call.
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
            // Send the fresh token with the request
            body: JSON.stringify({
              transcript,
              userEmail: user.email,
              accessToken: token,
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

  const isLoading = status === "summarizing";

  return (
    <div className="w-[380px] bg-slate-50 text-slate-800 p-4 font-sans text-center">
      {/* --- UI REMAINS THE SAME --- */}
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
              {status === "summarizing" ? "Working..." : "Summarize & Save"}
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
