'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useRouter, useSearchParams } from 'next/navigation';
import { useMutation, useQuery } from '@tanstack/react-query';
import {
  Store, UtensilsCrossed, Pill, ShoppingBag, Wrench,
  Hammer, Scissors, PawPrint, Shirt, CheckCircle2,
  ChevronRight, ChevronLeft, Loader2, ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { FieldError, FieldHint, FormAlert } from '@/components/ui/field-error';
import { authApi, plansApi, legalApi, type BusinessType } from '@/lib/api/central.api';
import { useAuthStore } from '@/store/authStore';
import { parseApiError, parseFieldErrors } from '@/lib/notify';
import type { Plan } from '@/types';
import { cn } from '@/lib/utils';

// ─── Icon map (backend icon key → lucide component) ──────────────────────────

const ICON_MAP: Record<string, React.ElementType> = {
  'building-storefront': Store,
  'cake':                UtensilsCrossed,
  'beaker':              Pill,
  'shopping-bag':        ShoppingBag,
  'wrench-screwdriver':  Wrench,
  'hammer':              Hammer,
  'scissors':            Scissors,
  'paw-print':           PawPrint,
  'shirt':               Shirt,
};

// Map business type slug to plan type for plan filtering
function planTypeForSlug(slug: string): string {
  return slug === 'restaurant' ? 'restaurant' : 'store';
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const registerSchema = z.object({
  owner_name:            z.string().min(3, 'Tu nombre debe tener al menos 3 caracteres'),
  email:                 z.string().email('Ingresa un correo electrónico válido'),
  password:              z.string().min(8, 'La contraseña debe tener al menos 8 caracteres')
    .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).+$/, 'Debe incluir al menos una mayúscula, una minúscula y un número'),
  password_confirmation: z.string().min(1, 'Debes confirmar tu contraseña'),
  business_name:         z.string().min(3, 'El nombre del negocio debe tener al menos 3 caracteres'),
  business_type_id:      z.number({ error: 'Selecciona el tipo de negocio' }).positive('Selecciona el tipo de negocio'),
  plan_id:               z.number({ error: 'Selecciona un plan' }).positive('Debes seleccionar un plan para continuar'),
  phone:                 z.string().optional(),
  seed_puc:              z.boolean().optional(),
  // Aceptación de términos — obligatoria, validada también en el backend (OWASP A01)
  terms_accepted:        z.boolean().refine((v) => v === true, {
    message: 'Debes aceptar los términos y condiciones para continuar',
  }),
  terms_version:         z.string().min(1),
}).refine((d) => d.password === d.password_confirmation, {
  message: 'Las contraseñas no coinciden',
  path: ['password_confirmation'],
});

type RegisterForm = z.infer<typeof registerSchema>;

// ─── Steps ────────────────────────────────────────────────────────────────────

type Step = 'type' | 'info' | 'plan' | 'setting_up';

interface Props {
  businessTypes: BusinessType[];
}

