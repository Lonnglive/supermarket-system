import React, { useState, useEffect } from 'react';
import { api } from '../../api/client';
import {
  BarChart3, Calendar, Download, Printer,
  DollarSign, ShoppingCart, Percent, TrendingUp,
  CreditCard, Banknote, Smartphone, Users,
  Search, ShoppingBag, Filter, Clock, ArrowUpRight,
  CheckCircle2, Layers, FileSpreadsheet, RefreshCw
} from 'lucide-react';

export const ReportsModule: React.FC = () => {
  const getLocalDateString = (d = new Date()) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const todayStr = getLocalDateString(new Date());
  const thirtyDaysAgoStr = getLocalDateString(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

  // Active Tab
  const [activeTab, setActiveTab] = useState<'overview' | 'sold-items' | 'daily-records' | 'bills' | 'hourly'>('overview');

  // Date filters
  const [selectedDate, setSelectedDate] = useState<string>(todayStr);
  const [rangeStartDate, setRangeStartDate] = useState<string>(thirtyDaysAgoStr);
  const [rangeEndDate, setRangeEndDate] = useState<string>(todayStr);

  // Search & category filters for sold items
  const [soldItemSearch, setSoldItemSearch] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [categories, setCategories] = useState<any[]>([]);

  // Payment filter for completed bills
  const [paymentFilter, setPaymentFilter] = useState<'ALL' | 'CASH' | 'UPI' | 'CARD'>('ALL');

  // Data states
  const [summaryData, setSummaryData] = useState<any>(null);
  const [soldItemsData, setSoldItemsData] = useState<any>(null);
  const [dailyRecordsData, setDailyRecordsData] = useState<any>(null);
  const [hourlyData, setHourlyData] = useState<any[]>([]);
  const [salesList, setSalesList] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  // Load initial categories
  useEffect(() => {
    api.products.getCategories().then(res => setCategories(res.categories)).catch(() => {});
  }, []);

  // Load data whenever filters change
  useEffect(() => {
    loadActiveReportData();
  }, [selectedDate, rangeStartDate, rangeEndDate, activeTab, paymentFilter, selectedCategory]);

  const loadActiveReportData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'overview') {
        const [sumRes, hrRes, salesRes] = await Promise.all([
          api.reports.getDailySummary(selectedDate),
          api.reports.getHourly(selectedDate),
          api.reports.getSalesReport({ startDate: selectedDate, endDate: selectedDate })
        ]);
        setSummaryData(sumRes);
        setHourlyData(hrRes.hourly);
        setSalesList(salesRes.sales);
      } else if (activeTab === 'sold-items') {
        const res = await api.reports.getSoldItems({
          date: selectedDate,
          categoryId: selectedCategory || undefined
        });
        setSoldItemsData(res);
      } else if (activeTab === 'daily-records') {
        const res = await api.reports.getDailyRecords({
          startDate: rangeStartDate,
          endDate: rangeEndDate
        });
        setDailyRecordsData(res);
      } else if (activeTab === 'bills') {
        const res = await api.reports.getSalesReport({
          startDate: selectedDate,
          endDate: selectedDate,
          paymentMethod: paymentFilter !== 'ALL' ? paymentFilter : undefined
        });
        setSalesList(res.sales);
      } else if (activeTab === 'hourly') {
        const res = await api.reports.getHourly(selectedDate);
        setHourlyData(res.hourly);
      }
    } catch (err) {
      console.error('Failed to load reports data:', err);
    } finally {
      setLoading(false);
    }
  };

  // Quick date presets
  const setQuickDate = (type: 'today' | 'yesterday' | 'week' | 'month') => {
    const now = new Date();
    if (type === 'today') {
      const d = getLocalDateString(now);
      setSelectedDate(d);
      setRangeStartDate(d);
      setRangeEndDate(d);
    } else if (type === 'yesterday') {
      const y = getLocalDateString(new Date(now.getTime() - 24 * 60 * 60 * 1000));
      setSelectedDate(y);
      setRangeStartDate(y);
      setRangeEndDate(y);
    } else if (type === 'week') {
      const w = getLocalDateString(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
      setRangeStartDate(w);
      setRangeEndDate(getLocalDateString(now));
    } else if (type === 'month') {
      const m = getLocalDateString(new Date(now.getFullYear(), now.getMonth(), 1));
      setRangeStartDate(m);
      setRangeEndDate(getLocalDateString(now));
    }
  };

  // CSV Export for active tab
  const exportCSV = () => {
    let csv = '';
    let fileName = `Bharathi_Report_${selectedDate}.csv`;

    if (activeTab === 'sold-items') {
      fileName = `Bharathi_Sold_Items_${selectedDate}.csv`;
      csv = `Product,Barcode,Category,Quantity Sold,Unit,Avg Unit Price (Rs),Discount (Rs),Tax (Rs),Total Revenue (Rs),In Stock Available,Bills Count\n`;
      (soldItemsData?.items || []).forEach((item: any) => {
        csv += `"${item.productName.replace(/"/g, '""')}","${item.barcode}","${item.categoryName}",${item.totalQuantitySold},"${item.unitName}",${item.avgUnitPrice},${item.totalDiscount},${item.totalTax},${item.totalRevenue},${item.currentStock},${item.billsCount}\n`;
      });
    } else if (activeTab === 'daily-records') {
      fileName = `Bharathi_Daily_Sales_Record_${rangeStartDate}_to_${rangeEndDate}.csv`;
      csv = `Date,Total Bills,Items Sold,Gross Sales (Rs),Discounts (Rs),Taxes (Rs),Cash Total (Rs),GPay UPI Total (Rs),Card Total (Rs),Net Sales Total (Rs)\n`;
      (dailyRecordsData?.records || []).forEach((r: any) => {
        csv += `"${r.saleDate}",${r.totalBills},${r.totalItemsSold},${r.grossSales},${r.discounts},${r.taxes},${r.cashTotal},${r.upiGpayTotal},${r.cardTotal},${r.netSales}\n`;
      });
    } else if (activeTab === 'bills') {
      fileName = `Bharathi_Bills_${selectedDate}.csv`;
      csv = `Invoice No,Date Time,Cashier,Customer,Items,Payment Mode,Subtotal (Rs),Discount (Rs),Grand Total (Rs)\n`;
      salesList.forEach((s: any) => {
        csv += `"${s.invoice_number}","${s.created_at}","${s.cashier_name}","${s.customer_name || 'Walk-in'}",${s.item_count},"${s.payment_methods}",${s.subtotal},${s.discount_amount},${s.grand_total}\n`;
      });
    } else {
      if (!summaryData) return;
      csv = `Store,Bharathi Homelings Supermarket\nDate,${selectedDate}\n\n`;
      csv += `SUMMARY METRICS\n`;
      csv += `Total Bills,${summaryData.summary.totalBills}\n`;
      csv += `Total Items Sold,${summaryData.summary.totalItemsSold}\n`;
      csv += `Gross Sales,Rs ${summaryData.summary.grossSales.toFixed(2)}\n`;
      csv += `Discounts,Rs ${summaryData.summary.discounts.toFixed(2)}\n`;
      csv += `Taxes,Rs ${summaryData.summary.taxes.toFixed(2)}\n`;
      csv += `Net Sales,Rs ${summaryData.summary.netSales.toFixed(2)}\n\n`;
      csv += `PAYMENT COLLECTION BREAKDOWN\n`;
      csv += `Cash Collection,Rs ${(summaryData.paymentBreakdown.CASH || 0).toFixed(2)}\n`;
      csv += `GPay / UPI Collection,Rs ${(summaryData.paymentBreakdown.UPI || 0).toFixed(2)}\n`;
      csv += `Card Collection,Rs ${(summaryData.paymentBreakdown.CARD || 0).toFixed(2)}\n\n`;
      csv += `TOP SELLING PRODUCTS\nProduct,Quantity Sold,Revenue (Rs)\n`;
      summaryData.topProducts.forEach((p: any) => {
        csv += `"${p.product_name}",${p.total_quantity},${p.total_revenue}\n`;
      });
    }

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const summary = summaryData?.summary;
  const paymentBreakdown = summaryData?.paymentBreakdown || {};
  const paymentCounts = summaryData?.paymentCounts || {};

  const cashAmount = Number(paymentBreakdown.CASH || 0);
  const cardAmount = Number(paymentBreakdown.CARD || 0);
  const upiGpayAmount = Number(paymentBreakdown.UPI || 0);
  const totalCollections = cashAmount + cardAmount + upiGpayAmount;

  // Filter sold items in real time by search query
  const filteredSoldItems = (soldItemsData?.items || []).filter((item: any) => {
    if (!soldItemSearch.trim()) return true;
    const q = soldItemSearch.toLowerCase();
    return (
      item.productName.toLowerCase().includes(q) ||
      (item.barcode && item.barcode.toLowerCase().includes(q)) ||
      (item.categoryName && item.categoryName.toLowerCase().includes(q))
    );
  });

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: 20, gap: 16 }}>
      {/* Top Header & Navigation Bar */}
      <div style={{
        background: 'var(--bg-surface, #111827)',
        border: '1px solid var(--border-subtle, #1e293b)',
        borderRadius: 12,
        padding: '16px 20px',
        display: 'flex',
        flexDirection: 'column',
        gap: 14
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 42,
              height: 42,
              borderRadius: 10,
              background: 'linear-gradient(135deg, #10b981, #059669)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'white',
              boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)'
            }}>
              <BarChart3 size={22} />
            </div>
            <div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary, #ffffff)', letterSpacing: -0.3 }}>
                Bharathi Homelings Business Reports
              </h2>
              <p style={{ fontSize: 12, color: 'var(--text-secondary, #94a3b8)', marginTop: 2 }}>
                Real-time sold item calculations, daily sales registers, Cash, GPay/UPI, and Card breakdowns
              </p>
            </div>
          </div>

          {/* Action Tools */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button
              onClick={exportCSV}
              style={{
                background: 'var(--bg-card)',
                border: '1px solid var(--border-subtle, #334155)',
                color: 'var(--text-primary, #ffffff)',
                padding: '8px 14px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6
              }}
              title="Export report data as CSV file"
            >
              <Download size={14} color="#38bdf8" />
              <span>Export CSV</span>
            </button>

            <button
              onClick={() => window.print()}
              style={{
                background: 'linear-gradient(135deg, #10b981, #059669)',
                color: '#062417',
                border: 'none',
                padding: '8px 16px',
                borderRadius: 6,
                fontSize: 12,
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                boxShadow: '0 2px 8px rgba(16, 185, 129, 0.3)'
              }}
            >
              <Printer size={14} />
              <span>Print Report</span>
            </button>
          </div>
        </div>

        {/* Module Sub-Navigation Tabs */}
        <div style={{
          display: 'flex',
          gap: 6,
          borderTop: '1px solid var(--border-subtle, #1e293b)',
          paddingTop: 12,
          overflowX: 'auto'
        }}>
          <button
            id="tab-report-overview"
            onClick={() => setActiveTab('overview')}
            style={{
              background: activeTab === 'overview' ? '#10b981' : 'transparent',
              color: activeTab === 'overview' ? '#062417' : 'var(--text-secondary, #94a3b8)',
              border: 'none',
              padding: '8px 16px',
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.15s ease'
            }}
          >
            <BarChart3 size={15} />
            <span>Daily Overview & Collections</span>
          </button>

          <button
            id="tab-report-sold-items"
            onClick={() => setActiveTab('sold-items')}
            style={{
              background: activeTab === 'sold-items' ? '#10b981' : 'transparent',
              color: activeTab === 'sold-items' ? '#062417' : 'var(--text-secondary, #94a3b8)',
              border: 'none',
              padding: '8px 16px',
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.15s ease'
            }}
          >
            <ShoppingBag size={15} />
            <span>Sold Items Calculation</span>
          </button>

          <button
            id="tab-report-daily-records"
            onClick={() => setActiveTab('daily-records')}
            style={{
              background: activeTab === 'daily-records' ? '#10b981' : 'transparent',
              color: activeTab === 'daily-records' ? '#062417' : 'var(--text-secondary, #94a3b8)',
              border: 'none',
              padding: '8px 16px',
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.15s ease'
            }}
          >
            <FileSpreadsheet size={15} />
            <span>Daily Sales Record (Day-by-Day)</span>
          </button>

          <button
            id="tab-report-bills"
            onClick={() => setActiveTab('bills')}
            style={{
              background: activeTab === 'bills' ? '#10b981' : 'transparent',
              color: activeTab === 'bills' ? '#062417' : 'var(--text-secondary, #94a3b8)',
              border: 'none',
              padding: '8px 16px',
              borderRadius: 8,
              fontWeight: 700,
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              transition: 'all 0.15s ease'
            }}
          >
            <Clock size={15} />
            <span>Completed Bills History</span>
          </button>
        </div>
      </div>

      {/* Filter Ribbon: Date Presets & Inputs */}
      <div style={{
        background: 'var(--bg-surface, #111827)',
        border: '1px solid var(--border-subtle, #1e293b)',
        borderRadius: 10,
        padding: '12px 18px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: 12
      }}>
        {/* Quick Date Presets */}
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted, #64748b)', textTransform: 'uppercase', marginRight: 4 }}>
            Quick Filter:
          </span>
          <button
            onClick={() => setQuickDate('today')}
            style={{
              background: selectedDate === todayStr ? '#10b98126' : 'var(--bg-card)',
              color: selectedDate === todayStr ? '#10b981' : 'var(--text-secondary)',
              border: `1px solid ${selectedDate === todayStr ? '#10b981' : 'var(--border-strong)'}`,
              padding: '4px 10px',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Today
          </button>
          <button
            onClick={() => setQuickDate('yesterday')}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid #334155',
              color: 'var(--text-secondary)',
              padding: '4px 10px',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Yesterday
          </button>
          <button
            onClick={() => setQuickDate('week')}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid #334155',
              color: 'var(--text-secondary)',
              padding: '4px 10px',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            Last 7 Days
          </button>
          <button
            onClick={() => setQuickDate('month')}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid #334155',
              color: 'var(--text-secondary)',
              padding: '4px 10px',
              borderRadius: 4,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer'
            }}
          >
            This Month
          </button>
        </div>

        {/* Date Inputs based on Tab */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {activeTab === 'daily-records' ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary, #94a3b8)' }}>From:</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, padding: '4px 10px' }}>
                <Calendar size={14} color="#10b981" />
                <input
                  type="date"
                  value={rangeStartDate}
                  onChange={e => setRangeStartDate(e.target.value)}
                  style={{ background: 'transparent', border: 'none', color: 'white', fontSize: 13, outline: 'none' }}
                />
              </div>
              <span style={{ fontSize: 12, color: 'var(--text-secondary, #94a3b8)' }}>To:</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, padding: '4px 10px' }}>
                <Calendar size={14} color="#10b981" />
                <input
                  type="date"
                  value={rangeEndDate}
                  onChange={e => setRangeEndDate(e.target.value)}
                  style={{ background: 'transparent', border: 'none', color: 'white', fontSize: 13, outline: 'none' }}
                />
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-secondary, #94a3b8)' }}>Selected Date:</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-input)', border: '1px solid #334155', borderRadius: 6, padding: '4px 10px' }}>
                <Calendar size={14} color="#10b981" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={e => setSelectedDate(e.target.value)}
                  style={{ background: 'transparent', border: 'none', color: 'white', fontSize: 13, outline: 'none' }}
                />
              </div>
            </div>
          )}

          <button
            onClick={loadActiveReportData}
            style={{
              background: 'var(--bg-card)',
              border: '1px solid #334155',
              color: '#38bdf8',
              padding: '6px 10px',
              borderRadius: 6,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              fontSize: 12,
              fontWeight: 700
            }}
            title="Refresh current report"
          >
            <RefreshCw size={13} className={loading ? 'spin-anim' : ''} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {/* =========================================================================
          TAB 1: DAILY OVERVIEW & REGISTER (With Cash, GPay, Card Split)
          ========================================================================= */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Top KPI Cards */}
          <div className="reports-kpi-grid">

            <div style={{ background: 'var(--bg-surface, #111827)', border: '1px solid var(--border-subtle, #1e293b)', borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Net Sales Revenue
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#10b981', fontFamily: 'JetBrains Mono', marginTop: 4 }}>
                ₹{summary?.netSales ? summary.netSales.toFixed(2) : '0.00'}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted, #64748b)', marginTop: 4 }}>
                Gross Sales: ₹{summary?.grossSales ? summary.grossSales.toFixed(2) : '0.00'}
              </div>
            </div>

            <div style={{ background: 'var(--bg-surface, #111827)', border: '1px solid var(--border-subtle, #1e293b)', borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Bills Processed
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#38bdf8', fontFamily: 'JetBrains Mono', marginTop: 4 }}>
                {summary?.totalBills || 0}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted, #64748b)', marginTop: 4 }}>
                Completed Transactions
              </div>
            </div>

            <div style={{ background: 'var(--bg-surface, #111827)', border: '1px solid var(--border-subtle, #1e293b)', borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Total Items Sold
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: '#f59e0b', fontFamily: 'JetBrains Mono', marginTop: 4 }}>
                {Number(summary?.totalItemsSold || 0).toFixed(0)} <span style={{ fontSize: 14, fontWeight: 600 }}>units</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted, #64748b)', marginTop: 4 }}>
                Across {summary?.uniqueProductsSold || 0} distinct products
              </div>
            </div>

            <div style={{ background: 'var(--bg-surface, #111827)', border: '1px solid var(--border-subtle, #1e293b)', borderRadius: 10, padding: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary, #94a3b8)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Discounts & Taxes
              </div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#f43f5e', fontFamily: 'JetBrains Mono', marginTop: 4 }}>
                -₹{summary?.discounts ? summary.discounts.toFixed(2) : '0.00'}
              </div>
              <div style={{ fontSize: 11, color: '#10b981', marginTop: 4 }}>
                Tax (GST Included): ₹{summary?.taxes ? summary.taxes.toFixed(2) : '0.00'}
              </div>
            </div>
          </div>

          {/* PAYMENT METHOD BREAKDOWN: CASH, GPAY, CARD */}
          <div style={{
            background: 'var(--bg-surface, #111827)',
            border: '1px solid var(--border-subtle, #1e293b)',
            borderRadius: 12,
            padding: 20
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary, #ffffff)' }}>
                  Payment Method Collection Register
                </h3>
                <p style={{ fontSize: 12, color: 'var(--text-secondary, #94a3b8)', marginTop: 2 }}>
                  Daily reconciliations for Cash Drawer, GPay / PhonePe / UPI, and Card POS swiping
                </p>
              </div>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#10b981', background: 'rgba(16, 185, 129, 0.15)', padding: '4px 10px', borderRadius: 20 }}>
                Total Recorded: ₹{totalCollections.toFixed(2)}
              </div>
            </div>

            <div className="reports-payment-grid">
              {/* CASH COLLECTION */}

              <div style={{
                background: '#0d1912',
                border: '1px solid rgba(16, 185, 129, 0.35)',
                borderRadius: 10,
                padding: 16,
                position: 'relative'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#34d399', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                      Cash Register
                    </span>
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#ffffff', fontFamily: 'JetBrains Mono', marginTop: 6 }}>
                      ₹{cashAmount.toFixed(2)}
                    </div>
                  </div>
                  <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(16, 185, 129, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Banknote size={22} color="#10b981" />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)', marginTop: 12, paddingTop: 8, borderTop: '1px solid rgba(16, 185, 129, 0.2)' }}>
                  <span>{paymentCounts.CASH || 0} Cash Bills</span>
                  <span>{totalCollections > 0 ? ((cashAmount / totalCollections) * 100).toFixed(0) : 0}% of Sales</span>
                </div>
              </div>

              {/* GPAY / UPI COLLECTION */}
              <div style={{
                background: '#1a102b',
                border: '1px solid rgba(168, 85, 247, 0.35)',
                borderRadius: 10,
                padding: 16,
                position: 'relative'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#c084fc', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        GPay / UPI Collection
                      </span>
                      <span style={{ background: 'rgba(168, 85, 247, 0.25)', color: '#d8b4fe', fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 3 }}>
                        QR / ONLINE
                      </span>
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#ffffff', fontFamily: 'JetBrains Mono', marginTop: 6 }}>
                      ₹{upiGpayAmount.toFixed(2)}
                    </div>
                  </div>
                  <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(168, 85, 247, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Smartphone size={22} color="#c084fc" />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)', marginTop: 12, paddingTop: 8, borderTop: '1px solid rgba(168, 85, 247, 0.2)' }}>
                  <span>{paymentCounts.UPI || 0} GPay/UPI Bills</span>
                  <span>{totalCollections > 0 ? ((upiGpayAmount / totalCollections) * 100).toFixed(0) : 0}% of Sales</span>
                </div>
              </div>

              {/* CARD COLLECTION */}
              <div style={{
                background: '#0c1a2e',
                border: '1px solid rgba(56, 189, 248, 0.35)',
                borderRadius: 10,
                padding: 16,
                position: 'relative'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                        Card Collection
                      </span>
                      <span style={{ background: 'rgba(56, 189, 248, 0.25)', color: '#7dd3fc', fontSize: 9, fontWeight: 800, padding: '1px 5px', borderRadius: 3 }}>
                        POS MACHINE
                      </span>
                    </div>
                    <div style={{ fontSize: 24, fontWeight: 800, color: '#ffffff', fontFamily: 'JetBrains Mono', marginTop: 6 }}>
                      ₹{cardAmount.toFixed(2)}
                    </div>
                  </div>
                  <div style={{ width: 40, height: 40, borderRadius: 8, background: 'rgba(56, 189, 248, 0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <CreditCard size={22} color="#38bdf8" />
                  </div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--text-secondary)', marginTop: 12, paddingTop: 8, borderTop: '1px solid rgba(56, 189, 248, 0.2)' }}>
                  <span>{paymentCounts.CARD || 0} Card Bills</span>
                  <span>{totalCollections > 0 ? ((cardAmount / totalCollections) * 100).toFixed(0) : 0}% of Sales</span>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Top Selling Snapshot */}
          <div style={{
            background: 'var(--bg-surface, #111827)',
            border: '1px solid var(--border-subtle, #1e293b)',
            borderRadius: 12,
            padding: 20
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary, #ffffff)' }}>
                  Fastest Moving Items ({selectedDate})
                </h3>
                <p style={{ fontSize: 12, color: 'var(--text-secondary, #94a3b8)' }}>Top ranked items by quantity sold</p>
              </div>
              <button
                onClick={() => setActiveTab('sold-items')}
                style={{
                  background: 'var(--bg-card)',
                  border: '1px solid #334155',
                  color: '#38bdf8',
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
                <span>View All Sold Items Calculation</span>
                <ArrowUpRight size={14} />
              </button>
            </div>

            <div className="responsive-table-wrapper">
              <table style={{ minWidth: 450, width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border-subtle, #2d3748)', color: 'var(--text-secondary, #94a3b8)' }}>
                    <th style={{ textAlign: 'left', paddingBottom: 8 }}>Product</th>
                    <th style={{ textAlign: 'center', paddingBottom: 8 }}>Quantity Sold</th>
                    <th style={{ textAlign: 'right', paddingBottom: 8 }}>Total Revenue</th>
                  </tr>
                </thead>
                <tbody>
                  {summaryData?.topProducts?.length === 0 ? (
                    <tr>
                      <td colSpan={3} style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)' }}>
                        No sales recorded on {selectedDate}.
                      </td>
                    </tr>
                  ) : (
                    summaryData?.topProducts?.map((p: any, idx: number) => (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <td style={{ padding: '10px 0', color: 'var(--text-primary, #ffffff)', fontWeight: 600 }}>
                          <span style={{ color: '#10b981', marginRight: 6 }}>#{idx + 1}</span> {p.product_name}
                        </td>
                        <td style={{ padding: '10px 0', textAlign: 'center', color: '#38bdf8', fontWeight: 800 }}>
                          {Number(p.total_quantity).toFixed(0)}
                        </td>
                        <td style={{ padding: '10px 0', textAlign: 'right', fontFamily: 'JetBrains Mono', color: '#10b981', fontWeight: 800 }}>
                          ₹{Number(p.total_revenue).toFixed(2)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}


      {/* =========================================================================
          TAB 2: SOLD ITEMS CALCULATION (Complete item-wise sales report)
          ========================================================================= */}
      {activeTab === 'sold-items' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Summary Metric Ribbon */}
          <div style={{
            background: 'var(--bg-surface, #111827)',
            border: '1px solid var(--border-subtle, #1e293b)',
            borderRadius: 12,
            padding: '16px 20px',
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 14
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary, #94a3b8)', textTransform: 'uppercase' }}>
                Total Quantity Sold
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#38bdf8', fontFamily: 'JetBrains Mono', marginTop: 4 }}>
                {Number(soldItemsData?.totals?.totalUnitsSold || 0).toFixed(1)} <span style={{ fontSize: 13 }}>units</span>
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                Across {soldItemsData?.totals?.uniqueProductsCount || 0} unique products
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary, #94a3b8)', textTransform: 'uppercase' }}>
                Total Item Revenue
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#10b981', fontFamily: 'JetBrains Mono', marginTop: 4 }}>
                ₹{Number(soldItemsData?.totals?.totalRevenue || 0).toFixed(2)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                Before bill-level discounts
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary, #94a3b8)', textTransform: 'uppercase' }}>
                Line Discounts Given
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#f43f5e', fontFamily: 'JetBrains Mono', marginTop: 4 }}>
                -₹{Number(soldItemsData?.totals?.totalDiscounts || 0).toFixed(2)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                Special item markdowns
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary, #94a3b8)', textTransform: 'uppercase' }}>
                Tax (GST Included)
              </div>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#fbbf24', fontFamily: 'JetBrains Mono', marginTop: 4 }}>
                ₹{Number(soldItemsData?.totals?.totalTaxes || 0).toFixed(2)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                Total GST portion
              </div>
            </div>
          </div>

          {/* Search & Table Container */}
          <div style={{
            background: 'var(--bg-surface, #111827)',
            border: '1px solid var(--border-subtle, #1e293b)',
            borderRadius: 12,
            padding: 20
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary, #ffffff)' }}>
                  Itemized Sold Products Calculation ({selectedDate})
                </h3>
                <p style={{ fontSize: 12, color: 'var(--text-secondary, #94a3b8)', marginTop: 2 }}>
                  Shows quantities sold, rates, revenues, and remaining stock for every product sold on this date
                </p>
              </div>

              {/* Filters */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  background: 'var(--bg-input)',
                  border: '1px solid #334155',
                  borderRadius: 6,
                  padding: '6px 12px',
                  gap: 8,
                  width: 240
                }}>
                  <Search size={14} color="#64748b" />
                  <input
                    type="text"
                    value={soldItemSearch}
                    onChange={e => setSoldItemSearch(e.target.value)}
                    placeholder="Search sold item / barcode..."
                    style={{ background: 'transparent', border: 'none', color: 'white', fontSize: 12, outline: 'none', width: '100%' }}
                  />
                </div>

                <select
                  value={selectedCategory}
                  onChange={e => setSelectedCategory(e.target.value)}
                  style={{
                    background: 'var(--bg-input)',
                    border: '1px solid #334155',
                    color: 'white',
                    padding: '6px 10px',
                    borderRadius: 6,
                    fontSize: 12,
                    outline: 'none'
                  }}
                >
                  <option value="">All Categories</option>
                  {categories.map((c: any) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="responsive-table-wrapper">
              <table style={{ minWidth: 800, width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>

              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-subtle, #334155)', color: 'var(--text-secondary, #94a3b8)' }}>
                  <th style={{ textAlign: 'left', padding: '10px 8px' }}>#</th>
                  <th style={{ textAlign: 'left', padding: '10px 8px' }}>Product Name</th>
                  <th style={{ textAlign: 'left', padding: '10px 8px' }}>Barcode</th>
                  <th style={{ textAlign: 'left', padding: '10px 8px' }}>Category</th>
                  <th style={{ textAlign: 'center', padding: '10px 8px' }}>Quantity Sold</th>
                  <th style={{ textAlign: 'right', padding: '10px 8px' }}>Avg Rate</th>
                  <th style={{ textAlign: 'right', padding: '10px 8px' }}>Discounts</th>
                  <th style={{ textAlign: 'right', padding: '10px 8px' }}>Total Revenue</th>
                  <th style={{ textAlign: 'center', padding: '10px 8px' }}>Available Stock</th>
                </tr>
              </thead>
              <tbody>
                {filteredSoldItems.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: 36, color: 'var(--text-muted)' }}>
                      No items sold matching your criteria on {selectedDate}.
                    </td>
                  </tr>
                ) : (
                  filteredSoldItems.map((item: any, idx: number) => {
                    const isLowStock = item.currentStock <= 5;
                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <td style={{ padding: '10px 8px', color: 'var(--text-muted)' }}>{idx + 1}</td>
                        <td style={{ padding: '10px 8px', fontWeight: 700, color: 'var(--text-primary, #ffffff)' }}>
                          {item.productName}
                        </td>
                        <td style={{ padding: '10px 8px', fontFamily: 'JetBrains Mono', color: 'var(--text-secondary)', fontSize: 12 }}>
                          {item.barcode}
                        </td>
                        <td style={{ padding: '10px 8px' }}>
                          <span style={{ background: 'var(--bg-card)', color: 'var(--text-soft)', padding: '2px 8px', borderRadius: 4, fontSize: 11 }}>
                            {item.categoryName}
                          </span>
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                          <span style={{ fontWeight: 800, color: '#38bdf8', fontSize: 14 }}>
                            {Number(item.totalQuantitySold).toFixed(1)}
                          </span>{' '}
                          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.unitName}</span>
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono' }}>
                          ₹{Number(item.avgUnitPrice).toFixed(2)}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono', color: item.totalDiscount > 0 ? '#f43f5e' : 'var(--text-muted)' }}>
                          {item.totalDiscount > 0 ? `-₹${Number(item.totalDiscount).toFixed(2)}` : '₹0.00'}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'right', fontFamily: 'JetBrains Mono', fontWeight: 800, color: '#10b981', fontSize: 14 }}>
                          ₹{Number(item.totalRevenue).toFixed(2)}
                        </td>
                        <td style={{ padding: '10px 8px', textAlign: 'center' }}>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: 4,
                            fontSize: 11,
                            fontWeight: 700,
                            background: isLowStock ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                            color: isLowStock ? '#f87171' : '#34d399'
                          }}>
                            {Number(item.currentStock).toFixed(0)} left
                          </span>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )}


      {/* =========================================================================
          TAB 3: DAILY SALES RECORD (Day-by-Day Historical Log)
          ========================================================================= */}
      {activeTab === 'daily-records' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Period Summary Metric Ribbon */}
          <div style={{
            background: 'var(--bg-surface, #111827)',
            border: '1px solid var(--border-subtle, #1e293b)',
            borderRadius: 12,
            padding: '16px 20px',
            display: 'grid',
            gridTemplateColumns: 'repeat(5, 1fr)',
            gap: 12
          }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary, #94a3b8)', textTransform: 'uppercase' }}>
                Period Revenue
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#10b981', fontFamily: 'JetBrains Mono', marginTop: 4 }}>
                ₹{Number(dailyRecordsData?.totals?.periodRevenue || 0).toFixed(2)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                Across {dailyRecordsData?.totals?.totalDays || 0} active days
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary, #94a3b8)', textTransform: 'uppercase' }}>
                Total Bills
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#38bdf8', fontFamily: 'JetBrains Mono', marginTop: 4 }}>
                {dailyRecordsData?.totals?.periodBills || 0}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                Customer transactions
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#34d399', textTransform: 'uppercase' }}>
                Cash Collections
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#ffffff', fontFamily: 'JetBrains Mono', marginTop: 4 }}>
                ₹{Number(dailyRecordsData?.totals?.periodCash || 0).toFixed(2)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                Drawer receipts
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#c084fc', textTransform: 'uppercase' }}>
                GPay / UPI Collections
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#ffffff', fontFamily: 'JetBrains Mono', marginTop: 4 }}>
                ₹{Number(dailyRecordsData?.totals?.periodUpiGpay || 0).toFixed(2)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                Online & QR transfers
              </div>
            </div>

            <div>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#38bdf8', textTransform: 'uppercase' }}>
                Card Collections
              </div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#ffffff', fontFamily: 'JetBrains Mono', marginTop: 4 }}>
                ₹{Number(dailyRecordsData?.totals?.periodCard || 0).toFixed(2)}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                Debit & Credit POS
              </div>
            </div>
          </div>

          {/* Day-by-Day Historical Log Table */}
          <div style={{
            background: 'var(--bg-surface, #111827)',
            border: '1px solid var(--border-subtle, #1e293b)',
            borderRadius: 12,
            padding: 20
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary, #ffffff)' }}>
                  Daily Sales Record (Day-by-Day Register)
                </h3>
                <p style={{ fontSize: 12, color: 'var(--text-secondary, #94a3b8)', marginTop: 2 }}>
                  Historical day-by-day sales journal with payment methods, units sold, and net income
                </p>
              </div>
            </div>

            <div className="responsive-table-wrapper">
              <table style={{ minWidth: 850, width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>

              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-subtle, #334155)', color: 'var(--text-secondary, #94a3b8)' }}>
                  <th style={{ textAlign: 'left', padding: '10px 10px' }}>Sale Date</th>
                  <th style={{ textAlign: 'center', padding: '10px 10px' }}>Bills</th>
                  <th style={{ textAlign: 'center', padding: '10px 10px' }}>Items Sold</th>
                  <th style={{ textAlign: 'right', padding: '10px 10px', color: '#34d399' }}>Cash (₹)</th>
                  <th style={{ textAlign: 'right', padding: '10px 10px', color: '#c084fc' }}>GPay / UPI (₹)</th>
                  <th style={{ textAlign: 'right', padding: '10px 10px', color: '#38bdf8' }}>Card (₹)</th>
                  <th style={{ textAlign: 'right', padding: '10px 10px' }}>Discounts</th>
                  <th style={{ textAlign: 'right', padding: '10px 10px', color: '#10b981' }}>Net Revenue</th>
                  <th style={{ textAlign: 'center', padding: '10px 10px' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {(dailyRecordsData?.records || []).length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ textAlign: 'center', padding: 36, color: 'var(--text-muted)' }}>
                      No sales records found for the period {rangeStartDate} to {rangeEndDate}.
                    </td>
                  </tr>
                ) : (
                  (dailyRecordsData?.records || []).map((r: any, idx: number) => {
                    const dateObj = new Date(r.saleDate);
                    const formattedDate = dateObj.toLocaleDateString('en-IN', {
                      weekday: 'short',
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric'
                    });

                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                        <td style={{ padding: '12px 10px', fontWeight: 700, color: 'var(--text-primary, #ffffff)' }}>
                          {formattedDate}
                        </td>
                        <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 700, color: '#38bdf8' }}>
                          {r.totalBills}
                        </td>
                        <td style={{ padding: '12px 10px', textAlign: 'center', fontWeight: 700 }}>
                          {Number(r.totalItemsSold).toFixed(0)}
                        </td>
                        <td style={{ padding: '12px 10px', textAlign: 'right', fontFamily: 'JetBrains Mono', fontWeight: 700, color: '#ffffff' }}>
                          ₹{Number(r.cashTotal).toFixed(2)}
                        </td>
                        <td style={{ padding: '12px 10px', textAlign: 'right', fontFamily: 'JetBrains Mono', fontWeight: 700, color: '#d8b4fe' }}>
                          ₹{Number(r.upiGpayTotal).toFixed(2)}
                        </td>
                        <td style={{ padding: '12px 10px', textAlign: 'right', fontFamily: 'JetBrains Mono', fontWeight: 700, color: '#7dd3fc' }}>
                          ₹{Number(r.cardTotal).toFixed(2)}
                        </td>
                        <td style={{ padding: '12px 10px', textAlign: 'right', fontFamily: 'JetBrains Mono', color: r.discounts > 0 ? '#f43f5e' : 'var(--text-muted)' }}>
                          {r.discounts > 0 ? `-₹${Number(r.discounts).toFixed(2)}` : '₹0.00'}
                        </td>
                        <td style={{ padding: '12px 10px', textAlign: 'right', fontFamily: 'JetBrains Mono', fontWeight: 800, color: '#10b981', fontSize: 14 }}>
                          ₹{Number(r.netSales).toFixed(2)}
                        </td>
                        <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                          <button
                            onClick={() => {
                              setSelectedDate(r.saleDate);
                              setActiveTab('overview');
                            }}
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
                            Inspect
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    )}


      {/* =========================================================================
          TAB 4: COMPLETED BILLS & TRANSACTIONS
          ========================================================================= */}
      {activeTab === 'bills' && (
        <div style={{
          background: 'var(--bg-surface, #111827)',
          border: '1px solid var(--border-subtle, #1e293b)',
          borderRadius: 12,
          padding: 20
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap', gap: 12 }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 800, color: 'var(--text-primary, #ffffff)' }}>
                Completed Bills on {selectedDate}
              </h3>
              <p style={{ fontSize: 12, color: 'var(--text-secondary, #94a3b8)', marginTop: 2 }}>
                Individual sales invoices with payment breakdown and cashier details
              </p>
            </div>

            {/* Payment Method Filter */}
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>Filter Payment:</span>
              {(['ALL', 'CASH', 'UPI', 'CARD'] as const).map(mode => (
                <button
                  key={mode}
                  onClick={() => setPaymentFilter(mode)}
                  style={{
                    background: paymentFilter === mode ? '#10b98126' : 'var(--bg-card)',
                    color: paymentFilter === mode ? '#10b981' : 'var(--text-secondary)',
                    border: `1px solid ${paymentFilter === mode ? '#10b981' : 'var(--border-strong)'}`,
                    padding: '4px 10px',
                    borderRadius: 4,
                    fontSize: 12,
                    fontWeight: 700,
                    cursor: 'pointer'
                  }}
                >
                  {mode === 'UPI' ? 'GPay / UPI' : mode}
                </button>
              ))}
            </div>
          </div>

          <div className="responsive-table-wrapper">
            <table style={{ minWidth: 750, width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>

            <thead>
              <tr style={{ borderBottom: '2px solid var(--border-subtle, #334155)', color: 'var(--text-secondary, #94a3b8)' }}>
                <th style={{ textAlign: 'left', padding: '10px 12px' }}>Invoice #</th>
                <th style={{ textAlign: 'left', padding: '10px 12px' }}>Time</th>
                <th style={{ textAlign: 'left', padding: '10px 12px' }}>Cashier</th>
                <th style={{ textAlign: 'left', padding: '10px 12px' }}>Customer</th>
                <th style={{ textAlign: 'center', padding: '10px 12px' }}>Items Sold</th>
                <th style={{ textAlign: 'center', padding: '10px 12px' }}>Payment Mode</th>
                <th style={{ textAlign: 'right', padding: '10px 12px' }}>Grand Total</th>
              </tr>
            </thead>
            <tbody>
              {salesList.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ textAlign: 'center', padding: 36, color: 'var(--text-muted)' }}>
                    No completed bills found on {selectedDate}.
                  </td>
                </tr>
              ) : (
                salesList.map(sale => {
                  const isUpi = (sale.payment_methods || '').includes('UPI');
                  const isCard = (sale.payment_methods || '').includes('CARD');
                  const isCash = (sale.payment_methods || '').includes('CASH');

                  return (
                    <tr key={sale.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}>
                      <td style={{ padding: '12px 12px', fontWeight: 700, color: 'var(--text-primary, #ffffff)', fontFamily: 'JetBrains Mono' }}>
                        {sale.invoice_number}
                      </td>
                      <td style={{ padding: '12px 12px', color: 'var(--text-secondary, #94a3b8)' }}>
                        {new Date(sale.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td style={{ padding: '12px 12px', color: 'var(--text-soft)' }}>{sale.cashier_name}</td>
                      <td style={{ padding: '12px 12px', color: 'var(--text-soft)' }}>{sale.customer_name || 'Walk-in Customer'}</td>
                      <td style={{ padding: '12px 12px', textAlign: 'center', fontWeight: 700, color: '#38bdf8' }}>
                        {Number(sale.item_count).toFixed(0)}
                      </td>
                      <td style={{ padding: '12px 12px', textAlign: 'center' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: 4,
                          fontSize: 11,
                          fontWeight: 700,
                          background: isUpi ? 'rgba(168, 85, 247, 0.2)' : isCard ? 'rgba(56, 189, 248, 0.2)' : 'rgba(16, 185, 129, 0.2)',
                          color: isUpi ? '#c084fc' : isCard ? '#38bdf8' : '#34d399',
                          border: `1px solid ${isUpi ? 'rgba(168, 85, 247, 0.4)' : isCard ? 'rgba(56, 189, 248, 0.4)' : 'rgba(16, 185, 129, 0.4)'}`
                        }}>
                          {isUpi ? 'GPAY / UPI' : isCard ? 'CARD' : 'CASH'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 12px', textAlign: 'right', fontFamily: 'JetBrains Mono', fontWeight: 800, color: '#10b981', fontSize: 14 }}>
                        ₹{Number(sale.grand_total).toFixed(2)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    )}
  </div>
);

};
