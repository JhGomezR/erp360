'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { standardSchemaResolver as zodResolver } from '@hookform/resolvers/standard-schema';
import { z } from 'zod';
import { notify } from '@/lib/notify';
import { Save, Users, Store, Shield, UserPlus, TrendingUp, Plus, Trash2, Pencil, X, GripVertical, FileCheck, QrCode, Upload } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select';
import { settingsApi, agingBucketsApi, posApi, type AgingBucket } from '@/lib/api/tenant.api';
import type { AxiosResponse } from 'axios';
import { useAuthStore } from '@/store/authStore';

interface StoreConfig {
  business_name: string;
  nit?: string;
  address?: string;
  phone?: string;
  email?: string;
  invoice_prefix?: string;
  invoice_resolution?: string;
}

interface TenantUser {
  id: number;
  name: string;
  email: string;
  roles: string[];
  is_active: boolean;
  created_at: string;
}

const storeSchema = z.object({
  business_name: z.string().min(2, 'Mínimo 2 caracteres'),
  nit: z.string().optional(),
  address: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email('Email inválido').optional().or(z.literal('')),
  invoice_prefix: z.string().optional(),
  invoice_resolution: z.string().optional(),
});

type StoreForm = z.infer<typeof storeSchema>;

export default function SettingsPage() {
  const params = useParams();
  const slug = params.slug as string;
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const [tab, setTab] = useState<'store' | 'users' | 'security' | 'aging' | 'pos_fe' | 'payment_qr'>('store');
  const [autoInvoiceFe, setAutoInvoiceFe] = useState(false);
  const [autoCreditNoteFe, setAutoCreditNoteFe] = useState(false);

  const { data: storeData, isLoading: loadingStore } = useQuery({
    queryKey: ['settings-store', slug],
    queryFn: async () => {
      const res = await settingsApi.getStore();
      return res.data as StoreConfig;
    },
    enabled: tab === 'store',
  });

  const { data: users, isLoading: loadingUsers } = useQuery({
    queryKey: ['settings-users', slug],
    queryFn: async () => {
      const res = await settingsApi.getUsers();
      return (res.data as { data?: TenantUser[] }).data ?? (res.data as TenantUser[]) ?? [];
    },
    enabled: tab === 'users',
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty, isSubmitting },
  } = useForm<StoreForm>({ resolver: zodResolver(storeSchema) });

  useEffect(() => {
    if (storeData) reset(storeData);
  }, [storeData, reset]);

  const updateStore = useMutation({
    mutationFn: (data: StoreForm) => settingsApi.updateStore(data),
    onSuccess: () => {
      notify.success('Configuración guardada');
      qc.invalidateQueries({ queryKey: ['settings-store', slug] });
    },
    onError: (err) => notify.error(err, 'Error al guardar'),
  });

  const removeUser = useMutation({
    mutationFn: (id: number) => settingsApi.removeUser(id),
    onSuccess: () => {
      notify.success('Usuario eliminado');
      qc.invalidateQueries({ queryKey: ['settings-users', slug] });
    },
    onError: (err) => notify.error(err, 'Error al eliminar usuario'),
  });

  const updateRole = useMutation({
    mutationFn: ({ id, role }: { id: number; role: string }) =>
      settingsApi.updateUser(id, { role }),
    onSuccess: () => {
      notify.success('Rol actualizado');
      qc.invalidateQueries({ queryKey: ['settings-users', slug] });
    },
    onError: (err) => notify.error(err, 'Error al actualizar el rol'),
  });

  const ROLES = [
    { value: 'admin', label: 'Administrador' },
    { value: 'manager', label: 'Gerente' },
    { value: 'cashier', label: 'Cajero' },
    { value: 'viewer', label: 'Solo lectura' },
  ];

  // ── Invite user ──
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('cashier');

  const inviteMutation = useMutation({
    mutationFn: () => settingsApi.inviteUser({ email: inviteEmail.trim(), role: inviteRole }),
    onSuccess: () => {
      notify.success(`Invitación enviada a ${inviteEmail.trim()}`);
      setInviteOpen(false);
      setInviteEmail('');
      setInviteRole('cashier');
      qc.invalidateQueries({ queryKey: ['settings-users', slug] });
    },
    onError: (err) => notify.error(err, 'Error al enviar la invitación'),
  });

  // ── Aging buckets ──
  const { data: agingData, isLoading: loadingAging } = useQuery({
    queryKey: ['aging-buckets', slug],
    queryFn: () => agingBucketsApi.list().then((r) => r.data),
    enabled: tab === 'aging',
    staleTime: 30_000,
  });
  const agingBuckets: AgingBucket[] = (agingData as AgingBucket[]) ?? [];

  // POS / FE settings
  const { data: posFeData } = useQuery({
    queryKey: ['pos-fe-settings', slug],
    queryFn: () => settingsApi.getStore().then((r) => r.data),
    enabled: tab === 'pos_fe',
    staleTime: 30_000,
  });

  useEffect(() => {
    if (posFeData && tab === 'pos_fe') {
      const d = posFeData as Record<string, Record<string, { value: unknown }>>;
      setAutoInvoiceFe(Boolean(d?.pos?.auto_invoice_fe?.value));
      setAutoCreditNoteFe(Boolean(d?.pos?.auto_credit_note_fe?.value));
    }
  }, [posFeData, tab]);

  const updatePosFeSettings = useMutation({
    mutationFn: () =>
      settingsApi.updateStore({
        settings: [
          { key: 'auto_invoice_fe',     value: autoInvoiceFe },
          { key: 'auto_credit_note_fe', value: autoCreditNoteFe },
        ],
      }),
    onSuccess: () => { notify.success('Configuración POS/FE guardada.'); },
    onError: () => notify.error('Error al guardar la configuración.'),
  });

  const [agingForm, setAgingForm] = useState({ name: '', from_days: '', to_days: '', color: '#3b82f6', label: '' });
  const [addingBucket, setAddingBucket] = useState(false);
  // QR de pago POS
  const [qrFile, setQrFile] = useState<File | null>(null);
  const [qrLabel, setQrLabel] = useState('');
  const [qrPreview, setQrPreview] = useState<string | null>(null);

  const { data: qrData, isLoading: loadingQr } = useQuery({
    queryKey: ['payment-qr', slug],
    queryFn: () => posApi.getPaymentQr().then((r) => r.data as { image_data: string; label: string | null } | null),
    enabled: tab === 'payment_qr',
  });

  useEffect(() => {
    if (qrData && tab === 'payment_qr') {
      setQrPreview(qrData.image_data ?? null);
      setQrLabel(qrData.label ?? '');
    }
  }, [qrData, tab]);

  const uploadQrMut = useMutation({
    mutationFn: () => {
      const fd = new FormData();
      if (qrFile) fd.append('image', qrFile);
      if (qrLabel) fd.append('label', qrLabel);
      return posApi.upsertPaymentQr(fd);
    },
    onSuccess: () => {
      notify.success('QR guardado correctamente.');
      qc.invalidateQueries({ queryKey: ['payment-qr', slug] });
      setQrFile(null);
    },
    onError: (e) => notify.error(e, 'Error al guardar el QR'),
  });

  const deleteQrMut = useMutation({
    mutationFn: () => posApi.deletePaymentQr(),
    onSuccess: () => {
      notify.success('QR eliminado.');
      qc.invalidateQueries({ queryKey: ['payment-qr', slug] });
      setQrPreview(null);
      setQrLabel('');
    },
    onError: (e) => notify.error(e, 'Error al eliminar el QR'),
  });

  function handleQrFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setQrFile(file);
    const reader = new FileReader();
    reader.onload = (ev) => setQrPreview(ev.target?.result as string);
    reader.readAsDataURL(file);
    e.target.value = '';
  }

  const [editBucket, setEditBucket] = useState<AgingBucket | null>(null);
  const [editForm, setEditForm] = useState({ name: '', from_days: '', to_days: '', color: '', label: '' });

  const COLOR_PRESETS = [
    { hex: '#22c55e', label: 'Verde'    },
    { hex: '#3b82f6', label: 'Azul'     },
    { hex: '#eab308', label: 'Amarillo' },
    { hex: '#f97316', label: 'Naranja'  },
    { hex: '#ef4444', label: 'Rojo'     },
    { hex: '#8b5cf6', label: 'Violeta'  },
  ];

  const createBucketMutation = useMutation({
    mutationFn: () => agingBucketsApi.create({
      name:       agingForm.name,
      from_days:  Number(agingForm.from_days),
      to_days:    agingForm.to_days !== '' ? Number(agingForm.to_days) : null,
      color:      agingForm.color,
      label:      agingForm.label || undefined,
      sort_order: agingBuckets.length,
    }),
    onSuccess: () => {
      notify.success('Rango creado');
      qc.invalidateQueries({ queryKey: ['aging-buckets', slug] });
      setAgingForm({ name: '', from_days: '', to_days: '', color: '#3b82f6', label: '' });
      setAddingBucket(false);
    },
    onError: (e) => notify.error(e, 'Error al crear rango'),
  });

  const updateBucketMutation = useMutation({
    mutationFn: (b: AgingBucket) => agingBucketsApi.update(b.id, {
      name:      editForm.name,
      from_days: Number(editForm.from_days),
      to_days:   editForm.to_days !== '' ? Number(editForm.to_days) : null,
      color:     editForm.color,
      label:     editForm.label || undefined,
    }),
    onSuccess: () => {
      notify.success('Rango actualizado');
      qc.invalidateQueries({ queryKey: ['aging-buckets', slug] });
      setEditBucket(null);
    },
    onError: (err) => notify.error(err, 'Error al actualizar'),
  });

  const deleteBucketMutation = useMutation({
    mutationFn: (id: number) => agingBucketsApi.destroy(id),
    onSuccess: () => {
      notify.success('Rango eliminado');
      qc.invalidateQueries({ queryKey: ['aging-buckets', slug] });
    },
    onError: (err) => notify.error(err, 'Error al eliminar'),
  });

  const toggleBucketActive = useMutation({
    mutationFn: (b: AgingBucket) => agingBucketsApi.update(b.id, { is_active: !b.is_active }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['aging-buckets', slug] }),
    onError: (err) => notify.error(err, 'Error al actualizar'),
  });

  const TABS = [
    { key: 'store',    label: 'Negocio',   icon: Store      },
    { key: 'users',    label: 'Usuarios',  icon: Users      },
    { key: 'security', label: 'Seguridad', icon: Shield     },
    { key: 'aging',    label: 'Cartera',   icon: TrendingUp },
    { key: 'pos_fe',     label: 'POS / FE',    icon: FileCheck },
    { key: 'payment_qr', label: 'QR de Pago',  icon: QrCode    },
  ] as const;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Ajustes</h1>
        <p className="text-muted-foreground text-sm">Configura tu negocio</p>
      </div>

      {/* Tab nav */}
      <div className="flex gap-2 border-b">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 transition-colors -mb-px ${
              tab === key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            <Icon className="size-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Store settings */}
      {tab === 'store' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Información del negocio</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingStore ? (
              <div className="space-y-4">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
              </div>
            ) : (
              <form onSubmit={handleSubmit((d) => updateStore.mutate(d))} className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <Label>Nombre del negocio *</Label>
                    <Input {...register('business_name')} />
                    {errors.business_name && <p className="text-xs text-destructive">{errors.business_name.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>NIT / RUT</Label>
                    <Input {...register('nit')} placeholder="900.123.456-7" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Dirección</Label>
                    <Input {...register('address')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Teléfono</Label>
                    <Input {...register('phone')} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Email de contacto</Label>
                    <Input type="email" {...register('email')} />
                    {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
                  </div>
                  <div className="space-y-1.5">
                    <Label>Prefijo de factura</Label>
                    <Input {...register('invoice_prefix')} placeholder="FV" />
                  </div>
                  <div className="sm:col-span-2 space-y-1.5">
                    <Label>Resolución DIAN</Label>
                    <Input {...register('invoice_resolution')} placeholder="No. 18764025..." />
                  </div>
                </div>
                <div className="flex justify-end pt-2">
                  <Button type="submit" disabled={!isDirty || isSubmitting} className="gap-2">
                    <Save className="size-4" />
                    {isSubmitting ? 'Guardando...' : 'Guardar cambios'}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      )}

      {/* Users settings */}
      {tab === 'users' && (
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base">Usuarios del negocio</CardTitle>
              <Button size="sm" className="gap-2" onClick={() => setInviteOpen(true)}>
                <UserPlus className="size-4" />
                Invitar
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left px-4 py-3 font-medium">Nombre</th>
                    <th className="text-left px-4 py-3 font-medium">Email</th>
                    <th className="text-left px-4 py-3 font-medium">Rol</th>
                    <th className="text-left px-4 py-3 font-medium">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {loadingUsers
                    ? Array.from({ length: 3 }).map((_, i) => (
                        <tr key={i}>
                          {Array.from({ length: 4 }).map((_, j) => (
                            <td key={j} className="px-4 py-3">
                              <Skeleton className="h-4 w-24" />
                            </td>
                          ))}
                        </tr>
                      ))
                    : users?.map((u) => {
                        const isSelf = u.email === user?.email;
                        const currentRole = u.roles[0] ?? 'cashier';
                        return (
                          <tr key={u.id} className="hover:bg-muted/30">
                            <td className="px-4 py-3 font-medium">{u.name}</td>
                            <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                            <td className="px-4 py-3">
                              {isSelf ? (
                                <Badge variant="default" className="capitalize">{currentRole}</Badge>
                              ) : (
                                <Select
                                  value={currentRole}
                                  onValueChange={(v) => v && updateRole.mutate({ id: u.id, role: v })}
                                  disabled={updateRole.isPending}
                                >
                                  <SelectTrigger className="h-8 w-36 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {ROLES.map((r) => (
                                      <SelectItem key={r.value} value={r.value} className="text-xs">
                                        {r.label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              {!isSelf && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive"
                                  onClick={() => {
                                    if (window.confirm(`¿Eliminar a ${u.name}?`)) {
                                      removeUser.mutate(u.id);
                                    }
                                  }}
                                >
                                  Eliminar
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

      {/* Security */}
      {tab === 'security' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Seguridad de la cuenta</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <p className="font-medium text-sm">Autenticación de dos factores (TOTP)</p>
                <p className="text-xs text-muted-foreground">Protege tu cuenta con una app de autenticación</p>
              </div>
              <Badge variant={user?.has_totp ? 'default' : 'secondary'}>
                {user?.has_totp ? 'Activado' : 'Desactivado'}
              </Badge>
            </div>
            <div className="flex items-center justify-between p-4 border rounded-lg">
              <div>
                <p className="font-medium text-sm">Sesión activa</p>
                <p className="text-xs text-muted-foreground">{user?.email}</p>
              </div>
              <Badge variant="outline">Activa</Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Aging buckets */}
      {tab === 'aging' && (
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <div>
                <CardTitle className="text-base">Rangos de cartera (Aging)</CardTitle>
                <p className="text-xs text-muted-foreground mt-1">
                  Define los intervalos de días para clasificar las cuentas por cobrar vencidas en el reporte de cartera.
                </p>
              </div>
              {!addingBucket && (
                <Button size="sm" className="gap-1.5 shrink-0" onClick={() => setAddingBucket(true)}>
                  <Plus className="size-3.5" /> Agregar rango
                </Button>
              )}
            </CardHeader>
            <CardContent className="flex flex-col gap-0 p-0">
              {/* Add form */}
              {addingBucket && (
                <div className="px-6 py-4 border-b bg-primary/5 flex flex-col gap-3">
                  <p className="text-xs font-semibold uppercase text-muted-foreground">Nuevo rango</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="col-span-2 flex flex-col gap-1">
                      <Label className="text-xs">Nombre *</Label>
                      <Input value={agingForm.name} onChange={(e) => setAgingForm((p) => ({ ...p, name: e.target.value }))} placeholder="Ej: 1-30 días" className="h-8 text-sm" autoFocus />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Desde (días) *</Label>
                      <Input type="number" min={0} value={agingForm.from_days} onChange={(e) => setAgingForm((p) => ({ ...p, from_days: e.target.value }))} placeholder="0" className="h-8 text-sm" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <Label className="text-xs">Hasta (días)</Label>
                      <Input type="number" min={0} value={agingForm.to_days} onChange={(e) => setAgingForm((p) => ({ ...p, to_days: e.target.value }))} placeholder="Vacío = abierto" className="h-8 text-sm" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">Etiqueta</Label>
                      <Input value={agingForm.label} onChange={(e) => setAgingForm((p) => ({ ...p, label: e.target.value }))} placeholder="Ej: Al día, Atrasado…" className="h-8 text-sm" />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label className="text-xs">Color</Label>
                      <div className="flex items-center gap-2">
                        {COLOR_PRESETS.map((c) => (
                          <button
                            key={c.hex}
                            type="button"
                            title={c.label}
                            onClick={() => setAgingForm((p) => ({ ...p, color: c.hex }))}
                            className={`size-6 rounded-full border-2 transition-transform ${agingForm.color === c.hex ? 'border-foreground scale-110' : 'border-transparent'}`}
                            style={{ backgroundColor: c.hex }}
                          />
                        ))}
                        <input type="color" value={agingForm.color} onChange={(e) => setAgingForm((p) => ({ ...p, color: e.target.value }))} className="size-6 rounded cursor-pointer border border-input" />
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="outline" className="h-8" onClick={() => setAddingBucket(false)}>
                      <X className="size-3.5 mr-1" /> Cancelar
                    </Button>
                    <Button
                      size="sm"
                      className="h-8"
                      disabled={!agingForm.name.trim() || agingForm.from_days === '' || createBucketMutation.isPending}
                      onClick={() => createBucketMutation.mutate()}
                    >
                      Guardar rango
                    </Button>
                  </div>
                </div>
              )}

              {/* Buckets list */}
              {loadingAging ? (
                <div className="px-6 py-4 flex flex-col gap-3">
                  {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : agingBuckets.length === 0 ? (
                <div className="px-6 py-10 text-center text-muted-foreground text-sm">
                  Sin rangos configurados. Agrega uno para empezar.
                </div>
              ) : (
                <div className="divide-y">
                  {agingBuckets.map((bucket) => (
                    <div key={bucket.id}>
                      {editBucket?.id === bucket.id ? (
                        /* Edit row */
                        <div className="px-6 py-3 flex flex-col gap-3 bg-muted/30">
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                            <div className="col-span-2 flex flex-col gap-1">
                              <Label className="text-xs">Nombre *</Label>
                              <Input value={editForm.name} onChange={(e) => setEditForm((p) => ({ ...p, name: e.target.value }))} className="h-8 text-sm" autoFocus />
                            </div>
                            <div className="flex flex-col gap-1">
                              <Label className="text-xs">Desde</Label>
                              <Input type="number" min={0} value={editForm.from_days} onChange={(e) => setEditForm((p) => ({ ...p, from_days: e.target.value }))} className="h-8 text-sm" />
                            </div>
                            <div className="flex flex-col gap-1">
                              <Label className="text-xs">Hasta</Label>
                              <Input type="number" min={0} value={editForm.to_days} onChange={(e) => setEditForm((p) => ({ ...p, to_days: e.target.value }))} placeholder="Vacío = abierto" className="h-8 text-sm" />
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="flex flex-col gap-1.5">
                              <Label className="text-xs">Etiqueta</Label>
                              <Input value={editForm.label} onChange={(e) => setEditForm((p) => ({ ...p, label: e.target.value }))} className="h-8 text-sm" />
                            </div>
                            <div className="flex flex-col gap-1.5">
                              <Label className="text-xs">Color</Label>
                              <div className="flex items-center gap-2">
                                {COLOR_PRESETS.map((c) => (
                                  <button
                                    key={c.hex}
                                    type="button"
                                    onClick={() => setEditForm((p) => ({ ...p, color: c.hex }))}
                                    className={`size-6 rounded-full border-2 transition-transform ${editForm.color === c.hex ? 'border-foreground scale-110' : 'border-transparent'}`}
                                    style={{ backgroundColor: c.hex }}
                                  />
                                ))}
                                <input type="color" value={editForm.color} onChange={(e) => setEditForm((p) => ({ ...p, color: e.target.value }))} className="size-6 rounded cursor-pointer border border-input" />
                              </div>
                            </div>
                          </div>
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" className="h-8" onClick={() => setEditBucket(null)}>
                              <X className="size-3.5 mr-1" /> Cancelar
                            </Button>
                            <Button
                              size="sm"
                              className="h-8"
                              disabled={!editForm.name.trim() || updateBucketMutation.isPending}
                              onClick={() => updateBucketMutation.mutate(editBucket!)}
                            >
                              Guardar
                            </Button>
                          </div>
                        </div>
                      ) : (
                        /* Display row */
                        <div className={`px-6 py-3 flex items-center gap-3 ${!bucket.is_active ? 'opacity-50' : ''}`}>
                          <GripVertical className="size-4 text-muted-foreground shrink-0 cursor-grab" />
                          <div
                            className="size-4 rounded-full shrink-0"
                            style={{ backgroundColor: bucket.color ?? '#94a3b8' }}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{bucket.name}</span>
                              {bucket.label && (
                                <span
                                  className="text-[10px] font-medium px-1.5 py-0.5 rounded-full"
                                  style={{ backgroundColor: (bucket.color ?? '#94a3b8') + '22', color: bucket.color ?? '#94a3b8' }}
                                >
                                  {bucket.label}
                                </span>
                              )}
                              {!bucket.is_active && <span className="text-[10px] text-muted-foreground">(inactivo)</span>}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {bucket.from_days} días
                              {bucket.to_days != null ? ` → ${bucket.to_days} días` : ' → sin límite'}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              className="text-xs text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded border border-transparent hover:border-border transition-colors"
                              onClick={() => toggleBucketActive.mutate(bucket)}
                            >
                              {bucket.is_active ? 'Desactivar' : 'Activar'}
                            </button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7"
                              onClick={() => {
                                setEditBucket(bucket);
                                setEditForm({
                                  name:      bucket.name,
                                  from_days: String(bucket.from_days),
                                  to_days:   bucket.to_days != null ? String(bucket.to_days) : '',
                                  color:     bucket.color ?? '#94a3b8',
                                  label:     bucket.label ?? '',
                                });
                              }}
                            >
                              <Pencil className="size-3.5" />
                            </Button>
                            <Button
                              size="icon"
                              variant="ghost"
                              className="size-7"
                              disabled={deleteBucketMutation.isPending}
                              onClick={() => {
                                if (window.confirm(`¿Eliminar el rango "${bucket.name}"?`)) {
                                  deleteBucketMutation.mutate(bucket.id);
                                }
                              }}
                            >
                              <Trash2 className="size-3.5 text-destructive" />
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Footer hint */}
              {agingBuckets.length > 0 && (
                <div className="px-6 py-3 border-t bg-muted/20">
                  <p className="text-xs text-muted-foreground">
                    Los rangos se usan en <strong>Reportes → Cartera aging</strong> para clasificar automáticamente las cuentas por cobrar.
                    El rango con <em>sin límite</em> captura todo lo que supere el último umbral.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* POS / FE settings */}
      {tab === 'pos_fe' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileCheck className="size-4" />
              Facturación Electrónica — Automatización POS
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium text-sm">Factura electrónica automática</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Al completar una venta en el POS, se emite automáticamente la FE en DIAN.
                  Requiere configuración DIAN válida.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={autoInvoiceFe}
                onClick={() => setAutoInvoiceFe((v) => !v)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                  autoInvoiceFe ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    autoInvoiceFe ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium text-sm">Nota crédito FE automática</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Al procesar una devolución en el POS, se emite automáticamente la NC-FE.
                </p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={autoCreditNoteFe}
                onClick={() => setAutoCreditNoteFe((v) => !v)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none ${
                  autoCreditNoteFe ? 'bg-primary' : 'bg-muted-foreground/30'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    autoCreditNoteFe ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <Button onClick={() => updatePosFeSettings.mutate()} disabled={updatePosFeSettings.isPending}>
              <Save className="size-4 mr-2" />
              {updatePosFeSettings.isPending ? 'Guardando...' : 'Guardar'}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* QR de pago POS */}
      {tab === 'payment_qr' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <QrCode className="size-4" />
              Código QR para pagos en el POS
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <p className="text-sm text-muted-foreground">
              Sube el QR de tu pasarela (Nequi, Daviplata, Bancolombia, etc.). Se mostrará
              en la pantalla de cobro del POS para que el cliente lo escanee.
              Solo puede existir <strong>un QR activo</strong> por negocio.
            </p>

            {/* Preview */}
            <div className="flex flex-col items-center gap-3">
              {loadingQr ? (
                <div className="size-52 rounded-lg border bg-muted animate-pulse" />
              ) : qrPreview ? (
                <div className="border rounded-lg p-3 bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={qrPreview} alt="QR de pago" className="size-48 object-contain" />
                </div>
              ) : (
                <div className="size-52 rounded-lg border-2 border-dashed flex flex-col items-center justify-center gap-2 text-muted-foreground">
                  <QrCode className="size-10 opacity-30" />
                  <p className="text-xs">Sin QR configurado</p>
                </div>
              )}
            </div>

            {/* Label */}
            <div className="space-y-1.5">
              <Label htmlFor="qr-label">Texto debajo del QR (opcional)</Label>
              <Input
                id="qr-label"
                placeholder="Ej: Escanea para pagar con Nequi"
                value={qrLabel}
                onChange={(e) => setQrLabel(e.target.value)}
                maxLength={120}
              />
            </div>

            {/* Upload */}
            <div className="space-y-1.5">
              <Label>Imagen del QR</Label>
              <label className="flex items-center gap-3 cursor-pointer border rounded-md px-4 py-2.5 text-sm hover:bg-muted/50 transition-colors w-fit">
                <Upload className="size-4 text-muted-foreground" />
                <span className="text-muted-foreground">
                  {qrFile ? qrFile.name : 'Seleccionar archivo (PNG, JPG, SVG — máx. 2 MB)'}
                </span>
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/svg+xml"
                  className="hidden"
                  onChange={handleQrFileChange}
                />
              </label>
            </div>

            <div className="flex gap-2">
              <Button
                onClick={() => uploadQrMut.mutate()}
                disabled={uploadQrMut.isPending || (!qrFile && !qrLabel)}
              >
                <Save className="size-4 mr-1.5" />
                {uploadQrMut.isPending ? 'Guardando...' : 'Guardar QR'}
              </Button>
              {qrPreview && (
                <Button
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => window.confirm('¿Eliminar el QR de pago?') && deleteQrMut.mutate()}
                  disabled={deleteQrMut.isPending}
                >
                  <Trash2 className="size-4 mr-1.5" />
                  Eliminar
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Invite User Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserPlus className="size-4" />
              Invitar usuario
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="invite-email">Correo electrónico *</Label>
              <Input
                id="invite-email"
                type="email"
                placeholder="usuario@ejemplo.com"
                value={inviteEmail}
                onChange={(e) => setInviteEmail(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label>Rol *</Label>
              <Select value={inviteRole} onValueChange={(v) => v && setInviteRole(v)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ROLES.map((r) => (
                    <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              El usuario recibirá un correo con las instrucciones para unirse al negocio.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setInviteOpen(false)}>Cancelar</Button>
            <Button
              onClick={() => inviteMutation.mutate()}
              disabled={!inviteEmail.trim() || inviteMutation.isPending}
            >
              {inviteMutation.isPending ? 'Enviando...' : 'Enviar invitación'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
