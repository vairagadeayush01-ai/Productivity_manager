console.log("YTAI content script loaded");

var EDU_CHANNELS = [
  "freecodecamp.org","traversy media","the coding train","fireship",
  "kunal kushwaha","apna college","codewithharry","jenny's lectures cs it",
  "abdul bari","take u forward","striver","3blue1brown","khan academy",
  "mit opencourseware","nptel","veritasium","numberphile",
  "andrej karpathy","yannic kilcher","two minute papers","sentdex",
  "statquest with josh starmer","crashcourse","ted-ed","lesics",
  "campusx","coder army","chai aur code","engineering funda","codestorywithmik"
];

var EDU_KEYWORDS = [
  "lecture","tutorial","course","lesson","explained","explanation",
  "learn","crash course","beginners","full course","masterclass",
  "bootcamp","chapter","how to","introduction to","intro to",
  "deep dive","dsa","data structures","algorithms","coding",
  "programming","python","javascript","java","c++","react","sql",
  "database","operating system","computer networks","dbms","oops",
  "object oriented","system design","leetcode","interview prep",
  "placement","machine learning","deep learning","neural network",
  "artificial intelligence","nlp","computer vision","signal processing",
  "dsp","fourier","convolution","transformer","llm","mathematics",
  "calculus","linear algebra","statistics","probability","physics",
  "chemistry","biology","theorem","proof","gate","upsc","revision",
  "exam","mcq","practice","series","part 1","part 2","episode"
];

// ── Detection ──────────────────────────────────────────────
function checkChannel(name) {
  if (!name) return false;
  return EDU_CHANNELS.indexOf(name.toLowerCase().trim()) !== -1;
}

function checkKeywords(title) {
  var lower = (title || "").toLowerCase();
  return EDU_KEYWORDS.filter(function(k) { return lower.indexOf(k) !== -1; });
}

// ── Storage ────────────────────────────────────────────────
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

// ── SAVE VIDEO METADATA ────────────────────────────────────
function saveVideoMetadata(meta, isEdu, confidence) {
  // Get existing video list
  chrome.storage.local.get(["ytai_videos"], function(result) {
    var videos = result.ytai_videos || {};

    var isNew = !videos[meta.videoId];
    
    // Save/update this video's data
    videos[meta.videoId] = {
      videoId:      meta.videoId,
      title:        meta.title,
      channel:      meta.channel,
      duration:     meta.duration,
      thumbnail:    meta.thumbnail,
      isEducational: isEdu,
      confidence:   Math.round(confidence * 100),
      watchTime:    videos[meta.videoId] ? videos[meta.videoId].watchTime : 0,
      completion:   videos[meta.videoId] ? videos[meta.videoId].completion : 0,
      firstSeen:    videos[meta.videoId]
                    ? videos[meta.videoId].firstSeen
                    : new Date().toISOString(),
      lastWatched:  new Date().toISOString(),
      rewatchCount: videos[meta.videoId]
                    ? (videos[meta.videoId].rewatchCount || 0) + 1
                    : 1
    };

    videos[meta.videoId] = { ...videos[meta.videoId], ...meta };
      
    chrome.storage.local.set({ ytai_videos: videos }, function() {
      if (isEdu) {
         // Sync immediately on first open, and then every 30 seconds of watch time
         if (isNew || (videos[meta.videoId].watchTime % 30 === 0)) {
             syncWithBackend(meta.videoId);
         }
      }
    });
  });
}

// ── SYNC WITH BACKEND ──────────────────────────────────────
function syncWithBackend(videoId) {
  chrome.storage.local.get(["ytai_videos"], function(res) {
    var videos = res.ytai_videos || {};
    var videoData = videos[videoId];
    if (!videoData) return;
    
    console.log("[YT-AI] Syncing video to backend...", videoId);
    fetch("http://127.0.0.1:8000/ingest/youtube/sync", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(videoData)
    })
    .then(function(r) { return r.json(); })
    .then(function(data) { console.log("[YT-AI] Backend Sync Success:", data); })
    .catch(function(err) { console.error("[YT-AI] Backend Sync Error:", err); });
  });
}

