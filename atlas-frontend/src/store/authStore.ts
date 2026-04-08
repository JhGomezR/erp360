import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { User, Tenant } from '@/types';
import { setToken, clearToken, setTenantToken, getTenantToken, clearTenantToken } from '@/lib/api/axios';

interface AuthState {
  user: User | null;
  token: string | null;
  tenantToken: string | null;
  tenants: Tenant[];
  currentTenant: Tenant | null;

  // Actions
  setAuth: (token: string, user: User, tenants: Tenant[]) => void;
  setUser: (user: User) => void;
  setCurrentTenant: (tenant: Tenant) => void;
  setTenantAuthToken: (token: string) => void;
  logout: () => void;
  isAuthenticated: () => boolean;
  isSuperAdmin: () => boolean;
  hasTenantToken: () => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      tenantToken: null,
      tenants: [],
      currentTenant: null,

      setAuth: (token, user, tenants) => {
        setToken(token);
        clearTenantToken(); // limpiar localStorage['atlas_tenant_token'] al re-autenticar
        set({ token, user, tenants, tenantToken: null });
      },

      setUser: (user) => set({ user }),

      setCurrentTenant: (tenant) => {
        clearTenantToken(); // limpiar localStorage['atlas_tenant_token'] al cambiar de negocio
        set({ currentTenant: tenant, tenantToken: null });
        localStorage.setItem('atlas_tenant', JSON.stringify(tenant));
      },

      setTenantAuthToken: (token) => {
        setTenantToken(token);
        set({ tenantToken: token });
      },

      logout: () => {
        clearToken();
        set({ user: null, token: null, tenants: [], currentTenant: null, tenantToken: null });
      },

      isAuthenticated: () => !!get().token && !!get().user,

      isSuperAdmin: () => get().user?.roles?.includes('super') ?? false,

      hasTenantToken: () => {
        // Verifica tanto el store como localStorage (pueden estar desfasados tras hydrate)
        return !!(get().tenantToken || getTenantToken());
      },
    }),
    {
      name: 'atlas-auth',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        tenantToken: state.tenantToken,
        tenants: state.tenants,
        currentTenant: state.currentTenant,
      }),
    }
  )
);
