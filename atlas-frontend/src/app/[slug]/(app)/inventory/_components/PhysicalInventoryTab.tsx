'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notify } from '@/lib/notify';
import { physicalInventoryApi, warehouseApi } from '@/lib/api/tenant.api';
import {
  ClipboardCheck, Plus, Play, CheckCircle2, X, Package,
  ChevronRight, RefreshCw, AlertTriangle, Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Progress } from '@/components/ui/progress';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

interface PhysicalInvItem {
  id: number; product_id: number; product_name: string; product_sku?: string;
  location_label?: string; system_qty: number; counted_qty: number | null;
  difference: number | null; unit_cost: number; difference_value: number | null;
  notes?: string;
}

interface PhysicalInv {
  id: number; name: string; status: string; scheduled_date?: string;
  notes?: string; warehouse?: { name: string };
  items?: PhysicalInvItem[];
}

const STATUS: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  draft:       { label: 'Borrador',    variant: 'secondary' },
  in_progress: { label: 'En progreso', variant: 'default' },
  completed:   { label: 'Completado',  variant: 'default' },
  cancelled:   { label: 'Cancelado',   variant: 'outline' },
};

export function PhysicalInventoryTab({ slug }: { slug: string }) {
  const qc = useQueryClient();

  // List state
  const [statusFilter, setStatusFilter] = useState('');
  const [selected, setSelected] = useState<PhysicalInv | null>(null);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newWarehouse, setNewWarehouse] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newNotes, setNewNotes] = useState('');

  // Count item dialog
  const [countItem, setCountItem] = useState<PhysicalInvItem | null>(null);
  const [countedQty, setCountedQty] = useState('');
  const [countNotes, setCountNotes] = useState('');

  // ── Queries ────────────────────────────────────────────────────────────────
  const { data: listData, isLoading } = useQuery({
    queryKey: ['physical-inventories', slug, statusFilter],
    queryFn: async () => {
      const r = await physicalInventoryApi.list({ status: statusFilter || undefined });
      return (r.data as any)?.data ?? [];
    },
  });

  const { data: detail, refetch: refetchDetail } = useQuery<{ inventory: PhysicalInv; progress: number; summary: any; total_difference_value: number }>({
    queryKey: ['physical-inventory-detail', slug, selected?.id],
    queryFn: async () => {
      const r = await physicalInventoryApi.get(selected!.id);
      return r.data as any;
    },
    enabled: !!selected,
  });

  const { data: warehouses = [] } = useQuery({
    queryKey: ['warehouses-simple', slug],
    queryFn: async () => {
      const r = await warehouseApi.list();
      return (r.data as any)?.data ?? (r.data as any) ?? [];
    },
  });

  // ── Mutations ──────────────────────────────────────────────────────────────
  const createMut = useMutation({
    mutationFn: () => physicalInventoryApi.create({
      name: newName, warehouse_id: newWarehouse ? Number(newWarehouse) : undefined,
      scheduled_date: newDate || undefined, notes: newNotes || undefined,
    }),
    onSuccess: (r) => {
      notify.success('Inventario físico creado');
      setCreateOpen(false); setNewName(''); setNewWarehouse(''); setNewDate(''); setNewNotes('');
      qc.invalidateQueries({ queryKey: ['physical-inventories', slug] });
      setSelected((r.data as any));
    },
    onError: (e) => notify.error(e, 'Error'),
  });

  const importStockMut = useMutation({
    mutationFn: (id: number) => physicalInventoryApi.importStock(id),
    onSuccess: (r) => { notify.success(`${(r.data as any).inserted} productos importados`); refetchDetail(); },
    onError: (e) => notify.error(e, 'Error'),
  });

  const startMut = useMutation({
    mutationFn: (id: number) => physicalInventoryApi.start(id),
    onSuccess: () => { notify.success('Conteo iniciado'); refetchDetail(); qc.invalidateQueries({ queryKey: ['physical-inventories', slug] }); },
    onError: (e) => notify.error(e, 'Error'),
  });

  const updateItemMut = useMutation({
    mutationFn: ({ id, itemId, qty, notes }: { id: number; itemId: number; qty: number; notes?: string }) =>
      physicalInventoryApi.updateItem(id, itemId, { counted_qty: qty, notes }),
    onSuccess: () => { notify.success('Conteo registrado'); setCountItem(null); setCountedQty(''); setCountNotes(''); refetchDetail(); },
    onError: (e) => notify.error(e, 'Error'),
  });

  const completeMut = useMutation({
    mutationFn: (id: number) => physicalInventoryApi.complete(id),
    onSuccess: (r) => {
      const res = (r.data as any);
      notify.success(`Inventario completado — ${res.adjustments} ajustes aplicados`);
      refetchDetail(); qc.invalidateQueries({ queryKey: ['physical-inventories', slug] });
    },
    onError: async (e: any) => {
      // Si hay ítems sin contar, ofrecer forzar
      if (e?.response?.data?.uncounted) {
        if (confirm(`Hay ${e.response.data.uncounted} ítem(s) sin contar. ¿Completar de todas formas (los sin contar no se ajustarán)?`)) {
          forceCompleteMut.mutate(selected!.id);
        }
      } else {
        notify.error(e, 'Error');
      }
    },
  });

  const forceCompleteMut = useMutation({
    mutationFn: (id: number) => physicalInventoryApi.forceComplete(id),
    onSuccess: (r) => {
      const res = (r.data as any);
      notify.success(`Inventario completado — ${res.adjustments} ajustes aplicados`);
      refetchDetail(); qc.invalidateQueries({ queryKey: ['physical-inventories', slug] });
    },
    onError: (e) => notify.error(e, 'Error'),
  });

  const cancelMut = useMutation({
    mutationFn: (id: number) => physicalInventoryApi.cancel(id),
    onSuccess: () => { notify.success('Inventario cancelado'); refetchDetail(); qc.invalidateQueries({ queryKey: ['physical-inventories', slug] }); },
    onError: (e) => notify.error(e, 'Error'),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => physicalInventoryApi.destroy(id),
    onSuccess: () => { notify.success('Eliminado'); setSelected(null); qc.invalidateQueries({ queryKey: ['physical-inventories', slug] }); },
    onError: (e) => notify.error(e, 'Error'),
  });

  const inventories: PhysicalInv[] = listData ?? [];
  const inv = detail?.inventory;
  const items: PhysicalInvItem[] = inv?.items ?? [];

  // ── Vista lista ─────────────────────────────────────────────────────────────
  if (!selected) return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(!v || v === '_all' ? '' : v)}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Todos los estados" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Todos</SelectItem>
            <SelectItem value="draft">Borrador</SelectItem>
            <SelectItem value="in_progress">En progreso</SelectItem>
            <SelectItem value="completed">Completado</SelectItem>
            <SelectItem value="cancelled">Cancelado</SelectItem>
          </SelectContent>
        </Select>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="size-4" />Nuevo inventario físico
        </Button>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {isLoading
          ? Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-xl" />)
          : inventories.map((inv) => {
              const s = STATUS[inv.status] ?? { label: inv.status, variant: 'outline' as const };
              return (
                <Card key={inv.id} className="cursor-pointer hover:shadow-md transition-shadow"
                  onClick={() => setSelected(inv)}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <CardTitle className="text-base leading-tight">{inv.name}</CardTitle>
                      <Badge variant={s.variant}>{s.label}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    {inv.warehouse && <p className="text-xs text-muted-foreground">{inv.warehouse.name}</p>}
                    {inv.scheduled_date && <p className="text-xs text-muted-foreground">Programado: {new Date(inv.scheduled_date + 'T12:00:00').toLocaleDateString('es-CO')}</p>}
                    <div className="flex items-center gap-2 pt-1 text-muted-foreground text-xs">
                      <ChevronRight className="size-4 ml-auto text-primary" />
                    </div>
                  </CardContent>
                </Card>
              );
            })}
        {!isLoading && inventories.length === 0 && (
          <div className="col-span-3 text-center py-12 text-muted-foreground">
            <ClipboardCheck className="size-10 mx-auto mb-2 opacity-30" />
            <p className="text-sm">Sin inventarios físicos registrados</p>
          </div>
        )}
      </div>

      {/* Dialog: Crear */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><ClipboardCheck className="size-4" />Nuevo inventario físico</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Nombre *</Label><Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Ej: Inventario Q2 2026" /></div>
            <div className="space-y-1.5">
              <Label>Bodega</Label>
              <Select value={newWarehouse} onValueChange={(v) => setNewWarehouse(v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Todas las bodegas" /></SelectTrigger>
                <SelectContent>
                  {(warehouses as any[]).map((w: any) => <SelectItem key={w.id} value={String(w.id)}>{w.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Fecha programada</Label><Input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Notas</Label><Input value={newNotes} onChange={(e) => setNewNotes(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={() => createMut.mutate()} disabled={!newName || createMut.isPending}>{createMut.isPending ? 'Creando...' : 'Crear'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );

  // ── Vista detalle ────────────────────────────────────────────────────────────
  const progress = detail?.progress ?? 0;
  const summary  = detail?.summary;
  const s = STATUS[inv?.status ?? 'draft'] ?? { label: '—', variant: 'secondary' as const };

  return (
    <div className="space-y-4">
      {/* Cabecera */}
      <div className="flex items-center gap-3 flex-wrap">
        <Button variant="outline" size="sm" onClick={() => setSelected(null)}>← Volver</Button>
        <h2 className="text-lg font-semibold">{inv?.name}</h2>
        <Badge variant={s.variant}>{s.label}</Badge>
        {inv?.warehouse && <span className="text-xs text-muted-foreground">{inv.warehouse.name}</span>}
        <div className="ml-auto flex gap-2 flex-wrap">
          {inv?.status === 'draft' && (<>
            <Button variant="outline" size="sm" className="gap-1" onClick={() => importStockMut.mutate(inv.id)} disabled={importStockMut.isPending}>
              <RefreshCw className="size-4" />{importStockMut.isPending ? 'Importando...' : 'Importar stock actual'}
            </Button>
            <Button size="sm" className="gap-1" onClick={() => startMut.mutate(inv.id)} disabled={startMut.isPending || items.length === 0}>
              <Play className="size-4" />Iniciar conteo
            </Button>
          </>)}
          {inv?.status === 'in_progress' && (<>
            <Button size="sm" variant="default" className="gap-1" onClick={() => completeMut.mutate(inv.id)} disabled={completeMut.isPending || forceCompleteMut.isPending}>
              <CheckCircle2 className="size-4" />{completeMut.isPending ? 'Aplicando...' : 'Completar y ajustar stock'}
            </Button>
            <Button size="sm" variant="outline" className="gap-1 text-destructive" onClick={() => cancelMut.mutate(inv.id)} disabled={cancelMut.isPending}>
              <X className="size-4" />Cancelar
            </Button>
          </>)}
          {inv?.status === 'draft' && (
            <Button size="sm" variant="ghost" className="text-destructive" onClick={() => { if (confirm('¿Eliminar?')) deleteMut.mutate(inv.id); }}>Eliminar</Button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card><CardContent className="py-3 text-center"><p className="text-xs text-muted-foreground">Total ítems</p><p className="text-2xl font-bold">{summary?.total_items ?? 0}</p></CardContent></Card>
        <Card><CardContent className="py-3 text-center"><p className="text-xs text-muted-foreground">Contados</p><p className="text-2xl font-bold text-green-600">{summary?.counted_items ?? 0}</p></CardContent></Card>
        <Card><CardContent className="py-3 text-center"><p className="text-xs text-muted-foreground">Con diferencia</p><p className="text-2xl font-bold text-orange-500">{summary?.discrepancies ?? 0}</p></CardContent></Card>
        <Card><CardContent className="py-3 text-center"><p className="text-xs text-muted-foreground">Varianza total</p><p className="text-lg font-bold text-red-600">{fmt(detail?.total_difference_value ?? 0)}</p></CardContent></Card>
      </div>

      {/* Progress bar */}
      {inv?.status === 'in_progress' && (
        <div className="space-y-1">
          <div className="flex justify-between text-xs text-muted-foreground">
            <span>Progreso del conteo</span><span>{progress}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      )}

      {/* Tabla de ítems */}
      <Card>
        <CardContent className="p-0">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Producto</th>
                <th className="text-left px-4 py-3 font-medium">SKU</th>
                <th className="text-left px-4 py-3 font-medium">Ubicación</th>
                <th className="text-right px-4 py-3 font-medium">Stock sistema</th>
                <th className="text-right px-4 py-3 font-medium">Contado</th>
                <th className="text-right px-4 py-3 font-medium">Diferencia</th>
                <th className="text-right px-4 py-3 font-medium">Valor dif.</th>
                {inv?.status !== 'completed' && <th className="px-4 py-3"></th>}
              </tr>
            </thead>
            <tbody className="divide-y">
              {items.map((item) => {
                const hasDiff = item.difference !== null && Math.abs(item.difference) > 0.001;
                return (
                  <tr key={item.id} className={`hover:bg-muted/20 ${item.counted_qty === null ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-2 font-medium">{item.product_name}</td>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">{item.product_sku ?? '—'}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{item.location_label ?? '—'}</td>
                    <td className="px-4 py-2 text-right">{item.system_qty}</td>
                    <td className="px-4 py-2 text-right">
                      {item.counted_qty !== null
                        ? <span className="font-medium">{item.counted_qty}</span>
                        : <span className="text-muted-foreground text-xs">Pendiente</span>}
                    </td>
                    <td className={`px-4 py-2 text-right font-medium ${!hasDiff ? '' : item.difference! > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {item.difference !== null ? (item.difference > 0 ? '+' : '') + item.difference : '—'}
                    </td>
                    <td className={`px-4 py-2 text-right text-xs ${!hasDiff ? 'text-muted-foreground' : item.difference_value! > 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {item.difference_value !== null ? fmt(item.difference_value) : '—'}
                    </td>
                    {inv?.status !== 'completed' && (
                      <td className="px-4 py-2">
                        <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs"
                          onClick={() => { setCountItem(item); setCountedQty(item.counted_qty !== null ? String(item.counted_qty) : ''); setCountNotes(item.notes ?? ''); }}>
                          <Pencil className="size-3" />{item.counted_qty !== null ? 'Editar' : 'Contar'}
                        </Button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr><td colSpan={8} className="text-center py-10 text-muted-foreground text-sm">
                  <Package className="size-8 mx-auto mb-2 opacity-30" />
                  {inv?.status === 'draft' ? 'Importa el stock actual para poblar los ítems' : 'Sin ítems'}
                </td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Dialog: Registrar conteo */}
      <Dialog open={!!countItem} onOpenChange={(o) => { if (!o) setCountItem(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><ClipboardCheck className="size-4" />Registrar conteo</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm font-medium">{countItem?.product_name}</p>
            <p className="text-xs text-muted-foreground">Stock en sistema: <span className="font-semibold text-foreground">{countItem?.system_qty}</span></p>
            {countItem?.difference !== null && countItem?.difference !== undefined && Math.abs(countItem.difference) > 0.001 && (
              <div className={`flex items-center gap-2 text-xs p-2 rounded ${countItem.difference > 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                <AlertTriangle className="size-3" />
                Diferencia actual: {countItem.difference > 0 ? '+' : ''}{countItem.difference} unidades ({fmt(countItem.difference_value ?? 0)})
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Cantidad física contada *</Label>
              <Input type="number" min={0} step="0.001" value={countedQty} onChange={(e) => setCountedQty(e.target.value)} autoFocus />
              {countedQty !== '' && countItem && (
                <p className="text-xs text-muted-foreground">
                  Diferencia: <span className={Number(countedQty) - countItem.system_qty > 0 ? 'text-green-600 font-medium' : Number(countedQty) - countItem.system_qty < 0 ? 'text-red-600 font-medium' : ''}>
                    {(Number(countedQty) - countItem.system_qty > 0 ? '+' : '') + (Number(countedQty) - countItem.system_qty).toFixed(3)}
                  </span>
                </p>
              )}
            </div>
            <div className="space-y-1.5"><Label>Notas</Label><Input value={countNotes} onChange={(e) => setCountNotes(e.target.value)} placeholder="Observaciones..." /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCountItem(null)}>Cancelar</Button>
            <Button onClick={() => countItem && selected && updateItemMut.mutate({ id: selected.id, itemId: countItem.id, qty: Number(countedQty), notes: countNotes })} disabled={countedQty === '' || updateItemMut.isPending}>
              {updateItemMut.isPending ? 'Guardando...' : 'Registrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
