# 🧪 TESTING SESSION - Extension UI

## Test Date: 2026-05-21 13:41 IST

---

## 📋 Extension UI Test Plan

### Prerequisites:
- ✅ Chrome browser open
- ✅ Extension loaded as unpacked
- ✅ YouTube access available

### Test 1: Verify Circle Badge Shows (Collapsed State)

**Steps:**
1. Open any YouTube video (any channel first)
2. Look at **top-right corner** of the page
3. You should see a **40px circle** with an icon (📺 or 🎓)

**Expected Result:**
- 📺 Gray circle for non-educational videos
- 🎓 Green circle for educational videos

**Pass:** ☐ Circle appears correctly  
**Pass:** ☐ Correct icon shows (📺 or 🎓)  
**Pass:** ☐ Correct color (gray or green)

---

### Test 2: Click Circle to Expand (Expand Action)

**Steps:**
1. Click the **circle badge** at top-right
2. It should expand to show full details

**Expected Result:**
- Full badge appears with details
- Shows: Channel name, Duration, Title, Confidence %
- Tracking ON/OFF toggle visible
- Smooth animation (0.3s slide-in)

**Pass:** ☐ Badge expands on click  
**Pass:** ☐ All details visible  
**Pass:** ☐ Smooth animation  
**Pass:** ☐ Toggle button visible

---

### Test 3: Toggle Tracking ON/OFF

**Steps:**
1. (Make sure badge is expanded)
2. Click the **ON/OFF toggle** (green switch)
3. Should change color and position

**Expected Result:**
- Toggle switches from green to gray (or vice versa)
- Label changes from "Tracking ON" to "Tracking OFF"
- Watch time tracking stops/starts accordingly

**Pass:** ☐ Toggle changes color  
**Pass:** ☐ Label updates  
**Pass:** ☐ Tracking status changes

---

### Test 4: Close Badge (Collapse Action)

**Steps:**
1. Click the **X button** (close button) on expanded badge
2. Or click the circle again to toggle
3. Or wait 4 seconds without moving mouse

**Expected Result:**
- Badge collapses back to 40px circle
- Smooth animation back to circle
- Can still see icon

**Pass:** ☐ Badge collapses  
**Pass:** ☐ Shows as circle again  
**Pass:** ☐ Icon visible  
**Pass:** ☐ Smooth animation

---

### Test 5: Auto-Collapse Feature

**Steps:**
1. Expand the badge
2. Move mouse away from badge
3. Wait 4 seconds

**Expected Result:**
- Badge automatically collapses after 4s
- Smooth fade and shrink animation

**Pass:** ☐ Auto-collapses after 4s  
**Pass:** ☐ Smooth animation

---

### Test 6: Test with Educational Channel

**Steps:**
1. Open video from: **CampusX**, **Coder Army**, or **Chai aur Code**
2. Look at badge

**Expected Result:**
- Should show 🎓 (green)
- Say "Educational Video Detected"
- Tracking automatically ON

**Pass:** ☐ Shows educational (🎓)  
**Pass:** ☐ Green color  
**Pass:** ☐ Tracking ON by default

---

### Test 7: Test with New Channels

**Steps:**
1. Try videos from these NEW channels:
   - CampusX
   - Coder Army
   - Chai aur Code
   - Engineering Funda
   - CodestoryWithMIK

2. Each should show as 🎓 (educational)

**Pass:** ☐ CampusX recognized  
**Pass:** ☐ Coder Army recognized  
**Pass:** ☐ Chai aur Code recognized  
**Pass:** ☐ Engineering Funda recognized  
**Pass:** ☐ CodestoryWithMIK recognized

---

### Test 8: Position & Layout

**Steps:**
1. Open video
2. Look at badge position
3. Make sure it doesn't cover video player

**Expected Result:**
- Badge at top-right
- Above video player (not on it)
- Doesn't block any important controls
- Non-intrusive

**Pass:** ☐ Position correct (top-right)  
**Pass:** ☐ Doesn't block video  
**Pass:** ☐ Doesn't block controls

---

## ✅ Testing Results

### Overall: ☐ PASS / ☐ FAIL

### Summary:
- Tests Passed: ___ / 30+
- Critical Issues: ___
- Minor Issues: ___

### Notes:
```
[Add your observations here]
```

---

## 🐛 If Tests Fail

### Circle not showing?
- Reload the extension
- Hard refresh YouTube (Ctrl+Shift+R)
- Check Chrome DevTools console for errors
- Check if YTAI_VIDEOS in Chrome storage

### Icon wrong?
- Check console for "Educational: true/false"
- Verify channel name is lowercase
- Check if EDU_CHANNELS array has your channel

### Toggle not working?
- Check console for click events
- Verify chrome.storage API working
- Check if tracking variable updates

### Position wrong?
- Check CSS in showBadge() function
- Verify position: fixed is not being overridden
- Check z-index conflicts

---

## Next Steps After Testing:

1. Document any issues found
2. Test the other 4 features
3. Deploy to production

