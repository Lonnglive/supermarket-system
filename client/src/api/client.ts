import {
  User, Product, StoreSettings, EmailSettings,
  SaleSummary, InventoryMovement, Customer, Supplier, Category, Unit
} from '../types';

const API_BASE = ((import.meta as any).env?.VITE_API_BASE_URL as string) || '/api';

function getAuthToken(): string | null {
  return localStorage.getItem('aeropos_token');
}

export function setAuthToken(token: string | null) {
  if (token) {
    localStorage.setItem('aeropos_token', token);
  } else {
    localStorage.removeItem('aeropos_token');
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string> || {})
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  if (response.status === 401) {
    setAuthToken(null);
    window.dispatchEvent(new CustomEvent('aeropos_unauthorized'));
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const errorMsg = data.message || data.error || `HTTP error ${response.status}`;
    throw new Error(errorMsg);
  }

  return data as T;
}

export const api = {
  // Auth
  auth: {
    login: (credentials: { usernameOrEmail: string; password: string }) =>
      request<{ token: string; user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify(credentials)
      }),
    sendOtp: (identifier: string, channel: 'EMAIL' | 'PHONE') =>
      request<{ success: boolean; message: string }>('/auth/otp/send', {
        method: 'POST',
        body: JSON.stringify({ identifier, channel })
      }),
    verifyOtp: (credentials: { identifier: string; channel: 'EMAIL' | 'PHONE'; otp: string }) =>
      request<{ token: string; user: User }>('/auth/otp/verify', {
        method: 'POST',
        body: JSON.stringify(credentials)
      }),
    requestRegistrationOtp: (identifier: string, channel: 'EMAIL' | 'PHONE') =>
      request<{ success: boolean; message: string }>('/auth/register/request-otp', { method: 'POST', body: JSON.stringify({ identifier, channel }) }),
    register: (data: { fullName: string; username: string; password: string; identifier: string; channel: 'EMAIL' | 'PHONE'; otp: string }) =>
      request<{ token: string; user: User }>('/auth/register', { method: 'POST', body: JSON.stringify(data) }),
    getMe: () => request<{ user: User }>('/auth/me'),
    logout: () => request<{ success: boolean }>('/auth/logout', { method: 'POST' })
  },

  // Billing
  billing: {
    searchProducts: (params: { query?: string; barcode?: string; categoryId?: string }) => {
      const q = new URLSearchParams();
      if (params.query) q.append('query', params.query);
      if (params.barcode) q.append('barcode', params.barcode);
      if (params.categoryId) q.append('categoryId', params.categoryId);
      return request<{ products: Product[] }>(`/billing/products?${q.toString()}`);
    },
    createSale: (saleData: any) =>
      request<{ sale: SaleSummary; store: StoreSettings }>('/billing/sales', {
        method: 'POST',
        body: JSON.stringify(saleData)
      }),
    getBills: (params: { limit?: number; cashierId?: string } = {}) => {
      const q = new URLSearchParams();
      if (params.limit) q.append('limit', String(params.limit));
      if (params.cashierId) q.append('cashierId', params.cashierId);
      return request<{ bills: any[] }>(`/billing/bills?${q.toString()}`);
    },
    getBillByInvoice: (invoiceNumber: string) =>
      request<{ sale: SaleSummary; store: StoreSettings }>(`/billing/bills/${invoiceNumber}`),
    holdBill: (data: any) =>
      request<{ id: string; bill_reference: string }>('/billing/held-bills', {
        method: 'POST',
        body: JSON.stringify(data)
      }),
    getHeldBills: () => request<{ heldBills: any[] }>('/billing/held-bills'),
    deleteHeldBill: (id: string) => request<{ success: boolean }>(`/billing/held-bills/${id}`, { method: 'DELETE' })
  },

  // Inventory
  inventory: {
    getDashboard: () => request<any>('/inventory/dashboard'),
    getMovements: (params: any = {}) => {
      const q = new URLSearchParams();
      Object.keys(params).forEach(k => {
        if (params[k]) q.append(k, String(params[k]));
      });
      return request<{ total: number; movements: InventoryMovement[]; totalPages: number }>(`/inventory/movements?${q.toString()}`);
    },
    createAdjustment: (data: any) =>
      request<any>('/inventory/adjustments', {
        method: 'POST',
        body: JSON.stringify(data)
      }),
    createPurchase: (data: any) =>
      request<any>('/inventory/purchases', {
        method: 'POST',
        body: JSON.stringify(data)
      }),
    getLowStock: () => request<{ lowStock: any[] }>('/inventory/low-stock')
  },

  // Products
  products: {
    getAll: (params: any = {}) => {
      const q = new URLSearchParams();
      Object.keys(params).forEach(k => {
        if (params[k]) q.append(k, String(params[k]));
      });
      return request<{ total: number; products: Product[] }>(`/products?${q.toString()}`);
    },
    create: (data: any) => request<Product>('/products', { method: 'POST', body: JSON.stringify(data) }),
    update: (id: string, data: any) => request<Product>(`/products/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    delete: (id: string) => request<{ success: boolean }>(`/products/${id}`, { method: 'DELETE' }),
    getCategories: () => request<{ categories: Category[] }>('/categories'),
    createCategory: (data: { name: string; color?: string; position?: number }) => request<{ category: Category }>('/categories', { method: 'POST', body: JSON.stringify(data) }),
    updateCategory: (id: string, data: { name: string; color?: string }) => request<{ category: Category }>(`/categories/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    reorderCategories: (categoryIds: string[]) => request<{ success: boolean }>('/categories/reorder', { method: 'PUT', body: JSON.stringify({ categoryIds }) }),
    deleteCategory: (id: string) => request<{ success: boolean; productCount: number }>(`/categories/${id}`, { method: 'DELETE' }),
    getUnits: () => request<{ units: Unit[] }>('/units'),
    getSuppliers: () => request<{ suppliers: Supplier[] }>('/suppliers'),
    createSupplier: (data: any) => request<Supplier>('/suppliers', { method: 'POST', body: JSON.stringify(data) }),
    getCustomers: (search?: string) => request<{ customers: Customer[] }>(`/customers${search ? `?search=${encodeURIComponent(search)}` : ''}`),
    createCustomer: (data: any) => request<Customer>('/customers', { method: 'POST', body: JSON.stringify(data) })
  },

  // Reports
  reports: {
    getDailySummary: (date?: string) => request<any>(`/reports/daily${date ? `?date=${date}` : ''}`),
    getSoldItems: (params: any = {}) => {
      const q = new URLSearchParams();
      Object.keys(params).forEach(k => {
        if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
          q.append(k, String(params[k]));
        }
      });
      return request<{ items: any[]; totals: any; startDate: string; endDate: string }>(`/reports/sold-items?${q.toString()}`);
    },
    getDailyRecords: (params: any = {}) => {
      const q = new URLSearchParams();
      Object.keys(params).forEach(k => {
        if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
          q.append(k, String(params[k]));
        }
      });
      return request<{ records: any[]; totals: any; startDate: string; endDate: string }>(`/reports/daily-records?${q.toString()}`);
    },
    getSalesReport: (params: any = {}) => {
      const q = new URLSearchParams();
      Object.keys(params).forEach(k => {
        if (params[k] !== undefined && params[k] !== null && params[k] !== '') {
          q.append(k, String(params[k]));
        }
      });
      return request<{ sales: any[] }>(`/reports/sales?${q.toString()}`);
    },
    getHourly: (date?: string) => request<{ hourly: any[] }>(`/reports/hourly${date ? `?date=${date}` : ''}`)
  },

  // Settings & System
  settings: {
    getStore: () => request<{ store: StoreSettings }>('/settings/store'),
    updateStore: (data: Partial<StoreSettings>) => request<{ store: StoreSettings }>('/settings/store', { method: 'PUT', body: JSON.stringify(data) }),
    getEmail: () => request<{ emailSettings: EmailSettings }>('/settings/email'),
    updateEmail: (data: Partial<EmailSettings>) => request<{ emailSettings: EmailSettings }>('/settings/email', { method: 'PUT', body: JSON.stringify(data) }),
    testEmail: (recipientEmail: string) => request<any>('/settings/email/test', { method: 'POST', body: JSON.stringify({ recipientEmail }) }),
    sendDailyReport: (reportDate?: string, recipientEmail?: string) =>
      request<any>('/settings/email/send-daily-report', {
        method: 'POST',
        body: JSON.stringify({ reportDate, recipientEmail })
      }),
    getUsers: () => request<{ users: any[] }>('/settings/users'),
    createUser: (data: any) => request<any>('/settings/users', { method: 'POST', body: JSON.stringify(data) }),
    updateUser: (id: string, data: any) => request<any>(`/settings/users/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    toggleUserActive: (id: string, isActive: boolean) =>
      request<any>(`/settings/users/${id}/active`, { method: 'PATCH', body: JSON.stringify({ isActive }) }),
    changePassword: (userId: string, currentPassword: string, newPassword: string) =>
      request<{ success: boolean }>(`/settings/users/${userId}/password`, {
        method: 'PATCH',
        body: JSON.stringify({ currentPassword, newPassword })
      }),
    createBackup: () => request<any>('/settings/backup', { method: 'POST' }),
    resetRecords: (type: 'transactions' | 'products' | 'clear_stock' | 'all') =>
      request<{ success: boolean; message: string }>('/settings/reset-records', {
        method: 'POST',
        body: JSON.stringify({ type })
      }),
    getAuditLogs: (params: any = {}) => {
      const q = new URLSearchParams();
      Object.keys(params).forEach(k => {
        if (params[k]) q.append(k, String(params[k]));
      });
      return request<{ total: number; logs: any[] }>(`/settings/audit?${q.toString()}`);
    }
  },

  // Setup Wizard
  setup: {
    getStatus: () => request<{ isSetupComplete: boolean; hasDefaultPassword: boolean }>('/setup/status'),
    markComplete: () => request<{ success: boolean }>('/setup/complete', { method: 'POST' })
  }
};