// ── TRACK WATCH TIME ──────────────────────────────────────
var watchInterval = null;

function startWatchTimeTracker(meta) {
  // Clear any existing tracker
  if (watchInterval) clearInterval(watchInterval);

  var videoEl = document.querySelector("video");
  if (!videoEl) return;

  watchInterval = setInterval(function() {
    // Only count if video is actually playing
    if (videoEl.paused) return;

    var duration = videoEl.duration || 0;
    var currentTime = videoEl.currentTime || 0;
    var completion = duration > 0 ? Math.round((currentTime / duration) * 100) : 0;
    var watchSeconds = Math.round(currentTime);

    chrome.storage.local.get(["ytai_videos"], function(result) {
      var videos = result.ytai_videos || {};
      if (videos[meta.videoId]) {
        videos[meta.videoId].watchTime   = watchSeconds;
        videos[meta.videoId].completion  = completion;
        videos[meta.videoId].lastWatched = new Date().toISOString();
        chrome.storage.local.set({ ytai_videos: videos });
      }
    });
  }, 5000); // update every 5 seconds

  console.log("[YT-AI] Watch time tracker started");
}

function stopWatchTimeTracker() {
  if (watchInterval) {
    clearInterval(watchInterval);
    watchInterval = null;
    console.log("[YT-AI] Watch time tracker stopped");
  }
}

// ── GET METADATA ──────────────────────────────────────────
function getMeta() {
  var videoId   = new URLSearchParams(window.location.search).get("v");
  var titleEl   =
    document.querySelector("h1.ytd-watch-metadata yt-formatted-string") ||
    document.querySelector("h1 yt-formatted-string") ||
    document.querySelector("ytd-watch-metadata h1");
  var title     = titleEl
    ? titleEl.textContent.trim()
    : document.title.replace(" - YouTube","").trim();
  var chEl      =
    document.querySelector("ytd-channel-name yt-formatted-string a") ||
    document.querySelector("#channel-name a") ||
    document.querySelector("#owner #channel-name");
  var channel   = chEl ? chEl.textContent.trim() : "";
  var videoEl   = document.querySelector("video");
  var duration  = videoEl ? formatTime(videoEl.duration) : "0:00";
  var thumbnail = "https://img.youtube.com/vi/" + videoId + "/mqdefault.jpg";

  return { videoId, title, channel, duration, thumbnail };
}

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return "0:00";
  var h = Math.floor(seconds / 3600);
  var m = Math.floor((seconds % 3600) / 60);
  var s = Math.floor(seconds % 60);
  if (h > 0) return h + ":" + pad(m) + ":" + pad(s);
  return m + ":" + pad(s);
}

function pad(n) { return n < 10 ? "0" + n : n; }

