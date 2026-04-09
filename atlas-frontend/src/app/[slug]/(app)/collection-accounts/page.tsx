'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import {
  Banknote, Plus, Eye, Trash2, Send, CheckCircle, X, ChevronLeft, ChevronRight,
  Building2,
} from 'lucide-react';
import { notify } from '@/lib/notify';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { collectionAccountsApi, setTenantSlug } from '@/lib/api/tenant.api';
import type {
  CollectionAccount, CollectionAccountEntity, CollectionAccountItem,
} from '@/types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (n: number) =>
  new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n);

const STATUS_LABEL: Record<string, string> = {
  draft: 'Borrador', sent: 'Enviada', paid: 'Pagada', overdue: 'Vencida', cancelled: 'Cancelada',
};
const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive'> = {
  draft: 'secondary', sent: 'default', paid: 'default', overdue: 'destructive', cancelled: 'destructive',
};
const ENTITY_TYPE_LABEL: Record<string, string> = {
  eps: 'EPS', insurance: 'Aseguradora', fund: 'Fondo de empleados', other: 'Otro',
};

function emptyItem(): CollectionAccountItem {
  return { description: '', quantity: 1, unit_price: 0, tax_rate: 0 };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function CollectionAccountsPage() {
  const { slug } = useParams<{ slug: string }>();
  setTenantSlug(slug);
  const qc = useQueryClient();

  const [page, setPage] = useState(1);
  const [filterStatus, setFilterStatus] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [showEntityForm, setShowEntityForm] = useState(false);
  const [viewAccount, setViewAccount] = useState<CollectionAccount | null>(null);
  const [payDialog, setPayDialog] = useState<CollectionAccount | null>(null);
  const [payAmount, setPayAmount] = useState('');

  const { data: accountsData, isLoading } = useQuery({
    queryKey: ['collection-accounts', slug, page, filterStatus],
    queryFn: () =>
      collectionAccountsApi.list({ page, ...(filterStatus ? { status: filterStatus } : {}) })
        .then((r) => r.data),
  });

  const { data: entitiesData } = useQuery({
    queryKey: ['collection-entities', slug],
    queryFn: () => collectionAccountsApi.listEntities().then((r) => r.data),
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['collection-accounts', slug] });
    qc.invalidateQueries({ queryKey: ['collection-entities', slug] });
  };

  const sendMutation = useMutation({
    mutationFn: (id: number) => collectionAccountsApi.send(id),
    onSuccess: () => { notify.success('Cuenta marcada como enviada.'); invalidate(); },
    onError: () => notify.error('Error al enviar la cuenta.'),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: number) => collectionAccountsApi.cancel(id),
    onSuccess: () => { notify.success('Cuenta cancelada.'); invalidate(); setViewAccount(null); },
    onError: () => notify.error('Error al cancelar.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => collectionAccountsApi.delete(id),
    onSuccess: () => { notify.success('Cuenta eliminada.'); invalidate(); },
    onError: () => notify.error('Error al eliminar.'),
  });

  const payMutation = useMutation({
    mutationFn: ({ id, amount }: { id: number; amount: number }) =>
      collectionAccountsApi.pay(id, { amount_paid: amount }).then((r) => r.data),
    onSuccess: () => { notify.success('Pago registrado.'); invalidate(); setPayDialog(null); setPayAmount(''); },
    onError: () => notify.error('Error al registrar el pago.'),
  });

  const accounts: CollectionAccount[] = (accountsData as any)?.data ?? [];
  const lastPage: number = (accountsData as any)?.last_page ?? 1;
  const entities: CollectionAccountEntity[] = entitiesData ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Banknote className="h-6 w-6" />
            Cuentas de Cobro
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Facturación a EPS, aseguradoras y fondos de empleados.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setShowEntityForm(true)}>
            <Building2 className="h-4 w-4 mr-2" /> Entidades
          </Button>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4 mr-2" /> Nueva cuenta
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={filterStatus || '_all'} onValueChange={(v) => { setFilterStatus(v === '_all' ? '' : v); setPage(1); }}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="Todos los estados" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Todos</SelectItem>
            {Object.entries(STATUS_LABEL).map(([v, l]) => (
              <SelectItem key={v} value={v}>{l}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      <div className="flex flex-col gap-3">
        {isLoading
          ? Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-20 rounded-2xl bg-muted animate-pulse" />)
          : accounts.length === 0
          ? (
            <div className="flex flex-col items-center justify-center py-14 gap-3 text-muted-foreground">
              <div className="size-14 rounded-full bg-muted flex items-center justify-center">
                <Banknote className="size-7 opacity-40" />
              </div>
              <p className="font-medium">No hay cuentas de cobro registradas</p>
              <Button variant="outline" size="sm" onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4 mr-2" /> Nueva cuenta
              </Button>
            </div>
          )
          : accounts.map((acc) => {
            const balance = acc.total - acc.amount_paid;
            return (
              <div key={acc.id} className="rounded-2xl border bg-card p-4 flex items-center gap-4 hover:shadow-sm hover:border-primary/20 transition-all">
                <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
                  <Banknote className="size-4 text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm font-mono">{acc.account_number}</p>
                  <p className="text-xs text-muted-foreground">{acc.entity?.name ?? `#${acc.entity_id}`} · Vence: {acc.due_date}</p>
                  <p className="text-xs text-muted-foreground">{acc.period_from} → {acc.period_to}</p>
                </div>
                <div className="hidden sm:flex items-center gap-4 text-sm flex-shrink-0">
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Total</p>
                    <p className="font-medium">{fmt(acc.total)}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-muted-foreground">Saldo</p>
                    <p className={`font-semibold ${balance > 0 ? 'text-orange-600' : 'text-emerald-600'}`}>{fmt(balance)}</p>
                  </div>
                </div>
                <Badge variant={STATUS_VARIANT[acc.status]} className="flex-shrink-0">{STATUS_LABEL[acc.status]}</Badge>
                <div className="flex gap-1 flex-shrink-0">
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={() => setViewAccount(acc)}>
                    <Eye className="h-4 w-4" />
                  </Button>
                  {acc.status === 'draft' && (
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0"
                      onClick={() => sendMutation.mutate(acc.id)}
                      disabled={sendMutation.isPending}>
                      <Send className="h-4 w-4 text-blue-500" />
                    </Button>
                  )}
                  {['sent', 'overdue'].includes(acc.status) && (
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0"
                      onClick={() => { setPayDialog(acc); setPayAmount(String(balance)); }}>
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    </Button>
                  )}
                  {acc.status === 'draft' && (
                    <Button size="sm" variant="ghost" className="h-8 w-8 p-0"
                      onClick={() => { if (confirm('¿Eliminar cuenta?')) deleteMutation.mutate(acc.id); }}
                      disabled={deleteMutation.isPending}>
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })
        }
      </div>

      {/* Pagination */}
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

      {/* Modals */}
      {showForm && (
        <AccountForm
          entities={entities}
          onClose={() => setShowForm(false)}
          onSaved={() => { setShowForm(false); invalidate(); }}
        />
      )}

      {showEntityForm && (
        <EntityManager
          entities={entities}
          onClose={() => setShowEntityForm(false)}
          onChanged={invalidate}
        />
      )}

      {viewAccount && (
        <ViewDialog
          account={viewAccount}
          onClose={() => setViewAccount(null)}
          onCancel={() => cancelMutation.mutate(viewAccount.id)}
        />
      )}

      {payDialog && (
        <Dialog open onOpenChange={() => setPayDialog(null)}>
          <DialogContent className="max-w-sm">
            <DialogHeader>
              <DialogTitle>Registrar pago — {payDialog.account_number}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="space-y-1">
                <Label>Monto a abonar</Label>
                <Input
                  type="number"
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  min={0.01}
                />
              </div>
              <p className="text-xs text-muted-foreground">
                Saldo pendiente: {fmt(payDialog.total - payDialog.amount_paid)}
              </p>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setPayDialog(null)}>Cancelar</Button>
              <Button
                onClick={() => payMutation.mutate({ id: payDialog.id, amount: parseFloat(payAmount) || 0 })}
                disabled={!payAmount || parseFloat(payAmount) <= 0 || payMutation.isPending}
              >
                Registrar pago
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// ─── Account Form ─────────────────────────────────────────────────────────────

function AccountForm({
  entities, onClose, onSaved,
}: { entities: CollectionAccountEntity[]; onClose: () => void; onSaved: () => void }) {
  const [entityId, setEntityId] = useState('');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [concept, setConcept] = useState('');
  const [notes, setNotes] = useState('');
  const [items, setItems] = useState<CollectionAccountItem[]>([emptyItem()]);

  const createMutation = useMutation({
    mutationFn: () =>
      collectionAccountsApi.create({
        entity_id: Number(entityId),
        period_from: periodFrom,
        period_to: periodTo,
        due_date: dueDate,
        concept,
        notes: notes || undefined,
        items,
      }).then((r) => r.data),
    onSuccess: () => { notify.success('Cuenta de cobro creada.'); onSaved(); },
    onError: () => notify.error('Error al crear la cuenta.'),
  });

  const updateItem = (i: number, field: keyof CollectionAccountItem, value: string | number) =>
    setItems((prev) => prev.map((it, idx) => idx === i ? { ...it, [field]: value } : it));
  const addItem = () => setItems((prev) => [...prev, emptyItem()]);
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  const total = items.reduce((s, it) => {
    const base = it.unit_price * it.quantity;
    return s + base + base * ((it.tax_rate ?? 0) / 100);
  }, 0);

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Nueva Cuenta de Cobro</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Entidad *</Label>
              <Select value={entityId} onValueChange={setEntityId}>
                <SelectTrigger><SelectValue placeholder="Seleccionar entidad" /></SelectTrigger>
                <SelectContent>
                  {entities.filter((e) => e.is_active).map((e) => (
                    <SelectItem key={e.id} value={String(e.id)}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Fecha límite de pago *</Label>
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1">
              <Label>Período desde *</Label>
              <Input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Período hasta *</Label>
              <Input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Concepto *</Label>
            <Textarea value={concept} onChange={(e) => setConcept(e.target.value)} rows={2} />
          </div>
          <div className="space-y-1">
            <Label>Notas internas</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>

          {/* Items */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-base font-semibold">Servicios / Ítems</Label>
              <Button type="button" size="sm" variant="outline" onClick={addItem}>
                <Plus className="h-3 w-3 mr-1" /> Agregar
              </Button>
            </div>
            <div className="border rounded-md overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-2 py-2 text-left">Descripción</th>
                    <th className="px-2 py-2 text-right w-20">Cant.</th>
                    <th className="px-2 py-2 text-right w-28">V. unitario</th>
                    <th className="px-2 py-2 text-right w-20">IVA %</th>
                    <th className="px-2 py-2 text-right w-28">Total</th>
                    <th className="px-2 py-2 w-8"></th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => {
                    const base = item.unit_price * item.quantity;
                    const lineTotal = base + base * ((item.tax_rate ?? 0) / 100);
                    return (
                      <tr key={i} className="border-t">
                        <td className="px-2 py-1">
                          <Input
                            value={item.description}
                            onChange={(e) => updateItem(i, 'description', e.target.value)}
                            placeholder="Servicio prestado"
                            className="h-7 text-xs"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <Input
                            type="number" value={item.quantity}
                            onChange={(e) => updateItem(i, 'quantity', parseFloat(e.target.value) || 0)}
                            className="h-7 text-xs text-right"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <Input
                            type="number" value={item.unit_price}
                            onChange={(e) => updateItem(i, 'unit_price', parseFloat(e.target.value) || 0)}
                            className="h-7 text-xs text-right"
                          />
                        </td>
                        <td className="px-2 py-1">
                          <Input
                            type="number" value={item.tax_rate}
                            onChange={(e) => updateItem(i, 'tax_rate', parseFloat(e.target.value) || 0)}
                            className="h-7 text-xs text-right"
                          />
                        </td>
                        <td className="px-2 py-1 text-right font-mono">{fmt(lineTotal)}</td>
                        <td className="px-2 py-1">
                          {items.length > 1 && (
                            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => removeItem(i)}>
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t bg-muted/30">
                  <tr>
                    <td colSpan={4} className="px-2 py-2 text-right font-semibold">Total:</td>
                    <td className="px-2 py-2 text-right font-mono font-bold">{fmt(total)}</td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancelar</Button>
          <Button
            onClick={() => createMutation.mutate()}
            disabled={!entityId || !concept || !periodFrom || !periodTo || !dueDate || createMutation.isPending}
          >
            Guardar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Entity Manager ──────────────────────────────────────────────────────────

function EntityManager({
  entities, onClose, onChanged,
}: { entities: CollectionAccountEntity[]; onClose: () => void; onChanged: () => void }) {
  const [name, setName] = useState('');
  const [type, setType] = useState<string>('eps');
  const [nit, setNit] = useState('');

  const createMutation = useMutation({
    mutationFn: () =>
      collectionAccountsApi.createEntity({
        name, type: type as any, nit: nit || undefined, is_active: true,
      }).then((r) => r.data),
    onSuccess: () => { notify.success('Entidad creada.'); setName(''); setNit(''); onChanged(); },
    onError: () => notify.error('Error al crear la entidad.'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => collectionAccountsApi.deleteEntity(id),
    onSuccess: () => { notify.success('Entidad eliminada.'); onChanged(); },
    onError: () => notify.error('No se puede eliminar (tiene cuentas asociadas).'),
  });

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Entidades pagadoras</DialogTitle></DialogHeader>
        <div className="space-y-4">
          {/* Add entity */}
          <div className="border rounded-md p-3 space-y-3">
            <p className="text-sm font-semibold">Agregar entidad</p>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2 space-y-1">
                <Label>Nombre *</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nombre de la entidad" />
              </div>
              <div className="space-y-1">
                <Label>Tipo</Label>
                <Select value={type} onValueChange={setType}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {Object.entries(ENTITY_TYPE_LABEL).map(([v, l]) => (
                      <SelectItem key={v} value={v}>{l}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label>NIT</Label>
              <Input value={nit} onChange={(e) => setNit(e.target.value)} placeholder="900.123.456-7" />
            </div>
            <Button size="sm" onClick={() => createMutation.mutate()} disabled={!name || createMutation.isPending}>
              <Plus className="h-3 w-3 mr-1" /> Crear
            </Button>
          </div>

          {/* List */}
          <div className="space-y-1 max-h-60 overflow-y-auto">
            {entities.map((e) => (
              <div key={e.id} className="flex items-center justify-between p-2 border rounded-md">
                <div>
                  <p className="font-medium text-sm">{e.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {ENTITY_TYPE_LABEL[e.type]}{e.nit ? ` · NIT: ${e.nit}` : ''}
                  </p>
                </div>
                <Button
                  size="icon" variant="ghost"
                  onClick={() => { if (confirm('¿Eliminar entidad?')) deleteMutation.mutate(e.id); }}
                  disabled={deleteMutation.isPending}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            ))}
            {entities.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-4">No hay entidades.</p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── View Dialog ─────────────────────────────────────────────────────────────

function ViewDialog({
  account, onClose, onCancel,
}: { account: CollectionAccount; onClose: () => void; onCancel: () => void }) {
  const { slug } = useParams<{ slug: string }>();
  const { data: full } = useQuery({
    queryKey: ['collection-account', slug, account.id],
    queryFn: () => collectionAccountsApi.get(account.id).then((r) => r.data),
  });
  const d = full ?? account;

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between">
            <span>{d.account_number}</span>
            <Badge variant={STATUS_VARIANT[d.status]}>{STATUS_LABEL[d.status]}</Badge>
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 text-sm">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-muted-foreground">Entidad</p>
              <p className="font-medium">{d.entity?.name ?? `#${d.entity_id}`}</p>
              {d.entity?.nit && <p className="text-xs text-muted-foreground">NIT: {d.entity.nit}</p>}
            </div>
            <div>
              <p className="text-muted-foreground">Período</p>
              <p className="font-medium">{d.period_from} → {d.period_to}</p>
              <p className="text-xs text-muted-foreground">Vence: {d.due_date}</p>
            </div>
          </div>

          <div>
            <p className="text-muted-foreground">Concepto</p>
            <p>{d.concept}</p>
          </div>

          {d.items && d.items.length > 0 && (
            <div>
              <p className="font-semibold mb-2">Ítems</p>
              <table className="w-full text-xs border rounded-md overflow-hidden">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="px-2 py-1 text-left">Descripción</th>
                    <th className="px-2 py-1 text-right">Cant.</th>
                    <th className="px-2 py-1 text-right">V. Unit.</th>
                    <th className="px-2 py-1 text-right">IVA</th>
                    <th className="px-2 py-1 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {d.items.map((it, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-2 py-1">{it.description}</td>
                      <td className="px-2 py-1 text-right">{it.quantity}</td>
                      <td className="px-2 py-1 text-right">{fmt(it.unit_price)}</td>
                      <td className="px-2 py-1 text-right">{it.tax_rate ?? 0}%</td>
                      <td className="px-2 py-1 text-right">{fmt(it.subtotal ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-muted/30">
                  <tr>
                    <td colSpan={4} className="px-2 py-2 text-right">IVA:</td>
                    <td className="px-2 py-2 text-right font-mono">{fmt(d.tax)}</td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="px-2 py-2 text-right font-semibold">Total:</td>
                    <td className="px-2 py-2 text-right font-mono font-bold">{fmt(d.total)}</td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="px-2 py-2 text-right">Pagado:</td>
                    <td className="px-2 py-2 text-right font-mono text-green-600">{fmt(d.amount_paid)}</td>
                  </tr>
                  <tr>
                    <td colSpan={4} className="px-2 py-2 text-right font-semibold">Saldo:</td>
                    <td className="px-2 py-2 text-right font-mono font-bold text-orange-600">
                      {fmt(d.total - d.amount_paid)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>

        <DialogFooter>
          {!['paid', 'cancelled'].includes(d.status) && (
            <Button
              variant="outline"
              className="text-destructive"
              onClick={() => { if (confirm('¿Cancelar esta cuenta?')) onCancel(); onClose(); }}
            >
              Cancelar cuenta
            </Button>
          )}
          <Button variant="outline" onClick={onClose}>Cerrar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
