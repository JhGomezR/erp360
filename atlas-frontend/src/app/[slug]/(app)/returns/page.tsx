'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notify } from '@/lib/notify';
import { Plus, Eye, CheckCircle, X, RotateCcw } from 'lucide-react';

import { posApi } from '@/lib/api/tenant.api';

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

interface SaleReturnItem {
  id: number;
  product_id: number;
  product_name?: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

interface SaleReturn {
  id: number;
  sale_id: number;
  customer_name?: string;
  reason: string;
  notes?: string;
  status: 'pending' | 'processed' | 'cancelled';
  total: number;
  items: SaleReturnItem[];
  created_at: string;
  processed_at?: string;
}

interface SaleItem {
  id: number;
  product_id: number;
  product_name?: string;
  quantity: number;
  unit_price: number;
}

interface Sale {
  id: number;
  total: number;
  customer_name?: string;
  items: SaleItem[];
  created_at: string;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<SaleReturn['status'], string> = {
  pending:   'Pendiente',
  processed: 'Procesada',
  cancelled: 'Cancelada',
};

const REASON_OPTIONS = [
  { value: 'defective',         label: 'Producto defectuoso' },
  { value: 'wrong_product',     label: 'Producto incorrecto' },
  { value: 'customer_request',  label: 'Solicitud del cliente' },
  { value: 'billing_error',     label: 'Error de facturación' },
  { value: 'other',             label: 'Otro' },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return `$${value.toLocaleString('es-CO')}`;
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('es-CO');
}

function StatusBadge({ status }: { status: SaleReturn['status'] }) {
  const variants: Record<SaleReturn['status'], { variant: 'secondary' | 'default' | 'destructive'; className?: string }> = {
    pending:   { variant: 'secondary' },
    processed: { variant: 'default', className: 'text-green-600 border-green-600' },
    cancelled: { variant: 'destructive' },
  };
  const { variant, className } = variants[status];
  return (
    <Badge variant={variant} className={className}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}

// ─── Detail Dialog ─────────────────────────────────────────────────────────────

interface DetailDialogProps {
  ret: SaleReturn | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onProcess: (id: number) => void;
  onCancel: (id: number) => void;
  isProcessing: boolean;
  isCancelling: boolean;
}

function DetailDialog({ ret, open, onOpenChange, onProcess, onCancel, isProcessing, isCancelling }: DetailDialogProps) {
  if (!ret) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="size-4" />
            Devolución #{ret.id}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-muted-foreground text-xs">Venta original</p>
              <p className="font-medium">#{ret.sale_id}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Estado</p>
              <StatusBadge status={ret.status} />
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Cliente</p>
              <p className="font-medium">{ret.customer_name ?? 'Cliente general'}</p>
            </div>
            <div>
              <p className="text-muted-foreground text-xs">Fecha</p>
              <p className="font-medium">{formatDate(ret.created_at)}</p>
            </div>
            <div className="col-span-2">
              <p className="text-muted-foreground text-xs">Motivo</p>
              <p className="font-medium">{REASON_OPTIONS.find(r => r.value === ret.reason)?.label ?? ret.reason}</p>
            </div>
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
                <div key={item.id} className="flex items-center justify-between text-sm">
                  <div>
                    <p className="font-medium">{item.product_name ?? `Producto #${item.product_id}`}</p>
                    <p className="text-xs text-muted-foreground">
                      {item.quantity} × {formatCurrency(item.unit_price)}
                    </p>
                  </div>
                  <p className="font-medium">{formatCurrency(item.subtotal)}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between font-semibold text-sm border-t pt-3">
            <span>Total devolución</span>
            <span>{formatCurrency(ret.total)}</span>
          </div>
        </div>

        <DialogFooter className="gap-2">
          {ret.status === 'pending' && (
            <>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => onCancel(ret.id)}
                disabled={isCancelling || isProcessing}
              >
                <X className="mr-1 size-3" />
                {isCancelling ? 'Cancelando...' : 'Cancelar devolución'}
              </Button>
              <Button
                size="sm"
                onClick={() => onProcess(ret.id)}
                disabled={isProcessing || isCancelling}
              >
                <CheckCircle className="mr-1 size-3" />
                {isProcessing ? 'Procesando...' : 'Procesar devolución'}
              </Button>
            </>
          )}
          {ret.status !== 'pending' && (
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cerrar
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Create Dialog ─────────────────────────────────────────────────────────────

interface CreateDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreate: (data: unknown) => void;
  isCreating: boolean;
}

function CreateDialog({ open, onOpenChange, onCreate, isCreating }: CreateDialogProps) {
  const { slug } = useParams() as { slug: string };

  const [saleId, setSaleId]     = useState('');
  const [reason, setReason]     = useState('');
  const [notes, setNotes]       = useState('');
  const [items, setItems]       = useState<{ sale_item_id: number; quantity: number; product_name?: string; max_qty: number }[]>([]);
  const [saleLoaded, setSaleLoaded] = useState<Sale | null>(null);
  const [loadingId, setLoadingId]   = useState(false);

  async function loadSale() {
    const id = parseInt(saleId);
    if (!id) return;
    setLoadingId(true);
    try {
      const res = await posApi.getSale(id);
      const sale: Sale = (res as any)?.data ?? res;
      setSaleLoaded(sale);
      setItems(
        (sale.items ?? []).map((i) => ({
          sale_item_id: i.id,
          product_name: i.product_name,
          quantity: i.quantity,
          max_qty: i.quantity,
        }))
      );
    } catch {
      notify.error('No se encontró la venta');
      setSaleLoaded(null);
      setItems([]);
    } finally {
      setLoadingId(false);
    }
  }

  function updateQty(idx: number, val: number) {
    setItems((prev) =>
      prev.map((it, i) => i === idx ? { ...it, quantity: Math.min(Math.max(0, val), it.max_qty) } : it)
    );
  }

  function handleReset() {
    setSaleId('');
    setReason('');
    setNotes('');
    setItems([]);
    setSaleLoaded(null);
  }

  function handleSubmit() {
    if (!saleLoaded) { notify.error('Carga una venta primero'); return; }
    if (!reason)     { notify.error('Selecciona un motivo'); return; }
    const filtered = items.filter((it) => it.quantity > 0);
    if (filtered.length === 0) { notify.error('Indica al menos un ítem con cantidad > 0'); return; }

    onCreate({
      sale_id: saleLoaded.id,
      reason,
      notes: notes || undefined,
      items: filtered.map(({ sale_item_id, quantity }) => ({ sale_item_id, quantity })),
    });
    handleReset();
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleReset(); onOpenChange(v); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RotateCcw className="size-4" />
            Nueva devolución de venta
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {/* Sale lookup */}
          <div className="flex flex-col gap-1.5">
            <Label>ID de venta</Label>
            <div className="flex gap-2">
              <Input
                placeholder="Ej: 1023"
                value={saleId}
                onChange={(e) => setSaleId(e.target.value)}
                className="flex-1"
              />
              <Button variant="outline" onClick={loadSale} disabled={loadingId || !saleId}>
                {loadingId ? 'Cargando...' : 'Cargar'}
              </Button>
            </div>
          </div>

          {saleLoaded && (
            <>
              <div className="rounded-md bg-muted px-3 py-2 text-sm">
                <p className="font-medium">Venta #{saleLoaded.id}</p>
                <p className="text-muted-foreground text-xs">
                  {saleLoaded.customer_name ?? 'Cliente general'} · {formatDate(saleLoaded.created_at)} · {formatCurrency(saleLoaded.total)}
                </p>
              </div>

              {/* Items */}
              <div className="flex flex-col gap-2">
                <Label>Ítems a devolver</Label>
                {items.map((item, idx) => (
                  <div key={item.sale_item_id} className="flex items-center gap-3 text-sm">
                    <p className="flex-1 truncate">{item.product_name ?? `Ítem #${item.sale_item_id}`}</p>
                    <p className="text-xs text-muted-foreground shrink-0">máx: {item.max_qty}</p>
                    <Input
                      type="number"
                      min={0}
                      max={item.max_qty}
                      value={item.quantity}
                      onChange={(e) => updateQty(idx, parseFloat(e.target.value) || 0)}
                      className="w-20 h-8 text-sm"
                    />
                  </div>
                ))}
              </div>

              <Separator />

              {/* Reason */}
              <div className="flex flex-col gap-1.5">
                <Label>Motivo <span className="text-destructive">*</span></Label>
                <Select value={reason} onValueChange={setReason}>
                  <SelectTrigger>
                    <SelectValue placeholder="Seleccionar motivo..." />
                  </SelectTrigger>
                  <SelectContent>
                    {REASON_OPTIONS.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Notes */}
              <div className="flex flex-col gap-1.5">
                <Label>Notas (opcional)</Label>
                <Input
                  placeholder="Observaciones..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => { handleReset(); onOpenChange(false); }} disabled={isCreating}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={isCreating || !saleLoaded}>
            {isCreating ? 'Guardando...' : 'Registrar devolución'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function SaleReturnsPage() {
  const params = useParams();
  const slug = params.slug as string;
  const queryClient = useQueryClient();

  const [page, setPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);
  const [detailReturn, setDetailReturn] = useState<SaleReturn | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['sale-returns', slug, page],
    queryFn: () => posApi.returns({ page }),
  });

  const returns: SaleReturn[] = (data as any)?.data?.data ?? (data as any)?.data ?? [];
  const meta = (data as any)?.data?.meta ?? (data as any)?.meta ?? null;

  const createMutation = useMutation({
    mutationFn: (d: unknown) => posApi.createReturn(d),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sale-returns', slug] });
      notify.success('Devolución registrada');
      setCreateOpen(false);
    },
    onError: (err) => notify.error(err, 'Error al registrar la devolución'),
  });

  const processMutation = useMutation({
    mutationFn: (id: number) => posApi.processReturn(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sale-returns', slug] });
      notify.success('Devolución procesada — stock restituido y nota crédito generada');
      setDetailOpen(false);
    },
    onError: (err) => notify.error(err, 'Error al procesar la devolución'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => posApi.cancelReturn(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sale-returns', slug] });
      notify.success('Devolución cancelada');
      setDetailOpen(false);
    },
    onError: (err) => notify.error(err, 'Error al cancelar la devolución'),
  });

  function openDetail(ret: SaleReturn) {
    setDetailReturn(ret);
    setDetailOpen(true);
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Devoluciones de venta</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Gestiona devoluciones de clientes. Al procesar, se restituye el stock y se genera nota crédito.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)}>
          <Plus className="mr-2 h-4 w-4" />
          Nueva devolución
        </Button>
      </div>

      {/* List */}
      <div className="flex flex-col gap-3">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-2xl" />
          ))
        ) : returns.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 gap-3 text-muted-foreground">
            <div className="size-14 rounded-full bg-muted flex items-center justify-center">
              <RotateCcw className="size-7" />
            </div>
            <p className="font-medium">Sin devoluciones registradas</p>
            <p className="text-xs">Las devoluciones de clientes aparecerán aquí</p>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 size-4" />
              Nueva devolución
            </Button>
          </div>
        ) : (
          returns.map((ret) => {
            const statusColors: Record<SaleReturn['status'], string> = {
              pending:   'bg-amber-500',
              processed: 'bg-emerald-500',
              cancelled: 'bg-red-500',
            };
            return (
              <button
                key={ret.id}
                type="button"
                onClick={() => openDetail(ret)}
                className="w-full text-left rounded-2xl border bg-card hover:shadow-sm hover:border-primary/20 transition-all p-4 flex items-center gap-4"
              >
                {/* Status dot */}
                <div className={`size-2.5 rounded-full flex-shrink-0 ${statusColors[ret.status]}`} />

                {/* Main info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-semibold text-sm">Devolución #{ret.id}</span>
                    <span className="text-xs text-muted-foreground font-mono">· Venta #{ret.sale_id}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate">
                    {ret.customer_name ?? 'Cliente general'} · {REASON_OPTIONS.find((r) => r.value === ret.reason)?.label ?? ret.reason}
                  </p>
                </div>

                {/* Date */}
                <span className="text-xs text-muted-foreground flex-shrink-0 hidden sm:block">
                  {formatDate(ret.created_at)}
                </span>

                {/* Status + total */}
                <div className="flex flex-col items-end gap-1 flex-shrink-0">
                  <StatusBadge status={ret.status} />
                  <span className="text-sm font-bold tabular-nums">{formatCurrency(ret.total)}</span>
                </div>
              </button>
            );
          })
        )}
      </div>

      {/* Pagination */}
      {meta && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <p>
            Página {meta.current_page} de {meta.last_page} ({meta.total} registros)
          </p>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={page <= 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Anterior
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={page >= meta.last_page}
              onClick={() => setPage((p) => p + 1)}
            >
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
        ret={detailReturn}
        open={detailOpen}
        onOpenChange={setDetailOpen}
        onProcess={(id) => processMutation.mutate(id)}
        onCancel={(id) => cancelMutation.mutate(id)}
        isProcessing={processMutation.isPending}
        isCancelling={cancelMutation.isPending}
      />
    </div>
  );
}
