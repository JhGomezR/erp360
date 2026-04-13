import { notFound } from 'next/navigation';
import type { Metadata } from 'next';
import type { LegalDocument } from '@/types';
import LegalContent from '../_components/LegalContent';

const VALID_TYPES = ['terms', 'privacy', 'refund', 'cookies', 'contract'] as const;
type LegalType = typeof VALID_TYPES[number];

const TYPE_TITLES: Record<LegalType, string> = {
  terms:    'Términos y Condiciones',
  privacy:  'Política de Tratamiento de Datos',
  refund:   'Política de Reembolso',
  cookies:  'Política de Cookies',
  contract: 'Contrato de Servicio',
};

async function fetchDocument(type: string): Promise<LegalDocument | null> {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL ?? process.env.API_URL;

  try {
    const res = await fetch(`${apiUrl}/legal/${type}/es`, {
      next: { revalidate: 3600 }, // ISR: revalida cada hora
    });

    if (!res.ok) return null;
    return res.json() as Promise<LegalDocument>;
  } catch {
    return null;
  }
}

// Pre-renderiza los 5 tipos en build time
export function generateStaticParams() {
  return VALID_TYPES.map((type) => ({ type }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ type: string }> }
): Promise<Metadata> {
  const { type } = await params;
  const title = TYPE_TITLES[type as LegalType] ?? 'Documento Legal';
  return {
    title: `${title} — Atlas ERP`,
    description: `${title} de Atlas ERP. Consulta nuestras condiciones y políticas.`,
  };
}

export default async function LegalPage(
  { params }: { params: Promise<{ type: string }> }
) {
  const { type } = await params;

  // Validar que el tipo sea conocido — si no, 404 inmediato
  if (!VALID_TYPES.includes(type as LegalType)) {
    notFound();
  }

  const document = await fetchDocument(type);

  if (!document) {
    return (
      <div className="py-16 text-center">
        <p className="text-slate-400 text-sm">
          Este documento aún no está disponible. Pronto lo publicaremos.
        </p>
      </div>
    );
  }

  return <LegalContent document={document} />;
}