// ── BADGE UI ──────────────────────────────────────────────
function showBadge(isEdu, confidence, meta) {
  var old = document.getElementById("ytai-badge");
  if (old) old.remove();

  var pct        = Math.round(confidence * 100);
  var scoreColor = confidence > 0.6 ? "#22c55e" : confidence > 0.3 ? "#f59e0b" : "#ef4444";
  var tracking   = isEdu;
  var isExpanded = false;

  var div = document.createElement("div");
  div.id  = "ytai-badge";
  div.setAttribute("style",
    "position:fixed !important;" +
    "top:80px !important;" +
    "right:20px !important;" +
    "z-index:99999 !important;" +
    "pointer-events:none !important;" +
    "font-family:Roboto,Arial,sans-serif !important;"
  );

  div.innerHTML =
    '<div id="ytai-circle-container" style="' +
      'position:relative !important;' +
      'width:40px !important;height:40px !important;' +
      'pointer-events:all !important;' +
      'cursor:pointer !important;' +
    '">' +
      '<div id="ytai-circle" style="' +
        'position:absolute !important;' +
        'width:40px !important;height:40px !important;' +
        'border-radius:50% !important;' +
        'background:' + (isEdu ? "rgba(34,197,94,0.9)" : "rgba(100,100,100,0.9)") + ' !important;' +
        'border:2px solid ' + (isEdu ? "rgba(34,197,94,1)" : "rgba(150,150,150,1)") + ' !important;' +
        'display:flex !important;' +
        'align-items:center !important;' +
        'justify-content:center !important;' +
        'font-size:20px !important;' +
        'backdrop-filter:blur(8px) !important;' +
        'box-shadow:0 4px 12px rgba(0,0,0,0.3) !important;' +
        'transition:all 0.3s ease !important;' +
        'z-index:1 !important;' +
      '">' +
        (isEdu ? "🎓" : "📺") +
      '</div>' +
      '<div id="ytai-expanded-badge" style="' +
        'position:absolute !important;' +
        'top:0 !important;right:0 !important;' +
        'display:none !important;' +
        'flex-direction:column !important;' +
        'gap:12px !important;' +
        'padding:15px !important;' +
        'border-radius:16px !important;' +
        'border:1.5px solid ' + (isEdu ? "rgba(34,197,94,0.6)" : "rgba(150,150,150,0.4)") + ' !important;' +
        'background:' + (isEdu ? "rgba(20,20,20,0.95)" : "rgba(30,30,30,0.95)") + ' !important;' +
        'backdrop-filter:blur(12px) !important;' +
        'width:320px !important;' +
        'box-shadow:0 8px 32px rgba(0,0,0,0.5) !important;' +
        'z-index:2 !important;' +
        'animation:slideIn 0.3s ease !important;' +
      '">' +
        '<div style="display:flex !important;align-items:center !important;justify-content:space-between !important;">' +
          '<div style="display:flex !important;align-items:center !important;gap:10px !important;">' +
            '<span style="font-size:24px !important;">' + (isEdu ? "🎓" : "📺") + '</span>' +
            '<div>' +
              '<div style="font-size:12px !important;font-weight:600 !important;color:#ffffff !important;">' +
                (isEdu ? "Educational" : "Not Educational") +
              '</div>' +
              '<div style="font-size:10px !important;color:#aaaaaa !important;">' +
                'Confidence: <b style="color:' + scoreColor + ' !important;">' + pct + '%</b>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<button id="ytai-close-btn" style="' +
            'background:none !important;border:none !important;color:#aaaaaa !important;' +
            'font-size:18px !important;cursor:pointer !important;padding:0 !important;' +
            'transition:color 0.2s !important;' +
          '">✕</button>' +
        '</div>' +
        '<div style="border-top:1px solid rgba(255,255,255,0.1) !important;padding-top:8px !important;">' +
          '<div style="font-size:11px !important;color:#aaaaaa !important;line-height:1.4 !important;">' +
            '<div><b style="color:#ffffff !important;">Channel:</b> ' + (meta.channel || "Unknown") + '</div>' +
            '<div><b style="color:#ffffff !important;">Duration:</b> ' + meta.duration + '</div>' +
            '<div style="margin-top:6px !important;"><b style="color:#ffffff !important;">Title:</b></div>' +
            '<div style="color:#cccccc !important;font-size:10px !important;margin-top:2px !important;">' + 
              meta.title.substring(0, 50) + (meta.title.length > 50 ? "..." : "") + 
            '</div>' +
          '</div>' +
        '</div>' +
        '<div style="display:flex !important;align-items:center !important;justify-content:space-between !important;border-top:1px solid rgba(255,255,255,0.1) !important;padding-top:10px !important;">' +
          '<span id="ytai-lbl" style="font-size:11px !important;color:#aaaaaa !important;font-weight:500 !important;">' +
            (isEdu ? "Tracking ON" : "Tracking OFF") +
          '</span>' +
          '<div id="ytai-toggle" style="' +
            'width:44px !important;height:22px !important;' +
            'border-radius:11px !important;' +
            'background:' + (isEdu ? "#22c55e" : "#555") + ' !important;' +
            'cursor:pointer !important;position:relative !important;' +
            'transition:background 0.3s !important;flex-shrink:0 !important;' +
          '">' +
            '<div id="ytai-knob" style="' +
              'width:16px !important;height:16px !important;' +
              'border-radius:50% !important;background:white !important;' +
              'position:absolute !important;top:3px !important;' +
              'left:' + (isEdu ? "25px" : "3px") + ' !important;' +
              'transition:left 0.3s !important;' +
            '"></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<style>' +
      '@keyframes slideIn {' +
        'from { opacity:0; transform:translateY(-10px) !important; }' +
        'to { opacity:1; transform:translateY(0) !important; }' +
      '}' +
      '#ytai-close-btn:hover { color:#ffffff !important; }' +
      '#ytai-circle:hover { transform:scale(1.1) !important; }' +
    '</style>';

  document.documentElement.appendChild(div);
  console.log("[YT-AI] Collapsible badge injected");

  var circle = document.getElementById("ytai-circle");
  var expanded = document.getElementById("ytai-expanded-badge");
  var container = document.getElementById("ytai-circle-container");
  var closeBtn = document.getElementById("ytai-close-btn");
  var toggle = document.getElementById("ytai-toggle");
  var knob = document.getElementById("ytai-knob");
  var lbl = document.getElementById("ytai-lbl");

  function toggleExpanded() {
    isExpanded = !isExpanded;
    if (isExpanded) {
      expanded.style.display = "flex";
      circle.style.opacity = "0.3";
    } else {
      expanded.style.display = "none";
      circle.style.opacity = "1";
    }
  }

  if (circle) {
    circle.addEventListener("click", toggleExpanded);
  }

  if (closeBtn) {
    closeBtn.addEventListener("click", function(e) {
      e.stopPropagation();
      toggleExpanded();
    });
  }

  if (toggle) {
    toggle.addEventListener("click", function(e) {
      e.stopPropagation();
      tracking = !tracking;
      toggle.style.background = tracking ? "#22c55e" : "#555";
      knob.style.left = tracking ? "25px" : "3px";
      lbl.textContent = tracking ? "Tracking ON" : "Tracking OFF";
      setUserOverride(meta.videoId, tracking);

      if (tracking) {
        saveVideoMetadata(meta, true, confidence);
        startWatchTimeTracker(meta);
      } else {
        stopWatchTimeTracker();
      }

      console.log("[YT-AI] Tracking toggled:", tracking);
    });
  }

  // Auto-collapse after 5 seconds if expanded
  container.addEventListener("mouseenter", function() {
    if (!isExpanded) {
      circle.style.opacity = "1";
    }
  });

  container.addEventListener("mouseleave", function() {
    setTimeout(function() {
      if (isExpanded) {
        toggleExpanded();
      }
    }, 4000);
  });
}

