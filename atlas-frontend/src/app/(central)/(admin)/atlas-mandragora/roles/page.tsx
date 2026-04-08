'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notify } from '@/lib/notify';
import {
  ShieldCheck, Plus, Pencil, Trash2, Users, CheckCircle, XCircle, Save, X,
} from 'lucide-react';
import {
  centralRolesApi, type CentralRole, type CentralPermissionGroup,
} from '@/lib/api/central.api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const RESOURCE_LABELS: Record<string, string> = {
  tenants:        'Tenants',
  plans:          'Planes',
  addons:         'Add-ons',
  users:          'Usuarios',
  roles:          'Roles y Permisos',
  billing:        'Facturación',
  addon_requests: 'Solicitudes Add-on',
  notifications:  'Notificaciones',
  audit:          'Audit Log',
  settings:       'Configuración',
  monitoring:     'Monitoreo',
  currencies:     'Monedas',
  gateways:       'Pasarelas de Pago',
};

const ACTION_LABELS: Record<string, string> = {
  view:   'Acceso',
  create: 'Crear',
  edit:   'Editar',
  delete: 'Eliminar',
};

// Todas las acciones posibles (columnas de la matriz)
const ALL_ACTIONS = ['view', 'create', 'edit', 'delete'];

// ─── Permission Matrix ────────────────────────────────────────────────────────

