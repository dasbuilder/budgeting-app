import React, { useState } from 'react';
import { format } from 'date-fns';
import { TransactionFilters, Stats } from '../types';
import { FunnelIcon, XMarkIcon } from '@heroicons/react/24/outline';

interface CardSourceData {
  sources: string[];
  cards: { source: string; last_four: string }[];
}

interface FilterControlsProps {
  filters: TransactionFilters;
  onFiltersChange: (filters: TransactionFilters) => void;
  stats: Stats | null;
  transactionTypes: string[];
  cardSources: CardSourceData;
}

const FilterControls: React.FC<FilterControlsProps> = ({
  filters,
  onFiltersChange,
  stats,
  transactionTypes,
  cardSources,
}) => {
  const [localFilters, setLocalFilters] = useState<TransactionFilters>(filters);
  const [showFilters, setShowFilters] = useState(false);

  const handleFilterChange = (key: keyof TransactionFilters, value: string) => {
    const newFilters = { ...localFilters, [key]: value || undefined };
    // Clear card_last_four when card_source changes
    if (key === 'card_source') {
      delete newFilters.card_last_four;
    }
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

  // Get unique categories from stats
  const categories = stats?.categories.map(cat => cat.category).filter(Boolean) || [];
  const uniqueCategories = Array.from(new Set(categories)).sort();

  // Cards filtered by selected source
  const cardsForSource = localFilters.card_source
    ? cardSources.cards.filter(c => c.source === localFilters.card_source)
    : [];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow">
      <div className="px-6 py-4 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white">Filter Transactions</h2>
          <div className="flex items-center space-x-2">
            {hasActiveFilters && (
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                {Object.values(filters).filter(Boolean).length} active
              </span>
            )}
            <button
              onClick={() => setShowFilters(!showFilters)}
              className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <FunnelIcon className="h-4 w-4 mr-2" />
              {showFilters ? 'Hide Filters' : 'Show Filters'}
            </button>
          </div>
        </div>
      </div>

      {showFilters && (
        <div className="px-6 py-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Transaction Type Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Transaction Type
              </label>
              <select
                value={localFilters.type || ''}
                onChange={(e) => handleFilterChange('type', e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500"
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
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Category
              </label>
              <select
                value={localFilters.category || ''}
                onChange={(e) => handleFilterChange('category', e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Categories</option>
                {uniqueCategories.map((category) => (
                  <option key={category} value={category}>
                    {category}
                  </option>
                ))}
              </select>
            </div>

            {/* Card Source Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Card Source
              </label>
              <select
                value={localFilters.card_source || ''}
                onChange={(e) => handleFilterChange('card_source', e.target.value)}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Sources</option>
                {cardSources.sources.map((source) => (
                  <option key={source} value={source}>
                    {source.charAt(0).toUpperCase() + source.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            {/* Specific Card Filter (only when source selected and cards exist) */}
            {localFilters.card_source && cardsForSource.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Card
                </label>
                <select
                  value={localFilters.card_last_four || ''}
                  onChange={(e) => handleFilterChange('card_last_four', e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="">All Cards</option>
                  {cardsForSource.map((card) => (
                    <option key={card.last_four} value={card.last_four}>
                      ...{card.last_four}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Start Date Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Start Date
              </label>
              <input
                type="date"
                value={localFilters.start_date || ''}
                onChange={(e) => handleFilterChange('start_date', e.target.value)}
                max={localFilters.end_date || undefined}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            {/* End Date Filter */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                End Date
              </label>
              <input
                type="date"
                value={localFilters.end_date || ''}
                onChange={(e) => handleFilterChange('end_date', e.target.value)}
                min={localFilters.start_date || undefined}
                className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          {/* Quick Date Ranges */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
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
                  className="px-3 py-1 text-xs font-medium text-gray-700 dark:text-gray-200 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 rounded-md border border-gray-300 dark:border-gray-600"
                >
                  {range.label}
                </button>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-gray-200 dark:border-gray-700">
            <div className="text-sm text-gray-500 dark:text-gray-400">
              {stats && (
                <>
                  Date range: {stats.date_range.earliest ? format(new Date(stats.date_range.earliest), 'MMM dd, yyyy') : 'N/A'} -{' '}
                  {stats.date_range.latest ? format(new Date(stats.date_range.latest), 'MMM dd, yyyy') : 'N/A'}
                </>
              )}
            </div>
            <div className="flex space-x-3">
              <button
                onClick={clearFilters}
                className="inline-flex items-center px-3 py-2 border border-gray-300 dark:border-gray-600 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-700 hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
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
        <div className="px-6 py-3 bg-gray-50 dark:bg-gray-700/50 border-t border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-2">
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">Active filters:</span>
            <div className="flex flex-wrap gap-2">
              {Object.entries(filters).map(([key, value]) => {
                if (!value) return null;

                let displayValue: string;
                if (key.includes('date')) {
                  displayValue = format(new Date(value), 'MMM dd, yyyy');
                } else if (key === 'card_source') {
                  displayValue = value.charAt(0).toUpperCase() + value.slice(1);
                } else if (key === 'card_last_four') {
                  displayValue = `...${value}`;
                } else {
                  displayValue = value;
                }
                const displayKey = key === 'card_last_four' ? 'Card' : key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

                return (
                  <span
                    key={key}
                    className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200"
                  >
                    {displayKey}: {displayValue}
                    <button
                      onClick={() => {
                        const newFilters = { ...filters };
                        delete newFilters[key as keyof TransactionFilters];
                        // Clear card_last_four if clearing card_source
                        if (key === 'card_source') {
                          delete newFilters.card_last_four;
                        }
                        setLocalFilters(newFilters);
                        onFiltersChange(newFilters);
                      }}
                      className="ml-1 text-blue-600 dark:text-blue-300 hover:text-blue-800 dark:hover:text-blue-100"
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
