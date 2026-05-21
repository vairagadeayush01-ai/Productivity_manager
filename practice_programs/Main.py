from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from database import init_db
from routes import ingest, search, reader, auto_fetch

app = FastAPI(
    title="Learning Tracker API",
    description="Your personal AI learning diary — tracks YouTube, LeetCode, GitHub and daily logs.",
    version="1.0.0"
)

# Allow the Streamlit frontend (running on port 8501) to talk to this API
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:8501", "http://127.0.0.1:8501"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register route modules
app.include_router(ingest.router)
app.include_router(search.router)
app.include_router(reader.router)
app.include_router(auto_fetch.router)


@app.on_event("startup")
async def startup():
    """Create SQLite tables on first run."""
    init_db()
    print("✅ Database ready")
    print("📖 API docs at http://localhost:8000/docs")


@app.get("/")
async def root():
    return {
        "message": "Learning Tracker API is running.",
        "docs": "http://localhost:8000/docs",
        "endpoints": {
            "ingest_youtube": "POST /ingest/youtube",
            "ingest_log":     "POST /ingest/log",
            "ingest_leetcode": "POST /ingest/leetcode",
            "search":         "GET  /search/?q=your+query",
            "today":          "GET  /search/today",
            "stats":          "GET  /search/stats",
        }
    }