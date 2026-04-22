'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import { notify } from '@/lib/notify';
import {
  Plus, Search, Pencil, Trash2, ShieldCheck, UserPlus, X,
} from 'lucide-react';
import { centralUsersApi, type CentralUser } from '@/lib/api/central.api';
import { PhoneInput } from '@/components/ui/phone-input';
import { securePassword, securePasswordOptional, email as emailValidator, fullName } from '@/lib/validations';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const createSchema = z.object({
  name:     fullName,
  email:    emailValidator,
  password: securePassword,
  role:     z.string().min(1, 'Selecciona un rol'),
  phone:    z.string().regex(/^\d{10}$/, 'Debe tener 10 dígitos').optional().or(z.literal('')),
});

const editSchema = z.object({
  name:     fullName,
  email:    emailValidator,
  password: securePasswordOptional,
  role:     z.string().min(1, 'Selecciona un rol'),
  phone:    z.string().regex(/^\d{10}$/, 'Debe tener 10 dígitos').optional().or(z.literal('')),
});

type CreateForm = z.infer<typeof createSchema>;
type EditForm   = z.infer<typeof editSchema>;

// ─── Role badge ───────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  super:    'bg-red-100 text-red-700 border-red-200',
  admin:    'bg-purple-100 text-purple-700 border-purple-200',
  support:  'bg-blue-100 text-blue-700 border-blue-200',
  billing:  'bg-amber-100 text-amber-700 border-amber-200',
  readonly: 'bg-gray-100 text-gray-600 border-gray-200',
};

