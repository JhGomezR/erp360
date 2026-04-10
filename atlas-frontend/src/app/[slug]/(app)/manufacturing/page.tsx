'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { notify } from '@/lib/notify';
import {
  Factory, Plus, Play, CheckCircle, X, Trash2, Eye, List, ClipboardList,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { manufacturingApi, setTenantSlug } from '@/lib/api/tenant.api';
import { AddonGate } from '@/components/shared/AddonPaywall';

// ─── Types ────────────────────────────────────────────────────────────────────
interface BomItem { id?: number; component_product_id: number; component_name: string; quantity: number; unit: string; unit_cost: number; notes?: string; }
interface Bom { id: number; bom_code: string; product_id: number; product_name: string; quantity_produced: number; unit: string; standard_cost: number; status: string; items_count?: number; items?: BomItem[]; }
interface ProductionOrder { id: number; order_number: string; bom_id: number; product_name: string; quantity_ordered: number; quantity_produced: number; status: string; scheduled_date: string; cost_estimated: number; cost_actual: number; bom?: { bom_code: string }; }
interface OrderSummary { [status: string]: { count: number; total_qty: number; total_estimated: number; total_actual: number } }

// ─── Schemas ─────────────────────────────────────────────────────────────────
const bomItemSchema = z.object({
  component_product_id: z.string().min(1, 'Producto requerido'),
  component_name:       z.string().min(1, 'Nombre requerido'),
  quantity:             z.string().min(1, 'Cantidad requerida'),
  unit:                 z.string().optional(),
  unit_cost:            z.string().optional(),
  notes:                z.string().optional(),
});
const bomSchema = z.object({
  product_id:        z.string().min(1, 'Producto requerido'),
  product_name:      z.string().min(1, 'Nombre requerido'),
  quantity_produced: z.string().min(1, 'Cantidad requerida'),
  unit:              z.string().optional(),
  notes:             z.string().optional(),
  items:             z.array(bomItemSchema).min(1, 'Agrega al menos un componente'),
});
type BomForm = z.infer<typeof bomSchema>;

const orderSchema = z.object({
  bom_id:           z.string().min(1, 'BOM requerido'),
  quantity_ordered: z.string().min(1, 'Cantidad requerida'),
  scheduled_date:   z.string().min(1, 'Fecha requerida'),
  notes:            z.string().optional(),
});
type OrderForm = z.infer<typeof orderSchema>;

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'outline' | 'destructive'> = {
  draft:       'secondary',
  in_progress: 'default',
  completed:   'default',
  cancelled:   'destructive',
};
const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador', in_progress: 'En Progreso', completed: 'Completada', cancelled: 'Cancelada',
};

const fmt = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

const TABS = [
  { id: 'orders', label: 'Órdenes de Producción', icon: ClipboardList },
  { id: 'bom',    label: 'Lista de Materiales',   icon: List },
];