function PermissionMatrix({
  role,
  groups,
  onClose,
}: {
  role: CentralRole;
  groups: CentralPermissionGroup[];
  onClose: () => void;
}) {
  const qc = useQueryClient();

  // Estado local de permisos (set de permission names)
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(role.permissions),
  );
  const [dirty, setDirty] = useState(false);

  const syncMut = useMutation({
    mutationFn: () => centralRolesApi.syncPermissions(role.id, Array.from(selected)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['central-roles'] });
      notify.success(`Permisos de "${role.name}" actualizados`);
      setDirty(false);
      onClose();
    },
    onError: (e: any) => notify.error(e?.response?.data?.message ?? 'Error al guardar permisos'),
  });

  const toggle = (permName: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(permName)) next.delete(permName);
      else next.add(permName);
      return next;
    });
    setDirty(true);
  };

  // Marcar/desmarcar toda una fila (recurso)
  const toggleRow = (group: CentralPermissionGroup) => {
    const rowPerms = group.actions.map((a) => a.name);
    const allChecked = rowPerms.every((p) => selected.has(p));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allChecked) rowPerms.forEach((p) => next.delete(p));
      else rowPerms.forEach((p) => next.add(p));
      return next;
    });
    setDirty(true);
  };

  // Marcar/desmarcar toda una columna (acción)
  const toggleColumn = (action: string) => {
    const colPerms = groups
      .flatMap((g) => g.actions)
      .filter((a) => a.action === action)
      .map((a) => a.name);
    const allChecked = colPerms.every((p) => selected.has(p));
    setSelected((prev) => {
      const next = new Set(prev);
      if (allChecked) colPerms.forEach((p) => next.delete(p));
      else colPerms.forEach((p) => next.add(p));
      return next;
    });
    setDirty(true);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Encabezado */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold text-base flex items-center gap-2">
            <ShieldCheck className="size-4 text-primary" />
            Permisos de <span className="text-primary">{role.name}</span>
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {selected.size} permisos activos · {role.users_count} usuario{role.users_count !== 1 ? 's' : ''} con este rol
          </p>
        </div>
        {dirty && (
          <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50">
            Cambios sin guardar
          </Badge>
        )}
      </div>

      {/* Matriz */}
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b bg-muted/50">
              <th className="text-left px-4 py-2.5 font-medium text-muted-foreground min-w-44">
                Módulo / Recurso
              </th>
              {ALL_ACTIONS.map((action) => (
                <th
                  key={action}
                  className="px-4 py-2.5 font-medium text-muted-foreground text-center cursor-pointer hover:text-foreground select-none w-24"
                  onClick={() => !role.is_system && toggleColumn(action)}
                  title={role.is_system ? undefined : `Marcar/desmarcar toda la columna "${ACTION_LABELS[action]}"`}
                >
                  {ACTION_LABELS[action]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups.map((group) => {
              const rowPerms = group.actions.map((a) => a.name);
              const allChecked = rowPerms.every((p) => selected.has(p));
              const someChecked = rowPerms.some((p) => selected.has(p));

              return (
                <tr key={group.resource} className="border-b last:border-0 hover:bg-muted/20">
                  {/* Nombre del recurso — click selecciona la fila */}
                  <td
                    className={`px-4 py-2.5 font-medium ${!role.is_system ? 'cursor-pointer' : ''}`}
                    onClick={() => !role.is_system && toggleRow(group)}
                    title={role.is_system ? undefined : 'Marcar/desmarcar todos los permisos de este módulo'}
                  >
                    <div className="flex items-center gap-2">
                      {/* Indicador de fila */}
                      {!role.is_system && (
                        <div className={`size-3.5 rounded border flex-shrink-0 flex items-center justify-center ${
                          allChecked
                            ? 'bg-primary border-primary'
                            : someChecked
                              ? 'bg-primary/30 border-primary/60'
                              : 'border-muted-foreground/40'
                        }`}>
                          {(allChecked || someChecked) && (
                            <div className={`size-1.5 rounded-sm ${allChecked ? 'bg-white' : 'bg-primary'}`} />
                          )}
                        </div>
                      )}
                      {RESOURCE_LABELS[group.resource] ?? group.resource}
                    </div>
                  </td>

                  {/* Celdas de permiso por acción */}
                  {ALL_ACTIONS.map((action) => {
                    const perm = group.actions.find((a) => a.action === action);
                    if (!perm) {
                      // Esta combinación recurso+acción no existe
                      return (
                        <td key={action} className="px-4 py-2.5 text-center">
                          <span className="text-muted-foreground/30 text-lg">—</span>
                        </td>
                      );
                    }
                    const checked = selected.has(perm.name);
                    return (
                      <td
                        key={action}
                        className={`px-4 py-2.5 text-center ${!role.is_system ? 'cursor-pointer' : ''}`}
                        onClick={() => !role.is_system && toggle(perm.name)}
                      >
                        {role.is_system ? (
                          // Super: solo lectura, siempre verde
                          <CheckCircle className="size-4 text-green-500 mx-auto" />
                        ) : checked ? (
                          <CheckCircle className="size-4 text-green-500 mx-auto" />
                        ) : (
                          <XCircle className="size-4 text-muted-foreground/40 mx-auto" />
                        )}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Footer */}
      <div className="flex justify-end gap-2 pt-1">
        <Button variant="outline" onClick={onClose} disabled={syncMut.isPending}>
          <X className="size-3.5 mr-1.5" />
          Cancelar
        </Button>
        {!role.is_system && (
          <Button
            onClick={() => syncMut.mutate()}
            disabled={!dirty || syncMut.isPending}
          >
            <Save className="size-3.5 mr-1.5" />
            {syncMut.isPending ? 'Guardando…' : 'Guardar permisos'}
          </Button>
        )}
      </div>
    </div>
  );
}

// ─── Role Dialog (crear / renombrar) ─────────────────────────────────────────

function RoleDialog({
  open,
  onOpenChange,
  role,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  role?: CentralRole | null;
}) {
  const qc = useQueryClient();
  const [name, setName] = useState(role?.name ?? '');

  const mutation = useMutation({
    mutationFn: () =>
      role
        ? centralRolesApi.update(role.id, { name })
        : centralRolesApi.create({ name }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['central-roles'] });
      qc.invalidateQueries({ queryKey: ['central-users'] }); // refresca lista de roles en usuarios
      notify.success(role ? 'Rol renombrado' : 'Rol creado');
      onOpenChange(false);
      setName('');
    },
    onError: (e: any) => notify.error(e?.response?.data?.message ?? 'Error'),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setName(role?.name ?? ''); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{role ? 'Renombrar rol' : 'Nuevo rol'}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Nombre del rol</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="ej: analyst, billing_manager…"
              onKeyDown={(e) => e.key === 'Enter' && name.trim() && mutation.mutate()}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              Solo letras, números y guiones bajos. Sin espacios.
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={!name.trim() || mutation.isPending}
          >
            {mutation.isPending ? 'Guardando…' : role ? 'Renombrar' : 'Crear rol'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function RolesPage() {
  const qc = useQueryClient();
  const [selectedRole, setSelectedRole] = useState<CentralRole | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [editRole, setEditRole] = useState<CentralRole | null>(null);
  const [deleteRole, setDeleteRole] = useState<CentralRole | null>(null);

  const { data: roles = [], isLoading: loadingRoles } = useQuery({
    queryKey: ['central-roles'],
    queryFn: () => centralRolesApi.list().then((r) => r.data),
  });

  const { data: permGroups = [], isLoading: loadingPerms } = useQuery({
    queryKey: ['central-permissions'],
    queryFn: () => centralRolesApi.permissions().then((r) => r.data),
    staleTime: 5 * 60 * 1000,
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => centralRolesApi.destroy(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['central-roles'] });
      if (selectedRole?.id === deleteRole?.id) setSelectedRole(null);
      notify.success('Rol eliminado');
      setDeleteRole(null);
    },
    onError: (e: any) => notify.error(e?.response?.data?.message ?? 'Error al eliminar rol'),
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Roles y Permisos</h1>
          <p className="text-sm text-muted-foreground">
            Gestiona los roles del panel central y los permisos granulares de cada uno.
          </p>
        </div>
        <Button onClick={() => setCreateOpen(true)} className="gap-2">
          <Plus className="size-4" />
          Nuevo rol
        </Button>
      </div>

      <div className="grid grid-cols-[280px_1fr] gap-6 items-start">
        {/* ── Lista de roles ── */}
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="px-4 py-3 border-b bg-muted/30">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Roles ({roles.length})
            </p>
          </div>
          <div className="divide-y">
            {loadingRoles && (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="px-4 py-3 flex items-center gap-3">
                  <Skeleton className="size-8 rounded-full" />
                  <Skeleton className="h-4 w-24" />
                </div>
              ))
            )}
            {!loadingRoles && roles.map((role) => (
              <div
                key={role.id}
                onClick={() => setSelectedRole(role)}
                className={`px-4 py-3 flex items-center gap-3 cursor-pointer transition-colors hover:bg-muted/40 ${
                  selectedRole?.id === role.id ? 'bg-primary/5 border-l-2 border-l-primary' : ''
                }`}
              >
                <div className={`size-8 rounded-full flex items-center justify-center text-xs font-bold ${
                  role.is_system
                    ? 'bg-red-100 text-red-700'
                    : 'bg-primary/10 text-primary'
                }`}>
                  {role.name.slice(0, 2).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-sm truncate">{role.name}</p>
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Users className="size-3" />
                    {role.users_count} usuario{role.users_count !== 1 ? 's' : ''}
                    · {role.permissions.length} permisos
                  </p>
                </div>
                {role.is_system && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">sistema</Badge>
                )}
                {!role.is_system && (
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7"
                      onClick={(e) => { e.stopPropagation(); setEditRole(role); }}
                    >
                      <Pencil className="size-3" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-7 text-destructive hover:text-destructive"
                      onClick={(e) => { e.stopPropagation(); setDeleteRole(role); }}
                    >
                      <Trash2 className="size-3" />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* ── Matriz de permisos ── */}
        <div className="rounded-lg border bg-card p-5">
          {!selectedRole && (
            <div className="flex flex-col items-center justify-center h-64 text-center gap-3">
              <ShieldCheck className="size-10 text-muted-foreground/40" />
              <p className="text-muted-foreground text-sm">
                Selecciona un rol de la lista para ver y editar sus permisos
              </p>
            </div>
          )}
          {selectedRole && (loadingPerms ? (
            <div className="space-y-3">
              {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : (
            <PermissionMatrix
              role={selectedRole}
              groups={permGroups}
              onClose={() => setSelectedRole(null)}
            />
          ))}
        </div>
      </div>

      {/* Dialogs */}
      <RoleDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
      />

      <RoleDialog
        open={!!editRole}
        onOpenChange={(v) => !v && setEditRole(null)}
        role={editRole}
      />

      <AlertDialog open={!!deleteRole} onOpenChange={(v) => !v && setDeleteRole(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar rol "{deleteRole?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteRole?.users_count
                ? `Este rol tiene ${deleteRole.users_count} usuario(s) asignados. Reasígnalos antes de eliminar.`
                : 'Se eliminarán todos los permisos asociados. Esta acción no se puede deshacer.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            {!deleteRole?.users_count && (
              <AlertDialogAction
                className="bg-destructive hover:bg-destructive/90"
                onClick={() => deleteRole && deleteMut.mutate(deleteRole.id)}
              >
                {deleteMut.isPending ? 'Eliminando…' : 'Eliminar'}
              </AlertDialogAction>
            )}
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
