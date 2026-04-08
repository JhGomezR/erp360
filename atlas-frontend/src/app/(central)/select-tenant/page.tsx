'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Building2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAuthStore } from '@/store/authStore';
import type { Tenant } from '@/types';

const STATUS_LABEL: Record<string, string> = {
  active: 'Activo',
  trial: 'Prueba',
  suspended: 'Suspendido',
  cancelled: 'Cancelado',
};

export default function SelectTenantPage() {
  const router = useRouter();
  const { isAuthenticated, tenants, setCurrentTenant } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated()) router.replace('/login');
  }, [isAuthenticated, router]);

  const handleSelect = (tenant: Tenant) => {
    setCurrentTenant(tenant);
    router.push(`/${tenant.slug}/dashboard`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-4">
      <div className="w-full max-w-md space-y-4">
        <div className="text-center mb-6">
          <div className="text-4xl font-black tracking-tight text-white mb-2">Atlas</div>
          <p className="text-slate-400 text-sm">Selecciona el negocio al que quieres acceder</p>
        </div>

        {tenants.map((t) => (
          <Card
            key={t.id}
            className="cursor-pointer hover:shadow-md transition-shadow border hover:border-primary/50"
            onClick={() => handleSelect(t)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Building2 className="size-5 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="text-base">{t.name}</CardTitle>
                    <p className="text-xs text-muted-foreground capitalize">{t.business_type}</p>
                  </div>
                </div>
                <Badge variant={t.status === 'active' ? 'default' : 'secondary'}>
                  {STATUS_LABEL[t.status] ?? t.status}
                </Badge>
              </div>
            </CardHeader>
            {t.plan && (
              <CardContent className="pt-0">
                <p className="text-xs text-muted-foreground">Plan: {t.plan.name}</p>
              </CardContent>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
