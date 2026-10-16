'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCan } from '@/modules/core/permissions/can';
import { Cargando, Chip, Encabezado, ErrorLectura } from '@/modules/combustible/components/comun/ui';
import { cn } from '@/shared/lib/cn';
import { TARJETA } from '@/shared/ui/clases';
import { useDefinirMonedaBase, useMonedas } from '../queries/hooks';
import { Panel, TD, TH, useEnvio } from './comun';

/**
 * Configuración > Monedas y moneda base (migración 29). Todo importe se convierte a la moneda
 * base al registrarse y queda así; por eso la base solo cambia mientras no haya importes.
 */
export function MonedasPantalla() {
  const router = useRouter();
  const puede = useCan('configuracion.catalogos:editar');
  const { data, isPending, isError, refetch } = useMonedas();
  const definir = useDefinirMonedaBase();
  const { error, enviar } = useEnvio();
  const [eligiendo, setEligiendo] = useState<string | null>(null);

  return (
    <div className="space-y-5">
      <Encabezado titulo="Monedas y moneda base" subtitulo="Configuración" />
      <p className="max-w-3xl text-sm text-tinta-suave">
        La moneda base es la que se usa para comparar importes de distintos países. Cada carga guarda su importe convertido a la moneda
        base en el momento de registrarse, por eso la base solo se puede cambiar mientras no haya importes registrados.
      </p>
      <div className={cn(TARJETA, 'overflow-x-auto')}>
        {isPending ? (
          <Cargando texto="Cargando monedas…" />
        ) : isError ? (
          <ErrorLectura texto="No se pudieron cargar las monedas." onReintentar={() => refetch()} />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-borde bg-fondo">
              <tr>
                <th className={TH}>Código</th>
                <th className={TH}>Moneda</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {data.map((m) => (
                <tr key={m.codigo}>
                  <td className={cn(TD, 'font-mono')}>{m.codigo}</td>
                  <td className={TD}>
                    {m.nombre} {m.esBase && <Chip tono="marca">Moneda base</Chip>}
                  </td>
                  <td className={cn(TD, 'text-right')}>
                    {puede && !m.esBase && (
                      <button type="button" className="text-xs text-marca hover:underline" onClick={() => setEligiendo(m.codigo)}>
                        Usar como moneda base
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {eligiendo && (
        <Panel
          titulo={`Usar ${eligiendo} como moneda base`}
          explicacion="Desde ahora todos los importes se convierten a esta moneda y las cotizaciones se piden hacia ella. Si ya hay importes registrados, el sistema no lo permite."
          error={error}
          ocupado={definir.isPending}
          textoBoton="Confirmar"
          onCerrar={() => setEligiendo(null)}
          onConfirmar={() =>
            enviar(definir.mutateAsync({ codigo: eligiendo }), () => {
              setEligiendo(null);
              router.refresh();
            })
          }
        />
      )}
    </div>
  );
}
