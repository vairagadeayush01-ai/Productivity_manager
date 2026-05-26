"""google_calendar_credentials

Revision ID: c54b36884319
Revises: 004
Create Date: 2026-05-26 16:12:51.169890

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c54b36884319'
down_revision: Union[str, None] = '004'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.add_column(sa.Column('google_credentials_enc', sa.Text(), nullable=True))

def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.drop_column('google_credentials_enc')
