import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import { Product, Category, Unit, Supplier, InventoryMovement, StockFieldConfig } from '../../types';
import {
  Boxes, AlertTriangle, AlertCircle, TrendingUp,
  Plus, Edit, Search, Filter, ArrowUpRight, ArrowDownLeft,
  CheckCircle, RefreshCw, X, ShoppingCart, Truck, Calendar,
  Barcode, Printer, Trash2, SlidersHorizontal
} from 'lucide-react';

export const StockModule: React.FC = () => {
  // Tabs: 'catalog' | 'movements' | 'lowstock'
  const [activeTab, setActiveTab] = useState<'catalog' | 'movements' | 'lowstock'>('catalog');

  // Dashboard Metrics
  const [dashboardMetrics, setDashboardMetrics] = useState<any>(null);

  // Catalog State
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [stockStatusFilter, setStockStatusFilter] = useState<'ALL' | 'LOW' | 'OUT' | 'AVAILABLE'>('ALL');
  const [loading, setLoading] = useState(false);

  // Movements Ledger State
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [selectedMovementType, setSelectedMovementType] = useState<string>('');

  // Low Stock & Reorder State
  const [lowStockList, setLowStockList] = useState<any[]>([]);

  // Modals
  const [showProductModal, setShowProductModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [stockFieldConfig, setStockFieldConfig] = useState<StockFieldConfig | null>(null);
  const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [showBarcodeSheetModal, setShowBarcodeSheetModal] = useState(false);
  const [barcodeProduct, setBarcodeProduct] = useState<Product | null>(null);
  const [barcodeLabelCount, setBarcodeLabelCount] = useState(24);
  const [showClearStockModal, setShowClearStockModal] = useState(false);
  const [clearingStock, setClearingStock] = useState(false);

  // Adjustment Form State
  const [adjProductId, setAdjProductId] = useState<string>('');
  const [adjNewQty, setAdjNewQty] = useState<number>(0);
  const [adjType, setAdjType] = useState<'PHYSICAL_COUNT' | 'DAMAGED' | 'EXPIRED' | 'CORRECTION'>('PHYSICAL_COUNT');
  const [adjReason, setAdjReason] = useState<string>('');

  // Purchase Form State
  const [purchaseSupplierId, setPurchaseSupplierId] = useState<string>('');
  const [purchaseInvoiceNum, setPurchaseInvoiceNum] = useState<string>('');
  const [purchaseItems, setPurchaseItems] = useState<Array<{
    productId: string;
    quantity: number;
    purchaseRate: number;
    taxRate: number;
    batchNumber?: string;
    expiryDate?: string;
  }>>([]);

  useEffect(() => {
    loadDashboard();
    loadCatalog();
    loadCategories();
    loadUnits();
    loadSuppliers();
    loadStockConfig();
  }, []);

  const loadStockConfig = async () => {
    try {
      const res = await api.settings.getStore();
      if (res.store?.stock_field_config) {
        setStockFieldConfig(res.store.stock_field_config);
      }
    } catch (err) {
      console.error('Failed to load stock field config:', err);
    }
  };

  const isFieldEnabled = (fieldKey: string, defaultVal = true) => {
    if (!stockFieldConfig || !stockFieldConfig[fieldKey]) return defaultVal;
    return stockFieldConfig[fieldKey].enabled !== false;
  };

  const isFieldRequired = (fieldKey: string, defaultVal = false) => {
    if (!stockFieldConfig || !stockFieldConfig[fieldKey]) return defaultVal;
    if (stockFieldConfig[fieldKey].enabled === false) return false;
    return !!stockFieldConfig[fieldKey].required;
  };

  useEffect(() => {
    if (activeTab === 'catalog') {
      loadCatalog();
    } else if (activeTab === 'movements') {
      loadMovements();
    } else if (activeTab === 'lowstock') {
      loadLowStock();
    }
  }, [activeTab, selectedCategory, stockStatusFilter, selectedMovementType]);

  const loadDashboard = async () => {
    try {
      const res = await api.inventory.getDashboard();
      setDashboardMetrics(res.metrics);
    } catch (err) {
      console.error('Failed to load inventory dashboard:', err);
    }
  };

  const loadCatalog = async () => {
    setLoading(true);
    try {
      const res = await api.products.getAll({
        search: searchQuery,
        categoryId: selectedCategory || undefined,
        stockStatus: stockStatusFilter !== 'ALL' ? stockStatusFilter : undefined,
        limit: 100
      });
      setProducts(res.products);
    } catch (err) {
      console.error('Failed to load products:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadMovements = async () => {
    setLoading(true);
    try {
      const res = await api.inventory.getMovements({
        movementType: selectedMovementType || undefined,
        limit: 100
      });
      setMovements(res.movements);
    } catch (err) {
      console.error('Failed to load movements:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadLowStock = async () => {
    setLoading(true);
    try {
      const res = await api.inventory.getLowStock();
      setLowStockList(res.lowStock);
    } catch (err) {
      console.error('Failed to load low stock report:', err);
    } finally {
      setLoading(false);
    }
  };

  const loadCategories = async () => {
    const res = await api.products.getCategories();
    setCategories(res.categories);
  };

  const loadUnits = async () => {
    const res = await api.products.getUnits();
    setUnits(res.units);
  };

  const loadSuppliers = async () => {
    const res = await api.products.getSuppliers();
    setSuppliers(res.suppliers);
  };

  // Product Form Save
  // Product Form Save
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    const form = e.target as any;

    const autoBarcode = `BC${Date.now().toString().slice(-8)}`;
    const autoSku = `SKU-${Date.now().toString().slice(-6)}`;

    const rawBarcode = form.barcode?.value?.trim();
    const rawSku = form.sku?.value?.trim();
    const rawSellingPrice = form.sellingPrice ? parseFloat(form.sellingPrice.value) : NaN;
    const rawMrp = form.mrp ? parseFloat(form.mrp.value) : NaN;
    const rawPurchasePrice = form.purchasePrice ? parseFloat(form.purchasePrice.value) : NaN;
    const rawTaxRate = form.taxRate ? parseFloat(form.taxRate.value) : NaN;

    // Resolve prices with smart fallbacks
    const sellingPrice = !isNaN(rawSellingPrice) ? rawSellingPrice : (!isNaN(rawMrp) ? rawMrp : 0);
    const mrp = !isNaN(rawMrp) ? rawMrp : sellingPrice;
    const purchasePrice = !isNaN(rawPurchasePrice) ? rawPurchasePrice : 0;
    const taxRate = !isNaN(rawTaxRate) ? rawTaxRate : 0;

    const payload = {
      sku: rawSku || (editingProduct ? editingProduct.sku : autoSku),
      barcode: rawBarcode || (editingProduct ? editingProduct.barcode : autoBarcode),
      name: form.pName.value.trim(),
      shortName: form.shortName?.value?.trim() || form.pName.value.trim().slice(0, 30),
      categoryId: form.categoryId?.value || (categories[0]?.id || undefined),
      unitId: form.unitId?.value || (units[0]?.id || 'PCS'),
      supplierId: form.supplierId?.value || undefined,
      purchasePrice,
      sellingPrice,
      mrp,
      taxRate,
      openingStock: editingProduct ? undefined : (form.openingStock ? parseFloat(form.openingStock.value) || 0 : 0),
      minStockLevel: form.minStockLevel ? parseFloat(form.minStockLevel.value) || 0 : 0,
      maxStockLevel: form.maxStockLevel ? parseFloat(form.maxStockLevel.value) || 1000 : 1000,
      hasExpiry: form.hasExpiry ? form.hasExpiry.checked : false
    };

    try {
      if (editingProduct) {
        await api.products.update(editingProduct.id, payload);
        alert('Product updated successfully.');
      } else {
        await api.products.create(payload);
        alert('Product created successfully.');
      }
      setShowProductModal(false);
      setEditingProduct(null);
      loadCatalog();
      loadDashboard();
    } catch (err: any) {
      alert(`Error saving product: ${err.message}`);
    }
  };

  // Stock Adjustment Save
  const handleSaveAdjustment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjProductId || !adjReason.trim()) {
      alert('Please select product and state a valid reason.');
      return;
    }

    try {
      await api.inventory.createAdjustment({
        productId: adjProductId,
        newQuantity: adjNewQty,
        adjustmentType: adjType,
        reason: adjReason.trim()
      });
      alert('Stock adjustment recorded successfully.');
      setShowAdjustmentModal(false);
      setAdjProductId('');
      setAdjReason('');
      loadCatalog();
      loadDashboard();
    } catch (err: any) {
      alert(`Adjustment error: ${err.message}`);
    }
  };

  // Add line item to purchase order
  const handleAddPurchaseLine = (prodId: string) => {
    const prod = products.find(p => p.id === prodId);
    if (!prod) return;

    setPurchaseItems(prev => [
      ...prev,
      {
        productId: prod.id,
        quantity: 10,
        purchaseRate: Number(prod.purchase_price),
        taxRate: Number(prod.tax_rate || 0),
        batchNumber: `BAT-${Date.now().toString().slice(-4)}`,
        expiryDate: new Date(Date.now() + 180 * 24 * 3600 * 1000).toISOString().split('T')[0]
      }
    ]);
  };

  const handleSavePurchaseOrder = async () => {
    if (!purchaseSupplierId || purchaseItems.length === 0) {
      alert('Please select supplier and add at least one line item.');
      return;
    }

    try {
      await api.inventory.createPurchase({
        supplierId: purchaseSupplierId,
        supplierInvoiceNumber: purchaseInvoiceNum || undefined,
        items: purchaseItems
      });
      alert('Purchase order confirmed! Stock has been added and movement ledger updated.');
      setShowPurchaseModal(false);
      setPurchaseItems([]);
      loadCatalog();
      loadDashboard();
    } catch (err: any) {
      alert(`Purchase receipt error: ${err.message}`);
    }
  };

  // Overall Clear Stock / Reset Stock Handler
  const handleOverallClearStock = async (mode: 'zero' | 'delete') => {
    const isZero = mode === 'zero';
    const confirmMsg = isZero
      ? 'Are you SURE you want to RESET ALL STOCK QUANTITIES TO 0.00 across the entire catalog?\n\nThis will zero out all on-hand stock and clear inward batch ledgers. Product names and prices will remain intact.'
      : 'Are you SURE you want to COMPLETELY DELETE ALL PRODUCTS & INVENTORY?\n\nThis will permanently delete all products, barcodes, batches, and movements from the system!';

    if (!window.confirm(confirmMsg)) return;

    setClearingStock(true);
    try {
      const res = await api.settings.resetRecords(isZero ? 'clear_stock' : 'products');
      alert(res.message || 'Stock records updated successfully.');
      setShowClearStockModal(false);
      loadCatalog();
      loadDashboard();
    } catch (err: any) {
      alert(`Operation failed: ${err.message}`);
    } finally {
      setClearingStock(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 64px)', overflow: 'hidden' }}>
      {/* Top Dashboard Metrics Bar */}
      <div style={{
        background: '#0d131f',
        borderBottom: '1px solid #1e293b',
        padding: '12px 20px',
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: 12,
        flexShrink: 0
      }}>
        {/* Total Products */}
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid #2d3748',
          borderRadius: 8,
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 12
        }}>
          <div style={{ background: 'rgba(59, 130, 246, 0.15)', padding: 10, borderRadius: 8, color: '#38bdf8' }}>
            <Boxes size={20} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Total Products</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: 'white' }}>
              {dashboardMetrics?.total_products || products.length}
            </div>
          </div>
        </div>

        {/* Low Stock Alert */}
        <div
          onClick={() => {
            setActiveTab('lowstock');
          }}
          style={{
            background: 'var(--bg-card)',
            border: '1px solid #2d3748',
            borderRadius: 8,
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            cursor: 'pointer'
          }}
        >
          <div style={{ background: 'rgba(245, 158, 11, 0.15)', padding: 10, borderRadius: 8, color: '#fbbf24' }}>
            <AlertTriangle size={20} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Low Stock Alert</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#fbbf24' }}>
              {dashboardMetrics?.low_stock || 0}
            </div>
          </div>
        </div>

        {/* Out of Stock */}
        <div
          onClick={() => {
            setActiveTab('catalog');
            setStockStatusFilter('OUT');
          }}
          style={{
            background: 'var(--bg-card)',
            border: '1px solid #2d3748',
            borderRadius: 8,
            padding: '10px 14px',
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            cursor: 'pointer'
          }}
        >
          <div style={{ background: 'rgba(239, 68, 68, 0.15)', padding: 10, borderRadius: 8, color: '#f87171' }}>
            <AlertCircle size={20} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Out of Stock</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#f87171' }}>
              {dashboardMetrics?.out_of_stock || 0}
            </div>
          </div>
        </div>

        {/* Today's Sales Qty */}
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid #2d3748',
          borderRadius: 8,
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 12
        }}>
          <div style={{ background: 'rgba(16, 185, 129, 0.15)', padding: 10, borderRadius: 8, color: '#34d399' }}>
            <TrendingUp size={20} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Sold Today</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: '#34d399' }}>
              {Number(dashboardMetrics?.today_sales_qty || 0).toFixed(0)} units
            </div>
          </div>
        </div>

        {/* Stock Valuation (Retail) */}
        <div style={{
          background: 'var(--bg-card)',
          border: '1px solid #2d3748',
          borderRadius: 8,
          padding: '10px 14px',
          display: 'flex',
          alignItems: 'center',
          gap: 12
        }}>
          <div style={{ background: 'rgba(99, 102, 241, 0.15)', padding: 10, borderRadius: 8, color: '#818cf8' }}>
            <ShoppingCart size={20} />
          </div>
          <div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Stock Valuation</div>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'white', fontFamily: 'JetBrains Mono' }}>
              ₹{Number(dashboardMetrics?.stock_valuation_retail || 0).toFixed(0)}
            </div>
          </div>
        </div>
      </div>

      {/* Navigation Sub-Tabs & Action Buttons */}
      <div style={{
        padding: '12px 20px',
        background: 'var(--bg-surface)',
        borderBottom: '1px solid #1e293b',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0
      }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            id="stock-tab-catalog"
            onClick={() => setActiveTab('catalog')}
            style={{
              background: activeTab === 'catalog' ? '#2563eb' : 'var(--bg-card)',
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
            <Boxes size={15} />
            <span>Product Catalog</span>
          </button>

          <button
            id="stock-tab-movements"
            onClick={() => setActiveTab('movements')}
            style={{
              background: activeTab === 'movements' ? '#2563eb' : 'var(--bg-card)',
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
            <RefreshCw size={15} />
            <span>Traceable Movement Ledger</span>
          </button>

          <button
            id="stock-tab-lowstock"
            onClick={() => setActiveTab('lowstock')}
            style={{
              background: activeTab === 'lowstock' ? '#2563eb' : 'var(--bg-card)',
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
            <AlertTriangle size={15} color="#fbbf24" />
            <span>Low Stock & Reorders</span>
          </button>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            id="stock-btn-adjustment"
            onClick={() => {
              setAdjProductId(products[0]?.id || '');
              setShowAdjustmentModal(true);
            }}
            style={{
              background: 'var(--border-strong)',
              color: 'white',
              border: '1px solid #475569',
              padding: '8px 14px',
              borderRadius: 6,
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <span>Stock Adjustment</span>
          </button>

          <button
            id="stock-btn-purchase"
            onClick={() => {
              setPurchaseSupplierId(suppliers[0]?.id || '');
              setShowPurchaseModal(true);
            }}
            style={{
              background: '#059669',
              color: 'white',
              border: 'none',
              padding: '8px 14px',
              borderRadius: 6,
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <Truck size={16} />
            <span>Goods Purchase / Inward</span>
          </button>

          <button
            id="stock-btn-barcode-labels"
            onClick={() => {
              setBarcodeProduct(products[0] || null);
              setShowBarcodeSheetModal(true);
            }}
            style={{
              background: '#475569',
              color: 'white',
              border: 'none',
              padding: '8px 14px',
              borderRadius: 6,
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <Barcode size={16} />
            <span>Barcode Label Sheet</span>
          </button>

          <button
            id="stock-btn-add-product"
            onClick={() => {
              setEditingProduct(null);
              setShowProductModal(true);
            }}
            style={{
              background: 'linear-gradient(135deg, #3b82f6, #2563eb)',
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
            <span>Add Product</span>
          </button>

          <button
            id="stock-btn-clear-all"
            onClick={() => setShowClearStockModal(true)}
            style={{
              background: '#3d1216',
              color: '#fca5a5',
              border: '1px solid #ef4444',
              padding: '8px 14px',
              borderRadius: 6,
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6
            }}
          >
            <Trash2 size={16} />
            <span>Clear All Stocks</span>
          </button>
        </div>
      </div>

      {/* ---------------------------------------------------------------------
          TAB 1: PRODUCT CATALOG
          --------------------------------------------------------------------- */}
      {activeTab === 'catalog' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 20 }}>
          {/* Filters */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              background: 'var(--bg-surface)',
              border: '1px solid #334155',
              borderRadius: 6,
              padding: '8px 12px',
              gap: 8
            }}>
              <Search size={16} color="#64748b" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => {
                  setSearchQuery(e.target.value);
                  if (e.target.value.length > 1 || e.target.value.length === 0) loadCatalog();
                }}
                placeholder="Search products by name, barcode, or SKU..."
                style={{ background: 'transparent', border: 'none', color: 'white', width: '100%', outline: 'none' }}
              />
            </div>

            <select
              value={selectedCategory}
              onChange={e => setSelectedCategory(e.target.value)}
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid #334155',
                color: 'white',
                padding: '8px 12px',
                borderRadius: 6
              }}
            >
              <option value="">All Categories</option>
              {categories.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>

            <select
              value={stockStatusFilter}
              onChange={e => setStockStatusFilter(e.target.value as any)}
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid #334155',
                color: 'white',
                padding: '8px 12px',
                borderRadius: 6
              }}
            >
              <option value="ALL">All Stock Levels</option>
              <option value="AVAILABLE">Normal Stock</option>
              <option value="LOW">Low Stock</option>
              <option value="OUT">Out of Stock</option>
            </select>
          </div>

          {/* Products Table */}
          <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-surface)', border: '1px solid #1e293b', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-input)', borderBottom: '1px solid #2d3748', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '12px 16px' }}>Product Name</th>
                  <th style={{ padding: '12px 16px' }}>Barcode / SKU</th>
                  <th style={{ padding: '12px 16px' }}>Category</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Cost</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Selling Rate</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>MRP</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Available Stock</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Total Sold</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {products.map(p => {
                  const isOut = Number(p.current_stock) <= 0;
                  const isLow = Number(p.current_stock) <= Number(p.min_stock_level);
                  const totalSold = Number(p.total_sold || 0);

                  return (
                    <tr key={p.id} style={{ borderBottom: '1px solid #1e293b' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: 'white' }}>
                        {p.name}
                      </td>
                      <td style={{ padding: '12px 16px', fontFamily: 'JetBrains Mono', fontSize: 12, color: 'var(--text-soft)' }}>
                        <div>{p.barcode}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{p.sku}</div>
                      </td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                        {p.category_name || '—'}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono' }}>
                        ₹{Number(p.purchase_price).toFixed(2)}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono', fontWeight: 700, color: '#10b981' }}>
                        ₹{Number(p.selling_price).toFixed(2)}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono', color: 'var(--text-secondary)' }}>
                        ₹{Number(p.mrp).toFixed(2)}
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '4px 10px',
                          borderRadius: 6,
                          fontWeight: 700,
                          fontSize: 12,
                          background: isOut ? 'rgba(239, 68, 68, 0.15)' : isLow ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                          color: isOut ? '#f87171' : isLow ? '#fbbf24' : '#34d399',
                          border: `1px solid ${isOut ? '#ef4444' : isLow ? '#f59e0b' : '#10b981'}`
                        }}>
                          <span>{Number(p.current_stock).toFixed(p.allow_decimals ? 2 : 0)} {p.unit_name}</span>
                          <span style={{ fontSize: 10, opacity: 0.85, textTransform: 'uppercase' }}>
                            {isOut ? '• Out' : isLow ? '• Low' : '• In Stock'}
                          </span>
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '4px 10px',
                          borderRadius: 6,
                          fontWeight: 700,
                          fontSize: 12,
                          background: totalSold > 0 ? 'rgba(56, 189, 248, 0.15)' : 'rgba(148, 163, 184, 0.1)',
                          color: totalSold > 0 ? '#38bdf8' : 'var(--text-secondary)',
                          border: `1px solid ${totalSold > 0 ? 'rgba(56, 189, 248, 0.35)' : 'var(--border-strong)'}`
                        }}>
                          {totalSold.toFixed(p.allow_decimals ? 2 : 0)} {p.unit_name}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                        <button
                          onClick={() => {
                            setEditingProduct(p);
                            setShowProductModal(true);
                          }}
                          style={{
                            background: 'var(--bg-card)',
                            border: '1px solid #334155',
                            color: '#38bdf8',
                            padding: '4px 8px',
                            borderRadius: 4,
                            cursor: 'pointer',
                            fontSize: 12,
                            fontWeight: 600
                          }}
                        >
                          Edit
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------
          TAB 2: TRACEABLE MOVEMENTS LEDGER
          --------------------------------------------------------------------- */}
      {activeTab === 'movements' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 20 }}>
          <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
            <select
              value={selectedMovementType}
              onChange={e => setSelectedMovementType(e.target.value)}
              style={{
                background: 'var(--bg-surface)',
                border: '1px solid #334155',
                color: 'white',
                padding: '8px 12px',
                borderRadius: 6
              }}
            >
              <option value="">All Movement Types</option>
              <option value="SALE">Sales (Deductions)</option>
              <option value="PURCHASE">Purchases (Inward)</option>
              <option value="OPENING">Opening Stock</option>
              <option value="ADJUSTMENT">Stock Adjustments</option>
              <option value="DAMAGED">Damaged Stock</option>
              <option value="EXPIRED">Expired Stock</option>
              <option value="SALE_RETURN">Customer Returns</option>
            </select>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-surface)', border: '1px solid #1e293b', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-input)', borderBottom: '1px solid #2d3748', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '12px 16px' }}>Date / Time</th>
                  <th style={{ padding: '12px 16px' }}>Product</th>
                  <th style={{ padding: '12px 16px' }}>Type</th>
                  <th style={{ padding: '12px 16px' }}>Reference #</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Qty In</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Qty Out</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Balance After</th>
                  <th style={{ padding: '12px 16px' }}>User / Staff</th>
                </tr>
              </thead>
              <tbody>
                {movements.map(m => (
                  <tr key={m.id} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '12px 16px', color: 'var(--text-secondary)', fontSize: 12 }}>
                      {new Date(m.created_at).toLocaleString()}
                    </td>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: 'white' }}>
                      <div>{m.product_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{m.barcode}</div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        padding: '2px 8px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 700,
                        background: m.movement_type === 'SALE' ? 'rgba(239, 68, 68, 0.15)' :
                                   m.movement_type === 'PURCHASE' ? 'rgba(16, 185, 129, 0.15)' : 'var(--bg-card)',
                        color: m.movement_type === 'SALE' ? '#f87171' :
                               m.movement_type === 'PURCHASE' ? '#34d399' : 'var(--text-soft)'
                      }}>
                        {m.movement_type}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'JetBrains Mono', fontSize: 12, color: 'var(--text-soft)' }}>
                      {m.reference_id || '—'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono', color: '#34d399' }}>
                      {Number(m.quantity_in) > 0 ? `+${Number(m.quantity_in).toFixed(2)}` : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono', color: '#f87171' }}>
                      {Number(m.quantity_out) > 0 ? `-${Number(m.quantity_out).toFixed(2)}` : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'JetBrains Mono', fontWeight: 700, color: 'white' }}>
                      {Number(m.balance_after).toFixed(2)}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-secondary)' }}>
                      {m.user_name || 'System'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------
          TAB 3: LOW STOCK & REORDER ALERTS
          --------------------------------------------------------------------- */}
      {activeTab === 'lowstock' && (
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: 20 }}>
          <div style={{ flex: 1, overflowY: 'auto', background: 'var(--bg-surface)', border: '1px solid #1e293b', borderRadius: 8 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--bg-input)', borderBottom: '1px solid #2d3748', color: 'var(--text-secondary)' }}>
                  <th style={{ padding: '12px 16px' }}>Product</th>
                  <th style={{ padding: '12px 16px' }}>Urgency</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Current Stock</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Min Stock Threshold</th>
                  <th style={{ padding: '12px 16px', textAlign: 'center' }}>Suggested Reorder</th>
                  <th style={{ padding: '12px 16px' }}>Supplier</th>
                </tr>
              </thead>
              <tbody>
                {lowStockList.map((item, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #1e293b' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 600, color: 'white' }}>
                      <div>{item.name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Barcode: {item.barcode}</div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: 4,
                        fontSize: 11,
                        fontWeight: 700,
                        background: item.urgency_level === 'OUT_OF_STOCK' ? '#450a0a' : '#451a03',
                        color: item.urgency_level === 'OUT_OF_STOCK' ? '#fca5a5' : '#fde047'
                      }}>
                        {item.urgency_level.replace('_', ' ')}
                      </span>
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', fontFamily: 'JetBrains Mono', fontWeight: 700, color: '#f87171' }}>
                      {Number(item.current_stock).toFixed(0)} {item.unit_name}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', fontFamily: 'JetBrains Mono', color: 'var(--text-secondary)' }}>
                      {Number(item.min_stock_level).toFixed(0)} {item.unit_name}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'center', fontFamily: 'JetBrains Mono', fontWeight: 700, color: '#38bdf8' }}>
                      +{Number(item.suggested_reorder_quantity).toFixed(0)} {item.unit_name}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text-soft)' }}>
                      <div>{item.supplier_name || 'Direct Procurement'}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.supplier_phone}</div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------
          MODAL: ADD / EDIT PRODUCT
          --------------------------------------------------------------------- */}
      {showProductModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div className="modal-title">{editingProduct ? 'Edit Product' : 'Add New Product'}</div>
                {stockFieldConfig && (
                  <span style={{ fontSize: 11, background: 'var(--bg-card)', color: 'var(--text-secondary)', padding: '2px 8px', borderRadius: 4, display: 'flex', alignItems: 'center', gap: 4 }}>
                    <SlidersHorizontal size={11} color="#10b981" /> Custom Fields Config Active
                  </span>
                )}
              </div>
              <button
                onClick={() => setShowProductModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveProduct}>
              <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
                {/* Product Name is always fixed and required */}
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                    Product Full Name <span style={{ color: '#ef4444' }}>*</span>
                  </label>
                  <input
                    name="pName"
                    defaultValue={editingProduct?.name || ''}
                    required
                    placeholder="e.g. Farm Fresh Organic Butter 200g"
                    style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 8 }}
                  />
                </div>

                {/* Barcode & SKU Row */}
                {(isFieldEnabled('barcode') || isFieldEnabled('sku')) && (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: isFieldEnabled('barcode') && isFieldEnabled('sku') ? '1fr 1fr' : '1fr',
                    gap: 12
                  }}>
                    {isFieldEnabled('barcode') && (
                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                          Barcode {isFieldRequired('barcode') ? <span style={{ color: '#ef4444' }}>*</span> : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(Optional)</span>}
                        </label>
                        <input
                          name="barcode"
                          defaultValue={editingProduct?.barcode || ''}
                          required={isFieldRequired('barcode')}
                          placeholder={isFieldRequired('barcode') ? 'e.g. 890103000021' : 'Auto-generated if blank'}
                          style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 8 }}
                        />
                      </div>
                    )}

                    {isFieldEnabled('sku') && (
                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                          SKU Code {isFieldRequired('sku') ? <span style={{ color: '#ef4444' }}>*</span> : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(Optional)</span>}
                        </label>
                        <input
                          name="sku"
                          defaultValue={editingProduct?.sku || ''}
                          required={isFieldRequired('sku')}
                          placeholder={isFieldRequired('sku') ? 'e.g. SKU-PROD-021' : 'Auto-generated if blank'}
                          style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 8 }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Short Name & Category Row */}
                {(isFieldEnabled('shortName') || isFieldEnabled('category')) && (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: isFieldEnabled('shortName') && isFieldEnabled('category') ? '1fr 1fr' : '1fr',
                    gap: 12
                  }}>
                    {isFieldEnabled('shortName') && (
                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                          Short Name (POS button) {isFieldRequired('shortName') ? <span style={{ color: '#ef4444' }}>*</span> : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(Optional)</span>}
                        </label>
                        <input
                          name="shortName"
                          defaultValue={editingProduct?.short_name || ''}
                          required={isFieldRequired('shortName')}
                          placeholder="e.g. Butter 200g"
                          style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 8 }}
                        />
                      </div>
                    )}

                    {isFieldEnabled('category') && (
                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                          Category {isFieldRequired('category') ? <span style={{ color: '#ef4444' }}>*</span> : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(Optional)</span>}
                        </label>
                        <select
                          name="categoryId"
                          defaultValue={editingProduct?.category_id || ''}
                          required={isFieldRequired('category')}
                          style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 8 }}
                        >
                          <option value="">None</option>
                          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {/* Unit & Supplier Row */}
                {(isFieldEnabled('unit') || isFieldEnabled('supplier')) && (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: isFieldEnabled('unit') && isFieldEnabled('supplier') ? '1fr 1fr' : '1fr',
                    gap: 12
                  }}>
                    {isFieldEnabled('unit') && (
                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                          Unit {isFieldRequired('unit') ? <span style={{ color: '#ef4444' }}>*</span> : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(Optional)</span>}
                        </label>
                        <select
                          name="unitId"
                          defaultValue={editingProduct?.unit_id || 'PCS'}
                          required={isFieldRequired('unit')}
                          style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 8 }}
                        >
                          {units.map(u => <option key={u.id} value={u.id}>{u.name} ({u.id})</option>)}
                        </select>
                      </div>
                    )}

                    {isFieldEnabled('supplier') && (
                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                          Supplier {isFieldRequired('supplier') ? <span style={{ color: '#ef4444' }}>*</span> : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(Optional)</span>}
                        </label>
                        <select
                          name="supplierId"
                          defaultValue={editingProduct?.supplier_id || ''}
                          required={isFieldRequired('supplier')}
                          style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 8 }}
                        >
                          <option value="">None</option>
                          {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                        </select>
                      </div>
                    )}
                  </div>
                )}

                {/* Pricing Fields Row: Cost, Selling/Net, MRP, GST Tax */}
                {(isFieldEnabled('purchasePrice') || isFieldEnabled('sellingPrice') || isFieldEnabled('mrp') || isFieldEnabled('taxRate')) && (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(${[
                      isFieldEnabled('purchasePrice'),
                      isFieldEnabled('sellingPrice'),
                      isFieldEnabled('mrp'),
                      isFieldEnabled('taxRate')
                    ].filter(Boolean).length}, 1fr)`,
                    gap: 10
                  }}>
                    {isFieldEnabled('purchasePrice') && (
                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                          Cost (₹) {isFieldRequired('purchasePrice') ? <span style={{ color: '#ef4444' }}>*</span> : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(Optional)</span>}
                        </label>
                        <input
                          name="purchasePrice"
                          type="number"
                          step="0.01"
                          defaultValue={editingProduct?.purchase_price ?? ''}
                          required={isFieldRequired('purchasePrice')}
                          placeholder="0.00"
                          style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 8 }}
                        />
                      </div>
                    )}

                    {isFieldEnabled('sellingPrice') && (
                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                          Selling / Net (₹) {isFieldRequired('sellingPrice') ? <span style={{ color: '#ef4444' }}>*</span> : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(Optional)</span>}
                        </label>
                        <input
                          name="sellingPrice"
                          type="number"
                          step="0.01"
                          defaultValue={editingProduct?.selling_price ?? ''}
                          required={isFieldRequired('sellingPrice')}
                          placeholder="0.00"
                          style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 8 }}
                        />
                      </div>
                    )}

                    {isFieldEnabled('mrp') && (
                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                          MRP (₹) {isFieldRequired('mrp') ? <span style={{ color: '#ef4444' }}>*</span> : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(Optional)</span>}
                        </label>
                        <input
                          name="mrp"
                          type="number"
                          step="0.01"
                          defaultValue={editingProduct?.mrp ?? ''}
                          required={isFieldRequired('mrp')}
                          placeholder="0.00"
                          style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 8 }}
                        />
                      </div>
                    )}

                    {isFieldEnabled('taxRate') && (
                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                          GST Tax % {isFieldRequired('taxRate') ? <span style={{ color: '#ef4444' }}>*</span> : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(Optional)</span>}
                        </label>
                        <input
                          name="taxRate"
                          type="number"
                          step="0.01"
                          defaultValue={editingProduct?.tax_rate ?? 5}
                          required={isFieldRequired('taxRate')}
                          placeholder="0"
                          style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 8 }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Initial Opening Stock (New Product only) */}
                {!editingProduct && isFieldEnabled('openingStock') && (
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                      Initial Opening Stock {isFieldRequired('openingStock') ? <span style={{ color: '#ef4444' }}>*</span> : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(Optional)</span>}
                    </label>
                    <input
                      name="openingStock"
                      type="number"
                      defaultValue="50"
                      required={isFieldRequired('openingStock')}
                      style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 8 }}
                    />
                  </div>
                )}

                {/* Min & Max Stock Thresholds */}
                {(isFieldEnabled('minStockLevel') || isFieldEnabled('maxStockLevel')) && (
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: isFieldEnabled('minStockLevel') && isFieldEnabled('maxStockLevel') ? '1fr 1fr' : '1fr',
                    gap: 12
                  }}>
                    {isFieldEnabled('minStockLevel') && (
                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                          Min Stock Level (Alert) {isFieldRequired('minStockLevel') ? <span style={{ color: '#ef4444' }}>*</span> : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(Optional)</span>}
                        </label>
                        <input
                          name="minStockLevel"
                          type="number"
                          defaultValue={editingProduct?.min_stock_level ?? 5}
                          required={isFieldRequired('minStockLevel')}
                          style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 8 }}
                        />
                      </div>
                    )}

                    {isFieldEnabled('maxStockLevel') && (
                      <div>
                        <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>
                          Max Stock Level (Reorder) {isFieldRequired('maxStockLevel') ? <span style={{ color: '#ef4444' }}>*</span> : <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>(Optional)</span>}
                        </label>
                        <input
                          name="maxStockLevel"
                          type="number"
                          defaultValue={editingProduct?.max_stock_level ?? 100}
                          required={isFieldRequired('maxStockLevel')}
                          style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 8 }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Expiry Tracking Checkbox */}
                {isFieldEnabled('hasExpiry') && (
                  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-soft)', fontSize: 13, cursor: 'pointer' }}>
                      <input
                        name="hasExpiry"
                        type="checkbox"
                        defaultChecked={editingProduct?.has_expiry || false}
                        style={{ accentColor: '#10b981' }}
                      />
                      Enable Batch & Expiry Date Tracking (FEFO)
                    </label>
                  </div>
                )}
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setShowProductModal(false)}
                  style={{ background: 'transparent', border: '1px solid #334155', color: 'var(--text-secondary)', padding: '8px 16px', borderRadius: 6 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ background: '#2563eb', color: 'white', border: 'none', padding: '8px 18px', borderRadius: 6, fontWeight: 700 }}
                >
                  Save Product
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------
          MODAL: STOCK ADJUSTMENT
          --------------------------------------------------------------------- */}
      {showAdjustmentModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 500 }}>
            <div className="modal-header">
              <div className="modal-title">Stock Adjustment (Audit Trail)</div>
              <button
                onClick={() => setShowAdjustmentModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveAdjustment}>
              <div className="modal-body">
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Select Product *</label>
                  <select
                    value={adjProductId}
                    onChange={e => {
                      setAdjProductId(e.target.value);
                      const prod = products.find(p => p.id === e.target.value);
                      if (prod) setAdjNewQty(Number(prod.current_stock));
                    }}
                    style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 8 }}
                  >
                    {products.map(p => (
                      <option key={p.id} value={p.id}>
                        {p.name} (Current: {p.current_stock} {p.unit_name})
                      </option>
                    ))}
                  </select>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Adjustment Type</label>
                    <select
                      value={adjType}
                      onChange={e => setAdjType(e.target.value as any)}
                      style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 8 }}
                    >
                      <option value="PHYSICAL_COUNT">Physical Inventory Count</option>
                      <option value="DAMAGED">Damaged Goods Write-off</option>
                      <option value="EXPIRED">Expired Stock Disposal</option>
                      <option value="CORRECTION">Manual Count Correction</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>New Actual Quantity *</label>
                    <input
                      type="number"
                      step="0.01"
                      value={adjNewQty}
                      onChange={e => setAdjNewQty(parseFloat(e.target.value) || 0)}
                      required
                      style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 8 }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Mandatory Reason *</label>
                  <textarea
                    value={adjReason}
                    onChange={e => setAdjReason(e.target.value)}
                    required
                    placeholder="Explain why this adjustment is being performed for audit logs..."
                    rows={3}
                    style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 8 }}
                  />
                </div>
              </div>

              <div className="modal-footer">
                <button
                  type="button"
                  onClick={() => setShowAdjustmentModal(false)}
                  style={{ background: 'transparent', border: '1px solid #334155', color: 'var(--text-secondary)', padding: '8px 16px', borderRadius: 6 }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ background: '#e11d48', color: 'white', border: 'none', padding: '8px 18px', borderRadius: 6, fontWeight: 700 }}
                >
                  Post Adjustment
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------
          MODAL: GOODS PURCHASE / INWARD RECEIPT
          --------------------------------------------------------------------- */}
      {showPurchaseModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 720 }}>
            <div className="modal-header">
              <div className="modal-title">Supplier Goods Receipt / Purchase Inward</div>
              <button
                onClick={() => setShowPurchaseModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Supplier *</label>
                  <select
                    value={purchaseSupplierId}
                    onChange={e => setPurchaseSupplierId(e.target.value)}
                    style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 8 }}
                  >
                    {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Supplier Invoice #</label>
                  <input
                    value={purchaseInvoiceNum}
                    onChange={e => setPurchaseInvoiceNum(e.target.value)}
                    placeholder="e.g. SUP-INV-9921"
                    style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 8 }}
                  />
                </div>
              </div>

              {/* Add item dropdown */}
              <div style={{ borderTop: '1px solid #2d3748', paddingTop: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'white', marginBottom: 8 }}>Add Inward Item:</div>
                <select
                  onChange={e => {
                    if (e.target.value) {
                      handleAddPurchaseLine(e.target.value);
                      e.target.value = '';
                    }
                  }}
                  style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 8 }}
                >
                  <option value="">-- Choose Product to Receive --</option>
                  {products.map(p => (
                    <option key={p.id} value={p.id}>{p.name} (Stock: {p.current_stock})</option>
                  ))}
                </select>
              </div>

              {/* Items Table */}
              {purchaseItems.length > 0 && (
                <div style={{ marginTop: 14 }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)' }}>
                        <th style={{ padding: 8 }}>Product</th>
                        <th style={{ padding: 8 }}>Inward Qty</th>
                        <th style={{ padding: 8 }}>Unit Rate (₹)</th>
                        <th style={{ padding: 8 }}>Batch #</th>
                        <th style={{ padding: 8 }}>Expiry Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {purchaseItems.map((item, idx) => {
                        const prod = products.find(p => p.id === item.productId);
                        return (
                          <tr key={idx} style={{ borderBottom: '1px solid #2d3748' }}>
                            <td style={{ padding: 8, color: 'white', fontWeight: 600 }}>{prod?.name}</td>
                            <td style={{ padding: 8 }}>
                              <input
                                type="number"
                                value={item.quantity}
                                onChange={e => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setPurchaseItems(prev => prev.map((p, i) => i === idx ? { ...p, quantity: val } : p));
                                }}
                                style={{ width: 60, background: 'var(--bg-input)', border: '1px solid #334155', color: 'white', padding: 4 }}
                              />
                            </td>
                            <td style={{ padding: 8 }}>
                              <input
                                type="number"
                                value={item.purchaseRate}
                                onChange={e => {
                                  const val = parseFloat(e.target.value) || 0;
                                  setPurchaseItems(prev => prev.map((p, i) => i === idx ? { ...p, purchaseRate: val } : p));
                                }}
                                style={{ width: 70, background: 'var(--bg-input)', border: '1px solid #334155', color: 'white', padding: 4 }}
                              />
                            </td>
                            <td style={{ padding: 8 }}>
                              <input
                                type="text"
                                value={item.batchNumber || ''}
                                onChange={e => {
                                  const val = e.target.value;
                                  setPurchaseItems(prev => prev.map((p, i) => i === idx ? { ...p, batchNumber: val } : p));
                                }}
                                style={{ width: 80, background: 'var(--bg-input)', border: '1px solid #334155', color: 'white', padding: 4 }}
                              />
                            </td>
                            <td style={{ padding: 8 }}>
                              <input
                                type="date"
                                value={item.expiryDate || ''}
                                onChange={e => {
                                  const val = e.target.value;
                                  setPurchaseItems(prev => prev.map((p, i) => i === idx ? { ...p, expiryDate: val } : p));
                                }}
                                style={{ background: 'var(--bg-input)', border: '1px solid #334155', color: 'white', padding: 4 }}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                onClick={() => setShowPurchaseModal(false)}
                style={{ background: 'transparent', border: '1px solid #334155', color: 'var(--text-secondary)', padding: '8px 16px', borderRadius: 6 }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSavePurchaseOrder}
                style={{ background: '#059669', color: 'white', border: 'none', padding: '8px 18px', borderRadius: 6, fontWeight: 700 }}
              >
                Confirm Inward & Add Stock
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ---------------------------------------------------------------------
          MODAL: BARCODE STICKER SHEET GENERATOR
          --------------------------------------------------------------------- */}
      {showBarcodeSheetModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 720 }}>
            <div className="modal-header">
              <div className="modal-title">Barcode Price Label Sticker Generator</div>
              <button
                onClick={() => setShowBarcodeSheetModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div className="modal-body" style={{ maxHeight: '70vh', overflowY: 'auto' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12 }}>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Select Product</label>
                  <select
                    value={barcodeProduct?.id || ''}
                    onChange={e => {
                      const prod = products.find(p => p.id === e.target.value);
                      setBarcodeProduct(prod || null);
                    }}
                    style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 8 }}
                  >
                    {products.map(p => (
                      <option key={p.id} value={p.id}>{p.name} ({p.barcode})</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 4 }}>Labels on Sheet</label>
                  <select
                    value={barcodeLabelCount}
                    onChange={e => setBarcodeLabelCount(parseInt(e.target.value, 10))}
                    style={{ width: '100%', background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, color: 'white', padding: 8 }}
                  >
                    <option value={12}>12 Labels</option>
                    <option value={24}>24 Labels (Standard A4)</option>
                    <option value={30}>30 Labels</option>
                    <option value={48}>48 Mini Labels</option>
                  </select>
                </div>
              </div>

              {barcodeProduct && (
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'white', marginBottom: 8 }}>
                    Printable Sticker Sheet Preview:
                  </div>

                  <div style={{
                    background: '#ffffff',
                    color: '#000000',
                    padding: 16,
                    borderRadius: 8,
                    display: 'grid',
                    gridTemplateColumns: 'repeat(3, 1fr)',
                    gap: 10,
                    maxHeight: 380,
                    overflowY: 'auto'
                  }}>
                    {Array.from({ length: barcodeLabelCount }).map((_, i) => (
                      <div
                        key={i}
                        style={{
                          border: '1px dashed #94a3b8',
                          padding: '8px 10px',
                          borderRadius: 4,
                          textAlign: 'center',
                          fontFamily: 'sans-serif'
                        }}
                      >
                        <div style={{ fontSize: 9, fontWeight: 800, textTransform: 'uppercase', color: '#166534' }}>
                          FreshMart Supermarket
                        </div>
                        <div style={{
                          fontSize: 11,
                          fontWeight: 700,
                          lineHeight: 1.2,
                          marginTop: 2,
                          maxHeight: 28,
                          overflow: 'hidden'
                        }}>
                          {barcodeProduct.name}
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: 6, alignItems: 'baseline', marginTop: 4 }}>
                          <span style={{ fontSize: 10, textDecoration: 'line-through', color: 'var(--text-muted)' }}>
                            MRP: ₹{Number(barcodeProduct.mrp).toFixed(2)}
                          </span>
                          <span style={{ fontSize: 13, fontWeight: 800, color: '#000' }}>
                            ₹{Number(barcodeProduct.selling_price).toFixed(2)}
                          </span>
                        </div>
                        {/* High-contrast barcode pattern */}
                        <div style={{
                          height: 26,
                          margin: '4px auto 2px',
                          background: 'repeating-linear-gradient(90deg, #000, #000 2px, #fff 2px, #fff 4px, #000 4px, #000 7px, #fff 7px, #fff 9px)',
                          width: '85%'
                        }} />
                        <div style={{ fontFamily: 'monospace', fontSize: 10, letterSpacing: 1 }}>
                          {barcodeProduct.barcode}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                onClick={() => setShowBarcodeSheetModal(false)}
                style={{ background: 'transparent', border: '1px solid #334155', color: 'var(--text-secondary)', padding: '8px 16px', borderRadius: 6 }}
              >
                Close
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                style={{
                  background: '#10b981',
                  color: '#062417',
                  border: 'none',
                  padding: '8px 18px',
                  borderRadius: 6,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  cursor: 'pointer'
                }}
              >
                <Printer size={16} />
                <span>Print Sticker Sheet</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------
          MODAL: OVERALL CLEAR STOCK & INVENTORY
          --------------------------------------------------------------------- */}
      {showClearStockModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#f87171' }}>
                <Trash2 size={20} />
                <span>Overall Stock & Inventory Clear</span>
              </div>
              <button
                onClick={() => setShowClearStockModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <p style={{ fontSize: 13, color: 'var(--text-soft)', lineHeight: 1.5 }}>
                Select an option below to clear or reset stock inventory for <strong>Bharathi Homelings</strong>:
              </p>

              {/* Option 1: Zero out all stock levels */}
              <div style={{
                background: 'var(--bg-card)',
                border: '1px solid #334155',
                borderRadius: 8,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 8
              }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#38bdf8' }}>
                  Option 1: Clear All Stock Levels to 0.00 (Zero Out)
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Sets available stock for all products across the catalog to 0.00 units and clears stock adjustments & inward movement ledgers. Product names, barcodes, categories, and prices are <strong>preserved</strong>.
                </div>
                <button
                  type="button"
                  id="btn-confirm-zero-stock"
                  disabled={clearingStock}
                  onClick={() => handleOverallClearStock('zero')}
                  style={{
                    alignSelf: 'flex-start',
                    background: '#0284c7',
                    color: 'white',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: 6,
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: clearingStock ? 'not-allowed' : 'pointer',
                    marginTop: 4
                  }}
                >
                  {clearingStock ? 'Processing...' : 'Reset All Stock to 0'}
                </button>
              </div>

              {/* Option 2: Total Wipe of Products & Inventory */}
              <div style={{
                background: '#200e12',
                border: '1px solid #dc2626',
                borderRadius: 8,
                padding: 16,
                display: 'flex',
                flexDirection: 'column',
                gap: 8
              }}>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#fca5a5' }}>
                  Option 2: Delete All Products & Inventory Completely
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Permanently deletes all products from the catalog along with batches and movement ledgers. The catalog will be completely empty for a fresh product import.
                </div>
                <button
                  type="button"
                  id="btn-confirm-delete-products"
                  disabled={clearingStock}
                  onClick={() => handleOverallClearStock('delete')}
                  style={{
                    alignSelf: 'flex-start',
                    background: '#dc2626',
                    color: 'white',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: 6,
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: clearingStock ? 'not-allowed' : 'pointer',
                    marginTop: 4
                  }}
                >
                  {clearingStock ? 'Deleting...' : 'Delete All Products & Stock'}
                </button>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                onClick={() => setShowClearStockModal(false)}
                style={{
                  background: 'transparent',
                  border: '1px solid #334155',
                  color: 'var(--text-secondary)',
                  padding: '8px 16px',
                  borderRadius: 6,
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
