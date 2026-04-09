'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import {
  TrendingUp, Plus, Trash2, Edit2, CheckCircle, DollarSign,
  ChevronLeft, ChevronRight,
} from 'lucide-react';
import { notify } from '@/lib/notify';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { commissionsApi, setTenantSlug } from '@/lib/api/tenant.api';
import type { Commission, CommissionRule, CommissionSummaryRow } from '@/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

const STATUS_LABEL: Record<string, string> = {
  pending: 'Pendiente', approved: 'Aprobada', paid: 'Pagada', cancelled: 'Cancelada',
};
const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive'> = {
  pending: 'secondary', approved: 'default', paid: 'default', cancelled: 'destructive',
};
const APPLIES_LABEL: Record<string, string> = {
  all: 'Todos los productos', category: 'Por categoría', product: 'Por producto',
};

function defaultRule(): Omit<CommissionRule, 'id'> {
  return { name: '', applies_to: 'all', type: 'percentage', value: 5, is_active: true };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function CommissionsPage() {
  const { slug } = useParams<{ slug: string }>();
  setTenantSlug(slug);
  const qc = useQueryClient();

  const [tab, setTab] = useState<'summary' | 'detail' | 'rules'>('summary');
  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState('');
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [showRuleForm, setShowRuleForm] = useState(false);
  const [editRule, setEditRule] = useState<CommissionRule | null>(null);

  // Dates: current month
  const today = new Date();
  const [from, setFrom] = useState(new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10));
  const [to, setTo] = useState(today.toISOString().slice(0, 10));

  const { data: summaryData, isLoading: loadingSummary } = useQuery({
    queryKey: ['commissions-summary', slug, from, to],
    queryFn: () => commissionsApi.summary({ from, to }).then((r) => r.data),
    enabled: tab === 'summary',
  });

  const { data: commissionsData, isLoading: loadingList } = useQuery({
    queryKey: ['commissions', slug, page, filterStatus, from, to],
    queryFn: () =>
      commissionsApi.list({ page, from, to, ...(filterStatus ? { status: filterStatus } : {}) })
        .then((r) => r.data),
    enabled: tab === 'detail',
  });

  const { data: rulesData, isLoading: loadingRules } = useQuery({
    queryKey: ['commission-rules', slug],
    queryFn: () => commissionsApi.listRules().then((r) => r.data),
    enabled: tab === 'rules',
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['commissions', slug] });
    qc.invalidateQueries({ queryKey: ['commissions-summary', slug] });
    qc.invalidateQueries({ queryKey: ['commission-rules', slug] });
  };

  const approveMutation = useMutation({
    mutationFn: (id: number) => commissionsApi.approve(id),
    onSuccess: () => { notify.success('Comisión aprobada.'); invalidate(); },
    onError: () => notify.error('Error al aprobar.'),
  });

  const payMutation = useMutation({
    mutationFn: (ids: number[]) => commissionsApi.pay(ids),
    onSuccess: () => {
      notify.success('Comisiones marcadas como pagadas.');
      setSelectedIds([]);
      invalidate();
    },
    onError: () => notify.error('Error al pagar.'),
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (id: number) => commissionsApi.deleteRule(id),
    onSuccess: () => { notify.success('Regla eliminada.'); invalidate(); },
    onError: () => notify.error('Error al eliminar la regla.'),
  });

  const commissions: Commission[] = (commissionsData as any)?.data ?? [];
  const lastPage: number = (commissionsData as any)?.last_page ?? 1;
  const summaryRows: CommissionSummaryRow[] = summaryData?.rows ?? [];
  const rules: CommissionRule[] = rulesData ?? [];

  const toggleSelect = (id: number) =>
    setSelectedIds((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <TrendingUp className="h-6 w-6" />
            Comisiones por Ventas
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Seguimiento de comisiones por producto y vendedor.
          </p>
        </div>
      </div>

      {/* Date range */}
      <div className="flex gap-3 items-center">
        <div className="space-y-1">
          <Label className="text-xs">Desde</Label>
          <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="w-36" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Hasta</Label>
          <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="w-36" />
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-0.5 p-1 rounded-lg bg-muted w-fit">
        {(['summary', 'detail', 'rules'] as const).map((key) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${tab === key ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}>
            {key === 'summary' ? 'Resumen' : key === 'detail' ? 'Detalle' : 'Reglas'}
          </button>
        ))}
      </div>

      {/* ── Summary ── */}
      {tab === 'summary' && (
        <div className="space-y-4">
          {loadingSummary ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : summaryRows.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Sin comisiones en el período.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {summaryRows.map((row) => (
                <Card key={row.user_id}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{row.user_name}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Total comisiones</span>
                      <span className="font-bold">{fmt(Number(row.total_commission))}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Pendiente</span>
                      <span className="text-orange-600">{fmt(Number(row.pending))}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Pagado</span>
                      <span className="text-green-600">{fmt(Number(row.paid))}</span>
                    </div>
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Registros</span>
                      <span>{row.total_records}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Detail ── */}
      {tab === 'detail' && (
        <div className="space-y-4">
          <div className="flex gap-3 items-center justify-between">
            <Select value={filterStatus || '_all'} onValueChange={(v) => { setFilterStatus(v === '_all' ? '' : v); setPage(1); }}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Todos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">Todos</SelectItem>
                {Object.entries(STATUS_LABEL).map(([v, l]) => (
                  <SelectItem key={v} value={v}>{l}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedIds.length > 0 && (
              <Button
                size="sm"
                onClick={() => { if (confirm(`¿Pagar ${selectedIds.length} comisión(es)?`)) payMutation.mutate(selectedIds); }}
                disabled={payMutation.isPending}
              >
                <DollarSign className="h-4 w-4 mr-1" />
                Pagar seleccionadas ({selectedIds.length})
              </Button>
            )}
          </div>

          <div className="flex flex-col gap-3">
            {loadingList
              ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-16 rounded-2xl bg-muted animate-pulse" />)
              : commissions.length === 0
              ? <p className="text-center text-muted-foreground py-8">No hay comisiones en el período.</p>
              : commissions.map((c) => (
                <div key={c.id} className="rounded-2xl border bg-card p-4 flex items-center gap-4 hover:shadow-sm hover:border-primary/20 transition-all">
                  {c.status === 'approved' && (
                    <input type="checkbox" checked={selectedIds.includes(c.id)} onChange={() => toggleSelect(c.id)} className="flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{c.product_name ?? '—'}</p>
                    <p className="text-xs text-muted-foreground font-mono">Venta #{c.sale_id} · Vendedor #{c.user_id}</p>
                  </div>
                  <div className="hidden sm:flex items-center gap-4 text-sm flex-shrink-0">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Venta</p>
                      <p className="font-medium">{fmt(c.sale_amount)}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Tasa</p>
                      <p className="font-medium">{Number(c.commission_rate).toFixed(2)}%</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Comisión</p>
                      <p className="font-bold text-emerald-600">{fmt(c.commission_amount)}</p>
                    </div>
                  </div>
                  <Badge variant={STATUS_VARIANT[c.status]} className="flex-shrink-0">{STATUS_LABEL[c.status]}</Badge>
                  {c.status === 'pending' && (
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0 flex-shrink-0"
                      onClick={() => approveMutation.mutate(c.id)}
                      disabled={approveMutation.isPending}>
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    </Button>
                  )}
                </div>
              ))
            }
          </div>

          {lastPage > 1 && (
            <div className="flex justify-center gap-2">
              <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-sm self-center">Página {page} / {lastPage}</span>
              <Button variant="outline" size="sm" disabled={page >= lastPage} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* ── Rules ── */}
      {tab === 'rules' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => { setEditRule(null); setShowRuleForm(true); }}>
              <Plus className="h-4 w-4 mr-2" /> Nueva regla
            </Button>
          </div>

          <div className="flex flex-col gap-3">
            {loadingRules
              ? Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 rounded-2xl bg-muted animate-pulse" />)
              : rules.length === 0
              ? (
                <div className="flex flex-col items-center justify-center py-14 gap-3 text-muted-foreground">
                  <div className="size-14 rounded-full bg-muted flex items-center justify-center">
                    <TrendingUp className="size-7 opacity-40" />
                  </div>
                  <p className="font-medium">No hay reglas de comisión configuradas</p>
                </div>
              )
              : rules.map((r) => (
                <div key={r.id} className="rounded-2xl border bg-card p-4 flex items-center gap-4 hover:shadow-sm hover:border-primary/20 transition-all">
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm">{r.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {APPLIES_LABEL[r.applies_to]}{r.entity_name ? ` (${r.entity_name})` : ''} · {r.type === 'percentage' ? 'Porcentaje' : 'Fijo'}
                    </p>
                  </div>
                  <span className="font-mono font-semibold text-sm flex-shrink-0">
                    {r.type === 'percentage' ? `${r.value}%` : fmt(r.value)}
                  </span>
                  <Badge variant={r.is_active ? 'default' : 'secondary'} className="flex-shrink-0">
                    {r.is_active ? 'Activa' : 'Inactiva'}
                  </Badge>
                  <div className="flex gap-1 flex-shrink-0">
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => { setEditRule(r); setShowRuleForm(true); }}>
                      <Edit2 className="h-4 w-4" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0"
                      onClick={() => { if (confirm('¿Eliminar regla?')) deleteRuleMutation.mutate(r.id); }}
                      disabled={deleteRuleMutation.isPending}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))
            }
          </div>
        </div>
      )}

      {showRuleForm && (
        <RuleForm
          rule={editRule}
          onClose={() => setShowRuleForm(false)}
          onSaved={() => { setShowRuleForm(false); invalidate(); }}
        />
      )}
    </div>
  );
}

// ─── Rule Form Dialog ─────────────────────────────────────────────────────────

function RuleForm({
  rule,
  onClose,
  onSaved,
}: { rule: CommissionRule | null; onClose: () => void; onSaved: () => void }) {
  const [name, setName] = useState(rule?.name ?? '');
  const [appliesTo, setAppliesTo] = useState<string>(rule?.applies_to ?? 'all');
  const [entityId, setEntityId] = useState<string>(rule?.entity_id ? String(rule.entity_id) : '');
  const [entityName, setEntityName] = useState(rule?.entity_name ?? '');
  const [type, setType] = useState<string>(rule?.type ?? 'percentage');
  const [value, setValue] = useState<string>(rule ? String(rule.value) : '5');
  const [isActive, setIsActive] = useState(rule?.is_active ?? true);
  const [notes, setNotes] = useState(rule?.notes ?? '');

  const mutation = useMutation({
    mutationFn: () => {
      const payload = {
        name, applies_to: appliesTo as any, type: type as any,
        value: parseFloat(value) || 0, is_active: isActive,
        entity_id: appliesTo !== 'all' ? (parseInt(entityId) || undefined) : undefined,
        entity_name: appliesTo !== 'all' ? (entityName || undefined) : undefined,
        notes: notes || undefined,
      };
      return rule
        ? commissionsApi.updateRule(rule.id, payload).then((r) => r.data)
        : commissionsApi.createRule(payload as any).then((r) => r.data);
    },
    onSuccess: () => { notify.success(rule ? 'Regla actualizada.' : 'Regla creada.'); onSaved(); },
    onError: () => notify.error('Error al guardar la regla.'),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{rule ? 'Editar regla' : 'Nueva regla de comisión'}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1">
            <Label>Nombre *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ej: Comisión medicamentos" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Aplica a</Label>
              <Select value={appliesTo} onValueChange={setAppliesTo}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los productos</SelectItem>
                  <SelectItem value="category">Por categoría</SelectItem>
                  <SelectItem value="product">Por producto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Tipo</Label>
              <Select value={type} onValueChange={setType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Porcentaje (%)</SelectItem>
                  <SelectItem value="fixed">Fijo (COP)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {appliesTo !== 'all' && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>ID de {appliesTo === 'category' ? 'categoría' : 'producto'}</Label>
                <Input
                  type="number"
                  value={entityId}
                  onChange={(e) => setEntityId(e.target.value)}
                  placeholder="ID"
                />
              </div>
              <div className="space-y-1">
                <Label>Nombre (referencia)</Label>
                <Input
                  value={entityName}
                  onChange={(e) => setEntityName(e.target.value)}
                  placeholder="Para identificar"
                />
              </div>
            </div>
          )}

          <div className="space-y-1">
            <Label>Valor {type === 'percentage' ? '(%)' : '(COP)'} *</Label>
            <Input type="number" value={value} onChange={(e) => setValue(e.target.value)} min={0} />
          </div>

          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="is_active"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <Label htmlFor="is_active">Regla activa</Label>
          </div>

          <div className="space-y-1">
            <Label>Notas</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => mutation.mutate()} disabled={!name || !value || mutation.isPending}>
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