export default function RegisterClient({ businessTypes }: Props) {
  const router       = useRouter();
  const searchParams = useSearchParams();
  const { setAuth, setCurrentTenant } = useAuthStore();
  const [error, setError] = useState('');
  const [step, setStep] = useState<Step>('type');
  const [pendingTenant, setPendingTenant] = useState<{ slug: string; checkoutRequired: boolean; planId: number } | null>(null);
  const [selectedType, setSelectedType] = useState<BusinessType | null>(null);
  const [billing] = useState<'monthly' | 'annual'>(
    searchParams.get('billing') === 'annual' ? 'annual' : 'monthly'
  );

  const loadingTypes = false; // businessTypes come pre-fetched as prop

  const { data: plans = [], isLoading: loadingPlans } = useQuery<Plan[]>({
    queryKey: ['plans-public'],
    queryFn: () => plansApi.list().then((r) => r.data),
    enabled: step === 'plan',
  });

  // Obtiene la versión vigente del documento de términos para incluirla en el registro
  const { data: termsDoc } = useQuery({
    queryKey: ['legal-terms-public'],
    queryFn: () => legalApi.getPublic('terms').then((r) => r.data),
    enabled: step === 'plan',
    retry: false,
  });

  // Pre-select from landing URL params (?type=farmacia, ?plan=starter&plan_type=store)
  useEffect(() => {
    if (loadingTypes || businessTypes.length === 0) return;
    if (step !== 'type') return; // only run once on mount

    const typeSlug = searchParams.get('type');
    const planSlug = searchParams.get('plan');

    // Infer plan type from plan slug (e.g. 'basico-restaurant' → restaurant)
    const planIsRestaurant = planSlug?.includes('restaurant') ?? false;

    let matched: BusinessType | null = null;

    if (typeSlug) {
      matched = businessTypes.find((bt) => bt.slug === typeSlug) ?? null;
    } else if (planSlug) {
      matched = businessTypes.find((bt) =>
                  planIsRestaurant
                    ? bt.slug.includes('restaur')
                    : !bt.slug.includes('restaur')
                )
             ?? businessTypes[0];
    }

    if (matched) {
      setSelectedType(matched);
      setValue('business_type_id', matched.id);
      setStep('info');
    }
    // planSlug is resolved later when plans load (step 'plan')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingTypes, businessTypes]);

  // When plans load, pre-select the plan from URL slug
  useEffect(() => {
    if (plans.length === 0) return;
    const planSlug = searchParams.get('plan');
    if (!planSlug) return;
    const match = plans.find((p) => p.slug === planSlug);
    if (match) setValue('plan_id', match.id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plans]);

  // Sincronizar la versión del documento de términos en el formulario
  useEffect(() => {
    if (termsDoc?.version) {
      setValue('terms_version', termsDoc.version);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [termsDoc]);

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError: setFieldError,
    formState: { errors },
    trigger,
  } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });

  const planId = watch('plan_id');

  // Polling: espera hasta que el tenant termine de configurarse
  useEffect(() => {
    if (step !== 'setting_up' || !pendingTenant) return;

    const interval = setInterval(async () => {
      try {
        const res = await authApi.setupStatus(pendingTenant.slug);
        if (res.data.ready) {
          clearInterval(interval);
          if (pendingTenant.checkoutRequired && pendingTenant.planId) {
            router.push(`/${pendingTenant.slug}/billing/checkout?type=plan&id=${pendingTenant.planId}&billing=${billing}`);
          } else {
            router.push(`/${pendingTenant.slug}/dashboard`);
          }
        }
      } catch {
        // Silencioso — seguimos reintentando
      }
    }, 3_000);

    return () => clearInterval(interval);
  }, [step, pendingTenant, billing, router]);

  const handleRegistrationSuccess = (res: {
    data: {
      token: string;
      user: Parameters<typeof setAuth>[1];
      tenant: Parameters<typeof setCurrentTenant>[0];
      checkout_required: boolean;
      plan_id: number;
    };
  }) => {
    const { token, user, tenant, checkout_required, plan_id } = res.data;
    setAuth(token, user, [tenant]);
    setCurrentTenant(tenant);

    if (tenant.status === 'setting_up') {
      // El setup corre en background — mostrar pantalla de espera con polling
      setPendingTenant({ slug: tenant.slug, checkoutRequired: checkout_required, planId: plan_id });
      setStep('setting_up');
    } else if (checkout_required && plan_id) {
      router.push(`/${tenant.slug}/billing/checkout?type=plan&id=${plan_id}&billing=${billing}`);
    } else {
      router.push(`/${tenant.slug}/dashboard`);
    }
  };

  const mutation = useMutation({
    mutationFn: (data: RegisterForm) =>
      authApi.register({
        ...data,
        business_type: selectedType?.slug,
      }),
    onSuccess: handleRegistrationSuccess,
    onError: async (err: unknown) => {
      const fieldErrors = parseFieldErrors(err);
      const emailMsg = fieldErrors['email'] ?? '';
      const isEmailTaken = emailMsg.includes('unique') || emailMsg.includes('tomado') || emailMsg.includes('already');
      const isTimeout = (err as { code?: string })?.code === 'ECONNABORTED'
        || (err as { message?: string })?.message?.includes('timeout');

      if (isEmailTaken || isTimeout) {
        const currentValues = watch();
        if (currentValues.email && currentValues.password) {
          try {
            const resumeRes = await authApi.resumeRegistration({
              email: currentValues.email,
              password: currentValues.password,
              plan_id: currentValues.plan_id,
            });
            handleRegistrationSuccess(resumeRes);
            return;
          } catch {
            setError('Tu cuenta ya fue creada pero la conexión se interrumpió. Intenta iniciar sesión.');
            return;
          }
        }
      }

      const fieldNames: (keyof RegisterForm)[] = [
        'owner_name', 'email', 'password', 'password_confirmation',
        'business_name', 'business_type_id', 'plan_id', 'phone',
      ];
      let hasFieldErrors = false;
      for (const field of fieldNames) {
        if (fieldErrors[field]) {
          setFieldError(field, { message: fieldErrors[field] });
          hasFieldErrors = true;
        }
      }
      if (!hasFieldErrors) {
        setError(parseApiError(err, 'Error al registrar. Verifica los datos e inténtalo de nuevo.'));
      } else {
        setError('Corrige los errores marcados en el formulario antes de continuar.');
      }
    },
  });

  const filteredPlans = plans.filter((p: Plan) =>
    selectedType ? p.type === planTypeForSlug(selectedType.slug) : true
  );

  const handleSelectType = (bt: BusinessType) => {
    setSelectedType(bt);
    setValue('business_type_id', bt.id);
    setValue('plan_id', 0);
    setStep('info');
  };

  const handleNextToPlans = async () => {
    const ok = await trigger(['owner_name', 'email', 'password', 'password_confirmation', 'business_name', 'phone']);
    if (ok) setStep('plan');
  };

  // ─── Step: Setting Up ────────────────────────────────────────────────────────

  if (step === 'setting_up') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-4 gap-8">
        <div className="text-5xl font-black tracking-tight text-white">Atlas</div>
        <div className="bg-card rounded-2xl shadow-xl p-10 flex flex-col items-center gap-6 w-full max-w-sm text-center">
          <div className="size-16 rounded-full bg-blue-50 flex items-center justify-center">
            <Loader2 className="size-8 text-blue-600 animate-spin" />
          </div>
          <div>
            <h2 className="text-lg font-bold">Configurando tu negocio</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Estamos preparando tu espacio de trabajo. Esto puede tardar unos segundos…
            </p>
          </div>
          <div className="w-full space-y-2 text-left text-xs text-muted-foreground">
            <div className="flex items-center gap-2"><CheckCircle2 className="size-3.5 text-green-500 shrink-0" /> Cuenta creada</div>
            <div className="flex items-center gap-2"><Loader2 className="size-3.5 text-blue-500 animate-spin shrink-0" /> Inicializando base de datos…</div>
            <div className="flex items-center gap-2"><Loader2 className="size-3.5 text-muted-foreground/40 shrink-0" /> Configurando módulos y permisos…</div>
          </div>
        </div>
        <p className="text-slate-500 text-xs">No cierres esta ventana</p>
      </div>
    );
  }

  // ─── Step: Type ─────────────────────────────────────────────────────────────

  if (step === 'type') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-4 gap-8">
        <div className="text-center">
          <div className="text-5xl font-black tracking-tight text-white mb-2">Atlas</div>
          <p className="text-slate-400 text-sm">¿Qué tipo de negocio tienes?</p>
        </div>

        {loadingTypes ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 w-full max-w-2xl">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-28 rounded-2xl bg-slate-700/50 animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 w-full max-w-2xl">
            {businessTypes.map((bt) => {
              const Icon = ICON_MAP[bt.icon ?? ''] ?? Store;
              return (
                <button
                  key={bt.id}
                  type="button"
                  onClick={() => handleSelectType(bt)}
                  className="flex flex-col items-center gap-3 rounded-2xl bg-white p-5 shadow-sm hover:shadow-md hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer text-center group"
                >
                  <div className="size-12 rounded-xl bg-blue-50 group-hover:bg-blue-100 flex items-center justify-center transition-colors">
                    <Icon className="size-6 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-slate-800 leading-tight">
                      Sistema <span className="font-bold">POS</span> para
                    </p>
                    <p className="text-sm font-bold text-slate-900">{bt.name}</p>
                  </div>
                </button>
              );
            })}
          </div>
        )}

        <p className="text-slate-500 text-xs">
          ¿Ya tienes cuenta?{' '}
          <a href="/login" className="text-blue-400 hover:underline font-medium">
            Inicia sesión
          </a>
        </p>
      </div>
    );
  }

  // ─── Step: Info ─────────────────────────────────────────────────────────────

  if (step === 'info') {
    const Icon = selectedType ? (ICON_MAP[selectedType.icon ?? ''] ?? Store) : Store;
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-4">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center mb-6">
            <div className="text-4xl font-black tracking-tight text-white mb-1">Atlas</div>
            <div className="inline-flex items-center gap-2 rounded-full bg-blue-600/20 border border-blue-500/30 px-3 py-1 text-xs text-blue-300 mt-1">
              <Icon className="size-3.5" />
              {selectedType?.name}
            </div>
          </div>

          <div className="bg-card rounded-2xl shadow-xl p-6 space-y-4">
            <h2 className="text-lg font-bold">Cuéntanos sobre tu negocio</h2>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label htmlFor="owner_name">Tu nombre <span className="text-destructive">*</span></Label>
                <Input id="owner_name" placeholder="Juan Pérez" aria-invalid={!!errors.owner_name} {...register('owner_name')} />
                <FieldError message={errors.owner_name?.message} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="phone">Teléfono</Label>
                <Input id="phone" placeholder="+57 300 0000000" {...register('phone')} />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="business_name">Nombre del negocio <span className="text-destructive">*</span></Label>
              <Input id="business_name" placeholder="Farmacia La Salud" aria-invalid={!!errors.business_name} {...register('business_name')} />
              <FieldError message={errors.business_name?.message} />
            </div>

            <div className="space-y-1">
              <Label htmlFor="email">Correo electrónico <span className="text-destructive">*</span></Label>
              <Input id="email" type="email" placeholder="tu@negocio.com" aria-invalid={!!errors.email} {...register('email')} />
              <FieldError message={errors.email?.message} />
            </div>

            <div className="space-y-1">
              <Label htmlFor="password">Contraseña <span className="text-destructive">*</span></Label>
              <Input id="password" type="password" placeholder="Crea una contraseña segura" aria-invalid={!!errors.password} {...register('password')} />
              <FieldError message={errors.password?.message} />
              {!errors.password && <FieldHint message="Mínimo 8 caracteres, incluye mayúscula, minúscula y número" />}
            </div>

            <div className="space-y-1">
              <Label htmlFor="password_confirmation">Confirmar contraseña <span className="text-destructive">*</span></Label>
              <Input id="password_confirmation" type="password" placeholder="Repite tu contraseña" aria-invalid={!!errors.password_confirmation} {...register('password_confirmation')} />
              <FieldError message={errors.password_confirmation?.message} />
            </div>

            {/* PUC */}
            <div className="flex items-start gap-3 rounded-lg border border-dashed p-3">
              <input id="seed_puc" type="checkbox" {...register('seed_puc')} className="mt-0.5 size-4 rounded border-input accent-primary" />
              <div>
                <Label htmlFor="seed_puc" className="cursor-pointer font-medium text-sm">Incluir PUC colombiano completo</Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Precarga el Plan Único de Cuentas (Decreto 2649/2650). Recomendado para contabilidad formal.
                </p>
              </div>
            </div>

            <div className="flex gap-3">
              <Button variant="outline" type="button" className="flex-1" onClick={() => setStep('type')}>
                <ChevronLeft className="size-4 mr-1" /> Volver
              </Button>
              <Button type="button" className="flex-1" onClick={handleNextToPlans}>
                Seleccionar plan <ChevronRight className="size-4 ml-1" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Step: Plan ─────────────────────────────────────────────────────────────

  const Icon = selectedType ? (ICON_MAP[selectedType.icon ?? ''] ?? Store) : Store;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-6">
          <div className="text-4xl font-black tracking-tight text-white mb-1">Atlas</div>
          <div className="inline-flex items-center gap-2 rounded-full bg-blue-600/20 border border-blue-500/30 px-3 py-1 text-xs text-blue-300 mt-1">
            <Icon className="size-3.5" />
            {selectedType?.name}
          </div>
        </div>

        <div className="bg-card rounded-2xl shadow-xl p-6 space-y-4">
          <h2 className="text-lg font-bold">Elige tu plan</h2>
          <p className="text-sm text-muted-foreground -mt-2">Comienza con 14 días gratis en cualquier plan.</p>

          <form onSubmit={handleSubmit((d) => mutation.mutate(d))}>
            <div className="space-y-3 mb-4">
              {loadingPlans ? (
                Array.from({ length: 2 }).map((_, i) => (
                  <div key={i} className="h-20 rounded-xl bg-muted animate-pulse" />
                ))
              ) : filteredPlans.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No hay planes disponibles para este tipo de negocio.</p>
              ) : (
                filteredPlans.map((plan: Plan) => {
                  const selected = planId === plan.id;
                  return (
                    <div
                      key={plan.id}
                      onClick={() => setValue('plan_id', plan.id)}
                      className={cn(
                        'relative border rounded-xl p-4 cursor-pointer transition-all',
                        selected
                          ? 'border-primary bg-primary/5 shadow-sm'
                          : 'hover:border-muted-foreground/50 hover:bg-muted/30'
                      )}
                    >
                      {selected && (
                        <CheckCircle2 className="absolute top-3 right-3 size-4 text-primary" />
                      )}
                      <div className="flex items-center justify-between pr-6">
                        <span className="font-semibold text-sm">{plan.name}</span>
                        <Badge variant={plan.price === 0 ? 'secondary' : 'default'} className="text-xs">
                          {plan.price === 0 ? 'Gratis' : `$${plan.price.toLocaleString('es-CO')}/mes`}
                        </Badge>
                      </div>
                      {plan.description && (
                        <p className="text-xs text-muted-foreground mt-1">{plan.description}</p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            <FieldError message={errors.plan_id?.message} />

            {/* Aceptación obligatoria de términos */}
            <div className={cn(
              'flex items-start gap-3 rounded-lg border p-3 mt-4 transition-colors',
              errors.terms_accepted ? 'border-destructive bg-destructive/5' : 'border-dashed'
            )}>
              <input
                id="terms_accepted"
                type="checkbox"
                {...register('terms_accepted')}
                className="mt-0.5 size-4 rounded border-input accent-primary shrink-0"
              />
              <div>
                <Label htmlFor="terms_accepted" className="cursor-pointer font-medium text-sm flex items-center gap-1.5">
                  <ShieldCheck className="size-3.5 text-blue-500" />
                  Acepto los términos y políticas <span className="text-destructive">*</span>
                </Label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  He leído y acepto los{' '}
                  <a href="/legal/terms" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">
                    Términos y Condiciones
                  </a>{' '}
                  y la{' '}
                  <a href="/legal/privacy" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline font-medium">
                    Política de Tratamiento de Datos
                  </a>{' '}
                  de Atlas ERP.
                  {termsDoc?.version && (
                    <span className="text-muted-foreground/60 ml-1">(v{termsDoc.version})</span>
                  )}
                </p>
                <FieldError message={errors.terms_accepted?.message} />
              </div>
            </div>

            <FormAlert type="error" message={error} />

            <div className="flex gap-3 mt-4">
              <Button variant="outline" type="button" className="flex-1" onClick={() => setStep('info')}>
                <ChevronLeft className="size-4 mr-1" /> Volver
              </Button>
              <Button type="submit" className="flex-1" disabled={mutation.isPending || !planId}>
                {mutation.isPending
                  ? 'Creando tu negocio…'
                  : planId && filteredPlans.find((p: Plan) => p.id === planId && p.price > 0)
                    ? 'Crear cuenta y pagar'
                    : 'Comenzar gratis'}
              </Button>
            </div>

            <p className="text-center text-xs text-muted-foreground mt-3">
              ¿Ya tienes cuenta?{' '}
              <a href="/login" className="text-primary hover:underline font-medium">
                Inicia sesión
              </a>
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
