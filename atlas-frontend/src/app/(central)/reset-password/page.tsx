'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { standardSchemaResolver as zodResolver } from '@hookform/resolvers/standard-schema';
import { z } from 'zod';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useSearchParams } from 'next/navigation';
import { usePublicSettings, useBgStyle } from '@/hooks/usePublicSettings';
import { Button, buttonVariants } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { authApi } from '@/lib/api/central.api';
import { CheckCircle2 } from 'lucide-react';

const schema = z
  .object({
    password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
    password_confirmation: z.string().min(1, 'Confirma tu contraseña'),
  })
  .refine((d) => d.password === d.password_confirmation, {
    message: 'Las contraseñas no coinciden',
    path: ['password_confirmation'],
  });

type ResetForm = z.infer<typeof schema>;

export default function ResetPasswordPage() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const email = params.get('email') ?? '';

  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const { branding } = usePublicSettings();
  const bg = useBgStyle(branding);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ResetForm>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: ResetForm) => {
    setError('');
    if (!token || !email) {
      setError('El enlace de recuperación es inválido o ha expirado.');
      return;
    }
    try {
      await authApi.resetPassword({
        token,
        email,
        password: data.password,
        password_confirmation: data.password_confirmation,
      });
      setDone(true);
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string } } };
      setError(e?.response?.data?.message || 'El enlace es inválido o ha expirado. Solicita uno nuevo.');
    }
  };

  if (!token || !email) {
    return (
      <div
        className={`min-h-screen flex items-center justify-center p-4 ${bg.className}`}
        style={bg.style}
      >
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            {branding.logo_url ? (
              <img src={branding.logo_url} alt={branding.app_name} className="h-12 mx-auto mb-2 object-contain" />
            ) : (
              <div className="text-4xl font-black tracking-tight text-primary mb-2">{branding.app_name}</div>
            )}
            <CardTitle>Enlace inválido</CardTitle>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              Este enlace de recuperación es inválido o ha expirado.
            </p>
            <Link href="/forgot-password" className={cn(buttonVariants())}>
              Solicitar nuevo enlace
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div
      className={`min-h-screen flex items-center justify-center p-4 ${bg.className}`}
      style={bg.style}
    >
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          {branding.logo_url ? (
            <img src={branding.logo_url} alt={branding.app_name} className="h-12 mx-auto mb-2 object-contain" />
          ) : (
            <div className="text-4xl font-black tracking-tight text-primary mb-2">{branding.app_name}</div>
          )}
          <CardTitle>Nueva contraseña</CardTitle>
          <CardDescription>Elige una contraseña segura para tu cuenta.</CardDescription>
        </CardHeader>
        <CardContent>
          {done ? (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <p className="font-medium">¡Contraseña actualizada!</p>
              <p className="text-sm text-muted-foreground">
                Tu contraseña fue restablecida correctamente. Ya puedes iniciar sesión.
              </p>
              <Link href="/login" className={cn(buttonVariants(), 'mt-2')}>
                Ir al inicio de sesión
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">Nueva contraseña</Label>
                <Input id="password" type="password" {...register('password')} />
                {errors.password && (
                  <p className="text-sm text-destructive">{errors.password.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="password_confirmation">Confirmar contraseña</Label>
                <Input id="password_confirmation" type="password" {...register('password_confirmation')} />
                {errors.password_confirmation && (
                  <p className="text-sm text-destructive">{errors.password_confirmation.message}</p>
                )}
              </div>

              {error && (
                <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-md p-3 text-sm">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Actualizando...' : 'Restablecer contraseña'}
              </Button>

              <p className="text-center text-sm text-muted-foreground">
                <Link href="/login" className="text-primary hover:underline font-medium">
                  Volver al inicio de sesión
                </Link>
              </p>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
