// ─── Tipos Globales de Atlas ──────────────────────────────────────────────────

export interface User {
  id: number;
  name: string;
  email: string;
  roles: string[];
  has_totp: boolean;
}

export interface Plan {
  id: number;
  name: string;
  slug: string;
  description: string;
  price: number;
  price_annual?: number;
  annual_discount_pct?: number;
  max_users?: number | null;
  max_pos?: number | null;
  sort_order?: number;
  color?: string;
  badge_text?: string;
  type: 'restaurant' | 'store';
  modules: string[];
  features?: string[];
  is_active: boolean;
  is_featured?: boolean;
  trial_days?: number;
  addons?: Addon[];
}

export interface Addon {
  id: number;
  name: string;
  slug: string;
  description: string;
  module_key: string;
  price: number;
  is_active: boolean;
}

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  business_type: 'restaurant' | 'store';
  status: 'active' | 'suspended' | 'trial' | 'cancelled' | 'setting_up';
  plan_id: number;
  plan?: Plan;
  url?: string;
  trial_ends_at?: string;
  activated_at?: string;
  created_at?: string;
}

export interface LegalDocument {
  type: 'terms' | 'privacy' | 'refund' | 'cookies' | 'contract';
  type_label: string;
  title: string;
  content: string;          // Markdown
  version: string;
  language: string;
  effective_date: string | null;
  published_at: string | null;
}

export interface AuthResponse {
  token: string;
  token_type: 'bearer';
  user: User;
  tenants: Tenant[];
}

export interface RegisterResponse {
  message: string;
  token: string;
  token_type: 'bearer';
  checkout_required: boolean;
  plan_id: number;
  user: User;
  tenant: Tenant;
}

// ─── Pasarelas de pago ────────────────────────────────────────────────────────

export interface PaymentGateway {
  id: number;
  gateway: string;
  is_sandbox: boolean;
  is_active: boolean;
  public_key: string;
  private_key_hint: string;
  events_secret_hint: string;
  integrity_secret_hint: string;
  created_at: string;
  updated_at: string;
}

export interface WompiCheckoutData {
  checkout_url: string;
  params: Record<string, string | number>;
}

export interface PaymentVerifyResult {
  status: 'pending' | 'approved' | 'declined' | 'voided' | 'error';
  type?: 'plan' | 'addon';
  reference?: string;
  amount?: number;
  metadata?: Record<string, unknown>;
}

// ─── Inventario ───────────────────────────────────────────────────────────────

export interface Category {
  id: number;
  name: string;
  slug: string;
  parent_id?: number;
  children?: Category[];
}

export interface Product {
  id: number;
  name: string;
  sku: string;
  barcode?: string;
  description?: string;
  price: number;
  cost: number;
  stock: number;
  min_stock: number;
  category_id: number;
  category?: Category;
  image_url?: string;
  is_active: boolean;
  unit?: string;
  track_inventory?: boolean;
  allow_negative_stock?: boolean;
  // ─── Registro sanitario / INVIMA ─────────────────────────────────────────
  invima_code?: string;
  invima_expiry?: string;
  controlled_substance?: boolean;
  requires_prescription?: boolean;
  // Fraction fields (populated when product is a fraction in POS search)
  is_fraction?: boolean;
  fraction_id?: number;
  base_product_id?: number;
  base_product_name?: string;
  factor?: number;
}

// ─── Comisiones ──────────────────────────────────────────────────────────────

export interface CommissionRule {
  id: number;
  name: string;
  applies_to: 'all' | 'category' | 'product';
  entity_id?: number;
  entity_name?: string;
  type: 'percentage' | 'fixed';
  value: number;
  is_active: boolean;
  notes?: string;
}

export interface Commission {
  id: number;
  sale_id: number;
  user_id: number;
  product_id?: number;
  product_name?: string;
  rule_id?: number;
  rule?: CommissionRule;
  sale_amount: number;
  commission_rate: number;
  commission_amount: number;
  status: 'pending' | 'approved' | 'paid' | 'cancelled';
  paid_at?: string;
  created_at?: string;
}

export interface CommissionSummaryRow {
  user_id: number;
  user_name: string;
  total_records: number;
  total_commission: number;
  pending: number;
  paid: number;
}

// ─── Cuentas de Cobro ────────────────────────────────────────────────────────

export interface CollectionAccountEntity {
  id: number;
  name: string;
  type: 'eps' | 'insurance' | 'fund' | 'other';
  nit?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  address?: string;
  is_active: boolean;
  notes?: string;
}

export interface CollectionAccountItem {
  id?: number;
  description: string;
  quantity: number;
  unit?: string;
  unit_price: number;
  tax_rate?: number;
  tax_amount?: number;
  subtotal?: number;
}

export interface CollectionAccount {
  id: number;
  account_number: string;
  entity_id: number;
  entity?: CollectionAccountEntity;
  period_from: string;
  period_to: string;
  due_date: string;
  status: 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';
  subtotal: number;
  tax: number;
  total: number;
  amount_paid: number;
  paid_at?: string;
  concept: string;
  notes?: string;
  items?: CollectionAccountItem[];
  created_at?: string;
}

// ─── Documento Soporte Electrónico ────────────────────────────────────────────

