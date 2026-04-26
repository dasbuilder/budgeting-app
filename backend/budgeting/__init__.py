from flask import Flask
from flask_cors import CORS

from budgeting.config import Config
from budgeting.extensions import db


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    CORS(app)
    db.init_app(app)

    # Models must be imported inside the factory so SQLAlchemy discovers them
    # and so EncryptedType gets DB_ENCRYPTION_KEY from the already-loaded config
    from budgeting.models import Transaction, CategoryRule  # noqa: F401
    from budgeting.models import MonthlyBudget, DebtAccount, CreditCardPromo, StudentLoanItem  # noqa: F401
    from budgeting.models import Bill, BillCategory  # noqa: F401

    with app.app_context():
        db.create_all()
        _seed_default_rules()
        _seed_default_bill_categories()

    from budgeting.routes.transactions import transactions_bp
    from budgeting.routes.categories import categories_bp
    from budgeting.routes.debt import debt_bp
    from budgeting.routes.bills import bills_bp

    app.register_blueprint(transactions_bp)
    app.register_blueprint(categories_bp)
    app.register_blueprint(debt_bp)
    app.register_blueprint(bills_bp)

    return app


def _seed_default_rules():
    from budgeting.models import CategoryRule
    if CategoryRule.query.count() == 0:
        default_rules = [
            CategoryRule(category_name='Groceries', regex_pattern=r'grocery|supermarket|food|kroger|walmart|target.*food|whole foods|trader joe|safeway'),
            CategoryRule(category_name='Eating Out', regex_pattern=r'restaurant|mcdonald|burger|pizza|taco|subway|starbucks|coffee|cafe|diner'),
            CategoryRule(category_name='Fuel', regex_pattern=r'gas|fuel|shell|exxon|bp|chevron|mobil|station'),
            CategoryRule(category_name='Shopping', regex_pattern=r'amazon|ebay|store|shop|retail|mall|target(?!.*food)|walmart(?!.*food)|costco'),
            CategoryRule(category_name='Utilities', regex_pattern=r'electric|water|gas company|utility|phone|internet|cable'),
            CategoryRule(category_name='Transportation', regex_pattern=r'uber|lyft|taxi|bus|train|parking|toll'),
        ]
        for rule in default_rules:
            db.session.add(rule)
        db.session.commit()


def _seed_default_bill_categories():
    from budgeting.models import BillCategory
    if BillCategory.query.count() == 0:
        defaults = [
            'Housing', 'Utilities', 'Insurance', 'Subscriptions',
            'Transportation', 'Phone', 'Internet', 'Healthcare',
            'Education', 'Childcare', 'Groceries',
        ]
        for name in defaults:
            db.session.add(BillCategory(name=name))
        db.session.commit()
