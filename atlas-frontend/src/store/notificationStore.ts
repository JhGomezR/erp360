import { create } from 'zustand';

export interface AppNotification {
  id: number;
  type: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  read_at: string | null;
  created_at: string;
}

interface NotificationState {
  notifications: AppNotification[];
  unreadCount: number;
  pendingModal: AppNotification | null;

  addNotification: (n: AppNotification) => void;
  setNotifications: (list: AppNotification[], unreadCount: number) => void;
  markRead: (id: number) => void;
  markAllRead: () => void;
  incrementUnread: () => void;
  setPendingModal: (n: AppNotification | null) => void;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  notifications: [],
  unreadCount: 0,
  pendingModal: null,

  addNotification: (n) => {
    set((s) => ({
      notifications: [n, ...s.notifications].slice(0, 50),
      unreadCount: s.unreadCount + (n.read_at ? 0 : 1),
    }));
  },

  setNotifications: (list, unreadCount) => {
    set({ notifications: list, unreadCount });
  },

  markRead: (id) => {
    set((s) => ({
      notifications: s.notifications.map((n) =>
        n.id === id ? { ...n, read_at: new Date().toISOString() } : n
      ),
      unreadCount: Math.max(0, s.unreadCount - (get().notifications.find((n) => n.id === id && !n.read_at) ? 1 : 0)),
    }));
  },

  markAllRead: () => {
    set((s) => ({
      notifications: s.notifications.map((n) => ({
        ...n,
        read_at: n.read_at ?? new Date().toISOString(),
      })),
      unreadCount: 0,
    }));
  },

  incrementUnread: () => {
    set((s) => ({ unreadCount: s.unreadCount + 1 }));
  },

  setPendingModal: (n) => set({ pendingModal: n }),
}));
