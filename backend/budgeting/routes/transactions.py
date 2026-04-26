import os
import tempfile
import traceback
import uuid

import pandas as pd
from flask import Blueprint, jsonify, request
from werkzeug.utils import secure_filename
from datetime import datetime

from budgeting.extensions import db
from budgeting.models.transaction import Transaction
from budgeting.services.csv_service import (
    detect_csv_format, process_csv_format1, process_csv_format2,
    extract_last_four, prettify_debit_type, prettify_credit_type,
)
from budgeting.services.category_service import auto_categorize_transaction, recategorize_all_transactions

transactions_bp = Blueprint('transactions', __name__)


@transactions_bp.route('/api/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy'})


@transactions_bp.route('/api/upload-csv', methods=['POST'])
def upload_csv():
    try:
        print(f"Received upload request. Files: {list(request.files.keys())}")
        print(f"Form data: {dict(request.form)}")

        if 'file' not in request.files:
            print("No file in request")
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']
        print(f"File received: {file.filename}, content type: {file.content_type}")

        if file.filename == '':
            return jsonify({'error': 'No file selected'}), 400

        if not file.filename.lower().endswith('.csv'):
            return jsonify({'error': 'Only CSV files are allowed'}), 400

        filename = secure_filename(file.filename)
        card_last_four = extract_last_four(file.filename)
        temp_path = os.path.join(tempfile.gettempdir(), f"{uuid.uuid4()}_{filename}")
        print(f"Saving file to: {temp_path}")
        file.save(temp_path)

        try:
            print("Reading CSV file...")
            df = pd.read_csv(temp_path, header=0, index_col=False)
            print(f"CSV loaded successfully. Shape: {df.shape}")
            print(f"Columns: {list(df.columns)}")
            print(f"First few rows:\n{df.head()}")

            if df.empty:
                return jsonify({'error': 'CSV file is empty'}), 400

            csv_format = detect_csv_format(df)
            print(f"Detected format: {csv_format}")

            if csv_format == 'format1':
                transactions = process_csv_format1(df, card_last_four=card_last_four)
            else:
                transactions = process_csv_format2(df, card_last_four=card_last_four)

            print(f"Processed {len(transactions)} transactions")

            # Deduplication: fetch existing (date, description, amount) tuples
            # for the date range covered by this upload, then skip matches.
            dated = [t for t in transactions if t.transaction_date]
            if dated:
                min_date = min(t.transaction_date for t in dated)
                max_date = max(t.transaction_date for t in dated)
                existing_rows = db.session.query(
                    Transaction.transaction_date,
                    Transaction.description,
                    Transaction.amount,
                ).filter(
                    Transaction.transaction_date >= min_date,
                    Transaction.transaction_date <= max_date,
                ).all()
                existing_set = {(r.transaction_date, r.description, r.amount) for r in existing_rows}
            else:
                existing_set = set()

            saved_count = 0
            duplicate_count = 0
            for transaction in transactions:
                if transaction.transaction_date:
                    key = (transaction.transaction_date, transaction.description, transaction.amount)
                    if key in existing_set:
                        duplicate_count += 1
                        continue
                    transaction.auto_category = auto_categorize_transaction(
                        transaction.description, transaction.memo or ''
                    )
                    db.session.add(transaction)
                    saved_count += 1

            db.session.commit()
            print(f"Successfully saved {saved_count} transactions, skipped {duplicate_count} duplicates")

            return jsonify({
                'message': f'Successfully imported {saved_count} transactions',
                'format_detected': csv_format,
                'total_rows': len(df),
                'saved_transactions': saved_count,
                'duplicate_transactions': duplicate_count,
            })

        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)
                print(f"Cleaned up temp file: {temp_path}")

    except Exception as e:
        print(f"Error processing file: {str(e)}")
        traceback.print_exc()
        db.session.rollback()
        return jsonify({'error': f'Error processing file: {str(e)}'}), 500


def _apply_common_filters(query):
    """Apply shared filter params (type, category, dates, card_source, card_last_four) to a query."""
    transaction_type = request.args.get('type')
    category = request.args.get('category')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    card_source = request.args.get('card_source')
    card_last_four = request.args.get('card_last_four')

    if transaction_type:
        query = query.filter(Transaction.transaction_type.ilike(f'%{transaction_type}%'))
    if category:
        query = query.filter(
            db.or_(
                Transaction.manual_category.ilike(f'%{category}%'),
                Transaction.auto_category.ilike(f'%{category}%'),
            )
        )
    if start_date:
        start_dt = datetime.strptime(start_date, '%Y-%m-%d')
        query = query.filter(Transaction.transaction_date >= start_dt)
    if end_date:
        end_dt = datetime.strptime(end_date, '%Y-%m-%d')
        query = query.filter(Transaction.transaction_date <= end_dt)
    if card_source:
        query = query.filter(Transaction.card_source == card_source)
    if card_last_four:
        query = query.filter(Transaction.card_last_four == card_last_four)

    return query


