'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { replenishmentApi } from '@/lib/api/tenant.api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { RefreshCw, AlertTriangle, Settings, Package } from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface AlertProduct {
  id: number;
  name: string;
  sku: string;
  current_stock: number;
  reorder_point: number;
  reorder_qty: number | null;
  auto_reorder: boolean;
  supplier_name: string | null;
  shortage: number;
}

interface SettingsProduct {
  id: number;
  name: string;
  sku: string;
  reorder_point: number | null;
  reorder_qty: number | null;
  auto_reorder: boolean;
  preferred_supplier_id: number | null;
  supplier_name: string | null;
}

// ─── Edit Settings Dialog ─────────────────────────────────────────────────────

function EditSettingsDialog({ product, onClose }: { product: SettingsProduct; onClose: () => void }) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    reorder_point: product.reorder_point ?? '',
    reorder_qty: product.reorder_qty ?? '',
    auto_reorder: product.auto_reorder,
  });

  const mut = useMutation({
    mutationFn: () => replenishmentApi.updateSettings(product.id, form),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['replenishment'] });
      toast.success('Configuración actualizada');
      onClose();
    },
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Config. Reposición</DialogTitle>
          <p className="text-sm text-gray-500">{product.name} — {product.sku}</p>
        </DialogHeader>
        <div className="space-y-3 text-sm">
          <div>
            <label className="font-medium">Punto de reorden (unidades)</label>
            <Input type="number" value={form.reorder_point} onChange={e => setForm(p => ({ ...p, reorder_point: e.target.value }))} placeholder="Ej: 10" min={0} />
            <p className="text-xs text-gray-400 mt-1">Cuando el stock baja a este nivel, se genera la alerta/OC</p>
          </div>
          <div>
            <label className="font-medium">Cantidad a reponer</label>
            <Input type="number" value={form.reorder_qty} onChange={e => setForm(p => ({ ...p, reorder_qty: e.target.value }))} placeholder="Ej: 50" min={1} />
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="auto" checked={form.auto_reorder} onChange={e => setForm(p => ({ ...p, auto_reorder: e.target.checked }))} className="rounded" />
            <label htmlFor="auto" className="font-medium">Reposición automática (genera OC automáticamente)</label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? 'Guardando...' : 'Guardar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function ReplenishmentPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState('alerts');
  const [editProduct, setEditProduct] = useState<SettingsProduct | null>(null);

  const alertsQ   = useQuery({ queryKey: ['replenishment', 'alerts'], queryFn: () => replenishmentApi.alerts(), enabled: tab === 'alerts' });
  const settingsQ = useQuery({ queryKey: ['replenishment', 'settings'], queryFn: () => replenishmentApi.settings(), enabled: tab === 'settings' });

  const alerts: AlertProduct[]     = (alertsQ.data as unknown as { data: { data: AlertProduct[] } })?.data?.data ?? [];
  const settings: SettingsProduct[] = (settingsQ.data as unknown as { data: { data: SettingsProduct[] } })?.data?.data ?? [];

  const triggerMut = useMutation({
    mutationFn: () => replenishmentApi.trigger(),
    onSuccess: () => {
      toast.success('Reposición ejecutada. Las OC se generaron automáticamente.');
      qc.invalidateQueries({ queryKey: ['replenishment'] });
    },
  });

  const autoCount   = alerts.filter(a => a.auto_reorder).length;
  const manualCount = alerts.filter(a => !a.auto_reorder).length;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Reposición de Inventario</h1>
          <p className="text-sm text-muted-foreground">Genera órdenes de compra automáticas cuando el stock baja del punto de reorden</p>
        </div>
        <Button onClick={() => triggerMut.mutate()} disabled={triggerMut.isPending}>
          <RefreshCw className={`size-4 mr-2 ${triggerMut.isPending ? 'animate-spin' : ''}`} />
          {triggerMut.isPending ? 'Ejecutando...' : 'Ejecutar reposición'}
        </Button>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Bajo reorden', value: alerts.length, color: 'text-red-600', accent: 'bg-red-500', icon: AlertTriangle },
          { label: 'Auto OC', value: autoCount, color: 'text-emerald-600', accent: 'bg-emerald-500', icon: RefreshCw },
          { label: 'Manuales', value: manualCount, color: 'text-amber-600', accent: 'bg-amber-500', icon: Package },
        ].map(({ label, value, color, accent, icon: Icon }) => (
          <div key={label} className="rounded-2xl border bg-card overflow-hidden flex">
            <div className={`w-1.5 ${accent}`} />
            <div className="p-4 flex items-center gap-3">
              <Icon className={`size-5 ${color}`} />
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className={`text-2xl font-bold ${color}`}>{value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 p-1 rounded-lg bg-muted w-fit">
        {[
          { key: 'alerts', label: 'Alertas de stock', icon: AlertTriangle },
          { key: 'settings', label: 'Configuración', icon: Settings },
        ].map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
              tab === key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
            }`}>
            <Icon className="size-3.5" />{label}
          </button>
        ))}
      </div>

      {/* Alertas */}
      {tab === 'alerts' && (
        <div className="flex flex-col gap-3">
          {alertsQ.isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 rounded-2xl bg-muted animate-pulse" />)
          ) : alerts.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 gap-3 text-muted-foreground">
              <div className="size-14 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <Package className="size-7 text-emerald-600" />
              </div>
              <p className="font-medium text-emerald-700 dark:text-emerald-400">¡Todo el inventario está sobre el punto de reorden!</p>
            </div>
          ) : alerts.map((p) => (
            <div key={p.id} className="rounded-2xl border bg-card p-4 flex items-center gap-4">
              <div className="size-9 rounded-xl bg-red-100 dark:bg-red-900/30 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="size-4 text-red-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{p.name}</p>
                <p className="text-xs text-muted-foreground font-mono">{p.sku} · {p.supplier_name ?? 'Sin proveedor'}</p>
              </div>
              <div className="hidden sm:flex items-center gap-4 text-sm flex-shrink-0">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Stock</p>
                  <p className="font-bold text-red-600">{p.current_stock}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Reorden</p>
                  <p className="font-medium">{p.reorder_point}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Faltante</p>
                  <p className="font-bold text-red-600">{p.shortage}</p>
                </div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 font-medium ${
                p.auto_reorder
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : 'bg-muted text-muted-foreground'
              }`}>
                {p.auto_reorder ? 'Auto OC' : 'Manual'}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Configuración */}
      {tab === 'settings' && (
        <div className="flex flex-col gap-3">
          {settingsQ.isLoading ? (
            Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 rounded-2xl bg-muted animate-pulse" />)
          ) : settings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 gap-3 text-muted-foreground">
              <div className="size-14 rounded-full bg-muted flex items-center justify-center">
                <Settings className="size-7 opacity-50" />
              </div>
              <p className="font-medium">Sin productos configurados</p>
            </div>
          ) : settings.map((p) => (
            <div key={p.id} className="rounded-2xl border bg-card p-4 flex items-center gap-4">
              <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <Package className="size-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm">{p.name}</p>
                <p className="text-xs text-muted-foreground font-mono">{p.sku} · {p.supplier_name ?? 'Sin proveedor'}</p>
              </div>
              <div className="hidden sm:flex items-center gap-4 text-sm flex-shrink-0">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Punto reorden</p>
                  <p className="font-medium">{p.reorder_point ?? '—'}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Qty reponer</p>
                  <p className="font-medium">{p.reorder_qty ?? '—'}</p>
                </div>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full flex-shrink-0 font-medium ${
                p.auto_reorder
                  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                  : 'bg-muted text-muted-foreground'
              }`}>
                {p.auto_reorder ? 'Auto' : 'Manual'}
              </span>
              <Button size="sm" variant="outline" className="flex-shrink-0 h-8" onClick={() => setEditProduct(p)}>
                <Settings className="size-3.5" />
              </Button>
            </div>
          ))}
        </div>
      )}

      {editProduct && <EditSettingsDialog product={editProduct} onClose={() => setEditProduct(null)} />}
    </div>
  );
}
