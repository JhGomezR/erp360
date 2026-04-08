'use client';

import { LogOut, User, ChevronDown, Moon, Sun } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { NotificationBell } from './NotificationBell';
import { useAuthStore } from '@/store/authStore';
import { authApi } from '@/lib/api/central.api';
import { destroyEcho } from '@/hooks/useEcho';

interface Props {
  tenantName: string;
  tenantSlug: string;
}

export function Topbar({ tenantName, tenantSlug }: Props) {
  const router = useRouter();
  const { user, tenants, logout } = useAuthStore();
  const { resolvedTheme, setTheme } = useTheme();

  const initials = user?.name
    ? user.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : '?';

  const handleLogout = async () => {
    try { await authApi.logout(); } catch { /* ignore */ }
    destroyEcho();
    logout();
    router.push('/login');
  };

  const handleSwitchTenant = (slug: string) => {
    router.push(`/${slug}/dashboard`);
  };

  return (
    <header className="h-14 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 flex items-center px-4 gap-3 sticky top-0 z-30">
      {/* Tenant name */}
      <span className="text-sm font-semibold text-foreground hidden sm:block truncate max-w-xs">
        {tenantName}
      </span>

      <div className="flex-1" />

      {/* Dark mode toggle */}
      <Button
        variant="ghost"
        size="icon"
        aria-label="Cambiar tema"
        onClick={() => setTheme(resolvedTheme === 'dark' ? 'light' : 'dark')}
      >
        {resolvedTheme === 'dark' ? <Sun className="size-4" /> : <Moon className="size-4" />}
      </Button>

      {/* Notifications */}
      <NotificationBell tenantSlug={tenantSlug} />

      {/* User menu */}
      <DropdownMenu>
        <DropdownMenuTrigger render={<Button variant="ghost" size="sm" className="gap-2" />}>
          <Avatar size="sm">
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
          <span className="hidden sm:block max-w-[120px] truncate text-sm">
            {user?.name}
          </span>
          <ChevronDown className="size-3 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel className="font-normal">
            <p className="text-sm font-medium">{user?.name}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </DropdownMenuLabel>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={() => router.push('/profile')}>
            <User className="size-4 mr-2" />
            Mi perfil
          </DropdownMenuItem>

          {tenants.length > 1 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Cambiar negocio</DropdownMenuLabel>
              {tenants.map((t) => (
                <DropdownMenuItem
                  key={t.id}
                  onClick={() => handleSwitchTenant(t.slug)}
                  disabled={t.slug === tenantSlug}
                >
                  {t.name}
                </DropdownMenuItem>
              ))}
            </>
          )}

          <DropdownMenuSeparator />

          <DropdownMenuItem variant="destructive" onClick={handleLogout}>
            <LogOut className="size-4 mr-2" />
            Cerrar sesión
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
