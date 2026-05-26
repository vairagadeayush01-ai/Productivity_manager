// ── Config ────────────────────────────────────────────────
// Change this if your backend runs on a different port
var BACKEND_URL = "http://localhost:8000";

var EDU_CHANNELS = [
  // Global channels
  "freecodecamp.org", "traversy media", "the coding train", "fireship",
  "kunal kushwaha", "apna college", "codewithharry", "jenny's lectures cs it",
  "abdul bari", "striver", "3blue1brown", "khan academy",
  "mit opencourseware", "nptel", "veritasium", "numberphile",
  "andrej karpathy", "yannic kilcher", "two minute papers", "sentdex",
  "statquest with josh starmer", "crashcourse", "ted-ed", "lesics",
  // Requested Indian channels
  "campusx", "take u forward", "codestorywithmik", "coder army",
  "chai aur code", "engineering funda"
];

var EDU_KEYWORDS = [
  "lecture", "tutorial", "course", "lesson", "explained", "explanation",
  "learn", "crash course", "beginners", "full course", "masterclass",
  "bootcamp", "chapter", "how to", "introduction to", "intro to",
  "deep dive", "dsa", "data structures", "algorithms", "coding",
  "programming", "python", "javascript", "java", "c++", "react", "sql",
  "database", "operating system", "computer networks", "dbms", "oops",
  "object oriented", "system design", "leetcode", "interview prep",
  "placement", "machine learning", "deep learning", "neural network",
  "artificial intelligence", "nlp", "computer vision", "signal processing",
  "dsp", "fourier", "convolution", "transformer", "llm", "mathematics",
  "calculus", "linear algebra", "statistics", "probability", "physics",
  "chemistry", "biology", "theorem", "proof", "gate", "upsc", "revision",
  "exam", "mcq", "practice", "series", "part 1", "part 2", "episode"
];

// ── Detection ──────────────────────────────────────────────
function checkChannel(name) {
  return EDU_CHANNELS.indexOf((name || "").toLowerCase().trim()) !== -1;
}

function checkKeywords(title) {
  var lower = (title || "").toLowerCase();
  return EDU_KEYWORDS.filter(function(k) { return lower.indexOf(k) !== -1; });
}

// ── Storage helpers ────────────────────────────────────────
function getUserOverride(videoId, cb) {
  chrome.storage.local.get(["override_" + videoId], function(r) {
    var v = r["override_" + videoId];
    cb(v === undefined ? null : v);
  });
}

function setUserOverride(videoId, val) {
  var o = {};
  o["override_" + videoId] = val;
  chrome.storage.local.set(o);
}

// ── Send to backend ────────────────────────────────────────
function sendToBackend(meta) {
  var pctKey = "last_pct_" + meta.videoId;
  chrome.storage.local.get([pctKey, "ytai_videos", "ag_access_token"], function(result) {
    var token = result.ag_access_token;
    if (!token) {
      console.log("[YT-AI] No auth token. Data saved locally and will sync when dashboard is opened.");
      // Do not show an aggressive toast here, as the user might not want to log in immediately.
      return;
    }
    
    var videos = result.ytai_videos || {};
    var videoData = videos[meta.videoId];
    
    // If async save hasn't finished yet, construct it manually
    if (!videoData) {
      videoData = {
        videoId:       meta.videoId,
        title:         meta.title,
        channel:       meta.channel,
        duration:      meta.duration,
        thumbnail:     meta.thumbnail,
        isEducational: true,
        confidence:    100,
        watchTime:     0,
        completion:    0,
        firstSeen:     new Date().toISOString(),
        lastWatched:   new Date().toISOString(),
        rewatchCount:  1
      };
    }

    var lastPct = result[pctKey];
    var currentPct = videoData.completion || 0;

    // Only sync if first sync, or completion increased by >= 5%, or reached 100%
    if (lastPct !== undefined && currentPct - lastPct < 5 && currentPct < 100) {
      return;
    }

    chrome.runtime.sendMessage({
      type: "SYNC_YOUTUBE",
      token: token,
      videoData: videoData
    }, function(response) {
      if (chrome.runtime.lastError) {
        console.warn("[YT-AI] Extension error:", chrome.runtime.lastError);
        showStatusToast("⚠ Extension error. Please reload extension.");
        return;
      }
      
      if (response && response.success) {
        var o = {};
        o[pctKey] = currentPct;
        chrome.storage.local.set(o);
        showStatusToast("✓ Synced to learning tracker");
      } else {
        var errMsg = (response && response.error) ? response.error : "Unknown error";
        console.warn("[YT-AI] Backend error:", errMsg);
        if (errMsg.includes("401")) {
          showStatusToast("⚠ Auth expired. Re-login to dashboard.");
          chrome.storage.local.remove("ag_access_token");
        } else {
          showStatusToast("⚠ Could not reach backend");
        }
      }
    });
  });
}

