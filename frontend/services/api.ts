import axios, { AxiosError } from 'axios';
import { Transaction, CategoryRule, TransactionResponse, Stats, TransactionFilters, DebtAccount, MonthlyBudget, CreditCardPromo, StudentLoanItem, DebtAnalysisResult, TransactionBudgetSummary, Bill, BillSuggestion, BillsSummary, BillCategory } from '../types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 60000,
});

/**
 * Custom error class that carries a plain-English message plus source context.
 * All axios errors pass through the interceptor below and get wrapped in this.
 */
export class ApiRequestError extends Error {
  /** Human-readable explanation of what went wrong */
  userMessage: string;
  /** The API method that was called (e.g. "getTransactions") */
  source: string;
  /** HTTP status code, or null for network-level failures */
  status: number | null;
  /** Whether this is a connection-level failure (backend unreachable) */
  isConnectionError: boolean;

  constructor(opts: {
    userMessage: string;
    source: string;
    status: number | null;
    isConnectionError: boolean;
  }) {
    super(opts.userMessage);
    this.name = 'ApiRequestError';
    this.userMessage = opts.userMessage;
    this.source = opts.source;
    this.status = opts.status;
    this.isConnectionError = opts.isConnectionError;
  }
}

/** Translate an AxiosError into a plain-English message. */
function friendlyMessage(err: AxiosError): { message: string; status: number | null; isConnectionError: boolean } {
  // No response at all — network level failure
  if (!err.response) {
    if (err.code === 'ECONNABORTED') {
      return {
        message: `Request timed out. The backend server at ${API_BASE_URL} took too long to respond.`,
        status: null,
        isConnectionError: true,
      };
    }
    return {
      message: `Cannot connect to the backend server at ${API_BASE_URL}. Make sure the backend is running (./start.sh or "python app.py" in backend/).`,
      status: null,
      isConnectionError: true,
    };
  }

  const status = err.response.status;
  const serverMsg = (err.response.data as any)?.error;

  if (status === 404) {
    return { message: serverMsg || `Endpoint not found (404). The backend may be running an older version.`, status, isConnectionError: false };
  }
  if (status === 500) {
    return { message: serverMsg || `The backend encountered an internal error. Check the backend terminal for details.`, status, isConnectionError: false };
  }
  if (status === 400) {
    return { message: serverMsg || `Bad request — the data sent to the server was invalid.`, status, isConnectionError: false };
  }
  if (status >= 500) {
    return { message: serverMsg || `Server error (${status}). Check the backend terminal for details.`, status, isConnectionError: false };
  }

  return { message: serverMsg || `Request failed with status ${status}.`, status, isConnectionError: false };
}

// Intercept all axios errors and wrap them in ApiRequestError
api.interceptors.response.use(
  (response) => response,
  (error: AxiosError) => {
    const endpoint = error.config?.url || 'unknown';
    const method = (error.config?.method || 'get').toUpperCase();
    const { message, status, isConnectionError } = friendlyMessage(error);

    const wrapped = new ApiRequestError({
      userMessage: message,
      source: `${method} ${endpoint}`,
      status,
      isConnectionError,
    });

    return Promise.reject(wrapped);
  },
);