export default function ManufacturingPage() {
  const params = useParams();
  const slug   = params.slug as string;
  setTenantSlug(slug);

  const qc = useQueryClient();
  const [tab, setTab]               = useState('orders');
  const [bomOpen, setBomOpen]       = useState(false);
  const [orderOpen, setOrderOpen]   = useState(false);
  const [viewOrder, setViewOrder]   = useState<ProductionOrder | null>(null);
  const [completeOrder, setComplete] = useState<ProductionOrder | null>(null);
  const [statusFilter, setStatus]   = useState('');
  const [searchBom, setSearchBom]   = useState('');

  interface OrderDetailType { id: number; status: string; scheduled_date: string; quantity_ordered: number; quantity_produced: number; cost_estimated: number; cost_actual: number; consumptions: { id: number; product_name: string; quantity_required: number; quantity_consumed: number }[]; }

  // Queries
  const { data: summaryData } = useQuery<OrderSummary>({
    queryKey: ['manufacturing-summary', slug],
    queryFn: () => manufacturingApi.ordersSummary().then(r => r.data as OrderSummary),
  });

  const { data: ordersData, isLoading: ordersLoading } = useQuery<{ data: ProductionOrder[] }>({
    queryKey: ['production-orders', slug, statusFilter],
    queryFn: () => manufacturingApi.orders({ status: statusFilter || undefined }).then(r => r.data as { data: ProductionOrder[] }),
  });

  const { data: bomData, isLoading: bomLoading } = useQuery<{ data: Bom[] }>({
    queryKey: ['bom-list', slug, searchBom],
    queryFn: () => manufacturingApi.bomList({ search: searchBom || undefined }).then(r => r.data as { data: Bom[] }),
    enabled: tab === 'bom',
  });

  const { data: orderDetail } = useQuery<OrderDetailType | null>({
    queryKey: ['order-detail', viewOrder?.id],
    queryFn: () => viewOrder ? manufacturingApi.orderGet(viewOrder.id).then(r => r.data as OrderDetailType) : null,
    enabled: !!viewOrder,
  });

  const orders = ordersData?.data ?? [];
  const boms   = bomData?.data ?? [];

  // BOM Form
  const { register: rb, handleSubmit: hb, reset: resetB, setValue: setB, control: ctrlB, formState: { errors: errB } } = useForm<BomForm>({
    resolver: zodResolver(bomSchema),
    defaultValues: { quantity_produced: '1', unit: 'und', items: [{ component_product_id: '', component_name: '', quantity: '', unit: 'und', unit_cost: '' }] },
  });
  const { fields: bomItems, append: addItem, remove: removeItem } = useFieldArray({ control: ctrlB, name: 'items' });

  // Order Form
  const { register: ro, handleSubmit: ho, reset: resetO, setValue: setO, formState: { errors: errO } } = useForm<OrderForm>({
    resolver: zodResolver(orderSchema),
    defaultValues: { scheduled_date: new Date().toISOString().slice(0, 10) },
  });

  // Mutations
  const createBomMut = useMutation({
    mutationFn: (data: BomForm) => manufacturingApi.bomCreate({
      ...data,
      product_id: parseInt(data.product_id),
      quantity_produced: parseFloat(data.quantity_produced),
      items: data.items.map(i => ({ ...i, component_product_id: parseInt(i.component_product_id), quantity: parseFloat(i.quantity), unit_cost: parseFloat(i.unit_cost || '0') })),
    }),
    onSuccess: () => { notify.success('BOM creado'); qc.invalidateQueries({ queryKey: ['bom-list', slug] }); setBomOpen(false); resetB(); },
    onError: (err) => notify.error(err, 'Error al crear BOM'),
  });

  const createOrderMut = useMutation({
    mutationFn: (data: OrderForm) => manufacturingApi.orderCreate({ ...data, bom_id: parseInt(data.bom_id), quantity_ordered: parseFloat(data.quantity_ordered) }),
    onSuccess: () => { notify.success('Orden creada'); qc.invalidateQueries({ queryKey: ['production-orders', slug] }); qc.invalidateQueries({ queryKey: ['manufacturing-summary', slug] }); setOrderOpen(false); resetO(); },
    onError: (err) => notify.error(err, 'Error al crear orden'),
  });

  const startMut = useMutation({
    mutationFn: (id: number) => manufacturingApi.orderStart(id),
    onSuccess: () => { notify.success('Orden iniciada'); qc.invalidateQueries({ queryKey: ['production-orders', slug] }); qc.invalidateQueries({ queryKey: ['manufacturing-summary', slug] }); },
    onError: (err) => notify.error(err, 'Error al iniciar'),
  });

  const cancelMut = useMutation({
    mutationFn: (id: number) => manufacturingApi.orderCancel(id),
    onSuccess: () => { notify.success('Orden cancelada'); qc.invalidateQueries({ queryKey: ['production-orders', slug] }); qc.invalidateQueries({ queryKey: ['manufacturing-summary', slug] }); },
    onError: (err) => notify.error(err, 'Error al cancelar'),
  });

  const [completeQty, setCompleteQty] = useState('');
  const completeMut = useMutation({
    mutationFn: ({ id, qty }: { id: number; qty: number }) => manufacturingApi.orderComplete(id, { quantity_produced: qty }),
    onSuccess: () => {
      notify.success('Orden completada');
      qc.invalidateQueries({ queryKey: ['production-orders', slug] });
      qc.invalidateQueries({ queryKey: ['manufacturing-summary', slug] });
      setComplete(null);
    },
    onError: (err) => notify.error(err, 'Error al completar'),
  });

  const destroyBomMut = useMutation({
    mutationFn: (id: number) => manufacturingApi.bomDestroy(id),
    onSuccess: () => { notify.success('BOM eliminado'); qc.invalidateQueries({ queryKey: ['bom-list', slug] }); },
    onError: (e: unknown) => notify.error(e, 'Error al eliminar'),
  });

  const inProgress = summaryData?.in_progress?.count ?? 0;
  const draft      = summaryData?.draft?.count ?? 0;
  const completed  = summaryData?.completed?.count ?? 0;

  return (
    <AddonGate moduleKey="manufacturing" slug={slug}>
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Factory className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Manufactura / Producción</h1>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setBomOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> Nuevo BOM
          </Button>
          <Button onClick={() => setOrderOpen(true)}>
            <Plus className="w-4 h-4 mr-1" /> Nueva Orden
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">En Progreso</div><div className="text-2xl font-bold text-blue-600">{inProgress}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Borradores</div><div className="text-2xl font-bold">{draft}</div></CardContent></Card>
        <Card><CardContent className="p-4"><div className="text-sm text-muted-foreground">Completadas</div><div className="text-2xl font-bold text-green-600">{completed}</div></CardContent></Card>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${tab === t.id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <t.icon className="w-4 h-4" />{t.label}
          </button>
        ))}
      </div>

      {/* ── Tab: Orders ───────────────────────────────────────────────────────── */}
      {tab === 'orders' && (
        <div className="space-y-4">
          <Select value={statusFilter} onValueChange={v => setStatus(v ?? '')}>
            <SelectTrigger className="w-48"><SelectValue placeholder="Todos los estados" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="">Todos</SelectItem>
              <SelectItem value="draft">Borradores</SelectItem>
              <SelectItem value="in_progress">En Progreso</SelectItem>
              <SelectItem value="completed">Completadas</SelectItem>
              <SelectItem value="cancelled">Canceladas</SelectItem>
            </SelectContent>
          </Select>

          {ordersLoading ? (
            <div className="space-y-2">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : orders.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 gap-3 text-muted-foreground">
              <div className="size-14 rounded-full bg-muted flex items-center justify-center">
                <ClipboardList className="size-7 opacity-40" />
              </div>
              <p className="font-medium">No hay órdenes de producción</p>
            </div>
          ) : (
            <div className="space-y-2">
              {orders.map(order => (
                <div key={order.id} className="rounded-2xl border bg-card p-4 flex items-center gap-4 hover:shadow-sm hover:border-primary/20 transition-all">
                  <span className="font-mono text-xs text-muted-foreground w-28">{order.order_number}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{order.product_name}</p>
                    <p className="text-xs text-muted-foreground">{order.bom?.bom_code}</p>
                  </div>
                  <div className="hidden sm:flex flex-col items-end text-xs text-muted-foreground">
                    <span>{order.quantity_ordered} ord.</span>
                    <span>{order.quantity_produced > 0 ? `${order.quantity_produced} prod.` : '—'}</span>
                  </div>
                  <span className="hidden md:block text-xs text-muted-foreground">{order.scheduled_date}</span>
                  <span className="hidden sm:block font-mono text-sm">{fmt(order.cost_estimated)}</span>
                  <Badge variant={STATUS_VARIANT[order.status] ?? 'outline'}>{STATUS_LABEL[order.status]}</Badge>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setViewOrder(order)}>
                      <Eye className="w-3.5 h-3.5" />
                    </Button>
                    {order.status === 'draft' && (
                      <Button size="sm" variant="ghost" onClick={() => startMut.mutate(order.id)} title="Iniciar">
                        <Play className="w-3.5 h-3.5 text-blue-600" />
                      </Button>
                    )}
                    {order.status === 'in_progress' && (
                      <Button size="sm" variant="ghost" onClick={() => { setComplete(order); setCompleteQty(String(order.quantity_ordered)); }} title="Completar">
                        <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                      </Button>
                    )}
                    {['draft', 'in_progress'].includes(order.status) && (
                      <Button size="sm" variant="ghost" onClick={() => cancelMut.mutate(order.id)} title="Cancelar">
                        <X className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: BOM ──────────────────────────────────────────────────────────── */}
      {tab === 'bom' && (
        <div className="space-y-4">
          <Input placeholder="Buscar BOM..." value={searchBom} onChange={e => setSearchBom(e.target.value)} className="max-w-xs" />
          {bomLoading ? (
            <div className="space-y-2">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : boms.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 gap-3 text-muted-foreground">
              <div className="size-14 rounded-full bg-muted flex items-center justify-center">
                <List className="size-7 opacity-40" />
              </div>
              <p className="font-medium">No hay listas de materiales</p>
            </div>
          ) : (
            <div className="space-y-2">
              {boms.map(bom => (
                <div key={bom.id} className="rounded-2xl border bg-card p-4 flex items-center gap-4 hover:shadow-sm hover:border-primary/20 transition-all">
                  <span className="font-mono text-xs text-muted-foreground w-24">{bom.bom_code}</span>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{bom.product_name}</p>
                    <p className="text-xs text-muted-foreground">{bom.quantity_produced} {bom.unit}</p>
                  </div>
                  <span className="hidden sm:block font-mono text-sm">{fmt(bom.standard_cost)}</span>
                  <span className="hidden md:block text-xs text-muted-foreground">{bom.items_count ?? '—'} componentes</span>
                  <Badge variant={bom.status === 'active' ? 'default' : 'secondary'}>
                    {bom.status === 'active' ? 'Activo' : 'Inactivo'}
                  </Badge>
                  <Button size="sm" variant="ghost" onClick={() => destroyBomMut.mutate(bom.id)}>
                    <Trash2 className="w-3.5 h-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Dialog: Crear BOM ─────────────────────────────────────────────────── */}
      <Dialog open={bomOpen} onOpenChange={setBomOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Nueva Lista de Materiales (BOM)</DialogTitle></DialogHeader>
          <form onSubmit={hb(d => createBomMut.mutate(d))} className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>ID Producto Terminado *</Label>
                <Input type="number" {...rb('product_id')} placeholder="ID del producto" />
                {errB.product_id && <p className="text-xs text-destructive">{errB.product_id.message}</p>}
              </div>
              <div className="space-y-1">
                <Label>Nombre del Producto *</Label>
                <Input {...rb('product_name')} placeholder="Ej: Mesa de Madera Ref. A" />
              </div>
              <div className="space-y-1">
                <Label>Cantidad que Produce *</Label>
                <Input type="number" {...rb('quantity_produced')} placeholder="1" min="0.0001" step="0.0001" />
              </div>
              <div className="space-y-1">
                <Label>Unidad</Label>
                <Input {...rb('unit')} placeholder="und" />
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Notas</Label>
                <Input {...rb('notes')} />
              </div>
            </div>

            {/* BOM Items */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Componentes *</Label>
                <Button type="button" size="sm" variant="outline"
                  onClick={() => addItem({ component_product_id: '', component_name: '', quantity: '', unit: 'und', unit_cost: '' })}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Agregar
                </Button>
              </div>
              {errB.items && <p className="text-xs text-destructive">{errB.items.message}</p>}
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {bomItems.map((field, idx) => (
                  <div key={field.id} className="grid grid-cols-12 gap-2 items-end text-xs">
                    <div className="col-span-2">
                      <Input type="number" {...rb(`items.${idx}.component_product_id`)} placeholder="ID" className="h-8" />
                    </div>
                    <div className="col-span-4">
                      <Input {...rb(`items.${idx}.component_name`)} placeholder="Nombre componente" className="h-8" />
                    </div>
                    <div className="col-span-2">
                      <Input type="number" {...rb(`items.${idx}.quantity`)} placeholder="Qty" className="h-8" step="0.0001" min="0.0001" />
                    </div>
                    <div className="col-span-1">
                      <Input {...rb(`items.${idx}.unit`)} placeholder="und" className="h-8" />
                    </div>
                    <div className="col-span-2">
                      <Input type="number" {...rb(`items.${idx}.unit_cost`)} placeholder="Costo" className="h-8" min="0" />
                    </div>
                    <div className="col-span-1">
                      <Button type="button" size="sm" variant="ghost" onClick={() => removeItem(idx)} className="h-8 w-8 p-0">
                        <X className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setBomOpen(false); resetB(); }}>Cancelar</Button>
              <Button type="submit" disabled={createBomMut.isPending}>
                {createBomMut.isPending ? 'Guardando...' : 'Crear BOM'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Crear Orden ───────────────────────────────────────────────── */}
      <Dialog open={orderOpen} onOpenChange={setOrderOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Nueva Orden de Producción</DialogTitle></DialogHeader>
          <form onSubmit={ho(d => createOrderMut.mutate(d))} className="space-y-3">
            <div className="space-y-1">
              <Label>BOM *</Label>
              <Select onValueChange={v => setO('bom_id', String(v ?? ''))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar BOM..." /></SelectTrigger>
                <SelectContent>
                  {boms.filter(b => b.status === 'active').map(b => (
                    <SelectItem key={b.id} value={b.id.toString()}>{b.bom_code} — {b.product_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errO.bom_id && <p className="text-xs text-destructive">{errO.bom_id.message}</p>}
            </div>
            <div className="space-y-1">
              <Label>Cantidad a Producir *</Label>
              <Input type="number" {...ro('quantity_ordered')} placeholder="1" min="0.0001" step="0.0001" />
            </div>
            <div className="space-y-1">
              <Label>Fecha Programada *</Label>
              <Input type="date" {...ro('scheduled_date')} />
            </div>
            <div className="space-y-1">
              <Label>Notas</Label>
              <Input {...ro('notes')} />
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => { setOrderOpen(false); resetO(); }}>Cancelar</Button>
              <Button type="submit" disabled={createOrderMut.isPending}>
                {createOrderMut.isPending ? 'Creando...' : 'Crear Orden'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Ver Detalle Orden ─────────────────────────────────────────── */}
      <Dialog open={!!viewOrder} onOpenChange={v => !v && setViewOrder(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{viewOrder?.order_number} — {viewOrder?.product_name}</DialogTitle>
          </DialogHeader>
          {orderDetail ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-muted-foreground">Estado:</span> <Badge variant={STATUS_VARIANT[orderDetail.status ?? '']}>{STATUS_LABEL[orderDetail.status ?? '']}</Badge></div>
                <div><span className="text-muted-foreground">Fecha:</span> {orderDetail.scheduled_date}</div>
                <div><span className="text-muted-foreground">Qty Ordenada:</span> {orderDetail.quantity_ordered}</div>
                <div><span className="text-muted-foreground">Qty Producida:</span> {orderDetail.quantity_produced}</div>
                <div><span className="text-muted-foreground">Costo Estimado:</span> {fmt(orderDetail.cost_estimated)}</div>
                <div><span className="text-muted-foreground">Costo Real:</span> {fmt(orderDetail.cost_actual)}</div>
              </div>
              <div>
                <Label className="text-sm mb-2 block">Consumo de Materiales</Label>
                <table className="w-full text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left px-2 py-1.5">Componente</th>
                      <th className="text-right px-2 py-1.5">Requerido</th>
                      <th className="text-right px-2 py-1.5">Consumido</th>
                    </tr>
                  </thead>
                  <tbody>
                    {orderDetail.consumptions?.map((c) => (
                      <tr key={c.id} className="border-t">
                        <td className="px-2 py-1">{c.product_name}</td>
                        <td className="px-2 py-1 text-right">{c.quantity_required}</td>
                        <td className="px-2 py-1 text-right">{c.quantity_consumed > 0 ? c.quantity_consumed : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : <Skeleton className="h-40" />}
        </DialogContent>
      </Dialog>

      {/* ── Dialog: Completar Orden ───────────────────────────────────────────── */}
      <Dialog open={!!completeOrder} onOpenChange={v => !v && setComplete(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Completar Orden — {completeOrder?.order_number}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="text-sm p-3 rounded-md bg-blue-50 border border-blue-200 text-blue-800">
              Cantidad ordenada: <strong>{completeOrder?.quantity_ordered}</strong>
            </div>
            <div className="space-y-1">
              <Label>Cantidad Producida *</Label>
              <Input type="number" value={completeQty} onChange={e => setCompleteQty(e.target.value)} min="0.0001" step="0.0001" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setComplete(null)}>Cancelar</Button>
            <Button disabled={completeMut.isPending || !completeQty}
              onClick={() => completeMut.mutate({ id: completeOrder!.id, qty: parseFloat(completeQty) })}>
              <CheckCircle className="w-4 h-4 mr-1" />
              {completeMut.isPending ? 'Procesando...' : 'Confirmar Producción'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </AddonGate>
  );
}
