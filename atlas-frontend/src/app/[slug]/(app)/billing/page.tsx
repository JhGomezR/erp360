'use client';

import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { notify } from '@/lib/notify';
import { CreditCard, Package, CheckCircle, Clock, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { billingApi } from '@/lib/api/tenant.api';
import { setTenantSlug } from '@/lib/api/tenant.api';

interface BillingInfo {
  plan?: { name: string; price: number; modules: string[] };
  subscription?: { status: string; trial_ends_at?: string; next_billing_at?: string; amount: number };
  payments?: { id: number; amount: number; status: string; paid_at?: string; method?: string }[];
}
interface Addon {
  id: number; name: string; description?: string; module_key: string; price: number;
  is_owned?: boolean;
}

const fmt = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

export default function BillingPage() {
  const params = useParams();
  const slug = params.slug as string;
  const qc = useQueryClient();

  useEffect(() => { setTenantSlug(slug); }, [slug]);

  const { data: billing, isLoading: loadingBilling } = useQuery<BillingInfo>({
    queryKey: ['billing', slug],
    queryFn: async () => {
      const r = await billingApi.get();
      return r.data as BillingInfo;
    },
  });

  const { data: addons = [], isLoading: loadingAddons } = useQuery<Addon[]>({
    queryKey: ['billing-addons', slug],
    queryFn: async () => {
      const r = await billingApi.addons();
      const body = r.data as { available: Addon[] };
      return body.available ?? [];
    },
  });

  const activateFreeAddon = useMutation({
    mutationFn: (addonId: number) => billingApi.requestAddon(addonId),
    onSuccess: () => {
      notify.success('¡Add-on activado!');
      qc.invalidateQueries({ queryKey: ['billing-addons', slug] });
    },
    onError: (err) => notify.error(err, 'Error al activar el add-on'),
  });

  const handleBuyAddon = (addon: Addon) => {
    if (addon.price > 0) {
      window.location.href = `/${slug}/billing/checkout?type=addon&id=${addon.id}`;
    } else {
      activateFreeAddon.mutate(addon.id);
    }
  };

  const plan = billing?.plan;
  const sub = billing?.subscription;
  const payments = billing?.payments ?? [];

  const statusVariant = (s?: string): 'default' | 'secondary' | 'outline' => {
    if (s === 'active') return 'default';
    if (s === 'trial') return 'secondary';
    return 'outline';
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Facturación</h1>
        <p className="text-muted-foreground text-sm">Plan, módulos adicionales e historial de pagos</p>
      </div>

      {/* Plan actual */}
      {loadingBilling ? (
        <Skeleton className="h-40 rounded-xl" />
      ) : (
        <Card className="border-primary/30 bg-primary/5">
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Plan actual</p>
                <CardTitle className="text-xl mt-0.5">{plan?.name ?? '—'}</CardTitle>
              </div>
              <Badge variant={statusVariant(sub?.status)}>
                {sub?.status === 'active' ? 'Activo' : sub?.status === 'trial' ? 'Periodo de prueba' : sub?.status ?? 'Sin suscripción'}
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-black">{fmt(plan?.price ?? 0)}</span>
              <span className="text-muted-foreground text-sm">/ mes</span>
            </div>

            {sub?.trial_ends_at && (
              <div className="flex items-center gap-2 text-sm text-amber-600">
                <Clock className="size-4" />
                Prueba gratuita hasta: {new Date(sub.trial_ends_at).toLocaleDateString('es-CO')}
              </div>
            )}
            {sub?.next_billing_at && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <CreditCard className="size-4" />
                Próximo cobro: {new Date(sub.next_billing_at).toLocaleDateString('es-CO')}
              </div>
            )}

            {/* Módulos incluidos */}
            {plan?.modules && plan.modules.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-2">Módulos incluidos</p>
                <div className="flex flex-wrap gap-1.5">
                  {plan.modules.map((m) => (
                    <div key={m} className="flex items-center gap-1 text-xs bg-background border rounded-full px-2 py-0.5">
                      <CheckCircle className="size-3 text-green-500" />
                      {m}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Módulos adicionales (add-ons) */}
      <div>
        <h2 className="text-base font-semibold mb-3">Módulos adicionales</h2>
        {loadingAddons ? (
          <div className="grid sm:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-28 rounded-lg" />)}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {addons.map((addon) => {
              const isActive = addon.is_owned === true;
              return (
                <Card key={addon.id} className={isActive ? 'border-green-500/40' : ''}>
                  <CardContent className="pt-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Package className={`size-5 ${isActive ? 'text-green-600' : 'text-muted-foreground'}`} />
                        <span className="font-semibold text-sm">{addon.name}</span>
                      </div>
                      {isActive && (
                        <div className="flex items-center gap-1 text-xs text-green-600">
                          <ShieldCheck className="size-3" />Activo
                        </div>
                      )}
                    </div>
                    {addon.description && (
                      <p className="text-xs text-muted-foreground mb-3">{addon.description}</p>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold">
                        {addon.price > 0
                          ? <>{fmt(addon.price)}<span className="text-xs text-muted-foreground font-normal">/mes</span></>
                          : <span className="text-green-600">Gratis</span>}
                      </span>
                      {!isActive && (
                        <Button size="sm" variant="outline"
                          onClick={() => handleBuyAddon(addon)}
                          disabled={activateFreeAddon.isPending}>
                          {addon.price > 0 ? 'Pagar con Wompi' : 'Activar gratis'}
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {addons.length === 0 && (
              <p className="col-span-2 text-center py-6 text-muted-foreground text-sm">
                No hay módulos adicionales disponibles
              </p>
            )}
          </div>
        )}
      </div>

      {/* Historial de pagos */}
      <div>
        <h2 className="text-base font-semibold mb-3">Historial de pagos</h2>
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Fecha</th>
                  <th className="text-right px-4 py-3 font-medium">Monto</th>
                  <th className="text-left px-4 py-3 font-medium">Método</th>
                  <th className="text-left px-4 py-3 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loadingBilling
                  ? Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i}>{Array.from({ length: 4 }).map((__, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
                      ))}</tr>
                    ))
                  : payments.map((p) => (
                      <tr key={p.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 text-muted-foreground">
                          {p.paid_at ? new Date(p.paid_at).toLocaleDateString('es-CO') : '—'}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">{fmt(p.amount)}</td>
                        <td className="px-4 py-3 text-muted-foreground capitalize">{p.method ?? '—'}</td>
                        <td className="px-4 py-3">
                          <Badge variant={p.status === 'paid' ? 'default' : 'secondary'}>
                            {p.status === 'paid' ? 'Pagado' : p.status === 'pending' ? 'Pendiente' : p.status}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                {!loadingBilling && payments.length === 0 && (
                  <tr><td colSpan={4} className="text-center py-8 text-muted-foreground text-sm">Sin historial de pagos</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
