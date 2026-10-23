# 🌐 Complete Deployment Guide: AeroPOS Anywhere

This guide explains how to deploy the **AeroPOS Supermarket Management System** to the cloud so you and your team can access and use it securely from **anywhere in the world** (laptops, phones, tablets, or POS billing counters).

---

## 📌 Architecture Overview

AeroPOS consists of three parts:
1. **Frontend**: React + Vite single-page application (touchscreen & keyboard optimized).
2. **Backend**: Node.js + Express REST API (serves transactions, inventory, auth, reports).
3. **Database**: PostgreSQL (stores inventory, movements, sales, bills, users).

> **💡 Single-Service Architecture**: The production server has been configured to serve both the Express API (`/api/*`) and the built React frontend (`/*`) from a single process. You only need to host **one Node.js service** and **one PostgreSQL database**.

---

## 🚀 Option 1: Deploy with Azure DevOps & Microsoft Azure

This is the enterprise standard if your organization uses Azure and Azure DevOps.

### Step 1: Create Azure Database for PostgreSQL (Flexible Server)
1. Log in to [Azure Portal](https://portal.azure.com).
2. Search for **Azure Database for PostgreSQL flexible servers** and click **Create**.
3. Choose a name (e.g. `aeropos-db-server`), region, and compute tier (e.g., *Burstable B1ms* for cost-effectiveness).
4. Set an admin username and password (e.g., `pgadmin` / `YourSecurePass!123`).
5. Under **Networking**, enable **"Allow public access from any Azure service within Azure to this server"** (or add your IP).
6. Create a database named `supermarket_db` inside the server.
7. Your connection string will look like:
   ```
   postgresql://pgadmin:YourSecurePass!123@aeropos-db-server.postgres.database.azure.com:5432/supermarket_db?sslmode=require
   ```

### Step 2: Create Azure App Service (Linux Web App)
1. In Azure Portal, search for **App Services** → **Create Web App**.
2. Settings:
   - **Publish**: Code
   - **Runtime stack**: Node 20 LTS
   - **Operating System**: Linux
   - **Pricing Plan**: Basic B1 or Free/Shared F1 for testing.
3. Under **Configuration → Application settings**, add the following environment variables:
   - `NODE_ENV` = `production`
   - `PORT` = `5000`
   - `DATABASE_URL` = *(Your PostgreSQL connection string from Step 1)*
   - `DB_SSL` = `true`
   - `JWT_SECRET` = *(Generate a 64-character random string)*
   - `DAILY_REPORT_ENABLED` = `true`
   - `DAILY_REPORT_CRON` = `0 23 * * *`
4. Under **General Settings**, set Startup Command:
   ```bash
   node server/dist/index.js
   ```

### Step 3: Configure Azure DevOps CI/CD Pipeline
1. In [Azure DevOps](https://dev.azure.com), create a new Project or go to your existing project.
2. Push this repository to **Azure Repos** or link your **GitHub** account.
3. Go to **Project Settings → Service Connections** → **New Service Connection** → Select **Azure Resource Manager** (Service Principal automatic) and authorize connection to your Azure Subscription.
4. Go to **Pipelines** → **New Pipeline** → Select **Azure Repos Git** (or GitHub) → Select **Existing Azure Pipelines YAML file**.
5. Select `azure-pipelines.yml` from the root of this repository.
6. In `azure-pipelines.yml`, update:
   ```yaml
   variables:
     azureSubscription: 'Your-Azure-Service-Connection-Name'
     azureWebAppName: 'your-app-service-name'
   ```
7. Click **Run**. Azure DevOps will automatically build the client, compile the server, package the zip, and deploy directly to Azure App Service!

### Step 4: Run Initial Database Migration
In Azure App Service, open **SSH** or **Console** (under Development Tools) and run:
```bash
npm run migrate
```
Your AeroPOS system is now live at: `https://your-app-service-name.azurewebsites.net`!

---

## ⚡ Option 2: 5-Minute 1-Click Deployment (Render / Railway)

If you want the quickest, hassle-free deployment accessible from anywhere with automatic HTTPS:

### Method A: Deploy on [Render.com](https://render.com)
1. **Create PostgreSQL Database**:
   - Go to Render Dashboard → **New +** → **PostgreSQL**.
   - Name: `aeropos-db`, database: `supermarket_db`.
   - Copy the **Internal Database URL** (or External Database URL).
2. **Create Web Service**:
   - Go to **New +** → **Web Service** → Connect your Git repo.
   - **Runtime**: Node
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run migrate && npm start`
   - **Environment Variables**:
     - `NODE_ENV` = `production`
     - `PORT` = `5000`
     - `DATABASE_URL` = *(Paste the Database URL from Step 1)*
     - `JWT_SECRET` = *(A secure random string)*
     - `DB_SSL` = `true`
3. Click **Deploy Web Service**.
4. In ~3 minutes, your POS will be live at `https://aeropos-xxxx.onrender.com`!

### Method B: Deploy on [Railway.app](https://railway.app)
1. Click **New Project** → **Provision PostgreSQL**.
2. In the same project, click **New** → **GitHub Repo** → Select your repo.
3. Railway automatically connects the `DATABASE_URL` from PostgreSQL to your Web service.
4. Add environment variable `JWT_SECRET`.
5. Under service settings, set Build Command: `npm install && npm run build` and Start Command: `npm run migrate && npm start`.
6. Click **Generate Domain**. You can now use your POS from any device!

---

## 🐳 Option 3: Deploy with Docker Compose on any Cloud VPS

If you have a Linux VPS (Ubuntu on Azure VM, AWS EC2, DigitalOcean droplet, or Linode):

1. **Install Docker & Docker Compose** on your VPS.
2. Clone your repository:
   ```bash
   git clone <your-repo-url>
   cd supermarket-system
   ```
3. Copy environment variables:
   ```bash
   cp .env.example .env
   # Edit .env and set strong passwords and JWT_SECRET
   nano .env
   ```
4. Start both PostgreSQL and AeroPOS:
   ```bash
   docker compose up -d --build
   ```
5. Run migrations:
   ```bash
   docker compose exec app npm run migrate
   ```
6. (Optional) Point your domain (e.g. `pos.yourstore.com`) to your VPS IP and add a free Let's Encrypt SSL certificate via Nginx or Caddy.

---

## 📱 How to Use AeroPOS Anywhere

Once deployed to a cloud URL (e.g. `https://pos.yourdomain.com`):

1. **Open on any device**:
   - Open Chrome, Safari, or Edge on any computer, iPad, Android tablet, or smartphone.
   - Navigate to your deployed URL.
2. **Log In**:
   - **Super Admin**: username `admin` / password `Admin@123` *(change upon first login in Settings)*.
   - **Cashier**: username `cashier` / password `Cashier@123`.
3. **Hardware Compatibility**:
   - **Barcode Scanners**: Any USB or Bluetooth barcode scanner acts as an input device and works out of the box.
   - **Thermal Printers**: Use browser print dialog configured for 80mm or 58mm thermal roll width, or connect network/cloud thermal receipt printers.
4. **Multiple Branches / Registers**:
   - You can open the POS from multiple counters simultaneously. PostgreSQL handles concurrent transactions with row-level locks and transaction safety (`BEGIN ... COMMIT`) to prevent duplicate bills or overselling.
