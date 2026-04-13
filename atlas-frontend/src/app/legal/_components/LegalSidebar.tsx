'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FileText, Shield, RefreshCw, Cookie, FileSignature } from 'lucide-react';
import { cn } from '@/lib/utils';

const NAV_ITEMS = [
  { type: 'terms',    label: 'Términos y Condiciones',        icon: FileText,      href: '/legal/terms' },
  { type: 'privacy',  label: 'Política de Privacidad',        icon: Shield,        href: '/legal/privacy' },
  { type: 'refund',   label: 'Política de Reembolso',         icon: RefreshCw,     href: '/legal/refund' },
  { type: 'cookies',  label: 'Política de Cookies',           icon: Cookie,        href: '/legal/cookies' },
  { type: 'contract', label: 'Contrato de Servicio',          icon: FileSignature, href: '/legal/contract' },
];

export default function LegalSidebar() {
  const pathname = usePathname();

  return (
    <aside className="w-64 shrink-0">
      {/* Logo */}
      <div className="mb-8">
        <Link href="/" className="text-2xl font-black tracking-tight text-white hover:text-blue-400 transition-colors">
          Atlas
        </Link>
        <p className="text-slate-400 text-xs mt-1">Documentos Legales</p>
      </div>

      {/* Navegación vertical */}
      <nav className="space-y-1">
        {NAV_ITEMS.map(({ type, label, icon: Icon, href }) => {
          const isActive = pathname === href || pathname.startsWith(href + '/');
          return (
            <Link
              key={type}
              href={href}
              className={cn(
                'flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all',
                isActive
                  ? 'bg-blue-600/20 border border-blue-500/30 text-blue-300'
                  : 'text-slate-400 hover:bg-white/5 hover:text-white border border-transparent'
              )}
            >
              <Icon className="size-4 shrink-0" />
              <span className="leading-tight">{label}</span>
            </Link>
          );
        })}
      </nav>

      {/* Footer del sidebar */}
      <div className="mt-10 pt-6 border-t border-white/10">
        <p className="text-slate-500 text-xs">
          ¿Preguntas?{' '}
          <a href="mailto:soporte@atlaserp.com.co" className="text-blue-400 hover:underline">
            Contáctanos
          </a>
        </p>
      </div>
    </aside>
  );
}
