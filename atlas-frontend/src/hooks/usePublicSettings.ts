import { useQuery } from '@tanstack/react-query';
import { publicSettingsApi, type PublicBranding, type PublicTrial } from '@/lib/api/central.api';

export interface PublicSecurity {
  idle_timeout: number;    // minutos
  session_timeout: number; // minutos
}

const DEFAULT_BRANDING: PublicBranding = {
  login_bg_type: 'gradient',
  login_bg_value: 'from-slate-900 to-slate-800',
  login_bg_image: '',
  login_bg_color: '#0f172a',
  app_name: 'Atlas',
  logo_url: '',
};

const DEFAULT_TRIAL: PublicTrial = { days: 14, card_required: false };
const DEFAULT_SECURITY: PublicSecurity = { idle_timeout: 30, session_timeout: 60 };

export function usePublicSettings() {
  const { data } = useQuery({
    queryKey: ['public-settings'],
    queryFn: () => publicSettingsApi.get().then((r) => r.data),
    staleTime: 5 * 60 * 1000, // 5 min
    retry: false,
  });

  return {
    branding:  data?.branding  ?? DEFAULT_BRANDING,
    trial:     data?.trial     ?? DEFAULT_TRIAL,
    security:  data?.security  ?? DEFAULT_SECURITY,
  };
}

/** Genera el className/style para el fondo del login según la config */
export function useBgStyle(branding: PublicBranding): {
  className: string;
  style: React.CSSProperties;
} {
  if (branding.login_bg_type === 'gradient') {
    return {
      className: `bg-gradient-to-br ${branding.login_bg_value}`,
      style: {},
    };
  }
  if (branding.login_bg_type === 'color') {
    return {
      className: '',
      style: { backgroundColor: branding.login_bg_color },
    };
  }
  if (branding.login_bg_type === 'image' && branding.login_bg_image) {
    return {
      className: '',
      style: {
        backgroundImage: `url(${branding.login_bg_image})`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
      },
    };
  }
  // Fallback
  return {
    className: 'bg-gradient-to-br from-slate-900 to-slate-800',
    style: {},
  };
}
