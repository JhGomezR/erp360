'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notify } from '@/lib/notify';
import {
  Wrench, Plus, Search, AlertTriangle, Clock, CheckCircle2,
  Truck, Ban, ChevronRight, Pencil, Trash2, Save, X,
  Smartphone, User, CalendarClock, ArrowRight, Package,
  Hammer, Star, ShieldCheck, FileSignature, AlertCircle, DollarSign,
} from 'lucide-react';

import {
  workshopApi,
  type WorkOrder, type WorkOrderItem,
  type WorkOrderStatus, type WorkOrderPriority, type WorkOrderItemType,
} from '@/lib/api/tenant.api';
import { AddonGate } from '@/components/shared/AddonPaywall';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';

import { Button }   from '@/components/ui/button';
import { Input }    from '@/components/ui/input';
import { Label }    from '@/components/ui/label';
import { Badge }    from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from '@/components/ui/sheet';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';

// ─── Meta ──────────────────────────────────────────────────────────────────────

const STATUS_META: Record<WorkOrderStatus, { label: string; color: string; icon: React.ElementType }> = {
  received:    { label: 'Recibido',      color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',       icon: Package },
  diagnosed:   { label: 'Diagnosticado', color: 'bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400', icon: Search },
  approved:    { label: 'Aprobado',      color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',   icon: CheckCircle2 },
  in_progress: { label: 'En proceso',   color: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400', icon: Wrench },
  completed:   { label: 'Completado',   color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400', icon: CheckCircle2 },
  delivered:   { label: 'Entregado',    color: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',     icon: Truck },
  cancelled:   { label: 'Cancelado',    color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',             icon: Ban },
};

const PRIORITY_META: Record<WorkOrderPriority, { label: string; color: string }> = {
  low:    { label: 'Baja',    color: 'bg-muted text-muted-foreground' },
  normal: { label: 'Normal',  color: 'bg-blue-100 text-blue-700' },
  high:   { label: 'Alta',    color: 'bg-orange-100 text-orange-700' },
  urgent: { label: 'Urgente', color: 'bg-red-100 text-red-700 font-semibold' },
};

const ITEM_TYPE_META: Record<WorkOrderItemType, { label: string; icon: React.ElementType }> = {
  part:    { label: 'Repuesto',      icon: Package },
  service: { label: 'Servicio',      icon: Wrench  },
  labor:   { label: 'Mano de obra',  icon: Hammer  },
};

const STATUS_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  received:    ['diagnosed', 'cancelled'],
  diagnosed:   ['approved', 'cancelled'],
  approved:    ['in_progress', 'cancelled'],
  in_progress: ['completed', 'cancelled'],
  completed:   ['delivered', 'in_progress'],
  delivered:   [],
  cancelled:   [],
};

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

const fmtDate = (d?: string | null) =>
  d ? new Date(d).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: WorkOrderStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${meta.color}`}>
      {meta.label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: WorkOrderPriority }) {
  const meta = PRIORITY_META[priority];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${meta.color}`}>
      {priority === 'urgent' && <Star className="size-2.5 mr-1" />}
      {meta.label}
    </span>
  );
}

// ─── New Order Dialog ─────────────────────────────────────────────────────────

const EMPTY_ORDER = {
  customer_name:        '',
  customer_phone:       '',
  customer_email:       '',
  device_type:          '',
  device_brand:         '',
  device_model:         '',
  device_serial:        '',
  device_color:         '',
  accessories_received: '',
  problem_description:  '',
  priority:             'normal' as WorkOrderPriority,
  promised_at:          '',
  advance_payment:      '',
};

interface NewOrderDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  slug: string;
}

function NewOrderDialog({ open, onOpenChange, slug }: NewOrderDialogProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState({ ...EMPTY_ORDER });

  useEffect(() => {
    if (open) setForm({ ...EMPTY_ORDER });
  }, [open]);

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const createMutation = useMutation({
    mutationFn: () =>
      workshopApi.create({
        customer_name:        form.customer_name,
        customer_phone:       form.customer_phone || undefined,
        customer_email:       form.customer_email || undefined,
        device_type:          form.device_type,
        device_brand:         form.device_brand || undefined,
        device_model:         form.device_model || undefined,
        device_serial:        form.device_serial || undefined,
        device_color:         form.device_color || undefined,
        accessories_received: form.accessories_received || undefined,
        problem_description:  form.problem_description,
        priority:             form.priority,
        promised_at:          form.promised_at || undefined,
        advance_payment:      form.advance_payment ? Number(form.advance_payment) : undefined,
      }),
    onSuccess: () => {
      notify.success('Orden de trabajo creada');
      qc.invalidateQueries({ queryKey: ['workshop-orders', slug] });
      qc.invalidateQueries({ queryKey: ['workshop-dashboard', slug] });
      onOpenChange(false);
    },
    onError: (e) => notify.error(e, 'Error al crear la orden'),
  });

  const canSave = form.customer_name.trim() && form.device_type.trim() && form.problem_description.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva orden de trabajo</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {/* Cliente */}
          <section className="flex flex-col gap-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <User className="size-3.5" /> Cliente
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="sm:col-span-2 flex flex-col gap-1.5">
                <Label>Nombre *</Label>
                <Input value={form.customer_name} onChange={(e) => set('customer_name', e.target.value)} placeholder="Nombre completo" autoFocus />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Teléfono</Label>
                <Input value={form.customer_phone} onChange={(e) => set('customer_phone', e.target.value)} placeholder="3001234567" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.customer_email} onChange={(e) => set('customer_email', e.target.value)} placeholder="correo@ejemplo.com" />
            </div>
          </section>

          {/* Equipo */}
          <section className="flex flex-col gap-3 border-t pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <Smartphone className="size-3.5" /> Equipo
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label>Tipo de equipo *</Label>
                <Input value={form.device_type} onChange={(e) => set('device_type', e.target.value)} placeholder="Celular, Laptop, Tablet…" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Marca</Label>
                <Input value={form.device_brand} onChange={(e) => set('device_brand', e.target.value)} placeholder="Samsung, Apple…" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Modelo</Label>
                <Input value={form.device_model} onChange={(e) => set('device_model', e.target.value)} placeholder="A54, iPhone 14…" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Serial / IMEI</Label>
                <Input value={form.device_serial} onChange={(e) => set('device_serial', e.target.value)} className="font-mono text-sm" />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Color</Label>
                <Input value={form.device_color} onChange={(e) => set('device_color', e.target.value)} placeholder="Negro, Blanco…" />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Accesorios recibidos</Label>
              <Input value={form.accessories_received} onChange={(e) => set('accessories_received', e.target.value)} placeholder="Cargador, funda, estuche…" />
            </div>
          </section>

          {/* Falla y configuración */}
          <section className="flex flex-col gap-3 border-t pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
              <Wrench className="size-3.5" /> Servicio
            </h3>
            <div className="flex flex-col gap-1.5">
              <Label>Descripción del problema *</Label>
              <textarea
                value={form.problem_description}
                onChange={(e) => set('problem_description', e.target.value)}
                placeholder="¿Qué falla o qué servicio necesita el equipo?"
                rows={3}
                className="min-h-[72px] w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none"
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="flex flex-col gap-1.5">
                <Label>Prioridad</Label>
                <Select value={form.priority} onValueChange={(v) => set('priority', v as WorkOrderPriority)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {(Object.keys(PRIORITY_META) as WorkOrderPriority[]).map((p) => (
                      <SelectItem key={p} value={p}>{PRIORITY_META[p].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Fecha de entrega prometida</Label>
                <Input type="date" value={form.promised_at} onChange={(e) => set('promised_at', e.target.value)} />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Anticipo ($)</Label>
                <Input type="number" min={0} value={form.advance_payment} onChange={(e) => set('advance_payment', e.target.value)} placeholder="0" />
              </div>
            </div>
          </section>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button disabled={!canSave || createMutation.isPending} onClick={() => createMutation.mutate()}>
            {createMutation.isPending ? 'Guardando…' : 'Crear orden'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Order Detail Sheet ───────────────────────────────────────────────────────

interface DetailSheetProps {
  orderId: number | null;
  slug: string;
  onClose: () => void;
}

function DetailSheet({ orderId, slug, onClose }: DetailSheetProps) {
  const qc = useQueryClient();
  const [addingItem, setAddingItem]     = useState(false);
  const [newItem, setNewItem]           = useState({ description: '', type: 'service' as WorkOrderItemType, quantity: '1', unit_price: '' });
  const [editingNotes, setEditingNotes] = useState(false);
  const [notes, setNotes]               = useState('');
  const [statusNote, setStatusNote]     = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['workshop-order', slug, orderId],
    queryFn: () => workshopApi.show(orderId!).then((r) => r.data),
    enabled: orderId !== null,
  });

  const order = data as WorkOrder | undefined;

  // Update notes state when order loads
  useEffect(() => {
    if (order) setNotes(order.internal_notes ?? '');
  }, [order?.id]);

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['workshop-order', slug, orderId] });
    qc.invalidateQueries({ queryKey: ['workshop-orders', slug] });
    qc.invalidateQueries({ queryKey: ['workshop-dashboard', slug] });
  };

  const statusMutation = useMutation({
    mutationFn: (status: WorkOrderStatus) =>
      workshopApi.updateStatus(orderId!, status, statusNote || undefined),
    onSuccess: (_, status) => {
      notify.success(`Orden → ${STATUS_META[status].label}`);
      setStatusNote('');
      invalidate();
    },
    onError: (e) => notify.error(e, 'Error al cambiar estado'),
  });

  const addItemMutation = useMutation({
    mutationFn: () =>
      workshopApi.addItem(orderId!, {
        description: newItem.description,
        type:        newItem.type,
        quantity:    Number(newItem.quantity),
        unit_price:  Number(newItem.unit_price),
      }),
    onSuccess: () => {
      notify.success('Ítem agregado');
      setNewItem({ description: '', type: 'service', quantity: '1', unit_price: '' });
      setAddingItem(false);
      invalidate();
    },
    onError: (err) => notify.error(err, 'Error al agregar ítem'),
  });

  const removeItemMutation = useMutation({
    mutationFn: (itemId: number) => workshopApi.removeItem(orderId!, itemId),
    onSuccess: () => { notify.success('Ítem eliminado'); invalidate(); },
    onError: (err) => notify.error(err, 'Error al eliminar ítem'),
  });

  const saveNotesMutation = useMutation({
    mutationFn: () => workshopApi.update(orderId!, { internal_notes: notes }),
    onSuccess: () => { notify.success('Notas guardadas'); setEditingNotes(false); invalidate(); },
    onError: (err) => notify.error(err, 'Error al guardar notas'),
  });

  const nextStatuses = order ? STATUS_TRANSITIONS[order.status] : [];
  const isClosed = order && (order.status === 'delivered' || order.status === 'cancelled');

  return (
    <Sheet open={orderId !== null} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl flex flex-col p-0 gap-0 overflow-y-auto">
        {isLoading || !order ? (
          <div className="p-6 flex flex-col gap-4">
            {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-6 w-full" />)}
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="px-5 py-4 border-b flex flex-col gap-2">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <SheetTitle className="text-base font-mono font-bold">{order.order_number}</SheetTitle>
                  <p className="text-sm text-muted-foreground">Recibida el {fmtDate(order.received_at)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <PriorityBadge priority={order.priority} />
                  <StatusBadge status={order.status} />
                  {order.is_overdue && (
                    <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium bg-red-100 text-red-700">
                      <AlertTriangle className="size-3" /> Vencida
                    </span>
                  )}
                </div>
              </div>

              {/* Cambio de estado */}
              {!isClosed && nextStatuses.length > 0 && (
                <div className="flex flex-col gap-2 rounded-lg bg-muted/50 p-3 mt-1">
                  <p className="text-xs text-muted-foreground font-medium">Avanzar estado:</p>
                  <div className="flex flex-wrap gap-2">
                    {nextStatuses.map((s) => {
                      const meta = STATUS_META[s];
                      return (
                        <Button
                          key={s}
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1.5 text-xs"
                          disabled={statusMutation.isPending}
                          onClick={() => statusMutation.mutate(s)}
                        >
                          <ArrowRight className="size-3.5" />
                          {meta.label}
                        </Button>
                      );
                    })}
                  </div>
                  <Input
                    value={statusNote}
                    onChange={(e) => setStatusNote(e.target.value)}
                    placeholder="Nota al cambiar estado (opcional)"
                    className="h-7 text-xs"
                  />
                </div>
              )}
            </div>

            {/* Body */}
            <div className="flex-1 flex flex-col divide-y">
              {/* Cliente + Equipo */}
              <div className="px-5 py-4 grid grid-cols-2 gap-4 text-sm">
                <div className="flex flex-col gap-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-1 flex items-center gap-1">
                    <User className="size-3" /> Cliente
                  </p>
                  <p className="font-medium">{order.customer_name}</p>
                  {order.customer_phone && <p className="text-muted-foreground">{order.customer_phone}</p>}
                  {order.customer_email && <p className="text-muted-foreground text-xs">{order.customer_email}</p>}
                </div>
                <div className="flex flex-col gap-1">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-1 flex items-center gap-1">
                    <Smartphone className="size-3" /> Equipo
                  </p>
                  <p className="font-medium">{order.device_type} {order.device_brand} {order.device_model}</p>
                  {order.device_serial && <p className="text-muted-foreground font-mono text-xs">{order.device_serial}</p>}
                  {order.device_color && <p className="text-muted-foreground text-xs">{order.device_color}</p>}
                </div>
              </div>

              {/* Problema y diagnóstico */}
              <div className="px-5 py-4 flex flex-col gap-3 text-sm">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1">Problema reportado</p>
                  <p className="text-sm">{order.problem_description}</p>
                </div>
                {order.diagnosis && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground mb-1">Diagnóstico</p>
                    <p className="text-sm">{order.diagnosis}</p>
                  </div>
                )}
                {order.promised_at && (
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <CalendarClock className="size-3.5" />
                    Entrega prometida: <strong className="text-foreground">{fmtDate(order.promised_at)}</strong>
                  </div>
                )}
                {order.accessories_received && (
                  <p className="text-xs text-muted-foreground">Accesorios: {order.accessories_received}</p>
                )}
              </div>

              {/* Ítems (repuestos / servicios) */}
              <div className="px-5 py-4 flex flex-col gap-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Repuestos y servicios</p>
                  {!isClosed && !addingItem && (
                    <Button size="sm" variant="outline" className="h-7 gap-1.5 text-xs" onClick={() => setAddingItem(true)}>
                      <Plus className="size-3.5" /> Agregar
                    </Button>
                  )}
                </div>

                {/* Add item form */}
                {addingItem && (
                  <div className="rounded-lg border p-3 flex flex-col gap-2 bg-primary/5">
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <Input
                          value={newItem.description}
                          onChange={(e) => setNewItem((p) => ({ ...p, description: e.target.value }))}
                          placeholder="Descripción"
                          className="h-7 text-sm"
                          autoFocus
                        />
                      </div>
                      <Select value={newItem.type} onValueChange={(v) => setNewItem((p) => ({ ...p, type: v as WorkOrderItemType }))}>
                        <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(ITEM_TYPE_META) as WorkOrderItemType[]).map((t) => (
                            <SelectItem key={t} value={t}>{ITEM_TYPE_META[t].label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <Input
                          type="number" min={0.01} step="any"
                          value={newItem.quantity}
                          onChange={(e) => setNewItem((p) => ({ ...p, quantity: e.target.value }))}
                          placeholder="Cant."
                          className="h-7 text-sm"
                        />
                      </div>
                      <div className="col-span-2">
                        <Input
                          type="number" min={0}
                          value={newItem.unit_price}
                          onChange={(e) => setNewItem((p) => ({ ...p, unit_price: e.target.value }))}
                          placeholder="Precio unitario"
                          className="h-7 text-sm"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="ghost" className="h-7" onClick={() => setAddingItem(false)}>
                        <X className="size-3.5" />
                      </Button>
                      <Button
                        size="sm"
                        className="h-7 gap-1"
                        disabled={!newItem.description || !newItem.unit_price || addItemMutation.isPending}
                        onClick={() => addItemMutation.mutate()}
                      >
                        <Save className="size-3.5" /> Guardar
                      </Button>
                    </div>
                  </div>
                )}

                {/* Items table */}
                {(order.items ?? []).length === 0 && !addingItem ? (
                  <p className="text-xs text-muted-foreground text-center py-4">Sin ítems agregados aún.</p>
                ) : (
                  <div className="rounded-lg border overflow-hidden">
                    <table className="w-full text-sm">
                      <thead className="bg-muted/50 text-xs text-muted-foreground uppercase">
                        <tr>
                          <th className="px-3 py-2 text-left">Descripción</th>
                          <th className="px-3 py-2 text-center">Tipo</th>
                          <th className="px-3 py-2 text-right">Cant.</th>
                          <th className="px-3 py-2 text-right">Precio</th>
                          <th className="px-3 py-2 text-right">Total</th>
                          {!isClosed && <th className="px-3 py-2" />}
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {(order.items ?? []).map((item: WorkOrderItem) => {
                          const typeMeta = ITEM_TYPE_META[item.type];
                          const TypeIcon = typeMeta.icon;
                          return (
                            <tr key={item.id} className="hover:bg-muted/30">
                              <td className="px-3 py-2">{item.description}</td>
                              <td className="px-3 py-2 text-center">
                                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                                  <TypeIcon className="size-3" />
                                  {typeMeta.label}
                                </span>
                              </td>
                              <td className="px-3 py-2 text-right text-muted-foreground">{item.quantity}</td>
                              <td className="px-3 py-2 text-right text-muted-foreground">{fmt(item.unit_price)}</td>
                              <td className="px-3 py-2 text-right font-medium">{fmt(item.subtotal)}</td>
                              {!isClosed && (
                                <td className="px-3 py-2">
                                  <Button
                                    size="icon"
                                    variant="ghost"
                                    className="size-6"
                                    disabled={removeItemMutation.isPending}
                                    onClick={() => {
                                      if (window.confirm('¿Eliminar este ítem?')) removeItemMutation.mutate(item.id);
                                    }}
                                  >
                                    <Trash2 className="size-3 text-destructive" />
                                  </Button>
                                </td>
                              )}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Totales */}
              <div className="px-5 py-4 flex flex-col gap-1.5 text-sm">
                <div className="flex justify-between text-muted-foreground">
                  <span>Subtotal</span><span>{fmt(order.subtotal)}</span>
                </div>
                <div className="flex justify-between font-semibold text-base border-t pt-1.5 mt-1">
                  <span>Total</span><span>{fmt(order.total)}</span>
                </div>
                {order.advance_payment > 0 && (
                  <div className="flex justify-between text-emerald-600">
                    <span>Anticipo recibido</span><span>-{fmt(order.advance_payment)}</span>
                  </div>
                )}
                <div className={`flex justify-between font-semibold ${order.balance_due > 0 ? 'text-destructive' : 'text-emerald-600'}`}>
                  <span>Saldo pendiente</span><span>{fmt(order.balance_due)}</span>
                </div>
              </div>

              {/* Notas internas */}
              <div className="px-5 py-4 flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notas internas</p>
                  {!editingNotes ? (
                    <Button size="sm" variant="ghost" className="h-7 gap-1 text-xs" onClick={() => setEditingNotes(true)}>
                      <Pencil className="size-3" /> Editar
                    </Button>
                  ) : (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditingNotes(false)}><X className="size-3.5" /></Button>
                      <Button size="sm" className="h-7 gap-1" disabled={saveNotesMutation.isPending} onClick={() => saveNotesMutation.mutate()}>
                        <Save className="size-3.5" /> Guardar
                      </Button>
                    </div>
                  )}
                </div>
                {editingNotes ? (
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                    className="w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 resize-none"
                    placeholder="Notas técnicas, historial, observaciones…"
                    autoFocus
                  />
                ) : (
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap min-h-[2rem]">
                    {order.internal_notes || 'Sin notas.'}
                  </p>
                )}
              </div>
            </div>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Dashboard Tab ────────────────────────────────────────────────────────────

function DashboardTab({ slug, onOpenOrder }: { slug: string; onOpenOrder: (id: number) => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['workshop-dashboard', slug],
    queryFn: () => workshopApi.dashboard().then((r) => r.data),
    staleTime: 30_000,
  });

  const dash = data as import('@/lib/api/tenant.api').WorkshopDashboard | undefined;

  const activeStatuses: WorkOrderStatus[] = ['received', 'diagnosed', 'approved', 'in_progress', 'completed'];

  if (isLoading) {
    return (
      <div className="flex flex-col gap-6">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-xl border p-4 flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">Activas</p>
          <p className="text-2xl font-bold">
            {activeStatuses.reduce((acc, s) => acc + (dash?.active_by_status[s] ?? 0), 0)}
          </p>
          <p className="text-xs text-muted-foreground">órdenes en proceso</p>
        </div>
        <div className={`rounded-xl border p-4 flex flex-col gap-1 ${(dash?.overdue_count ?? 0) > 0 ? 'border-red-200 bg-red-50 dark:bg-red-950/20' : ''}`}>
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <AlertTriangle className="size-3" /> Vencidas
          </p>
          <p className={`text-2xl font-bold ${(dash?.overdue_count ?? 0) > 0 ? 'text-red-600' : ''}`}>
            {dash?.overdue_count ?? 0}
          </p>
          <p className="text-xs text-muted-foreground">fuera de plazo</p>
        </div>
        <div className="rounded-xl border p-4 flex flex-col gap-1">
          <p className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="size-3" /> Hoy
          </p>
          <p className="text-2xl font-bold">{dash?.today_deliveries ?? 0}</p>
          <p className="text-xs text-muted-foreground">entregas prometidas</p>
        </div>
        <div className="rounded-xl border p-4 flex flex-col gap-1">
          <p className="text-xs text-muted-foreground">Ingresos del mes</p>
          <p className="text-2xl font-bold text-emerald-600">{fmt(dash?.month_revenue ?? 0)}</p>
          <p className="text-xs text-muted-foreground">órdenes entregadas</p>
        </div>
      </div>

      {/* Status breakdown */}
      <div className="rounded-xl border overflow-hidden">
        <div className="px-4 py-3 border-b bg-muted/30">
          <p className="text-sm font-medium">Estado de órdenes activas</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-5 divide-x divide-y sm:divide-y-0">
          {activeStatuses.map((s) => {
            const meta = STATUS_META[s];
            const count = dash?.active_by_status[s] ?? 0;
            return (
              <div key={s} className="px-4 py-3 flex flex-col items-center gap-1 text-center">
                <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${meta.color}`}>{meta.label}</span>
                <span className="text-xl font-bold">{count}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent urgent orders */}
      {(dash?.recent_orders ?? []).length > 0 && (
        <div className="rounded-xl border overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/30">
            <p className="text-sm font-medium">Órdenes activas (por prioridad)</p>
          </div>
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-xs text-muted-foreground uppercase">
              <tr>
                <th className="px-3 py-2 text-left">Orden</th>
                <th className="px-3 py-2 text-left">Cliente / Equipo</th>
                <th className="px-3 py-2 text-center">Estado</th>
                <th className="px-3 py-2 text-center">Prioridad</th>
                <th className="px-3 py-2 text-center">Entrega</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y">
              {(dash?.recent_orders ?? []).map((wo) => (
                <tr
                  key={wo.id}
                  className={`hover:bg-muted/30 transition-colors cursor-pointer ${wo.is_overdue ? 'bg-red-50/50 dark:bg-red-950/10' : ''}`}
                  onClick={() => onOpenOrder(wo.id)}
                >
                  <td className="px-3 py-2 font-mono text-xs font-medium">{wo.order_number}</td>
                  <td className="px-3 py-2">
                    <p className="font-medium">{wo.customer_name}</p>
                    <p className="text-xs text-muted-foreground">{wo.device_type} {wo.device_brand} {wo.device_model}</p>
                  </td>
                  <td className="px-3 py-2 text-center"><StatusBadge status={wo.status} /></td>
                  <td className="px-3 py-2 text-center"><PriorityBadge priority={wo.priority} /></td>
                  <td className={`px-3 py-2 text-center text-xs ${wo.is_overdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                    {fmtDate(wo.promised_at)}
                  </td>
                  <td className="px-3 py-2">
                    <ChevronRight className="size-4 text-muted-foreground ml-auto" />
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

// ─── Orders Tab ───────────────────────────────────────────────────────────────

function OrdersTab({ slug, onOpenOrder }: { slug: string; onOpenOrder: (id: number) => void }) {
  const [search, setSearch]     = useState('');
  const [status, setStatus]     = useState<WorkOrderStatus | 'all'>('all');
  const [priority, setPriority] = useState<WorkOrderPriority | 'all'>('all');
  const [page, setPage]         = useState(1);

  const { data, isLoading } = useQuery({
    queryKey: ['workshop-orders', slug, { search, status, priority, page }],
    queryFn: () =>
      workshopApi.list({
        search:   search || undefined,
        status:   status !== 'all' ? status : undefined,
        priority: priority !== 'all' ? priority : undefined,
        page,
        per_page: 20,
      }).then((r) => r.data),
    staleTime: 15_000,
  });

  const orders: WorkOrder[]  = (data as any)?.data ?? [];
  const lastPage: number     = (data as any)?.last_page ?? 1;
  const total: number        = (data as any)?.total ?? 0;

  return (
    <div className="flex flex-col gap-4">
      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            placeholder="Buscar orden, cliente, equipo…"
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={(v) => { setStatus(v as any); setPage(1); }}>
          <SelectTrigger className="w-40"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {(Object.keys(STATUS_META) as WorkOrderStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{STATUS_META[s].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={priority} onValueChange={(v) => { setPriority(v as any); setPage(1); }}>
          <SelectTrigger className="w-36"><SelectValue placeholder="Prioridad" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {(Object.keys(PRIORITY_META) as WorkOrderPriority[]).map((p) => (
              <SelectItem key={p} value={p}>{PRIORITY_META[p].label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-xl border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground uppercase">
            <tr>
              <th className="px-3 py-2 text-left">Orden</th>
              <th className="px-3 py-2 text-left">Cliente</th>
              <th className="px-3 py-2 text-left">Equipo</th>
              <th className="px-3 py-2 text-center">Estado</th>
              <th className="px-3 py-2 text-center">Prioridad</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-center">Entrega</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading && Array.from({ length: 5 }).map((_, i) => (
              <tr key={i}>
                {Array.from({ length: 8 }).map((__, j) => (
                  <td key={j} className="px-3 py-2"><Skeleton className="h-4 w-full" /></td>
                ))}
              </tr>
            ))}
            {!isLoading && orders.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-12 text-center text-muted-foreground text-sm">
                  <Wrench className="size-10 mx-auto mb-2 opacity-30" />
                  Sin órdenes con los filtros actuales.
                </td>
              </tr>
            )}
            {!isLoading && orders.map((wo) => (
              <tr
                key={wo.id}
                className={`hover:bg-muted/30 transition-colors cursor-pointer ${wo.is_overdue ? 'bg-red-50/50 dark:bg-red-950/10' : ''}`}
                onClick={() => onOpenOrder(wo.id)}
              >
                <td className="px-3 py-2 font-mono text-xs font-semibold">{wo.order_number}</td>
                <td className="px-3 py-2">
                  <p className="font-medium">{wo.customer_name}</p>
                  {wo.customer_phone && <p className="text-xs text-muted-foreground">{wo.customer_phone}</p>}
                </td>
                <td className="px-3 py-2 text-muted-foreground">
                  {[wo.device_brand, wo.device_model].filter(Boolean).join(' ') || wo.device_type}
                </td>
                <td className="px-3 py-2 text-center"><StatusBadge status={wo.status} /></td>
                <td className="px-3 py-2 text-center"><PriorityBadge priority={wo.priority} /></td>
                <td className="px-3 py-2 text-right font-medium">{fmt(wo.total)}</td>
                <td className={`px-3 py-2 text-center text-xs ${wo.is_overdue ? 'text-red-600 font-medium' : 'text-muted-foreground'}`}>
                  {fmtDate(wo.promised_at)}
                </td>
                <td className="px-3 py-2">
                  <ChevronRight className="size-4 text-muted-foreground ml-auto" />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {lastPage > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{total} órdenes en total</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
            <span className="px-2 py-1">{page} / {lastPage}</span>
            <Button size="sm" variant="outline" disabled={page >= lastPage} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

// ══════════════════════════════════════════════════════════════════════════════
// WARRANTIES TAB
// ══════════════════════════════════════════════════════════════════════════════

function WarrantiesTab({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [claimOpen, setClaimOpen] = useState<number | null>(null);
  const [claimDesc, setClaimDesc] = useState('');

  const listQ = useQuery({
    queryKey: ['warranties', slug, search],
    queryFn: () => workshopApi.warranties({ search: search || undefined }),
  });
  const detailQ = useQuery({
    queryKey: ['warranty-detail', detailId],
    queryFn: () => workshopApi.getWarranty(detailId!),
    enabled: detailId !== null,
  });

  const warranties: any[] = (listQ.data as any)?.data?.data ?? [];
  const detail = (detailQ.data as any)?.data;

  const claimMut = useMutation({
    mutationFn: () => workshopApi.claimWarranty(claimOpen!, { description: claimDesc }),
    onSuccess: () => {
      notify.success('Reclamación registrada.');
      qc.invalidateQueries({ queryKey: ['warranties', slug] });
      qc.invalidateQueries({ queryKey: ['warranty-detail', claimOpen] });
      setClaimOpen(null); setClaimDesc('');
    },
    onError: (e: any) => notify.error(e?.response?.data?.message ?? 'Error'),
  });

  const statusColors: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    claimed: 'bg-amber-100 text-amber-700',
    expired: 'bg-red-100 text-red-600',
    voided: 'bg-gray-100 text-gray-500',
  };
  const statusLabels: Record<string, string> = {
    active: 'Activa', claimed: 'Reclamada', expired: 'Vencida', voided: 'Anulada',
  };

  const today = new Date().toISOString().split('T')[0];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input placeholder="Buscar por cliente, serial, #garantía..." value={search}
            onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4 mr-1.5" />Nueva garantía
        </Button>
      </div>

      <div className="space-y-2">
        {listQ.isLoading && Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-2xl border bg-card h-16 animate-pulse" />
        ))}
        {!listQ.isLoading && warranties.length === 0 && (
          <div className="flex flex-col items-center justify-center py-14 gap-3 text-muted-foreground">
            <div className="size-14 rounded-full bg-muted flex items-center justify-center">
              <ShieldCheck className="size-7 opacity-40" />
            </div>
            <p className="font-medium">Sin garantías registradas</p>
          </div>
        )}
        {warranties.map((w: any) => {
          const expiring = w.expires_at <= new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0] && w.status === 'active';
          return (
            <div key={w.id} className="rounded-2xl border bg-card p-4 flex items-center gap-4 hover:shadow-sm hover:border-primary/20 transition-all cursor-pointer" onClick={() => setDetailId(w.id)}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-muted-foreground">{w.warranty_number}</span>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[w.status] ?? ''}`}>
                    {statusLabels[w.status] ?? w.status}
                  </span>
                </div>
                <p className="font-semibold text-sm mt-0.5">{w.customer_name}</p>
                <p className="text-xs text-muted-foreground">{[w.device_brand, w.device_model].filter(Boolean).join(' ') || w.device_type}{w.device_serial ? ` · ${w.device_serial}` : ''}</p>
              </div>
              <div className="hidden sm:flex items-center gap-4 text-sm shrink-0">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Emitida</p>
                  <p className="text-xs">{fmtDate(w.issued_at)}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Vence</p>
                  <p className={`text-xs ${expiring ? 'text-amber-600 font-semibold' : ''}`}>
                    {expiring && <AlertCircle className="size-3 inline mr-1" />}
                    {fmtDate(w.expires_at)}
                  </p>
                </div>
              </div>
              {w.status === 'active' && w.expires_at >= today && (
                <Button size="sm" variant="outline" className="shrink-0" onClick={e => { e.stopPropagation(); setClaimOpen(w.id); }}>
                  Reclamar
                </Button>
              )}
            </div>
          );
        })}
      </div>

      {/* Create warranty dialog */}
      <CreateWarrantyDialog open={createOpen} onClose={() => { setCreateOpen(false); qc.invalidateQueries({ queryKey: ['warranties', slug] }); }} />

      {/* Detail sheet */}
      {detailId && (
        <Sheet open onOpenChange={() => setDetailId(null)}>
          <SheetContent className="w-full sm:max-w-lg flex flex-col gap-0 p-0">
            <SheetHeader className="px-6 py-4 border-b">
              <SheetTitle className="flex items-center gap-2">
                <ShieldCheck className="size-4" />
                {detail?.warranty?.warranty_number ?? '...'}
              </SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto p-6 space-y-4 text-sm">
              {detailQ.isLoading ? <p className="text-muted-foreground">Cargando...</p> : detail && (
                <>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {[
                      ['Cliente', detail.warranty.customer_name],
                      ['Teléfono', detail.warranty.customer_phone || '—'],
                      ['Equipo', detail.warranty.device_type],
                      ['Serial', detail.warranty.device_serial || '—'],
                      ['Vigencia', `${fmtDate(detail.warranty.issued_at)} — ${fmtDate(detail.warranty.expires_at)}`],
                      ['Estado', statusLabels[detail.warranty.status] ?? detail.warranty.status],
                    ].map(([k, v]) => (
                      <div key={k}><p className="text-xs text-muted-foreground">{k}</p><p className="font-medium">{v}</p></div>
                    ))}
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground mb-1">Cobertura</p>
                    <p>{detail.warranty.coverage_description}</p>
                  </div>
                  {detail.warranty.exclusions && (
                    <div>
                      <p className="text-xs text-muted-foreground mb-1">Exclusiones</p>
                      <p className="text-muted-foreground">{detail.warranty.exclusions}</p>
                    </div>
                  )}
                  {detail.claims?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold mb-2">Reclamaciones</p>
                      {detail.claims.map((c: any) => (
                        <div key={c.id} className="border rounded p-3 mb-2 text-xs">
                          <p className="font-mono">{c.claim_number}</p>
                          <p className="text-muted-foreground">{c.description}</p>
                          <p className="mt-1">Estado: <span className="font-medium">{c.status}</span></p>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </SheetContent>
        </Sheet>
      )}

      {/* Claim dialog */}
      <Dialog open={claimOpen !== null} onOpenChange={() => setClaimOpen(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Registrar Reclamación</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <Label>Descripción del problema *</Label>
            <Textarea value={claimDesc} onChange={e => setClaimDesc(e.target.value)} rows={3} placeholder="Detalla el motivo de la reclamación..." />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setClaimOpen(null)}>Cancelar</Button>
            <Button onClick={() => claimMut.mutate()} disabled={!claimDesc.trim() || claimMut.isPending}>
              {claimMut.isPending ? 'Registrando...' : 'Registrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateWarrantyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const today = new Date().toISOString().split('T')[0];
  const [f, setF] = useState({ customer_name: '', customer_phone: '', device_type: '', device_brand: '', device_model: '', device_serial: '', coverage_description: '', exclusions: '', issued_at: today, expires_at: '', notes: '' });
  const upd = (k: string, v: string) => setF(p => ({ ...p, [k]: v }));

  const mut = useMutation({
    mutationFn: () => workshopApi.createWarranty(f),
    onSuccess: () => { notify.success('Garantía creada.'); onClose(); },
    onError: (e: any) => notify.error(e?.response?.data?.message ?? 'Error'),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nueva Garantía</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {[
            { k: 'customer_name', l: 'Cliente *', span: 2, ph: 'Nombre del cliente' },
            { k: 'customer_phone', l: 'Teléfono', ph: '+57...' },
            { k: 'device_type', l: 'Tipo de equipo *', ph: 'Celular, Laptop...' },
            { k: 'device_brand', l: 'Marca', ph: 'Samsung, Apple...' },
            { k: 'device_model', l: 'Modelo', ph: 'Galaxy A54...' },
            { k: 'device_serial', l: 'Serial / IMEI', ph: 'IMEI o serial' },
            { k: 'issued_at', l: 'Fecha emisión *', type: 'date', span: 1 },
            { k: 'expires_at', l: 'Fecha vencimiento *', type: 'date', span: 1 },
          ].map(({ k, l, span, ph, type }) => (
            <div key={k} className={`space-y-1 ${span === 2 ? 'col-span-2' : ''}`}>
              <Label>{l}</Label>
              <Input type={type ?? 'text'} placeholder={ph} value={(f as any)[k]} onChange={e => upd(k, e.target.value)} />
            </div>
          ))}
          <div className="col-span-2 space-y-1">
            <Label>Cobertura *</Label>
            <Textarea value={f.coverage_description} onChange={e => upd('coverage_description', e.target.value)} rows={2} placeholder="Describe qué cubre..." />
          </div>
          <div className="col-span-2 space-y-1">
            <Label>Exclusiones</Label>
            <Textarea value={f.exclusions} onChange={e => upd('exclusions', e.target.value)} rows={2} placeholder="Qué NO cubre..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !f.customer_name || !f.device_type || !f.coverage_description || !f.expires_at}>
            {mut.isPending ? 'Guardando...' : 'Crear garantía'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CONTRACTS TAB
// ══════════════════════════════════════════════════════════════════════════════

function ContractsTab({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);

  const listQ = useQuery({
    queryKey: ['service-contracts', slug, search],
    queryFn: () => workshopApi.serviceContracts({ search: search || undefined }),
  });
  const detailQ = useQuery({
    queryKey: ['service-contract-detail', detailId],
    queryFn: () => workshopApi.getServiceContract(detailId!),
    enabled: detailId !== null,
  });

  const contracts: any[] = (listQ.data as any)?.data?.data ?? [];
  const detail = (detailQ.data as any)?.data;

  const activateMut = useMutation({
    mutationFn: (id: number) => workshopApi.updateServiceContract(id, { status: 'active' }),
    onSuccess: () => { notify.success('Contrato activado.'); qc.invalidateQueries({ queryKey: ['service-contracts', slug] }); },
    onError: (e: any) => notify.error(e?.response?.data?.message ?? 'Error'),
  });

  const statusColors: Record<string, string> = {
    draft: 'bg-gray-100 text-gray-600',
    active: 'bg-green-100 text-green-700',
    expired: 'bg-red-100 text-red-600',
    cancelled: 'bg-gray-100 text-gray-400',
  };
  const statusLabels: Record<string, string> = {
    draft: 'Borrador', active: 'Activo', expired: 'Vencido', cancelled: 'Cancelado',
  };
  const typeLabels: Record<string, string> = {
    maintenance: 'Mantenimiento', warranty_ext: 'Garantía extendida', support: 'Soporte', other: 'Otro',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative max-w-xs flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input placeholder="Buscar por cliente o #contrato..." value={search}
            onChange={e => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="size-4 mr-1.5" />Nuevo contrato
        </Button>
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>#</TableHead>
              <TableHead>Cliente / Nombre</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Vigencia</TableHead>
              <TableHead>SLA</TableHead>
              <TableHead>Visitas</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {listQ.isLoading && Array.from({ length: 3 }).map((_, i) => (
              <TableRow key={i}><TableCell colSpan={8}><div className="h-4 bg-muted rounded animate-pulse" /></TableCell></TableRow>
            ))}
            {!listQ.isLoading && contracts.length === 0 && (
              <TableRow><TableCell colSpan={8} className="text-center py-10 text-muted-foreground">Sin contratos registrados</TableCell></TableRow>
            )}
            {contracts.map((c: any) => (
              <TableRow key={c.id} className="cursor-pointer hover:bg-muted/30" onClick={() => setDetailId(c.id)}>
                <TableCell className="font-mono text-xs">{c.contract_number}</TableCell>
                <TableCell>
                  <p className="font-medium text-sm">{c.customer_name}</p>
                  <p className="text-xs text-muted-foreground truncate max-w-40">{c.name}</p>
                </TableCell>
                <TableCell className="text-xs">{typeLabels[c.type] ?? c.type}</TableCell>
                <TableCell className="text-xs">{fmtDate(c.start_date)} — {fmtDate(c.end_date)}</TableCell>
                <TableCell className="text-xs">{c.sla_response_hours}h</TableCell>
                <TableCell className="text-xs">
                  {c.visits_included > 0 ? `${c.visits_used}/${c.visits_included}` : '—'}
                </TableCell>
                <TableCell>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[c.status] ?? ''}`}>
                    {statusLabels[c.status] ?? c.status}
                  </span>
                </TableCell>
                <TableCell onClick={e => e.stopPropagation()}>
                  {c.status === 'draft' && (
                    <Button size="sm" variant="outline" onClick={() => activateMut.mutate(c.id)}>Activar</Button>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Detail sheet */}
      {detailId && (
        <Sheet open onOpenChange={() => setDetailId(null)}>
          <SheetContent className="w-full sm:max-w-lg flex flex-col gap-0 p-0">
            <SheetHeader className="px-6 py-4 border-b">
              <SheetTitle className="flex items-center gap-2">
                <FileSignature className="size-4" />
                {detail?.contract?.contract_number ?? '...'}
              </SheetTitle>
            </SheetHeader>
            <div className="flex-1 overflow-y-auto p-6 space-y-4 text-sm">
              {detailQ.isLoading ? <p className="text-muted-foreground">Cargando...</p> : detail && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      ['Cliente', detail.contract.customer_name],
                      ['Teléfono', detail.contract.customer_phone || '—'],
                      ['Tipo', typeLabels[detail.contract.type] ?? detail.contract.type],
                      ['SLA respuesta', `${detail.contract.sla_response_hours}h`],
                      ['Vigencia', `${fmtDate(detail.contract.start_date)} — ${fmtDate(detail.contract.end_date)}`],
                      ['Visitas', detail.contract.visits_included > 0 ? `${detail.contract.visits_used}/${detail.contract.visits_included}` : 'Ilimitadas'],
                      ['Cargo mensual', detail.contract.monthly_fee > 0 ? fmt(detail.contract.monthly_fee) : '—'],
                      ['Valor total', detail.contract.total_value > 0 ? fmt(detail.contract.total_value) : '—'],
                    ].map(([k, v]) => (
                      <div key={k}><p className="text-xs text-muted-foreground">{k}</p><p className="font-medium">{v}</p></div>
                    ))}
                  </div>
                  {detail.items?.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold mb-2">Equipos cubiertos</p>
                      {detail.items.map((i: any) => (
                        <div key={i.id} className="flex items-center justify-between border rounded px-3 py-1.5 mb-1 text-xs">
                          <span>{i.description}{i.device_serial ? ` — ${i.device_serial}` : ''}</span>
                          <span className={i.is_covered ? 'text-green-600' : 'text-red-500'}>{i.is_covered ? 'Cubierto' : 'Excluido'}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </SheetContent>
        </Sheet>
      )}

      <CreateContractDialog open={createOpen} onClose={() => { setCreateOpen(false); qc.invalidateQueries({ queryKey: ['service-contracts', slug] }); }} />
    </div>
  );
}

function CreateContractDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const today = new Date().toISOString().split('T')[0];
  const [f, setF] = useState({ customer_name: '', customer_phone: '', customer_email: '', name: '', type: 'maintenance', start_date: today, end_date: '', sla_response_hours: '24', visits_included: '0', monthly_fee: '0', total_value: '0', billing_cycle: 'monthly', description: '' });
  const upd = (k: string, v: string) => setF(p => ({ ...p, [k]: v }));

  const mut = useMutation({
    mutationFn: () => workshopApi.createServiceContract({ ...f, sla_response_hours: parseInt(f.sla_response_hours), visits_included: parseInt(f.visits_included), monthly_fee: parseFloat(f.monthly_fee), total_value: parseFloat(f.total_value) }),
    onSuccess: () => { notify.success('Contrato creado.'); onClose(); },
    onError: (e: any) => notify.error(e?.response?.data?.message ?? 'Error'),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nuevo Contrato de Servicio</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {[
            { k: 'customer_name', l: 'Cliente *', span: 2 },
            { k: 'customer_phone', l: 'Teléfono' },
            { k: 'customer_email', l: 'Email', type: 'email' },
            { k: 'name', l: 'Nombre del contrato *', span: 2 },
          ].map(({ k, l, span, type }) => (
            <div key={k} className={`space-y-1 ${span === 2 ? 'col-span-2' : ''}`}>
              <Label>{l}</Label>
              <Input type={type ?? 'text'} value={(f as any)[k]} onChange={e => upd(k, e.target.value)} />
            </div>
          ))}
          <div className="space-y-1">
            <Label>Tipo</Label>
            <Select value={f.type} onValueChange={v => upd('type', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="maintenance">Mantenimiento</SelectItem>
                <SelectItem value="warranty_ext">Garantía extendida</SelectItem>
                <SelectItem value="support">Soporte técnico</SelectItem>
                <SelectItem value="other">Otro</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label>Ciclo de facturación</Label>
            <Select value={f.billing_cycle} onValueChange={v => upd('billing_cycle', v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="monthly">Mensual</SelectItem>
                <SelectItem value="quarterly">Trimestral</SelectItem>
                <SelectItem value="annual">Anual</SelectItem>
                <SelectItem value="one_time">Pago único</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {[
            { k: 'start_date', l: 'Inicio *', type: 'date' },
            { k: 'end_date', l: 'Fin *', type: 'date' },
            { k: 'sla_response_hours', l: 'SLA (horas)', type: 'number' },
            { k: 'visits_included', l: 'Visitas incluidas', type: 'number' },
            { k: 'monthly_fee', l: 'Cargo mensual (COP)', type: 'number' },
            { k: 'total_value', l: 'Valor total (COP)', type: 'number' },
          ].map(({ k, l, type }) => (
            <div key={k} className="space-y-1">
              <Label>{l}</Label>
              <Input type={type} value={(f as any)[k]} onChange={e => upd(k, e.target.value)} min={0} />
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !f.customer_name || !f.name || !f.end_date}>
            {mut.isPending ? 'Guardando...' : 'Crear contrato'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SPARE PARTS + LABOR RATES TAB
// ══════════════════════════════════════════════════════════════════════════════

function SparePartsTab({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [lowStock, setLowStock] = useState(false);
  const [rateDialog, setRateDialog] = useState(false);

  const spareQ = useQuery({
    queryKey: ['spare-parts', slug, search, lowStock],
    queryFn: () => workshopApi.spareParts({ search: search || undefined, low_stock: lowStock || undefined }),
  });
  const ratesQ = useQuery({
    queryKey: ['labor-rates', slug],
    queryFn: () => workshopApi.laborRates(),
  });

  const parts: any[] = (spareQ.data as any)?.data?.data ?? [];
  const rates: any[] = (ratesQ.data as any)?.data ?? [];

  return (
    <div className="space-y-6">
      {/* Spare parts */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Inventario de Repuestos</CardTitle>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-sm cursor-pointer">
                <input type="checkbox" checked={lowStock} onChange={e => setLowStock(e.target.checked)} className="size-3.5 accent-primary" />
                Solo bajo stock
              </label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />
                <Input placeholder="Buscar repuesto..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-sm w-48" />
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Repuesto</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Punto reposición</TableHead>
                <TableHead className="text-right">Costo</TableHead>
                <TableHead className="text-right">Precio</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {spareQ.isLoading && Array.from({ length: 4 }).map((_, i) => (
                <TableRow key={i}><TableCell colSpan={7}><div className="h-4 bg-muted rounded animate-pulse" /></TableCell></TableRow>
              ))}
              {!spareQ.isLoading && parts.length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                  {lowStock ? 'Ningún repuesto con bajo stock.' : 'No hay productos marcados como repuesto aún.'}
                </TableCell></TableRow>
              )}
              {parts.map((p: any) => {
                const isLow = p.reorder_point_spare != null && p.stock <= p.reorder_point_spare;
                return (
                  <TableRow key={p.id} className={isLow ? 'bg-amber-50/50 dark:bg-amber-950/10' : ''}>
                    <TableCell className="font-medium text-sm">
                      {isLow && <AlertCircle className="size-3.5 text-amber-500 inline mr-1.5" />}
                      {p.name}
                    </TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{p.sku ?? '—'}</TableCell>
                    <TableCell className={`text-right font-semibold ${isLow ? 'text-amber-600' : ''}`}>{p.stock}</TableCell>
                    <TableCell className="text-right text-muted-foreground">{p.reorder_point_spare ?? '—'}</TableCell>
                    <TableCell className="text-right text-sm">{fmt(p.cost ?? 0)}</TableCell>
                    <TableCell className="text-right text-sm">{fmt(p.price ?? 0)}</TableCell>
                    <TableCell />
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Labor rates */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base flex items-center gap-2">
              <DollarSign className="size-4" />Tarifas de Mano de Obra
            </CardTitle>
            <Button size="sm" onClick={() => setRateDialog(true)}>
              <Plus className="size-3.5 mr-1" />Nueva tarifa
            </Button>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          {rates.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4 text-center">Sin tarifas configuradas.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Nombre</TableHead>
                  <TableHead>Descripción</TableHead>
                  <TableHead className="text-right">Tarifa / hora</TableHead>
                  <TableHead className="text-right">Mínimo (h)</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rates.map((r: any) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium">{r.name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{r.description || '—'}</TableCell>
                    <TableCell className="text-right font-semibold">{fmt(r.rate_per_hour)}</TableCell>
                    <TableCell className="text-right">{r.minimum_hours}h</TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="icon" onClick={() => workshopApi.deleteLaborRate(r.id).then(() => qc.invalidateQueries({ queryKey: ['labor-rates', slug] }))}>
                        <Trash2 className="size-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <LaborRateDialog open={rateDialog} onClose={() => { setRateDialog(false); qc.invalidateQueries({ queryKey: ['labor-rates', slug] }); }} />
    </div>
  );
}

function LaborRateDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [name, setName] = useState('');
  const [rate, setRate] = useState('');
  const [minHours, setMinHours] = useState('1');
  const [desc, setDesc] = useState('');

  const mut = useMutation({
    mutationFn: () => workshopApi.createLaborRate({ name, rate_per_hour: parseFloat(rate), minimum_hours: parseFloat(minHours), description: desc || undefined }),
    onSuccess: () => { notify.success('Tarifa creada.'); onClose(); },
    onError: (e: any) => notify.error(e?.response?.data?.message ?? 'Error'),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Nueva Tarifa de Mano de Obra</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1"><Label>Nombre *</Label><Input value={name} onChange={e => setName(e.target.value)} placeholder="Técnico junior..." /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1"><Label>Tarifa / hora (COP) *</Label><Input type="number" min={0} value={rate} onChange={e => setRate(e.target.value)} /></div>
            <div className="space-y-1"><Label>Mínimo (horas)</Label><Input type="number" min={0.25} step={0.25} value={minHours} onChange={e => setMinHours(e.target.value)} /></div>
          </div>
          <div className="space-y-1"><Label>Descripción</Label><Input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Descripción opcional" /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !name || !rate}>
            {mut.isPending ? 'Guardando...' : 'Crear tarifa'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function WorkshopPage() {
  const params = useParams();
  const slug   = params.slug as string;

  const [tab, setTab]             = useState('dashboard');
  const [newOpen, setNewOpen]     = useState(false);
  const [detailId, setDetailId]   = useState<number | null>(null);

  return (
    <AddonGate moduleKey="workshop" slug={slug}>
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <Wrench className="size-5 text-muted-foreground" />
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Taller / Servicio técnico</h1>
            <p className="text-sm text-muted-foreground">Gestión de órdenes de trabajo y reparaciones.</p>
          </div>
        </div>
        <Button className="gap-2" onClick={() => setNewOpen(true)}>
          <Plus className="size-4" /> Nueva orden
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex flex-wrap gap-0.5 p-1 rounded-lg bg-muted w-fit">
        {([
          { key: 'dashboard', label: 'Dashboard' },
          { key: 'orders', label: 'Órdenes' },
          { key: 'warranties', icon: ShieldCheck, label: 'Garantías' },
          { key: 'contracts', icon: FileSignature, label: 'Contratos' },
          { key: 'spare-parts', icon: DollarSign, label: 'Repuestos y Tarifas' },
        ] as const).map(({ key, icon: Icon, label }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            {Icon && <Icon className="size-3.5" />}{label}
          </button>
        ))}
      </div>

      <div className="mt-2">
        {tab === 'dashboard' && <DashboardTab slug={slug} onOpenOrder={setDetailId} />}
        {tab === 'orders' && <OrdersTab slug={slug} onOpenOrder={setDetailId} />}
        {tab === 'warranties' && <WarrantiesTab slug={slug} />}
        {tab === 'contracts' && <ContractsTab slug={slug} />}
        {tab === 'spare-parts' && <SparePartsTab slug={slug} />}
      </div>

      {/* Dialogs */}
      <NewOrderDialog open={newOpen} onOpenChange={setNewOpen} slug={slug} />
      <DetailSheet orderId={detailId} slug={slug} onClose={() => setDetailId(null)} />
    </div>
    </AddonGate>
  );
}
