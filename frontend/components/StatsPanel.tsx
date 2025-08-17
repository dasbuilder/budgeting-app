import React from 'react';
import { format, parseISO } from 'date-fns';
import { Stats } from '../types';
import { 
  BanknotesIcon, 
  ChartBarIcon, 
  CalendarDaysIcon,
  TagIcon 
} from '@heroicons/react/24/outline';

interface StatsPanelProps {
  stats: Stats | null;
}

const StatsPanel: React.FC<StatsPanelProps> = ({ stats }) => {
  if (!stats) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="bg-white rounded-lg shadow p-6">
            <div className="animate-pulse">
              <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
              <div className="h-6 bg-gray-200 rounded w-1/2"></div>
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

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A';
    try {
      return format(parseISO(dateString), 'MMM dd, yyyy');
    } catch {
      return 'Invalid Date';
    }
  };

  // Calculate totals
  const totalSpending = stats.categories.reduce((sum, cat) => {
    return sum + (cat.total_amount < 0 ? Math.abs(cat.total_amount) : 0);
  }, 0);

  const totalIncome = stats.categories.reduce((sum, cat) => {
    return sum + (cat.total_amount > 0 ? cat.total_amount : 0);
  }, 0);

  const netAmount = totalIncome - totalSpending;

  // Get top spending category
  const topSpendingCategory = stats.categories
    .filter(cat => cat.total_amount < 0)
    .sort((a, b) => a.total_amount - b.total_amount)[0];

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* Total Transactions */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <ChartBarIcon className="h-8 w-8 text-blue-600" />
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-gray-500">Total Transactions</p>
            <p className="text-2xl font-semibold text-gray-900">
              {stats.total_transactions.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      {/* Total Spending */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <BanknotesIcon className="h-8 w-8 text-red-600" />
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-gray-500">Total Spending</p>
            <p className="text-2xl font-semibold text-red-600">
              {formatCurrency(totalSpending)}
            </p>
          </div>
        </div>
      </div>

      {/* Total Income */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <BanknotesIcon className="h-8 w-8 text-green-600" />
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-gray-500">Total Income</p>
            <p className="text-2xl font-semibold text-green-600">
              {formatCurrency(totalIncome)}
            </p>
          </div>
        </div>
      </div>

      {/* Net Amount */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <CalendarDaysIcon className="h-8 w-8 text-gray-600" />
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-gray-500">Net Amount</p>
            <p className={`text-2xl font-semibold ${
              netAmount >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {formatCurrency(netAmount)}
            </p>
          </div>
        </div>
      </div>

      {/* Date Range */}
      <div className="bg-white rounded-lg shadow p-6 md:col-span-2">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <CalendarDaysIcon className="h-8 w-8 text-purple-600" />
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-gray-500">Date Range</p>
            <p className="text-lg font-semibold text-gray-900">
              {formatDate(stats.date_range.earliest)} - {formatDate(stats.date_range.latest)}
            </p>
          </div>
        </div>
      </div>

      {/* Top Spending Category */}
      <div className="bg-white rounded-lg shadow p-6 md:col-span-2">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <TagIcon className="h-8 w-8 text-orange-600" />
          </div>
          <div className="ml-4">
            <p className="text-sm font-medium text-gray-500">Top Spending Category</p>
            <p className="text-lg font-semibold text-gray-900">
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

      {/* Categories Breakdown */}
      {stats.categories.length > 0 && (
        <div className="bg-white rounded-lg shadow p-6 md:col-span-4">
          <h3 className="text-lg font-medium text-gray-900 mb-4">Category Breakdown</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {stats.categories
              .sort((a, b) => Math.abs(b.total_amount) - Math.abs(a.total_amount))
              .slice(0, 10) // Show top 8 categories
              .map((category) => (
                <div key={category.category} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-sm font-medium text-gray-900 truncate">
                      {category.category || 'Uncategorized'}
                    </h4>
                    <span className="text-xs text-gray-500">
                      {category.count} txns
                    </span>
                  </div>
                  <p className={`text-lg font-semibold ${
                    category.total_amount >= 0 ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {formatCurrency(Math.abs(category.total_amount))}
                  </p>
                  <div className="mt-2">
                    <div className="bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${
                          category.total_amount >= 0 ? 'bg-green-500' : 'bg-red-500'
                        }`}
                        style={{
                          width: `${Math.min(100, (Math.abs(category.total_amount) / Math.max(totalSpending, totalIncome)) * 100)}%`
                        }}
                      ></div>
                    </div>
                  </div>
                </div>
              ))}
          </div>
          {stats.categories.length > 13 && (
            <p className="text-sm text-gray-500 mt-4 text-center">
              Showing top 13 categories out of {stats.categories.length} total
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default StatsPanel;