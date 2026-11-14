'use client';

import { Encabezado } from '@/modules/combustible/components/comun/ui';
import { TablaChoferes } from './rutas-choferes';

/**
 * Migración 156 · Viajes › Rutas para choferes: todas las operaciones abiertas en un lugar, para que
 * Telemetría cargue la ruta de cada una (antes estaba dentro del detalle de la operación). Muestra
 * también si el camión está fuera de la ruta (desvío).
 */
export function RutasPantalla() {
  return <PorChofer />;
}

/** Migración 161: por chofer (tabla de choferes activos). */
function PorChofer() {
  return (
    <div className="space-y-5">
      <Encabezado titulo="Rutas para choferes" subtitulo="Viajes" />
      <p className="text-sm text-tinta-suave">
        Los choferes activos. Tocá uno para cargarle rutas en orden: las de su operación y también movimientos sin operación. El chofer ve solo
        la que está en curso y, si el camión se aleja de ella, aparece un aviso de desvío.
      </p>
      <TablaChoferes />
    </div>
  );
}
