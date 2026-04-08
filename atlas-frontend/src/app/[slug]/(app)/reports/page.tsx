'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { BarChart2, TrendingUp, Package, AlertTriangle, RefreshCw, Download, ShoppingCart, DollarSign, FileText, Wallet } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { reportsApi, batchesApi, accountingApi, setTenantSlug, type ProductBatch } from '@/lib/api/tenant.api';

interface SalesReport {
  total_sales: number;
  total_revenue: number;
  total_items: number;
  average_ticket: number;
  by_payment_method: Record<string, { count: number; total: number }>;
  by_day: { date: string; count: number; total: number }[];
}

interface TopProduct {
  product_id: number;
  product_name: string;
  sku: string;
  total_quantity: number;
  total_revenue: number;
}

interface InventoryReport {
  total_products: number;
  low_stock_count: number;
  out_of_stock_count: number;
  total_value: number;
  categories: { name: string; count: number; value: number }[];
}

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

const today = new Date().toISOString().split('T')[0];
const firstOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];

interface RotationItem {
  product_id: number;
  product_name: string;
  sku: string;
  opening_stock: number;
  units_sold: number;
  closing_stock: number;
  rotation_rate: number;   // units_sold / avg_stock
  days_of_supply: number;  // closing_stock / (units_sold / days)
}

