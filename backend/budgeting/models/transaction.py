from datetime import datetime, timezone
from budgeting.extensions import db


class Transaction(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    transaction_date = db.Column(db.DateTime, nullable=False)
    post_date = db.Column(db.DateTime, nullable=True)
    description = db.Column(db.String(500), nullable=False)
    category = db.Column(db.String(100), nullable=True)
    transaction_type = db.Column(db.String(50), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    memo = db.Column(db.String(500), nullable=True)
    auto_category = db.Column(db.String(100), nullable=True)
    manual_category = db.Column(db.String(100), nullable=True)
    balance = db.Column(db.Float, nullable=True)
    check_number = db.Column(db.String(50), nullable=True)
    csv_format = db.Column(db.String(20), nullable=False)
    card_source = db.Column(db.String(20), nullable=True)
    card_last_four = db.Column(db.String(4), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def __repr__(self) -> str:
        return f'<Transaction {self.id} {self.description[:30]}>'


class CategoryRule(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    category_name = db.Column(db.String(100), nullable=False)
    regex_pattern = db.Column(db.String(500), nullable=False)
    is_active = db.Column(db.Boolean, default=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    def __repr__(self) -> str:
        return f'<CategoryRule {self.id} {self.category_name}>'
