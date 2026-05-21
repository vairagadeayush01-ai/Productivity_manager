# 🔧 BACKEND & FRONTEND TESTING GUIDE

## Prerequisites - Start Services

### 1️⃣ Start Backend
```bash
cd D:\Summer_Projects\Productivity_manager\practice_programs\backend
python -m uvicorn Main:app --reload
```

**Expected output:**
```
Uvicorn running on http://127.0.0.1:8000
Application startup complete
```

✅ Backend is ready at: `http://127.0.0.1:8000`

---

### 2️⃣ Start Frontend
```bash
cd D:\Summer_Projects\Productivity_manager\practice_programs\frontend
npm run dev
```

**Expected output:**
```
  VITE v... ready in XXX ms

  ➜  Local:   http://localhost:5173/
```

✅ Frontend is ready at: `http://localhost:5173`

---

### 3️⃣ Check Extension is Loaded
- Open Chrome
- Go to `chrome://extensions`
- Find "YTAI" or "Productivity Manager"
- Toggle **Developer mode ON**
- Click **Reload** button

✅ Extension is ready

---

## 🧪 BACKEND TESTING

### Test 1: API Health Check

**Go to:** `http://127.0.0.1:8000/docs`

**What to see:**
- [ ] Swagger UI page loads
- [ ] All endpoints listed
- [ ] Green "Try it out" buttons visible

**Endpoints you should see:**
- `/fetch/all-today` (NEW - auto-fetch)
- `/search/history` (FIXED - history)
- `/search/stats` (ENHANCED - has all_topics)
- `/quiz/today` (ENHANCED - has difficulty)

---

### Test 2: History Fix - /search/history

**Using Swagger UI:**

1. Find `/search/history` endpoint
2. Click "Try it out"
3. Set: `skip=0`, `limit=10`
4. Click "Execute"

**Expected Response (200):**
```json
{
  "total": 25,
  "entries": [
    {
      "id": 1,
      "source_type": "youtube",
      "title": "Some Video Title",
      "summary": "Summary text...",
      "topics": ["python", "coding"],
      "created_at": "2026-05-21T10:30:00"
    },
    ...
  ]
}
```

**Checklist:**
- [ ] Response is 200 (success)
- [ ] "total" shows number of entries
- [ ] "entries" array has items
- [ ] Each entry has "topics" (not NULL)
- [ ] No errors about NoneType

---

### Test 3: Stats with All Topics - /search/stats

**Using Swagger UI:**

1. Find `/search/stats` endpoint
2. Click "Try it out"
3. Click "Execute"

**Expected Response (200):**
```json
{
  "total_entries": 25,
  "youtube": 12,
  "leetcode": 5,
  "github": 3,
  "manual": 5,
  "vectors_stored": 24,
  "all_topics": [
    "python",
    "data structures",
    "algorithms",
    "web development",
    ...
  ]
}
```

**Checklist:**
- [ ] Response is 200
- [ ] "all_topics" array exists
- [ ] "all_topics" has items (if you have data)
- [ ] Topics are unique (no duplicates)
- [ ] Topics are sorted alphabetically

---

### Test 4: Auto-Fetch Endpoint - /fetch/all-today

**Using Swagger UI:**

1. Find `/fetch/all-today` endpoint (POST)
2. Click "Try it out"
3. Click "Execute"

**Expected Response (200):**
```json
{
  "github": {
    "status": "success",
    "message": "Saved 3 commits",
    "entry": {...}
  },
  "leetcode": {
    "status": "no_data",
    "message": "No LeetCode problems solved today",
    "entry": null
  },
  "timestamp": "2026-05-21"
}
```

**Checklist:**
- [ ] Response is 200
- [ ] Has "github" key
- [ ] Has "leetcode" key
- [ ] Has "timestamp" key
- [ ] Status is one of: "success", "no_data", "error"

**Note:** If you haven't set up GitHub/LeetCode credentials, you'll get errors - that's OK for now.

---

### Test 5: Quiz with Difficulty - /quiz/today

**Using Swagger UI:**

1. Find `/quiz/today` endpoint (GET)
2. Click "Try it out"
3. Click "Execute"

**Expected Response (200):**
```json
{
  "date": "2026-05-21",
  "questions": [
    {
      "question": "What is...?",
      "options": ["A", "B", "C", "D"],
      "answer": "A",
      "explanation": "...",
      "topic": "python",
      "difficulty": "medium"
    },
    ...
  ],
  "total": 25,
  "difficulty": "medium"
}
```

**Checklist:**
- [ ] Response is 200
- [ ] "total" is 20+ (not just 7)
- [ ] "difficulty" is one of: "easy", "medium", "hard"
- [ ] Each question has "difficulty" field
- [ ] Questions count matches "total"

**If you get 404:**
- You haven't learned anything today yet
- Add some manual entries first, then retry

---

## 🎨 FRONTEND TESTING

### Test 1: Dashboard Auto-Fetch

**Go to:** `http://localhost:5173/`

**Look for:**
1. [ ] Page loads
2. [ ] See message: "Auto-fetching today's data from all sources..."
3. [ ] Message disappears after 2-3 seconds
4. [ ] Success message: "Successfully fetched GitHub, LeetCode, and extension data!"

