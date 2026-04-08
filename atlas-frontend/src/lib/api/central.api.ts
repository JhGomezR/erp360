import apiClient from './axios';
import type { AuthResponse, RegisterResponse, Plan, Addon, Tenant, PaymentGateway } from '@/types';

// ─── Auth ─────────────────────────────────────────────────────────────────────

export const authApi = {
  login: (email: string, password: string, totp_code?: string) =>
    apiClient.post<AuthResponse>('/auth/login', { email, password, totp_code }),

  register: (data: {
    owner_name: string;
    email: string;
    password: string;
    business_name: string;
    business_type_id: number;
    business_type?: string;
    plan_id: number;
    phone?: string;
    address?: string;
    seed_puc?: boolean;
  }) => apiClient.post<RegisterResponse>('/auth/register', data, { timeout: 120_000 }),

  /**
   * Recuperación de registro incompleto por timeout.
   * Autentica al usuario y devuelve la misma estructura que /auth/register.
   */
  resumeRegistration: (data: { email: string; password: string; plan_id?: number }) =>
    apiClient.post<RegisterResponse>('/auth/register/resume', data, { timeout: 30_000 }),

  logout: () => apiClient.post('/auth/logout'),

  me: () => apiClient.get('/auth/me'),

  updateProfile: (data: { name: string; phone?: string }) =>
    apiClient.put('/auth/profile', data),

  changePassword: (data: {
    current_password: string;
    password: string;
    password_confirmation: string;
  }) => apiClient.put('/auth/password', data),

  forgotPassword: (email: string) =>
    apiClient.post<{ message: string }>('/auth/forgot-password', { email }),

  resetPassword: (data: {
    token: string;
    email: string;
    password: string;
    password_confirmation: string;
  }) => apiClient.post<{ message: string }>('/auth/reset-password', data),
};

// ─── TOTP ─────────────────────────────────────────────────────────────────────

export const totpApi = {
  setup: () =>
    apiClient.post<{ qr_code_url: string; secret: string }>('/auth/2fa/setup'),

  enable: (code: string) =>
    apiClient.post('/auth/2fa/enable', { code }),

  disable: (code: string) =>
    apiClient.delete('/auth/2fa', { data: { code } }),

  status: () =>
    apiClient.get<{ enabled: boolean }>('/auth/2fa'),
};

// ─── Planes ───────────────────────────────────────────────────────────────────

export const plansApi = {
  list: (params?: { active_only?: boolean }) => apiClient.get<Plan[]>('/plans', { params }),
  get: (id: number) => apiClient.get<Plan>(`/plans/${id}`),
  create: (data: Partial<Plan>) => apiClient.post<Plan>('/plans', data),
  update: (id: number, data: Partial<Plan>) => apiClient.put<Plan>(`/plans/${id}`, data),
  delete: (id: number) => apiClient.delete(`/plans/${id}`),
};

// ─── Add-ons ──────────────────────────────────────────────────────────────────

export const addonsApi = {
  list: () => apiClient.get<Addon[]>('/addons'),
  create: (data: Partial<Addon>) => apiClient.post<Addon>('/addons', data),
  update: (id: number, data: Partial<Addon>) => apiClient.put<Addon>(`/addons/${id}`, data),
  delete: (id: number) => apiClient.delete(`/addons/${id}`),
};

// ─── Dashboard (Super Admin) ──────────────────────────────────────────────────

export const dashboardApi = {
  stats: () =>
    apiClient.get<{
      total_tenants: number;
      active_tenants: number;
      trial_tenants: number;
      suspended_tenants: number;
      mrr: number;
      arr: number;
      trial_conversion_rate: number;
      new_tenants_this_month: number;
      addon_requests_pending: number;
      recent_activity: {
        id: number;
        tenant: string;
        action: string;
        created_at: string;
      }[];
    }>('/dashboard'),
};

// ─── Tenants (Super Admin) ────────────────────────────────────────────────────

