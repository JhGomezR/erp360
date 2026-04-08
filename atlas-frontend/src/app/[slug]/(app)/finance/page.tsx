'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { setTenantSlug, agingApi, purchasesApi, financeApi } from '@/lib/api/tenant.api';
import { AddonGate } from '@/components/shared/AddonPaywall';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  TrendingUp, TrendingDown, ArrowLeftRight, AlertTriangle,
  ChevronRight, DollarSign, Clock, CheckCircle,
} from 'lucide-react';

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, color = 'text-primary', loading,
}: {
  label: string; value: string; sub?: string;
  icon: React.ElementType; color?: string; loading?: boolean;
}) {
  return (
    <Card>
      <CardContent className="py-4 flex items-center gap-4">
        <div className={`size-11 rounded-full bg-muted flex items-center justify-center ${color}`}>
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">{label}</p>
          {loading
            ? <Skeleton className="h-6 w-28 mt-1" />
            : <p className="text-xl font-bold truncate">{value}</p>}
          {sub && !loading && <p className="text-xs text-muted-foreground">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Section Card ─────────────────────────────────────────────────────────────

function SectionCard({
  title, description, icon: Icon, href, badges, loading,
}: {
  title: string; description: string; icon: React.ElementType;
  href: string; badges?: { label: string; variant: 'default' | 'secondary' | 'outline' }[];
  loading?: boolean;
}) {
  const router = useRouter();
  return (
    <Card
      className="cursor-pointer hover:shadow-md hover:border-primary/40 transition-all group"
      onClick={() => router.push(href)}
    >
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="size-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Icon className="size-5" />
            </div>
            <CardTitle className="text-base">{title}</CardTitle>
          </div>
          <ChevronRight className="size-4 text-muted-foreground group-hover:text-primary transition-colors" />
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-3">{description}</p>
        {loading
          ? <div className="flex gap-2">{Array.from({ length: 2 }).map((_, i) => <Skeleton key={i} className="h-5 w-20" />)}</div>
          : badges && (
            <div className="flex flex-wrap gap-2">
              {badges.map((b) => (
                <Badge key={b.label} variant={b.variant}>{b.label}</Badge>
              ))}
            </div>
          )}
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function FinancePage() {
  const params = useParams();
  const slug = params.slug as string;

  useEffect(() => { setTenantSlug(slug); }, [slug]);

  // Cartera (aging)
  const { data: agingSummary, isLoading: loadingAging } = useQuery<any>({
    queryKey: ['aging-summary', slug],
    queryFn: async () => {
      const r = await agingApi.summary();
      return r.data;
    },
  });

  // Cuentas por pagar
  const { data: payablesData, isLoading: loadingPayables } = useQuery<any>({
    queryKey: ['payables-summary', slug],
    queryFn: async () => {
      const r = await purchasesApi.vendorInvoices({ payment_status: 'pending', page: 1 });
      return r.data;
    },
  });

  // Transferencias bancarias
  const { data: transfersData, isLoading: loadingTransfers } = useQuery<any>({
    queryKey: ['transfers-summary', slug],
    queryFn: async () => {
      const r = await financeApi.transfers({ page: 1 });
      return r.data;
    },
  });

  const totalReceivable: number = agingSummary?.total_receivable ?? 0;
  const overdue: number = agingSummary?.overdue ?? 0;
  const collectionRate: number = agingSummary?.collection_rate ?? 0;

  const payablesTotal: number = (payablesData?.data ?? []).reduce(
    (sum: number, inv: any) => sum + (inv.balance ?? 0), 0,
  );
  const overduePayables: number = (payablesData?.data ?? []).filter(
    (inv: any) => inv.days_overdue && inv.days_overdue > 0,
  ).length;

  const pendingTransfers: number = (transfersData?.data ?? []).filter(
    (t: any) => t.status === 'draft' || t.status === 'approved',
  ).length;

  return (
    <AddonGate moduleKey="finance" slug={slug}>
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Finanzas</h1>
        <p className="text-muted-foreground text-sm">
          Cartera, cuentas por pagar y transferencias bancarias
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard
          label="Cartera total"
          value={fmt(totalReceivable)}
          sub={`${agingSummary?.customer_count ?? 0} clientes`}
          icon={TrendingUp}
          color="text-blue-600"
          loading={loadingAging}
        />
        <KpiCard
          label="Cartera vencida"
          value={fmt(overdue)}
          sub={`${((overdue / (totalReceivable || 1)) * 100).toFixed(1)}% del total`}
          icon={AlertTriangle}
          color={overdue > 0 ? 'text-orange-600' : 'text-green-600'}
          loading={loadingAging}
        />
        <KpiCard
          label="Cuentas por pagar"
          value={fmt(payablesTotal)}
          sub={overduePayables > 0 ? `${overduePayables} vencidas` : 'Al día'}
          icon={TrendingDown}
          color={overduePayables > 0 ? 'text-red-600' : 'text-green-600'}
          loading={loadingPayables}
        />
        <KpiCard
          label="Transferencias pendientes"
          value={String(pendingTransfers)}
          sub="Requieren acción"
          icon={ArrowLeftRight}
          color="text-primary"
          loading={loadingTransfers}
        />
      </div>

      {/* Collection rate banner */}
      {!loadingAging && collectionRate > 0 && (
        <div className="flex items-center gap-3 rounded-lg border bg-muted/30 px-4 py-3">
          <CheckCircle className={`size-5 shrink-0 ${collectionRate >= 80 ? 'text-green-600' : 'text-orange-500'}`} />
          <div className="flex-1">
            <p className="text-sm font-medium">
              Tasa de cobro: <span className={collectionRate >= 80 ? 'text-green-600' : 'text-orange-600'}>{collectionRate.toFixed(1)}%</span>
            </p>
            <p className="text-xs text-muted-foreground">
              {collectionRate >= 80
                ? 'La cartera está siendo gestionada eficientemente.'
                : 'Se recomienda revisar la cartera vencida y enviar recordatorios.'}
            </p>
          </div>
          {collectionRate < 80 && (
            <Button size="sm" variant="outline" onClick={async () => {
              await agingApi.sendReminders({ days_overdue_min: 1 });
            }}>
              Enviar recordatorios
            </Button>
          )}
        </div>
      )}

      {/* Section cards */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">Módulos de Finanzas</h2>
        <div className="grid sm:grid-cols-3 gap-4">
          <SectionCard
            title="Cartera y Aging"
            description="Análisis de cuentas por cobrar por antigüedad, envío de recordatorios de cobro y log de gestión."
            icon={TrendingUp}
            href={`/${slug}/aging`}
            loading={loadingAging}
            badges={[
              { label: `${agingSummary?.invoice_count ?? 0} facturas`, variant: 'secondary' },
              { label: overdue > 0 ? 'Tiene vencidos' : 'Al día', variant: overdue > 0 ? 'outline' : 'default' },
            ]}
          />
          <SectionCard
            title="Cuentas por Pagar"
            description="Gestión de facturas de proveedores pendientes de pago, programación y seguimiento de pagos."
            icon={TrendingDown}
            href={`/${slug}/payables`}
            loading={loadingPayables}
            badges={[
              { label: `${payablesData?.total ?? 0} facturas`, variant: 'secondary' },
              { label: overduePayables > 0 ? `${overduePayables} vencidas` : 'Sin vencidos', variant: overduePayables > 0 ? 'outline' : 'default' },
            ]}
          />
          <SectionCard
            title="Transferencias Bancarias"
            description="Lotes de transferencias masivas, pagos de nómina y dispersión a cuentas de empleados."
            icon={ArrowLeftRight}
            href={`/${slug}/transfers`}
            loading={loadingTransfers}
            badges={[
              { label: `${transfersData?.total ?? 0} lotes`, variant: 'secondary' },
              { label: pendingTransfers > 0 ? `${pendingTransfers} pendientes` : 'Sin pendientes', variant: pendingTransfers > 0 ? 'outline' : 'default' },
            ]}
          />
        </div>
      </div>

      {/* Quick stats grid */}
      <div>
        <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-4">Resumen de Cartera por Vencimiento</h2>
        {loadingAging
          ? <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-lg" />)}</div>
          : agingSummary?.buckets ? (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {(agingSummary.buckets as any[]).map((bucket: any) => (
                <Card key={bucket.label}>
                  <CardContent className="py-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">{bucket.label}</p>
                    <p className="text-lg font-bold">{fmt(bucket.total ?? 0)}</p>
                    <p className="text-xs text-muted-foreground">{bucket.count ?? 0} facturas</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: 'Corriente (0–30)', key: 'current' },
                { label: '31–60 días', key: 'overdue_30' },
                { label: '61–90 días', key: 'overdue_60' },
                { label: '+90 días', key: 'critical_overdue' },
              ].map(({ label, key }) => (
                <Card key={key}>
                  <CardContent className="py-3 text-center">
                    <p className="text-xs text-muted-foreground mb-1">{label}</p>
                    <p className="text-lg font-bold">{fmt(agingSummary?.[key] ?? 0)}</p>
                    <div className="flex justify-center mt-1">
                      {key === 'current'
                        ? <Clock className="size-3 text-green-500" />
                        : <AlertTriangle className="size-3 text-orange-500" />}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
      </div>

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2 pt-2 border-t">
        <p className="text-xs text-muted-foreground self-center mr-2 w-full sm:w-auto">Acciones rápidas:</p>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => agingApi.sendReminders({ days_overdue_min: 1 })}>
          <DollarSign className="size-3.5" />Enviar cobros
        </Button>
      </div>
    </div>
    </AddonGate>
  );
}
