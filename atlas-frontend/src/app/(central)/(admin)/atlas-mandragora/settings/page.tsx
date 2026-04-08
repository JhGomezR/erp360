'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notify } from '@/lib/notify';
import { systemParamsApi } from '@/lib/api/central.api';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Paintbrush, Clock, Save, Eye, Shield, Timer } from 'lucide-react';
import { ImageUpload } from '@/components/ui/image-upload';

// ─── Types ────────────────────────────────────────────────────────────────────

type BgType = 'gradient' | 'color' | 'image';

interface BrandingForm {
  app_name: string;
  logo_url: string;
  login_bg_type: BgType;
  login_bg_value: string;
  login_bg_color: string;
  login_bg_image: string;
}

interface TrialForm {
  days: string;
  card_required: string;
}

interface SecurityForm {
  session_timeout: string;
  idle_timeout: string;
  max_login_attempts: string;
  lockout_minutes: string;
}

// ─── Gradient options ─────────────────────────────────────────────────────────

const GRADIENTS = [
  { label: 'Slate Oscuro (por defecto)', value: 'from-slate-900 to-slate-800' },
  { label: 'Azul profundo', value: 'from-blue-950 to-blue-900' },
  { label: 'Verde esmeralda', value: 'from-emerald-950 to-emerald-800' },
  { label: 'Púrpura', value: 'from-purple-950 to-purple-800' },
  { label: 'Gris grafito', value: 'from-gray-900 to-gray-700' },
  { label: 'Naranja cálido', value: 'from-orange-950 to-orange-800' },
  { label: 'Rosa oscuro', value: 'from-rose-950 to-rose-900' },
  { label: 'Azul cielo', value: 'from-sky-900 to-sky-700' },
];

// ─── Background preview ───────────────────────────────────────────────────────

