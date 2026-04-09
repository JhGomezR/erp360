'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useState, useEffect } from 'react';
import { Toaster } from '@/components/ui/sonner';

/**
 * Monta el Toaster solo en el cliente para evitar el hydration mismatch
 * causado por sonner v2 que renderiza un <section aria-live> diferente en SSR.
 */
function ClientToaster() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);
  if (!mounted) return null;
  return <Toaster richColors position="top-right" />;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            retry: 1,
          },
        },
      })
  );

  return (
    // next-themes 0.4.x inyecta un <script> para persistir el tema antes de hidratación.
    // React 19 emite un warning sobre esto — es comportamiento conocido/esperado del paquete.
    // suppressHydrationWarning en <html> (layout.tsx) suprime el mismatch de hidratación.
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="atlas-theme"
    >
      <QueryClientProvider client={queryClient}>
        {children}
        <ClientToaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
