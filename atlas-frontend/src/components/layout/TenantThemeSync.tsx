'use client';

import { useEffect } from 'react';
import { useTheme } from 'next-themes';

/**
 * Sincroniza el tema claro/oscuro por slug de tenant.
 * Cada tenant/usuario tiene su preferencia independiente almacenada
 * en localStorage bajo la clave `atlas_theme_<slug>`.
 *
 * Colocar este componente dentro del layout del tenant app.
 */
export function TenantThemeSync({ slug }: { slug: string }) {
  const { setTheme, resolvedTheme } = useTheme();
  const storageKey = `atlas_theme_${slug}`;

  // Al entrar al tenant: restaurar su tema guardado
  useEffect(() => {
    if (!slug) return;
    const saved = localStorage.getItem(storageKey);
    if (saved === 'dark' || saved === 'light') {
      setTheme(saved);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Al cambiar el tema: persistir para este tenant específico
  useEffect(() => {
    if (!slug || !resolvedTheme) return;
    localStorage.setItem(storageKey, resolvedTheme);
  }, [resolvedTheme, slug, storageKey]);

  return null;
}
