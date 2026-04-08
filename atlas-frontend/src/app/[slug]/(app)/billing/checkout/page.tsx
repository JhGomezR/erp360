'use client';

/**
 * Página intermediaria de checkout Wompi.
 *
 * Recibe los parámetros de la URL:
 *   ?type=plan&id={planId}
 *   ?type=addon&id={addonId}
 *
 * Flujo:
 * 1. Llama al backend para obtener la referencia + firma de integridad.
 * 2. Construye la URL de Wompi Web Checkout con los parámetros como query string.
 * 3. Redirige con window.location.href (navegación completa, sin interferencia de Next.js).
 * 4. El usuario completa el pago en Wompi y es redirigido a /billing/payment-result.
 */

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { billingApi, setTenantSlug } from '@/lib/api/tenant.api';
import { notify } from '@/lib/notify';
import { Loader2 } from 'lucide-react';
import type { WompiCheckoutData } from '@/types';

export default function CheckoutPage() {
  const params       = useSearchParams();
  const routeParams  = useParams();
  const slug         = routeParams.slug as string;
  const type         = params.get('type');   // 'plan' | 'addon'
  const id           = params.get('id');     // planId | addonId
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (slug) setTenantSlug(slug);
  }, [slug]);

  useEffect(() => {
    if (!type || !id) {
      setError('Parámetros de pago inválidos.');
      setLoading(false);
      return;
    }

    const prepare = async () => {
      try {
        const apiCall = type === 'plan'
          ? billingApi.checkoutPlan(Number(id))
          : billingApi.checkoutAddon(Number(id));

        const res  = await apiCall;
        const data = res.data as WompiCheckoutData;

        // Construir la URL de Wompi manualmente para preservar los nombres de campo
        // literales (ej: "signature:integrity", "customer-data:email").
        // URLSearchParams codifica los dos puntos → %3A, lo que Wompi/CloudFront rechaza.
        const queryString = Object.entries(data.params)
          .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
          .join('&');

        // Navegación completa al checkout de Wompi
        window.location.href = `${data.checkout_url}?${queryString}`;
      } catch (err: unknown) {
        const msg = (err as { response?: { data?: { message?: string } } })
          ?.response?.data?.message ?? 'Error al preparar el pago.';
        setError(msg);
        notify.error(err, 'Error al preparar el pago');
        setLoading(false);
      }
    };

    prepare();
  }, [type, id]);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-center p-6">
        <p className="text-destructive font-medium">{error}</p>
        <a href={`/${slug}/billing`} className="text-sm text-primary hover:underline">
          Volver a Facturación
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <Loader2 className="size-8 animate-spin text-primary" />
      <p className="text-sm text-muted-foreground">Redirigiendo a Wompi…</p>
    </div>
  );
}
