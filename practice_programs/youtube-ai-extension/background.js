chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  if (
    changeInfo.status === "complete" &&
    tab.url &&
    tab.url.includes("youtube.com/watch")
  ) {
    chrome.scripting.executeScript({
      target: { tabId: tabId },
      files: ["content.js"]
    }).then(() => {
      console.log("[YT-AI] Script injected into tab:", tabId);
    }).catch((err) => {
      console.error("[YT-AI] Injection failed:", err);
    });
  }
});