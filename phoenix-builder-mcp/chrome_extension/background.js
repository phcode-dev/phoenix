chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type !== "phoenix_screenshot_capture") {
        return false;
    }
    chrome.tabs.captureVisibleTab(null, { format: "png" })
        .then(dataUrl => {
            sendResponse({ success: true, dataUrl });
        })
        .catch(err => {
            sendResponse({ success: false, error: err.message || String(err) });
        });
    return true; // keep channel open for async sendResponse
});
