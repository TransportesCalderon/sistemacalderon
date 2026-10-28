'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Search, Users } from 'lucide-react';
import { TD, TH, useEnvio } from '@/modules/catalogos/components/comun';
import { Cargando, Chip, Encabezado, ErrorBase, ErrorLectura, Vacio } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia } from '@/shared/lib/fechas';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { ETIQUETA_ACTIVIDAD, ETIQUETA_ORIGEN, ORIGENES } from '../domain/ventas.types';
import { useEmpresas, useGuardarEmpresa } from '../queries/hooks';
import { ChipEtapa, PAISES } from './comun';
import { NombreEnlazado } from '@/shared/ui/nombre-enlazado';

const FILTROS = [
  { id: null, texto: 'Todas' },
  { id: 'prospectos', texto: 'Prospectos' },
  { id: 'clientes', texto: 'Clientes' },
  { id: 'descartadas', texto: 'Descartadas' },
] as const;

/** Ventas › Clientes y prospectos: la lista, con su etapa y la próxima actividad. */
export function EmpresasPantalla() {
  const puede = useCan('ventas.empresas:editar');
  const [solo, setSolo] = useState<string | null>(null);
  const [texto, setTexto] = useState('');
  const [nueva, setNueva] = useState(false);
  const { data, isLoading, isError, error, refetch } = useEmpresas(texto.trim() || null, solo);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Encabezado titulo="Clientes y prospectos" subtitulo="Ventas" />
        {puede && (
          <button type="button" className={BOTON_PRIMARIO} onClick={() => setNueva(!nueva)}>
            <Plus className="size-4" /> Nuevo prospecto
          </button>
        )}
      </div>
      {nueva && <FormNueva onListo={() => setNueva(false)} />}
      <div className="flex flex-wrap items-center gap-2">
        {FILTROS.map((f) => (
          <button
            key={f.texto}
            type="button"
            onClick={() => setSolo(f.id)}
            className={cn(
              'rounded-full border px-3 py-1.5 text-sm',
              solo === f.id ? 'border-marca bg-marca-suave font-medium text-marca' : 'border-borde text-tinta-suave hover:bg-hover',
            )}
          >
            {f.texto}
          </button>
        ))}
        <label className="ml-auto flex items-center gap-2 rounded-md border border-borde bg-panel px-2">
          <Search className="size-4 text-tinta-suave" />
          <input className="h-9 w-56 bg-transparent text-sm outline-none" placeholder="Buscar por nombre" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </label>
      </div>

      {isLoading ? (
        <Cargando texto="Leyendo las empresas…" />
      ) : isError || !data ? (
        <ErrorLectura texto="No se pudieron leer las empresas." onReintentar={() => void refetch()} error={error} />
      ) : data.length === 0 ? (
        <Vacio icono={<Users className="size-6" />} texto="No hay empresas con ese filtro." />
      ) : (
        <div className={cn(TARJETA, 'overflow-x-auto')}>
          <table className="w-full min-w-[760px] text-sm">
            <thead>
              <tr className="border-b border-borde">
                <th className={TH}>Empresa</th>
                <th className={TH}>Negocio</th>
                <th className={TH}>Próxima actividad</th>
                <th className={TH}>Último contacto</th>
                <th className={TH}>Responsable</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {data.map((e) => (
                <tr key={e.id} className="hover:bg-hover">
                  <td className={TD}>
                    <NombreEnlazado tipo="empresa" id={e.id} className="font-medium text-marca hover:underline">
                      {e.nombre}
                    </NombreEnlazado>
                    <span className="ml-2">
                      {e.clienteId ? <Chip tono="exito">Cliente</Chip> : e.descartada ? <Chip tono="neutro">Descartada</Chip> : <Chip tono="marca">Prospecto</Chip>}
                    </span>
                    {(e.rubro || e.pais) && <span className="block text-xs text-tinta-suave">{[e.rubro, e.pais].filter(Boolean).join(' · ')}</span>}
                  </td>
                  <td className={TD}>
                    {e.etapa ? <ChipEtapa etapa={e.etapa} /> : <span className="text-tinta-suave">—</span>}
                    {e.negociosAbiertos > 1 && <span className="ml-1 text-xs text-tinta-suave">+{e.negociosAbiertos - 1}</span>}
                  </td>
                  <td className={TD}>
                    {e.proxima ? (
                      <>
                        {formatearFechaDia(e.proxima.fecha)} · {ETIQUETA_ACTIVIDAD[e.proxima.tipo]}
                        <span className="block text-xs text-tinta-suave">{e.proxima.titulo}</span>
                      </>
                    ) : (
                      <span className="text-tinta-suave">Nada agendado</span>
                    )}
                  </td>
                  <td className={cn(TD, 'tabular-nums')}>{e.ultima ? formatearFechaDia(e.ultima) : '—'}</td>
                  <td className={TD}>{e.responsable ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FormNueva({ onListo }: { onListo: () => void }) {
  const router = useRouter();
  const guardar = useGuardarEmpresa();
  const envio = useEnvio();
  const [v, setV] = useState({ nombre: '', pais: '', rubro: '', origen: '', notas: '' });
  return (
    <div className={cn(TARJETA, 'grid gap-3 p-4 sm:grid-cols-4')}>
      <Campo label="Empresa" error={envio.campo('nombre')}>
        <input value={v.nombre} onChange={(e) => setV({ ...v, nombre: e.target.value })} />
      </Campo>
      <Campo label="País">
        <select value={v.pais} onChange={(e) => setV({ ...v, pais: e.target.value })}>
          <option value="">—</option>
          {PAISES.map((p) => (
            <option key={p.codigo} value={p.codigo}>
              {p.nombre}
            </option>
          ))}
        </select>
      </Campo>
      <Campo label="Rubro">
        <input value={v.rubro} placeholder="Fruta, vino, minería…" onChange={(e) => setV({ ...v, rubro: e.target.value })} />
      </Campo>
      <Campo label="Cómo llegó">
        <select value={v.origen} onChange={(e) => setV({ ...v, origen: e.target.value })}>
          <option value="">—</option>
          {ORIGENES.filter((o) => o !== 'cliente_existente').map((o) => (
            <option key={o} value={o}>
              {ETIQUETA_ORIGEN[o]}
            </option>
          ))}
        </select>
      </Campo>
      <div className="sm:col-span-4">
        <Campo label="Notas">
          <textarea className="h-20 py-2" value={v.notas} onChange={(e) => setV({ ...v, notas: e.target.value })} />
        </Campo>
      </div>
      <div className="flex gap-2 sm:col-span-4">
        <ErrorBase error={envio.error} />
        <button
          type="button"
          className={BOTON_PRIMARIO}
          disabled={guardar.isPending}
          onClick={async () => {
            envio.setError(null);
            const r = await guardar.mutateAsync({
              id: null,
              nombre: v.nombre,
              pais: v.pais || null,
              rubro: v.rubro,
              origen: v.origen,
              notas: v.notas,
              responsableId: null,
            });
            if (!r.ok) return envio.setError(r.error);
            onListo();
            router.push(`/ventas/empresas/${r.data}`);
          }}
        >
          Crear y abrir
        </button>
        <button type="button" className={BOTON_SECUNDARIO} onClick={onListo}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
