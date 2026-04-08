'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { notify } from '@/lib/notify';
import {
  Landmark, TrendingUp, TrendingDown, Lock, Unlock, Plus, DollarSign, History,
  BarChart3, ArrowUpCircle, ArrowDownCircle, RefreshCw, AlertTriangle, CheckCircle2,
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
import { Separator } from '@/components/ui/separator';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { cashApi, setTenantSlug } from '@/lib/api/tenant.api';

interface CashRegisterRecord {
  id: number; name: string; status: 'open' | 'closed';
  opening_amount: number; closing_amount?: number; difference?: number;
  opened_at: string; closed_at?: string; opened_by?: number;
}
interface CashRegister {
  id: number; name: string; status: 'open' | 'closed';
  opening_amount: number; opened_at: string;
  movements?: Movement[];
}
interface CashStatus {
  is_open: boolean;
  id?: number;
  name?: string;
  opening_amount?: number;
  current_balance?: number;
  total_in?: number;
  total_out?: number;
  opened_at?: string;
  movements?: Movement[];
}
interface Movement {
  id: number; type: 'in' | 'out'; amount: number; concept: string;
  created_at: string; user?: string;
}

const fmt = (n: number) => new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

// ─── Cash Flow Tab ────────────────────────────────────────────────────────────

function CashFlowTab({ slug }: { slug: string }) {
  const today      = new Date().toISOString().split('T')[0];
  const monthStart = today.slice(0, 8) + '01';

  const [from, setFrom]   = useState(monthStart);
  const [to, setTo]       = useState(today);
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('day');
  const [applied, setApplied] = useState({ from: monthStart, to: today });

  const { data: dashboard, isLoading: loadingDash } = useQuery({
    queryKey: ['cash-flow-dashboard', slug],
    queryFn: async () => {
      const r = await cashApi.flowDashboard();
      return (r as any).data ?? r;
    },
    staleTime: 60_000,
  });

  const { data: statement, isLoading: loadingStmt } = useQuery({
    queryKey: ['cash-flow-statement', slug, applied.from, applied.to, period],
    queryFn: async () => {
      const r = await cashApi.flowStatement(applied.from, applied.to, period);
      return (r as any).data ?? r;
    },
  });

  const { data: projection, isLoading: loadingProj } = useQuery({
    queryKey: ['cash-flow-projection', slug],
    queryFn: async () => {
      const r = await cashApi.flowProjection(30);
      return (r as any).data ?? r;
    },
    staleTime: 5 * 60_000,
  });

  function applyFilter() {
    if (from > to) { return; }
    setApplied({ from, to });
  }

  const dash    = dashboard as any;
  const stmt    = statement as any;
  const proj    = projection as any;
  const series: any[] = stmt?.series ?? [];
  const projRows: any[] = proj?.projection ?? [];
  const trend = proj?.trend ?? 'neutral';

  const KPI_PERIODS = [
    { key: 'today', label: 'Hoy' },
    { key: 'week',  label: 'Esta semana' },
    { key: 'month', label: 'Este mes' },
  ] as const;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      {loadingDash ? (
        <div className="grid grid-cols-3 gap-4">{Array.from({length:3}).map((_,i)=><Skeleton key={i} className="h-36 rounded-lg"/>)}</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {KPI_PERIODS.map(({ key, label }) => {
            const d = dash?.[key] ?? {};
            const net = d.net ?? 0;
            return (
              <Card key={key} className={net < 0 ? 'border-red-300 dark:border-red-800' : ''}>
                <CardHeader className="pb-1">
                  <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex items-center gap-2">
                    <ArrowUpCircle className="size-4 text-green-500 shrink-0" />
                    <span className="text-xs text-muted-foreground">Ingresos</span>
                    <span className="ml-auto font-semibold text-green-600">{fmt(d.inflows ?? 0)}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <ArrowDownCircle className="size-4 text-red-500 shrink-0" />
                    <span className="text-xs text-muted-foreground">Egresos</span>
                    <span className="ml-auto font-semibold text-red-600">{fmt(d.outflows ?? 0)}</span>
                  </div>
                  <Separator />
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium">Flujo neto</span>
                    <span className={`font-bold text-sm ${net >= 0 ? 'text-green-600' : 'text-red-600'}`}>{net >= 0 ? '+' : ''}{fmt(net)}</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Open cash balance */}
      {dash && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/50 text-sm">
          <DollarSign className="size-4 text-muted-foreground shrink-0" />
          <span className="text-muted-foreground">Saldo en cajas abiertas:</span>
          <span className="font-bold">{fmt(dash.open_cash_balance ?? 0)}</span>
        </div>
      )}

      {/* Statement filter */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <BarChart3 className="size-4" />
            Estado de flujo por período
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Desde</Label>
              <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36 h-8 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Hasta</Label>
              <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36 h-8 text-sm" />
            </div>
            <div className="flex flex-col gap-1">
              <Label className="text-xs">Agrupado por</Label>
              <Select value={period} onValueChange={(v) => setPeriod(v as typeof period)}>
                <SelectTrigger className="w-28 h-8 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="day">Día</SelectItem>
                  <SelectItem value="week">Semana</SelectItem>
                  <SelectItem value="month">Mes</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button size="sm" onClick={applyFilter}>
              <RefreshCw className="size-3.5 mr-1" />
              Consultar
            </Button>
          </div>

          {/* Totals */}
          {!loadingStmt && stmt?.totals && (
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/30 text-center">
                <p className="text-xs text-muted-foreground">Total ingresos</p>
                <p className="font-bold text-green-600">{fmt(stmt.totals.inflows)}</p>
              </div>
              <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/30 text-center">
                <p className="text-xs text-muted-foreground">Total egresos</p>
                <p className="font-bold text-red-600">{fmt(stmt.totals.outflows)}</p>
              </div>
              <div className={`p-3 rounded-lg text-center ${stmt.totals.net >= 0 ? 'bg-green-50 dark:bg-green-950/30' : 'bg-red-50 dark:bg-red-950/30'}`}>
                <p className="text-xs text-muted-foreground">Flujo neto</p>
                <p className={`font-bold ${stmt.totals.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>{stmt.totals.net >= 0 ? '+' : ''}{fmt(stmt.totals.net)}</p>
              </div>
            </div>
          )}

          {/* Series table */}
          {loadingStmt ? (
            <div className="space-y-2">{Array.from({length:5}).map((_,i)=><Skeleton key={i} className="h-9"/>)}</div>
          ) : series.length === 0 ? (
            <p className="text-center text-sm text-muted-foreground py-6">Sin datos para el período seleccionado.</p>
          ) : (
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Período</TableHead>
                    <TableHead className="text-right">Ingresos</TableHead>
                    <TableHead className="text-right">Egresos</TableHead>
                    <TableHead className="text-right">Neto</TableHead>
                    <TableHead className="text-right">Saldo acum.</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {series.map((row, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-mono text-sm">{row.period}</TableCell>
                      <TableCell className="text-right text-green-600 tabular-nums">{fmt(row.inflows)}</TableCell>
                      <TableCell className="text-right text-red-600 tabular-nums">{fmt(row.outflows)}</TableCell>
                      <TableCell className={`text-right tabular-nums font-medium ${row.net >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {row.net >= 0 ? '+' : ''}{fmt(row.net)}
                      </TableCell>
                      <TableCell className={`text-right tabular-nums font-semibold ${row.running_balance >= 0 ? '' : 'text-red-600'}`}>
                        {fmt(row.running_balance)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Breakdown current month */}
      {dash?.month && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-green-600 flex items-center gap-2">
                <ArrowUpCircle className="size-4" />Desglose de ingresos (mes actual)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(dash.month.breakdown_in ?? []).map((row: any) => (
                <div key={row.source} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{row.source}</span>
                  <span className="font-medium tabular-nums">{fmt(row.amount)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-red-600 flex items-center gap-2">
                <ArrowDownCircle className="size-4" />Desglose de egresos (mes actual)
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {(dash.month.breakdown_out ?? []).map((row: any) => (
                <div key={row.source} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{row.source}</span>
                  <span className="font-medium tabular-nums">{fmt(row.amount)}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Projection */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            {trend === 'positive' ? <TrendingUp className="size-4 text-green-500" /> : trend === 'negative' ? <TrendingDown className="size-4 text-red-500" /> : <BarChart3 className="size-4 text-muted-foreground" />}
            Proyección a 30 días
            {proj && (
              <Badge variant={trend === 'positive' ? 'default' : trend === 'negative' ? 'destructive' : 'secondary'} className="ml-auto text-xs">
                {trend === 'positive' ? 'Tendencia positiva' : trend === 'negative' ? 'Tendencia negativa' : 'Neutral'}
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loadingProj ? (
            <Skeleton className="h-24" />
          ) : proj ? (
            <div className="space-y-3">
              <div className="grid grid-cols-3 gap-3 text-sm text-center">
                <div className="p-2 rounded bg-muted/50">
                  <p className="text-xs text-muted-foreground">Ingreso diario prom.</p>
                  <p className="font-semibold text-green-600">{fmt(proj.daily_averages?.inflows ?? 0)}</p>
                </div>
                <div className="p-2 rounded bg-muted/50">
                  <p className="text-xs text-muted-foreground">Egreso diario prom.</p>
                  <p className="font-semibold text-red-600">{fmt(proj.daily_averages?.outflows ?? 0)}</p>
                </div>
                <div className="p-2 rounded bg-muted/50">
                  <p className="text-xs text-muted-foreground">Saldo proyectado (30d)</p>
                  <p className={`font-semibold ${(proj.projected_balance_eop ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>{fmt(proj.projected_balance_eop ?? 0)}</p>
                </div>
              </div>
              {(proj.projected_balance_eop ?? 0) < 0 && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-950/30 text-sm text-red-700 dark:text-red-400">
                  <AlertTriangle className="size-4 shrink-0" />
                  <span>El saldo proyectado es negativo. Se recomienda revisar flujos pendientes o buscar financiamiento.</span>
                </div>
              )}
              {(proj.projected_balance_eop ?? 0) >= 0 && (
                <div className="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-950/30 text-sm text-green-700 dark:text-green-400">
                  <CheckCircle2 className="size-4 shrink-0" />
                  <span>Posición de caja saludable en el horizonte proyectado. Basado en promedio de últimos 90 días.</span>
                </div>
              )}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

export default function CashPage() {
  const params = useParams();
  const slug = params.slug as string;
  const qc = useQueryClient();

  const [tab, setTab] = useState<'caja' | 'historial' | 'flujo'>('caja');
  const [openDialog, setOpenDialog]     = useState(false);
  const [closeDialog, setCloseDialog]   = useState(false);
  const [moveDialog, setMoveDialog]     = useState(false);
  const [openAmount, setOpenAmount]     = useState('');
  const [openName, setOpenName]         = useState('Caja principal');
  const [closeAmount, setCloseAmount]   = useState('');
  const [openNotes, setOpenNotes]       = useState('');
  const [closeNotes, setCloseNotes]     = useState('');
  const [movAmount, setMovAmount]       = useState('');
  const [movType, setMovType]           = useState<'in' | 'out' | 'withdrawal'>('in');
  const [movConcept, setMovConcept]     = useState('');

  useEffect(() => { setTenantSlug(slug); }, [slug]);

  // GET /cash/current → { cash_register: { id, movements:[] }, summary: { current_balance, total_in, total_out } }
  const { data: status, isLoading: loadingStatus } = useQuery<CashStatus>({
    queryKey: ['cash-status', slug],
    queryFn: async () => {
      try {
        const r = await cashApi.current();
        const d = r.data as { cash_register: CashRegister; summary: { current_balance: string; total_in: string; total_out: string } };
        return {
          is_open: true,
          id: d.cash_register.id,
          name: d.cash_register.name,
          opening_amount: d.cash_register.opening_amount,
          opened_at: d.cash_register.opened_at,
          current_balance: Number(d.summary.current_balance),
          total_in: Number(d.summary.total_in),
          total_out: Number(d.summary.total_out),
          movements: d.cash_register.movements ?? [],
        };
      } catch {
        return { is_open: false };
      }
    },
    refetchInterval: 30000,
  });

  const movements: Movement[] = status?.movements ?? [];
  const loadingMov = false;

  const openCash = useMutation({
    mutationFn: () => cashApi.open({ name: openName, opening_amount: Number(openAmount), notes: openNotes }),
    onSuccess: () => {
      notify.success('Caja abierta');
      setOpenDialog(false); setOpenAmount(''); setOpenNotes('');
      qc.invalidateQueries({ queryKey: ['cash-status', slug] });
    },
    onError: (err) => notify.error(err, 'Error al abrir caja'),
  });

  const closeCash = useMutation({
    mutationFn: () => cashApi.close(status!.id!, { closing_amount: Number(closeAmount), notes: closeNotes }),
    onSuccess: () => {
      notify.success('Caja cerrada');
      setCloseDialog(false); setCloseAmount(''); setCloseNotes('');
      qc.invalidateQueries({ queryKey: ['cash-status', slug] });
    },
    onError: (err) => notify.error(err, 'Error al cerrar caja'),
  });

  const addMovement = useMutation({
    mutationFn: () => cashApi.addMovement(status!.id!, { type: movType, amount: Number(movAmount), concept: movConcept }),
    onSuccess: () => {
      notify.success('Movimiento registrado');
      setMoveDialog(false); setMovAmount(''); setMovConcept('');
      qc.invalidateQueries({ queryKey: ['cash-status', slug] });
    },
    onError: (err) => notify.error(err, 'Error al registrar movimiento'),
  });

  const totalIn  = status?.total_in  ?? movements.filter((m) => m.type === 'in').reduce((s, m)  => s + m.amount, 0);
  const totalOut = status?.total_out ?? movements.filter((m) => m.type === 'out').reduce((s, m) => s + m.amount, 0);

  const { data: history, isLoading: loadingHistory } = useQuery<CashRegisterRecord[]>({
    queryKey: ['cash-history', slug],
    queryFn: async () => {
      const r = await cashApi.history();
      return (r.data as { data?: CashRegisterRecord[] }).data ?? (r.data as CashRegisterRecord[]) ?? [];
    },
    enabled: tab === 'historial',
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Caja</h1>
          <p className="text-muted-foreground text-sm">Apertura, cierre y movimientos de caja</p>
        </div>
        <div className="flex gap-2">
          {tab === 'caja' && status?.is_open && (
            <>
              <Button variant="outline" onClick={() => setMoveDialog(true)} className="gap-2">
                <Plus className="size-4" />Movimiento
              </Button>
              <Button variant="destructive" onClick={() => setCloseDialog(true)} className="gap-2">
                <Lock className="size-4" />Cerrar caja
              </Button>
            </>
          )}
          {tab === 'caja' && !status?.is_open && !loadingStatus && (
            <Button onClick={() => setOpenDialog(true)} className="gap-2">
              <Unlock className="size-4" />Abrir caja
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b">
        {([['caja', 'Turno Actual', Landmark], ['historial', 'Historial', History], ['flujo', 'Flujo de Caja', BarChart3]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === key ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}>
            <Icon className="size-4" />{label}
          </button>
        ))}
      </div>

      {/* ── Historial ── */}
      {tab === 'historial' && (
        <Card>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Caja</th>
                  <th className="text-left px-4 py-3 font-medium">Estado</th>
                  <th className="text-right px-4 py-3 font-medium">Apertura</th>
                  <th className="text-right px-4 py-3 font-medium">Cierre</th>
                  <th className="text-right px-4 py-3 font-medium">Diferencia</th>
                  <th className="text-left px-4 py-3 font-medium">Abierta</th>
                  <th className="text-left px-4 py-3 font-medium">Cerrada</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loadingHistory
                  ? Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>{Array.from({ length: 7 }).map((__, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                      ))}</tr>
                    ))
                  : (history ?? []).map((reg) => (
                      <tr key={reg.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3 font-medium">{reg.name}</td>
                        <td className="px-4 py-3">
                          <Badge variant={reg.status === 'open' ? 'default' : 'secondary'}>
                            {reg.status === 'open' ? 'Abierta' : 'Cerrada'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-right font-mono">{fmt(reg.opening_amount)}</td>
                        <td className="px-4 py-3 text-right font-mono">{reg.closing_amount != null ? fmt(reg.closing_amount) : '—'}</td>
                        <td className={`px-4 py-3 text-right font-mono font-medium ${
                          reg.difference != null && reg.difference < 0 ? 'text-destructive' : reg.difference != null && reg.difference > 0 ? 'text-green-600' : ''
                        }`}>{reg.difference != null ? fmt(reg.difference) : '—'}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(reg.opened_at).toLocaleString('es-CO')}</td>
                        <td className="px-4 py-3 text-muted-foreground text-xs">{reg.closed_at ? new Date(reg.closed_at).toLocaleString('es-CO') : '—'}</td>
                      </tr>
                    ))}
                {!loadingHistory && (history ?? []).length === 0 && (
                  <tr><td colSpan={7} className="text-center py-8 text-muted-foreground text-sm">
                    <History className="size-8 mx-auto mb-2 opacity-30" />Sin registros de caja
                  </td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {/* ── Turno actual ── */}
      {tab === 'caja' && (<>

      {/* Estado de caja */}
      {loadingStatus ? (
        <Skeleton className="h-32 rounded-xl" />
      ) : (
        <Card className={status?.is_open ? 'border-green-500/40 bg-green-500/5' : 'border-muted'}>
          <CardContent className="flex items-center gap-6 py-6">
            <div className={`size-14 rounded-full flex items-center justify-center ${status?.is_open ? 'bg-green-100 text-green-700' : 'bg-muted text-muted-foreground'}`}>
              {status?.is_open ? <Unlock className="size-6" /> : <Lock className="size-6" />}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-lg">{status?.is_open ? 'Caja abierta' : 'Caja cerrada'}</span>
                <Badge variant={status?.is_open ? 'default' : 'secondary'}>
                  {status?.is_open ? 'Activa' : 'Inactiva'}
                </Badge>
              </div>
              {status?.is_open && (
                <p className="text-sm text-muted-foreground">
                  Apertura: {fmt(status.opening_amount ?? 0)} · Abierta: {status.opened_at ? new Date(status.opened_at).toLocaleString('es-CO') : '—'}
                </p>
              )}
            </div>
            {status?.is_open && (
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Saldo estimado</p>
                <p className="text-2xl font-bold">{fmt(status.current_balance ?? 0)}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Stats movimientos */}
      {status?.is_open && (
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total entradas', value: totalIn, icon: TrendingUp, color: 'text-green-600' },
            { label: 'Total salidas', value: totalOut, icon: TrendingDown, color: 'text-red-600' },
            { label: 'Movimientos', value: movements.length, icon: DollarSign, color: 'text-blue-600', raw: true },
          ].map(({ label, value, icon: Icon, color, raw }) => (
            <Card key={label}>
              <CardContent className="py-4 flex items-center gap-3">
                <Icon className={`size-8 ${color}`} />
                <div>
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="text-lg font-bold">{raw ? value : fmt(value as number)}</p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Movimientos */}
      {status?.is_open && (
        <Card>
          <CardHeader><CardTitle className="text-base">Movimientos del turno</CardTitle></CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-4 py-3 font-medium">Tipo</th>
                  <th className="text-left px-4 py-3 font-medium">Concepto</th>
                  <th className="text-right px-4 py-3 font-medium">Monto</th>
                  <th className="text-left px-4 py-3 font-medium">Hora</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {loadingMov
                  ? Array.from({ length: 3 }).map((_, i) => (
                      <tr key={i}>{Array.from({ length: 4 }).map((__, j) => (
                        <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                      ))}</tr>
                    ))
                  : movements.map((m) => (
                      <tr key={m.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <Badge variant={m.type === 'in' ? 'default' : 'secondary'}>
                            {m.type === 'in' ? 'Entrada' : 'Salida'}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">{m.concept}</td>
                        <td className={`px-4 py-3 text-right font-medium ${m.type === 'in' ? 'text-green-600' : 'text-red-600'}`}>
                          {m.type === 'out' ? '-' : '+'}{fmt(m.amount)}
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">
                          {new Date(m.created_at).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                      </tr>
                    ))}
                {!loadingMov && movements.length === 0 && (
                  <tr><td colSpan={4} className="text-center py-8 text-muted-foreground text-sm">
                    Sin movimientos en este turno
                  </td></tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      </>)}

      {/* ── Flujo de Caja ── */}
      {tab === 'flujo' && <CashFlowTab slug={slug} />}

      {/* Dialog: Abrir caja */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Unlock className="size-4" />Abrir caja</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nombre de caja *</Label>
              <Input value={openName} onChange={(e) => setOpenName(e.target.value)} placeholder="Ej: Caja principal" />
            </div>
            <div className="space-y-1.5">
              <Label>Monto de apertura ($) *</Label>
              <Input type="number" min={0} value={openAmount} onChange={(e) => setOpenAmount(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Notas</Label>
              <Input value={openNotes} onChange={(e) => setOpenNotes(e.target.value)} placeholder="Opcional..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpenDialog(false)}>Cancelar</Button>
            <Button onClick={() => openCash.mutate()} disabled={!openAmount || !openName || openCash.isPending}>
              {openCash.isPending ? 'Abriendo...' : 'Abrir caja'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Cerrar caja */}
      <Dialog open={closeDialog} onOpenChange={setCloseDialog}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><Lock className="size-4" />Cerrar caja</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="p-3 bg-muted/50 rounded-lg text-sm">
              <p className="text-muted-foreground">Saldo estimado del sistema</p>
              <p className="text-xl font-bold">{fmt(status?.current_balance ?? 0)}</p>
            </div>
            <div className="space-y-1.5">
              <Label>Monto real en caja ($) *</Label>
              <Input type="number" min={0} value={closeAmount} onChange={(e) => setCloseAmount(e.target.value)} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <Label>Notas</Label>
              <Input value={closeNotes} onChange={(e) => setCloseNotes(e.target.value)} />
            </div>
            {closeAmount && (
              <div className={`p-2 rounded text-sm font-medium ${Number(closeAmount) >= (status?.current_balance ?? 0) ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                Diferencia: {fmt(Number(closeAmount) - (status?.current_balance ?? 0))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCloseDialog(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={() => closeCash.mutate()} disabled={!closeAmount || closeCash.isPending}>
              {closeCash.isPending ? 'Cerrando...' : 'Cerrar caja'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog: Movimiento manual */}
      <Dialog open={moveDialog} onOpenChange={setMoveDialog}>
        <DialogContent className="sm:max-w-xs">
          <DialogHeader><DialogTitle className="flex items-center gap-2"><DollarSign className="size-4" />Movimiento manual</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Tipo *</Label>
              <Select value={movType} onValueChange={(v) => setMovType(v as 'in' | 'out' | 'withdrawal')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="in">Entrada</SelectItem>
                  <SelectItem value="out">Salida</SelectItem>
                  <SelectItem value="withdrawal">Recogida de dinero</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Monto ($) *</Label>
              <Input type="number" min={1} value={movAmount} onChange={(e) => setMovAmount(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Concepto *</Label>
              <Input value={movConcept} onChange={(e) => setMovConcept(e.target.value)} placeholder="Ej: Pago a proveedor" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMoveDialog(false)}>Cancelar</Button>
            <Button onClick={() => addMovement.mutate()} disabled={!movAmount || !movConcept || addMovement.isPending}>
              {addMovement.isPending ? 'Registrando...' : 'Registrar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
