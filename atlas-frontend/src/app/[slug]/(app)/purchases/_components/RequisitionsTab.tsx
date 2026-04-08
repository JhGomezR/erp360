'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notify } from '@/lib/notify';
import { purchasesApi, suppliersApi, productsApi } from '@/lib/api/tenant.api';
import {
  Plus, Eye, CheckCircle, XCircle, Send, ShoppingCart, Trash2,
  ChevronDown, AlertTriangle, Clock, ArrowRight,
} from 'lucide-react';

import { Button }    from '@/components/ui/button';
import { Badge }     from '@/components/ui/badge';
import { Input }     from '@/components/ui/input';
import { Label }     from '@/components/ui/label';
import { Textarea }  from '@/components/ui/textarea';
import { Skeleton }  from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Card, CardContent, CardHeader, CardTitle,
} from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ReqItem {
  id?: number;
  product_id: number | null;
  product_name: string;
  product_sku: string;
  quantity: number;
  unit: string;
  estimated_unit_cost: number;
  estimated_subtotal: number;
  supplier_suggestion: string;
  notes: string;
}

interface Requisition {
  id: number;
  requisition_number: string;
  title: string;
  description: string | null;
  department: string | null;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  status: 'draft' | 'pending_approval' | 'approved' | 'rejected' | 'converted' | 'cancelled';
  needed_by: string | null;
  rejection_reason: string | null;
  notes: string | null;
  estimated_total: number;
  items_count?: number;
  items?: ReqItem[];
  created_at: string;
  purchase_order?: { id: number; order_number: string } | null;
}

interface Supplier {
  id: number;
  name: string;
}

interface Product {
  id: number;
  name: string;
  sku: string;
  cost_price: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<Requisition['status'], string> = {
  draft:            'Borrador',
  pending_approval: 'Pendiente',
  approved:         'Aprobada',
  rejected:         'Rechazada',
  converted:        'Convertida',
  cancelled:        'Cancelada',
};

const STATUS_VARIANTS: Record<Requisition['status'], 'secondary' | 'default' | 'destructive' | 'outline'> = {
  draft:            'secondary',
  pending_approval: 'default',
  approved:         'outline',
  rejected:         'destructive',
  converted:        'outline',
  cancelled:        'destructive',
};

const PRIORITY_LABELS = { low: 'Baja', normal: 'Normal', high: 'Alta', urgent: 'Urgente' };
const PRIORITY_COLORS = {
  low: 'text-muted-foreground',
  normal: 'text-blue-600',
  high: 'text-orange-500',
  urgent: 'text-red-600 font-semibold',
};

function fmt(v: number) { return `$${v.toLocaleString('es-CO')}`; }
function fmtDate(d: string) { return new Date(d).toLocaleDateString('es-CO'); }

// ─── Empty Item ───────────────────────────────────────────────────────────────

function emptyItem(): ReqItem {
  return {
    product_id: null,
    product_name: '',
    product_sku: '',
    quantity: 1,
    unit: 'unidad',
    estimated_unit_cost: 0,
    estimated_subtotal: 0,
    supplier_suggestion: '',
    notes: '',
  };
}

// ─── Convert to OC Dialog ─────────────────────────────────────────────────────

interface ConvertDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  req: Requisition | null;
  slug: string;
  onSuccess: () => void;
}