export const tenantsApi = {
  list: (params?: { status?: string; search?: string; page?: number; per_page?: number; sort_by?: string; sort_dir?: 'asc' | 'desc' }) =>
    apiClient.get<{ data: Tenant[]; last_page: number; total: number; current_page: number }>('/tenants', { params }),

  get: (id: string) =>
    apiClient.get<Tenant & {
      subscription: {
        plan: Plan;
        status: string;
        trial_ends_at: string | null;
        next_billing_at: string | null;
        amount: number;
      } | null;
      addons: Addon[];
    }>(`/tenants/${id}`),

  updateStatus: (id: string, status: string) =>
    apiClient.patch(`/tenants/${id}/status`, { status }),

  changePlan: (id: string, plan_id: number) =>
    apiClient.patch(`/tenants/${id}/plan`, { plan_id }),

  syncAddon: (id: string, addon_id: number, active: boolean) =>
    apiClient.post(`/tenants/${id}/addons`, { addon_id, active }),

  updateBusinessType: (id: string, business_type_id: number) =>
    apiClient.patch(`/tenants/${id}/business-type`, { business_type_id }),

  getModules: (id: string) =>
    apiClient.get<{ key: string; name: string; active: boolean }[]>(`/tenants/${id}/modules`),

  patchModule: (id: string, moduleKey: string, active: boolean) =>
    apiClient.patch(`/tenants/${id}/modules/${moduleKey}`, { active }),

  getSettings: (id: string) =>
    apiClient.get<Record<string, unknown>>(`/tenants/${id}/settings`),

  patchSettings: (id: string, settings: Record<string, unknown>) =>
    apiClient.patch(`/tenants/${id}/settings`, settings),

  seedPUC: (id: string) =>
    apiClient.post(`/tenants/${id}/seed-puc`),
};

// ─── Tenant Users (Super Admin) ───────────────────────────────────────────────

export const tenantUsersAdminApi = {
  list: (tenantId: string, params?: { page?: number; search?: string }) =>
    apiClient.get(`/tenants/${tenantId}/users`, { params }),

  get: (tenantId: string, userId: number) =>
    apiClient.get(`/tenants/${tenantId}/users/${userId}`),

  toggleActive: (tenantId: string, userId: number) =>
    apiClient.patch(`/tenants/${tenantId}/users/${userId}/toggle`),

  resetPassword: (tenantId: string, userId: number) =>
    apiClient.post(`/tenants/${tenantId}/users/${userId}/reset-password`),
};

// ─── Subscriptions (Super Admin) ─────────────────────────────────────────────

export const subscriptionsApi = {
  list: (params?: { tenant_id?: number; status?: string; page?: number }) =>
    apiClient.get('/subscriptions', { params }),

  get: (id: number) => apiClient.get(`/subscriptions/${id}`),

  create: (data: {
    tenant_id: number;
    plan_id: number;
    trial_days?: number;
    amount?: number;
  }) => apiClient.post('/subscriptions', data),

  recordPayment: (id: number, data: { amount: number; method: string; reference?: string }) =>
    apiClient.post(`/subscriptions/${id}/payments`, data),

  cancel: (id: number, reason?: string) =>
    apiClient.patch(`/subscriptions/${id}/cancel`, { reason }),

  tenantHistory: (tenantId: number) =>
    apiClient.get(`/subscriptions/tenant/${tenantId}/history`),
};

// ─── Historial de Add-ons (Super Admin) ───────────────────────────────────────

export const addonHistoryApi = {
  list: (params?: { status?: string; addon_id?: number; tenant_id?: string; page?: number }) =>
    apiClient.get('/addon-history', { params }),

  deactivate: (tenantId: string, addonId: number) =>
    apiClient.patch(`/addon-history/${tenantId}/${addonId}/deactivate`),

  activate: (tenantId: string, addonId: number) =>
    apiClient.patch(`/addon-history/${tenantId}/${addonId}/activate`),
};

// ─── Audit Log (Super Admin) ──────────────────────────────────────────────────

export const auditApi = {
  list: (params?: {
    tenant_slug?: string;
    level?: string;
    module?: string;
    action?: string;
    user_name?: string;
    search?: string;
    from?: string;
    to?: string;
    page?: number;
    per_page?: number;
  }) => apiClient.get('/audit', { params }),

  show: (id: number, tenantSlug: string) =>
    apiClient.get(`/audit/${id}`, { params: { tenant_slug: tenantSlug } }),

  stats: (params?: { hours?: number; tenant_slug?: string }) =>
    apiClient.get('/audit/stats', { params }),

  filters: (params?: { tenant_slug?: string }) =>
    apiClient.get('/audit/filters', { params }),
};

// ─── Notifications to Tenants (Super Admin) ───────────────────────────────────

