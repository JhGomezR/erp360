'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Button, buttonVariants } from '@/components/ui/button';
import { usePublicSettings, useBgStyle } from '@/hooks/usePublicSettings';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { authApi } from '@/lib/api/central.api';
import { CheckCircle2 } from 'lucide-react';

const schema = z.object({
  email: z.string().email('Correo inválido'),
});
type ForgotForm = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const { branding } = usePublicSettings();
  const bg = useBgStyle(branding);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ForgotForm>({ resolver: zodResolver(schema) });

  const onSubmit = async (data: ForgotForm) => {
    setError('');
    try {
      await authApi.forgotPassword(data.email);
      setSent(true);
    } catch {
      setError('Ocurrió un error. Intenta de nuevo más tarde.');
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
            // eslint-disable-next-line @next/next/no-img-element -- logo dinámico desde branding API; no se conoce el dominio en tiempo de build
            <img src={branding.logo_url} alt={branding.app_name} className="h-12 mx-auto mb-2 object-contain" />
          ) : (
            <div className="text-4xl font-black tracking-tight text-primary mb-2">{branding.app_name}</div>
          )}
          <CardTitle>Recuperar contraseña</CardTitle>
          <CardDescription>
            Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {sent ? (
            <div className="flex flex-col items-center gap-4 py-4 text-center">
              <CheckCircle2 className="h-12 w-12 text-green-500" />
              <p className="font-medium">Revisa tu bandeja de entrada</p>
              <p className="text-sm text-muted-foreground">
                Si el correo está registrado, recibirás las instrucciones en breve.
                Recuerda revisar también tu carpeta de spam.
              </p>
              <Link href="/login" className={cn(buttonVariants({ variant: 'outline' }), 'mt-2')}>
                Volver al inicio de sesión
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Correo electrónico</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="tu@correo.com"
                  {...register('email')}
                />
                {errors.email && (
                  <p className="text-sm text-destructive">{errors.email.message}</p>
                )}
              </div>

              {error && (
                <div className="bg-destructive/10 border border-destructive/30 text-destructive rounded-md p-3 text-sm">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={isSubmitting}>
                {isSubmitting ? 'Enviando...' : 'Enviar enlace de recuperación'}
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
