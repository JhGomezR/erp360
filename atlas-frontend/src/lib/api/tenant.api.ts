import apiClient, { tenantApiClient, getToken } from './axios';
import type {
  Product, Category, Sale, Supplier, Table,
  TableOrder, TableOrderItem, PaginatedResponse, KardexEntry,
} from '@/types';

// ─── Slug activo (se fija al entrar al layout del tenant) ────────────────────
let currentSlug = '';
export const setTenantSlug = (slug: string) => { currentSlug = slug; };
export const getTenantSlug = () => currentSlug;

// ─── Helper: request autenticado al schema tenant /{slug}/api/... ────────────
const t = <T = unknown>(
  method: 'get' | 'post' | 'put' | 'patch' | 'delete',
  url: string,
  data?: unknown,
  params?: unknown,
) =>
  tenantApiClient.request<T>({
    method,
    url: `/${currentSlug}/api${url}`,
    data,
    params,
  } as Parameters<typeof tenantApiClient.request>[0]);

// ─── Auth Tenant ──────────────────────────────────────────────────────────────
export const tenantAuthApi = {
  /** Intercambia el token central (Sanctum) por un token del guard 'tenant' sin pedir contraseña. */
  exchange: (slug: string) =>
    tenantApiClient.post(
      `/${slug}/api/auth/exchange`,
      null,
      { headers: { Authorization: `Bearer ${getToken()}` } },
    ),
  login: (slug: string, email: string, password: string) =>
    tenantApiClient.post(`/${slug}/api/auth/login`, { email, password }),
  me: () => t('get', '/auth/me'),
};

// ─── Dashboard ────────────────────────────────────────────────────────────────
export const dashboardApi = {
  summary: () => t('get', '/dashboard/summary'),
  salesChart: (period: 'week' | 'month' | 'year' = 'month') =>
    t('get', '/dashboard/sales-chart', undefined, { period }),
};

// ─── Inventory ────────────────────────────────────────────────────────────────
export const productsApi = {
  list: (params?: { search?: string; category_id?: number; page?: number; per_page?: number }) =>
    t<PaginatedResponse<Product>>('get', '/inventory/products', undefined, params),
  get: (id: number) => t<Product>('get', `/inventory/products/${id}`),
  create: (data: Partial<Product>) => t<Product>('post', '/inventory/products', data),
  update: (id: number, data: Partial<Product>) => t<Product>('put', `/inventory/products/${id}`, data),
  delete: (id: number) => t('delete', `/inventory/products/${id}`),
  kardex: (id: number) => t<KardexEntry[]>('get', `/inventory/products/${id}/kardex`),
  adjustStock: (id: number, quantity: number, reason: string) =>
    t('post', `/inventory/products/${id}/adjust-stock`, { quantity, reason }),
  /** Importación masiva: envía filas ya parseadas como JSON (el cliente ya procesó el XLSX/CSV). */
  importRows: (rows: Record<string, string>[]) =>
    t<{ imported: number; errors: { row: number; message: string }[] }>(
      'post', '/inventory/products/import', { rows },
    ),
  /** Actualización masiva de precio/costo/stock mínimo/INVIMA por ID. */
  bulkUpdate: (updates: { id: number; sale_price?: number; cost_price?: number; min_stock?: number; invima_code?: string; invima_expiry?: string; controlled_substance?: boolean; requires_prescription?: boolean; is_active?: boolean }[]) =>
    t<{ updated: number }>('patch', '/inventory/products/bulk-update', { updates }),
  findByBarcode: (code: string) => t<Product>('get', `/inventory/products/barcode/${code}`),
};

export const categoriesApi = {
  list: () => t<Category[]>('get', '/inventory/categories'),
  create: (data: Partial<Category>) => t<Category>('post', '/inventory/categories', data),
  update: (id: number, data: Partial<Category>) => t<Category>('put', `/inventory/categories/${id}`, data),
  delete: (id: number) => t('delete', `/inventory/categories/${id}`),
};

export const stockAlertsApi = {
  list: () => t('get', '/inventory/stock-alerts'),
  update: (productId: number, data: { min_stock: number }) =>
    t('patch', `/inventory/stock-alerts/${productId}`, data),
  log: () => t('get', '/inventory/stock-alerts/log'),
  acknowledge: (id: number) => t('patch', `/inventory/stock-alerts/log/${id}/acknowledge`),
};

export const promotionsApi = {
  list: (activeOnly = false) =>
    t<import('@/types').Promotion[]>('get', '/inventory/promotions', undefined, activeOnly ? { active_only: 1 } : undefined),
  get: (id: number) => t<import('@/types').Promotion>('get', `/inventory/promotions/${id}`),
  create: (data: Partial<import('@/types').Promotion>) =>
    t<import('@/types').Promotion>('post', '/inventory/promotions', data),
  update: (id: number, data: Partial<import('@/types').Promotion>) =>
    t<import('@/types').Promotion>('put', `/inventory/promotions/${id}`, data),
  toggle: (id: number) => t<{ is_active: boolean }>('patch', `/inventory/promotions/${id}/toggle`),
  delete: (id: number) => t('delete', `/inventory/promotions/${id}`),
  /** Evalúa qué descuentos aplican a los ítems del carrito. */
  apply: (items: { product_id: number; category_id?: number; quantity: number; unit_price: number }[]) =>
    t<{ items: { product_id: number; discount_per_unit: number; promotion_name: string | null }[] }>(
      'post', '/inventory/promotions/apply', { items },
    ),
};

export interface ProductBatch {
  id: number;
  product_id: number;
  batch_number: string;
  expiry_date: string | null;
  manufacture_date: string | null;
  quantity_received: number;
  quantity_remaining: number;
  unit_cost: number;
  warehouse_id?: number;
  notes?: string;
  is_active: boolean;
  days_until_expiry?: number | null;
  is_expired?: boolean;
  product?: { id: number; name: string; sku: string; unit: string };
}

// ─── Product Fractions (Add-on) ───────────────────────────────────────────────

export interface ProductFractionItem {
  id: number;
  base_product_id: number;
  name: string;
  sku: string | null;
  barcode: string | null;
  /** Cuántas unidades de esta fracción caben en 1 producto base */
  factor: number;
  sale_price: number;
  is_active: boolean;
  // Campos en shape de producto (cuando viene de search)
  is_fraction?: boolean;
  fraction_id?: number;
  base_product_name?: string;
  stock?: number;
  price?: number;
}

export const fractionsApi = {
  /** Lista fracciones de un producto base */
  list: (productId: number) =>
    t<{ product: { id: number; name: string; sku: string; unit: string; stock: number }; fractions: ProductFractionItem[] }>(
      'get', `/inventory/products/${productId}/fractions`
    ),
  /** Crea una fracción para un producto base */
  create: (productId: number, data: {
    name: string;
    sku?: string;
    barcode?: string;
    factor: number;
    sale_price: number;
  }) => t<ProductFractionItem>('post', `/inventory/products/${productId}/fractions`, data),
  /** Actualiza una fracción */
  update: (productId: number, fractionId: number, data: Partial<{
    name: string; sku: string; barcode: string; factor: number; sale_price: number; is_active: boolean;
  }>) => t<ProductFractionItem>('put', `/inventory/products/${productId}/fractions/${fractionId}`, data),
  /** Elimina una fracción */
  destroy: (productId: number, fractionId: number) =>
    t('delete', `/inventory/products/${productId}/fractions/${fractionId}`),
  /** Búsqueda para POS — retorna fracciones con shape de Product */
  search: (q: string) =>
    t<Product[]>('get', '/inventory/fractions/search', undefined, { q }),
  /** Búsqueda por código de barras para scanner — retorna shape de Product */
  findByBarcode: (code: string) =>
    t<Product>('get', `/inventory/fractions/barcode/${code}`),
};

// ─── Price Lists ──────────────────────────────────────────────────────────────

export interface PriceListItem {
  id: number;
  price_list_id: number;
  product_id: number;
  variant_id?: number | null;
  price: number;
  min_quantity: number;
  product?: Product;
}

export interface PriceList {
  id: number;
  name: string;
  description?: string | null;
  is_default: boolean;
  is_active: boolean;
  items_count?: number;
  items?: PriceListItem[];
}

export const priceListsApi = {
  list: () =>
    t<PriceList[]>('get', '/inventory/price-lists'),
  show: (id: number) =>
    t<PriceList>('get', `/inventory/price-lists/${id}`),
  create: (data: { name: string; description?: string; is_default?: boolean; is_active?: boolean }) =>
    t<PriceList>('post', '/inventory/price-lists', data),
  update: (id: number, data: Partial<{ name: string; description: string; is_default: boolean; is_active: boolean }>) =>
    t<PriceList>('put', `/inventory/price-lists/${id}`, data),
  destroy: (id: number) =>
    t('delete', `/inventory/price-lists/${id}`),
  syncItems: (id: number, items: { product_id: number; price: number; min_quantity?: number }[]) =>
    t<{ message: string; list: PriceList }>('post', `/inventory/price-lists/${id}/items`, { items }),
  removeItem: (id: number, itemId: number) =>
    t('delete', `/inventory/price-lists/${id}/items/${itemId}`),
  assignCustomer: (id: number, customer_id: number) =>
    t('patch', `/inventory/price-lists/${id}/assign-customer`, { customer_id }),
};

export const batchesApi = {
  list: (params?: { product_id?: number; expired?: boolean; expiring_days?: number }) =>
    t<{ data: ProductBatch[]; total: number; current_page: number; last_page: number }>(
      'get', '/inventory/batches', undefined, params
    ),
  expiring: (days = 30) =>
    t<{ days_window: number; count: number; batches: ProductBatch[] }>(
      'get', '/inventory/batches/expiring', undefined, { days }
    ),
  forProduct: (productId: number) =>
    t<{ product: { id: number; name: string }; batches: ProductBatch[] }>(
      'get', `/inventory/products/${productId}/batches`
    ),
  create: (data: {
    product_id: number;
    batch_number: string;
    expiry_date?: string;
    manufacture_date?: string;
    quantity: number;
    unit_cost?: number;
    warehouse_id?: number;
    notes?: string;
  }) => t<ProductBatch>('post', '/inventory/batches', data),
  adjust: (id: number, data: { quantity_remaining: number; notes: string }) =>
    t('patch', `/inventory/batches/${id}/adjust`, data),
};

export const kardexApi = {
  list: (params?: { product_id?: number; page?: number; per_page?: number }) =>
    t<{ data: { id: number; product_id: number; type: string; quantity: number; balance_stock: number; notes: string; reference_type: string; created_at: string; product?: { name: string } }[]; current_page: number; last_page: number }>(
      'get', '/inventory/kardex', undefined, params
    ),
  forProduct: (productId: number) =>
    t('get', `/inventory/kardex/${productId}`),
};

export const physicalInventoryApi = {
  list: (params?: { status?: string; warehouse_id?: number; page?: number }) =>
    t('get', '/inventory/physical', undefined, params),
  get: (id: number) => t('get', `/inventory/physical/${id}`),
  create: (data: { name: string; warehouse_id?: number; scheduled_date?: string; notes?: string }) =>
    t('post', '/inventory/physical', data),
  importStock: (id: number, params?: { category_id?: number }) =>
    t('post', `/inventory/physical/${id}/import-stock`, params),
  start: (id: number) => t('post', `/inventory/physical/${id}/start`),
  updateItem: (id: number, itemId: number, data: { counted_qty: number; location_label?: string; notes?: string }) =>
    t('put', `/inventory/physical/${id}/items/${itemId}`, data),
  complete: (id: number) => t('post', `/inventory/physical/${id}/complete`),
  forceComplete: (id: number) => t('post', `/inventory/physical/${id}/force-complete`),
  cancel: (id: number, notes?: string) => t('post', `/inventory/physical/${id}/cancel`, { notes }),
  destroy: (id: number) => t('delete', `/inventory/physical/${id}`),
};

// ─── Valoración de Inventario ─────────────────────────────────────────────────
export const valuationApi = {
  portfolio: () => t('get', '/inventory/valuation'),
  product: (productId: number) => t('get', `/inventory/valuation/${productId}`),
  updateMethod: (productId: number, method: 'fifo' | 'lifo' | 'average') =>
    t('put', `/inventory/products/${productId}/valuation`, { valuation_method: method }),
};

// ─── Pharmacy / Farmacia ──────────────────────────────────────────────────────

export interface Prescription {
  id: number;
  code: string;
  patient_name: string;
  patient_id?: string;         // Cédula / documento
  doctor_name: string;
  doctor_license?: string;
  issue_date: string;
  expiry_date?: string;
  diagnosis?: string;
  status: 'pending' | 'partial' | 'dispensed' | 'cancelled';
  notes?: string;
  items: PrescriptionItem[];
  created_at: string;
}

export interface PrescriptionItem {
  id?: number;
  product_id: number;
  product?: { id: number; name: string; sku: string };
  quantity_prescribed: number;
  quantity_dispensed: number;
  dose?: string;
  frequency?: string;
  duration?: string;
  notes?: string;
}

export interface ControlledDrugEntry {
  id: number;
  product_id: number;
  product?: { id: number; name: string; sku: string };
  batch_number?: string;
  type: 'in' | 'out';
  quantity: number;
  balance: number;
  prescription_id?: number;
  prescription_code?: string;
  patient_name?: string;
  responsible?: string;
  notes?: string;
  created_at: string;
}

