import React, { useState } from 'react';
import { format } from 'date-fns';
import { TransactionFilters, Stats } from '../types';
import { FunnelIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface FilterControlsProps {
  filters: TransactionFilters;
  onFiltersChange: (filters: TransactionFilters) => void;
  stats: Stats | null;
}

const FilterControls: React.FC<FilterControlsProps> = ({
  filters,
  onFiltersChange,
  stats,
}) => {
  const [localFilters, setLocalFilters] = useState<TransactionFilters>(filters);
  const [showFilters, setShowFilters] = useState(false);

  const handleFilterChange = (key: keyof TransactionFilters, value: string) => {
    const newFilters = { ...localFilters, [key]: value || undefined };
    setLocalFilters(newFilters);
  };

  const applyFilters = () => {
    onFiltersChange(localFilters);
  };

  const clearFilters = () => {
    const emptyFilters: TransactionFilters = {};
    setLocalFilters(emptyFilters);
    onFiltersChange(emptyFilters);
  };

  const hasActiveFilters = Object.values(filters).some(value => value);

  // Get unique categories and transaction types from stats
  const categories = stats?.categories.map(cat => cat.category).filter(Boolean) || [];
  const uniqueCategories = [...new Set(categories)].sort();

  // Common transaction types (can be expanded based on your data)
  const transactionTypes = ['Debit', 'Credit', 'Check', 'Transfer', 'Fee', 'Interest'];

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-gray-900">Filter Transactions</h2>
          <div className="flex items-center space-x-2">
            {hasActiveFilters && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                {Object.values(filters).filter(Boolean).length} active
              </span>
            )}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <FunnelIcon className="h-4 w-4 mr-2" />
              {showFilters ? 'Hide Filters' : 'Show Filters'}
            </button>
          </div>
        </div>
      </div>

      {showFilters && (
        <div className="px-6 py-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Transaction Type Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Transaction Type
              </label>
              <select
                value={localFilters.type || ''}
                onChange={(e) => handleFilterChange('type', e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Types</option>
                {transactionTypes.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            {/* Category Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Category
              </label>
              <select
                value={localFilters.category || ''}
                onChange={(e) => handleFilterChange('category', e.target.value)}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Categories</option>
                {uniqueCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>

            {/* Start Date Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Start Date
              </label>
              <input
                type="date"
                value={localFilters.start_date || ''}
                onChange={(e) => handleFilterChange('start_date', e.target.value)}
                max={localFilters.end_date || undefined}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* End Date Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                End Date
              </label>
              <input
                type="date"
                value={localFilters.end_date || ''}
                onChange={(e) => handleFilterChange('end_date', e.target.value)}
                min={localFilters.start_date || undefined}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Quick Date Ranges */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Quick Date Ranges
            </label>
            <div className="flex flex-wrap gap-2">
              {[
                { label: 'Last 7 days', days: 7 },
                { label: 'Last 30 days', days: 30 },
                { label: 'Last 90 days', days: 90 },
                { label: 'This Year', days: null, isYear: true },
              ].map((range) => (
                <button
                  key={range.label}
                  onClick={() => {
                    const today = new Date();
                    let startDate: Date;
                    
                    if (range.isYear) {
                      startDate = new Date(today.getFullYear(), 0, 1);
                    } else {
                      startDate = new Date(today);
                      startDate.setDate(today.getDate() - (range.days || 0));
                    }
                    
                    const newFilters = {
                      ...localFilters,
                      start_date: format(startDate, 'yyyy-MM-dd'),
                      end_date: format(today, 'yyyy-MM-dd'),
                    };
                    setLocalFilters(newFilters);
                  }}
                  className="px-3 py-1 text-xs font-medium text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-md border border-gray-300"
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-200">
            <div className="text-sm text-gray-500">
              {stats && (
                <>
                  Date range: {stats.date_range.earliest ? format(new Date(stats.date_range.earliest), 'MMM dd, yyyy') : 'N/A'} - {' '}
                  {stats.date_range.latest ? format(new Date(stats.date_range.latest), 'MMM dd, yyyy') : 'N/A'}
                </>
              )}
            </div>
            <div className="flex space-x-3">
              <button
                onClick={clearFilters}
                className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <XMarkIcon className="h-4 w-4 mr-2" />
                Clear All
              </button>
              <button
                onClick={applyFilters}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                Apply Filters
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Active Filters Display */}
      {hasActiveFilters && (
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-200">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-gray-700">Active filters:</span>
            <div className="flex flex-wrap gap-2">
              {Object.entries(filters).map(([key, value]) => {
                if (!value) return null;
                
                const displayValue = key.includes('date') ? format(new Date(value), 'MMM dd, yyyy') : value;
                const displayKey = key.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase());
                
                return (
                  <span
                    key={key}
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                  >
                    {displayKey}: {displayValue}
                    <button
                      onClick={() => {
                        const newFilters = { ...filters };
                        delete newFilters[key as keyof TransactionFilters];
                        setLocalFilters(newFilters);
                        onFiltersChange(newFilters);
                      }}
                      className="ml-1 text-blue-600 hover:text-blue-800"
                    >
                      ×
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default FilterControls;