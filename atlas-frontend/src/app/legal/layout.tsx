import type { Metadata } from 'next';
import LegalSidebar from './_components/LegalSidebar';

export const metadata: Metadata = {
  title: 'Documentos Legales — Atlas ERP',
  description: 'Términos, privacidad, reembolso, cookies y contratos de Atlas ERP.',
};

export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 to-slate-800">
      <div className="max-w-6xl mx-auto px-4 py-12">
        <div className="flex gap-12">
          {/* Sidebar de navegación — fijo en desktop */}
          <div className="hidden lg:block sticky top-12 self-start">
            <LegalSidebar />
          </div>

          {/* Navegación móvil */}
          <div className="lg:hidden w-full mb-6">
            <LegalSidebar />
          </div>

          {/* Contenido principal */}
          <main className="flex-1 min-w-0">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