export const pharmacyApi = {
  // Prescriptions
  prescriptions: (params?: { search?: string; status?: string; page?: number }) =>
    t<{ data: Prescription[]; current_page: number; last_page: number; total: number }>(
      'get', '/pharmacy/prescriptions', undefined, params
    ),
  getPrescription: (id: number) =>
    t<Prescription>('get', `/pharmacy/prescriptions/${id}`),
  createPrescription: (data: Omit<Prescription, 'id' | 'code' | 'status' | 'created_at'>) =>
    t<Prescription>('post', '/pharmacy/prescriptions', data),
  updatePrescription: (id: number, data: Partial<Prescription>) =>
    t<Prescription>('put', `/pharmacy/prescriptions/${id}`, data),
  cancelPrescription: (id: number) =>
    t('patch', `/pharmacy/prescriptions/${id}/cancel`),

  // Dispensing — dispenses from a prescription using FEFO batches
  dispense: (prescriptionId: number, items: { prescription_item_id: number; quantity: number }[]) =>
    t<Prescription>('post', `/pharmacy/prescriptions/${prescriptionId}/dispense`, { items }),

  // Controlled drugs register
  controlledRegister: (params?: { product_id?: number; page?: number; from?: string; to?: string }) =>
    t<{ data: ControlledDrugEntry[]; current_page: number; last_page: number }>(
      'get', '/pharmacy/controlled-register', undefined, params
    ),
  addControlledEntry: (data: {
    product_id: number;
    batch_number?: string;
    type: 'in' | 'out';
    quantity: number;
    prescription_id?: number;
    patient_name?: string;
    responsible?: string;
    notes?: string;
  }) => t<ControlledDrugEntry>('post', '/pharmacy/controlled-register', data),

  // Expiry dashboard — uses batches API under the hood
  expiringProducts: (days = 30) =>
    t<{ days_window: number; count: number; batches: ProductBatch[] }>(
      'get', '/inventory/batches/expiring', undefined, { days }
    ),
};

// ─── POS Printers ─────────────────────────────────────────────────────────────

export type PrinterType      = 'escpos' | 'star' | 'epson' | 'generic';
export type ConnectionType   = 'network' | 'usb' | 'serial' | 'bluetooth';

export interface PosPrinter {
  id: number;
  name: string;
  printer_type: PrinterType;
  connection_type: ConnectionType;
  host?: string | null;
  port?: number | null;
  serial_port?: string | null;
  baud_rate?: number | null;
  paper_width: 58 | 80;
  cut_paper: boolean;
  open_drawer: boolean;
  print_logo: boolean;
  header_text?: string | null;
  footer_text?: string | null;
  is_default: boolean;
  is_active: boolean;
}

export interface PrintPayload {
  format: PrinterType;
  paper_width: number;
  connection_type: ConnectionType;
  host?: string | null;
  port?: number | null;
  lines: Array<{
    type: 'text' | 'row' | 'divider' | 'cut' | 'drawer';
    content?: string;
    align?: 'left' | 'center' | 'right';
    bold?: boolean;
    left?: string;
    right?: string;
  }>;
}

// ─── Aging Buckets ────────────────────────────────────────────────────────────

export interface AgingBucket {
  id: number;
  name: string;
  from_days: number;
  to_days: number | null;   // null = abierto ("+X días")
  color: string | null;
  label: string | null;
  sort_order: number;
  is_active: boolean;
}

export const agingBucketsApi = {
  list: () =>
    t<AgingBucket[]>('get', '/config/aging-buckets'),
  create: (data: { name: string; from_days: number; to_days?: number | null; color?: string; label?: string; sort_order?: number }) =>
    t<AgingBucket>('post', '/config/aging-buckets', data),
  update: (id: number, data: Partial<{ name: string; from_days: number; to_days: number | null; color: string; label: string; sort_order: number; is_active: boolean }>) =>
    t<AgingBucket>('put', `/config/aging-buckets/${id}`, data),
  destroy: (id: number) =>
    t('delete', `/config/aging-buckets/${id}`),
};

export const printersApi = {
  list: () =>
    t<PosPrinter[]>('get', '/config/printers'),
  create: (data: Omit<PosPrinter, 'id'>) =>
    t<PosPrinter>('post', '/config/printers', data),
  update: (id: number, data: Partial<Omit<PosPrinter, 'id'>>) =>
    t<PosPrinter>('put', `/config/printers/${id}`, data),
  destroy: (id: number) =>
    t('delete', `/config/printers/${id}`),
  test: (id: number) =>
    t<{ message: string; printer: PosPrinter; print_payload: PrintPayload }>('post', `/config/printers/${id}/test`),
  printReceipt: (sale_id: number, printer_id?: number) =>
    t<{ printer: PosPrinter; print_payload: PrintPayload; instructions: Record<string, string> }>(
      'post', '/pos/print-receipt', { sale_id, printer_id }
    ),
};

// ─── Workshop / Taller ────────────────────────────────────────────────────────

export type WorkOrderStatus   = 'received' | 'diagnosed' | 'approved' | 'in_progress' | 'completed' | 'delivered' | 'cancelled';
export type WorkOrderPriority = 'low' | 'normal' | 'high' | 'urgent';
export type WorkOrderItemType = 'part' | 'service' | 'labor';

export interface WorkOrderItem {
  id: number;
  work_order_id: number;
  product_id?: number | null;
  description: string;
  type: WorkOrderItemType;
  quantity: number;
  unit_price: number;
  discount: number;
  subtotal: number;
  product?: { id: number; name: string; sku: string } | null;
}

export interface WorkOrder {
  id: number;
  order_number: string;
  customer_id?: number | null;
  customer_name: string;
  customer_phone?: string | null;
  customer_email?: string | null;
  device_type: string;
  device_brand?: string | null;
  device_model?: string | null;
  device_serial?: string | null;
  device_color?: string | null;
  accessories_received?: string | null;
  problem_description: string;
  diagnosis?: string | null;
  internal_notes?: string | null;
  customer_notes?: string | null;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  assigned_to?: number | null;
  promised_at?: string | null;
  received_at: string;
  completed_at?: string | null;
  delivered_at?: string | null;
  subtotal: number;
  total: number;
  advance_payment: number;
  balance_due: number;
  items_count?: number;
  items?: WorkOrderItem[];
  is_overdue?: boolean;
}

export interface WorkshopDashboard {
  active_by_status: Record<WorkOrderStatus, number>;
  overdue_count: number;
  urgent_count: number;
  today_deliveries: number;
  month_revenue: number;
  recent_orders: WorkOrder[];
}

export const workshopApi = {
  dashboard: () =>
    t<WorkshopDashboard>('get', '/workshop/dashboard'),
  list: (params?: {
    status?: WorkOrderStatus; priority?: WorkOrderPriority;
    search?: string; page?: number; per_page?: number;
    date_from?: string; date_to?: string;
  }) =>
    t<{ data: WorkOrder[]; last_page: number; total: number }>('get', '/workshop/orders', undefined, params),
  show: (id: number) =>
    t<WorkOrder>('get', `/workshop/orders/${id}`),
  create: (data: {
    customer_name: string; customer_phone?: string; customer_email?: string;
    device_type: string; device_brand?: string; device_model?: string;
    device_serial?: string; device_color?: string; accessories_received?: string;
    problem_description: string; priority?: WorkOrderPriority;
    promised_at?: string; advance_payment?: number;
    items?: { description: string; type: WorkOrderItemType; quantity: number; unit_price: number; discount?: number }[];
  }) =>
    t<WorkOrder>('post', '/workshop/orders', data),
  update: (id: number, data: Partial<{
    customer_name: string; customer_phone: string; customer_email: string;
    device_brand: string; device_model: string; device_serial: string; device_color: string;
    accessories_received: string; problem_description: string; diagnosis: string;
    internal_notes: string; customer_notes: string; priority: WorkOrderPriority;
    promised_at: string; advance_payment: number;
  }>) =>
    t<WorkOrder>('put', `/workshop/orders/${id}`, data),
  updateStatus: (id: number, status: WorkOrderStatus, notes?: string) =>
    t<{ message: string; work_order: WorkOrder }>('patch', `/workshop/orders/${id}/status`, { status, notes }),
  addItem: (id: number, item: { description: string; type: WorkOrderItemType; quantity: number; unit_price: number; discount?: number; product_id?: number }) =>
    t<{ item: WorkOrderItem; work_order: WorkOrder }>('post', `/workshop/orders/${id}/items`, item),
  removeItem: (id: number, itemId: number) =>
    t<{ work_order: WorkOrder }>('delete', `/workshop/orders/${id}/items/${itemId}`),
  // Garantías
  warranties: (params?: { status?: string; search?: string; expiring_days?: number }) =>
    t('get', '/workshop/warranties', undefined, params),
  getWarranty: (id: number) => t('get', `/workshop/warranties/${id}`),
  createWarranty: (data: unknown) => t('post', '/workshop/warranties', data),
  updateWarranty: (id: number, data: unknown) => t('put', `/workshop/warranties/${id}`, data),
  claimWarranty: (id: number, data: unknown) => t('post', `/workshop/warranties/${id}/claim`, data),
  // Contratos de servicio
  serviceContracts: (params?: { status?: string; search?: string }) =>
    t('get', '/workshop/service-contracts', undefined, params),
  getServiceContract: (id: number) => t('get', `/workshop/service-contracts/${id}`),
  createServiceContract: (data: unknown) => t('post', '/workshop/service-contracts', data),
  updateServiceContract: (id: number, data: unknown) => t('put', `/workshop/service-contracts/${id}`, data),
  addContractItem: (id: number, data: unknown) => t('post', `/workshop/service-contracts/${id}/items`, data),
  removeContractItem: (id: number, itemId: number) => t('delete', `/workshop/service-contracts/${id}/items/${itemId}`),
  checkContractCoverage: (id: number, serial: string) =>
    t('get', `/workshop/service-contracts/${id}/coverage-check`, undefined, { serial }),
  registerContractVisit: (id: number) => t('post', `/workshop/service-contracts/${id}/visit`),
  // Reclamaciones
  claims: (params?: { status?: string }) => t('get', '/workshop/claims', undefined, params),
  updateClaim: (id: number, data: unknown) => t('put', `/workshop/claims/${id}`, data),
  // Tarifas de mano de obra
  laborRates: () => t('get', '/workshop/labor-rates'),
  createLaborRate: (data: unknown) => t('post', '/workshop/labor-rates', data),
  updateLaborRate: (id: number, data: unknown) => t('put', `/workshop/labor-rates/${id}`, data),
  deleteLaborRate: (id: number) => t('delete', `/workshop/labor-rates/${id}`),
  // Repuestos
  spareParts: (params?: { search?: string; low_stock?: boolean }) =>
    t('get', '/workshop/spare-parts', undefined, params),
  flagSparePart: (id: number, data: { is_spare_part: boolean; reorder_point_spare?: number }) =>
    t('post', `/workshop/spare-parts/${id}/flag`, data),
};

// ─── DIAN Factura Electrónica ─────────────────────────────────────────────────

export interface DianConfig {
  id?: number;
  nit: string;
  nit_dv?: string | null;
  razon_social: string;
  tipo_persona: 'natural' | 'juridica';
  regimen: 'comun' | 'simplificado';
  actividad_economica?: string | null;
  responsabilidades_fiscales?: string | null;
  direccion?: string | null;
  ciudad?: string | null;
  departamento?: string | null;
  telefono?: string | null;
  email_dian?: string | null;
  ambiente: 'habilitacion' | 'produccion';
  soft_id?: string | null;
  soft_pin?: string | null;
  resolucion_number?: string | null;
  resolucion_from?: string | null;
  resolucion_to?: string | null;
  consecutive_from?: number | null;
  consecutive_to?: number | null;
  prefix?: string | null;
  cert_path?: string | null;
  enabled?: boolean;
  is_valid?: boolean;
}

export type RadianEventType = 'acuse_recibo' | 'rechazo' | 'recibo_bien' | 'aceptacion' | 'aceptacion_tacita';

export interface RadianEvent {
  id: number;
  cufe: string;
  invoice_number?: string | null;
  event_type: RadianEventType;
  event_code: string;
  status: 'pending' | 'sent' | 'accepted' | 'failed';
  amount?: number | null;
  notes?: string | null;
  rejection_reason?: string | null;
  sent_at?: string | null;
  created_at: string;
}

