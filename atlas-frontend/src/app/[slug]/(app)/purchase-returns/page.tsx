'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notify } from '@/lib/notify';
import { Plus, Eye, Send, CheckCircle, X, RotateCcw } from 'lucide-react';

import { purchasesApi, suppliersApi } from '@/lib/api/tenant.api';
import type { Supplier } from '@/types';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

// ─── Interfaces ────────────────────────────────────────────────────────────────

interface PurchaseReturnItem {
  id: number;
  product_id?: number;
  product_name: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  lot_number?: string;
  defect_description?: string;
}

interface PurchaseReturn {
  id: number;
  return_number?: string;
  supplier_id: number;
  supplier?: { id: number; name: string };
  purchase_order_id?: number;
  reason?: string;
  notes?: string;
  status: 'draft' | 'sent' | 'confirmed' | 'cancelled';
  subtotal: number;
  tax: number;
  total: number;
  items: PurchaseReturnItem[];
  created_at: string;
  sent_at?: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<PurchaseReturn['status'], string> = {
  draft:     'Borrador',
  sent:      'Enviada',
  confirmed: 'Confirmada',
  cancelled: 'Cancelada',
};

const STATUS_NEXT: Partial<Record<PurchaseReturn['status'], string>> = {
  draft: 'sent',
  sent:  'confirmed',
};

const STATUS_NEXT_LABEL: Partial<Record<PurchaseReturn['status'], string>> = {
  draft: 'Enviar al proveedor',
  sent:  'Confirmar',
};

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return `$${value.toLocaleString('es-CO')}`;
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('es-CO');
}

function StatusBadge({ status }: { status: PurchaseReturn['status'] }) {
  const map: Record<PurchaseReturn['status'], { variant: 'secondary' | 'default' | 'destructive'; className?: string }> = {
    draft:     { variant: 'secondary' },
    sent:      { variant: 'default' },
    confirmed: { variant: 'default', className: 'text-green-600 border-green-600' },
    cancelled: { variant: 'destructive' },
  };
  const { variant, className } = map[status];
  return <Badge variant={variant} className={className}>{STATUS_LABELS[status]}</Badge>;
}

// ─── Detail Dialog ─────────────────────────────────────────────────────────────

interface DetailDialogProps {
  ret: PurchaseReturn | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onStatusChange: (id: number, status: string) => void;
  isUpdating: boolean;
}

