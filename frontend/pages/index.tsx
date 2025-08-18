import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import FileUpload from '../components/FileUpload';
import TransactionTable from '../components/TransactionTable';
import CategoryRules from '../components/CategoryRules';
import FilterControls from '../components/FilterControls';
import StatsPanel from '../components/StatsPanel';
import { Transaction, CategoryRule, TransactionFilters, Stats } from '../types';
import { apiService } from '../services/api';

export default function Home() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categoryRules, setCategoryRules] = useState<CategoryRule[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<TransactionFilters>({});
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [perPage, setPerPage] = useState(50);
  const [activeTab, setActiveTab] = useState<'transactions' | 'rules' | 'upload'>('upload');

  // Load initial data
  useEffect(() => {
    loadCategoryRules();
    loadStats();
    loadTransactions();
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
      setError('Failed to load transactions');
      console.error('Error loading transactions:', err);
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
        loadStats()
      ]);
      
      // Stay on current tab - don't auto-redirect
      // Return result for the upload component to show details
      return result;
      
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to upload file');
      throw err; // Re-throw so FileUpload component can handle it
    } finally {
      setLoading(false);
    }
  };

  const handleFiltersChange = (newFilters: TransactionFilters) => {
    setFilters(newFilters);
    setCurrentPage(1); // Reset to first page when filters change
  };

  const handlePerPageChange = (newPerPage: number) => {
    setPerPage(newPerPage);
    setCurrentPage(1); // Reset to first page when changing per-page
  };

  const handleCreateRule = async (rule: Omit<CategoryRule, 'id' | 'created_at' | 'updated_at'>) => {
    try {
      await apiService.createCategoryRule(rule);
      await loadCategoryRules();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to create rule');
    }
  };

  const handleUpdateRule = async (id: number, rule: Partial<CategoryRule>) => {
    try {
      await apiService.updateCategoryRule(id, rule);
      await loadCategoryRules();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to update rule');
    }
  };

  const handleDeleteRule = async (id: number) => {
    try {
      await apiService.deleteCategoryRule(id);
      await loadCategoryRules();
    } catch (err: any) {
      setError(err.response?.data?.error || 'Failed to delete rule');
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
      setError(err.response?.data?.error || 'Failed to clear database');
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

      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between items-center h-16">
              <h1 className="text-2xl font-bold text-gray-900">
                Personal Budgeting App
              </h1>
              <div className="flex items-center space-x-4">
                <div className="text-sm text-gray-500">
                  {stats && `${stats.total_transactions} transactions loaded`}
                </div>
                {stats && stats.total_transactions > 0 && (
                  <button
                    onClick={handleClearDatabase}
                    disabled={loading}
                    className="inline-flex items-center px-3 py-2 border border-red-300 shadow-sm text-sm leading-4 font-medium rounded-md text-red-700 bg-white hover:bg-red-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Clear Database
                  </button>
                )}
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Error Display */}
          {error && (
            <div className="mb-6 bg-red-50 border border-red-200 rounded-md p-4">
              <div className="flex">
                <div className="ml-3">
                  <h3 className="text-sm font-medium text-red-800">Error</h3>
                  <p className="mt-1 text-sm text-red-700">{error}</p>
                </div>
                <button
                  onClick={() => setError(null)}
                  className="ml-auto text-red-500 hover:text-red-700"
                >
                  ×
                </button>
              </div>
            </div>
          )}

          {/* Stats Panel */}
          <StatsPanel stats={stats} />

          {/* Tab Navigation */}
          <div className="border-b border-gray-200 mb-6">
            <nav className="flex space-x-8">
              {[
                { key: 'upload', label: 'Upload CSV' },
                { key: 'transactions', label: 'Transactions' },
                { key: 'rules', label: 'Category Rules' }
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key as typeof activeTab)}
                  className={`py-2 px-1 border-b-2 font-medium text-sm ${
                    activeTab === tab.key
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </nav>
          </div>

          {/* Tab Content */}
          {activeTab === 'upload' && (
            <div className="space-y-6">
              <FileUpload 
                onFileUpload={handleFileUpload} 
                loading={loading} 
              />
            </div>
          )}

          {activeTab === 'transactions' && (
            <div className="space-y-6">
              <FilterControls
                filters={filters}
                onFiltersChange={handleFiltersChange}
                stats={stats}
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
          )}

          {activeTab === 'rules' && (
            <div className="space-y-6">
              <CategoryRules
                rules={categoryRules}
                onCreateRule={handleCreateRule}
                onUpdateRule={handleUpdateRule}
                onDeleteRule={handleDeleteRule}
              />
            </div>
          )}
        </main>
      </div>
    </>
  );
}