export const dianApi = {
  getConfig: () =>
    t<DianConfig>('get', '/accounting/dian/config'),
  saveConfig: (data: Partial<DianConfig>) =>
    t<{ message: string; config: DianConfig }>('put', '/accounting/dian/config', data),
  validate: () =>
    t<{ valid: boolean; errors: string[]; warnings: string[] }>('get', '/accounting/dian/validate'),
  uploadCert: (formData: FormData) =>
    tenantApiClient.post(`/${currentSlug}/api/accounting/dian/certificate`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  deleteCert: () =>
    t<{ message: string }>('delete', '/accounting/dian/certificate'),
  emitInvoice: (sale_id: number) =>
    t<{ message: string; invoice: { cufe: string; invoice_num: string; qr_data: string; environment: string; status: string } }>('post', '/accounting/dian/invoice', { sale_id }),
  invoiceStatus: (cufe: string) =>
    t<{ cufe: string; status: string; note: string }>('get', `/accounting/dian/invoice/${cufe}/status`),
  radianList: (params?: { event_type?: RadianEventType; status?: string; cufe?: string; page?: number }) =>
    t<{ data: RadianEvent[]; last_page: number; total: number }>('get', '/accounting/radian', undefined, params),
  radianStore: (data: {
    cufe: string; invoice_number?: string; event_type: RadianEventType;
    amount?: number; notes?: string; rejection_reason?: string;
  }) =>
    t<{ message: string; event: RadianEvent; success: boolean }>('post', '/accounting/radian', data),
  radianResend: (id: number) =>
    t<{ message: string; event: RadianEvent }>('post', `/accounting/radian/${id}/resend`),
};

// ─── POS ──────────────────────────────────────────────────────────────────────
export const posApi = {
  sales: (params?: { page?: number; per_page?: number; date_from?: string; date_to?: string; customer_id?: number }) =>
    t<PaginatedResponse<Sale>>('get', '/pos/sales', undefined, params),
  getSale: (id: number) => t<Sale>('get', `/pos/sales/${id}`),
  createSale: (data: {
    items: { product_id: number; fraction_id?: number; quantity: number; unit_price: number }[];
    payment_method: string;
    customer_id?: number;
    discount?: number;
    tax?: number;
    notes?: string;
  }) => t<Sale>('post', '/pos/sales', data),
  cancelSale: (id: number) => t('post', `/pos/sales/${id}/cancel`),
  syncOffline: (sales: unknown[]) => t('post', '/pos/sales/sync-offline', { sales }),
  cartera: () => t('get', '/pos/cartera'),
  returns: (params?: { page?: number }) => t('get', '/pos/returns', undefined, params),
  createReturn: (data: unknown) => t('post', '/pos/returns', data),
  getReturn: (id: number) => t('get', `/pos/returns/${id}`),
  processReturn: (id: number) => t('post', `/pos/returns/${id}/process`),
  cancelReturn: (id: number) => t('delete', `/pos/returns/${id}`),
  // QR de pago
  getPaymentQr: () => t('get', '/config/payment-qr'),
  upsertPaymentQr: (formData: FormData) => t('post', '/config/payment-qr', formData),
  deletePaymentQr: () => t('delete', '/config/payment-qr'),
};

// ─── Purchases ────────────────────────────────────────────────────────────────
export const purchasesApi = {
  list: (params?: { page?: number; status?: string; supplier_id?: number }) =>
    t('get', '/purchases/orders', undefined, params),
  get: (id: number) => t('get', `/purchases/orders/${id}`),
  create: (data: unknown) => t('post', '/purchases/orders', data),
  update: (id: number, data: unknown) => t('put', `/purchases/orders/${id}`, data),
  delete: (id: number) => t('delete', `/purchases/orders/${id}`),
  receive: (id: number, batches?: {
    product_id: number;
    batch_number: string;
    quantity: number;
    unit_cost: number;
    expiry_date?: string;
    manufacture_date?: string;
    notes?: string;
  }[]) => t('post', `/purchases/orders/${id}/receive`, batches ? { batches } : undefined),
  send: (id: number) => t('post', `/purchases/orders/${id}/send`),
  invoices: (params?: { page?: number }) => t('get', '/purchases/invoices', undefined, params),
  returns: (params?: { page?: number }) => t('get', '/purchases/returns', undefined, params),
  getReturn: (id: number) => t('get', `/purchases/returns/${id}`),
  createReturn: (data: unknown) => t('post', '/purchases/returns', data),
  updateReturnStatus: (id: number, status: string) => t('patch', `/purchases/returns/${id}/status`, { status }),
  deleteReturn: (id: number) => t('delete', `/purchases/returns/${id}`),
  // Requisiciones de Compra
  requisitions: (params?: { page?: number; status?: string; priority?: string; search?: string }) =>
    t('get', '/purchases/requisitions', undefined, params),
  getRequisition: (id: number) => t('get', `/purchases/requisitions/${id}`),
  createRequisition: (data: unknown) => t('post', '/purchases/requisitions', data),
  updateRequisition: (id: number, data: unknown) => t('put', `/purchases/requisitions/${id}`, data),
  submitRequisition: (id: number) => t('post', `/purchases/requisitions/${id}/submit`),
  approveRequisition: (id: number, data?: { notes?: string }) => t('post', `/purchases/requisitions/${id}/approve`, data),
  rejectRequisition: (id: number, data: { rejection_reason: string }) => t('post', `/purchases/requisitions/${id}/reject`, data),
  convertRequisition: (id: number, data: unknown) => t('post', `/purchases/requisitions/${id}/convert`, data),
  cancelRequisition: (id: number, data?: { notes?: string }) => t('post', `/purchases/requisitions/${id}/cancel`, data),
  deleteRequisition: (id: number) => t('delete', `/purchases/requisitions/${id}`),
  // RFQ — Solicitudes de Cotización multi-proveedor
  rfqList: (params?: { status?: string; page?: number }) =>
    t('get', '/purchases/rfq', undefined, params),
  getRfq: (id: number) => t('get', `/purchases/rfq/${id}`),
  createRfq: (data: unknown) => t('post', '/purchases/rfq', data),
  updateRfq: (id: number, data: unknown) => t('put', `/purchases/rfq/${id}`, data),
  deleteRfq: (id: number) => t('delete', `/purchases/rfq/${id}`),
  sendRfq: (id: number) => t('post', `/purchases/rfq/${id}/send`),
  addRfqSupplier: (id: number, supplier_id: number) => t('post', `/purchases/rfq/${id}/suppliers`, { supplier_id }),
  removeRfqSupplier: (id: number, supplierId: number) => t('delete', `/purchases/rfq/${id}/suppliers/${supplierId}`),
  registerRfqResponse: (id: number, supplierId: number, data: unknown) =>
    t('post', `/purchases/rfq/${id}/suppliers/${supplierId}/response`, data),
  awardRfq: (id: number, responseId: number) => t('post', `/purchases/rfq/${id}/award/${responseId}`),
  // Buzón de facturas proveedor
  vendorInvoiceStats: () => t('get', '/purchases/vendor-invoices/stats'),
  vendorInvoices: (params?: { status?: string; payment_status?: string; supplier_id?: number; overdue?: boolean; from?: string; to?: string; page?: number }) =>
    t('get', '/purchases/vendor-invoices', undefined, params),
  getVendorInvoice: (id: number) => t('get', `/purchases/vendor-invoices/${id}`),
  createVendorInvoice: (data: unknown) => t('post', '/purchases/vendor-invoices', data),
  updateVendorInvoice: (id: number, data: unknown) => t('put', `/purchases/vendor-invoices/${id}`, data),
  reviewVendorInvoice: (id: number) => t('post', `/purchases/vendor-invoices/${id}/review`),
  approveVendorInvoice: (id: number) => t('post', `/purchases/vendor-invoices/${id}/approve`),
  rejectVendorInvoice: (id: number, reason?: string) => t('post', `/purchases/vendor-invoices/${id}/reject`, { reason }),
  payVendorInvoice: (id: number, data: unknown) => t('post', `/purchases/vendor-invoices/${id}/pay`, data),
  deleteVendorInvoice: (id: number) => t('delete', `/purchases/vendor-invoices/${id}`),
  // Contratos con proveedores / convenios
  supplierContracts: (params?: { supplier_id?: number; status?: string; type?: string; expiring_days?: number }) =>
    t('get', '/purchases/supplier-contracts', undefined, params),
  getSupplierContract: (id: number) => t('get', `/purchases/supplier-contracts/${id}`),
  createSupplierContract: (data: unknown) => t('post', '/purchases/supplier-contracts', data),
  updateSupplierContract: (id: number, data: unknown) => t('put', `/purchases/supplier-contracts/${id}`, data),
  deleteSupplierContract: (id: number) => t('delete', `/purchases/supplier-contracts/${id}`),
  addContractItem: (contractId: number, data: unknown) => t('post', `/purchases/supplier-contracts/${contractId}/items`, data),
  removeContractItem: (contractId: number, itemId: number) => t('delete', `/purchases/supplier-contracts/${contractId}/items/${itemId}`),
  supplierCoverageCheck: (supplierId: number, params: { product_id?: number; product_name?: string; product_code?: string }) =>
    t('get', `/purchases/suppliers/${supplierId}/coverage-check`, undefined, params),
};

// ─── Warehouse / Almacén ──────────────────────────────────────────────────────
export const warehouseApi = {
  list: () => t('get', '/warehouse/warehouses'),
  get: (id: number) => t('get', `/warehouse/warehouses/${id}`),
  create: (data: unknown) => t('post', '/warehouse/warehouses', data),
  update: (id: number, data: unknown) => t('put', `/warehouse/warehouses/${id}`, data),
  delete: (id: number) => t('delete', `/warehouse/warehouses/${id}`),
  // Zonas
  zones: (params?: { warehouse_id?: number }) => t('get', '/warehouse/zones', undefined, params),
  createZone: (data: unknown) => t('post', '/warehouse/zones', data),
  updateZone: (id: number, data: unknown) => t('put', `/warehouse/zones/${id}`, data),
  deleteZone: (id: number) => t('delete', `/warehouse/zones/${id}`),
  // Estantes
  shelves: (params?: { zone_id?: number }) => t('get', '/warehouse/shelves', undefined, params),
  createShelf: (data: unknown) => t('post', '/warehouse/shelves', data),
  updateShelf: (id: number, data: unknown) => t('put', `/warehouse/shelves/${id}`, data),
  deleteShelf: (id: number) => t('delete', `/warehouse/shelves/${id}`),
  // Pallets
  pallets: (params?: { zone_id?: number; shelf_id?: number; page?: number }) =>
    t('get', '/warehouse/pallets', undefined, params),
  getPallet: (id: number) => t('get', `/warehouse/pallets/${id}`),
  createPallet: (data: unknown) => t('post', '/warehouse/pallets', data),
  updatePallet: (id: number, data: unknown) => t('put', `/warehouse/pallets/${id}`, data),
  deletePallet: (id: number) => t('delete', `/warehouse/pallets/${id}`),
  addPalletProduct: (id: number, data: { product_id: number; quantity: number }) =>
    t('post', `/warehouse/pallets/${id}/products`, data),
  removePalletProduct: (id: number, productId: number) =>
    t('delete', `/warehouse/pallets/${id}/products/${productId}`),
  // Transferencias
  transfers: (params?: { page?: number; status?: string }) =>
    t('get', '/warehouse/transfers', undefined, params),
  getTransfer: (id: number) => t('get', `/warehouse/transfers/${id}`),
  createTransfer: (data: unknown) => t('post', '/warehouse/transfers', data),
  updateTransferStatus: (id: number, status: string) =>
    t('patch', `/warehouse/transfers/${id}/status`, { status }),
  deleteTransfer: (id: number) => t('delete', `/warehouse/transfers/${id}`),
  // Picking
  pickingOrders: (params?: { status?: string; warehouse_id?: number; from?: string; to?: string; page?: number }) =>
    t('get', '/warehouse/picking', undefined, params),
  getPicking: (id: number) => t('get', `/warehouse/picking/${id}`),
  createPicking: (data: unknown) => t('post', '/warehouse/picking', data),
  updatePicking: (id: number, data: unknown) => t('put', `/warehouse/picking/${id}`, data),
  updatePickingItem: (id: number, itemId: number, data: unknown) =>
    t('patch', `/warehouse/picking/${id}/items/${itemId}`, data),
  completePicking: (id: number) => t('patch', `/warehouse/picking/${id}/complete`),
  cancelPicking: (id: number, data?: { notes?: string }) =>
    t('patch', `/warehouse/picking/${id}/cancel`, data),
  deletePicking: (id: number) => t('delete', `/warehouse/picking/${id}`),
  // Packing
  packingLists: (params?: { status?: string; picking_order_id?: number; from?: string; to?: string; page?: number }) =>
    t('get', '/warehouse/packing', undefined, params),
  getPacking: (id: number) => t('get', `/warehouse/packing/${id}`),
  createPacking: (data: unknown) => t('post', '/warehouse/packing', data),
  updatePacking: (id: number, data: unknown) => t('put', `/warehouse/packing/${id}`, data),
  markPacked: (id: number) => t('patch', `/warehouse/packing/${id}/pack`),
  dispatchPacking: (id: number, data?: { carrier?: string; tracking_number?: string; notes?: string }) =>
    t('patch', `/warehouse/packing/${id}/dispatch`, data),
  deletePacking: (id: number) => t('delete', `/warehouse/packing/${id}`),
};

// ─── Cash Register / Caja ─────────────────────────────────────────────────────
// Backend prefix: /cash  (routes: GET /, GET /current, POST /open, GET/{id}, POST/{id}/close, POST/{id}/movements)
export const cashApi = {
  history: (params?: { page?: number; from?: string; to?: string }) =>
    t('get', '/cash', undefined, params),
  current: () => t('get', '/cash/current'),
  open: (data: { name: string; opening_amount: number; warehouse_id?: number; notes?: string }) =>
    t('post', '/cash/open', data),
  show: (id: number) => t('get', `/cash/${id}`),
  close: (id: number, data: { closing_amount: number; notes?: string }) =>
    t('post', `/cash/${id}/close`, data),
  addMovement: (id: number, data: { type: 'in' | 'out' | 'withdrawal'; amount: number; concept: string; notes?: string }) =>
    t('post', `/cash/${id}/movements`, data),
  // Cash Flow
  flowDashboard: () => t('get', '/cash/flow/dashboard'),
  flowStatement: (from: string, to: string, period?: 'day' | 'week' | 'month') =>
    t('get', '/cash/flow/statement', undefined, { from, to, period }),
  flowProjection: (days?: number) =>
    t('get', '/cash/flow/projection', undefined, { days }),
};

// ─── Expenses / Gastos ────────────────────────────────────────────────────────
export const expensesApi = {
  list: (params?: { page?: number; status?: string; category_id?: number; from?: string; to?: string }) =>
    t('get', '/expenses', undefined, params),
  get: (id: number) => t('get', `/expenses/${id}`),
  create: (data: unknown) => t('post', '/expenses', data),
  update: (id: number, data: unknown) => t('put', `/expenses/${id}`, data),
  delete: (id: number) => t('delete', `/expenses/${id}`),
  approve: (id: number) => t('patch', `/expenses/${id}/approve`),
  markPaid: (id: number, data: { paid_at: string; payment_method?: string }) =>
    t('patch', `/expenses/${id}/pay`, data),
  summary: (params?: { from?: string; to?: string }) =>
    t('get', '/expenses/summary', undefined, params),
  // Categorías
  categories: () => t('get', '/expenses/categories'),
  createCategory: (data: unknown) => t('post', '/expenses/categories', data),
  updateCategory: (id: number, data: unknown) => t('put', `/expenses/categories/${id}`, data),
  deleteCategory: (id: number) => t('delete', `/expenses/categories/${id}`),
};

// ─── Taxes / Impuestos ────────────────────────────────────────────────────────
export interface TaxRecord {
  id: number;
  name: string;
  code: string | null;
  type: 'iva' | 'ico' | 'ipc' | 'other';
  rate: number;
  account_code: string | null;
  is_active: boolean;
  is_default: boolean;
}
export const taxesApi = {
  list: () => t<TaxRecord[]>('get', '/taxes'),
  get: (id: number) => t<TaxRecord>('get', `/taxes/${id}`),
  create: (data: Partial<TaxRecord>) => t<TaxRecord>('post', '/taxes', data),
  update: (id: number, data: Partial<TaxRecord>) => t<TaxRecord>('put', `/taxes/${id}`, data),
  delete: (id: number) => t('delete', `/taxes/${id}`),
  seedDefaults: () => t('post', '/taxes/seed-defaults'),
  // Informes
  reportSummary: (from: string, to: string) =>
    t('get', '/taxes/report/summary', undefined, { from, to }),
  reportByTax: (from: string, to: string) =>
    t('get', '/taxes/report/by-tax', undefined, { from, to }),
  reportRetentions: (from: string, to: string, context?: string) =>
    t('get', '/taxes/report/retentions-summary', undefined, { from, to, context }),
};

// ─── Quotes / Cotizaciones ────────────────────────────────────────────────────
export const quotesApi = {
  list: (params?: { page?: number; status?: string; invoice_status?: string; customer_id?: number; search?: string }) =>
    t('get', '/sales/quotes', undefined, params),
  get: (id: number) => t('get', `/sales/quotes/${id}`),
  create: (data: unknown) => t('post', '/sales/quotes', data),
  update: (id: number, data: unknown) => t('put', `/sales/quotes/${id}`, data),
  send: (id: number) => t('post', `/sales/quotes/${id}/send`),
  requestApproval: (id: number) => t('post', `/sales/quotes/${id}/request-approval`),
  approve: (id: number) => t('post', `/sales/quotes/${id}/approve`),
  rejectApproval: (id: number, reason: string) =>
    t('post', `/sales/quotes/${id}/reject-approval`, { reason }),
  convertToOrder: (id: number) => t('post', `/sales/quotes/${id}/convert-to-order`),
  invoice: (id: number, data: { payment_method: string; items: { quote_item_id: number; quantity: number }[] }) =>
    t('post', `/sales/quotes/${id}/invoice`, data),
  cancel: (id: number) => t('delete', `/sales/quotes/${id}`),
};

// ─── Sales Orders / Órdenes de Venta ──────────────────────────────────────────
export const salesOrdersApi = {
  list: (params?: { page?: number; status?: string; customer_id?: number; doc_type?: string }) =>
    t('get', '/sales/orders', undefined, params),
  get: (id: number) => t('get', `/sales/orders/${id}`),
  create: (data: unknown) => t('post', '/sales/orders', data),
  update: (id: number, data: unknown) => t('put', `/sales/orders/${id}`, data),
  confirm: (id: number) => t('patch', `/sales/orders/${id}/status`, { status: 'confirmed' }),
  deliverItem: (id: number, itemId: number, qty: number) =>
    t('patch', `/sales/orders/${id}/items/${itemId}/deliver`, { quantity_delivered: qty }),
  cancel: (id: number) => t('delete', `/sales/orders/${id}`),
};

// ─── Tables (Restaurant) ──────────────────────────────────────────────────────
export const tablesApi = {
  list: () => t<Table[]>('get', '/tables'),
  create: (data: Partial<Table>) => t<Table>('post', '/tables', data),
  update: (id: number, data: Partial<Table>) => t<Table>('put', `/tables/${id}`, data),
  delete: (id: number) => t('delete', `/tables/${id}`),
  getOrder: (tableId: number) => t<TableOrder>('get', `/tables/${tableId}/order`),
  openOrder: (tableId: number) => t<TableOrder>('post', `/tables/${tableId}/order`),
  closeOrder: (tableId: number) => t('post', `/tables/${tableId}/order/close`),
  addItem: (tableId: number, item: { product_id: number; quantity: number; notes?: string }) =>
    t('post', `/tables/${tableId}/order/items`, item),
};

// ─── Kitchen Display System ───────────────────────────────────────────────────
export const kdsApi = {
  items: () => t<TableOrderItem[]>('get', '/kitchen/items'),
  advanceItem: (itemId: number) => t<TableOrderItem>('patch', `/kitchen/items/${itemId}/advance`),
};

// ─── Suppliers ────────────────────────────────────────────────────────────────
export const suppliersApi = {
  list: (params?: { search?: string; page?: number }) =>
    t<PaginatedResponse<Supplier>>('get', '/purchases/suppliers', undefined, params),
  get: (id: number) => t<Supplier>('get', `/purchases/suppliers/${id}`),
  create: (data: Partial<Supplier>) => t<Supplier>('post', '/purchases/suppliers', data),
  update: (id: number, data: Partial<Supplier>) => t<Supplier>('put', `/purchases/suppliers/${id}`, data),
  delete: (id: number) => t('delete', `/purchases/suppliers/${id}`),
  payments: (supplierId: number) => t('get', `/purchases/suppliers/${supplierId}/payments`),
  addPayment: (supplierId: number, data: unknown) =>
    t('post', `/purchases/suppliers/${supplierId}/payments`, data),
  account: (supplierId: number) => t('get', `/purchases/suppliers/${supplierId}/account`),
  evaluations: (supplierId: number) => t('get', `/purchases/suppliers/${supplierId}/evaluations`),
  storeEvaluation: (supplierId: number, data: unknown) =>
    t('post', `/purchases/suppliers/${supplierId}/evaluations`, data),
};

// ─── Customers ────────────────────────────────────────────────────────────────
export const customersApi = {
  list: (params?: { search?: string; page?: number }) =>
    t('get', '/customers', undefined, params),
  get: (id: number) => t('get', `/customers/${id}`),
  create: (data: unknown) => t('post', '/customers', data),
  update: (id: number, data: unknown) => t('put', `/customers/${id}`, data),
  delete: (id: number) => t('delete', `/customers/${id}`),
};

// ─── HRM / RRHH ───────────────────────────────────────────────────────────────
export const hrmApi = {
  // Empleados
  employees: (params?: { search?: string; page?: number }) =>
    t('get', '/hrm/employees', undefined, params),
  getEmployee: (id: number) => t('get', `/hrm/employees/${id}`),
  createEmployee: (data: unknown) => t('post', '/hrm/employees', data),
  updateEmployee: (id: number, data: unknown) => t('put', `/hrm/employees/${id}`, data),
  deleteEmployee: (id: number) => t('delete', `/hrm/employees/${id}`),
  // Contratos (legacy)
  contracts: (employeeId: number) => t('get', `/hrm/employees/${employeeId}/contracts`),
  createContract: (employeeId: number, data: unknown) =>
    t('post', `/hrm/employees/${employeeId}/contracts`, data),
  // Gestión documental — expediente digital
  employeeDocuments: (employeeId: number) =>
    t('get', `/hrm/employees/${employeeId}/documents`),
  getEmployeeDocument: (employeeId: number, docId: number) =>
    t('get', `/hrm/employees/${employeeId}/documents/${docId}`),
  uploadEmployeeDocument: (employeeId: number, formData: FormData) =>
    t('post', `/hrm/employees/${employeeId}/documents`, formData),
  updateEmployeeDocument: (employeeId: number, docId: number, data: unknown) =>
    t('put', `/hrm/employees/${employeeId}/documents/${docId}`, data),
  archiveEmployeeDocument: (employeeId: number, docId: number) =>
    t('delete', `/hrm/employees/${employeeId}/documents/${docId}`),
  expiringDocuments: (days?: number) =>
    t('get', '/hrm/documents/expiring', undefined, days ? { days } : undefined),
  // Nómina
  payrolls: (params?: { page?: number; status?: string }) =>
    t('get', '/hrm/payroll', undefined, params),
  getPayroll: (id: number) => t('get', `/hrm/payroll/${id}`),
  generatePayroll: (data: unknown) => t('post', '/hrm/payroll', data),
  approvePayroll: (id: number) => t('post', `/hrm/payroll/${id}/approve`),
  markPayrollPaid: (id: number) => t('post', `/hrm/payroll/${id}/pay`),
  previewPayroll: (data: unknown) => t('post', '/hrm/payroll/preview', data),
  exportPayrollCsv: (id: number) =>
    tenantApiClient.get(`/${currentSlug}/api/hrm/payroll/${id}/export`, { responseType: 'blob' }),
  pilaExport: (id: number) =>
    tenantApiClient.get(`/${currentSlug}/api/hrm/payroll/${id}/pila`, { responseType: 'blob' }),
  // Vacaciones
  vacations: (params?: { employee_id?: number; page?: number }) =>
    t('get', '/hrm/vacations', undefined, params),
  createVacation: (data: unknown) => t('post', '/hrm/vacations', data),
  approveVacation: (id: number) => t('patch', `/hrm/vacations/${id}/approve`),
  // Liquidaciones
  liquidations: (params?: { employee_id?: number; status?: string; page?: number }) =>
    t('get', '/hrm/liquidations', undefined, params),
  getLiquidation: (id: number) => t('get', `/hrm/liquidations/${id}`),
  previewLiquidation: (data: unknown) => t('post', '/hrm/liquidations/preview', data),
  createLiquidation: (data: unknown) => t('post', '/hrm/liquidations', data),
  payLiquidation: (id: number) => t('patch', `/hrm/liquidations/${id}/pay`),
  /** Genera el XML de Nómina Electrónica DIAN (stub — resolución 000013/2021) */
  payrollDianXml: (id: number) =>
    t<{ message: string; cune: string; xml_content: string; generated_at: string }>('get', `/hrm/payroll/${id}/dian-xml`),
  // Fichajes / Presencia
  checkIn:         (data: { employee_id: number; notes?: string; location?: string; latitude?: number; longitude?: number }) =>
    t('post', '/hrm/attendance/check-in', data),
  checkOut:        (data: { employee_id: number; notes?: string }) =>
    t('post', '/hrm/attendance/check-out', data),
  breakStart:      (data: { employee_id: number; notes?: string }) =>
    t('post', '/hrm/attendance/break-start', data),
  breakEnd:        (data: { employee_id: number; notes?: string }) =>
    t('post', '/hrm/attendance/break-end', data),
  attendanceManual:(data: unknown) => t('post', '/hrm/attendance/manual', data),
  attendance:      (params?: { employee_id?: number; from?: string; to?: string; type?: string; page?: number }) =>
    t('get', '/hrm/attendance', undefined, params),
  attendanceSummary:(date?: string) =>
    t('get', '/hrm/attendance/summary', undefined, date ? { date } : undefined),
  attendanceReport:(params: { from: string; to: string; employee_id?: number }) =>
    t('get', '/hrm/attendance/report', undefined, params),
  correctAttendance:(id: number, data: { recorded_at: string; notes?: string }) =>
    t('put', `/hrm/attendance/${id}/correct`, data),
  deleteAttendance:(id: number) => t('delete', `/hrm/attendance/${id}`),
  // Jornadas
  schedules:       (params?: { employee_id?: number; active?: boolean }) =>
    t('get', '/hrm/attendance/schedules', undefined, params),
  createSchedule:  (data: unknown) => t('post', '/hrm/attendance/schedules', data),
  updateSchedule:  (id: number, data: unknown) => t('put', `/hrm/attendance/schedules/${id}`, data),
  deleteSchedule:  (id: number) => t('delete', `/hrm/attendance/schedules/${id}`),
  // Ausencias
  absences:        (params?: { employee_id?: number; status?: string; type?: string; from?: string; to?: string; page?: number }) =>
    t('get', '/hrm/absences', undefined, params),
  getAbsence:      (id: number) => t('get', `/hrm/absences/${id}`),
  createAbsence:   (data: unknown) => t('post', '/hrm/absences', data),
  updateAbsence:   (id: number, data: unknown) => t('put', `/hrm/absences/${id}`, data),
  approveAbsence:  (id: number) => t('patch', `/hrm/absences/${id}/approve`),
  rejectAbsence:   (id: number, data?: { notes?: string }) => t('patch', `/hrm/absences/${id}/reject`, data),
  deleteAbsence:   (id: number) => t('delete', `/hrm/absences/${id}`),
  // Portal del empleado (autoservicio)
  portalMe:           () => t('get', '/hrm/portal/me'),
  portalUpdateMe:     (data: unknown) => t('put', '/hrm/portal/me', data),
  portalPayslips:     () => t('get', '/hrm/portal/me/payslips'),
  portalVacations:    () => t('get', '/hrm/portal/me/vacations'),
  portalRequestVacation: (data: { start_date: string; end_date: string; notes?: string }) =>
    t('post', '/hrm/portal/me/vacations', data),
  portalCancelVacation: (id: number) => t('delete', `/hrm/portal/me/vacations/${id}`),
  portalAbsences:     () => t('get', '/hrm/portal/me/absences'),
  portalRequestAbsence: (data: unknown) => t('post', '/hrm/portal/me/absences', data),
  // Préstamos
  loans: (params?: { status?: string; employee_id?: number }) => t('get', '/hrm/loans', undefined, params),
  getLoan: (id: number) => t('get', `/hrm/loans/${id}`),
  createLoan: (data: unknown) => t('post', '/hrm/loans', data),
  approveLoan: (id: number, data: { start_date: string }) => t('post', `/hrm/loans/${id}/approve`, data),
  rejectLoan: (id: number) => t('post', `/hrm/loans/${id}/reject`),
  payInstallment: (loanId: number, paymentId: number) => t('post', `/hrm/loans/${loanId}/payments/${paymentId}/pay`),
  // Archivo bancario
  payrollBankFile: (payrollId: number, format: 'bancolombia' | 'davivienda' | 'csv') =>
    tenantApiClient.get(`/${currentSlug}/api/hrm/payroll/${payrollId}/bank-file`, { params: { format }, responseType: 'blob' }),
  // NE-DIAN mejorada
  generateNeDocs: (payrollId: number) => t('post', `/hrm/payroll/${payrollId}/generate-ne-docs`),
  neDocs: (payrollId: number) => t('get', `/hrm/payroll/${payrollId}/ne-docs`),
  neDocXml: (payrollId: number, docId: number) =>
    tenantApiClient.get(`/${currentSlug}/api/hrm/payroll/${payrollId}/ne-docs/${docId}/xml`, { responseType: 'blob' }),
  neDocMarkSent: (payrollId: number, docId: number) => t('post', `/hrm/payroll/${payrollId}/ne-docs/${docId}/mark-sent`),
  neDocMarkAccepted: (payrollId: number, docId: number, data?: { dian_response_code?: string; dian_response_message?: string }) =>
    t('post', `/hrm/payroll/${payrollId}/ne-docs/${docId}/mark-accepted`, data),
};

// ─── Finance / Transfers ──────────────────────────────────────────────────────
export const financeApi = {
  transfers: (params?: { status?: string; type?: string; page?: number }) =>
    t('get', '/finance/transfers', undefined, params),
  getTransfer: (id: number) => t('get', `/finance/transfers/${id}`),
  createTransfer: (data: unknown) => t('post', '/finance/transfers', data),
  updateTransfer: (id: number, data: unknown) => t('put', `/finance/transfers/${id}`, data),
  approveTransfer: (id: number) => t('post', `/finance/transfers/${id}/approve`),
  sendTransfer: (id: number) => t('post', `/finance/transfers/${id}/send`),
  settleTransfer: (id: number, results?: unknown[]) => t('post', `/finance/transfers/${id}/settle`, { results }),
  addTransferItems: (id: number, items: unknown[]) => t('post', `/finance/transfers/${id}/items`, { items }),
  removeTransferItem: (id: number, itemId: number) => t('delete', `/finance/transfers/${id}/items/${itemId}`),
  exportTransfer: (id: number) =>
    tenantApiClient.get(`/${currentSlug}/api/finance/transfers/${id}/export`, { responseType: 'blob' }),
  deleteTransfer: (id: number) => t('delete', `/finance/transfers/${id}`),
  fromPayroll: (data: { payroll_period_id: number; bank_file_format?: string; scheduled_date?: string }) =>
    t('post', '/finance/transfers/from-payroll', data),
};

// ─── Fleet ────────────────────────────────────────────────────────────────────
export const fleetApi = {
  stats: () => t('get', '/fleet/stats'),
  // Vehicles
  vehicles: (params?: { status?: string }) => t('get', '/fleet/vehicles', undefined, params),
  createVehicle: (data: unknown) => t('post', '/fleet/vehicles', data),
  updateVehicle: (id: number, data: unknown) => t('put', `/fleet/vehicles/${id}`, data),
  deleteVehicle: (id: number) => t('delete', `/fleet/vehicles/${id}`),
  vehicleMaintenance: (vehicleId: number) => t('get', `/fleet/vehicles/${vehicleId}/maintenance`),
  addMaintenance: (vehicleId: number, data: unknown) => t('post', `/fleet/vehicles/${vehicleId}/maintenance`, data),
  vehicleFuel: (vehicleId: number) => t('get', `/fleet/vehicles/${vehicleId}/fuel`),
  addFuel: (vehicleId: number, data: unknown) => t('post', `/fleet/vehicles/${vehicleId}/fuel`, data),
  // Drivers
  drivers: () => t('get', '/fleet/drivers'),
  createDriver: (data: unknown) => t('post', '/fleet/drivers', data),
  updateDriver: (id: number, data: unknown) => t('put', `/fleet/drivers/${id}`, data),
  // Trips
  trips: (params?: { status?: string; vehicle_id?: number; from?: string; to?: string }) =>
    t('get', '/fleet/trips', undefined, params),
  getTrip: (id: number) => t('get', `/fleet/trips/${id}`),
  createTrip: (data: unknown) => t('post', '/fleet/trips', data),
  departTrip: (id: number, data?: unknown) => t('post', `/fleet/trips/${id}/depart`, data),
  arriveTrip: (id: number, data: unknown) => t('post', `/fleet/trips/${id}/arrive`, data),
  cancelTrip: (id: number) => t('post', `/fleet/trips/${id}/cancel`),
  // Freight rates & calculator
  freightRates: () => t('get', '/fleet/freight-rates'),
  upsertFreightRate: (data: unknown) => t('post', '/fleet/freight-rates', data),
  estimateFreight: (data: { vehicle_type: string; distance_km: number; weight_kg?: number }) =>
    t('post', '/fleet/freight-estimate', data),
};

// ─── Accounting ───────────────────────────────────────────────────────────────
export const accountingApi = {
  accounts: (params?: { page?: number; type?: string; search?: string }) =>
    t('get', '/accounting/accounts', undefined, params),
  seedPUC: () => t('post', '/accounting/accounts/seed-puc'),
  createAccount: (data: unknown) => t('post', '/accounting/accounts', data),
  updateAccount: (id: number, data: unknown) => t('put', `/accounting/accounts/${id}`, data),
  journalEntries: (params?: { page?: number; from?: string; to?: string }) =>
    t('get', '/accounting/journal', undefined, params),
  createJournal: (data: unknown) => t('post', '/accounting/journal', data),
  postJournal: (id: number) => t('post', `/accounting/journal/${id}/post`),
  voidJournal: (id: number) => t('post', `/accounting/journal/${id}/void`),
  financialReport: (type: string, params?: { date?: string; date_from?: string; date_to?: string }) =>
    t('get', `/accounting/reports/${type}`, undefined, params),
  exportFinancialReport: (type: string, params?: { date?: string; date_from?: string; date_to?: string }) =>
    tenantApiClient.get(`/${currentSlug}/api/accounting/reports/export/${type}`, { params, responseType: 'blob' }),
  // Períodos contables
  periods: (params?: { year?: number; status?: string }) =>
    t('get', '/accounting/periods', undefined, params),
  createPeriod: (data: unknown) => t('post', '/accounting/periods', data),
  generateYear: (year: number) => t('post', '/accounting/periods/generate-year', { year }),
  closePeriod: (id: number, notes?: string) => t('post', `/accounting/periods/${id}/close`, { notes }),
  reopenPeriod: (id: number) => t('post', `/accounting/periods/${id}/reopen`),
  // Retenciones
  retentions: (params?: { type?: string; active?: boolean }) =>
    t('get', '/accounting/retentions', undefined, params),
  createRetention: (data: unknown) => t('post', '/accounting/retentions', data),
  updateRetention: (id: number, data: unknown) => t('put', `/accounting/retentions/${id}`, data),
  deleteRetention: (id: number) => t('delete', `/accounting/retentions/${id}`),
  calculateRetentions: (amount: number, context: 'purchases' | 'sales') =>
    t('post', '/accounting/retentions/calculate', { amount, context }),
  seedRetentionDefaults: () => t('post', '/accounting/retentions/seed-defaults'),
  // Informes financieros
  balanceSheet: (params?: { as_of?: string }) => t('get', '/reports/balance-sheet', undefined, params),
  incomeStatement: (params?: { from?: string; to?: string }) => t('get', '/reports/income-statement', undefined, params),
  trialBalance: () => t('get', '/reports/trial-balance'),
};

// ─── Notifications ────────────────────────────────────────────────────────────
export const notificationsApi = {
  list: (params?: { page?: number; per_page?: number; unread_only?: boolean }) =>
    t('get', '/notifications', undefined, params),
  markRead: (id: number) => t('patch', `/notifications/${id}/read`),
  markAllRead: () => t('post', '/notifications/read-all'),
  unreadCount: () => t<{ count: number }>('get', '/notifications/count'),
};

// ─── Settings ─────────────────────────────────────────────────────────────────
export const settingsApi = {
  getStore: () => t('get', '/config/settings'),
  updateStore: (data: unknown) => t('patch', '/config/settings', data),
  getUsers: () => t('get', '/users'),
  inviteUser: (data: { email: string; role: string }) =>
    t('post', '/users/invite', data),
  updateUser: (id: number, data: unknown) => t('put', `/users/${id}`, data),
  removeUser: (id: number) => t('delete', `/users/${id}`),
  // Impresoras POS
  printers: () => t('get', '/config/printers'),
  createPrinter: (data: unknown) => t('post', '/config/printers', data),
  updatePrinter: (id: number, data: unknown) => t('put', `/config/printers/${id}`, data),
  deletePrinter: (id: number) => t('delete', `/config/printers/${id}`),
  testPrinter: (id: number) => t('post', `/config/printers/${id}/test`),
  // Aging buckets (cartera)
  agingBuckets: () => t('get', '/config/aging-buckets'),
  createAgingBucket: (data: unknown) => t('post', '/config/aging-buckets', data),
  updateAgingBucket: (id: number, data: unknown) => t('put', `/config/aging-buckets/${id}`, data),
  deleteAgingBucket: (id: number) => t('delete', `/config/aging-buckets/${id}`),
};

// ─── Media (tenant) ───────────────────────────────────────────────────────────
export const tenantMediaApi = {
  /**
   * Sube una imagen al almacenamiento del tenant.
   * El servidor la convierte automáticamente a WebP.
   * @param file    Archivo de imagen (jpg|png|gif|webp|bmp, máx 5 MB)
   * @param module  Contexto de almacenamiento (default: 'products')
   */
  upload: (file: File, module: 'products' | 'categories' | 'store' | 'employees' | 'general' = 'products') => {
    const form = new FormData();
    form.append('file', file);
    form.append('module', module);
    return tenantApiClient.post<{ url: string; thumb_url: string; path: string; size_kb: number }>(
      `/${currentSlug}/api/media/upload`,
      form,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
        // Sin timeout extra: la conversión ya se hizo en el cliente (Canvas API)
        // El servidor solo almacena el WebP — operación rápida
      }
    );
  },
  /** Elimina una imagen por su path de almacenamiento */
  destroy: (path: string) => t('delete', '/media', { path }),
};