// ── Toast notification ─────────────────────────────────────
function showStatusToast(msg) {
  var toast = document.getElementById("ytai-toast");
  if (!toast) return;
  toast.textContent = msg;
  toast.style.opacity = "1";
  toast.style.transform = "translateY(0)";
  setTimeout(function() {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(8px)";
  }, 3500);
}

// ── Watch time tracker ─────────────────────────────────────
var watchInterval = null;

function startWatchTimeTracker(meta) {
  if (watchInterval) clearInterval(watchInterval);
  var videoEl = document.querySelector("video");
  if (!videoEl) return;

  watchInterval = setInterval(function() {
    if (videoEl.paused) return;
    var duration    = videoEl.duration || 0;
    var currentTime = videoEl.currentTime || 0;
    var completion  = duration > 0 ? Math.round((currentTime / duration) * 100) : 0;

    chrome.storage.local.get(["ytai_videos"], function(result) {
      var videos = result.ytai_videos || {};
      if (videos[meta.videoId]) {
        videos[meta.videoId].watchTime  = Math.round(currentTime);
        videos[meta.videoId].completion = completion;
        videos[meta.videoId].lastWatched = new Date().toISOString();
        chrome.storage.local.set({ ytai_videos: videos }, function() {
          if (currentTime >= 20) sendToBackend(meta);
        });
      } else {
        if (currentTime >= 20) sendToBackend(meta);
      }
    });
  }, 5000);
}

function stopWatchTimeTracker() {
  if (watchInterval) { clearInterval(watchInterval); watchInterval = null; }
}

// ── Save video metadata locally ────────────────────────────
function saveVideoMetadata(meta, isEdu, confidence) {
  chrome.storage.local.get(["ytai_videos"], function(result) {
    var videos = result.ytai_videos || {};
    var prev   = videos[meta.videoId] || {};
    videos[meta.videoId] = {
      videoId:       meta.videoId,
      title:         meta.title,
      channel:       meta.channel,
      duration:      meta.duration,
      thumbnail:     meta.thumbnail,
      isEducational: isEdu,
      confidence:    Math.round(confidence * 100),
      watchTime:     prev.watchTime || 0,
      completion:    prev.completion || 0,
      firstSeen:     prev.firstSeen || new Date().toISOString(),
      lastWatched:   new Date().toISOString(),
      rewatchCount:  (prev.rewatchCount || 0) + 1
    };
    chrome.storage.local.set({ ytai_videos: videos });
  });
}

// ── Metadata ───────────────────────────────────────────────
function getMeta() {
  var videoId = new URLSearchParams(window.location.search).get("v");
  var titleEl = document.querySelector("h1.ytd-watch-metadata yt-formatted-string") ||
                document.querySelector("h1 yt-formatted-string") ||
                document.querySelector("ytd-watch-metadata h1");
  var title   = titleEl ? titleEl.textContent.trim() : document.title.replace(" - YouTube", "").trim();
  var chEl    = document.querySelector("ytd-channel-name yt-formatted-string a") ||
                document.querySelector("#channel-name a") ||
                document.querySelector("#owner #channel-name");
  var channel = chEl ? chEl.textContent.trim() : "";
  var videoEl = document.querySelector("video");
  var duration = videoEl ? formatTime(videoEl.duration) : "0:00";
  var thumbnail = "https://img.youtube.com/vi/" + videoId + "/mqdefault.jpg";
  return { videoId, title, channel, duration, thumbnail };
}

