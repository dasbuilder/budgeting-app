export interface Transaction {
  id: number;
  transaction_date: string | null;
  post_date: string | null;
  description: string;
  category: string;
  auto_category: string;
  manual_category: string | null;
  transaction_type: string;
  amount: number;
  memo: string | null;
  balance: number | null;
  check_number: string | null;
  csv_format: string;
  card_source: string | null;
  card_last_four: string | null;
}

export interface CategoryRule {
  id: number;
  category_name: string;
  regex_pattern: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface TransactionFilters {
  type?: string;
  category?: string;
  start_date?: string;
  end_date?: string;
  card_source?: string;
  card_last_four?: string;
}

export interface PaginationInfo {
  page: number;
  pages: number;
  per_page: number;
  total: number;
}

export interface TransactionResponse {
  transactions: Transaction[];
  pagination: PaginationInfo;
}

export interface Stats {
  total_transactions: number;
  total_income: number;
  date_range: {
    earliest: string | null;
    latest: string | null;
  };
  categories: Array<{
    category: string;
    count: number;
    total_amount: number;
  }>;
}

export interface ApiError {
  error: string;
}

// ============================================================
// Debt Analysis Types
// ============================================================

export type DebtAccountType = 'credit_card' | 'mortgage' | 'student_loan' | 'loan';

export interface CreditCardPromo {
  id: number;
  debt_account_id: number;
  promo_balance: number;
  promo_apr: number;
  promo_expiry_date: string | null;
  created_at: string;
  updated_at: string;
}

export interface StudentLoanItem {
  id: number;
  debt_account_id: number;
  loan_name: string;
  balance: number;
  apr: number;
  minimum_payment: number;
  created_at: string;
  updated_at: string;
}

export interface DebtAccount {
  id: number;
  account_type: DebtAccountType;
  account_name: string;
  balance: number;
  apr: number;
  minimum_payment: number;
  credit_limit: number | null;
  loan_term_months: number | null;
  start_date: string | null;
  is_excluded_from_analysis: boolean;
  priority_order: number | null;
  promos: CreditCardPromo[];
  loan_items: StudentLoanItem[];
  created_at: string;
  updated_at: string;
}

export interface MonthlyBudget {
  id: number | null;
  monthly_net_income: number;
  fixed_expenses: number;
  variable_expenses: number;
  available_for_debt: number;
  total_minimum_payments: number;
  total_bills: number;
  debt_payment_overlap: number;
  available_for_extra_debt: number;
  updated_at: string | null;
}

export interface TransactionBudgetSummary {
  monthly_net_income: number;
  monthly_expenses: number;
  total_income: number;
  total_expenses: number;
  months_counted: number;
  date_range: {
    start_date: string | null;
    end_date: string | null;
  };
}

export interface PayoffDebtEntry {
  account_id: number;
  account_name: string;
  payoff_month: number;
  interest_paid: number;
}

export interface MonthlyPaymentEntry {
  account_id: number;
  account_name: string;
  payment: number;
  principal: number;
  interest: number;
  remaining_balance: number;
}

export interface MonthlyScheduleEntry {
  month: number;
  payments: MonthlyPaymentEntry[];
  total_payment: number;
}

export interface PayoffSchedule {
  method: 'snowball' | 'avalanche';
  total_interest_paid: number;
  months_to_payoff: number;
  total_paid: number;
  payoff_order: PayoffDebtEntry[];
  monthly_schedule: MonthlyScheduleEntry[];
  hit_month_cap?: boolean;
}

export interface AnalysisComparison {
  interest_savings_with_avalanche: number;
  months_saved_with_avalanche: number;
  recommended_method: 'snowball' | 'avalanche';
}

export interface AnalysisInputSummary {
  monthly_net_income: number;
  fixed_expenses: number;
  variable_expenses: number;
  adjusted_variable_expenses: number;
  debt_payment_overlap: number;
  total_bills: number;
  total_minimum_payments: number;
  available_extra_payment: number;
  debts_included: number;
  debts_excluded: number;
}

export interface DebtAnalysisResult {
  inputs: AnalysisInputSummary;
  snowball: PayoffSchedule;
  avalanche: PayoffSchedule;
  comparison: AnalysisComparison;
  ai_available: boolean;
}

// ============================================================
// Bills Types
// ============================================================

export interface Bill {
  id: number;
  bill_name: string;
  amount: number;
  due_day_of_month: number | null;
  category: string | null;
  is_recurring: boolean;
  is_auto_detected: boolean;
  is_active: boolean;
  is_debt_payment: boolean;
  linked_debt_account_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface BillSuggestion {
  bill_name: string;
  estimated_amount: number;
  frequency: string;
  confidence: number;
  sample_descriptions: string[];
  possible_debt_payment?: boolean;
}

export interface BillsSummary {
  monthly_income: number;
  total_bills: number;
  remaining: number;
  bill_count: number;
  variable_expenses: number;
  remaining_after_all_expenses: number;
}

export interface BillCategory {
  id: number;
  name: string;
  created_at: string;
}