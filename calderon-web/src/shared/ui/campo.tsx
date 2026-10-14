import { Children, cloneElement, isValidElement, useId, type ReactElement, type ReactNode } from 'react';
import { cn } from '@/shared/lib/cn';

const CLASE_CONTROL =
  'h-10 w-full rounded-md border border-borde bg-panel px-3 text-sm text-tinta outline-none focus:border-marca focus:ring-2 focus:ring-marca/20 aria-invalid:border-error';

/**
 * Envoltorio accesible de un control de formulario: etiqueta, control y mensaje de error.
 * Inyecta id, aria-invalid, aria-describedby y la clase base en su único hijo.
 */
export function Campo({ label, error, ayuda, children }: { label: string; error?: string | undefined; ayuda?: string; children: ReactNode }) {
  const id = useId();
  const idMensaje = `${id}-mensaje`;
  const hijo = Children.only(children);

  const control = isValidElement(hijo)
    ? cloneElement(hijo as ReactElement<Record<string, unknown>>, {
        id,
        'aria-invalid': error ? true : undefined,
        'aria-describedby': error || ayuda ? idMensaje : undefined,
        className: cn(CLASE_CONTROL, (hijo.props as { className?: string }).className),
      })
    : hijo;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium text-tinta">
        {label}
      </label>
      {control}
      {(error || ayuda) && (
        <p id={idMensaje} className={cn('text-xs', error ? 'text-error' : 'text-tinta-suave')}>
          {error ?? ayuda}
        </p>
      )}
    </div>
  );
}
