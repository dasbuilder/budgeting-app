import json
import os
import tempfile
import traceback
import uuid

import pandas as pd
from datetime import datetime, timezone
from flask import Blueprint, Response, jsonify, request, stream_with_context
from werkzeug.utils import secure_filename

from budgeting.config import ANTHROPIC_API_KEY, GEMINI_API_KEY
from budgeting.extensions import db
from budgeting.models.debt import CreditCardPromo, DebtAccount, MonthlyBudget, StudentLoanItem
from budgeting.services.csv_service import parse_date
from budgeting.services.encryption_service import _dec_float, _enc_float
from budgeting.services.payoff_service import build_debts_for_analysis, run_payoff_simulation

debt_bp = Blueprint('debt', __name__, url_prefix='/api/debt')


def _enrich_budget(budget):
    """Add computed fields (minimums, bills, overlap, available_for_extra_debt) to a budget dict."""
    from budgeting.models.bill import Bill

    result = budget.to_dict()
    income = _dec_float(budget.monthly_net_income)
    fixed = _dec_float(budget.fixed_expenses)
    variable = _dec_float(budget.variable_expenses)

    active_accounts = DebtAccount.query.filter_by(is_active=True).all()
    included_accounts = [a for a in active_accounts if not a.is_excluded_from_analysis]
    total_minimums = sum(_dec_float(a.minimum_payment) for a in included_accounts)

    active_bills = Bill.query.filter_by(is_active=True).all()
    total_bills = sum(_dec_float(b.amount) for b in active_bills)
    debt_bill_total = sum(_dec_float(b.amount) for b in active_bills if b.is_debt_payment)

    # Bills-based budgeting: declared bills drive the expense calculation.
    # Debt-payment bills overlap with total_minimums, so exclude them to avoid double-counting.
    non_debt_bills = total_bills - debt_bill_total
    # Any debt minimums NOT tracked as bills still need to be subtracted.
    non_bill_minimums = max(0, total_minimums - debt_bill_total)

    result['total_minimum_payments'] = total_minimums
    result['total_bills'] = total_bills
    result['debt_payment_overlap'] = debt_bill_total
    result['available_for_extra_debt'] = round(income - fixed - non_debt_bills - non_bill_minimums, 2)
    return result


def _stream_gemini(prompt: str):
    import google.genai as genai
    client = genai.Client(api_key=GEMINI_API_KEY)
    for chunk in client.models.generate_content_stream(
        model='gemini-2.0-flash', contents=prompt
    ):
        if chunk.text:
            yield f"data: {json.dumps({'text': chunk.text})}\n\n"


@debt_bp.route('/budget', methods=['GET'])
def get_debt_budget():
    try:
        budget = MonthlyBudget.query.first()
        if not budget:
            return jsonify({
                'id': None,
                'monthly_net_income': 0.0,
                'fixed_expenses': 0.0,
                'variable_expenses': 0.0,
                'available_for_debt': 0.0,
                'total_minimum_payments': 0.0,
                'total_bills': 0.0,
                'debt_payment_overlap': 0.0,
                'available_for_extra_debt': 0.0,
                'updated_at': None,
            })

        return jsonify(_enrich_budget(budget))
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': f'Error fetching budget: {str(e)}'}), 500


@debt_bp.route('/budget', methods=['POST'])
def save_debt_budget():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        required = ['monthly_net_income', 'fixed_expenses', 'variable_expenses']
        for field in required:
            print(field)
            if field not in data:
                return jsonify({'error': f'{field} is required'}), 400
            if float(data[field]) < 0:
                return jsonify({'error': f'{field} must be non-negative'}), 400

        budget = MonthlyBudget.query.first()
        if not budget:
            budget = MonthlyBudget()
            db.session.add(budget)

        budget.monthly_net_income = _enc_float(data['monthly_net_income'])
        budget.fixed_expenses = _enc_float(data['fixed_expenses'])
        budget.variable_expenses = _enc_float(data['variable_expenses'])
        budget.updated_at = datetime.now(timezone.utc)
        db.session.commit()
        return jsonify(_enrich_budget(budget))
    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({'error': f'Error saving budget: {str(e)}'}), 500


