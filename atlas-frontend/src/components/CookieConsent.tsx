'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Cookie, X, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Versión actual de la política de cookies.
 * Actualizar este valor cuando se publique una nueva versión del documento
 * para forzar re-mostrar el banner a usuarios que ya habían aceptado.
 */
const COOKIE_POLICY_VERSION = '1.0';
const STORAGE_KEY = 'atlas-cookie-consent';

interface ConsentData {
  analytics: boolean;
  marketing: boolean;
  version: string;
  timestamp: string;
}

function getStoredConsent(): ConsentData | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: ConsentData = JSON.parse(raw);
    // Si la versión del documento cambió, ignorar el consentimiento previo
    if (parsed.version !== COOKIE_POLICY_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveConsent(analytics: boolean, marketing: boolean): void {
  const data: ConsentData = {
    analytics,
    marketing,
    version: COOKIE_POLICY_VERSION,
    timestamp: new Date().toISOString(),
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export default function CookieConsent() {
  const [visible, setVisible] = useState(false);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    // Solo mostrar en el cliente, después de hidratación
    const stored = getStoredConsent();
    if (!stored) setVisible(true);
  }, []);

  if (!visible) return null;

  const handleAcceptAll = () => {
    saveConsent(true, true);
    setVisible(false);
  };

  const handleNecessaryOnly = () => {
    saveConsent(false, false);
    setVisible(false);
  };

  return (
    <div
      className={cn(
        'fixed bottom-0 left-0 right-0 z-50',
        'animate-in slide-in-from-bottom duration-300'
      )}
    >
      <div className="bg-slate-900/95 backdrop-blur-sm border-t border-white/10 shadow-2xl">
        <div className="max-w-6xl mx-auto px-4 py-4">
          {!showDetails ? (
            /* Vista compacta */
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
              <div className="flex items-start gap-3 flex-1">
                <Cookie className="size-5 text-blue-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-slate-200">
                    Usamos cookies para mejorar tu experiencia en Atlas ERP.{' '}
                    <Link href="/legal/cookies" className="text-blue-400 hover:underline">
                      Política de Cookies
                    </Link>
                  </p>
                  <button
                    onClick={() => setShowDetails(true)}
                    className="text-xs text-slate-400 hover:text-slate-300 mt-0.5 underline"
                  >
                    Personalizar preferencias
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={handleNecessaryOnly}
                  className="px-4 py-2 text-sm text-slate-300 hover:text-white border border-white/20 rounded-lg hover:bg-white/5 transition-colors"
                >
                  Solo necesarias
                </button>
                <button
                  onClick={handleAcceptAll}
                  className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <Check className="size-3.5" />
                  Aceptar todas
                </button>
              </div>
            </div>
          ) : (
            /* Vista detallada */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Cookie className="size-4 text-blue-400" />
                  <span className="text-sm font-semibold text-white">Preferencias de cookies</span>
                </div>
                <button
                  onClick={() => setShowDetails(false)}
                  className="text-slate-400 hover:text-white"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="grid sm:grid-cols-3 gap-3 text-xs">
                {/* Necesarias — siempre activas */}
                <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-white">Necesarias</span>
                    <span className="text-green-400 text-xs">Siempre activas</span>
                  </div>
                  <p className="text-slate-400">Autenticación, seguridad y funcionamiento básico del sistema.</p>
                </div>

                {/* Analíticas */}
                <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-white">Analíticas</span>
                    <span className="text-slate-400">Opcionales</span>
                  </div>
                  <p className="text-slate-400">Métricas de uso para mejorar el producto.</p>
                </div>

                {/* Marketing */}
                <div className="bg-white/5 rounded-lg p-3 border border-white/10">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-white">Marketing</span>
                    <span className="text-slate-400">Opcionales</span>
                  </div>
                  <p className="text-slate-400">Personalización de contenido y comunicaciones.</p>
                </div>
              </div>

              <div className="flex items-center gap-2 justify-end">
                <button
                  onClick={handleNecessaryOnly}
                  className="px-4 py-2 text-sm text-slate-300 hover:text-white border border-white/20 rounded-lg hover:bg-white/5 transition-colors"
                >
                  Solo necesarias
                </button>
                <button
                  onClick={handleAcceptAll}
                  className="px-4 py-2 text-sm font-medium bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors flex items-center gap-1.5"
                >
                  <Check className="size-3.5" />
                  Aceptar todas
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
