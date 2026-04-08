import type { Metadata } from 'next';
import { Suspense } from 'react';
import RegisterClient from './_components/RegisterClient';
import type { BusinessType } from '@/lib/api/central.api';

export const metadata: Metadata = {
  title: 'Crear cuenta — Atlas ERP',
  description: 'Crea tu cuenta gratis en Atlas ERP. Sin tarjeta de crédito. Configura tu negocio en menos de 2 minutos.',
  robots: { index: false, follow: false },
};

export const revalidate = 3600;

async function fetchBusinessTypes(): Promise<BusinessType[]> {
  try {
    const url = `${process.env.NEXT_PUBLIC_API_URL}/business-types`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const json = await res.json();
    const list: BusinessType[] = json.data ?? json ?? [];
    return list.filter((t) => t.is_active);
  } catch {
    return [];
  }
}

export default async function RegisterPage() {
  const businessTypes = await fetchBusinessTypes();

  return (
    <Suspense>
      <RegisterClient businessTypes={businessTypes} />
    </Suspense>
  );
}
