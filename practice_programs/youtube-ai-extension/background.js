/**
 * background.js — Antigravity Extension Service Worker
 *
 * Architecture:
 *  - ALL activity is written to chrome.storage.local FIRST (offline-first)
 *  - chrome.alarms fires every 15 minutes to attempt sync
 *  - Token change triggers immediate sync attempt
 *  - Each activity has a sha256-based dedupe_key to prevent double-sync
 *  - Exponential backoff on network failures (1s → 2s → 4s → 8s → 16s, then stop)
 *  - On 401: attempts token refresh; if still 401, clears token and waits for re-login
 *  - Only removes items from queue AFTER backend confirms success
 *
 * Queue item schema:
 * {
 *   dedupe_key: string,        // sha256(activity_type + source_id + date_utc)
 *   activity_type: string,     // "youtube_watch" | "leetcode_solve"
 *   payload: object,           // raw activity data
 *   timestamp: string,         // ISO 8601 creation time
 *   status: string,            // "pending" | "syncing" | "synced" | "failed"
 *   retry_count: number,
 *   last_error: string | null
 * }
 */

const BACKEND_URL = "http://localhost:8000";
const SYNC_ENDPOINT = `${BACKEND_URL}/api/v1/activity/sync`;
const REFRESH_ENDPOINT = `${BACKEND_URL}/api/v1/auth/refresh`;
const ALARM_NAME = "antigravity-sync";
const ALARM_PERIOD_MINUTES = 15;
const MAX_RETRIES = 5;
const BACKOFF_BASE_MS = 1000;
const MAX_BATCH_SIZE = 50; // max items per sync call

// ─── Crypto helpers ───────────────────────────────────────────────────────────

/**
 * Creates a stable dedupe key from activity properties.
 * Uses SubtleCrypto (available in MV3 service workers) to produce a sha256 hex.
 */
async function computeDedupeKey(activityType, sourceId, dateUtc) {
  const raw = `${activityType}:${sourceId}:${dateUtc}`;
  const encoded = new TextEncoder().encode(raw);
  const hashBuffer = await crypto.subtle.digest("SHA-256", encoded);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── Queue helpers ────────────────────────────────────────────────────────────

/** Read the offline queue from storage. Always returns an array. */
async function getQueue() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["ag_offline_queue"], (result) => {
      resolve(result.ag_offline_queue || []);
    });
  });
}

/** Persist the queue back to storage. */
async function saveQueue(queue) {
  return new Promise((resolve) => {
    chrome.storage.local.set({ ag_offline_queue: queue }, resolve);
  });
}

/**
 * Enqueue a new activity item.
 * Skips if an item with the same dedupe_key already exists (idempotent).
 */
async function enqueueActivity(activityType, sourceId, payload) {
  const dateUtc = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const dedupeKey = await computeDedupeKey(activityType, sourceId, dateUtc);

  const queue = await getQueue();
  const alreadyQueued = queue.some((item) => item.dedupe_key === dedupeKey);
  if (alreadyQueued) {
    console.log(`[AG] Skipping duplicate: ${activityType} ${sourceId}`);
    return dedupeKey;
  }

  const item = {
    dedupe_key: dedupeKey,
    activity_type: activityType,
    payload,
    timestamp: new Date().toISOString(),
    status: "pending",
    retry_count: 0,
    last_error: null,
  };

  queue.push(item);
  await saveQueue(queue);
  console.log(`[AG] Queued: ${activityType} | key: ${dedupeKey.slice(0, 8)}...`);
  return dedupeKey;
}

/** Mark specific items as synced and remove them from the queue. */
async function removeSyncedItems(syncedKeys) {
  if (!syncedKeys || syncedKeys.length === 0) return;
  const queue = await getQueue();
  const updated = queue.filter((item) => !syncedKeys.includes(item.dedupe_key));
  await saveQueue(updated);
  console.log(`[AG] Removed ${syncedKeys.length} synced items from queue.`);
}

