import re
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from flask import Blueprint, jsonify, request

from budgeting.extensions import db
from budgeting.models.bill import Bill, BillCategory
from budgeting.models.debt import MonthlyBudget
from budgeting.models.transaction import Transaction
from budgeting.services.encryption_service import _enc_float, _dec_float

bills_bp = Blueprint('bills', __name__)


@bills_bp.route('/api/bills', methods=['GET'])
def get_bills():
    try:
        bills = (
            Bill.query
            .filter_by(is_active=True)
            .order_by(db.case((Bill.due_day_of_month.is_(None), 1), else_=0), Bill.due_day_of_month)
            .all()
        )
        return jsonify([b.to_dict() for b in bills])
    except Exception as e:
        return jsonify({'error': f'Error fetching bills: {str(e)}'}), 500


@bills_bp.route('/api/bill-categories', methods=['GET'])
def get_bill_categories():
    try:
        categories = BillCategory.query.order_by(BillCategory.name).all()
        return jsonify([c.to_dict() for c in categories])
    except Exception as e:
        return jsonify({'error': f'Error fetching bill categories: {str(e)}'}), 500


@bills_bp.route('/api/bill-categories', methods=['POST'])
def create_bill_category():
    try:
        data = request.get_json()
        if not data or not data.get('name', '').strip():
            return jsonify({'error': 'Category name is required'}), 400

        name = data['name'].strip()
        existing = BillCategory.query.filter(db.func.lower(BillCategory.name) == name.lower()).first()
        if existing:
            return jsonify(existing.to_dict())

        cat = BillCategory(name=name)
        db.session.add(cat)
        db.session.commit()
        return jsonify(cat.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Error creating bill category: {str(e)}'}), 500


@bills_bp.route('/api/bill-categories/<int:cat_id>', methods=['DELETE'])
def delete_bill_category(cat_id):
    try:
        cat = BillCategory.query.get_or_404(cat_id)
        # Clear category from any bills that reference it
        Bill.query.filter_by(category=cat.name).update({'category': None})
        db.session.delete(cat)
        db.session.commit()
        return jsonify({'message': 'Category deleted'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Error deleting bill category: {str(e)}'}), 500


@bills_bp.route('/api/bills', methods=['POST'])
def create_bill():
    try:
        data = request.get_json()
        if not data or 'bill_name' not in data or 'amount' not in data:
            return jsonify({'error': 'bill_name and amount are required'}), 400

        due_day = data.get('due_day_of_month')
        if due_day is not None:
            due_day = int(due_day)
            if due_day < 1 or due_day > 31:
                return jsonify({'error': 'due_day_of_month must be between 1 and 31'}), 400

        bill = Bill(
            bill_name=data['bill_name'].strip(),
            amount=_enc_float(data['amount']),
            due_day_of_month=due_day,
            category=(data.get('category') or '').strip() or None,
            is_recurring=data.get('is_recurring', True),
            is_auto_detected=data.get('is_auto_detected', False),
            is_debt_payment=data.get('is_debt_payment', False),
            linked_debt_account_id=data.get('linked_debt_account_id'),
            notes=(data.get('notes') or '').strip() or None,
        )
        db.session.add(bill)
        db.session.commit()

        response_data = bill.to_dict()

        # Warn if bill name fuzzy-matches a debt account
        from budgeting.models.debt import DebtAccount
        bill_lower = bill.bill_name.lower()
        for acct in DebtAccount.query.filter_by(is_active=True).all():
            if acct.account_name.lower() in bill_lower or bill_lower in acct.account_name.lower():
                response_data['warning'] = (
                    f'This bill name is similar to debt account "{acct.account_name}". '
                    f'Consider marking it as a debt payment to avoid double-counting.'
                )
                break

        return jsonify(response_data), 201
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Error creating bill: {str(e)}'}), 500


@bills_bp.route('/api/bills/<int:bill_id>', methods=['PUT'])
def update_bill(bill_id):
    try:
        bill = Bill.query.get_or_404(bill_id)
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        if 'bill_name' in data:
            bill.bill_name = data['bill_name'].strip()
        if 'amount' in data:
            bill.amount = _enc_float(data['amount'])
        if 'due_day_of_month' in data:
            due_day = data['due_day_of_month']
            if due_day is not None:
                due_day = int(due_day)
                if due_day < 1 or due_day > 31:
                    return jsonify({'error': 'due_day_of_month must be between 1 and 31'}), 400
            bill.due_day_of_month = due_day
        if 'category' in data:
            bill.category = (data['category'] or '').strip() or None
        if 'is_recurring' in data:
            bill.is_recurring = data['is_recurring']
        if 'is_debt_payment' in data:
            bill.is_debt_payment = bool(data['is_debt_payment'])
        if 'linked_debt_account_id' in data:
            bill.linked_debt_account_id = data['linked_debt_account_id']
        if 'notes' in data:
            bill.notes = (data['notes'] or '').strip() or None

        bill.updated_at = datetime.now(timezone.utc)
        db.session.commit()
        return jsonify(bill.to_dict())
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Error updating bill: {str(e)}'}), 500


@bills_bp.route('/api/bills/<int:bill_id>', methods=['DELETE'])
def delete_bill(bill_id):
    try:
        bill = Bill.query.get_or_404(bill_id)
        bill.is_active = False
        bill.updated_at = datetime.now(timezone.utc)
        db.session.commit()
        return jsonify({'message': 'Bill deleted successfully'})
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Error deleting bill: {str(e)}'}), 500


@bills_bp.route('/api/bills/summary', methods=['GET'])
def get_bills_summary():
    try:
        budget = MonthlyBudget.query.first()
        monthly_income = _dec_float(budget.monthly_net_income) if budget else 0.0
        fixed = _dec_float(budget.fixed_expenses) if budget else 0.0
        variable = _dec_float(budget.variable_expenses) if budget else 0.0

        active_bills = Bill.query.filter_by(is_active=True).all()
        total_bills = sum(_dec_float(b.amount) for b in active_bills)
        remaining = round(monthly_income - total_bills, 2)
        remaining_after_all = round(monthly_income - fixed - variable, 2)

        return jsonify({
            'monthly_income': monthly_income,
            'total_bills': total_bills,
            'remaining': remaining,
            'bill_count': len(active_bills),
            'variable_expenses': variable,
            'remaining_after_all_expenses': remaining_after_all,
        })
    except Exception as e:
        return jsonify({'error': f'Error fetching bills summary: {str(e)}'}), 500


def _normalize_description(desc: str) -> str:
    """Lowercase and strip trailing reference numbers / dates."""
    desc = desc.lower().strip()
    # Strip trailing digits/hashes that look like reference numbers
    desc = re.sub(r'\s+#?\d{4,}$', '', desc)
    # Strip trailing date-like patterns
    desc = re.sub(r'\s+\d{1,2}/\d{1,2}(/\d{2,4})?$', '', desc)
    return desc


@bills_bp.route('/api/bills/scan-transactions', methods=['POST'])
def scan_transactions():
    try:
        six_months_ago = datetime.now(timezone.utc) - timedelta(days=180)

        expenses = Transaction.query.filter(
            Transaction.amount < 0,
            Transaction.transaction_date >= six_months_ago.strftime('%Y-%m-%d'),
        ).all()

        # Group by normalized description
        groups = defaultdict(list)
        for txn in expenses:
            key = _normalize_description(txn.description)
            groups[key].append(txn)

        # Get existing bill names for exclusion
        existing_names = {
            b.bill_name.lower()
            for b in Bill.query.filter_by(is_active=True).all()
        }

        # Get debt account names for flagging potential debt payments
        from budgeting.models.debt import DebtAccount
        debt_account_names = {
            a.account_name.lower()
            for a in DebtAccount.query.filter_by(is_active=True).all()
        }

        suggestions = []
        for key, txns in groups.items():
            if key in existing_names:
                continue

            # Distinct months
            months = set()
            for t in txns:
                if t.transaction_date:
                    try:
                        dt = datetime.strptime(str(t.transaction_date)[:10], '%Y-%m-%d')
                        months.add((dt.year, dt.month))
                    except ValueError:
                        pass

            if len(months) < 3:
                continue

            amounts = [abs(t.amount) for t in txns]
            avg_amount = sum(amounts) / len(amounts)
            # Check consistency: all within 20% of average
            if avg_amount > 0 and all(abs(a - avg_amount) / avg_amount <= 0.20 for a in amounts):
                # Use the most common raw description as the suggested name
                desc_counts = defaultdict(int)
                for t in txns:
                    desc_counts[t.description] += 1
                best_desc = max(desc_counts, key=desc_counts.get)

                # Flag as possible debt payment if description matches a debt account
                possible_debt = any(
                    da in key or key in da
                    for da in debt_account_names
                )

                suggestions.append({
                    'bill_name': best_desc,
                    'estimated_amount': round(avg_amount, 2),
                    'frequency': 'monthly',
                    'confidence': min(len(months) / 6.0, 1.0),
                    'sample_descriptions': list(set(t.description for t in txns))[:5],
                    'possible_debt_payment': possible_debt,
                })

        # Sort by confidence descending
        suggestions.sort(key=lambda s: s['confidence'], reverse=True)
        return jsonify(suggestions)
    except Exception as e:
        return jsonify({'error': f'Error scanning transactions: {str(e)}'}), 500