@debt_bp.route('/accounts', methods=['GET'])
def get_debt_accounts():
    try:
        accounts = DebtAccount.query.filter_by(is_active=True).order_by(DebtAccount.created_at).all()
        return jsonify({'accounts': [a.to_dict() for a in accounts]})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': f'Error fetching accounts: {str(e)}'}), 500


@debt_bp.route('/accounts', methods=['POST'])
def create_debt_account():
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        valid_types = ['credit_card', 'mortgage', 'student_loan', 'loan']
        if data.get('account_type') not in valid_types:
            return jsonify({'error': f'account_type must be one of: {", ".join(valid_types)}'}), 400

        if not data.get('account_name', '').strip():
            return jsonify({'error': 'account_name is required'}), 400

        is_excluded = data.get('is_excluded_from_analysis', data.get('account_type') == 'mortgage')

        account = DebtAccount(
            account_type=data['account_type'],
            account_name=data['account_name'].strip(),
            balance=_enc_float(data.get('balance', 0)),
            apr=_enc_float(data.get('apr', 0)),
            minimum_payment=_enc_float(data.get('minimum_payment', 0)),
            credit_limit=_enc_float(data['credit_limit']) if data.get('account_type') == 'credit_card' and data.get('credit_limit') else None,
            loan_term_months=data.get('loan_term_months'),
            start_date=parse_date(data['start_date']) if data.get('start_date') else None,
            is_excluded_from_analysis=is_excluded,
            priority_order=data.get('priority_order'),
        )
        db.session.add(account)
        db.session.commit()

        response_data = account.to_dict()

        # Warn if account name fuzzy-matches a bill
        from budgeting.models.bill import Bill
        acct_lower = account.account_name.lower()
        for bill in Bill.query.filter_by(is_active=True).all():
            if bill.bill_name.lower() in acct_lower or acct_lower in bill.bill_name.lower():
                if not bill.is_debt_payment:
                    response_data['warning'] = (
                        f'A bill named "{bill.bill_name}" looks similar to this account. '
                        f'Consider marking it as a debt payment to avoid double-counting in analysis.'
                    )
                break

        return jsonify(response_data), 201
    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({'error': f'Error creating account: {str(e)}'}), 500


@debt_bp.route('/accounts/<int:account_id>', methods=['PUT'])
def update_debt_account(account_id: int):
    try:
        account = DebtAccount.query.get_or_404(account_id)
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        if 'account_name' in data:
            account.account_name = data['account_name'].strip()
        if 'balance' in data:
            account.balance = _enc_float(data['balance'])
        if 'apr' in data:
            account.apr = _enc_float(data['apr'])
        if 'minimum_payment' in data:
            account.minimum_payment = _enc_float(data['minimum_payment'])
        if 'loan_term_months' in data:
            account.loan_term_months = data['loan_term_months']
        if 'start_date' in data:
            account.start_date = parse_date(data['start_date']) if data['start_date'] else None
        if 'is_excluded_from_analysis' in data:
            account.is_excluded_from_analysis = bool(data['is_excluded_from_analysis'])
        if 'priority_order' in data:
            account.priority_order = data['priority_order']
        if 'credit_limit' in data:
            account.credit_limit = _enc_float(data['credit_limit']) if data['credit_limit'] else None

        account.updated_at = datetime.now(timezone.utc)
        db.session.commit()
        return jsonify(account.to_dict())
    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({'error': f'Error updating account: {str(e)}'}), 500


@debt_bp.route('/accounts/<int:account_id>', methods=['DELETE'])
def delete_debt_account(account_id: int):
    try:
        account = DebtAccount.query.get_or_404(account_id)
        account.is_active = False
        account.updated_at = datetime.now(timezone.utc)
        db.session.commit()
        return jsonify({'message': 'Account deleted'})
    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({'error': f'Error deleting account: {str(e)}'}), 500


@debt_bp.route('/accounts/<int:account_id>/promos', methods=['GET'])
def get_debt_promos(account_id: int):
    try:
        account = DebtAccount.query.get_or_404(account_id)
        return jsonify({'promos': [p.to_dict() for p in account.promos]})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': f'Error fetching promos: {str(e)}'}), 500


