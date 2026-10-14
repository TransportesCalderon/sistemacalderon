import { TriangleAlert } from 'lucide-react';

/** Aviso global de la especificación §12: sin moneda base no se pueden registrar importes. */
export function AvisoMonedaBase({ puedeConfigurar }: { puedeConfigurar: boolean }) {
  return (
    <div role="alert" className="flex items-start gap-2 border-b border-alerta/30 bg-alerta-suave px-4 py-2 text-sm text-alerta sm:px-6 lg:px-8">
      <TriangleAlert className="mt-0.5 size-4 shrink-0" />
      <p>
        <strong>Moneda base no definida:</strong> no se pueden registrar importes (decisión pendiente 1).
        {puedeConfigurar ? ' Definila en Configuración → Monedas y moneda base.' : ' Pedile a un administrador que la defina.'}
      </p>
    </div>
  );
}