function ConvertDialog({ open, onOpenChange, req, slug, onSuccess }: ConvertDialogProps) {
  const qc = useQueryClient();
  const [supplierId, setSupplierId] = useState('');
  const [expectedDate, setExpectedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [itemCosts, setItemCosts] = useState<Record<number, number>>({});

  const suppliersQ = useQuery({
    queryKey: [slug, 'suppliers-list-mini'],
    queryFn:  () => suppliersApi.list({ page: 1 }),
    enabled:  open,
  });

  const convertMut = useMutation({
    mutationFn: (data: unknown) => purchasesApi.convertRequisition(req!.id, data),
    onSuccess: () => {
      notify.success('Requisición convertida en Orden de Compra.');
      qc.invalidateQueries({ queryKey: [slug, 'requisitions'] });
      onSuccess();
      onOpenChange(false);
    },
    onError: (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error al convertir'),
  });

  if (!req) return null;

  const items = req.items ?? [];
  const suppliers: Supplier[] = (suppliersQ.data as unknown as { data?: Supplier[] })?.data ?? [];

  function handleConvert() {
    if (!supplierId) { notify.error('Selecciona un proveedor'); return; }
    convertMut.mutate({
      supplier_id:   parseInt(supplierId),
      expected_date: expectedDate || undefined,
      notes:         notes || undefined,
      items: items.map((it, idx) => ({
        requisition_item_id: it.id ?? idx,
        product_id:          it.product_id ?? 0,
        quantity:            it.quantity,
        unit_cost:           itemCosts[idx] ?? it.estimated_unit_cost ?? 0,
      })),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShoppingCart className="size-4" />
            Convertir {req.requisition_number} en Orden de Compra
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label>Proveedor <span className="text-destructive">*</span></Label>
              <Select value={supplierId} onValueChange={(v) => setSupplierId(v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fecha esperada de entrega</Label>
              <Input type="date" value={expectedDate} onChange={(e) => setExpectedDate(e.target.value)} />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notas para la OC</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          <Separator />

          <div>
            <p className="text-sm font-medium mb-2">Ítems — ajusta costos reales</p>
            <div className="space-y-2">
              {items.map((it, idx) => (
                <div key={idx} className="flex items-center gap-3 rounded border p-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{it.product_name}</p>
                    <p className="text-xs text-muted-foreground">Cant: {it.quantity} {it.unit}</p>
                  </div>
                  <div className="w-36">
                    <Label className="text-xs text-muted-foreground">Costo unitario</Label>
                    <Input
                      type="number"
                      min={0}
                      className="h-8 text-sm"
                      value={itemCosts[idx] ?? it.estimated_unit_cost ?? 0}
                      onChange={(e) => setItemCosts((prev) => ({
                        ...prev, [idx]: parseFloat(e.target.value) || 0,
                      }))}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleConvert} disabled={convertMut.isPending}>
            <ArrowRight className="mr-2 size-4" />
            {convertMut.isPending ? 'Convirtiendo…' : 'Crear Orden de Compra'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Detail Dialog ────────────────────────────────────────────────────────────

interface DetailProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  reqId: number | null;
  slug: string;
  onRefresh: () => void;
}

function DetailDialog({ open, onOpenChange, reqId, slug, onRefresh }: DetailProps) {
  const qc = useQueryClient();
  const [rejectReason, setRejectReason] = useState('');
  const [rejectDialog, setRejectDialog] = useState(false);
  const [convertOpen, setConvertOpen] = useState(false);

  const detailQ = useQuery({
    queryKey: [slug, 'requisition-detail', reqId],
    queryFn:  () => purchasesApi.getRequisition(reqId!),
    enabled:  open && reqId !== null,
  });

  const req = detailQ.data as Requisition | undefined;

  function invalidate() {
    qc.invalidateQueries({ queryKey: [slug, 'requisitions'] });
    qc.invalidateQueries({ queryKey: [slug, 'requisition-detail', reqId] });
    onRefresh();
  }

  const submitMut   = useMutation({ mutationFn: () => purchasesApi.submitRequisition(reqId!),
    onSuccess: () => { notify.success('Enviada a aprobación.'); invalidate(); }, onError: (e: unknown) => notify.error((e as {message?:string}).message ?? 'Error') });
  const approveMut  = useMutation({ mutationFn: () => purchasesApi.approveRequisition(reqId!),
    onSuccess: () => { notify.success('Requisición aprobada.'); invalidate(); }, onError: (e: unknown) => notify.error((e as {message?:string}).message ?? 'Error') });
  const rejectMut   = useMutation({ mutationFn: () => purchasesApi.rejectRequisition(reqId!, { rejection_reason: rejectReason }),
    onSuccess: () => { notify.success('Requisición rechazada.'); setRejectDialog(false); setRejectReason(''); invalidate(); }, onError: (e: unknown) => notify.error((e as {message?:string}).message ?? 'Error') });
  const cancelMut   = useMutation({ mutationFn: () => purchasesApi.cancelRequisition(reqId!),
    onSuccess: () => { notify.success('Requisición cancelada.'); invalidate(); }, onError: (e: unknown) => notify.error((e as {message?:string}).message ?? 'Error') });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>
              {req ? `${req.requisition_number} — ${req.title}` : 'Cargando…'}
            </DialogTitle>
          </DialogHeader>

          {detailQ.isPending ? (
            <div className="space-y-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-3/4" /></div>
          ) : req ? (
            <div className="flex-1 overflow-y-auto space-y-4 pr-1">
              {/* Meta row */}
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant={STATUS_VARIANTS[req.status]}>{STATUS_LABELS[req.status]}</Badge>
                <span className={`text-sm ${PRIORITY_COLORS[req.priority]}`}>
                  Prioridad: {PRIORITY_LABELS[req.priority]}
                </span>
                {req.department && <span className="text-sm text-muted-foreground">Área: {req.department}</span>}
                {req.needed_by && <span className="text-sm text-muted-foreground">Requerido: {fmtDate(req.needed_by)}</span>}
                <span className="ml-auto font-semibold">{fmt(req.estimated_total)}</span>
              </div>

              {req.description && <p className="text-sm text-muted-foreground">{req.description}</p>}

              {req.rejection_reason && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3">
                  <AlertTriangle className="size-4 text-destructive mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-destructive">Motivo de rechazo</p>
                    <p className="text-sm">{req.rejection_reason}</p>
                  </div>
                </div>
              )}

              {req.purchase_order && (
                <div className="flex items-center gap-2 rounded-md border border-green-600/30 bg-green-50 dark:bg-green-950 p-3">
                  <ShoppingCart className="size-4 text-green-600 shrink-0" />
                  <p className="text-sm">Convertida en OC: <span className="font-medium">{req.purchase_order.order_number}</span></p>
                </div>
              )}

              {/* Items table */}
              <div>
                <p className="text-sm font-medium mb-2">Ítems solicitados</p>
                <div className="rounded-md border overflow-hidden">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Producto</TableHead>
                        <TableHead className="text-right">Cant.</TableHead>
                        <TableHead className="text-right">Costo est.</TableHead>
                        <TableHead className="text-right">Subtotal</TableHead>
                        <TableHead>Proveedor sugerido</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(req.items ?? []).map((it, idx) => (
                        <TableRow key={idx}>
                          <TableCell>
                            <p className="font-medium text-sm">{it.product_name}</p>
                            {it.product_sku && <p className="text-xs text-muted-foreground">{it.product_sku}</p>}
                          </TableCell>
                          <TableCell className="text-right">{it.quantity} {it.unit}</TableCell>
                          <TableCell className="text-right">{fmt(it.estimated_unit_cost ?? 0)}</TableCell>
                          <TableCell className="text-right">{fmt(it.estimated_subtotal ?? 0)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{it.supplier_suggestion || '—'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>

              {req.notes && (
                <div>
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Notas</p>
                  <p className="text-sm mt-1">{req.notes}</p>
                </div>
              )}
            </div>
          ) : null}

          <DialogFooter className="flex-wrap gap-2">
            {req?.status === 'draft' && (
              <Button size="sm" variant="outline" onClick={() => submitMut.mutate()} disabled={submitMut.isPending}>
                <Send className="mr-2 size-4" />
                {submitMut.isPending ? 'Enviando…' : 'Enviar a Aprobación'}
              </Button>
            )}
            {req?.status === 'pending_approval' && (
              <>
                <Button size="sm" onClick={() => approveMut.mutate()} disabled={approveMut.isPending}
                  className="bg-green-600 hover:bg-green-700">
                  <CheckCircle className="mr-2 size-4" />
                  {approveMut.isPending ? 'Aprobando…' : 'Aprobar'}
                </Button>
                <Button size="sm" variant="destructive" onClick={() => setRejectDialog(true)}>
                  <XCircle className="mr-2 size-4" />
                  Rechazar
                </Button>
              </>
            )}
            {req?.status === 'approved' && (
              <Button size="sm" onClick={() => setConvertOpen(true)}>
                <ShoppingCart className="mr-2 size-4" />
                Convertir en OC
              </Button>
            )}
            {req && !['converted', 'cancelled'].includes(req.status) && (
              <Button size="sm" variant="ghost" onClick={() => cancelMut.mutate()} disabled={cancelMut.isPending}>
                Cancelar requisición
              </Button>
            )}
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject reason dialog */}
      <Dialog open={rejectDialog} onOpenChange={setRejectDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Rechazar Requisición</DialogTitle></DialogHeader>
          <div className="space-y-2">
            <Label>Motivo del rechazo <span className="text-destructive">*</span></Label>
            <Textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Explica por qué se rechaza la requisición…"
              rows={3}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejectDialog(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => rejectMut.mutate()} disabled={rejectMut.isPending || !rejectReason.trim()}>
              {rejectMut.isPending ? 'Rechazando…' : 'Rechazar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Convert dialog */}
      <ConvertDialog
        open={convertOpen}
        onOpenChange={setConvertOpen}
        req={req ?? null}
        slug={slug}
        onSuccess={() => { onOpenChange(false); onRefresh(); }}
      />
    </>
  );
}

// ─── Create Dialog ────────────────────────────────────────────────────────────

interface CreateProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  slug: string;
}

function CreateDialog({ open, onOpenChange, slug }: CreateProps) {
  const qc = useQueryClient();
  const [title, setTitle]         = useState('');
  const [description, setDesc]    = useState('');
  const [department, setDept]     = useState('');
  const [priority, setPriority]   = useState('normal');
  const [neededBy, setNeededBy]   = useState('');
  const [notes, setNotes]         = useState('');
  const [items, setItems]         = useState<ReqItem[]>([emptyItem()]);
  const [productSearch, setPSearch] = useState('');

  const productsQ = useQuery({
    queryKey: [slug, 'products-mini', productSearch],
    queryFn:  () => productsApi.list({ search: productSearch, per_page: 30 }),
    enabled:  open,
  });

  const createMut = useMutation({
    mutationFn: (data: unknown) => purchasesApi.createRequisition(data),
    onSuccess: () => {
      notify.success('Requisición creada.');
      qc.invalidateQueries({ queryKey: [slug, 'requisitions'] });
      onOpenChange(false);
      resetForm();
    },
    onError: (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error al crear'),
  });

  function resetForm() {
    setTitle(''); setDesc(''); setDept(''); setPriority('normal');
    setNeededBy(''); setNotes('');
    setItems([emptyItem()]);
  }

  function updateItem(idx: number, field: keyof ReqItem, value: string | number | null) {
    setItems((prev) => {
      const updated = [...prev];
      const item = { ...updated[idx], [field]: value };
      if (field === 'quantity' || field === 'estimated_unit_cost') {
        item.estimated_subtotal = (item.quantity || 0) * (item.estimated_unit_cost || 0);
      }
      updated[idx] = item;
      return updated;
    });
  }

  function pickProduct(idx: number, product: Product) {
    setItems((prev) => {
      const updated = [...prev];
      updated[idx] = {
        ...updated[idx],
        product_id:          product.id,
        product_name:        product.name,
        product_sku:         product.sku,
        estimated_unit_cost: product.cost_price ?? 0,
        estimated_subtotal:  (updated[idx].quantity || 1) * (product.cost_price ?? 0),
      };
      return updated;
    });
    setPSearch('');
  }

  const products: Product[] = (productsQ.data as unknown as { data?: Product[] })?.data ?? [];
  const estimatedTotal = items.reduce((s, it) => s + (it.estimated_subtotal || 0), 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="size-4" />
            Nueva Requisición de Compra
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* Header fields */}
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2 space-y-1.5">
              <Label>Título <span className="text-destructive">*</span></Label>
              <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: Materiales de oficina Q2" />
            </div>
            <div className="space-y-1.5">
              <Label>Departamento / Área</Label>
              <Input value={department} onChange={(e) => setDept(e.target.value)} placeholder="Ej: Producción" />
            </div>
            <div className="space-y-1.5">
              <Label>Prioridad</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v ?? 'normal')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baja</SelectItem>
                  <SelectItem value="normal">Normal</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="urgent">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fecha requerida</Label>
              <Input type="date" value={neededBy} onChange={(e) => setNeededBy(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Descripción</Label>
              <Input value={description} onChange={(e) => setDesc(e.target.value)} />
            </div>
          </div>

          <Separator />

          {/* Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium">Ítems solicitados</p>
              <Button size="sm" variant="outline" onClick={() => setItems((p) => [...p, emptyItem()])}>
                <Plus className="size-3 mr-1" /> Añadir ítem
              </Button>
            </div>

            <div className="mb-2">
              <Input
                placeholder="Buscar producto del catálogo…"
                value={productSearch}
                onChange={(e) => setPSearch(e.target.value)}
                className="h-8 text-sm"
              />
              {productSearch && products.length > 0 && (
                <div className="mt-1 max-h-40 overflow-y-auto rounded border bg-background shadow-md z-10">
                  {products.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                      onClick={() => { pickProduct(items.length - 1, p); }}
                    >
                      <span className="font-medium">{p.name}</span>
                      <span className="ml-2 text-muted-foreground text-xs">{p.sku}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-3">
              {items.map((it, idx) => (
                <div key={idx} className="rounded-lg border p-3 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 space-y-1.5">
                      <Label className="text-xs">Nombre del producto <span className="text-destructive">*</span></Label>
                      <Input
                        value={it.product_name}
                        onChange={(e) => updateItem(idx, 'product_name', e.target.value)}
                        placeholder="Nombre del ítem"
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="w-28 space-y-1.5">
                      <Label className="text-xs">SKU</Label>
                      <Input
                        value={it.product_sku}
                        onChange={(e) => updateItem(idx, 'product_sku', e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                    {items.length > 1 && (
                      <button
                        type="button"
                        className="mt-5 text-destructive hover:text-destructive/80"
                        onClick={() => setItems((p) => p.filter((_, i) => i !== idx))}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Cantidad</Label>
                      <Input
                        type="number" min={0.001} step="any"
                        value={it.quantity}
                        onChange={(e) => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Unidad</Label>
                      <Input
                        value={it.unit}
                        onChange={(e) => updateItem(idx, 'unit', e.target.value)}
                        className="h-8 text-sm"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Costo estimado</Label>
                      <Input
                        type="number" min={0} step="any"
                        value={it.estimated_unit_cost}
                        onChange={(e) => updateItem(idx, 'estimated_unit_cost', parseFloat(e.target.value) || 0)}
                        className="h-8 text-sm"
                      />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Proveedor sugerido</Label>
                    <Input
                      value={it.supplier_suggestion}
                      onChange={(e) => updateItem(idx, 'supplier_suggestion', e.target.value)}
                      placeholder="Opcional"
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end mt-3 pt-2 border-t">
              <p className="text-sm font-semibold">Total estimado: {fmt(estimatedTotal)}</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Observaciones adicionales…" />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { onOpenChange(false); resetForm(); }}>Cancelar</Button>
          <Button
            onClick={() => createMut.mutate({
              title, description: description || undefined,
              department: department || undefined,
              priority, needed_by: neededBy || undefined,
              notes: notes || undefined, items,
            })}
            disabled={createMut.isPending || !title.trim() || items.some((it) => !it.product_name)}
          >
            {createMut.isPending ? 'Guardando…' : 'Crear Requisición'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Tab ─────────────────────────────────────────────────────────────────

export function RequisitionsTab({ slug }: { slug: string }) {
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const reqsQ = useQuery({
    queryKey: [slug, 'requisitions', statusFilter, priorityFilter, search],
    queryFn:  () => purchasesApi.requisitions({
      status:   statusFilter !== 'all' ? statusFilter : undefined,
      priority: priorityFilter !== 'all' ? priorityFilter : undefined,
      search:   search || undefined,
    }),
  });

  const reqs: Requisition[] = (reqsQ.data as { data?: Requisition[] })?.data ?? [];

  const deleteMut = useMutation({
    mutationFn: (id: number) => purchasesApi.deleteRequisition(id),
    onSuccess: () => { notify.success('Eliminada.'); qc.invalidateQueries({ queryKey: [slug, 'requisitions'] }); },
    onError: (e: unknown) => notify.error((e as { message?: string }).message ?? 'Error'),
  });

  function openDetail(id: number) { setDetailId(id); setDetailOpen(true); }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          placeholder="Buscar por título o número…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="sm:w-72"
        />
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v ?? 'all')}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            <SelectItem value="draft">Borrador</SelectItem>
            <SelectItem value="pending_approval">Pendiente</SelectItem>
            <SelectItem value="approved">Aprobadas</SelectItem>
            <SelectItem value="rejected">Rechazadas</SelectItem>
            <SelectItem value="converted">Convertidas</SelectItem>
            <SelectItem value="cancelled">Canceladas</SelectItem>
          </SelectContent>
        </Select>
        <Select value={priorityFilter} onValueChange={(v) => setPriorityFilter(v ?? 'all')}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas prioridades</SelectItem>
            <SelectItem value="urgent">Urgente</SelectItem>
            <SelectItem value="high">Alta</SelectItem>
            <SelectItem value="normal">Normal</SelectItem>
            <SelectItem value="low">Baja</SelectItem>
          </SelectContent>
        </Select>
        <Button className="ml-auto" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 size-4" />
          Nueva Requisición
        </Button>
      </div>

      {/* Stats */}
      {reqsQ.isSuccess && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {([
            { label: 'Pendientes',  val: reqs.filter((r) => r.status === 'pending_approval').length, color: 'text-orange-500' },
            { label: 'Aprobadas',   val: reqs.filter((r) => r.status === 'approved').length, color: 'text-green-600' },
            { label: 'Convertidas', val: reqs.filter((r) => r.status === 'converted').length, color: 'text-blue-600' },
            { label: 'Total',       val: reqs.length, color: '' },
          ] as { label: string; val: number; color: string }[]).map((s) => (
            <Card key={s.label} className="p-0">
              <CardContent className="pt-4 pb-3 px-4">
                <p className={`text-2xl font-bold ${s.color}`}>{s.val}</p>
                <p className="text-xs text-muted-foreground">{s.label}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {reqsQ.isPending ? (
            <div className="p-4 space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : reqs.length === 0 ? (
            <div className="py-16 text-center text-muted-foreground">
              <Clock className="mx-auto size-10 mb-3 opacity-30" />
              <p>No hay requisiciones</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>N°</TableHead>
                  <TableHead>Título</TableHead>
                  <TableHead>Prioridad</TableHead>
                  <TableHead>Estado</TableHead>
                  <TableHead className="text-right">Est. Total</TableHead>
                  <TableHead>Requerido</TableHead>
                  <TableHead>Creada</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {reqs.map((req) => (
                  <TableRow key={req.id} className="cursor-pointer hover:bg-muted/40" onClick={() => openDetail(req.id)}>
                    <TableCell className="font-mono text-xs">{req.requisition_number}</TableCell>
                    <TableCell>
                      <p className="font-medium text-sm">{req.title}</p>
                      {req.department && <p className="text-xs text-muted-foreground">{req.department}</p>}
                    </TableCell>
                    <TableCell>
                      <span className={`text-sm ${PRIORITY_COLORS[req.priority]}`}>
                        {PRIORITY_LABELS[req.priority]}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant={STATUS_VARIANTS[req.status]}>{STATUS_LABELS[req.status]}</Badge>
                    </TableCell>
                    <TableCell className="text-right font-medium">{fmt(req.estimated_total)}</TableCell>
                    <TableCell className="text-sm">{req.needed_by ? fmtDate(req.needed_by) : '—'}</TableCell>
                    <TableCell className="text-sm text-muted-foreground">{fmtDate(req.created_at)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1">
                        <Button size="icon" variant="ghost" className="size-7" onClick={() => openDetail(req.id)}>
                          <Eye className="size-3.5" />
                        </Button>
                        {req.status === 'draft' && (
                          <Button
                            size="icon" variant="ghost" className="size-7 text-destructive"
                            onClick={() => { if (confirm('¿Eliminar?')) deleteMut.mutate(req.id); }}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <CreateDialog open={createOpen} onOpenChange={setCreateOpen} slug={slug} />
      <DetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        reqId={detailId}
        slug={slug}
        onRefresh={() => qc.invalidateQueries({ queryKey: [slug, 'requisitions'] })}
      />
    </div>
  );
}
