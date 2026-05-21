# Quick Testing Guide

## 🧪 Testing Checklist

### 1. Extension - YouTube Videos

**Test Collapsible UI:**
1. Open any YouTube video
2. Look for 40px circle badge (top-right, above video)
3. Click circle to expand → see full details
4. Click close (X) or wait 4s → collapses back
5. Toggle tracking ON/OFF works ✅

**Test New Channels:**
1. Open videos from: CampusX, Coder Army, Chai aur Code, Engineering Funda, CodestoryWithMIK
2. Should show "Educational Video Detected" 🎓
3. Green badge = Tracking ON ✅

---

### 2. Backend - API Endpoints

**Test /fetch/all-today:**
```bash
curl -X POST http://127.0.0.1:8000/fetch/all-today
```
Expected: Returns GitHub, LeetCode, and status for each ✅

**Test /search/history:**
```bash
curl http://127.0.0.1:8000/search/history?skip=0&limit=20
```
Expected: Returns all past entries with topics ✅

**Test /search/stats:**
```bash
curl http://127.0.0.1:8000/search/stats
```
Expected: Includes `all_topics` array ✅

**Test /quiz/today:**
```bash
curl http://127.0.0.1:8000/quiz/today
```
Expected: Returns 20+ questions with difficulty level ✅

---

### 3. Frontend - Dashboard

**On Page Load:**
1. Open http://localhost:5173/ (Dashboard)
2. See message: "Auto-fetching today's data from all sources..."
3. Data loads from GitHub, LeetCode, Extension ✅
4. Green success message appears ✅
5. Dashboard shows today's stats ✅

**Manual Sync:**
1. Click "Sync All Now" button
2. See "Syncing all integrations..." message
3. Data updates ✅

---

### 4. Frontend - Quiz

**Generate Quiz:**
1. Go to `/quiz` page
2. Click "Generate Today's Quiz" button
3. Quiz starts with 20+ questions
4. See difficulty badge (Easy/Medium/Hard)
5. Answer questions → Get feedback
6. On completion → See score % and performance level ✅

**Topic Review:**
1. From Dashboard, click "Review" button on "Spaced Repetition"
2. Quiz loads for that specific topic
3. Questions focused on that topic ✅

---

### 5. Frontend - Second Brain

**Search Mode:**
1. Go to `/search` (Second Brain)
2. Type: "hash map" or "algorithms"
3. See results with match percentage
4. Results ranked by relevance ✅

**Topics Mode:**
1. Click "Topics" toggle
2. See all learned topics in grid
3. Click "Search Related" on any topic
4. Search switches to that topic ✅

---

## 📊 Expected Results

### History Page
- **Before:** ❌ Empty, stuck loading
- **After:** ✅ Shows all entries with pagination

### Extension Badge
- **Before:** ❌ Long strip, blocks video
- **After:** ✅ 40px circle, doesn't block anything

### Dashboard Load
- **Before:** ❌ Manual sync only
- **After:** ✅ Auto-fetches GitHub + LeetCode on load

### Quiz
- **Before:** ❌ 7 questions, no difficulty
- **After:** ✅ 20+ questions, difficulty levels, Generate button

### Second Brain
- **Before:** ❌ Just search
- **After:** ✅ Search + Topics network visualization

---

## 🐛 Troubleshooting

### History page still empty?
1. Check if database has entries
2. Verify backend is running (`http://127.0.0.1:8000/docs`)
3. Check browser console for errors

### Extension not showing?
1. Reload the extension
2. Hard refresh YouTube page
3. Check if GitHub token is set (for sync)

### Quiz not generating?
1. Verify entries exist in database
2. Check if GROQ_API_KEY is set
3. See backend logs for API errors

### Auto-fetch not working?
1. Check GITHUB_TOKEN and GITHUB_USERNAME env vars
2. Check LEETCODE_USERNAME env var
3. See backend logs for fetch errors

---

## 🚀 Deployment Checklist

- ✅ All backend routes updated
- ✅ All frontend pages updated
- ✅ Extension code updated
- ✅ No breaking changes
- ✅ Error handling in place
- ✅ Graceful fallbacks for failures

**Ready to deploy!** 🎉