export interface ElectronicSupportDocItem {
  id?: number;
  product_id?: number;
  description: string;
  quantity: number;
  unit?: string;
  unit_price: number;
  discount?: number;
  tax_rate?: number;
  tax_amount?: number;
  subtotal?: number;
}

export interface ElectronicSupportDoc {
  id: number;
  doc_number: string;
  supplier_id: number;
  supplier?: Supplier;
  purchase_order_id?: number;
  doc_date: string;
  status: 'draft' | 'issued' | 'accepted' | 'rejected';
  subtotal: number;
  tax: number;
  total: number;
  notes?: string;
  cuds?: string;
  qr_data?: string;
  issued_at?: string;
  items?: ElectronicSupportDocItem[];
  created_at?: string;
}

// ─── Promociones ─────────────────────────────────────────────────────────────

export interface Promotion {
  id: number;
  name: string;
  type: 'percentage' | 'fixed' | 'bogo' | 'quantity_discount';
  discount_value: number;
  applies_to: 'all' | 'category' | 'product';
  entity_id?: number;
  entity_name?: string;
  min_quantity: number;
  min_amount?: number;
  bogo_buy?: number;
  bogo_get?: number;
  starts_at?: string;
  ends_at?: string;
  is_active: boolean;
  notes?: string;
  created_at?: string;
}

export interface KardexEntry {
  id: number;
  product_id: number;
  product?: Product;
  type: 'in' | 'out' | 'adjustment';
  quantity: number;
  balance: number;
  reference?: string;
  notes?: string;
  created_at: string;
}

// ─── PDV ──────────────────────────────────────────────────────────────────────

export interface CartItem {
  product: Product;
  quantity: number;
  unit_price: number;
  subtotal: number;
  discount?: number;
}

export interface Sale {
  id: number;
  code: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
  payment_method: 'cash' | 'card' | 'transfer';
  status: 'completed' | 'cancelled' | 'pending';
  notes?: string;
  customer_id?: number;
  customer?: { id: number; name: string; email?: string; phone?: string };
  created_at: string;
  synced: boolean; // Para modo offline
}

// ─── Mesas (Restaurante) ──────────────────────────────────────────────────────

export type TableStatus = 'available' | 'occupied' | 'reserved' | 'billing';

export interface Table {
  id: number;
  number: number;
  name: string;
  capacity: number;
  status: TableStatus;
  current_order?: TableOrder;
}

export interface TableOrder {
  id: number;
  table_id: number;
  items: TableOrderItem[];
  status: 'open' | 'closed' | 'cancelled';
  total: number;
  created_at: string;
}

export interface TableOrderItem {
  id: number;
  product_id: number;
  product?: Product;
  quantity: number;
  unit_price: number;
  notes?: string;
  status: 'pending' | 'preparing' | 'ready' | 'served';
}

// ─── Proveedores ──────────────────────────────────────────────────────────────

export interface Supplier {
  id: number;
  name: string;
  document_type: 'NIT' | 'CC' | 'CE' | 'PASSPORT';
  document_number?: string;
  email?: string;
  phone?: string;
  address?: string;
  contact_name?: string;
  notes?: string;
  is_active: boolean;
}

// ─── API Response wrappers ────────────────────────────────────────────────────

export interface PaginatedResponse<T> {
  data: T[];
  current_page: number;
  last_page: number;
  per_page: number;
  total: number;
}

export interface ApiError {
  message: string;
  errors?: Record<string, string[]>;
}

// ─── Referidos ────────────────────────────────────────────────────────────────

export interface Referrer {
  id: number;
  name: string;
  email?: string;
  phone?: string;
  document?: string;
  document_type?: 'CC' | 'CE' | 'NIT' | 'TI' | 'PP' | 'RC';
  notes?: string;
  is_active: boolean;
  payment_info?: {
    bank?: string;
    account_type?: string;
    account_number?: string;
  };
  // Aggregates (from API)
  pending_commissions_count?: number;
  total_earned?: number;
  pending_amount?: number;
  agreements?: ReferralAgreement[];
  created_at?: string;
}

export interface ReferralAgreement {
  id: number;
  referrer_id: number;
  referrer?: Referrer;
  customer_id?: number;
  name: string;
  type: 'percentage' | 'fixed';
  rate: number;
  applies_to: 'all_sales' | 'specific_customer';
  status: 'active' | 'paused' | 'ended';
  starts_at: string;
  ends_at?: string;
  notes?: string;
  commissions_count?: number;
  total_commissions?: number;
  created_at?: string;
}

export interface ReferralCommission {
  id: number;
  agreement_id: number;
  agreement?: ReferralAgreement;
  referrer_id: number;
  referrer?: Referrer;
  sale_id: number;
  sale_number?: string;
  customer_id?: number;
  customer_name?: string;
  sale_amount: number;
  commission_rate: number;
  commission_type: 'percentage' | 'fixed';
  commission_amount: number;
  status: 'pending' | 'approved' | 'paid' | 'cancelled';
  paid_at?: string;
  notes?: string;
  created_at?: string;
}

export interface ReferralCommissionSummary {
  referrer_id: number;
  referrer_name: string;
  total_commissions: number;
  total_amount: number;
  pending_amount: number;
  paid_amount: number;
}
