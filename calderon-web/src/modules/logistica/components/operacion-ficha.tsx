'use client';

import { useState } from 'react';
import { Cargando, ErrorLectura } from '@/modules/combustible/components/comun/ui';
import { useNombreFicha } from '@/modules/core/fichas/contexto';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { useOperacion } from '../queries/hooks';
import { Detalle, FormOperacion, type Abierto } from './operaciones-pantalla';

/**
 * Sprint 1 · S1-05: la ficha de una operación en el panel lateral. Muestra el mismo detalle que
 * la fila abierta en Operaciones (pasos, equipo, tercero, cancelar), leído con ops.fn_operacion
 * (migración 114). Duplicar abre el formulario de alta acá mismo.
 */
export function OperacionFicha({ id }: { id: number }) {
  const { zonaHoraria } = useSesion();
  const puede = useCan('operacion.servicios:editar');
  const { data: o, isPending, isError, error, refetch } = useOperacion(id);
  const [abierto, setAbierto] = useState<Abierto>(null);
  useNombreFicha(o ? `N.º ${o.numero}` : null);

  if (isPending) return <Cargando texto="Cargando la operación…" />;
  if (isError) return <ErrorLectura texto="No se pudo leer la operación." onReintentar={() => void refetch()} error={error} />;
  if (!o) return <p className="text-sm text-tinta-suave">La operación no existe.</p>;

  if (abierto?.tipo === 'nueva') return <FormOperacion base={abierto.base} duplicar zona={zonaHoraria} onCerrar={() => setAbierto(null)} />;

  // Lo abierto se arma con la operación recién leída, para que se vea lo último después de cada paso
  const actual: Abierto = abierto && 'o' in abierto ? ({ ...abierto, o } as Abierto) : { tipo: 'detalle', o };
  return (
    // El detalle ya trae su encabezado (número, tipo, cliente y línea)
    <Detalle o={o} zona={zonaHoraria} puede={puede} abierto={actual} onAbrir={(a) => setAbierto(a ?? { tipo: 'detalle', o })} />
  );
}
