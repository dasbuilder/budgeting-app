import re
from budgeting.extensions import db
from budgeting.models.transaction import CategoryRule, Transaction
from budgeting.models.bill import Bill


def auto_categorize_transaction(description: str, memo: str = '') -> str:
    text_to_match = f"{description} {memo}".lower()

    # 1. Check CategoryRules (regex-based, highest priority)
    rules = CategoryRule.query.filter_by(is_active=True).all()
    for rule in rules:
        try:
            if re.search(rule.regex_pattern.lower(), text_to_match):
                return rule.category_name
        except re.error:
            continue

    # 2. Check known Bills (name substring match, fallback before Uncategorized)
    bills = Bill.query.filter_by(is_active=True).all()
    for bill in bills:
        if bill.bill_name.lower() in text_to_match:
            return bill.category or bill.bill_name

    return 'Uncategorized'


def recategorize_all_transactions() -> int:
    try:
        transactions = Transaction.query.all()
        updated_count = 0
        print(f"Re-categorizing {len(transactions)} transactions...")
        for transaction in transactions:
            old_category = transaction.auto_category
            new_category = auto_categorize_transaction(transaction.description, transaction.memo or '')
            print(f"Transaction: '{transaction.description[:30]}' | Old: '{old_category}' | New: '{new_category}'")
            if old_category != new_category:
                transaction.auto_category = new_category
                if transaction.manual_category is None:
                    updated_count += 1
                    print(f"  -> UPDATED to: {new_category}")
                else:
                    print(f"  -> SKIPPED (manually categorized as: {transaction.manual_category})")
        db.session.commit()
        print(f"Re-categorized {updated_count} transactions")
        return updated_count
    except Exception as e:
        db.session.rollback()
        print(f"Error re-categorizing transactions: {e}")
        return 0
