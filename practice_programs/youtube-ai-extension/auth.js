// Extracts the JWT token from the Productivity Manager dashboard
// and syncs it securely to the extension's local storage so it can authenticate to the backend.

function syncToken() {
  const token = localStorage.getItem('pm_token');
  if (token) {
    chrome.storage.local.set({ pm_token: token }, () => {
      console.log("[YT-AI] Successfully synced auth token from dashboard!");
    });
  }
}

syncToken();
setInterval(syncToken, 5000); // Poll in case token changes