// ─── Billing (tenant) ─────────────────────────────────────────────────────────
export const billingApi = {
  get: () => t('get', '/billing'),
  addons: () => t('get', '/billing/addons'),
  requestAddon: (addonId: number) => t('post', `/billing/addons/${addonId}/request`),

  // ─── Wompi Web Checkout ─────────────────────────────────────────────────
  checkoutPlan: (planId: number) =>
    t('post', `/billing/checkout/plan/${planId}`),

  checkoutAddon: (addonId: number) =>
    t('post', `/billing/checkout/addon/${addonId}`),

  verifyPayment: (transactionId: string) =>
    t('get', '/billing/verify-payment', undefined, { transaction_id: transactionId }),
};

// ─── Reports ──────────────────────────────────────────────────────────────────
export const reportsApi = {
  sales: (params?: { from?: string; to?: string }) =>
    t('get', '/reports/sales', undefined, params),
  inventory: () => t('get', '/reports/inventory'),
  topProducts: (params?: { limit?: number; from?: string; to?: string }) =>
    t('get', '/reports/top-products', undefined, params),
  purchases: (params?: { from?: string; to?: string }) =>
    t('get', '/reports/purchases', undefined, params),
  cartera: () => t('get', '/reports/cartera'),
  carteraAging: () => t('get', '/reports/cartera-aging'),
  expenses: (params?: { from?: string; to?: string }) =>
    t('get', '/reports/expenses', undefined, params),
  // Exports CSV
  exportSales: (params: { from: string; to: string }) =>
    tenantApiClient.get(`/${currentSlug}/api/reports/export/sales`, { params, responseType: 'blob' }),
  exportInventory: () =>
    tenantApiClient.get(`/${currentSlug}/api/reports/export/inventory`, { responseType: 'blob' }),
  exportPurchases: (params: { from: string; to: string }) =>
    tenantApiClient.get(`/${currentSlug}/api/reports/export/purchases`, { params, responseType: 'blob' }),
  exportCartera: () =>
    tenantApiClient.get(`/${currentSlug}/api/reports/export/cartera`, { responseType: 'blob' }),
};

