import React, { useState } from 'react';
import { CategoryRule } from '../types';
import { PencilIcon, TrashIcon, PlusIcon } from '@heroicons/react/24/outline';

interface CategoryRulesProps {
  rules: CategoryRule[];
  onCreateRule: (rule: Omit<CategoryRule, 'id' | 'created_at' | 'updated_at'>) => Promise<void>;
  onUpdateRule: (id: number, rule: Partial<CategoryRule>) => Promise<void>;
  onDeleteRule: (id: number) => Promise<void>;
}

const CategoryRules: React.FC<CategoryRulesProps> = ({
  rules,
  onCreateRule,
  onUpdateRule,
  onDeleteRule,
}) => {
  const [editingRule, setEditingRule] = useState<CategoryRule | null>(null);
  const [newRule, setNewRule] = useState({ category_name: '', regex_pattern: '', is_active: true });
  const [showAddForm, setShowAddForm] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRule.category_name.trim() || !newRule.regex_pattern.trim()) return;

    setLoading(true);
    try {
      await onCreateRule(newRule);
      setNewRule({ category_name: '', regex_pattern: '', is_active: true });
      setShowAddForm(false);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingRule) return;

    setLoading(true);
    try {
      await onUpdateRule(editingRule.id, {
        category_name: editingRule.category_name,
        regex_pattern: editingRule.regex_pattern,
        is_active: editingRule.is_active,
      });
      setEditingRule(null);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to delete this rule?')) return;

    setLoading(true);
    try {
      await onDeleteRule(id);
    } finally {
      setLoading(false);
    }
  };

  const testRegex = (pattern: string, testText: string = 'example text') => {
    try {
      const regex = new RegExp(pattern, 'i');
      return regex.test(testText);
    } catch {
      return false;
    }
  };

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200 flex justify-between items-center">
          <div>
            <h2 className="text-lg font-medium text-gray-900">Category Rules</h2>
            <p className="text-sm text-gray-500 mt-1">
              Define regex patterns to automatically categorize transactions
            </p>
          </div>
          <div className="flex space-x-2">
            <button
              onClick={() => {
                // Export category rules
                fetch('http://127.0.0.1:5000/api/category-rules/export')
                  .then(response => response.json())
                  .then(data => {
                    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `category-rules-${new Date().toISOString().split('T')[0]}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  })
                  .catch(err => alert('Error exporting rules'));
              }}
              className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Export Rules
            </button>
            
            <label className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 cursor-pointer">
              Import Rules
              <input
                type="file"
                accept=".json"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) {
                    const reader = new FileReader();
                    reader.onload = (event) => {
                      try {
                        const data = JSON.parse(event.target?.result as string);
                        fetch('http://127.0.0.1:5000/api/category-rules/import', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify(data)
                        })
                          .then(response => response.json())
                          .then(result => {
                            alert(`Imported ${result.imported_count} rules, updated ${result.updated_transactions} transactions`);
                            window.location.reload();
                          })
                          .catch(err => alert('Error importing rules'));
                      } catch (err) {
                        alert('Invalid JSON file');
                      }
                    };
                    reader.readAsText(file);
                  }
                }}
              />
            </label>
            
            <button
              onClick={() => {
                if (confirm('Re-categorize all existing transactions with current rules?')) {
                  // Call recategorize API with correct URL
                  fetch('http://127.0.0.1:5000/api/recategorize-all', { method: 'POST' })
                    .then(response => response.json())
                    .then(data => {
                      alert(`Updated ${data.updated_count} transactions`);
                      window.location.reload(); // Refresh to show changes
                    })
                    .catch(err => alert('Error re-categorizing transactions'));
                }
              }}
              className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              Re-categorize All
            </button>
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <PlusIcon style={{width: '16px', height: '16px', minWidth: '16px', minHeight: '16px', maxWidth: '16px', maxHeight: '16px'}} className="mr-2" />
              Add Rule
            </button>
          </div>
        </div>

        {/* Add new rule form */}
        {showAddForm && (
          <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
            <form onSubmit={handleCreate} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category Name
                  </label>
                  <input
                    type="text"
                    value={newRule.category_name}
                    onChange={(e) => setNewRule({ ...newRule, category_name: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., Groceries"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Regex Pattern
                  </label>
                  <input
                    type="text"
                    value={newRule.regex_pattern}
                    onChange={(e) => setNewRule({ ...newRule, regex_pattern: e.target.value })}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., walmart|target|grocery"
                    required
                  />
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center">
                  <input
                    type="checkbox"
                    checked={newRule.is_active}
                    onChange={(e) => setNewRule({ ...newRule, is_active: e.target.checked })}
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label className="ml-2 text-sm text-gray-700">Active</label>
                </div>
                <div className="space-x-2">
                  <button
                    type="button"
                    onClick={() => setShowAddForm(false)}
                    className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 disabled:opacity-50"
                  >
                    {loading ? 'Adding...' : 'Add Rule'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        )}

        {/* Rules table */}
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Regex Pattern
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {rules.map((rule) => (
                <tr key={rule.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    {editingRule?.id === rule.id ? (
                      <input
                        type="text"
                        value={editingRule.category_name}
                        onChange={(e) => setEditingRule({ ...editingRule, category_name: e.target.value })}
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm"
                      />
                    ) : (
                      <div className="text-sm font-medium text-gray-900">{rule.category_name}</div>
                    )}
                  </td>
                  <td className="px-6 py-4">
                    {editingRule?.id === rule.id ? (
                      <input
                        type="text"
                        value={editingRule.regex_pattern}
                        onChange={(e) => setEditingRule({ ...editingRule, regex_pattern: e.target.value })}
                        className="w-full border border-gray-300 rounded px-2 py-1 text-sm font-mono"
                      />
                    ) : (
                      <div className="text-sm text-gray-900 font-mono bg-gray-100 px-2 py-1 rounded">
                        {rule.regex_pattern}
                      </div>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {editingRule?.id === rule.id ? (
                      <label className="flex items-center">
                        <input
                          type="checkbox"
                          checked={editingRule.is_active}
                          onChange={(e) => setEditingRule({ ...editingRule, is_active: e.target.checked })}
                          className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                        />
                        <span className="ml-2 text-sm text-gray-700">Active</span>
                      </label>
                    ) : (
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                          rule.is_active
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {rule.is_active ? 'Active' : 'Inactive'}
                      </span>
                    )}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                    {editingRule?.id === rule.id ? (
                      <div className="flex space-x-2">
                        <button
                          onClick={handleUpdate}
                          disabled={loading}
                          className="text-blue-600 hover:text-blue-900 disabled:opacity-50"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingRule(null)}
                          className="text-gray-600 hover:text-gray-900"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex space-x-2">
                        <button
                          onClick={() => setEditingRule(rule)}
                          className="text-blue-600 hover:text-blue-900"
                        >
                          <PencilIcon style={{width: '16px', height: '16px', minWidth: '16px', minHeight: '16px', maxWidth: '16px', maxHeight: '16px'}} />
                        </button>
                        <button
                          onClick={() => handleDelete(rule.id)}
                          disabled={loading}
                          className="text-red-600 hover:text-red-900 disabled:opacity-50"
                        >
                          <TrashIcon style={{width: '16px', height: '16px', minWidth: '16px', minHeight: '16px', maxWidth: '16px', maxHeight: '16px'}} />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {rules.length === 0 && (
          <div className="px-6 py-8 text-center">
            <p className="text-gray-500">No category rules defined yet. Add your first rule to get started.</p>
          </div>
        )}
      </div>

      {/* Regex Testing Section */}
      <div className="bg-white rounded-lg shadow">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">Regex Pattern Examples</h3>
          <p className="text-sm text-gray-500 mt-1">
            Common patterns for categorizing transactions
          </p>
        </div>
        <div className="px-6 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-3">Example Patterns</h4>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="font-mono bg-gray-100 px-2 py-1 rounded">walmart|target|grocery</span>
                  <p className="text-gray-600 text-xs mt-1">Matches Walmart, Target, or any text containing "grocery"</p>
                </div>
                <div>
                  <span className="font-mono bg-gray-100 px-2 py-1 rounded">^(gas|fuel)</span>
                  <p className="text-gray-600 text-xs mt-1">Matches text starting with "gas" or "fuel"</p>
                </div>
                <div>
                  <span className="font-mono bg-gray-100 px-2 py-1 rounded">restaurant|cafe|mcdonald</span>
                  <p className="text-gray-600 text-xs mt-1">Matches restaurant, cafe, or McDonald's</p>
                </div>
                <div>
                  <span className="font-mono bg-gray-100 px-2 py-1 rounded">\d{4}.*electric</span>
                  <p className="text-gray-600 text-xs mt-1">Matches 4 digits followed by "electric" (utility bills)</p>
                </div>
              </div>
            </div>
            <div>
              <h4 className="text-sm font-medium text-gray-900 mb-3">Pattern Tips</h4>
              <div className="text-sm text-gray-600 space-y-2">
                <div>• Use <code className="bg-gray-100 px-1 rounded">|</code> for OR conditions</div>
                <div>• Use <code className="bg-gray-100 px-1 rounded">^</code> to match start of text</div>
                <div>• Use <code className="bg-gray-100 px-1 rounded">$</code> to match end of text</div>
                <div>• Use <code className="bg-gray-100 px-1 rounded">.*</code> to match any characters</div>
                <div>• Use <code className="bg-gray-100 px-1 rounded">\d</code> to match digits</div>
                <div>• Patterns are case-insensitive</div>
                <div>• Test carefully to avoid false matches</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CategoryRules;