import React, { useState, useEffect, useRef } from 'react';
import { usePOS } from '../../context/POSContext';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import { Product, Category, Customer, SaleSummary, StoreSettings } from '../../types';
import {
  Barcode, Search, Plus, Minus, Trash2, CreditCard,
  Banknote, Smartphone, PauseCircle, PlayCircle, Printer,
  User, CheckCircle2, AlertTriangle, X, RefreshCw, Download, FileText, Check,
  ShoppingCart
} from 'lucide-react';


export const BillingModule: React.FC = () => {
  const {
    cart, selectedCustomer, setSelectedCustomer,
    addItemToCart, updateItemQuantity, updateItemDiscount,
    removeItemFromCart, clearCart, subtotal, discountTotal,
    taxTotal, roundOff, grandTotal, totalItemsCount,
    activeHeldBillId, restoreHeldCart, playBeep
  } = usePOS();

  const { user } = useAuth();

  // State
  const [products, setProducts] = useState<Product[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [barcodeInput, setBarcodeInput] = useState('');
  const [isScanning, setIsScanning] = useState(false);
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [mobileViewTab, setMobileViewTab] = useState<'catalog' | 'cart'>('catalog');


  // Modals
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showHeldBillsModal, setShowHeldBillsModal] = useState(false);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showRecentBillsModal, setShowRecentBillsModal] = useState(false);

  // Payment state
  const [selectedPaymentMethod, setSelectedPaymentMethod] = useState<'CASH' | 'CARD' | 'UPI'>('CASH');
  const [tenderedAmount, setTenderedAmount] = useState<number>(0);
  const [isSubmittingSale, setIsSubmittingSale] = useState(false);
  const [saleError, setSaleError] = useState<string | null>(null);

  // Receipt state
  const [currentReceipt, setCurrentReceipt] = useState<{ sale: SaleSummary; store: StoreSettings } | null>(null);
  const [receiptWidth, setReceiptWidth] = useState<'200' | '58mm'>('200');
  const [feedAnimKey, setFeedAnimKey] = useState(0);
  const [autoDownloadSlip, setAutoDownloadSlip] = useState<boolean>(() => {
    return localStorage.getItem('bharathi_auto_download_receipt') !== 'false';
  });
  const [saveToast, setSaveToast] = useState<string | null>(null);

  const triggerFeedAnimation = () => {
    setFeedAnimKey(k => k + 1);
  };

  const generateReceiptText = (receipt: { sale: SaleSummary; store: StoreSettings }) => {
    const { sale, store } = receipt;
    const line = '------------------------------------------';
    const dblLine = '==========================================';
    const padCenter = (text: string, width = 42) => {
      const p = Math.max(0, Math.floor((width - text.length) / 2));
      return ' '.repeat(p) + text;
    };
    const padRow = (left: string, right: string, width = 42) => {
      const space = Math.max(1, width - left.length - right.length);
      return left + ' '.repeat(space) + right;
    };

    const lines: string[] = [
      dblLine,
      padCenter((store.store_name || 'BHARATHI HOMELINGS').toUpperCase()),
      padCenter('SUPERMARKET & HOME NEEDS'),
      store.address ? padCenter(store.address) : '',
      store.phone ? padCenter(`Tel: ${store.phone}`) : '',
      (store.enable_gst && (store.gst_number || store.tax_number))
        ? padCenter(`GSTIN: ${store.gst_number || store.tax_number}`)
        : '',
      (store.enable_fssai && store.fssai_number)
        ? padCenter(`FSSAI Lic: ${store.fssai_number}`)
        : '',
      line,
      padRow(`Invoice: ${sale.invoice_number}`, `Date: ${new Date(sale.created_at).toLocaleDateString()}`),
      padRow(`Cashier: ${sale.cashier_name || 'Staff'}`, `Time: ${new Date(sale.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`),
      `Customer: ${sale.customer_name || 'Walk-in Customer'}`,
      line,
      'Item                      Qty    Rate     Total',
      line,
    ];

    sale.items?.forEach((item: any) => {
      const rawName = item.product_name || 'Item';
      const name = rawName.length > 22 ? rawName.substring(0, 20) + '..' : rawName.padEnd(22, ' ');
      const qty = String(item.quantity).padStart(5, ' ');
      const rate = Number(item.unit_price).toFixed(2).padStart(8, ' ');
      const total = Number(item.line_total).toFixed(2).padStart(9, ' ');
      lines.push(`${name} ${qty} ${rate} ${total}`);
    });

    lines.push(
      line,
      padRow('Subtotal:', `₹${Number(sale.subtotal).toFixed(2)}`)
    );

    if (Number(sale.discount_amount) > 0) {
      lines.push(padRow('Discount:', `-₹${Number(sale.discount_amount).toFixed(2)}`));
    }
    lines.push(padRow('Tax (Included):', `₹${Number(sale.tax_amount || 0).toFixed(2)}`));
    if (Number(sale.round_off) !== 0) {
      const sign = Number(sale.round_off) > 0 ? '+' : '';
      lines.push(padRow('Round Off:', `${sign}₹${Number(sale.round_off).toFixed(2)}`));
    }
    lines.push(
      dblLine,
      padRow('GRAND TOTAL:', `₹${Number(sale.grand_total).toFixed(2)}`),
      dblLine
    );

    // Payments
    sale.payments?.forEach((pmt: any) => {
      lines.push(padRow(`Paid via ${pmt.payment_method}:`, `₹${Number(pmt.amount).toFixed(2)}`));
      if (pmt.payment_method === 'CASH' && Number(pmt.tendered_amount) > 0) {
        lines.push(padRow('Cash Tendered:', `₹${Number(pmt.tendered_amount).toFixed(2)}`));
        lines.push(padRow('Change Returned:', `₹${Number(pmt.change_amount).toFixed(2)}`));
      }
    });

    lines.push(
      line,
      padCenter(store.receipt_header || 'THANK YOU FOR SHOPPING WITH US!'),
      padCenter(store.receipt_footer || 'PLEASE VISIT US AGAIN'),
      dblLine
    );

    return lines.filter(l => l !== '').join('\r\n');
  };

  const handleDownloadReceipt = (receiptToDownload = currentReceipt) => {
    if (!receiptToDownload) return;
    try {
      const text = generateReceiptText(receiptToDownload);
      const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `Bharathi_Receipt_${receiptToDownload.sale.invoice_number}.txt`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      console.error('Failed to download receipt:', err);
    }
  };

  const handleOkToSave = () => {
    if (!currentReceipt) return;

    if (autoDownloadSlip) {
      handleDownloadReceipt(currentReceipt);
    }

    playBeep('success');
    setSaveToast(`✓ Bill #${currentReceipt.sale.invoice_number} saved successfully!`);
    setTimeout(() => setSaveToast(null), 3500);

    setShowReceiptModal(false);
    barcodeInputRef.current?.focus();
  };

  // Held bills state
  const [heldBillsList, setHeldBillsList] = useState<any[]>([]);
  const [recentBillsList, setRecentBillsList] = useState<any[]>([]);

  // Input ref for barcode autofocus
  const barcodeInputRef = useRef<HTMLInputElement>(null);

  // Focus barcode input on mount and after cart changes
  useEffect(() => {
    barcodeInputRef.current?.focus();
  }, [cart]);

  // Load initial products and categories
  useEffect(() => {
    loadCategories();
    loadProducts();
  }, [selectedCategory]);

  const loadCategories = async () => {
    try {
      const res = await api.products.getCategories();
      setCategories(res.categories);
    } catch (err) {
      console.error('Failed to load categories:', err);
    }
  };

  const loadProducts = async (query?: string) => {
    setLoadingProducts(true);
    try {
      const res = await api.billing.searchProducts({
        query: query || searchQuery,
        categoryId: selectedCategory || undefined
      });
      setProducts(res.products);
    } catch (err) {
      console.error('Failed to load products:', err);
    } finally {
      setLoadingProducts(false);
    }
  };

  // Keyboard Shortcuts (F1 - F10, ESC)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if user is inside an open modal input (except ESC)
      if (e.key === 'Escape') {
        setShowPaymentModal(false);
        setShowHeldBillsModal(false);
        setShowReceiptModal(false);
        setShowCustomerModal(false);
        setShowRecentBillsModal(false);
        barcodeInputRef.current?.focus();
        return;
      }

      if (showReceiptModal) {
        if (e.key === 'Enter') {
          e.preventDefault();
          handleOkToSave();
          return;
        }
        return;
      }

      if (showPaymentModal || showHeldBillsModal || showCustomerModal || showRecentBillsModal) {
        return;
      }

      switch (e.key) {
        case 'F1':
          e.preventDefault();
          if (cart.length > 0) {
            if (window.confirm('Clear current bill and start a new bill?')) {
              clearCart();
            }
          }
          barcodeInputRef.current?.focus();
          break;
        case 'F2':
          e.preventDefault();
          barcodeInputRef.current?.focus();
          barcodeInputRef.current?.select();
          break;
        case 'F3':
          e.preventDefault();
          setShowCustomerModal(true);
          break;
        case 'F4':
          e.preventDefault();
          handleHoldBill();
          break;
        case 'F5':
          e.preventDefault();
          openHeldBills();
          break;
        case 'F6':
          e.preventDefault();
          if (cart.length > 0) {
            openPaymentModal();
          }
          break;
        case 'F9':
          e.preventDefault();
          if (cart.length > 0) {
            removeItemFromCart(cart[cart.length - 1].product.id);
          }
          break;
        case 'F10':
          e.preventDefault();
          if (cart.length > 0) {
            openPaymentModal();
          }
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, showPaymentModal, showHeldBillsModal, showReceiptModal, showCustomerModal, showRecentBillsModal, currentReceipt, autoDownloadSlip]);

  // Barcode Scanner submission handler
  const handleBarcodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const barcode = barcodeInput.trim();
    if (!barcode) return;

    setIsScanning(true);
    try {
      const res = await api.billing.searchProducts({ barcode });
      if (res.products && res.products.length > 0) {
        const found = res.products[0];
        addItemToCart(found, 1);
        setBarcodeInput('');
      } else {
        // If not exact barcode, perform search
        const searchRes = await api.billing.searchProducts({ query: barcode });
        if (searchRes.products && searchRes.products.length === 1) {
          addItemToCart(searchRes.products[0], 1);
          setBarcodeInput('');
        } else if (searchRes.products && searchRes.products.length > 1) {
          setProducts(searchRes.products);
          setSearchQuery(barcode);
        } else {
          playBeep('error');
          alert(`Product not found for barcode or query: "${barcode}"`);
        }
      }
    } catch (err: any) {
      playBeep('error');
      alert(`Product search error: ${err.message}`);
    } finally {
      setIsScanning(false);
      barcodeInputRef.current?.focus();
    }
  };

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    if (val.length > 1 || val.length === 0) {
      loadProducts(val);
    }
  };

  // Payment flow
  const openPaymentModal = () => {
    if (cart.length === 0) return;
    if (!tenderedAmount || tenderedAmount < grandTotal) {
      setTenderedAmount(grandTotal);
    }
    setSelectedPaymentMethod('CASH');
    setSaleError(null);
    setShowPaymentModal(true);
  };

  const handleCompleteSale = async () => {
    if (cart.length === 0) return;
    setIsSubmittingSale(true);
    setSaleError(null);

    // Client idempotency token to prevent double submissions
    const clientTxnId = `TXN-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

    try {
      const payload = {
        clientTxnId,
        customerId: selectedCustomer.id,
        items: cart.map(item => ({
          productId: item.product.id,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          mrp: item.mrp,
          discountAmount: item.discountAmount,
          taxRate: item.taxRate
        })),
        payments: [
          {
            paymentMethod: selectedPaymentMethod,
            amount: grandTotal,
            tenderedAmount: selectedPaymentMethod === 'CASH' ? tenderedAmount : grandTotal,
            changeAmount: selectedPaymentMethod === 'CASH' ? Math.max(0, tenderedAmount - grandTotal) : 0
          }
        ],
        discountAmount: discountTotal,
        heldBillId: activeHeldBillId || undefined
      };

      const result = await api.billing.createSale(payload);
      playBeep('cash');

      // Set current receipt and open receipt preview
      setCurrentReceipt(result);
      setFeedAnimKey(k => k + 1);
      setShowPaymentModal(false);
      setShowReceiptModal(true);
      clearCart();
    } catch (err: any) {
      playBeep('error');
      setSaleError(err.message || 'Sale failed to complete. Please try again.');
    } finally {
      setIsSubmittingSale(false);
    }
  };

  // Hold bill flow
  const handleHoldBill = async () => {
    if (cart.length === 0) return;
    try {
      await api.billing.holdBill({
        customerId: selectedCustomer.id,
        customerName: selectedCustomer.name,
        cartData: cart,
        subtotal
      });
      playBeep('success');
      alert(`Bill placed on Hold successfully.`);
      clearCart();
      barcodeInputRef.current?.focus();
    } catch (err: any) {
      alert(`Failed to hold bill: ${err.message}`);
    }
  };

  const openHeldBills = async () => {
    try {
      const res = await api.billing.getHeldBills();
      setHeldBillsList(res.heldBills);
      setShowHeldBillsModal(true);
    } catch (err: any) {
      alert(`Failed to retrieve held bills: ${err.message}`);
    }
  };

  const handleRestoreHeldBill = (held: any) => {
    restoreHeldCart(held.cart_data, held.id, {
      id: held.customer_id,
      name: held.customer_name || 'Walk-in Customer'
    });
    setShowHeldBillsModal(false);
    playBeep('success');
    barcodeInputRef.current?.focus();
  };

  const handleDeleteHeldBill = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm('Delete this held bill?')) {
      await api.billing.deleteHeldBill(id);
      setHeldBillsList(prev => prev.filter(b => b.id !== id));
    }
  };

  const openRecentBills = async () => {
    try {
      const res = await api.billing.getBills({ limit: 25 });
      setRecentBillsList(res.bills);
      setShowRecentBillsModal(true);
    } catch (err: any) {
      alert(`Failed to load recent bills: ${err.message}`);
    }
  };

  const handleReprint = async (invoiceNumber: string) => {
    try {
      const res = await api.billing.getBillByInvoice(invoiceNumber);
      setCurrentReceipt(res);
      setFeedAnimKey(k => k + 1);
      setShowRecentBillsModal(false);
      setShowReceiptModal(true);
    } catch (err: any) {
      alert(`Failed to retrieve bill for reprint: ${err.message}`);
    }
  };

  const changeDue = Math.max(0, tenderedAmount - grandTotal);

  return (
    <div className="billing-layout">
      {/* Mobile View Switcher Tabs (< 768px) */}
      <div className="pos-mobile-view-tabs">
        <button
          type="button"
          id="mobile-tab-catalog"
          className={`pos-mobile-tab-btn ${mobileViewTab === 'catalog' ? 'active' : ''}`}
          onClick={() => setMobileViewTab('catalog')}
        >
          <Barcode size={16} />
          <span>Catalog & Scan</span>
        </button>
        <button
          type="button"
          id="mobile-tab-cart"
          className={`pos-mobile-tab-btn ${mobileViewTab === 'cart' ? 'active' : ''}`}
          onClick={() => setMobileViewTab('cart')}
        >
          <ShoppingCart size={16} />
          <span>Cart ({totalItemsCount})</span>
          {grandTotal > 0 && <span className="mobile-cart-badge">₹{grandTotal.toFixed(0)}</span>}
        </button>
      </div>

      {/* On-screen Notification Toast */}
      {saveToast && (
        <div style={{
          position: 'fixed',
          top: 76,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 9999,
          background: 'linear-gradient(135deg, #059669, #10b981)',
          color: '#ffffff',
          padding: '12px 24px',
          borderRadius: 8,
          boxShadow: '0 8px 30px rgba(16, 185, 129, 0.4)',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontWeight: 700,
          fontSize: 14,
          animation: 'modalPop 0.2s ease-out'
        }}>
          <CheckCircle2 size={20} color="#ffffff" />
          <span>{saveToast}</span>
        </div>
      )}
      {/* ---------------------------------------------------------------------
          LEFT / MAIN AREA: SCANNER, CATEGORIES, PRODUCT CATALOG
          --------------------------------------------------------------------- */}
      <div className={`billing-main-area ${mobileViewTab !== 'catalog' ? 'mobile-hidden' : ''}`}>

        {/* Scanning & Search Bar */}
        <div className="scan-bar-section">
          <form onSubmit={handleBarcodeSubmit} className="barcode-input-container">
            <Barcode size={24} color="#10b981" />
            <input
              ref={barcodeInputRef}
              id="pos-barcode-input"
              className="barcode-input"
              type="text"
              value={barcodeInput}
              onChange={e => setBarcodeInput(e.target.value)}
              placeholder="Scan Barcode with scanner or type product name and press Enter..."
              autoComplete="off"
            />
            {barcodeInput && (
              <button
                type="button"
                onClick={() => setBarcodeInput('')}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            )}
            <kbd>ENTER</kbd>
          </form>

          {/* Quick Search & Filter Row */}
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <div style={{
              flex: 1,
              display: 'flex',
              alignItems: 'center',
              background: 'var(--bg-input)',
              border: '1px solid #2d3748',
              borderRadius: 8,
              padding: '6px 12px',
              gap: 8
            }}>
              <Search size={16} color="#64748b" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => handleSearchChange(e.target.value)}
                placeholder="Filter catalog by product name..."
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: 'white',
                  fontSize: 13,
                  outline: 'none',
                  width: '100%'
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => handleSearchChange('')}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <X size={14} />
                </button>
              )}
            </div>

            <button
              onClick={openRecentBills}
              className="btn-icon"
              style={{ width: 'auto', padding: '0 12px', gap: 6, fontSize: 12, fontWeight: 700 }}
              title="View recent bills for reprint"
            >
              <RefreshCw size={14} />
              <span>Reprint (Bill History)</span>
            </button>
          </div>

          {/* Category Chips */}
          <div className="category-chips-row">
            <button
              className={`category-chip ${selectedCategory === null ? 'active' : ''}`}
              onClick={() => setSelectedCategory(null)}
            >
              All Items
            </button>
            {categories.map(cat => (
              <button
                key={cat.id}
                className={`category-chip ${selectedCategory === cat.id ? 'active' : ''}`}
                onClick={() => setSelectedCategory(cat.id)}
              >
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: cat.color || '#10b981' }} />
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Product Grid */}
        <div className="pos-products-grid">
          {products.map(product => {
            const isOutOfStock = Number(product.current_stock) <= 0;
            const isLowStock = Number(product.current_stock) <= Number(product.min_stock_level);

            return (
              <div
                key={product.id}
                id={`pos-product-${product.barcode}`}
                className={`pos-product-card ${isOutOfStock ? 'out-of-stock' : ''}`}
                onClick={() => {
                  if (!isOutOfStock) addItemToCart(product, 1);
                }}
              >
                <div>
                  <div className="pos-card-name" title={product.name}>
                    {product.name}
                  </div>
                  <div className="pos-card-barcode">
                    {product.barcode}
                  </div>
                </div>

                <div className="pos-card-bottom">
                  <div className="pos-card-price">
                    ₹{Number(product.selling_price).toFixed(2)}
                  </div>
                  <span className={`pos-card-stock ${isOutOfStock ? 'stock-out' : isLowStock ? 'stock-low' : 'stock-good'
                    }`}>
                    {isOutOfStock ? 'OUT' : `${Number(product.current_stock).toFixed(0)} ${product.unit_name || ''}`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>

        {/* Floating Quick Cart Bar on Mobile when items are present */}
        {totalItemsCount > 0 && (
          <div className="pos-mobile-floating-cart-bar" onClick={() => setMobileViewTab('cart')}>
            <div className="mobile-cart-bar-info">
              <span className="mobile-cart-bar-count">{totalItemsCount} {totalItemsCount === 1 ? 'item' : 'items'} in cart</span>
              <span className="mobile-cart-bar-total">₹{grandTotal.toFixed(2)}</span>
            </div>
            <button className="mobile-cart-bar-btn" type="button">
              <span>View Cart & Pay</span>
              <span>→</span>
            </button>
          </div>
        )}

        {/* Keyboard Shortcuts Hint Bar (Desktop only) */}
        <div className="pos-shortcuts-bar" style={{
          padding: '8px 16px',
          background: 'var(--bg-input)',
          borderTop: '1px solid #1e293b',
          display: 'flex',
          gap: 14,
          alignItems: 'center',
          overflowX: 'auto',
          fontSize: 11,
          color: 'var(--text-secondary)'
        }}>
          <span><kbd>F1</kbd> New Bill</span>
          <span><kbd>F2</kbd> Scan Focus</span>
          <span><kbd>F3</kbd> Customer</span>
          <span><kbd>F4</kbd> Hold Bill</span>
          <span><kbd>F5</kbd> Retrieve Bill</span>
          <span><kbd>F6</kbd> Payment</span>
          <span><kbd>F9</kbd> Remove Item</span>
          <span><kbd>ESC</kbd> Close</span>
        </div>
      </div>

      {/* ---------------------------------------------------------------------
          RIGHT AREA: ACTIVE CART & CHECKOUT
          --------------------------------------------------------------------- */}
      <div className={`billing-cart-panel ${mobileViewTab !== 'cart' ? 'mobile-hidden' : ''}`}>
        {/* Mobile Back Button to Catalog */}
        <div className="mobile-cart-back-bar">
          <button
            type="button"
            className="mobile-back-to-catalog-btn"
            onClick={() => setMobileViewTab('catalog')}
          >
            ← Add More Items / Barcode Scan
          </button>
        </div>

        {/* Cart Header */}
        <div className="cart-header">
          <div className="cart-header-title">
            <span>Current Sale</span>
            <span style={{
              background: '#059669',
              color: 'white',
              fontSize: 11,
              padding: '2px 8px',
              borderRadius: 12,
              fontWeight: 700
            }}>
              {totalItemsCount} {totalItemsCount === 1 ? 'Item' : 'Items'}
            </span>
          </div>

          {cart.length > 0 && (
            <button
              onClick={() => {
                if (window.confirm('Clear all items in cart?')) clearCart();
              }}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#f43f5e',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 4
              }}
            >
              <Trash2 size={14} />
              Clear
            </button>
          )}
        </div>

        {/* Customer Bar */}
        <div className="cart-customer-bar">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <User size={15} color="#10b981" />
            <span style={{ fontWeight: 600, color: 'white' }}>{selectedCustomer.name}</span>
            {selectedCustomer.phone && selectedCustomer.phone !== '0000000000' && (
              <span style={{ color: 'var(--text-secondary)', fontSize: 12 }}>({selectedCustomer.phone})</span>
            )}
          </div>
          <button
            onClick={() => setShowCustomerModal(true)}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid #334155',
              color: '#38bdf8',
              fontSize: 11,
              fontWeight: 700,
              padding: '3px 8px',
              borderRadius: 4,
              cursor: 'pointer'
            }}
          >
            Change (F3)
          </button>
        </div>

        {/* Cart Items List */}
        <div className="cart-items-container">
          {cart.length === 0 ? (
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#475569',
              gap: 12,
              textAlign: 'center',
              padding: 24
            }}>
              <Barcode size={48} strokeWidth={1.5} />
              <div>
                <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-secondary)' }}>Cart is currently empty</p>
                <p style={{ fontSize: 12, marginTop: 4 }}>Scan a product barcode or click on catalog items to begin billing</p>
              </div>
            </div>
          ) : (
            cart.map(item => (
              <div key={item.product.id} className="cart-item-row">
                <div className="cart-item-top">
                  <span className="cart-item-title">{item.product.name}</span>
                  <span className="cart-item-price-calc">₹{item.lineTotal.toFixed(2)}</span>
                </div>

                <div className="cart-item-controls">
                  {/* Quantity Stepper */}
                  <div className="qty-stepper">
                    <button
                      className="qty-btn"
                      onClick={() => updateItemQuantity(item.product.id, item.quantity - 1)}
                    >
                      <Minus size={12} />
                    </button>
                    <input
                      className="qty-input"
                      type="number"
                      step={item.product.allow_decimals ? '0.1' : '1'}
                      value={item.quantity}
                      onChange={e => updateItemQuantity(item.product.id, parseFloat(e.target.value) || 0)}
                    />
                    <button
                      className="qty-btn"
                      onClick={() => updateItemQuantity(item.product.id, item.quantity + 1)}
                    >
                      <Plus size={12} />
                    </button>
                  </div>

                  {/* Unit rate & tax badge */}
                  <div style={{ fontSize: 11, color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: 6 }}>
                    <span>@ ₹{item.unitPrice.toFixed(2)}</span>
                    {item.taxRate > 0 && (
                      <span style={{ background: 'var(--bg-card)', padding: '1px 4px', borderRadius: 3, fontSize: 10 }}>
                        {item.taxRate}% GST
                      </span>
                    )}
                  </div>

                  {/* Delete Item */}
                  <button
                    onClick={() => removeItemFromCart(item.product.id)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 4 }}
                    title="Remove item"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Cart Bottom Summary & Checkout */}
        <div className="cart-footer">
          <div className="summary-line">
            <span>Subtotal</span>
            <span className="font-mono">₹{subtotal.toFixed(2)}</span>
          </div>

          {discountTotal > 0 && (
            <div className="summary-line" style={{ color: '#f43f5e' }}>
              <span>Total Discounts</span>
              <span className="font-mono">-₹{discountTotal.toFixed(2)}</span>
            </div>
          )}

          <div className="summary-line">
            <span>Tax (Included in MRP)</span>
            <span className="font-mono">₹{taxTotal.toFixed(2)}</span>
          </div>

          {roundOff !== 0 && (
            <div className="summary-line">
              <span>Round Off</span>
              <span className="font-mono">{roundOff > 0 ? `+₹${roundOff.toFixed(2)}` : `-₹${Math.abs(roundOff).toFixed(2)}`}</span>
            </div>
          )}

          <div className="grand-total-line">
            <span className="grand-total-label">Total Bill</span>
            <span className="grand-total-amount">₹{grandTotal.toFixed(2)}</span>
          </div>

          {/* Inline Cash Tendered & Balance Calculator */}
          <div className="inline-tender-box">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Cash Tendered
              </span>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                {tenderedAmount >= grandTotal && grandTotal > 0 ? 'Change to Return' : 'Balance Remaining'}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, alignItems: 'center' }}>
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', fontWeight: 700, fontSize: 13 }}>
                  ₹
                </span>
                <input
                  id="pos-inline-tender-input"
                  type="number"
                  placeholder="0.00"
                  value={tenderedAmount || ''}
                  onChange={e => setTenderedAmount(parseFloat(e.target.value) || 0)}
                  disabled={cart.length === 0}
                  style={{
                    width: '100%',
                    background: 'var(--bg-input)',
                    border: '1px solid #334155',
                    borderRadius: 6,
                    padding: '8px 10px 8px 24px',
                    color: 'white',
                    fontFamily: 'JetBrains Mono',
                    fontWeight: 700,
                    fontSize: 15,
                    outline: 'none'
                  }}
                />
              </div>

              <div style={{
                background: grandTotal > 0 && tenderedAmount >= grandTotal ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.1)',
                border: `1px solid ${grandTotal > 0 && tenderedAmount >= grandTotal ? '#10b981' : '#475569'}`,
                borderRadius: 6,
                padding: '6px 12px',
                textAlign: 'right'
              }}>
                <div style={{
                  fontSize: 10,
                  textTransform: 'uppercase',
                  fontWeight: 700,
                  color: grandTotal > 0 && tenderedAmount >= grandTotal ? '#34d399' : 'var(--text-secondary)'
                }}>
                  {grandTotal > 0 && tenderedAmount >= grandTotal ? 'Change Due' : 'Shortage / Due'}
                </div>
                <div style={{
                  fontFamily: 'JetBrains Mono',
                  fontWeight: 800,
                  fontSize: 16,
                  color: grandTotal > 0 && tenderedAmount >= grandTotal ? '#34d399' : (tenderedAmount > 0 ? '#f87171' : 'var(--text-soft)')
                }}>
                  ₹{Math.abs((tenderedAmount || 0) - grandTotal).toFixed(2)}
                </div>
              </div>
            </div>

            {/* Quick Tender Buttons */}
            {cart.length > 0 && (
              <div style={{ display: 'flex', gap: 6, marginTop: 8 }}>
                <button
                  type="button"
                  onClick={() => setTenderedAmount(grandTotal)}
                  style={{
                    flex: 1,
                    padding: '4px 6px',
                    fontSize: 11,
                    fontWeight: 700,
                    background: 'var(--bg-card)',
                    border: '1px solid #334155',
                    color: '#38bdf8',
                    borderRadius: 4,
                    cursor: 'pointer'
                  }}
                >
                  Exact (₹{grandTotal.toFixed(0)})
                </button>
                {[50, 100, 200, 500].map(amt => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setTenderedAmount(amt)}
                    style={{
                      flex: 1,
                      padding: '4px 6px',
                      fontSize: 11,
                      fontWeight: 600,
                      background: 'var(--bg-card)',
                      border: '1px solid #334155',
                      color: 'var(--text-soft)',
                      borderRadius: 4,
                      cursor: 'pointer'
                    }}
                  >
                    ₹{amt}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="cart-actions-grid">
            <button
              id="pos-btn-hold"
              className="btn-hold"
              disabled={cart.length === 0}
              onClick={handleHoldBill}
            >
              <PauseCircle size={17} />
              <span>Hold (F4)</span>
            </button>

            <button
              id="pos-btn-retrieve"
              className="btn-hold"
              onClick={openHeldBills}
            >
              <PlayCircle size={17} />
              <span>Retrieve (F5)</span>
            </button>

            <button
              id="pos-btn-pay"
              className="btn-pay"
              disabled={cart.length === 0}
              onClick={openPaymentModal}
            >
              <CreditCard size={22} />
              <span>PAY ₹{grandTotal.toFixed(2)} (F6)</span>
            </button>
          </div>
        </div>
      </div>

      {/* ---------------------------------------------------------------------
          MODAL: PAYMENT (CASH / CARD / UPI / SPLIT)
          --------------------------------------------------------------------- */}
      {showPaymentModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 520 }}>
            <div className="modal-header">
              <div className="modal-title">Payment & Checkout</div>
              <button
                onClick={() => setShowPaymentModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              {saleError && (
                <div style={{
                  background: '#450a0a',
                  border: '1px solid #ef4444',
                  color: '#fca5a5',
                  padding: '10px 14px',
                  borderRadius: 6,
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}>
                  <AlertTriangle size={18} />
                  <span>{saleError}</span>
                </div>
              )}

              {/* Total Banner */}
              <div style={{
                background: 'var(--bg-input)',
                border: '1px solid #2d3748',
                borderRadius: 10,
                padding: 16,
                textAlign: 'center'
              }}>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', textTransform: 'uppercase', fontWeight: 600 }}>Amount Due</div>
                <div style={{ fontSize: 36, fontWeight: 800, color: '#10b981', fontFamily: 'JetBrains Mono' }}>
                  ₹{grandTotal.toFixed(2)}
                </div>
              </div>

              {/* Payment Method Selector */}
              <div>
                <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  Payment Method
                </label>
                <div className="payment-methods-tabs">
                  <button
                    type="button"
                    className={`payment-method-card ${selectedPaymentMethod === 'CASH' ? 'active' : ''}`}
                    onClick={() => setSelectedPaymentMethod('CASH')}
                  >
                    <Banknote size={24} />
                    <span style={{ fontWeight: 700, fontSize: 13 }}>CASH</span>
                  </button>
                  <button
                    type="button"
                    className={`payment-method-card ${selectedPaymentMethod === 'CARD' ? 'active' : ''}`}
                    onClick={() => setSelectedPaymentMethod('CARD')}
                  >
                    <CreditCard size={24} />
                    <span style={{ fontWeight: 700, fontSize: 13 }}>CARD</span>
                  </button>
                  <button
                    type="button"
                    className={`payment-method-card ${selectedPaymentMethod === 'UPI' ? 'active' : ''}`}
                    onClick={() => setSelectedPaymentMethod('UPI')}
                  >
                    <Smartphone size={24} />
                    <span style={{ fontWeight: 700, fontSize: 13 }}>UPI / QR</span>
                  </button>
                </div>
              </div>

              {/* Cash specific: Tendered amount & Quick Cash buttons */}
              {selectedPaymentMethod === 'CASH' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
                      Tendered Amount (Cash Received)
                    </label>
                    <input
                      id="pos-input-tendered"
                      type="number"
                      autoFocus
                      value={tenderedAmount}
                      onChange={e => setTenderedAmount(parseFloat(e.target.value) || 0)}
                      style={{
                        width: '100%',
                        background: 'var(--bg-input)',
                        border: '2px solid #10b981',
                        borderRadius: 8,
                        color: 'white',
                        fontFamily: 'JetBrains Mono',
                        fontSize: 22,
                        fontWeight: 700,
                        padding: '10px 14px',
                        outline: 'none'
                      }}
                    />
                  </div>

                  {/* Quick Cash Buttons */}
                  <div className="quick-cash-chips">
                    <button type="button" className="quick-cash-btn" onClick={() => setTenderedAmount(grandTotal)}>
                      Exact
                    </button>
                    <button type="button" className="quick-cash-btn" onClick={() => setTenderedAmount(100)}>
                      ₹100
                    </button>
                    <button type="button" className="quick-cash-btn" onClick={() => setTenderedAmount(200)}>
                      ₹200
                    </button>
                    <button type="button" className="quick-cash-btn" onClick={() => setTenderedAmount(500)}>
                      ₹500
                    </button>
                    <button type="button" className="quick-cash-btn" onClick={() => setTenderedAmount(2000)}>
                      ₹2000
                    </button>
                  </div>

                  {/* Change Due Display */}
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    background: 'var(--bg-card)',
                    padding: '12px 16px',
                    borderRadius: 8,
                    border: '1px solid #334155'
                  }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-soft)' }}>Change to Return:</span>
                    <span style={{
                      fontFamily: 'JetBrains Mono',
                      fontSize: 22,
                      fontWeight: 800,
                      color: changeDue > 0 ? '#38bdf8' : 'var(--text-secondary)'
                    }}>
                      ₹{changeDue.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                onClick={() => setShowPaymentModal(false)}
                style={{
                  background: 'transparent',
                  border: '1px solid #334155',
                  color: 'var(--text-secondary)',
                  padding: '10px 18px',
                  borderRadius: 6,
                  fontWeight: 600,
                  cursor: 'pointer'
                }}
              >
                Cancel (ESC)
              </button>
              <button
                id="pos-btn-complete-sale"
                type="button"
                disabled={isSubmittingSale || (selectedPaymentMethod === 'CASH' && tenderedAmount < grandTotal)}
                onClick={handleCompleteSale}
                style={{
                  background: 'linear-gradient(135deg, #10b981, #059669)',
                  color: '#062417',
                  border: 'none',
                  padding: '12px 24px',
                  borderRadius: 6,
                  fontWeight: 800,
                  fontSize: 15,
                  cursor: isSubmittingSale ? 'not-allowed' : 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8
                }}
              >
                {isSubmittingSale ? 'Completing Sale...' : 'Confirm & Print Receipt'}
                <CheckCircle2 size={18} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------
          MODAL: THERMAL RECEIPT PREVIEW / PRINT / SAVE
          --------------------------------------------------------------------- */}
      {showReceiptModal && currentReceipt && (
        <div className="modal-overlay">
          <div className="modal-content receipt-modal-content" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <div>
                <div className="modal-title">Receipt - {currentReceipt.sale.invoice_number}</div>
                <div style={{ fontSize: 11, color: '#34d399', marginTop: 2, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#10b981' }} />
                  <span>Printerless Mode Active • Click "OK to Save" to complete</span>
                </div>
              </div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={triggerFeedAnimation}
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid #334155',
                    color: 'var(--text-soft)',
                    padding: '4px 8px',
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 4
                  }}
                  title="Replay thermal print paper feed animation"
                >
                  <RefreshCw size={12} />
                  <span>Feed</span>
                </button>
                <button
                  onClick={() => setReceiptWidth(w => w === '200' ? '58mm' : '200')}
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid #334155',
                    color: '#38bdf8',
                    padding: '4px 8px',
                    borderRadius: 4,
                    fontSize: 11,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  Width: {receiptWidth}
                </button>
                <button
                  onClick={() => setShowReceiptModal(false)}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
                >
                  <X size={20} />
                </button>
              </div>
            </div>

            <div className="modal-body receipt-modal-body" style={{ background: 'var(--bg-input)', padding: '16px 20px 20px 20px' }}>
              <div className={`receipt-viewport-container ${receiptWidth === '200' ? 'receipt-width-standard' : 'receipt-width-compact'}`}>
                {/* Thermal Dispenser Bezel */}
                <div className="thermal-dispenser-head">
                  <div className="dispenser-status-bar">
                    <div className="dispenser-led">
                      <span className="led-dot" />
                      <span>THERMAL DISPENSER • READY</span>
                    </div>
                    <span>BHARATHI POS</span>
                  </div>
                  <div className="dispenser-slit" />
                </div>

                {/* Animated Thermal Paper Ejection */}
                <div className="receipt-paper-wrapper">
                  <div key={feedAnimKey} className={`receipt-paper ${receiptWidth === '200' ? 'w-80' : 'w-58'}`}>
                    <div style={{ textAlign: 'center', marginBottom: 8 }}>
                      {currentReceipt.store.logo_url && (
                        <img
                          src={currentReceipt.store.logo_url}
                          alt="Store Logo"
                          style={{ maxHeight: 44, maxWidth: '80%', margin: '0 auto 6px auto', display: 'block', objectFit: 'contain' }}
                        />
                      )}
                      <div style={{ fontWeight: 800, fontSize: 16 }}>{currentReceipt.store.store_name}</div>
                      <div style={{ fontSize: 10, color: '#333' }}>{currentReceipt.store.address}</div>
                      <div style={{ fontSize: 10, color: '#333' }}>Tel: {currentReceipt.store.phone}</div>
                      {(currentReceipt.store.enable_gst && (currentReceipt.store.gst_number || currentReceipt.store.tax_number)) && (
                        <div style={{ fontSize: 10, color: '#333', fontWeight: 600 }}>
                          GSTIN: {currentReceipt.store.gst_number || currentReceipt.store.tax_number}
                        </div>
                      )}
                      {(currentReceipt.store.enable_fssai && currentReceipt.store.fssai_number) && (
                        <div style={{ fontSize: 10, color: '#333', fontWeight: 600 }}>
                          FSSAI Lic: {currentReceipt.store.fssai_number}
                        </div>
                      )}
                    </div>

                    <div className="receipt-divider" />

                    <div style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between' }}>
                      <span>Invoice: {currentReceipt.sale.invoice_number}</span>
                      <span>Date: {new Date(currentReceipt.sale.created_at).toLocaleDateString()}</span>
                    </div>
                    <div style={{ fontSize: 11, display: 'flex', justifyContent: 'space-between' }}>
                      <span>Cashier: {currentReceipt.sale.cashier_name}</span>
                      <span>Time: {new Date(currentReceipt.sale.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <div style={{ fontSize: 11 }}>
                      Customer: {currentReceipt.sale.customer_name}
                    </div>

                    <div className="receipt-divider" />

                    {/* Items Table */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                      <thead>
                        <tr style={{ borderBottom: '1px solid #000' }}>
                          <th style={{ textAlign: 'left', paddingBottom: 4 }}>Item</th>
                          <th style={{ textAlign: 'center', paddingBottom: 4 }}>Qty</th>
                          <th style={{ textAlign: 'right', paddingBottom: 4 }}>Rate</th>
                          <th style={{ textAlign: 'right', paddingBottom: 4 }}>Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {currentReceipt.sale.items?.map((item: any) => (
                          <tr key={item.id}>
                            <td style={{ paddingTop: 4, maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {item.product_name}
                            </td>
                            <td style={{ textAlign: 'center', paddingTop: 4 }}>{item.quantity}</td>
                            <td style={{ textAlign: 'right', paddingTop: 4 }}>{Number(item.unit_price).toFixed(2)}</td>
                            <td style={{ textAlign: 'right', paddingTop: 4, fontWeight: 'bold' }}>{Number(item.line_total).toFixed(2)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>

                    <div className="receipt-divider" />

                    {/* Totals */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                      <span>Subtotal:</span>
                      <span>₹{Number(currentReceipt.sale.subtotal).toFixed(2)}</span>
                    </div>
                    {Number(currentReceipt.sale.discount_amount) > 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                        <span>Discounts:</span>
                        <span>-₹{Number(currentReceipt.sale.discount_amount).toFixed(2)}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                      <span>Tax Included:</span>
                      <span>₹{Number(currentReceipt.sale.tax_amount).toFixed(2)}</span>
                    </div>
                    {Number(currentReceipt.sale.round_off) !== 0 && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11 }}>
                        <span>Round Off:</span>
                        <span>{Number(currentReceipt.sale.round_off) > 0 ? '+' : ''}₹{Number(currentReceipt.sale.round_off).toFixed(2)}</span>
                      </div>
                    )}
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 'bold', margin: '4px 0' }}>
                      <span>GRAND TOTAL:</span>
                      <span>₹{Number(currentReceipt.sale.grand_total).toFixed(2)}</span>
                    </div>

                    <div className="receipt-divider" />

                    {/* Payments */}
                    {currentReceipt.sale.payments?.map((pmt: any, i: number) => (
                      <div key={i} style={{ fontSize: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>Mode: {pmt.payment_method}</span>
                          <span>Paid: ₹{Number(pmt.amount).toFixed(2)}</span>
                        </div>
                        {pmt.payment_method === 'CASH' && Number(pmt.tendered_amount) > 0 && (
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>Tendered: ₹{Number(pmt.tendered_amount).toFixed(2)}</span>
                            <span>Change: ₹{Number(pmt.change_amount).toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    ))}

                    <div className="receipt-divider" />

                    <div style={{ textAlign: 'center', fontSize: 10, marginTop: 6 }}>
                      <div>{currentReceipt.store.receipt_header}</div>
                      <div style={{ marginTop: 4 }}>{currentReceipt.store.receipt_footer}</div>
                    </div>

                    {/* Authentic Sawtooth Perforated Tear Edge */}
                    <div className="receipt-tear-edge" />
                  </div>
                </div>
              </div>
            </div>

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-secondary)', cursor: 'pointer', userSelect: 'none' }}>
                <input
                  type="checkbox"
                  checked={autoDownloadSlip}
                  onChange={e => {
                    setAutoDownloadSlip(e.target.checked);
                    localStorage.setItem('bharathi_auto_download_receipt', String(e.target.checked));
                  }}
                  style={{ accentColor: '#10b981', cursor: 'pointer' }}
                />
                <span>Auto-download slip on OK</span>
              </label>

              <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={() => setShowReceiptModal(false)}
                  style={{
                    background: 'transparent',
                    border: '1px solid #334155',
                    color: 'var(--text-secondary)',
                    padding: '8px 14px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    fontSize: 12
                  }}
                >
                  Close (ESC)
                </button>
                <button
                  type="button"
                  onClick={() => handleDownloadReceipt()}
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid #334155',
                    color: '#38bdf8',
                    padding: '8px 14px',
                    borderRadius: 6,
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                  title="Download formatted text receipt (.txt)"
                >
                  <FileText size={14} />
                  <span>Save .txt</span>
                </button>
                <button
                  id="pos-btn-print-action"
                  type="button"
                  onClick={() => window.print()}
                  style={{
                    background: 'var(--bg-card)',
                    border: '1px solid #475569',
                    color: 'var(--text-primary)',
                    padding: '8px 14px',
                    borderRadius: 6,
                    fontWeight: 700,
                    fontSize: 12,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 6
                  }}
                  title="Print if physical printer is connected"
                >
                  <Printer size={14} />
                  <span>Print</span>
                </button>
                <button
                  id="pos-btn-ok-save"
                  type="button"
                  onClick={handleOkToSave}
                  title="Save receipt and finish bill (Enter)"
                >
                  <CheckCircle2 size={16} />
                  <span>OK to Save (Enter)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------
          MODAL: RETRIEVE HELD BILLS
          --------------------------------------------------------------------- */}
      {showHeldBillsModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 540 }}>
            <div className="modal-header">
              <div className="modal-title">Held Bills (Parked Carts)</div>
              <button
                onClick={() => setShowHeldBillsModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              {heldBillsList.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
                  No held bills found.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {heldBillsList.map(held => (
                    <div
                      key={held.id}
                      onClick={() => handleRestoreHeldBill(held)}
                      style={{
                        background: 'var(--bg-card)',
                        border: '1px solid #334155',
                        borderRadius: 8,
                        padding: '12px 16px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        cursor: 'pointer',
                        transition: 'border-color 0.15s'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, color: '#fbbf24', fontSize: 14 }}>
                          {held.bill_reference}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                          Customer: {held.customer_name} • {held.cart_data?.length || 0} items
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                          {new Date(held.created_at).toLocaleTimeString()}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                        <div style={{ fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 16, color: '#10b981' }}>
                          ₹{Number(held.subtotal).toFixed(2)}
                        </div>
                        <button
                          onClick={e => handleDeleteHeldBill(held.id, e)}
                          style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="modal-footer">
              <button
                type="button"
                onClick={() => setShowHeldBillsModal(false)}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid #334155',
                  color: 'var(--text-secondary)',
                  padding: '8px 16px',
                  borderRadius: 6,
                  cursor: 'pointer'
                }}
              >
                Close (ESC)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------
          MODAL: RECENT BILLS / REPRINT
          --------------------------------------------------------------------- */}
      {showRecentBillsModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 640 }}>
            <div className="modal-header">
              <div className="modal-title">Bill History & Reprint Receipt</div>
              <button
                onClick={() => setShowRecentBillsModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recentBillsList.map(bill => (
                  <div
                    key={bill.id}
                    style={{
                      background: 'var(--bg-card)',
                      border: '1px solid #2d3748',
                      borderRadius: 8,
                      padding: '12px 16px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <div>
                      <div style={{ fontWeight: 700, color: 'white', fontSize: 14 }}>
                        {bill.invoice_number}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                        {new Date(bill.created_at).toLocaleString()} • Cashier: {bill.cashier_name}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        Customer: {bill.customer_name || 'Walk-in'} • {bill.item_count} items ({bill.payment_method})
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                      <div style={{ fontFamily: 'JetBrains Mono', fontWeight: 800, fontSize: 16, color: '#10b981' }}>
                        ₹{Number(bill.grand_total).toFixed(2)}
                      </div>
                      <button
                        onClick={() => handleReprint(bill.invoice_number)}
                        style={{
                          background: '#059669',
                          color: 'white',
                          border: 'none',
                          padding: '6px 12px',
                          borderRadius: 6,
                          fontSize: 12,
                          fontWeight: 700,
                          cursor: 'pointer',
                          display: 'flex',
                          alignItems: 'center',
                          gap: 4
                        }}
                      >
                        <Printer size={14} />
                        Reprint
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                onClick={() => setShowRecentBillsModal(false)}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid #334155',
                  color: 'var(--text-secondary)',
                  padding: '8px 16px',
                  borderRadius: 6,
                  cursor: 'pointer'
                }}
              >
                Close (ESC)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------------------
          MODAL: CUSTOMER SELECTION
          --------------------------------------------------------------------- */}
      {showCustomerModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: 480 }}>
            <div className="modal-header">
              <div className="modal-title">Select Customer</div>
              <button
                onClick={() => setShowCustomerModal(false)}
                style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <div className="modal-body">
              <button
                onClick={() => {
                  setSelectedCustomer({
                    id: '00000000-0000-0000-0000-000000000001',
                    name: 'Walk-in Customer',
                    phone: '0000000000'
                  });
                  setShowCustomerModal(false);
                }}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid #334155',
                  color: 'white',
                  padding: 14,
                  borderRadius: 8,
                  textAlign: 'left',
                  fontWeight: 700,
                  cursor: 'pointer'
                }}
              >
                🛒 Default: Walk-in Customer (Fast Checkout)
              </button>

              <div style={{ borderTop: '1px solid #2d3748', paddingTop: 14 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  Quick Register New Customer:
                </div>
                <form
                  onSubmit={async e => {
                    e.preventDefault();
                    const form = e.target as any;
                    const name = form.custName.value;
                    const phone = form.custPhone.value;
                    if (!name) return;
                    try {
                      const newCust = await api.products.createCustomer({ name, phone });
                      setSelectedCustomer(newCust);
                      setShowCustomerModal(false);
                    } catch (err: any) {
                      alert(err.message);
                    }
                  }}
                  style={{ display: 'flex', flexDirection: 'column', gap: 10 }}
                >
                  <input
                    name="custName"
                    type="text"
                    placeholder="Customer Full Name"
                    required
                    style={{
                      background: 'var(--bg-input)',
                      border: '1px solid #334155',
                      borderRadius: 6,
                      color: 'white',
                      padding: 10
                    }}
                  />
                  <input
                    name="custPhone"
                    type="tel"
                    placeholder="Mobile Number (e.g. +91 9876543210)"
                    style={{
                      background: 'var(--bg-input)',
                      border: '1px solid #334155',
                      borderRadius: 6,
                      color: 'white',
                      padding: 10
                    }}
                  />
                  <button
                    type="submit"
                    style={{
                      background: '#10b981',
                      color: '#062417',
                      border: 'none',
                      padding: 10,
                      borderRadius: 6,
                      fontWeight: 700,
                      cursor: 'pointer'
                    }}
                  >
                    Save & Attach to Bill
                  </button>
                </form>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