// ── MAIN ──────────────────────────────────────────────────
function run() {
  stopWatchTimeTracker();

  setTimeout(function() {
    var meta = getMeta();
    if (!meta.videoId) {
      console.warn("[YT-AI] No video ID found");
      return;
    }
    console.log("[YT-AI] Video:", meta.title, "| Channel:", meta.channel);

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
        if (chMatch)      confidence += 0.5;
        if (kws.length)   confidence += Math.min(kws.length / 3, 1) * 0.5;
        confidence  = Math.min(confidence, 1.0);
        console.log("[YT-AI] Channel:", chMatch, "| Keywords:", kws.slice(0,5));
      }

      console.log("[YT-AI] Educational:", isEdu, "| Confidence:", Math.round(confidence*100)+"%");
      showBadge(isEdu, confidence, meta);

      // Save metadata + start tracker if educational
      if (isEdu) {
        saveVideoMetadata(meta, isEdu, confidence);
        startWatchTimeTracker(meta);
      }
    });
  }, 2500);
}

// SPA navigation
var lastUrl = location.href;
new MutationObserver(function() {
  if (location.href !== lastUrl) {
    lastUrl = location.href;
    if (location.pathname === "/watch") setTimeout(run, 1000);
  }
}).observe(document.body, { subtree: true, childList: true });

run();