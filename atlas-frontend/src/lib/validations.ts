/**
 * Esquemas y helpers de validación Zod reutilizables para Atlas.
 *
 * Centraliza las reglas de negocio colombianas:
 *  - Teléfono: 10 dígitos, inicia en 3 (celular) o 6 (fijo Bogotá) / 4 (otras ciudades)
 *  - Dirección: letras, números, guiones, # y espacios
 *  - Nombre: solo letras, espacios y acentos
 *  - Contraseña segura: mayúsculas + minúsculas + dígito + símbolo
 *  - NIT colombiano: formato XXXXXXXXX-X
 */

import { z } from 'zod';

// ─── Teléfono colombiano ──────────────────────────────────────────────────────

/** Valida número sin prefijo. Acepta celular (3XX) y fijo local. */
export const colPhone = z
  .string()
  .transform((v) => v.replace(/\D/g, ''))          // quitar no-dígitos
  .refine((v) => v.length === 10, 'El teléfono debe tener 10 dígitos')
  .refine(
    (v) => /^[3-9]/.test(v) || /^[246]/.test(v),
    'Número de teléfono colombiano inválido'
  );

/** Igual que colPhone pero el campo es opcional */
export const colPhoneOptional = z
  .string()
  .optional()
  .transform((v) => v?.replace(/\D/g, '') ?? '')
  .refine(
    (v) => v === '' || (v.length === 10 && (/^[3-9]/.test(v) || /^[246]/.test(v))),
    'Número de teléfono colombiano inválido'
  );

// ─── Dirección colombiana ─────────────────────────────────────────────────────

export const colAddress = z
  .string()
  .min(5, 'Dirección demasiado corta')
  .max(200)
  .regex(
    /^[a-zA-ZáéíóúÁÉÍÓÚñÑ0-9\s#\-.,()°/]+$/,
    'La dirección contiene caracteres inválidos'
  );

export const colAddressOptional = colAddress.optional().or(z.literal(''));

// ─── Nombre de persona ────────────────────────────────────────────────────────

export const fullName = z
  .string()
  .min(2, 'El nombre es demasiado corto')
  .max(100)
  .regex(/^[a-zA-ZáéíóúÁÉÍÓÚüÜñÑ\s'-]+$/, 'El nombre solo puede contener letras');

// ─── Nombre de empresa / negocio ──────────────────────────────────────────────

export const businessName = z
  .string()
  .min(2, 'El nombre del negocio es demasiado corto')
  .max(150)
  .regex(
    /^[a-zA-ZáéíóúÁÉÍÓÚñÑ0-9\s&.,'-]+$/,
    'El nombre del negocio contiene caracteres no permitidos'
  );

// ─── NIT colombiano ───────────────────────────────────────────────────────────

export const colNit = z
  .string()
  .regex(/^\d{6,10}-?\d$/, 'Formato de NIT inválido (ej: 900123456-7)')
  .optional()
  .or(z.literal(''));

// ─── Contraseña segura ────────────────────────────────────────────────────────

export const securePassword = z
  .string()
  .min(8, 'Mínimo 8 caracteres')
  .max(128, 'Máximo 128 caracteres')
  .regex(/[A-Z]/, 'Debe incluir al menos una letra mayúscula')
  .regex(/[a-z]/, 'Debe incluir al menos una letra minúscula')
  .regex(/[0-9]/, 'Debe incluir al menos un número')
  .regex(/[^A-Za-z0-9]/, 'Debe incluir al menos un símbolo (!@#$%...)');

export const securePasswordOptional = securePassword
  .optional()
  .or(z.literal(''));

// ─── Email ────────────────────────────────────────────────────────────────────

export const email = z
  .string()
  .email('Email inválido')
  .max(255)
  .transform((v) => v.toLowerCase().trim());

// ─── Precio / número positivo ─────────────────────────────────────────────────

export const positiveNumber = z
  .number()
  .positive('Debe ser mayor que cero');

export const positiveNumberStr = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'Formato de número inválido')
  .transform(Number)
  .refine((n) => n >= 0, 'Debe ser mayor o igual a cero');
