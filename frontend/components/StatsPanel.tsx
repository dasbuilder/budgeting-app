import React, { useState, useRef, useEffect } from 'react';
import { format, parseISO, subDays, startOfYear } from 'date-fns';
import { Stats } from '../types';
import {
  BanknotesIcon,
  ChartBarIcon,
  CalendarDaysIcon,
  TagIcon,
  PencilSquareIcon
} from '@heroicons/react/24/outline';

interface StatsPanelProps {
  stats: Stats | null;
  startDate?: string;
  endDate?: string;
  onDateRangeChange?: (start: string, end: string) => void;
}

const StatsPanel: React.FC<StatsPanelProps> = ({ stats, startDate, endDate, onDateRangeChange }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [localStart, setLocalStart] = useState(startDate || '');
  const [localEnd, setLocalEnd] = useState(endDate || '');
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => { setLocalStart(startDate || ''); }, [startDate]);
  useEffect(() => { setLocalEnd(endDate || ''); }, [endDate]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const applyPreset = (days: number | null) => {
    if (days === null) {
      setLocalStart('');
      setLocalEnd('');
    } else if (days === 0) {
      // This Year
      setLocalStart(format(startOfYear(new Date()), 'yyyy-MM-dd'));
      setLocalEnd(format(new Date(), 'yyyy-MM-dd'));
    } else {
      setLocalStart(format(subDays(new Date(), days), 'yyyy-MM-dd'));
      setLocalEnd(format(new Date(), 'yyyy-MM-dd'));
    }
  };

  const handleApply = () => {
    onDateRangeChange?.(localStart, localEnd);
    setIsOpen(false);
  };

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    try {
      return format(parseISO(dateString), 'MMM dd, yyyy');
    } catch {
      return 'Invalid Date';
    }
  };

  const displayStart = startDate
    ? formatDate(startDate)
    : (stats?.date_range?.earliest ? formatDate(stats.date_range.earliest) : null);

  const displayEnd = endDate
    ? formatDate(endDate)
    : (stats?.date_range?.latest ? formatDate(stats.date_range.latest) : null);

  const dateDisplayText =
    displayStart && displayEnd
      ? `${displayStart} - ${displayEnd}`
      : 'All Time';

  if (!stats) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <div className="animate-pulse">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4 mb-2"></div>
              <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD'
    }).format(amount);
  };

  // Calculate totals
  const totalSpending = stats.categories.reduce((sum, cat) => {
    return sum + (cat.total_amount < 0 ? Math.abs(cat.total_amount) : 0);
  }, 0);

  const totalIncome = stats.total_income;

  const netAmount = totalIncome - totalSpending;

  // Get top spending category
  const topSpendingCategory = stats.categories
    .filter(cat => cat.total_amount < 0)
    .sort((a, b) => a.total_amount - b.total_amount)[0];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* Total Transactions */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <ChartBarIcon className="h-8 w-8 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Transactions</p>
            <p className="text-2xl font-semibold text-gray-900 dark:text-white">
              {stats.total_transactions.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Total Spending */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <BanknotesIcon className="h-8 w-8 text-red-600 dark:text-red-400" />
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Spending</p>
            <p className="text-2xl font-semibold text-red-600 dark:text-red-400">
              {formatCurrency(totalSpending)}
            </p>
          </div>
        </div>
      </div>

      {/* Total Income */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <BanknotesIcon className="h-8 w-8 text-green-600 dark:text-green-400" />
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Total Income</p>
            <p className="text-2xl font-semibold text-green-600 dark:text-green-400">
              {formatCurrency(totalIncome)}
            </p>
          </div>
        </div>
      </div>

      {/* Net Amount */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <CalendarDaysIcon className="h-8 w-8 text-gray-600 dark:text-gray-400" />
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Net Amount</p>
            <p className={`text-2xl font-semibold ${
              netAmount >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
            }`}>
              {formatCurrency(netAmount)}
            </p>
          </div>
        </div>
      </div>

      {/* Date Range — interactive filter card */}
      <div
        ref={containerRef}
        className="relative bg-white dark:bg-gray-800 rounded-lg shadow p-6 md:col-span-2 cursor-pointer hover:ring-2 hover:ring-purple-300 dark:hover:ring-purple-700 transition-shadow"
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <CalendarDaysIcon className="h-8 w-8 text-purple-600 dark:text-purple-400" />
            </div>
            <div className="ml-4">
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Date Range</p>
              <p className="text-lg font-semibold text-gray-900 dark:text-white">
                {dateDisplayText}
              </p>
            </div>
          </div>
          <PencilSquareIcon className="h-5 w-5 text-gray-400 dark:text-gray-500 flex-shrink-0 ml-2" />
        </div>

        {isOpen && (
          <div
            className="absolute top-full left-0 mt-2 w-80 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-lg p-4 z-50"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Date inputs */}
            <div className="flex gap-3 mb-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  From
                </label>
                <input
                  type="date"
                  value={localStart}
                  onChange={(e) => setLocalStart(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <div className="flex-1">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                  To
                </label>
                <input
                  type="date"
                  value={localEnd}
                  onChange={(e) => setLocalEnd(e.target.value)}
                  className="w-full border border-gray-300 dark:border-gray-600 rounded-md px-2 py-1 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
            </div>

            {/* Preset buttons */}
            <div className="flex flex-wrap gap-1.5 mb-3">
              <button
                onClick={() => applyPreset(7)}
                className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
              >
                Last 7d
              </button>
              <button
                onClick={() => applyPreset(30)}
                className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
              >
                Last 30d
              </button>
              <button
                onClick={() => applyPreset(90)}
                className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
              >
                Last 90d
              </button>
              <button
                onClick={() => applyPreset(0)}
                className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
              >
                This Year
              </button>
              <button
                onClick={() => applyPreset(null)}
                className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300"
              >
                All Time
              </button>
            </div>

            {/* Apply */}
            <div className="flex justify-end">
              <button
                onClick={handleApply}
                className="px-3 py-1.5 bg-purple-600 hover:bg-purple-700 text-white text-sm rounded-md font-medium"
              >
                Apply
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Top Spending Category */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 md:col-span-2">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <TagIcon className="h-8 w-8 text-orange-600 dark:text-orange-400" />
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">Top Spending Category</p>
            <p className="text-lg font-semibold text-gray-900 dark:text-white">
              {topSpendingCategory ? (
                <>
                  {topSpendingCategory.category} - {formatCurrency(Math.abs(topSpendingCategory.total_amount))}
                </>
              ) : (
                'No spending categories'
              )}
            </p>
          </div>
        </div>
      </div>

    </div>
  );
};

export default StatsPanel;
