import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Iniciar sesión — Atlas ERP',
  description: 'Accede a tu cuenta de Atlas ERP. Gestiona ventas, inventario y finanzas de tu negocio.',
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