function formatTime(s) {
  if (!s || isNaN(s)) return "0:00";
  var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  if (h > 0) return h + ":" + pad(m) + ":" + pad(sec);
  return m + ":" + pad(sec);
}
function pad(n) { return n < 10 ? "0" + n : n; }

// ── Badge UI — Floating Draggable Circle ───────────────────
function showBadge(isEdu, confidence, meta) {
  // Remove old badge
  var old = document.getElementById("ytai-badge");
  if (old) old.remove();

  var pct      = Math.round(confidence * 100);
  var tracking = isEdu;
  var expanded = false;

  // ── Root container (positions the circle in top-right) ──
  var badge = document.createElement("div");
  badge.id  = "ytai-badge";
  badge.setAttribute("style",
    "position:fixed !important;" +
    "top:80px !important;" +
    "right:18px !important;" +
    "z-index:2147483647 !important;" +
    "user-select:none !important;" +
    "font-family:Inter,Roboto,Arial,sans-serif !important;"
  );

  // ── Toast (slides up when backend responds) ──────────────
  var toast = document.createElement("div");
  toast.id = "ytai-toast";
  toast.setAttribute("style",
    "position:absolute !important;" +
    "bottom:56px !important;" +
    "right:0 !important;" +
    "background:rgba(10,10,14,0.95) !important;" +
    "color:#4ade80 !important;" +
    "font-size:12px !important;" +
    "padding:6px 12px !important;" +
    "border-radius:8px !important;" +
    "white-space:nowrap !important;" +
    "opacity:0 !important;" +
    "transform:translateY(8px) !important;" +
    "transition:opacity 0.3s,transform 0.3s !important;" +
    "pointer-events:none !important;" +
    "border:1px solid rgba(74,222,128,0.25) !important;"
  );
  badge.appendChild(toast);

  // ── Circle button ────────────────────────────────────────
  var circleColor = isEdu ? "#22c55e" : "#64748b";
  var circle = document.createElement("div");
  circle.id = "ytai-circle";
  circle.setAttribute("style",
    "width:48px !important;" +
    "height:48px !important;" +
    "border-radius:50% !important;" +
    "background:rgba(10,10,14,0.92) !important;" +
    "border:2.5px solid " + circleColor + " !important;" +
    "display:flex !important;" +
    "align-items:center !important;" +
    "justify-content:center !important;" +
    "cursor:grab !important;" +
    "box-shadow:0 4px 20px rgba(0,0,0,0.5),0 0 0 0 " + circleColor + "44 !important;" +
    "transition:border-color 0.3s,box-shadow 0.3s !important;" +
    "position:relative !important;" +
    "font-size:20px !important;"
  );
  circle.textContent = isEdu ? "🎓" : "📺";
  badge.appendChild(circle);

  // ── Tracking dot (pulsing green/grey) ────────────────────
  var dot = document.createElement("div");
  dot.setAttribute("style",
    "position:absolute !important;" +
    "bottom:1px !important;" +
    "right:1px !important;" +
    "width:12px !important;" +
    "height:12px !important;" +
    "border-radius:50% !important;" +
    "background:" + (tracking ? "#22c55e" : "#64748b") + " !important;" +
    "border:2px solid rgba(10,10,14,0.95) !important;" +
    "transition:background 0.3s !important;"
  );
  circle.appendChild(dot);

  // ── Expanded panel (hidden by default) ───────────────────
  var panel = document.createElement("div");
  panel.id = "ytai-panel";
  panel.setAttribute("style",
    "position:absolute !important;" +
    "top:0 !important;" +
    "right:54px !important;" +
    "background:rgba(10,10,14,0.95) !important;" +
    "border:1.5px solid " + (isEdu ? "rgba(34,197,94,0.4)" : "rgba(100,116,139,0.4)") + " !important;" +
    "border-radius:14px !important;" +
    "padding:14px 16px !important;" +
    "min-width:280px !important;" +
    "max-width:340px !important;" +
    "backdrop-filter:blur(10px) !important;" +
    "box-shadow:0 8px 32px rgba(0,0,0,0.6) !important;" +
    "display:none !important;" +
    "flex-direction:column !important;" +
    "gap:10px !important;"
  );

  // Panel header
  var panelHeader = document.createElement("div");
  panelHeader.setAttribute("style",
    "display:flex !important;align-items:center !important;justify-content:space-between !important;"
  );

  var panelTitle = document.createElement("div");
  panelTitle.setAttribute("style",
    "display:flex !important;align-items:center !important;gap:8px !important;"
  );
  panelTitle.innerHTML =
    '<span style="font-size:18px !important;">' + (isEdu ? "🎓" : "📺") + '</span>' +
    '<div>' +
      '<div style="font-size:13px !important;font-weight:600 !important;color:#f8fafc !important;">' +
        (isEdu ? "Educational" : "Not Educational") +
      '</div>' +
      '<div style="font-size:11px !important;color:#94a3b8 !important;margin-top:2px !important;">' +
        'Confidence: <b style="color:' + (pct > 60 ? "#22c55e" : pct > 30 ? "#f59e0b" : "#ef4444") + ' !important;">' + pct + '%</b>' +
      '</div>' +
    '</div>';

  var closeBtn = document.createElement("button");
  closeBtn.textContent = "×";
  closeBtn.setAttribute("style",
    "background:none !important;border:none !important;color:#94a3b8 !important;" +
    "font-size:20px !important;cursor:pointer !important;padding:0 4px !important;line-height:1 !important;"
  );

  panelHeader.appendChild(panelTitle);
  panelHeader.appendChild(closeBtn);
  panel.appendChild(panelHeader);

  // Panel info row
  var infoRow = document.createElement("div");
  infoRow.setAttribute("style",
    "font-size:11px !important;color:#94a3b8 !important;" +
    "background:rgba(255,255,255,0.04) !important;border-radius:8px !important;padding:8px 10px !important;" +
    "display:flex !important;flex-direction:column !important;gap:4px !important;"
  );
  infoRow.innerHTML =
    '<div><b style="color:#f8fafc !important;">' + (meta.channel || "Unknown") + '</b></div>' +
    '<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:260px;">' + (meta.title || "") + '</div>' +
    '<div>Duration: <b style="color:#f8fafc !important;">' + meta.duration + '</b></div>';
  panel.appendChild(infoRow);

  // Panel toggle row
  var toggleRow = document.createElement("div");
  toggleRow.setAttribute("style",
    "display:flex !important;align-items:center !important;justify-content:space-between !important;"
  );

  var trackingLabel = document.createElement("span");
  trackingLabel.id = "ytai-lbl";
  trackingLabel.setAttribute("style",
    "font-size:12px !important;color:#94a3b8 !important;font-weight:500 !important;"
  );
  trackingLabel.textContent = tracking ? "Tracking ON" : "Tracking OFF";

  var toggleBtn = document.createElement("div");
  toggleBtn.id = "ytai-toggle";
  toggleBtn.setAttribute("style",
    "width:44px !important;height:24px !important;border-radius:12px !important;" +
    "background:" + (tracking ? "#22c55e" : "#475569") + " !important;" +
    "cursor:pointer !important;position:relative !important;transition:background 0.3s !important;flex-shrink:0 !important;"
  );
  var knob = document.createElement("div");
  knob.id = "ytai-knob";
  knob.setAttribute("style",
    "width:18px !important;height:18px !important;border-radius:50% !important;" +
    "background:white !important;position:absolute !important;" +
    "top:3px !important;left:" + (tracking ? "23px" : "3px") + " !important;" +
    "transition:left 0.3s !important;"
  );
  toggleBtn.appendChild(knob);
  toggleRow.appendChild(trackingLabel);
  toggleRow.appendChild(toggleBtn);
  panel.appendChild(toggleRow);

  // Panel toast (same element)
  panel.appendChild(toast);

  badge.appendChild(panel);
  document.documentElement.appendChild(badge);

  // ── Double-click to expand/collapse ──────────────────────
  function toggleExpand() {
    expanded = !expanded;
    panel.style.display = expanded ? "flex" : "none";
    circle.style.cursor = expanded ? "default" : "grab";
  }

  circle.addEventListener("dblclick", toggleExpand);
  closeBtn.addEventListener("click", function(e) {
    e.stopPropagation();
    toggleExpand();
  });

  // ── Toggle tracking ───────────────────────────────────────
  toggleBtn.addEventListener("click", function() {
    tracking = !tracking;
    toggleBtn.style.background = tracking ? "#22c55e" : "#475569";
    knob.style.left = tracking ? "23px" : "3px";
    trackingLabel.textContent = tracking ? "Tracking ON" : "Tracking OFF";
    dot.style.background = tracking ? "#22c55e" : "#64748b";
    circle.style.borderColor = tracking ? "#22c55e" : "#64748b";
    setUserOverride(meta.videoId, tracking);

    if (tracking) {
      saveVideoMetadata(meta, true, confidence);
      startWatchTimeTracker(meta);
      // Sync will happen automatically after 20s of watch time
    } else {
      stopWatchTimeTracker();
    }
  });

  // ── Draggable ─────────────────────────────────────────────
  var isDragging = false;
  var dragStartX, dragStartY, badgeStartX, badgeStartY;

  circle.addEventListener("mousedown", function(e) {
    if (expanded) return; // Don't drag when expanded
    isDragging = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;
    var rect = badge.getBoundingClientRect();
    badgeStartX = rect.right;   // distance from right
    badgeStartY = rect.top;
    circle.style.cursor = "grabbing";
    e.preventDefault();
  });

  document.addEventListener("mousemove", function(e) {
    if (!isDragging) return;
    var dx = e.clientX - dragStartX;
    var dy = e.clientY - dragStartY;
    var newTop  = Math.max(10, Math.min(window.innerHeight - 60, badgeStartY + dy));
    var newRight = Math.max(10, Math.min(window.innerWidth - 60, badgeStartX - e.clientX));
    badge.style.top   = newTop + "px";
    badge.style.right = newRight + "px";
  });

  document.addEventListener("mouseup", function() {
    if (isDragging) {
      isDragging = false;
      circle.style.cursor = expanded ? "default" : "grab";
    }
  });
}

