# 🎬 STEP-BY-STEP EXTENSION TESTING GUIDE

## Setup (Do This First)

### 1. Reload the Extension
```
Chrome Menu → Extensions → Manage Extensions
Find "YTAI" or "Productivity Manager"
Click reload icon (refresh button)
```

### 2. Clear YouTube Cache
```
Go to YouTube
Press: Ctrl + Shift + R (Hard refresh)
```

### 3. Open YouTube Video
```
Go to: https://youtube.com
Search for any video (try "Python tutorial")
Click to watch the video
```

---

## Basic Test - Verify Circle Shows

### ✅ TEST 1: Look for Circle Badge

**Location:** Top-right corner of the browser window  
**Size:** Should be 40px diameter (small circle)

**What to look for:**
- 🎓 Green circle = Educational video
- 📺 Gray circle = Regular video

**Screenshot checklist:**
- [ ] Circle is visible at top-right
- [ ] Circle is small (40px)
- [ ] Icon is clear (🎓 or 📺)
- [ ] Color is correct (green or gray)

**If you don't see it:**
```
1. Reload extension (see Setup above)
2. Hard refresh YouTube
3. Wait 3-5 seconds after page loads
4. Check if you're logged into YouTube
5. Check console for errors (F12)
```

---

## Interaction Test - Click Circle

### ✅ TEST 2: Expand the Circle

**Action:** Click on the small circle badge

**What should happen:**
```
Circle (40px)
    ↓ (click)
Full Badge Panel (320px)
```

**What to see:**
- [ ] Smooth animation (takes ~0.3 seconds)
- [ ] Badge grows larger
- [ ] Shows full video information:
  - Video title
  - Channel name
  - Video duration
  - Confidence score (%)
  - Educational status (Yes/No)

**Expected content:**
```
🎓 Educational Video Detected
   Confidence: 85%
   Channel: Some Channel Name
   Duration: 15:30
   
Toggle: [Tracking ON] ✓
```

---

## Toggle Test - Turn Tracking On/Off

### ✅ TEST 3: Click the Toggle Button

**First, expand the badge (see Test 2)**

**Action:** Click the green toggle button in expanded view

**What should happen:**
- [ ] Toggle changes from **Green** to **Gray** (or vice versa)
- [ ] Label changes: "Tracking ON" → "Tracking OFF"
- [ ] The knob (circle on toggle) moves left or right
- [ ] No page reload

**Repeat:** Click toggle again
- [ ] It switches back
- [ ] Should work smoothly both ways

**Try multiple times:**
- Click ON → Click OFF → Click ON
- Should toggle smoothly every time
- No errors in console

---

## Collapse Test - Close the Badge

### ✅ TEST 4: Three Ways to Close

**Method 1: Click X button**
- Find the small "X" in the top corner of expanded badge
- Click it
- Badge should collapse back to circle

**Method 2: Click the circle again**
- While expanded, click the circle icon
- Should collapse

**Method 3: Auto-collapse**
- Expand the badge
- Move your mouse away
- Wait 4 seconds
- Should automatically collapse to circle

**What to see:** [ ] All three methods work smoothly

---

## Channel Recognition Test - Educational Channels

### ✅ TEST 5: Try Different Channels

**Search for these channels on YouTube:**

1. **CampusX** (NEW channel we added)
   - Play a video
   - Should show: 🎓 Green circle (Educational)
   - Confidence: 80%+

2. **Coder Army** (NEW channel we added)
   - Play a video
   - Should show: 🎓 Green circle
   - Tracking: ON

3. **Take U Forward** (Already in list)
   - Play a video
   - Should show: 🎓 Green circle
   - Educational video detected

4. **Chai aur Code** (NEW channel we added)
   - Play a video
   - Should show: 🎓 Green circle

5. **CodestoryWithMIK** (NEW channel we added)
   - Play a video
   - Should show: 🎓 Green circle

6. **FreeCodeCamp** (Already in list)
   - Play a video
   - Should show: 🎓 Green circle
   - Best confidence score (usually 90%+)

**Checklist:**
- [ ] All channels recognized as educational
- [ ] All show green circle (🎓)
- [ ] All show "Educational Video Detected"
- [ ] Tracking enabled automatically

---

## UI/UX Test - Position & Appearance

### ✅ TEST 6: Badge Positioning

**Check the badge position:**
- [ ] Badge is in top-right corner
- [ ] Badge is NOT blocking the video
- [ ] Badge is NOT blocking video controls
- [ ] Badge is NOT blocking any buttons/text

**Visual check:**
- [ ] Circle looks clean and modern
- [ ] Text is readable in expanded view
- [ ] Colors are vibrant (green or gray)
- [ ] No overlap with page elements

**Try different video sizes:**
- [ ] Works with small video player
- [ ] Works with theater mode
- [ ] Works with fullscreen (badge should disappear in fullscreen)

---

## Performance Test

### ✅ TEST 7: Speed & Responsiveness

**Measure response time:**
1. Click to expand badge: ___ seconds (should be ~0.3s)
2. Click toggle: ___ seconds (should be instant)
3. Click to collapse: ___ seconds (should be ~0.3s)

**Check smoothness:**
- [ ] Animations are smooth (no stuttering)
- [ ] No lag when clicking
- [ ] Page doesn't freeze
- [ ] Video continues playing normally

---

## Data Tracking Test

### ✅ TEST 8: Verify Tracking is Working

**Expand the badge and look for:**
- [ ] "Tracking ON" or "Tracking OFF" label
- [ ] Toggle button responding
- [ ] Watch time might be updating

**In Chrome DevTools (F12):**
1. Open DevTools
2. Go to "Application" tab
3. Click "Local Storage"
4. Look for "ytai_videos"
5. You should see video data being stored

**Data should include:**
- [ ] videoId
- [ ] title
- [ ] channel
- [ ] watchTime (in seconds)
- [ ] completion (%)
- [ ] lastWatched (timestamp)

---

## Summary Checklist

### CRITICAL (Must Work):
- [x] Circle badge appears
- [x] Correct icon (🎓 or 📺)
- [x] Correct color (green or gray)
- [x] Expands on click
- [x] Shows video details
- [x] Collapses on click/X/timeout

### IMPORTANT (Should Work):
- [x] Toggle tracking ON/OFF
- [x] Educational channels recognized
- [x] New channels (5) recognized
- [x] Position doesn't block video

### NICE TO HAVE (Good to Verify):
- [x] Smooth animations
- [x] Auto-collapse after 4s
- [x] Data tracking in storage
- [x] Works with different video sizes

---

## Issues Found?

### If Badge Not Showing:
```
1. Open Chrome DevTools (F12)
2. Go to Console tab
3. Look for any red errors
4. Screenshot the error
5. Note the error message
```

### If Toggle Not Working:
```
1. Open DevTools Console
2. Type: console.log("Testing")
3. Click toggle
4. Look for any "Uncaught" errors
5. Note exact error message
```

### If Wrong Channel Recognized:
```
1. Open DevTools Console
2. Look for: "[YT-AI] Channel: X"
3. Verify it matches the actual channel
4. Check if channel name is in EDU_CHANNELS list
```

---

## Report Your Results

**Please share:**
1. ✅ Tests that passed (all of them ideally)
2. ❌ Any tests that failed
3. 🐛 Any bugs encountered
4. 📸 Screenshots if issues found
5. 📝 Any other observations