/** Increment retry count and mark items that exceeded max retries as failed. */
async function handleFailedItems(failedKeys, errorMessage) {
  const queue = await getQueue();
  const updated = queue.map((item) => {
    if (!failedKeys.includes(item.dedupe_key)) return item;
    const retryCount = item.retry_count + 1;
    return {
      ...item,
      retry_count: retryCount,
      status: retryCount >= MAX_RETRIES ? "failed" : "pending",
      last_error: errorMessage,
    };
  });
  await saveQueue(updated);
}

// ─── Token helpers ────────────────────────────────────────────────────────────

async function getTokens() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["ag_access_token", "ag_refresh_token"], (result) => {
      resolve({
        accessToken: result.ag_access_token || null,
        refreshToken: result.ag_refresh_token || null,
      });
    });
  });
}

async function saveTokens(accessToken, refreshToken) {
  return new Promise((resolve) => {
    chrome.storage.local.set(
      { ag_access_token: accessToken, ag_refresh_token: refreshToken },
      resolve
    );
  });
}

async function clearTokens() {
  return new Promise((resolve) => {
    chrome.storage.local.remove(["ag_access_token", "ag_refresh_token"], resolve);
  });
}

/**
 * Attempts to refresh the access token using the stored refresh token.
 * Returns new access token string on success, or null on failure.
 */
async function attemptTokenRefresh() {
  const { refreshToken } = await getTokens();
  if (!refreshToken) {
    console.warn("[AG] No refresh token available. User must re-login.");
    return null;
  }

  try {
    const response = await fetch(REFRESH_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: refreshToken }),
    });

    if (!response.ok) {
      console.warn("[AG] Token refresh failed with status:", response.status);
      return null;
    }

    const data = await response.json();
    const newAccess = data.access_token;
    const newRefresh = data.refresh_token || refreshToken; // server may rotate refresh token
    await saveTokens(newAccess, newRefresh);
    console.log("[AG] Token refreshed successfully.");
    return newAccess;
  } catch (err) {
    console.error("[AG] Token refresh network error:", err.message);
    return null;
  }
}

// ─── Core sync logic ──────────────────────────────────────────────────────────

/**
 * Main sync function. Called by alarm and token-change events.
 * Steps:
 * 1. Read access token — abort if missing
 * 2. Filter queue for pending items (not failed, retry < MAX_RETRIES)
 * 3. Batch POST to /api/v1/activity/sync
 * 4. On 401 → try refresh → retry once
 * 5. On network error → apply exponential backoff delay, then stop (alarm will retry)
 * 6. On success → remove synced keys from queue
 */
