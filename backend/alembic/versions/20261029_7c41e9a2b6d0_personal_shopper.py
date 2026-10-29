"""personal shopper: one kind of user, spending rules, new order statuses

Aide is now a personal shopper for everyone. This removes the caregiver model
(care_links, approvals, caregiver users), replaces limits with the user's own
spending_rules, renames shopper_id to user_id, moves orders to the new status
values and reshapes notifications for any kind of alert.

Revision ID: 7c41e9a2b6d0
Revises: 512a10523790
Create Date: 2026-10-29 10:00:00.000000

"""

from collections.abc import Sequence

import sqlalchemy as sa

from alembic import op

# revision identifiers, used by Alembic.
revision: str = "7c41e9a2b6d0"
down_revision: str | Sequence[str] | None = "512a10523790"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

NEW_STATUSES = (
    "draft",
    "confirmed",
    "awaiting_payment",
    "authorized",
    "captured",
    "voided",
    "refunded",
    "failed",
)
OLD_STATUSES = (
    "draft",
    "awaiting_shopper",
    "awaiting_caregiver",
    "captured",
    "voided",
    "refunded",
)


def _in(column: str, values: Sequence[str]) -> str:
    return f"{column} IN ({', '.join(repr(v) for v in values)})"


def upgrade() -> None:
    """Upgrade schema."""
    # --- Caregiver model out ------------------------------------------------------
    op.drop_index(op.f("ix_approvals_order_id"), table_name="approvals")
    op.drop_table("approvals")
    op.drop_table("care_links")
    op.drop_index(op.f("ix_recurring_orders_shopper_id"), table_name="recurring_orders")
    op.drop_table("recurring_orders")
    # Every existing alert was about caregiver approvals.
    op.execute("DELETE FROM notifications")

    # --- spending_rules replaces limits -------------------------------------------
    op.create_table(
        "spending_rules",
        sa.Column("user_id", sa.Integer(), nullable=False),
        sa.Column("monthly_budget", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("ask_above", sa.Numeric(precision=10, scale=2), nullable=True),
        sa.Column("blocked_categories", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("user_id"),
    )
    op.execute(
        "INSERT INTO spending_rules (user_id, monthly_budget, ask_above, blocked_categories) "
        "SELECT shopper_id, monthly_max, per_order_max, blocked_categories FROM limits"
    )

    # --- users: no roles; email, currency and theme -------------------------------
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(sa.Column("email", sa.String(length=320), nullable=True))
        batch_op.add_column(
            sa.Column("currency", sa.String(length=3), server_default="USD", nullable=False)
        )
        batch_op.add_column(
            sa.Column(
                "theme",
                sa.Enum(
                    "light",
                    "dark",
                    "system",
                    name="theme",
                    native_enum=False,
                    create_constraint=True,
                ),
                server_default="system",
                nullable=False,
            )
        )
        batch_op.create_unique_constraint("uq_users_email", ["email"])
    op.execute(
        "UPDATE users SET currency = "
        "(SELECT currency FROM limits WHERE limits.shopper_id = users.id) "
        "WHERE id IN (SELECT shopper_id FROM limits)"
    )
    op.drop_table("limits")
    op.execute("DELETE FROM users WHERE role = 'caregiver'")
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_constraint("role", type_="check")
        batch_op.drop_column("role")
        batch_op.drop_column("text_size")
        # Text comes first now; reading aloud is opt-in.
        batch_op.alter_column(
            "read_aloud",
            existing_type=sa.Boolean(),
            server_default=sa.false(),
            existing_nullable=False,
        )

    # --- shopper_id -> user_id ------------------------------------------------------
    op.drop_index(op.f("ix_conversations_shopper_id"), table_name="conversations")
    with op.batch_alter_table("conversations", schema=None) as batch_op:
        batch_op.alter_column("shopper_id", new_column_name="user_id")
    op.create_index(op.f("ix_conversations_user_id"), "conversations", ["user_id"])
    op.drop_index(op.f("ix_orders_shopper_id"), table_name="orders")
    with op.batch_alter_table("orders", schema=None) as batch_op:
        batch_op.alter_column("shopper_id", new_column_name="user_id")
    op.create_index(op.f("ix_orders_user_id"), "orders", ["user_id"])

    # --- order statuses ---------------------------------------------------------------
    with op.batch_alter_table("orders", schema=None) as batch_op:
        batch_op.drop_constraint("orderstatus", type_="check")
    op.execute(
        "UPDATE orders SET status = CASE "
        "WHEN status = 'awaiting_caregiver' THEN 'authorized' "
        "WHEN status = 'awaiting_shopper' AND paypal_order_id IS NOT NULL THEN 'awaiting_payment' "
        "WHEN status = 'awaiting_shopper' AND confirmed_total IS NOT NULL THEN 'confirmed' "
        "WHEN status = 'awaiting_shopper' THEN 'draft' "
        "ELSE status END"
    )
    with op.batch_alter_table("orders", schema=None) as batch_op:
        batch_op.alter_column(
            "status",
            existing_type=sa.String(length=18),
            type_=sa.String(length=16),
            existing_nullable=False,
        )
        batch_op.create_check_constraint("orderstatus", _in("status", NEW_STATUSES))

    # --- order_events: user/system actors, a note -------------------------------------
    with op.batch_alter_table("order_events", schema=None) as batch_op:
        batch_op.drop_constraint("from_status", type_="check")
        batch_op.drop_constraint("to_status", type_="check")
        batch_op.drop_constraint("actor", type_="check")
        batch_op.add_column(sa.Column("note", sa.Text(), nullable=True))
    for column in ("from_status", "to_status"):
        op.execute(
            f"UPDATE order_events SET {column} = CASE "
            f"WHEN {column} = 'awaiting_caregiver' THEN 'authorized' "
            f"WHEN {column} = 'awaiting_shopper' THEN 'awaiting_payment' "
            f"ELSE {column} END"
        )
    op.execute(
        "UPDATE order_events SET actor = CASE WHEN actor = 'shopper' THEN 'user' "
        "WHEN actor = 'caregiver' THEN 'system' ELSE actor END"
    )
    with op.batch_alter_table("order_events", schema=None) as batch_op:
        batch_op.alter_column(
            "from_status", existing_type=sa.String(length=18), type_=sa.String(length=16)
        )
        batch_op.alter_column(
            "to_status",
            existing_type=sa.String(length=18),
            type_=sa.String(length=16),
            existing_nullable=False,
        )
        batch_op.alter_column(
            "actor",
            existing_type=sa.String(length=9),
            type_=sa.String(length=6),
            existing_nullable=False,
        )
        batch_op.create_check_constraint(
            "from_status", f"from_status IS NULL OR {_in('from_status', NEW_STATUSES)}"
        )
        batch_op.create_check_constraint("to_status", _in("to_status", NEW_STATUSES))
        batch_op.create_check_constraint("actor", _in("actor", ("user", "system")))

    # --- notifications: any kind, a payload ---------------------------------------------
    with op.batch_alter_table("notifications", schema=None) as batch_op:
        batch_op.drop_constraint("alertkind", type_="check")
        batch_op.alter_column(
            "kind",
            existing_type=sa.String(length=15),
            type_=sa.String(length=50),
            existing_nullable=False,
        )
        batch_op.alter_column("params", new_column_name="payload")
        batch_op.drop_column("order_id")


def downgrade() -> None:
    """Downgrade schema. Caregiver data removed by the upgrade does not come back."""
    with op.batch_alter_table("notifications", schema=None) as batch_op:
        batch_op.add_column(sa.Column("order_id", sa.Integer(), nullable=True))
        batch_op.alter_column("payload", new_column_name="params")
    op.execute("DELETE FROM notifications")
    with op.batch_alter_table("notifications", schema=None) as batch_op:
        batch_op.alter_column(
            "kind", existing_type=sa.String(length=50), type_=sa.String(length=15)
        )
        batch_op.create_foreign_key("fk_notifications_order_id", "orders", ["order_id"], ["id"])
        batch_op.create_check_constraint(
            "alertkind",
            _in("kind", ("approval_needed", "approved", "declined", "payment_expired")),
        )

    with op.batch_alter_table("order_events", schema=None) as batch_op:
        batch_op.drop_constraint("from_status", type_="check")
        batch_op.drop_constraint("to_status", type_="check")
        batch_op.drop_constraint("actor", type_="check")
        batch_op.drop_column("note")
    for column in ("from_status", "to_status"):
        op.execute(
            f"UPDATE order_events SET {column} = CASE "
            f"WHEN {column} IN ('confirmed') THEN 'draft' "
            f"WHEN {column} IN ('awaiting_payment', 'authorized') THEN 'awaiting_shopper' "
            f"WHEN {column} = 'failed' THEN 'voided' "
            f"ELSE {column} END"
        )
    op.execute("UPDATE order_events SET actor = 'shopper' WHERE actor = 'user'")
    with op.batch_alter_table("order_events", schema=None) as batch_op:
        batch_op.alter_column(
            "from_status", existing_type=sa.String(length=16), type_=sa.String(length=18)
        )
        batch_op.alter_column(
            "to_status", existing_type=sa.String(length=16), type_=sa.String(length=18)
        )
        batch_op.alter_column("actor", existing_type=sa.String(length=6), type_=sa.String(9))
        batch_op.create_check_constraint(
            "from_status", f"from_status IS NULL OR {_in('from_status', OLD_STATUSES)}"
        )
        batch_op.create_check_constraint("to_status", _in("to_status", OLD_STATUSES))
        batch_op.create_check_constraint("actor", _in("actor", ("shopper", "caregiver", "system")))

    with op.batch_alter_table("orders", schema=None) as batch_op:
        batch_op.drop_constraint("orderstatus", type_="check")
    op.execute(
        "UPDATE orders SET status = CASE "
        "WHEN status = 'confirmed' THEN 'draft' "
        "WHEN status IN ('awaiting_payment', 'authorized') THEN 'awaiting_shopper' "
        "WHEN status = 'failed' THEN 'voided' "
        "ELSE status END"
    )
    with op.batch_alter_table("orders", schema=None) as batch_op:
        batch_op.alter_column("status", existing_type=sa.String(16), type_=sa.String(18))
        batch_op.create_check_constraint("orderstatus", _in("status", OLD_STATUSES))

    op.drop_index(op.f("ix_orders_user_id"), table_name="orders")
    with op.batch_alter_table("orders", schema=None) as batch_op:
        batch_op.alter_column("user_id", new_column_name="shopper_id")
    op.create_index(op.f("ix_orders_shopper_id"), "orders", ["shopper_id"])
    op.drop_index(op.f("ix_conversations_user_id"), table_name="conversations")
    with op.batch_alter_table("conversations", schema=None) as batch_op:
        batch_op.alter_column("user_id", new_column_name="shopper_id")
    op.create_index(op.f("ix_conversations_shopper_id"), "conversations", ["shopper_id"])

    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column(
                "role",
                sa.Enum(
                    "shopper",
                    "caregiver",
                    name="role",
                    native_enum=False,
                    create_constraint=True,
                ),
                server_default="shopper",
                nullable=False,
            )
        )
        batch_op.add_column(
            sa.Column("text_size", sa.Integer(), server_default="20", nullable=False)
        )
        batch_op.alter_column("read_aloud", existing_type=sa.Boolean(), server_default=sa.true())

    op.create_table(
        "limits",
        sa.Column("shopper_id", sa.Integer(), nullable=False),
        sa.Column("per_order_max", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("monthly_max", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.Column("currency", sa.String(length=3), nullable=False),
        sa.Column("blocked_categories", sa.JSON(), nullable=False),
        sa.ForeignKeyConstraint(["shopper_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("shopper_id"),
    )
    op.execute(
        "INSERT INTO limits (shopper_id, per_order_max, monthly_max, currency, blocked_categories)"
        " SELECT r.user_id, COALESCE(r.ask_above, 0), COALESCE(r.monthly_budget, 0), u.currency,"
        " r.blocked_categories FROM spending_rules r JOIN users u ON u.id = r.user_id"
    )
    op.drop_table("spending_rules")
    with op.batch_alter_table("users", schema=None) as batch_op:
        batch_op.drop_constraint("uq_users_email", type_="unique")
        batch_op.drop_constraint("theme", type_="check")
        batch_op.drop_column("theme")
        batch_op.drop_column("currency")
        batch_op.drop_column("email")

    op.create_table(
        "recurring_orders",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("shopper_id", sa.Integer(), nullable=False),
        sa.Column("channel3_product_id", sa.String(length=200), nullable=False),
        sa.Column("every_days", sa.Integer(), nullable=False),
        sa.Column("next_date", sa.Date(), nullable=False),
        sa.Column("max_price", sa.Numeric(precision=10, scale=2), nullable=False),
        sa.ForeignKeyConstraint(["shopper_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        op.f("ix_recurring_orders_shopper_id"), "recurring_orders", ["shopper_id"], unique=False
    )
    op.create_table(
        "care_links",
        sa.Column("shopper_id", sa.Integer(), nullable=False),
        sa.Column("caregiver_id", sa.Integer(), nullable=False),
        sa.Column(
            "status",
            sa.Enum(
                "pending",
                "active",
                "revoked",
                name="carelinkstatus",
                native_enum=False,
                create_constraint=True,
            ),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(["caregiver_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["shopper_id"], ["users.id"]),
        sa.PrimaryKeyConstraint("shopper_id", "caregiver_id"),
    )
    op.create_table(
        "approvals",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("order_id", sa.Integer(), nullable=False),
        sa.Column("caregiver_id", sa.Integer(), nullable=False),
        sa.Column(
            "decision",
            sa.Enum(
                "approved", "declined", name="decision", native_enum=False, create_constraint=True
            ),
            nullable=False,
        ),
        sa.Column("note", sa.Text(), nullable=True),
        sa.Column(
            "decided_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False
        ),
        sa.ForeignKeyConstraint(["caregiver_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["order_id"], ["orders.id"]),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(op.f("ix_approvals_order_id"), "approvals", ["order_id"], unique=False)