function BgPreview({ type, value, color, image }: { type: BgType; value: string; color: string; image: string }) {
  let style: React.CSSProperties = {};
  let className = 'w-full h-28 rounded-lg border flex items-center justify-center text-white text-xs font-medium';

  if (type === 'gradient') {
    className += ` bg-gradient-to-br ${value}`;
  } else if (type === 'color') {
    style = { backgroundColor: color };
  } else if (type === 'image' && image) {
    style = {
      backgroundImage: `url(${image})`,
      backgroundSize: 'cover',
      backgroundPosition: 'center',
    };
  } else {
    className += ' bg-muted';
  }

  return (
    <div className={className} style={style}>
      <div className="bg-black/40 px-3 py-1 rounded text-xs">Vista previa del fondo</div>
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const queryClient = useQueryClient();

  // ── Load current params ──────────────────────────────────────────────────
  const { data: paramsData, isLoading } = useQuery({
    queryKey: ['system-params-settings'],
    queryFn: async () => {
      const [branding, trial, security] = await Promise.all([
        systemParamsApi.list('branding').then((r) => r.data as Record<string, { value: string; key: string }[]>),
        systemParamsApi.list('trial').then((r) => r.data as Record<string, { value: string; key: string }[]>),
        systemParamsApi.list('security').then((r) => r.data as Record<string, { value: string; key: string }[]>),
      ]);
      return { branding, trial, security };
    },
  });

  const extractVal = (group: Record<string, { value: string; key: string }[]> | undefined, suffix: string): string => {
    if (!group) return '';
    const entries = Object.values(group).flat();
    const found = entries.find((e) => e.key?.endsWith(suffix) || e.key === suffix);
    return found?.value ?? '';
  };

  // ── Branding form state ───────────────────────────────────────────────────
  const [branding, setBranding] = useState<BrandingForm>({
    app_name: 'Atlas',
    logo_url: '',
    login_bg_type: 'gradient',
    login_bg_value: 'from-slate-900 to-slate-800',
    login_bg_color: '#0f172a',
    login_bg_image: '',
  });

  // ── Trial form state ──────────────────────────────────────────────────────
  const [trial, setTrial] = useState<TrialForm>({ days: '14', card_required: 'false' });

  // ── Security form state ───────────────────────────────────────────────────
  const [security, setSecurity] = useState<SecurityForm>({
    session_timeout: '60',
    idle_timeout: '30',
    max_login_attempts: '5',
    lockout_minutes: '15',
  });

  useEffect(() => {
    if (!paramsData) return;
    const b = paramsData.branding;
    const t = paramsData.trial;
    setBranding({
      app_name:        extractVal(b, 'branding.app_name')      || 'Atlas',
      logo_url:        extractVal(b, 'branding.logo_url')      || '',
      login_bg_type:   (extractVal(b, 'branding.login_bg_type') as BgType) || 'gradient',
      login_bg_value:  extractVal(b, 'branding.login_bg_value') || 'from-slate-900 to-slate-800',
      login_bg_color:  extractVal(b, 'branding.login_bg_color') || '#0f172a',
      login_bg_image:  extractVal(b, 'branding.login_bg_image') || '',
    });
    setTrial({
      days:          extractVal(t, 'trial.days')          || '14',
      card_required: extractVal(t, 'trial.card_required') || 'false',
    });

    const s = paramsData.security ?? {};
    setSecurity({
      session_timeout:    extractVal(s as Record<string, { value: string; key: string }[]>, 'security.session_timeout')    || '60',
      idle_timeout:       extractVal(s as Record<string, { value: string; key: string }[]>, 'security.idle_timeout')       || '30',
      max_login_attempts: extractVal(s as Record<string, { value: string; key: string }[]>, 'security.max_login_attempts') || '5',
      lockout_minutes:    extractVal(s as Record<string, { value: string; key: string }[]>, 'security.lockout_minutes')    || '15',
    });
  }, [paramsData]);

  // ── Save mutations ────────────────────────────────────────────────────────
  const saveBrandingMutation = useMutation({
    mutationFn: () =>
      systemParamsApi.update([
        { key: 'branding.app_name',      value: branding.app_name },
        { key: 'branding.logo_url',      value: branding.logo_url },
        { key: 'branding.login_bg_type', value: branding.login_bg_type },
        { key: 'branding.login_bg_value',value: branding.login_bg_value },
        { key: 'branding.login_bg_color',value: branding.login_bg_color },
        { key: 'branding.login_bg_image',value: branding.login_bg_image },
      ]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-params-settings'] });
      notify.success('Configuración de branding guardada');
    },
    onError: (err) => notify.error(err, 'Error al guardar branding'),
  });

  const saveTrialMutation = useMutation({
    mutationFn: () =>
      systemParamsApi.update([
        { key: 'trial.days',          value: Number(trial.days) },
        { key: 'trial.card_required', value: trial.card_required === 'true' },
      ]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-params-settings'] });
      notify.success('Configuración de prueba gratuita guardada');
    },
    onError: (err) => notify.error(err, 'Error al guardar configuración de trial'),
  });

  const saveSecurityMutation = useMutation({
    mutationFn: () =>
      systemParamsApi.update([
        { key: 'security.session_timeout',    value: Number(security.session_timeout) },
        { key: 'security.idle_timeout',       value: Number(security.idle_timeout) },
        { key: 'security.max_login_attempts', value: Number(security.max_login_attempts) },
        { key: 'security.lockout_minutes',    value: Number(security.lockout_minutes) },
      ]),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-params-settings', 'public-settings'] });
      notify.success('Configuración de seguridad guardada');
    },
    onError: (err) => notify.error(err, 'Error al guardar configuración de seguridad'),
  });

  if (isLoading) {
    return (
      <div className="space-y-4 max-w-3xl animate-pulse">
        <div className="h-8 bg-muted rounded w-48" />
        <div className="h-64 bg-muted rounded-xl" />
        <div className="h-40 bg-muted rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold">Configuración</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Personaliza la apariencia y los parámetros globales de la plataforma.
        </p>
      </div>

      {/* ── Branding ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Paintbrush className="h-4 w-4" />
            Branding & Apariencia del Login
          </CardTitle>
          <CardDescription>
            Configura el fondo y la identidad visual de las páginas de acceso.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* App name */}
          <div className="space-y-1.5">
            <Label>Nombre de la aplicación</Label>
            <Input
              value={branding.app_name}
              onChange={(e) => setBranding((p) => ({ ...p, app_name: e.target.value }))}
              placeholder="Atlas"
              className="max-w-xs"
            />
          </div>

          {/* Logo upload */}
          <div className="space-y-1.5">
            <Label>Logo de la plataforma <span className="text-xs text-muted-foreground">(opcional)</span></Label>
            <ImageUpload
              value={branding.logo_url}
              onChange={(url) => setBranding((p) => ({ ...p, logo_url: url }))}
              category="branding"
              label="Sube el logo (se mostrará en la página de login)"
              className="max-w-sm"
            />
          </div>

          {/* Background type */}
          <div className="space-y-1.5">
            <Label>Tipo de fondo del login</Label>
            <div className="flex gap-2 flex-wrap">
              {(['gradient', 'color', 'image'] as BgType[]).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setBranding((p) => ({ ...p, login_bg_type: t }))}
                  className={`px-4 py-1.5 rounded-full text-sm border font-medium transition-colors ${
                    branding.login_bg_type === t
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {t === 'gradient' ? 'Degradado' : t === 'color' ? 'Color sólido' : 'Imagen'}
                </button>
              ))}
            </div>
          </div>

          {/* Gradient picker */}
          {branding.login_bg_type === 'gradient' && (
            <div className="space-y-1.5">
              <Label>Degradado</Label>
              <Select
                value={branding.login_bg_value}
                onValueChange={(v) => v && setBranding((p) => ({ ...p, login_bg_value: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {GRADIENTS.map((g) => (
                    <SelectItem key={g.value} value={g.value}>
                      {g.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Color picker */}
          {branding.login_bg_type === 'color' && (
            <div className="space-y-1.5">
              <Label>Color de fondo</Label>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={branding.login_bg_color}
                  onChange={(e) => setBranding((p) => ({ ...p, login_bg_color: e.target.value }))}
                  className="h-10 w-16 rounded border cursor-pointer"
                />
                <Input
                  value={branding.login_bg_color}
                  onChange={(e) => setBranding((p) => ({ ...p, login_bg_color: e.target.value }))}
                  className="w-36 font-mono"
                  maxLength={7}
                  placeholder="#0f172a"
                />
              </div>
            </div>
          )}

          {/* Image upload */}
          {branding.login_bg_type === 'image' && (
            <div className="space-y-1.5">
              <Label>Imagen de fondo del login</Label>
              <ImageUpload
                value={branding.login_bg_image}
                onChange={(url) => setBranding((p) => ({ ...p, login_bg_image: url }))}
                category="branding"
                label="Sube la imagen de fondo (mín. 1920×1080 para mejor resultado)"
              />
            </div>
          )}

          {/* Preview */}
          <div className="space-y-1.5">
            <Label className="flex items-center gap-1.5">
              <Eye className="h-3.5 w-3.5" />
              Vista previa
            </Label>
            <BgPreview
              type={branding.login_bg_type}
              value={branding.login_bg_value}
              color={branding.login_bg_color}
              image={branding.login_bg_image}
            />
          </div>

          <Button
            onClick={() => saveBrandingMutation.mutate()}
            disabled={saveBrandingMutation.isPending}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {saveBrandingMutation.isPending ? 'Guardando...' : 'Guardar branding'}
          </Button>
        </CardContent>
      </Card>

      {/* ── Trial days ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="h-4 w-4" />
            Prueba Gratuita
          </CardTitle>
          <CardDescription>
            Configura las condiciones del período de prueba para nuevos tenants.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <Label>Días de prueba gratuita</Label>
              <div className="flex items-center gap-3">
                <Input
                  type="number"
                  min={0}
                  max={365}
                  value={trial.days}
                  onChange={(e) => setTrial((p) => ({ ...p, days: e.target.value }))}
                  className="w-28"
                />
                <Badge variant="secondary">{trial.days} días</Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Días que tendrá el tenant para probar la plataforma sin pagar.
                Usa 0 para desactivar el período de prueba.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>¿Requiere tarjeta de crédito?</Label>
              <div className="flex gap-2 mt-1">
                {[
                  { value: 'false', label: 'No requerida' },
                  { value: 'true',  label: 'Requerida' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTrial((p) => ({ ...p, card_required: opt.value }))}
                    className={`px-4 py-1.5 rounded-full text-sm border font-medium transition-colors ${
                      trial.card_required === opt.value
                        ? 'bg-primary text-primary-foreground border-primary'
                        : 'bg-background border-border text-muted-foreground hover:bg-muted'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                Si está activado, se pedirá método de pago durante el registro.
              </p>
            </div>
          </div>

          <Button
            onClick={() => saveTrialMutation.mutate()}
            disabled={saveTrialMutation.isPending}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {saveTrialMutation.isPending ? 'Guardando...' : 'Guardar configuración de prueba'}
          </Button>
        </CardContent>
      </Card>

      {/* ── Security ── */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="h-4 w-4" />
            Seguridad de Sesión
          </CardTitle>
          <CardDescription>
            Controla los tiempos de sesión y la protección contra accesos no autorizados.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Timer className="h-3.5 w-3.5" />
                Duración del token JWT (minutos)
              </Label>
              <Input
                type="number" min={5} max={1440}
                value={security.session_timeout}
                onChange={(e) => setSecurity((p) => ({ ...p, session_timeout: e.target.value }))}
                className="w-28"
              />
              <p className="text-xs text-muted-foreground">Tiempo de vida del token. Aplica en el siguiente login.</p>
            </div>

            <div className="space-y-1.5">
              <Label className="flex items-center gap-1.5">
                <Timer className="h-3.5 w-3.5" />
                Cierre por inactividad (minutos)
              </Label>
              <Input
                type="number" min={0} max={480}
                value={security.idle_timeout}
                onChange={(e) => setSecurity((p) => ({ ...p, idle_timeout: e.target.value }))}
                className="w-28"
              />
              <p className="text-xs text-muted-foreground">0 = desactivado. El navegador cierra sesión automáticamente.</p>
            </div>

            <div className="space-y-1.5">
              <Label>Intentos fallidos antes de bloquear</Label>
              <Input
                type="number" min={1} max={20}
                value={security.max_login_attempts}
                onChange={(e) => setSecurity((p) => ({ ...p, max_login_attempts: e.target.value }))}
                className="w-28"
              />
            </div>

            <div className="space-y-1.5">
              <Label>Duración del bloqueo (minutos)</Label>
              <Input
                type="number" min={1} max={1440}
                value={security.lockout_minutes}
                onChange={(e) => setSecurity((p) => ({ ...p, lockout_minutes: e.target.value }))}
                className="w-28"
              />
            </div>
          </div>

          <Button
            onClick={() => saveSecurityMutation.mutate()}
            disabled={saveSecurityMutation.isPending}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {saveSecurityMutation.isPending ? 'Guardando...' : 'Guardar seguridad'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