async function syncQueue() {
  let { accessToken } = await getTokens();
  if (!accessToken) {
    console.log("[AG] No access token. Queue will sync after login.");
    return;
  }

  const queue = await getQueue();
  const pending = queue.filter(
    (item) => item.status === "pending" && item.retry_count < MAX_RETRIES
  );

  if (pending.length === 0) {
    console.log("[AG] Queue is empty. Nothing to sync.");
    return;
  }

  console.log(`[AG] Syncing ${pending.length} queued item(s)...`);

  // Batch in chunks to avoid huge payloads
  const batches = [];
  for (let i = 0; i < pending.length; i += MAX_BATCH_SIZE) {
    batches.push(pending.slice(i, i + MAX_BATCH_SIZE));
  }

  for (const batch of batches) {
    const payload = {
      device_id: await getDeviceId(),
      activities: batch.map((item) => ({
        dedupe_key: item.dedupe_key,
        activity_type: item.activity_type,
        payload: item.payload,
        timestamp: item.timestamp,
      })),
    };

    let response;
    let retried = false;

    // First attempt
    try {
      response = await fetch(SYNC_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify(payload),
      });
    } catch (networkErr) {
      // Pure network failure (backend offline)
      console.error("[AG] Network error during sync:", networkErr.message);
      const failedKeys = batch.map((i) => i.dedupe_key);
      await handleFailedItems(failedKeys, `Network error: ${networkErr.message}`);
      // Apply backoff based on max retry count in this batch
      const maxRetries = Math.max(...batch.map((i) => i.retry_count));
      const backoffMs = Math.min(BACKOFF_BASE_MS * Math.pow(2, maxRetries), 16000);
      console.log(`[AG] Backoff: waiting ${backoffMs}ms before next attempt.`);
      await new Promise((r) => setTimeout(r, backoffMs));
      continue; // try next batch, alarm handles future retries
    }

    // Handle 401: try token refresh once
    if (response.status === 401 && !retried) {
      console.warn("[AG] 401 received. Attempting token refresh...");
      const newToken = await attemptTokenRefresh();
      if (!newToken) {
        console.error("[AG] Refresh failed. Clearing tokens. User must re-login.");
        await clearTokens();
        return; // Stop all sync — no point continuing without auth
      }
      accessToken = newToken;
      retried = true;

      // Retry the same batch with new token
      try {
        response = await fetch(SYNC_ENDPOINT, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify(payload),
        });
      } catch (retryNetworkErr) {
        console.error("[AG] Retry network error:", retryNetworkErr.message);
        const failedKeys = batch.map((i) => i.dedupe_key);
        await handleFailedItems(failedKeys, `Retry network error: ${retryNetworkErr.message}`);
        continue;
      }
    }

    // Handle still-401 after refresh
    if (response.status === 401) {
      console.error("[AG] Still 401 after token refresh. Clearing tokens.");
      await clearTokens();
      return;
    }

    // Handle non-ok responses (5xx, etc.)
    if (!response.ok) {
      const errText = await response.text().catch(() => "Unknown error");
      console.error(`[AG] Sync failed: HTTP ${response.status} — ${errText}`);
      const failedKeys = batch.map((i) => i.dedupe_key);
      await handleFailedItems(failedKeys, `HTTP ${response.status}: ${errText}`);
      continue;
    }

    // Parse success response
    let data;
    try {
      data = await response.json();
    } catch (parseErr) {
      console.error("[AG] Failed to parse sync response JSON:", parseErr.message);
      continue;
    }

    // Remove synced and skipped (already exists) items from queue
    const successKeys = (data.results || [])
      .filter((r) => r.status === "synced" || r.status === "skipped")
      .map((r) => r.dedupe_key);

    const failedResults = (data.results || []).filter((r) => r.status === "failed");

    await removeSyncedItems(successKeys);

    if (failedResults.length > 0) {
      const failedKeys = failedResults.map((r) => r.dedupe_key);
      await handleFailedItems(failedKeys, "Backend processing failed");
    }

    console.log(
      `[AG] Batch complete — synced: ${data.synced}, skipped: ${data.skipped}, failed: ${data.failed}`
    );
  }
}

// ─── Device ID ────────────────────────────────────────────────────────────────

/** Stable ephemeral device ID stored in extension storage. */
async function getDeviceId() {
  return new Promise((resolve) => {
    chrome.storage.local.get(["ag_device_id"], async (result) => {
      if (result.ag_device_id) {
        resolve(result.ag_device_id);
        return;
      }
      // Generate a random UUID-like device ID
      const array = new Uint8Array(16);
      crypto.getRandomValues(array);
      const hex = Array.from(array).map((b) => b.toString(16).padStart(2, "0")).join("");
      const deviceId = `ext-${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}`;
      chrome.storage.local.set({ ag_device_id: deviceId }, () => resolve(deviceId));
    });
  });
}

// ─── Alarm setup ─────────────────────────────────────────────────────────────

function setupAlarm() {
  chrome.alarms.get(ALARM_NAME, (existing) => {
    if (!existing) {
      chrome.alarms.create(ALARM_NAME, {
        periodInMinutes: ALARM_PERIOD_MINUTES,
        delayInMinutes: 1, // first fire in 1 minute
      });
      console.log(`[AG] Alarm created: fires every ${ALARM_PERIOD_MINUTES} minutes.`);
    }
  });
}

// ─── Event listeners ──────────────────────────────────────────────────────────

// Service worker startup
chrome.runtime.onInstalled.addListener(() => {
  console.log("[AG] Extension installed/updated. Setting up alarm.");
  setupAlarm();
  syncQueue();
});

// Wakeup on every alarm tick
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_NAME) {
    console.log("[AG] Alarm fired. Attempting queue sync...");
    syncQueue();
  }
});

