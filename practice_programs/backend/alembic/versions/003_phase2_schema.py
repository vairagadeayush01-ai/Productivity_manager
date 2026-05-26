"""
003_phase2_schema.py — Phase 2 schema additions.

Changes:
  1. Adds 7 profile columns to the 'users' table
  2. Creates 4 new tables:
     - quiz_sessions
     - tutor_conversations
     - tutor_messages
     - calendar_events

Uses batch_alter_table for SQLite compatibility when adding columns.
All new columns are nullable so existing rows are unaffected.

Revision: 003
Down-revision: 002
"""
from alembic import op
import sqlalchemy as sa

revision = '003'
down_revision = '002'
branch_labels = None
depends_on = None


def upgrade():
    # ── 1. Add profile columns to users (batch for SQLite compat) ─────────────
    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.add_column(sa.Column('username',           sa.String(),  nullable=True))
        batch_op.add_column(sa.Column('display_name',       sa.String(),  nullable=True))
        batch_op.add_column(sa.Column('github_username',    sa.String(),  nullable=True))
        batch_op.add_column(sa.Column('github_pat_enc',     sa.Text(),    nullable=True))
        batch_op.add_column(sa.Column('leetcode_username',  sa.String(),  nullable=True))
        batch_op.add_column(sa.Column('extension_installed', sa.Boolean(), nullable=True, server_default='0'))
        batch_op.add_column(sa.Column('last_sync_at',       sa.DateTime(), nullable=True))
        batch_op.create_unique_constraint('uq_users_username', ['username'])

    # ── 2. quiz_sessions ──────────────────────────────────────────────────────
    op.create_table(
        'quiz_sessions',
        sa.Column('id',              sa.Integer(),    nullable=False, primary_key=True),
        sa.Column('user_id',         sa.Integer(),    sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('session_type',    sa.String(30),   nullable=True),
        sa.Column('topic',           sa.String(),     nullable=True),
        sa.Column('status',          sa.String(20),   nullable=True, server_default='active'),
        sa.Column('total_questions', sa.Integer(),    nullable=True, server_default='0'),
        sa.Column('correct_count',   sa.Integer(),    nullable=True, server_default='0'),
        sa.Column('started_at',      sa.DateTime(),   nullable=True),
        sa.Column('completed_at',    sa.DateTime(),   nullable=True),
    )
    op.create_index('idx_quiz_session_user_started', 'quiz_sessions', ['user_id', 'started_at'])

    # ── 3. tutor_conversations ────────────────────────────────────────────────
    op.create_table(
        'tutor_conversations',
        sa.Column('id',           sa.Integer(),  nullable=False, primary_key=True),
        sa.Column('user_id',      sa.Integer(),  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('context_type', sa.String(50), nullable=True),
        sa.Column('source_ref',   sa.Text(),     nullable=True),
        sa.Column('expires_at',   sa.DateTime(), nullable=True),
        sa.Column('created_at',   sa.DateTime(), nullable=True),
    )
    op.create_index('idx_tutor_conv_user', 'tutor_conversations', ['user_id'])

    # ── 4. tutor_messages ─────────────────────────────────────────────────────
    op.create_table(
        'tutor_messages',
        sa.Column('id',              sa.Integer(),  nullable=False, primary_key=True),
        sa.Column('conversation_id', sa.Integer(),  sa.ForeignKey('tutor_conversations.id', ondelete='CASCADE'), nullable=False),
        sa.Column('role',            sa.String(20), nullable=True),
        sa.Column('content',         sa.Text(),     nullable=True),
        sa.Column('source_refs',     sa.Text(),     nullable=True, server_default='[]'),
        sa.Column('created_at',      sa.DateTime(), nullable=True),
    )
    op.create_index('idx_tutor_msg_conv', 'tutor_messages', ['conversation_id'])

    # ── 5. calendar_events ────────────────────────────────────────────────────
    op.create_table(
        'calendar_events',
        sa.Column('id',              sa.Integer(),  nullable=False, primary_key=True),
        sa.Column('user_id',         sa.Integer(),  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('google_event_id', sa.String(),   nullable=True),
        sa.Column('title',           sa.String(),   nullable=False),
        sa.Column('description',     sa.Text(),     nullable=True),
        sa.Column('start_time',      sa.DateTime(), nullable=False),
        sa.Column('end_time',        sa.DateTime(), nullable=False),
        sa.Column('status',          sa.String(20), nullable=True, server_default='pending'),
        sa.Column('created_at',      sa.DateTime(), nullable=True),
    )
    op.create_index('idx_calendar_user_time', 'calendar_events', ['user_id', 'start_time'])


def downgrade():
    op.drop_table('calendar_events')
    op.drop_table('tutor_messages')
    op.drop_table('tutor_conversations')
    op.drop_table('quiz_sessions')

    with op.batch_alter_table('users', schema=None) as batch_op:
        batch_op.drop_column('last_sync_at')
        batch_op.drop_column('extension_installed')
        batch_op.drop_column('leetcode_username')
        batch_op.drop_column('github_pat_enc')
        batch_op.drop_column('github_username')
        batch_op.drop_column('display_name')
        batch_op.drop_column('username')