// ── Cleanup Storage ─────────────────────────────────────────
function cleanupOldVideos() {
  chrome.storage.local.get(["ytai_videos"], function(result) {
    var videos = result.ytai_videos || {};
    var changed = false;
    var now = new Date().getTime();
    var SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds

    for (var vid in videos) {
      var dateStr = videos[vid].lastWatched || videos[vid].firstSeen;
      if (!dateStr) continue;
      
      var lastWatched = new Date(dateStr).getTime();
      if (now - lastWatched > SEVEN_DAYS_MS) {
        delete videos[vid];
        
        // Also clean up tracking progress keys and override flags to be perfectly clean
        chrome.storage.local.remove(["sent_" + vid, "last_pct_" + vid, "override_" + vid]);
        changed = true;
      }
    }

    if (changed) {
      chrome.storage.local.set({ ytai_videos: videos });
      console.log("[YT-AI] Cleared old videos from extension storage to save space.");
    }
  });
}

// ── Main ───────────────────────────────────────────────────
function run() {
  stopWatchTimeTracker();
  cleanupOldVideos();

  setTimeout(function() {
    var meta = getMeta();
    if (!meta.videoId) { console.warn("[YT-AI] No video ID"); return; }

    getUserOverride(meta.videoId, function(override) {
      var isEdu, confidence;

      if (override !== null) {
        isEdu      = override;
        confidence = 1.0;
      } else {
        var chMatch = checkChannel(meta.channel);
        var kws     = checkKeywords(meta.title);
        isEdu       = chMatch || kws.length > 0;
        confidence  = 0;
        if (chMatch)    confidence += 0.5;
        if (kws.length) confidence += Math.min(kws.length / 3, 1) * 0.5;
        confidence  = Math.min(confidence, 1.0);
      }

      console.log("[YT-AI] Educational:", isEdu, "| Confidence:", Math.round(confidence * 100) + "%");
      showBadge(isEdu, confidence, meta);

      if (isEdu) {
        saveVideoMetadata(meta, isEdu, confidence);
        startWatchTimeTracker(meta);
        // Sync will happen automatically after 20s of watch time via the tracker
      }
    });
  }, 2500);
}

// SPA navigation support
var lastUrl = location.href;
new MutationObserver(function() {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    if (location.pathname === "/watch") setTimeout(run, 1000);
  }
}).observe(document.body, { subtree: true, childList: true });

run();