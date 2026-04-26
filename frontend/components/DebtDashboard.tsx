import React, { useState, useEffect, useCallback } from 'react';
import { DebtAccount, MonthlyBudget } from '../types';
import { apiService } from '../services/api';
import BudgetInputForm from './BudgetInputForm';
import DebtAccountList from './DebtAccountList';
import DebtAccountForm from './DebtAccountForm';
import DebtAnalysisPanel from './DebtAnalysisPanel';
import DebtCsvUpload from './DebtCsvUpload';

type DebtTab = 'overview' | 'accounts' | 'analysis' | 'import';

interface Props {
  filters: { start_date?: string; end_date?: string };
}

const DebtDashboard: React.FC<Props> = ({ filters }) => {
  const [activeTab, setActiveTab] = useState<DebtTab>('overview');
  const [budget, setBudget] = useState<MonthlyBudget | null>(null);
  const [accounts, setAccounts] = useState<DebtAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [formOpen, setFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<DebtAccount | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [budgetData, accountsData] = await Promise.all([
        apiService.getDebtBudget(),
        apiService.getDebtAccounts(),
      ]);
      setBudget(budgetData);
      setAccounts(accountsData.accounts);
    } catch {
      setError('Failed to load debt data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleAccountSaved = (saved: DebtAccount) => {
    setAccounts(prev => {
      const idx = prev.findIndex(a => a.id === saved.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = saved;
        return next;
      }
      return [...prev, saved];
    });
  };

  const handleDeleteAccount = async (id: number) => {
    if (!confirm('Delete this account?')) return;
    try {
      await apiService.deleteDebtAccount(id);
      setAccounts(prev => prev.filter(a => a.id !== id));
    } catch {
      setError('Failed to delete account');
    }
  };

  const handleToggleExclude = async (id: number, excluded: boolean) => {
    try {
      const updated = await apiService.updateDebtAccount(id, { is_excluded_from_analysis: excluded });
      setAccounts(prev => prev.map(a => a.id === id ? updated : a));
    } catch {
      setError('Failed to update account');
    }
  };

  const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  const tabs: { id: DebtTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'accounts', label: `Accounts${accounts.length ? ` (${accounts.length})` : ''}` },
    { id: 'analysis', label: 'Analysis' },
    { id: 'import', label: 'Import CSV' },
  ];

  return (
    <div>
      {/* Sub-tab navigation */}
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="flex gap-0 -mb-px">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors whitespace-nowrap ${
                activeTab === tab.id
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:border-gray-300'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {error && (
        <div className="mb-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg px-4 py-3 text-sm text-red-700 dark:text-red-400 flex justify-between">
          <span>{error}</span>
          <button onClick={() => setError('')} className="text-red-400 hover:text-red-600 ml-4">✕</button>
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 animate-pulse">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-24 bg-gray-100 dark:bg-gray-800 rounded-xl" />
          ))}
        </div>
      ) : (
        <>
          {activeTab === 'overview' && (
            <div className="space-y-6">
              {accounts.length > 0 && (
                <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-5">
                  <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Debt Summary</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                    <div>
                      <div className="text-gray-500 dark:text-gray-400 text-xs mb-0.5">Total Debt</div>
                      <div className="font-bold text-gray-900 dark:text-white">
                        ${fmt(accounts.reduce((s, a) => s + a.balance, 0))}
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500 dark:text-gray-400 text-xs mb-0.5">Accounts</div>
                      <div className="font-bold text-gray-900 dark:text-white">{accounts.length}</div>
                    </div>
                    <div>
                      <div className="text-gray-500 dark:text-gray-400 text-xs mb-0.5">Total Minimums</div>
                      <div className="font-bold text-gray-900 dark:text-white">
                        ${fmt(accounts.reduce((s, a) => s + a.minimum_payment, 0))}/mo
                      </div>
                    </div>
                    <div>
                      <div className="text-gray-500 dark:text-gray-400 text-xs mb-0.5">In Analysis</div>
                      <div className="font-bold text-gray-900 dark:text-white">
                        {accounts.filter(a => !a.is_excluded_from_analysis).length} of {accounts.length}
                      </div>
                    </div>
                  </div>
                </div>
              )}
              <BudgetInputForm budget={budget} onSave={setBudget} startDate={filters.start_date} endDate={filters.end_date} />
            </div>
          )}

          {activeTab === 'accounts' && (
            <DebtAccountList
              accounts={accounts}
              budget={budget}
              onAdd={() => { setEditingAccount(null); setFormOpen(true); }}
              onEdit={(acct) => { setEditingAccount(acct); setFormOpen(true); }}
              onDelete={handleDeleteAccount}
              onToggleExclude={handleToggleExclude}
            />
          )}

          {activeTab === 'analysis' && (
            <DebtAnalysisPanel accounts={accounts} budget={budget} />
          )}

          {activeTab === 'import' && (
            <DebtCsvUpload
              onUploadSuccess={(newAccounts) => {
                setAccounts(prev => [...prev, ...newAccounts]);
                setActiveTab('accounts');
              }}
            />
          )}
        </>
      )}

      {formOpen && (
        <DebtAccountForm
          account={editingAccount}
          onSave={handleAccountSaved}
          onClose={() => { setFormOpen(false); setEditingAccount(null); }}
        />
      )}
    </div>
  );
};

export default DebtDashboard;
