import React from 'react';
import { DebtAccount, MonthlyBudget } from '../types';
import { PencilIcon, TrashIcon, CreditCardIcon, HomeIcon, AcademicCapIcon, BanknotesIcon } from '@heroicons/react/24/outline';
import { differenceInDays, parseISO } from 'date-fns';

interface Props {
  accounts: DebtAccount[];
  budget: MonthlyBudget | null;
  onAdd: () => void;
  onEdit: (account: DebtAccount) => void;
  onDelete: (id: number) => void;
  onToggleExclude: (id: number, excluded: boolean) => void;
}

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const TYPE_CONFIG = {
  credit_card: { label: 'Credit Card', Icon: CreditCardIcon, color: 'blue' },
  mortgage: { label: 'Mortgage', Icon: HomeIcon, color: 'purple' },
  student_loan: { label: 'Student Loan', Icon: AcademicCapIcon, color: 'green' },
  loan: { label: 'Loan', Icon: BanknotesIcon, color: 'green' },
} as const;

const TYPE_BADGE_COLORS: Record<string, string> = {
  blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  green: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
};

function PromoWarnings({ promos }: { promos: DebtAccount['promos'] }) {
  const withDates = promos.filter(p => p.promo_expiry_date);
  if (!withDates.length) return null;
  return (
    <div className="mt-1.5 flex flex-wrap gap-1">
      {withDates.map(p => {
        const days = differenceInDays(parseISO(p.promo_expiry_date!), new Date());
        const colorClass = days < 0
          ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
          : days <= 60
          ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300'
          : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400';
        return (
          <span key={p.id} className={`text-xs px-2 py-0.5 rounded-full ${colorClass}`}>
            Promo ${fmt(p.promo_balance)} @ {p.promo_apr}% — {days < 0 ? 'expired' : `expires in ${days}d`}
          </span>
        );
      })}
    </div>
  );
}

const DebtAccountList: React.FC<Props> = ({ accounts, budget, onAdd, onEdit, onDelete, onToggleExclude }) => {
  const totalDebt = accounts.reduce((s, a) => s + a.balance, 0);
  const totalMin = accounts.reduce((s, a) => s + a.minimum_payment, 0);
  const availableExtra = budget?.available_for_extra_debt ?? null;

  const grouped: Record<string, DebtAccount[]> = { credit_card: [], mortgage: [], student_loan: [], loan: [], };
  for (const a of accounts) {
    if (grouped[a.account_type]) grouped[a.account_type].push(a);
  }

  return (
    <div className="space-y-6">
      {accounts.length > 0 && (
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 text-sm">
            <div>
              <div className="text-gray-500 dark:text-gray-400 text-xs mb-0.5">Total Debt</div>
              <div className="font-bold text-gray-900 dark:text-white">${fmt(totalDebt)}</div>
            </div>
            <div>
              <div className="text-gray-500 dark:text-gray-400 text-xs mb-0.5">Total Monthly Minimums</div>
              <div className="font-bold text-gray-900 dark:text-white">${fmt(totalMin)}/mo</div>
            </div>
            {availableExtra !== null && (
              <div>
                <div className="text-gray-500 dark:text-gray-400 text-xs mb-0.5">Available Extra / Month</div>
                <div className={`font-bold ${availableExtra >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                  ${fmt(availableExtra)}/mo
                </div>
              </div>
            )}
          </div>
        </div>
      )}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Debt Accounts</h3>
        <button
          onClick={onAdd}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
        >
          + Add Account
        </button>
      </div>
    
      {accounts.length === 0 && (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">No debt accounts added yet.</p>
          <p className="text-xs mt-1 text-gray-400 dark:text-gray-500">Add accounts manually or import via CSV.</p>
        </div>
      )}

      {(['credit_card', 'mortgage', 'student_loan', 'loan'] as const).map(type => {
        const group = grouped[type];
        if (!group.length) return null;
        const { label, Icon, color } = TYPE_CONFIG[type];
        return (
          <div key={type}>
            <div className="flex items-center gap-2 mb-3">
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${TYPE_BADGE_COLORS[color]}`}>
                <Icon className="w-3.5 h-3.5" />
                {label}
              </span>
            </div>
            <div className="space-y-2">
              {group.map(acct => (
                <div
                  key={acct.id}
                  className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 ${acct.is_excluded_from_analysis ? 'opacity-60' : ''}`}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900 dark:text-white truncate">{acct.account_name}</span>
                        {acct.is_excluded_from_analysis && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400">
                            excluded
                          </span>
                        )}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-sm text-gray-600 dark:text-gray-400">
                        <span>Balance: <span className="font-medium text-gray-900 dark:text-white">${fmt(acct.balance)}</span></span>
                        <span>APR: <span className="font-medium text-gray-900 dark:text-white">{acct.apr}%</span></span>
                        <span>Min: <span className="font-medium text-gray-900 dark:text-white">${fmt(acct.minimum_payment)}/mo</span></span>
                      </div>
                      <PromoWarnings promos={acct.promos} />
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        onClick={() => onToggleExclude(acct.id, !acct.is_excluded_from_analysis)}
                        className="px-2 py-1 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        {acct.is_excluded_from_analysis ? 'Include' : 'Exclude'}
                      </button>
                      <button
                        onClick={() => onEdit(acct)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        <PencilIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onDelete(acct.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      
    </div>
  );
};

export default DebtAccountList;
