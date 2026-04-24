'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notify } from '@/lib/notify';
import { purchasesApi, invoiceOcrApi, suppliersApi } from '@/lib/api/tenant.api';
import {
  FileText, Plus, AlertCircle, CheckCircle, Clock, DollarSign, ScanLine,
} from 'lucide-react';

import { Button }    from '@/components/ui/button';
import { Badge }     from '@/components/ui/badge';
import { Input }     from '@/components/ui/input';
import { Label }     from '@/components/ui/label';
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
import { Textarea } from '@/components/ui/textarea';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VendorInvoice {
  id: number;
  internal_ref: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string | null;
  total: number;
  amount_paid: number;
  status: 'received' | 'reviewed' | 'approved' | 'posted' | 'paid' | 'rejected';
  payment_status: 'unpaid' | 'partial' | 'paid';
  currency: string;
  supplier_name: string;
  attachment_name: string | null;
}

interface InvoiceDetail {
  invoice: VendorInvoice;
  lines: {
    id: number;
    description: string;
    quantity: number;
    unit_price: number;
    tax_rate: number;
    line_total: number;
  }[];
  payments: {
    id: number;
    payment_date: string;
    amount: number;
    payment_method: string;
    reference: string | null;
  }[];
}

interface Stats {
  total: number;
  pending: number;
  overdue: number;
  totalDue: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (v: number) => `$${Number(v).toLocaleString('es-CO', { minimumFractionDigits: 0 })}`;
const fmtDate = (d: string) => new Date(d).toLocaleDateString('es-CO');

const STATUS_COLORS: Record<VendorInvoice['status'], 'secondary' | 'default' | 'destructive' | 'outline'> = {
  received: 'secondary', reviewed: 'secondary', approved: 'default',
  posted: 'default', paid: 'outline', rejected: 'destructive',
};
const STATUS_LABELS: Record<VendorInvoice['status'], string> = {
  received: 'Recibida', reviewed: 'Revisada', approved: 'Aprobada',
  posted: 'Contabilizada', paid: 'Pagada', rejected: 'Rechazada',
};
const PAY_COLORS: Record<VendorInvoice['payment_status'], string> = {
  unpaid: 'text-red-600', partial: 'text-yellow-600', paid: 'text-green-600',
};

// ─── Line row (for create form) ───────────────────────────────────────────────

interface LineRow {
  description: string;
  quantity: string;
  unit_price: string;
  tax_rate: string;
}

function emptyLine(): LineRow {
  return { description: '', quantity: '1', unit_price: '0', tax_rate: '19' };
}

// ─── Create invoice dialog ────────────────────────────────────────────────────

function CreateInvoiceDialog({
  open, onClose, onCreated, slug,
}: {
  open: boolean; onClose: () => void; onCreated: () => void; slug: string;
}) {
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [supplierId, setSupplierId]       = useState('');
  const [invoiceDate, setInvoiceDate]     = useState('');
  const [dueDate, setDueDate]             = useState('');
  const [notes, setNotes]                 = useState('');
  const [lines, setLines]                 = useState<LineRow[]>([emptyLine()]);
  const [ocrLoading, setOcrLoading]       = useState(false);

  // Load supplier list for selector
  const suppliersQ = useQuery({
    queryKey: [slug, 'suppliers-list'],
    queryFn: () => suppliersApi.list().then((r) => r.data),
    enabled: open,
  });
  const suppliers = ((suppliersQ.data as { data?: unknown[] })?.data ?? []) as { id: number; name: string }[];

  const mut = useMutation({
    mutationFn: () => purchasesApi.createVendorInvoice({
      invoice_number: invoiceNumber,
      supplier_id:    Number(supplierId),
      invoice_date:   invoiceDate,
      due_date:       dueDate || undefined,
      notes:          notes || undefined,
      lines: lines.map((l) => ({
        description: l.description,
        quantity:    parseFloat(l.quantity) || 1,
        unit_price:  parseFloat(l.unit_price) || 0,
        tax_rate:    parseFloat(l.tax_rate) || 0,
      })),
    }),
    onSuccess: () => { notify.success('Factura registrada'); onCreated(); onClose(); },
    onError:   () => notify.error('Error al registrar factura'),
  });

  async function handleOcrImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setOcrLoading(true);
    try {
      const res = await invoiceOcrApi.extract(file);
      const d = (res.data as any)?.data ?? (res.data as any) ?? {};
      if (d.invoice_number) setInvoiceNumber(d.invoice_number);
      if (d.date) setInvoiceDate(d.date);
      if (d.due_date) setDueDate(d.due_date);
      if (d.lines?.length) {
        setLines(d.lines.map((l: any) => ({
          description: l.description ?? '',
          quantity: String(l.quantity ?? 1),
          unit_price: String(l.unit_price ?? 0),
          tax_rate: String(l.tax_rate ?? 19),
        })));
      }
      notify.success('Datos extraídos por OCR. Revisa y completa los campos.');
    } catch {
      notify.error('Error al procesar el archivo. Verifica que sea un PDF válido.');
    } finally {
      setOcrLoading(false);
      e.target.value = '';
    }
  }