export const apiService = {
  // Health check
  async healthCheck(): Promise<{ status: string }> {
    const response = await api.get('/health');
    return response.data;
  },

  // File upload
  async uploadCsv(file: File): Promise<{ message: string; format_detected: string; total_rows: number; saved_transactions: number }> {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await api.post('/upload-csv', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Transactions
  async getTransactions(params: TransactionFilters & { page?: number; per_page?: number } = {}): Promise<TransactionResponse> {
    const response = await api.get('/transactions', { params });
    return response.data;
  },

  // Category rules
  async getCategoryRules(): Promise<CategoryRule[]> {
    const response = await api.get('/category-rules');
    return response.data;
  },

  async createCategoryRule(rule: Omit<CategoryRule, 'id' | 'created_at' | 'updated_at'>): Promise<CategoryRule> {
    const response = await api.post('/category-rules', rule);
    return response.data;
  },

  async updateCategoryRule(id: number, rule: Partial<CategoryRule>): Promise<CategoryRule> {
    const response = await api.put(`/category-rules/${id}`, rule);
    return response.data;
  },

  async deleteCategoryRule(id: number): Promise<{ message: string }> {
    const response = await api.delete(`/category-rules/${id}`);
    return response.data;
  },

  // Transaction types & card sources (for dynamic filter dropdowns)
  async getTransactionTypes(): Promise<string[]> {
    const response = await api.get('/transaction-types');
    return response.data;
  },

  async getCardSources(): Promise<{ sources: string[]; cards: { source: string; last_four: string }[] }> {
    const response = await api.get('/card-sources');
    return response.data;
  },

  // Backfill transaction types (one-time use)
  async backfillTransactionTypes(): Promise<{ message: string; updated_count: number }> {
    const response = await api.post('/backfill-transaction-types');
    return response.data;
  },

  // Stats
  async getStats(filters: TransactionFilters = {}): Promise<Stats> {
    const response = await api.get('/stats', { params: filters });
    return response.data;
  },

  // Clear database
  async clearDatabase(): Promise<{ message: string; cleared_count: number }> {
    const response = await api.delete('/clear-database');
    return response.data;
  },

  // Category rules import/export
  async exportCategoryRules(): Promise<any> {
    const response = await api.get('/category-rules/export');
    return response.data;
  },

  async importCategoryRules(data: any): Promise<{ message: string; imported_count: number; skipped_count: number; updated_transactions: number }> {
    const response = await api.post('/category-rules/import', data);
    return response.data;
  },

  // --- Budget from Transactions ---
  async getBudgetFromTransactions(startDate?: string, endDate?: string): Promise<TransactionBudgetSummary> {
    const params: Record<string, string> = {};
    if (startDate) params.start_date = startDate;
    if (endDate) params.end_date = endDate;
    const response = await api.get('/budget-from-transactions', { params });
    return response.data;
  },

  // --- Debt Budget ---
  async getDebtBudget(): Promise<MonthlyBudget> {
    const response = await api.get('/debt/budget');
    return response.data;
  },

  async saveDebtBudget(data: Pick<MonthlyBudget, 'monthly_net_income' | 'fixed_expenses' | 'variable_expenses'>): Promise<MonthlyBudget> {
    const response = await api.post('/debt/budget', data);
    return response.data;
  },

  // --- Debt Accounts ---
  async getDebtAccounts(): Promise<{ accounts: DebtAccount[] }> {
    const response = await api.get('/debt/accounts');
    return response.data;
  },

  async createDebtAccount(data: Partial<DebtAccount>): Promise<DebtAccount> {
    const response = await api.post('/debt/accounts', data);
    return response.data;
  },

  async updateDebtAccount(id: number, data: Partial<DebtAccount>): Promise<DebtAccount> {
    const response = await api.put(`/debt/accounts/${id}`, data);
    return response.data;
  },

  async deleteDebtAccount(id: number): Promise<{ message: string }> {
    const response = await api.delete(`/debt/accounts/${id}`);
    return response.data;
  },

  // --- Promo Balances ---
  async createDebtPromo(accountId: number, data: { promo_balance: number; promo_apr: number; promo_expiry_date: string }): Promise<CreditCardPromo> {
    const response = await api.post(`/debt/accounts/${accountId}/promos`, data);
    return response.data;
  },

  async updateDebtPromo(accountId: number, promoId: number, data: Partial<CreditCardPromo>): Promise<CreditCardPromo> {
    const response = await api.put(`/debt/accounts/${accountId}/promos/${promoId}`, data);
    return response.data;
  },

  async deleteDebtPromo(accountId: number, promoId: number): Promise<{ message: string }> {
    const response = await api.delete(`/debt/accounts/${accountId}/promos/${promoId}`);
    return response.data;
  },

  // --- Student Loan Items ---
  async createStudentLoanItem(accountId: number, data: { loan_name: string; balance: number; apr: number; minimum_payment: number }): Promise<StudentLoanItem> {
    const response = await api.post(`/debt/accounts/${accountId}/loans`, data);
    return response.data;
  },

  async updateStudentLoanItem(accountId: number, loanId: number, data: Partial<StudentLoanItem>): Promise<StudentLoanItem> {
    const response = await api.put(`/debt/accounts/${accountId}/loans/${loanId}`, data);
    return response.data;
  },

  async deleteStudentLoanItem(accountId: number, loanId: number): Promise<{ message: string }> {
    const response = await api.delete(`/debt/accounts/${accountId}/loans/${loanId}`);
    return response.data;
  },

  // --- Debt Analysis ---
  async runDebtAnalysis(params: { include_mortgage: boolean }): Promise<DebtAnalysisResult> {
    const response = await api.post('/debt/analyze', params);
    return response.data;
  },

  async streamDebtRecommendation(
    params: { include_mortgage: boolean },
    onChunk: (text: string) => void,
    onDone: () => void,
    onError: (error: string) => void,
    onWarning?: (warning: string) => void,
    onProviderChange?: (provider: string) => void
  ): Promise<void> {
    let response: globalThis.Response;
    try {
      response = await fetch(`${API_BASE_URL}/debt/analyze/recommendation`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      });
    } catch {
      onError('Failed to connect to server');
      return;
    }

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      onError(data.error || 'Failed to get recommendation');
      return;
    }

    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const raw = line.slice(6);
        if (raw === '[DONE]') { onDone(); return; }
        try {
          const parsed = JSON.parse(raw);
          if (parsed.error) { onError(parsed.error); return; }
          if (parsed.warning) onWarning?.(parsed.warning);
          if (parsed.provider) onProviderChange?.(parsed.provider);
          if (parsed.text) onChunk(parsed.text);
        } catch { /* ignore malformed lines */ }
      }
    }
    onDone();
  },

  async uploadDebtCsv(file: File): Promise<{ message: string; imported_count: number; skipped_count: number; accounts: DebtAccount[] }> {
    const formData = new FormData();
    formData.append('file', file);
    const response = await api.post('/debt/upload-csv', formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return response.data;
  },

  // --- Bills ---
  async getBills(): Promise<Bill[]> {
    const response = await api.get('/bills');
    return response.data;
  },

  async createBill(data: Partial<Bill>): Promise<Bill> {
    const response = await api.post('/bills', data);
    return response.data;
  },

  async updateBill(id: number, data: Partial<Bill>): Promise<Bill> {
    const response = await api.put(`/bills/${id}`, data);
    return response.data;
  },

  async deleteBill(id: number): Promise<{ message: string }> {
    const response = await api.delete(`/bills/${id}`);
    return response.data;
  },

  async getBillsSummary(): Promise<BillsSummary> {
    const response = await api.get('/bills/summary');
    return response.data;
  },

  async scanForBills(): Promise<BillSuggestion[]> {
    const response = await api.post('/bills/scan-transactions');
    return response.data;
  },

  // --- Bill Categories ---
  async getBillCategories(): Promise<BillCategory[]> {
    const response = await api.get('/bill-categories');
    return response.data;
  },

  async createBillCategory(name: string): Promise<BillCategory> {
    const response = await api.post('/bill-categories', { name });
    return response.data;
  },

  async deleteBillCategory(id: number): Promise<{ message: string }> {
    const response = await api.delete(`/bill-categories/${id}`);
    return response.data;
  },

  // --- Category Names (merged from rules + bill categories) ---
  async getCategoryNames(): Promise<string[]> {
    const response = await api.get('/category-names');
    return response.data;
  },
};