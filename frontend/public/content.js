// This script is injected into the Google Meet page to continuously observe captions.

let observer = null;
let recordedTranscript = new Set(); // Use a Set to avoid duplicate entries from DOM re-renders

// The main function to start observing caption changes
function startObserver() {
  // The class for the container that holds all caption lines
  const CAPTION_CONTAINER_CLASS = 'a4cQT'; 
  const targetNode = document.querySelector(`.${CAPTION_CONTAINER_CLASS}`);

  if (!targetNode) {
    console.error('GMeet Summarizer: Caption container not found.');
    // Inform the popup that the container is missing so it can show an error
    chrome.runtime.sendMessage({ type: 'error', text: 'Caption container not found. Are captions enabled?' });
    return;
  }
  
  // A function to process and send newly added caption text
  const sendNewCaption = (node) => {
    if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() !== '') {
        // This handles cases where text is added directly
        const text = node.textContent.trim();
        if (!recordedTranscript.has(text)) {
            recordedTranscript.add(text);
            chrome.runtime.sendMessage({ type: 'new_caption', text: text });
        }
    } else if (node.nodeType === Node.ELEMENT_NODE && node.innerText) {
        // This handles cases where new elements with text are added
        const text = node.innerText.trim();
        if (text && !recordedTranscript.has(text)) {
            recordedTranscript.add(text);
            chrome.runtime.sendMessage({ type: 'new_caption', text: text });
        }
    }
  };

  // Pre-process any captions that are already on the screen when we start
  targetNode.childNodes.forEach(sendNewCaption);

  const config = { childList: true, subtree: true, characterData: true };

  const callback = (mutationsList, obs) => {
    for (const mutation of mutationsList) {
        if (mutation.type === 'childList') {
            mutation.addedNodes.forEach(sendNewCaption);
        } else if (mutation.type === 'characterData') {
            // This handles live-typing updates within the same element
            sendNewCaption(mutation.target);
        }
    }
  };

  observer = new MutationObserver(callback);
  observer.observe(targetNode, config);
  console.log('GMeet Summarizer: Observer started.');
}

// Listen for messages from the popup (App.jsx)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.command === 'start') {
    recordedTranscript.clear(); // Clear previous recording
    if (!observer) {
      startObserver();
    }
    sendResponse({ status: 'Observer started' });
  } else if (message.command === 'stop') {
    if (observer) {
      observer.disconnect();
      observer = null;
      console.log('GMeet Summarizer: Observer stopped.');
    }
    sendResponse({ status: 'Observer stopped' });
  }
  return true; // Keep the message channel open for async response
});