@transactions_bp.route('/api/transactions', methods=['GET'])
def get_transactions():
    try:
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 100))

        query = _apply_common_filters(Transaction.query)
        query = query.order_by(Transaction.transaction_date.desc())
        transactions = query.paginate(page=page, per_page=per_page, error_out=False)

        return jsonify({
            'transactions': [
                {
                    'id': t.id,
                    'transaction_date': t.transaction_date.isoformat() if t.transaction_date else None,
                    'post_date': t.post_date.isoformat() if t.post_date else None,
                    'description': t.description,
                    'category': t.manual_category or t.auto_category,
                    'auto_category': t.auto_category,
                    'manual_category': t.manual_category,
                    'transaction_type': t.transaction_type,
                    'amount': t.amount,
                    'memo': t.memo,
                    'balance': t.balance,
                    'check_number': t.check_number,
                    'csv_format': t.csv_format,
                    'card_source': t.card_source,
                    'card_last_four': t.card_last_four,
                }
                for t in transactions.items
            ],
            'pagination': {
                'page': transactions.page,
                'pages': transactions.pages,
                'per_page': transactions.per_page,
                'total': transactions.total,
            },
        })

    except Exception as e:
        return jsonify({'error': f'Error fetching transactions: {str(e)}'}), 500


@transactions_bp.route('/api/transaction-types', methods=['GET'])
def get_transaction_types():
    rows = db.session.query(Transaction.transaction_type).filter(
        Transaction.transaction_type.isnot(None),
        Transaction.transaction_type != '',
    ).distinct().all()
    types = sorted(r[0] for r in rows)
    return jsonify(types)


@transactions_bp.route('/api/card-sources', methods=['GET'])
def get_card_sources():
    source_rows = db.session.query(Transaction.card_source).filter(
        Transaction.card_source.isnot(None),
    ).distinct().all()
    sources = sorted(r[0] for r in source_rows)

    card_rows = db.session.query(
        Transaction.card_source, Transaction.card_last_four
    ).filter(
        Transaction.card_source.isnot(None),
        Transaction.card_last_four.isnot(None),
    ).distinct().all()
    cards = [{'source': r[0], 'last_four': r[1]} for r in card_rows]

    return jsonify({'sources': sources, 'cards': cards})


@transactions_bp.route('/api/recategorize-all', methods=['POST'])
def recategorize_all_endpoint():
    try:
        updated_count = recategorize_all_transactions()
        return jsonify({
            'message': f'Successfully re-categorized {updated_count} transactions',
            'updated_count': updated_count,
        })
    except Exception as e:
        return jsonify({'error': f'Error re-categorizing transactions: {str(e)}'}), 500


@transactions_bp.route('/api/clear-database', methods=['DELETE'])
def clear_database():
    try:
        transaction_count = Transaction.query.count()
        Transaction.query.delete()
        db.session.commit()
        print(f"Cleared {transaction_count} transactions from database")
        return jsonify({
            'message': f'Successfully cleared {transaction_count} transactions from database',
            'cleared_count': transaction_count,
        })
    except Exception as e:
        db.session.rollback()
        print(f"Error clearing database: {str(e)}")
        return jsonify({'error': f'Error clearing database: {str(e)}'}), 500


@transactions_bp.route('/api/backfill-transaction-types', methods=['POST'])
def backfill_transaction_types():
    try:
        updated = 0

        # Backfill card_source for existing rows (format1=credit card, format2=debit/checking)
        db.session.query(Transaction).filter(
            Transaction.csv_format == 'format1',
            Transaction.card_source.is_(None),
        ).update({Transaction.card_source: 'credit'}, synchronize_session=False)

        db.session.query(Transaction).filter(
            Transaction.csv_format == 'format2',
            Transaction.card_source.is_(None),
        ).update({Transaction.card_source: 'debit'}, synchronize_session=False)

        # Normalize credit card (format1) transaction type casing
        format1_txns = Transaction.query.filter_by(csv_format='format1').all()
        for t in format1_txns:
            pretty = prettify_credit_type(t.transaction_type)
            if pretty and pretty != t.transaction_type:
                t.transaction_type = pretty
                updated += 1

        # Prettify debit/checking (format2) transaction types via label mapping
        # The raw Type column values (ACH_DEBIT, MISC_DEBIT, etc.) may have been
        # title-cased by a previous backfill, so we normalize to uppercase first.
        format2_txns = Transaction.query.filter_by(csv_format='format2').all()
        for t in format2_txns:
            raw = t.transaction_type.replace(' ', '_').upper() if t.transaction_type else ''
            pretty = prettify_debit_type(raw)
            new_type = pretty if pretty else t.transaction_type
            if new_type != t.transaction_type:
                t.transaction_type = new_type
                updated += 1

        db.session.commit()
        return jsonify({
            'message': f'Backfill complete. Updated {updated} transaction types.',
            'updated_count': updated,
        })
    except Exception as e:
        db.session.rollback()
        return jsonify({'error': f'Backfill failed: {str(e)}'}), 500


