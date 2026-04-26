import React, { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { DebtAnalysisResult, DebtAccount, MonthlyBudget } from '../types';
import { apiService } from '../services/api';
import { SparklesIcon, ChevronDownIcon, ChevronUpIcon } from '@heroicons/react/24/outline';

interface Props {
  accounts: DebtAccount[];
  budget: MonthlyBudget | null;
}

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const DebtAnalysisPanel: React.FC<Props> = ({ accounts, budget }) => {
  const [result, setResult] = useState<DebtAnalysisResult | null>(null);
  const [includeMortgage, setIncludeMortgage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showSchedule, setShowSchedule] = useState(false);
  const [recommendation, setRecommendation] = useState('');
  const [recStreaming, setRecStreaming] = useState(false);
  const [recError, setRecError] = useState('');
  const [recWarning, setRecWarning] = useState('');

  const includedAccounts = accounts.filter(a =>
    !a.is_excluded_from_analysis || (includeMortgage && a.account_type === 'mortgage')
  );
  const totalBalance = includedAccounts.reduce((s, a) => s + a.balance, 0);
  const totalMin = includedAccounts.reduce((s, a) => s + a.minimum_payment, 0);
  const extraPerMonth = budget?.available_for_extra_debt ?? 0;

  const handleRun = async () => {
    setLoading(true);
    setError('');
    setResult(null);
    setRecommendation('');
    setRecError('');
    setRecWarning('');
    setRecStreaming(false);
    try {
      const data = await apiService.runDebtAnalysis({ include_mortgage: includeMortgage });
      setResult(data);
      setLoading(false);

      if (data.ai_available) {
        setRecStreaming(true);
        await apiService.streamDebtRecommendation(
          { include_mortgage: includeMortgage },
          (chunk) => setRecommendation(prev => prev + chunk),
          () => setRecStreaming(false),
          (err) => { setRecError(`AI recommendation unavailable: ${err}`); setRecStreaming(false); },
          (warning) => setRecWarning(warning),
          (provider) => {
            if (provider === 'gemini') setRecommendation('');
          }
        );
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to run analysis');
      setLoading(false);
    }
  };

  const rec = result?.comparison?.recommended_method;
  const budgetReady = budget && budget.monthly_net_income > 0;

  return (
    <div className="space-y-6">
      {/* Pre-flight card */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Run Payoff Analysis</h3>

        {!budgetReady && (
          <p className="text-sm text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-lg px-3 py-2 mb-4">
            Set your monthly budget in the Overview tab before running analysis.
          </p>
        )}

        {budgetReady && (
          <div className="grid grid-cols-3 gap-4 mb-4 text-sm">
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
              <div className="text-gray-500 dark:text-gray-400 text-xs mb-1">Debts in analysis</div>
              <div className="font-bold text-gray-900 dark:text-white">{includedAccounts.length}</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
              <div className="text-gray-500 dark:text-gray-400 text-xs mb-1">Total balance</div>
              <div className="font-bold text-gray-900 dark:text-white">${fmt(totalBalance)}</div>
            </div>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-3">
              <div className="text-gray-500 dark:text-gray-400 text-xs mb-1">Extra / month</div>
              <div className={`font-bold ${extraPerMonth >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                ${fmt(Math.max(0, extraPerMonth))}/mo
              </div>
            </div>
          </div>
        )}

        <div className="flex items-center gap-4 flex-wrap">
          <label className="flex items-center gap-2 cursor-pointer text-sm text-gray-700 dark:text-gray-300">
            <input
              type="checkbox"
              checked={includeMortgage}
              onChange={e => setIncludeMortgage(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Include mortgage in analysis
          </label>
          <button
            onClick={handleRun}
            disabled={loading || !budgetReady}
            className="px-6 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed text-white text-sm font-medium rounded-lg transition-colors"
          >
            {loading ? 'Running…' : 'Run Analysis'}
          </button>
        </div>

        {error && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>
        )}
      </div>

      {/* Results */}
      {result && (
        <>
          {/* Comparison cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(['snowball', 'avalanche'] as const).map(method => {
              const schedule = result[method];
              const isRecommended = rec === method;
              return (
                <div
                  key={method}
                  className={`bg-white dark:bg-gray-800 rounded-xl border-2 p-5 ${isRecommended ? 'border-blue-500 dark:border-blue-400' : 'border-gray-200 dark:border-gray-700'}`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-semibold text-gray-900 dark:text-white capitalize">{method}</h4>
                    {isRecommended && (
                      <span className="text-xs px-2 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded-full font-medium">
                        Recommended
                      </span>
                    )}
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Total interest</span>
                      <span className="font-medium text-gray-900 dark:text-white">${fmt(schedule.total_interest_paid)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Months to payoff</span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {schedule.months_to_payoff} mo ({Math.ceil(schedule.months_to_payoff / 12)} yr)
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-500 dark:text-gray-400">Total paid</span>
                      <span className="font-medium text-gray-900 dark:text-white">${fmt(schedule.total_paid)}</span>
                    </div>
                  </div>
                  {schedule.hit_month_cap && (
                    <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
                      Warning: some debts may not be fully paid off within 50 years at current payment levels.
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Savings callout */}
          {result.comparison.interest_savings_with_avalanche > 0 && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-sm text-blue-800 dark:text-blue-300">
              The avalanche method saves you <strong>${fmt(result.comparison.interest_savings_with_avalanche)}</strong> in interest
              {result.comparison.months_saved_with_avalanche > 0 && (
                <> and pays off your debt <strong>{result.comparison.months_saved_with_avalanche} month{result.comparison.months_saved_with_avalanche !== 1 ? 's' : ''}</strong> sooner</>
              )}.
            </div>
          )}

          {/* Payoff order */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {(['snowball', 'avalanche'] as const).map(method => (
              <div key={method} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 capitalize">{method} payoff order</h4>
                <ol className="space-y-1.5">
                  {result[method].payoff_order.map((entry, i) => (
                    <li key={entry.account_id} className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300">
                      <span className="w-5 h-5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 text-xs flex items-center justify-center flex-shrink-0">
                        {i + 1}
                      </span>
                      <span className="flex-1 truncate">{entry.account_name}</span>
                      <span className="text-gray-400 text-xs flex-shrink-0">mo {entry.payoff_month}</span>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>

          {/* Claude recommendation */}
          {(recStreaming || recommendation || recError || !result.ai_available) && (
            <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <SparklesIcon className={`w-5 h-5 text-indigo-600 dark:text-indigo-400 ${recStreaming ? 'animate-pulse' : ''}`} />
                <h4 className="text-sm font-semibold text-indigo-900 dark:text-indigo-200">AI Recommendation</h4>
                {recStreaming && (
                  <span className="text-xs text-indigo-500 dark:text-indigo-400">Generating…</span>
                )}
              </div>

              {!result.ai_available && (
                <p className="text-xs text-gray-400 dark:text-gray-500">
                  AI recommendations disabled. Set <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">ANTHROPIC_API_KEY</code> in <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">backend/.env</code> to enable.
                </p>
              )}

              {recError && (
                <p className="text-xs text-red-500 dark:text-red-400">{recError}</p>
              )}

              {recWarning && (
                <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded px-3 py-2 mb-3">{recWarning}</p>
              )}

              {recommendation && (
                <div className="text-sm text-indigo-800 dark:text-indigo-300 leading-relaxed prose prose-sm prose-indigo dark:prose-invert max-w-none
                  [&_h3]:text-sm [&_h3]:font-semibold [&_h3]:text-indigo-900 [&_h3]:dark:text-indigo-200 [&_h3]:mt-4 [&_h3]:mb-1 [&_h3]:first:mt-0
                  [&_ul]:mt-1 [&_ul]:space-y-0.5 [&_ul]:pl-4
                  [&_li]:text-indigo-800 [&_li]:dark:text-indigo-300
                  [&_p]:text-indigo-800 [&_p]:dark:text-indigo-300 [&_p]:mt-1
                  [&_strong]:text-indigo-900 [&_strong]:dark:text-indigo-200">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{recommendation}</ReactMarkdown>
                </div>
              )}
            </div>
          )}

          {/* Monthly schedule (expandable) */}
          {result.snowball.monthly_schedule.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <button
                onClick={() => setShowSchedule(v => !v)}
                className="w-full flex items-center justify-between px-5 py-4 text-sm font-medium text-gray-900 dark:text-white hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <span>Snowball Monthly Schedule (first 24 months)</span>
                {showSchedule
                  ? <ChevronUpIcon className="w-4 h-4 text-gray-400" />
                  : <ChevronDownIcon className="w-4 h-4 text-gray-400" />
                }
              </button>
              {showSchedule && (
                <div className="overflow-x-auto border-t border-gray-200 dark:border-gray-700">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 dark:bg-gray-700/50">
                        <th className="px-4 py-2 text-left text-gray-500 dark:text-gray-400 font-medium">Month</th>
                        <th className="px-4 py-2 text-left text-gray-500 dark:text-gray-400 font-medium">Account</th>
                        <th className="px-4 py-2 text-right text-gray-500 dark:text-gray-400 font-medium">Payment</th>
                        <th className="px-4 py-2 text-right text-gray-500 dark:text-gray-400 font-medium">Interest</th>
                        <th className="px-4 py-2 text-right text-gray-500 dark:text-gray-400 font-medium">Remaining</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {result.snowball.monthly_schedule.map(m =>
                        m.payments.map((p, pi) => (
                          <tr key={`${m.month}-${pi}`} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                            <td className="px-4 py-1.5 text-gray-500 dark:text-gray-400">
                              {pi === 0 ? `Mo ${m.month}` : ''}
                            </td>
                            <td className="px-4 py-1.5 text-gray-700 dark:text-gray-300">{p.account_name}</td>
                            <td className="px-4 py-1.5 text-right text-gray-900 dark:text-white">${fmt(p.payment)}</td>
                            <td className="px-4 py-1.5 text-right text-red-500 dark:text-red-400">${fmt(p.interest)}</td>
                            <td className="px-4 py-1.5 text-right text-gray-700 dark:text-gray-300">${fmt(p.remaining_balance)}</td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default DebtAnalysisPanel;
