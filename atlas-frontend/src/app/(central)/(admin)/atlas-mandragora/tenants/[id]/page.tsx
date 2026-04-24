'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notify } from '@/lib/notify';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import {
  tenantsApi,
  tenantUsersAdminApi,
  subscriptionsApi,
} from '@/lib/api/central.api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button, buttonVariants } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  AlertCircle,
  ArrowLeft,
  UserCheck,
  UserX,
  KeyRound,
  ToggleLeft,
  ToggleRight,
  Building2,
  CreditCard,
  Users,
  Settings,
} from 'lucide-react';

// ─── Status badges ────────────────────────────────────────────────────────────

const STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'destructive'> = {
  active: 'default',
  trial: 'secondary',
  suspended: 'destructive',
  cancelled: 'destructive',
};

const STATUS_LABEL: Record<string, string> = {
  active: 'Activo',
  trial: 'Trial',
  suspended: 'Suspendido',
  cancelled: 'Cancelado',
};

// ─── Modules Tab ─────────────────────────────────────────────────────────────

function ModulesTab({ tenantId }: { tenantId: string }) {
  const queryClient = useQueryClient();
  const { data: modules, isLoading } = useQuery({
    queryKey: ['tenant-modules', tenantId],
    queryFn: () => tenantsApi.getModules(tenantId).then((r) => r.data),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ key, active }: { key: string; active: boolean }) =>
      tenantsApi.patchModule(tenantId, key, active),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-modules', tenantId] });
      notify.success('Módulo actualizado');
    },
    onError: (err) => notify.error(err, 'Error al actualizar módulo'),
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-12 rounded-lg" />
        ))}
      </div>
    );
  }

  if (!modules || modules.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        No hay módulos registrados para este tenant.
      </p>
    );
  }

  return (
    <div className="space-y-2">
      {modules.map((mod) => (
        <div
          key={mod.key}
          className="flex items-center justify-between p-3 border rounded-lg"
        >
          <div>
            <p className="font-medium text-sm">{mod.name}</p>
            <p className="text-xs text-muted-foreground font-mono">{mod.key}</p>
          </div>
          <Button
            variant="ghost"
            size="sm"
            className={mod.active ? 'text-primary' : 'text-muted-foreground'}
            onClick={() =>
              toggleMutation.mutate({ key: mod.key, active: !mod.active })
            }
            disabled={toggleMutation.isPending}
          >
            {mod.active ? (
              <ToggleRight className="h-5 w-5" />
            ) : (
              <ToggleLeft className="h-5 w-5" />
            )}
            <span className="ml-1.5 text-xs">{mod.active ? 'Activo' : 'Inactivo'}</span>
          </Button>
        </div>
      ))}
    </div>
  );
}

// ─── Users Tab ────────────────────────────────────────────────────────────────

