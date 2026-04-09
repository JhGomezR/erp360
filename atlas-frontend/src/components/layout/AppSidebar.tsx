'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  ShoppingBag,
  BookOpen,
  Users,
  BarChart2,
  Settings,
  Truck,
  UtensilsCrossed,
  ChefHat,
  Store,
  Warehouse,
  DollarSign,
  Landmark,
  FileText,
  UserCog,
  CreditCard,
  Pill,
  Tags,
  Printer,
  Wrench,
  FileCheck,
  Banknote,
  TrendingUp,
  User,
  ClipboardCheck,
  FolderKanban,
  Factory,
  ArrowLeftRight,
  Truck as TruckIcon,
  Navigation,
  Shield,
  RefreshCw,
  Receipt,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import type { Tenant } from '@/types';
import { usePublicSettings } from '@/hooks/usePublicSettings';

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
  module?: string;
}

const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',      href: 'dashboard',  icon: LayoutDashboard },
  { label: 'Punto de Venta', href: 'pos',        icon: ShoppingCart,    module: 'pos' },
  { label: 'Mesas',          href: 'tables',     icon: UtensilsCrossed, module: 'tables' },
  { label: 'Cocina',         href: 'kitchen',    icon: ChefHat,         module: 'kitchen' },
  { label: 'Inventario',     href: 'inventory',  icon: Package,         module: 'inventory' },
  { label: 'Listas de precios', href: 'price-lists', icon: Tags,         module: 'inventory' },
  { label: 'Farmacia',       href: 'pharmacy',   icon: Pill,            module: 'pharmacy'  },
  { label: 'Almacén',        href: 'warehouse',  icon: Warehouse,       module: 'warehouse' },
  { label: 'Caja',           href: 'cash',       icon: Landmark,        module: 'pos' },
  { label: 'Ventas',         href: 'sales',      icon: FileText,        module: 'pos' },
  { label: 'Remisiones',    href: 'remisiones', icon: Truck,           module: 'pos' },
  { label: 'Compras',        href: 'purchases',  icon: ShoppingBag,     module: 'purchases' },
  { label: 'Proveedores',    href: 'suppliers',  icon: Truck,           module: 'purchases' },
  { label: 'Gastos',         href: 'expenses',   icon: DollarSign,      module: 'purchases' },
  { label: 'Clientes',       href: 'customers',  icon: Users,           module: 'customers' },
  { label: 'RRHH',           href: 'hrm',        icon: UserCog,         module: 'hrm' },
  { label: 'Portal Empleado', href: 'hrm-portal', icon: User,            module: 'hrm' },
  { label: 'Contabilidad',   href: 'accounting', icon: BookOpen,        module: 'accounting' },
  { label: 'Fact. Electrónica', href: 'dian',   icon: FileCheck,       module: 'accounting' },
  { label: 'Notas crédito',  href: 'accounting/credit-notes', icon: FileCheck, module: 'accounting' },
  { label: 'Doc. Soporte',   href: 'accounting/support-docs', icon: FileCheck, module: 'accounting' },
  { label: 'Cuentas de cobro', href: 'collection-accounts', icon: Banknote,  module: 'pos' },
  { label: 'Comisiones',      href: 'commissions',          icon: TrendingUp, module: 'pos' },
  { label: 'Referidos',       href: 'referrals',            icon: Users,      module: 'referrals' },
  { label: 'Reportes',       href: 'reports',    icon: BarChart2,       module: 'reports' },
  { label: 'E-commerce',     href: 'ecommerce',  icon: Store,           module: 'ecommerce' },
  { label: 'Taller',         href: 'workshop',   icon: Wrench,          module: 'workshop' },
  { label: 'Impresoras POS', href: 'printers',   icon: Printer,         module: 'pos' },
  { label: 'CRM',                   href: 'crm',     icon: TrendingUp, module: 'crm' },
  { label: 'Calidad',              href: 'quality',   icon: ClipboardCheck, module: 'quality' },
  { label: 'Proyectos',           href: 'projects',  icon: FolderKanban,   module: 'projects' },
  { label: 'MRP / Manufactura',  href: 'mrp',       icon: Factory,        module: 'manufacturing' },
  { label: 'Portal B2B',        href: 'b2b',       icon: Store,          module: 'b2b' },
  { label: 'Transferencias',    href: 'finance/transfers',      icon: ArrowLeftRight, module: 'finance' },
  { label: 'Aging CxC',        href: 'finance/aging',          icon: TrendingUp,     module: 'accounting' },
  { label: 'CxP / Pagos',     href: 'finance/payables',       icon: Receipt,        module: 'accounting' },
  { label: 'Flota',             href: 'fleet',                 icon: TruckIcon,      module: 'fleet' },
  { label: 'Supply Chain',     href: 'supply-chain',           icon: Navigation,     module: 'supply_chain' },
  { label: 'Mantenimiento',    href: 'maintenance',            icon: Wrench,         module: 'maintenance' },
  { label: 'ISO / NC',         href: 'quality/nc',             icon: Shield,         module: 'quality' },
  { label: 'Reposición',       href: 'inventory/replenishment',icon: RefreshCw,      module: 'inventory' },
  { label: 'Conciliación bancaria', href: 'banking', icon: Landmark },
  { label: 'Facturación',    href: 'billing',    icon: CreditCard },
  { label: 'Ajustes',        href: 'settings',   icon: Settings },
];

interface Props {
  tenant: Tenant;
  open: boolean;
  onClose: () => void;
}

export function AppSidebar({ tenant, open, onClose }: Props) {
  const pathname = usePathname();
  const { branding } = usePublicSettings();
  const activeModules = (tenant.plan?.modules ?? []) as string[];

  const isVisible = (item: NavItem) =>
    !item.module || activeModules.includes(item.module);

  const isActive = (href: string) =>
    pathname === `/${tenant.slug}/${href}` || pathname.startsWith(`/${tenant.slug}/${href}/`);

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-60 flex flex-col bg-sidebar border-r transition-transform duration-200',
          'lg:relative lg:translate-x-0 lg:z-auto',
          open ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        {/* Logo */}
        <div className="h-14 flex items-center px-4 border-b gap-3">
          <span className="text-xl font-black tracking-tight text-sidebar-primary">{branding.app_name}</span>
          <div className="flex-1" />
          <Button
            variant="ghost"
            size="icon-sm"
            className="lg:hidden"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-0.5">
          {NAV_ITEMS.filter(isVisible).map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                href={`/${tenant.slug}/${item.href}`}
                onClick={onClose}
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                )}
              >
                <Icon className="size-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t px-3 py-3">
          <p className="text-xs text-muted-foreground truncate">{tenant.name}</p>
          <p className="text-[10px] text-muted-foreground/60 capitalize">{tenant.plan?.name ?? tenant.status}</p>
        </div>
      </aside>
    </>
  );
}
