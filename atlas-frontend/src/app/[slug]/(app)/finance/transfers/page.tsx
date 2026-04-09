'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notify } from '@/lib/notify';
import { financeApi, hrmApi } from '@/lib/api/tenant.api';
import {
  ArrowLeftRight, Plus, Download, CheckCircle, Send, Banknote, Trash2,
} from 'lucide-react';

import { Button }    from '@/components/ui/button';
import { Badge }     from '@/components/ui/badge';
import { Input }     from '@/components/ui/input';
import { Label }     from '@/components/ui/label';
import { Skeleton }  from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import {
  Card, CardContent,
} from '@/components/ui/card';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

// ─── Types ────────────────────────────────────────────────────────────────────

interface TransferBatch {
  id: number;
  batch_ref: string;
  description: string | null;
  type: string;
  bank_name: string | null;
  debit_account: string | null;
  scheduled_date: string;
  status: 'draft' | 'approved' | 'sent' | 'settled' | 'failed';
  total_amount: number;
  items_count: number;
  items_sent: number;
  items_failed: number;
  bank_file_format: string | null;
}

interface TransferItem {
  id: number;
  beneficiary_name: string;
  beneficiary_document: string | null;
  bank_name: string | null;
  account_number: string;
  account_type: string;
  amount: number;
  concept: string | null;
  status: string;
}

