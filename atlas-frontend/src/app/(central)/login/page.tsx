'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { standardSchemaResolver as zodResolver } from '@hookform/resolvers/standard-schema';
import { z } from 'zod';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { usePublicSettings, useBgStyle } from '@/hooks/usePublicSettings';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { FieldError, FieldHint, FormAlert } from '@/components/ui/field-error';
import { authApi } from '@/lib/api/central.api';
import { useAuthStore } from '@/store/authStore';
import { parseApiError } from '@/lib/notify';

const loginSchema = z.object({
  email: z.string().email('Ingresa un correo electrónico válido'),
  password: z.string().min(1, 'La contraseña es obligatoria'),
  totp_code: z.string().length(6, 'El código debe tener exactamente 6 dígitos').optional().or(z.literal('')),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const { setAuth, setCurrentTenant } = useAuthStore();
  const [requiresTotp, setRequiresTotp] = useState(false);
  const [error, setError] = useState('');
  const { branding } = usePublicSettings();
  const bg = useBgStyle(branding);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (data: LoginForm) => {
    setError('');
    try {
      const res = await authApi.login(data.email, data.password, data.totp_code || undefined);
      const { token, user, tenants } = res.data;

      setAuth(token, user, tenants);

      // Redirigir según rol
      if (user.roles.includes('super')) {
        router.push('/atlas-mandragora/tenants');
        return;
      }

      // Si tiene un solo tenant, ir directo
      if (tenants.length === 1) {
        setCurrentTenant(tenants[0]);
        router.push(`/${tenants[0].slug}/dashboard`);
      } else if (tenants.length > 1) {
        router.push('/select-tenant');
      } else {
        router.push('/register');
      }
    } catch (err: unknown) {
      const e = err as { response?: { data?: { message?: string; requires_totp?: boolean } } };
      if (e?.response?.data?.requires_totp) {
        setRequiresTotp(true);
      } else {
        setError(parseApiError(err, 'Error al iniciar sesión. Verifica tus credenciales.'));
      }
    }
  };

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
          <CardTitle>Iniciar Sesión</CardTitle>
          <CardDescription>Ingresa a tu cuenta para continuar</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">
                Correo electrónico <span className="text-destructive">*</span>
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="tu@correo.com"
                aria-invalid={!!errors.email}
                {...register('email')}
              />
              <FieldError message={errors.email?.message} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">
                  Contraseña <span className="text-destructive">*</span>
                </Label>
                <Link href="/forgot-password" className="text-xs text-primary hover:underline">
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                aria-invalid={!!errors.password}
                {...register('password')}
              />
              <FieldError message={errors.password?.message} />
            </div>

            {requiresTotp && (
              <div className="space-y-2">
                <Label htmlFor="totp_code">
                  Código de verificación (TOTP) <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="totp_code"
                  type="text"
                  placeholder="000000"
                  maxLength={6}
                  className="text-center text-xl tracking-widest"
                  aria-invalid={!!errors.totp_code}
                  {...register('totp_code')}
                />
                <FieldError message={errors.totp_code?.message} />
                <FieldHint message="Ingresa el código de 6 dígitos de tu app de autenticación (Google Authenticator, Authy, etc.)" />
              </div>
            )}

            <FormAlert type="error" message={error} />

            <Button type="submit" className="w-full" disabled={isSubmitting}>
              {isSubmitting ? 'Ingresando...' : 'Ingresar'}
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              ¿No tienes cuenta?{' '}
              <a href="/register" className="text-primary hover:underline font-medium">
                Registra tu negocio
              </a>
            </p>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