@transactions_bp.route('/api/stats', methods=['GET'])
def get_stats():
    try:
        query = _apply_common_filters(Transaction.query)

        total_transactions = query.count()

        # Income query: date range only — ignores type/category filters so income
        # is always correct regardless of what the user is filtering by.
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')
        income_query = Transaction.query
        if start_date:
            start_dt = datetime.strptime(start_date, '%Y-%m-%d')
            income_query = income_query.filter(Transaction.transaction_date >= start_dt)
        if end_date:
            end_dt = datetime.strptime(end_date, '%Y-%m-%d')
            income_query = income_query.filter(Transaction.transaction_date <= end_dt)
        excluded_income_types = ('Account Transfer', 'Chase Transfer In')
        total_income = income_query.with_entities(
            db.func.sum(Transaction.amount)
        ).filter(
            Transaction.amount > 0,
            Transaction.card_source != 'credit',
            Transaction.transaction_type.notin_(excluded_income_types),
        ).scalar() or 0.0

        date_range = query.with_entities(
            db.func.min(Transaction.transaction_date),
            db.func.max(Transaction.transaction_date),
        ).first()

        categories = query.with_entities(
            db.func.coalesce(Transaction.manual_category, Transaction.auto_category).label('category'),
            db.func.count().label('count'),
            db.func.sum(Transaction.amount).label('total_amount'),
        ).group_by(
            db.func.coalesce(Transaction.manual_category, Transaction.auto_category)
        ).all()

        return jsonify({
            'total_transactions': total_transactions,
            'total_income': float(total_income),
            'date_range': {
                'earliest': date_range[0].isoformat() if date_range[0] else None,
                'latest': date_range[1].isoformat() if date_range[1] else None,
            },
            'categories': [
                {
                    'category': cat.category,
                    'count': cat.count,
                    'total_amount': float(cat.total_amount),
                }
                for cat in categories
            ],
            'filters_applied': {
                'type': request.args.get('type'),
                'category': request.args.get('category'),
                'start_date': start_date,
                'end_date': end_date,
                'card_source': request.args.get('card_source'),
                'card_last_four': request.args.get('card_last_four'),
            },
        })

    except Exception as e:
        return jsonify({'error': f'Error fetching stats: {str(e)}'}), 500


@transactions_bp.route('/api/budget-from-transactions', methods=['GET'])
def get_budget_from_transactions():
    try:
        start_date = request.args.get('start_date')
        end_date = request.args.get('end_date')

        query = Transaction.query
        if start_date:
            start_dt = datetime.strptime(start_date, '%Y-%m-%d')
            query = query.filter(Transaction.transaction_date >= start_dt)
        if end_date:
            end_dt = datetime.strptime(end_date, '%Y-%m-%d')
            query = query.filter(Transaction.transaction_date <= end_dt)

        # Only count debit-account inflows as income, excluding internal transfers.
        # Credit card positive amounts are payment credits, not income.
        excluded_types = ('Account Transfer', 'Chase Transfer In')
        total_income = query.with_entities(
            db.func.sum(Transaction.amount)
        ).filter(
            Transaction.amount > 0,
            Transaction.card_source != 'credit',
            Transaction.transaction_type.notin_(excluded_types),
        ).scalar() or 0.0

        # Only count debit-account outflows as expenses, excluding internal transfers.
        # Credit card line items are excluded because the CC payment from checking
        # already captures that spending (avoids double-counting).
        excluded_expense_types = ('Account Transfer',)
        total_expenses = query.with_entities(
            db.func.sum(Transaction.amount)
        ).filter(
            Transaction.amount < 0,
            Transaction.card_source != 'credit',
            Transaction.transaction_type.notin_(excluded_expense_types),
        ).scalar() or 0.0
        total_expenses = abs(float(total_expenses))

        # Compute months from date range span (not distinct calendar months,
        # which over-counts when a short range straddles two calendar months).
        if start_date and end_date:
            span_days = (end_dt - start_dt).days
            months_counted = max(round(span_days / 30.44), 1)
        else:
            months_counted = query.with_entities(
                db.func.count(db.func.distinct(
                    db.func.strftime('%Y-%m', Transaction.transaction_date)
                ))
            ).scalar() or 1
            months_counted = max(months_counted, 1)

        return jsonify({
            'monthly_net_income': round(float(total_income) / months_counted, 2),
            'monthly_expenses': round(total_expenses / months_counted, 2),
            'total_income': round(float(total_income), 2),
            'total_expenses': round(total_expenses, 2),
            'months_counted': months_counted,
            'date_range': {
                'start_date': start_date,
                'end_date': end_date,
            },
        })

    except Exception as e:
        return jsonify({'error': f'Error computing budget from transactions: {str(e)}'}), 500
