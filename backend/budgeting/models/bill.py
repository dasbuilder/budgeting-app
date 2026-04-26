from datetime import datetime, timezone
from sqlalchemy.util import preloaded  # noqa: F401
from sqlalchemy_utils.types.encrypted.encrypted_type import StringEncryptedType as EncryptedType, AesEngine  # type: ignore
from budgeting.extensions import db
from budgeting.config import DB_ENCRYPTION_KEY
from budgeting.services.encryption_service import _dec_float


class BillCategory(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    name = db.Column(db.String(100), nullable=False, unique=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))

    def __repr__(self) -> str:
        return f'<BillCategory {self.id} {self.name}>'

    def to_dict(self):
        return {
            'id': self.id,
            'name': self.name,
            'created_at': self.created_at.isoformat() if self.created_at else None,
        }


class Bill(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    bill_name = db.Column(db.String(200), nullable=False)
    amount = db.Column(EncryptedType(db.String(50), DB_ENCRYPTION_KEY, AesEngine, 'pkcs5'), nullable=False, default='0.0')
    due_day_of_month = db.Column(db.Integer, nullable=True)
    category = db.Column(db.String(100), nullable=True)
    is_recurring = db.Column(db.Boolean, default=True)
    is_auto_detected = db.Column(db.Boolean, default=False)
    is_active = db.Column(db.Boolean, default=True)
    is_debt_payment = db.Column(db.Boolean, default=False)
    linked_debt_account_id = db.Column(db.Integer, db.ForeignKey('debt_account.id'), nullable=True)
    notes = db.Column(db.String(500), nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    def __repr__(self) -> str:
        return f'<Bill {self.id} {self.bill_name}>'

    def to_dict(self):
        return {
            'id': self.id,
            'bill_name': self.bill_name,
            'amount': _dec_float(self.amount),
            'due_day_of_month': self.due_day_of_month,
            'category': self.category,
            'is_recurring': self.is_recurring,
            'is_auto_detected': self.is_auto_detected,
            'is_active': self.is_active,
            'is_debt_payment': self.is_debt_payment,
            'linked_debt_account_id': self.linked_debt_account_id,
            'notes': self.notes,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
