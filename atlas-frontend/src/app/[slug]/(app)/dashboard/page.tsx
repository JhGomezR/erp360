'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import {
  TrendingUp, ShoppingCart, Package, Users,
  AlertTriangle, CheckCircle2,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
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

const PERIOD_OPTIONS = [
  { value: 'week' as const, label: 'Semana' },
  { value: 'month' as const, label: 'Mes' },
  { value: 'year' as const, label: 'Año' },
];

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const { total, count } = payload[0]?.payload ?? {};
  return (
    <div className="rounded-lg border bg-popover px-3 py-2 shadow-md text-sm">
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

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const params = useParams();
  const slug = params.slug as string;
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('month');

  // Summary KPIs
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-summary', slug],
    queryFn: async () => {
      const res = await dashboardApi.summary();
      return res.data as Summary;
    },
    refetchInterval: 60_000,
  });

  // Sales chart
  const { data: chartData, isLoading: chartLoading } = useQuery({
    queryKey: ['dashboard-chart', slug, period],
    queryFn: async () => {
      const res = await dashboardApi.salesChart(period);
      return (res.data as any) as ChartPoint[];
    },
    staleTime: 1000 * 60 * 5,
  });

  const chartPoints: ChartPoint[] = Array.isArray(chartData) ? chartData : [];

  // Format date labels per period
  const formatXAxis = (date: string) => {
    const d = new Date(date);
    if (period === 'year') {
      return d.toLocaleDateString('es-CO', { month: 'short' });
    }
    if (period === 'week') {
      return d.toLocaleDateString('es-CO', { weekday: 'short', day: 'numeric' });
    }
    return d.toLocaleDateString('es-CO', { day: 'numeric', month: 'short' });
  };

  const stats = [
    {
      label: 'Ventas hoy',
      value: data ? fmt(data.sales_today) : null,
      sub: data ? `${data.sales_today_count} transacciones` : '',
      icon: TrendingUp,
      color: 'text-primary',
    },
    {
      label: 'Ventas del mes',
      value: data ? fmt(data.sales_month) : null,
      sub: data ? `${data.sales_month_count} transacciones` : '',
      icon: ShoppingCart,
      color: 'text-blue-600',
    },
    {
      label: 'Stock bajo',
      value: data ? String(data.low_stock_count) : null,
      sub: 'productos por reponer',
      icon: Package,
      color: data?.low_stock_count ? 'text-amber-500' : 'text-green-600',
    },
    {
      label: 'Clientes',
      value: data ? data.customers_count.toLocaleString('es-CO') : null,
      sub: 'registrados',
      icon: Users,
      color: 'text-purple-600',
    },
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground text-sm">Resumen de tu negocio</p>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <Card key={s.label}>
              <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
                <CardTitle className="text-sm font-medium text-muted-foreground">{s.label}</CardTitle>
                <Icon className={`size-4 ${s.color}`} />
              </CardHeader>
              <CardContent>
                {isLoading || s.value === null ? (
                  <>
                    <Skeleton className="h-7 w-28 mb-1" />
                    <Skeleton className="h-3 w-20" />
                  </>
                ) : (
                  <>
                    <div className="text-2xl font-bold">{s.value}</div>
                    <p className="text-xs text-muted-foreground mt-0.5">{s.sub}</p>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Sales chart */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm font-semibold">Evolución de ventas</CardTitle>
            <div className="flex gap-1">
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPeriod(opt.value)}
                  className={`rounded-md px-3 py-1 text-xs font-medium transition-colors border ${
                    period === opt.value
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background text-muted-foreground border-border hover:bg-muted'
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
            <div className="h-52 flex items-center justify-center text-muted-foreground text-sm">
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
            <CardTitle className="text-sm font-semibold">Ventas recientes</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="px-4 pb-4 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="size-8 rounded-full" />
                    <div className="flex-1 space-y-1">
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
                  <div key={s.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30">
                    <div className="size-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                      <CheckCircle2 className="size-4 text-primary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium">{s.code}</p>
                      <p className="text-xs text-muted-foreground">
                        {PAYMENT_LABEL[s.payment_method] ?? s.payment_method}
                        {' · '}
                        {new Date(s.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                    <span className="text-sm font-semibold">{fmt(s.total)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-10 text-center text-muted-foreground text-sm">
                <ShoppingCart className="size-8 mx-auto mb-2 opacity-30" />
                Sin ventas hoy
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
                <Badge variant="destructive">{data.low_stock_count}</Badge>
              ) : (
                <Badge variant="secondary">OK</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="px-4 pb-4 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3">
                    <Skeleton className="size-8 rounded-full" />
                    <div className="flex-1 space-y-1">
                      <Skeleton className="h-3 w-32" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                    <Skeleton className="h-5 w-10" />
                  </div>
                ))}
              </div>
            ) : data?.low_stock_products?.length ? (
              <div className="divide-y">
                {data.low_stock_products.slice(0, 6).map((p) => (
                  <div key={p.id} className="flex items-center gap-3 px-4 py-2.5 hover:bg-muted/30">
                    <div className="size-8 rounded-full bg-amber-500/10 flex items-center justify-center shrink-0">
                      <AlertTriangle className="size-4 text-amber-500" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{p.name}</p>
                      <p className="text-xs text-muted-foreground font-mono">{p.sku}</p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className="text-sm font-bold text-destructive">{p.stock}</span>
                      <span className="text-xs text-muted-foreground"> / {p.min_stock}</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="py-10 text-center text-muted-foreground text-sm">
                <CheckCircle2 className="size-8 mx-auto mb-2 text-green-500" />
                Todo el stock en orden
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