// ─── Helper descarga blob ─────────────────────────────────────────────────────
async function downloadBlob(apiFn: () => Promise<{ data: Blob }>, filename: string) {
  const res = await apiFn();
  const url = URL.createObjectURL(res.data);
  const a   = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

export default function ReportsPage() {
  const params = useParams();
  const slug = params.slug as string;
  setTenantSlug(slug);
  const [exporting, setExporting] = useState(false);
  const [tab, setTab] = useState<'sales' | 'inventory' | 'products' | 'expiry' | 'rotation' | 'purchases' | 'cartera' | 'expenses' | 'financial'>('sales');
  const [from, setFrom] = useState(firstOfMonth);
  const [to, setTo] = useState(today);
  const [expiryDays, setExpiryDays] = useState(30);

  const { data: salesReport, isLoading: loadingSales } = useQuery({
    queryKey: ['report-sales', slug, from, to],
    queryFn: async () => {
      const res = await reportsApi.sales({ from, to });
      return res.data as SalesReport;
    },
    enabled: tab === 'sales',
  });

  const { data: topProducts, isLoading: loadingTop } = useQuery({
    queryKey: ['report-top-products', slug, from, to],
    queryFn: async () => {
      const res = await reportsApi.topProducts({ limit: 10, from, to });
      return (res.data as { data?: TopProduct[] }).data ?? (res.data as TopProduct[]) ?? [];
    },
    enabled: tab === 'products',
  });

  const { data: inventoryReport, isLoading: loadingInventory } = useQuery({
    queryKey: ['report-inventory', slug],
    queryFn: async () => {
      const res = await reportsApi.inventory();
      return res.data as InventoryReport;
    },
    enabled: tab === 'inventory',
  });

  // Expiry query
  const { data: expiryData, isLoading: loadingExpiry } = useQuery({
    queryKey: ['report-expiry', slug, expiryDays],
    queryFn: () => batchesApi.expiring(expiryDays).then((r) => r.data),
    enabled: tab === 'expiry',
    staleTime: 30_000,
  });

  // Rotation query (reuses topProducts but from 90 days; backend may return rotation metrics)
  const { data: rotationData, isLoading: loadingRotation } = useQuery({
    queryKey: ['report-rotation', slug, from, to],
    queryFn: () =>
      reportsApi.topProducts({ limit: 50, from, to }).then((r) => {
        const items = (r.data as any)?.data ?? (r.data as any) ?? [];
        return items as RotationItem[];
      }),
    enabled: tab === 'rotation',
    staleTime: 30_000,
  });

  const expiryBatches: ProductBatch[] = (expiryData as any)?.batches ?? [];
  const expired  = expiryBatches.filter((b) => b.is_expired);
  const critical = expiryBatches.filter((b) => !b.is_expired && (b.days_until_expiry ?? 999) <= 7);
  const warning  = expiryBatches.filter((b) => !b.is_expired && (b.days_until_expiry ?? 999) > 7);

  // Compras
  const { data: purchasesReport, isLoading: loadingPurchases } = useQuery({
    queryKey: ['report-purchases', slug, from, to],
    queryFn: async () => { const r = await reportsApi.purchases({ from, to }); return r.data as any; },
    enabled: tab === 'purchases',
  });

  // Cartera
  const { data: carteraReport, isLoading: loadingCartera } = useQuery({
    queryKey: ['report-cartera', slug],
    queryFn: async () => { const r = await reportsApi.cartera(); return r.data as any; },
    enabled: tab === 'cartera',
  });

  // Gastos
  const { data: expensesReport, isLoading: loadingExpenses } = useQuery({
    queryKey: ['report-expenses', slug, from, to],
    queryFn: async () => { const r = await reportsApi.expenses({ from, to }); return r.data as any; },
    enabled: tab === 'expenses',
  });

  // Financiero — Balance + P&L
  const { data: balanceSheet, isLoading: loadingBalance } = useQuery({
    queryKey: ['report-balance', slug],
    queryFn: async () => { const r = await accountingApi.balanceSheet(); return r.data as any; },
    enabled: tab === 'financial',
  });
  const { data: incomeStatement, isLoading: loadingIncome } = useQuery({
    queryKey: ['report-income', slug],
    queryFn: async () => { const r = await accountingApi.incomeStatement(); return r.data as any; },
    enabled: tab === 'financial',
  });

  const TABS = [
    { key: 'sales',      label: 'Ventas',        icon: TrendingUp   },
    { key: 'products',   label: 'Productos Top',  icon: BarChart2    },
    { key: 'inventory',  label: 'Inventario',     icon: Package      },
    { key: 'expiry',     label: 'Vencimientos',   icon: AlertTriangle },
    { key: 'rotation',   label: 'Rotación',       icon: RefreshCw    },
    { key: 'purchases',  label: 'Compras',        icon: ShoppingCart },
    { key: 'cartera',    label: 'Cartera',        icon: Wallet       },
    { key: 'expenses',   label: 'Gastos',         icon: DollarSign   },
    { key: 'financial',  label: 'Financiero',     icon: FileText     },
  ] as const;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Reportes</h1>
          <p className="text-muted-foreground text-sm">Análisis y estadísticas de tu negocio</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          className="gap-2"
          disabled={exporting}
          onClick={async () => {
            setExporting(true);
            try {
              if (tab === 'sales' || tab === 'products' || tab === 'rotation') {
                await downloadBlob(() => reportsApi.exportSales({ from, to }) as any, `ventas_${from}_${to}.csv`);
              } else if (tab === 'inventory') {
                await downloadBlob(() => reportsApi.exportInventory() as any, `inventario_${today}.csv`);
              } else if (tab === 'purchases') {
                await downloadBlob(() => reportsApi.exportPurchases({ from, to }) as any, `compras_${from}_${to}.csv`);
              } else if (tab === 'cartera') {
                await downloadBlob(() => reportsApi.exportCartera() as any, `cartera_${today}.csv`);
              }
            } finally { setExporting(false); }
          }}
        >
          <Download className="size-4" />
          {exporting ? 'Exportando...' : 'Exportar CSV'}
        </Button>
      </div>

      {/* Tab nav */}
      <div className="flex gap-2 border-b">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Date filters (for sales + products + rotation) */}
      {(tab === 'sales' || tab === 'products' || tab === 'rotation' || tab === 'purchases' || tab === 'expenses') && (
        <div className="flex items-end gap-4 p-4 bg-muted/30 rounded-lg">
          <div className="space-y-1">
            <Label>Desde</Label>
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-40" />
          </div>
          <div className="space-y-1">
            <Label>Hasta</Label>
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-40" />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => { setFrom(firstOfMonth); setTo(today); }}
          >
            Este mes
          </Button>
        </div>
      )}

      {/* Sales Report */}
      {tab === 'sales' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total ventas', value: loadingSales ? null : salesReport?.total_sales ?? 0, format: 'number' },
              { label: 'Ingresos', value: loadingSales ? null : salesReport?.total_revenue ?? 0, format: 'currency' },
              { label: 'Items vendidos', value: loadingSales ? null : salesReport?.total_items ?? 0, format: 'number' },
              { label: 'Ticket promedio', value: loadingSales ? null : salesReport?.average_ticket ?? 0, format: 'currency' },
            ].map((s) => (
              <Card key={s.label}>
                <CardHeader className="pb-2 space-y-0">
                  <CardTitle className="text-xs font-medium text-muted-foreground">{s.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  {s.value === null ? (
                    <Skeleton className="h-6 w-24" />
                  ) : (
                    <div className="text-xl font-bold">
                      {s.format === 'currency' ? fmt(s.value as number) : (s.value as number).toLocaleString('es-CO')}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {/* By payment method */}
          {salesReport?.by_payment_method && (
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Por método de pago</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {Object.entries(salesReport.by_payment_method).map(([method, data]) => (
                    <div key={method} className="flex items-center justify-between text-sm">
                      <span className="capitalize">{method === 'cash' ? 'Efectivo' : method === 'card' ? 'Tarjeta' : 'Transferencia'}</span>
                      <div className="flex gap-4 text-muted-foreground">
                        <span>{data.count} ventas</span>
                        <span className="font-medium text-foreground">{fmt(data.total)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Daily breakdown */}
          {salesReport?.by_day && salesReport.by_day.length > 0 && (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Fecha</th>
                    <th className="text-right px-4 py-3 font-medium">Ventas</th>
                    <th className="text-right px-4 py-3 font-medium">Ingresos</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {salesReport.by_day.map((d) => (
                    <tr key={d.date} className="hover:bg-muted/30">
                      <td className="px-4 py-2">{new Date(d.date).toLocaleDateString('es-CO')}</td>
                      <td className="px-4 py-2 text-right">{d.count}</td>
                      <td className="px-4 py-2 text-right font-medium">{fmt(d.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Top Products */}
      {tab === 'products' && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">#</th>
                <th className="text-left px-4 py-3 font-medium">Producto</th>
                <th className="text-left px-4 py-3 font-medium">SKU</th>
                <th className="text-right px-4 py-3 font-medium">Cantidad</th>
                <th className="text-right px-4 py-3 font-medium">Ingresos</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loadingTop
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 5 }).map((_, j) => (
                        <td key={j} className="px-4 py-3">
                          <Skeleton className="h-4 w-20" />
                        </td>
                      ))}
                    </tr>
                  ))
                : topProducts?.map((p, idx) => (
                    <tr key={p.product_id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 text-muted-foreground">{idx + 1}</td>
                      <td className="px-4 py-3 font-medium">{p.product_name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.sku}</td>
                      <td className="px-4 py-3 text-right">{p.total_quantity.toLocaleString('es-CO')}</td>
                      <td className="px-4 py-3 text-right font-medium">{fmt(p.total_revenue)}</td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Inventory Report */}
      {tab === 'inventory' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              { label: 'Total productos', value: inventoryReport?.total_products ?? 0, format: 'number' },
              { label: 'Valor inventario', value: inventoryReport?.total_value ?? 0, format: 'currency' },
              { label: 'Stock bajo', value: inventoryReport?.low_stock_count ?? 0, format: 'number' },
              { label: 'Sin stock', value: inventoryReport?.out_of_stock_count ?? 0, format: 'number' },
            ].map((s) => (
              <Card key={s.label}>
                <CardHeader className="pb-2 space-y-0">
                  <CardTitle className="text-xs font-medium text-muted-foreground">{s.label}</CardTitle>
                </CardHeader>
                <CardContent>
                  {loadingInventory ? (
                    <Skeleton className="h-6 w-16" />
                  ) : (
                    <div className="text-xl font-bold">
                      {s.format === 'currency' ? fmt(s.value) : s.value.toLocaleString('es-CO')}
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>

          {inventoryReport?.categories && (
            <div className="border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Categoría</th>
                    <th className="text-right px-4 py-3 font-medium">Productos</th>
                    <th className="text-right px-4 py-3 font-medium">Valor</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {inventoryReport.categories.map((c) => (
                    <tr key={c.name} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{c.name}</td>
                      <td className="px-4 py-3 text-right">{c.count}</td>
                      <td className="px-4 py-3 text-right">{fmt(c.value)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Vencimientos Report */}
      {tab === 'expiry' && (
        <div className="space-y-4">
          {/* Summary */}
          <div className="grid grid-cols-3 gap-4 max-w-lg">
            <Card>
              <CardHeader className="pb-2 space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground">Vencidos</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold text-red-600 dark:text-red-400">{expired.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground">≤ 7 días</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold text-red-600 dark:text-red-400">{critical.length}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 space-y-0">
                <CardTitle className="text-xs font-medium text-muted-foreground">8 – {expiryDays} días</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-xl font-bold text-amber-600 dark:text-amber-400">{warning.length}</div>
              </CardContent>
            </Card>
          </div>

          {/* Window selector */}
          <div className="flex items-center gap-2">
            <Label className="text-sm whitespace-nowrap">Ventana:</Label>
            {[15, 30, 60, 90].map((d) => (
              <button
                key={d}
                onClick={() => setExpiryDays(d)}
                className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${
                  expiryDays === d
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background border-border hover:bg-muted'
                }`}
              >
                {d} días
              </button>
            ))}
          </div>

          {/* Table */}
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">Producto</th>
                  <th className="px-4 py-3 text-left">Lote</th>
                  <th className="px-4 py-3 text-right">Stock</th>
                  <th className="px-4 py-3 text-left">Vencimiento</th>
                  <th className="px-4 py-3 text-center">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loadingExpiry &&
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 5 }).map((__, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                      ))}
                    </tr>
                  ))}
                {!loadingExpiry && expiryBatches.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                      No hay lotes próximos a vencer en los próximos {expiryDays} días
                    </td>
                  </tr>
                )}
                {!loadingExpiry && expiryBatches.map((b) => {
                  const isExp = b.is_expired;
                  const isCrit = !isExp && (b.days_until_expiry ?? 999) <= 7;
                  const badgeColor = isExp || isCrit
                    ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                    : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400';
                  return (
                    <tr key={b.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-medium">{b.product?.name ?? `#${b.product_id}`}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{b.batch_number}</td>
                      <td className="px-4 py-3 text-right">{b.quantity_remaining}</td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {b.expiry_date
                          ? new Intl.DateTimeFormat('es-CO', { dateStyle: 'medium' }).format(new Date(b.expiry_date))
                          : '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${badgeColor}`}>
                          {isExp ? 'Vencido' : `${b.days_until_expiry} días`}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Rotation Report */}
      {tab === 'rotation' && (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Velocidad de rotación de productos en el período seleccionado. Un índice alto indica alta demanda.
          </p>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
                <tr>
                  <th className="px-4 py-3 text-left">#</th>
                  <th className="px-4 py-3 text-left">Producto</th>
                  <th className="px-4 py-3 text-left">SKU</th>
                  <th className="px-4 py-3 text-right">Unidades vendidas</th>
                  <th className="px-4 py-3 text-right">Ingresos</th>
                  {(rotationData as any[])?.[0]?.rotation_rate !== undefined && (
                    <th className="px-4 py-3 text-right">Rotación</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y">
                {loadingRotation &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 5 }).map((__, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                      ))}
                    </tr>
                  ))}
                {!loadingRotation && (!rotationData || (rotationData as any[]).length === 0) && (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                      Sin datos en el período seleccionado
                    </td>
                  </tr>
                )}
                {!loadingRotation &&
                  (rotationData as any[])?.map((p: any, idx: number) => (
                    <tr key={p.product_id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 text-muted-foreground">{idx + 1}</td>
                      <td className="px-4 py-3 font-medium">{p.product_name}</td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{p.sku}</td>
                      <td className="px-4 py-3 text-right">{(p.total_quantity ?? p.units_sold ?? 0).toLocaleString('es-CO')}</td>
                      <td className="px-4 py-3 text-right font-medium">{fmt(p.total_revenue ?? 0)}</td>
                      {p.rotation_rate !== undefined && (
                        <td className="px-4 py-3 text-right">
                          <span className={`font-semibold ${
                            p.rotation_rate > 5 ? 'text-emerald-600 dark:text-emerald-400'
                            : p.rotation_rate > 2 ? 'text-amber-600 dark:text-amber-400'
                            : 'text-muted-foreground'
                          }`}>
                            {p.rotation_rate.toFixed(1)}x
                          </span>
                        </td>
                      )}
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Compras ─────────────────────────────────────────────────────── */}
      {tab === 'purchases' && (
        <div className="space-y-4">
          {loadingPurchases ? <Skeleton className="h-48 w-full" /> : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Total órdenes', value: purchasesReport?.total_orders ?? 0 },
                  { label: 'Monto total', value: fmt(purchasesReport?.total_amount ?? 0) },
                  { label: 'Proveedores activos', value: purchasesReport?.supplier_count ?? 0 },
                  { label: 'Promedio por orden', value: fmt(purchasesReport?.average_order ?? 0) },
                ].map(({ label, value }) => (
                  <Card key={label}><CardContent className="py-4 text-center">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-xl font-bold">{String(value)}</p>
                  </CardContent></Card>
                ))}
              </div>
              {purchasesReport?.by_supplier && (
                <Card>
                  <CardHeader><CardTitle className="text-sm">Top Proveedores</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-4 py-2 font-medium">Proveedor</th>
                          <th className="text-right px-4 py-2 font-medium">Órdenes</th>
                          <th className="text-right px-4 py-2 font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(purchasesReport.by_supplier as any[]).map((s: any) => (
                          <tr key={s.supplier_id} className="hover:bg-muted/30">
                            <td className="px-4 py-2">{s.supplier_name}</td>
                            <td className="px-4 py-2 text-right">{s.order_count}</td>
                            <td className="px-4 py-2 text-right font-medium">{fmt(s.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Cartera ─────────────────────────────────────────────────────── */}
      {tab === 'cartera' && (
        <div className="space-y-4">
          {loadingCartera ? <Skeleton className="h-48 w-full" /> : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { label: 'Total cartera', value: fmt(carteraReport?.total ?? 0) },
                  { label: 'Al día', value: fmt(carteraReport?.current ?? 0) },
                  { label: 'Vencida', value: fmt(carteraReport?.overdue ?? 0) },
                  { label: 'Clientes', value: carteraReport?.customer_count ?? 0 },
                ].map(({ label, value }) => (
                  <Card key={label}><CardContent className="py-4 text-center">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-xl font-bold">{String(value)}</p>
                  </CardContent></Card>
                ))}
              </div>
              {carteraReport?.by_customer && (
                <Card>
                  <CardHeader><CardTitle className="text-sm">Cartera por cliente</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-4 py-2 font-medium">Cliente</th>
                          <th className="text-right px-4 py-2 font-medium">Facturas</th>
                          <th className="text-right px-4 py-2 font-medium">Saldo</th>
                          <th className="text-right px-4 py-2 font-medium">Vencido</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(carteraReport.by_customer as any[]).map((c: any) => (
                          <tr key={c.customer_id} className="hover:bg-muted/30">
                            <td className="px-4 py-2">{c.customer_name}</td>
                            <td className="px-4 py-2 text-right">{c.invoice_count}</td>
                            <td className="px-4 py-2 text-right font-medium">{fmt(c.balance)}</td>
                            <td className={`px-4 py-2 text-right ${c.overdue > 0 ? 'text-red-600 font-semibold' : ''}`}>{fmt(c.overdue ?? 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Gastos ──────────────────────────────────────────────────────── */}
      {tab === 'expenses' && (
        <div className="space-y-4">
          {loadingExpenses ? <Skeleton className="h-48 w-full" /> : (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {[
                  { label: 'Total gastos', value: fmt(expensesReport?.total ?? 0) },
                  { label: 'N° registros', value: expensesReport?.count ?? 0 },
                  { label: 'Promedio', value: fmt(expensesReport?.average ?? 0) },
                ].map(({ label, value }) => (
                  <Card key={label}><CardContent className="py-4 text-center">
                    <p className="text-xs text-muted-foreground">{label}</p>
                    <p className="text-xl font-bold">{String(value)}</p>
                  </CardContent></Card>
                ))}
              </div>
              {expensesReport?.by_category && (
                <Card>
                  <CardHeader><CardTitle className="text-sm">Por categoría</CardTitle></CardHeader>
                  <CardContent className="p-0">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="text-left px-4 py-2 font-medium">Categoría</th>
                          <th className="text-right px-4 py-2 font-medium">Registros</th>
                          <th className="text-right px-4 py-2 font-medium">Total</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(expensesReport.by_category as any[]).map((c: any) => (
                          <tr key={c.category} className="hover:bg-muted/30">
                            <td className="px-4 py-2">{c.category ?? 'Sin categoría'}</td>
                            <td className="px-4 py-2 text-right">{c.count}</td>
                            <td className="px-4 py-2 text-right font-medium">{fmt(c.total)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      )}

      {/* ── Financiero (Balance + P&L) ───────────────────────────────── */}
      {tab === 'financial' && (
        <div className="space-y-6">
          {/* Balance general */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <FileText className="size-4" />Balance General
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingBalance ? <Skeleton className="h-32 w-full" /> : balanceSheet ? (
                <div className="grid sm:grid-cols-3 gap-4 text-sm">
                  {[
                    { label: 'Activos totales', value: fmt(balanceSheet?.total_assets ?? 0), color: 'text-blue-600' },
                    { label: 'Pasivos totales', value: fmt(balanceSheet?.total_liabilities ?? 0), color: 'text-red-600' },
                    { label: 'Patrimonio', value: fmt(balanceSheet?.total_equity ?? 0), color: 'text-green-600' },
                  ].map(({ label, value, color }) => (
                    <div key={label} className="text-center rounded-lg border p-4">
                      <p className="text-xs text-muted-foreground mb-1">{label}</p>
                      <p className={`text-2xl font-bold ${color}`}>{value}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4">Sin datos de balance. Verifica que el módulo de contabilidad esté configurado.</p>
              )}
            </CardContent>
          </Card>

          {/* Estado de resultados */}
          <Card>
            <CardHeader>
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="size-4" />Estado de Resultados (P&L)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loadingIncome ? <Skeleton className="h-32 w-full" /> : incomeStatement ? (
                <div className="space-y-3">
                  <div className="grid sm:grid-cols-4 gap-4 text-sm">
                    {[
                      { label: 'Ingresos', value: fmt(incomeStatement?.total_income ?? 0), color: 'text-green-600' },
                      { label: 'Costos', value: fmt(incomeStatement?.total_costs ?? 0), color: 'text-red-500' },
                      { label: 'Utilidad bruta', value: fmt(incomeStatement?.gross_profit ?? 0), color: 'text-blue-600' },
                      { label: 'Utilidad neta', value: fmt(incomeStatement?.net_profit ?? 0), color: (incomeStatement?.net_profit ?? 0) >= 0 ? 'text-green-700' : 'text-red-700' },
                    ].map(({ label, value, color }) => (
                      <div key={label} className="text-center rounded-lg border p-4">
                        <p className="text-xs text-muted-foreground mb-1">{label}</p>
                        <p className={`text-2xl font-bold ${color}`}>{value}</p>
                      </div>
                    ))}
                  </div>
                  {incomeStatement?.margin_pct !== undefined && (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Badge variant={(incomeStatement.margin_pct ?? 0) >= 0 ? 'default' : 'destructive'}>
                        Margen neto: {Number(incomeStatement.margin_pct).toFixed(1)}%
                      </Badge>
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground py-4">Sin datos de P&L disponibles.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
