'use client';

import { forwardRef, useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

interface PhoneInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  /** Valor del teléfono SIN prefijo. Ej: "3001234567" */
  value?: string;
  /** Se llama con el número limpio (solo dígitos, sin +57). Ej: "3001234567" */
  onChange?: (value: string) => void;
  /** Si true, el valor emitido incluye +57 → "+573001234567" */
  withPrefix?: boolean;
  className?: string;
}

/**
 * Input de teléfono colombiano.
 * - Muestra "+57" como prefijo visual fijo (no editable)
 * - Acepta solo dígitos, máx 10
 * - onChange emite solo los dígitos (o con +57 si withPrefix=true)
 *
 * Para formularios react-hook-form, usa el patrón:
 *   <PhoneInput {...register('phone')} value={watch('phone')} onChange={v => setValue('phone', v)} />
 */
const PhoneInput = forwardRef<HTMLInputElement, PhoneInputProps>(
  ({ value = '', onChange, withPrefix = false, className, ...rest }, ref) => {
    const [internal, setInternal] = useState(() => stripPrefix(value));

    useEffect(() => {
      setInternal(stripPrefix(value ?? ''));
    }, [value]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const digits = e.target.value.replace(/\D/g, '').slice(0, 10);
      setInternal(digits);
      onChange?.(withPrefix ? `+57${digits}` : digits);
    };

    return (
      <div className="flex">
        <span className="inline-flex items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground select-none">
          +57
        </span>
        <input
          {...rest}
          ref={ref}
          type="tel"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={10}
          value={internal}
          onChange={handleChange}
          className={cn(
            'flex h-9 w-full rounded-l-none rounded-r-md border border-input bg-background px-3 py-1 text-sm',
            'ring-offset-background placeholder:text-muted-foreground',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
            'disabled:cursor-not-allowed disabled:opacity-50',
            className
          )}
          placeholder="3001234567"
        />
      </div>
    );
  }
);

PhoneInput.displayName = 'PhoneInput';

export { PhoneInput };

// ─── Helper ───────────────────────────────────────────────────────────────────

function stripPrefix(val: string): string {
  return val.replace(/^\+?57/, '').replace(/\D/g, '').slice(0, 10);
}
