from budgeting.services.encryption_service import _dec_float


def run_payoff_simulation(debts: list, available_extra: float, method: str) -> dict:
    """
    Run snowball or avalanche payoff simulation.

    Args:
        debts: list of dicts with keys: id, name, balance, apr, minimum_payment
        available_extra: extra money per month after all minimums paid
        method: 'snowball' (smallest balance first) or 'avalanche' (highest APR first)

    Returns:
        dict with total_interest_paid, months_to_payoff, payoff_order, monthly_schedule
    """
    MAX_MONTHS = 600

    working = {d['id']: {'balance': float(d['balance']), **d} for d in debts}
    total_interest = 0.0
    month = 0
    monthly_schedule = []
    payoff_order = []

    while any(v['balance'] > 0.001 for v in working.values()) and month < MAX_MONTHS:
        month += 1
        month_payments = []

        for debt_id, debt in working.items():
            if debt['balance'] <= 0.001:
                continue
            monthly_rate = debt['apr'] / 100.0 / 12.0
            interest = debt['balance'] * monthly_rate
            total_interest += interest

            actual_min = max(float(debt['minimum_payment']), interest + 0.01)
            actual_min = min(actual_min, debt['balance'] + interest)
            principal = actual_min - interest
            principal = min(principal, debt['balance'])
            debt['balance'] = max(0.0, debt['balance'] - principal)

            month_payments.append({
                'account_id': debt_id,
                'account_name': debt['name'],
                'payment': round(actual_min, 2),
                'principal': round(principal, 2),
                'interest': round(interest, 2),
                'remaining_balance': round(debt['balance'], 2),
            })

            if debt['balance'] <= 0.001:
                debt['balance'] = 0.0
                payoff_order.append({
                    'account_id': debt_id,
                    'account_name': debt['name'],
                    'payoff_month': month,
                    'interest_paid': 0,
                })

        extra = available_extra
        while extra > 0.001:
            active = [(k, v) for k, v in working.items() if v['balance'] > 0.001]
            if not active:
                break
            if method == 'snowball':
                active.sort(key=lambda x: x[1]['balance'])
            else:
                active.sort(key=lambda x: -x[1]['apr'])

            target_id, target = active[0]
            apply_amount = min(extra, target['balance'])
            target['balance'] = max(0.0, target['balance'] - apply_amount)
            extra -= apply_amount

            for p in month_payments:
                if p['account_id'] == target_id:
                    p['payment'] = round(p['payment'] + apply_amount, 2)
                    p['principal'] = round(p['principal'] + apply_amount, 2)
                    p['remaining_balance'] = round(target['balance'], 2)
                    break

            if target['balance'] <= 0.001:
                target['balance'] = 0.0
                if not any(p['account_id'] == target_id for p in payoff_order):
                    payoff_order.append({
                        'account_id': target_id,
                        'account_name': target['name'],
                        'payoff_month': month,
                        'interest_paid': 0,
                    })
                extra += float(target['minimum_payment'])

        if month <= 24:
            monthly_schedule.append({
                'month': month,
                'payments': month_payments,
                'total_payment': round(sum(p['payment'] for p in month_payments), 2),
            })

    hit_cap = month >= MAX_MONTHS and any(v['balance'] > 0.001 for v in working.values())
    total_original = sum(float(d['balance']) for d in debts)

    return {
        'method': method,
        'total_interest_paid': round(total_interest, 2),
        'months_to_payoff': month,
        'total_paid': round(total_original + total_interest, 2),
        'payoff_order': payoff_order,
        'monthly_schedule': monthly_schedule,
        'hit_month_cap': hit_cap,
    }


def build_debts_for_analysis(include_mortgage: bool = False) -> tuple:
    """
    Fetch and prepare debts for payoff simulation.

    Returns:
        (debts_list, available_extra, budget_summary, excluded_count)
    Raises:
        ValueError: if budget is not configured or no debts with balance exist
    """
    from budgeting.models.debt import MonthlyBudget, DebtAccount
    from budgeting.models.bill import Bill

    budget = MonthlyBudget.query.first()
    if not budget or _dec_float(budget.monthly_net_income) == 0:
        raise ValueError('Budget not configured. Please set your monthly income and expenses first.')

    income = _dec_float(budget.monthly_net_income)
    fixed = _dec_float(budget.fixed_expenses)
    variable = _dec_float(budget.variable_expenses)

    # Sum active bills
    active_bills = Bill.query.filter_by(is_active=True).all()
    total_bills = sum(_dec_float(b.amount) for b in active_bills)
    bill_details = [{'name': b.bill_name, 'amount': _dec_float(b.amount)} for b in active_bills]

    all_accounts = DebtAccount.query.filter_by(is_active=True).all()
    debts = []
    excluded_count = 0

    for acct in all_accounts:
        if acct.account_type == 'mortgage' and not include_mortgage:
            excluded_count += 1
            continue
        if acct.is_excluded_from_analysis and acct.account_type != 'mortgage':
            excluded_count += 1
            continue
        if acct.account_type == 'student_loan' and acct.loan_items:
            for item in acct.loan_items:
                item_balance = _dec_float(item.balance)
                if item_balance > 0:
                    debts.append({
                        'id': f'sl_{item.id}',
                        'name': f'{acct.account_name} \u2014 {item.loan_name}',
                        'balance': item_balance,
                        'apr': _dec_float(item.apr),
                        'minimum_payment': _dec_float(item.minimum_payment),
                    })
        else:
            balance = _dec_float(acct.balance)
            if balance <= 0:
                continue
            debts.append({
                'id': acct.id,
                'name': acct.account_name,
                'balance': balance,
                'apr': _dec_float(acct.apr),
                'minimum_payment': _dec_float(acct.minimum_payment),
                'credit_limit': _dec_float(acct.credit_limit) if acct.account_type == 'credit_card' and acct.credit_limit else None,
            })

    if not debts:
        raise ValueError('No debts with a balance found for analysis. Add debt accounts first.')

    total_minimums = sum(d['minimum_payment'] for d in debts)

    # Bills flagged as debt payments are already counted in total_minimums,
    # but also included in variable_expenses (from CSV transactions).
    # Subtract them from variable to avoid double-counting.
    debt_bill_total = sum(_dec_float(b.amount) for b in active_bills if b.is_debt_payment)
    adjusted_variable = max(0, variable - debt_bill_total)
    available_extra = round(income - fixed - adjusted_variable - total_minimums, 2)

    budget_summary = {
        'monthly_net_income': income,
        'fixed_expenses': fixed,
        'variable_expenses': variable,
        'adjusted_variable_expenses': adjusted_variable,
        'debt_payment_overlap': debt_bill_total,
        'total_bills': total_bills,
        'bill_details': bill_details,
        'total_minimum_payments': total_minimums,
        'available_extra_payment': available_extra,
        'debts_included': len(debts),
        'debts_excluded': excluded_count,
    }

    return debts, available_extra, budget_summary, excluded_count
