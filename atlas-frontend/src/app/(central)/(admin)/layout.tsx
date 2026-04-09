'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Users,
  Package,
  Layers,
  Activity,
  LogOut,
  Bell,
  ClipboardList,
  ShieldCheck,
  LayoutDashboard,
  Settings,
  CreditCard,
  DollarSign,
  Database,
  HeartPulse,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@/lib/api/central.api';
import { usePublicSettings } from '@/hooks/usePublicSettings';
import { useIdleTimeout } from '@/hooks/useIdleTimeout';

const NAV_GROUPS = [
  {
    label: 'Principal',
    items: [
      { label: 'Monitoreo', href: '/atlas-mandragora/monitoring', icon: Activity },
      { label: 'Tenants', href: '/atlas-mandragora/tenants', icon: Users },
    ],
  },
  {
    label: 'Configuración',
    items: [
      { label: 'Planes', href: '/atlas-mandragora/plans', icon: Layers },
      { label: 'Add-ons', href: '/atlas-mandragora/addons', icon: Package },
      { label: 'Usuarios', href: '/atlas-mandragora/users', icon: Users },
      { label: 'Roles y Permisos', href: '/atlas-mandragora/roles', icon: ShieldCheck },
    ],
  },
  {
    label: 'Operaciones',
    items: [
      { label: 'Historial Add-ons', href: '/atlas-mandragora/addon-requests', icon: ClipboardList },
      { label: 'Notificaciones', href: '/atlas-mandragora/notifications', icon: Bell },
      { label: 'Audit Log', href: '/atlas-mandragora/audit', icon: ShieldCheck },
    ],
  },
  {
    label: 'Sistema',
    items: [
      { label: 'Pasarelas de Pago', href: '/atlas-mandragora/payment-gateways', icon: CreditCard },
      { label: 'Monedas',           href: '/atlas-mandragora/currencies',        icon: DollarSign },
      { label: 'Backups BD',        href: '/atlas-mandragora/backups',           icon: Database },
      { label: 'Health',            href: '/atlas-mandragora/health',            icon: HeartPulse },
      { label: 'Configuración',     href: '/atlas-mandragora/settings',          icon: Settings },
    ],
  },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, isSuperAdmin, logout } = useAuthStore();
  const { branding, security } = usePublicSettings();
  const [mounted, setMounted] = useState(false);

  // Cierra sesión tras inactividad según config central
  useIdleTimeout(security.idle_timeout);

  useEffect(() => {
    setMounted(true);
    if (!isAuthenticated() || !isSuperAdmin()) {
      router.replace('/login');
    }
  }, [isAuthenticated, isSuperAdmin, router]);

  // Antes de montar: SSR y primer render del cliente devuelven lo mismo (null)
  // para evitar hydration mismatch con Zustand persist (localStorage no existe en SSR).
  if (!mounted || !isAuthenticated() || !isSuperAdmin()) return null;

  const handleLogout = async () => {
    try { await authApi.logout(); } catch { /* */ }
    logout();
    router.push('/login');
  };

  return (
    <div className="flex h-screen bg-background">
      <aside className="w-60 border-r flex flex-col bg-sidebar shrink-0">
        {/* Logo */}
        <div className="h-14 flex items-center px-4 border-b gap-2">
          <span className="text-lg font-black text-sidebar-primary">{branding.app_name}</span>
          <span className="text-xs font-medium text-muted-foreground bg-muted px-1.5 py-0.5 rounded">
            Admin
          </span>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-4">
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              <p className="px-2.5 mb-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/60">
                {group.label}
              </p>
              <div className="space-y-0.5">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const active =
                    pathname === item.href ||
                    (item.href !== '/atlas-mandragora' && pathname.startsWith(item.href + '/'));
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={cn(
                        'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                        active
                          ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                          : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                      )}
                    >
                      <Icon className="size-4 shrink-0" />
                      {item.label}
                    </Link>
                  );
                })}
              </div>
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t p-2 space-y-1">
          <Link
            href="/"
            className="flex items-center gap-2 rounded-md px-2.5 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          >
            <LayoutDashboard className="size-3.5" />
            Ver landing page
          </Link>
          <Button
            variant="ghost"
            size="sm"
            className="w-full justify-start gap-2 text-sm"
            onClick={handleLogout}
          >
            <LogOut className="size-4" />
            Salir
          </Button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto p-6">{children}</main>
    </div>
  );
}
