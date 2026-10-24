export interface User {
  id: string;
  username: string;
  email: string;
  fullName: string;
  phone?: string;
  avatarUrl?: string;
  receive_daily_report?: boolean;
  viewable_password?: string;
  roles: string[];
  permissions: string[];
}

export interface Unit {
  id: string;
  name: string;
  allow_decimals: boolean;
}

export interface Category {
  id: string;
  name: string;
  code: string;
  color?: string;
  icon?: string;
  display_order: number;
  product_count?: number;
}

export interface Supplier {
  id: string;
  name: string;
  contact_person?: string;
  phone?: string;
  email?: string;
  address?: string;
  payment_terms?: string;
  product_count?: number;
}

export interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  loyalty_points?: number;
}

export interface Product {
  id: string;
  sku: string;
  barcode: string;
  name: string;
  short_name?: string;
  category_id?: string;
  category_name?: string;
  category_color?: string;
  unit_id: string;
  unit_name?: string;
  allow_decimals?: boolean;
  supplier_id?: string;
  supplier_name?: string;
  purchase_price: number;
  selling_price: number;
  mrp: number;
  tax_rate: number;
  current_stock: number;
  total_sold?: number;
  min_stock_level: number;
  max_stock_level: number;
  has_expiry: boolean;
  has_batch: boolean;
  is_active: boolean;
}

export interface CartItem {
  product: Product;
  quantity: number;
  unitPrice: number;
  mrp: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
}

export interface PaymentItem {
  paymentMethod: 'CASH' | 'CARD' | 'UPI' | 'SPLIT';
  amount: number;
  tenderedAmount?: number;
  changeAmount?: number;
  referenceNumber?: string;
}

export interface SaleSummary {
  id: string;
  invoice_number: string;
  subtotal: number;
  discount_amount: number;
  tax_amount: number;
  round_off: number;
  grand_total: number;
  status: string;
  cashier_name: string;
  customer_name: string;
  created_at: string;
  items?: any[];
  payments?: PaymentItem[];
}

export interface InventoryMovement {
  id: string;
  movement_type: string;
  quantity_in: number;
  quantity_out: number;
  balance_after: number;
  reference_type: string;
  reference_id: string;
  notes?: string;
  created_at: string;
  product_name: string;
  barcode: string;
  sku: string;
  unit_name?: string;
  user_name?: string;
}

export interface StockFieldConfigItem {
  enabled: boolean;
  required: boolean;
  label: string;
  description?: string;
}

export type StockFieldConfig = Record<string, StockFieldConfigItem>;

export interface StoreSettings {
  store_name: string;
  address: string;
  phone: string;
  email: string;
  tax_number: string;
  gst_number?: string;
  enable_gst?: boolean;
  fssai_number?: string;
  enable_fssai?: boolean;
  logo_url?: string;
  currency_symbol: string;
  receipt_header: string;
  receipt_footer: string;
  receipt_width: string;
  enable_tax_inclusive: boolean;
  enable_round_off: boolean;
  stock_field_config?: StockFieldConfig;
}

export interface EmailSettings {
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
}

export interface ProposedAdjustment {
  rawItem: string;
  matchedProductId: string | null;
  matchedProductName: string | null;
  currentStock: number;
  changeQuantity: number;
  newStock: number;
  adjustmentType: 'PHYSICAL_COUNT' | 'DAMAGED' | 'EXPIRED' | 'CORRECTION';
  reason: string;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  status: 'READY' | 'NEEDS_MATCH' | 'ERROR';
  note?: string;
}

export interface AiChatMessage {
  id: string;
  sender: 'user' | 'assistant';
  text: string;
  timestamp: string;
  imagePreview?: string;
  extractedItems?: ProposedAdjustment[];
  action?: 'PROPOSE_ADJUSTMENT' | 'GENERAL_CHAT' | 'INVENTORY_QUERY';
  applied?: boolean;
  appliedDocumentNumber?: string;
}

export interface AiStatusResponse {
  configured: boolean;
  model: string;
  multimodalSupported: boolean;
  capabilities: string[];
}

