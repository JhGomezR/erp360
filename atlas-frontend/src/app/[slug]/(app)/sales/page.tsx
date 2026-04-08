'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useForm, useFieldArray } from 'react-hook-form';
import { standardSchemaResolver as zodResolver } from '@hookform/resolvers/standard-schema';
import { z } from 'zod';
import { notify } from '@/lib/notify';
import {
  FileText, ShoppingBag, Plus, Send, RefreshCw, X, Search,
  CheckCircle2, XCircle, Clock, AlertTriangle, Receipt, Truck, Mail, List,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { quotesApi, salesOrdersApi, customersApi, productsApi, emailLogsApi, currenciesApi, setTenantSlug } from '@/lib/api/tenant.api';
import { SaleInvoiceDialog } from '@/components/shared/SaleInvoiceDialog';
import { DispatchDialog } from '@/components/shared/DispatchDialog';
import type { PaginatedResponse, Sale } from '@/types';

// ─── Types ────────────────────────────────────────────────────────────────────

interface QuoteItem {
  id: number;
  description: string;
  unit: string;
  quantity: number;
  quantity_invoiced: number;
  unit_price: number;
  discount_pct: number;
  tax_pct: number;
  subtotal: number;
  product?: { id: number; name: string; sku?: string };
}

interface Quote {
  id: number;
  quote_number?: string;
  status: string;
  invoice_status: string;
  total: number;
  invoiced_total: number;
  approval_required: boolean;
  rejection_reason?: string;
  customer?: { name: string };
  customer_name?: string;
  created_at: string;
  valid_until?: string;
  items?: QuoteItem[];
}

interface SalesOrderItem {
  id: number;
  description: string;
  unit: string;
  quantity: number;
  quantity_delivered: number;
  unit_price: number;
  subtotal: number;
  product?: { name: string };
}

interface SalesOrder {
  id: number; order_number?: string; status: string; total: number;
  delivered_total?: number; items?: SalesOrderItem[];
  customer?: { name: string }; created_at: string;
}
interface Customer { id: number; name: string; }
interface Product  { id: number; name: string; price: number; }

// ─── Status metadata ──────────────────────────────────────────────────────────

const Q_STATUS: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive' }> = {
  draft:            { label: 'Borrador',        variant: 'secondary' },
  sent:             { label: 'Enviada',          variant: 'default' },
  pending_approval: { label: 'Pend. Aprobación', variant: 'outline' },
  accepted:         { label: 'Aprobada',         variant: 'default' },
  rejected:         { label: 'Rechazada',        variant: 'destructive' },
  expired:          { label: 'Vencida',          variant: 'outline' },
};

const INV_STATUS: Record<string, { label: string; cls: string }> = {
  not_invoiced:   { label: 'Sin facturar',   cls: 'text-muted-foreground' },
  partial:        { label: 'Parcial',         cls: 'text-amber-600 font-medium' },
  fully_invoiced: { label: 'Facturado',       cls: 'text-green-600 font-medium' },
};

const O_STATUS: Record<string, string> = {
  draft: 'Borrador', confirmed: 'Confirmada', partial: 'Parcial',
  fulfilled: 'Completada', cancelled: 'Cancelada',
};
const O_VARIANT: Record<string, 'default' | 'secondary' | 'outline'> = {
  draft: 'secondary', confirmed: 'default', partial: 'secondary',
  fulfilled: 'default', cancelled: 'outline',
};

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

// ─── Helpers to shape a Quote as Sale for invoice preview ─────────────────────

function quoteToSale(q: Quote): Sale {
  return {
    id: q.id,
    code: q.quote_number ?? `COT-${q.id}`,
    status: 'completed' as Sale['status'],
    payment_method: 'transfer',
    subtotal: q.total,
    discount: 0,
    tax: 0,
    total: q.total,
    created_at: q.created_at,
    customer: q.customer as Sale['customer'],
    items: (q.items ?? []).map((i) => ({
      product: { id: i.product?.id ?? 0, name: i.description, sku: i.product?.sku } as Sale['items'][number]['product'],
      quantity: i.quantity,
      unit_price: i.unit_price,
      discount: 0,
      subtotal: i.subtotal,
    })),
    synced: true,
  };
}

