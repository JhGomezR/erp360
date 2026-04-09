'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import {
  Users, HandshakeIcon, DollarSign, Plus, Edit2, Trash2,
  CheckCircle, CreditCard, ChevronLeft, ChevronRight, XCircle,
} from 'lucide-react';
import { notify } from '@/lib/notify';
import { referralsApi, setTenantSlug } from '@/lib/api/tenant.api';
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
import type { Referrer, ReferralAgreement, ReferralCommission } from '@/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

const fmtDate = (d?: string) => d ? new Date(d).toLocaleDateString('es-CO') : '—';

const STATUS_BADGE: Record<string, 'default' | 'secondary' | 'destructive'> = {
  active: 'default', paused: 'secondary', ended: 'destructive',
  pending: 'secondary', approved: 'default', paid: 'default', cancelled: 'destructive',
};
const STATUS_LABEL: Record<string, string> = {
  active: 'Activo', paused: 'Pausado', ended: 'Finalizado',
  pending: 'Pendiente', approved: 'Aprobada', paid: 'Pagada', cancelled: 'Cancelada',
  all_sales: 'Todas las ventas', specific_customer: 'Cliente específico',
  percentage: 'Porcentaje', fixed: 'Monto fijo',
};

// ─── Referentes Tab ───────────────────────────────────────────────────────────

