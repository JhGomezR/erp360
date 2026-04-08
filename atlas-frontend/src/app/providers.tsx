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
    // suppressHydrationWarning cubre el <script> que next-themes v0.4 inyecta
    // para persistir el tema antes de la hidratación (comportamiento esperado).
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        {children}
        <ClientToaster />
      </QueryClientProvider>
    </ThemeProvider>
  );
}
