'use client';

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notify } from '@/lib/notify';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  Search, Shield, ShieldOff, RefreshCcw, ExternalLink,
  ChevronUp, ChevronDown, ChevronsUpDown,
  ChevronLeft, ChevronRight, Bell, Send, Mail, BellRing, AlertTriangle,
} from 'lucide-react';
import { useForm } from 'react-hook-form';
import { standardSchemaResolver as zodResolver } from '@hookform/resolvers/standard-schema';
import { z } from 'zod';

import { tenantsApi, plansApi, centralNotificationsApi } from '@/lib/api/central.api';
import type { Tenant, Plan } from '@/types';

import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function cutoffDate(activatedAt?: string | null): string {
  if (!activatedAt) return '—';
  const d = new Date(activatedAt);
  d.setDate(d.getDate() + 5);
  return d.toLocaleDateString('es-CO', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive'> = {
  active:    'default',
  trial:     'secondary',
  suspended: 'destructive',
  cancelled: 'destructive',
};

const STATUS_LABEL: Record<string, string> = {
  active:    'Activo',
  trial:     'Trial',
  suspended: 'Suspendido',
  cancelled: 'Cancelado',
};

const STATUS_TRANSITIONS: Record<string, { value: string; label: string; icon: typeof Shield }[]> = {
  active:    [{ value: 'suspended', label: 'Suspender', icon: ShieldOff }, { value: 'cancelled', label: 'Cancelar', icon: ShieldOff }],
  trial:     [{ value: 'active', label: 'Activar', icon: Shield },         { value: 'suspended', label: 'Suspender', icon: ShieldOff }],
  suspended: [{ value: 'active', label: 'Reactivar', icon: Shield },       { value: 'cancelled', label: 'Cancelar', icon: ShieldOff }],
  cancelled: [{ value: 'active', label: 'Reactivar', icon: Shield }],
};

const SORTABLE_COLS: { key: string; label: string }[] = [
  { key: 'name',         label: 'Negocio' },
  { key: 'status',       label: 'Estado' },
  { key: 'created_at',   label: 'F. Registro' },
  { key: 'activated_at', label: 'F. Activación' },
];

// ─── Sort Icon ────────────────────────────────────────────────────────────────

function SortIcon({ col, sortBy, sortDir }: { col: string; sortBy: string; sortDir: 'asc' | 'desc' }) {
  if (sortBy !== col) return <ChevronsUpDown className="size-3 ml-1 opacity-40" />;
  return sortDir === 'asc'
    ? <ChevronUp   className="size-3 ml-1 text-primary" />
    : <ChevronDown className="size-3 ml-1 text-primary" />;
}

// ─── Change Plan Dialog ───────────────────────────────────────────────────────

function ChangePlanDialog({ tenant, onClose }: { tenant: Tenant | null; onClose: () => void }) {
  const queryClient = useQueryClient();
  const [selectedPlanId, setSelectedPlanId] = useState('');

  const { data: plansData } = useQuery({
    queryKey: ['admin-plans'],
    queryFn: async () => (await plansApi.list()).data as unknown as Plan[],
    enabled: !!tenant,
  });

  const plans = Array.isArray(plansData) ? plansData.filter((p) => p.is_active) : [];

  const mutation = useMutation({
    mutationFn: () => tenantsApi.changePlan(tenant!.id, parseInt(selectedPlanId)),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-tenants'] });
      notify.success(`Plan actualizado para ${tenant?.name}`);
      onClose();
    },
    onError: (err) => notify.error(err, 'Error al cambiar el plan'),
  });

  return (
    <Dialog open={!!tenant} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <RefreshCcw className="size-4" />
            Cambiar plan — {tenant?.name}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            Plan actual:{' '}
            <span className="font-medium text-foreground">{tenant?.plan?.name ?? `Plan #${tenant?.plan_id}`}</span>
          </p>
          <div className="space-y-1.5">
            <Label>Nuevo plan</Label>
            <Select value={selectedPlanId} onValueChange={(v) => v && setSelectedPlanId(v)}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Seleccionar plan..." /></SelectTrigger>
              <SelectContent>
                {plans.map((plan) => (
                  <SelectItem key={plan.id} value={String(plan.id)}>
                    <div className="flex flex-col items-start">
                      <span>{plan.name}</span>
                      <span className="text-xs text-muted-foreground capitalize">
                        {plan.type} · ${plan.price.toLocaleString('es-CO')}/mes
                      </span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={mutation.isPending}>Cancelar</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!selectedPlanId || mutation.isPending || selectedPlanId === String(tenant?.plan_id)}
          >
            {mutation.isPending ? 'Guardando...' : 'Cambiar plan'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Per-Tenant Notification Dialog ──────────────────────────────────────────

const notifSchema = z.object({
  subject:      z.string().min(3, 'Asunto requerido'),
  body:         z.string().min(10, 'Cuerpo requerido'),
  type:         z.enum(['info', 'warning', 'billing', 'system']),
  via_email:    z.boolean(),
  via_push:     z.boolean(),
  display_type: z.enum(['toast', 'modal']),
}).refine((d) => d.via_email || d.via_push, {
  message: 'Selecciona al menos un canal',
  path: ['via_email'],
});

type NotifForm = z.infer<typeof notifSchema>;

function TenantNotifDialog({ tenant, onClose }: { tenant: Tenant | null; onClose: () => void }) {
  const {
    register, handleSubmit, setValue, watch, reset,
    formState: { errors, isSubmitting },
  } = useForm<NotifForm>({
    resolver: zodResolver(notifSchema),
    defaultValues: { type: 'info', subject: '', body: '', via_email: true, via_push: true, display_type: 'toast' },
  });

  const viaEmail = watch('via_email');
  const viaPush  = watch('via_push');
  const displayType = watch('display_type');

  const channelValue = (): 'email' | 'in_app' | 'both' => {
    if (viaEmail && viaPush) return 'both';
    if (viaEmail) return 'email';
    return 'in_app';
  };

  const mutation = useMutation({
    mutationFn: (data: NotifForm) =>
      centralNotificationsApi.send({
        subject:      data.subject,
        body:         data.body,
        type:         data.type,
        tenant_ids:   [tenant!.id],
        channel:      channelValue(),
        display_type: data.via_push ? data.display_type : undefined,
      }),
    onSuccess: () => {
      notify.success(`Notificación enviada a ${tenant?.name}`);
      reset();
      onClose();
    },
    onError: (err) => notify.error(err, 'Error al enviar notificación'),
  });

  return (
    <Dialog open={!!tenant} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Bell className="size-4" />
            Notificar a <span className="text-primary">{tenant?.name}</span>
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit((d) => mutation.mutate(d))} className="space-y-4">
          {/* Tipo */}
          <div className="space-y-1.5">
            <Label>Tipo</Label>
            <Select defaultValue="info" onValueChange={(v) => v && setValue('type', v as NotifForm['type'])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="info">Información</SelectItem>
                <SelectItem value="warning">Advertencia</SelectItem>
                <SelectItem value="billing">Facturación</SelectItem>
                <SelectItem value="system">Sistema</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Asunto */}
          <div className="space-y-1.5">
            <Label>Asunto</Label>
            <Input {...register('subject')} placeholder="Asunto de la notificación" />
            {errors.subject && <p className="text-xs text-destructive">{errors.subject.message}</p>}
          </div>

          {/* Mensaje */}
          <div className="space-y-1.5">
            <Label>Mensaje</Label>
            <textarea
              {...register('body')}
              placeholder="Escribe el mensaje..."
              rows={3}
              className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
            />
            {errors.body && <p className="text-xs text-destructive">{errors.body.message}</p>}
          </div>

          {/* Canales */}
          <div className="space-y-2">
            <Label>Canales de envío</Label>
            <div className="flex flex-col gap-2">
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <Checkbox checked={viaEmail} onCheckedChange={(v) => setValue('via_email', !!v)} />
                <Mail className="size-4 text-muted-foreground" />
                <span className="text-sm">Correo electrónico</span>
              </label>
              <label className="flex items-center gap-2.5 cursor-pointer select-none">
                <Checkbox checked={viaPush} onCheckedChange={(v) => setValue('via_push', !!v)} />
                <BellRing className="size-4 text-muted-foreground" />
                <span className="text-sm">Notificación push en el sistema</span>
              </label>
            </div>
            {errors.via_email && <p className="text-xs text-destructive">{errors.via_email.message}</p>}
          </div>

          {/* Display type */}
          {viaPush && (
            <div className="space-y-2">
              <Label>Visualización en el sistema</Label>
              <div className="grid grid-cols-2 gap-2">
                {(['toast', 'modal'] as const).map((dt) => (
                  <button
                    key={dt}
                    type="button"
                    onClick={() => setValue('display_type', dt)}
                    className={`flex flex-col items-center gap-1 rounded-lg border-2 px-3 py-2 text-sm transition-colors ${
                      displayType === dt
                        ? 'border-primary bg-primary/5 text-primary'
                        : 'border-border text-muted-foreground hover:border-muted-foreground'
                    }`}
                  >
                    {dt === 'toast' ? <BellRing className="size-4" /> : <Bell className="size-4" />}
                    <span className="font-medium capitalize">{dt === 'toast' ? 'Toast' : 'Pop-up'}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" type="button" onClick={onClose} disabled={isSubmitting}>Cancelar</Button>
            <Button type="submit" disabled={isSubmitting}>
              <Send className="size-3.5 mr-1.5" />
              {isSubmitting ? 'Enviando...' : 'Enviar'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TenantsPage() {
  const queryClient = useQueryClient();

  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page,         setPage]         = useState(1);
  const [sortBy,       setSortBy]       = useState('created_at');
  const [sortDir,      setSortDir]      = useState<'asc' | 'desc'>('desc');

  const [planTenant,    setPlanTenant]    = useState<Tenant | null>(null);
  const [notifTenant,   setNotifTenant]   = useState<Tenant | null>(null);
  const [confirmAction, setConfirmAction] = useState<{ tenant: Tenant; status: string } | null>(null);

  const handleSort = useCallback((col: string) => {
    if (sortBy === col) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(col);
      setSortDir('asc');
    }
    setPage(1);
  }, [sortBy]);

  const { data, isLoading } = useQuery({
    queryKey: ['admin-tenants', search, statusFilter, page, sortBy, sortDir],
    queryFn: async () => {
      const res = await tenantsApi.list({
        search:   search || undefined,
        status:   statusFilter !== 'all' ? statusFilter : undefined,
        page,
        per_page: 15,
        sort_by:  sortBy,
        sort_dir: sortDir,
      });
      return res.data as unknown as { data: Tenant[]; last_page: number; total: number; current_page: number };
    },
  });

  const tenants  = data?.data     ?? [];
  const lastPage = data?.last_page ?? 1;
  const total    = data?.total     ?? 0;

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: string }) =>
      tenantsApi.updateStatus(id, status),
    onSuccess: (_, { status }) => {
      queryClient.invalidateQueries({ queryKey: ['admin-tenants'] });
      notify.success(`Estado actualizado a "${STATUS_LABEL[status] ?? status}"`);
    },
    onError: (err) => notify.error(err, 'Error al actualizar el estado'),
  });

  function handleStatusChange(tenant: Tenant, newStatus: string) {
    setConfirmAction({ tenant, status: newStatus });
  }

  function executeStatusChange() {
    if (!confirmAction) return;
    statusMutation.mutate(
      { id: confirmAction.tenant.id, status: confirmAction.status },
      { onSettled: () => setConfirmAction(null) },
    );
  }

  const STATUS_FILTERS = [
    { value: 'all',       label: 'Todos' },
    { value: 'active',    label: 'Activos' },
    { value: 'trial',     label: 'Trial' },
    { value: 'suspended', label: 'Suspendidos' },
    { value: 'cancelled', label: 'Cancelados' },
  ];

  const SortTh = ({ col, label, className }: { col: string; label: string; className?: string }) => (
    <th
      className={cn('px-4 py-3 font-medium text-muted-foreground cursor-pointer select-none hover:text-foreground transition-colors', className)}
      onClick={() => handleSort(col)}
    >
      <span className="flex items-center">
        {label}
        <SortIcon col={col} sortBy={sortBy} sortDir={sortDir} />
      </span>
    </th>
  );

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Tenants</h1>
        <p className="text-muted-foreground text-sm">
          Todos los negocios registrados
          {total > 0 && ` · ${total} resultado${total !== 1 ? 's' : ''}`}
        </p>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o slug..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f.value}
              type="button"
              onClick={() => { setStatusFilter(f.value); setPage(1); }}
              className={`rounded-full px-3 py-1 text-xs font-medium border transition-colors ${
                statusFilter === f.value
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-background text-muted-foreground border-border hover:bg-muted'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b">
            <tr>
              <SortTh col="name"         label="Negocio"      className="text-left" />
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Slug</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Tipo</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Plan</th>
              <SortTh col="status"       label="Estado"       className="text-left" />
              <SortTh col="created_at"   label="F. Registro"  className="text-left" />
              <SortTh col="activated_at" label="F. Activación" className="text-left" />
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">F. Corte</th>
              <th className="text-right px-4 py-3 font-medium text-muted-foreground">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 9 }).map((_, j) => (
                      <td key={j} className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                    ))}
                  </tr>
                ))
              : tenants.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="px-4 py-12 text-center text-muted-foreground">
                      Sin resultados
                    </td>
                  </tr>
                )
              : tenants.map((t) => {
                  const transitions = STATUS_TRANSITIONS[t.status] ?? [];
                  return (
                    <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium">{t.name}</p>
                        {t.trial_ends_at && t.status === 'trial' && (
                          <p className="text-xs text-muted-foreground">
                            Trial hasta {new Date(t.trial_ends_at).toLocaleDateString('es-CO')}
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{t.slug}</td>
                      <td className="px-4 py-3 capitalize text-muted-foreground">
                        {t.business_type === 'restaurant' ? 'Restaurante' : 'Tienda'}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span>{t.plan?.name ?? `Plan #${t.plan_id}`}</span>
                          <button
                            type="button"
                            onClick={() => setPlanTenant(t)}
                            title="Cambiar plan"
                            className="text-muted-foreground/60 hover:text-primary transition-colors"
                          >
                            <RefreshCcw className="size-3.5" />
                          </button>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <Badge variant={STATUS_VARIANT[t.status] ?? 'secondary'}>
                          {STATUS_LABEL[t.status] ?? t.status}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {fmtDate(t.created_at)}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {fmtDate(t.activated_at)}
                      </td>
                      <td className="px-4 py-3 text-xs whitespace-nowrap">
                        {t.activated_at
                          ? <span className="text-amber-600 font-medium">{cutoffDate(t.activated_at)}</span>
                          : <span className="text-muted-foreground">—</span>
                        }
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {/* Notificación individual */}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs text-muted-foreground hover:text-primary"
                            onClick={() => setNotifTenant(t)}
                            title="Enviar notificación"
                          >
                            <Bell className="size-3.5" />
                          </Button>

                          <Link
                            href={`/atlas-mandragora/tenants/${t.id}`}
                            className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'h-7 px-2 text-xs text-muted-foreground')}
                          >
                            <ExternalLink className="mr-1 size-3" />
                            Detalle
                          </Link>

                          {transitions.map((tr) => {
                            const Icon = tr.icon;
                            const isActivate = tr.value === 'active';
                            return (
                              <Button
                                key={tr.value}
                                variant="ghost"
                                size="sm"
                                className={`h-7 px-2 text-xs ${
                                  isActivate
                                    ? 'text-emerald-600 hover:text-emerald-600 hover:bg-emerald-50'
                                    : 'text-destructive hover:text-destructive hover:bg-destructive/10'
                                }`}
                                onClick={() => handleStatusChange(t, tr.value)}
                                disabled={statusMutation.isPending}
                              >
                                <Icon className="mr-1 size-3" />
                                {tr.label}
                              </Button>
                            );
                          })}
                        </div>
                      </td>
                    </tr>
                  );
                })
            }
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {lastPage > 1 && (
        <div className="flex items-center justify-between text-sm text-muted-foreground">
          <span>
            Página {page} de {lastPage} · {total} registros
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || isLoading}
            >
              <ChevronLeft className="size-4" />
              Anterior
            </Button>

            {/* Números de página (máx 5 visibles) */}
            {Array.from({ length: lastPage }, (_, i) => i + 1)
              .filter((p) => p === 1 || p === lastPage || Math.abs(p - page) <= 1)
              .reduce<(number | '...')[]>((acc, p, idx, arr) => {
                if (idx > 0 && (p as number) - (arr[idx - 1] as number) > 1) acc.push('...');
                acc.push(p);
                return acc;
              }, [])
              .map((p, i) =>
                p === '...'
                  ? <span key={`ellipsis-${i}`} className="px-1">…</span>
                  : (
                    <Button
                      key={p}
                      variant={page === p ? 'default' : 'outline'}
                      size="sm"
                      className="h-8 w-8 p-0"
                      onClick={() => setPage(p as number)}
                      disabled={isLoading}
                    >
                      {p}
                    </Button>
                  )
              )
            }

            <Button
              variant="outline"
              size="sm"
              className="h-8 px-3"
              onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
              disabled={page >= lastPage || isLoading}
            >
              Siguiente
              <ChevronRight className="size-4" />
            </Button>
          </div>
        </div>
      )}

      <ChangePlanDialog  tenant={planTenant}  onClose={() => setPlanTenant(null)}  />
      <TenantNotifDialog tenant={notifTenant} onClose={() => setNotifTenant(null)} />

      {/* Confirmación de cambio de estado */}
      <AlertDialog open={!!confirmAction} onOpenChange={(v) => !v && setConfirmAction(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {STATUS_LABEL[confirmAction?.status ?? ''] ?? confirmAction?.status} tenant
            </AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de que deseas{' '}
              <strong>{(STATUS_LABEL[confirmAction?.status ?? ''] ?? confirmAction?.status)?.toLowerCase()}</strong>{' '}
              el tenant <strong>&quot;{confirmAction?.tenant.name}&quot;</strong>? Esta acción puede afectar el acceso del negocio al sistema.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={statusMutation.isPending} />
            <AlertDialogAction
              onClick={executeStatusChange}
              disabled={statusMutation.isPending}
              variant={confirmAction?.status === 'active' ? 'default' : 'destructive'}
            >
              {statusMutation.isPending
                ? 'Procesando...'
                : STATUS_LABEL[confirmAction?.status ?? ''] ?? 'Confirmar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
