'use client';

import { useState } from 'react';
import { ListChecks, Pencil, Plus, Trash2 } from 'lucide-react';
import { Panel, TD, TH, useEnvio } from '@/modules/catalogos/components/comun';
import { Cargando, Chip, Encabezado, ErrorLectura, Vacio } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { cn } from '@/shared/lib/cn';
import { BOTON_PRIMARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import type { TipoAccesorio } from '../domain/pizarra.types';
import { useEliminarTipoAccesorio, useGuardarTipoAccesorio, useTiposAccesorio } from '../queries/hooks';

type Abierto = { modo: 'nuevo' } | { modo: 'editar' | 'eliminar'; t: TipoAccesorio } | null;

/** Flota > Tipos de accesorio: cada tipo activo es una columna de la Pizarra (fajas, nylon, traca…). */
export function AccesoriosPantalla() {
  const puede = useCan('flota.pizarra:editar');
  const { data, isPending, isError, refetch } = useTiposAccesorio();
  const [abierto, setAbierto] = useState<Abierto>(null);

  return (
    <div className="space-y-5">
      <Encabezado titulo="Tipos de accesorio" subtitulo="Flota · Pizarra Azul">
        {puede && (
          <button type="button" className={BOTON_PRIMARIO} onClick={() => setAbierto({ modo: 'nuevo' })}>
            <Plus className="size-4" /> Nuevo accesorio
          </button>
        )}
      </Encabezado>
      <p className="max-w-3xl text-sm text-tinta-suave">
        Lo que puede llevar un semi y hay que saber antes de asignarlo (fajas para madera, nylon para pallets…). La sigla es el encabezado
        de la columna en la Pizarra y el orden, su posición.
      </p>
      {abierto?.modo === 'nuevo' && <FormTipo onCerrar={() => setAbierto(null)} />}
      <div className={cn(TARJETA, 'overflow-x-auto')}>
        {isPending ? (
          <Cargando texto="Cargando accesorios…" />
        ) : isError ? (
          <ErrorLectura texto="No se pudieron cargar los accesorios." onReintentar={() => refetch()} />
        ) : data.length === 0 ? (
          <Vacio icono={<ListChecks className="size-5" />} texto="Todavía no hay tipos de accesorio." />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-borde bg-fondo">
              <tr>
                <th className={TH}>Orden</th>
                <th className={TH}>Sigla</th>
                <th className={TH}>Nombre</th>
                <th className={TH}>Estado</th>
                {puede && <th className={TH} />}
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {data.map((t) => {
                const modo = abierto && abierto.modo !== 'nuevo' && abierto.t.id === t.id ? abierto.modo : null;
                return <FilaTipo key={t.id} t={t} puede={puede} modo={modo} onAbrir={setAbierto} />;
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function FilaTipo({
  t,
  puede,
  modo,
  onAbrir,
}: {
  t: TipoAccesorio;
  puede: boolean;
  modo: 'editar' | 'eliminar' | null;
  onAbrir: (a: Abierto) => void;
}) {
  return (
    <>
      <tr>
        <td className={cn(TD, 'tabular-nums')}>{t.orden}</td>
        <td className={cn(TD, 'font-mono font-semibold')}>{t.sigla}</td>
        <td className={cn(TD, 'text-tinta')}>{t.nombre}</td>
        <td className={TD}>{t.activo ? <Chip tono="exito">Activo</Chip> : <Chip tono="neutro">Desactivado</Chip>}</td>
        {puede && (
          <td className={cn(TD, 'text-right whitespace-nowrap')}>
            <button
              type="button"
              className="mr-3 inline-flex items-center gap-1 text-xs text-marca hover:underline"
              onClick={() => onAbrir({ modo: 'editar', t })}
            >
              <Pencil className="size-3.5" /> Editar
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-marca hover:underline"
              onClick={() => onAbrir({ modo: 'eliminar', t })}
            >
              <Trash2 className="size-3.5" /> Eliminar
            </button>
          </td>
        )}
      </tr>
      {modo && (
        <tr>
          <td colSpan={5} className="px-3 pb-3">
            {modo === 'editar' ? <FormTipo t={t} onCerrar={() => onAbrir(null)} /> : <EliminarTipo t={t} onCerrar={() => onAbrir(null)} />}
          </td>
        </tr>
      )}
    </>
  );
}

function FormTipo({ t, onCerrar }: { t?: TipoAccesorio; onCerrar: () => void }) {
  const guardar = useGuardarTipoAccesorio();
  const { error, enviar, campo } = useEnvio();
  const [v, setV] = useState({
    nombre: t?.nombre ?? '',
    sigla: t?.sigla ?? '',
    orden: t ? String(t.orden) : '',
    activo: t?.activo ?? true,
  });
  return (
    <Panel
      titulo={t ? `Editar ${t.nombre}` : 'Nuevo accesorio'}
      explicacion="Un accesorio desactivado deja de verse en la Pizarra y no admite cantidades nuevas."
      error={error}
      ocupado={guardar.isPending}
      textoBoton={t ? 'Guardar cambios' : 'Dar de alta'}
      onCerrar={onCerrar}
      onConfirmar={() => enviar(guardar.mutateAsync({ ...v, id: t?.id ?? null, versionFila: t?.versionFila ?? null }), onCerrar)}
    >
      <Campo label="Nombre *" error={campo('nombre')}>
        <input maxLength={60} value={v.nombre} onChange={(e) => setV({ ...v, nombre: e.target.value })} />
      </Campo>
      <Campo label="Sigla *" error={campo('sigla')} ayuda="De 1 a 6 letras o números: FF, NYL, TRA…">
        <input className="uppercase" maxLength={6} value={v.sigla} onChange={(e) => setV({ ...v, sigla: e.target.value })} />
      </Campo>
      <Campo label="Orden" error={campo('orden')} ayuda="Posición de la columna (menor primero).">
        <input inputMode="numeric" value={v.orden} onChange={(e) => setV({ ...v, orden: e.target.value })} />
      </Campo>
      <label className="flex items-center gap-2 self-end pb-2 text-sm text-tinta">
        <input
          type="checkbox"
          className="size-4 accent-marca"
          checked={v.activo}
          onChange={(e) => setV({ ...v, activo: e.target.checked })}
        />
        Activo
      </label>
    </Panel>
  );
}

function EliminarTipo({ t, onCerrar }: { t: TipoAccesorio; onCerrar: () => void }) {
  const eliminar = useEliminarTipoAccesorio();
  const { error, enviar } = useEnvio();
  return (
    <Panel
      titulo={`Eliminar ${t.nombre}`}
      explicacion="Solo se puede si ningún semi tiene cantidades cargadas de este accesorio; si las tiene, desactivalo."
      error={error}
      ocupado={eliminar.isPending}
      textoBoton="Eliminar"
      onCerrar={onCerrar}
      onConfirmar={() => enviar(eliminar.mutateAsync({ id: t.id, versionFila: t.versionFila }), onCerrar)}
    />
  );
}
