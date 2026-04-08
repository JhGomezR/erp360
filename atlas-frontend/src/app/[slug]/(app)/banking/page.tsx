'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { notify } from '@/lib/notify';
import { bankingApi, setTenantSlug } from '@/lib/api/tenant.api';
import {
  Landmark, Plus, ArrowUpCircle, ArrowDownCircle, CheckCircle2,
  X, FileText, Link2, Unlink2, Lightbulb, Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';

// ─── Types ────────────────────────────────────────────────────────────────────
interface BankAccount {
  id: number; name: string; bank_name: string; account_number: string;
  account_type: string; currency: string; current_balance: number; is_active: boolean;
  statements_count?: number;
}
interface StatementLine {
  id: number; transaction_date: string; description: string; reference?: string;
  amount: number; type: string; reconcile_status: string;
}
interface BankStatement {
  id: number; reference?: string; period_from: string; period_to: string;
  opening_balance: number; closing_balance: number; status: string;
  bank_account?: { name: string; bank_name: string };
  lines?: StatementLine[];
}
interface Reconciliation {
  id: number; status: string; book_balance: number; bank_balance: number;
  difference: number; created_at: string; completed_at?: string;
  statement?: { reference?: string; period_from: string; period_to: string; bank_account?: { name: string } };
}

const fmt = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function BankingPage() {
  const params = useParams();
  const slug = params.slug as string;
  const qc = useQueryClient();
  const [tab, setTab] = useState<'accounts' | 'statements' | 'reconciliations'>('accounts');

  // Account state
  const [accountDialog, setAccountDialog] = useState(false);
  const [accName, setAccName] = useState('');
  const [accBank, setAccBank] = useState('');
  const [accNumber, setAccNumber] = useState('');
  const [accType, setAccType] = useState('checking');
  const [accBalance, setAccBalance] = useState('0');

  // Statement state
  const [stmtDialog, setStmtDialog] = useState(false);
  const [stmtAccount, setStmtAccount] = useState('');
  const [stmtRef, setStmtRef] = useState('');
  const [stmtFrom, setStmtFrom] = useState('');
  const [stmtTo, setStmtTo] = useState('');
  const [stmtOpen, setStmtOpen] = useState('0');
  const [stmtClose, setStmtClose] = useState('0');
  const [stmtLines, setStmtLines] = useState<{ date: string; description: string; reference: string; amount: string; type: string }[]>([
    { date: '', description: '', reference: '', amount: '', type: 'credit' },
  ]);
  const [selectedStmt, setSelectedStmt] = useState<BankStatement | null>(null);

  // Reconciliation state
  const [recDialog, setRecDialog] = useState(false);
  const [recStmtId, setRecStmtId] = useState('');
  const [recBookBalance, setRecBookBalance] = useState('0');
  const [recNotes, setRecNotes] = useState('');
  const [selectedRec, setSelectedRec] = useState<Reconciliation | null>(null);
  const [matchDialog, setMatchDialog] = useState<StatementLine | null>(null);
  const [matchDesc, setMatchDesc] = useState('');
  const [matchAmount, setMatchAmount] = useState('');
  const [matchSourceType, setMatchSourceType] = useState('manual');
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);

  useEffect(() => { setTenantSlug(slug); }, [slug]);

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: accounts = [], isLoading: loadingAccounts } = useQuery<BankAccount[]>({
    queryKey: ['bank-accounts', slug],
    queryFn: async () => {
      const r = await bankingApi.accounts();
      return (r.data as any) ?? [];
    },
  });

  const { data: statements, isLoading: loadingStmts } = useQuery<{ data: BankStatement[] }>({
    queryKey: ['bank-statements', slug],
    queryFn: async () => {
      const r = await bankingApi.statements();
      return r.data as any;
    },
    enabled: tab === 'statements',
  });

  const { data: reconciliations, isLoading: loadingRecs } = useQuery<{ data: Reconciliation[] }>({
    queryKey: ['bank-reconciliations', slug],
    queryFn: async () => {
      const r = await bankingApi.reconciliations();
      return r.data as any;
    },
    enabled: tab === 'reconciliations',
  });

  const { data: stmtDetail } = useQuery<BankStatement>({
    queryKey: ['bank-statement-detail', slug, selectedStmt?.id],
    queryFn: async () => {
      const r = await bankingApi.getStatement(selectedStmt!.id);
      return r.data as any;
    },
    enabled: !!selectedStmt,
  });

  const { data: recDetail, refetch: refetchRec } = useQuery<Reconciliation & { statement?: any; matches?: any[] }>({
    queryKey: ['bank-reconciliation-detail', slug, selectedRec?.id],
    queryFn: async () => {
      const r = await bankingApi.getReconciliation(selectedRec!.id);
      return r.data as any;
    },
    enabled: !!selectedRec,
  });

  const { data: suggestions } = useQuery<{ suggestions: any[] }>({
    queryKey: ['bank-rec-suggestions', slug, selectedRec?.id],
    queryFn: async () => {
      const r = await bankingApi.suggestions(selectedRec!.id);
      return r.data as any;
    },
    enabled: !!selectedRec && suggestionsOpen,
  });

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createAccountMut = useMutation({
    mutationFn: () => bankingApi.createAccount({ name: accName, bank_name: accBank, account_number: accNumber, account_type: accType, current_balance: Number(accBalance) }),
    onSuccess: () => { notify.success('Cuenta bancaria creada'); setAccountDialog(false); setAccName(''); setAccBank(''); setAccNumber(''); setAccBalance('0'); qc.invalidateQueries({ queryKey: ['bank-accounts', slug] }); },
    onError: (e) => notify.error(e, 'Error'),
  });

  const createStmtMut = useMutation({
    mutationFn: () => bankingApi.createStatement({
      bank_account_id: Number(stmtAccount),
      reference: stmtRef || undefined,
      period_from: stmtFrom, period_to: stmtTo,
      opening_balance: Number(stmtOpen),
      closing_balance: Number(stmtClose),
      lines: stmtLines.filter((l) => l.description && l.amount).map((l) => ({
        date: l.date, description: l.description, reference: l.reference || undefined,
        amount: Number(l.amount), type: l.type,
      })),
    }),
    onSuccess: () => {
      notify.success('Extracto importado'); setStmtDialog(false); setStmtAccount(''); setStmtRef(''); setStmtFrom(''); setStmtTo(''); setStmtOpen('0'); setStmtClose('0'); setStmtLines([{ date: '', description: '', reference: '', amount: '', type: 'credit' }]);
      qc.invalidateQueries({ queryKey: ['bank-statements', slug] });
    },
    onError: (e) => notify.error(e, 'Error'),
  });

  const deleteStmtMut = useMutation({
    mutationFn: (id: number) => bankingApi.deleteStatement(id),
    onSuccess: () => { notify.success('Extracto eliminado'); qc.invalidateQueries({ queryKey: ['bank-statements', slug] }); },
    onError: (e) => notify.error(e, 'Error'),
  });

  const ignoreLineMut = useMutation({
    mutationFn: ({ stmtId, lineId }: { stmtId: number; lineId: number }) => bankingApi.ignoreLine(stmtId, lineId),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['bank-statement-detail', slug, selectedStmt?.id] }); },
    onError: (e) => notify.error(e, 'Error'),
  });

  const startRecMut = useMutation({
    mutationFn: () => bankingApi.startReconciliation({ bank_statement_id: Number(recStmtId), book_balance: Number(recBookBalance), notes: recNotes }),
    onSuccess: (r) => {
      notify.success('Conciliación iniciada'); setRecDialog(false);
      qc.invalidateQueries({ queryKey: ['bank-reconciliations', slug] });
      setSelectedRec((r.data as any).reconciliation ?? r.data as any);
      setTab('reconciliations');
    },
    onError: (e) => notify.error(e, 'Error'),
  });

  const matchLineMut = useMutation({
    mutationFn: ({ recId, lineId, desc, amount, srcType }: { recId: number; lineId: number; desc: string; amount: number; srcType: string }) =>
      bankingApi.matchLine(recId, { statement_line_id: lineId, source_description: desc, matched_amount: amount, source_type: srcType }),
    onSuccess: () => { notify.success('Cruce registrado'); setMatchDialog(null); setMatchDesc(''); setMatchAmount(''); refetchRec(); },
    onError: (e) => notify.error(e, 'Error'),
  });

  const unmatchMut = useMutation({
    mutationFn: ({ recId, matchId }: { recId: number; matchId: number }) => bankingApi.unmatchLine(recId, matchId),
    onSuccess: () => { notify.success('Cruce deshecho'); refetchRec(); },
    onError: (e) => notify.error(e, 'Error'),
  });

  const completeRecMut = useMutation({
    mutationFn: (id: number) => bankingApi.completeReconciliation(id),
    onSuccess: () => { notify.success('Conciliación completada'); refetchRec(); qc.invalidateQueries({ queryKey: ['bank-reconciliations', slug] }); },
    onError: (e) => notify.error(e, 'Error'),
  });

  const TABS = [
    { key: 'accounts',        label: 'Cuentas bancarias',  icon: Landmark },
    { key: 'statements',      label: 'Extractos',          icon: FileText },
    { key: 'reconciliations', label: 'Conciliaciones',     icon: CheckCircle2 },
  ] as const;

  const stmtList: BankStatement[] = (statements as any)?.data ?? [];
  const recList: Reconciliation[]  = (reconciliations as any)?.data ?? [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Conciliación Bancaria</h1>
          <p className="text-muted-foreground text-sm">Gestiona cuentas bancarias y concilia extractos</p>
        </div>
        <div className="flex gap-2">
          {tab === 'accounts' && (
            <Button onClick={() => setAccountDialog(true)} className="gap-2">
              <Plus className="size-4" />Nueva cuenta
            </Button>
          )}
          {tab === 'statements' && (
            <Button onClick={() => setStmtDialog(true)} className="gap-2">
              <Plus className="size-4" />Importar extracto
            </Button>
          )}
          {tab === 'reconciliations' && (
            <Button onClick={() => { setRecStmtId(''); setRecBookBalance('0'); setRecNotes(''); setRecDialog(true); }} className="gap-2">
              <Plus className="size-4" />Nueva conciliación
            </Button>
          )}
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Cuentas activas', value: accounts.filter((a) => a.is_active).length },
          { label: 'Extractos pendientes', value: stmtList.filter((s) => s.status === 'pending').length },
          { label: 'Conciliaciones activas', value: recList.filter((r) => r.status === 'in_progress').length },
        ].map(({ label, value }) => (
          <Card key={label}>
            <CardContent className="py-4 flex items-center gap-3">
              <Landmark className="size-8 text-primary" />
              <div><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-bold">{value}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button key={key} onClick={() => { setTab(key); setSelectedStmt(null); setSelectedRec(null); }}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${tab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}>
            <Icon className="size-4" />{label}
          </button>
        ))}
      </div>

      {/* ── Cuentas ── */}
      {tab === 'accounts' && (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {loadingAccounts
            ? Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-36 rounded-lg" />)
            : accounts.map((acc) => (
                <Card key={acc.id}>
                  <CardHeader className="pb-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Landmark className="size-5 text-primary" />
                        <CardTitle className="text-sm">{acc.name}</CardTitle>
                      </div>
                      <Badge variant={acc.is_active ? 'default' : 'outline'}>{acc.is_active ? 'Activa' : 'Inactiva'}</Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <p className="text-muted-foreground text-xs">{acc.bank_name} · {acc.account_type === 'checking' ? 'Cta. Cte.' : acc.account_type === 'savings' ? 'Ahorros' : 'Crédito'}</p>
                    <p className="font-mono text-xs">{acc.account_number}</p>
                    <p className="text-lg font-bold">{fmt(acc.current_balance)}</p>
                    <p className="text-xs text-muted-foreground">{acc.statements_count ?? 0} extracto(s)</p>
                  </CardContent>
                </Card>
              ))}
          {!loadingAccounts && accounts.length === 0 && (
            <div className="col-span-3 text-center py-12 text-muted-foreground">
              <Landmark className="size-10 mx-auto mb-2 opacity-30" />
              <p className="text-sm">Sin cuentas bancarias registradas</p>
            </div>
          )}
        </div>
      )}

      {/* ── Extractos ── */}
      {tab === 'statements' && !selectedStmt && (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Cuenta</th>
                  <th className="text-left px-4 py-3 font-medium">Referencia</th>
                  <th className="text-left px-4 py-3 font-medium">Período</th>
                  <th className="text-right px-4 py-3 font-medium">Saldo apertura</th>
                  <th className="text-right px-4 py-3 font-medium">Saldo cierre</th>
                  <th className="text-left px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loadingStmts
                  ? Array.from({ length: 3 }).map((_, i) => <tr key={i}>{Array.from({ length: 7 }).map((__, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>)}</tr>)
                  : stmtList.map((s) => (
                      <tr key={s.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setSelectedStmt(s)}>
                        <td className="px-4 py-3 font-medium">{s.bank_account?.name ?? '—'}</td>
                        <td className="px-4 py-3 font-mono text-xs">{s.reference ?? '—'}</td>
                        <td className="px-4 py-3 text-xs">{new Date(s.period_from + 'T12:00:00').toLocaleDateString('es-CO')} — {new Date(s.period_to + 'T12:00:00').toLocaleDateString('es-CO')}</td>
                        <td className="px-4 py-3 text-right">{fmt(s.opening_balance)}</td>
                        <td className="px-4 py-3 text-right font-semibold">{fmt(s.closing_balance)}</td>
                        <td className="px-4 py-3">
                          <Badge variant={s.status === 'reconciled' ? 'default' : 'secondary'}>
                            {s.status === 'reconciled' ? 'Conciliado' : 'Pendiente'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          {s.status !== 'reconciled' && (
                            <Button variant="ghost" size="sm" className="text-destructive h-7 w-7 p-0"
                              onClick={(e) => { e.stopPropagation(); if (confirm('¿Eliminar extracto?')) deleteStmtMut.mutate(s.id); }}>
                              <Trash2 className="size-4" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                {!loadingStmts && stmtList.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground text-sm"><FileText className="size-8 mx-auto mb-2 opacity-30" /><p>Sin extractos importados</p></td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* ── Detalle extracto ── */}
      {tab === 'statements' && selectedStmt && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => setSelectedStmt(null)}>← Volver</Button>
            <h2 className="text-lg font-semibold">{selectedStmt.bank_account?.name} — {selectedStmt.reference ?? 'Sin referencia'}</h2>
            <Badge variant={selectedStmt.status === 'reconciled' ? 'default' : 'secondary'}>
              {selectedStmt.status === 'reconciled' ? 'Conciliado' : 'Pendiente'}
            </Badge>
          </div>
          <div className="grid grid-cols-3 gap-4 text-sm">
            <Card><CardContent className="py-3"><p className="text-muted-foreground text-xs">Período</p><p className="font-medium">{new Date(selectedStmt.period_from + 'T12:00:00').toLocaleDateString('es-CO')} — {new Date(selectedStmt.period_to + 'T12:00:00').toLocaleDateString('es-CO')}</p></CardContent></Card>
            <Card><CardContent className="py-3"><p className="text-muted-foreground text-xs">Saldo apertura</p><p className="font-bold text-lg">{fmt(selectedStmt.opening_balance)}</p></CardContent></Card>
            <Card><CardContent className="py-3"><p className="text-muted-foreground text-xs">Saldo cierre</p><p className="font-bold text-lg">{fmt(selectedStmt.closing_balance)}</p></CardContent></Card>
          </div>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Líneas del extracto ({stmtDetail?.lines?.length ?? 0})</CardTitle></CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Fecha</th>
                    <th className="text-left px-4 py-2 font-medium">Descripción</th>
                    <th className="text-left px-4 py-2 font-medium">Referencia</th>
                    <th className="text-right px-4 py-2 font-medium">Monto</th>
                    <th className="text-left px-4 py-2 font-medium">Estado</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {(stmtDetail?.lines ?? []).map((line) => (
                    <tr key={line.id} className={`hover:bg-muted/20 ${line.reconcile_status === 'ignored' ? 'opacity-40' : ''}`}>
                      <td className="px-4 py-2 text-xs">{new Date(line.transaction_date + 'T12:00:00').toLocaleDateString('es-CO')}</td>
                      <td className="px-4 py-2">{line.description}</td>
                      <td className="px-4 py-2 font-mono text-xs">{line.reference ?? '—'}</td>
                      <td className={`px-4 py-2 text-right font-medium ${line.type === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                        {line.type === 'credit' ? '+' : '-'}{fmt(line.amount)}
                      </td>
                      <td className="px-4 py-2">
                        <Badge variant={line.reconcile_status === 'matched' ? 'default' : line.reconcile_status === 'ignored' ? 'outline' : 'secondary'} className="text-xs">
                          {line.reconcile_status === 'matched' ? 'Cruzada' : line.reconcile_status === 'ignored' ? 'Ignorada' : 'Sin cruzar'}
                        </Badge>
                      </td>
                      <td className="px-4 py-2">
                        <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={() => ignoreLineMut.mutate({ stmtId: selectedStmt.id, lineId: line.id })}>
                          {line.reconcile_status === 'ignored' ? 'Restaurar' : 'Ignorar'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* ── Conciliaciones ── */}
      {tab === 'reconciliations' && !selectedRec && (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Cuenta</th>
                  <th className="text-left px-4 py-3 font-medium">Período extracto</th>
                  <th className="text-right px-4 py-3 font-medium">Saldo libros</th>
                  <th className="text-right px-4 py-3 font-medium">Saldo banco</th>
                  <th className="text-right px-4 py-3 font-medium">Diferencia</th>
                  <th className="text-left px-4 py-3 font-medium">Estado</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loadingRecs
                  ? Array.from({ length: 3 }).map((_, i) => <tr key={i}>{Array.from({ length: 7 }).map((__, j) => <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>)}</tr>)
                  : recList.map((r) => (
                      <tr key={r.id} className="hover:bg-muted/30 cursor-pointer" onClick={() => setSelectedRec(r)}>
                        <td className="px-4 py-3 font-medium">{r.statement?.bank_account?.name ?? '—'}</td>
                        <td className="px-4 py-3 text-xs">{r.statement?.period_from ? new Date(r.statement.period_from + 'T12:00:00').toLocaleDateString('es-CO') : '—'} — {r.statement?.period_to ? new Date(r.statement.period_to + 'T12:00:00').toLocaleDateString('es-CO') : '—'}</td>
                        <td className="px-4 py-3 text-right">{fmt(r.book_balance)}</td>
                        <td className="px-4 py-3 text-right">{fmt(r.bank_balance)}</td>
                        <td className={`px-4 py-3 text-right font-semibold ${Math.abs(r.difference) < 1 ? 'text-green-600' : 'text-red-600'}`}>{fmt(r.difference)}</td>
                        <td className="px-4 py-3">
                          <Badge variant={r.status === 'completed' ? 'default' : 'secondary'}>
                            {r.status === 'completed' ? 'Completada' : 'En progreso'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleDateString('es-CO')}</td>
                      </tr>
                    ))}
                {!loadingRecs && recList.length === 0 && (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground text-sm"><CheckCircle2 className="size-8 mx-auto mb-2 opacity-30" /><p>Sin conciliaciones registradas</p></td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* ── Detalle conciliación ── */}
      {tab === 'reconciliations' && selectedRec && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <Button variant="outline" size="sm" onClick={() => setSelectedRec(null)}>← Volver</Button>
            <h2 className="text-lg font-semibold">Conciliación #{selectedRec.id}</h2>
            <Badge variant={selectedRec.status === 'completed' ? 'default' : 'secondary'}>
              {selectedRec.status === 'completed' ? 'Completada' : 'En progreso'}
            </Badge>
            {selectedRec.status === 'in_progress' && (<>
              <Button variant="outline" size="sm" className="gap-1 ml-auto" onClick={() => setSuggestionsOpen(!suggestionsOpen)}>
                <Lightbulb className="size-4" />Sugerencias automáticas
              </Button>
              <Button size="sm" className="gap-1" onClick={() => completeRecMut.mutate(selectedRec.id)} disabled={completeRecMut.isPending}>
                <CheckCircle2 className="size-4" />Completar conciliación
              </Button>
            </>)}
          </div>

          <div className="grid grid-cols-3 gap-4">
            <Card><CardContent className="py-3"><p className="text-xs text-muted-foreground">Saldo libros</p><p className="text-lg font-bold">{fmt(recDetail?.book_balance ?? selectedRec.book_balance)}</p></CardContent></Card>
            <Card><CardContent className="py-3"><p className="text-xs text-muted-foreground">Saldo banco</p><p className="text-lg font-bold">{fmt(recDetail?.bank_balance ?? selectedRec.bank_balance)}</p></CardContent></Card>
            <Card><CardContent className="py-3"><p className="text-xs text-muted-foreground">Diferencia</p>
              <p className={`text-lg font-bold ${Math.abs(recDetail?.difference ?? selectedRec.difference) < 1 ? 'text-green-600' : 'text-red-600'}`}>
                {fmt(recDetail?.difference ?? selectedRec.difference)}
              </p>
            </CardContent></Card>
          </div>

          {/* Sugerencias */}
          {suggestionsOpen && suggestions && suggestions.suggestions.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-sm flex items-center gap-2"><Lightbulb className="size-4 text-yellow-500" />Cruces sugeridos automáticamente</CardTitle></CardHeader>
              <CardContent className="space-y-3">
                {suggestions.suggestions.map((s: any, i: number) => (
                  <div key={i} className="border rounded p-3 space-y-2">
                    <p className="text-sm font-medium">{s.line.description} — {fmt(s.line.amount)}</p>
                    <div className="flex gap-2 flex-wrap">
                      {s.candidates.map((c: any, j: number) => (
                        <Button key={j} size="sm" variant="outline" className="h-7 text-xs gap-1"
                          onClick={() => {
                            setMatchDialog(s.line);
                            setMatchDesc(c.description);
                            setMatchAmount(String(s.line.amount));
                            setMatchSourceType(c.source_type);
                          }}>
                          <Link2 className="size-3" />{c.description} ({fmt(c.amount)})
                        </Button>
                      ))}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {/* Líneas sin cruzar */}
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Líneas del extracto</CardTitle></CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Fecha</th>
                    <th className="text-left px-4 py-2 font-medium">Descripción</th>
                    <th className="text-right px-4 py-2 font-medium">Monto</th>
                    <th className="text-left px-4 py-2 font-medium">Estado</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {((recDetail as any)?.statement?.lines ?? []).map((line: StatementLine) => {
                    const lineMatches = ((recDetail as any)?.matches ?? []).filter((m: any) => m.statement_line_id === line.id);
                    return (
                      <tr key={line.id} className="hover:bg-muted/20">
                        <td className="px-4 py-2 text-xs">{new Date(line.transaction_date + 'T12:00:00').toLocaleDateString('es-CO')}</td>
                        <td className="px-4 py-2">
                          <div>
                            <p>{line.description}</p>
                            {lineMatches.map((m: any) => (
                              <p key={m.id} className="text-xs text-muted-foreground flex items-center gap-1">
                                <Link2 className="size-3" />{m.source_description} — {fmt(m.matched_amount)}
                                {selectedRec.status === 'in_progress' && (
                                  <button className="text-destructive ml-1" onClick={() => unmatchMut.mutate({ recId: selectedRec.id, matchId: m.id })}>
                                    <Unlink2 className="size-3" />
                                  </button>
                                )}
                              </p>
                            ))}
                          </div>
                        </td>
                        <td className={`px-4 py-2 text-right font-medium ${line.type === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
                          {line.type === 'credit' ? '+' : '-'}{fmt(line.amount)}
                        </td>
                        <td className="px-4 py-2">
                          <Badge variant={line.reconcile_status === 'matched' ? 'default' : 'secondary'} className="text-xs">
                            {line.reconcile_status === 'matched' ? 'Cruzada' : 'Sin cruzar'}
                          </Badge>
                        </td>
                        <td className="px-4 py-2">
                          {selectedRec.status === 'in_progress' && line.reconcile_status !== 'matched' && (
                            <Button size="sm" variant="outline" className="gap-1 h-7 text-xs"
                              onClick={() => { setMatchDialog(line); setMatchAmount(String(line.amount)); setMatchDesc(''); setMatchSourceType('manual'); }}>
                              <Link2 className="size-3" />Cruzar
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Dialog: Nueva cuenta */}
      <Dialog open={accountDialog} onOpenChange={setAccountDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Landmark className="size-4" />Nueva cuenta bancaria</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Nombre de la cuenta *</Label><Input value={accName} onChange={(e) => setAccName(e.target.value)} placeholder="Cuenta Corriente Principal" /></div>
            <div className="space-y-1.5"><Label>Banco *</Label><Input value={accBank} onChange={(e) => setAccBank(e.target.value)} placeholder="Bancolombia, Davivienda..." /></div>
            <div className="space-y-1.5"><Label>Número de cuenta *</Label><Input value={accNumber} onChange={(e) => setAccNumber(e.target.value)} className="font-mono" /></div>
            <div className="space-y-1.5">
              <Label>Tipo de cuenta</Label>
              <Select value={accType} onValueChange={(v) => setAccType(v ?? 'checking')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="checking">Corriente</SelectItem>
                  <SelectItem value="savings">Ahorros</SelectItem>
                  <SelectItem value="credit">Crédito</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Saldo inicial ($)</Label><Input type="number" step="1" value={accBalance} onChange={(e) => setAccBalance(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAccountDialog(false)}>Cancelar</Button>
            <Button onClick={() => createAccountMut.mutate()} disabled={!accName || !accBank || !accNumber || createAccountMut.isPending}>
              {createAccountMut.isPending ? 'Creando...' : 'Crear cuenta'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Importar extracto */}
      <Dialog open={stmtDialog} onOpenChange={setStmtDialog}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><FileText className="size-4" />Importar extracto bancario</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5 col-span-2">
                <Label>Cuenta bancaria *</Label>
                <Select value={stmtAccount} onValueChange={(v) => setStmtAccount(v ?? '')}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                  <SelectContent>{accounts.map((a) => <SelectItem key={a.id} value={String(a.id)}>{a.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label>Referencia extracto</Label><Input value={stmtRef} onChange={(e) => setStmtRef(e.target.value)} placeholder="EXT-001" /></div>
              <div className="space-y-1.5"><Label>Período inicio *</Label><Input type="date" value={stmtFrom} onChange={(e) => setStmtFrom(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Período fin *</Label><Input type="date" value={stmtTo} onChange={(e) => setStmtTo(e.target.value)} /></div>
              <div className="space-y-1.5"><Label>Saldo apertura *</Label><Input type="number" step="1" value={stmtOpen} onChange={(e) => setStmtOpen(e.target.value)} /></div>
              <div className="space-y-1.5 col-span-2"><Label>Saldo cierre *</Label><Input type="number" step="1" value={stmtClose} onChange={(e) => setStmtClose(e.target.value)} /></div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Movimientos</Label>
                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs gap-1"
                  onClick={() => setStmtLines((prev) => [...prev, { date: '', description: '', reference: '', amount: '', type: 'credit' }])}>
                  <Plus className="size-3" />Agregar
                </Button>
              </div>
              {stmtLines.map((line, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-1 items-end">
                  <div className="col-span-2"><Input type="date" value={line.date} className="text-xs" onChange={(e) => setStmtLines((prev) => prev.map((x, i) => i === idx ? { ...x, date: e.target.value } : x))} /></div>
                  <div className="col-span-4"><Input placeholder="Descripción" value={line.description} className="text-xs" onChange={(e) => setStmtLines((prev) => prev.map((x, i) => i === idx ? { ...x, description: e.target.value } : x))} /></div>
                  <div className="col-span-2"><Input placeholder="Referencia" value={line.reference} className="text-xs" onChange={(e) => setStmtLines((prev) => prev.map((x, i) => i === idx ? { ...x, reference: e.target.value } : x))} /></div>
                  <div className="col-span-2"><Input type="number" placeholder="Monto" value={line.amount} className="text-xs" onChange={(e) => setStmtLines((prev) => prev.map((x, i) => i === idx ? { ...x, amount: e.target.value } : x))} /></div>
                  <div className="col-span-1">
                    <Select value={line.type} onValueChange={(v) => setStmtLines((prev) => prev.map((x, i) => i === idx ? { ...x, type: v ?? 'credit' } : x))}>
                      <SelectTrigger className="h-8 text-xs px-2"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="credit"><ArrowUpCircle className="size-3 inline mr-1 text-green-600" />Crédito</SelectItem>
                        <SelectItem value="debit"><ArrowDownCircle className="size-3 inline mr-1 text-red-600" />Débito</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {stmtLines.length > 1 && (
                    <div className="col-span-1"><Button type="button" variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setStmtLines((prev) => prev.filter((_, i) => i !== idx))}><X className="size-4" /></Button></div>
                  )}
                </div>
              ))}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setStmtDialog(false)}>Cancelar</Button>
            <Button onClick={() => createStmtMut.mutate()} disabled={!stmtAccount || !stmtFrom || !stmtTo || createStmtMut.isPending}>
              {createStmtMut.isPending ? 'Importando...' : 'Importar extracto'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Nueva conciliación */}
      <Dialog open={recDialog} onOpenChange={setRecDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><CheckCircle2 className="size-4" />Nueva conciliación</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Extracto *</Label>
              <Select value={recStmtId} onValueChange={(v) => setRecStmtId(v ?? '')}>
                <SelectTrigger><SelectValue placeholder="Seleccionar extracto..." /></SelectTrigger>
                <SelectContent>
                  {stmtList.filter((s) => s.status === 'pending').map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.bank_account?.name} — {s.reference ?? `${s.period_from} al ${s.period_to}`}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Saldo en libros al cierre *</Label><Input type="number" step="1" value={recBookBalance} onChange={(e) => setRecBookBalance(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Notas</Label><Input value={recNotes} onChange={(e) => setRecNotes(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRecDialog(false)}>Cancelar</Button>
            <Button onClick={() => startRecMut.mutate()} disabled={!recStmtId || startRecMut.isPending}>
              {startRecMut.isPending ? 'Iniciando...' : 'Iniciar conciliación'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Cruzar línea */}
      <Dialog open={!!matchDialog} onOpenChange={(o) => { if (!o) setMatchDialog(null); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Link2 className="size-4" />Cruzar línea</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{matchDialog?.description} — {matchDialog ? fmt(matchDialog.amount) : ''}</p>
            <div className="space-y-1.5">
              <Label>Tipo de movimiento</Label>
              <Select value={matchSourceType} onValueChange={(v) => setMatchSourceType(v ?? 'manual')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="sale">Venta</SelectItem>
                  <SelectItem value="purchase">Compra</SelectItem>
                  <SelectItem value="expense">Gasto</SelectItem>
                  <SelectItem value="collection_payment">Cobro CxC</SelectItem>
                  <SelectItem value="cash_movement">Movimiento caja</SelectItem>
                  <SelectItem value="manual">Ajuste manual</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5"><Label>Descripción del movimiento *</Label><Input value={matchDesc} onChange={(e) => setMatchDesc(e.target.value)} placeholder="Ej: Venta #1234, Cobro cliente..." /></div>
            <div className="space-y-1.5"><Label>Monto cruzado *</Label><Input type="number" step="1" value={matchAmount} onChange={(e) => setMatchAmount(e.target.value)} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMatchDialog(null)}>Cancelar</Button>
            <Button onClick={() => matchDialog && selectedRec && matchLineMut.mutate({ recId: selectedRec.id, lineId: matchDialog.id, desc: matchDesc, amount: Number(matchAmount), srcType: matchSourceType })} disabled={!matchDesc || !matchAmount || matchLineMut.isPending}>
              {matchLineMut.isPending ? 'Cruzando...' : 'Registrar cruce'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