// ─── E-commerce ───────────────────────────────────────────────────────────────
// Backend prefix: /store  (NOT /ecommerce)
export const ecommerceApi = {
  getConfig: () => t('get', '/store/config'),
  updateConfig: (data: unknown) => t('put', '/store/config', data),
  // Product publish/unpublish — backend uses POST/DELETE, not PATCH
  publishProduct: (productId: number) => t('post', `/store/products/${productId}/publish`),
  unpublishProduct: (productId: number) => t('delete', `/store/products/${productId}/publish`),
  toggleProduct: (productId: number, enabled: boolean) =>
    enabled
      ? t('post', `/store/products/${productId}/publish`)
      : t('delete', `/store/products/${productId}/publish`),
  listProducts: (params?: { page?: number; search?: string; enabled?: boolean }) =>
    t('get', '/store/products', undefined, params),
  reorder: (ids: number[]) => t('put', '/store/products/reorder', { ids }),
  // Orders management
  orders: (params?: { status?: string; page?: number; from?: string; to?: string }) =>
    t('get', '/store/orders', undefined, params),
  getOrder: (id: number) => t('get', `/store/orders/${id}`),
  updateOrderStatus: (id: number, status: string, notes?: string) =>
    t('patch', `/store/orders/${id}/status`, { status, notes }),
  // Carritos abandonados
  abandonedCartsStats: () => t('get', '/store/abandoned-carts/stats'),
  abandonedCarts: (params?: { status?: string; from?: string; to?: string; email?: string; page?: number }) =>
    t('get', '/store/abandoned-carts', undefined, params),
  getAbandonedCart: (id: number) => t('get', `/store/abandoned-carts/${id}`),
  sendAbandonedCartReminder: (id: number) => t('post', `/store/abandoned-carts/${id}/remind`),
  markAbandonedCartLost: (id: number) => t('post', `/store/abandoned-carts/${id}/lost`),
  // Integraciones de marketplace
  marketplaceIntegrations: () => t('get', '/store/integrations'),
  createIntegration: (data: unknown) => t('post', '/store/integrations', data),
  updateIntegration: (id: number, data: unknown) => t('put', `/store/integrations/${id}`, data),
  deleteIntegration: (id: number) => t('delete', `/store/integrations/${id}`),
  integrationLogs: (id: number, params?: { status?: string }) => t('get', `/store/integrations/${id}/logs`, undefined, params),
  replayWebhook: (integrationId: number, logId: number) => t('post', `/store/integrations/${integrationId}/replay/${logId}`),
};

