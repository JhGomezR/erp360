'use client';

import { useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@/lib/api/central.api';

/**
 * Cierra la sesión automáticamente si el usuario permanece inactivo
 * durante `idleMinutes` minutos.
 *
 * Eventos que reinician el timer: mousemove, keydown, pointerdown, scroll, touchstart.
 *
 * Uso: montar en el layout del panel (admin o tenant) que requiera sesión activa.
 */
export function useIdleTimeout(idleMinutes: number) {
  const router   = useRouter();
  const { logout, isAuthenticated } = useAuthStore();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Guardar idleMinutes en ref para que el handler de eventos siempre
  // acceda al valor actual sin re-registrar listeners en cada cambio.
  const idleMinutesRef = useRef(idleMinutes);
  useEffect(() => { idleMinutesRef.current = idleMinutes; }, [idleMinutes]);

  const doLogout = useCallback(async () => {
    try { await authApi.logout(); } catch { /* ignorar error de red en logout por inactividad */ }
    logout();
    router.replace('/login');
  }, [logout, router]);

  // Guardar doLogout en ref para que resetTimer no cambie de identidad
  const doLogoutRef = useRef(doLogout);
  useEffect(() => { doLogoutRef.current = doLogout; }, [doLogout]);

  const resetTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!isAuthenticated()) return;
    timerRef.current = setTimeout(
      () => doLogoutRef.current(),
      idleMinutesRef.current * 60 * 1000,
    );
  }, [isAuthenticated]); // isAuthenticated es estable en Zustand; no depende de idleMinutes/doLogout

  useEffect(() => {
    if (idleMinutes <= 0) return;

    const EVENTS = ['mousemove', 'keydown', 'pointerdown', 'scroll', 'touchstart'] as const;

    EVENTS.forEach((ev) => window.addEventListener(ev, resetTimer, { passive: true }));
    resetTimer(); // inicia el primer timer

    return () => {
      EVENTS.forEach((ev) => window.removeEventListener(ev, resetTimer));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  // resetTimer es estable (solo depende de isAuthenticated); idleMinutes solo afecta
  // si el hook debe activarse o no (≤0 = desactivado). Al cambiar idleMinutes el
  // effect re-corre limpiando correctamente el timer anterior.
  }, [idleMinutes, resetTimer]);
}
