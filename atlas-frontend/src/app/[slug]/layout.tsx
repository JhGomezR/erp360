'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { setTenantSlug, tenantAuthApi } from '@/lib/api/tenant.api';

export default function TenantRootLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const params = useParams();
  const slug = params.slug as string;
  const [ready, setReady] = useState(false);

  const {
    isAuthenticated,
    tenants,
    setCurrentTenant,
    setTenantAuthToken,
    currentTenant,
    hasTenantToken,
  } = useAuthStore();

  useEffect(() => {
    if (!isAuthenticated()) {
      router.replace('/login');
      return;
    }

    const tenant = tenants.find((t) => t.slug === slug);
    if (!tenant) {
      router.replace('/login');
      return;
    }

    // Actualizar tenant activo si cambió
    if (currentTenant?.slug !== slug) {
      setCurrentTenant(tenant);
    }

    // Fijar slug para que tenant.api.ts construya las URLs correctas
    setTenantSlug(slug);

    // Si no hay token tenant vigente, hacer exchange automático
    if (!hasTenantToken()) {
      tenantAuthApi
        .exchange(slug)
        .then((res) => {
          const { token } = res.data as { token: string };
          setTenantAuthToken(token);
          setReady(true);
        })
        .catch(() => {
          // El usuario central no tiene cuenta en este tenant
          router.replace('/login');
        });
    } else {
      setReady(true);
    }
  }, [slug]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!isAuthenticated() || !ready) return null;

  return <>{children}</>;
}
