'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notify } from '@/lib/notify';
import { Plus, Eye, Send, PackageCheck, X, Calendar, FlaskConical, RotateCcw } from 'lucide-react';

import { purchasesApi, productsApi, suppliersApi } from '@/lib/api/tenant.api';
import type { Supplier } from '@/types';
import { RequisitionsTab } from './_components/RequisitionsTab';
import { RfqTab } from './_components/RfqTab';
import { VendorInvoiceTab } from './_components/VendorInvoiceTab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

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

interface PurchaseOrderItem {
  product_id: number;
  product_name?: string;
  quantity: number;
  unit_cost: number;
  subtotal?: number;
}

interface PurchaseOrder {
  id: number;
  supplier_name: string;
  supplier_document?: string;
  notes?: string;
  status: 'draft' | 'sent' | 'partial' | 'received' | 'cancelled';
  total: number;
  items: PurchaseOrderItem[];
  created_at: string;
}

interface Product {
  id: number;
  name: string;
  sku: string;
  price: number;
  cost: number;
}

// ─── Constants ─────────────────────────────────────────────────────────────────

const STATUS_LABELS: Record<PurchaseOrder['status'], string> = {
  draft: 'Borrador',
  sent: 'Enviada',
  partial: 'Parcial',
  received: 'Recibida',
  cancelled: 'Cancelada',
};

