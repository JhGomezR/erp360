'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import {
  BookOpen, TrendingUp, TrendingDown, Scale,
  Download, Lock, Unlock, Plus, Trash2, Send, RefreshCw,
} from 'lucide-react';
import { notify } from '@/lib/notify';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { accountingApi, dianApi, setTenantSlug, type RadianEvent as RadianEventApi } from '@/lib/api/tenant.api';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Account {
  id: number; code: string; name: string;
  type: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  balance: number; is_active: boolean;
}
interface JournalEntry {
  id: number; reference: string; description: string;
  date: string; total_debit: number; total_credit: number;
  status: 'draft' | 'posted'; created_at: string;
}
interface AccountingPeriod {
  id: number; year: number; month: number | null; name: string;
  date_from: string; date_to: string; status: 'open' | 'closed';
  closed_at?: string;
}
interface TaxRetention {
  id: number; name: string; type: string; type_label: string;
  rate: number; base_minimum: number; concept_code?: string;
  applies_to_purchases: boolean; applies_to_sales: boolean; is_active: boolean;
}
type RadianEvent = RadianEventApi;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TYPE_LABEL: Record<string, string> = {
  asset: 'Activo', liability: 'Pasivo', equity: 'Patrimonio',
  revenue: 'Ingreso', expense: 'Gasto', cost: 'Costo',
};
const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

