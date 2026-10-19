'use client';

import { useState } from 'react';
import { Pencil, Plus, Trash2, Truck } from 'lucide-react';
import { Panel, TD, TH, useEnvio } from '@/modules/catalogos/components/comun';
import { usePaises } from '@/modules/catalogos/queries/hooks';
import { Cargando, Chip, Encabezado, ErrorLectura, Vacio } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { cn } from '@/shared/lib/cn';
import { BOTON_PRIMARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { ESTADO_SEMI_ETIQUETA, ESTADOS_SEMI, TIPO_SEMI_ETIQUETA, TIPOS_SEMI, type Semi } from '../domain/pizarra.types';
import { useBajaSemi, useGuardarSemi, useSemis } from '../queries/hooks';
import { diaDeFecha } from './formato';

type Abierto = { modo: 'nuevo' } | { modo: 'editar' | 'baja'; s: Semi } | null;

/** Flota > Semirremolques: los semis que se usan (cada uno es una fila de la Pizarra Azul). */
export function SemisPantalla() {
  const puede = useCan('flota.camiones:editar');
  const { data, isPending, isError, refetch } = useSemis();
  const [abierto, setAbierto] = useState<Abierto>(null);

  return (
    <div className="space-y-5">
      <Encabezado titulo="Semirremolques" subtitulo="Flota">
        {puede && (
          <button type="button" className={BOTON_PRIMARIO} onClick={() => setAbierto({ modo: 'nuevo' })}>
            <Plus className="size-4" /> Nuevo semi
          </button>
        )}
      </Encabezado>
      {abierto?.modo === 'nuevo' && <FormSemi onCerrar={() => setAbierto(null)} />}
      <div className={cn(TARJETA, 'overflow-x-auto')}>
        {isPending ? (
          <Cargando texto="Cargando semirremolques…" />
        ) : isError ? (
          <ErrorLectura texto="No se pudieron cargar los semirremolques." onReintentar={() => refetch()} />
        ) : data.length === 0 ? (
          <Vacio
            icono={<Truck className="size-5" />}
            texto="Todavía no hay semirremolques. Cargá los que se usan: cada uno es una fila de la Pizarra Azul."
          />
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-borde bg-fondo">
              <tr>
                <th className={TH}>Patente</th>
                <th className={TH}>Código</th>
                <th className={TH}>Tipo</th>
                <th className={TH}>Capacidad</th>
                <th className={TH}>Última tara</th>
                <th className={TH}>Estado</th>
                {puede && <th className={TH} />}
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {data.map((s) => {
                const modo = abierto && abierto.modo !== 'nuevo' && abierto.s.id === s.id ? abierto.modo : null;
                return <FilaSemi key={s.id} s={s} puede={puede} modo={modo} onAbrir={setAbierto} />;
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function FilaSemi({ s, puede, modo, onAbrir }: { s: Semi; puede: boolean; modo: 'editar' | 'baja' | null; onAbrir: (a: Abierto) => void }) {
  return (
    <>
      <tr>
        <td className={cn(TD, 'font-mono font-semibold text-tinta')}>{s.patente}</td>
        <td className={cn(TD, 'font-mono')}>{s.codigoInterno}</td>
        <td className={TD}>
          {TIPO_SEMI_ETIQUETA[s.tipo]} {s.tieneEquipoFrio && <Chip tono="marca">Equipo de frío</Chip>}
        </td>
        <td className={cn(TD, 'tabular-nums')}>{s.capacidadKg.toLocaleString('es-AR')} kg</td>
        <td className={TD}>
          {s.taraFecha ? diaDeFecha(s.taraFecha) + '/' + s.taraFecha.slice(0, 4) : <span className="text-alerta">Sin tara</span>}
        </td>
        <td className={TD}>
          <Chip tono={s.estado === 'activo' ? 'exito' : 'neutro'}>{ESTADO_SEMI_ETIQUETA[s.estado]}</Chip>
        </td>
        {puede && (
          <td className={cn(TD, 'text-right whitespace-nowrap')}>
            <button
              type="button"
              className="mr-3 inline-flex items-center gap-1 text-xs text-marca hover:underline"
              onClick={() => onAbrir({ modo: 'editar', s })}
            >
              <Pencil className="size-3.5" /> Editar
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1 text-xs text-marca hover:underline"
              onClick={() => onAbrir({ modo: 'baja', s })}
            >
              <Trash2 className="size-3.5" /> Dar de baja
            </button>
          </td>
        )}
      </tr>
      {modo && (
        <tr>
          <td colSpan={7} className="px-3 pb-3">
            {modo === 'editar' ? <FormSemi s={s} onCerrar={() => onAbrir(null)} /> : <BajaSemi s={s} onCerrar={() => onAbrir(null)} />}
          </td>
        </tr>
      )}
    </>
  );
}

function FormSemi({ s, onCerrar }: { s?: Semi; onCerrar: () => void }) {
  const guardar = useGuardarSemi();
  const { data: paises } = usePaises();
  const { error, enviar, campo } = useEnvio();
  const [v, setV] = useState({
    codigoInterno: s?.codigoInterno ?? '',
    patente: s?.patente ?? '',
    paisPatente: s?.paisPatente ?? 'CL',
    tipo: s?.tipo ?? 'plataforma',
    capacidadKg: s ? String(s.capacidadKg) : '',
    tieneEquipoFrio: s?.tieneEquipoFrio ?? false,
    estado: s?.estado ?? 'activo',
    taraFecha: s?.taraFecha ?? '',
  });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  return (
    <Panel
      titulo={s ? `Editar ${s.patente}` : 'Nuevo semirremolque'}
      explicacion="La fecha de la última tara se compara con lo que pide cada carga (por ejemplo, 30 o 90 días)."
      error={error}
      ocupado={guardar.isPending}
      textoBoton={s ? 'Guardar cambios' : 'Dar de alta'}
      onCerrar={onCerrar}
      onConfirmar={() =>
        enviar(
          guardar.mutateAsync({
            ...v,
            tipo: v.tipo as Semi['tipo'],
            estado: v.estado as Semi['estado'],
            id: s?.id ?? null,
            versionFila: s?.versionFila ?? null,
          }),
          onCerrar,
        )
      }
    >
      <Campo label="Patente *" error={campo('patente')}>
        <input className="uppercase" maxLength={12} value={v.patente} onChange={set('patente')} />
      </Campo>
      <Campo label="País de la patente *" error={campo('paisPatente')}>
        <select value={v.paisPatente} onChange={set('paisPatente')}>
          {paises?.map((p) => (
            <option key={p.codigo} value={p.codigo}>
              {p.nombre}
            </option>
          ))}
        </select>
      </Campo>
      <Campo label="Código interno *" error={campo('codigoInterno')} ayuda="Único; puede ser la misma patente.">
        <input className="uppercase" maxLength={30} value={v.codigoInterno} onChange={set('codigoInterno')} />
      </Campo>
      <Campo label="Tipo *" error={campo('tipo')}>
        <select value={v.tipo} onChange={set('tipo')}>
          {TIPOS_SEMI.map((t) => (
            <option key={t} value={t}>
              {TIPO_SEMI_ETIQUETA[t]}
            </option>
          ))}
        </select>
      </Campo>
      <Campo label="Capacidad (kg) *" error={campo('capacidadKg')}>
        <input inputMode="numeric" value={v.capacidadKg} onChange={set('capacidadKg')} />
      </Campo>
      <Campo label="Última tara" error={campo('taraFecha')}>
        <input type="date" value={v.taraFecha} onChange={set('taraFecha')} />
      </Campo>
      <Campo label="Estado" error={campo('estado')} ayuda="Fuera de servicio sigue en la Pizarra; para quitarlo, dalo de baja.">
        <select value={v.estado} onChange={set('estado')}>
          {ESTADOS_SEMI.map((e) => (
            <option key={e} value={e}>
              {ESTADO_SEMI_ETIQUETA[e]}
            </option>
          ))}
        </select>
      </Campo>
      <label className="flex items-center gap-2 self-end pb-2 text-sm text-tinta">
        <input
          type="checkbox"
          className="size-4 accent-marca"
          checked={v.tieneEquipoFrio}
          onChange={(e) => setV({ ...v, tieneEquipoFrio: e.target.checked })}
        />
        Tiene equipo de frío propio
      </label>
    </Panel>
  );
}

function BajaSemi({ s, onCerrar }: { s: Semi; onCerrar: () => void }) {
  const baja = useBajaSemi();
  const { error, enviar } = useEnvio();
  return (
    <Panel
      titulo={`Dar de baja ${s.patente}`}
      explicacion="Sale de la Pizarra y de las listas (vendido o que no se usa más). Su historia se conserva."
      error={error}
      ocupado={baja.isPending}
      textoBoton="Dar de baja"
      onCerrar={onCerrar}
      onConfirmar={() => enviar(baja.mutateAsync({ id: s.id, versionFila: s.versionFila }), onCerrar)}
    />
  );
}
