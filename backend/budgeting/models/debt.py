from datetime import datetime, timezone
from sqlalchemy.util import preloaded  # noqa: F401
from sqlalchemy_utils.types.encrypted.encrypted_type import StringEncryptedType as EncryptedType, AesEngine # type: ignore
from budgeting.extensions import db
from budgeting.config import DB_ENCRYPTION_KEY
from budgeting.services.encryption_service import _dec_float


class MonthlyBudget(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    monthly_net_income = db.Column(EncryptedType(db.String(50), DB_ENCRYPTION_KEY, AesEngine, 'pkcs5'), nullable=False, default='0.0')
    fixed_expenses = db.Column(EncryptedType(db.String(50), DB_ENCRYPTION_KEY, AesEngine, 'pkcs5'), nullable=False, default='0.0')
    variable_expenses = db.Column(EncryptedType(db.String(50), DB_ENCRYPTION_KEY, AesEngine, 'pkcs5'), nullable=False, default='0.0')
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    def __repr__(self) -> str:
        return f'<MonthlyBudget {self.id}>'

    def to_dict(self):
        income = _dec_float(self.monthly_net_income)
        fixed = _dec_float(self.fixed_expenses)
        variable = _dec_float(self.variable_expenses)
        return {
            'id': self.id,
            'monthly_net_income': income,
            'fixed_expenses': fixed,
            'variable_expenses': variable,
            'available_for_debt': round(income - fixed - variable, 2),
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


class DebtAccount(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    account_type = db.Column(db.String(20), nullable=False)
    account_name = db.Column(EncryptedType(db.String(200), DB_ENCRYPTION_KEY, AesEngine, 'pkcs5'), nullable=False)
    balance = db.Column(EncryptedType(db.String(50), DB_ENCRYPTION_KEY, AesEngine, 'pkcs5'), nullable=False, default='0.0')
    apr = db.Column(EncryptedType(db.String(50), DB_ENCRYPTION_KEY, AesEngine, 'pkcs5'), nullable=False, default='0.0')
    minimum_payment = db.Column(EncryptedType(db.String(50), DB_ENCRYPTION_KEY, AesEngine, 'pkcs5'), nullable=False, default='0.0')
    credit_limit = db.Column(EncryptedType(db.String(50), DB_ENCRYPTION_KEY, AesEngine, 'pkcs5'), nullable=True)
    loan_term_months = db.Column(db.Integer, nullable=True)
    start_date = db.Column(db.DateTime, nullable=True)
    is_active = db.Column(db.Boolean, default=True)
    is_excluded_from_analysis = db.Column(db.Boolean, default=False)
    priority_order = db.Column(db.Integer, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
    promos = db.relationship('CreditCardPromo', backref='account', lazy=True, cascade='all, delete-orphan')
    loan_items = db.relationship('StudentLoanItem', backref='account', lazy=True, cascade='all, delete-orphan')

    def __repr__(self) -> str:
        return f'<DebtAccount {self.id} {self.account_type}>'

    def to_dict(self):
        return {
            'id': self.id,
            'account_type': self.account_type,
            'account_name': self.account_name,
            'balance': _dec_float(self.balance),
            'apr': _dec_float(self.apr),
            'minimum_payment': _dec_float(self.minimum_payment),
            'credit_limit': _dec_float(self.credit_limit) if self.credit_limit else None,
            'loan_term_months': self.loan_term_months,
            'start_date': self.start_date.isoformat() if self.start_date else None,
            'is_excluded_from_analysis': self.is_excluded_from_analysis,
            'priority_order': self.priority_order,
            'promos': [p.to_dict() for p in self.promos],
            'loan_items': [l.to_dict() for l in self.loan_items],
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


class CreditCardPromo(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    debt_account_id = db.Column(db.Integer, db.ForeignKey('debt_account.id'), nullable=False)
    promo_balance = db.Column(EncryptedType(db.String(50), DB_ENCRYPTION_KEY, AesEngine, 'pkcs5'), nullable=False, default='0.0')
    promo_apr = db.Column(EncryptedType(db.String(50), DB_ENCRYPTION_KEY, AesEngine, 'pkcs5'), nullable=False, default='0.0')
    promo_expiry_date = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    def __repr__(self) -> str:
        return f'<CreditCardPromo {self.id} account={self.debt_account_id}>'

    def to_dict(self):
        return {
            'id': self.id,
            'debt_account_id': self.debt_account_id,
            'promo_balance': _dec_float(self.promo_balance),
            'promo_apr': _dec_float(self.promo_apr),
            'promo_expiry_date': self.promo_expiry_date.strftime('%Y-%m-%d') if self.promo_expiry_date else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }


class StudentLoanItem(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    debt_account_id = db.Column(db.Integer, db.ForeignKey('debt_account.id'), nullable=False)
    loan_name = db.Column(EncryptedType(db.String(200), DB_ENCRYPTION_KEY, AesEngine, 'pkcs5'), nullable=False)
    balance = db.Column(EncryptedType(db.String(50), DB_ENCRYPTION_KEY, AesEngine, 'pkcs5'), nullable=False, default='0.0')
    apr = db.Column(EncryptedType(db.String(50), DB_ENCRYPTION_KEY, AesEngine, 'pkcs5'), nullable=False, default='0.0')
    minimum_payment = db.Column(EncryptedType(db.String(50), DB_ENCRYPTION_KEY, AesEngine, 'pkcs5'), nullable=False, default='0.0')
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    def __repr__(self) -> str:
        return f'<StudentLoanItem {self.id} account={self.debt_account_id}>'

    def to_dict(self):
        return {
            'id': self.id,
            'debt_account_id': self.debt_account_id,
            'loan_name': self.loan_name,
            'balance': _dec_float(self.balance),
            'apr': _dec_float(self.apr),
            'minimum_payment': _dec_float(self.minimum_payment),
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'updated_at': self.updated_at.isoformat() if self.updated_at else None,
        }
