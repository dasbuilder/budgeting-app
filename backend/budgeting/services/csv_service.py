import re

import pandas as pd
from datetime import datetime


DEBIT_TYPE_LABELS = {
    'MISC_DEBIT': 'Misc Debit',
    'MISC_CREDIT': 'Misc Credit',
    'ACH_DEBIT': 'ACH Debit',
    'ACH_CREDIT': 'ACH Credit',
    'DEBIT_CARD': 'Debit Card',
    'ACCT_XFER': 'Account Transfer',
    'LOAN_PMT': 'Loan Payment',
    'CHECK_DEPOSIT': 'Check Deposit',
    'QUICKPAY_CREDIT': 'QuickPay Credit',
    'QUICKPAY_DEBIT': 'QuickPay Debit',
    'ATM': 'ATM',
    'ATM_DEPOSIT': 'ATM Deposit',
    'BILLPAY': 'Bill Pay',
    'FEE_TRANSACTION': 'Fee',
    'DEPOSIT': 'Deposit',
    'CHASE_TO_PARTNERFI': 'Chase Transfer Out',
    'PARTNERFI_TO_CHASE': 'Chase Transfer In',
}


def prettify_debit_type(memo):
    if pd.isna(memo) or str(memo).strip() == '' or str(memo).strip().lower() == 'nan':
        return None
    raw = str(memo).strip()
    if raw in DEBIT_TYPE_LABELS:
        return DEBIT_TYPE_LABELS[raw]
    return raw.replace('_', ' ').title()


def prettify_credit_type(type_val):
    if pd.isna(type_val) or str(type_val).strip() == '':
        return ''
    return str(type_val).strip().title()


def extract_last_four(filename):
    if not filename:
        return None
    match = re.search(r'Chase(\d{4})', filename)
    return match.group(1) if match else None


def detect_csv_format(df) -> str:
    columns = [col.lower().strip() for col in df.columns]
    format1_indicators = ['transaction date', 'post date', 'description', 'category', 'type', 'amount', 'memo']
    format2_indicators = ['details', 'posting date', 'description', 'amount', 'type', 'balance', 'check or slip #']
    format1_matches = sum(1 for ind in format1_indicators if any(ind in col for col in columns))
    format2_matches = sum(1 for ind in format2_indicators if any(ind in col for col in columns))
    return 'format1' if format1_matches >= format2_matches else 'format2'


def parse_date(date_str):
    if pd.isna(date_str) or date_str == '':
        return None
    date_formats = ['%m/%d/%Y', '%m-%d-%Y', '%Y-%m-%d', '%m/%d/%y', '%m-%d-%y', '%Y/%m/%d']
    for fmt in date_formats:
        try:
            return datetime.strptime(str(date_str).strip(), fmt)
        except ValueError:
            continue
    try:
        return pd.to_datetime(date_str)
    except Exception:
        return None


def process_csv_format1(df, card_last_four=None) -> list:
    """Format1: credit card CSV (Transaction Date, Post Date, Description, Category, Type, Amount, Memo)."""
    from budgeting.models.transaction import Transaction
    transactions = []
    for _, row in df.iterrows():
        transactions.append(Transaction(
            transaction_date=parse_date(row.get('Transaction Date', '')),
            post_date=parse_date(row.get('Post Date', '')),
            description=str(row.get('Description', '')).strip(),
            category=str(row.get('Category', '')).strip(),
            transaction_type=prettify_credit_type(row.get('Type', '')),
            amount=float(row.get('Amount', 0)),
            memo=str(row.get('Memo', '')).strip(),
            csv_format='format1',
            card_source='credit',
            card_last_four=card_last_four,
        ))
    return transactions


def process_csv_format2(df, card_last_four=None) -> list:
    """Format2: debit/checking CSV (Details, Posting Date, Description, Amount, Type, Balance, Check or Slip #)."""
    from budgeting.models.transaction import Transaction
    transactions = []
    for _, row in df.iterrows():
        raw_type = str(row.get('Type', '')).strip()
        pretty = prettify_debit_type(raw_type)
        txn_type = pretty if pretty else raw_type
        transactions.append(Transaction(
            transaction_date=parse_date(row.get('Posting Date', '')),
            post_date=parse_date(row.get('Posting Date', '')),
            description=str(row.get('Description', '')).strip(),
            category='',
            transaction_type=txn_type,
            amount=float(row.get('Amount', 0)),
            memo=str(row.get('Details', '')).strip(),
            balance=float(row.get('Balance', 0)) if row.get('Balance') and str(row.get('Balance')).strip() else None,
            check_number=str(row.get('Check or Slip #', '')).strip(),
            csv_format='format2',
            card_source='debit',
            card_last_four=card_last_four,
        ))
    return transactions
