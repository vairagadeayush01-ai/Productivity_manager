# 🧠 Productivity Manager — AI-Powered Learning Tracker

Transform how you capture, organize, and retain what you learn. Productivity Manager is a full-stack AI learning application that integrates semantic search, spaced repetition, intelligent content synthesis, and a personalized chat interface to build your knowledge system automatically — just by doing what you already do.

<div align="center">

**[✨ Features](#-features)** • **[🛠️ Tech Stack](#️-tech-stack)** • **[🚀 Quick Start](#-quick-start)** • **[📡 API Docs](#-api-endpoints)** • **[🤝 Contributing](#-contributing)**

</div>

---

## ✨ Features

### 📚 Multi-Source Content Ingestion
Capture learning from anywhere — automatically:
- **YouTube Videos** — Browser extension captures watch sessions, extracts transcripts, and auto-summarizes with AI
- **LeetCode Problems** — Sync accepted solutions with difficulty tags and categorization
- **GitHub Activity** — Daily commit and semantic diff intelligence with change-type classification
- **Manual Notes** — Quick text capture with AI-powered topic extraction
- **Web Articles** — Extract and summarize webpage content

Each source automatically generates AI-powered summaries and extracts key topics using **Groq API (Llama 3.3-70B)**.

---

### 🎯 Spaced Repetition Quiz Engine
Evidence-based recall practice using the Ebbinghaus forgetting curve:
- **Two generation modes** — Recent activity quiz OR Smart topic-based deep dive
- **Configurable difficulty** — Easy / Medium / Hard selectors
- **Configurable length** — 5 / 10 / 15 / 20 questions per session
- **Post-quiz review** — Full answer review with color-coded options and AI explanations
- **Smart interval scheduling** — 1, 2, 4, 8, 16, 30 day review cycles
- Performance tracking and spaced repetition interval updates

---

### 🔍 Semantic Knowledge Search
Search across your entire learning history using vector embeddings:
- Natural language queries ("machine learning algorithms I studied")
- Source-type filtering (GitHub, LeetCode, YouTube, Notes, Articles)
- Relevance scoring with distance-based ranking
- Multi-user isolated search spaces via ChromaDB

---

### 💬 AI Chat — Two Distinct Modes
**Chat with Data:** RAG-powered retrieval from your personal knowledge base. Ask questions and get answers grounded in what YOU have actually learned, with inline source citations (ChatGPT-style formatted markdown responses — headers, code blocks, bullet lists).

**AI Tutor:** A session-based conversational tutor that distills key insights from your sessions into persistent memory for long-term learning.

---

### 📊 Analytics Dashboard
Real-time insights into your productivity:
- Daily Stats — entries logged, current streak, topics due for review
- Weekly Reports — learning summarized across all sources
- Visual habit tracking, source distribution, topic mastery

---

### 🌙 Dark / Light Theme
- **Light mode** — Warm off-white (BrightPath-inspired), comfortable on eyes, editorial feel
- **Dark mode** — Deep charcoal (NotebookLM-inspired), professional and easy on the eyes
- Persists across sessions, toggle available in the navbar

---

### 🔌 Browser Extension (Chrome/Chromium)
Captures YouTube learning sessions in real-time:
- Tracks watch duration with deduplication to prevent double-syncing
- Race condition protection and validation thresholds (min 20s watch time)
- Sends session data to backend even after navigating away (MV3 background worker)

---

## 🛠️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Frontend** | React 18, Vite, Vanilla CSS (design token system), react-markdown |
| **Backend** | FastAPI (Python), SQLAlchemy, Alembic migrations |
| **AI / LLM** | Groq API (Llama 3.3-70B), circuit breaker + retry patterns |
| **Vector Store** | ChromaDB with sentence-transformer embeddings |
| **Database** | SQLite (dev) — easily swappable to PostgreSQL |
| **Scheduler** | APScheduler — daily GitHub/LeetCode sync, batch summarization |
| **Auth** | JWT (python-jose), bcrypt password hashing |
| **Extension** | Chrome Extension Manifest V3 |

---

## 🚀 Quick Start

### Prerequisites
- Python 3.10+
- Node.js 18+
- A [Groq API key](https://console.groq.com/) (free tier available)

### 1. Clone the repository

```bash
git clone https://github.com/vairagadeayush01-ai/Productivity_manager.git
cd Productivity_manager/practice_programs
```

### 2. Backend Setup

```bash
cd backend

# Copy the environment template and fill in your keys
cp .env.example .env
# Edit .env — add your GROQ_API_KEY and a random APP_SECRET

# Install dependencies (use a virtual environment)
python -m venv .venv
.venv\Scripts\activate        # Windows
# source .venv/bin/activate   # Linux/Mac

pip install -r requirements.txt

# Run database migrations
python -m alembic upgrade head

# Start the backend
python -m uvicorn Main:app --reload --port 8000
```

### 3. Frontend Setup

```bash
cd frontend

# Copy the environment template
cp .env.example .env.local
# Edit .env.local — set VITE_API_URL=http://127.0.0.1:8000

npm install
npm run dev
# → http://localhost:5173
```

### 4. Browser Extension (optional)
1. Open `chrome://extensions` in Chrome
2. Enable **Developer mode** (top-right toggle)
3. Click **Load unpacked** → select the `youtube-ai-extension/` folder
4. Log in via the extension popup to link your account

---

## 🔐 Environment Variables

**Backend** (`practice_programs/backend/.env`):

| Variable | Description | Required |
|----------|-------------|----------|
| `GROQ_API_KEY` | Groq LLM API key | ✅ |
| `APP_SECRET` | JWT signing secret (random string, 32+ chars) | ✅ |
| `ENCRYPTION_KEY` | 32-byte hex key for encrypting stored GitHub PATs | optional |
| `GITHUB_TOKEN` | GitHub PAT for auto-fetching your own activity | optional |
| `LEETCODE_USERNAME` | Your LeetCode username for auto-sync | optional |

> ⚠️ **Never commit your `.env` file.** Use `.env.example` as a template (contains only placeholder values).

**Frontend** (`practice_programs/frontend/.env.local`):

| Variable | Description |
|----------|-------------|
| `VITE_API_URL` | Backend base URL (default: `http://127.0.0.1:8000`) |

---

## 📡 API Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/register` | Create account |
| `POST` | `/auth/login` | Get JWT token |

### Content Ingestion
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/ingest/youtube` | Add YouTube video |
| `POST` | `/ingest/note` | Add manual note |
| `POST` | `/ingest/article` | Add web article |
| `POST` | `/ingest/leetcode` | Add LeetCode problem |

### Learning History
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/history/` | Paginated entry list with filters |
| `DELETE` | `/history/{id}` | Delete an entry |
| `GET` | `/diary/list` | List diary dates |
| `GET` | `/diary/{date}` | Get day's diary entry |

### Quiz
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/quiz/generate` | Generate quiz (recent/smart mode) |
| `POST` | `/quiz/submit` | Submit answer + get spaced repetition update |
| `GET` | `/quiz/performance` | Retrieve performance stats |

### Chat / Tutor
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/chat/stream` | RAG-powered chat (SSE stream) |
| `POST` | `/tutor/start` | Start a tutor session |
| `POST` | `/tutor/chat` | Send message in tutor session |

### Profile
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/profile/` | Get user profile |
| `PATCH` | `/profile/` | Update display name / username |
| `PUT` | `/profile/github` | Connect GitHub (validates PAT) |
| `DELETE` | `/profile/github` | Disconnect GitHub |
| `PUT` | `/profile/leetcode` | Connect LeetCode (validates username) |

---

## 🏗️ Project Structure

```
practice_programs/
├── backend/
│   ├── Main.py                 # FastAPI app, CORS, router registration
│   ├── database.py             # SQLAlchemy models (User, Entry, QuizSession…)
│   ├── requirements.txt
│   ├── .env.example            # Safe template — copy to .env
│   ├── alembic/                # Database migrations
│   ├── core/
│   │   ├── security.py         # JWT + bcrypt
│   │   └── encryption.py       # AES-256-GCM for stored credentials
│   ├── routes/                 # FastAPI routers (auth, ingest, quiz, chat…)
│   └── services/
│       ├── summarizer.py       # Groq LLM integration with circuit breaker
│       ├── sync_queue.py       # Deduplication + validation for extension sync
│       ├── scheduler.py        # APScheduler daily jobs
│       ├── diff_parser.py      # Semantic git diff analysis
│       └── ...
├── frontend/
│   ├── src/
│   │   ├── App.jsx             # Routes + ThemeProvider
│   │   ├── index.css           # Design token system (light + dark themes)
│   │   ├── context/
│   │   │   ├── AuthContext.jsx
│   │   │   └── ThemeContext.jsx  # Dark/light theme toggle
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Quiz.jsx        # Spaced repetition quiz + review mode
│   │   │   ├── Chat.jsx        # RAG chat + AI tutor (react-markdown)
│   │   │   ├── History.jsx     # Entry history + diary browser
│   │   │   ├── Profile.jsx     # Connected accounts + sign out
│   │   │   └── ...
│   │   └── components/
│   │       ├── Navbar.jsx      # Theme toggle + nav
│   │       └── ...
│   └── package.json
└── youtube-ai-extension/       # Chrome MV3 extension
    ├── manifest.json
    ├── content.js              # YouTube watch tracking
    └── background.js           # Service worker + sync
```

---

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Make your changes, following the existing code style
4. Ensure no secrets or database files are included: `git status` before committing
5. Submit a pull request

---

## 📜 License

MIT License — see [LICENSE](LICENSE) for details.

---

<div align="center">
Built with ❤️ using FastAPI, React, Groq, and ChromaDB
</div>