function UsersTab({ tenantId }: { tenantId: string }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['tenant-users-admin', tenantId],
    queryFn: () => tenantUsersAdminApi.list(tenantId).then((r) => (r.data as { data: unknown[] }).data),
  });

  const users = (data ?? []) as {
    id: number;
    name: string;
    email: string;
    is_active: boolean;
    last_login_at: string | null;
  }[];

  const toggleMutation = useMutation({
    mutationFn: (userId: number) => tenantUsersAdminApi.toggleActive(tenantId, userId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-users-admin', tenantId] });
      notify.success('Estado del usuario actualizado');
    },
    onError: (err) => notify.error(err, 'Error al actualizar usuario'),
  });

  const resetPwdMutation = useMutation({
    mutationFn: (userId: number) => tenantUsersAdminApi.resetPassword(tenantId, userId),
    onSuccess: () => notify.success('Enlace de restablecimiento enviado'),
    onError: (err) => notify.error(err, 'Error al enviar enlace'),
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-lg" />
        ))}
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        No hay usuarios registrados en este tenant.
      </p>
    );
  }

  return (
    <div className="divide-y border rounded-lg overflow-hidden">
      {users.map((u) => (
        <div key={u.id} className="flex items-center justify-between px-4 py-3 text-sm">
          <div>
            <p className="font-medium">{u.name}</p>
            <p className="text-xs text-muted-foreground">{u.email}</p>
            {u.last_login_at && (
              <p className="text-xs text-muted-foreground">
                Último acceso: {new Date(u.last_login_at).toLocaleDateString('es-CO')}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={u.is_active ? 'default' : 'secondary'}>
              {u.is_active ? 'Activo' : 'Inactivo'}
            </Badge>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title={u.is_active ? 'Desactivar usuario' : 'Activar usuario'}
              onClick={() => toggleMutation.mutate(u.id)}
              disabled={toggleMutation.isPending}
            >
              {u.is_active ? (
                <UserX className="h-4 w-4 text-destructive" />
              ) : (
                <UserCheck className="h-4 w-4 text-green-600" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              title="Enviar enlace de reset de contraseña"
              onClick={() => {
                if (window.confirm(`¿Enviar enlace de reseteo de contraseña a ${u.email}?`)) {
                  resetPwdMutation.mutate(u.id);
                }
              }}
              disabled={resetPwdMutation.isPending}
            >
              <KeyRound className="h-4 w-4 text-muted-foreground" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Billing Tab ──────────────────────────────────────────────────────────────

function BillingTab({ tenantId }: { tenantId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['tenant-billing-history', tenantId],
    queryFn: () => subscriptionsApi.tenantHistory(Number(tenantId)).then((r) => r.data),
  });

  const history = (data as { data?: unknown[] })?.data ?? (Array.isArray(data) ? data : []) as {
    id: number;
    plan: { name: string };
    status: string;
    amount: number;
    created_at: string;
    trial_ends_at: string | null;
    next_billing_at: string | null;
  }[];

  if (isLoading) {
    return <Skeleton className="h-40 rounded-lg" />;
  }

  if (!Array.isArray(history) || history.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        Sin historial de suscripciones.
      </p>
    );
  }

  return (
    <div className="divide-y border rounded-lg overflow-hidden">
      {(history as {
        id: number;
        plan: { name: string };
        status: string;
        amount: number;
        created_at: string;
        trial_ends_at: string | null;
        next_billing_at: string | null;
      }[]).map((s) => (
        <div key={s.id} className="px-4 py-3 text-sm flex items-center justify-between">
          <div>
            <p className="font-medium">{s.plan?.name ?? '—'}</p>
            <p className="text-xs text-muted-foreground">
              Desde {new Date(s.created_at).toLocaleDateString('es-CO')}
              {s.next_billing_at && ` · Próximo cobro: ${new Date(s.next_billing_at).toLocaleDateString('es-CO')}`}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <span className="font-medium">${Number(s.amount).toLocaleString('es-CO')}</span>
            <Badge variant={s.status === 'active' ? 'default' : 'secondary'}>
              {STATUS_LABEL[s.status] ?? s.status}
            </Badge>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function TenantDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const tenantId = id as string;
  const [tab, setTab] = useState('overview');

  const { data: tenant, isLoading, error } = useQuery({
    queryKey: ['tenant-detail', tenantId],
    queryFn: () => tenantsApi.get(tenantId).then((r) => r.data),
  });

  const statusMutation = useMutation({
    mutationFn: (status: string) => tenantsApi.updateStatus(tenantId, status),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tenant-detail', tenantId] });
      queryClient.invalidateQueries({ queryKey: ['admin-tenants'] });
      notify.success('Estado actualizado');
    },
    onError: (err) => notify.error(err, 'Error al actualizar estado'),
  });

  const seedPucMutation = useMutation({
    mutationFn: () => tenantsApi.seedPUC(tenantId),
    onSuccess: () => notify.success('PUC colombiano sembrado correctamente'),
    onError: (err) => notify.error(err, 'Error al sembrar PUC'),
  });

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-5xl">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-32 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (error || !tenant) {
    return (
      <div className="flex items-center gap-2 text-destructive p-6">
        <AlertCircle className="h-5 w-5" />
        <span>No se pudo cargar el tenant.</span>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-xl font-bold">{tenant.name}</h1>
          <p className="text-sm text-muted-foreground font-mono">{tenant.slug}</p>
        </div>
        <Badge variant={STATUS_VARIANT[tenant.status] ?? 'secondary'} className="ml-auto">
          {STATUS_LABEL[tenant.status] ?? tenant.status}
        </Badge>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Building2 className="h-5 w-5 text-primary shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Plan</p>
              <p className="font-semibold text-sm">{(tenant as { plan?: { name?: string } }).plan?.name ?? `Plan #${tenant.plan_id}`}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <CreditCard className="h-5 w-5 text-primary shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Suscripción</p>
              <p className="font-semibold text-sm">
                {tenant.subscription
                  ? `$${Number(tenant.subscription.amount).toLocaleString('es-CO')}/mes`
                  : 'Sin suscripción'}
              </p>
              {tenant.subscription?.trial_ends_at && (
                <p className="text-xs text-amber-600">
                  Trial hasta {new Date(tenant.subscription.trial_ends_at).toLocaleDateString('es-CO')}
                </p>
              )}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <Users className="h-5 w-5 text-primary shrink-0" />
            <div>
              <p className="text-xs text-muted-foreground">Tipo de negocio</p>
              <p className="font-semibold text-sm capitalize">
                {tenant.business_type === 'restaurant' ? 'Restaurante' : 'Tienda'}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick actions */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Settings className="h-4 w-4" /> Acciones rápidas
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {tenant.status !== 'active' && (
            <Button
              size="sm"
              variant="outline"
              className="text-green-600 border-green-600 hover:bg-green-50"
              onClick={() => statusMutation.mutate('active')}
              disabled={statusMutation.isPending}
            >
              Activar tenant
            </Button>
          )}
          {tenant.status === 'active' && (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive border-destructive hover:bg-destructive/10"
              onClick={() => {
                if (window.confirm('¿Suspender este tenant?')) {
                  statusMutation.mutate('suspended');
                }
              }}
              disabled={statusMutation.isPending}
            >
              Suspender
            </Button>
          )}
          {tenant.status !== 'cancelled' && (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive border-destructive hover:bg-destructive/10"
              onClick={() => {
                if (window.confirm('¿Cancelar este tenant? Esta acción es difícil de revertir.')) {
                  statusMutation.mutate('cancelled');
                }
              }}
              disabled={statusMutation.isPending}
            >
              Cancelar suscripción
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              if (window.confirm('¿Sembrar el PUC colombiano completo en este tenant? Esto agregará ~200 cuentas contables.')) {
                seedPucMutation.mutate();
              }
            }}
            disabled={seedPucMutation.isPending}
          >
            Sembrar PUC
          </Button>
          <Link
            href="/atlas-mandragora/tenants"
            className={cn(buttonVariants({ size: 'sm', variant: 'outline' }))}
          >
            ← Lista de tenants
          </Link>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="overview">Módulos</TabsTrigger>
          <TabsTrigger value="users">Usuarios</TabsTrigger>
          <TabsTrigger value="billing">Facturación</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <ModulesTab tenantId={tenantId} />
        </TabsContent>

        <TabsContent value="users" className="mt-4">
          <UsersTab tenantId={tenantId} />
        </TabsContent>

        <TabsContent value="billing" className="mt-4">
          <BillingTab tenantId={tenantId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
