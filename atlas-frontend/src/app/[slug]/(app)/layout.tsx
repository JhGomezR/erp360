'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { Menu } from 'lucide-react';
import { AppSidebar } from '@/components/layout/AppSidebar';
import { Topbar } from '@/components/layout/Topbar';
import { TenantThemeSync } from '@/components/layout/TenantThemeSync';
import { NotificationModalPopup } from '@/components/layout/NotificationModalPopup';
import { Button } from '@/components/ui/button';
import { useAuthStore } from '@/store/authStore';
import { useIdleTimeout } from '@/hooks/useIdleTimeout';
import { usePublicSettings } from '@/hooks/usePublicSettings';
import { useTenantRealtime } from '@/hooks/useTenantRealtime';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const slug = params.slug as string;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { currentTenant } = useAuthStore();
  const { security } = usePublicSettings();

  // Cierra sesión tras inactividad según config central (idle_timeout en minutos)
  useIdleTimeout(security.idle_timeout);

  // Actualizaciones en tiempo real: ventas, stock, alertas
  useTenantRealtime(slug);

  if (!currentTenant) return null;

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <TenantThemeSync slug={slug} />
      <AppSidebar
        tenant={currentTenant}
        open={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        <div className="flex items-center lg:hidden h-14 border-b px-3 gap-2 bg-background sticky top-0 z-30">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
          >
            <Menu className="size-5" />
          </Button>
          <span className="font-bold text-primary">Atlas</span>
        </div>

        <Topbar tenantName={currentTenant.name} tenantSlug={slug} />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          {children}
        </main>
      </div>

      {/* Ventana emergente para notificaciones tipo modal */}
      <NotificationModalPopup />
    </div>
  );
}
