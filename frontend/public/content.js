// This script is injected into the Google Meet page to continuously observe and save captions.

// ✅ FINAL FIX: Encapsulate all logic in a single object attached to the window.
// This is a more robust guard that prevents any possibility of re-declaration errors.
if (typeof window.gmeetSummarizer === "undefined") {
  window.gmeetSummarizer = {
    observer: null,
    STORAGE_KEY: "gmeet_transcript",

    // Main function to start observing caption changes
    startObserver: function () {
      const CAPTION_CONTAINER_CLASS = "a4cQT";
      const targetNode = document.querySelector(`.${CAPTION_CONTAINER_CLASS}`);

      if (!targetNode) {
        console.error("GMeet Summarizer: Caption container not found.");
        chrome.runtime.sendMessage({
          type: "error",
          text: "Caption container not found. Are captions enabled?",
        });
        return;
      }

      // Function to process and save new caption text
      const saveNewCaption = (node) => {
        const text = (
          node.nodeType === Node.TEXT_NODE ? node.textContent : node.innerText
        )?.trim();
        if (!text) return;

        chrome.storage.local.get([this.STORAGE_KEY], (result) => {
          const existingTranscript = result[this.STORAGE_KEY] || "";
          const lastSentences = existingTranscript.slice(-100);

          if (!lastSentences.includes(text)) {
            const updatedTranscript = existingTranscript + text + " ";
            chrome.storage.local.set({ [this.STORAGE_KEY]: updatedTranscript });
          }
        });
      };

      targetNode.childNodes.forEach(saveNewCaption);

      const config = { childList: true, subtree: true, characterData: true };

      const callback = (mutationsList) => {
        for (const mutation of mutationsList) {
          if (mutation.type === "childList") {
            mutation.addedNodes.forEach(saveNewCaption);
          } else if (mutation.type === "characterData") {
            saveNewCaption(mutation.target);
          }
        }
      };

      this.observer = new MutationObserver(callback);
      this.observer.observe(targetNode, config);
      console.log("GMeet Summarizer: Observer started.");
    },

    // Function to handle the 'start' command from the popup
    handleStart: function (sendResponse) {
      chrome.storage.local.set({ [this.STORAGE_KEY]: "" }, () => {
        if (this.observer) {
          this.observer.disconnect();
        }
        this.startObserver();
        sendResponse({ status: "Observer started" });
      });
    },

    // Function to handle the 'stop' command from the popup
    handleStop: function (sendResponse) {
      if (this.observer) {
        this.observer.disconnect();
        this.observer = null;
        console.log("GMeet Summarizer: Observer stopped.");
      }
      sendResponse({ status: "Observer stopped" });
    },
  };

  // Listen for messages from the popup (App.jsx) and route them to the correct handler
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.command === "start") {
      window.gmeetSummarizer.handleStart(sendResponse);
    } else if (message.command === "stop") {
      window.gmeetSummarizer.handleStop(sendResponse);
    }
    return true; // Keep the message channel open for async response.
  });
}
