'use client';

import { useState } from 'react';
import { Fuel, PlugZap, Pencil, Plus, Trash2, Unplug } from 'lucide-react';
import { Panel, TD, TH, useEnvio } from '@/modules/catalogos/components/comun';
import { Cargando, Chip, Encabezado, ErrorLectura, Vacio } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { BOTON_PRIMARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { useGensetsCombustible } from '@/modules/combustible/queries/hooks';
import type { GensetCombustible } from '@/modules/combustible/domain/genset.types';
import type { Genset } from '../domain/pizarra.types';
import { useEliminarGenset, useGensets, useGuardarGenset, useInstalarGenset, useRetirarGenset, useSemis } from '../queries/hooks';
import { diaHora } from './formato';
import { NombreEnlazado } from '@/shared/ui/nombre-enlazado';

type Modo = 'editar' | 'eliminar' | 'instalar' | 'retirar';
type Abierto = { modo: 'nuevo' } | { modo: Modo; g: Genset } | null;

/** Flota > Gensets: generadores para contenedores refrigerados y en qué semi están instalados. */
export function GensetsPantalla() {
  const puede = useCan('flota.pizarra:editar');
  const { zonaHoraria } = useSesion();
  const { data, isPending, isError, refetch } = useGensets();
  const { data: combustible } = useGensetsCombustible();
  const [abierto, setAbierto] = useState<Abierto>(null);

  return (
    <div className="space-y-5">
      <Encabezado titulo="Gensets" subtitulo="Flota · Pizarra Azul">
        {puede && (
          <button type="button" className={BOTON_PRIMARIO} onClick={() => setAbierto({ modo: 'nuevo' })}>
            <Plus className="size-4" /> Nuevo genset
          </button>
        )}
      </Encabezado>
      {abierto?.modo === 'nuevo' && <FormGenset onCerrar={() => setAbierto(null)} />}
      <div className={cn(TARJETA, 'overflow-x-auto')}>
        {isPending ? (
          <Cargando texto="Cargando gensets…" />
        ) : isError ? (
          <ErrorLectura texto="No se pudieron cargar los gensets." onReintentar={() => refetch()} />
        ) : data.length === 0 ? (
          <Vacio icono={<PlugZap className="size-5" />} texto="Todavía no hay gensets cargados." />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-borde bg-fondo">
              <tr>
                <th className={TH}>Código</th>
                <th className={TH}>Marca y modelo</th>
                <th className={TH}>N.º de serie</th>
                <th className={TH}>Instalado en</th>
                <th className={TH}>Combustible</th>
                <th className={TH}>Estado</th>
                {puede && <th className={TH} />}
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {data.map((g) => {
                const modo = abierto && abierto.modo !== 'nuevo' && abierto.g.id === g.id ? abierto.modo : null;
                return (
                  <FilaGenset
                    key={g.id}
                    g={g}
                    c={combustible?.find((x) => x.gensetId === g.id)}
                    zona={zonaHoraria}
                    puede={puede}
                    modo={modo}
                    onAbrir={setAbierto}
                  />
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function FilaGenset({
  g,
  c,
  zona,
  puede,
  modo,
  onAbrir,
}: {
  g: Genset;
  c: GensetCombustible | undefined;
  zona: string;
  puede: boolean;
  modo: Modo | null;
  onAbrir: (a: Abierto) => void;
}) {
  const boton = 'mr-3 inline-flex items-center gap-1 text-xs text-marca hover:underline';
  return (
    <>
      <tr>
        <td className={cn(TD, 'font-mono font-semibold')}>
          <NombreEnlazado tipo="genset" id={g.id} className="text-marca hover:underline">
            {g.codigo}
          </NombreEnlazado>
        </td>
        <td className={TD}>{[g.marca, g.modelo].filter(Boolean).join(' ') || '—'}</td>
        <td className={cn(TD, 'font-mono text-xs')}>{g.numeroSerie ?? '—'}</td>
        <td className={TD}>
          {g.semiPatente ? (
            <>
              <span className="font-mono font-semibold">{g.semiPatente}</span>{' '}
              <span className="text-xs text-tinta-suave">desde {diaHora(g.instaladoDesde, zona)}</span>
            </>
          ) : (
            <span className="text-tinta-suave">Sin instalar</span>
          )}
        </td>
        <td className={TD}>
          <NombreEnlazado tipo="genset" id={g.id} className="inline-flex flex-wrap items-center gap-1.5 hover:underline">
            <Fuel className="size-3.5 text-tinta-suave" />
            {c?.porCerrar ? <Chip tono="alerta">{c.porCerrar} para cerrar</Chip> : null}
            {c?.vueltaDesde ? (
              <span className="text-xs text-tinta-suave">
                Lleno desde {diaHora(c.vueltaDesde, zona)}
                {c.vueltaChofer ? ` · ${c.vueltaChofer}` : ''}
              </span>
            ) : (
              !c?.porCerrar && <span className="text-xs text-tinta-suave">Ver combustible</span>
            )}
          </NombreEnlazado>
        </td>
        <td className={TD}>{g.estado === 'activo' ? <Chip tono="exito">Activo</Chip> : <Chip tono="neutro">Baja</Chip>}</td>
        {puede && (
          <td className={cn(TD, 'text-right whitespace-nowrap')}>
            {g.estado === 'activo' && (
              <button type="button" className={boton} onClick={() => onAbrir({ modo: 'instalar', g })}>
                <PlugZap className="size-3.5" /> {g.semiId ? 'Mover' : 'Instalar'}
              </button>
            )}
            {g.semiId && (
              <button type="button" className={boton} onClick={() => onAbrir({ modo: 'retirar', g })}>
                <Unplug className="size-3.5" /> Retirar
              </button>
            )}
            <button type="button" className={boton} onClick={() => onAbrir({ modo: 'editar', g })}>
              <Pencil className="size-3.5" /> Editar
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-marca hover:underline"
              onClick={() => onAbrir({ modo: 'eliminar', g })}
            >
              <Trash2 className="size-3.5" /> Eliminar
            </button>
          </td>
        )}
      </tr>
      {modo && (
        <tr>
          <td colSpan={7} className="px-3 pb-3">
            {modo === 'editar' && <FormGenset g={g} onCerrar={() => onAbrir(null)} />}
            {modo === 'eliminar' && <EliminarGenset g={g} onCerrar={() => onAbrir(null)} />}
            {modo === 'instalar' && <InstalarGenset g={g} onCerrar={() => onAbrir(null)} />}
            {modo === 'retirar' && <RetirarGenset g={g} onCerrar={() => onAbrir(null)} />}
          </td>
        </tr>
      )}
    </>
  );
}

function FormGenset({ g, onCerrar }: { g?: Genset; onCerrar: () => void }) {
  const guardar = useGuardarGenset();
  const { error, enviar, campo } = useEnvio();
  const [v, setV] = useState({
    codigo: g?.codigo ?? '',
    marca: g?.marca ?? '',
    modelo: g?.modelo ?? '',
    numeroSerie: g?.numeroSerie ?? '',
    estado: g?.estado ?? ('activo' as const),
    observaciones: g?.observaciones ?? '',
    capacidadL: g?.capacidadL === null || g?.capacidadL === undefined ? '' : String(g.capacidadL).replace('.', ','),
    consumoLh: g?.consumoLh === null || g?.consumoLh === undefined ? '' : String(g.consumoLh).replace('.', ','),
  });
  const set = (k: 'codigo' | 'marca' | 'modelo' | 'numeroSerie' | 'observaciones' | 'capacidadL' | 'consumoLh') => (e: { target: { value: string } }) =>
    setV({ ...v, [k]: e.target.value });
  return (
    <Panel
      titulo={g ? `Editar ${g.codigo}` : 'Nuevo genset'}
      explicacion="Un genset instalado no se da de baja: primero se retira del semi. La capacidad y el consumo promedio sirven para el cierre de su combustible."
      error={error}
      ocupado={guardar.isPending}
      textoBoton={g ? 'Guardar cambios' : 'Dar de alta'}
      onCerrar={onCerrar}
      onConfirmar={() => enviar(guardar.mutateAsync({ ...v, id: g?.id ?? null, versionFila: g?.versionFila ?? null }), onCerrar)}
    >
      <Campo label="Código *" error={campo('codigo')}>
        <input className="uppercase" maxLength={30} value={v.codigo} onChange={set('codigo')} />
      </Campo>
      <Campo label="Marca" error={campo('marca')}>
        <input maxLength={60} value={v.marca} onChange={set('marca')} />
      </Campo>
      <Campo label="Modelo" error={campo('modelo')}>
        <input maxLength={60} value={v.modelo} onChange={set('modelo')} />
      </Campo>
      <Campo label="N.º de serie" error={campo('numeroSerie')}>
        <input maxLength={60} value={v.numeroSerie} onChange={set('numeroSerie')} />
      </Campo>
      <Campo label="Estado" error={campo('estado')}>
        <select value={v.estado} onChange={(e) => setV({ ...v, estado: e.target.value as 'activo' | 'baja' })}>
          <option value="activo">Activo</option>
          <option value="baja">Baja</option>
        </select>
      </Campo>
      <Campo label="Capacidad del tanque (L)" error={campo('capacidadL')}>
        <input inputMode="decimal" value={v.capacidadL} onChange={set('capacidadL')} />
      </Campo>
      <Campo label="Consumo promedio (L/h)" error={campo('consumoLh')} ayuda="Litros por hora de horómetro. Se compara en cada cierre.">
        <input inputMode="decimal" value={v.consumoLh} onChange={set('consumoLh')} />
      </Campo>
      <Campo label="Observaciones" error={campo('observaciones')}>
        <input maxLength={500} value={v.observaciones} onChange={set('observaciones')} />
      </Campo>
    </Panel>
  );
}

function InstalarGenset({ g, onCerrar }: { g: Genset; onCerrar: () => void }) {
  const instalar = useInstalarGenset();
  const { data: semis } = useSemis();
  const { error, enviar, campo } = useEnvio();
  const [semiId, setSemiId] = useState('');
  return (
    <Panel
      titulo={g.semiId ? `Mover ${g.codigo}` : `Instalar ${g.codigo}`}
      explicacion="Queda instalado desde ahora. Si estaba en otro semi, o el semi tenía otro genset, esas instalaciones se cierran en este momento."
      error={error}
      ocupado={instalar.isPending}
      textoBoton="Instalar"
      onCerrar={onCerrar}
      onConfirmar={() => enviar(instalar.mutateAsync({ gensetId: g.id, semiId }), onCerrar)}
    >
      <Campo label="Semi *" error={campo('semiId')}>
        <select value={semiId} onChange={(e) => setSemiId(e.target.value)}>
          <option value="">Elegí…</option>
          {semis
            ?.filter((s) => s.id !== g.semiId)
            .map((s) => (
              <option key={s.id} value={s.id}>
                {s.patente}
              </option>
            ))}
        </select>
      </Campo>
    </Panel>
  );
}

function RetirarGenset({ g, onCerrar }: { g: Genset; onCerrar: () => void }) {
  const retirar = useRetirarGenset();
  const { error, enviar } = useEnvio();
  return (
    <Panel
      titulo={`Retirar ${g.codigo} de ${g.semiPatente}`}
      explicacion="El semi queda sin genset desde ahora. La instalación queda en la historia."
      error={error}
      ocupado={retirar.isPending}
      textoBoton="Retirar"
      onCerrar={onCerrar}
      onConfirmar={() => enviar(retirar.mutateAsync({ semiId: g.semiId ?? 0 }), onCerrar)}
    />
  );
}

function EliminarGenset({ g, onCerrar }: { g: Genset; onCerrar: () => void }) {
  const eliminar = useEliminarGenset();
  const { error, enviar } = useEnvio();
  return (
    <Panel
      titulo={`Eliminar ${g.codigo}`}
      explicacion="Para un genset cargado por error. Si se dejó de usar, mejor marcalo como Baja."
      error={error}
      ocupado={eliminar.isPending}
      textoBoton="Eliminar"
      onCerrar={onCerrar}
      onConfirmar={() => enviar(eliminar.mutateAsync({ id: g.id, versionFila: g.versionFila }), onCerrar)}
    />
  );
}