@debt_bp.route('/accounts/<int:account_id>/promos', methods=['POST'])
def create_debt_promo(account_id: int):
    try:
        DebtAccount.query.get_or_404(account_id)
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        promo = CreditCardPromo(
            debt_account_id=account_id,
            promo_balance=_enc_float(data.get('promo_balance', 0)),
            promo_apr=_enc_float(data.get('promo_apr', 0)),
            promo_expiry_date=parse_date(data['promo_expiry_date']) if data.get('promo_expiry_date') else None,
        )
        db.session.add(promo)
        db.session.commit()
        return jsonify(promo.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({'error': f'Error creating promo: {str(e)}'}), 500


@debt_bp.route('/accounts/<int:account_id>/promos/<int:promo_id>', methods=['PUT'])
def update_debt_promo(account_id: int, promo_id: int):
    try:
        promo = CreditCardPromo.query.filter_by(id=promo_id, debt_account_id=account_id).first_or_404()
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        if 'promo_balance' in data:
            promo.promo_balance = _enc_float(data['promo_balance'])
        if 'promo_apr' in data:
            promo.promo_apr = _enc_float(data['promo_apr'])
        if 'promo_expiry_date' in data:
            promo.promo_expiry_date = parse_date(data['promo_expiry_date']) if data['promo_expiry_date'] else None
        promo.updated_at = datetime.now(timezone.utc)
        db.session.commit()
        return jsonify(promo.to_dict())
    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({'error': f'Error updating promo: {str(e)}'}), 500


@debt_bp.route('/accounts/<int:account_id>/promos/<int:promo_id>', methods=['DELETE'])
def delete_debt_promo(account_id: int, promo_id: int):
    try:
        promo = CreditCardPromo.query.filter_by(id=promo_id, debt_account_id=account_id).first_or_404()
        db.session.delete(promo)
        db.session.commit()
        return jsonify({'message': 'Promo deleted'})
    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({'error': f'Error deleting promo: {str(e)}'}), 500


@debt_bp.route('/accounts/<int:account_id>/loans', methods=['GET'])
def get_student_loan_items(account_id: int):
    try:
        account = DebtAccount.query.get_or_404(account_id)
        return jsonify({'loan_items': [l.to_dict() for l in account.loan_items]})
    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': f'Error fetching loan items: {str(e)}'}), 500


@debt_bp.route('/accounts/<int:account_id>/loans', methods=['POST'])
def create_student_loan_item(account_id: int):
    try:
        DebtAccount.query.get_or_404(account_id)
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        if not data.get('loan_name', '').strip():
            return jsonify({'error': 'loan_name is required'}), 400

        item = StudentLoanItem(
            debt_account_id=account_id,
            loan_name=data['loan_name'].strip(),
            balance=_enc_float(data.get('balance', 0)),
            apr=_enc_float(data.get('apr', 0)),
            minimum_payment=_enc_float(data.get('minimum_payment', 0)),
        )
        db.session.add(item)
        db.session.commit()
        return jsonify(item.to_dict()), 201
    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({'error': f'Error creating loan item: {str(e)}'}), 500


@debt_bp.route('/accounts/<int:account_id>/loans/<int:loan_id>', methods=['PUT'])
def update_student_loan_item(account_id: int, loan_id: int):
    try:
        item = StudentLoanItem.query.filter_by(id=loan_id, debt_account_id=account_id).first_or_404()
        data = request.get_json()
        if not data:
            return jsonify({'error': 'No data provided'}), 400

        if 'loan_name' in data:
            item.loan_name = data['loan_name'].strip()
        if 'balance' in data:
            item.balance = _enc_float(data['balance'])
        if 'apr' in data:
            item.apr = _enc_float(data['apr'])
        if 'minimum_payment' in data:
            item.minimum_payment = _enc_float(data['minimum_payment'])
        item.updated_at = datetime.now(timezone.utc)
        db.session.commit()
        return jsonify(item.to_dict())
    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({'error': f'Error updating loan item: {str(e)}'}), 500


@debt_bp.route('/accounts/<int:account_id>/loans/<int:loan_id>', methods=['DELETE'])
def delete_student_loan_item(account_id: int, loan_id: int):
    try:
        item = StudentLoanItem.query.filter_by(id=loan_id, debt_account_id=account_id).first_or_404()
        db.session.delete(item)
        db.session.commit()
        return jsonify({'message': 'Loan item deleted'})
    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({'error': f'Error deleting loan item: {str(e)}'}), 500


@debt_bp.route('/analyze', methods=['POST'])
def analyze_debt():
    try:
        data = request.get_json() or {}
        include_mortgage = data.get('include_mortgage', False)

        try:
            debts, available_extra, budget_summary, excluded_count = build_debts_for_analysis(include_mortgage)
        except ValueError as e:
            return jsonify({'error': str(e)}), 400

        if available_extra < 0:
            total_minimums = budget_summary['total_minimum_payments']
            spendable = budget_summary['monthly_net_income'] - budget_summary['fixed_expenses'] - budget_summary['variable_expenses']
            return jsonify({
                'error': (
                    f'Total minimum payments (${total_minimums:,.2f}) exceed your available monthly '
                    f'budget (${spendable:,.2f}). Adjust your budget or debt accounts.'
                )
            }), 400

        snowball = run_payoff_simulation(debts, available_extra, 'snowball')
        avalanche = run_payoff_simulation(debts, available_extra, 'avalanche')

        interest_savings = round(snowball['total_interest_paid'] - avalanche['total_interest_paid'], 2)
        months_saved = snowball['months_to_payoff'] - avalanche['months_to_payoff']
        recommended = 'avalanche' if interest_savings > 0 else 'snowball'

        anthropic_ok = bool(ANTHROPIC_API_KEY and ANTHROPIC_API_KEY != 'your-key-here')
        gemini_ok = bool(GEMINI_API_KEY and GEMINI_API_KEY != 'your-key-here')
        ai_available = anthropic_ok or gemini_ok

        return jsonify({
            'inputs': budget_summary,
            'snowball': snowball,
            'avalanche': avalanche,
            'comparison': {
                'interest_savings_with_avalanche': interest_savings,
                'months_saved_with_avalanche': months_saved,
                'recommended_method': recommended,
            },
            'ai_available': ai_available,
        })

    except Exception as e:
        traceback.print_exc()
        return jsonify({'error': f'Error running analysis: {str(e)}'}), 500


@debt_bp.route('/analyze/recommendation', methods=['POST'])
def stream_debt_recommendation():
    try:
        data = request.get_json() or {}
        include_mortgage = data.get('include_mortgage', False)

        anthropic_ok = bool(ANTHROPIC_API_KEY and ANTHROPIC_API_KEY != 'your-key-here')
        gemini_ok = bool(GEMINI_API_KEY and GEMINI_API_KEY != 'your-key-here')
        if not (anthropic_ok or gemini_ok):
            return jsonify({'error': 'AI recommendations are not configured.'}), 503

        try:
            debts, available_extra, budget_summary, _ = build_debts_for_analysis(include_mortgage)
        except ValueError as e:
            return jsonify({'error': str(e)}), 400

        income = budget_summary['monthly_net_income']
        fixed = budget_summary['fixed_expenses']
        variable = budget_summary['variable_expenses']
        adjusted_variable = budget_summary.get('adjusted_variable_expenses', variable)
        debt_overlap = budget_summary.get('debt_payment_overlap', 0)
        total_bills = budget_summary.get('total_bills', 0)
        bill_details = budget_summary.get('bill_details', [])

        snowball = run_payoff_simulation(debts, available_extra, 'snowball')
        avalanche = run_payoff_simulation(debts, available_extra, 'avalanche')
        interest_savings = round(snowball['total_interest_paid'] - avalanche['total_interest_paid'], 2)

        debt_line_parts = []
        for d in debts:
            line = f"- {d['name']}: ${d['balance']:,.2f} balance, {d['apr']}% APR, ${d['minimum_payment']:,.2f}/mo minimum"
            if d.get('credit_limit') and d['credit_limit'] > 0:
                util = (d['balance'] / d['credit_limit']) * 100
                line += f", ${d['credit_limit']:,.2f} credit limit ({util:.1f}% utilization)"
            debt_line_parts.append(line)
        debt_lines = '\n'.join(debt_line_parts)

        bills_section = ''
        if bill_details:
            bill_lines = '\n'.join(f"- {b['name']}: ${b['amount']:,.2f}/mo" for b in bill_details)
            bills_section = f"""
### Monthly Bills (${total_bills:,.2f}/mo total):

{bill_lines}
"""
        overlap_note = ''
        if debt_overlap > 0:
            overlap_note = f"""
*Note: Variable expenses have been adjusted down by ${debt_overlap:,.2f}/mo to avoid double-counting debt payments that appear in both transaction history and debt minimum payments.*
"""
        prompt = f"""### Role: You are a senior financial strategist known for holistic wealth management. Your goal is to analyze the user's debt through the lens of cash-flow optimization and long-term financial health, moving beyond basic calculator outputs.
### Financial Data:

* Monthly Net Income: ${income:,.2f}
* Fixed Expenses: ${fixed:,.2f}
* Variable Expenses (adjusted): ${adjusted_variable:,.2f}
* Monthly Bills: ${total_bills:,.2f}
* Available for Extra Debt Payment: ${available_extra:,.2f}/mo
{overlap_note}{bills_section}
### Debt Calculations:

{debt_lines}

* Snowball: ${snowball['total_interest_paid']:,.2f} interest | {snowball['months_to_payoff']} months

* Avalanche: ${avalanche['total_interest_paid']:,.2f} interest | {avalanche['months_to_payoff']} months

* Interest Delta: ${interest_savings:,.2f} (Savings with Avalanche)

## Instructions:

Provide a comprehensive strategic review. Use clear section headers and bullet points for readability.

### Methodology Recommendation: Don't just pick one. Recommend the most efficient path—whether it's Snowball, Avalanche, or a Hybrid approach (e.g., knocking out a specific small high-stress debt first, then switching to high-interest). Explain the "why" behind the math and the psychology.

### Structural Analysis: Analyze the ratio between Income, Fixed Expenses, and Debt. Are there red flags in the debt-to-income ratio or the "burn rate" (Fixed + Variable vs. Income)?

### Credit Utilization: For any credit card where a credit limit was provided, call out cards exceeding 30% utilization as a credit-score risk (ideal is under 10%). If aggregate utilization across all cards with known limits exceeds 30%, flag this as a priority independent of the payoff strategy — high utilization suppresses credit scores and can affect future loan terms. If credit limits are missing for some cards, note the analysis is partial.

### High-Impact Observations: Identify specific "toxic" debts (extreme APRs) or "cash-flow killers" (low balance but high monthly payment) that should be prioritized to free up monthly liquidity.

### The "Beyond Payoff" Step: Suggest one advanced maneuver (e.g., specific insurance adjustments, balance transfer viability, or emergency fund buffering) that would strengthen their foundation while they pay down debt.

Tone: Professional, direct, and highly analytical. Focus on efficiency and sustainability."""

        def generate():
            anthropic_ok = bool(ANTHROPIC_API_KEY and ANTHROPIC_API_KEY != 'your-key-here')
            gemini_ok = bool(GEMINI_API_KEY and GEMINI_API_KEY != 'your-key-here')

            # Fast path: no Claude key → go straight to Gemini
            if not anthropic_ok:
                yield f"data: {json.dumps({'provider': 'gemini'})}\n\n"
                yield from _stream_gemini(prompt)
                yield "data: [DONE]\n\n"
                return

            # Primary: attempt Claude
            yield f"data: {json.dumps({'provider': 'claude'})}\n\n"
            claude_hit_max_tokens = False
            try:
                import anthropic as anthropic_sdk
                client = anthropic_sdk.Anthropic(api_key=ANTHROPIC_API_KEY)
                with client.messages.stream(
                    model='claude-sonnet-4-6',
                    max_tokens=4096,
                    messages=[{'role': 'user', 'content': prompt}],
                ) as stream:
                    for text in stream.text_stream:
                        yield f"data: {json.dumps({'text': text})}\n\n"
                    final = stream.get_final_message()
                    if final.stop_reason == 'max_tokens':
                        claude_hit_max_tokens = True
            except Exception as e:
                if gemini_ok:
                    yield f"data: {json.dumps({'warning': 'Claude unavailable; falling back to Gemini.'})}\n\n"
                    yield f"data: {json.dumps({'provider': 'gemini'})}\n\n"
                    yield from _stream_gemini(prompt)
                else:
                    yield f"data: {json.dumps({'error': str(e)})}\n\n"
                yield "data: [DONE]\n\n"
                return

            # max_tokens fallback
            if claude_hit_max_tokens:
                if gemini_ok:
                    yield f"data: {json.dumps({'warning': 'Claude response was truncated; retrying with Gemini.'})}\n\n"
                    yield f"data: {json.dumps({'provider': 'gemini'})}\n\n"
                    yield from _stream_gemini(prompt)
                else:
                    yield f"data: {json.dumps({'warning': 'Response was cut off — token limit reached.'})}\n\n"

            yield "data: [DONE]\n\n"

        return Response(
            stream_with_context(generate()),
            mimetype='text/event-stream',
            headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'},
        )

    except Exception as e:
        return jsonify({'error': f'Error streaming recommendation: {str(e)}'}), 500


@debt_bp.route('/upload-csv', methods=['POST'])
def upload_debt_csv():
    try:
        if 'file' not in request.files:
            return jsonify({'error': 'No file provided'}), 400

        file = request.files['file']
        if file.filename == '' or not file.filename.lower().endswith('.csv'):
            return jsonify({'error': 'A CSV file is required'}), 400

        filename = secure_filename(file.filename)
        temp_path = os.path.join(tempfile.gettempdir(), f"{uuid.uuid4()}_{filename}")
        file.save(temp_path)

        try:
            df = pd.read_csv(temp_path, header=0)
            df.columns = [c.strip() for c in df.columns]

            required_cols = {'Account Name', 'Balance', 'APR', 'Min Payment'}
            if not required_cols.issubset(set(df.columns)):
                return jsonify({
                    'error': f'CSV must have columns: {", ".join(required_cols)}. Found: {", ".join(df.columns)}'
                }), 400

            imported = []
            skipped = 0

            for _, row in df.iterrows():
                try:
                    name = str(row['Account Name']).strip()
                    balance_str = str(row['Balance']).replace('$', '').replace(',', '').strip()
                    apr_str = str(row['APR']).replace('%', '').strip()
                    min_pay_str = str(row['Min Payment']).replace('$', '').replace(',', '').strip()

                    if not name or any(v in ('', 'nan') for v in [balance_str, apr_str, min_pay_str]):
                        skipped += 1
                        continue

                    acct = DebtAccount(
                        account_type='credit_card',
                        account_name=name,
                        balance=_enc_float(float(balance_str)),
                        apr=_enc_float(float(apr_str)),
                        minimum_payment=_enc_float(float(min_pay_str)),
                        is_excluded_from_analysis=False,
                    )
                    db.session.add(acct)
                    db.session.flush()

                    promo_bal = str(row.get('Promo Balance', '')).replace('$', '').strip()
                    promo_apr = str(row.get('Promo APR', '')).replace('%', '').strip()
                    promo_exp = str(row.get('Promo Expiry', '')).strip()

                    if (promo_bal and promo_bal not in ('', 'nan')
                            and promo_apr not in ('', 'nan')
                            and promo_exp not in ('', 'nan')):
                        db.session.add(CreditCardPromo(
                            debt_account_id=acct.id,
                            promo_balance=_enc_float(float(promo_bal)),
                            promo_apr=_enc_float(float(promo_apr)),
                            promo_expiry_date=parse_date(promo_exp),
                        ))

                    imported.append(acct)
                except (ValueError, TypeError):
                    skipped += 1
                    continue

            db.session.commit()

            return jsonify({
                'message': f'Imported {len(imported)} accounts, skipped {skipped} rows',
                'imported_count': len(imported),
                'skipped_count': skipped,
                'accounts': [a.to_dict() for a in imported],
            })

        finally:
            if os.path.exists(temp_path):
                os.remove(temp_path)

    except Exception as e:
        db.session.rollback()
        traceback.print_exc()
        return jsonify({'error': f'Error processing debt CSV: {str(e)}'}), 500
