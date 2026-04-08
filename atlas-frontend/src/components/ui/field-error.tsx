import { AlertCircle, Info } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FieldErrorProps {
  message?: string;
  className?: string;
}

/** Red error message shown below a form field */
export function FieldError({ message, className }: FieldErrorProps) {
  if (!message) return null;
  return (
    <p className={cn('flex items-center gap-1.5 text-xs text-destructive font-medium mt-1', className)}>
      <AlertCircle className="size-3.5 shrink-0" />
      {message}
    </p>
  );
}

interface FieldHintProps {
  message?: string;
  className?: string;
}

/** Blue info hint shown below a form field */
export function FieldHint({ message, className }: FieldHintProps) {
  if (!message) return null;
  return (
    <p className={cn('flex items-center gap-1.5 text-xs text-blue-600 dark:text-blue-400 mt-1', className)}>
      <Info className="size-3.5 shrink-0" />
      {message}
    </p>
  );
}

interface FormAlertProps {
  type: 'error' | 'warning' | 'success' | 'info';
  message?: string;
  className?: string;
}

const ALERT_STYLES = {
  error:   'bg-red-50    border-red-200    text-red-700    dark:bg-red-950/30    dark:border-red-800    dark:text-red-400',
  warning: 'bg-amber-50  border-amber-200  text-amber-700  dark:bg-amber-950/30  dark:border-amber-800  dark:text-amber-400',
  success: 'bg-green-50  border-green-200  text-green-700  dark:bg-green-950/30  dark:border-green-800  dark:text-green-400',
  info:    'bg-blue-50   border-blue-200   text-blue-700   dark:bg-blue-950/30   dark:border-blue-800   dark:text-blue-400',
};

const ALERT_ICONS = {
  error:   '⛔',
  warning: '⚠️',
  success: '✅',
  info:    'ℹ️',
};

/** Full-width colored alert banner for form-level messages */
export function FormAlert({ type, message, className }: FormAlertProps) {
  if (!message) return null;
  const lines = message.split('\n').filter(Boolean);
  return (
    <div className={cn('flex items-start gap-2 rounded-lg border px-4 py-3 text-sm font-medium', ALERT_STYLES[type], className)}>
      <span className="shrink-0 mt-0.5">{ALERT_ICONS[type]}</span>
      <div className="flex flex-col gap-0.5">
        {lines.length === 1
          ? <span>{lines[0]}</span>
          : lines.map((line, i) => <span key={i}>• {line}</span>)
        }
      </div>
    </div>
  );
}
