'use client';

import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { purchasesApi } from '@/lib/api/tenant.api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { DollarSign, AlertTriangle, CheckCircle, TrendingDown, CreditCard } from 'lucide-react';
import { toast } from 'sonner';

// ─── Types ────────────────────────────────────────────────────────────────────

interface VendorInvoice {
  id: number;
  invoice_number: string;
  supplier_id: number;
  supplier_name: string;
  total_amount: number;
  amount_paid: number;
  balance: number;
  due_date: string | null;
  issue_date: string;
  payment_status: 'pending' | 'partial' | 'paid';
  status: string;
  days_overdue?: number;
}

interface PayDialog {
  invoice: VendorInvoice;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (v: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(v);

function daysOverdue(dueDateStr: string | null): number {
  if (!dueDateStr) return 0;
  const due = new Date(dueDateStr);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.floor((today.getTime() - due.getTime()) / 86400000);
  return diff;
}

function agingBucket(days: number): string {
  if (days <= 0) return 'Al día';
  if (days <= 30) return '1–30 días';
  if (days <= 60) return '31–60 días';
  if (days <= 90) return '61–90 días';
  return '+90 días';
}

const BUCKET_ORDER = ['Al día', '1–30 días', '31–60 días', '61–90 días', '+90 días'];
const BUCKET_COLOR: Record<string, string> = {
  'Al día': 'text-green-600',
  '1–30 días': 'text-yellow-600',
  '31–60 días': 'text-orange-500',
  '61–90 días': 'text-red-500',
  '+90 días': 'text-red-700 font-bold',
};

// ─── Pay Dialog ───────────────────────────────────────────────────────────────

function PayInvoiceDialog({ invoice, onClose }: { invoice: VendorInvoice; onClose: () => void }) {
  const qc = useQueryClient();
  const [amount, setAmount] = useState(String(invoice.balance));
  const [method, setMethod] = useState('bank_transfer');
  const [reference, setReference] = useState('');

  const mut = useMutation({
    mutationFn: () => purchasesApi.payVendorInvoice(invoice.id, {
      amount: Number(amount),
      payment_method: method,
      reference,
      payment_date: new Date().toISOString().split('T')[0],
    }),
    onSuccess: () => {
      toast.success('Pago registrado');
      qc.invalidateQueries({ queryKey: ['payables'] });
      onClose();
    },
    onError: () => toast.error('Error al registrar el pago'),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Registrar pago</DialogTitle>
          <p className="text-sm text-gray-500">{invoice.invoice_number} — {invoice.supplier_name}</p>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Monto a pagar *</Label>
            <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} min={1} max={invoice.balance} />
            <p className="text-xs text-gray-400 mt-1">Saldo pendiente: {fmt(invoice.balance)}</p>
          </div>
          <div>
            <Label>Método de pago</Label>
            <Select value={method} onValueChange={(v) => setMethod(v ?? 'bank_transfer')}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="bank_transfer">Transferencia bancaria</SelectItem>
                <SelectItem value="check">Cheque</SelectItem>
                <SelectItem value="cash">Efectivo</SelectItem>
                <SelectItem value="online">Pago en línea</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label>Referencia / Comprobante</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} placeholder="N.° transferencia, cheque..." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mut.mutate()} disabled={!amount || Number(amount) <= 0 || mut.isPending}>
            {mut.isPending ? 'Registrando...' : 'Confirmar pago'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PayablesPage() {
  const [payDialog, setPayDialog] = useState<PayDialog | null>(null);
  const [viewMode, setViewMode] = useState<'aging' | 'supplier' | 'list'>('aging');
  const [supplierFilter, setSupplierFilter] = useState('');

  const { data: statsData } = useQuery({
    queryKey: ['payables', 'stats'],
    queryFn: () => purchasesApi.vendorInvoiceStats(),
  });

  const { data: invoicesData, isLoading } = useQuery({
    queryKey: ['payables', 'list'],
    queryFn: () => purchasesApi.vendorInvoices({ payment_status: 'pending', page: 1 }),
  });

  const { data: partialData } = useQuery({
    queryKey: ['payables', 'partial'],
    queryFn: () => purchasesApi.vendorInvoices({ payment_status: 'partial', page: 1 }),
  });

  const stats = (statsData as any)?.data ?? {};
  const pendingInvoices: VendorInvoice[] = (invoicesData as any)?.data?.data ?? (invoicesData as any)?.data ?? [];
  const partialInvoices: VendorInvoice[] = (partialData as any)?.data?.data ?? (partialData as any)?.data ?? [];

  const allInvoices = useMemo(() => {
    const all = [...pendingInvoices, ...partialInvoices].map((inv) => ({
      ...inv,
      balance: inv.balance ?? (inv.total_amount - inv.amount_paid),
      days_overdue: daysOverdue(inv.due_date),
    }));
    if (supplierFilter) return all.filter((i) => String(i.supplier_id) === supplierFilter);
    return all;
  }, [pendingInvoices, partialInvoices, supplierFilter]);

  // Aging buckets
  const buckets = useMemo(() => {
    const map: Record<string, { invoices: VendorInvoice[]; total: number }> = {};
    for (const key of BUCKET_ORDER) map[key] = { invoices: [], total: 0 };
    for (const inv of allInvoices) {
      const key = agingBucket(inv.days_overdue ?? 0);
      map[key].invoices.push(inv);
      map[key].total += inv.balance;
    }
    return map;
  }, [allInvoices]);

  // By supplier
  const bySupplier = useMemo(() => {
    const map: Record<string, { name: string; invoices: VendorInvoice[]; total: number; overdue: number }> = {};
    for (const inv of allInvoices) {
      const key = String(inv.supplier_id);
      if (!map[key]) map[key] = { name: inv.supplier_name, invoices: [], total: 0, overdue: 0 };
      map[key].invoices.push(inv);
      map[key].total += inv.balance;
      if ((inv.days_overdue ?? 0) > 0) map[key].overdue += inv.balance;
    }
    return Object.values(map).sort((a, b) => b.overdue - a.overdue);
  }, [allInvoices]);

  const totalPayable = allInvoices.reduce((s, i) => s + i.balance, 0);
  const totalOverdue = allInvoices.filter((i) => (i.days_overdue ?? 0) > 0).reduce((s, i) => s + i.balance, 0);
  const criticalOverdue = allInvoices.filter((i) => (i.days_overdue ?? 0) > 90).reduce((s, i) => s + i.balance, 0);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Cuentas por Pagar (CxP)</h1>
        <p className="text-sm text-gray-500">Aging de facturas de proveedores pendientes de pago</p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2"><DollarSign className="w-4 h-4 text-blue-500" /><span className="text-sm text-gray-500">Total CxP</span></div>
            <div className="text-xl font-bold text-blue-600 mt-1">{fmt(totalPayable)}</div>
            <div className="text-xs text-gray-400">{allInvoices.length} facturas</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-red-500" /><span className="text-sm text-gray-500">Vencido</span></div>
            <div className="text-xl font-bold text-red-600 mt-1">{fmt(totalOverdue)}</div>
            <div className="text-xs text-gray-400">{allInvoices.filter((i) => (i.days_overdue ?? 0) > 0).length} facturas vencidas</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2"><TrendingDown className="w-4 h-4 text-orange-500" /><span className="text-sm text-gray-500">Crítico (+90 días)</span></div>
            <div className="text-xl font-bold text-orange-600 mt-1">{fmt(criticalOverdue)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center gap-2"><CheckCircle className="w-4 h-4 text-green-500" /><span className="text-sm text-gray-500">Al día</span></div>
            <div className="text-xl font-bold text-green-600 mt-1">{fmt(totalPayable - totalOverdue)}</div>
          </CardContent>
        </Card>
      </div>

      {/* View toggle */}
      <div className="flex gap-2">
        {(['aging', 'supplier', 'list'] as const).map((mode) => (
          <button key={mode} onClick={() => setViewMode(mode)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === mode ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}>
            {mode === 'aging' ? 'Aging' : mode === 'supplier' ? 'Por Proveedor' : 'Lista Detallada'}
          </button>
        ))}
      </div>

      {/* Aging view */}
      {viewMode === 'aging' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {BUCKET_ORDER.map((bucket) => {
            const { invoices, total } = buckets[bucket];
            if (invoices.length === 0) return null;
            return (
              <Card key={bucket} className={bucket !== 'Al día' ? 'border-orange-200' : ''}>
                <CardHeader className="pb-2">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm">{bucket}</CardTitle>
                    <span className={`text-lg font-bold ${BUCKET_COLOR[bucket]}`}>{fmt(total)}</span>
                  </div>
                  <p className="text-xs text-gray-500">{invoices.length} factura{invoices.length !== 1 ? 's' : ''}</p>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    {invoices.map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between text-xs border-t pt-2">
                        <div>
                          <div className="font-medium">{inv.supplier_name}</div>
                          <div className="text-gray-500">{inv.invoice_number}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-semibold">{fmt(inv.balance)}</div>
                          <Button size="sm" variant="outline" className="h-6 text-xs mt-1 gap-1"
                            onClick={() => setPayDialog({ invoice: inv })}>
                            <CreditCard className="w-3 h-3" />Pagar
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
          {allInvoices.length === 0 && !isLoading && (
            <div className="col-span-3 text-center py-12 text-green-600">
              <CheckCircle className="w-10 h-10 mx-auto mb-2" />
              <p className="font-medium">¡No hay cuentas por pagar pendientes!</p>
            </div>
          )}
        </div>
      )}

      {/* By supplier view */}
      {viewMode === 'supplier' && (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="px-4 py-3">Proveedor</th>
                  <th className="text-right px-4 py-3">Facturas</th>
                  <th className="text-right px-4 py-3">Saldo total</th>
                  <th className="text-right px-4 py-3">Vencido</th>
                </tr>
              </thead>
              <tbody>
                {bySupplier.map((s) => (
                  <tr key={s.name} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium">{s.name}</td>
                    <td className="text-right px-4 py-3">{s.invoices.length}</td>
                    <td className="text-right px-4 py-3 font-semibold">{fmt(s.total)}</td>
                    <td className={`text-right px-4 py-3 font-medium ${s.overdue > 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {fmt(s.overdue)}
                    </td>
                  </tr>
                ))}
                {bySupplier.length === 0 && (
                  <tr><td colSpan={4} className="text-center py-8 text-gray-400">Sin facturas pendientes</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* List view */}
      {viewMode === 'list' && (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-gray-500">
                  <th className="px-4 py-3">Factura</th>
                  <th className="px-4 py-3">Proveedor</th>
                  <th className="text-right px-4 py-3">Total</th>
                  <th className="text-right px-4 py-3">Saldo</th>
                  <th className="px-4 py-3">Vencimiento</th>
                  <th className="text-right px-4 py-3">Días</th>
                  <th className="px-4 py-3">Estado</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {isLoading && Array.from({ length: 5 }).map((_, i) => (
                  <tr key={i}>{Array.from({ length: 8 }).map((__, j) => (
                    <td key={j} className="px-4 py-3"><div className="h-4 bg-gray-100 animate-pulse rounded" /></td>
                  ))}</tr>
                ))}
                {!isLoading && allInvoices.sort((a, b) => (b.days_overdue ?? 0) - (a.days_overdue ?? 0)).map((inv) => (
                  <tr key={inv.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs">{inv.invoice_number}</td>
                    <td className="px-4 py-3">{inv.supplier_name}</td>
                    <td className="text-right px-4 py-3">{fmt(inv.total_amount)}</td>
                    <td className="text-right px-4 py-3 font-semibold">{fmt(inv.balance)}</td>
                    <td className="px-4 py-3 text-xs">
                      {inv.due_date ? new Date(inv.due_date).toLocaleDateString('es-CO') : '—'}
                    </td>
                    <td className={`text-right px-4 py-3 text-xs font-medium ${(inv.days_overdue ?? 0) > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {(inv.days_overdue ?? 0) > 0 ? `+${inv.days_overdue}d` : (inv.days_overdue ?? 0) < 0 ? `${inv.days_overdue}d` : 'Hoy'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={inv.payment_status === 'partial' ? 'secondary' : 'outline'}>
                        {inv.payment_status === 'pending' ? 'Pendiente' : 'Parcial'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Button size="sm" variant="outline" className="h-7 text-xs gap-1"
                        onClick={() => setPayDialog({ invoice: inv })}>
                        <CreditCard className="w-3 h-3" />Pagar
                      </Button>
                    </td>
                  </tr>
                ))}
                {!isLoading && allInvoices.length === 0 && (
                  <tr><td colSpan={8} className="text-center py-8 text-gray-400">Sin facturas pendientes</td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {payDialog && <PayInvoiceDialog invoice={payDialog.invoice} onClose={() => setPayDialog(null)} />}
    </div>
  );
}
