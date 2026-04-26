import React, { useState, useEffect, Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon, PlusIcon, TrashIcon } from '@heroicons/react/24/outline';
import { DebtAccount, DebtAccountType, CreditCardPromo, StudentLoanItem } from '../types';
import { apiService } from '../services/api';

interface Props {
  account: DebtAccount | null;
  onSave: (account: DebtAccount) => void;
  onClose: () => void;
}

interface PendingLoan {
  id: string;
  loan_name: string;
  balance: string;
  apr: string;
  minimum_payment: string;
}

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const DebtAccountForm: React.FC<Props> = ({ account, onSave, onClose }) => {
  const isEdit = account !== null;

  const [accountType, setAccountType] = useState<DebtAccountType>(account?.account_type || 'credit_card');
  const [accountName, setAccountName] = useState(account?.account_name || '');
  const [balance, setBalance] = useState(account ? String(account.balance) : '');
  const [apr, setApr] = useState(account ? String(account.apr) : '');
  const [minPayment, setMinPayment] = useState(account ? String(account.minimum_payment) : '');
  const [loanTermMonths, setLoanTermMonths] = useState(account?.loan_term_months ? String(account.loan_term_months) : '');
  const [startDate, setStartDate] = useState(account?.start_date ? account.start_date.split('T')[0] : '');
  const [isExcluded, setIsExcluded] = useState(account?.is_excluded_from_analysis ?? account?.account_type === 'mortgage');

  const [creditLimit, setCreditLimit] = useState(
    account?.account_type === 'credit_card' && account?.credit_limit != null
      ? String(account.credit_limit)
      : ''
  );

  // Credit card promos
  const [promos, setPromos] = useState<CreditCardPromo[]>(account?.promos || []);
  const [hasPromo, setHasPromo] = useState(false);
  const [promoBalance, setPromoBalance] = useState('');
  const [promoApr, setPromoApr] = useState('');
  const [promoExpiry, setPromoExpiry] = useState('');

  // Student loan individual items
  // loanItems = already-saved items (edit mode)
  // pendingLoans = unsaved loans being built up (create mode, saved on submit)
  const [loanItems, setLoanItems] = useState<StudentLoanItem[]>(account?.loan_items || []);
  const [enterIndividualLoans, setEnterIndividualLoans] = useState(
    isEdit ? (account?.loan_items?.length ?? 0) > 0 : false
  );
  const [pendingLoans, setPendingLoans] = useState<PendingLoan[]>([]);

  // Fields for the "add a loan" row
  const [newLoanName, setNewLoanName] = useState('');
  const [newLoanBalance, setNewLoanBalance] = useState('');
  const [newLoanApr, setNewLoanApr] = useState('');
  const [newLoanMin, setNewLoanMin] = useState('');
  const [addingLoan, setAddingLoan] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (accountType === 'mortgage') setIsExcluded(true);
    if (accountType !== 'credit_card') setCreditLimit('');
  }, [accountType]);

  // Auto-populate parent totals from pending loans (create mode only)
  useEffect(() => {
    if (isEdit || !enterIndividualLoans || pendingLoans.length === 0) return;
    const totalBal = pendingLoans.reduce((s, l) => s + (parseFloat(l.balance) || 0), 0);
    const totalMin = pendingLoans.reduce((s, l) => s + (parseFloat(l.minimum_payment) || 0), 0);
    const weightedApr = totalBal > 0
      ? pendingLoans.reduce((s, l) => s + (parseFloat(l.apr) || 0) * ((parseFloat(l.balance) || 0) / totalBal), 0)
      : 0;
    setBalance(totalBal.toFixed(2));
    setApr(weightedApr.toFixed(2));
    setMinPayment(totalMin.toFixed(2));
  }, [pendingLoans, enterIndividualLoans, isEdit]);

  // --- Add pending loan (local, create mode) ---
  const handleAddPendingLoan = () => {
    if (!newLoanName.trim()) return;
    setPendingLoans(prev => [...prev, {
      id: Date.now().toString(),
      loan_name: newLoanName.trim(),
      balance: newLoanBalance,
      apr: newLoanApr,
      minimum_payment: newLoanMin,
    }]);
    setNewLoanName(''); setNewLoanBalance(''); setNewLoanApr(''); setNewLoanMin('');
  };

  const handleRemovePendingLoan = (id: string) => {
    setPendingLoans(prev => prev.filter(l => l.id !== id));
  };

  // --- Add/delete saved loan items (immediate API, edit mode) ---
  const handleAddSavedLoan = async () => {
    if (!isEdit || !newLoanName.trim()) return;
    setAddingLoan(true);
    try {
      const item = await apiService.createStudentLoanItem(account!.id, {
        loan_name: newLoanName.trim(),
        balance: parseFloat(newLoanBalance) || 0,
        apr: parseFloat(newLoanApr) || 0,
        minimum_payment: parseFloat(newLoanMin) || 0,
      });
      setLoanItems(prev => [...prev, item]);
      setNewLoanName(''); setNewLoanBalance(''); setNewLoanApr(''); setNewLoanMin('');
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to add loan');
    } finally {
      setAddingLoan(false);
    }
  };

  const handleDeleteSavedLoan = async (loanId: number) => {
    if (!isEdit) return;
    try {
      await apiService.deleteStudentLoanItem(account!.id, loanId);
      setLoanItems(prev => prev.filter(l => l.id !== loanId));
    } catch {
      // ignore
    }
  };

  // --- Promo delete (edit mode) ---
  const handleDeletePromo = async (promoId: number) => {
    if (!isEdit) return;
    try {
      await apiService.deleteDebtPromo(account!.id, promoId);
      setPromos(prev => prev.filter(p => p.id !== promoId));
    } catch {
      // ignore
    }
  };

  // --- Save ---
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!accountName.trim()) { setError('Account name is required'); return; }
    setSaving(true);
    setError('');
    try {
      const payload: Partial<DebtAccount> = {
        account_type: accountType,
        account_name: accountName.trim(),
        balance: parseFloat(balance) || 0,
        apr: parseFloat(apr) || 0,
        minimum_payment: parseFloat(minPayment) || 0,
        is_excluded_from_analysis: isExcluded,
      };
      if (accountType === 'credit_card') {
        payload.credit_limit = creditLimit && parseFloat(creditLimit) > 0 ? parseFloat(creditLimit) : null;
      }
      if (accountType === 'mortgage') {
        if (loanTermMonths) payload.loan_term_months = parseInt(loanTermMonths);
        if (startDate) payload.start_date = startDate;
      }

      let saved: DebtAccount;
      if (isEdit) {
        saved = await apiService.updateDebtAccount(account!.id, payload);
      } else {
        saved = await apiService.createDebtAccount(payload);
      }

      // Save promo if checkbox checked (credit card)
      if (accountType === 'credit_card' && hasPromo && promoBalance && promoExpiry) {
        const promo = await apiService.createDebtPromo(saved.id, {
          promo_balance: parseFloat(promoBalance) || 0,
          promo_apr: parseFloat(promoApr) || 0,
          promo_expiry_date: promoExpiry,
        });
        saved = { ...saved, promos: [...(saved.promos || []), promo] };
      }

      // Save pending individual loans (create mode, student loan)
      if (accountType === 'student_loan' && !isEdit && pendingLoans.length > 0) {
        const createdItems: StudentLoanItem[] = [];
        for (const loan of pendingLoans) {
          const item = await apiService.createStudentLoanItem(saved.id, {
            loan_name: loan.loan_name,
            balance: parseFloat(loan.balance) || 0,
            apr: parseFloat(loan.apr) || 0,
            minimum_payment: parseFloat(loan.minimum_payment) || 0,
          });
          createdItems.push(item);
        }
        saved = { ...saved, loan_items: createdItems };
      }

      onSave(saved);
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to save account');
    } finally {
      setSaving(false);
    }
  };

  const inputClass = 'w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  const inputReadOnlyClass = 'w-full rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400 px-3 py-2 text-sm cursor-not-allowed';
  const labelClass = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

  // Computed totals from pending loans (used to show auto-calc note)
  const pendingTotalBalance = pendingLoans.reduce((s, l) => s + (parseFloat(l.balance) || 0), 0);
  const pendingTotalMin = pendingLoans.reduce((s, l) => s + (parseFloat(l.minimum_payment) || 0), 0);
  const usingComputedTotals = !isEdit && enterIndividualLoans && pendingLoans.length > 0;

  // Whether to show the loan entry area (create mode: checkbox; edit mode: always if student_loan)
  const showLoanSection = accountType === 'student_loan' && (isEdit ? true : enterIndividualLoans);

  // Add-loan row (shared between create/edit, different handlers)
  const loanAddRow = (
    <div className="space-y-2">
      <input
        type="text" value={newLoanName} onChange={e => setNewLoanName(e.target.value)}
        placeholder="Loan name (e.g. Subsidized Stafford)"
        className={inputClass}
        onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); isEdit ? handleAddSavedLoan() : handleAddPendingLoan(); } }}
      />
      <div className="grid grid-cols-7 gap-2">
        <div className="col-span-2 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
          <input type="number" min="0" step="0.01" value={newLoanBalance}
            onChange={e => setNewLoanBalance(e.target.value)} placeholder="Balance"
            className={`pl-7 ${inputClass}`} />
        </div>
        <div className="col-span-2">
          <input type="number" min="0" step="0.01" value={newLoanApr}
            onChange={e => setNewLoanApr(e.target.value)} placeholder="APR %"
            className={inputClass} />
        </div>
        <div className="col-span-2 relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
          <input type="number" min="0" step="0.01" value={newLoanMin}
            onChange={e => setNewLoanMin(e.target.value)} placeholder="Min/mo"
            className={`pl-7 ${inputClass}`} />
        </div>
        <button
          type="button"
          onClick={isEdit ? handleAddSavedLoan : handleAddPendingLoan}
          disabled={!newLoanName.trim() || (isEdit && addingLoan)}
          className="flex items-center justify-center rounded-lg bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white transition-colors"
        >
          <PlusIcon className="w-5 h-5" />
        </button>
      </div>
    </div>
  );

  return (
    <Transition appear show as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200" enterFrom="opacity-0" enterTo="opacity-100"
          leave="ease-in duration-150" leaveFrom="opacity-100" leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/50" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200" enterFrom="opacity-0 scale-95" enterTo="opacity-100 scale-100"
              leave="ease-in duration-150" leaveFrom="opacity-100 scale-100" leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-lg bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-6">
                <div className="flex items-center justify-between mb-6">
                  <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-white">
                    {isEdit ? 'Edit Account' : 'Add Debt Account'}
                  </Dialog.Title>
                  <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>

                {error && (
                  <p className="mb-4 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 rounded-lg px-3 py-2">{error}</p>
                )}

                <form onSubmit={handleSave} className="space-y-4">
                  {!isEdit && (
                    <div>
                      <label className={labelClass}>Account Type</label>
                      <select
                        value={accountType}
                        onChange={e => setAccountType(e.target.value as DebtAccountType)}
                        className={inputClass}
                      >
                        <option value="credit_card">Credit Card</option>
                        <option value="loan">Loan</option>
                        <option value="mortgage">Mortgage</option>
                        <option value="student_loan">Student Loan</option>
                      </select>
                    </div>
                  )}

                  <div>
                    <label className={labelClass}>
                      {accountType === 'student_loan' ? 'Servicer Name' : 'Account Name'}
                    </label>
                    <input
                      type="text"
                      value={accountName}
                      onChange={e => setAccountName(e.target.value)}
                      placeholder={accountType === 'student_loan' ? 'e.g. Nelnet' : 'e.g. Chase Sapphire'}
                      className={inputClass}
                    />
                  </div>

                  {/* Balance / APR / Min — read-only when computed from individual loans */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <label className={labelClass}>
                        Balance
                        {usingComputedTotals && <span className="ml-1 text-xs text-blue-500 font-normal">auto</span>}
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                        <input type="number" min="0" step="0.01" value={balance}
                          onChange={e => !usingComputedTotals && setBalance(e.target.value)}
                          readOnly={usingComputedTotals}
                          placeholder="0.00"
                          className={`pl-7 ${usingComputedTotals ? inputReadOnlyClass : inputClass}`} />
                      </div>
                    </div>
                    <div>
                      <label className={labelClass}>
                        APR (%)
                        {usingComputedTotals && <span className="ml-1 text-xs text-blue-500 font-normal">avg</span>}
                      </label>
                      <input type="number" min="0" step="0.01" value={apr}
                        onChange={e => !usingComputedTotals && setApr(e.target.value)}
                        readOnly={usingComputedTotals}
                        placeholder="0.00"
                        className={usingComputedTotals ? inputReadOnlyClass : inputClass} />
                    </div>
                    <div>
                      <label className={labelClass}>
                        Min Payment
                        {usingComputedTotals && <span className="ml-1 text-xs text-blue-500 font-normal">auto</span>}
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                        <input type="number" min="0" step="0.01" value={minPayment}
                          onChange={e => !usingComputedTotals && setMinPayment(e.target.value)}
                          readOnly={usingComputedTotals}
                          placeholder="0.00"
                          className={`pl-7 ${usingComputedTotals ? inputReadOnlyClass : inputClass}`} />
                      </div>
                    </div>
                  </div>

                  {accountType === 'mortgage' && (
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className={labelClass}>Loan Term (months)</label>
                        <input type="number" min="1" value={loanTermMonths}
                          onChange={e => setLoanTermMonths(e.target.value)} placeholder="360"
                          className={inputClass} />
                      </div>
                      <div>
                        <label className={labelClass}>Start Date</label>
                        <input type="date" value={startDate}
                          onChange={e => setStartDate(e.target.value)}
                          className={inputClass} />
                      </div>
                    </div>
                  )}

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox" checked={isExcluded}
                      onChange={e => setIsExcluded(e.target.checked)}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700 dark:text-gray-300">
                      Exclude from payoff analysis
                      {accountType === 'mortgage' && <span className="ml-1 text-gray-400">(recommended for mortgages)</span>}
                    </span>
                  </label>

                  {/* Credit card: credit limit */}
                  {accountType === 'credit_card' && (
                    <div>
                      <label className={labelClass}>
                        Credit Limit <span className="text-gray-400 font-normal">(optional)</span>
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                        <input
                          type="number" min="0" step="0.01"
                          value={creditLimit}
                          onChange={e => setCreditLimit(e.target.value)}
                          placeholder="e.g. 5000.00"
                          className={`pl-7 ${inputClass}`}
                        />
                      </div>
                      {creditLimit && parseFloat(creditLimit) > 0 && balance && parseFloat(balance) > 0 && (
                        <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          Utilization: {((parseFloat(balance) / parseFloat(creditLimit)) * 100).toFixed(1)}%
                        </p>
                      )}
                    </div>
                  )}

                  {/* Credit card: promo balance */}
                  {accountType === 'credit_card' && (
                    <div>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={hasPromo}
                          onChange={e => setHasPromo(e.target.checked)}
                          className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                        <span className="text-sm text-gray-700 dark:text-gray-300">Has a promotional balance</span>
                      </label>
                      {hasPromo && (
                        <div className="mt-3 pl-7 space-y-3">
                          <div className="grid grid-cols-3 gap-3">
                            <div>
                              <label className={labelClass}>Promo Balance</label>
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                                <input type="number" min="0" step="0.01"
                                  value={promoBalance} onChange={e => setPromoBalance(e.target.value)}
                                  placeholder="0.00" className={`pl-7 ${inputClass}`} />
                              </div>
                            </div>
                            <div>
                              <label className={labelClass}>Promo APR (%)</label>
                              <input type="number" min="0" step="0.01"
                                value={promoApr} onChange={e => setPromoApr(e.target.value)}
                                placeholder="0.00" className={inputClass} />
                            </div>
                            <div>
                              <label className={labelClass}>Expiration Date</label>
                              <input type="date"
                                value={promoExpiry} onChange={e => setPromoExpiry(e.target.value)}
                                className={inputClass} />
                            </div>
                          </div>
                          {!promoBalance && (
                            <p className="text-xs text-amber-600 dark:text-amber-400">Enter a promo balance and expiration date to save.</p>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Student loan: individual loans checkbox + entry area */}
                  {accountType === 'student_loan' && (
                    <div>
                      {/* Only show checkbox in create mode (edit shows the section directly if items exist) */}
                      {!isEdit && (
                        <label className="flex items-center gap-3 cursor-pointer">
                          <input type="checkbox" checked={enterIndividualLoans}
                            onChange={e => {
                              setEnterIndividualLoans(e.target.checked);
                              if (!e.target.checked) setPendingLoans([]);
                            }}
                            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                          />
                          <span className="text-sm text-gray-700 dark:text-gray-300">
                            Enter individual loans separately
                          </span>
                        </label>
                      )}

                      {showLoanSection && (
                        <div className={`space-y-3 ${!isEdit ? 'mt-3 pl-7' : ''}`}>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            Each loan will be treated as a separate debt in the payoff analysis — allowing snowball and avalanche to target them individually.
                          </p>

                          {/* Pending loans list (create mode) */}
                          {!isEdit && pendingLoans.length > 0 && (
                            <div className="space-y-1.5">
                              {pendingLoans.map(l => (
                                <div key={l.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2 text-sm">
                                  <div className="flex-1 min-w-0">
                                    <span className="font-medium text-gray-800 dark:text-gray-200">{l.loan_name}</span>
                                    <span className="ml-3 text-gray-500 dark:text-gray-400">
                                      ${fmt(parseFloat(l.balance) || 0)} @ {l.apr || '0'}% | ${fmt(parseFloat(l.minimum_payment) || 0)}/mo
                                    </span>
                                  </div>
                                  <button type="button" onClick={() => handleRemovePendingLoan(l.id)}
                                    className="ml-2 text-red-400 hover:text-red-600 flex-shrink-0">
                                    <TrashIcon className="w-4 h-4" />
                                  </button>
                                </div>
                              ))}
                              <div className="pt-1 pb-1 border-t border-gray-100 dark:border-gray-700 text-xs text-gray-500 dark:text-gray-400 flex gap-4">
                                <span>Total balance: <strong className="text-gray-800 dark:text-gray-200">${fmt(pendingTotalBalance)}</strong></span>
                                <span>Total min: <strong className="text-gray-800 dark:text-gray-200">${fmt(pendingTotalMin)}/mo</strong></span>
                              </div>
                            </div>
                          )}

                          {/* Saved loan items list (edit mode) */}
                          {isEdit && loanItems.length > 0 && (
                            <div className="space-y-1.5">
                              {loanItems.map(l => (
                                <div key={l.id} className="flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2 text-sm">
                                  <div className="flex-1 min-w-0">
                                    <span className="font-medium text-gray-800 dark:text-gray-200">{l.loan_name}</span>
                                    <span className="ml-3 text-gray-500 dark:text-gray-400">
                                      ${fmt(l.balance)} @ {l.apr}% | ${fmt(l.minimum_payment)}/mo
                                    </span>
                                  </div>
                                  <button type="button" onClick={() => handleDeleteSavedLoan(l.id)}
                                    className="ml-2 text-red-400 hover:text-red-600 flex-shrink-0">
                                    <TrashIcon className="w-4 h-4" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          {/* Add-a-loan row */}
                          <div className="pt-1">
                            <p className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">Add a loan</p>
                            {loanAddRow}
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex justify-end gap-3 pt-2">
                    <button type="button" onClick={onClose}
                      className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                      Cancel
                    </button>
                    <button type="submit" disabled={saving}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 rounded-lg transition-colors">
                      {saving ? 'Saving…' : isEdit ? 'Save Changes' : 'Add Account'}
                    </button>
                  </div>
                </form>

                {/* Saved promo balances (edit mode — view/delete) */}
                {isEdit && accountType === 'credit_card' && promos.length > 0 && (
                  <div className="mt-6 pt-6 border-t border-gray-200 dark:border-gray-700">
                    <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Saved Promotional Balances</h4>
                    <div className="space-y-2">
                      {promos.map(p => (
                        <div key={p.id} className="flex items-center justify-between text-sm bg-gray-50 dark:bg-gray-700/50 rounded-lg px-3 py-2">
                          <span className="text-gray-700 dark:text-gray-300">
                            ${fmt(p.promo_balance)} @ {p.promo_apr}% APR
                            {p.promo_expiry_date && <span className="ml-2 text-gray-400">expires {p.promo_expiry_date}</span>}
                          </span>
                          <button onClick={() => handleDeletePromo(p.id)} className="text-red-400 hover:text-red-600 ml-2">
                            <TrashIcon className="w-4 h-4" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default DebtAccountForm;
