'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { notify } from '@/lib/notify';
import {
  ArrowLeft,
  Eye,
  EyeOff,
  Shield,
  ShieldCheck,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';

import { authApi, totpApi } from '@/lib/api/central.api';
import { useAuthStore } from '@/store/authStore';
import type { User } from '@/types';

// ─── Schemas ──────────────────────────────────────────────────────────────────

const profileSchema = z.object({
  name: z.string().min(2, 'El nombre debe tener al menos 2 caracteres'),
  phone: z.string().optional(),
});

const passwordSchema = z
  .object({
    current_password: z.string().min(1, 'Ingresa tu contraseña actual'),
    password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
    password_confirmation: z.string().min(1, 'Confirma tu nueva contraseña'),
  })
  .refine((data) => data.password === data.password_confirmation, {
    message: 'Las contraseñas no coinciden',
    path: ['password_confirmation'],
  });

type ProfileForm = z.infer<typeof profileSchema>;
type PasswordForm = z.infer<typeof passwordSchema>;

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ProfilePage() {
  const router = useRouter();
  const { user, isAuthenticated, setUser } = useAuthStore();

  // Password visibility toggles
  const [showCurrentPwd, setShowCurrentPwd] = useState(false);
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);

  // 2FA state
  const [totpSetup, setTotpSetup] = useState<{ qr_code_url: string; secret: string } | null>(null);
  const [totpCode, setTotpCode] = useState('');
  const [disableMode, setDisableMode] = useState(false);
  const [disableCode, setDisableCode] = useState('');

  // Auth guard
  useEffect(() => {
    if (!isAuthenticated()) router.replace('/login');
  }, [isAuthenticated, router]);

  // ─── Profile form ────────────────────────────────────────────────────────────

  const profileForm = useForm<ProfileForm>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user?.name ?? '',
      phone: '',
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: (data: ProfileForm) => authApi.updateProfile(data),
    onSuccess: (res) => {
      const updated = res.data as User;
      setUser({ ...user!, name: updated.name });
      profileForm.reset({ name: updated.name, phone: profileForm.getValues('phone') });
      notify.success('Perfil actualizado correctamente');
    },
    onError: (err: unknown) => {
      notify.error(err, 'Error al actualizar el perfil');
    },
  });

  // ─── Password form ───────────────────────────────────────────────────────────

  const passwordForm = useForm<PasswordForm>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      current_password: '',
      password: '',
      password_confirmation: '',
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: (data: PasswordForm) => authApi.changePassword(data),
    onSuccess: () => {
      passwordForm.reset();
      notify.success('Contraseña actualizada correctamente');
    },
    onError: (err: unknown) => {
      notify.error(err, 'Error al cambiar la contraseña');
    },
  });

  // ─── 2FA mutations ───────────────────────────────────────────────────────────

  const totpSetupMutation = useMutation({
    mutationFn: () => totpApi.setup(),
    onSuccess: (res) => {
      setTotpSetup(res.data);
      setTotpCode('');
    },
    onError: (err: unknown) => {
      notify.error(err, 'Error al iniciar la configuración de 2FA');
    },
  });

  const totpEnableMutation = useMutation({
    mutationFn: (code: string) => totpApi.enable(code),
    onSuccess: (res) => {
      const updated = (res.data as { user: User }).user;
      setUser({ ...updated, has_totp: true });
      setTotpSetup(null);
      setTotpCode('');
      notify.success('2FA activado correctamente');
    },
    onError: (err: unknown) => {
      notify.error(err, 'Código incorrecto. Inténtalo de nuevo.');
    },
  });

  const totpDisableMutation = useMutation({
    mutationFn: (code: string) => totpApi.disable(code),
    onSuccess: (res) => {
      const updated = (res.data as { user: User }).user;
      setUser({ ...updated, has_totp: false });
      setDisableMode(false);
      setDisableCode('');
      notify.success('2FA desactivado correctamente');
    },
    onError: (err: unknown) => {
      notify.error(err, 'Código incorrecto. Inténtalo de nuevo.');
    },
  });

  // ─── Loading guard ───────────────────────────────────────────────────────────

  if (!user) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
        <Skeleton className="h-48 w-full rounded-lg" />
      </div>
    );
  }

  // ─── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.back()} className="gap-2">
          <ArrowLeft className="size-4" />
          Volver
        </Button>
        <Separator orientation="vertical" className="h-5" />
        <h1 className="text-2xl font-bold tracking-tight">Mi Perfil</h1>
      </div>

      {/* ── Card 1: Información personal ─────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Información personal</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={profileForm.handleSubmit((data) => updateProfileMutation.mutate(data))}
            className="space-y-4"
          >
            {/* Nombre */}
            <div className="space-y-2">
              <Label htmlFor="name">Nombre completo</Label>
              <Input
                id="name"
                placeholder="Tu nombre completo"
                {...profileForm.register('name')}
              />
              {profileForm.formState.errors.name && (
                <p className="text-sm text-destructive">
                  {profileForm.formState.errors.name.message}
                </p>
              )}
            </div>

            {/* Email (readonly) */}
            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                value={user.email}
                disabled
                className="bg-muted text-muted-foreground cursor-not-allowed"
              />
              <p className="text-xs text-muted-foreground">El correo electrónico no se puede cambiar.</p>
            </div>

            {/* Teléfono */}
            <div className="space-y-2">
              <Label htmlFor="phone">Teléfono (opcional)</Label>
              <Input
                id="phone"
                type="tel"
                placeholder="+57 300 123 4567"
                {...profileForm.register('phone')}
              />
            </div>

            <Button
              type="submit"
              disabled={!profileForm.formState.isDirty || updateProfileMutation.isPending}
            >
              {updateProfileMutation.isPending ? 'Guardando...' : 'Guardar cambios'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ── Card 2: Cambiar contraseña ───────────────────────────────────────── */}
      <Card>
        <CardHeader>
          <CardTitle>Cambiar contraseña</CardTitle>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={passwordForm.handleSubmit((data) => changePasswordMutation.mutate(data))}
            className="space-y-4"
          >
            {/* Contraseña actual */}
            <div className="space-y-2">
              <Label htmlFor="current_password">Contraseña actual</Label>
              <div className="relative">
                <Input
                  id="current_password"
                  type={showCurrentPwd ? 'text' : 'password'}
                  placeholder="••••••••"
                  {...passwordForm.register('current_password')}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPwd((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showCurrentPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {passwordForm.formState.errors.current_password && (
                <p className="text-sm text-destructive">
                  {passwordForm.formState.errors.current_password.message}
                </p>
              )}
            </div>

            {/* Nueva contraseña */}
            <div className="space-y-2">
              <Label htmlFor="password">Nueva contraseña</Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showNewPwd ? 'text' : 'password'}
                  placeholder="••••••••"
                  {...passwordForm.register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPwd((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showNewPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {passwordForm.formState.errors.password && (
                <p className="text-sm text-destructive">
                  {passwordForm.formState.errors.password.message}
                </p>
              )}
            </div>

            {/* Confirmar nueva contraseña */}
            <div className="space-y-2">
              <Label htmlFor="password_confirmation">Confirmar nueva contraseña</Label>
              <div className="relative">
                <Input
                  id="password_confirmation"
                  type={showConfirmPwd ? 'text' : 'password'}
                  placeholder="••••••••"
                  {...passwordForm.register('password_confirmation')}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPwd((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                  tabIndex={-1}
                >
                  {showConfirmPwd ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </button>
              </div>
              {passwordForm.formState.errors.password_confirmation && (
                <p className="text-sm text-destructive">
                  {passwordForm.formState.errors.password_confirmation.message}
                </p>
              )}
            </div>

            <Button
              type="submit"
              disabled={changePasswordMutation.isPending}
            >
              {changePasswordMutation.isPending ? 'Actualizando...' : 'Actualizar contraseña'}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* ── Card 3: Autenticación de dos factores ────────────────────────────── */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4">
            <CardTitle>Autenticación de dos factores (2FA)</CardTitle>
            {user.has_totp ? (
              <Badge className="bg-green-500/15 text-green-700 dark:text-green-400 border-green-500/30 hover:bg-green-500/20">
                Activado
              </Badge>
            ) : (
              <Badge variant="secondary">Desactivado</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {user.has_totp ? (
            /* ── State B: 2FA enabled ─────────────────────────────────────────── */
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="size-5 text-green-600 dark:text-green-400 mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground">
                  Tu cuenta está protegida con 2FA. Necesitarás tu app de autenticación cada vez que inicies sesión.
                </p>
              </div>

              {!disableMode ? (
                <Button
                  variant="destructive"
                  onClick={() => setDisableMode(true)}
                >
                  Desactivar 2FA
                </Button>
              ) : (
                <div className="space-y-3 border rounded-lg p-4 bg-destructive/5 border-destructive/20">
                  <p className="text-sm font-medium text-destructive">
                    Ingresa el código de tu app de autenticación para confirmar
                  </p>
                  <Input
                    type="text"
                    inputMode="numeric"
                    placeholder="000000"
                    maxLength={6}
                    className="text-center text-xl tracking-widest max-w-[160px]"
                    value={disableCode}
                    onChange={(e) => setDisableCode(e.target.value.replace(/\D/g, ''))}
                  />
                  <div className="flex gap-2">
                    <Button
                      variant="destructive"
                      disabled={disableCode.length !== 6 || totpDisableMutation.isPending}
                      onClick={() => totpDisableMutation.mutate(disableCode)}
                    >
                      {totpDisableMutation.isPending ? 'Desactivando...' : 'Confirmar desactivación'}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setDisableMode(false);
                        setDisableCode('');
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            /* ── State A: 2FA not enabled ─────────────────────────────────────── */
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <Shield className="size-5 text-muted-foreground mt-0.5 shrink-0" />
                <p className="text-sm text-muted-foreground">
                  Protege tu cuenta con una app de autenticación como Google Authenticator o Authy. Cuando esté activado, necesitarás un código de 6 dígitos para iniciar sesión.
                </p>
              </div>

              {!totpSetup ? (
                /* Step 1: Trigger setup */
                <Button
                  onClick={() => totpSetupMutation.mutate()}
                  disabled={totpSetupMutation.isPending}
                >
                  {totpSetupMutation.isPending ? 'Generando...' : 'Activar 2FA'}
                </Button>
              ) : (
                /* Step 2: Show QR + verify code */
                <div className="space-y-5">
                  <Separator />

                  <div className="space-y-3 text-center">
                    <p className="text-sm font-medium">
                      Escanea este código QR con tu app de autenticación
                    </p>
                    {/* eslint-disable-next-line @next/next/no-img-element -- QR generado dinámicamente, no es candidato a optimización de imagen */}
                    <img
                      src={totpSetup.qr_code_url}
                      alt="QR Code"
                      className="size-48 mx-auto rounded"
                    />
                    <p className="text-xs text-muted-foreground">
                      ¿No puedes escanear el código? Ingresa este código manualmente:
                    </p>
                    <div className="inline-block bg-muted rounded-md px-4 py-2 font-mono text-sm tracking-widest select-all mx-auto">
                      {totpSetup.secret}
                    </div>
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <p className="text-sm font-medium">
                      Ingresa el código de 6 dígitos que muestra tu app para confirmar
                    </p>
                    <Input
                      type="text"
                      inputMode="numeric"
                      placeholder="000000"
                      maxLength={6}
                      className="text-center text-xl tracking-widest max-w-[160px]"
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                    />
                    <p className="text-xs text-muted-foreground">
                      El código se renueva cada 30 segundos. Asegúrate de ingresarlo antes de que expire.
                    </p>
                  </div>

                  <div className="flex gap-2">
                    <Button
                      disabled={totpCode.length !== 6 || totpEnableMutation.isPending}
                      onClick={() => totpEnableMutation.mutate(totpCode)}
                    >
                      {totpEnableMutation.isPending ? 'Activando...' : 'Confirmar y activar'}
                    </Button>
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setTotpSetup(null);
                        setTotpCode('');
                      }}
                    >
                      Cancelar
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