export const centralNotificationsApi = {
  list: (params?: { page?: number }) => apiClient.get('/notifications', { params }),

  send: (data: {
    tenant_ids: string[] | number[] | 'all';
    subject: string;
    body: string;
    type: 'info' | 'warning' | 'billing' | 'system';
    channel?: 'email' | 'in_app' | 'both';
    display_type?: 'toast' | 'modal';
  }) => apiClient.post('/notifications/send', data),

  sendTrialExpiring: (days: number) =>
    apiClient.post('/notifications/trial-expiring', { days }),

  get: (id: number) => apiClient.get(`/notifications/${id}`),
};

// ─── Notification Rules (Super Admin) ────────────────────────────────────────

export interface NotificationRule {
  id: number;
  name: string;
  description?: string;
  event_trigger: 'tenant_created' | 'trial_expiring' | 'trial_expired' | 'payment_due' | 'payment_overdue';
  days_offset?: number | null;
  subject: string;
  body: string;
  notification_type: 'info' | 'warning' | 'billing' | 'system';
  channel: 'email' | 'in_app' | 'both';
  display_type: 'toast' | 'modal';
  target_all: boolean;
  tenant_ids?: string[] | null;
  is_active: boolean;
  run_at?: string | null;       // HH:MM, null = sin horario automático
  run_days?: number[] | null;   // 1-7 (ISO: 1=Lun … 7=Dom), null = todos los días
  last_run_at?: string | null;
  run_count: number;
  created_at: string;
  updated_at: string;
}

export const notificationRulesApi = {
  list: () => apiClient.get<NotificationRule[]>('/notification-rules'),

  create: (data: Omit<NotificationRule, 'id' | 'run_count' | 'last_run_at' | 'created_at' | 'updated_at'>) =>
    apiClient.post<NotificationRule>('/notification-rules', data),

  update: (id: number, data: Partial<Omit<NotificationRule, 'id' | 'run_count' | 'last_run_at' | 'created_at' | 'updated_at'>>) =>
    apiClient.put<NotificationRule>(`/notification-rules/${id}`, data),

  destroy: (id: number) => apiClient.delete(`/notification-rules/${id}`),

  toggle: (id: number) => apiClient.patch<NotificationRule>(`/notification-rules/${id}/toggle`),

  runNow: (id: number) => apiClient.post(`/notification-rules/${id}/run`),
};

// ─── Module Registry (Super Admin) ────────────────────────────────────────────

export const moduleRegistryApi = {
  list: () => apiClient.get<ModuleRegistry[]>('/modules'),
  get: (id: number) => apiClient.get<ModuleRegistry>(`/modules/${id}`),
  create: (data: { key: string; name: string; description?: string }) =>
    apiClient.post<ModuleRegistry>('/modules', data),
  update: (id: number, data: Partial<{ name: string; description: string }>) =>
    apiClient.put<ModuleRegistry>(`/modules/${id}`, data),
  delete: (id: number) => apiClient.delete(`/modules/${id}`),
};

// ─── Business Types ───────────────────────────────────────────────────────────

export interface BusinessTypeModule {
  module_key: string;
  is_required: boolean;
  is_default_on: boolean;
  sort_order: number;
}

export interface BusinessType {
  id: number;
  name: string;
  slug: string;
  description?: string;
  icon?: string;
  is_active: boolean;
  modules: BusinessTypeModule[];
}

export interface ModuleRegistry {
  key: string;
  name: string;
  description?: string;
}

export const businessTypesApi = {
  list: () => apiClient.get<BusinessType[]>('/business-types'),
  get: (id: number) => apiClient.get<BusinessType>(`/business-types/${id}`),
  create: (data: Partial<BusinessType>) => apiClient.post<BusinessType>('/business-types', data),
  update: (id: number, data: Partial<BusinessType>) => apiClient.put<BusinessType>(`/business-types/${id}`, data),
  delete: (id: number) => apiClient.delete(`/business-types/${id}`),
  syncModules: (id: number, modules: Partial<BusinessTypeModule>[]) =>
    apiClient.post(`/business-types/${id}/modules`, { modules }),
};

// ─── System Params (Super Admin) ──────────────────────────────────────────────

export const systemParamsApi = {
  list: (group?: string) => apiClient.get('/params', { params: { group } }),
  get: (key: string) => apiClient.get(`/params/${key}`),
  update: (params: { key: string; value: unknown }[]) => apiClient.patch('/params', { params }),
};

// ─── Currencies (Super Admin) ─────────────────────────────────────────────────

