'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  TrendingUp, ShoppingCart, Package, Users,
  AlertTriangle, CheckCircle2, UserPlus,
  BarChart2, ArrowRight, Wallet, Clock,
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { dashboardApi } from '@/lib/api/tenant.api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Summary {
  sales_today: number;
  sales_today_count: number;
  low_stock_count: number;
  customers_count: number;
  sales_month: number;
  sales_month_count: number;
  recent_sales?: {
    id: number; code: string; total: number; payment_method: string; created_at: string;
  }[];
  low_stock_products?: {
    id: number; name: string; sku: string; stock: number; min_stock: number;
  }[];
}

interface ChartPoint {
  date: string;
  total: number;
  count: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

const fmtCompact = (n: number) => {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${n}`;
};

const PAYMENT_LABEL: Record<string, string> = {
  cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia',
};

const PAYMENT_ICON: Record<string, string> = {
  cash: '💵', card: '💳', transfer: '🏦',
};

const PERIOD_OPTIONS = [
  { value: 'week' as const, label: 'Semana' },
  { value: 'month' as const, label: 'Mes' },
  { value: 'year' as const, label: 'Año' },
];

function getGreeting() {
  const h = new Date().getHours();
  if (h < 12) return '¡Buenos días!';
  if (h < 18) return '¡Buenas tardes!';
  return '¡Buenas noches!';
}

function getTodayLabel() {
  return new Date().toLocaleDateString('es-CO', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const { total, count } = payload[0]?.payload ?? {};
  return (
    <div className="rounded-xl border bg-popover px-3 py-2 shadow-lg text-sm">
      <p className="font-semibold mb-1">{label}</p>
      <p className="text-muted-foreground">
        Ventas: <span className="text-foreground font-medium">{fmt(total ?? 0)}</span>
      </p>
      <p className="text-muted-foreground">
        Transacciones: <span className="text-foreground font-medium">{count ?? 0}</span>
      </p>
    </div>
  );
}

// ─── Quick Action Card ────────────────────────────────────────────────────────

function QuickAction({
  href, icon: Icon, label, description, colorClass,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  description: string;
  colorClass: string;
}) {
  return (
    <Link
      href={href}
      className="group flex flex-col gap-3 rounded-2xl border bg-card p-4 hover:shadow-md transition-all hover:-translate-y-0.5 hover:border-primary/30"
    >
      <div className={`size-10 rounded-xl flex items-center justify-center ${colorClass}`}>
        <Icon className="size-5 text-white" />
      </div>
      <div>
        <p className="font-semibold text-sm">{label}</p>
        <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
      </div>
      <ArrowRight className="size-3.5 text-muted-foreground/50 group-hover:text-primary group-hover:translate-x-0.5 transition-all self-end mt-auto" />
    </Link>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  label, value, sub, icon: Icon, accentClass, loading,
}: {
  label: string;
  value: string | null;
  sub: string;
  icon: React.ElementType;
  accentClass: string;
  loading: boolean;
}) {
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-0">
        <div className="flex items-stretch">
          <div className={`w-1.5 shrink-0 ${accentClass}`} />
          <div className="flex-1 p-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
              <div className={`size-8 rounded-lg flex items-center justify-center ${accentClass} bg-opacity-10`}>
                <Icon className={`size-4 ${accentClass.replace('bg-', 'text-')}`} />
              </div>
            </div>
            {loading || value === null ? (
              <>
                <Skeleton className="h-7 w-28 mb-1.5" />
                <Skeleton className="h-3 w-20" />
              </>
            ) : (
              <>
                <div className="text-2xl font-bold tracking-tight">{value}</div>
                <p className="text-xs text-muted-foreground mt-1">{sub}</p>
              </>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('month');

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-summary', slug],
    queryFn: async () => {
      const res = await dashboardApi.summary();
      return res.data as Summary;
    },
    refetchInterval: 60_000,
  });

  const { data: chartData, isLoading: chartLoading } = useQuery({
    queryKey: ['dashboard-chart', slug, period],
    queryFn: async () => {
      const res = await dashboardApi.salesChart(period);
      return (res.data as any) as ChartPoint[];
    },
    staleTime: 1000 * 60 * 5,
  });

  const chartPoints: ChartPoint[] = Array.isArray(chartData) ? chartData : [];

  const formatXAxis = (date: string) => {
    const d = new Date(date);
    if (period === 'year') return d.toLocaleDateString('es-CO', { month: 'short' });
    if (period === 'week') return d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric' });
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  };

  const kpis = [
    {
      label: 'Ventas hoy',
      value: data ? fmt(data.sales_today) : null,
      sub: data ? `${data.sales_today_count} transacciones` : '',
      icon: TrendingUp,
      accentClass: 'bg-primary',
    },
    {
      label: 'Ventas del mes',
      value: data ? fmt(data.sales_month) : null,
      sub: data ? `${data.sales_month_count} transacciones` : '',
      icon: Wallet,
      accentClass: 'bg-blue-500',
    },
    {
      label: 'Stock bajo',
      value: data ? String(data.low_stock_count) : null,
      sub: 'productos por reponer',
      icon: Package,
      accentClass: data?.low_stock_count ? 'bg-amber-500' : 'bg-green-500',
    },
    {
      label: 'Clientes',
      value: data ? data.customers_count.toLocaleString('es-CO') : null,
      sub: 'registrados',
      icon: Users,
      accentClass: 'bg-purple-500',
    },
  ];

  const QUICK_ACTIONS = [
    {
      href: `/${slug}/pos`,
      icon: ShoppingCart,
      label: 'Nueva venta',
      description: 'Ir al punto de venta',
      colorClass: 'bg-blue-500',
    },
    {
      href: `/${slug}/customers`,
      icon: UserPlus,
      label: 'Nuevo cliente',
      description: 'Registrar un cliente',
      colorClass: 'bg-purple-500',
    },
    {
      href: `/${slug}/inventory`,
      icon: Package,
      label: 'Inventario',
      description: 'Ver y agregar productos',
      colorClass: 'bg-amber-500',
    },
    {
      href: `/${slug}/reports`,
      icon: BarChart2,
      label: 'Ver reportes',
      description: 'Análisis de tu negocio',
      colorClass: 'bg-green-500',
    },
  ];

  return (
    <div className="space-y-7">

      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight">{getGreeting()}</h1>
        <p className="text-sm text-muted-foreground capitalize flex items-center gap-1.5">
          <Clock className="size-3.5" />
          {getTodayLabel()}
        </p>
      </div>

      {/* Acciones rápidas */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70 mb-3">
          Acciones rápidas
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {QUICK_ACTIONS.map((a) => (
            <QuickAction key={a.href} {...a} />
          ))}
        </div>
      </div>

      {/* KPIs */}
      <div>
        <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground/70 mb-3">
          Resumen
        </p>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {kpis.map((k) => (
            <KpiCard key={k.label} {...k} loading={isLoading} />
          ))}
        </div>
      </div>

      {/* Sales chart */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div>
              <CardTitle className="text-sm font-semibold">Evolución de ventas</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                {chartLoading ? '...' : `${chartPoints.length} puntos de datos`}
              </p>
            </div>
            <div className="flex gap-1 p-0.5 rounded-lg bg-muted">
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPeriod(opt.value)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    period === opt.value
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {chartLoading ? (
            <Skeleton className="h-52 w-full rounded-lg" />
          ) : chartPoints.length === 0 ? (
            <div className="h-52 flex flex-col items-center justify-center text-muted-foreground text-sm gap-2">
              <BarChart2 className="size-8 opacity-20" />
              Sin datos para el período seleccionado
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartPoints} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="gradientTotal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="date"
                  tickFormatter={formatXAxis}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tickFormatter={fmtCompact}
                  tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={false}
                  tickLine={false}
                  width={56}
                />
                <Tooltip content={<ChartTooltip />} />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill="url(#gradientTotal)"
                  dot={false}
                  activeDot={{ r: 4, fill: 'hsl(var(--primary))' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Recent sales */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Ventas recientes</CardTitle>
              <Link
                href={`/${slug}/sales`}
                className="text-xs text-primary hover:underline flex items-center gap-1"
              >
                Ver todas <ArrowRight className="size-3" />
              </Link>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="px-4 pb-4 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="size-9 rounded-xl" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-24" />
                      <Skeleton className="h-3 w-16" />
                    </div>
                    <Skeleton className="h-4 w-16" />
                  </div>
                ))}
              </div>
            ) : data?.recent_sales?.length ? (
              <div className="divide-y">
                {data.recent_sales.slice(0, 6).map((s) => (
                  <div key={s.id} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors">
                    <div className="size-9 rounded-xl bg-green-500/10 flex items-center justify-center shrink-0 text-base">
                      {PAYMENT_ICON[s.payment_method] ?? '💰'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold">{s.code}</p>
                      <p className="text-xs text-muted-foreground flex items-center gap-1">
                        <span>{PAYMENT_LABEL[s.payment_method] ?? s.payment_method}</span>
                        <span className="text-muted-foreground/40">·</span>
                        <span>{new Date(s.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}</span>
                      </p>
                    </div>
                    <span className="text-sm font-bold text-green-600">{fmt(s.total)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-12 text-center">
                <div className="size-14 rounded-full bg-muted mx-auto flex items-center justify-center mb-3">
                  <ShoppingCart className="size-6 text-muted-foreground/50" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">Sin ventas hoy</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Las ventas aparecerán aquí</p>
                <Link
                  href={`/${slug}/pos`}
                  className="inline-flex items-center gap-1.5 mt-3 text-xs font-medium text-primary hover:underline"
                >
                  Ir al punto de venta <ArrowRight className="size-3" />
                </Link>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Low stock alert */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold">Alertas de stock</CardTitle>
              {data?.low_stock_count ? (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="size-3" />
                  {data.low_stock_count} productos
                </Badge>
              ) : (
                <Badge variant="secondary" className="gap-1 text-green-600 bg-green-500/10">
                  <CheckCircle2 className="size-3" />
                  Todo en orden
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="px-4 pb-4 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="size-9 rounded-xl" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3 w-32" />
                      <Skeleton className="h-2 w-full rounded-full" />
                    </div>
                    <Skeleton className="h-5 w-12" />
                  </div>
                ))}
              </div>
            ) : data?.low_stock_products?.length ? (
              <div className="divide-y">
                {data.low_stock_products.slice(0, 6).map((p) => {
                  const pct = Math.min(100, Math.round((p.stock / p.min_stock) * 100));
                  const critical = pct < 30;
                  return (
                    <div key={p.id} className="px-4 py-3 hover:bg-muted/30 transition-colors">
                      <div className="flex items-center gap-3 mb-1.5">
                        <div className={`size-9 rounded-xl flex items-center justify-center shrink-0 ${critical ? 'bg-red-500/10' : 'bg-amber-500/10'}`}>
                          <Package className={`size-4 ${critical ? 'text-red-500' : 'text-amber-500'}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{p.name}</p>
                          <p className="text-xs text-muted-foreground font-mono">{p.sku}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <span className={`text-sm font-bold ${critical ? 'text-red-500' : 'text-amber-500'}`}>{p.stock}</span>
                          <span className="text-xs text-muted-foreground"> / {p.min_stock}</span>
                        </div>
                      </div>
                      {/* Stock progress bar */}
                      <div className="ml-12 h-1.5 rounded-full bg-muted overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${critical ? 'bg-red-500' : 'bg-amber-400'}`}
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-12 text-center">
                <div className="size-14 rounded-full bg-green-500/10 mx-auto flex items-center justify-center mb-3">
                  <CheckCircle2 className="size-6 text-green-500" />
                </div>
                <p className="text-sm font-medium text-muted-foreground">Stock en orden</p>
                <p className="text-xs text-muted-foreground/60 mt-1">Todos los productos sobre el mínimo</p>
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
