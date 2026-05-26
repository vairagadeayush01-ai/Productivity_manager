/**
 * auth.js — Dashboard content script
 *
 * Syncs the JWT access token from the dashboard's localStorage into
 * chrome.storage.local so background.js can use it for API calls.
 *
 * Token key mapping:
 *   localStorage "pm_token"        → chrome.storage "ag_access_token"
 *   localStorage "pm_refresh_token"→ chrome.storage "ag_refresh_token"
 *
 * On logout (token removed from localStorage), extension tokens are cleared.
 */

console.log("[AG] auth.js content script loaded on dashboard.");

const LS_ACCESS_KEY = "pm_token";
const LS_REFRESH_KEY = "pm_refresh_token";
const EXT_ACCESS_KEY = "ag_access_token";
const EXT_REFRESH_KEY = "ag_refresh_token";

function syncTokens() {
  const accessToken = window.localStorage.getItem(LS_ACCESS_KEY);
  const refreshToken = window.localStorage.getItem(LS_REFRESH_KEY);

  chrome.storage.local.get([EXT_ACCESS_KEY, EXT_REFRESH_KEY], (stored) => {
    const storedAccess = stored[EXT_ACCESS_KEY];
    const storedRefresh = stored[EXT_REFRESH_KEY];

    if (accessToken) {
      // Token exists in dashboard — sync to extension if different
      const changed =
        storedAccess !== accessToken || storedRefresh !== refreshToken;

      if (changed) {
        const toSet = { [EXT_ACCESS_KEY]: accessToken };
        if (refreshToken) toSet[EXT_REFRESH_KEY] = refreshToken;

        chrome.storage.local.set(toSet, () => {
          console.log("[AG] Auth tokens synced to extension storage.");
        });
      }
    } else {
      // No token in localStorage — user logged out
      // Only clear if we're actually on the dashboard port (not some other page)
      const isOnDashboard =
        window.location.hostname === "localhost" &&
        (window.location.port === "5173" || window.location.port === "3000");

      if (isOnDashboard && (storedAccess || storedRefresh)) {
        chrome.storage.local.remove([EXT_ACCESS_KEY, EXT_REFRESH_KEY], () => {
          console.log("[AG] Auth tokens cleared from extension (user logged out).");
        });
      }
    }
  });
}

// Initial sync on page load
syncTokens();

// Poll every 5 seconds to catch token changes (login/logout/refresh)
setInterval(syncTokens, 5000);

// Also listen for storage events in case another tab logs in/out
window.addEventListener("storage", (event) => {
  if (event.key === LS_ACCESS_KEY || event.key === LS_REFRESH_KEY) {
    console.log("[AG] Storage event detected — re-syncing tokens.");
    syncTokens();
  }
});
