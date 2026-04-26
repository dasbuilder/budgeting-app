import React, { useState, useEffect, useRef } from 'react';
import { MonthlyBudget, TransactionBudgetSummary, BillsSummary } from '../types';
import { apiService } from '../services/api';

interface Props {
  budget: MonthlyBudget | null;
  onSave: (budget: MonthlyBudget) => void;
  startDate?: string;
  endDate?: string;
}

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const BudgetInputForm: React.FC<Props> = ({ budget, onSave, startDate, endDate }) => {
  const [summary, setSummary] = useState<TransactionBudgetSummary | null>(null);
  const [billsSummary, setBillsSummary] = useState<BillsSummary | null>(null);
  console.log('BudgetInputForm render', { billsSummary, summary });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const lastSavedRef = useRef<string>('');

  useEffect(() => {
    if (!startDate && !endDate) return;

    const fetchBudget = async () => {
      setLoading(true);
      setError('');
      try {
        const [data, billsData] = await Promise.all([
          apiService.getBudgetFromTransactions(startDate, endDate),
          apiService.getBillsSummary(),
        ]);
        setSummary(data);
        setBillsSummary(billsData);

        // Auto-save to debt budget so analysis endpoints can use it
        const saveKey = `${data.monthly_net_income}-${data.monthly_expenses}`;
        if (saveKey !== lastSavedRef.current) {
          setSaveStatus('saving');
          try {
            const saved = await apiService.saveDebtBudget({
              monthly_net_income: data.monthly_net_income,
              fixed_expenses: 0,
              variable_expenses: data.monthly_expenses,
            });
            onSave(saved);
            lastSavedRef.current = saveKey;
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 2000);
          } catch {
            setSaveStatus('error');
          }
        }
      } catch {
        setError('Failed to compute budget from transactions');
      } finally {
        setLoading(false);
      }
    };

    fetchBudget();
  }, [startDate, endDate, onSave]);

  const billsTotal = billsSummary?.total_bills ?? 0;
  // Use the authoritative value from the budget endpoint when available
  const available = budget?.available_for_extra_debt ?? (summary ? summary.monthly_net_income - summary.monthly_expenses : 0);

  if (!startDate && !endDate) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-3">Monthly Budget</h3>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Set a date range in the Budget view to compute your monthly budget from transaction data.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Monthly Budget</h3>
        {saveStatus === 'saving' && (
          <span className="text-xs text-gray-400 dark:text-gray-500">Saving...</span>
        )}
        {saveStatus === 'saved' && (
          <span className="text-xs text-green-600 dark:text-green-400">Saved</span>
        )}
        {saveStatus === 'error' && (
          <span className="text-xs text-red-500 dark:text-red-400">Save failed</span>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-pulse">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-16 bg-gray-100 dark:bg-gray-700 rounded-lg" />
          ))}
        </div>
      ) : error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : summary ? (
        <>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            Based on {summary.months_counted} month{summary.months_counted !== 1 ? 's' : ''} of transaction data
            {startDate && endDate && (
              <span> ({startDate} to {endDate})</span>
            )}
          </p>

          <div className={`grid grid-cols-1 gap-4 mb-4 ${billsTotal > 0 ? 'sm:grid-cols-4' : 'sm:grid-cols-3'}`}>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Monthly Income</div>
              <div className="text-xl font-bold text-gray-900 dark:text-white">
                ${fmt(summary.monthly_net_income)}
              </div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Total: ${fmt(summary.total_income)}
              </div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Monthly Expenses</div>
              <div className="text-xl font-bold text-gray-900 dark:text-white">
                ${fmt(summary.monthly_expenses)}
              </div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Total: ${fmt(summary.total_expenses)}
              </div>
            </div>
            {billsTotal > 0 && (
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Monthly Bills</div>
                <div className="text-xl font-bold text-red-600 dark:text-red-400">
                  ${fmt(billsTotal)}
                </div>
                <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                  {billsSummary?.bill_count ?? 0} bill{(billsSummary?.bill_count ?? 0) !== 1 ? 's' : ''}
                </div>
              </div>
            )}
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
              <div className="text-xs text-gray-500 dark:text-gray-400 mb-1">Available for Debt</div>
              <div className={`text-xl font-bold ${available >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                ${fmt(available)}
              </div>
              <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                per month
              </div>
            </div>
          </div>

          <div className={`rounded-lg px-4 py-3 flex items-center justify-between ${available >= 0 ? 'bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800' : 'bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800'}`}>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Available for extra debt payment</span>
            <span className={`text-lg font-bold ${available >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
              ${fmt(available)}/mo
            </span>
          </div>
        </>
      ) : null}
    </div>
  );
};

export default BudgetInputForm;
