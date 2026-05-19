# Productivity Manager

Productivity Manager is a personal learning tracker that helps capture what you study, summarize it with AI, and turn it into searchable notes and quizzes.

The repository currently contains:

- A FastAPI backend for ingesting learning activity, generating summaries, storing notes, and running quiz/review flows
- A Chrome extension prototype for detecting educational YouTube activity

## Features

- Log learning from YouTube videos, manual notes, and LeetCode practice
- Generate AI summaries and key concepts using Groq
- Store searchable knowledge in ChromaDB
- Track learning history with SQLite or a custom SQLAlchemy database URL
- Create daily quizzes and topic-based review quizzes
- Support spaced repetition and scheduled review flows
- Auto-fetch GitHub and LeetCode activity through backend services

## Project Structure

```text
practice_programs/
  backend/                 FastAPI backend
  youtube-ai-extension/    Chrome extension prototype
```

## Backend Setup

1. Create and activate a virtual environment.
2. Install dependencies:

```bash
pip install -r practice_programs/backend/requirements.txt
```

3. Create a `.env` file inside `practice_programs/backend/`.

Example:

```env
GROQ_API_KEY=your_groq_api_key
DATABASE_URL=sqlite:///./learning_tracker.db
CHROMA_DB_PATH=./chroma_db
GITHUB_USERNAME=your_github_username
GITHUB_TOKEN=your_github_token
LEETCODE_USERNAME=your_leetcode_username
QUIZ_HOUR=14
QUIZ_MINUTE=0
```

## Running the Backend

From `practice_programs/backend`:

```bash
uvicorn Main:app --reload
```

After startup:

- API base URL: `http://localhost:8000`
- API docs: `http://localhost:8000/docs`

## Main API Areas

- `/ingest` for adding learning entries
- `/search` for semantic lookup over saved content
- `/reader` for reading-related workflows
- `/quiz` for daily and topic review quizzes
- `/report` for summaries and reporting
- `/auto-fetch` for GitHub and LeetCode activity sync

## Chrome Extension

The `practice_programs/youtube-ai-extension` folder contains a Manifest V3 browser extension named `YT AI Learning Tracker`.

To test it locally:

1. Open Chrome extensions
2. Enable Developer Mode
3. Choose `Load unpacked`
4. Select `practice_programs/youtube-ai-extension`

## Tech Stack

- FastAPI
- SQLAlchemy
- ChromaDB
- Groq API
- APScheduler
- Chrome Extension Manifest V3

## Current Status

This project is still in active development, so some flows may be experimental or incomplete.
