import nodemailer from 'nodemailer';
import { pool } from '../config/db.js';
import { getDailySalesSummary } from './report.service.js';

const DEFAULT_SENDER_EMAIL = 'raamkumaar2022@gmail.com';
const DEFAULT_DAILY_REPORT_TIME = '21:00';
const DEFAULT_SUPER_ADMIN_EMAIL = 'raamkumaar2022@gmail.com';

export async function getEmailSettings() {
  const res = await pool.query(`SELECT * FROM email_settings WHERE id = 1`);

  if (res.rowCount === 0) {
    return {
      smtp_host: process.env.EMAIL_SMTP_HOST || 'smtp.gmail.com',
      smtp_port: parseInt(process.env.EMAIL_SMTP_PORT || '587', 10),
      smtp_secure: process.env.EMAIL_SMTP_SECURE === 'true',
      smtp_user: process.env.EMAIL_SMTP_USER || '',
      smtp_password: process.env.EMAIL_SMTP_PASSWORD || '',
      sender_email: process.env.EMAIL_FROM || DEFAULT_SENDER_EMAIL,
      sender_name: 'FreshMart Supermarket',
      daily_report_enabled: true,
      daily_report_time: DEFAULT_DAILY_REPORT_TIME,
      super_admin_email: process.env.SUPER_ADMIN_REPORT_EMAIL || DEFAULT_SUPER_ADMIN_EMAIL
    };
  }

  const settings = res.rows[0];
  const normalized = {
    ...settings,
    smtp_user: settings.smtp_user || process.env.EMAIL_SMTP_USER || DEFAULT_SENDER_EMAIL,
    sender_email: settings.sender_email || DEFAULT_SENDER_EMAIL,
    daily_report_time: settings.daily_report_time || DEFAULT_DAILY_REPORT_TIME,
    super_admin_email: settings.super_admin_email || DEFAULT_SUPER_ADMIN_EMAIL
  };

  const needsNormalization = (
    normalized.sender_email === 'noreply@freshmart.com' ||
    normalized.sender_email === 'owner@freshmart.com' ||
    normalized.super_admin_email === 'owner@freshmart.com' ||
    normalized.daily_report_time === '23:00'
  );

  if (needsNormalization) {
    await pool.query(
      `UPDATE email_settings
       SET sender_email = $1,
           daily_report_time = $2,
           super_admin_email = $3,
           updated_at = CURRENT_TIMESTAMP
       WHERE id = 1`,
      [DEFAULT_SENDER_EMAIL, DEFAULT_DAILY_REPORT_TIME, DEFAULT_SUPER_ADMIN_EMAIL]
    );

    normalized.sender_email = DEFAULT_SENDER_EMAIL;
    normalized.daily_report_time = DEFAULT_DAILY_REPORT_TIME;
    normalized.super_admin_email = DEFAULT_SUPER_ADMIN_EMAIL;
  }

  return normalized;
}

export async function updateEmailSettings(settings: {
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean;
  smtp_user: string;
  smtp_password?: string;
  sender_email: string;
  sender_name: string;
  daily_report_enabled: boolean;
  daily_report_time: string;
  super_admin_email: string;
}) {
  // If password is not provided or is empty, keep existing password
  let query: string;
  let params: any[];

  if (settings.smtp_password && settings.smtp_password.trim() !== '') {
    query = `
      UPDATE email_settings
      SET smtp_host = $1,
          smtp_port = $2,
          smtp_secure = $3,
          smtp_user = $4,
          smtp_password = $5,
          sender_email = $6,
          sender_name = $7,
          daily_report_enabled = $8,
          daily_report_time = $9,
          super_admin_email = $10,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
      RETURNING id, smtp_host, smtp_port, smtp_secure, smtp_user, sender_email, sender_name, daily_report_enabled, daily_report_time, super_admin_email
    `;
    params = [
      settings.smtp_host,
      settings.smtp_port,
      settings.smtp_secure,
      settings.smtp_user,
      settings.smtp_password,
      settings.sender_email,
      settings.sender_name,
      settings.daily_report_enabled,
      settings.daily_report_time,
      settings.super_admin_email
    ];
  } else {
    query = `
      UPDATE email_settings
      SET smtp_host = $1,
          smtp_port = $2,
          smtp_secure = $3,
          smtp_user = $4,
          sender_email = $5,
          sender_name = $6,
          daily_report_enabled = $7,
          daily_report_time = $8,
          super_admin_email = $9,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = 1
      RETURNING id, smtp_host, smtp_port, smtp_secure, smtp_user, sender_email, sender_name, daily_report_enabled, daily_report_time, super_admin_email
    `;
    params = [
      settings.smtp_host,
      settings.smtp_port,
      settings.smtp_secure,
      settings.smtp_user,
      settings.sender_email,
      settings.sender_name,
      settings.daily_report_enabled,
      settings.daily_report_time,
      settings.super_admin_email
    ];
  }

  const res = await pool.query(query, params);
  return res.rows[0];
}

