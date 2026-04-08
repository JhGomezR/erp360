'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notify } from '@/lib/notify';
import {
  AlertTriangle,
  CheckCircle2,
  BellOff,
  Edit2,
  Save,
  X,
} from 'lucide-react';

import { stockAlertsApi } from '@/lib/api/tenant.api';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

// ─── Types ────────────────────────────────────────────────────────────────────

interface StockAlert {
  id: number;
  name: string;
  sku: string;
  category: string | null;
  stock: number;
  min_stock: number;
  unit: string | null;
  deficit: number;
}

interface AlertLog {
  id: number;
  product_id: number;
  product_name: string;
  product_sku: string;
  stock_at_time: number;
  min_stock: number;
  acknowledged_at: string | null;
  created_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getStatus(a: StockAlert): 'critical' | 'low' {
  return a.stock <= 0 ? 'critical' : 'low';
}

const STATUS_META = {
  critical: { label: 'Crítico',   color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'         },
  low:      { label: 'Bajo',      color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
  ok:       { label: 'Normal',    color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
};

const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('es-CO', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(iso));

// ─── Inline min-stock editor ──────────────────────────────────────────────────

function MinStockCell({
  productId,
  current,
  slug,
}: {
  productId: number;
  current: number;
  slug: string;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue]     = useState(String(current));
  const qc                    = useQueryClient();

  const saveMutation = useMutation({
    mutationFn: (min: number) => stockAlertsApi.update(productId, { min_stock: min }),
    onSuccess: () => {
      notify.success('Stock mínimo actualizado');
      qc.invalidateQueries({ queryKey: ['stock-alerts', slug] });
      setEditing(false);
    },
    onError: (err) => notify.error(err, 'No se pudo actualizar'),
  });

  if (!editing) {
    return (
      <span className="inline-flex items-center gap-1 group">
        {current}
        <button
          onClick={() => { setValue(String(current)); setEditing(true); }}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-muted"
          title="Editar stock mínimo"
        >
          <Edit2 className="size-3.5 text-muted-foreground" />
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1">
      <Input
        type="number"
        min={0}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="h-7 w-20 text-sm"
        autoFocus
        onKeyDown={(e) => {
          if (e.key === 'Enter') saveMutation.mutate(Number(value));
          if (e.key === 'Escape') setEditing(false);
        }}
      />
      <Button
        size="icon"
        variant="ghost"
        className="size-7"
        disabled={saveMutation.isPending}
        onClick={() => saveMutation.mutate(Number(value))}
      >
        <Save className="size-3.5" />
      </Button>
      <Button
        size="icon"
        variant="ghost"
        className="size-7"
        onClick={() => setEditing(false)}
      >
        <X className="size-3.5" />
      </Button>
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function StockAlertsTab({ slug }: { slug: string }) {
  const [activeTab, setActiveTab] = useState<'current' | 'log'>('current');
  const qc = useQueryClient();

  // Current alerts
  const { data: alertsData, isLoading: alertsLoading } = useQuery({
    queryKey: ['stock-alerts', slug],
    queryFn:  () => stockAlertsApi.list().then((r) => r.data),
    staleTime: 30_000,
  });

  // Alert log
  const { data: logData, isLoading: logLoading } = useQuery({
    queryKey: ['stock-alerts-log', slug],
    queryFn:  () => stockAlertsApi.log().then((r) => r.data),
    staleTime: 30_000,
    enabled:  activeTab === 'log',
  });

  const acknowledgeMutation = useMutation({
    mutationFn: (id: number) => stockAlertsApi.acknowledge(id),
    onSuccess: () => {
      notify.success('Alerta reconocida');
      qc.invalidateQueries({ queryKey: ['stock-alerts-log', slug] });
    },
    onError: (err) => notify.error(err, 'No se pudo reconocer la alerta'),
  });

  const alerts: StockAlert[] = (alertsData as any)?.alerts ?? [];
  const logs:   AlertLog[]   = (logData   as any)?.data   ?? [];

  const critical = alerts.filter((a) => getStatus(a) === 'critical').length;
  const low      = alerts.filter((a) => getStatus(a) === 'low').length;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 max-w-lg">
        <div className="rounded-xl border p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Críticos</p>
          <p className="text-2xl font-bold text-red-600 dark:text-red-400">{critical}</p>
        </div>
        <div className="rounded-xl border p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Stock bajo</p>
          <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{low}</p>
        </div>
        <div className="rounded-xl border p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Sin alertas</p>
          <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
            {(alertsData as any)?.total ?? 0}
          </p>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 border-b">
        {(['current', 'log'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              activeTab === t
                ? 'border-foreground text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t === 'current' ? 'Estado actual' : 'Historial de alertas'}
          </button>
        ))}
      </div>

      {/* Current alerts table */}
      {activeTab === 'current' && (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Producto</th>
                <th className="px-4 py-3 text-left">SKU</th>
                <th className="px-4 py-3 text-right">Stock actual</th>
                <th className="px-4 py-3 text-right">Mínimo</th>
                <th className="px-4 py-3 text-center">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {alertsLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 5 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))}

              {!alertsLoading && alerts.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-12 text-center text-muted-foreground">
                    <CheckCircle2 className="mx-auto mb-2 size-8 opacity-30" />
                    Todos los productos tienen stock suficiente
                  </td>
                </tr>
              )}

              {!alertsLoading &&
                alerts.map((a) => {
                  const status = getStatus(a);
                  const meta   = STATUS_META[status];
                  return (
                    <tr
                      key={a.id}
                      className={`hover:bg-muted/30 transition-colors ${
                        status === 'critical' ? 'bg-red-50/30 dark:bg-red-950/10' : ''
                      }`}
                    >
                      <td className="px-4 py-3 font-medium flex items-center gap-2">
                        <AlertTriangle className="size-4 text-amber-500 shrink-0" />
                        {a.name}
                      </td>
                      <td className="px-4 py-3 font-mono text-muted-foreground">{a.sku}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${
                        status === 'critical'
                          ? 'text-red-600 dark:text-red-400'
                          : 'text-amber-600 dark:text-amber-400'
                      }`}>
                        {a.stock}
                      </td>
                      <td className="px-4 py-3 text-right text-muted-foreground">
                        <MinStockCell
                          productId={a.id}
                          current={a.min_stock}
                          slug={slug}
                        />
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span
                          className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${meta.color}`}
                        >
                          {meta.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      )}

      {/* Alert log table */}
      {activeTab === 'log' && (
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground text-xs uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Producto</th>
                <th className="px-4 py-3 text-right">Stock en alerta</th>
                <th className="px-4 py-3 text-right">Mínimo</th>
                <th className="px-4 py-3 text-left">Generada</th>
                <th className="px-4 py-3 text-center">Reconocida</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {logLoading &&
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} className="px-4 py-3">
                        <Skeleton className="h-4 w-full" />
                      </td>
                    ))}
                  </tr>
                ))}

              {!logLoading && logs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                    <BellOff className="mx-auto mb-2 size-8 opacity-30" />
                    No hay alertas registradas
                  </td>
                </tr>
              )}

              {!logLoading &&
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-4 py-3 font-medium">
                      <div>{log.product_name}</div>
                      <div className="text-xs text-muted-foreground font-mono">{log.product_sku}</div>
                    </td>
                    <td className="px-4 py-3 text-right text-red-600 dark:text-red-400 font-semibold">
                      {log.stock_at_time}
                    </td>
                    <td className="px-4 py-3 text-right text-muted-foreground">{log.min_stock}</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                      {formatDate(log.created_at)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {log.acknowledged_at ? (
                        <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 className="size-3.5" />
                          {formatDate(log.acknowledged_at)}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">Pendiente</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!log.acknowledged_at && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          disabled={acknowledgeMutation.isPending}
                          onClick={() => acknowledgeMutation.mutate(log.id)}
                        >
                          Reconocer
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
