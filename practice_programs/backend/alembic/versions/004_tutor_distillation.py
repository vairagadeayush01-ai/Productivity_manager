"""
004_tutor_distillation.py — Add distilled_summary to tutor_conversations.

After a tutor session expires (24h), messages are deleted and replaced
with a single distilled_summary text that captures key insights.

Revision: 004
Down-revision: 003
"""
from alembic import op
import sqlalchemy as sa

revision = '004'
down_revision = '003'
branch_labels = None
depends_on = None


def upgrade():
    with op.batch_alter_table('tutor_conversations', schema=None) as batch_op:
        batch_op.add_column(sa.Column('distilled_summary', sa.Text(), nullable=True))
        batch_op.add_column(sa.Column('distilled_at', sa.DateTime(), nullable=True))


def downgrade():
    with op.batch_alter_table('tutor_conversations', schema=None) as batch_op:
        batch_op.drop_column('distilled_at')
        batch_op.drop_column('distilled_summary')