function DetailDialog({ ret, open, onOpenChange, onStatusChange, isUpdating }: DetailDialogProps) {
  if (!ret) return null;

  const nextStatus  = STATUS_NEXT[ret.status];
  const nextLabel   = STATUS_NEXT_LABEL[ret.status];
  const canCancel   = ret.status === 'draft';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="size-4" />
            Devolución {ret.return_number ?? `#${ret.id}`}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Estado</p>
              <StatusBadge status={ret.status} />
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Fecha</p>
              <p className="font-medium">{formatDate(ret.created_at)}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Proveedor</p>
              <p className="font-medium">{ret.supplier?.name ?? `#${ret.supplier_id}`}</p>
            </div>
            {ret.purchase_order_id && (
              <div>
                <p className="text-muted-foreground text-xs">Orden de compra</p>
                <p className="font-medium">#{ret.purchase_order_id}</p>
              </div>
            )}
            {ret.reason && (
              <div className="col-span-2">
                <p className="text-muted-foreground text-xs">Motivo</p>
                <p className="text-sm">{ret.reason}</p>
              </div>
            )}
            {ret.notes && (
              <div className="col-span-2">
                <p className="text-muted-foreground text-xs">Notas</p>
                <p className="text-sm">{ret.notes}</p>
              </div>
            )}
          </div>

          <Separator />

          <div>
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Ítems</p>
            <div className="space-y-2">
              {ret.items?.map((item) => (
                <div key={item.id} className="flex items-start justify-between text-sm">
                  <div>
                    <p className="font-medium">{item.product_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.quantity} × {formatCurrency(item.unit_price)}
                      {item.lot_number && ` · Lote: ${item.lot_number}`}
                    </p>
                    {item.defect_description && (
                      <p className="text-xs text-muted-foreground italic">{item.defect_description}</p>
                    )}
                  </div>
                  <p className="font-medium shrink-0">{formatCurrency(item.subtotal)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between font-semibold text-sm border-t pt-3">
            <span>Total</span>
            <span>{formatCurrency(ret.total)}</span>
          </div>
        </div>

        <DialogFooter className="gap-2">
          {canCancel && (
            <Button
              variant="destructive"
              size="sm"
              onClick={() => onStatusChange(ret.id, 'cancelled')}
              disabled={isUpdating}
            >
              <X className="mr-1 size-3" />
              Cancelar
            </Button>
          )}
          {nextStatus && nextLabel && (
            <Button
              size="sm"
              onClick={() => onStatusChange(ret.id, nextStatus)}
              disabled={isUpdating}
            >
              {nextStatus === 'sent' ? <Send className="mr-1 size-3" /> : <CheckCircle className="mr-1 size-3" />}
              {isUpdating ? 'Procesando...' : nextLabel}
            </Button>
          )}
          {!nextStatus && !canCancel && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cerrar</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create Dialog ─────────────────────────────────────────────────────────────

interface ReturnItemForm {
  product_name: string;
  product_id?: number;
  quantity: number;
  unit_price: number;
  lot_number: string;
  defect_description: string;
}

interface CreateDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (data: unknown) => void;
  isCreating: boolean;
}

function CreateDialog({ open, onOpenChange, onCreate, isCreating }: CreateDialogProps) {
  const { slug } = useParams() as { slug: string };

  const [supplierId, setSupplierId]         = useState('');
  const [purchaseOrderId, setPurchaseOrderId] = useState('');
  const [reason, setReason]                 = useState('');
  const [notes, setNotes]                   = useState('');
  const [items, setItems]                   = useState<ReturnItemForm[]>([
    { product_name: '', quantity: 1, unit_price: 0, lot_number: '', defect_description: '' },
  ]);

  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers', slug, 'all'],
    queryFn: () => suppliersApi.list({ page: 1 }),
    enabled: open,
  });
  const suppliers: Supplier[] = (suppliersData as any)?.data?.data ?? [];

  function addItem() {
    setItems((prev) => [
      ...prev,
      { product_name: '', quantity: 1, unit_price: 0, lot_number: '', defect_description: '' },
    ]);
  }

  function removeItem(idx: number) {
    setItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function updateItem(idx: number, field: keyof ReturnItemForm, value: string | number) {
    setItems((prev) => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  }

  const total = items.reduce((sum, it) => sum + it.quantity * it.unit_price, 0);

  function handleReset() {
    setSupplierId('');
    setPurchaseOrderId('');
    setReason('');
    setNotes('');
    setItems([{ product_name: '', quantity: 1, unit_price: 0, lot_number: '', defect_description: '' }]);
  }

  function handleSubmit() {
    if (!supplierId)            { notify.error('Selecciona un proveedor'); return; }
    if (items.some((it) => !it.product_name.trim())) { notify.error('El nombre del producto es requerido en todos los ítems'); return; }

    onCreate({
      supplier_id:       parseInt(supplierId),
      purchase_order_id: purchaseOrderId ? parseInt(purchaseOrderId) : undefined,
      reason:            reason || undefined,
      notes:             notes || undefined,
      items: items.map((it) => ({
        product_name:       it.product_name.trim(),
        quantity:           it.quantity,
        unit_price:         it.unit_price,
        lot_number:         it.lot_number || undefined,
        defect_description: it.defect_description || undefined,
      })),
    });
    handleReset();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleReset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="size-4" />
            Nueva devolución a proveedor
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-5 pr-1">
          {/* Proveedor */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <Label>Proveedor <span className="text-destructive">*</span></Label>
              <Select value={supplierId} onValueChange={setSupplierId}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar..." />
                </SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>ID orden de compra (opcional)</Label>
              <Input
                placeholder="Ej: 42"
                value={purchaseOrderId}
                onChange={(e) => setPurchaseOrderId(e.target.value)}
                type="number"
              />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label>Motivo (opcional)</Label>
            <Input
              placeholder="Describe el motivo de la devolución..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <Separator />

          {/* Items */}
          <div className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Label>Ítems a devolver</Label>
              <Button size="sm" variant="outline" type="button" onClick={addItem}>
                <Plus className="size-3 mr-1" />
                Agregar ítem
              </Button>
            </div>

            {items.map((item, idx) => (
              <div key={idx} className="rounded-lg border p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-muted-foreground">Ítem {idx + 1}</p>
                  {items.length > 1 && (
                    <Button size="sm" variant="ghost" onClick={() => removeItem(idx)} className="size-7 p-0">
                      <X className="size-3" />
                    </Button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2 flex flex-col gap-1.5">
                    <Label className="text-xs">
                      Producto <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      placeholder="Nombre del producto"
                      value={item.product_name}
                      onChange={(e) => updateItem(idx, 'product_name', e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Cantidad</Label>
                    <Input
                      type="number"
                      min={0.01}
                      step={0.01}
                      value={item.quantity}
                      onChange={(e) => updateItem(idx, 'quantity', parseFloat(e.target.value) || 0)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Precio unitario</Label>
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={item.unit_price}
                      onChange={(e) => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Número de lote</Label>
                    <Input
                      placeholder="Opcional"
                      value={item.lot_number}
                      onChange={(e) => updateItem(idx, 'lot_number', e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label className="text-xs">Descripción del defecto</Label>
                    <Input
                      placeholder="Opcional"
                      value={item.defect_description}
                      onChange={(e) => updateItem(idx, 'defect_description', e.target.value)}
                      className="h-8 text-sm"
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end text-sm font-semibold">
            Total estimado: {formatCurrency(total)}
          </div>

          <Separator />

          <div className="flex flex-col gap-1.5">
            <Label>Notas internas (opcional)</Label>
            <Input
              placeholder="Observaciones adicionales..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { handleReset(); onOpenChange(false); }} disabled={isCreating}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isCreating}>
            {isCreating ? 'Guardando...' : 'Crear devolución'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function PurchaseReturnsPage() {
  const params = useParams();
  const slug = params.slug as string;
  const queryClient = useQueryClient();

  const [page, setPage]           = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');
  const [createOpen, setCreateOpen]     = useState(false);
  const [detailRet, setDetailRet]       = useState<PurchaseReturn | null>(null);
  const [detailOpen, setDetailOpen]     = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['purchase-returns', slug, page, statusFilter],
    queryFn: () => purchasesApi.returns(statusFilter !== 'all' ? { page, status: statusFilter } as any : { page }),
  });

  const returns: PurchaseReturn[] = (data as any)?.data?.data ?? (data as any)?.data ?? [];
  const meta = (data as any)?.data?.meta ?? (data as any)?.meta ?? null;

  const createMutation = useMutation({
    mutationFn: (d: unknown) => purchasesApi.createReturn(d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-returns', slug] });
      notify.success('Devolución creada');
      setCreateOpen(false);
    },
    onError: (err) => notify.error(err, 'Error al crear la devolución'),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      purchasesApi.updateReturnStatus(id, status),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ['purchase-returns', slug] });
      const label = vars.status === 'sent' ? 'enviada al proveedor' : vars.status === 'confirmed' ? 'confirmada' : 'cancelada';
      notify.success(`Devolución ${label}`);
      setDetailOpen(false);
    },
    onError: (err) => notify.error(err, 'Error al actualizar el estado'),
  });

  const STATUS_FILTERS = [
    { value: 'all',       label: 'Todos' },
    { value: 'draft',     label: 'Borrador' },
    { value: 'sent',      label: 'Enviada' },
    { value: 'confirmed', label: 'Confirmada' },
    { value: 'cancelled', label: 'Cancelada' },
  ];

  function openDetail(ret: PurchaseReturn) {
    setDetailRet(ret);
    setDetailOpen(true);
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Devoluciones a proveedor</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Gestiona devoluciones de mercancía a proveedores. El stock se descuenta al enviar.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva devolución
        </Button>
      </div>

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors border ${
              statusFilter === f.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border hover:bg-muted'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-md border overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50 text-muted-foreground">
              <th className="px-4 py-3 text-left font-medium">#</th>
              <th className="px-4 py-3 text-left font-medium">Número</th>
              <th className="px-4 py-3 text-left font-medium">Proveedor</th>
              <th className="px-4 py-3 text-left font-medium">Fecha</th>
              <th className="px-4 py-3 text-left font-medium">Estado</th>
              <th className="px-4 py-3 text-right font-medium">Total</th>
              <th className="px-4 py-3 text-center font-medium">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b">
                  {Array.from({ length: 7 }).map((__, j) => (
                    <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                  ))}
                </tr>
              ))
            ) : returns.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-muted-foreground">
                  No hay devoluciones registradas
                </td>
              </tr>
            ) : (
              returns.map((ret) => (
                <tr key={ret.id} className="border-b hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3 font-mono text-muted-foreground">#{ret.id}</td>
                  <td className="px-4 py-3 font-mono text-sm">{ret.return_number ?? '—'}</td>
                  <td className="px-4 py-3 font-medium">{ret.supplier?.name ?? `Proveedor #${ret.supplier_id}`}</td>
                  <td className="px-4 py-3 text-muted-foreground">{formatDate(ret.created_at)}</td>
                  <td className="px-4 py-3"><StatusBadge status={ret.status} /></td>
                  <td className="px-4 py-3 text-right font-medium">{formatCurrency(ret.total)}</td>
                  <td className="px-4 py-3 text-center">
                    <Button size="sm" variant="ghost" onClick={() => openDetail(ret)}>
                      <Eye className="size-4" />
                      <span className="sr-only">Ver detalle</span>
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {meta && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <p>
            Página {meta.current_page} de {meta.last_page} ({meta.total} registros)
          </p>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </Button>
            <Button size="sm" variant="outline" disabled={page >= meta.last_page} onClick={() => setPage((p) => p + 1)}>
              Siguiente
            </Button>
          </div>
        </div>
      )}

      {/* Dialogs */}
      <CreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreate={(d) => createMutation.mutate(d)}
        isCreating={createMutation.isPending}
      />

      <DetailDialog
        ret={detailRet}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onStatusChange={(id, status) => statusMutation.mutate({ id, status })}
        isUpdating={statusMutation.isPending}
      />
    </div>
  );
}
