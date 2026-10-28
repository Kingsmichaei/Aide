"""shopper voice preferences

Revision ID: 5d2f8a1c9e47
Revises: bc639e3f1c0f
Create Date: 2026-10-28 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "5d2f8a1c9e47"
down_revision: str | Sequence[str] | None = "bc639e3f1c0f"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None


def upgrade() -> None:
    """Upgrade schema."""
    op.add_column(
        "users", sa.Column("auto_send", sa.Boolean(), server_default=sa.true(), nullable=False)
    )
    op.add_column(
        "users", sa.Column("read_aloud", sa.Boolean(), server_default=sa.true(), nullable=False)
    )


def downgrade() -> None:
    """Downgrade schema."""
    op.drop_column("users", "read_aloud")
    op.drop_column("users", "auto_send")
