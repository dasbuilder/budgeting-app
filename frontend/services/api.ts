import axios from 'axios';
import { Transaction, CategoryRule, TransactionResponse, Stats, TransactionFilters } from '../types';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
});

export const apiService = {
  // Health check
  async healthCheck(): Promise<{ status: string }> {
    const response = await api.get('/health');
    return response.data;
  },

  // File upload
  async uploadCsv(file: File): Promise<{ message: string; format_detected: string; total_rows: number; saved_transactions: number }> {
    const formData = new FormData();
    formData.append('file', file);
    
    const response = await api.post('/upload-csv', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },

  // Transactions
  async getTransactions(params: TransactionFilters & { page?: number; per_page?: number } = {}): Promise<TransactionResponse> {
    const response = await api.get('/transactions', { params });
    return response.data;
  },

  // Category rules
  async getCategoryRules(): Promise<CategoryRule[]> {
    const response = await api.get('/category-rules');
    return response.data;
  },

  async createCategoryRule(rule: Omit<CategoryRule, 'id' | 'created_at' | 'updated_at'>): Promise<CategoryRule> {
    const response = await api.post('/category-rules', rule);
    return response.data;
  },

  async updateCategoryRule(id: number, rule: Partial<CategoryRule>): Promise<CategoryRule> {
    const response = await api.put(`/category-rules/${id}`, rule);
    return response.data;
  },

  async deleteCategoryRule(id: number): Promise<{ message: string }> {
    const response = await api.delete(`/category-rules/${id}`);
    return response.data;
  },

  // Stats
  async getStats(): Promise<Stats> {
    const response = await api.get('/stats');
    return response.data;
  },

  // Clear database
  async clearDatabase(): Promise<{ message: string; cleared_count: number }> {
    const response = await api.delete('/clear-database');
    return response.data;
  },
};