// Relay screenshot requests from the page to the background service worker.
// The availability flag (window._phoenixScreenshotExtensionAvailable) is set by
// page-script.js which runs in the MAIN world via the manifest.
window.addEventListener("message", (event) => {
    if (event.source !== window || !event.data || event.data.type !== "phoenix_screenshot_request") {
        return;
    }
    const requestId = event.data.id;
    chrome.runtime.sendMessage({ type: "phoenix_screenshot_capture" }, (response) => {
        if (chrome.runtime.lastError) {
            window.postMessage({
                type: "phoenix_screenshot_response",
                id: requestId,
                success: false,
                error: chrome.runtime.lastError.message || "Extension communication error"
            }, "*");
            return;
        }
        window.postMessage({
            type: "phoenix_screenshot_response",
            id: requestId,
            success: response.success,
            dataUrl: response.dataUrl,
            error: response.error
        }, "*");
    });
});
