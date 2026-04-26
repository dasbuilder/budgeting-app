import React, { useState, useEffect, useCallback } from 'react';
import { PlusIcon, PencilIcon, TrashIcon } from '@heroicons/react/24/outline';
import { Bill, BillSuggestion, BillsSummary } from '../types';
import { apiService } from '../services/api';
import BillForm from './BillForm';

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

interface Props {
  suggestions?: BillSuggestion[];
  onSuggestionsChange?: (s: BillSuggestion[]) => void;
}

const BillsPanel: React.FC<Props> = ({ suggestions = [], onSuggestionsChange }) => {
  const [bills, setBills] = useState<Bill[]>([]);
  const [summary, setSummary] = useState<BillsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingBill, setEditingBill] = useState<Bill | null>(null);
  const [prefill, setPrefill] = useState<Partial<Bill> | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [billsData, summaryData] = await Promise.all([
        apiService.getBills(),
        apiService.getBillsSummary(),
      ]);
      setBills(billsData);
      setSummary(summaryData);
    } catch (err) {
      console.error('Error loading bills:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSave = async () => {
    setShowForm(false);
    setEditingBill(null);
    setPrefill(null);
    await loadData();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this bill?')) return;
    try {
      await apiService.deleteBill(id);
      await loadData();
    } catch (err) {
      console.error('Error deleting bill:', err);
    }
  };

  const handleAcceptSuggestion = (suggestion: BillSuggestion) => {
    setPrefill({
      bill_name: suggestion.bill_name,
      amount: suggestion.estimated_amount,
      is_auto_detected: true,
      is_debt_payment: suggestion.possible_debt_payment ?? false,
    });
    setEditingBill(null);
    setShowForm(true);
    // Remove from suggestions
    onSuggestionsChange?.(suggestions.filter((s) => s.bill_name !== suggestion.bill_name));
  };

  const handleDismissSuggestion = (suggestion: BillSuggestion) => {
    onSuggestionsChange?.(suggestions.filter((s) => s.bill_name !== suggestion.bill_name));
  };

  if (loading) {
    return (
      <div className="animate-pulse space-y-3">
        <div className="h-20 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
        <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
        <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Card */}
      {summary && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg p-4 space-y-2">
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600 dark:text-gray-400">Monthly Income</span>
            <span className="text-sm font-semibold text-green-600 dark:text-green-400">
              {summary.monthly_income > 0 ? formatCurrency(summary.monthly_income) : (
                <span className="text-gray-400 dark:text-gray-500 font-normal italic">Set income in Debt Analysis</span>
              )}
            </span>
          </div>
          <div className="flex justify-between items-center">
            <span className="text-sm text-gray-600 dark:text-gray-400">Total Bills ({summary.bill_count})</span>
            <span className="text-sm font-semibold text-red-600 dark:text-red-400">
              {formatCurrency(summary.total_bills)}
            </span>
          </div>
          <div className="border-t border-gray-200 dark:border-gray-700 pt-2 space-y-1">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Remaining after bills</span>
              <span className={`text-sm font-bold ${
                summary.remaining >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              }`}>
                {formatCurrency(summary.remaining)}
              </span>
            </div>
            {summary.variable_expenses > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-xs text-gray-500 dark:text-gray-400">After all expenses</span>
                <span className={`text-xs font-medium ${
                  summary.remaining_after_all_expenses >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
                }`}>
                  {formatCurrency(summary.remaining_after_all_expenses)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Bill List */}
      {bills.length === 0 ? (
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
          No bills yet. Add your monthly bills to track obligations.
        </p>
      ) : (
        <div className="space-y-2">
          {bills.map((bill) => (
            <div
              key={bill.id}
              className="flex items-center justify-between border border-gray-200 dark:border-gray-700 rounded-lg px-4 py-3"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {bill.bill_name}
                  </span>
                  {bill.due_day_of_month && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400">
                      Due {bill.due_day_of_month}{ordinalSuffix(bill.due_day_of_month)}
                    </span>
                  )}
                  {bill.is_debt_payment && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                      Debt Payment
                    </span>
                  )}
                  {bill.category && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                      {bill.category}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-3 ml-3">
                <span className="text-sm font-semibold text-red-600 dark:text-red-400">
                  {formatCurrency(bill.amount)}
                </span>
                <button
                  onClick={() => { setEditingBill(bill); setPrefill(null); setShowForm(true); }}
                  className="text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                >
                  <PencilIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={() => handleDelete(bill.id)}
                  className="text-gray-400 hover:text-red-600 dark:hover:text-red-400"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Bill Button */}
      <button
        onClick={() => { setEditingBill(null); setPrefill(null); setShowForm(true); }}
        className="w-full flex items-center justify-center gap-2 px-4 py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-sm font-medium text-gray-600 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 dark:hover:border-blue-500 dark:hover:text-blue-400 transition-colors"
      >
        <PlusIcon className="h-4 w-4" />
        Add Bill
      </button>

      {/* Suggested Bills */}
      {suggestions.length > 0 && (
        <div className="border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4">
          <h4 className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-3">
            Detected from Transactions
          </h4>
          <div className="space-y-2">
            {suggestions.map((s, i) => (
              <div
                key={i}
                className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-lg px-3 py-2 border border-amber-200 dark:border-amber-700"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-gray-900 dark:text-white truncate">{s.bill_name}</span>
                    {s.possible_debt_payment && (
                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                        Debt?
                      </span>
                    )}
                  </div>
                  <span className="text-xs text-gray-500 dark:text-gray-400">~{formatCurrency(s.estimated_amount)}/mo</span>
                </div>
                <div className="flex items-center gap-2 ml-3">
                  <button
                    onClick={() => handleAcceptSuggestion(s)}
                    className="px-2.5 py-1 text-xs font-medium text-white bg-blue-600 rounded hover:bg-blue-700"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => handleDismissSuggestion(s)}
                    className="px-2.5 py-1 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded hover:bg-gray-200 dark:hover:bg-gray-600"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Bill Form Modal */}
      {showForm && (
        <BillForm
          bill={editingBill || (prefill ? { ...prefill, id: 0, is_recurring: true, is_auto_detected: prefill.is_auto_detected ?? false, is_active: true, is_debt_payment: prefill.is_debt_payment ?? false, linked_debt_account_id: null, notes: null, category: null, due_day_of_month: null, created_at: '', updated_at: '' } as Bill : null)}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditingBill(null); setPrefill(null); }}
        />
      )}
    </div>
  );
};

function ordinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

export default BillsPanel;
