import React, { useState, useEffect, useRef } from 'react';

function App() {
  const [email, setEmail] = useState('');
  const [transcript, setTranscript] = useState('');
  const [status, setStatus] = useState('idle'); // idle, capturing, summarizing, success, error
  const [isCapturing, setIsCapturing] = useState(false);
  const [message, setMessage] = useState('');
  
  // Use a ref to keep track of the active tab ID
  const activeTabId = useRef(null);

  // This effect runs once to get the active tab ID and load saved email
  useEffect(() => {
    if (window.chrome && chrome.tabs) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs[0] && tabs[0].url && tabs[0].url.startsWith("https://meet.google.com/")) {
            activeTabId.current = tabs[0].id;
        } else {
            setMessage("Please open a Google Meet tab to use this extension.");
            setStatus('error');
        }
      });
    }

    if (window.chrome && chrome.storage) {
      chrome.storage.local.get(['userEmail'], (result) => {
        if (result.userEmail) {
          setEmail(result.userEmail);
        }
      });
    }
  }, []);

  // This effect sets up the listener for messages from the content script
  useEffect(() => {
    const messageListener = (message, sender, sendResponse) => {
      if (message.type === 'new_caption') {
        setTranscript((prevTranscript) => prevTranscript + message.text + ' ');
      } else if (message.type === 'error') {
        // Listen for errors from the content script
        setMessage(message.text);
        setStatus('error');
        setIsCapturing(false);
      }
    };

    if (window.chrome && chrome.runtime) {
        chrome.runtime.onMessage.addListener(messageListener);
    }

    // Cleanup function to remove the listener when the component unmounts
    return () => {
      if (window.chrome && chrome.runtime) {
        chrome.runtime.onMessage.removeListener(messageListener);
      }
    };
  }, []);

  // Handler to start or stop capturing the transcript
  const handleToggleCapture = () => {
    if (!activeTabId.current) {
      setMessage("Please use this extension on an active Google Meet tab.");
      setStatus('error');
      return;
    }

    const command = isCapturing ? 'stop' : 'start';

    // Before starting, inject the script if it's not already there.
    chrome.scripting.executeScript({
        target: { tabId: activeTabId.current },
        files: ['content.js']
    }, () => {
        if (chrome.runtime.lastError) {
            console.error(chrome.runtime.lastError);
            setMessage("Failed to load the caption script. Please reload the Google Meet tab and try again.");
            setStatus('error');
            return;
        }
        
        // Once the script is injected, send the command
        chrome.tabs.sendMessage(activeTabId.current, { command }, (response) => {
            if (chrome.runtime.lastError) {
                console.error(chrome.runtime.lastError.message);
                setMessage("Could not communicate with the content script. Is Google Meet open and are captions enabled?");
                setStatus('error');
                setIsCapturing(false);
                return;
            }
            
            if (command === 'start') {
                setIsCapturing(true);
                setTranscript(''); // Clear previous transcript
                setStatus('capturing');
                setMessage('Recording captions... Click "Stop" when done.');
            } else { // command === 'stop'
                setIsCapturing(false);
                setStatus('idle');
                setMessage('Recording stopped. You can now summarize.');
            }
        });
    });
  };

  const handleSummarize = async () => {
    if (!transcript || !email) {
      setMessage('Please record a transcript and enter your email first.');
      setStatus('error');
      return;
    }

    if (window.chrome && chrome.storage) {
      chrome.storage.local.set({ userEmail: email });
    }

    setStatus('summarizing');
    setMessage('Generating summary and sending email...');

    try {
      const response = await fetch('http://localhost:3000/api/summary/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript, userEmail: email }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Server error');
      
      setStatus('success');
      setMessage('Success! Your summary has been sent.');
    } catch (error) {
      console.error('Summarization error:', error);
      setStatus('error');
      setMessage(`Error: ${error.message}`);
    }
  };
  
  const isLoading = status === 'summarizing';

  return (
    <div className="w-[380px] bg-slate-50 text-slate-800 p-4 font-sans text-center">
      <header className="flex items-center justify-center gap-2 pb-3 mb-4 border-b border-slate-200">
        <img src="/vite.svg" className="h-8 w-8" alt="logo" />
        <h1 className="text-lg font-semibold text-slate-700">GMeet Summarizer</h1>
      </header>
      
      <main className="flex flex-col gap-4">
        <div>
          <label htmlFor="email-input" className="block text-sm font-medium text-slate-600 mb-1 text-left">Your Email</label>
          <input
            id="email-input"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your.email@example.com"
            disabled={isLoading || isCapturing}
            className="w-full p-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all disabled:bg-slate-100"
          />
        </div>
        
        <button 
          onClick={handleToggleCapture} 
          disabled={isLoading}
          className={`w-full p-2.5 text-white font-semibold rounded-md transition-colors disabled:bg-slate-400 disabled:cursor-not-allowed ${
            isCapturing ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'
          }`}
        >
          {isCapturing ? 'Stop Capturing' : 'Start Capturing'}
        </button>

        <div className="text-left">
           <p className="text-sm font-medium text-slate-600 mb-1">Live Transcript:</p>
          <textarea 
            value={transcript} 
            readOnly 
            placeholder={isCapturing ? "Listening for captions..." : "Click Start to begin recording."}
            rows={5} 
            className="w-full p-2 text-sm bg-slate-100 border border-slate-200 rounded-md font-mono resize-none"
          />
        </div>

        <button 
          onClick={handleSummarize} 
          disabled={isLoading || isCapturing || !transcript}
          className="w-full p-2.5 bg-green-600 text-white font-semibold rounded-md hover:bg-green-700 disabled:bg-slate-400 disabled:cursor-not-allowed transition-colors"
        >
          {status === 'summarizing' ? 'Working On It...' : 'Summarize & Send'}
        </button>

        {message && (
          <div className={`p-3 rounded-md text-sm font-medium ${
            status === 'success' ? 'bg-green-100 text-green-800' : 
            status === 'error' ? 'bg-red-100 text-red-800' : 
            'bg-blue-100 text-blue-800'
          }`}>
            <p>{message}</p>
          </div>
        )}
      </main>
    </div>
  );
}

export default App;