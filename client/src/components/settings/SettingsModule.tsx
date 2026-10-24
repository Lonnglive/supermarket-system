import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { useAuth } from '../../context/AuthContext';
import { StoreSettings, EmailSettings, StockFieldConfig, Category } from '../../types';
import {
  Store, Mail, Users, Shield, Database,
  CheckCircle2, AlertCircle, RefreshCw, Send, Plus, Eye, EyeOff,
  AlertTriangle, Trash2, Edit, Key, Image,
  SlidersHorizontal, Check, Sparkles, Layers, DollarSign, Barcode, Tag, Boxes, GripVertical
} from 'lucide-react';

export const SettingsModule: React.FC = () => {
  const { isSuperAdmin } = useAuth();

  // Sub-sections: 'store' | 'stock-config' | 'categories' | 'email' | 'users' | 'audit' | 'backup'
  const [section, setSection] = useState<'store' | 'stock-config' | 'categories' | 'email' | 'users' | 'audit' | 'backup'>('store');

  // Store Settings State
  const [store, setStore] = useState<StoreSettings | null>(null);
  const [storeSaving, setStoreSaving] = useState(false);
  const [stockConfig, setStockConfig] = useState<StockFieldConfig | null>(null);
  const [stockSaving, setStockSaving] = useState(false);

  // Product category configuration
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryName, setCategoryName] = useState('');
  const [categoryColor, setCategoryColor] = useState('#10b981');
  const [categoryPosition, setCategoryPosition] = useState('');
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [categorySaving, setCategorySaving] = useState(false);
  const [categoryReordering, setCategoryReordering] = useState(false);
  const [draggedCategoryId, setDraggedCategoryId] = useState<string | null>(null);

  // Email Settings State
  const [emailSettings, setEmailSettings] = useState<EmailSettings | null>(null);
  const [emailSaving, setEmailSaving] = useState(false);
  const [testEmailRecipient, setTestEmailRecipient] = useState('');
  const [testingEmail, setTestingEmail] = useState(false);
  const [sendingDailyReport, setSendingDailyReport] = useState(false);

  // User Management State
  const [usersList, setUsersList] = useState<any[]>([]);
  const [showAddUserModal, setShowAddUserModal] = useState(false);
  const [showEditUserModal, setShowEditUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState<any | null>(null);
  const [revealedPasswords, setRevealedPasswords] = useState<Record<string, boolean>>({});

  // Reset Records State
  const [resettingRecords, setResettingRecords] = useState(false);

  // Audit Logs State
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);

  // Backup State
  const [backupResult, setBackupResult] = useState<any>(null);
  const [creatingBackup, setCreatingBackup] = useState(false);

  // Status message
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    loadStoreSettings();
    if (isSuperAdmin) {
      loadEmailSettings();
      loadUsers();
      loadAuditLogs();
      loadCategories();
    }
  }, [isSuperAdmin]);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4000);
  };

  const loadStoreSettings = async () => {
    try {
      const res = await api.settings.getStore();
      setStore(res.store);
      if (res.store?.stock_field_config) {
        setStockConfig(res.store.stock_field_config);
      }
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const loadCategories = async () => {
    try {
      const res = await api.products.getCategories();
      setCategories(res.categories);
    } catch (err: any) {
      showToast(err.message || 'Unable to load categories.', 'error');
    }
  };

  const resetCategoryForm = () => {
    setEditingCategoryId(null);
    setCategoryName('');
    setCategoryColor('#10b981');
    setCategoryPosition(String(categories.length + 1));
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!categoryName.trim()) return;
    setCategorySaving(true);
    try {
      if (editingCategoryId) {
        await api.products.updateCategory(editingCategoryId, { name: categoryName.trim(), color: categoryColor });
        showToast('Category updated.');
      } else {
        await api.products.createCategory({ name: categoryName.trim(), color: categoryColor, position: Number(categoryPosition || categories.length + 1) });
        showToast('Category created.');
      }
      await loadCategories();
      resetCategoryForm();
    } catch (err: any) {
      showToast(err.message || 'Unable to save category.', 'error');
    } finally {
      setCategorySaving(false);
    }
  };

  const handleEditCategory = (category: Category) => {
    setEditingCategoryId(category.id);
    setCategoryName(category.name);
    setCategoryColor(category.color || '#10b981');
  };

  const handleDeleteCategory = async (category: Category) => {
    const affectedProducts = Number(category.product_count || 0);
    const warning = affectedProducts > 0
      ? `Delete “${category.name}”? ${affectedProducts} active product(s) will become uncategorized.`
      : `Delete “${category.name}”?`;
    if (!window.confirm(warning)) return;

    try {
      await api.products.deleteCategory(category.id);
      if (editingCategoryId === category.id) resetCategoryForm();
      await loadCategories();
      showToast('Category deleted.');
    } catch (err: any) {
      showToast(err.message || 'Unable to delete category.', 'error');
    }
  };

  const saveCategoryOrder = async (reordered: Category[]) => {
    setCategories(reordered);
    setCategoryReordering(true);
    try {
      await api.products.reorderCategories(reordered.map(category => category.id));
      showToast('Category order saved.');
    } catch (err: any) {
      await loadCategories();
      showToast(err.message || 'Unable to reorder categories.', 'error');
    } finally {
      setCategoryReordering(false);
    }
  };

  const handleCategoryDrop = (targetIndex: number) => {
    if (!draggedCategoryId || categoryReordering) return;
    const sourceIndex = categories.findIndex(category => category.id === draggedCategoryId);
    if (sourceIndex < 0) return;
    const reordered = [...categories];
    const [dragged] = reordered.splice(sourceIndex, 1);
    const insertIndex = sourceIndex < targetIndex ? targetIndex - 1 : targetIndex;
    reordered.splice(insertIndex, 0, dragged);
    setDraggedCategoryId(null);
    if (reordered.some((category, index) => category.id !== categories[index].id)) void saveCategoryOrder(reordered);
  };

  const handleCategoryDropAtEnd = () => {
    if (!draggedCategoryId || categoryReordering) return;
    const sourceIndex = categories.findIndex(category => category.id === draggedCategoryId);
    if (sourceIndex < 0 || sourceIndex === categories.length - 1) return setDraggedCategoryId(null);
    const reordered = [...categories];
    const [dragged] = reordered.splice(sourceIndex, 1);
    reordered.push(dragged);
    setDraggedCategoryId(null);
    void saveCategoryOrder(reordered);
  };

  // Toggle field visibility (Enabled vs Disabled)
  const toggleFieldEnabled = (fieldKey: string) => {
    if (!stockConfig) return;
    const current = stockConfig[fieldKey];
    if (!current) return;
    setStockConfig({
      ...stockConfig,
      [fieldKey]: {
        ...current,
        enabled: !current.enabled
      }
    });
  };

  // Toggle field requirement (Fixed/Mandatory vs Optional)
  const toggleFieldRequired = (fieldKey: string) => {
    if (!stockConfig) return;
    const current = stockConfig[fieldKey];
    if (!current) return;
    setStockConfig({
      ...stockConfig,
      [fieldKey]: {
        ...current,
        required: !current.required
      }
    });
  };

  // Quick setup presets
  const applyPreset = (preset: 'standard' | 'simple' | 'wholesale') => {
    if (!stockConfig) return;
    if (preset === 'simple') {
      setStockConfig({
        ...stockConfig,
        mrp: { ...stockConfig.mrp, enabled: true, required: true },
        sellingPrice: { ...stockConfig.sellingPrice, enabled: true, required: true },
        purchasePrice: { ...stockConfig.purchasePrice, enabled: false, required: false },
        taxRate: { ...stockConfig.taxRate, enabled: false, required: false },
        barcode: { ...stockConfig.barcode, enabled: true, required: false },
        sku: { ...stockConfig.sku, enabled: false, required: false },
        shortName: { ...stockConfig.shortName, enabled: true, required: false },
        category: { ...stockConfig.category, enabled: true, required: false },
        unit: { ...stockConfig.unit, enabled: true, required: true },
        supplier: { ...stockConfig.supplier, enabled: false, required: false },
        openingStock: { ...stockConfig.openingStock, enabled: true, required: false },
        minStockLevel: { ...stockConfig.minStockLevel, enabled: false, required: false },
        maxStockLevel: { ...stockConfig.maxStockLevel, enabled: false, required: false },
        hasExpiry: { ...stockConfig.hasExpiry, enabled: false, required: false }
      });
      showToast('Applied "Fast Grocery (MRP & Net Only)" preset. Click Save to apply.');
    } else if (preset === 'wholesale') {
      setStockConfig({
        ...stockConfig,
        mrp: { ...stockConfig.mrp, enabled: true, required: true },
        sellingPrice: { ...stockConfig.sellingPrice, enabled: true, required: true },
        purchasePrice: { ...stockConfig.purchasePrice, enabled: true, required: true },
        taxRate: { ...stockConfig.taxRate, enabled: true, required: true },
        barcode: { ...stockConfig.barcode, enabled: true, required: true },
        sku: { ...stockConfig.sku, enabled: true, required: true },
        shortName: { ...stockConfig.shortName, enabled: true, required: false },
        category: { ...stockConfig.category, enabled: true, required: true },
        unit: { ...stockConfig.unit, enabled: true, required: true },
        supplier: { ...stockConfig.supplier, enabled: true, required: true },
        openingStock: { ...stockConfig.openingStock, enabled: true, required: true },
        minStockLevel: { ...stockConfig.minStockLevel, enabled: true, required: true },
        maxStockLevel: { ...stockConfig.maxStockLevel, enabled: true, required: false },
        hasExpiry: { ...stockConfig.hasExpiry, enabled: true, required: false }
      });
      showToast('Applied "Supermarket & Wholesale (All Fields)" preset. Click Save to apply.');
    } else {
      setStockConfig({
        ...stockConfig,
        mrp: { ...stockConfig.mrp, enabled: true, required: true },
        sellingPrice: { ...stockConfig.sellingPrice, enabled: true, required: true },
        purchasePrice: { ...stockConfig.purchasePrice, enabled: true, required: false },
        taxRate: { ...stockConfig.taxRate, enabled: true, required: false },
        barcode: { ...stockConfig.barcode, enabled: true, required: true },
        sku: { ...stockConfig.sku, enabled: true, required: true },
        shortName: { ...stockConfig.shortName, enabled: true, required: false },
        category: { ...stockConfig.category, enabled: true, required: true },
        unit: { ...stockConfig.unit, enabled: true, required: true },
        supplier: { ...stockConfig.supplier, enabled: true, required: false },
        openingStock: { ...stockConfig.openingStock, enabled: true, required: false },
        minStockLevel: { ...stockConfig.minStockLevel, enabled: true, required: false },
        maxStockLevel: { ...stockConfig.maxStockLevel, enabled: true, required: false },
        hasExpiry: { ...stockConfig.hasExpiry, enabled: true, required: false }
      });
      showToast('Applied "Standard Retail" preset. Click Save to apply.');
    }
  };

  // Save Stock Configuration
  const handleSaveStockConfig = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!store || !stockConfig) return;
    setStockSaving(true);
    try {
      const res = await api.settings.updateStore({
        ...store,
        stock_field_config: stockConfig
      });
      setStore(res.store);
      if (res.store?.stock_field_config) {
        setStockConfig(res.store.stock_field_config);
      }
      showToast('Stock entry fields configuration saved successfully.');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setStockSaving(false);
    }
  };

  const loadEmailSettings = async () => {
    try {
      const res = await api.settings.getEmail();
      setEmailSettings(res.emailSettings);
      setTestEmailRecipient(res.emailSettings.super_admin_email || '');
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  const loadUsers = async () => {
    try {
      const res = await api.settings.getUsers();
      setUsersList(res.users);
    } catch (err: any) {
      console.error(err);
    }
  };

  const loadAuditLogs = async () => {
    try {
      const res = await api.settings.getAuditLogs({ limit: 40 });
      setAuditLogs(res.logs);
      setAuditTotal(res.total);
    } catch (err: any) {
      console.error(err);
    }
  };

  // Save Store Settings
  const handleSaveStore = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!store) return;
    setStoreSaving(true);
    try {
      const res = await api.settings.updateStore(store);
      setStore(res.store);
      showToast('Store profile & receipt settings saved.');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setStoreSaving(false);
    }
  };

  // Save Email Settings
  const handleSaveEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailSettings) return;
    setEmailSaving(true);
    try {
      const res = await api.settings.updateEmail(emailSettings);
      setEmailSettings(res.emailSettings);
      showToast('Email SMTP configuration & daily schedule updated.');
    } catch (err: any) {
      showToast(err.message, 'error');
    } finally {
      setEmailSaving(false);
    }
  };

  // Test Email
  const handleTestEmail = async () => {
    if (!testEmailRecipient) {
      showToast('Please enter recipient email address', 'error');
      return;
    }
    setTestingEmail(true);
    try {
      await api.settings.testEmail(testEmailRecipient);
      showToast(`Test verification email dispatched to ${testEmailRecipient}`);
    } catch (err: any) {
      showToast(`Email test failed: ${err.message}`, 'error');
    } finally {
      setTestingEmail(false);
    }
  };

  // Send Daily Sales Report Now
  const handleSendDailyReportNow = async () => {
    setSendingDailyReport(true);
    try {
      const todayStr = new Date().toISOString().split('T')[0];
      const res = await api.settings.sendDailyReport(todayStr, testEmailRecipient);
      showToast(`Daily Sales Report for ${todayStr} dispatched to ${res.recipient}!`);
    } catch (err: any) {
      showToast(`Daily report dispatch failed: ${err.message}`, 'error');
    } finally {
      setSendingDailyReport(false);
    }
  };

  // Create User
  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as any;
    const data = {
      username: form.username.value,
      email: form.email.value,
      password: form.password.value,
      fullName: form.fullName.value,
      phone: form.phone.value,
      roleId: form.roleId.value,
      avatarUrl: form.avatarUrl?.value || undefined,
      receiveDailyReport: form.receiveDailyReport?.checked
    };

    try {
      await api.settings.createUser(data);
      showToast(`User account created: ${data.username}`);
      setShowAddUserModal(false);
      loadUsers();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Toggle Password Reveal for Super Admin
  const togglePasswordReveal = (userId: string) => {
    setRevealedPasswords(prev => ({
      ...prev,
      [userId]: !prev[userId]
    }));
  };

  // Open Edit User Modal
  const handleOpenEditUser = (u: any) => {
    setEditingUser({
      ...u,
      roleId: u.roles?.includes('SUPER_ADMIN') ? 'SUPER_ADMIN' : 'SYSTEM_ADMIN',
      newPassword: ''
    });
    setShowEditUserModal(true);
  };

  // Submit Edit User
  const handleUpdateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingUser) return;
    try {
      const payload: any = {
        fullName: editingUser.full_name,
        email: editingUser.email,
        phone: editingUser.phone,
        roleId: editingUser.roleId,
        avatarUrl: editingUser.avatar_url,
        receiveDailyReport: editingUser.receive_daily_report
      };
      if (editingUser.newPassword && editingUser.newPassword.trim()) {
        payload.password = editingUser.newPassword.trim();
      }
      await api.settings.updateUser(editingUser.id, payload);
      showToast(`User account updated: ${editingUser.username}`);
      setShowEditUserModal(false);
      setEditingUser(null);
      loadUsers();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Toggle User Active
  const handleToggleUserActive = async (userId: string, currentActive: boolean) => {
    try {
      await api.settings.toggleUserActive(userId, !currentActive);
      showToast(`User status updated.`);
      loadUsers();
    } catch (err: any) {
      showToast(err.message, 'error');
    }
  };

  // Reset Pre-inserted Records / Sales
  const handleResetRecords = async (type: 'transactions' | 'products' | 'clear_stock' | 'all') => {
    const actionLabel = type === 'transactions'
      ? 'WIPE ALL SALES, PAYMENTS & RESET INVOICE SEQUENCE TO 000001'
      : type === 'products'
        ? 'DELETE ALL PRODUCTS & INVENTORY'
        : type === 'clear_stock'
          ? 'CLEAR ALL STOCK QUANTITIES TO 0.00'
          : 'RESET ENTIRE DATABASE RECORDS';

    if (!window.confirm(`Are you SURE you want to ${actionLabel}?\n\nThis will permanently delete records and restart counters for fresh production usage.`)) {
      return;
    }

    setResettingRecords(true);
    try {
      const res = await api.settings.resetRecords(type);
      showToast(res.message || 'Records wiped and sequence reset successfully!');
      loadAuditLogs();
    } catch (err: any) {
      showToast(`Reset failed: ${err.message}`, 'error');
    } finally {
      setResettingRecords(false);
    }
  };

  // Trigger Backup
  const handleCreateBackup = async () => {
    setCreatingBackup(true);
    try {
      const res = await api.settings.createBackup();
      setBackupResult(res);
      showToast('Manual database snapshot created successfully!');
    } catch (err: any) {
      showToast(`Backup error: ${err.message}`, 'error');
    } finally {
      setCreatingBackup(false);
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
      {/* Toast Notification */}
      {toastMessage && (
        <div style={{
          position: 'fixed',
          top: 72,
          right: 24,
          zIndex: 9999,
          background: toastMessage.type === 'success' ? '#064e3b' : '#881337',
          border: `1px solid ${toastMessage.type === 'success' ? '#10b981' : '#f43f5e'}`,
          color: 'white',
          padding: '12px 18px',
          borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontWeight: 600,
          fontSize: 14
        }}>
          {toastMessage.type === 'success' ? <CheckCircle2 size={18} color="#34d399" /> : <AlertCircle size={18} color="#f87171" />}
          <span>{toastMessage.text}</span>
        </div>
      )}

      {/* Settings Navigation Sidebar */}
      <div style={{
        width: 240,
        background: '#0d131f',
        borderRight: '1px solid #1e293b',
        padding: '16px 12px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6
      }}>
        <button
          id="settings-tab-store"
          onClick={() => setSection('store')}
          style={{
            background: section === 'store' ? 'var(--bg-card)' : 'transparent',
            color: section === 'store' ? '#10b981' : 'var(--text-secondary)',
            border: 'none',
            padding: '10px 14px',
            borderRadius: 6,
            textAlign: 'left',
            fontWeight: 700,
            fontSize: 13,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 10
          }}
        >
          <Store size={16} />
          <span>Store & Receipt</span>
        </button>

        <button
          id="settings-tab-stock-config"
          onClick={() => setSection('stock-config')}
          style={{
            background: section === 'stock-config' ? 'var(--bg-card)' : 'transparent',
            color: section === 'stock-config' ? '#10b981' : 'var(--text-secondary)',
            border: 'none',
            padding: '10px 14px',
            borderRadius: 6,
            textAlign: 'left',
            fontWeight: 700,
            fontSize: 13,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: 10
          }}
        >
          <SlidersHorizontal size={16} />
          <span>Stock Entry Fields</span>
        </button>

        {isSuperAdmin && (
          <>
            <button
              id="settings-tab-categories"
              onClick={() => setSection('categories')}
              style={{
                background: section === 'categories' ? 'var(--bg-card)' : 'transparent',
                color: section === 'categories' ? '#10b981' : 'var(--text-secondary)',
                border: 'none',
                padding: '10px 14px',
                borderRadius: 6,
                textAlign: 'left',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 10
              }}
            >
              <Tag size={16} />
              <span>Product Categories</span>
            </button>

            <button
              id="settings-tab-email"
              onClick={() => setSection('email')}
              style={{
                background: section === 'email' ? 'var(--bg-card)' : 'transparent',
                color: section === 'email' ? '#10b981' : 'var(--text-secondary)',
                border: 'none',
                padding: '10px 14px',
                borderRadius: 6,
                textAlign: 'left',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 10
              }}
            >
              <Mail size={16} />
              <span>Email & Daily Report</span>
            </button>

            <button
              id="settings-tab-users"
              onClick={() => setSection('users')}
              style={{
                background: section === 'users' ? 'var(--bg-card)' : 'transparent',
                color: section === 'users' ? '#10b981' : 'var(--text-secondary)',
                border: 'none',
                padding: '10px 14px',
                borderRadius: 6,
                textAlign: 'left',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 10
              }}
            >
              <Users size={16} />
              <span>Staff & Roles</span>
            </button>

            <button
              id="settings-tab-audit"
              onClick={() => setSection('audit')}
              style={{
                background: section === 'audit' ? 'var(--bg-card)' : 'transparent',
                color: section === 'audit' ? '#10b981' : 'var(--text-secondary)',
                border: 'none',
                padding: '10px 14px',
                borderRadius: 6,
                textAlign: 'left',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 10
              }}
            >
              <Shield size={16} />
              <span>Audit Log Trail</span>
            </button>

            <button
              id="settings-tab-backup"
              onClick={() => setSection('backup')}
              style={{
                background: section === 'backup' ? 'var(--bg-card)' : 'transparent',
                color: section === 'backup' ? '#10b981' : 'var(--text-secondary)',
                border: 'none',
                padding: '10px 14px',
                borderRadius: 6,
                textAlign: 'left',
                fontWeight: 700,
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 10
              }}
            >
              <Database size={16} />
              <span>Database Backup</span>
            </button>
          </>
        )}
      </div>

      {/* Main Settings Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        {/* -------------------------------------------------------------------
            SECTION: STORE & RECEIPT PROFILE
            ------------------------------------------------------------------- */}
        {section === 'store' && store && (
          <form onSubmit={handleSaveStore} style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 16 }}>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: 'white', borderBottom: '1px solid #1e293b', paddingBottom: 8 }}>
              Store Profile & Receipt Format
            </h2>

            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Store Name *</label>
              <input
                id="setting-store-name"
                value={store.store_name}
                onChange={e => setStore({ ...store, store_name: e.target.value })}
                required
                style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 10 }}
              />
            </div>

            {/* Shop Brand Logo */}
            <div style={{ background: 'var(--bg-surface)', border: '1px solid #1e293b', borderRadius: 8, padding: 14 }}>
              <label style={{ display: 'block', fontSize: 12, fontWeight: 700, color: 'var(--text-soft)', marginBottom: 8 }}>
                Shop Brand Logo (Optional)
              </label>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <div style={{
                  width: 72,
                  height: 72,
                  borderRadius: 8,
                  background: 'var(--bg-input)',
                  border: '1px dashed #334155',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  overflow: 'hidden',
                  flexShrink: 0
                }}>
                  {store.logo_url ? (
                    <img src={store.logo_url} alt="Shop Logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                  ) : (
                    <Store size={28} color="#64748b" />
                  )}
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <input
                    id="setting-store-logo-url"
                    value={store.logo_url || ''}
                    onChange={e => setStore({ ...store, logo_url: e.target.value })}
                    placeholder="Logo URL or Data URI (e.g. https://... or /logo.png)"
                    style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 8, fontSize: 13 }}
                  />
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Displays on top navigation and printed thermal bills</span>
                    {store.logo_url && (
                      <button
                        type="button"
                        onClick={() => setStore({ ...store, logo_url: '' })}
                        style={{ background: 'transparent', border: 'none', color: '#f43f5e', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}
                      >
                        Remove Logo
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Phone Number</label>
                <input
                  value={store.phone}
                  onChange={e => setStore({ ...store, phone: e.target.value })}
                  style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 10 }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Email Address</label>
                <input
                  type="email"
                  value={store.email}
                  onChange={e => setStore({ ...store, email: e.target.value })}
                  style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 10 }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Physical Store Address</label>
              <textarea
                value={store.address}
                onChange={e => setStore({ ...store, address: e.target.value })}
                rows={2}
                style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 10 }}
              />
            </div>

            {/* GST (Goods & Services Tax) Configuration */}
            <div style={{ background: 'var(--bg-surface)', border: '1px solid #1e293b', borderRadius: 8, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-soft)' }}>GSTIN / Tax Configuration</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: store.enable_gst ? '#34d399' : 'var(--text-secondary)', fontWeight: 600 }}>
                  <input
                    id="setting-toggle-gst"
                    type="checkbox"
                    checked={store.enable_gst ?? true}
                    onChange={e => setStore({ ...store, enable_gst: e.target.checked })}
                    style={{ width: 16, height: 16, accentColor: '#10b981', cursor: 'pointer' }}
                  />
                  <span>{store.enable_gst ? 'Show GST on Receipts' : 'Hide GST on Receipts'}</span>
                </label>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>GSTIN / Tax Registration Number</label>
                <input
                  id="setting-store-gstin"
                  value={store.gst_number || store.tax_number || ''}
                  onChange={e => setStore({ ...store, gst_number: e.target.value, tax_number: e.target.value })}
                  placeholder="e.g. 33AAAAA0000A1Z5"
                  style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 8, fontFamily: 'JetBrains Mono' }}
                />
              </div>
            </div>

            {/* FSSAI Food Safety License Configuration */}
            <div style={{ background: 'var(--bg-surface)', border: '1px solid #1e293b', borderRadius: 8, padding: 14 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-soft)' }}>FSSAI Food Safety License</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 12, color: store.enable_fssai ? '#34d399' : 'var(--text-secondary)', fontWeight: 600 }}>
                  <input
                    id="setting-toggle-fssai"
                    type="checkbox"
                    checked={store.enable_fssai ?? true}
                    onChange={e => setStore({ ...store, enable_fssai: e.target.checked })}
                    style={{ width: 16, height: 16, accentColor: '#10b981', cursor: 'pointer' }}
                  />
                  <span>{store.enable_fssai ? 'Show FSSAI on Receipts' : 'Hide FSSAI on Receipts'}</span>
                </label>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>FSSAI 14-Digit License Number</label>
                <input
                  id="setting-store-fssai"
                  value={store.fssai_number || ''}
                  onChange={e => setStore({ ...store, fssai_number: e.target.value })}
                  placeholder="e.g. 12423008000123"
                  style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 8, fontFamily: 'JetBrains Mono' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Currency Symbol</label>
                <input
                  value={store.currency_symbol}
                  onChange={e => setStore({ ...store, currency_symbol: e.target.value })}
                  style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 10 }}
                />
              </div>
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Receipt Header</label>
              <input
                value={store.receipt_header}
                onChange={e => setStore({ ...store, receipt_header: e.target.value })}
                style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 10 }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Receipt Footer Policy</label>
              <input
                value={store.receipt_footer}
                onChange={e => setStore({ ...store, receipt_footer: e.target.value })}
                style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 10 }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Thermal Paper Width</label>
              <select
                value={store.receipt_width}
                onChange={e => setStore({ ...store, receipt_width: e.target.value })}
                style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 10 }}
              >
                <option value="200">200 (Standard Supermarket Thermal Printer)</option>
                <option value="58mm">58mm (Compact Mobile Thermal Printer)</option>
              </select>
            </div>

            <button
              id="setting-btn-save-store"
              type="submit"
              disabled={storeSaving}
              style={{
                background: '#10b981',
                color: '#062417',
                border: 'none',
                padding: '12px 20px',
                borderRadius: 6,
                fontWeight: 800,
                fontSize: 14,
                cursor: storeSaving ? 'not-allowed' : 'pointer',
                marginTop: 8
              }}
            >
              {storeSaving ? 'Saving Changes...' : 'Save Store Profile'}
            </button>
          </form>
        )}

        {/* -------------------------------------------------------------------
            SECTION: STOCK & PRODUCT ENTRY FIELDS CONFIGURATION
            ------------------------------------------------------------------- */}
        {section === 'categories' && isSuperAdmin && (
          <div style={{ maxWidth: 760, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: 'white', margin: 0 }}>Product Categories</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: 13, margin: '6px 0 0' }}>Create, rename, or remove the categories available when adding products.</p>
            </div>

            <form onSubmit={handleSaveCategory} style={{ background: 'var(--bg-surface)', border: '1px solid #1e293b', borderRadius: 8, padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-soft)', marginBottom: 12 }}>
                {editingCategoryId ? 'Edit category' : 'Create category'}
              </div>
              <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
                <label style={{ flex: '1 1 260px', display: 'flex', flexDirection: 'column', gap: 5, color: 'var(--text-secondary)', fontSize: 12 }}>
                  Category name *
                  <input
                    id="settings-category-name"
                    value={categoryName}
                    onChange={e => setCategoryName(e.target.value)}
                    placeholder="e.g. Frozen Foods"
                    maxLength={100}
                    required
                    style={{ background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: '10px 11px' }}
                  />
                </label>
                <label style={{ display: 'flex', flexDirection: 'column', gap: 5, color: 'var(--text-secondary)', fontSize: 12 }}>
                  Display colour
                  <input
                    aria-label="Category display colour"
                    type="color"
                    value={categoryColor}
                    onChange={e => setCategoryColor(e.target.value)}
                    style={{ width: 46, height: 40, padding: 3, background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, cursor: 'pointer' }}
                  />
                </label>
                {!editingCategoryId && (
                  <label style={{ display: 'flex', flexDirection: 'column', gap: 5, color: 'var(--text-secondary)', fontSize: 12 }}>
                    Insert at position
                    <select
                      value={categoryPosition || String(categories.length + 1)}
                      onChange={e => setCategoryPosition(e.target.value)}
                      style={{ height: 40, minWidth: 130, background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: '0 9px' }}
                    >
                      {Array.from({ length: categories.length + 1 }, (_, index) => (
                        <option key={index + 1} value={index + 1}>
                          {index + 1}{index === categories.length ? ' (last)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <button type="submit" disabled={categorySaving} style={{ background: '#059669', color: 'white', border: 'none', borderRadius: 6, padding: '10px 14px', fontWeight: 700, cursor: categorySaving ? 'wait' : 'pointer' }}>
                  {categorySaving ? 'Saving...' : editingCategoryId ? 'Save changes' : 'Add category'}
                </button>
                {editingCategoryId && (
                  <button type="button" onClick={resetCategoryForm} style={{ background: 'transparent', color: 'var(--text-soft)', border: '1px solid #475569', borderRadius: 6, padding: '10px 14px', fontWeight: 700, cursor: 'pointer' }}>
                    Cancel
                  </button>
                )}
              </div>
            </form>

            <div style={{ border: '1px solid #1e293b', borderRadius: 8, overflow: 'hidden' }}>
              {categories.length === 0 ? (
                <div style={{ padding: 22, color: 'var(--text-secondary)', textAlign: 'center', fontSize: 13 }}>No categories yet. Create the first one above.</div>
              ) : categories.map((category, index) => (
                <div
                  key={category.id}
                  draggable={!categoryReordering}
                  onDragStart={() => setDraggedCategoryId(category.id)}
                  onDragEnd={() => setDraggedCategoryId(null)}
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); handleCategoryDrop(index); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderBottom: '1px solid #1e293b', background: draggedCategoryId === category.id ? '#172554' : '#0f172a', opacity: categoryReordering ? 0.65 : 1, cursor: categoryReordering ? 'wait' : 'grab' }}
                >
                  <GripVertical size={17} color="#64748b" aria-label="Drag to reorder" />
                  <span style={{ width: 12, height: 12, borderRadius: '50%', background: category.color || '#10b981', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ color: 'var(--text-primary)', fontWeight: 700, fontSize: 13 }}>{category.name}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 2 }}>{Number(category.product_count || 0)} active product{Number(category.product_count || 0) === 1 ? '' : 's'}</div>
                  </div>
                  <button type="button" onClick={() => handleEditCategory(category)} style={{ background: 'var(--bg-card)', color: '#7dd3fc', border: '1px solid #334155', borderRadius: 5, padding: '7px 9px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <Edit size={14} /> Edit
                  </button>
                  <button type="button" onClick={() => handleDeleteCategory(category)} style={{ background: 'transparent', color: '#f87171', border: '1px solid #7f1d1d', borderRadius: 5, padding: '7px 9px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              ))}
              {categories.length > 1 && (
                <div
                  onDragOver={e => e.preventDefault()}
                  onDrop={e => { e.preventDefault(); handleCategoryDropAtEnd(); }}
                  style={{ minHeight: draggedCategoryId ? 30 : 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 11, borderTop: draggedCategoryId ? '1px dashed #475569' : 'none' }}
                >
                  {draggedCategoryId ? 'Drop here to place last' : null}
                </div>
              )}
            </div>
          </div>
        )}

        {section === 'stock-config' && stockConfig && (
          <div style={{ maxWidth: 880, display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Header with Save Button */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid #1e293b', paddingBottom: 16 }}>
              <div>
                <h2 style={{ fontSize: 20, fontWeight: 800, color: 'white', display: 'flex', alignItems: 'center', gap: 10, margin: 0 }}>
                  <SlidersHorizontal size={22} color="#10b981" />
                  <span>Stock & Product Entry Configuration</span>
                </h2>
                <p style={{ margin: '6px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                  Enable or disable product fields (MRP, GST, Cost, Net Price, Barcode, etc.) and configure whether each is <strong>Fixed (Mandatory)</strong> or <strong>Optional</strong> during stock entry.
                </p>
              </div>

              <button
                id="save-stock-config-btn"
                type="button"
                onClick={() => handleSaveStockConfig()}
                disabled={stockSaving}
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: '#ffffff',
                  border: 'none',
                  padding: '10px 22px',
                  borderRadius: 8,
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: stockSaving ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)',
                  flexShrink: 0
                }}
              >
                {stockSaving ? <RefreshCw size={16} className="animate-spin" /> : <Check size={16} />}
                <span>{stockSaving ? 'Saving...' : 'Save Stock Fields'}</span>
              </button>
            </div>

            {/* Quick Presets Bar */}
            <div style={{
              background: '#131d2e',
              border: '1px solid #1e293b',
              borderRadius: 10,
              padding: '14px 18px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 12
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-soft)', fontSize: 13, fontWeight: 700 }}>
                <Sparkles size={16} color="#38bdf8" />
                <span>Quick Setup Presets:</span>
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <button
                  type="button"
                  onClick={() => applyPreset('standard')}
                  style={{
                    background: 'var(--bg-card)',
                    color: '#f1f5f9',
                    border: '1px solid #334155',
                    borderRadius: 6,
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Standard Retail
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('simple')}
                  style={{
                    background: 'var(--bg-card)',
                    color: '#f1f5f9',
                    border: '1px solid #334155',
                    borderRadius: 6,
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Fast Grocery (MRP & Net Only)
                </button>
                <button
                  type="button"
                  onClick={() => applyPreset('wholesale')}
                  style={{
                    background: 'var(--bg-card)',
                    color: '#f1f5f9',
                    border: '1px solid #334155',
                    borderRadius: 6,
                    padding: '6px 12px',
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer'
                  }}
                >
                  Supermarket / Wholesale (All Fields)
                </button>
              </div>
            </div>

            {/* Notice about Product Name */}
            <div style={{
              background: 'var(--bg-card)',
              border: '1px solid #334155',
              borderRadius: 8,
              padding: '10px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              fontSize: 13,
              color: 'var(--text-soft)'
            }}>
              <Tag size={16} color="#38bdf8" />
              <span><strong>Product Full Name:</strong> Permanently enabled and fixed across all presets to ensure reliable inventory tracking and barcode lookup.</span>
            </div>

            {/* Fields Grid by Category */}
            {[
              {
                categoryTitle: 'Pricing, Cost & Taxation Fields',
                categoryIcon: <DollarSign size={18} color="#10b981" />,
                fields: ['mrp', 'sellingPrice', 'purchasePrice', 'taxRate']
              },
              {
                categoryTitle: 'Product Identification & Barcodes',
                categoryIcon: <Barcode size={18} color="#38bdf8" />,
                fields: ['barcode', 'sku', 'shortName']
              },
              {
                categoryTitle: 'Classification & Vendor Attributes',
                categoryIcon: <Layers size={18} color="#f59e0b" />,
                fields: ['category', 'unit', 'supplier']
              },
              {
                categoryTitle: 'Stock Quantities & Shelf Life Controls',
                categoryIcon: <Boxes size={18} color="#a855f7" />,
                fields: ['openingStock', 'minStockLevel', 'maxStockLevel', 'hasExpiry']
              }
            ].map(group => (
              <div key={group.categoryTitle} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14, fontWeight: 800, color: 'var(--text-primary)', paddingLeft: 2 }}>
                  {group.categoryIcon}
                  <span>{group.categoryTitle}</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(390px, 1fr))', gap: 12 }}>
                  {group.fields.map(fieldKey => {
                    const item = stockConfig[fieldKey];
                    if (!item) return null;

                    return (
                      <div
                        key={fieldKey}
                        style={{
                          background: item.enabled ? 'var(--bg-card)' : 'var(--bg-input)',
                          border: item.enabled ? '1px solid #2d3748' : '1px dashed #1e293b',
                          borderRadius: 8,
                          padding: '14px 16px',
                          display: 'flex',
                          flexDirection: 'column',
                          justifyContent: 'space-between',
                          gap: 12,
                          opacity: item.enabled ? 1 : 0.65,
                          transition: 'all 0.15s ease'
                        }}
                      >
                        {/* Top: Label and Description */}
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <span style={{ fontWeight: 700, fontSize: 14, color: item.enabled ? '#ffffff' : 'var(--text-secondary)' }}>
                              {item.label}
                            </span>
                            <span style={{
                              fontSize: 11,
                              fontWeight: 800,
                              padding: '2px 8px',
                              borderRadius: 4,
                              background: item.enabled
                                ? (item.required ? '#451a03' : '#064e3b')
                                : 'var(--bg-card)',
                              color: item.enabled
                                ? (item.required ? '#fbbf24' : '#34d399')
                                : 'var(--text-muted)'
                            }}>
                              {!item.enabled ? 'HIDDEN' : (item.required ? 'REQUIRED (*)' : 'OPTIONAL')}
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.4 }}>
                            {item.description || 'Customizable stock entry field'}
                          </div>
                        </div>

                        {/* Controls: Enabled/Disabled and Fixed/Optional */}
                        <div style={{
                          display: 'grid',
                          gridTemplateColumns: '1fr 1fr',
                          gap: 8,
                          borderTop: '1px solid #1e293b',
                          paddingTop: 10
                        }}>
                          {/* Visibility Toggle */}
                          <button
                            type="button"
                            onClick={() => toggleFieldEnabled(fieldKey)}
                            style={{
                              background: item.enabled ? '#064e3b' : 'var(--bg-card)',
                              color: item.enabled ? '#34d399' : 'var(--text-secondary)',
                              border: `1px solid ${item.enabled ? '#059669' : 'var(--border-strong)'}`,
                              borderRadius: 6,
                              padding: '6px 10px',
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 6
                            }}
                          >
                            <span>{item.enabled ? '✓ Enabled' : '✕ Disabled'}</span>
                          </button>

                          {/* Requirement Toggle */}
                          <button
                            type="button"
                            disabled={!item.enabled}
                            onClick={() => toggleFieldRequired(fieldKey)}
                            style={{
                              background: !item.enabled
                                ? '#0f172a'
                                : (item.required ? '#451a03' : 'var(--bg-card)'),
                              color: !item.enabled
                                ? '#475569'
                                : (item.required ? '#fbbf24' : 'var(--text-secondary)'),
                              border: `1px solid ${!item.enabled ? 'var(--bg-card)' : (item.required ? '#d97706' : 'var(--border-strong)')}`,
                              borderRadius: 6,
                              padding: '6px 10px',
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: !item.enabled ? 'not-allowed' : 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              gap: 6
                            }}
                            title={!item.enabled ? 'Enable field first to configure requirement' : ''}
                          >
                            <span>
                              {!item.enabled
                                ? '—'
                                : (item.required ? '★ Fixed (Mandatory)' : '○ Optional')}
                            </span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {/* Bottom Save Bar */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 12, borderTop: '1px solid #1e293b' }}>
              <button
                type="button"
                onClick={() => handleSaveStockConfig()}
                disabled={stockSaving}
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  color: '#ffffff',
                  border: 'none',
                  padding: '12px 28px',
                  borderRadius: 8,
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: stockSaving ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  boxShadow: '0 4px 14px rgba(16, 185, 129, 0.35)'
                }}
              >
                {stockSaving ? <RefreshCw size={16} className="animate-spin" /> : <Check size={16} />}
                <span>{stockSaving ? 'Saving Changes...' : 'Save Stock Fields Configuration'}</span>
              </button>
            </div>
          </div>
        )}

        {/* -------------------------------------------------------------------
            SECTION: EMAIL SMTP & DAILY SALES REPORT
            ------------------------------------------------------------------- */}
        {section === 'email' && emailSettings && (
          <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 20 }}>
            <form onSubmit={handleSaveEmail} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: 'white', borderBottom: '1px solid #1e293b', paddingBottom: 8 }}>
                Email SMTP & Scheduled Daily Sales Report
              </h2>

              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>SMTP Host Server</label>
                  <input
                    value={emailSettings.smtp_host}
                    onChange={e => setEmailSettings({ ...emailSettings, smtp_host: e.target.value })}
                    required
                    placeholder="e.g. smtp.gmail.com"
                    style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 10 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Port (587 or 465)</label>
                  <input
                    type="number"
                    value={emailSettings.smtp_port}
                    onChange={e => setEmailSettings({ ...emailSettings, smtp_port: parseInt(e.target.value, 10) || 587 })}
                    style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 10 }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>SMTP Username / Email</label>
                  <input
                    value={emailSettings.smtp_user}
                    onChange={e => setEmailSettings({ ...emailSettings, smtp_user: e.target.value })}
                    placeholder="e.g. store@freshmart.com"
                    style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 10 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>SMTP App Password</label>
                  <input
                    type="password"
                    value={emailSettings.smtp_password || ''}
                    onChange={e => setEmailSettings({ ...emailSettings, smtp_password: e.target.value })}
                    placeholder="••••••••"
                    style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 10 }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Sender Display Name</label>
                  <input
                    value={emailSettings.sender_name}
                    onChange={e => setEmailSettings({ ...emailSettings, sender_name: e.target.value })}
                    style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 10 }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Sender Email Address</label>
                  <input
                    value={emailSettings.sender_email}
                    onChange={e => setEmailSettings({ ...emailSettings, sender_email: e.target.value })}
                    style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 10 }}
                  />
                </div>
              </div>

              <div style={{ borderTop: '1px solid #1e293b', paddingTop: 14 }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'white', marginBottom: 8 }}>Super Admin Daily Sales Report Schedule</div>
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Recipient Email (Super Admin)</label>
                    <input
                      value={emailSettings.super_admin_email}
                      onChange={e => setEmailSettings({ ...emailSettings, super_admin_email: e.target.value })}
                      required
                      style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 10 }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Dispatch Time(s)</label>
                    <input
                      type="text"
                      value={emailSettings.daily_report_time}
                      onChange={e => setEmailSettings({ ...emailSettings, daily_report_time: e.target.value })}
                      placeholder="21:00 or 21:00, 22:00"
                      style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 10 }}
                    />
                  </div>
                </div>

                <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, color: 'var(--text-soft)', fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={emailSettings.daily_report_enabled}
                    onChange={e => setEmailSettings({ ...emailSettings, daily_report_enabled: e.target.checked })}
                    style={{ accentColor: '#10b981' }}
                  />
                  Automatically dispatch daily sales report to Super Admin email every night
                </label>
              </div>

              <button
                id="setting-btn-save-email"
                type="submit"
                disabled={emailSaving}
                style={{
                  background: '#10b981',
                  color: '#062417',
                  border: 'none',
                  padding: '12px 20px',
                  borderRadius: 6,
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: emailSaving ? 'not-allowed' : 'pointer',
                  marginTop: 6
                }}
              >
                {emailSaving ? 'Saving Email Settings...' : 'Save Email Configuration'}
              </button>
            </form>

            {/* Test Email & Trigger Daily Report */}
            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid #1e293b',
              borderRadius: 10,
              padding: 18,
              display: 'flex',
              flexDirection: 'column',
              gap: 12
            }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, color: 'white' }}>Test Dispatch Actions</h3>
              <div>
                <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Send Test To:</label>
                <input
                  value={testEmailRecipient}
                  onChange={e => setTestEmailRecipient(e.target.value)}
                  placeholder="e.g. owner@freshmart.com"
                  style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 8 }}
                />
              </div>

              <div style={{ display: 'flex', gap: 10 }}>
                <button
                  id="setting-btn-test-email"
                  type="button"
                  disabled={testingEmail}
                  onClick={handleTestEmail}
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid #334155',
                    color: '#38bdf8',
                    padding: '10px 16px',
                    borderRadius: 6,
                    fontWeight: 700,
                    cursor: testingEmail ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <Send size={15} />
                  <span>{testingEmail ? 'Sending Test...' : 'Send Test Verification Email'}</span>
                </button>

                <button
                  id="setting-btn-send-daily-now"
                  type="button"
                  disabled={sendingDailyReport}
                  onClick={handleSendDailyReportNow}
                  style={{
                    background: '#059669',
                    color: 'white',
                    border: 'none',
                    padding: '10px 16px',
                    borderRadius: 6,
                    fontWeight: 700,
                    cursor: sendingDailyReport ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <Mail size={15} />
                  <span>{sendingDailyReport ? 'Generating & Dispatching...' : 'Send Test Daily Report Now'}</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* -------------------------------------------------------------------
            SECTION: USERS & ROLES
            ------------------------------------------------------------------- */}
        {section === 'users' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: 18, fontWeight: 800, color: 'white' }}>Staff User Accounts & RBAC</h2>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Assign roles, manage active status, and maintain store cashier access</p>
              </div>
              <button
                onClick={() => setShowAddUserModal(true)}
                style={{
                  background: '#2563eb',
                  color: 'white',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: 6,
                  fontWeight: 700,
                  fontSize: 13,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <Plus size={16} />
                <span>Add Staff User</span>
              </button>
            </div>

            <div style={{ background: 'var(--bg-surface)', border: '1px solid #1e293b', borderRadius: 8, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-input)', borderBottom: '1px solid #2d3748', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '12px 16px', textAlign: 'left' }}>Staff Member</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left' }}>Username</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left' }}>Role</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left' }}>Password</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center' }}>Status</th>
                    <th style={{ padding: '12px 16px', textAlign: 'left' }}>Last Login</th>
                    <th style={{ padding: '12px 16px', textAlign: 'center' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {usersList.map(u => {
                    const isSuper = u.roles?.includes('SUPER_ADMIN');
                    const isPassRevealed = !!revealedPasswords[u.id];

                    return (
                      <tr key={u.id} style={{ borderBottom: '1px solid #1e293b' }}>
                        <td style={{ padding: '12px 16px', fontWeight: 600, color: 'white' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {u.avatar_url ? (
                              <img
                                src={u.avatar_url}
                                alt={u.full_name}
                                style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', border: '1px solid #334155' }}
                              />
                            ) : (
                              <div style={{
                                width: 34,
                                height: 34,
                                borderRadius: '50%',
                                background: isSuper ? 'rgba(16, 185, 129, 0.2)' : 'rgba(56, 189, 248, 0.2)',
                                color: isSuper ? '#34d399' : '#38bdf8',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontWeight: 700,
                                fontSize: 13
                              }}>
                                {u.full_name?.charAt(0).toUpperCase() || 'U'}
                              </div>
                            )}
                            <div>
                              <div>{u.full_name}</div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{u.email}</div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', fontFamily: 'JetBrains Mono', color: 'var(--text-soft)' }}>
                          {u.username}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span className={`role-badge ${isSuper ? 'super' : 'admin'}`}>
                            {isSuper ? 'Super Admin' : 'System Admin'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{
                              fontFamily: 'JetBrains Mono',
                              fontSize: 13,
                              color: isPassRevealed ? '#34d399' : 'var(--text-secondary)',
                              letterSpacing: isPassRevealed ? 'normal' : '0.12em'
                            }}>
                              {isPassRevealed ? 'Password is not stored in readable form' : '••••••••'}
                            </span>
                            <button
                              type="button"
                              onClick={() => togglePasswordReveal(u.id)}
                              title={isPassRevealed ? 'Hide password' : 'View password (Super Admin)'}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: isPassRevealed ? '#34d399' : 'var(--text-muted)',
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                padding: 2
                              }}
                            >
                              {isPassRevealed ? <EyeOff size={15} /> : <Eye size={15} />}
                            </button>
                          </div>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 700,
                            background: u.is_active ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: u.is_active ? '#34d399' : '#f87171'
                          }}>
                            {u.is_active ? 'ACTIVE' : 'DEACTIVATED'}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: 12 }}>
                          {u.last_login_at ? new Date(u.last_login_at).toLocaleString() : 'Never'}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <div style={{ display: 'flex', justifyContent: 'center', gap: 6 }}>
                            <button
                              id={`edit-user-btn-${u.username}`}
                              onClick={() => handleOpenEditUser(u)}
                              style={{
                                background: 'var(--bg-card)',
                                border: '1px solid #334155',
                                color: '#38bdf8',
                                padding: '4px 8px',
                                borderRadius: 4,
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                gap: 4
                              }}
                            >
                              <Edit size={12} />
                              <span>Edit</span>
                            </button>
                            <button
                              onClick={() => handleToggleUserActive(u.id, u.is_active)}
                              style={{
                                background: 'var(--bg-card)',
                                border: '1px solid #334155',
                                color: u.is_active ? '#f87171' : '#34d399',
                                padding: '4px 8px',
                                borderRadius: 4,
                                fontSize: 11,
                                fontWeight: 700,
                                cursor: 'pointer'
                              }}
                            >
                              {u.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* -------------------------------------------------------------------
            SECTION: AUDIT LOG TRAIL
            ------------------------------------------------------------------- */}
        {section === 'audit' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: 'white' }}>Security & Administrative Audit Log Trail</h2>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Append-only immutable record of all logins, stock adjustments, price overrides, and configuration edits</p>
            </div>

            <div style={{ background: 'var(--bg-surface)', border: '1px solid #1e293b', borderRadius: 8, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-input)', borderBottom: '1px solid #2d3748', color: 'var(--text-secondary)' }}>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Timestamp</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>User</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Action</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Entity</th>
                    <th style={{ padding: '10px 14px', textAlign: 'left' }}>Values / Diff</th>
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map(log => (
                    <tr key={log.id} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '10px 14px', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
                        {new Date(log.created_at).toLocaleString()}
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 600, color: 'white' }}>
                        {log.username || 'System'}
                      </td>
                      <td style={{ padding: '10px 14px' }}>
                        <span style={{
                          background: 'var(--bg-card)',
                          border: '1px solid #334155',
                          padding: '2px 6px',
                          borderRadius: 4,
                          fontWeight: 700,
                          color: '#38bdf8'
                        }}>
                          {log.action}
                        </span>
                      </td>
                      <td style={{ padding: '10px 14px', color: 'var(--text-soft)' }}>
                        {log.entity} {log.entity_id ? `(#${log.entity_id.slice(-6)})` : ''}
                      </td>
                      <td style={{ padding: '10px 14px', fontFamily: 'JetBrains Mono', color: 'var(--text-secondary)', maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {JSON.stringify(log.new_values || log.old_values || {})}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* -------------------------------------------------------------------
            SECTION: DATABASE BACKUP
            ------------------------------------------------------------------- */}
        {section === 'backup' && (
          <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 18 }}>
            <div>
              <h2 style={{ fontSize: 18, fontWeight: 800, color: 'white' }}>Database Backup & Disaster Recovery</h2>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Create immediate snapshot archive of all supermarket products, sales, inventory movements, and settings</p>
            </div>

            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid #1e293b',
              borderRadius: 10,
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 14
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <Database size={32} color="#10b981" />
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: 'white' }}>Manual Snapshot Trigger</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Database: supermarket_db on PostgreSQL 18</div>
                </div>
              </div>

              <button
                id="setting-btn-create-backup"
                disabled={creatingBackup}
                onClick={handleCreateBackup}
                style={{
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  color: '#062417',
                  border: 'none',
                  padding: '12px 20px',
                  borderRadius: 6,
                  fontWeight: 800,
                  fontSize: 14,
                  cursor: creatingBackup ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8
                }}
              >
                <RefreshCw size={16} className={creatingBackup ? 'spin' : ''} />
                <span>{creatingBackup ? 'Creating Snapshot Archive...' : 'Generate New Database Backup Now'}</span>
              </button>

              {backupResult && (
                <div style={{
                  background: 'var(--bg-input)',
                  border: '1px solid #10b981',
                  borderRadius: 8,
                  padding: 14,
                  marginTop: 8
                }}>
                  <div style={{ fontWeight: 700, color: '#34d399', fontSize: 14 }}>
                    ✓ Backup Created: {backupResult.backupId}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                    Timestamp: {new Date(backupResult.timestamp).toLocaleString()}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-soft)', marginTop: 8 }}>
                    Record counts verified:
                  </div>
                  <pre style={{
                    background: 'var(--bg-surface)',
                    padding: 8,
                    borderRadius: 4,
                    fontSize: 11,
                    color: '#38bdf8',
                    marginTop: 4,
                    overflowX: 'auto'
                  }}>
                    {JSON.stringify(backupResult.tableRecordCounts, null, 2)}
                  </pre>
                </div>
              )}
            </div>

            {/* Wipe Pre-inserted Records Card */}
            <div style={{
              background: 'var(--bg-surface)',
              border: '1px solid #991b1b',
              borderRadius: 10,
              padding: 20,
              display: 'flex',
              flexDirection: 'column',
              gap: 14
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ background: 'rgba(239, 68, 68, 0.15)', padding: 10, borderRadius: 8, color: '#f87171' }}>
                  <Trash2 size={24} />
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 16, color: '#fca5a5' }}>
                    Wipe Pre-Inserted Records & Fresh Start
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                    Clear demo transactions, held carts, sales history, and reset billing invoice numbers back to 000001
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                <button
                  id="setting-btn-wipe-sales"
                  type="button"
                  disabled={resettingRecords}
                  onClick={() => handleResetRecords('transactions')}
                  style={{
                    background: '#dc2626',
                    color: 'white',
                    border: 'none',
                    padding: '10px 18px',
                    borderRadius: 6,
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: resettingRecords ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}
                >
                  <Trash2 size={16} />
                  <span>{resettingRecords ? 'Wiping Records...' : 'Wipe All Sales & Reset Invoice No (000001)'}</span>
                </button>

                <button
                  id="setting-btn-clear-stock"
                  type="button"
                  disabled={resettingRecords}
                  onClick={() => handleResetRecords('clear_stock')}
                  style={{
                    background: '#0284c7',
                    color: 'white',
                    border: 'none',
                    padding: '10px 18px',
                    borderRadius: 6,
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: resettingRecords ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}
                >
                  <RefreshCw size={16} />
                  <span>Clear All Stock Levels to 0</span>
                </button>

                <button
                  id="setting-btn-wipe-products"
                  type="button"
                  disabled={resettingRecords}
                  onClick={() => handleResetRecords('products')}
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid #ef4444',
                    color: '#fca5a5',
                    padding: '10px 18px',
                    borderRadius: 6,
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: resettingRecords ? 'not-allowed' : 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8
                  }}
                >
                  <Trash2 size={16} />
                  <span>Delete All Products & Stock</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ---------------------------------------------------------------------
          MODAL: ADD USER
          --------------------------------------------------------------------- */}
      {showAddUserModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <div className="modal-title">Create Staff Account</div>
              <button
                onClick={() => setShowAddUserModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateUser}>
              <div className="modal-body">
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Username *</label>
                  <input
                    name="username"
                    required
                    placeholder="e.g. cashier2"
                    style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 8 }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Full Name *</label>
                  <input
                    name="fullName"
                    required
                    placeholder="e.g. Priya Sharma"
                    style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 8 }}
                  />
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Email Address *</label>
                    <span style={{ fontSize: 11, color: '#10b981' }}>Shared emails allowed</span>
                  </div>
                  <input
                    name="email"
                    type="email"
                    required
                    placeholder="e.g. store@bharathihomelings.com"
                    style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 8 }}
                  />
                </div>

                <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer' }}>
                  <input name="receiveDailyReport" type="checkbox" defaultChecked />
                  Send the daily sales status to this profile's email
                </label>

                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Initial Password *</label>
                  <input
                    name="password"
                    type="text"
                    required
                    placeholder="Set an initial staff password"
                    style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 8 }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Profile DP / Avatar URL (Optional)</label>
                  <input
                    name="avatarUrl"
                    placeholder="e.g. https://api.dicebear.com/7.x/bottts/svg?seed=priya"
                    style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 8 }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Phone (for OTP Login)</label>
                    <input
                      name="phone"
                      placeholder="9876543210"
                      style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 8 }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Assigned Role *</label>
                    <select
                      name="roleId"
                      style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 8 }}
                    >
                      <option value="SYSTEM_ADMIN">System Admin (Billing & Stock)</option>
                      <option value="SUPER_ADMIN">Super Admin (Unrestricted Full Access)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setShowAddUserModal(false)}
                  style={{ background: 'transparent', border: '1px solid #334155', color: 'var(--text-secondary)', padding: '8px 16px', borderRadius: 6 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ background: '#2563eb', color: 'white', border: 'none', padding: '8px 18px', borderRadius: 6, fontWeight: 700 }}
                >
                  Create Account
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------
          MODAL: EDIT USER (SUPER ADMIN EDITING DETAILS & PASSWORDS)
          --------------------------------------------------------------------- */}
      {showEditUserModal && editingUser && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <div className="modal-title">Edit User Account: {editingUser.username}</div>
              <button
                onClick={() => {
                  setShowEditUserModal(false);
                  setEditingUser(null);
                }}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleUpdateUser}>
              <div className="modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Username (Read Only)</label>
                    <input
                      value={editingUser.username}
                      disabled
                      style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #222e42', borderRadius: 6, color: 'var(--text-secondary)', padding: 8 }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Full Name *</label>
                    <input
                      value={editingUser.full_name || ''}
                      onChange={e => setEditingUser({ ...editingUser, full_name: e.target.value })}
                      required
                      style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 8 }}
                    />
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Email Address *</label>
                    <span style={{ fontSize: 11, color: '#10b981' }}>Shared emails allowed</span>
                  </div>
                  <input
                    type="email"
                    value={editingUser.email || ''}
                    onChange={e => setEditingUser({ ...editingUser, email: e.target.value })}
                    required
                    style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 8 }}
                  />
                </div>

                <label style={{ display: 'flex', gap: 8, alignItems: 'center', color: 'var(--text-secondary)', fontSize: 13, cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    checked={editingUser.receive_daily_report !== false}
                    onChange={e => setEditingUser({ ...editingUser, receive_daily_report: e.target.checked })}
                  />
                  Send the daily sales status to this profile's email
                </label>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Phone (for OTP Login)</label>
                    <input
                      value={editingUser.phone || ''}
                      onChange={e => setEditingUser({ ...editingUser, phone: e.target.value })}
                      placeholder="9876543210"
                      style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 8 }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Assigned Role</label>
                    <select
                      value={editingUser.roleId || 'SYSTEM_ADMIN'}
                      onChange={e => setEditingUser({ ...editingUser, roleId: e.target.value })}
                      style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 8 }}
                    >
                      <option value="SYSTEM_ADMIN">System Admin</option>
                      <option value="SUPER_ADMIN">Super Admin</option>
                    </select>
                  </div>
                </div>

                {/* Password modification */}
                <div style={{ background: 'var(--bg-input)', border: '1px solid #1e293b', borderRadius: 8, padding: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <label style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-soft)' }}>Update Password</label>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Leave blank to keep unchanged</span>
                  </div>
                  <input
                    type="text"
                    value={editingUser.newPassword || ''}
                    onChange={e => setEditingUser({ ...editingUser, newPassword: e.target.value })}
                    placeholder="Enter your current password"
                    style={{ width: '100%', background: 'var(--bg-surface)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 8 }}
                  />
                </div>

                {/* Profile DP Avatar */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    Profile DP Avatar (Image URL)
                  </label>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    {editingUser.avatar_url ? (
                      <img
                        src={editingUser.avatar_url}
                        alt="Avatar"
                        style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', border: '1px solid #334155' }}
                      />
                    ) : (
                      <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--bg-card)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontWeight: 700 }}>
                        {editingUser.full_name?.charAt(0) || 'U'}
                      </div>
                    )}
                    <input
                      value={editingUser.avatar_url || ''}
                      onChange={e => setEditingUser({ ...editingUser, avatar_url: e.target.value })}
                      placeholder="e.g. https://api.dicebear.com/7.x/avataaars/svg?seed=alex"
                      style={{ flex: 1, background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 8 }}
                    />
                  </div>
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => {
                    setShowEditUserModal(false);
                    setEditingUser(null);
                  }}
                  style={{ background: 'transparent', border: '1px solid #334155', color: 'var(--text-secondary)', padding: '8px 16px', borderRadius: 6 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ background: '#10b981', color: '#062417', border: 'none', padding: '8px 20px', borderRadius: 6, fontWeight: 800 }}
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
