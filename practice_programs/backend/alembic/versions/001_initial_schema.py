"""Initial schema — users, learning entries, quizzes, spaced repetition, diaries.

Revision ID: 001
Revises:
Create Date: 2026-05-23

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "users",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_users_email", "users", ["email"], unique=True)
    op.create_index("ix_users_id", "users", ["id"], unique=False)

    op.create_table(
        "learning_entries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("source_type", sa.String(), nullable=True),
        sa.Column("title", sa.String(), nullable=True),
        sa.Column("source_url", sa.String(), nullable=True),
        sa.Column("raw_content", sa.Text(), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("topics", sa.String(), nullable=True),
        sa.Column("chroma_id", sa.String(), nullable=True),
        sa.Column("metadata_json", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_learning_user_created", "learning_entries", ["user_id", "created_at"])
    op.create_index("idx_learning_user_source", "learning_entries", ["user_id", "source_type"])
    op.create_index("ix_learning_entries_created_at", "learning_entries", ["created_at"])
    op.create_index("ix_learning_entries_user_id", "learning_entries", ["user_id"])

    op.create_table(
        "quiz_results",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("question", sa.Text(), nullable=True),
        sa.Column("topic", sa.String(), nullable=True),
        sa.Column("user_answer", sa.String(), nullable=True),
        sa.Column("correct_answer", sa.String(), nullable=True),
        sa.Column("is_correct", sa.Boolean(), nullable=True),
        sa.Column("attempted_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("idx_quiz_user", "quiz_results", ["user_id"])

    op.create_table(
        "topic_reviews",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("topic", sa.String(), nullable=True),
        sa.Column("last_reviewed", sa.Date(), nullable=True),
        sa.Column("interval_days", sa.Integer(), nullable=True),
        sa.Column("times_correct", sa.Integer(), nullable=True),
        sa.Column("times_incorrect", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "topic", name="uq_user_topic"),
    )
    op.create_index("ix_topic_reviews_topic", "topic_reviews", ["topic"])
    op.create_index("ix_topic_reviews_user_id", "topic_reviews", ["user_id"])

    op.create_table(
        "streaks",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=True),
        sa.Column("entry_count", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "date", name="uq_user_streak_date"),
    )

    op.create_table(
        "daily_diaries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("date", sa.Date(), nullable=True),
        sa.Column("summary", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("user_id", "date", name="uq_user_diary_date"),
    )
    op.create_index("ix_daily_diaries_date", "daily_diaries", ["date"])
    op.create_index("ix_daily_diaries_user_id", "daily_diaries", ["user_id"])


def downgrade() -> None:
    op.drop_table("daily_diaries")
    op.drop_table("streaks")
    op.drop_table("topic_reviews")
    op.drop_table("quiz_results")
    op.drop_table("learning_entries")
    op.drop_table("users")