const STATUS_FILTERS = [
  { value: 'all', label: 'Todos' },
  { value: 'draft', label: 'Borrador' },
  { value: 'sent', label: 'Enviada' },
  { value: 'received', label: 'Recibida' },
  { value: 'cancelled', label: 'Cancelada' },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(value: number): string {
  return `$${value.toLocaleString('es-CO')}`;
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('es-CO');
}

function StatusBadge({ status }: { status: PurchaseOrder['status'] }) {
  if (status === 'received') {
    return (
      <Badge variant="outline" className="text-green-600 border-green-600">
        {STATUS_LABELS[status]}
      </Badge>
    );
  }
  const variant: Record<PurchaseOrder['status'], 'secondary' | 'default' | 'destructive'> = {
    draft: 'secondary',
    sent: 'default',
    partial: 'secondary',
    received: 'secondary',
    cancelled: 'destructive',
  };
  return <Badge variant={variant[status]}>{STATUS_LABELS[status]}</Badge>;
}

// ─── Receive With Batches Dialog ───────────────────────────────────────────────

interface BatchReceiveItem {
  product_id: number;
  product_name: string;
  quantity: number;
  unit_cost: number;
  batch_number: string;
  expiry_date: string;
  manufacture_date: string;
  notes: string;
}

interface ReceiveDialogProps {
  order: PurchaseOrder | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onConfirm: (items: BatchReceiveItem[]) => void;
  isPending: boolean;
}

function ReceiveWithBatchesDialog({
  order,
  open,
  onOpenChange,
  onConfirm,
  isPending,
}: ReceiveDialogProps) {
  const [batchItems, setBatchItems] = useState<BatchReceiveItem[]>([]);

  useEffect(() => {
    if (order && open) {
      setBatchItems(
        order.items.map((item) => ({
          product_id:       item.product_id,
          product_name:     item.product_name ?? `Producto #${item.product_id}`,
          quantity:         item.quantity,
          unit_cost:        item.unit_cost,
          batch_number:     '',
          expiry_date:      '',
          manufacture_date: '',
          notes:            '',
        }))
      );
    }
  }, [order, open]);

  function update(idx: number, field: keyof BatchReceiveItem, value: string | number) {
    setBatchItems((prev) =>
      prev.map((it, i) => (i === idx ? { ...it, [field]: value } : it))
    );
  }

  if (!order) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PackageCheck className="size-4" />
            Recibir Orden #{order.id} — {order.supplier_name}
          </DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">
          Completa los datos de lote para cada producto. El número de lote es requerido; fecha de vencimiento y fabricación son opcionales pero recomendadas para productos farmacéuticos.
        </p>

        <div className="flex-1 overflow-y-auto space-y-4 pr-1">
          {batchItems.map((item, idx) => (
            <div key={idx} className="rounded-lg border p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">{item.product_name}</p>
                  <p className="text-xs text-muted-foreground">
                    Cantidad: {item.quantity} · Costo unit.: {formatCurrency(item.unit_cost)}
                  </p>
                </div>
                <FlaskConical className="size-5 text-muted-foreground/40" />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">
                    Número de lote <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    placeholder="Ej: LOT-2024-001"
                    value={item.batch_number}
                    onChange={(e) => update(idx, 'batch_number', e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs">Notas del lote</Label>
                  <Input
                    placeholder="Opcional"
                    value={item.notes}
                    onChange={(e) => update(idx, 'notes', e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs flex items-center gap-1">
                    <Calendar className="size-3" />
                    Fecha de fabricación
                  </Label>
                  <Input
                    type="date"
                    value={item.manufacture_date}
                    onChange={(e) => update(idx, 'manufacture_date', e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label className="text-xs flex items-center gap-1">
                    <Calendar className="size-3" />
                    Fecha de vencimiento
                  </Label>
                  <Input
                    type="date"
                    value={item.expiry_date}
                    onChange={(e) => update(idx, 'expiry_date', e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button
            onClick={() => onConfirm(batchItems)}
            disabled={isPending || batchItems.some((it) => !it.batch_number.trim())}
          >
            {isPending ? 'Procesando...' : 'Confirmar recepción'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function PurchasesPage() {
  const params = useParams();
  const slug = params.slug as string;
  const queryClient = useQueryClient();
  const router = useRouter();

  // ── Filters & dialogs state
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [detailOrder, setDetailOrder] = useState<PurchaseOrder | null>(null);
  const [receiveOrder, setReceiveOrder] = useState<PurchaseOrder | null>(null);

  // ── Create form state
  const [supplierName, setSupplierName] = useState('');
  const [supplierDocument, setSupplierDocument] = useState('');
  const [notes, setNotes] = useState('');
  const [orderItems, setOrderItems] = useState<
    { product_id: number; quantity: number; unit_cost: number }[]
  >([]);

  // ── Queries
  const { data: ordersData, isLoading } = useQuery({
    queryKey: ['purchase-orders', slug, statusFilter],
    queryFn: () =>
      purchasesApi.list(statusFilter !== 'all' ? { status: statusFilter } : undefined),
  });

  const { data: productsData } = useQuery({
    queryKey: ['products', slug, 'all'],
    queryFn: () => productsApi.list({ per_page: 500 }),
    enabled: createOpen,
  });

  const { data: suppliersData } = useQuery({
    queryKey: ['suppliers', slug, 'all'],
    queryFn: () => suppliersApi.list({ page: 1 }),
    enabled: createOpen,
  });

  const suppliers: Supplier[] = (suppliersData as any)?.data?.data ?? [];

  const products: Product[] = (productsData as any)?.data ?? [];
  const orders: PurchaseOrder[] = (ordersData as any)?.data?.data ?? (ordersData as any)?.data ?? [];

  // ── Mutations
  const sendMutation = useMutation({
    mutationFn: (id: number) => purchasesApi.send(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders', slug] });
      notify.success('Orden enviada correctamente');
    },
    onError: (err) => notify.error(err, 'Error al enviar la orden'),
  });

  const receiveMutation = useMutation({
    mutationFn: ({ id, batches }: { id: number; batches: BatchReceiveItem[] }) =>
      purchasesApi.receive(id, batches.map((b) => ({
        product_id:       b.product_id,
        batch_number:     b.batch_number,
        quantity:         b.quantity,
        unit_cost:        b.unit_cost,
        expiry_date:      b.expiry_date || undefined,
        manufacture_date: b.manufacture_date || undefined,
        notes:            b.notes || undefined,
      }))),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders', slug] });
      queryClient.invalidateQueries({ queryKey: ['batches', slug] });
      notify.success('Orden recibida y lotes creados correctamente');
      setReceiveOrder(null);
    },
    onError: (err) => notify.error(err, 'Error al recibir la orden'),
  });

  const createMutation = useMutation({
    mutationFn: (data: unknown) => purchasesApi.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['purchase-orders', slug] });
      notify.success('Orden de compra creada');
      handleCloseCreate();
    },
    onError: (err) => notify.error(err, 'Error al crear la orden'),
  });

  // ── Create form helpers
  function handleCloseCreate() {
    setCreateOpen(false);
    setSupplierName('');
    setSupplierDocument('');
    setNotes('');
    setOrderItems([]);
  }

  function addItem() {
    setOrderItems((prev) => [...prev, { product_id: 0, quantity: 1, unit_cost: 0 }]);
  }

  function removeItem(index: number) {
    setOrderItems((prev) => prev.filter((_, i) => i !== index));
  }

  function updateItem(
    index: number,
    field: 'product_id' | 'quantity' | 'unit_cost',
    value: number,
  ) {
    setOrderItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        const updated = { ...item, [field]: value };
        if (field === 'product_id') {
          const product = products.find((p) => p.id === value);
          if (product) updated.unit_cost = product.cost;
        }
        return updated;
      }),
    );
  }

  const calculatedTotal = orderItems.reduce(
    (sum, item) => sum + item.quantity * item.unit_cost,
    0,
  );

  function handleCreateSubmit() {
    if (!supplierName.trim()) {
      notify.error('El nombre del proveedor es requerido');
      return;
    }
    if (orderItems.length === 0) {
      notify.error('Agrega al menos un producto');
      return;
    }
    const invalidItem = orderItems.find((item) => item.product_id === 0);
    if (invalidItem) {
      notify.error('Selecciona un producto en todas las líneas');
      return;
    }
    createMutation.mutate({
      supplier_name: supplierName.trim(),
      supplier_document: supplierDocument.trim() || undefined,
      notes: notes.trim() || undefined,
      items: orderItems.map(({ product_id, quantity, unit_cost }) => ({
        product_id,
        quantity,
        unit_cost,
      })),
      status: 'draft',
    });
  }

  const [mainTab, setMainTab] = useState('orders');

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">Compras</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.push(`/${slug}/purchase-returns`)}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Devoluciones
          </Button>
          {mainTab === 'orders' && (
            <Button onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Nueva orden
            </Button>
          )}
        </div>
      </div>

      <Tabs value={mainTab} onValueChange={setMainTab}>
        <TabsList>
          <TabsTrigger value="orders">Órdenes de Compra</TabsTrigger>
          <TabsTrigger value="requisitions">Requisiciones</TabsTrigger>
          <TabsTrigger value="rfq">Cotizaciones RFQ</TabsTrigger>
          <TabsTrigger value="vendor-invoices">Facturas Proveedor</TabsTrigger>
        </TabsList>

        <TabsContent value="requisitions" className="mt-4">
          <RequisitionsTab slug={slug} />
        </TabsContent>
        <TabsContent value="rfq" className="mt-4">
          <RfqTab />
        </TabsContent>
        <TabsContent value="vendor-invoices" className="mt-4">
          <VendorInvoiceTab />
        </TabsContent>

        <TabsContent value="orders" className="mt-4">

      {/* Status filter tabs */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((filter) => (
          <button
            key={filter.value}
            onClick={() => setStatusFilter(filter.value)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors border ${
              statusFilter === filter.value
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-background text-muted-foreground border-border hover:bg-muted'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Orders list */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 p-4 rounded-2xl border">
              <Skeleton className="size-10 rounded-xl" />
              <div className="flex-1 space-y-1.5"><Skeleton className="h-4 w-40" /><Skeleton className="h-3 w-24" /></div>
              <Skeleton className="h-5 w-20 rounded-full" />
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-8 w-24" />
            </div>
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="size-16 rounded-full bg-muted flex items-center justify-center mb-3">
            <PackageCheck className="size-7 text-muted-foreground/40" />
          </div>
          <p className="text-sm font-medium text-muted-foreground">No hay órdenes de compra</p>
          <Button size="sm" className="mt-4 gap-2" onClick={() => setCreateOpen(true)}>
            <Plus className="size-4" /> Crear primera orden
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {orders.map((order) => {
            const STATUS_COLOR: Record<string, string> = {
              draft: 'bg-slate-500/10 text-slate-600',
              sent: 'bg-blue-500/10 text-blue-700',
              partial: 'bg-amber-500/10 text-amber-700',
              received: 'bg-green-500/10 text-green-700',
              cancelled: 'bg-red-500/10 text-red-700',
            };
            return (
              <div key={order.id} className="flex items-center gap-4 p-4 rounded-2xl border bg-card hover:shadow-sm hover:border-primary/20 transition-all">
                <div className="size-10 rounded-xl bg-primary/8 flex items-center justify-center shrink-0">
                  <Calendar className="size-5 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold truncate">{order.supplier_name}</p>
                  <p className="text-xs text-muted-foreground">
                    #{order.id} · {formatDate(order.created_at)} · {order.items?.length ?? 0} ítem{(order.items?.length ?? 0) !== 1 ? 's' : ''}
                  </p>
                </div>
                <span className={`text-xs font-semibold px-2 py-0.5 rounded-full shrink-0 ${STATUS_COLOR[order.status] ?? 'bg-muted text-muted-foreground'}`}>
                  {STATUS_LABELS[order.status]}
                </span>
                <p className="font-bold text-sm tabular-nums shrink-0">{formatCurrency(order.total)}</p>
                <div className="flex gap-1.5 shrink-0">
                  {order.status === 'draft' && (
                    <Button size="sm" variant="outline" className="gap-1 text-xs h-8" onClick={() => sendMutation.mutate(order.id)} disabled={sendMutation.isPending}>
                      <Send className="size-3" /> Enviar
                    </Button>
                  )}
                  {(order.status === 'sent' || order.status === 'partial') && (
                    <Button size="sm" variant="outline" className="gap-1 text-xs h-8" onClick={() => setReceiveOrder(order)} disabled={receiveMutation.isPending}>
                      <PackageCheck className="size-3" /> Recibir
                    </Button>
                  )}
                  {order.status === 'received' && (
                    <Button size="sm" variant="outline" className="gap-1 text-xs h-8" onClick={() => router.push(`/${slug}/purchase-returns`)}>
                      <RotateCcw className="size-3" /> Devolver
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => setDetailOrder(order)}>
                    <Eye className="size-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

        </TabsContent>
      </Tabs>

      {/* Create Order Dialog */}
      <Dialog
        open={createOpen}
        onOpenChange={(open) => {
          if (!open) handleCloseCreate();
          else setCreateOpen(true);
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Nueva orden de compra</DialogTitle>
          </DialogHeader>

          <div className="flex flex-col gap-6 py-2">
            {/* Section 1 — Proveedor */}
            <div className="flex flex-col gap-4">
              <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Proveedor
              </p>
              <div className="grid grid-cols-2 gap-4">
                <div className="flex flex-col gap-2 col-span-2">
                  <Label>Seleccionar del maestro (opcional)</Label>
                  <Select
                    value={''}
                    onValueChange={(val) => {
                      if (!val) return;
                      const s = suppliers.find((s) => String(s.id) === val);
                      if (s) {
                        setSupplierName(s.name);
                        setSupplierDocument(s.document_number ?? '');
                      }
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Elegir proveedor registrado..." />
                    </SelectTrigger>
                    <SelectContent>
                      {suppliers.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.name}
                          {s.document_number ? ` — ${s.document_number}` : ''}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="supplier-name">
                    Nombre proveedor <span className="text-destructive">*</span>
                  </Label>
                  <Input
                    id="supplier-name"
                    placeholder="Nombre del proveedor"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="supplier-doc">Documento proveedor</Label>
                  <Input
                    id="supplier-doc"
                    placeholder="NIT / Cédula (opcional)"
                    value={supplierDocument}
                    onChange={(e) => setSupplierDocument(e.target.value)}
                  />
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <Label htmlFor="notes">Notas</Label>
                <textarea
                  id="notes"
                  rows={2}
                  placeholder="Observaciones (opcional)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="flex min-h-[60px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
                />
              </div>
            </div>

            <Separator />

            {/* Section 2 — Líneas de producto */}
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                  Productos
                </p>
                <Button type="button" size="sm" variant="outline" onClick={addItem}>
                  <Plus className="mr-1 h-3 w-3" />
                  Agregar producto
                </Button>
              </div>

              {orderItems.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  No hay productos. Haz clic en &quot;Agregar producto&quot;.
                </p>
              ) : (
                <div className="flex flex-col gap-2">
                  {/* Header row */}
                  <div className="grid grid-cols-[1fr_80px_100px_80px_32px] gap-2 text-xs font-medium text-muted-foreground px-1">
                    <span>Producto</span>
                    <span>Cantidad</span>
                    <span>Costo unit.</span>
                    <span>Subtotal</span>
                    <span />
                  </div>

                  {orderItems.map((item, index) => {
                    const subtotal = item.quantity * item.unit_cost;
                    return (
                      <div
                        key={index}
                        className="grid grid-cols-[1fr_80px_100px_80px_32px] gap-2 items-center"
                      >
                        {/* Product select */}
                        <Select
                          value={item.product_id > 0 ? String(item.product_id) : ''}
                          onValueChange={(val) =>
                            updateItem(index, 'product_id', Number(val))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Seleccionar..." />
                          </SelectTrigger>
                          <SelectContent>
                            {products.map((p) => (
                              <SelectItem key={p.id} value={String(p.id)}>
                                {p.name} — {p.sku}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>

                        {/* Quantity */}
                        <Input
                          type="number"
                          min={1}
                          value={item.quantity}
                          onChange={(e) =>
                            updateItem(
                              index,
                              'quantity',
                              Math.max(1, Number(e.target.value)),
                            )
                          }
                        />

                        {/* Unit cost */}
                        <Input
                          type="number"
                          min={0}
                          value={item.unit_cost}
                          onChange={(e) =>
                            updateItem(index, 'unit_cost', Number(e.target.value))
                          }
                        />

                        {/* Subtotal (read-only) */}
                        <div className="text-sm text-right font-medium text-muted-foreground">
                          {formatCurrency(subtotal)}
                        </div>

                        {/* Remove */}
                        <button
                          type="button"
                          onClick={() => removeItem(index)}
                          className="flex items-center justify-center h-8 w-8 rounded-md hover:bg-destructive/10 text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <Separator />

            {/* Section 3 — Total */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-semibold">Total estimado</span>
              <span className="text-lg font-bold">{formatCurrency(calculatedTotal)}</span>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={handleCloseCreate}
              disabled={createMutation.isPending}
            >
              Cancelar
            </Button>
            <Button onClick={handleCreateSubmit} disabled={createMutation.isPending}>
              {createMutation.isPending ? 'Creando...' : 'Crear orden'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Receive with Batches Dialog */}
      <ReceiveWithBatchesDialog
        order={receiveOrder}
        open={!!receiveOrder}
        onOpenChange={(v) => { if (!v) setReceiveOrder(null); }}
        onConfirm={(batches) => receiveMutation.mutate({ id: receiveOrder!.id, batches })}
        isPending={receiveMutation.isPending}
      />

      {/* Order Detail Dialog */}
      <Dialog
        open={!!detailOrder}
        onOpenChange={(open) => {
          if (!open) setDetailOrder(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>
              Orden #{detailOrder?.id} —{' '}
              <span className="font-normal text-muted-foreground">
                {detailOrder?.supplier_name}
              </span>
            </DialogTitle>
          </DialogHeader>

          {detailOrder && (
            <div className="flex flex-col gap-4">
              {/* Meta */}
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
                <span>
                  <span className="text-muted-foreground">Estado: </span>
                  <StatusBadge status={detailOrder.status} />
                </span>
                <span>
                  <span className="text-muted-foreground">Fecha: </span>
                  {formatDate(detailOrder.created_at)}
                </span>
                {detailOrder.supplier_document && (
                  <span>
                    <span className="text-muted-foreground">Documento: </span>
                    {detailOrder.supplier_document}
                  </span>
                )}
              </div>

              {detailOrder.notes && (
                <p className="text-sm text-muted-foreground rounded-md border px-3 py-2 bg-muted/30">
                  {detailOrder.notes}
                </p>
              )}

              <Separator />

              {/* Items table */}
              <div className="rounded-md border overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/50 text-muted-foreground">
                      <th className="px-3 py-2 text-left font-medium">Producto</th>
                      <th className="px-3 py-2 text-right font-medium">Cantidad</th>
                      <th className="px-3 py-2 text-right font-medium">Costo unit.</th>
                      <th className="px-3 py-2 text-right font-medium">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailOrder.items.length === 0 ? (
                      <tr>
                        <td
                          colSpan={4}
                          className="px-3 py-6 text-center text-muted-foreground"
                        >
                          Sin ítems
                        </td>
                      </tr>
                    ) : (
                      detailOrder.items.map((item, i) => {
                        const subtotal =
                          item.subtotal ?? item.quantity * item.unit_cost;
                        return (
                          <tr key={i} className="border-b last:border-0">
                            <td className="px-3 py-2">
                              {item.product_name ?? `Producto #${item.product_id}`}
                            </td>
                            <td className="px-3 py-2 text-right">{item.quantity}</td>
                            <td className="px-3 py-2 text-right">
                              {formatCurrency(item.unit_cost)}
                            </td>
                            <td className="px-3 py-2 text-right font-medium">
                              {formatCurrency(subtotal)}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/30">
                      <td
                        colSpan={3}
                        className="px-3 py-2 text-right font-semibold"
                      >
                        Total
                      </td>
                      <td className="px-3 py-2 text-right font-bold">
                        {formatCurrency(detailOrder.total)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setDetailOrder(null)}>
              Cerrar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
