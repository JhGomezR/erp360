'use client';

import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useEchoChannel, useEchoConnectionState } from './useEcho';
import { notificationsApi } from '@/lib/api/tenant.api';
import { useNotificationStore, type AppNotification } from '@/store/notificationStore';
import { playNotificationSound } from '@/lib/notificationSound';

export function useNotifications(tenantSlug: string) {
  const qc = useQueryClient();
  const wsState = useEchoConnectionState();
  const isConnected = wsState === 'connected';

  const {
    setNotifications,
    addNotification,
    markAllRead: storeMarkAllRead,
    setPendingModal,
  } = useNotificationStore();

  // Cargar notificaciones iniciales + polling cuando WebSocket está caído
  const { data } = useQuery({
    queryKey: ['notifications', tenantSlug],
    queryFn: async () => {
      const [listRes, countRes] = await Promise.all([
        notificationsApi.list({ per_page: 30 }),
        notificationsApi.unreadCount(),
      ]);
      return {
        list: (listRes.data as { data: AppNotification[] }).data ?? [],
        unread: (countRes.data as unknown as { unread: number }).unread ?? 0,
      };
    },
    enabled: !!tenantSlug,
    staleTime: 30_000,
    // Cuando WebSocket está caído, hacer polling cada 30 s para compensar
    refetchInterval: isConnected ? false : 30_000,
  });

  // Sincronizar store con los datos del servidor (polling o carga inicial)
  // Los toasts solo se muestran desde el WebSocket para evitar duplicados.
  useEffect(() => {
    if (!data?.list) return;
    setNotifications(data.list, data.unread);
  }, [data, setNotifications]);

  // Real-time via Reverb
  useEchoChannel(
    `notifications.${tenantSlug}`,
    '.new-notification',
    (payload: unknown) => {
      const n = payload as AppNotification;
      addNotification(n);
      qc.invalidateQueries({ queryKey: ['notifications', tenantSlug] });

      const displayType = (n.data as Record<string, unknown> | undefined)?.display_type ?? 'toast';

      const notifType = n.type as 'info' | 'warning' | 'billing' | 'system';
      playNotificationSound(notifType);

      if (displayType === 'modal') {
        // Ventana emergente — el componente NotificationModalPopup lo muestra
        setPendingModal(n);
      } else {
        // Toast con color según el tipo de notificación
        const toastOptions = { description: n.body, duration: 6000 };
        if (n.type === 'warning' || n.type === 'billing') {
          toast.warning(n.title, toastOptions);
        } else if (n.type === 'system') {
          toast.message(n.title, toastOptions);
        } else {
          toast.info(n.title, toastOptions);
        }
      }
    }
  );

  // Marcar una como leída
  const markRead = useMutation({
    mutationFn: (id: number) => notificationsApi.markRead(id),
    onSuccess: (_, id) => {
      useNotificationStore.getState().markRead(id);
    },
  });

  // Marcar todas como leídas
  const markAllRead = useMutation({
    mutationFn: () => notificationsApi.markAllRead(),
    onSuccess: () => {
      storeMarkAllRead();
    },
  });

  return { markRead: markRead.mutate, markAllRead: markAllRead.mutate };
}