function ReferrersTab() {
  const { slug } = useParams<{ slug: string }>();
  setTenantSlug(slug);
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Referrer | null>(null);
  const [form, setForm] = useState<Partial<Referrer>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['referrers', slug, page, search],
    queryFn: () => referralsApi.listReferrers({ page, search: search || undefined }),
  });

  const save = useMutation({
    mutationFn: (d: Partial<Referrer>) =>
      editing ? referralsApi.updateReferrer(editing.id, d) : referralsApi.createReferrer(d),
    onSuccess: () => {
      notify.success(editing ? 'Referente actualizado.' : 'Referente creado.');
      qc.invalidateQueries({ queryKey: ['referrers', slug] });
      setOpen(false); setEditing(null); setForm({});
    },
    onError: (e: any) => notify.error(e?.response?.data?.message ?? 'Error al guardar.'),
  });

  const del = useMutation({
    mutationFn: (id: number) => referralsApi.deleteReferrer(id),
    onSuccess: () => { notify.success('Referente eliminado.'); qc.invalidateQueries({ queryKey: ['referrers', slug] }); },
    onError: (e: any) => notify.error(e?.response?.data?.message ?? 'No se puede eliminar.'),
  });

  const openNew = () => { setEditing(null); setForm({ is_active: true, document_type: 'CC' }); setOpen(true); };
  const openEdit = (r: Referrer) => { setEditing(r); setForm(r); setOpen(true); };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="Buscar por nombre, email o documento..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          className="max-w-sm"
        />
        <Button onClick={openNew}><Plus className="size-4 mr-1" /> Nuevo referente</Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : (
        <div className="space-y-2">
          {data?.data.map(r => (
            <Card key={r.id}>
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{r.name}</span>
                    <Badge variant={r.is_active ? 'default' : 'secondary'}>
                      {r.is_active ? 'Activo' : 'Inactivo'}
                    </Badge>
                  </div>
                  <div className="text-sm text-muted-foreground mt-0.5 flex gap-4 flex-wrap">
                    {r.email && <span>{r.email}</span>}
                    {r.phone && <span>{r.phone}</span>}
                    {r.document && <span>{r.document_type}: {r.document}</span>}
                  </div>
                </div>
                <div className="text-right shrink-0 hidden sm:block">
                  <div className="text-sm font-medium text-green-600">{fmt(r.total_earned ?? 0)} ganado</div>
                  <div className="text-xs text-muted-foreground">{fmt(r.pending_amount ?? 0)} pendiente</div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(r)}><Edit2 className="size-4" /></Button>
                  <Button size="icon" variant="ghost" className="text-destructive"
                    onClick={() => { if (confirm(`¿Eliminar a ${r.name}?`)) del.mutate(r.id); }}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Paginación */}
      {data && data.last_page > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>
            <ChevronLeft className="size-4" />
          </Button>
          <span className="text-sm">{page} / {data.last_page}</span>
          <Button size="sm" variant="outline" disabled={page === data.last_page} onClick={() => setPage(p => p + 1)}>
            <ChevronRight className="size-4" />
          </Button>
        </div>
      )}

      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar referente' : 'Nuevo referente'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Nombre *</Label>
              <Input value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Email</Label>
                <Input value={form.email ?? ''} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></div>
              <div><Label>Teléfono</Label>
                <Input value={form.phone ?? ''} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Tipo doc.</Label>
                <Select value={form.document_type ?? 'CC'} onValueChange={v => setForm(f => ({ ...f, document_type: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {['CC', 'CE', 'NIT', 'TI', 'PP', 'RC'].map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Documento</Label>
                <Input value={form.document ?? ''} onChange={e => setForm(f => ({ ...f, document: e.target.value }))} /></div>
            </div>
            <div><Label>Notas</Label>
              <Textarea value={form.notes ?? ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
            <div className="border rounded-md p-3 space-y-2">
              <p className="text-sm font-medium">Datos de pago (para liquidar comisiones)</p>
              <div><Label>Banco</Label>
                <Input value={form.payment_info?.bank ?? ''} onChange={e => setForm(f => ({ ...f, payment_info: { ...f.payment_info, bank: e.target.value } }))} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Tipo cuenta</Label>
                  <Input placeholder="Ahorros / Corriente" value={form.payment_info?.account_type ?? ''} onChange={e => setForm(f => ({ ...f, payment_info: { ...f.payment_info, account_type: e.target.value } }))} /></div>
                <div><Label>Nº cuenta</Label>
                  <Input value={form.payment_info?.account_number ?? ''} onChange={e => setForm(f => ({ ...f, payment_info: { ...f.payment_info, account_number: e.target.value } }))} /></div>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate(form)} disabled={!form.name || save.isPending}>
              {save.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Acuerdos Tab ─────────────────────────────────────────────────────────────

function AgreementsTab() {
  const { slug } = useParams<{ slug: string }>();
  setTenantSlug(slug);
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<ReferralAgreement | null>(null);
  const [form, setForm] = useState<Partial<ReferralAgreement>>({});

  const { data, isLoading } = useQuery({
    queryKey: ['referral-agreements', slug, page],
    queryFn: () => referralsApi.listAgreements({ page }),
  });

  const { data: referrers } = useQuery({
    queryKey: ['referrers-all', slug],
    queryFn: () => referralsApi.listReferrers({ per_page: 200, active: true }),
  });

  const save = useMutation({
    mutationFn: (d: Partial<ReferralAgreement>) =>
      editing ? referralsApi.updateAgreement(editing.id, d) : referralsApi.createAgreement(d),
    onSuccess: () => {
      notify.success(editing ? 'Acuerdo actualizado.' : 'Acuerdo creado.');
      qc.invalidateQueries({ queryKey: ['referral-agreements', slug] });
      setOpen(false); setEditing(null); setForm({});
    },
    onError: (e: any) => notify.error(e?.response?.data?.message ?? 'Error al guardar.'),
  });

  const del = useMutation({
    mutationFn: (id: number) => referralsApi.deleteAgreement(id),
    onSuccess: () => { notify.success('Acuerdo eliminado.'); qc.invalidateQueries({ queryKey: ['referral-agreements', slug] }); },
    onError: (e: any) => notify.error(e?.response?.data?.message ?? 'No se puede eliminar.'),
  });

  const openNew = () => {
    setEditing(null);
    setForm({ type: 'percentage', applies_to: 'all_sales', status: 'active', starts_at: new Date().toISOString().slice(0, 10) });
    setOpen(true);
  };
  const openEdit = (a: ReferralAgreement) => { setEditing(a); setForm(a); setOpen(true); };

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={openNew}><Plus className="size-4 mr-1" /> Nuevo acuerdo</Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
      ) : (
        <div className="space-y-2">
          {data?.data.map(a => (
            <Card key={a.id}>
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{a.name}</span>
                    <Badge variant={STATUS_BADGE[a.status]}>{STATUS_LABEL[a.status]}</Badge>
                    <Badge variant="outline">{a.type === 'percentage' ? `${a.rate}%` : fmt(a.rate)}</Badge>
                    <Badge variant="outline">{STATUS_LABEL[a.applies_to]}</Badge>
                  </div>
                  <div className="text-sm text-muted-foreground mt-0.5">
                    {a.referrer?.name} · Desde {fmtDate(a.starts_at)}{a.ends_at ? ` hasta ${fmtDate(a.ends_at)}` : ' (sin vencimiento)'}
                  </div>
                </div>
                <div className="text-right shrink-0 hidden sm:block">
                  <div className="text-sm font-medium">{fmt(a.total_commissions ?? 0)}</div>
                  <div className="text-xs text-muted-foreground">{a.commissions_count ?? 0} comisiones</div>
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="icon" variant="ghost" onClick={() => openEdit(a)}><Edit2 className="size-4" /></Button>
                  <Button size="icon" variant="ghost" className="text-destructive"
                    onClick={() => { if (confirm('¿Eliminar acuerdo?')) del.mutate(a.id); }}>
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {data && data.last_page > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="size-4" /></Button>
          <span className="text-sm">{page} / {data.last_page}</span>
          <Button size="sm" variant="outline" disabled={page === data.last_page} onClick={() => setPage(p => p + 1)}><ChevronRight className="size-4" /></Button>
        </div>
      )}

      {/* Dialog */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? 'Editar acuerdo' : 'Nuevo acuerdo'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div><Label>Referente *</Label>
              <Select value={String(form.referrer_id ?? '')} onValueChange={v => setForm(f => ({ ...f, referrer_id: Number(v) }))}>
                <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                <SelectContent>
                  {referrers?.data.map(r => <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div><Label>Nombre del acuerdo *</Label>
              <Input value={form.name ?? ''} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Tipo de comisión *</Label>
                <Select value={form.type ?? 'percentage'} onValueChange={v => setForm(f => ({ ...f, type: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="percentage">Porcentaje (%)</SelectItem>
                    <SelectItem value="fixed">Monto fijo ($)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div><Label>{form.type === 'percentage' ? 'Porcentaje (%)' : 'Monto fijo'} *</Label>
                <Input type="number" min="0.01" step="0.01" value={form.rate ?? ''} onChange={e => setForm(f => ({ ...f, rate: parseFloat(e.target.value) }))} /></div>
            </div>
            <div><Label>Aplica a</Label>
              <Select value={form.applies_to ?? 'all_sales'} onValueChange={v => setForm(f => ({ ...f, applies_to: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all_sales">Todas las ventas del referente</SelectItem>
                  <SelectItem value="specific_customer">Un cliente específico</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Fecha inicio *</Label>
                <Input type="date" value={form.starts_at ?? ''} onChange={e => setForm(f => ({ ...f, starts_at: e.target.value }))} /></div>
              <div><Label>Fecha fin</Label>
                <Input type="date" value={form.ends_at ?? ''} onChange={e => setForm(f => ({ ...f, ends_at: e.target.value || undefined }))} /></div>
            </div>
            <div><Label>Estado</Label>
              <Select value={form.status ?? 'active'} onValueChange={v => setForm(f => ({ ...f, status: v as any }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Activo</SelectItem>
                  <SelectItem value="paused">Pausado</SelectItem>
                  <SelectItem value="ended">Finalizado</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div><Label>Notas</Label>
              <Textarea value={form.notes ?? ''} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => save.mutate(form)} disabled={!form.referrer_id || !form.name || !form.rate || save.isPending}>
              {save.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── Comisiones Tab ───────────────────────────────────────────────────────────

function CommissionsTab() {
  const { slug } = useParams<{ slug: string }>();
  setTenantSlug(slug);
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['referral-commissions', slug, page, statusFilter],
    queryFn: () => referralsApi.listCommissions({ page, status: statusFilter || undefined }),
  });

  const { data: summary } = useQuery({
    queryKey: ['referral-commissions-summary', slug],
    queryFn: () => referralsApi.commissionsSummary(),
  });

  const approve = useMutation({
    mutationFn: (id: number) => referralsApi.approveCommission(id),
    onSuccess: () => { notify.success('Comisión aprobada.'); qc.invalidateQueries({ queryKey: ['referral-commissions', slug] }); },
    onError: (e: any) => notify.error(e?.response?.data?.message ?? 'Error.'),
  });

  const pay = useMutation({
    mutationFn: (id: number) => referralsApi.payCommission(id),
    onSuccess: () => { notify.success('Comisión marcada como pagada.'); qc.invalidateQueries({ queryKey: ['referral-commissions', slug] }); qc.invalidateQueries({ queryKey: ['referral-commissions-summary', slug] }); },
    onError: (e: any) => notify.error(e?.response?.data?.message ?? 'Error.'),
  });

  const bulkPay = useMutation({
    mutationFn: (referrer_id: number) => referralsApi.bulkPay(referrer_id),
    onSuccess: (res: any) => { notify.success(res?.message ?? 'Pagos registrados.'); qc.invalidateQueries({ queryKey: ['referral-commissions', slug] }); qc.invalidateQueries({ queryKey: ['referral-commissions-summary', slug] }); },
    onError: (e: any) => notify.error(e?.response?.data?.message ?? 'Error.'),
  });

  const cancel = useMutation({
    mutationFn: (id: number) => referralsApi.cancelCommission(id),
    onSuccess: () => { notify.success('Comisión cancelada.'); qc.invalidateQueries({ queryKey: ['referral-commissions', slug] }); },
    onError: (e: any) => notify.error(e?.response?.data?.message ?? 'Error.'),
  });

  return (
    <div className="space-y-4">
      {/* Resumen por referente */}
      {summary && summary.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {summary.map(s => (
            <Card key={s.referrer_id}>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">{s.referrer_name}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Pendiente</span>
                  <span className="font-medium text-yellow-600">{fmt(s.pending_amount)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Pagado</span>
                  <span className="font-medium text-green-600">{fmt(s.paid_amount)}</span>
                </div>
                {s.pending_amount > 0 && (
                  <Button size="sm" className="w-full mt-2" variant="outline"
                    onClick={() => { if (confirm(`¿Pagar todas las comisiones aprobadas de ${s.referrer_name}?`)) bulkPay.mutate(s.referrer_id); }}>
                    <CreditCard className="size-3 mr-1" /> Pagar aprobadas
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Filtro */}
      <div className="flex gap-2">
        <Select value={statusFilter} onValueChange={v => { setStatusFilter(v === 'all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Todos los estados" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="pending">Pendiente</SelectItem>
            <SelectItem value="approved">Aprobada</SelectItem>
            <SelectItem value="paid">Pagada</SelectItem>
            <SelectItem value="cancelled">Cancelada</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
      ) : (
        <div className="space-y-2">
          {data?.data.map(c => (
            <Card key={c.id}>
              <CardContent className="p-3 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium text-sm">{c.referrer?.name}</span>
                    <Badge variant={STATUS_BADGE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
                    <span className="text-xs text-muted-foreground">Venta {c.sale_number}</span>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {c.customer_name ?? 'Sin cliente'} · {fmtDate(c.created_at)}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-semibold text-green-600">{fmt(c.commission_amount)}</div>
                  <div className="text-xs text-muted-foreground">
                    {c.commission_type === 'percentage' ? `${c.commission_rate}%` : 'fijo'} de {fmt(c.sale_amount)}
                  </div>
                </div>
                <div className="flex gap-1 shrink-0">
                  {c.status === 'pending' && (
                    <Button size="icon" variant="ghost" title="Aprobar"
                      onClick={() => approve.mutate(c.id)}>
                      <CheckCircle className="size-4 text-green-600" />
                    </Button>
                  )}
                  {c.status === 'approved' && (
                    <Button size="icon" variant="ghost" title="Marcar pagada"
                      onClick={() => pay.mutate(c.id)}>
                      <CreditCard className="size-4 text-blue-600" />
                    </Button>
                  )}
                  {['pending', 'approved'].includes(c.status) && (
                    <Button size="icon" variant="ghost" title="Cancelar"
                      onClick={() => { if (confirm('¿Cancelar comisión?')) cancel.mutate(c.id); }}>
                      <XCircle className="size-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {data?.data.length === 0 && (
            <p className="text-center text-muted-foreground py-8">Sin comisiones para mostrar.</p>
          )}
        </div>
      )}

      {data && data.last_page > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button size="sm" variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}><ChevronLeft className="size-4" /></Button>
          <span className="text-sm">{page} / {data.last_page}</span>
          <Button size="sm" variant="outline" disabled={page === data.last_page} onClick={() => setPage(p => p + 1)}><ChevronRight className="size-4" /></Button>
        </div>
      )}
    </div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function ReferralsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Referidos</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Gestiona referentes externos, acuerdos de comisión y pagos por ventas referidas.
        </p>
      </div>

      <Tabs defaultValue="referrers">
        <TabsList>
          <TabsTrigger value="referrers">
            <Users className="size-4 mr-1.5" /> Referentes
          </TabsTrigger>
          <TabsTrigger value="agreements">
            <HandshakeIcon className="size-4 mr-1.5" /> Acuerdos
          </TabsTrigger>
          <TabsTrigger value="commissions">
            <DollarSign className="size-4 mr-1.5" /> Comisiones
          </TabsTrigger>
        </TabsList>

        <TabsContent value="referrers" className="mt-4"><ReferrersTab /></TabsContent>
        <TabsContent value="agreements" className="mt-4"><AgreementsTab /></TabsContent>
        <TabsContent value="commissions" className="mt-4"><CommissionsTab /></TabsContent>
      </Tabs>
    </div>
  );
}
