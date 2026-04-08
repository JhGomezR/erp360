import type { Metadata } from 'next';
import LandingClient from './_components/LandingClient';
import type { Plan } from '@/types';
import type { BusinessType } from '@/lib/api/central.api';

/* ─── SEO ──────────────────────────────────────────────────────────────────── */
export const metadata: Metadata = {
  title: 'Atlas ERP — Sistema POS y ERP para negocios en Colombia',
  description:
    'Gestiona ventas, inventario, caja y empleados desde una sola plataforma. ERP en la nube para tiendas, restaurantes, farmacias y más. Prueba 14 días gratis, sin tarjeta de crédito.',
  keywords: [
    'ERP Colombia', 'sistema POS Colombia', 'software inventario Colombia',
    'gestión de negocios', 'punto de venta', 'software restaurante', 'software tienda',
    'ERP nube', 'facturación electrónica DIAN', 'software contabilidad Colombia',
  ],
  openGraph: {
    type: 'website',
    locale: 'es_CO',
    title: 'Atlas ERP — Vende más, gasta menos, controla todo',
    description:
      'La plataforma SaaS para negocios colombianos. POS, inventario, finanzas y más en un solo lugar. Empieza gratis.',
    siteName: 'Atlas ERP',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Atlas ERP — Sistema de gestión para negocios en Colombia',
    description: 'ERP en la nube: ventas, inventario, caja y equipo unificados. 14 días gratis.',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true },
  },
  alternates: {
    canonical: 'https://atlasterp.co',
  },
};

/* ─── ISR: regenerar cada hora ─────────────────────────────────────────────── */
export const revalidate = 3600;

/* ─── Data fetching (server-side) ──────────────────────────────────────────── */
async function fetchPlans(): Promise<Plan[]> {
  try {
    const url = `${process.env.NEXT_PUBLIC_API_URL}/plans?active_only=true`;
    const res = await fetch(url, { next: { revalidate: 3600 } });
    if (!res.ok) return [];
    const json = await res.json();
    return json.data ?? json ?? [];
  } catch {
    return [];
  }
}

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

/* ─── Page ─────────────────────────────────────────────────────────────────── */
export default async function LandingPage() {
  const [plans, businessTypes] = await Promise.all([
    fetchPlans(),
    fetchBusinessTypes(),
  ]);

  return <LandingClient plans={plans} businessTypes={businessTypes} />;
}