// Token stored (login event) → sync immediately
chrome.storage.onChanged.addListener((changes, namespace) => {
  if (namespace !== "local") return;

  if (changes.ag_access_token && changes.ag_access_token.newValue) {
    console.log("[AG] New access token detected. Triggering immediate sync.");
    syncQueue();
  }
});

// Initial sync attempt when service worker wakes
setupAlarm();
syncQueue();

// ─── Message handler (from content.js) ───────────────────────────────────────

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "AG_ENQUEUE_YOUTUBE") {
    const { videoId, payload } = request;
    enqueueActivity("youtube_watch", videoId, payload)
      .then((key) => {
        sendResponse({ success: true, dedupe_key: key });
        // Attempt sync immediately after queuing
        syncQueue();
      })
      .catch((err) => {
        console.error("[AG] Failed to enqueue YouTube activity:", err);
        sendResponse({ success: false, error: err.message });
      });
    return true; // Keep channel open for async response
  }

  if (request.type === "AG_ENQUEUE_LEETCODE") {
    const { problemSlug, payload } = request;
    enqueueActivity("leetcode_solve", problemSlug, payload)
      .then((key) => {
        sendResponse({ success: true, dedupe_key: key });
        syncQueue();
      })
      .catch((err) => {
        console.error("[AG] Failed to enqueue LeetCode activity:", err);
        sendResponse({ success: false, error: err.message });
      });
    return true;
  }

  if (request.type === "AG_GET_QUEUE_STATUS") {
    getQueue().then((queue) => {
      sendResponse({
        total: queue.length,
        pending: queue.filter((i) => i.status === "pending").length,
        synced: queue.filter((i) => i.status === "synced").length,
        failed: queue.filter((i) => i.status === "failed").length,
      });
    });
    return true;
  }

  // Legacy support: old content.js SYNC_YOUTUBE messages
  // Redirect to new queue system instead of direct fetch
  if (request.type === "SYNC_YOUTUBE") {
    const vd = request.videoData;
    if (!vd || !vd.videoId) {
      sendResponse({ success: false, error: "Missing videoId" });
      return true;
    }
    const payload = {
      video_id: vd.videoId,
      title: vd.title,
      channel_name: vd.channel,
      completion_pct: vd.completion || 0,
      watch_duration: vd.watchTime || 0,
      thumbnail: vd.thumbnail,
      first_seen: vd.firstSeen,
      last_watched: vd.lastWatched,
      rewatch_count: vd.rewatchCount || 1,
      is_educational: vd.isEducational,
      confidence: vd.confidence,
    };
    enqueueActivity("youtube_watch", vd.videoId, payload)
      .then((key) => {
        sendResponse({ success: true, dedupe_key: key });
        syncQueue();
      })
      .catch((err) => sendResponse({ success: false, error: err.message }));
    return true;
  }

  // ── Phase 2.3: LeetCode Accepted submission capture ───────────────────────
  // Sent by leetcode_content.js when a submission result is "Accepted"
  if (request.type === "LEETCODE_ACCEPTED") {
    const lc = request.payload;
    if (!lc || !lc.problem_slug) {
      sendResponse({ success: false, error: "Missing problem_slug" });
      return true;
    }

    const payload = {
      problem_slug:  lc.problem_slug,
      title:         lc.title || lc.problem_slug,
      language:      lc.language || "unknown",
      solution_code: lc.solution_code || "",
      runtime_ms:    lc.runtime_ms   || null,
      memory_mb:     lc.memory_mb    || null,
      url:           lc.url          || "",
      captured_at:   lc.captured_at  || new Date().toISOString(),
    };

    enqueueActivity("leetcode_solve", lc.problem_slug, payload)
      .then((key) => {
        console.log(`[AG] LeetCode queued: ${lc.problem_slug} | key: ${key.slice(0, 8)}...`);
        sendResponse({ success: true, dedupe_key: key });
        // Trigger immediate sync if token available
        syncQueue();
      })
      .catch((err) => {
        console.warn("[AG] LeetCode queue error:", err);
        sendResponse({ success: false, error: err.message });
      });
    return true; // async
  }
});