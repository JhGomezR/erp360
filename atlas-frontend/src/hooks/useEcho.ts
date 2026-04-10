'use client';

import { useEffect, useRef, useState } from 'react';
import Echo from 'laravel-echo';
import Pusher from 'pusher-js';
import { getToken, getTenantToken } from '@/lib/api/axios';

// Make Pusher available globally (required by Laravel Echo)
if (typeof window !== 'undefined') {
  (window as unknown as Record<string, unknown>).Pusher = Pusher;
}

let echoInstance: Echo<'reverb'> | null = null;

function getEcho(): Echo<'reverb'> | null {
  if (typeof window === 'undefined') return null;

  // Aceptar token central O token de tenant.
  // En páginas de tenant (incógnito) solo existe atlas_tenant_token.
  // En páginas centrales solo existe atlas_token.
  // Sin ninguno de los dos → página pública, no conectar.
  const token = getToken() ?? getTenantToken();
  if (!token) return null;

  if (!echoInstance) {
    echoInstance = new Echo({
      broadcaster: 'reverb',
      key: process.env.NEXT_PUBLIC_REVERB_APP_KEY ?? '',
      wsHost: process.env.NEXT_PUBLIC_REVERB_HOST ?? 'atlaserp.com.co',
      wsPort: Number(process.env.NEXT_PUBLIC_REVERB_PORT ?? 443),
      wssPort: Number(process.env.NEXT_PUBLIC_REVERB_PORT ?? 443),
      forceTLS: (process.env.NEXT_PUBLIC_REVERB_SCHEME ?? 'https') === 'https',
      enabledTransports: ['ws', 'wss'],
      authEndpoint: `${process.env.NEXT_PUBLIC_API_URL ?? 'https://atlaserp.com.co/api'}/broadcasting/auth`,
      auth: {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
      },
    });
  }
  return echoInstance;
}

export function destroyEcho() {
  if (echoInstance) {
    echoInstance.disconnect();
    echoInstance = null;
  }
}

// ─── Estado de conexión WebSocket (exportado para fallback de polling) ─────────

type ConnectionState = 'connected' | 'connecting' | 'disconnected';

let connectionState: ConnectionState = 'disconnected';
const stateListeners = new Set<(s: ConnectionState) => void>();

function notifyStateListeners(s: ConnectionState) {
  connectionState = s;
  stateListeners.forEach((fn) => fn(s));
}

/** Hook que expone el estado actual del WebSocket (connected / connecting / disconnected) */
export function useEchoConnectionState(): ConnectionState {
  const [state, setState] = useState<ConnectionState>(connectionState);

  useEffect(() => {
    setState(connectionState);
    stateListeners.add(setState);

    // Registrar listeners de Pusher una sola vez
    const echo = getEcho();
    if (echo) {
      const socket = (echo.connector as unknown as { pusher: { connection: { bind: (e: string, cb: () => void) => void; state: string } } })?.pusher?.connection;
      if (socket) {
        socket.bind('connected',     () => notifyStateListeners('connected'));
        socket.bind('connecting',    () => notifyStateListeners('connecting'));
        socket.bind('disconnected',  () => notifyStateListeners('disconnected'));
        socket.bind('unavailable',   () => notifyStateListeners('disconnected'));
        socket.bind('failed',        () => notifyStateListeners('disconnected'));

        // Sincronizar estado actual: Pusher puede haber conectado antes de que
        // este listener se registrara, perdiendo el evento 'connected'.
        const current = socket.state;
        if (current === 'connected') notifyStateListeners('connected');
        else if (current === 'connecting') notifyStateListeners('connecting');
      }
    }

    return () => {
      stateListeners.delete(setState);
    };
  }, []);

  return state;
}

// ─── Hook de suscripción a canal ─────────────────────────────────────────────

type EchoCallback = (data: unknown) => void;

export function useEchoChannel(channel: string, event: string, callback: EchoCallback) {
  const cbRef = useRef(callback);
  cbRef.current = callback;

  useEffect(() => {
    const echo = getEcho();
    if (!echo || !channel) return;

    const ch = echo.channel(channel);
    ch.listen(event, (data: unknown) => cbRef.current(data));

    return () => {
      echo.leaveChannel(channel);
    };
  }, [channel, event]);
}
