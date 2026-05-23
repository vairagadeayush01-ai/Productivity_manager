chrome.tabs.onUpdated.addListener(function(tabId, changeInfo, tab) {
  // content.js is injected automatically via manifest.json
});

chrome.runtime.onMessage.addListener(function(request, sender, sendResponse) {
  if (request.type === "SYNC_YOUTUBE") {
    fetch("http://localhost:8000/ingest/youtube/sync", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer " + request.token
      },
      body: JSON.stringify(request.videoData)
    })
    .then(r => {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    })
    .then(data => sendResponse({ success: true, data: data }))
    .catch(err => sendResponse({ success: false, error: err.message }));
    
    return true; // Keep message channel open for async response
  }
});