// ─── Currencies (uses central API — no tenant slug needed) ───────────────────
export const currenciesApi = {
  list: () => apiClient.get('/currencies'),
  rateList: (params?: { base?: string; date?: string }) => apiClient.get('/exchange-rates', { params }),
};

// ─── Supply Chain — Rutas ─────────────────────────────────────────────────────
export const routePlanApi = {
  optimize: (data: unknown) => t('post', '/supply-chain/routes/optimize', data),
  list: (params?: { status?: string; date?: string }) =>
    t('get', '/supply-chain/routes', undefined, params),
  get: (id: number) => t('get', `/supply-chain/routes/${id}`),
  create: (data: unknown) => t('post', '/supply-chain/routes', data),
  update: (id: number, data: unknown) => t('put', `/supply-chain/routes/${id}`, data),
  start: (id: number) => t('post', `/supply-chain/routes/${id}/start`),
  arriveStop: (id: number, stopId: number) =>
    t('post', `/supply-chain/routes/${id}/stops/${stopId}/arrive`),
  completeStop: (id: number, stopId: number, notes?: string) =>
    t('post', `/supply-chain/routes/${id}/stops/${stopId}/complete`, { notes }),
  skipStop: (id: number, stopId: number, reason?: string) =>
    t('post', `/supply-chain/routes/${id}/stops/${stopId}/skip`, { reason }),
  complete: (id: number) => t('post', `/supply-chain/routes/${id}/complete`),
  cancel: (id: number) => t('post', `/supply-chain/routes/${id}/cancel`),
  destroy: (id: number) => t('delete', `/supply-chain/routes/${id}`),
};

// ─── Supply Chain — Trazabilidad de Envíos ───────────────────────────────────
export const shipmentApi = {
  stats: () => t('get', '/supply-chain/shipments/stats'),
  list: (params?: { status?: string; carrier?: string; search?: string; overdue?: boolean; page?: number }) =>
    t('get', '/supply-chain/shipments', undefined, params),
  get: (id: number) => t('get', `/supply-chain/shipments/${id}`),
  create: (data: unknown) => t('post', '/supply-chain/shipments', data),
  update: (id: number, data: unknown) => t('put', `/supply-chain/shipments/${id}`, data),
  addEvent: (id: number, data: unknown) => t('post', `/supply-chain/shipments/${id}/events`, data),
  deliver: (id: number, data?: { location?: string; description?: string }) =>
    t('patch', `/supply-chain/shipments/${id}/deliver`, data),
  returnShipment: (id: number, reason?: string) =>
    t('patch', `/supply-chain/shipments/${id}/return`, { reason }),
  destroy: (id: number) => t('delete', `/supply-chain/shipments/${id}`),
  // Public tracking (no auth)
  track: (slug: string, trackingNumber: string) =>
    tenantApiClient.get(`/${slug}/store/track/${trackingNumber}`),
};

// ─── Mantenimiento Preventivo ─────────────────────────────────────────────────
export const maintenanceApi = {
  stats: () => t('get', '/maintenance/stats'),
  // Schedules
  schedules: (params?: { active?: boolean; asset_type?: string; overdue?: boolean }) =>
    t('get', '/maintenance/schedules', undefined, params),
  getSchedule: (id: number) => t('get', `/maintenance/schedules/${id}`),
  createSchedule: (data: unknown) => t('post', '/maintenance/schedules', data),
  updateSchedule: (id: number, data: unknown) => t('put', `/maintenance/schedules/${id}`, data),
  toggleSchedule: (id: number) => t('patch', `/maintenance/schedules/${id}/toggle`),
  deleteSchedule: (id: number) => t('delete', `/maintenance/schedules/${id}`),
  // Work Orders
  workOrders: (params?: { status?: string; type?: string; priority?: string }) =>
    t('get', '/maintenance/work-orders', undefined, params),
  getWorkOrder: (id: number) => t('get', `/maintenance/work-orders/${id}`),
  createWorkOrder: (data: unknown) => t('post', '/maintenance/work-orders', data),
  updateWorkOrder: (id: number, data: unknown) => t('put', `/maintenance/work-orders/${id}`, data),
  startWorkOrder: (id: number) => t('patch', `/maintenance/work-orders/${id}/start`),
  completeWorkOrder: (id: number, data: unknown) => t('patch', `/maintenance/work-orders/${id}/complete`, data),
  cancelWorkOrder: (id: number, reason?: string) =>
    t('patch', `/maintenance/work-orders/${id}/cancel`, { reason }),
  deleteWorkOrder: (id: number) => t('delete', `/maintenance/work-orders/${id}`),
};

// ─── HRM — PILA ──────────────────────────────────────────────────────────────
export const pilaApi = {
  generate: (periodId: number, operator?: string) =>
    t('post', `/hrm/pila/generate/${periodId}`, { operator }),
  list: (params?: { status?: string; period_month?: string }) =>
    t('get', '/hrm/pila', undefined, params),
  get: (id: number) => t('get', `/hrm/pila/${id}`),
  download: (id: number) =>
    tenantApiClient.get(`/${currentSlug}/api/hrm/pila/${id}/download`, { responseType: 'blob' }),
  submit: (id: number) => t('post', `/hrm/pila/${id}/submit`),
  confirm: (id: number) => t('post', `/hrm/pila/${id}/confirm`),
  destroy: (id: number) => t('delete', `/hrm/pila/${id}`),
};

