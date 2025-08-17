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