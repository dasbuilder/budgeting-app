import React, { useState, useEffect, useRef, useCallback, Fragment } from 'react';
import { Dialog, Transition } from '@headlessui/react';
import { XMarkIcon, PlusIcon } from '@heroicons/react/24/outline';
import { Bill, BillCategory, DebtAccount } from '../types';
import { apiService } from '../services/api';

interface Props {
  bill: Bill | null;
  onSave: (bill: Bill) => void;
  onClose: () => void;
}

const BillForm: React.FC<Props> = ({ bill, onSave, onClose }) => {
  const isEdit = bill !== null;

  const [billName, setBillName] = useState(bill?.bill_name || '');
  const [amount, setAmount] = useState(bill ? String(bill.amount) : '');
  const [dueDay, setDueDay] = useState<string>(bill?.due_day_of_month ? String(bill.due_day_of_month) : '');
  const [category, setCategory] = useState(bill?.category || '');
  const [isRecurring, setIsRecurring] = useState(bill?.is_recurring ?? true);
  const [isDebtPayment, setIsDebtPayment] = useState(bill?.is_debt_payment ?? false);
  const [linkedDebtAccountId, setLinkedDebtAccountId] = useState<number | null>(bill?.linked_debt_account_id ?? null);
  const [notes, setNotes] = useState(bill?.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [warning, setWarning] = useState('');

  // Category tag state
  const [categories, setCategories] = useState<BillCategory[]>([]);
  const [categoryNames, setCategoryNames] = useState<string[]>([]);
  const [newCatInput, setNewCatInput] = useState('');
  const [showCatInput, setShowCatInput] = useState(false);
  const [creatingCat, setCreatingCat] = useState(false);
  const catInputRef = useRef<HTMLInputElement>(null);
  const formRef = useRef<HTMLFormElement>(null);

  // Debt account state
  const [debtAccounts, setDebtAccounts] = useState<DebtAccount[]>([]);

  useEffect(() => {
    Promise.all([
      apiService.getBillCategories(),
      apiService.getDebtAccounts(),
      apiService.getCategoryNames(),
    ]).then(([cats, accts, names]) => {
      setCategories(cats);
      setDebtAccounts(accts.accounts);
      setCategoryNames(names);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (showCatInput) catInputRef.current?.focus();
  }, [showCatInput]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        e.preventDefault();
        formRef.current?.requestSubmit();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const handleSelectCategory = (name: string) => {
    setCategory(prev => prev === name ? '' : name);
  };

  const handleCreateCategory = async () => {
    const name = newCatInput.trim();
    if (!name) return;

    // Check if it already exists (case-insensitive)
    const existing = categories.find(c => c.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      setCategory(existing.name);
      setNewCatInput('');
      setShowCatInput(false);
      return;
    }

    setCreatingCat(true);
    try {
      const created = await apiService.createBillCategory(name);
      setCategories(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
      setCategory(created.name);
      setNewCatInput('');
      setShowCatInput(false);
    } catch {
      setError('Failed to create category');
    } finally {
      setCreatingCat(false);
    }
  };

  const handleCatInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCreateCategory();
    } else if (e.key === 'Escape') {
      setNewCatInput('');
      setShowCatInput(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!billName.trim() || !amount) {
      setError('Bill name and amount are required');
      return;
    }

    setSaving(true);
    setError('');

    try {
      // If a category is typed but not yet created, create it inline
      const finalCategory = category.trim() || null;
      if (finalCategory) {
        const exists = categories.some(c => c.name.toLowerCase() === finalCategory.toLowerCase());
        if (!exists) {
          const created = await apiService.createBillCategory(finalCategory);
          setCategories(prev => [...prev, created].sort((a, b) => a.name.localeCompare(b.name)));
        }
      }

      const payload: Partial<Bill> & { is_debt_payment?: boolean; linked_debt_account_id?: number | null } = {
        bill_name: billName.trim(),
        amount: parseFloat(amount),
        due_day_of_month: dueDay ? parseInt(dueDay) : null,
        category: finalCategory,
        is_recurring: isRecurring,
        is_debt_payment: isDebtPayment,
        linked_debt_account_id: linkedDebtAccountId,
        notes: notes.trim() || null,
      };

      const saved = isEdit
        ? await apiService.updateBill(bill!.id, payload)
        : await apiService.createBill(payload);

      // Show warning from backend if returned
      if ((saved as any).warning) {
        setWarning((saved as any).warning);
      }

      onSave(saved);
    } catch (err: any) {
      setError(err.userMessage || err.message || 'Failed to save bill');
    } finally {
      setSaving(false);
    }
  };

  // Filter categories for the inline search
  const filteredCategories = newCatInput.trim()
    ? categories.filter(c => c.name.toLowerCase().includes(newCatInput.toLowerCase()))
    : categories;

  // Transaction-derived category suggestions (not already in bill categories)
  const billCatNames = new Set(categories.map(c => c.name.toLowerCase()));
  const txnCategorySuggestions = categoryNames.filter(
    n => !billCatNames.has(n.toLowerCase()) && (!newCatInput.trim() || n.toLowerCase().includes(newCatInput.toLowerCase()))
  );

  const inputMatchesExisting = newCatInput.trim() &&
    (categories.some(c => c.name.toLowerCase() === newCatInput.trim().toLowerCase()) ||
     categoryNames.some(n => n.toLowerCase() === newCatInput.trim().toLowerCase()));

  return (
    <Transition appear show as={Fragment}>
      <Dialog as="div" className="relative z-50" onClose={onClose}>
        <Transition.Child
          as={Fragment}
          enter="ease-out duration-200"
          enterFrom="opacity-0"
          enterTo="opacity-100"
          leave="ease-in duration-150"
          leaveFrom="opacity-100"
          leaveTo="opacity-0"
        >
          <div className="fixed inset-0 bg-black/30" />
        </Transition.Child>

        <div className="fixed inset-0 overflow-y-auto">
          <div className="flex min-h-full items-center justify-center p-4">
            <Transition.Child
              as={Fragment}
              enter="ease-out duration-200"
              enterFrom="opacity-0 scale-95"
              enterTo="opacity-100 scale-100"
              leave="ease-in duration-150"
              leaveFrom="opacity-100 scale-100"
              leaveTo="opacity-0 scale-95"
            >
              <Dialog.Panel className="w-full max-w-md bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6">
                <div className="flex items-center justify-between mb-4">
                  <Dialog.Title className="text-lg font-semibold text-gray-900 dark:text-white">
                    {isEdit ? 'Edit Bill' : 'Add Bill'}
                  </Dialog.Title>
                  <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                    <XMarkIcon className="h-5 w-5" />
                  </button>
                </div>

                {error && (
                  <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-sm text-red-700 dark:text-red-400">
                    {error}
                  </div>
                )}

                <form ref={formRef} onSubmit={handleSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Bill Name *
                    </label>
                    <input
                      type="text"
                      value={billName}
                      onChange={(e) => setBillName(e.target.value)}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="e.g. Mortgage, Netflix, Electric"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Amount *
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500 dark:text-gray-400 text-sm">$</span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg pl-7 pr-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                        placeholder="0.00"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Due Day of Month
                    </label>
                    <select
                      value={dueDay}
                      onChange={(e) => setDueDay(e.target.value)}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    >
                      <option value="">None</option>
                      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>

                  {/* Category tag picker */}
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Category
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {categories.map((cat) => (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => handleSelectCategory(cat.name)}
                          className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium transition-colors ${
                            category === cat.name
                              ? 'bg-blue-600 text-white'
                              : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                          }`}
                        >
                          {cat.name}
                        </button>
                      ))}
                      {!showCatInput ? (
                        <button
                          type="button"
                          onClick={() => setShowCatInput(true)}
                          className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-600 dark:hover:border-blue-500 dark:hover:text-blue-400 transition-colors"
                        >
                          <PlusIcon className="h-3 w-3" />
                          New
                        </button>
                      ) : (
                        <div className="inline-flex items-center gap-1">
                          <input
                            ref={catInputRef}
                            type="text"
                            value={newCatInput}
                            onChange={(e) => setNewCatInput(e.target.value)}
                            onKeyDown={handleCatInputKeyDown}
                            onBlur={() => {
                              if (!newCatInput.trim()) setShowCatInput(false);
                            }}
                            className="w-28 border border-gray-300 dark:border-gray-600 rounded-full px-3 py-1 text-xs bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                            placeholder="Type name..."
                            disabled={creatingCat}
                          />
                          {newCatInput.trim() && !inputMatchesExisting && (
                            <button
                              type="button"
                              onClick={handleCreateCategory}
                              disabled={creatingCat}
                              className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
                            >
                              {creatingCat ? '...' : 'Add'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                    {/* Show filtered suggestions when typing */}
                    {showCatInput && newCatInput.trim() && (filteredCategories.length > 0 || txnCategorySuggestions.length > 0) && !inputMatchesExisting && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {filteredCategories.map((cat) => (
                          <button
                            key={cat.id}
                            type="button"
                            onClick={() => {
                              setCategory(cat.name);
                              setNewCatInput('');
                              setShowCatInput(false);
                            }}
                            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-blue-50 dark:hover:bg-blue-900/30 hover:text-blue-600 dark:hover:text-blue-400 border border-gray-200 dark:border-gray-600"
                          >
                            {cat.name}
                          </button>
                        ))}
                        {txnCategorySuggestions.map((name) => (
                          <button
                            key={`txn-${name}`}
                            type="button"
                            onClick={() => {
                              setCategory(name);
                              setNewCatInput('');
                              setShowCatInput(false);
                            }}
                            className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-50 dark:bg-green-900/20 text-green-600 dark:text-green-400 hover:bg-green-100 dark:hover:bg-green-900/30 border border-green-200 dark:border-green-700"
                          >
                            {name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setIsRecurring(!isRecurring)}
                      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                        isRecurring ? 'bg-blue-600' : 'bg-gray-300 dark:bg-gray-600'
                      }`}
                    >
                      <span
                        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                          isRecurring ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                    <span className="text-sm text-gray-700 dark:text-gray-300">Recurring monthly</span>
                  </div>

                  {/* Debt account linking */}
                  {debtAccounts.length > 0 && (
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        Link to Debt Account
                      </label>
                      <select
                        value={linkedDebtAccountId ?? ''}
                        onChange={(e) => {
                          const val = e.target.value ? parseInt(e.target.value) : null;
                          setLinkedDebtAccountId(val);
                          if (val) {
                            setIsDebtPayment(true);
                            // Auto-populate amount from debt account's minimum payment
                            const acct = debtAccounts.find(a => a.id === val);
                            if (acct && !amount) {
                              setAmount(String(acct.minimum_payment));
                            }
                          } else {
                            setIsDebtPayment(false);
                          }
                        }}
                        className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value="">None (not a debt payment)</option>
                        {debtAccounts.map(acct => (
                          <option key={acct.id} value={acct.id}>
                            {acct.account_name} — ${acct.minimum_payment.toFixed(2)}/mo min
                          </option>
                        ))}
                      </select>
                      {isDebtPayment && (
                        <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                          Marked as debt payment — excluded from variable expenses in analysis to avoid double-counting.
                        </p>
                      )}
                    </div>
                  )}

                  {warning && (
                    <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-sm text-amber-700 dark:text-amber-400">
                      {warning}
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                      Notes
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      rows={2}
                      className="w-full border border-gray-300 dark:border-gray-600 rounded-lg px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Optional notes"
                    />
                  </div>

                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={onClose}
                      className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      {saving ? 'Saving...' : isEdit ? 'Update' : 'Add Bill'}
                    </button>
                  </div>
                </form>
              </Dialog.Panel>
            </Transition.Child>
          </div>
        </div>
      </Dialog>
    </Transition>
  );
};

export default BillForm;