export async function createTransporter() {
  const settings = await getEmailSettings();
  const host = settings.smtp_host || process.env.EMAIL_SMTP_HOST || 'smtp.gmail.com';
  const port = Number(settings.smtp_port || process.env.EMAIL_SMTP_PORT || 587);
  const secure = Boolean(settings.smtp_secure);
  const user = settings.smtp_user || process.env.EMAIL_SMTP_USER || '';
  const pass = settings.smtp_password || process.env.EMAIL_SMTP_PASSWORD || '';

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: user ? { user, pass } : undefined,
    tls: {
      rejectUnauthorized: false // Allow local/self-signed certs in enterprise testing
    }
  });
}

export async function sendTestEmail(recipientEmail: string) {
  const settings = await getEmailSettings();
  const transporter = await createTransporter();

  const storeRes = await pool.query(`SELECT store_name FROM store_settings LIMIT 1`);
  const storeName = storeRes.rows[0]?.store_name || 'AeroPOS Supermarket';

  const mailOptions = {
    from: `"${settings.sender_name || storeName}" <${settings.sender_email || 'noreply@freshmart.com'}>`,
    to: recipientEmail,
    subject: `[Test] AeroPOS Supermarket Email System Verification`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
        <div style="background-color: #10b981; color: white; padding: 20px; text-align: center;">
          <h2 style="margin: 0;">${storeName}</h2>
          <p style="margin: 5px 0 0; opacity: 0.9;">SMTP Test Notification</p>
        </div>
        <div style="padding: 24px; color: #334155; line-height: 1.6;">
          <p>Hello Administrator,</p>
          <p>Your Supermarket Management System email server is <strong>configured and operating properly</strong>.</p>
          <div style="background-color: #f8fafc; border-left: 4px solid #10b981; padding: 12px; margin: 16px 0;">
            <p style="margin: 0; font-size: 14px;"><strong>SMTP Server:</strong> ${settings.smtp_host}:${settings.smtp_port}</p>
            <p style="margin: 4px 0 0; font-size: 14px;"><strong>Sender:</strong> ${settings.sender_email}</p>
            <p style="margin: 4px 0 0; font-size: 14px;"><strong>Timestamp:</strong> ${new Date().toLocaleString()}</p>
          </div>
          <p>Automated daily sales reports will be dispatched to your registered address at <strong>${settings.daily_report_time}</strong>.</p>
        </div>
      </div>
    `
  };

  const info = await transporter.sendMail(mailOptions);
  return { success: true, messageId: info.messageId, recipient: recipientEmail };
}

export async function sendDailySalesReport(targetDate?: string, forcedRecipient?: string) {
  const dateStr = targetDate || new Date().toISOString().split('T')[0];
  const settings = await getEmailSettings();
  const profileRecipientsRes = forcedRecipient
    ? null
    : await pool.query(`
        SELECT DISTINCT LOWER(TRIM(email)) AS email
        FROM users
        WHERE is_active = TRUE
          AND receive_daily_report = TRUE
          AND TRIM(COALESCE(email, '')) <> ''
      `);
  const recipients = forcedRecipient
    ? [forcedRecipient.trim()]
    : [...new Set([
        settings.super_admin_email || process.env.SUPER_ADMIN_REPORT_EMAIL,
        ...(profileRecipientsRes?.rows.map(row => row.email) || [])
      ].filter((email): email is string => Boolean(email && email.trim())).map(email => email.trim().toLowerCase()))];

  if (recipients.length === 0) {
    throw new Error('No daily-report recipient email is configured.');
  }

  const storeRes = await pool.query(`SELECT store_name, currency_symbol FROM store_settings LIMIT 1`);
  const storeName = storeRes.rows[0]?.store_name || 'FreshMart Supermarket';
  const currency = storeRes.rows[0]?.currency_symbol || '₹';

  const data = await getDailySalesSummary(dateStr);
  const { summary, topProducts, paymentBreakdown } = data;

  // Build top products table HTML
  const topProductsHtml = topProducts.map((p: any, idx: number) => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; font-size: 13px;">${idx + 1}. ${p.product_name}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: center; font-size: 13px;">${p.total_quantity}</td>
      <td style="padding: 8px; border-bottom: 1px solid #e2e8f0; text-align: right; font-size: 13px; font-weight: bold;">${currency}${Number(p.total_revenue).toFixed(2)}</td>
    </tr>
  `).join('') || `<tr><td colspan="3" style="padding: 12px; text-align: center; color: #94a3b8;">No products sold on this date.</td></tr>`;

  // Build CSV content as an attachment
  let csvContent = `Product,Quantity Sold,Revenue (${currency})\n`;
  topProducts.forEach((p: any) => {
    csvContent += `"${p.product_name.replace(/"/g, '""')}",${p.total_quantity},${Number(p.total_revenue).toFixed(2)}\n`;
  });

  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 650px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 10px; overflow: hidden; background-color: #ffffff;">
      <div style="background: linear-gradient(135deg, #059669, #10b981); color: #ffffff; padding: 24px; text-align: center;">
        <h1 style="margin: 0; font-size: 24px; font-weight: 700;">${storeName}</h1>
        <p style="margin: 6px 0 0; font-size: 15px; opacity: 0.9;">End of Day Business Report - ${dateStr}</p>
      </div>

      <div style="padding: 24px;">
        <!-- KPI Cards -->
        <div style="display: flex; gap: 12px; margin-bottom: 24px;">
          <div style="flex: 1; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 14px; text-align: center;">
            <div style="color: #166534; font-size: 12px; font-weight: 600; text-transform: uppercase;">Net Revenue</div>
            <div style="color: #15803d; font-size: 22px; font-weight: 700; margin-top: 4px;">${currency}${summary.netSales.toFixed(2)}</div>
          </div>
          <div style="flex: 1; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 14px; text-align: center;">
            <div style="color: #1e40af; font-size: 12px; font-weight: 600; text-transform: uppercase;">Total Bills</div>
            <div style="color: #1d4ed8; font-size: 22px; font-weight: 700; margin-top: 4px;">${summary.totalBills}</div>
          </div>
          <div style="flex: 1; background: #fefce8; border: 1px solid #fef08a; border-radius: 8px; padding: 14px; text-align: center;">
            <div style="color: #854d0e; font-size: 12px; font-weight: 600; text-transform: uppercase;">Items Sold</div>
            <div style="color: #a16207; font-size: 22px; font-weight: 700; margin-top: 4px;">${summary.totalItemsSold}</div>
          </div>
        </div>

        <!-- Financial Breakdown -->
        <h3 style="color: #1e293b; margin: 0 0 12px; font-size: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">Sales & Collection Breakdown</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
          <tr>
            <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Gross Sales</td>
            <td style="padding: 8px 0; text-align: right; font-weight: 600; font-size: 14px;">${currency}${summary.grossSales.toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #dc2626; font-size: 14px;">Discounts Given</td>
            <td style="padding: 8px 0; text-align: right; font-weight: 600; font-size: 14px; color: #dc2626;">-${currency}${summary.discounts.toFixed(2)}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #64748b; font-size: 14px;">Taxes Collected</td>
            <td style="padding: 8px 0; text-align: right; font-weight: 600; font-size: 14px;">${currency}${summary.taxes.toFixed(2)}</td>
          </tr>
          <tr style="border-top: 1px solid #cbd5e1; border-bottom: 1px solid #cbd5e1;">
            <td style="padding: 10px 0; font-weight: 700; font-size: 15px; color: #0f172a;">Net Collected Sales</td>
            <td style="padding: 10px 0; text-align: right; font-weight: 700; font-size: 16px; color: #059669;">${currency}${summary.netSales.toFixed(2)}</td>
          </tr>
        </table>

        <!-- Payment Modes -->
        <h3 style="color: #1e293b; margin: 0 0 12px; font-size: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">Payment Method Split</h3>
        <div style="display: flex; gap: 8px; margin-bottom: 24px;">
          <div style="flex: 1; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; text-align: center;">
            <div style="color: #64748b; font-size: 12px;">Cash</div>
            <div style="font-weight: 700; font-size: 15px; color: #0f172a; margin-top: 2px;">${currency}${(paymentBreakdown.CASH || 0).toFixed(2)}</div>
          </div>
          <div style="flex: 1; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; text-align: center;">
            <div style="color: #64748b; font-size: 12px;">Card</div>
            <div style="font-weight: 700; font-size: 15px; color: #0f172a; margin-top: 2px;">${currency}${(paymentBreakdown.CARD || 0).toFixed(2)}</div>
          </div>
          <div style="flex: 1; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px; text-align: center;">
            <div style="color: #64748b; font-size: 12px;">UPI</div>
            <div style="font-weight: 700; font-size: 15px; color: #0f172a; margin-top: 2px;">${currency}${(paymentBreakdown.UPI || 0).toFixed(2)}</div>
          </div>
        </div>

        <!-- Top Selling Products -->
        <h3 style="color: #1e293b; margin: 0 0 12px; font-size: 16px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">Top Selling Products</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 24px;">
          <thead>
            <tr style="background-color: #f8fafc;">
              <th style="padding: 8px; text-align: left; font-size: 12px; color: #475569;">Product</th>
              <th style="padding: 8px; text-align: center; font-size: 12px; color: #475569;">Qty Sold</th>
              <th style="padding: 8px; text-align: right; font-size: 12px; color: #475569;">Revenue</th>
            </tr>
          </thead>
          <tbody>
            ${topProductsHtml}
          </tbody>
        </table>

        <!-- Alerts -->
        ${summary.lowStockCount > 0 ? `
          <div style="background: #fff1f2; border: 1px solid #fecdd3; border-radius: 8px; padding: 12px; margin-bottom: 20px;">
            <strong style="color: #9f1239; font-size: 14px;">⚠️ Inventory Alert:</strong>
            <p style="margin: 4px 0 0; font-size: 13px; color: #881337;">There are currently <strong>${summary.lowStockCount}</strong> product(s) at or below minimum stock level requiring reorder.</p>
          </div>
        ` : ''}

        <p style="font-size: 12px; color: #94a3b8; text-align: center; margin: 24px 0 0;">
          This is an automated executive summary generated by AeroPOS Supermarket Management System.
        </p>
      </div>
    </div>
  `;

  let emailSent = false;
  let errorMsg = '';

  try {
    const transporter = await createTransporter();
    await transporter.sendMail({
      from: `"${settings.sender_name || storeName}" <${settings.sender_email || 'noreply@freshmart.com'}>`,
      to: recipients,
      subject: `[Daily Sales] ${storeName} Report - ${dateStr} (${currency}${summary.netSales.toFixed(2)})`,
      html,
      attachments: [
        {
          filename: `Daily_Sales_Report_${dateStr}.csv`,
          content: csvContent,
          contentType: 'text/csv'
        }
      ]
    });
    emailSent = true;
  } catch (err: any) {
    errorMsg = err.message || 'SMTP delivery failed';
    console.error('[DAILY SALES EMAIL ERROR]:', err);
  }

  // Record in daily_sales_reports archive
  await pool.query(
    `INSERT INTO daily_sales_reports (
      report_date, total_bills, gross_sales, discounts, taxes, net_sales,
      cash_sales, card_sales, upi_sales, items_sold_count, top_products,
      low_stock_count, email_sent, email_sent_at, created_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, CURRENT_TIMESTAMP)
    ON CONFLICT (report_date) DO UPDATE
    SET total_bills = EXCLUDED.total_bills,
        gross_sales = EXCLUDED.gross_sales,
        discounts = EXCLUDED.discounts,
        taxes = EXCLUDED.taxes,
        net_sales = EXCLUDED.net_sales,
        cash_sales = EXCLUDED.cash_sales,
        card_sales = EXCLUDED.card_sales,
        upi_sales = EXCLUDED.upi_sales,
        items_sold_count = EXCLUDED.items_sold_count,
        top_products = EXCLUDED.top_products,
        low_stock_count = EXCLUDED.low_stock_count,
        email_sent = EXCLUDED.email_sent,
        email_sent_at = EXCLUDED.email_sent_at`,
    [
      dateStr,
      summary.totalBills,
      summary.grossSales,
      summary.discounts,
      summary.taxes,
      summary.netSales,
      summary.cashSales,
      summary.cardSales,
      summary.upiSales,
      summary.totalItemsSold,
      JSON.stringify(topProducts),
      summary.lowStockCount,
      emailSent,
      emailSent ? new Date() : null
    ]
  );

  if (!emailSent) {
    throw new Error(`Email dispatch failed: ${errorMsg}`);
  }

  return {
    success: true,
    recipient: recipients.join(', '),
    recipients,
    reportDate: dateStr,
    summary
  };
}
