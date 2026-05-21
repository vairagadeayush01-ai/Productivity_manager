# Productivity Manager

Productivity Manager is an AI-assisted learning workspace for capturing what you study, turning it into summaries, and reviewing it later through search, quizzes, and spaced repetition.

This repository includes:

- A FastAPI backend for ingestion, search, reporting, and quiz workflows
- A React + Vite frontend dashboard for interacting with the system visually
- A Chrome extension prototype for tracking educational YouTube content

## Highlights

- Capture learning from YouTube links, manual notes, and LeetCode practice
- Generate summaries and topic tags with Groq-powered backend services
- Search saved knowledge semantically with ChromaDB
- Review due topics with quiz and spaced repetition flows
- Track history, dashboard stats, and weekly reports
- Sync coding activity from GitHub and LeetCode

## Repository Layout

```text
practice_programs/
  backend/                 FastAPI API, services, storage, scheduler
  frontend/                React + Vite web app
  youtube-ai-extension/    Chrome extension prototype
README.md
```

## Architecture

### Backend

The backend entry point is `practice_programs/backend/Main.py`. It starts a FastAPI app, enables CORS, initializes the database, and starts the scheduler on startup.

Main route groups:

- `/ingest` for YouTube, manual note, and LeetCode ingestion
- `/search` for semantic search, history, and stats
- `/quiz` for daily quiz, topic review, answers, and due topics
- `/report` for weekly reporting
- `/reader` for reading workflows
- `/fetch` for GitHub and LeetCode sync

### Frontend

The frontend lives in `practice_programs/frontend` and uses React, Vite, `react-router-dom`, `axios`, and `lucide-react`.

Main UI areas:

- Dashboard
- Second Brain search
- Daily Quiz
- History
- Weekly Report
- Add Entry modal

By default, the frontend calls the backend at `http://127.0.0.1:8000`.

### Browser Extension

The Chrome extension in `practice_programs/youtube-ai-extension` is a Manifest V3 prototype named `YT AI Learning Tracker`. It is intended to detect educational YouTube activity and support ingestion workflows.

## Setup

### 1. Backend

Create a virtual environment, activate it, and install dependencies:

```bash
pip install -r practice_programs/backend/requirements.txt
```

Create a `.env` file inside `practice_programs/backend/`.

Example:

```env
GROQ_API_KEY=your_groq_api_key
DATABASE_URL=sqlite:///./learning_tracker.db
CHROMA_DB_PATH=./chroma_db
GITHUB_USERNAME=your_github_username
GITHUB_TOKEN=your_github_token
LEETCODE_USERNAME=your_leetcode_username
QUIZ_HOUR=23
QUIZ_MINUTE=30
```

Run the API from `practice_programs/backend`:

```bash
uvicorn Main:app --reload
```

Backend URLs:

- API: `http://127.0.0.1:8000`
- Docs: `http://127.0.0.1:8000/docs`

### 2. Frontend

Install frontend dependencies:

```bash
cd practice_programs/frontend
npm install
```

Start the development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

### 3. Chrome Extension

To load the extension locally:

1. Open `chrome://extensions`
2. Enable Developer Mode
3. Click `Load unpacked`
4. Select `practice_programs/youtube-ai-extension`

## Tech Stack

- FastAPI
- SQLAlchemy
- ChromaDB
- APScheduler
- Groq API
- React
- Vite
- Chrome Extension Manifest V3

## Notes

- Local database files and Chroma persistence are generated at runtime and should not be committed.
- The project is under active development, so some integrations and flows may still be evolving.
