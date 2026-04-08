type NotifType = 'info' | 'warning' | 'billing' | 'system';

const SOUND_MAP: Record<NotifType, string> = {
  info:    '/sounds/notify-info.wav',
  warning: '/sounds/notify-warning.wav',
  billing: '/sounds/notify-warning.wav',
  system:  '/sounds/notify-system.wav',
};

export function playNotificationSound(type: NotifType = 'info'): void {
  if (typeof window === 'undefined') return;
  try {
    const audio = new Audio(SOUND_MAP[type] ?? SOUND_MAP.info);
    audio.volume = 0.6;
    audio.play().catch(() => { /* autoplay bloqueado — falla silenciosamente */ });
  } catch {
    // Audio no disponible
  }
}
