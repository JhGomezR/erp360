'use client';

import { Bell, Info, AlertTriangle, CreditCard, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useNotificationStore, type AppNotification } from '@/store/notificationStore';
import { useNotifications } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';

function NotifIcon({ type }: { type: string }) {
  if (type === 'warning')  return <AlertTriangle className="size-3.5 shrink-0 text-orange-500" />;
  if (type === 'billing')  return <CreditCard    className="size-3.5 shrink-0 text-orange-400" />;
  if (type === 'system')   return <Settings      className="size-3.5 shrink-0 text-muted-foreground" />;
  return                          <Info          className="size-3.5 shrink-0 text-blue-500" />;
}

function notifAccent(type: string) {
  if (type === 'warning' || type === 'billing') return 'border-l-2 border-l-orange-400';
  if (type === 'system') return 'border-l-2 border-l-muted-foreground/40';
  return 'border-l-2 border-l-blue-400';
}

interface Props {
  tenantSlug: string;
}

export function NotificationBell({ tenantSlug }: Props) {
  const { notifications, unreadCount } = useNotificationStore();
  const { markRead, markAllRead } = useNotifications(tenantSlug);

  const recent = notifications.slice(0, 8);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={<Button variant="ghost" size="icon" className="relative" aria-label="Notificaciones" />}>
        <Bell className="size-4" />
        {unreadCount > 0 && (
          <Badge
            className="absolute -top-1 -right-1 size-4 p-0 flex items-center justify-center text-[10px] leading-none"
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </Badge>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="flex items-center justify-between px-1.5 py-1">
          <DropdownMenuLabel className="p-0 text-sm font-semibold">
            Notificaciones
          </DropdownMenuLabel>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllRead()}
              className="text-xs text-primary hover:underline"
            >
              Marcar todas leídas
            </button>
          )}
        </div>
        <DropdownMenuSeparator />
        {recent.length === 0 ? (
          <div className="py-6 text-center text-sm text-muted-foreground">
            Sin notificaciones
          </div>
        ) : (
          recent.map((n) => (
            <DropdownMenuItem
              key={n.id}
              onClick={() => !n.read_at && markRead(n.id)}
              className={cn(
                'flex items-start gap-2 py-2 pl-2',
                !n.read_at && 'bg-primary/5',
                notifAccent(n.type),
              )}
            >
              <NotifIcon type={n.type} />
              <div className="min-w-0">
                <p className="text-sm font-medium leading-tight">{n.title}</p>
                <p className="text-xs text-muted-foreground line-clamp-2">{n.body}</p>
              </div>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
