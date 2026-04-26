import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { format, subDays } from 'date-fns';
import FileUpload from '../components/FileUpload';
import TransactionTable from '../components/TransactionTable';
import CategoryRules from '../components/CategoryRules';
import FilterControls from '../components/FilterControls';
import StatsPanel from '../components/StatsPanel';
import ThemeToggle from '../components/ThemeToggle';
import DebtDashboard from '../components/DebtDashboard';
import CollapsibleSection from '../components/CollapsibleSection';
import CategoryBreakdownPanel from '../components/CategoryBreakdownPanel';
import BillsPanel from '../components/BillsPanel';
import { Transaction, CategoryRule, TransactionFilters, Stats, BillSuggestion } from '../types';
import { apiService, ApiRequestError } from '../services/api';

export default function Home() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categoryRules, setCategoryRules] = useState<CategoryRule[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [backendDown, setBackendDown] = useState(false);
  const today = format(new Date(), 'yyyy-MM-dd');
  const thirtyDaysAgo = format(subDays(new Date(), 30), 'yyyy-MM-dd');
  const [filters, setFilters] = useState<TransactionFilters>({ start_date: thirtyDaysAgo, end_date: today });
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [activeView, setActiveView] = useState<'budget' | 'debt'>('budget');
  const [billSuggestions, setBillSuggestions] = useState<BillSuggestion[]>([]);
  const [transactionTypes, setTransactionTypes] = useState<string[]>([]);
  const [cardSources, setCardSources] = useState<{ sources: string[]; cards: { source: string; last_four: string }[] }>({ sources: [], cards: [] });

  useEffect(() => {
    const savedView = localStorage.getItem('activeView') as 'budget' | 'debt';
    if (savedView) setActiveView(savedView);
  }, []);

  const handleSetActiveView = (view: 'budget' | 'debt') => {
    setActiveView(view);
    localStorage.setItem('activeView', view);
  };

  const loadFilterOptions = async () => {
    try {
      const [types, sources] = await Promise.all([
        apiService.getTransactionTypes(),
        apiService.getCardSources(),
      ]);
      setTransactionTypes(types);
      setCardSources(sources);
    } catch (err) {
      console.error('Error loading filter options:', err);
    }
  };

  /** Helper: extract a user-friendly message from any error */
  const getUserMessage = (err: unknown, fallback: string): string => {
    if (err instanceof ApiRequestError) return err.userMessage;
    if (err && typeof err === 'object' && 'response' in err) {
      const axiosErr = err as any;
      return axiosErr.response?.data?.error || fallback;
    }
    return fallback;
  };

  // Load initial data — detect if backend is unreachable
  useEffect(() => {
    const initLoad = async () => {
      try {
        await apiService.healthCheck();
        setBackendDown(false);
      } catch (err) {
        if (err instanceof ApiRequestError && err.isConnectionError) {
          setBackendDown(true);
          return; // Don't bother loading anything else
        }
      }
      // Backend is reachable — load everything
      loadCategoryRules();
      loadStats();
      loadTransactions();
      loadFilterOptions();
    };
    initLoad();
  }, []);

  // Reload transactions when filters change
  useEffect(() => {
    loadTransactions();
    loadStats(filters); // Pass filters to stats
  }, [filters, currentPage, perPage]);

  const loadTransactions = async () => {
    try {
      setLoading(true);
      const response = await apiService.getTransactions({
        ...filters,
        page: currentPage,
        per_page: perPage
      });
      setTransactions(response.transactions);
      setTotalPages(response.pagination.pages);
      setError(null);
    } catch (err) {
      setError(getUserMessage(err, 'Failed to load transactions'));
    } finally {
      setLoading(false);
    }
  };

  const loadCategoryRules = async () => {
    try {
      const rules = await apiService.getCategoryRules();
      setCategoryRules(rules);
    } catch (err) {
      console.error('Error loading category rules:', err);
    }
  };

  const loadStats = async (currentFilters: TransactionFilters = {}) => {
    try {
      const statsData = await apiService.getStats(currentFilters);
      setStats(statsData);
    } catch (err) {
      console.error('Error loading stats:', err);
    }
  };

  const handleFileUpload = async (file: File) => {
    try {
      setLoading(true);
      setError(null);
      
      const result = await apiService.uploadCsv(file);
      
      // Reload data after successful upload
      await Promise.all([
        loadTransactions(),
        loadStats(),
        loadFilterOptions(),
      ]);

      return result;
      
    } catch (err: any) {
      setError(getUserMessage(err, 'Failed to upload file'));
      throw err; // Re-throw so FileUpload component can handle it
    } finally {
      setLoading(false);
    }
  };

  const handleFiltersChange = (newFilters: TransactionFilters) => {
    setFilters(newFilters);
    setCurrentPage(1);
  };

  const handleDateRangeChange = (start: string, end: string) => {
    const newFilters = { ...filters, start_date: start, end_date: end };
    setFilters(newFilters);
    setCurrentPage(1);
  };

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setCurrentPage(1);
  };

  const handleCreateRule = async (rule: Omit<CategoryRule, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      await apiService.createCategoryRule(rule);
      await loadCategoryRules();
    } catch (err: any) {
      setError(getUserMessage(err, 'Failed to create rule'));
    }
  };

  const handleUpdateRule = async (id: number, rule: Partial<CategoryRule>) => {
    try {
      await apiService.updateCategoryRule(id, rule);
      await loadCategoryRules();
    } catch (err: any) {
      setError(getUserMessage(err, 'Failed to update rule'));
    }
  };

  const handleDeleteRule = async (id: number) => {
    try {
      await apiService.deleteCategoryRule(id);
      await loadCategoryRules();
    } catch (err: any) {
      setError(getUserMessage(err, 'Failed to delete rule'));
    }
  };

  const handleClearDatabase = async () => {
    if (!confirm('Are you sure you want to clear ALL transactions from the database? This cannot be undone.')) {
      return;
    }

    try {
      setLoading(true);
      const result = await apiService.clearDatabase();
      
      // Reload all data after clearing
      await Promise.all([
        loadTransactions(),
        loadStats()
      ]);
      
      alert(`Successfully cleared ${result.cleared_count} transactions from the database.`);
      
    } catch (err: any) {
      setError(getUserMessage(err, 'Failed to clear database'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <Head>
        <title>Personal Budgeting App</title>
        <meta name="description" content="Personal financial budgeting and expense tracking" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/favicon.ico" />
      </Head>

      {backendDown && (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white dark:bg-gray-800 rounded-xl shadow-lg p-8 text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center mb-5">
              <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
              Backend Server Unavailable
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              The app can&apos;t reach the backend server at{' '}
              <code className="text-sm bg-gray-100 dark:bg-gray-700 px-1.5 py-0.5 rounded">
                {process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:5000/api'}
              </code>.
            </p>
            <div className="text-left bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 mb-6 text-sm text-gray-700 dark:text-gray-300 space-y-2">
              <p className="font-medium">How to fix this:</p>
              <ol className="list-decimal list-inside space-y-1">
                <li>Open a terminal in the project root</li>
                <li>Run <code className="bg-gray-200 dark:bg-gray-600 px-1 rounded">./start.sh</code> to start both servers, or run <code className="bg-gray-200 dark:bg-gray-600 px-1 rounded">cd backend && python app.py</code> for just the backend</li>
                <li>Wait a few seconds, then click Retry below</li>
              </ol>
            </div>
            <div className="text-left bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 mb-6 text-sm text-gray-500 dark:text-gray-400">
              <p className="font-medium text-gray-600 dark:text-gray-300 mb-1">Technical details</p>
              <p>
                <span className="font-mono">GET /api/health</span> failed with a network error.
                This means the Flask server is not running or not reachable.
              </p>
              <p className="mt-1">
                Source: <span className="font-mono">services/api.ts</span> &rarr; <span className="font-mono">pages/index.tsx</span>
              </p>
            </div>
            <button
              onClick={async () => {
                try {
                  await apiService.healthCheck();
                  setBackendDown(false);
                  // Backend is back — load everything
                  loadCategoryRules();
                  loadStats();
                  loadTransactions();
                  loadFilterOptions();
                } catch (err) {
                  // Still down — stay on this screen
                }
              }}
              className="inline-flex items-center px-5 py-2.5 border border-transparent text-sm font-medium rounded-lg shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Retry Connection
            </button>
          </div>
        </div>
      )}

      {!backendDown && <div className="min-h-screen bg-gray-50 dark:bg-gray-900 transition-colors duration-200">
        <header className="bg-white dark:bg-gray-800 shadow-sm border-b border-gray-200 dark:border-gray-700">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                Personal Budgeting App
              </h1>
              <div className="flex items-center space-x-4">
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  {stats && `${stats.total_transactions} transactions loaded`}
                </div>
                {stats && stats.total_transactions > 0 && (
                  <button
                    onClick={handleClearDatabase}
                    disabled={loading}
                    className="inline-flex items-center px-3 py-2 border border-red-300 dark:border-red-700 shadow-sm text-sm leading-4 font-medium rounded-md text-red-700 dark:text-red-400 bg-white dark:bg-gray-800 hover:bg-red-50 dark:hover:bg-red-900/20 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Clear Database
                  </button>
                )}
                <ThemeToggle />
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* View Switcher */}
          <div className="flex items-center space-x-1 bg-gray-100 dark:bg-gray-800 rounded-xl p-1 mb-6 w-fit">
            <button
              onClick={() => handleSetActiveView('budget')}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeView === 'budget'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              Budget
            </button>
            <button
              onClick={() => handleSetActiveView('debt')}
              className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${
                activeView === 'debt'
                  ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
              }`}
            >
              Debt Analysis
            </button>
          </div>

          {activeView === 'debt' && <DebtDashboard filters={filters} />}

          {activeView === 'budget' && <>
          {/* Error Display */}
          {error && (
            <div className="mb-6 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md p-4">
              <div className="flex">
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800 dark:text-red-300">Error</h3>
                  <p className="mt-1 text-sm text-red-700 dark:text-red-400">{error}</p>
                </div>
                <button
                  onClick={() => setError(null)}
                  className="ml-auto text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-200"
                >
                  ×
                </button>
              </div>
            </div>
          )}

          {/* Stats Panel */}
          <StatsPanel
            stats={stats}
            startDate={filters.start_date}
            endDate={filters.end_date}
            onDateRangeChange={handleDateRangeChange}
          />

          {/* Two-Column Grid: Category Breakdown + Bills */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            <CollapsibleSection title="Category Breakdown" defaultOpen storageKey="category_breakdown">
              <CategoryBreakdownPanel stats={stats} />
            </CollapsibleSection>

            <CollapsibleSection title="Bills & Monthly Summary" defaultOpen storageKey="bills_panel">
              <BillsPanel
                suggestions={billSuggestions}
                onSuggestionsChange={setBillSuggestions}
              />
            </CollapsibleSection>
          </div>

          {/* Accordion Sections */}
          <div className="space-y-4">
            <CollapsibleSection title="Upload CSV" storageKey="upload_csv">
              <FileUpload
                onFileUpload={handleFileUpload}
                loading={loading}
              />
            </CollapsibleSection>

            <CollapsibleSection title="Transactions" storageKey="transactions" badge={stats ? `${stats.total_transactions}` : undefined}>
              <div className="space-y-4">
                <FilterControls
                  filters={filters}
                  onFiltersChange={handleFiltersChange}
                  stats={stats}
                  transactionTypes={transactionTypes}
                  cardSources={cardSources}
                />
                <TransactionTable
                  transactions={transactions}
                  loading={loading}
                  currentPage={currentPage}
                  totalPages={totalPages}
                  onPageChange={setCurrentPage}
                  perPage={perPage}
                  onPerPageChange={handlePerPageChange}
                />
              </div>
            </CollapsibleSection>

            <CollapsibleSection title="Category Rules" storageKey="category_rules">
              <CategoryRules
                rules={categoryRules}
                onCreateRule={handleCreateRule}
                onUpdateRule={handleUpdateRule}
                onDeleteRule={handleDeleteRule}
              />
            </CollapsibleSection>
          </div>
          </>}
        </main>
      </div>}
    </>
  );
}