function orderToSale(o: SalesOrder): Sale {
  return {
    id: o.id,
    code: o.order_number ?? `OV-${o.id}`,
    status: 'completed' as Sale['status'],
    payment_method: 'transfer',
    subtotal: o.total,
    discount: 0,
    tax: 0,
    total: o.total,
    created_at: o.created_at,
    customer: o.customer as Sale['customer'],
    items: [],
    synced: true,
  };
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const itemSchema = z.object({
  product_id: z.string().optional(),
  description: z.string().min(1, 'Requerido'),
  unit: z.string().optional(),
  quantity: z.string().min(1),
  unit_price: z.string().min(1),
  discount_pct: z.string().optional(),
  tax_pct: z.string().optional(),
});

const quoteSchema = z.object({
  customer_id:      z.string().optional(),
  customer_name:    z.string().min(1, 'Requerido'),
  customer_email:   z.string().email().optional().or(z.literal('')),
  customer_nit:     z.string().optional(),
  valid_until:      z.string().optional(),
  notes:            z.string().optional(),
  terms:            z.string().optional(),
  approval_required: z.boolean().optional(),
  currency_code:    z.string().optional(),
  exchange_rate:    z.string().optional(),
  items: z.array(itemSchema).min(1, 'Agrega al menos un producto'),
});
type QuoteForm = z.infer<typeof quoteSchema>;

// ─── Partial Invoice Dialog ───────────────────────────────────────────────────

interface PartialInvoiceDialogProps {
  quote: Quote | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  slug: string;
}

function PartialInvoiceDialog({ quote, open, onOpenChange, slug }: PartialInvoiceDialogProps) {
  const qc = useQueryClient();
  const [quantities, setQuantities] = useState<Record<number, string>>({});
  const [paymentMethod, setPaymentMethod] = useState('cash');

  // Inicializar cantidades con el pendiente de cada ítem
  useEffect(() => {
    if (quote?.items) {
      const init: Record<number, string> = {};
      quote.items.forEach((item) => {
        const pending = Math.max(0, item.quantity - item.quantity_invoiced);
        init[item.id] = String(pending);
      });
      setQuantities(init);
    }
  }, [quote]);

  const invoiceMutation = useMutation({
    mutationFn: (data: { payment_method: string; items: { quote_item_id: number; quantity: number }[] }) =>
      quotesApi.invoice(quote!.id, data),
    onSuccess: (res) => {
      const msg = (res.data as any)?.message ?? 'Factura creada';
      notify.success(msg);
      qc.invalidateQueries({ queryKey: ['quotes', slug] });
      onOpenChange(false);
    },
    onError: (err: unknown) => {
      notify.error(err, 'Error al facturar');
    },
  });

  function handleSubmit() {
    if (!quote?.items) return;

    const items = quote.items
      .map((item) => ({
        quote_item_id: item.id,
        quantity: parseFloat(quantities[item.id] ?? '0'),
      }))
      .filter((i) => i.quantity > 0);

    if (items.length === 0) {
      notify.error('Ingresa al menos una cantidad mayor a 0');
      return;
    }

    invoiceMutation.mutate({ payment_method: paymentMethod, items });
  }

  if (!quote) return null;

  const items = quote.items ?? [];

  // Total a facturar con las cantidades ingresadas
  const invoiceTotal = items.reduce((sum, item) => {
    const qty = parseFloat(quantities[item.id] ?? '0') || 0;
    const disc = 1 - (item.discount_pct / 100);
    const taxM = 1 + (item.tax_pct / 100);
    return sum + qty * item.unit_price * disc * taxM;
  }, 0);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b">
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="size-4" />
            Facturar cotización — {quote.quote_number ?? `COT-${quote.id}`}
          </DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            Define la cantidad a facturar por cada ítem. Puedes facturar parcialmente.
          </p>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Forma de pago */}
          <div className="flex items-center gap-3">
            <Label className="w-32 shrink-0">Forma de pago</Label>
            <Select value={paymentMethod} onValueChange={(v) => setPaymentMethod(v ?? 'cash')}>
              <SelectTrigger className="w-52">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="cash">Efectivo</SelectItem>
                <SelectItem value="card">Tarjeta</SelectItem>
                <SelectItem value="transfer">Transferencia</SelectItem>
                <SelectItem value="credit">Crédito / Fiado</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Items */}
          <div className="space-y-2">
            <div className="grid grid-cols-[1fr_80px_80px_100px] gap-2 text-xs font-medium text-muted-foreground px-1">
              <span>Descripción</span>
              <span className="text-right">Total</span>
              <span className="text-right">Pend.</span>
              <span className="text-right">A facturar</span>
            </div>
            {items.map((item) => {
              const pending = Math.max(0, item.quantity - item.quantity_invoiced);
              const isPending = pending > 0;
              return (
                <div
                  key={item.id}
                  className={`grid grid-cols-[1fr_80px_80px_100px] gap-2 items-center rounded-md border px-3 py-2 text-sm ${!isPending ? 'opacity-50 bg-muted/30' : ''}`}
                >
                  <div>
                    <p className="font-medium leading-tight">{item.description}</p>
                    <p className="text-xs text-muted-foreground">{item.unit} · {fmt(item.unit_price)}</p>
                  </div>
                  <span className="text-right text-xs">{item.quantity}</span>
                  <span className={`text-right text-xs font-medium ${pending > 0 ? 'text-amber-600' : 'text-green-600'}`}>
                    {pending}
                  </span>
                  <Input
                    type="number"
                    min={0}
                    max={pending}
                    step="0.001"
                    className="h-8 text-right text-xs"
                    value={quantities[item.id] ?? '0'}
                    disabled={!isPending}
                    onChange={(e) => setQuantities((prev) => ({ ...prev, [item.id]: e.target.value }))}
                  />
                </div>
              );
            })}
          </div>

          {/* Total a facturar */}
          <div className="flex justify-end border-t pt-3">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">Total a facturar</p>
              <p className="text-xl font-bold">{fmt(invoiceTotal)}</p>
            </div>
          </div>
        </div>

        <DialogFooter className="px-6 py-3 border-t">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={handleSubmit}
            disabled={invoiceMutation.isPending || invoiceTotal <= 0}
            className="gap-2"
          >
            <Receipt className="size-4" />
            {invoiceMutation.isPending ? 'Facturando…' : 'Generar factura'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Reject Dialog ────────────────────────────────────────────────────────────

function RejectDialog({
  quoteId, open, onOpenChange, slug,
}: { quoteId: number | null; open: boolean; onOpenChange: (v: boolean) => void; slug: string }) {
  const qc = useQueryClient();
  const [reason, setReason] = useState('');

  const rejectMutation = useMutation({
    mutationFn: () => quotesApi.rejectApproval(quoteId!, reason),
    onSuccess: () => {
      notify.success('Cotización rechazada');
      qc.invalidateQueries({ queryKey: ['quotes', slug] });
      setReason('');
      onOpenChange(false);
    },
    onError: (err) => notify.error(err, 'Error al rechazar'),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-destructive">
            <XCircle className="size-4" />Rechazar cotización
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label>Motivo del rechazo</Label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Describe el motivo para que el creador pueda corregirla..."
            rows={3}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            variant="destructive"
            disabled={!reason.trim() || rejectMutation.isPending}
            onClick={() => rejectMutation.mutate()}
          >
            {rejectMutation.isPending ? 'Rechazando…' : 'Rechazar'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SalesPage() {
  const params = useParams();
  const slug   = params.slug as string;
  const qc     = useQueryClient();

  const [tab, setTab]                   = useState<'quotes' | 'orders'>('quotes');
  const [newQuoteDialog, setNewQuoteDialog] = useState(false);
  const [search, setSearch]             = useState('');
  const [invoiceSale, setInvoiceSale]   = useState<Sale | null>(null);
  const [partialQuote, setPartialQuote] = useState<Quote | null>(null);
  const [rejectId, setRejectId]         = useState<number | null>(null);
  const [dispatchOrderId, setDispatchOrderId] = useState<number | null>(null);
  const [selectedQuotes, setSelectedQuotes] = useState<number[]>([]);
  const [emailLogOpen, setEmailLogOpen]     = useState(false);

  useEffect(() => { setTenantSlug(slug); }, [slug]);

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: quotesData, isLoading: loadingQ } = useQuery({
    queryKey: ['quotes', slug],
    queryFn: async () => {
      const r = await quotesApi.list({ search: search || undefined });
      return (r.data as PaginatedResponse<Quote>).data ?? (r.data as Quote[]) ?? [];
    },
    enabled: tab === 'quotes',
  });
  const quotes = quotesData ?? [];

  const { data: ordersData, isLoading: loadingO } = useQuery({
    queryKey: ['sales-orders', slug],
    queryFn: async () => {
      const r = await salesOrdersApi.list();
      return (r.data as PaginatedResponse<SalesOrder>).data ?? (r.data as SalesOrder[]) ?? [];
    },
    enabled: tab === 'orders',
  });
  const orders = ordersData ?? [];

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ['customers-simple', slug],
    queryFn: async () => {
      const r = await customersApi.list({ page: 1 });
      return (r.data as { data?: Customer[] }).data ?? (r.data as Customer[]) ?? [];
    },
  });

  const { data: products = [] } = useQuery<Product[]>({
    queryKey: ['products-simple', slug],
    queryFn: async () => {
      const r = await productsApi.list({ per_page: 200 });
      return (r.data as { data?: Product[] }).data ?? [];
    },
  });

  // ── Mutations ────────────────────────────────────────────────────────────────

  const createQuote = useMutation({
    mutationFn: (d: QuoteForm) => quotesApi.create({
      customer_id:       d.customer_id ? Number(d.customer_id) : undefined,
      customer_name:     d.customer_name,
      customer_email:    d.customer_email || undefined,
      customer_nit:      d.customer_nit || undefined,
      valid_until:       d.valid_until || undefined,
      notes:             d.notes || undefined,
      terms:             d.terms || undefined,
      approval_required: d.approval_required ?? false,
      items: d.items.map((i) => ({
        product_id:   i.product_id ? Number(i.product_id) : undefined,
        description:  i.description,
        unit:         i.unit || 'unidad',
        quantity:     Number(i.quantity),
        unit_price:   Number(i.unit_price),
        discount_pct: Number(i.discount_pct ?? 0),
        tax_pct:      Number(i.tax_pct ?? 0),
      })),
    }),
    onSuccess: () => {
      notify.success('Cotización creada');
      setNewQuoteDialog(false);
      qForm.reset({ items: [{ description: '', quantity: '1', unit_price: '0' }] });
      qc.invalidateQueries({ queryKey: ['quotes', slug] });
    },
    onError: (err) => notify.error(err, 'Error al crear cotización'),
  });

  const sendQuote = useMutation({
    mutationFn: (id: number) => quotesApi.send(id),
    onSuccess: () => { notify.success('Cotización enviada'); qc.invalidateQueries({ queryKey: ['quotes', slug] }); },
    onError: (err) => notify.error(err, 'Error al enviar'),
  });

  const requestApproval = useMutation({
    mutationFn: (id: number) => quotesApi.requestApproval(id),
    onSuccess: () => { notify.success('Solicitud de aprobación enviada'); qc.invalidateQueries({ queryKey: ['quotes', slug] }); },
    onError: (e) => notify.error(e, 'Error'),
  });

  const approveMutation = useMutation({
    mutationFn: (id: number) => quotesApi.approve(id),
    onSuccess: () => { notify.success('Cotización aprobada'); qc.invalidateQueries({ queryKey: ['quotes', slug] }); },
    onError: (e) => notify.error(e, 'Sin permiso para aprobar'),
  });

  const convertToOrder = useMutation({
    mutationFn: (id: number) => quotesApi.convertToOrder(id),
    onSuccess: () => {
      notify.success('Orden de venta creada');
      qc.invalidateQueries({ queryKey: ['quotes', slug] });
      qc.invalidateQueries({ queryKey: ['sales-orders', slug] });
    },
    onError: (e) => notify.error(e, 'Error al convertir'),
  });

  const confirmOrder = useMutation({
    mutationFn: (id: number) => salesOrdersApi.confirm(id),
    onSuccess: () => { notify.success('Orden confirmada'); qc.invalidateQueries({ queryKey: ['sales-orders', slug] }); },
    onError: (err) => notify.error(err, 'Error al confirmar'),
  });

  const batchSendMutation = useMutation({
    mutationFn: (ids: number[]) => emailLogsApi.batchSendQuotes(ids),
    onSuccess: (res) => {
      const d = res.data;
      notify.success(`Enviadas: ${d.sent}, Fallidas: ${d.failed}`);
      if (d.errors?.length > 0) {
        d.errors.forEach((e: string) => notify.error(e));
      }
      setSelectedQuotes([]);
      qc.invalidateQueries({ queryKey: ['quotes', slug] });
    },
    onError: (err) => notify.error(err, 'Error al enviar cotizaciones'),
  });

  const { data: emailLogsData } = useQuery({
    queryKey: ['email-logs', slug],
    queryFn: async () => {
      const r = await emailLogsApi.list({ page: 1 });
      return (r.data as any)?.data ?? [];
    },
    enabled: emailLogOpen,
  });

  // ── Quote form ───────────────────────────────────────────────────────────────

  const qForm = useForm<QuoteForm>({
    resolver: zodResolver(quoteSchema),
    defaultValues: {
      customer_name: '',
      approval_required: false,
      items: [{ description: '', quantity: '1', unit_price: '0' }],
    },
  });
  const { fields, append, remove } = useFieldArray({ control: qForm.control, name: 'items' });
  const watchItems  = qForm.watch('items');
  const quoteTotal  = watchItems.reduce(
    (s, i) => s + (parseFloat(String(i.unit_price) || '0') * parseFloat(String(i.quantity) || '0')), 0,
  );

  const onProductChange = (index: number, productId: string) => {
    qForm.setValue(`items.${index}.product_id`, productId);
    const p = products.find((pr) => String(pr.id) === productId);
    if (p) {
      qForm.setValue(`items.${index}.description`, p.name);
      qForm.setValue(`items.${index}.unit_price`, String(p.price));
    }
  };

  const filteredQuotes = quotes.filter((q: Quote) =>
    (q.customer?.name ?? q.customer_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (q.quote_number ?? '').toLowerCase().includes(search.toLowerCase()),
  );
  const filteredOrders = orders.filter((o: SalesOrder) =>
    (o.customer?.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
    (o.order_number ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  const TABS = [
    { key: 'quotes', label: 'Cotizaciones',     icon: FileText },
    { key: 'orders', label: 'Órdenes de Venta', icon: ShoppingBag },
  ] as const;

  // ── Open partial invoice (needs items) ───────────────────────────────────────

  async function openPartialInvoice(q: Quote) {
    if (!q.items) {
      const res = await quotesApi.get(q.id);
      setPartialQuote(res.data as Quote);
    } else {
      setPartialQuote(q);
    }
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Ventas</h1>
          <p className="text-muted-foreground text-sm">Cotizaciones y órdenes de venta</p>
        </div>
        {tab === 'quotes' && (
          <Button onClick={() => setNewQuoteDialog(true)} className="gap-2">
            <Plus className="size-4" />Nueva cotización
          </Button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}>
            <Icon className="size-4" />{label}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative max-w-xs">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input placeholder="Buscar..." className="pl-9" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      {/* ── Cotizaciones ── */}
      {tab === 'quotes' && (
        <Card>
          {/* Batch actions bar */}
          {selectedQuotes.length > 0 && (
            <div className="px-4 py-2 border-b bg-muted/40 flex items-center gap-3">
              <span className="text-sm text-muted-foreground">{selectedQuotes.length} seleccionada(s)</span>
              <Button size="sm" className="gap-1.5 h-7 text-xs" variant="outline"
                onClick={() => batchSendMutation.mutate(selectedQuotes)}
                disabled={batchSendMutation.isPending}>
                <Mail className="size-3" />
                {batchSendMutation.isPending ? 'Enviando…' : `Enviar seleccionadas (${selectedQuotes.length})`}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedQuotes([])}>
                <X className="size-3" />Limpiar
              </Button>
            </div>
          )}
          {/* Email log button */}
          <div className="px-4 py-2 flex justify-end border-b">
            <Button size="sm" variant="outline" className="gap-1.5 h-7 text-xs" onClick={() => setEmailLogOpen(true)}>
              <List className="size-3" />Ver log emails
            </Button>
          </div>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-4 py-3 w-8"></th>
                    <th className="text-left px-4 py-3 font-medium">N°</th>
                    <th className="text-left px-4 py-3 font-medium">Cliente</th>
                    <th className="text-right px-4 py-3 font-medium">Total</th>
                    <th className="text-left px-4 py-3 font-medium">Estado</th>
                    <th className="text-left px-4 py-3 font-medium">Facturación</th>
                    <th className="text-left px-4 py-3 font-medium">Fecha</th>
                    <th className="text-left px-4 py-3 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {loadingQ
                    ? Array.from({ length: 4 }).map((_, i) => (
                        <tr key={i}>{Array.from({ length: 8 }).map((__, j) => (
                          <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
                        ))}</tr>
                      ))
                    : filteredQuotes.map((q: Quote) => {
                        const st    = Q_STATUS[q.status] ?? { label: q.status, variant: 'outline' as const };
                        const invSt = INV_STATUS[q.invoice_status ?? 'not_invoiced'];
                        const canSelect = ['draft', 'sent'].includes(q.status);
                        return (
                          <tr key={q.id} className="hover:bg-muted/30">
                            <td className="px-4 py-3">
                              {canSelect && (
                                <input
                                  type="checkbox"
                                  className="rounded"
                                  checked={selectedQuotes.includes(q.id)}
                                  onChange={(e) => {
                                    if (e.target.checked) {
                                      setSelectedQuotes((prev) => [...prev, q.id]);
                                    } else {
                                      setSelectedQuotes((prev) => prev.filter((id) => id !== q.id));
                                    }
                                  }}
                                />
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1.5">
                                <span className="font-mono text-xs">{q.quote_number ?? `COT-${q.id}`}</span>
                                {q.approval_required && (
                                  <span title="Requiere aprobación">
                                    <AlertTriangle className="size-3 text-amber-500" />
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3">{q.customer?.name ?? q.customer_name ?? '—'}</td>
                            <td className="px-4 py-3 text-right font-semibold">{fmt(q.total)}</td>
                            <td className="px-4 py-3">
                              <Badge variant={st.variant}>{st.label}</Badge>
                            </td>
                            <td className="px-4 py-3">
                              <span className={`text-xs ${invSt.cls}`}>{invSt.label}</span>
                              {q.invoiced_total > 0 && (
                                <span className="text-xs text-muted-foreground ml-1">({fmt(q.invoiced_total)})</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-muted-foreground text-xs">
                              {new Date(q.created_at).toLocaleDateString('es-CO')}
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex gap-1 flex-wrap">
                                {/* Factura (preview) */}
                                <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs"
                                  onClick={() => setInvoiceSale(quoteToSale(q))}>
                                  <FileText className="size-3" />Ver
                                </Button>
                                {/* Enviar */}
                                {q.status === 'draft' && (
                                  <Button variant="outline" size="sm" className="gap-1 h-7 text-xs"
                                    onClick={() => sendQuote.mutate(q.id)} disabled={sendQuote.isPending}>
                                    <Send className="size-3" />Enviar
                                  </Button>
                                )}
                                {/* Solicitar aprobación */}
                                {q.approval_required && ['draft', 'sent'].includes(q.status) && (
                                  <Button variant="outline" size="sm" className="gap-1 h-7 text-xs"
                                    onClick={() => requestApproval.mutate(q.id)} disabled={requestApproval.isPending}>
                                    <Clock className="size-3" />Solicitar aprob.
                                  </Button>
                                )}
                                {/* Aprobar */}
                                {q.status === 'pending_approval' && (
                                  <Button variant="outline" size="sm" className="gap-1 h-7 text-xs text-green-700 border-green-300"
                                    onClick={() => approveMutation.mutate(q.id)} disabled={approveMutation.isPending}>
                                    <CheckCircle2 className="size-3" />Aprobar
                                  </Button>
                                )}
                                {/* Rechazar */}
                                {q.status === 'pending_approval' && (
                                  <Button variant="outline" size="sm" className="gap-1 h-7 text-xs text-destructive border-destructive/40"
                                    onClick={() => setRejectId(q.id)}>
                                    <XCircle className="size-3" />Rechazar
                                  </Button>
                                )}
                                {/* Facturar (parcial/total) */}
                                {q.invoice_status !== 'fully_invoiced' && ['draft','sent','accepted','pending_approval'].includes(q.status) && (
                                  <Button variant="outline" size="sm" className="gap-1 h-7 text-xs text-blue-700 border-blue-300"
                                    onClick={() => openPartialInvoice(q)}>
                                    <Receipt className="size-3" />Facturar
                                  </Button>
                                )}
                                {/* Convertir a orden */}
                                {['draft','sent','accepted'].includes(q.status) && q.invoice_status !== 'fully_invoiced' && (
                                  <Button variant="outline" size="sm" className="gap-1 h-7 text-xs"
                                    onClick={() => convertToOrder.mutate(q.id)} disabled={convertToOrder.isPending}>
                                    <RefreshCw className="size-3" />Orden
                                  </Button>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                  {!loadingQ && filteredQuotes.length === 0 && (
                    <tr><td colSpan={8} className="text-center py-8 text-muted-foreground text-sm">No hay cotizaciones</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Órdenes de Venta ── */}
      {tab === 'orders' && (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">N°</th>
                  <th className="text-left px-4 py-3 font-medium">Cliente</th>
                  <th className="text-right px-4 py-3 font-medium">Total</th>
                  <th className="text-left px-4 py-3 font-medium">Estado</th>
                  <th className="text-left px-4 py-3 font-medium">Fecha</th>
                  <th className="text-left px-4 py-3 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loadingO
                  ? Array.from({ length: 4 }).map((_, i) => (
                      <tr key={i}>{Array.from({ length: 6 }).map((__, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
                      ))}</tr>
                    ))
                  : filteredOrders.map((o: SalesOrder) => (
                      <tr key={o.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-mono text-xs">{o.order_number ?? `OV-${o.id}`}</td>
                        <td className="px-4 py-3">{o.customer?.name ?? '—'}</td>
                        <td className="px-4 py-3 text-right font-semibold">{fmt(o.total)}</td>
                        <td className="px-4 py-3">
                          <Badge variant={O_VARIANT[o.status] ?? 'outline'}>{O_STATUS[o.status] ?? o.status}</Badge>
                        </td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">
                          {new Date(o.created_at).toLocaleDateString('es-CO')}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs"
                              onClick={() => setInvoiceSale(orderToSale(o))}>
                              <FileText className="size-3" />Ver
                            </Button>
                            {o.status === 'draft' && (
                              <Button variant="outline" size="sm" className="gap-1 h-7 text-xs"
                                onClick={() => confirmOrder.mutate(o.id)} disabled={confirmOrder.isPending}>
                                <RefreshCw className="size-3" />Confirmar
                              </Button>
                            )}
                            {['confirmed', 'partial'].includes(o.status) && (
                              <Button variant="outline" size="sm" className="gap-1 h-7 text-xs text-blue-700 border-blue-300"
                                onClick={() => setDispatchOrderId(o.id)}>
                                <Truck className="size-3" />Despachar
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                {!loadingO && filteredOrders.length === 0 && (
                  <tr><td colSpan={6} className="text-center py-8 text-muted-foreground text-sm">No hay órdenes de venta</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* ── Dialog: Nueva cotización ── */}
      <Dialog open={newQuoteDialog} onOpenChange={setNewQuoteDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-5 pb-3 border-b">
            <DialogTitle className="flex items-center gap-2"><FileText className="size-4" />Nueva cotización</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={qForm.handleSubmit((d) => createQuote.mutate(d))}
            className="flex flex-col gap-4 overflow-y-auto flex-1 px-6 py-4"
          >
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Nombre cliente <span className="text-destructive">*</span></Label>
                <Input {...qForm.register('customer_name')} placeholder="Nombre o razón social" />
                {qForm.formState.errors.customer_name && (
                  <p className="text-xs text-destructive">{qForm.formState.errors.customer_name.message}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label>Email cliente</Label>
                <Input type="email" {...qForm.register('customer_email')} placeholder="correo@empresa.com" />
              </div>
              <div className="space-y-1.5">
                <Label>NIT</Label>
                <Input {...qForm.register('customer_nit')} placeholder="900.XXX.XXX-0" />
              </div>
              <div className="space-y-1.5">
                <Label>Válida hasta</Label>
                <Input type="date" {...qForm.register('valid_until')} />
              </div>
            </div>

            {/* Requiere aprobación */}
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" className="rounded"
                {...qForm.register('approval_required')} />
              <span className="text-sm">Requiere aprobación de un gerente antes de convertirse en orden</span>
            </label>

            {/* Items */}
            <Card>
              <CardHeader className="py-3 flex flex-row items-center justify-between">
                <CardTitle className="text-sm">Productos / Servicios</CardTitle>
                <Button type="button" variant="outline" size="sm" className="gap-1"
                  onClick={() => append({ description: '', quantity: '1', unit_price: '0' })}>
                  <Plus className="size-3" />Agregar ítem
                </Button>
              </CardHeader>
              <CardContent className="space-y-2 pb-3">
                {fields.map((field, index) => (
                  <div key={field.id} className="grid grid-cols-[1fr_70px_90px_32px] gap-2 items-end">
                    <div>
                      {index === 0 && <Label className="text-xs">Descripción</Label>}
                      <Input className="h-8 text-xs" placeholder="Descripción del ítem"
                        {...qForm.register(`items.${index}.description`)} />
                    </div>
                    <div>
                      {index === 0 && <Label className="text-xs">Cant.</Label>}
                      <Input type="number" min={0.001} step="0.001" className="h-8 text-xs"
                        {...qForm.register(`items.${index}.quantity`)} />
                    </div>
                    <div>
                      {index === 0 && <Label className="text-xs">Precio unit.</Label>}
                      <Input type="number" step="0.01" className="h-8 text-xs"
                        {...qForm.register(`items.${index}.unit_price`)} />
                    </div>
                    <Button type="button" variant="ghost" size="icon" className="h-8 w-8 shrink-0"
                      onClick={() => remove(index)} disabled={fields.length === 1}>
                      <X className="size-3" />
                    </Button>
                  </div>
                ))}
                <div className="text-right text-sm font-semibold pt-2 border-t">
                  Total: {fmt(quoteTotal)}
                </div>
              </CardContent>
            </Card>

            <div className="space-y-1.5">
              <Label>Notas</Label>
              <Textarea {...qForm.register('notes')} placeholder="Observaciones, condiciones de entrega..." rows={2} />
            </div>

            <DialogFooter className="mt-auto pt-2">
              <Button variant="outline" type="button" onClick={() => setNewQuoteDialog(false)}>Cancelar</Button>
              <Button type="submit" disabled={createQuote.isPending}>
                {createQuote.isPending ? 'Creando...' : 'Crear cotización'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Partial Invoice Dialog ── */}
      <PartialInvoiceDialog
        quote={partialQuote}
        open={!!partialQuote}
        onOpenChange={(v) => { if (!v) setPartialQuote(null); }}
        slug={slug}
      />

      {/* ── Reject Dialog ── */}
      <RejectDialog
        quoteId={rejectId}
        open={!!rejectId}
        onOpenChange={(v) => { if (!v) setRejectId(null); }}
        slug={slug}
      />

      {/* ── Invoice preview dialog ── */}
      <SaleInvoiceDialog
        sale={invoiceSale}
        open={!!invoiceSale}
        onOpenChange={(v) => { if (!v) setInvoiceSale(null); }}
        slug={slug}
      />

      {/* ── Dispatch Dialog ── */}
      <DispatchDialog
        orderId={dispatchOrderId}
        open={!!dispatchOrderId}
        onOpenChange={(v) => { if (!v) setDispatchOrderId(null); }}
        slug={slug}
      />

      {/* ── Email Log Dialog ── */}
      <Dialog open={emailLogOpen} onOpenChange={setEmailLogOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] flex flex-col gap-0 p-0">
          <DialogHeader className="px-6 pt-5 pb-3 border-b">
            <DialogTitle className="flex items-center gap-2">
              <Mail className="size-4" />Log de emails enviados
            </DialogTitle>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 sticky top-0">
                <tr>
                  <th className="text-left px-4 py-2 text-xs font-medium">Fecha</th>
                  <th className="text-left px-4 py-2 text-xs font-medium">Destinatario</th>
                  <th className="text-left px-4 py-2 text-xs font-medium">Tipo</th>
                  <th className="text-left px-4 py-2 text-xs font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(emailLogsData as any[] ?? []).length === 0 && (
                  <tr><td colSpan={4} className="text-center py-8 text-muted-foreground text-sm">Sin registros</td></tr>
                )}
                {(emailLogsData as any[] ?? []).map((log: any) => (
                  <tr key={log.id} className="hover:bg-muted/20">
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {new Date(log.created_at).toLocaleDateString('es-CO')}
                    </td>
                    <td className="px-4 py-2 text-xs">{log.recipient_email}</td>
                    <td className="px-4 py-2 text-xs">{log.mailable_type}</td>
                    <td className="px-4 py-2">
                      <Badge variant={
                        log.status === 'sent' ? 'default' :
                        log.status === 'failed' ? 'destructive' : 'secondary'
                      } className="text-xs">
                        {log.status === 'queued' ? 'En cola' :
                         log.status === 'sent' ? 'Enviado' : 'Fallido'}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