// ─── Factura OCR ──────────────────────────────────────────────────────────────
export const invoiceOcrApi = {
  extract: (file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    return tenantApiClient.post(`/${currentSlug}/api/purchases/vendor-invoices/ocr-extract`, fd, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
  },
};

// ─── Aging de Cartera ─────────────────────────────────────────────────────────
export const agingApi = {
  summary: () => t('get', '/accounting/aging/summary'),
  report: (params?: { customer_id?: number }) =>
    t('get', '/accounting/aging/report', undefined, params),
  sendReminders: (data?: { days_overdue_min?: number; customer_ids?: number[] }) =>
    t('post', '/accounting/aging/send-reminders', data),
  collectionLog: (params?: { customer_id?: number }) =>
    t('get', '/accounting/aging/collection-log', undefined, params),
};

// ─── ISO / Calidad — No conformidades ────────────────────────────────────────
export const qualityNcApi = {
  stats: () => t('get', '/quality/nc/stats'),
  list: (params?: { status?: string; severity?: string; standard?: string; search?: string; page?: number }) =>
    t('get', '/quality/nc', undefined, params),
  get: (id: number) => t('get', `/quality/nc/${id}`),
  create: (data: unknown) => t('post', '/quality/nc', data),
  update: (id: number, data: unknown) => t('put', `/quality/nc/${id}`, data),
  addAction: (ncId: number, data: unknown) => t('post', `/quality/nc/${ncId}/actions`, data),
  updateAction: (actionId: number, data: unknown) => t('put', `/quality/nc/actions/${actionId}`, data),
  close: (id: number, data: { root_cause: string; closure_evidence: string }) =>
    t('patch', `/quality/nc/${id}/close`, data),
  destroy: (id: number) => t('delete', `/quality/nc/${id}`),
  // Auditorías
  audits: (params?: { status?: string; standard?: string }) =>
    t('get', '/quality/audits', undefined, params),
  getAudit: (id: number) => t('get', `/quality/audits/${id}`),
  createAudit: (data: unknown) => t('post', '/quality/audits', data),
  updateAudit: (id: number, data: unknown) => t('put', `/quality/audits/${id}`, data),
  startAudit: (id: number) => t('patch', `/quality/audits/${id}/start`),
  completeAudit: (id: number, data: unknown) => t('patch', `/quality/audits/${id}/complete`, data),
};

// ─── Reposición de Inventario ─────────────────────────────────────────────────
export const replenishmentApi = {
  alerts: (params?: { page?: number }) => t('get', '/inventory/replenishment/alerts', undefined, params),
  settings: (params?: { auto_reorder?: boolean; page?: number }) =>
    t('get', '/inventory/replenishment/settings', undefined, params),
  updateSettings: (productId: number, data: unknown) =>
    t('put', `/inventory/replenishment/${productId}`, data),
  trigger: (data?: { product_ids?: number[] }) =>
    t('post', '/inventory/replenishment/trigger', data),
};

// ─── Vitrina B2C pública ──────────────────────────────────────────────────────
export const b2cStoreApi = {
  catalog: (slug: string, params?: { category?: number; search?: string; page?: number }) =>
    tenantApiClient.get(`/${slug}/store/catalog`, { params }),
  productDetail: (slug: string, productId: number) =>
    tenantApiClient.get(`/${slug}/store/catalog/${productId}`),
  validateCart: (slug: string, items: { product_id: number; quantity: number }[]) =>
    tenantApiClient.post(`/${slug}/store/cart/validate`, { items }),
  initiateCheckout: (slug: string, data: unknown) =>
    tenantApiClient.post(`/${slug}/store/checkout/initiate`, data),
  verifyCheckout: (slug: string, params: { id: string; reference: string }) =>
    tenantApiClient.get(`/${slug}/store/checkout/verify`, { params }),
  orderStatus: (slug: string, ref: string) =>
    tenantApiClient.get(`/${slug}/store/orders/${ref}/status`),
};

// ─── Presupuesto — sync real ──────────────────────────────────────────────────
export const budgetSyncApi = {
  syncActual: (id: number) => t('post', `/budgets/${id}/sync-actual`),
};

// ─── Comisiones ──────────────────────────────────────────────────────────────
export const commissionsApi = {
  // Reglas
  listRules: () =>
    t<import('@/types').CommissionRule[]>('get', '/commissions/rules'),
  createRule: (data: Omit<import('@/types').CommissionRule, 'id'>) =>
    t<import('@/types').CommissionRule>('post', '/commissions/rules', data),
  updateRule: (id: number, data: Partial<import('@/types').CommissionRule>) =>
    t<import('@/types').CommissionRule>('put', `/commissions/rules/${id}`, data),
  deleteRule: (id: number) => t('delete', `/commissions/rules/${id}`),
  // Comisiones
  list: (params?: { user_id?: number; status?: string; from?: string; to?: string; page?: number }) =>
    t<import('@/types').PaginatedResponse<import('@/types').Commission>>(
      'get', '/commissions', undefined, params,
    ),
  summary: (params?: { from?: string; to?: string }) =>
    t<{ from: string; to: string; rows: import('@/types').CommissionSummaryRow[] }>(
      'get', '/commissions/summary', undefined, params,
    ),
  approve: (id: number) => t('patch', `/commissions/${id}/approve`),
  pay: (ids: number[], paid_at?: string) =>
    t<{ message: string }>('post', '/commissions/pay', { ids, paid_at }),
};

// ─── Cuentas de Cobro ────────────────────────────────────────────────────────
export const collectionAccountsApi = {
  // Entidades
  listEntities: () =>
    t<import('@/types').CollectionAccountEntity[]>('get', '/collection-accounts/entities'),
  createEntity: (data: Omit<import('@/types').CollectionAccountEntity, 'id'>) =>
    t<import('@/types').CollectionAccountEntity>('post', '/collection-accounts/entities', data),
  updateEntity: (id: number, data: Partial<import('@/types').CollectionAccountEntity>) =>
    t<import('@/types').CollectionAccountEntity>('put', `/collection-accounts/entities/${id}`, data),
  deleteEntity: (id: number) => t('delete', `/collection-accounts/entities/${id}`),
  // Cuentas de cobro
  list: (params?: { status?: string; entity_id?: number; from?: string; to?: string; page?: number }) =>
    t<import('@/types').PaginatedResponse<import('@/types').CollectionAccount>>(
      'get', '/collection-accounts', undefined, params,
    ),
  get: (id: number) =>
    t<import('@/types').CollectionAccount>('get', `/collection-accounts/${id}`),
  create: (data: {
    entity_id: number;
    period_from: string;
    period_to: string;
    due_date: string;
    concept: string;
    notes?: string;
    items: import('@/types').CollectionAccountItem[];
  }) => t<import('@/types').CollectionAccount>('post', '/collection-accounts', data),
  send: (id: number) => t('patch', `/collection-accounts/${id}/send`),
  pay: (id: number, data: { amount_paid: number; paid_at?: string }) =>
    t('patch', `/collection-accounts/${id}/pay`, data),
  cancel: (id: number) => t('patch', `/collection-accounts/${id}/cancel`),
  delete: (id: number) => t('delete', `/collection-accounts/${id}`),
};

// ─── Referidos ────────────────────────────────────────────────────────────────
export const referralsApi = {
  // Referentes
  listReferrers: (params?: { search?: string; active?: boolean; page?: number; per_page?: number }) =>
    t<import('@/types').PaginatedResponse<import('@/types').Referrer>>(
      'get', '/referrals/referrers', undefined, params,
    ),
  getReferrer: (id: number) =>
    t<import('@/types').Referrer>('get', `/referrals/referrers/${id}`),
  createReferrer: (data: Partial<import('@/types').Referrer>) =>
    t<import('@/types').Referrer>('post', '/referrals/referrers', data),
  updateReferrer: (id: number, data: Partial<import('@/types').Referrer>) =>
    t<import('@/types').Referrer>('put', `/referrals/referrers/${id}`, data),
  deleteReferrer: (id: number) =>
    t('delete', `/referrals/referrers/${id}`),

  // Acuerdos
  listAgreements: (params?: { referrer_id?: number; status?: string; page?: number }) =>
    t<import('@/types').PaginatedResponse<import('@/types').ReferralAgreement>>(
      'get', '/referrals/agreements', undefined, params,
    ),
  getAgreement: (id: number) =>
    t<import('@/types').ReferralAgreement>('get', `/referrals/agreements/${id}`),
  createAgreement: (data: Partial<import('@/types').ReferralAgreement>) =>
    t<import('@/types').ReferralAgreement>('post', '/referrals/agreements', data),
  updateAgreement: (id: number, data: Partial<import('@/types').ReferralAgreement>) =>
    t<import('@/types').ReferralAgreement>('put', `/referrals/agreements/${id}`, data),
  deleteAgreement: (id: number) =>
    t('delete', `/referrals/agreements/${id}`),

  // Comisiones
  listCommissions: (params?: { referrer_id?: number; status?: string; from?: string; to?: string; page?: number }) =>
    t<import('@/types').PaginatedResponse<import('@/types').ReferralCommission>>(
      'get', '/referrals/commissions', undefined, params,
    ),
  commissionsSummary: () =>
    t<import('@/types').ReferralCommissionSummary[]>('get', '/referrals/commissions/summary'),
  approveCommission: (id: number) =>
    t('patch', `/referrals/commissions/${id}/approve`),
  payCommission: (id: number, data?: { paid_at?: string; notes?: string }) =>
    t('patch', `/referrals/commissions/${id}/pay`, data),
  bulkPay: (referrer_id: number, notes?: string) =>
    t('post', '/referrals/commissions/bulk-pay', { referrer_id, notes }),
  cancelCommission: (id: number, notes?: string) =>
    t('patch', `/referrals/commissions/${id}/cancel`, { notes }),
};

// ─── Documento Soporte Electrónico ───────────────────────────────────────────
type SupportDocPayload = {
  supplier_id: number;
  purchase_order_id?: number;
  doc_date: string;
  notes?: string;
  items: import('@/types').ElectronicSupportDocItem[];
};

export const supportDocsApi = {
  list: (params?: { status?: string; supplier_id?: number; from?: string; to?: string; page?: number }) =>
    t<import('@/types').PaginatedResponse<import('@/types').ElectronicSupportDoc>>(
      'get', '/accounting/support-docs', undefined, params,
    ),
  get: (id: number) =>
    t<import('@/types').ElectronicSupportDoc>('get', `/accounting/support-docs/${id}`),
  create: (data: SupportDocPayload) =>
    t<import('@/types').ElectronicSupportDoc>('post', '/accounting/support-docs', data),
  update: (id: number, data: SupportDocPayload) =>
    t<import('@/types').ElectronicSupportDoc>('put', `/accounting/support-docs/${id}`, data),
  issue: (id: number) =>
    t<{ message: string; doc: import('@/types').ElectronicSupportDoc; cuds: string }>(
      'post', `/accounting/support-docs/${id}/issue`,
    ),
  delete: (id: number) => t('delete', `/accounting/support-docs/${id}`),
};

// ─── Credit Notes ────────────────────────────────────────────────────────────
export const creditNotesApi = {
  list: (params?: { status?: string; sale_id?: number; from?: string; to?: string; page?: number }) =>
    t('get', '/accounting/credit-notes', undefined, params),
  get: (id: number) => t('get', `/accounting/credit-notes/${id}`),
  create: (data: { sale_id?: number; sale_return_id?: number; reason: string; amount: number; tax?: number }) =>
    t('post', '/accounting/credit-notes', data),
  issue: (id: number) =>
    t<{ message: string; note: unknown; cude: string }>('post', `/accounting/credit-notes/${id}/issue`),
  destroy: (id: number) => t('delete', `/accounting/credit-notes/${id}`),
};

// ─── Debit Notes ─────────────────────────────────────────────────────────────
export const debitNotesApi = {
  list: (params?: { status?: string; sale_id?: number; date_from?: string; date_to?: string; page?: number }) =>
    t('get', '/accounting/debit-notes', undefined, params),
  create: (data: unknown) => t('post', '/accounting/debit-notes', data),
  show: (id: number) => t('get', `/accounting/debit-notes/${id}`),
  issue: (id: number) => t('patch', `/accounting/debit-notes/${id}/issue`),
  cancel: (id: number) => t('patch', `/accounting/debit-notes/${id}/cancel`),
  destroy: (id: number) => t('delete', `/accounting/debit-notes/${id}`),
};

// ─── Recurring Invoices ───────────────────────────────────────────────────────
export const recurringInvoicesApi = {
  list: (params?: { page?: number; active?: boolean }) =>
    t('get', '/sales/recurring', undefined, params),
  get: (id: number) => t('get', `/sales/recurring/${id}`),
  create: (data: unknown) => t('post', '/sales/recurring', data),
  update: (id: number, data: unknown) => t('put', `/sales/recurring/${id}`, data),
  destroy: (id: number) => t('delete', `/sales/recurring/${id}`),
  toggle: (id: number) => t('patch', `/sales/recurring/${id}/toggle`),
  runNow: (id: number) => t('post', `/sales/recurring/${id}/run-now`),
};

// ─── Email Logs ───────────────────────────────────────────────────────────────
export const emailLogsApi = {
  list: (params?: { mailable_type?: string; status?: string; date_from?: string; date_to?: string; page?: number }) =>
    t('get', '/sales/email-logs', undefined, params),
  batchSendQuotes: (quoteIds: number[]) =>
    t<{ sent: number; failed: number; errors: string[] }>('post', '/sales/quotes/batch-send', { quote_ids: quoteIds }),
};

// ─── Activos Fijos ────────────────────────────────────────────────────────────
export const fixedAssetsApi = {
  summary: () => t('get', '/fixed-assets/summary'),
  list: (params?: { status?: string; category?: string; search?: string; page?: number }) =>
    t('get', '/fixed-assets', undefined, params),
  get: (id: number) => t('get', `/fixed-assets/${id}`),
  create: (data: unknown) => t('post', '/fixed-assets', data),
  update: (id: number, data: unknown) => t('put', `/fixed-assets/${id}`, data),
  destroy: (id: number) => t('delete', `/fixed-assets/${id}`),
  schedule: (id: number) => t('get', `/fixed-assets/${id}/schedule`),
  dispose: (id: number, data: unknown) => t('post', `/fixed-assets/${id}/dispose`, data),
  runDepreciation: (year: number, month: number) =>
    t('post', '/fixed-assets/depreciate', { year, month }),
};

// ─── Presupuestos ─────────────────────────────────────────────────────────────
export const budgetsApi = {
  list: (params?: { year?: number; type?: string; status?: string; page?: number }) =>
    t('get', '/budgets', undefined, params),
  get: (id: number) => t('get', `/budgets/${id}`),
  create: (data: unknown) => t('post', '/budgets', data),
  update: (id: number, data: unknown) => t('put', `/budgets/${id}`, data),
  destroy: (id: number) => t('delete', `/budgets/${id}`),
  approve: (id: number) => t('post', `/budgets/${id}/approve`),
  close: (id: number) => t('post', `/budgets/${id}/close`),
  vsActual: (id: number) => t('get', `/budgets/${id}/vs-actual`),
};

// ─── Manufactura ──────────────────────────────────────────────────────────────
export const manufacturingApi = {
  // BOM
  bomList: (params?: { status?: string; search?: string; page?: number }) =>
    t('get', '/manufacturing/bom', undefined, params),
  bomGet: (id: number) => t('get', `/manufacturing/bom/${id}`),
  bomCreate: (data: unknown) => t('post', '/manufacturing/bom', data),
  bomUpdate: (id: number, data: unknown) => t('put', `/manufacturing/bom/${id}`, data),
  bomDestroy: (id: number) => t('delete', `/manufacturing/bom/${id}`),
  // Production Orders
  ordersSummary: () => t('get', '/manufacturing/orders/summary'),
  orders: (params?: { status?: string; from?: string; to?: string; page?: number }) =>
    t('get', '/manufacturing/orders', undefined, params),
  orderGet: (id: number) => t('get', `/manufacturing/orders/${id}`),
  orderCreate: (data: unknown) => t('post', '/manufacturing/orders', data),
  orderStart: (id: number) => t('post', `/manufacturing/orders/${id}/start`),
  orderComplete: (id: number, data: unknown) => t('post', `/manufacturing/orders/${id}/complete`, data),
  orderCancel: (id: number) => t('post', `/manufacturing/orders/${id}/cancel`),
  orderDestroy: (id: number) => t('delete', `/manufacturing/orders/${id}`),
};

// ─── Variantes de Producto ────────────────────────────────────────────────────
export const variantsApi = {
  // Por producto
  list: (productId: number) => t('get', `/inventory/products/${productId}/variants`),
  create: (productId: number, data: unknown) =>
    t('post', `/inventory/products/${productId}/variants`, data),
  update: (productId: number, variantId: number, data: unknown) =>
    t('put', `/inventory/products/${productId}/variants/${variantId}`, data),
  adjustStock: (productId: number, variantId: number, data: { quantity: number; reason: string }) =>
    t('patch', `/inventory/products/${productId}/variants/${variantId}/stock`, data),
  destroy: (productId: number, variantId: number) =>
    t('delete', `/inventory/products/${productId}/variants/${variantId}`),
  // Atributos globales (Color, Talla, etc.)
  attributes: () => t('get', '/inventory/attributes'),
  createAttribute: (data: { name: string }) => t('post', '/inventory/attributes', data),
  updateAttribute: (id: number, data: { name: string }) =>
    t('put', `/inventory/attributes/${id}`, data),
  deleteAttribute: (id: number) => t('delete', `/inventory/attributes/${id}`),
  addOption: (id: number, data: { value: string }) =>
    t('post', `/inventory/attributes/${id}/options`, data),
  removeOption: (attributeId: number, optionId: number) =>
    t('delete', `/inventory/attributes/${attributeId}/options/${optionId}`),
};

// ─── Etiquetas ────────────────────────────────────────────────────────────────
export const labelsApi = {
  company: () => t('get', '/labels/company'),
  products: (params?: { search?: string; page?: number; per_page?: number }) =>
    t('get', '/inventory/products', undefined, params),
  sales: (params?: { search?: string; status?: string; page?: number }) =>
    t('get', '/pos/sales', undefined, params),
  productLabels: (data: { items: { product_id: number; copies: number }[] }) =>
    t('post', '/labels/products', data),
  shippingLabels: (data: {
    sale_ids: number[];
    carrier?: string;
    extra?: { weight?: number; dimensions?: string; notes?: string };
  }) => t('post', '/labels/shipping', data),
};

// ─── Banking / Conciliación Bancaria ─────────────────────────────────────────
export const bankingApi = {
  // Cuentas
  accounts: () => t('get', '/banking/accounts'),
  createAccount: (data: unknown) => t('post', '/banking/accounts', data),
  updateAccount: (id: number, data: unknown) => t('put', `/banking/accounts/${id}`, data),
  deleteAccount: (id: number) => t('delete', `/banking/accounts/${id}`),
  // Extractos
  statements: (params?: { bank_account_id?: number; status?: string; page?: number }) =>
    t('get', '/banking/statements', undefined, params),
  getStatement: (id: number) => t('get', `/banking/statements/${id}`),
  createStatement: (data: unknown) => t('post', '/banking/statements', data),
  deleteStatement: (id: number) => t('delete', `/banking/statements/${id}`),
  addStatementLine: (id: number, data: unknown) => t('post', `/banking/statements/${id}/lines`, data),
  ignoreLine: (statementId: number, lineId: number) =>
    t('patch', `/banking/statements/${statementId}/lines/${lineId}/ignore`),
  // Conciliaciones
  reconciliations: (params?: { status?: string; page?: number }) =>
    t('get', '/banking/reconciliations', undefined, params),
  getReconciliation: (id: number) => t('get', `/banking/reconciliations/${id}`),
  startReconciliation: (data: unknown) => t('post', '/banking/reconciliations', data),
  matchLine: (id: number, data: unknown) => t('post', `/banking/reconciliations/${id}/match`, data),
  unmatchLine: (id: number, matchId: number) => t('delete', `/banking/reconciliations/${id}/match/${matchId}`),
  completeReconciliation: (id: number) => t('patch', `/banking/reconciliations/${id}/complete`),
  suggestions: (id: number) => t('get', `/banking/reconciliations/${id}/suggestions`),
};

// ─── Audit Log ────────────────────────────────────────────────────────────────
export const auditLogApi = {
  list: (params?: {
    level?: string; module?: string; action?: string; user_id?: number;
    model_type?: string; search?: string; from?: string; to?: string;
    tags?: string[]; page?: number; per_page?: number;
  }) => t('get', '/audit-logs', undefined, params as Record<string, unknown>),
  show: (id: number) => t('get', `/audit-logs/${id}`),
  stats: (params?: { hours?: number }) =>
    t('get', '/audit-logs/stats', undefined, params as Record<string, unknown>),
  filters: () => t('get', '/audit-logs/filters'),
};

// ─── MRP ──────────────────────────────────────────────────────────────────────
export const mrpApi = {
  // BOM
  boms: (params?: { product_id?: number; is_active?: boolean }) => t('get', '/mrp/bom', undefined, params),
  getBom: (id: number) => t('get', `/mrp/bom/${id}`),
  createBom: (data: unknown) => t('post', '/mrp/bom', data),
  updateBom: (id: number, data: unknown) => t('put', `/mrp/bom/${id}`, data),
  deleteBom: (id: number) => t('delete', `/mrp/bom/${id}`),
  // Producción
  productionOrders: (params?: { status?: string; product_id?: number }) =>
    t('get', '/mrp/production-orders', undefined, params),
  getOrder: (id: number) => t('get', `/mrp/production-orders/${id}`),
  createOrder: (data: unknown) => t('post', '/mrp/production-orders', data),
  startOrder: (id: number) => t('post', `/mrp/production-orders/${id}/start`),
  produce: (id: number, data: { quantity: number; notes?: string }) =>
    t('post', `/mrp/production-orders/${id}/produce`, data),
  cancelOrder: (id: number) => t('post', `/mrp/production-orders/${id}/cancel`),
  // Requerimientos
  requirements: (items: Array<{ product_id: number; quantity: number }>) =>
    t('post', '/mrp/requirements', { items }),
  // Centros de trabajo
  workCenters: () => t('get', '/mrp/work-centers'),
  createWorkCenter: (data: unknown) => t('post', '/mrp/work-centers', data),
  updateWorkCenter: (id: number, data: unknown) => t('put', `/mrp/work-centers/${id}`, data),
  deleteWorkCenter: (id: number) => t('delete', `/mrp/work-centers/${id}`),
  // Rutas de fabricación
  routes: (params?: { product_id?: number }) => t('get', '/mrp/routes', undefined, params),
  getRoute: (id: number) => t('get', `/mrp/routes/${id}`),
  createRoute: (data: unknown) => t('post', '/mrp/routes', data),
  updateRoute: (id: number, data: unknown) => t('put', `/mrp/routes/${id}`, data),
  deleteRoute: (id: number) => t('delete', `/mrp/routes/${id}`),
  // Operaciones de OP
  orderOperations: (orderId: number) => t('get', `/mrp/production-orders/${orderId}/operations`),
  startOperation: (orderId: number, opId: number) => t('post', `/mrp/production-orders/${orderId}/operations/${opId}/start`),
  completeOperation: (orderId: number, opId: number, data: { quantity_done: number; quantity_scrapped?: number; notes?: string }) =>
    t('post', `/mrp/production-orders/${orderId}/operations/${opId}/done`, data),
};

// ─── Gestión de Proyectos ─────────────────────────────────────────────────────
export const projectsApi = {
  list: (params?: { status?: string; search?: string; page?: number }) =>
    t('get', '/projects', undefined, params),
  get: (id: number) => t('get', `/projects/${id}`),
  create: (data: unknown) => t('post', '/projects', data),
  update: (id: number, data: unknown) => t('put', `/projects/${id}`, data),
  delete: (id: number) => t('delete', `/projects/${id}`),
  // Tareas
  tasks: (projectId: number, params?: { status?: string }) =>
    t('get', `/projects/${projectId}/tasks`, undefined, params),
  createTask: (projectId: number, data: unknown) => t('post', `/projects/${projectId}/tasks`, data),
  updateTask: (projectId: number, taskId: number, data: unknown) =>
    t('put', `/projects/${projectId}/tasks/${taskId}`, data),
  deleteTask: (projectId: number, taskId: number) =>
    t('delete', `/projects/${projectId}/tasks/${taskId}`),
  // Horas
  timeLogs: (projectId: number, params?: { task_id?: number }) =>
    t('get', `/projects/${projectId}/time-logs`, undefined, params),
  logTime: (projectId: number, data: { hours: number; task_id?: number; description?: string; logged_date?: string; billable?: boolean; hourly_rate?: number }) =>
    t('post', `/projects/${projectId}/time-logs`, data),
  // Hitos
  milestones: (projectId: number) => t('get', `/projects/${projectId}/milestones`),
  createMilestone: (projectId: number, data: unknown) => t('post', `/projects/${projectId}/milestones`, data),
  updateMilestone: (projectId: number, milestoneId: number, data: unknown) =>
    t('put', `/projects/${projectId}/milestones/${milestoneId}`, data),
  deleteMilestone: (projectId: number, milestoneId: number) =>
    t('delete', `/projects/${projectId}/milestones/${milestoneId}`),
  invoiceMilestone: (projectId: number, milestoneId: number) =>
    t('post', `/projects/${projectId}/milestones/${milestoneId}/invoice`),
};

// ─── Gestión de Calidad ───────────────────────────────────────────────────────
export const qualityApi = {
  // Planes
  plans: (params?: { status?: string; type?: string }) => t('get', '/quality/plans', undefined, params),
  getPlan: (id: number) => t('get', `/quality/plans/${id}`),
  createPlan: (data: unknown) => t('post', '/quality/plans', data),
  updatePlan: (id: number, data: unknown) => t('put', `/quality/plans/${id}`, data),
  deletePlan: (id: number) => t('delete', `/quality/plans/${id}`),
  // Inspecciones
  inspections: (params?: { status?: string; qc_plan_id?: number }) => t('get', '/quality/inspections', undefined, params),
  getInspection: (id: number) => t('get', `/quality/inspections/${id}`),
  createInspection: (data: unknown) => t('post', '/quality/inspections', data),
  updateResults: (id: number, data: { results: Array<{ id: number; passed?: boolean; measured_value?: string; notes?: string }> }) =>
    t('post', `/quality/inspections/${id}/results`, data),
  completeInspection: (id: number, data: { result: string; defect_rate?: number; summary?: string }) =>
    t('post', `/quality/inspections/${id}/complete`, data),
  // No Conformidades
  nonconformities: (params?: { status?: string; severity?: string }) => t('get', '/quality/nonconformities', undefined, params),
  getNonconformity: (id: number) => t('get', `/quality/nonconformities/${id}`),
  createNonconformity: (data: unknown) => t('post', '/quality/nonconformities', data),
  updateNonconformity: (id: number, data: unknown) => t('put', `/quality/nonconformities/${id}`, data),
  closeNonconformity: (id: number, data?: { root_cause?: string }) => t('post', `/quality/nonconformities/${id}/close`, data),
  addCapa: (ncId: number, data: unknown) => t('post', `/quality/nonconformities/${ncId}/capa`, data),
  updateCapa: (id: number, data: unknown) => t('put', `/quality/capa/${id}`, data),
};

// ─── CRM ──────────────────────────────────────────────────────────────────────
export const crmApi = {
  // Leads
  leads: (params?: { status?: string; source?: string; search?: string; page?: number }) =>
    t('get', '/crm/leads', undefined, params),
  getLead: (id: number) => t('get', `/crm/leads/${id}`),
  createLead: (data: unknown) => t('post', '/crm/leads', data),
  updateLead: (id: number, data: unknown) => t('put', `/crm/leads/${id}`, data),
  deleteLead: (id: number) => t('delete', `/crm/leads/${id}`),
  qualifyLead: (id: number, data: { title: string; amount?: number; expected_close?: string }) =>
    t('post', `/crm/leads/${id}/qualify`, data),
  // Oportunidades
  opportunities: (params?: { stage?: string; search?: string; page?: number }) =>
    t('get', '/crm/opportunities', undefined, params),
  pipeline: () => t('get', '/crm/opportunities/pipeline'),
  getOpportunity: (id: number) => t('get', `/crm/opportunities/${id}`),
  createOpportunity: (data: unknown) => t('post', '/crm/opportunities', data),
  updateOpportunity: (id: number, data: unknown) => t('put', `/crm/opportunities/${id}`, data),
  deleteOpportunity: (id: number) => t('delete', `/crm/opportunities/${id}`),
  // Interacciones
  interactions: (params?: { subject_type?: string; subject_id?: number; type?: string }) =>
    t('get', '/crm/interactions', undefined, params),
  createInteraction: (data: unknown) => t('post', '/crm/interactions', data),
  updateInteraction: (id: number, data: unknown) => t('put', `/crm/interactions/${id}`, data),
  deleteInteraction: (id: number) => t('delete', `/crm/interactions/${id}`),
  // Campañas
  campaigns: (params?: { status?: string; type?: string }) =>
    t('get', '/crm/campaigns', undefined, params),
  getCampaign: (id: number) => t('get', `/crm/campaigns/${id}`),
  createCampaign: (data: unknown) => t('post', '/crm/campaigns', data),
  updateCampaign: (id: number, data: unknown) => t('put', `/crm/campaigns/${id}`, data),
  deleteCampaign: (id: number) => t('delete', `/crm/campaigns/${id}`),
  // Segmentación de clientes
  segments: () => t('get', '/customers/segments'),
  getSegment: (id: number) => t('get', `/customers/segments/${id}`),
  createSegment: (data: unknown) => t('post', '/customers/segments', data),
  updateSegment: (id: number, data: unknown) => t('put', `/customers/segments/${id}`, data),
  deleteSegment: (id: number) => t('delete', `/customers/segments/${id}`),
  syncSegment: (id: number) => t('post', `/customers/segments/${id}/sync`),
  addSegmentMembers: (id: number, customer_ids: number[]) =>
    t('post', `/customers/segments/${id}/members`, { customer_ids }),
  removeSegmentMember: (id: number, customerId: number) =>
    t('delete', `/customers/segments/${id}/members/${customerId}`),
};

// ─── Talent Management (ATS + Desempeño + Formación) ─────────────────────────
export const talentApi = {
  // ATS
  positions: (params?: { status?: string }) => t('get', '/hrm/ats/positions', undefined, params),
  createPosition: (data: unknown) => t('post', '/hrm/ats/positions', data),
  updatePosition: (id: number, data: unknown) => t('put', `/hrm/ats/positions/${id}`, data),
  deletePosition: (id: number) => t('delete', `/hrm/ats/positions/${id}`),
  candidates: (positionId: number) => t('get', `/hrm/ats/positions/${positionId}/candidates`),
  createCandidate: (positionId: number, data: unknown) => t('post', `/hrm/ats/positions/${positionId}/candidates`, data),
  updateCandidate: (id: number, data: unknown) => t('put', `/hrm/ats/candidates/${id}`, data),
  createInterview: (candidateId: number, data: unknown) => t('post', `/hrm/ats/candidates/${candidateId}/interviews`, data),
  updateInterview: (id: number, data: unknown) => t('put', `/hrm/ats/interviews/${id}`, data),
  // Evaluaciones
  reviews: (params?: { employee_id?: number; status?: string }) => t('get', '/hrm/performance', undefined, params),
  createReview: (data: unknown) => t('post', '/hrm/performance', data),
  getReview: (id: number) => t('get', `/hrm/performance/${id}`),
  selfReview: (id: number, data: unknown) => t('post', `/hrm/performance/${id}/self-review`, data),
  managerReview: (id: number, data: unknown) => t('post', `/hrm/performance/${id}/manager-review`, data),
  completeReview: (id: number) => t('post', `/hrm/performance/${id}/complete`),
  // Formación
  training: (params?: { status?: string }) => t('get', '/hrm/training', undefined, params),
  createTraining: (data: unknown) => t('post', '/hrm/training', data),
  updateTraining: (id: number, data: unknown) => t('put', `/hrm/training/${id}`, data),
  deleteTraining: (id: number) => t('delete', `/hrm/training/${id}`),
  enrollments: (id: number) => t('get', `/hrm/training/${id}/enrollments`),
  enroll: (id: number, employee_ids: number[]) => t('post', `/hrm/training/${id}/enroll`, { employee_ids }),
  updateEnrollment: (trainingId: number, enrollId: number, data: unknown) =>
    t('put', `/hrm/training/${trainingId}/enrollments/${enrollId}`, data),
};

// ─── Portal B2B ───────────────────────────────────────────────────────────────
export const b2bApi = {
  // Admin — Distribuidores
  distributors: (params?: { status?: string; search?: string; page?: number }) =>
    t('get', '/b2b/distributors', undefined, params),
  getDistributor: (id: number) => t('get', `/b2b/distributors/${id}`),
  createDistributor: (data: unknown) => t('post', '/b2b/distributors', data),
  updateDistributor: (id: number, data: unknown) => t('put', `/b2b/distributors/${id}`, data),
  deleteDistributor: (id: number) => t('delete', `/b2b/distributors/${id}`),
  regenerateToken: (id: number) => t<{ token: string; expires_at: string }>('post', `/b2b/distributors/${id}/token`),
  // Admin — Reglas de precio
  priceRules: (distributorId: number) => t('get', `/b2b/distributors/${distributorId}/price-rules`),
  upsertPriceRule: (distributorId: number, data: unknown) =>
    t('post', `/b2b/distributors/${distributorId}/price-rules`, data),
  deletePriceRule: (ruleId: number) => t('delete', `/b2b/price-rules/${ruleId}`),
  // Admin — Pedidos B2B
  orders: (params?: { status?: string; distributor_id?: number; payment_status?: string; page?: number }) =>
    t('get', '/b2b/orders', undefined, params),
  getOrder: (id: number) => t('get', `/b2b/orders/${id}`),
  confirmOrder: (id: number) => t('post', `/b2b/orders/${id}/confirm`),
  shipOrder: (id: number) => t('post', `/b2b/orders/${id}/ship`),
  deliverOrder: (id: number) => t('post', `/b2b/orders/${id}/deliver`),
  cancelOrder: (id: number) => t('post', `/b2b/orders/${id}/cancel`),
  registerPayment: (id: number, data: { amount: number; method: string; reference?: string; payment_date: string; notes?: string }) =>
    t('post', `/b2b/orders/${id}/payments`, data),
};

// ─── Central API (re-export para comodidad) ───────────────────────────────────
export { default as apiClient } from './axios';