async function downloadBlob(apiFn: () => Promise<{ data: Blob }>, filename: string) {
  const res = await apiFn();
  const url = URL.createObjectURL(res.data);
  const a = document.createElement('a'); a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function AccountingPage() {
  const params = useParams();
  const slug   = params.slug as string;
  const qc     = useQueryClient();
  setTenantSlug(slug);

  const [tab, setTab] = useState<'accounts' | 'journal' | 'reports' | 'periods' | 'retentions' | 'radian'>('accounts');

  // Report controls
  const [reportType, setReportType] = useState<'balance-sheet' | 'income-statement' | 'trial-balance'>('income-statement');
  const [reportDate, setReportDate]     = useState(new Date().toISOString().split('T')[0]);
  const [reportFrom, setReportFrom]     = useState(new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0]);
  const [reportTo, setReportTo]         = useState(new Date().toISOString().split('T')[0]);
  const [exporting, setExporting]       = useState(false);

  // Period dialog
  const [closeDialog, setCloseDialog]   = useState<AccountingPeriod | null>(null);
  const [generateYear, setGenerateYear] = useState(new Date().getFullYear());

  // Retention dialog
  const [retentionDialog, setRetentionDialog] = useState(false);
  const [retForm, setRetForm] = useState({ name: '', type: 'retefte', concept_code: '', rate: '', base_minimum: '', applies_to_purchases: true, applies_to_sales: false });

  // RADIAN dialog
  const [radianDialog, setRadianDialog] = useState(false);
  const [radForm, setRadForm] = useState({ cufe: '', invoice_number: '', event_type: 'acuse_recibo', notes: '' });

  // ─── Queries ────────────────────────────────────────────────────────────────
  const { data: accounts, isLoading: loadingAccounts } = useQuery({
    queryKey: ['chart-of-accounts', slug],
    queryFn: async () => {
      const r = await accountingApi.accounts();
      return (r.data as any)?.data ?? (r.data as Account[]) ?? [];
    },
    enabled: tab === 'accounts',
  });

  const { data: entries, isLoading: loadingEntries } = useQuery({
    queryKey: ['journal-entries', slug],
    queryFn: async () => {
      const r = await accountingApi.journalEntries();
      return (r.data as any)?.data ?? (r.data as JournalEntry[]) ?? [];
    },
    enabled: tab === 'journal',
  });

  const { data: report, isLoading: loadingReport, refetch: fetchReport } = useQuery({
    queryKey: ['financial-report', slug, reportType, reportDate, reportFrom, reportTo],
    queryFn: async () => {
      const params = reportType === 'income-statement'
        ? { date_from: reportFrom, date_to: reportTo }
        : { date: reportDate };
      const r = await accountingApi.financialReport(reportType, params);
      return r.data as any;
    },
    enabled: tab === 'reports',
  });

  const { data: periods, isLoading: loadingPeriods } = useQuery({
    queryKey: ['accounting-periods', slug],
    queryFn: async () => {
      const r = await accountingApi.periods();
      return (r.data as any)?.data ?? (r.data as AccountingPeriod[]) ?? [];
    },
    enabled: tab === 'periods',
  });

  const { data: retentions, isLoading: loadingRetentions } = useQuery({
    queryKey: ['tax-retentions', slug],
    queryFn: async () => {
      const r = await accountingApi.retentions();
      return r.data as TaxRetention[];
    },
    enabled: tab === 'retentions',
  });

  const { data: radianEvents, isLoading: loadingRadian } = useQuery<RadianEvent[]>({
    queryKey: ['radian-events', slug],
    queryFn: async () => {
      const r = await dianApi.radianList();
      return (r.data as unknown as { data: RadianEvent[] }).data ?? [];
    },
    enabled: tab === 'radian',
  });

  // ─── Mutations ──────────────────────────────────────────────────────────────
  const generateYearMut = useMutation({
    mutationFn: (y: number) => accountingApi.generateYear(y),
    onSuccess: () => { notify.success('Períodos generados'); qc.invalidateQueries({ queryKey: ['accounting-periods', slug] }); },
    onError: (e) => notify.error(e, 'Error'),
  });

  const closePeriodMut = useMutation({
    mutationFn: ({ id, notes }: { id: number; notes?: string }) => accountingApi.closePeriod(id, notes),
    onSuccess: () => { notify.success('Período cerrado'); qc.invalidateQueries({ queryKey: ['accounting-periods', slug] }); setCloseDialog(null); },
    onError: (e) => notify.error(e, 'Error'),
  });

  const reopenPeriodMut = useMutation({
    mutationFn: (id: number) => accountingApi.reopenPeriod(id),
    onSuccess: () => { notify.success('Período reabierto'); qc.invalidateQueries({ queryKey: ['accounting-periods', slug] }); },
    onError: (e) => notify.error(e, 'Error'),
  });

  const createRetentionMut = useMutation({
    mutationFn: () => accountingApi.createRetention({
      ...retForm,
      rate: Number(retForm.rate),
      base_minimum: Number(retForm.base_minimum),
    }),
    onSuccess: () => { notify.success('Retención creada'); qc.invalidateQueries({ queryKey: ['tax-retentions', slug] }); setRetentionDialog(false); },
    onError: (e) => notify.error(e, 'Error'),
  });

  const deleteRetentionMut = useMutation({
    mutationFn: (id: number) => accountingApi.deleteRetention(id),
    onSuccess: () => { notify.success('Eliminada'); qc.invalidateQueries({ queryKey: ['tax-retentions', slug] }); },
    onError: (err) => notify.error(err, 'Error al eliminar'),
  });

  const createRadianMut = useMutation({
    mutationFn: () => dianApi.radianStore({
      cufe: radForm.cufe,
      invoice_number: radForm.invoice_number || undefined,
      event_type: radForm.event_type as RadianEvent['event_type'],
      notes: radForm.notes || undefined,
    }),
    onSuccess: () => {
      notify.success('Evento RADIAN enviado');
      setRadianDialog(false);
      setRadForm({ cufe: '', invoice_number: '', event_type: 'ApplicationResponse', notes: '' });
      qc.invalidateQueries({ queryKey: ['radian-events', slug] });
    },
    onError: (e) => notify.error(e, 'Error al enviar'),
  });

  const resendRadianMut = useMutation({
    mutationFn: (id: number) => dianApi.radianResend(id),
    onSuccess: () => { notify.success('Reenviado'); qc.invalidateQueries({ queryKey: ['radian-events', slug] }); },
    onError: (err) => notify.error(err, 'Error al reenviar'),
  });

  // ─── Summary ────────────────────────────────────────────────────────────────
  const totalAssets   = accounts?.filter((a: Account) => a.type === 'asset').reduce((s: number, a: Account) => s + a.balance, 0) ?? 0;
  const totalRevenue  = accounts?.filter((a: Account) => a.type === 'revenue').reduce((s: number, a: Account) => s + a.balance, 0) ?? 0;
  const totalExpenses = accounts?.filter((a: Account) => a.type === 'expense').reduce((s: number, a: Account) => s + a.balance, 0) ?? 0;

  const TABS = [
    ['accounts', 'Plan de Cuentas'], ['journal', 'Asientos'],
    ['reports', 'Reportes Financieros'], ['periods', 'Períodos'],
    ['retentions', 'Retenciones'], ['radian', 'RADIAN'],
  ] as const;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Contabilidad</h1>
        <p className="text-muted-foreground text-sm">Plan de cuentas, asientos y reportes financieros</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          { label: 'Total Activos', value: fmt(totalAssets), icon: Scale, color: 'text-blue-600' },
          { label: 'Ingresos', value: fmt(totalRevenue), icon: TrendingUp, color: 'text-green-600' },
          { label: 'Gastos', value: fmt(totalExpenses), icon: TrendingDown, color: 'text-red-600' },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label}>
            <CardHeader className="flex flex-row items-center justify-between pb-2 space-y-0">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className={`size-4 ${color}`} />
            </CardHeader>
            <CardContent><div className="text-xl font-bold">{value}</div></CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b overflow-x-auto">
        {TABS.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`whitespace-nowrap px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}>{label}</button>
        ))}
      </div>

      {/* ── Plan de cuentas ── */}
      {tab === 'accounts' && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Código</th>
                <th className="text-left px-4 py-3 font-medium">Nombre</th>
                <th className="text-left px-4 py-3 font-medium">Tipo</th>
                <th className="text-right px-4 py-3 font-medium">Saldo</th>
                <th className="text-left px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loadingAccounts
                ? Array.from({ length: 8 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 5 }).map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>)}</tr>
                  ))
                : (accounts ?? []).map((a: Account) => (
                    <tr key={a.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs">{a.code}</td>
                      <td className="px-4 py-3 font-medium">{a.name}</td>
                      <td className="px-4 py-3"><Badge variant="secondary">{TYPE_LABEL[a.type] ?? a.type}</Badge></td>
                      <td className={`px-4 py-3 text-right font-mono ${a.balance < 0 ? 'text-destructive' : ''}`}>{fmt(a.balance)}</td>
                      <td className="px-4 py-3"><Badge variant={a.is_active ? 'default' : 'secondary'}>{a.is_active ? 'Activo' : 'Inactivo'}</Badge></td>
                    </tr>
                  ))}
            </tbody>
          </table>
          {!loadingAccounts && (accounts ?? []).length === 0 && (
            <div className="py-12 text-center"><BookOpen className="size-8 mx-auto text-muted-foreground mb-2" /><p className="text-muted-foreground text-sm">No hay cuentas</p></div>
          )}
        </div>
      )}

      {/* ── Asientos ── */}
      {tab === 'journal' && (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="text-left px-4 py-3 font-medium">Referencia</th>
                <th className="text-left px-4 py-3 font-medium">Descripción</th>
                <th className="text-left px-4 py-3 font-medium">Fecha</th>
                <th className="text-right px-4 py-3 font-medium">Débito</th>
                <th className="text-right px-4 py-3 font-medium">Crédito</th>
                <th className="text-left px-4 py-3 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {loadingEntries
                ? Array.from({ length: 6 }).map((_, i) => (
                    <tr key={i}>{Array.from({ length: 6 }).map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>)}</tr>
                  ))
                : (entries ?? []).map((e: JournalEntry) => (
                    <tr key={e.id} className="hover:bg-muted/30">
                      <td className="px-4 py-3 font-mono text-xs">{e.reference}</td>
                      <td className="px-4 py-3 text-muted-foreground truncate max-w-xs">{e.description}</td>
                      <td className="px-4 py-3">{new Date(e.date).toLocaleDateString('es-CO')}</td>
                      <td className="px-4 py-3 text-right font-mono">{fmt(e.total_debit)}</td>
                      <td className="px-4 py-3 text-right font-mono">{fmt(e.total_credit)}</td>
                      <td className="px-4 py-3"><Badge variant={e.status === 'posted' ? 'default' : 'secondary'}>{e.status === 'posted' ? 'Contabilizado' : 'Borrador'}</Badge></td>
                    </tr>
                  ))}
            </tbody>
          </table>
        </div>
      )}

      {/* ── Reportes Financieros ── */}
      {tab === 'reports' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3 p-4 bg-muted/30 rounded-lg">
            <div className="space-y-1.5">
              <Label>Tipo de reporte</Label>
              <Select value={reportType} onValueChange={(v) => setReportType(v as typeof reportType)}>
                <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="income-statement">Estado de Resultados</SelectItem>
                  <SelectItem value="balance-sheet">Balance General</SelectItem>
                  <SelectItem value="trial-balance">Balance de Comprobación</SelectItem>
                </SelectContent>
              </Select>
            </div>
            {reportType === 'income-statement' ? (
              <>
                <div className="space-y-1.5"><Label>Desde</Label><Input type="date" value={reportFrom} onChange={(e) => setReportFrom(e.target.value)} className="w-40" /></div>
                <div className="space-y-1.5"><Label>Hasta</Label><Input type="date" value={reportTo} onChange={(e) => setReportTo(e.target.value)} className="w-40" /></div>
              </>
            ) : (
              <div className="space-y-1.5"><Label>Fecha de corte</Label><Input type="date" value={reportDate} onChange={(e) => setReportDate(e.target.value)} className="w-40" /></div>
            )}
            <Button size="sm" onClick={() => fetchReport()}>Generar</Button>
            <Button variant="outline" size="sm" className="gap-2" disabled={exporting}
              onClick={async () => {
                setExporting(true);
                try {
                  const p = reportType === 'income-statement'
                    ? { date_from: reportFrom, date_to: reportTo }
                    : { date: reportDate };
                  await downloadBlob(
                    () => accountingApi.exportFinancialReport(reportType, p) as any,
                    `${reportType}_${reportDate}.csv`,
                  );
                } finally { setExporting(false); }
              }}>
              <Download className="size-4" />{exporting ? 'Exportando...' : 'CSV'}
            </Button>
          </div>

          {loadingReport && <div className="py-10 text-center text-muted-foreground text-sm">Generando reporte...</div>}

          {report && !loadingReport && (
            <div className="space-y-4">
              {/* Trial Balance */}
              {reportType === 'trial-balance' && report.rows && (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/50"><tr>
                      <th className="text-left px-4 py-3 font-medium">Código</th>
                      <th className="text-left px-4 py-3 font-medium">Cuenta</th>
                      <th className="text-right px-4 py-3 font-medium">Débito</th>
                      <th className="text-right px-4 py-3 font-medium">Crédito</th>
                      <th className="text-right px-4 py-3 font-medium">Saldo</th>
                    </tr></thead>
                    <tbody className="divide-y">
                      {report.rows.map((r: any) => (
                        <tr key={r.code} className="hover:bg-muted/30">
                          <td className="px-4 py-2 font-mono text-xs">{r.code}</td>
                          <td className="px-4 py-2">{r.name}</td>
                          <td className="px-4 py-2 text-right font-mono">{fmt(r.total_debit)}</td>
                          <td className="px-4 py-2 text-right font-mono">{fmt(r.total_credit)}</td>
                          <td className="px-4 py-2 text-right font-mono font-medium">{fmt(r.balance)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              {/* Income Statement */}
              {reportType === 'income-statement' && (
                <div className="grid sm:grid-cols-3 gap-4">
                  {[
                    { label: 'Ingresos', value: report.total_revenue },
                    { label: 'Costos', value: report.total_costs },
                    { label: 'Utilidad Neta', value: report.net_income },
                  ].map(({ label, value }) => (
                    <Card key={label}>
                      <CardHeader className="pb-2"><CardTitle className="text-xs text-muted-foreground">{label}</CardTitle></CardHeader>
                      <CardContent><div className={`text-xl font-bold ${value < 0 ? 'text-destructive' : ''}`}>{fmt(value ?? 0)}</div></CardContent>
                    </Card>
                  ))}
                </div>
              )}
              {/* Balance Sheet */}
              {reportType === 'balance-sheet' && (
                <div className="grid sm:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Total Activos</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold">{fmt(report.total_assets ?? 0)}</div></CardContent>
                  </Card>
                  <Card>
                    <CardHeader className="pb-2"><CardTitle className="text-sm">Pasivos + Patrimonio</CardTitle></CardHeader>
                    <CardContent><div className="text-2xl font-bold">{fmt(report.total_liabilities_equity ?? 0)}</div></CardContent>
                  </Card>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Períodos contables ── */}
      {tab === 'periods' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Input type="number" value={generateYear} min={2020} max={2099}
              onChange={(e) => setGenerateYear(Number(e.target.value))} className="w-28" />
            <Button size="sm" className="gap-2"
              onClick={() => generateYearMut.mutate(generateYear)}
              disabled={generateYearMut.isPending}>
              <Plus className="size-4" />Generar períodos {generateYear}
            </Button>
          </div>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50"><tr>
                <th className="text-left px-4 py-3 font-medium">Período</th>
                <th className="text-left px-4 py-3 font-medium">Desde</th>
                <th className="text-left px-4 py-3 font-medium">Hasta</th>
                <th className="text-center px-4 py-3 font-medium">Estado</th>
                <th className="px-4 py-3 font-medium">Acción</th>
              </tr></thead>
              <tbody className="divide-y">
                {loadingPeriods
                  ? Array.from({ length: 6 }).map((_, i) => <tr key={i}>{Array.from({ length: 5 }).map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>)}</tr>)
                  : (periods ?? []).map((p: AccountingPeriod) => (
                      <tr key={p.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{p.name}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(p.date_from).toLocaleDateString('es-CO')}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(p.date_to).toLocaleDateString('es-CO')}</td>
                        <td className="px-4 py-3 text-center">
                          <Badge variant={p.status === 'open' ? 'default' : 'secondary'}>
                            {p.status === 'open' ? 'Abierto' : 'Cerrado'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {p.status === 'open' ? (
                            <Button variant="outline" size="sm" className="gap-1 h-7 text-xs"
                              onClick={() => setCloseDialog(p)}>
                              <Lock className="size-3" />Cerrar
                            </Button>
                          ) : (
                            <Button variant="ghost" size="sm" className="gap-1 h-7 text-xs"
                              onClick={() => reopenPeriodMut.mutate(p.id)}
                              disabled={reopenPeriodMut.isPending}>
                              <Unlock className="size-3" />Reabrir
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
            {!loadingPeriods && (periods ?? []).length === 0 && (
              <div className="py-10 text-center text-muted-foreground text-sm">No hay períodos. Genera los del año.</div>
            )}
          </div>
        </div>
      )}

      {/* ── Retenciones ── */}
      {tab === 'retentions' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" className="gap-2" onClick={() => setRetentionDialog(true)}>
              <Plus className="size-4" />Nueva retención
            </Button>
          </div>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50"><tr>
                <th className="text-left px-4 py-3 font-medium">Nombre</th>
                <th className="text-left px-4 py-3 font-medium">Tipo</th>
                <th className="text-left px-4 py-3 font-medium">Concepto</th>
                <th className="text-right px-4 py-3 font-medium">Tarifa</th>
                <th className="text-right px-4 py-3 font-medium">Base mín.</th>
                <th className="text-center px-4 py-3 font-medium">Compras</th>
                <th className="text-center px-4 py-3 font-medium">Ventas</th>
                <th className="px-4 py-3"></th>
              </tr></thead>
              <tbody className="divide-y">
                {loadingRetentions
                  ? Array.from({ length: 4 }).map((_, i) => <tr key={i}>{Array.from({ length: 8 }).map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>)}</tr>)
                  : (retentions ?? []).map((r: TaxRetention) => (
                      <tr key={r.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{r.name}</td>
                        <td className="px-4 py-3"><Badge variant="secondary">{r.type_label}</Badge></td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{r.concept_code ?? '—'}</td>
                        <td className="px-4 py-3 text-right font-mono">{(r.rate * 100).toFixed(2)}%</td>
                        <td className="px-4 py-3 text-right">{fmt(r.base_minimum)}</td>
                        <td className="px-4 py-3 text-center">{r.applies_to_purchases ? '✓' : '—'}</td>
                        <td className="px-4 py-3 text-center">{r.applies_to_sales ? '✓' : '—'}</td>
                        <td className="px-4 py-3">
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                            onClick={() => deleteRetentionMut.mutate(r.id)}>
                            <Trash2 className="size-3" />
                          </Button>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
            {!loadingRetentions && (retentions ?? []).length === 0 && (
              <div className="py-10 text-center text-muted-foreground text-sm">No hay retenciones configuradas</div>
            )}
          </div>
        </div>
      )}

      {/* ── RADIAN ── */}
      {tab === 'radian' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button size="sm" className="gap-2" onClick={() => setRadianDialog(true)}>
              <Plus className="size-4" />Nuevo evento
            </Button>
          </div>
          <div className="border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50"><tr>
                <th className="text-left px-4 py-3 font-medium">CUFE</th>
                <th className="text-left px-4 py-3 font-medium">Factura</th>
                <th className="text-left px-4 py-3 font-medium">Tipo evento</th>
                <th className="text-left px-4 py-3 font-medium">Estado</th>
                <th className="text-left px-4 py-3 font-medium">Enviado</th>
                <th className="px-4 py-3"></th>
              </tr></thead>
              <tbody className="divide-y">
                {loadingRadian
                  ? Array.from({ length: 4 }).map((_, i) => <tr key={i}>{Array.from({ length: 6 }).map((_, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>)}</tr>)
                  : (radianEvents ?? []).map((ev: RadianEvent) => (
                      <tr key={ev.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-mono text-xs max-w-[180px] truncate" title={ev.cufe}>{ev.cufe}</td>
                        <td className="px-4 py-3 text-xs">{ev.invoice_number ?? '—'}</td>
                        <td className="px-4 py-3"><Badge variant="secondary">{ev.event_type}</Badge></td>
                        <td className="px-4 py-3">
                          <Badge variant={ev.status === 'sent' ? 'default' : ev.status === 'failed' ? 'outline' : 'secondary'}>
                            {ev.status === 'sent' ? 'Enviado' : ev.status === 'failed' ? 'Fallido' : ev.status}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">
                          {ev.sent_at ? new Date(ev.sent_at).toLocaleDateString('es-CO') : '—'}
                        </td>
                        <td className="px-4 py-3">
                          <Button variant="outline" size="sm" className="gap-1 h-7 text-xs"
                            disabled={resendRadianMut.isPending}
                            onClick={() => resendRadianMut.mutate(ev.id)}>
                            <RefreshCw className="size-3" />Reenviar
                          </Button>
                        </td>
                      </tr>
                    ))}
              </tbody>
            </table>
            {!loadingRadian && (radianEvents ?? []).length === 0 && (
              <div className="py-10 text-center text-muted-foreground text-sm">
                <Send className="size-8 mx-auto mb-2 opacity-30" />
                No hay eventos RADIAN registrados
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── RADIAN dialog ── */}
      <Dialog open={radianDialog} onOpenChange={setRadianDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Send className="size-4" />Nuevo evento RADIAN</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>CUFE <span className="text-destructive">*</span></Label>
              <Input value={radForm.cufe} onChange={(e) => setRadForm((f) => ({ ...f, cufe: e.target.value }))} placeholder="CUFE de la factura electrónica" className="font-mono text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label>Número de factura</Label>
              <Input value={radForm.invoice_number} onChange={(e) => setRadForm((f) => ({ ...f, invoice_number: e.target.value }))} placeholder="FE-0001" />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo de evento</Label>
              <Select value={radForm.event_type} onValueChange={(v) => setRadForm((f) => ({ ...f, event_type: v ?? 'acuse_recibo' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="acuse_recibo">Acuse de recibo (030)</SelectItem>
                  <SelectItem value="recibo_bien">Recibo de bien (032)</SelectItem>
                  <SelectItem value="aceptacion">Aceptación expresa (033)</SelectItem>
                  <SelectItem value="aceptacion_tacita">Aceptación tácita (034)</SelectItem>
                  <SelectItem value="rechazo">Rechazo (031)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Notas</Label>
              <Input value={radForm.notes} onChange={(e) => setRadForm((f) => ({ ...f, notes: e.target.value }))} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRadianDialog(false)}>Cancelar</Button>
            <Button onClick={() => createRadianMut.mutate()} disabled={!radForm.cufe || createRadianMut.isPending}>
              {createRadianMut.isPending ? 'Enviando...' : 'Enviar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Close period dialog ── */}
      <Dialog open={!!closeDialog} onOpenChange={(v) => { if (!v) setCloseDialog(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Cerrar período: {closeDialog?.name}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Al cerrar no podrán crearse ni editarse asientos en este período.</p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseDialog(null)}>Cancelar</Button>
            <Button variant="destructive" disabled={closePeriodMut.isPending}
              onClick={() => closeDialog && closePeriodMut.mutate({ id: closeDialog.id })}>
              {closePeriodMut.isPending ? 'Cerrando...' : 'Cerrar período'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Create retention dialog ── */}
      <Dialog open={retentionDialog} onOpenChange={setRetentionDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle>Nueva retención tributaria</DialogTitle></DialogHeader>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Nombre <span className="text-destructive">*</span></Label>
              <Input value={retForm.name} onChange={(e) => setRetForm((f) => ({ ...f, name: e.target.value }))} placeholder="Ej. RteFte Compras" />
            </div>
            <div className="space-y-1.5">
              <Label>Tipo</Label>
              <Select value={retForm.type} onValueChange={(v) => setRetForm((f) => ({ ...f, type: v ?? 'retefte' }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="retefte">Retención en la Fuente</SelectItem>
                  <SelectItem value="reteiva">Retención IVA</SelectItem>
                  <SelectItem value="reteica">Retención ICA</SelectItem>
                  <SelectItem value="other">Otra</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Código concepto DIAN</Label>
              <Input value={retForm.concept_code} onChange={(e) => setRetForm((f) => ({ ...f, concept_code: e.target.value }))} placeholder="11" />
            </div>
            <div className="space-y-1.5">
              <Label>Tarifa (ej: 0.035 = 3.5%) <span className="text-destructive">*</span></Label>
              <Input type="number" step="0.001" min="0" max="1" value={retForm.rate}
                onChange={(e) => setRetForm((f) => ({ ...f, rate: e.target.value }))} placeholder="0.035" />
            </div>
            <div className="space-y-1.5">
              <Label>Base mínima ($)</Label>
              <Input type="number" min="0" value={retForm.base_minimum}
                onChange={(e) => setRetForm((f) => ({ ...f, base_minimum: e.target.value }))} placeholder="0" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRetentionDialog(false)}>Cancelar</Button>
            <Button onClick={() => createRetentionMut.mutate()} disabled={!retForm.name || !retForm.rate || createRetentionMut.isPending}>
              {createRetentionMut.isPending ? 'Creando...' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
