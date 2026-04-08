'use client';

/**
 * Página de resultado de pago (redirect_url de Wompi).
 *
 * Wompi redirige aquí con ?id={wompi_transaction_id}
 *
 * Flujo:
 * 1. Lee el parámetro `id` de la URL.
 * 2. Llama a GET /billing/verify-payment?transaction_id={id}.
 * 3. Muestra el resultado: aprobado, pendiente, rechazado.
 * 4. Si está aprobado → botón "Ir al dashboard".
 * 5. Si está pendiente → reintenta cada 3 s hasta 10 veces.
 */

import { useEffect, useRef, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { billingApi, setTenantSlug } from '@/lib/api/tenant.api';
import { CheckCircle, XCircle, Loader2, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { PaymentVerifyResult } from '@/types';

const fmt = (n?: number) =>
  n !== undefined
    ? new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(n / 100)
    : '';

export default function PaymentResultPage() {
  const routeParams     = useParams();
  const searchParams    = useSearchParams();
  const slug            = routeParams.slug as string;
  const wompiId         = searchParams.get('id') ?? '';

  const [result, setResult]   = useState<PaymentVerifyResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempts, setAttempts] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (slug) setTenantSlug(slug);
  }, [slug]);

  const verify = async () => {
    if (!wompiId) {
      setResult({ status: 'error' });
      setLoading(false);
      return;
    }

    try {
      const res  = await billingApi.verifyPayment(wompiId);
      const data = res.data as PaymentVerifyResult;
      setResult(data);

      if (data.status !== 'pending') {
        setLoading(false);
        if (intervalRef.current) clearInterval(intervalRef.current);
      }
    } catch {
      setResult({ status: 'error' });
      setLoading(false);
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
  };

  useEffect(() => {
    verify();

    // Reintentar cada 3 s si sigue pendiente (máx. 10 veces)
    intervalRef.current = setInterval(() => {
      setAttempts((prev) => {
        if (prev >= 9) {
          clearInterval(intervalRef.current!);
          setLoading(false);
          return prev;
        }
        verify();
        return prev + 1;
      });
    }, 3000);

    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wompiId]);

  const dashboardUrl = `/${slug}/dashboard`;
  const billingUrl   = `/${slug}/billing`;

  // ── Estados de UI ──────────────────────────────────────────────────────────

  if (!wompiId) {
    return <ResultLayout icon={<XCircle className="size-14 text-destructive" />} title="Enlace inválido" subtitle="No se recibió el identificador de transacción." actions={<Button asChild><a href={billingUrl}>Volver a Facturación</a></Button>} />;
  }

  if (loading && (!result || result.status === 'pending')) {
    return (
      <ResultLayout
        icon={<Loader2 className="size-14 text-primary animate-spin" />}
        title="Verificando pago…"
        subtitle="Esto puede tomar unos segundos."
        actions={null}
      />
    );
  }

  if (result?.status === 'approved') {
    return (
      <ResultLayout
        icon={<CheckCircle className="size-14 text-green-500" />}
        title="¡Pago aprobado!"
        subtitle={[
          result.metadata?.plan_name ? `Plan ${result.metadata.plan_name} activado.` : '',
          result.metadata?.addon_name ? `Add-on ${result.metadata.addon_name} activado.` : '',
          result.amount ? `Monto: ${fmt(result.amount)}` : '',
          result.reference ? `Ref: ${result.reference}` : '',
        ].filter(Boolean).join(' · ')}
        actions={
          <div className="flex gap-3">
            <Button asChild>
              <a href={dashboardUrl}>Ir al dashboard</a>
            </Button>
            <Button variant="outline" asChild>
              <a href={billingUrl}>Ver facturación</a>
            </Button>
          </div>
        }
      />
    );
  }

  if (result?.status === 'pending') {
    return (
      <ResultLayout
        icon={<Clock className="size-14 text-amber-500" />}
        title="Pago en proceso"
        subtitle="Tu pago aún está siendo procesado. Recibirás una notificación cuando se confirme."
        actions={
          <div className="flex gap-3">
            <Button asChild>
              <a href={dashboardUrl}>Continuar al dashboard</a>
            </Button>
            <Button variant="outline" asChild>
              <a href={billingUrl}>Ver facturación</a>
            </Button>
          </div>
        }
      />
    );
  }

  // declined / voided / error
  return (
    <ResultLayout
      icon={<XCircle className="size-14 text-destructive" />}
      title="Pago no completado"
      subtitle={
        result?.status === 'declined'
          ? 'Tu pago fue rechazado. Verifica los datos de tu método de pago e intenta de nuevo.'
          : 'Ocurrió un error procesando el pago. Contacta a soporte si el problema persiste.'
      }
      actions={
        <div className="flex gap-3">
          <Button asChild>
            <a href={billingUrl}>Intentar de nuevo</a>
          </Button>
          <Button variant="outline" asChild>
            <a href={dashboardUrl}>Ir al dashboard</a>
          </Button>
        </div>
      }
    />
  );
}

// ─── Layout reutilizable ──────────────────────────────────────────────────────

function ResultLayout({
  icon, title, subtitle, actions,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  actions: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="flex justify-center">{icon}</div>
        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">{title}</h1>
          {subtitle && <p className="text-muted-foreground text-sm">{subtitle}</p>}
        </div>
        {actions && <div className="flex justify-center">{actions}</div>}
      </div>
    </div>
  );
}