export const currenciesApi = {
  list: () => apiClient.get('/currencies'),
  create: (data: unknown) => apiClient.post('/currencies', data),
  update: (code: string, data: unknown) => apiClient.put(`/currencies/${code}`, data),
  rateList: (params?: { base?: string; date?: string }) => apiClient.get('/exchange-rates', { params }),
  rateCreate: (data: unknown) => apiClient.post('/exchange-rates', data),
};

// ─── Public Settings (no auth) ────────────────────────────────────────────────

export type PublicBranding = {
  login_bg_type: 'gradient' | 'color' | 'image';
  login_bg_value: string;
  login_bg_image: string;
  login_bg_color: string;
  app_name: string;
  logo_url: string;
};

export type PublicTrial = {
  days: number;
  card_required: boolean;
};

export const publicSettingsApi = {
  get: () =>
    apiClient.get<{ branding: PublicBranding; trial: PublicTrial; security: { idle_timeout: number; session_timeout: number } }>('/settings/public'),
};

// ─── Pasarelas de pago ────────────────────────────────────────────────────────

export const paymentGatewaysApi = {
  list: () =>
    apiClient.get<PaymentGateway[]>('/payment-gateways'),

  get: (id: number) =>
    apiClient.get<PaymentGateway>(`/payment-gateways/${id}`),

  save: (data: {
    gateway: 'wompi';
    is_sandbox: boolean;
    public_key: string;
    private_key: string;
    events_secret: string;
    integrity_secret: string;
    is_active?: boolean;
  }) => apiClient.post<PaymentGateway>('/payment-gateways', data),

  update: (id: number, data: Partial<{
    public_key: string;
    private_key: string;
    events_secret: string;
    integrity_secret: string;
    is_active: boolean;
  }>) => apiClient.put<PaymentGateway>(`/payment-gateways/${id}`, data),

  destroy: (id: number) =>
    apiClient.delete(`/payment-gateways/${id}`),

  toggle: (id: number) =>
    apiClient.patch<PaymentGateway>(`/payment-gateways/${id}/toggle`),
};

// ─── Central Users (RBAC) ─────────────────────────────────────────────────────

export interface CentralUser {
  id: number;
  name: string;
  email: string;
  phone?: string;
  is_active: boolean;
  roles: string[];
  created_at: string;
}

export const centralUsersApi = {
  list:  (params?: { search?: string; role?: string; per_page?: number }) =>
    apiClient.get<{ data: CentralUser[]; total: number; last_page: number; current_page: number }>('/central-users', { params }),

  roles: () =>
    apiClient.get<{ id: number; name: string }[]>('/central-users/roles'),

  create: (data: { name: string; email: string; password: string; role: string; phone?: string }) =>
    apiClient.post<{ message: string; user: CentralUser }>('/central-users', data),

  update: (id: number, data: Partial<{ name: string; email: string; password: string; role: string; phone: string; is_active: boolean }>) =>
    apiClient.put<{ message: string; user: CentralUser }>(`/central-users/${id}`, data),

  destroy: (id: number) =>
    apiClient.delete(`/central-users/${id}`),
};

// ─── Tipos de roles y permisos centrales ─────────────────────────────────────

export interface CentralPermission {
  id: number;
  name: string;    // e.g. "tenants.view"
  action: string;  // e.g. "view"
}

export interface CentralPermissionGroup {
  resource: string;                // e.g. "tenants"
  actions: CentralPermission[];
}

export interface CentralRole {
  id: number;
  name: string;
  is_system: boolean;  // true = no se puede eliminar (ej: "super")
  users_count: number;
  permissions: string[];  // ["tenants.view", "plans.create", ...]
}

export const centralRolesApi = {
  list: () =>
    apiClient.get<CentralRole[]>('/central-roles'),

  permissions: () =>
    apiClient.get<CentralPermissionGroup[]>('/central-roles/permissions'),

  create: (data: { name: string }) =>
    apiClient.post<CentralRole>('/central-roles', data),

  update: (id: number, data: { name: string }) =>
    apiClient.put<{ id: number; name: string }>(`/central-roles/${id}`, data),

  destroy: (id: number) =>
    apiClient.delete(`/central-roles/${id}`),

  syncPermissions: (id: number, permissions: string[]) =>
    apiClient.put<{ message: string; permissions: string[] }>(`/central-roles/${id}/permissions`, { permissions }),
};

