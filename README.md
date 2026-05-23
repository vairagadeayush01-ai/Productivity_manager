# 🧠 Productivity Manager — AI-Powered Learning Tracker

Transform how you capture, organize, and retain what you learn. Productivity Manager is a full-stack AI learning application that integrates semantic search, spaced repetition, and intelligent content synthesis to build your personalized knowledge system.

<div align="center">

**[📊 Dashboard](#-dashboard-modules)** • **[🛠️ Tech Stack](#%EF%B8%8F-tech-stack)** • **[📡 API Docs](#-api-endpoints)** • **[🚀 Quick Start](#-quick-start)** • **[🤝 Contributing](#-contributing)**

</div>

---

## ✨ Features

### 📚 Multi-Source Content Ingestion
Capture learning from anywhere:
- **YouTube Videos** — Extract transcripts, auto-summarize with AI, track watch progress via browser extension
- **LeetCode Problems** — Sync solved problems with difficulty tags and categorization
- **GitHub Activity** — Auto-fetch daily commits and repository changes with context
- **Manual Notes** — Quick text capture with AI-powered topic extraction
- **Web Articles** — Extract and summarize webpage content

Each source automatically generates AI-powered summaries and extracts key topics using the **Groq API** (Llama 3.3-70B).

### 🔍 Semantic Knowledge Search
Search across your entire learning history using **ChromaDB vector embeddings**:
- Natural language queries ("machine learning algorithms")
- Source-type filtering (GitHub, LeetCode, YouTube, etc.)
- Relevance scoring with distance-based ranking
- User-isolated searches with multi-user support

### 🎯 Spaced Repetition Quiz Engine
Evidence-based recall practice using **Ebbinghaus forgetting curve**:
- Automatic daily quiz generation from today's learning entries
- Topic-specific deep dives for focused review
- Three difficulty levels (easy/medium/hard)
- Smart interval calculation (1, 2, 4, 8, 16, 30 days)
- Performance tracking (correct/incorrect attempts)

### 📊 Comprehensive Analytics Dashboard
Real-time insights into your productivity:
- **Daily Stats** — Entries logged today, current streak, topics due for review
- **Weekly Reports** — Summarized learning across all sources
- **Visual Charts** — Track habits, source distribution, topic mastery
- **Progress Tracking** — Difficulty progression, accuracy trends

### 📡 Third-Party Integrations
Stay in sync without manual effort:
- **GitHub API** — Daily activity fetching (commits, repos, contributors)
- **LeetCode GraphQL** — Submission tracking with problem metadata
- **YouTube Extension** — Real-time video tracking and metadata sync

### 🤖 AI-Powered Processing
Enterprise-grade AI backbone:
- **Groq LLM (Llama 3.3-70B)** — Content summarization, quiz generation, topic extraction
- **Circuit Breaker Pattern** — Graceful fallback during API outages
- **Retry Logic** — Exponential backoff with tenacity for reliability
- **Cost-Optimized** — Efficient token usage for production scale

### 📅 Scheduler & Notifications
Automated workflows:
- Daily quiz generation at configurable times
- GitHub/LeetCode auto-sync with smart batching
- Browser notifications for quiz readiness
- Cron-based job scheduling with APScheduler

---

## 🧠 System Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                        USER INTERACTIONS                             │
├──────────────────┬──────────────────┬──────────────────┬─────────────┤
│  React Frontend  │ YouTube Extension│  Manual Input    │ OAuth Integs │
└────────┬─────────┴────────┬─────────┴────────┬─────────┴──────┬──────┘
         │                  │                  │                │
         └──────────────────┴──────────────────┴────────────────┘
                            │
                    ┌───────▼────────┐
                    │  FastAPI REST  │
                    │  (Port 8000)   │
                    └────────┬───────┘
         ┌──────────────────┴──────────────────┬─────────────────┐
         │                                     │                 │
         ▼                                     ▼                 ▼
    ┌─────────────┐                   ┌───────────────┐   ┌──────────────┐
    │   SQLite    │                   │  ChromaDB     │   │  Groq API    │
    │  (SQLAlch)  │                   │  (Semantic)   │   │  (LLM)       │
    └─────────────┘                   └───────────────┘   └──────────────┘
         │
         └─────┬──────────────┬──────────────┬──────────┬─────────────┐
               │              │              │          │             │
            Users        Learning        Quiz       Streaks        Diaries
             Entries        Results       Tracking
```

### Request Lifecycle

1. **User Action** → React component dispatches API call
2. **Authentication** → JWT token validated via `core/deps.py`
3. **Rate Limiting** → SlowAPI limiter enforces per-endpoint quotas
4. **Business Logic** → Service layer processes request (summarization, search, etc.)
5. **Data Persistence** → SQLAlchemy ORM writes to SQLite
6. **Vector Indexing** → Entry auto-added to ChromaDB for semantic search
7. **Response** → Formatted JSON returned to frontend

### Data Flow for Content Ingestion

```
User Input
    │
    ▼
Transcript/Content Extraction
    │ (YouTube Transcript API, Web Scraping)
    ▼
Groq Summarization
    │ (Llama 3.3-70B with retry logic)
    ▼
Topic Extraction + Spaced Rep Recording
    ▼
SQLite Persistence + ChromaDB Indexing
    │
    ├─→ Dashboard (immediate visibility)
    └─→ Search Index (semantic queryable)
```

---

## 🛠️ Tech Stack

### Frontend

| Technology | Purpose | Why Chosen |
|-----------|---------|-----------|
| **React 18** | UI library | Modern, component-based, excellent ecosystem |
| **Vite** | Build tool | Lightning-fast dev server, optimized production bundles |
| **React Router v6** | Routing | Declarative navigation with protected routes |
| **Axios** | HTTP client | Interceptor support for JWT auth, error handling |
| **Lucide React** | Icons | 400+ beautiful, consistent SVG icons |
| **Tailwind CSS** | Styling | Utility-first, responsive design without custom CSS |

**State Management**: React Context API for auth + localStorage for tokens (minimal, sufficient for this use case)

### Backend

| Technology | Purpose | Why Chosen |
|-----------|---------|-----------|
| **FastAPI** | Web framework | Async-first, automatic OpenAPI docs, Pydantic validation |
| **Uvicorn** | ASGI server | High-performance async server, production-ready |
| **SQLAlchemy 2.0** | ORM | Type-safe, composable queries, excellent migration support |
| **Python-Jose** | JWT tokens | OpenID Connect certified, secure token generation |
| **Passlib + Bcrypt** | Password hashing | Industry standard, resistant to timing attacks |
| **SlowAPI** | Rate limiting | Simple decorator-based rate limiting per endpoint |
| **Groq Python SDK** | AI integration | Official SDK with retry mechanisms |
| **APScheduler** | Job scheduling | Flexible cron-based scheduling, background job management |

### Database

**SQLite** (Default, upgradeable to PostgreSQL):
- Zero-config for development
- Built-in full-text search support
- Indexes on `(user_id, created_at)` for query performance

### Vector Search

**ChromaDB** — Persistent vector database for semantic search:
- Default embedding function (sentence-transformers)
- Cosine distance metric for similarity ranking
- Per-user metadata filtering

### AI & Integrations

| Service | Purpose |
|---------|---------|
| **Groq API (Llama 3.3-70B)** | Content summarization, quiz generation |
| **GitHub API v4** | Daily activity fetching |
| **LeetCode (Unofficial)** | Submission tracking |
| **YouTube Transcript API** | Video transcript extraction |

---

## 📊 Dashboard Modules

### Home Dashboard (`/`)
Primary landing page with real-time metrics:
- **Logged Today** — Count of entries created in last 24 hours
- **Current Streak** — Consecutive days with ≥1 entry
- **Topics Due** — Topics exceeding spaced repetition interval
- **Total Entries** — Lifetime learning database size
- **Today's Learning Feed** — Recent entries with thumbnails and badges

### Second Brain Search (`/search`)
Semantic search with ChromaDB:
- Full-text queries with relevance scoring
- Source-type filtering
- Result preview and metadata

### Quiz Engine (`/quiz`)
Spaced repetition with Ebbinghaus curve:
- Daily quiz generation from today's entries
- Topic-specific deep dives
- Three difficulty levels
- Performance tracking

### History Feed (`/history`)
Comprehensive entry browsing:
- Paginated list (50 per page)
- Date range filtering
- Source-type filtering
- Quick delete functionality

### Weekly Report (`/report`)
Aggregated productivity insights:
- Learning summary by source
- Top topics and performance metrics
- Visual charts and trends

---

## 🔐 Authentication & Security

### JWT Authentication

```
User Input → Password Hashing (Bcrypt) → JWT Generation
    ↓
Token Stored in localStorage
    ↓
Axios adds to every request header
    ↓
Backend validates token signature & expiry
    ↓
Protected routes accessible only to authenticated user
```

### Security Practices

- **Password Hashing**: Bcrypt (cost=12) with timing attack resistance
- **JWT Signing**: HS256 with 32-byte secret key
- **CORS**: Whitelist localhost:5173, optionally YouTube domain
- **Rate Limiting**: Per-endpoint quotas (10-20 requests/minute)
- **SQL Injection**: SQLAlchemy parameterized queries
- **Token Expiry**: 7-day window, no refresh token

---

## 📁 Folder Structure

```
practice_programs/
├── backend/
│   ├── Main.py              # FastAPI app entry point
│   ├── database.py          # SQLAlchemy models
│   ├── requirements.txt     # Python dependencies
│   ├── core/
│   │   ├── security.py      # JWT, password hashing
│   │   ├── deps.py          # Dependency injection
│   │   └── limiter.py       # Rate limiting
│   ├── routes/
│   │   ├── auth.py          # Authentication endpoints
│   │   ├── ingest.py        # Content ingestion
│   │   ├── search.py        # Search & history
│   │   ├── quiz.py          # Quiz engine
│   │   ├── Auto_fetch.py    # GitHub & LeetCode sync
│   │   └── ...              # Other route modules
│   ├── services/
│   │   ├── summarizer.py    # Groq LLM integration
│   │   ├── vector_store.py  # ChromaDB wrapper
│   │   ├── quiz_service.py  # Question generation
│   │   ├── scheduler.py     # Cron jobs
│   │   └── ...              # Other services
│   └── tests/               # pytest unit tests
│
├── frontend/
│   ├── src/
│   │   ├── App.jsx          # Router setup
│   │   ├── api.js           # Axios client
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── Quiz.jsx
│   │   │   ├── Search.jsx
│   │   │   └── ...
│   │   └── components/      # Reusable UI components
│   ├── package.json
│   └── vite.config.js
│
└── youtube-ai-extension/
    ├── manifest.json        # Extension config
    ├── content.js           # Page injection
    ├── background.js        # Service worker
    └── auth.js              # Token sync
```

---

## ⚙️ Environment Variables

### Backend (`.env`)

```env
# === API Keys (Required) ===
GROQ_API_KEY=gsk_XXXXXXXXXXXX
GITHUB_USERNAME=your_github_handle
GITHUB_TOKEN=ghp_XXXXXXXXXXXX
LEETCODE_USERNAME=your_leetcode_handle

# === Database ===
DATABASE_URL=sqlite:///./learning_tracker.db
CHROMA_DB_PATH=./chroma_db

# === Authentication ===
JWT_SECRET_KEY=<64-byte-random-hex>
ACCESS_TOKEN_EXPIRE_MINUTES=10080

# === Scheduler ===
QUIZ_HOUR=20
QUIZ_MINUTE=30

# === CORS ===
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173
```

---

## 🚀 Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+

### 1️⃣ Backend Setup

```bash
cd practice_programs/backend
python -m venv venv
source venv/bin/activate      # On Windows: venv\Scripts\activate
pip install -r requirements.txt

# Create .env
cp .env.example .env
# Edit with your API keys

# Start server
python -m uvicorn Main:app --reload
```

**Backend runs at**: http://localhost:8000

### 2️⃣ Frontend Setup

```bash
cd practice_programs/frontend
npm install
npm run dev
```

**Frontend runs at**: http://localhost:5173

### 3️⃣ Chrome Extension (Optional)

```
1. Open chrome://extensions
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select youtube-ai-extension folder
5. Login to dashboard first, then visit YouTube
```

---

## 📡 Key API Endpoints

| Endpoint | Method | Auth | Purpose |
|----------|--------|------|---------|
| `/auth/register` | POST | ❌ | Create account |
| `/auth/login` | POST | ❌ | Get JWT token |
| `/ingest/youtube` | POST | ✅ | Ingest YouTube video |
| `/search/` | GET | ✅ | Semantic search |
| `/search/today` | GET | ✅ | Get today's entries |
| `/quiz/recent` | GET | ✅ | Get daily quiz |
| `/quiz/answer` | POST | ✅ | Submit answer |
| `/fetch/github` | POST | ✅ | Sync GitHub activity |

**Full API Docs**: http://localhost:8000/docs (interactive Swagger UI)

---

## 🎨 Design Philosophy

- **Responsive Grid** — Mobile-first layout, 1-col → 3-col on desktop
- **Card-Based** — Each section in distinct cards for scannability
- **Visual Hierarchy** — Primary metrics larger and more prominent
- **Whitespace** — Generous margins for breathing room
- **Accessibility** — WCAG AA compliant, semantic HTML

---

## 🔒 Security Highlights

- **Bcrypt Password Hashing** — Cost factor 12, timing attack resistant
- **JWT Tokens** — HS256 signed, 7-day expiry
- **Rate Limiting** — Per-endpoint quotas prevent abuse
- **SQL Injection Prevention** — Parameterized queries via SQLAlchemy
- **XSS Protection** — React auto-escapes template variables
- **User Isolation** — All queries filtered by `user_id` at ORM level

---

## 🔮 Future Roadmap

- [ ] Real-time WebSocket sync
- [ ] Collaborative learning features
- [ ] Mobile app (React Native)
- [ ] Advanced analytics with forecasting
- [ ] Custom AI model fine-tuning
- [ ] IDE integrations (VS Code, JetBrains)
- [ ] Multi-language support
- [ ] On-premise deployment

---

## 🤝 Contributing

### Setup
```bash
git clone <repo>
cd practice_programs/backend
pip install -r requirements.txt
pytest tests/
```

### Branch Naming
- `feature/` — New features
- `bugfix/` — Bug fixes
- `docs/` — Documentation
- `test/` — Test improvements

### Commit Format
```
<type>: <subject> (#issue)

<body>
```

### Testing
```bash
# Backend
pytest tests/ -v

# Frontend
npm test
```

---

## 📚 Key Learnings

### Technical
- **Async Concurrency** improves throughput for I/O-bound tasks
- **Vector Embeddings** enable semantic search without training models
- **Spaced Repetition** significantly improves knowledge retention
- **Circuit Breaker** pattern gracefully handles API failures
- **Database Indexing** reduces query latency by 10x

### Architecture
- **Separation of Concerns** improves testability and maintainability
- **Dependency Injection** makes mocking and testing trivial
- **User Isolation** at ORM level ensures multi-tenant safety
- **State Machines** elegantly handle resilience patterns

---

## 💬 Support

- 📖 **Documentation**: [docs/](./docs/)
- 🐛 **Issues**: [GitHub Issues](https://github.com/vairagadeayush01/Productivity_manager/issues)
- 💬 **Discussions**: [GitHub Discussions](https://github.com/vairagadeayush01/Productivity_manager/discussions)

---

<div align="center">

**Made with 🧠 for lifelong learners**

[⬆ Back to top](#-productivity-manager--ai-powered-learning-tracker)

</div>