function RoleBadge({ role }: { role: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-xs font-medium ${ROLE_COLORS[role] ?? 'bg-muted text-muted-foreground'}`}>
      <ShieldCheck className="size-3" />
      {role}
    </span>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function UsersPage() {
  const qc = useQueryClient();
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [editUser, setEditUser] = useState<CentralUser | null>(null);
  const [deleteUser, setDeleteUser] = useState<CentralUser | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  // ── Queries ───────────────────────────────────────────────────────────────
  const { data: usersData, isLoading } = useQuery({
    queryKey: ['central-users', search, roleFilter, page],
    queryFn: () => centralUsersApi.list({
      search: search || undefined,
      role: roleFilter !== 'all' ? roleFilter : undefined,
      per_page: 20,
    }).then((r) => r.data),
    placeholderData: (prev) => prev,
  });

  const { data: rolesData } = useQuery({
    queryKey: ['central-roles'],
    queryFn: () => centralUsersApi.roles().then((r) => r.data),
    staleTime: Infinity,
  });

  const roles = rolesData ?? [];
  const users = (usersData?.data ?? []).map((u) => ({
    ...u,
    roles: u.roles.map((r: string | { name: string }) =>
      typeof r === 'string' ? r : r.name,
    ),
  }));

  // ── Mutations ─────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (data: CreateForm) => centralUsersApi.create({
      ...data,
      phone: data.phone ? data.phone.replace(/\D/g, '') : undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['central-users'] });
      notify.success('Usuario creado');
      setCreateOpen(false);
    },
    onError: (e: unknown) => {
      notify.error(e, 'Error al crear usuario');
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: EditForm }) =>
      centralUsersApi.update(id, {
        ...data,
        password: data.password || undefined,
        phone: data.phone ? data.phone.replace(/\D/g, '') : undefined,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['central-users'] });
      notify.success('Usuario actualizado');
      setEditUser(null);
    },
    onError: (e: unknown) => {
      notify.error(e, 'Error al actualizar');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => centralUsersApi.destroy(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['central-users'] });
      notify.success('Usuario eliminado');
      setDeleteUser(null);
    },
    onError: (err) => notify.error(err, 'Error al eliminar usuario'),
  });

  // ── Create form ───────────────────────────────────────────────────────────
  const {
    register: regCreate,
    handleSubmit: hCreate,
    setValue: setCreate,
    reset: resetCreate,
    formState: { errors: eCreate, isSubmitting: submittingCreate },
  } = useForm<CreateForm>({ resolver: zodResolver(createSchema) });

  // ── Edit form ─────────────────────────────────────────────────────────────
  const {
    register: regEdit,
    handleSubmit: hEdit,
    setValue: setEdit,
    reset: resetEdit,
    formState: { errors: eEdit, isSubmitting: submittingEdit },
  } = useForm<EditForm>({ resolver: zodResolver(editSchema) });

  const openEdit = (u: CentralUser) => {
    setEditUser(u);
    resetEdit({
      name:  u.name,
      email: u.email,
      role:  (typeof u.roles[0] === 'string' ? u.roles[0] : (u.roles[0] as { name?: string })?.name) ?? '',
      phone: u.phone?.replace('+57', '') ?? '',
      password: '',
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Usuarios del Sistema</h1>
          <p className="text-sm text-muted-foreground">Gestiona el equipo de administración central con roles RBAC.</p>
        </div>
        <Button onClick={() => { resetCreate(); setCreateOpen(true); }} className="gap-2">
          <UserPlus className="size-4" />
          Nuevo usuario
        </Button>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
          <Input
            placeholder="Buscar por nombre o email..."
            className="pl-8 w-72"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <Select value={roleFilter} onValueChange={(v) => { setRoleFilter(v ?? 'all'); setPage(1); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Rol" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos los roles</SelectItem>
            {roles.map((r) => (
              <SelectItem key={r.id} value={r.name}>{r.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/40">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Nombre</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Email</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Teléfono</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Rol</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Estado</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Creado</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {isLoading && (
              <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">Cargando…</td></tr>
            )}
            {!isLoading && users.length === 0 && (
              <tr><td colSpan={7} className="text-center py-10 text-muted-foreground">Sin usuarios</td></tr>
            )}
            {users.map((u) => (
              <tr key={u.id} className="border-b last:border-0 hover:bg-muted/20 transition-colors">
                <td className="px-4 py-3 font-medium">{u.name}</td>
                <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                <td className="px-4 py-3 text-muted-foreground">{u.phone ?? '—'}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 flex-wrap">
                    {u.roles.map((r) => <RoleBadge key={r} role={r} />)}
                    {u.roles.length === 0 && <span className="text-muted-foreground text-xs">—</span>}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge variant={u.is_active ? 'default' : 'secondary'}>
                    {u.is_active ? 'Activo' : 'Inactivo'}
                  </Badge>
                </td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{u.created_at}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-1 justify-end">
                    <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(u)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-8 text-destructive hover:text-destructive" onClick={() => setDeleteUser(u)}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ── Create dialog ── */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="size-4" /> Nuevo usuario
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={hCreate((d) => createMutation.mutate(d))} className="space-y-4">
            <UserFormFields
              reg={regCreate}
              errors={eCreate}
              setVal={(k, v) => setCreate(k as keyof CreateForm, v)}
              roles={roles}
              requirePassword
            />
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setCreateOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={submittingCreate || createMutation.isPending}>
                {createMutation.isPending ? 'Creando…' : 'Crear usuario'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Edit dialog ── */}
      <Dialog open={!!editUser} onOpenChange={(o) => !o && setEditUser(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="size-4" /> Editar usuario
            </DialogTitle>
          </DialogHeader>
          {editUser && (
            <form onSubmit={hEdit((d) => updateMutation.mutate({ id: editUser.id, data: d }))} className="space-y-4">
              <UserFormFields
                reg={regEdit}
                errors={eEdit}
                setVal={(k, v) => setEdit(k as keyof EditForm, v)}
                roles={roles}
                requirePassword={false}
                defaultRole={editUser.roles[0]}
              />
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditUser(null)}>Cancelar</Button>
                <Button type="submit" disabled={submittingEdit || updateMutation.isPending}>
                  {updateMutation.isPending ? 'Guardando…' : 'Guardar cambios'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Delete confirm ── */}
      <AlertDialog open={!!deleteUser} onOpenChange={(o: boolean) => !o && setDeleteUser(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar usuario?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará permanentemente a <strong>{deleteUser?.name}</strong>. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteUser && deleteMutation.mutate(deleteUser.id)}
            >
              Eliminar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ─── Shared form fields ───────────────────────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRegister = (name: any, options?: any) => any;

function UserFormFields({
  reg, errors, setVal, roles, requirePassword, defaultRole,
}: {
  reg: AnyRegister;
  errors: Record<string, { message?: string } | undefined>;
  setVal: (key: string, value: string) => void;
  roles: { id: number; name: string }[];
  requirePassword: boolean;
  defaultRole?: string;
}) {
  return (
    <>
      <div className="space-y-1.5">
        <Label>Nombre completo</Label>
        <Input {...reg('name')} placeholder="Juan Pérez" />
        {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>Email</Label>
        <Input {...reg('email')} type="email" placeholder="usuario@empresa.com" />
        {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>
          Contraseña
          {!requirePassword && <span className="text-xs text-muted-foreground ml-1">(dejar vacío para no cambiar)</span>}
        </Label>
        <Input {...reg('password')} type="password" placeholder={requirePassword ? 'Mínimo 8 caracteres' : '••••••••'} />
        {errors.password && <p className="text-xs text-destructive">{errors.password.message}</p>}
        {requirePassword && (
          <p className="text-xs text-muted-foreground">Debe tener mayúsculas, minúsculas, números y símbolos.</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label>Teléfono <span className="text-xs text-muted-foreground">(opcional)</span></Label>
        <PhoneInput
          {...reg('phone')}
          onChange={(v) => setVal('phone', v)}
        />
        {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
      </div>

      <div className="space-y-1.5">
        <Label>Rol</Label>
        <Select defaultValue={defaultRole} onValueChange={(v) => setVal('role', v ?? '')}>
          <SelectTrigger>
            <SelectValue placeholder="Selecciona un rol" />
          </SelectTrigger>
          <SelectContent>
            {roles.map((r) => (
              <SelectItem key={r.id} value={r.name}>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="size-3.5" />
                  {r.name}
                </div>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {errors.role && <p className="text-xs text-destructive">{errors.role.message}</p>}
      </div>
    </>
  );
}