  function updateLine(i: number, field: keyof LineRow, val: string) {
    setLines((prev) => prev.map((l, idx) => idx === i ? { ...l, [field]: val } : l));
  }

  const lineTotal = lines.reduce((acc, l) => {
    const qty = parseFloat(l.quantity) || 0;
    const price = parseFloat(l.unit_price) || 0;
    const tax = parseFloat(l.tax_rate) || 0;
    return acc + qty * price * (1 + tax / 100);
  }, 0);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nueva Factura Proveedor</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {/* OCR Import */}
          <div className="flex items-center gap-3 p-3 rounded-lg border border-dashed bg-muted/30">
            <ScanLine className="size-5 text-muted-foreground shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium">Importar desde PDF</p>
              <p className="text-xs text-muted-foreground">Extrae los datos automáticamente con OCR. Requiere Poppler instalado en el servidor.</p>
            </div>
            <label className="cursor-pointer">
              <input type="file" accept=".pdf,.xml" className="sr-only" onChange={handleOcrImport} disabled={ocrLoading} />
              <span className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium border transition-colors ${ocrLoading ? 'opacity-50 cursor-not-allowed bg-muted' : 'hover:bg-accent cursor-pointer bg-background'}`}>
                {ocrLoading ? 'Procesando...' : 'Seleccionar archivo'}
              </span>
            </label>
          </div>
          {/* Header fields */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>No. Factura <span className="text-destructive">*</span></Label>
              <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} placeholder="FV-001" />
            </div>
            <div className="space-y-1.5">
              <Label>Proveedor <span className="text-destructive">*</span></Label>
              <Select value={supplierId} onValueChange={(v) => setSupplierId(v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Seleccionar…" /></SelectTrigger>
                <SelectContent>
                  {suppliers.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fecha factura <span className="text-destructive">*</span></Label>
              <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Fecha vencimiento</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>

          <Separator />

          {/* Lines */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-semibold">Líneas</Label>
              <Button size="sm" variant="outline" onClick={() => setLines((p) => [...p, emptyLine()])}>
                <Plus className="size-3.5 mr-1" /> Agregar línea
              </Button>
            </div>
            <div className="space-y-2">
              {lines.map((l, i) => (
                <div key={i} className="grid grid-cols-12 gap-1.5 items-end">
                  <div className="col-span-5 space-y-1">
                    {i === 0 && <Label className="text-xs">Descripción</Label>}
                    <Input value={l.description} onChange={(e) => updateLine(i, 'description', e.target.value)}
                      placeholder="Descripción del ítem" className="text-xs" />
                  </div>
                  <div className="col-span-2 space-y-1">
                    {i === 0 && <Label className="text-xs">Cantidad</Label>}
                    <Input type="number" min={0} step={0.01} value={l.quantity}
                      onChange={(e) => updateLine(i, 'quantity', e.target.value)} className="text-xs" />
                  </div>
                  <div className="col-span-2 space-y-1">
                    {i === 0 && <Label className="text-xs">Precio unit.</Label>}
                    <Input type="number" min={0} step={0.01} value={l.unit_price}
                      onChange={(e) => updateLine(i, 'unit_price', e.target.value)} className="text-xs" />
                  </div>
                  <div className="col-span-2 space-y-1">
                    {i === 0 && <Label className="text-xs">IVA %</Label>}
                    <Input type="number" min={0} max={100} step={1} value={l.tax_rate}
                      onChange={(e) => updateLine(i, 'tax_rate', e.target.value)} className="text-xs" />
                  </div>
                  <div className="col-span-1 flex justify-end pb-0.5">
                    {lines.length > 1 && (
                      <Button size="icon" variant="ghost" className="size-7 text-destructive"
                        onClick={() => setLines((p) => p.filter((_, idx) => idx !== i))}>
                        ×
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="text-right text-sm font-semibold mt-2">Total estimado: {fmt(lineTotal)}</div>
          </div>

          <div className="space-y-1.5">
            <Label>Notas</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !invoiceNumber || !supplierId || !invoiceDate}>
            {mut.isPending ? 'Guardando…' : 'Registrar Factura'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Detail dialog ────────────────────────────────────────────────────────────

function InvoiceDetailDialog({
  invoiceId, open, onClose, slug,
}: {
  invoiceId: number | null; open: boolean; onClose: () => void; slug: string;
}) {
  const qc = useQueryClient();
  const [payDate, setPayDate]     = useState('');
  const [payAmount, setPayAmount] = useState('');
  const [payMethod, setPayMethod] = useState('transfer');
  const [payRef, setPayRef]       = useState('');
  const [rejectReason, setRejectReason] = useState('');

  const detailQ = useQuery({
    queryKey: [slug, 'vendor-invoice-detail', invoiceId],
    queryFn: () => purchasesApi.getVendorInvoice(invoiceId!),
    enabled: open && invoiceId !== null,
  });

  const inv = (detailQ.data as InvoiceDetail | undefined);
  const invoice = inv?.invoice;
  const lines = inv?.lines ?? [];
  const payments = inv?.payments ?? [];

  function inv2() {
    qc.invalidateQueries({ queryKey: [slug, 'vendor-invoice-detail', invoiceId] });
    qc.invalidateQueries({ queryKey: [slug, 'vendor-invoices'] });
    qc.invalidateQueries({ queryKey: [slug, 'vendor-invoice-stats'] });
  }

  const reviewMut = useMutation({
    mutationFn: () => purchasesApi.reviewVendorInvoice(invoiceId!),
    onSuccess: () => { notify.success('Marcada como revisada'); inv2(); },
  });
  const approveMut = useMutation({
    mutationFn: () => purchasesApi.approveVendorInvoice(invoiceId!),
    onSuccess: () => { notify.success('Factura aprobada'); inv2(); },
  });
  const rejectMut = useMutation({
    mutationFn: () => purchasesApi.rejectVendorInvoice(invoiceId!, rejectReason),
    onSuccess: () => { notify.success('Factura rechazada'); inv2(); },
  });
  const payMut = useMutation({
    mutationFn: () => purchasesApi.payVendorInvoice(invoiceId!, {
      payment_date: payDate,
      amount: parseFloat(payAmount),
      payment_method: payMethod,
      reference: payRef || undefined,
    }),
    onSuccess: () => { notify.success('Pago registrado'); setPayAmount(''); setPayRef(''); inv2(); },
    onError: () => notify.error('Error al registrar pago'),
  });

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-4" />
            {invoice ? `${invoice.internal_ref} — ${invoice.invoice_number}` : '…'}
          </DialogTitle>
        </DialogHeader>

        {detailQ.isPending ? (
          <Skeleton className="h-48 w-full" />
        ) : !invoice ? (
          <p className="text-destructive text-sm">No encontrada.</p>
        ) : (
          <div className="space-y-4">
            {/* Header info */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div><span className="text-muted-foreground">Proveedor:</span> <strong>{invoice.supplier_name}</strong></div>
              <div><span className="text-muted-foreground">Fecha:</span> {fmtDate(invoice.invoice_date)}</div>
              {invoice.due_date && <div><span className="text-muted-foreground">Vence:</span> {fmtDate(invoice.due_date)}</div>}
              <div><span className="text-muted-foreground">Total:</span> <strong>{fmt(invoice.total)}</strong></div>
              <div>
                <Badge variant={STATUS_COLORS[invoice.status]}>{STATUS_LABELS[invoice.status]}</Badge>
              </div>
              <div className={`font-semibold ${PAY_COLORS[invoice.payment_status]}`}>
                Pagado: {fmt(invoice.amount_paid)} / {fmt(invoice.total)}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex flex-wrap gap-2">
              {invoice.status === 'received' && (
                <Button size="sm" variant="outline" onClick={() => reviewMut.mutate()} disabled={reviewMut.isPending}>
                  Marcar revisada
                </Button>
              )}
              {invoice.status === 'reviewed' && (
                <>
                  <Button size="sm" onClick={() => approveMut.mutate()} disabled={approveMut.isPending}>
                    Aprobar
                  </Button>
                  <Button size="sm" variant="destructive" onClick={() => {
                    const r = prompt('Motivo de rechazo:');
                    if (r !== null) { setRejectReason(r); rejectMut.mutate(); }
                  }} disabled={rejectMut.isPending}>
                    Rechazar
                  </Button>
                </>
              )}
            </div>

            <Separator />

            {/* Lines */}
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-1">LÍNEAS</p>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Descripción</TableHead>
                    <TableHead className="text-right">Cant.</TableHead>
                    <TableHead className="text-right">Precio</TableHead>
                    <TableHead className="text-right">IVA%</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lines.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-sm">{l.description}</TableCell>
                      <TableCell className="text-right text-sm">{l.quantity}</TableCell>
                      <TableCell className="text-right text-sm">{fmt(l.unit_price)}</TableCell>
                      <TableCell className="text-right text-sm">{l.tax_rate}%</TableCell>
                      <TableCell className="text-right text-sm font-semibold">{fmt(l.line_total)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Payments */}
            {payments.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground mb-1">PAGOS REGISTRADOS</p>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Fecha</TableHead>
                      <TableHead>Método</TableHead>
                      <TableHead>Referencia</TableHead>
                      <TableHead className="text-right">Monto</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payments.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="text-sm">{fmtDate(p.payment_date)}</TableCell>
                        <TableCell className="text-sm">{p.payment_method}</TableCell>
                        <TableCell className="text-sm">{p.reference ?? '—'}</TableCell>
                        <TableCell className="text-right text-sm font-semibold">{fmt(p.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}

            {/* Register payment form */}
            {invoice.payment_status !== 'paid' && invoice.status !== 'rejected' && (
              <div className="rounded-md border p-3 space-y-2">
                <p className="text-xs font-semibold text-muted-foreground">REGISTRAR PAGO</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label className="text-xs">Fecha pago</Label>
                    <Input type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} className="h-8 text-xs" />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Monto</Label>
                    <Input type="number" min={0} step={0.01} value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)} className="h-8 text-xs"
                      placeholder={String(invoice.total - invoice.amount_paid)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Método</Label>
                    <Select value={payMethod} onValueChange={(v) => setPayMethod(v ?? 'transfer')}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="transfer">Transferencia</SelectItem>
                        <SelectItem value="check">Cheque</SelectItem>
                        <SelectItem value="cash">Efectivo</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Referencia</Label>
                    <Input value={payRef} onChange={(e) => setPayRef(e.target.value)} className="h-8 text-xs" placeholder="No. transferencia" />
                  </div>
                </div>
                <Button size="sm" onClick={() => payMut.mutate()} disabled={payMut.isPending || !payDate || !payAmount}>
                  {payMut.isPending ? 'Guardando…' : 'Registrar Pago'}
                </Button>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN TAB
// ══════════════════════════════════════════════════════════════════════════════

export function VendorInvoiceTab() {
  const { slug } = useParams<{ slug: string }>();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterPayment, setFilterPayment] = useState('');

  const statsQ = useQuery({
    queryKey: [slug, 'vendor-invoice-stats'],
    queryFn: () => purchasesApi.vendorInvoiceStats(),
  });

  const listQ = useQuery({
    queryKey: [slug, 'vendor-invoices', filterStatus, filterPayment],
    queryFn: () => purchasesApi.vendorInvoices({
      status:         filterStatus || undefined,
      payment_status: filterPayment || undefined,
    }),
  });

  const stats = statsQ.data as Stats | undefined;
  const invoices = ((listQ.data as { data?: VendorInvoice[] })?.data ?? []) as VendorInvoice[];

  function inv() {
    qc.invalidateQueries({ queryKey: [slug, 'vendor-invoices'] });
    qc.invalidateQueries({ queryKey: [slug, 'vendor-invoice-stats'] });
  }

  return (
    <div className="space-y-4">
      {/* KPI cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Total facturas',  value: stats?.total ?? '—',             icon: FileText,      color: '' },
          { label: 'Pendientes',      value: stats?.pending ?? '—',           icon: Clock,         color: 'text-yellow-600' },
          { label: 'Vencidas',        value: stats?.overdue ?? '—',           icon: AlertCircle,   color: 'text-red-600' },
          { label: 'Por pagar',       value: stats ? fmt(stats.totalDue) : '—', icon: DollarSign, color: 'text-blue-600' },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-3 pt-4 pb-3">
              <Icon className={`size-7 shrink-0 ${color || 'text-muted-foreground'}`} />
              <div>
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="text-lg font-bold">{String(value)}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="mr-1 size-3.5" />Nueva factura
        </Button>
        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v === 'all' ? '' : (v ?? ''))}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los estados</SelectItem>
            {(['received','reviewed','approved','paid','rejected'] as const).map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterPayment} onValueChange={(v) => setFilterPayment(v === 'all' ? '' : (v ?? ''))}>
          <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="Pago" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="unpaid">Sin pagar</SelectItem>
            <SelectItem value="partial">Parcial</SelectItem>
            <SelectItem value="paid">Pagadas</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      {listQ.isPending ? (
        <Skeleton className="h-48 w-full" />
      ) : invoices.length === 0 ? (
        <div className="py-14 text-center text-muted-foreground">
          <FileText className="mx-auto size-8 mb-2 opacity-30" />
          <p>Sin facturas registradas</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ref</TableHead>
              <TableHead>Proveedor</TableHead>
              <TableHead>No. Factura</TableHead>
              <TableHead>Fecha</TableHead>
              <TableHead>Vence</TableHead>
              <TableHead className="text-right">Total</TableHead>
              <TableHead>Estado</TableHead>
              <TableHead>Pago</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {invoices.map((inv) => {
              const overdue = inv.due_date && new Date(inv.due_date) < new Date() && inv.payment_status !== 'paid';
              return (
                <TableRow key={inv.id} className="cursor-pointer hover:bg-muted/40" onClick={() => setSelectedId(inv.id)}>
                  <TableCell className="font-mono text-xs">{inv.internal_ref}</TableCell>
                  <TableCell className="text-sm">{inv.supplier_name}</TableCell>
                  <TableCell className="text-sm">{inv.invoice_number}</TableCell>
                  <TableCell className="text-sm">{fmtDate(inv.invoice_date)}</TableCell>
                  <TableCell className={`text-sm ${overdue ? 'text-red-600 font-semibold' : ''}`}>
                    {inv.due_date ? fmtDate(inv.due_date) : '—'}
                  </TableCell>
                  <TableCell className="text-right font-semibold">{fmt(inv.total)}</TableCell>
                  <TableCell><Badge variant={STATUS_COLORS[inv.status]} className="text-xs">{STATUS_LABELS[inv.status]}</Badge></TableCell>
                  <TableCell className={`text-xs font-semibold ${PAY_COLORS[inv.payment_status]}`}>{inv.payment_status}</TableCell>
                  <TableCell>
                    {inv.attachment_name && (
                      <span title={inv.attachment_name}>
                        <FileText className="size-4 text-muted-foreground" />
                      </span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <CreateInvoiceDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={inv} slug={slug} />
      <InvoiceDetailDialog invoiceId={selectedId} open={selectedId !== null} onClose={() => setSelectedId(null)} slug={slug} />
    </div>
  );
}
