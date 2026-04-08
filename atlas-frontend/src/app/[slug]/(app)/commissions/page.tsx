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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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

      <Tabs value={tab} onValueChange={(v) => setTab(v as any)}>
        <TabsList>
          <TabsTrigger value="summary">Resumen por vendedor</TabsTrigger>
          <TabsTrigger value="detail">Detalle</TabsTrigger>
          <TabsTrigger value="rules">Reglas de comisión</TabsTrigger>
        </TabsList>

        {/* ── Summary ── */}
        <TabsContent value="summary" className="space-y-4">
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
        </TabsContent>

        {/* ── Detail ── */}
        <TabsContent value="detail" className="space-y-4">
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

          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr className="text-left text-muted-foreground">
                    <th className="px-4 py-3 w-8"></th>
                    <th className="px-4 py-3">Venta</th>
                    <th className="px-4 py-3">Producto</th>
                    <th className="px-4 py-3">Vendedor</th>
                    <th className="px-4 py-3 text-right">Venta</th>
                    <th className="px-4 py-3 text-right">Tasa</th>
                    <th className="px-4 py-3 text-right">Comisión</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingList
                    ? Array.from({ length: 5 }).map((_, i) => (
                        <tr key={i} className="border-b">
                          {Array.from({ length: 9 }).map((_, j) => (
                            <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                          ))}
                        </tr>
                      ))
                    : commissions.map((c) => (
                        <tr key={c.id} className="border-b hover:bg-muted/30">
                          <td className="px-4 py-3">
                            {c.status === 'approved' && (
                              <input
                                type="checkbox"
                                checked={selectedIds.includes(c.id)}
                                onChange={() => toggleSelect(c.id)}
                              />
                            )}
                          </td>
                          <td className="px-4 py-3 font-mono text-xs">#{c.sale_id}</td>
                          <td className="px-4 py-3">{c.product_name ?? '-'}</td>
                          <td className="px-4 py-3">#{c.user_id}</td>
                          <td className="px-4 py-3 text-right">{fmt(c.sale_amount)}</td>
                          <td className="px-4 py-3 text-right">{Number(c.commission_rate).toFixed(2)}%</td>
                          <td className="px-4 py-3 text-right font-semibold">{fmt(c.commission_amount)}</td>
                          <td className="px-4 py-3">
                            <Badge variant={STATUS_VARIANT[c.status]}>{STATUS_LABEL[c.status]}</Badge>
                          </td>
                          <td className="px-4 py-3 text-right">
                            {c.status === 'pending' && (
                              <Button
                                size="sm" variant="ghost"
                                onClick={() => approveMutation.mutate(c.id)}
                                disabled={approveMutation.isPending}
                              >
                                <CheckCircle className="h-4 w-4 text-green-500" />
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                  {!loadingList && commissions.length === 0 && (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-muted-foreground">
                        No hay comisiones en el período.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>

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
        </TabsContent>

        {/* ── Rules ── */}
        <TabsContent value="rules" className="space-y-4">
          <div className="flex justify-end">
            <Button onClick={() => { setEditRule(null); setShowRuleForm(true); }}>
              <Plus className="h-4 w-4 mr-2" /> Nueva regla
            </Button>
          </div>

          <Card>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr className="text-left text-muted-foreground">
                    <th className="px-4 py-3">Nombre</th>
                    <th className="px-4 py-3">Aplica a</th>
                    <th className="px-4 py-3">Tipo</th>
                    <th className="px-4 py-3 text-right">Valor</th>
                    <th className="px-4 py-3">Estado</th>
                    <th className="px-4 py-3 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {loadingRules
                    ? Array.from({ length: 3 }).map((_, i) => (
                        <tr key={i} className="border-b">
                          {Array.from({ length: 6 }).map((_, j) => (
                            <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-full" /></td>
                          ))}
                        </tr>
                      ))
                    : rules.map((r) => (
                        <tr key={r.id} className="border-b hover:bg-muted/30">
                          <td className="px-4 py-3 font-medium">{r.name}</td>
                          <td className="px-4 py-3">
                            {APPLIES_LABEL[r.applies_to]}
                            {r.entity_name && <span className="text-xs text-muted-foreground"> ({r.entity_name})</span>}
                          </td>
                          <td className="px-4 py-3">{r.type === 'percentage' ? 'Porcentaje' : 'Fijo'}</td>
                          <td className="px-4 py-3 text-right font-mono">
                            {r.type === 'percentage' ? `${r.value}%` : fmt(r.value)}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={r.is_active ? 'default' : 'secondary'}>
                              {r.is_active ? 'Activa' : 'Inactiva'}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-right space-x-1">
                            <Button size="sm" variant="ghost" onClick={() => { setEditRule(r); setShowRuleForm(true); }}>
                              <Edit2 className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm" variant="ghost"
                              onClick={() => { if (confirm('¿Eliminar regla?')) deleteRuleMutation.mutate(r.id); }}
                              disabled={deleteRuleMutation.isPending}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                  {!loadingRules && rules.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                        No hay reglas de comisión configuradas.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

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
