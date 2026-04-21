import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Tenant } from '@/types';
import { setToken, clearToken, setTenantToken, getTenantToken, clearTenantToken } from '@/lib/api/axios';

export interface TenantUserRole {
  id: number;
  name: string;
  module_permissions: Record<string, string[]>;
}

export interface TenantUser {
  id: number;
  name: string;
  email: string;
  is_active: boolean;
  roles: TenantUserRole[];
}

// Datos mínimos del tenant que se persisten en localStorage
interface StoredTenant {
  id: string;
  slug: string;
  name: string;
  business_type: string;
  status: string;
  plan_id: number;
}

interface AuthState {
  user: User | null;
  token: string | null;
  tenantToken: string | null;
  tenantUser: TenantUser | null;   // usuario dentro del schema del tenant (con roles reales)
  tenants: Tenant[];
  currentTenant: Tenant | null;

  // Actions
  setAuth: (token: string, user: User, tenants: Tenant[]) => void;
  setUser: (user: User) => void;
  setCurrentTenant: (tenant: Tenant) => void;
  setTenantAuth: (token: string, tenantUser: TenantUser) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
  isSuperAdmin: () => boolean;
  hasTenantToken: () => boolean;
  hasTenantRole: (role: string) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      tenantToken: null,
      tenantUser: null,
      tenants: [],
      currentTenant: null,

      setAuth: (token, user, tenants) => {
        setToken(token);
        clearTenantToken();
        // Limpiar sesión de tenant anterior al re-autenticar o cambiar de usuario
        localStorage.removeItem('atlas_tenant');
        set({ token, user, tenants, tenantToken: null, tenantUser: null, currentTenant: null });
      },

      setUser: (user) => set({ user }),

      setCurrentTenant: (tenant) => {
        clearTenantToken();
        set({ currentTenant: tenant, tenantToken: null, tenantUser: null });
        localStorage.setItem('atlas_tenant', JSON.stringify(tenant));
      },

      // Reemplaza setTenantAuthToken — guarda también el usuario tenant con sus roles
      setTenantAuth: (token, tenantUser) => {
        setTenantToken(token);
        set({ tenantToken: token, tenantUser });
      },

      logout: () => {
        clearToken();
        clearTenantToken();
        localStorage.removeItem('atlas_tenant');
        set({ user: null, token: null, tenants: [], currentTenant: null, tenantToken: null, tenantUser: null });
      },

      isAuthenticated: () => !!get().token && !!get().user,

      isSuperAdmin: () => get().user?.roles?.includes('super') ?? false,

      hasTenantToken: () => !!(get().tenantToken || getTenantToken()),

      hasTenantRole: (role: string) =>
        get().tenantUser?.roles?.some((r) => r.name === role) ?? false,
    }),
    {
      name: 'atlas-auth',
      // Solo persistir datos mínimos — nunca plan completo, precios ni módulos
      partialize: (state) => ({
        user: state.user
          ? { id: state.user.id, name: state.user.name, email: state.user.email, roles: state.user.roles }
          : null,
        token: state.token,
        tenantToken: state.tenantToken,
        tenantUser: state.tenantUser
          ? { id: state.tenantUser.id, name: state.tenantUser.name, email: state.tenantUser.email,
              is_active: state.tenantUser.is_active, roles: state.tenantUser.roles }
          : null,
        tenants: (state.tenants ?? []).map((t): StoredTenant => ({
          id: t.id, slug: t.slug, name: t.name,
          business_type: t.business_type, status: t.status, plan_id: t.plan_id,
        })),
        currentTenant: state.currentTenant
          ? { id: state.currentTenant.id, slug: state.currentTenant.slug,
              name: state.currentTenant.name, business_type: state.currentTenant.business_type,
              status: state.currentTenant.status, plan_id: state.currentTenant.plan_id }
          : null,
      }),
    }
  )
);
