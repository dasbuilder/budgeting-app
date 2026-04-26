import React from 'react';
import { Stats } from '../types';

interface CategoryBreakdownPanelProps {
  stats: Stats | null;
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const CategoryBreakdownPanel: React.FC<CategoryBreakdownPanelProps> = ({ stats }) => {
  if (!stats || stats.categories.length === 0) {
    return (
      <p className="text-sm text-gray-500 dark:text-gray-400">
        No category data available. Upload transactions to see a breakdown.
      </p>
    );
  }

  const totalSpending = stats.categories.reduce(
    (sum, cat) => sum + (cat.total_amount < 0 ? Math.abs(cat.total_amount) : 0),
    0
  );
  const totalIncome = stats.total_income;

  return (
    <div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {stats.categories
          .sort((a, b) => Math.abs(b.total_amount) - Math.abs(a.total_amount))
          .slice(0, 10)
          .map((category) => (
            <div key={category.category} className="border border-gray-200 dark:border-gray-700 rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {category.category || 'Uncategorized'}
                </h4>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {category.count} txns
                </span>
              </div>
              <p className={`text-lg font-semibold ${
                category.total_amount >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'
              }`}>
                {formatCurrency(Math.abs(category.total_amount))}
              </p>
              <div className="mt-2">
                <div className="bg-gray-200 dark:bg-gray-700 rounded-full h-2">
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
      {stats.categories.length > 10 && (
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-4 text-center">
          Showing top 10 categories out of {stats.categories.length} total
        </p>
      )}
    </div>
  );
};

export default CategoryBreakdownPanel;
