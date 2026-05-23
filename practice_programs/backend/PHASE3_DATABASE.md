# Phase 3 — PostgreSQL & Migrations

## Quick start (SQLite — default, no change)

Keep using SQLite for local dev:

```env
DATABASE_URL=sqlite:///./learning_tracker.db
```

Start the backend as usual. Schema is created automatically on startup.

## PostgreSQL (production-like)

### 1. Start Postgres

From the repo root:

```bash
docker compose up -d
```

### 2. Configure `.env`

```env
DATABASE_URL=postgresql://productivity:productivity@localhost:5432/productivity_db
USE_ALEMBIC=true
```

### 3. Run migrations

```bash
cd practice_programs/backend
pip install -r requirements.txt
alembic upgrade head
uvicorn Main:app --reload
```

`USE_ALEMBIC=true` or any `postgresql://` URL runs migrations automatically on startup.

## Alembic commands

| Command | Purpose |
|---------|---------|
| `alembic upgrade head` | Apply all migrations |
| `alembic downgrade -1` | Roll back one revision |
| `alembic revision --autogenerate -m "description"` | New migration from model changes |

## Migrating existing SQLite data to PostgreSQL

1. Export via `GET /auth/export` while logged in.
2. Start fresh Postgres + `alembic upgrade head`.
3. Register a new account and re-import entries manually, or use a one-off script.

Automated SQLite→Postgres dump is not included yet.

## Tests

```bash
cd practice_programs/backend
pytest -v
```
