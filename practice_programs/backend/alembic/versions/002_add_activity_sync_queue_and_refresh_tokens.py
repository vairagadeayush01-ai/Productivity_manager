"""Phase 1.1 — Add activity_sync_queue and refresh_tokens tables.

Revision ID: 002
Revises: 001
Create Date: 2026-05-26

New tables:
  - activity_sync_queue: offline-first queue for extension-submitted activities
  - refresh_tokens: JWT refresh token rotation (DB-backed)
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "002"
down_revision: Union[str, None] = "001"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ── refresh_tokens ────────────────────────────────────────────────────────
    op.create_table(
        "refresh_tokens",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("token_hash", sa.String(length=255), nullable=False),
        sa.Column("device_info", sa.String(length=500), nullable=True),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("token_hash", name="uq_refresh_token_hash"),
    )
    op.create_index("idx_refresh_token_user", "refresh_tokens", ["user_id"])
    op.create_index("idx_refresh_token_expires", "refresh_tokens", ["expires_at"])

    # ── activity_sync_queue ───────────────────────────────────────────────────
    op.create_table(
        "activity_sync_queue",
        sa.Column("id", sa.Integer(), nullable=False),
        # user_id is nullable: activities queued before login won't have it yet
        sa.Column("user_id", sa.Integer(), nullable=True),
        sa.Column("device_id", sa.String(length=100), nullable=False),
        # youtube_watch | leetcode_solve
        sa.Column("activity_type", sa.String(length=50), nullable=False),
        # Raw payload as JSON text
        sa.Column("payload", sa.Text(), nullable=False),
        # sha256(activity_type:source_id:date_utc) — prevents double-processing
        sa.Column("dedupe_key", sa.String(length=64), nullable=False),
        sa.Column("retry_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_retries", sa.Integer(), nullable=False, server_default="5"),
        # pending | processing | done | failed
        sa.Column("status", sa.String(length=20), nullable=False, server_default="pending"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("last_attempt_at", sa.DateTime(), nullable=True),
        sa.Column("processed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("dedupe_key", name="uq_activity_dedupe_key"),
    )
    op.create_index(
        "idx_sync_queue_status_created",
        "activity_sync_queue",
        ["status", "created_at"],
    )
    op.create_index(
        "idx_sync_queue_user_status",
        "activity_sync_queue",
        ["user_id", "status"],
    )


def downgrade() -> None:
    op.drop_table("activity_sync_queue")
    op.drop_table("refresh_tokens")
