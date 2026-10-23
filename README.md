# AeroPOS - Production Supermarket POS & Inventory Management System

A high-speed, keyboard-friendly, desktop-first Supermarket Point of Sale (POS) and Inventory Management System designed for small to mid-sized supermarket real-world operations.

Underpinned by **PostgreSQL 18** (`supermarket_db`), **Node.js/TypeScript Express API** with strict transactional consistency and server-side RBAC, and a **React + TypeScript** POS interface optimized for speed and touchscreen ergonomics.

---

## 🌟 Key Features

### 1. Point of Sale (POS) & Fast Billing
- **Keyboard-Driven Experience**:
  - `F1`: New Bill (reset cart)
  - `F2`: Focus Barcode Scanner Input
  - `F3`: Customer Selection & Quick Registration
  - `F4`: Park / Hold Bill
  - `F5`: Retrieve Parked Bill
  - `F6` or `F10`: Checkout & Payment
  - `F9`: Remove Last Cart Item
  - `ESC`: Close Any Open Dialog
- **Native Barcode Scanner Buffer**: Audio chime feedback on successful scans, automatic quantity accumulation, instant autofocus return.
- **Transactional Consistency**: PostgreSQL `BEGIN ... COMMIT / ROLLBACK` with `SELECT ... FOR UPDATE` row locks to prevent overselling or race conditions.
- **Idempotency & Anti-Twin Bill Protection**: Client generates unique transaction keys so double-pressing complete sale never duplicates invoices.
- **Thermal Receipt Printer**: High-contrast ESC/POS format with toggleable **200** (standard supermarket) and **58mm** (compact thermal) widths, store header, tax number, itemized totals, and barcode/QR.
- **Multi-Payment Ready**: Cash (with quick-cash chips ₹100, ₹200, ₹500, ₹2000 and automatic change calculation), Card, and UPI / QR payments.
- **Cart Parking (Held Bills)**: Park interrupted bills without losing cashier context.

### 2. Stock & Traceable Inventory
- **Real-Time Dashboard**: Total products, low stock alerts, out of stock alerts, today's sales quantity, stock adjustments count, and stock valuation (cost vs. retail).
- **Audit-Proof Inventory Movements**: Direct stock updates without movement records are prohibited. Every delta creates an immutable row in `inventory_movements` with `movement_type`, `quantity_in`, `quantity_out`, and `balance_after`.
- **Goods Purchase / Inward Module**: Register supplier deliveries, enter supplier invoice numbers, batch numbers, and expiry dates (FEFO support).
- **Stock Physical Count Reconciliation**: Post adjustments (Physical Count, Damaged, Expired, Correction) with mandatory audit reasons.
- **Low Stock & Reorder Suggestions**: Automated reorder recommendations based on `max_stock_level - current_stock`.

### 3. Role-Based Access Control (RBAC) & Security
- **Strict Server-Side Enforcement**: Permissions are verified on every API request.
  - **Super Admin (`SUPER_ADMIN`)**: Full unrestricted access to Billing, Stock, Financial Reports, Staff Accounts, Email Configuration, System Backups, and Audit Logs.
  - **System Admin (`SYSTEM_ADMIN`)**: High-speed Billing, customer lookups, product price verification, and inventory status visibility. Prohibited from editing store settings, email SMTP, user accounts, or deleting records.
- **Password Security**: Passwords hashed with bcrypt (salt rounds 12).
- **Brute-Force Protection**: 5 consecutive failed login attempts trigger an automatic 15-minute account lockout.
- **Append-Only Audit Log**: Every login, sale, stock adjustment, price change, and configuration modification is recorded with timestamp, user, action, and JSON diffs.

### 4. Automated Daily Sales Email Report
- **Scheduled Cron Job**: Automatically triggers every day at configurable time (default 11:00 PM / `23:00`).
- **Comprehensive Executive Summary**:
  - Gross sales, discounts, taxes, and net collected revenue
  - Payment split breakdown (Cash, Card, UPI)
  - Top 10 selling products of the day
  - Low stock alerts and reorder warnings
  - Attached CSV report of the day's sales
- **Test Actions**: UI includes **"Send Test Verification Email"** and **"Send Test Daily Report Now"** for immediate validation.

---

## 🛠️ Architecture & Tech Stack

```
supermarket-system/
├── .env.example
├── README.md
├── package.json
├── server/
│   ├── src/
│   │   ├── config/             # DB connection pool, environment, SMTP
│   │   ├── db/
│   │   │   ├── migrations/     # Full DDL schema (001_initial_schema.sql)
│   │   │   ├── seeds/          # Seeds (001_initial_seeds.sql)
│   │   │   ├── migrate.ts      # Automated migration & seed script
│   │   │   └── verify_system.ts# Automated 31-point business verification suite
│   │   ├── middleware/         # JWT auth, RBAC permissions, audit logger
│   │   ├── services/           # Auth, Billing, Inventory, Products, Reports, Email, Settings
│   │   ├── routes/             # Express API routes
│   │   └── index.ts            # Server entry point
├── client/
│   ├── src/
│   │   ├── api/client.ts       # Typed REST API client
│   │   ├── context/            # AuthContext, POSContext
│   │   ├── styles/pos.css      # Supermarket POS CSS design system
│   │   ├── components/
│   │   │   ├── auth/           # Login screen with remember-me
│   │   │   ├── shell/          # Header, live clock, module switcher
│   │   │   ├── billing/        # POS billing, cart, payment modal, receipt preview
│   │   │   ├── stock/          # Stock dashboard, catalog, movement ledger, inward
│   │   │   ├── reports/        # Financial analytics, hourly traffic, CSV export
│   │   │   └── settings/       # Store profile, email SMTP, staff users, audit logs, backup
```

---

## 🚀 Quick Start & Setup

### 1. Prerequisites
- **Node.js**: v18 or higher (v24 LTS installed)
- **PostgreSQL**: v14 or higher (PostgreSQL 18 running on `localhost:5432`)

### 2. Configure Environment (`.env`)
Copy `.env.example` to `.env` in `server/` (or root):
```bash
cp .env.example server/.env
```
Ensure your local PostgreSQL credentials are set:
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=supermarket_db
DB_USER=postgres
DB_PASSWORD=your_password
```

### 3. Run Database Migrations & Seeds
Run the automated runner. It will verify or create `supermarket_db`, apply the schema, and seed default taxonomy and demo users:
```bash
cd server
npm run migrate
```

### 4. Run System Verification Tests
To verify all 31 business flow assertions:
```bash
npx tsx src/db/verify_system.ts
```

### 5. Start the Application
In terminal 1 (Backend API on `http://localhost:5000`):
```bash
cd server
npm run start
```

In terminal 2 (Frontend UI on `http://localhost:5173`):
```bash
cd client
npm run dev
```

Open your browser at:
👉 **`http://localhost:5173`**

---

## 🔑 Default Credentials

| Role | Username | Default Password | Access Scope |
| :--- | :--- | :--- | :--- |
| **Super Admin** | `admin` | `Admin@123` | Full access to POS, Stock, Financials, Staff, Email & Settings |
| **System Admin** | `cashier` | `Cashier@123` | High-speed POS Billing, Customer Lookup, Product & Stock Visibility |

*(Change passwords in **Settings → Staff & Roles** after first login).*