**Check the cards:**
- [ ] "Learned Today" shows a number
- [ ] "Current Streak" shows "Active"
- [ ] "Spaced Repetition" shows due topics
- [ ] Stats cards show: Total Entries, Videos, LeetCode, Manual Notes

**Checklist:**
- [ ] Dashboard loads without errors
- [ ] Auto-fetch message appears
- [ ] Data displays correctly
- [ ] No console errors (F12 → Console)

---

### Test 2: History Page

**Go to:** `http://localhost:5173/#/history`

**Look for:**
- [ ] "All-Time History" heading visible
- [ ] History entries load
- [ ] Each entry shows:
  - Source type (youtube, github, leetcode, etc)
  - Title
  - Summary
  - Topics (as tags)
  - Date

**Test Pagination:**
- [ ] "Previous" button disabled on page 1
- [ ] "Next" button enabled (if more pages)
- [ ] Click "Next" → goes to page 2
- [ ] Page number updates
- [ ] Different entries on each page

**Checklist:**
- [ ] Entries load and display
- [ ] Topics show without errors
- [ ] Pagination works
- [ ] No "NoneType" errors

---

### Test 3: Quiz Page

**Go to:** `http://localhost:5173/#/quiz`

**Look for:**
- [ ] "Ready to Review?" heading
- [ ] "Generate Today's Quiz" button visible
- [ ] "Back to Dashboard" button available

**Click "Generate Today's Quiz":**
- [ ] Loading message: "Generating your custom AI quiz..."
- [ ] Quiz loads (takes 3-5 seconds)
- [ ] Shows questions

**In Quiz:**
- [ ] Question counter: "Question 1 of 25" (or similar, 20+)
- [ ] Difficulty badge shows: Easy / Medium / Hard (in colored box)
- [ ] 4 answer options
- [ ] "Submit Answer" button

**Answer and Submit:**
- [ ] Click an answer (button highlights)
- [ ] Click "Submit Answer"
- [ ] Feedback shows (checkmark or X)
- [ ] Correct answer highlights (green)
- [ ] Wrong answer shows (red)

**Complete Quiz:**
- [ ] After last question, click "Next Question"
- [ ] Completion screen shows
- [ ] Shows: "Score: 18 / 25"
- [ ] Shows: "72% - Good!"
- [ ] "Back to Dashboard" button available

**Checklist:**
- [ ] Generate button works
- [ ] Quiz has 20+ questions
- [ ] Difficulty level displays
- [ ] Answers work
- [ ] Completion screen shows score
- [ ] No errors in console

---

### Test 4: Second Brain (Search)

**Go to:** `http://localhost:5173/#/search`

**Look for:**
- [ ] "Query your Second Brain" heading
- [ ] Search bar with placeholder
- [ ] Two tabs: "Search" and "Topics (X)"

**Click "Topics" tab:**
- [ ] See all your learned topics
- [ ] Each topic in a card
- [ ] "Search Related" button on each card

**Click a topic's "Search Related":**
- [ ] Switches back to "Search" tab
- [ ] Topic name auto-filled in search
- [ ] Results load automatically

**Search for something:**
1. Type: "python" (or any topic you learned)
2. Click "Search" or press Enter
3. See results with match percentage

**Results should show:**
- [ ] Match percentage (e.g., "85% match")
- [ ] Source type (youtube, github, etc)
- [ ] Title
- [ ] Relevant content
- [ ] Link to original if available

**Checklist:**
- [ ] Topics tab shows topics
- [ ] Search works
- [ ] Results display correctly
- [ ] Match percentages shown
- [ ] Topics are clickable

---

## ✅ PASSING CRITERIA

### Backend - All Must Pass ✅
- [ ] API responds (http://127.0.0.1:8000/docs)
- [ ] /search/history returns entries
- [ ] /search/stats includes all_topics
- [ ] /fetch/all-today works
- [ ] /quiz/today returns 20+ questions
- [ ] All questions have difficulty field

### Frontend - All Must Pass ✅
- [ ] Dashboard loads and auto-fetches
- [ ] History page shows entries with pagination
- [ ] Quiz generates 20+ questions
- [ ] Quiz shows difficulty badge
- [ ] Second Brain works with topics view
- [ ] No errors in browser console

### Extension - See EXTENSION_TESTING_STEPS.md ✅

---

## 🐛 Troubleshooting

### Backend not starting?
```bash
# Check if port 8000 is in use
netstat -ano | findstr :8000

# Or try different port
python -m uvicorn Main:app --reload --port 8001
```

### Frontend not loading?
```bash
# Clear cache
npm run build

# Try different port
npm run dev -- --port 5174
```

### Getting 404 on /quiz/today?
- Go to Dashboard
- Add a manual entry (click "+ Add Entry")
- Try quiz again

### Console showing errors?
1. Open DevTools (F12)
2. Go to Console tab
3. Screenshot the error
4. Share with me

---

## Report Results

**Please share:**
1. ✅ Which tests passed
2. ❌ Which tests failed (if any)
3. 🐛 Any error messages
4. 📸 Screenshots if issues found
5. 💭 Your observations