interface BatchDetail {
  batch: TransferBatch;
  items: TransferItem[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (v: number) => `$${Number(v).toLocaleString('es-CO', { minimumFractionDigits: 0 })}`;
const fmtDate = (d: string) => new Date(d).toLocaleDateString('es-CO');

const STATUS_COLORS: Record<TransferBatch['status'], 'secondary' | 'default' | 'destructive' | 'outline'> = {
  draft: 'secondary', approved: 'default', sent: 'default', settled: 'outline', failed: 'destructive',
};
const STATUS_LABELS: Record<TransferBatch['status'], string> = {
  draft: 'Borrador', approved: 'Aprobado', sent: 'Enviado', settled: 'Liquidado', failed: 'Fallido',
};
const TYPE_LABELS: Record<string, string> = {
  payroll: 'Nómina', supplier: 'Proveedor', refund: 'Reembolso', other: 'Otro',
};

// ─── Item row editor ──────────────────────────────────────────────────────────

interface ItemRow {
  beneficiary_name: string;
  beneficiary_document: string;
  bank_name: string;
  account_number: string;
  account_type: string;
  amount: string;
  concept: string;
}

function emptyItem(): ItemRow {
  return { beneficiary_name: '', beneficiary_document: '', bank_name: '', account_number: '', account_type: 'savings', amount: '', concept: '' };
}

// ─── Create batch dialog ──────────────────────────────────────────────────────

function CreateBatchDialog({ open, onClose, onCreated, slug }: {
  open: boolean; onClose: () => void; onCreated: () => void; slug: string;
}) {
  const [description, setDescription]   = useState('');
  const [type, setType]                 = useState('payroll');
  const [bankName, setBankName]         = useState('');
  const [debitAccount, setDebitAccount] = useState('');
  const [scheduledDate, setScheduledDate] = useState('');
  const [format, setFormat]             = useState('csv');
  const [items, setItems]               = useState<ItemRow[]>([emptyItem()]);

  const mut = useMutation({
    mutationFn: () => financeApi.createTransfer({
      description:       description || undefined,
      type,
      bank_name:         bankName || undefined,
      debit_account:     debitAccount || undefined,
      scheduled_date:    scheduledDate,
      bank_file_format:  format,
      items: items.map((i) => ({
        beneficiary_name:     i.beneficiary_name,
        beneficiary_document: i.beneficiary_document || undefined,
        bank_name:            i.bank_name || undefined,
        account_number:       i.account_number,
        account_type:         i.account_type,
        amount:               parseFloat(i.amount) || 0,
        concept:              i.concept || undefined,
      })),
    }),
    onSuccess: () => { notify.success('Lote creado'); onCreated(); onClose(); },
    onError:   () => notify.error('Error al crear lote'),
  });

  function updateItem(i: number, field: keyof ItemRow, val: string) {
    setItems((prev) => prev.map((r, idx) => idx === i ? { ...r, [field]: val } : r));
  }

  const total = items.reduce((acc, i) => acc + (parseFloat(i.amount) || 0), 0);
  const valid = scheduledDate && items.some((i) => i.beneficiary_name && i.account_number && parseFloat(i.amount) > 0);

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>Nuevo Lote de Transferencias</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Tipo <span className="text-destructive">*</span></Label>
              <Select value={type} onValueChange={(v) => setType(v ?? 'payroll')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Fecha programada <span className="text-destructive">*</span></Label>
              <Input type="date" value={scheduledDate} onChange={(e) => setScheduledDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Banco origen</Label>
              <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="Bancolombia" />
            </div>
            <div className="space-y-1.5">
              <Label>Cuenta débito</Label>
              <Input value={debitAccount} onChange={(e) => setDebitAccount(e.target.value)} placeholder="No. cuenta empresa" />
            </div>
            <div className="space-y-1.5">
              <Label>Formato archivo</Label>
              <Select value={format} onValueChange={(v) => setFormat(v ?? 'csv')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bancolombia">Bancolombia</SelectItem>
                  <SelectItem value="davivienda">Davivienda</SelectItem>
                  <SelectItem value="csv">CSV Genérico</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 col-span-2">
              <Label>Descripción</Label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Pago nómina enero 2026" />
            </div>
          </div>

          <Separator />

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="font-semibold">Beneficiarios</Label>
              <Button size="sm" variant="outline" onClick={() => setItems((p) => [...p, emptyItem()])}>
                <Plus className="size-3.5 mr-1" />Agregar
              </Button>
            </div>
            <div className="space-y-2">
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-1.5 items-end p-2 rounded border bg-muted/20">
                  <div className="col-span-3 space-y-1">
                    {i === 0 && <Label className="text-xs">Nombre</Label>}
                    <Input value={item.beneficiary_name} onChange={(e) => updateItem(i, 'beneficiary_name', e.target.value)}
                      className="text-xs h-7" placeholder="Nombre beneficiario" />
                  </div>
                  <div className="col-span-2 space-y-1">
                    {i === 0 && <Label className="text-xs">No. Cuenta</Label>}
                    <Input value={item.account_number} onChange={(e) => updateItem(i, 'account_number', e.target.value)}
                      className="text-xs h-7" placeholder="No. cuenta" />
                  </div>
                  <div className="col-span-2 space-y-1">
                    {i === 0 && <Label className="text-xs">Tipo</Label>}
                    <Select value={item.account_type} onValueChange={(v) => updateItem(i, 'account_type', v ?? 'savings')}>
                      <SelectTrigger className="h-7 text-xs"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="savings">Ahorros</SelectItem>
                        <SelectItem value="checking">Corriente</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="col-span-2 space-y-1">
                    {i === 0 && <Label className="text-xs">Monto</Label>}
                    <Input type="number" min={0} step={0.01} value={item.amount}
                      onChange={(e) => updateItem(i, 'amount', e.target.value)} className="text-xs h-7" />
                  </div>
                  <div className="col-span-2 space-y-1">
                    {i === 0 && <Label className="text-xs">Concepto</Label>}
                    <Input value={item.concept} onChange={(e) => updateItem(i, 'concept', e.target.value)}
                      className="text-xs h-7" placeholder="Pago nómina" />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    {items.length > 1 && (
                      <Button size="icon" variant="ghost" className="size-7 text-destructive"
                        onClick={() => setItems((p) => p.filter((_, idx) => idx !== i))}>×</Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="text-right text-sm font-semibold mt-2">Total: {fmt(total)}</div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending || !valid}>
            {mut.isPending ? 'Creando…' : 'Crear Lote'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Batch detail dialog ──────────────────────────────────────────────────────

function BatchDetailDialog({ batchId, open, onClose, slug }: {
  batchId: number | null; open: boolean; onClose: () => void; slug: string;
}) {
  const qc = useQueryClient();

  const detailQ = useQuery({
    queryKey: [slug, 'transfer-detail', batchId],
    queryFn: () => financeApi.getTransfer(batchId!),
    enabled: open && batchId !== null,
  });

  const data = detailQ.data as BatchDetail | undefined;
  const batch = data?.batch;
  const items = data?.items ?? [];

  function inv() {
    qc.invalidateQueries({ queryKey: [slug, 'transfer-detail', batchId] });
    qc.invalidateQueries({ queryKey: [slug, 'transfers'] });
  }

  const approveMut = useMutation({
    mutationFn: () => financeApi.approveTransfer(batchId!),
    onSuccess: () => { notify.success('Lote aprobado'); inv(); },
  });
  const sendMut = useMutation({
    mutationFn: () => financeApi.sendTransfer(batchId!),
    onSuccess: () => { notify.success('Marcado como enviado'); inv(); },
  });
  const settleMut = useMutation({
    mutationFn: () => financeApi.settleTransfer(batchId!),
    onSuccess: () => { notify.success('Lote liquidado'); inv(); },
  });

  function handleExport() {
    financeApi.exportTransfer(batchId!).then((res) => {
      const blob = new Blob([res.data as BlobPart]);
      const cd   = String((res.headers as Record<string, string>)['content-disposition'] ?? '');
      const name = cd.match(/filename="(.+)"/)?.[1] ?? `remesa_${batchId}.csv`;
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = name; a.click();
      URL.revokeObjectURL(url);
    }).catch(() => notify.error('Error al exportar'));
  }

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowLeftRight className="size-4" />
            {batch ? `${batch.batch_ref}` : '…'}
          </DialogTitle>
        </DialogHeader>

        {detailQ.isPending ? <Skeleton className="h-48 w-full" /> : !batch ? (
          <p className="text-destructive text-sm">No encontrado.</p>
        ) : (
          <div className="space-y-4">
            {/* Info */}
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div><span className="text-muted-foreground">Tipo:</span> {TYPE_LABELS[batch.type] ?? batch.type}</div>
              <div><span className="text-muted-foreground">Fecha:</span> {fmtDate(batch.scheduled_date)}</div>
              <div><span className="text-muted-foreground">Formato:</span> {batch.bank_file_format ?? '—'}</div>
              <div><span className="text-muted-foreground">Banco:</span> {batch.bank_name ?? '—'}</div>
              <div><span className="text-muted-foreground">Cuenta:</span> {batch.debit_account ?? '—'}</div>
              <div><span className="text-muted-foreground">Total:</span> <strong>{fmt(batch.total_amount)}</strong></div>
            </div>

            <div className="flex items-center gap-2">
              <Badge variant={STATUS_COLORS[batch.status]}>{STATUS_LABELS[batch.status]}</Badge>
              <span className="text-xs text-muted-foreground">{batch.items_count} beneficiarios</span>
              {batch.items_failed > 0 && <span className="text-xs text-red-600">{batch.items_failed} fallidos</span>}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2">
              {batch.status === 'draft' && (
                <Button size="sm" onClick={() => approveMut.mutate()} disabled={approveMut.isPending}>
                  <CheckCircle className="size-3.5 mr-1" />Aprobar
                </Button>
              )}
              {batch.status === 'approved' && (
                <Button size="sm" onClick={() => sendMut.mutate()} disabled={sendMut.isPending}>
                  <Send className="size-3.5 mr-1" />Marcar enviado
                </Button>
              )}
              {batch.status === 'sent' && (
                <Button size="sm" onClick={() => settleMut.mutate()} disabled={settleMut.isPending}>
                  <Banknote className="size-3.5 mr-1" />Liquidar
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={handleExport}>
                <Download className="size-3.5 mr-1" />Exportar archivo banco
              </Button>
            </div>

            <Separator />

            {/* Items table */}
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Beneficiario</TableHead>
                  <TableHead>No. Cuenta</TableHead>
                  <TableHead>Tipo</TableHead>
                  <TableHead>Concepto</TableHead>
                  <TableHead className="text-right">Monto</TableHead>
                  <TableHead>Estado</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <TableRow key={item.id}>
                    <TableCell className="text-sm">{item.beneficiary_name}</TableCell>
                    <TableCell className="font-mono text-xs">{item.account_number}</TableCell>
                    <TableCell className="text-xs">{item.account_type === 'checking' ? 'Corriente' : 'Ahorros'}</TableCell>
                    <TableCell className="text-xs">{item.concept ?? '—'}</TableCell>
                    <TableCell className="text-right font-semibold">{fmt(item.amount)}</TableCell>
                    <TableCell>
                      <Badge variant={item.status === 'settled' ? 'outline' : item.status === 'failed' ? 'destructive' : 'secondary'} className="text-xs">
                        {item.status}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PAGE
// ══════════════════════════════════════════════════════════════════════════════

export default function TransfersPage() {
  const { slug } = useParams<{ slug: string }>();
  const qc = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [fromPayrollOpen, setFromPayrollOpen] = useState(false);
  const [payrollPeriodId, setPayrollPeriodId] = useState('');
  const [payrollFormat, setPayrollFormat] = useState('csv');
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterType, setFilterType]     = useState('');

  const listQ = useQuery({
    queryKey: [slug, 'transfers', filterStatus, filterType],
    queryFn: () => financeApi.transfers({
      status: filterStatus || undefined,
      type:   filterType || undefined,
    }),
  });

  const batches = ((listQ.data as { data?: TransferBatch[] })?.data ?? []) as TransferBatch[];

  function inv() {
    qc.invalidateQueries({ queryKey: [slug, 'transfers'] });
  }

  const deleteMut = useMutation({
    mutationFn: (id: number) => financeApi.deleteTransfer(id),
    onSuccess: () => { notify.success('Lote eliminado'); inv(); },
    onError: () => notify.error('No se puede eliminar'),
  });

  const fromPayrollMut = useMutation({
    mutationFn: () => financeApi.fromPayroll({
      payroll_period_id: Number(payrollPeriodId),
      bank_file_format: payrollFormat,
    }),
    onSuccess: () => {
      notify.success('Lote de nómina generado');
      setFromPayrollOpen(false); setPayrollPeriodId('');
      inv();
    },
    onError: () => notify.error('Error al generar lote de nómina'),
  });

  const totalAmount = batches.reduce((a, b) => a + Number(b.total_amount), 0);

  return (
    <div className="space-y-4 p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold flex items-center gap-2">
            <ArrowLeftRight className="size-5" /> Transferencias Masivas
          </h1>
          <p className="text-sm text-muted-foreground">Remesas y pagos masivos a beneficiarios</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setFromPayrollOpen(true)}>
            <Banknote className="mr-1 size-4" />Desde Nómina
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus className="mr-1 size-4" />Nuevo Lote
          </Button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Lotes</p>
            <p className="text-2xl font-bold">{batches.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Beneficiarios</p>
            <p className="text-2xl font-bold">{batches.reduce((a, b) => a + b.items_count, 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <p className="text-xs text-muted-foreground">Monto total</p>
            <p className="text-2xl font-bold">{fmt(totalAmount)}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex gap-2">
        <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v === 'all' ? '' : (v ?? ''))}>
          <SelectTrigger className="h-8 w-36 text-xs"><SelectValue placeholder="Estado" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {(Object.entries(STATUS_LABELS) as [TransferBatch['status'], string][]).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={filterType} onValueChange={(v) => setFilterType(v === 'all' ? '' : (v ?? ''))}>
          <SelectTrigger className="h-8 w-32 text-xs"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {Object.entries(TYPE_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      <div className="flex flex-col gap-3">
        {listQ.isPending
          ? Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-20 rounded-2xl bg-muted animate-pulse" />)
          : batches.length === 0
          ? (
            <div className="flex flex-col items-center justify-center py-14 gap-3 text-muted-foreground">
              <div className="size-14 rounded-full bg-muted flex items-center justify-center">
                <ArrowLeftRight className="size-7 opacity-40" />
              </div>
              <p className="font-medium">Sin lotes de transferencias</p>
            </div>
          )
          : batches.map((b) => (
            <button key={b.id} onClick={() => setSelectedId(b.id)}
              className="rounded-2xl border bg-card p-4 flex items-center gap-4 hover:shadow-sm hover:border-primary/20 transition-all text-left w-full">
              <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                <ArrowLeftRight className="size-4 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-sm font-mono">{b.batch_ref}</p>
                  <span className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{TYPE_LABELS[b.type] ?? b.type}</span>
                </div>
                <p className="text-xs text-muted-foreground">{b.description ?? '—'} · {fmtDate(b.scheduled_date)}</p>
              </div>
              <div className="hidden sm:flex items-center gap-4 text-sm flex-shrink-0">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Beneficiarios</p>
                  <p className="font-medium">{b.items_count}</p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="font-semibold">{fmt(b.total_amount)}</p>
                </div>
              </div>
              <Badge variant={STATUS_COLORS[b.status]} className="text-xs flex-shrink-0">{STATUS_LABELS[b.status]}</Badge>
              {b.status === 'draft' && (
                <div onClick={(e) => e.stopPropagation()} className="flex-shrink-0">
                  <Button size="icon" variant="ghost" className="size-8 text-destructive"
                    onClick={() => { if (confirm('¿Eliminar lote?')) deleteMut.mutate(b.id); }}>
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              )}
            </button>
          ))
        }
      </div>

      <CreateBatchDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={inv} slug={slug} />
      <BatchDetailDialog batchId={selectedId} open={selectedId !== null} onClose={() => setSelectedId(null)} slug={slug} />

      {/* Dialog: Desde nómina */}
      <FromPayrollDialog
        open={fromPayrollOpen}
        onClose={() => setFromPayrollOpen(false)}
        payrollPeriodId={payrollPeriodId}
        setPayrollPeriodId={setPayrollPeriodId}
        payrollFormat={payrollFormat}
        setPayrollFormat={setPayrollFormat}
        onGenerate={() => fromPayrollMut.mutate()}
        isGenerating={fromPayrollMut.isPending}
      />
    </div>
  );
}

// ─── From Payroll Dialog ──────────────────────────────────────────────────────

function FromPayrollDialog({
  open, onClose, payrollPeriodId, setPayrollPeriodId, payrollFormat, setPayrollFormat, onGenerate, isGenerating,
}: {
  open: boolean; onClose: () => void;
  payrollPeriodId: string; setPayrollPeriodId: (v: string) => void;
  payrollFormat: string; setPayrollFormat: (v: string) => void;
  onGenerate: () => void; isGenerating: boolean;
}) {
  const periodsQ = useQuery({
    queryKey: ['payroll-periods-for-transfer'],
    queryFn: async () => {
      const r = await hrmApi.payrolls();
      return (r.data as any)?.data ?? [];
    },
    enabled: open,
  });
  const periods = (periodsQ.data ?? []) as any[];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Banknote className="size-4" />Generar lote desde nómina
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <p className="text-muted-foreground">
            Crea automáticamente un lote de transferencias con todos los empleados del período de nómina seleccionado.
          </p>
          <div className="space-y-1.5">
            <Label>Período de nómina *</Label>
            <Select value={payrollPeriodId} onValueChange={(v) => setPayrollPeriodId(v ?? '')}>
              <SelectTrigger><SelectValue placeholder="Seleccionar período..." /></SelectTrigger>
              <SelectContent>
                {periods.filter((p: any) => p.status === 'approved' || p.status === 'paid').map((p: any) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.employee?.name} — {new Date(p.period_start).toLocaleDateString('es-CO')} al {new Date(p.period_end).toLocaleDateString('es-CO')}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Formato de archivo bancario</Label>
            <Select value={payrollFormat} onValueChange={(v) => setPayrollFormat(v ?? 'csv')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="csv">CSV genérico</SelectItem>
                <SelectItem value="bancolombia">Bancolombia (ACH)</SelectItem>
                <SelectItem value="davivienda">Davivienda</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={onGenerate} disabled={!payrollPeriodId || isGenerating}>
            {isGenerating ? 'Generando...' : 'Generar lote'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
