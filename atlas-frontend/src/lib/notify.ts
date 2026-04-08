import { toast } from 'sonner';

// Laravel API error shape
interface ApiError {
  response?: {
    status?: number;
    data?: {
      message?: string;
      errors?: Record<string, string[]>;
    };
  };
}

/** Extract a clean user-facing message from a Laravel API error */
export function parseApiError(err: unknown, fallback = 'Ocurrió un error inesperado'): string {
  const e = err as ApiError;
  const data = e?.response?.data;
  const status = e?.response?.status;

  // Sin respuesta del servidor — error de red o CORS
  if (!e?.response) {
    const msg = (err as { message?: string })?.message ?? '';
    if (msg.toLowerCase().includes('network') || msg.toLowerCase().includes('failed')) {
      return 'No se pudo conectar con el servidor. Verifica tu conexión a internet.';
    }
    if (msg) return msg;
    return fallback;
  }

  // Laravel validation errors — muestra todos los mensajes de campo
  if (data?.errors) {
    const messages = Object.values(data.errors).flat();
    if (messages.length > 0) return messages.join('\n');
  }

  // Laravel message field
  if (data?.message) return data.message;

  // HTTP status fallbacks
  if (status === 401) return 'Sesión expirada. Por favor inicia sesión nuevamente.';
  if (status === 403) return 'No tienes permiso para realizar esta acción.';
  if (status === 404) return 'El recurso solicitado no fue encontrado.';
  if (status === 422) return 'Los datos enviados no son válidos. Revisa el formulario.';
  if (status === 429) return 'Demasiadas solicitudes. Espera un momento antes de intentar de nuevo.';
  if (status === 500) return 'Error interno del servidor. Nuestro equipo fue notificado.';
  if (status === 503) return 'El servicio no está disponible en este momento. Intenta más tarde.';

  return fallback;
}

/** Extract field-level errors from a Laravel validation error response */
export function parseFieldErrors(err: unknown): Record<string, string> {
  const e = err as ApiError;
  const errors = e?.response?.data?.errors ?? {};
  const result: Record<string, string> = {};
  for (const [field, messages] of Object.entries(errors)) {
    result[field] = Array.isArray(messages) ? messages[0] : String(messages);
  }
  return result;
}

// ─── Notify helpers ───────────────────────────────────────────────────────────

export const notify = {
  /** Verde — operación completada exitosamente */
  success: (message: string, description?: string) =>
    toast.success(message, { description }),

  /** Rojo — error o acción bloqueada */
  error: (err: unknown, fallback?: string) => {
    const message = typeof err === 'string' ? err : parseApiError(err, fallback);
    toast.error(message);
  },

  /** Amarillo — advertencia, precaución */
  warning: (message: string, description?: string) =>
    toast.warning(message, { description }),

  /** Azul — información neutral, consejo */
  info: (message: string, description?: string) =>
    toast.info(message, { description }),

  /** Carga con promise — útil para acciones async */
  promise: <T,>(
    fn: Promise<T>,
    messages: { loading: string; success: string; error?: string }
  ) =>
    toast.promise(fn, {
      loading: messages.loading,
      success: messages.success,
      error: (err) => parseApiError(err, messages.error ?? 'Error al procesar la solicitud'),
    }),
};
