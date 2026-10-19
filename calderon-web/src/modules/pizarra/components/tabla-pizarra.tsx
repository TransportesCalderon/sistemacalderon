'use client';

import { Fragment, memo, useState } from 'react';
import { StickyNote } from 'lucide-react';
import { Panel, useEnvio } from '@/modules/catalogos/components/comun';
import { cn } from '@/shared/lib/cn';
import { Campo } from '@/shared/ui/campo';
import { nivelFila } from '../domain/pizarra.filtros';
import { ESTADO_INFO, type ColumnaAccesorio, type FilaPizarra, type Lugar } from '../domain/pizarra.types';
import { useGuardarEdicionPizarra } from '../queries/hooks';
import { alertaDe, claseAlerta, diaCorto, diaDeFecha, diaHora, hace } from './formato';

const TH =
  'sticky top-0 z-10 border-b border-[#c9d1dc] bg-[#f2f4f7] px-2 py-1.5 text-left text-[11px] font-semibold tracking-wide text-tinta-suave uppercase whitespace-nowrap';
const TD = 'px-2 whitespace-nowrap overflow-hidden text-ellipsis max-w-[220px]';

/** Antigüedad a partir de la cual la ubicación se marca en ámbar. */
const UBICACION_VIEJA_MS = 2 * 3_600_000;

export function TablaPizarra({
  filas,
  columnas,
  verAccesorios,
  grande,
  zona,
  puedeEditar,
  abierto,
  recientes,
  lugares,
  onAbrir,
}: {
  filas: FilaPizarra[];
  columnas: ColumnaAccesorio[];
  verAccesorios: boolean;
  grande: boolean;
  zona: string;
  puedeEditar: boolean;
  abierto: number | null;
  recientes: Set<number>;
  lugares: Lugar[];
  onAbrir: (id: number | null) => void;
}) {
  const acc = verAccesorios ? columnas : [];
  const total = 15 + acc.length;
  return (
    <table className={cn('w-full border-separate border-spacing-0', grande ? 'text-[17px]' : 'text-[13px]')}>
      <thead>
        <tr>
          <th className={cn(TH, 'w-8')} title="Alertas">
            !
          </th>
          <th className={TH}>Semi ↑</th>
          <th className={TH}>Tara</th>
          {acc.map((c) => (
            <th key={c.id} className={cn(TH, 'w-10 text-center')} title={c.nombre}>
              {c.sigla}
            </th>
          ))}
          <th className={TH}>Genset</th>
          <th className={TH}>Estado</th>
          <th className={TH}>Tractor</th>
          <th className={TH}>Chofer</th>
          <th className={TH}>Cliente</th>
          <th className={TH}>Producto</th>
          <th className={TH}>Contenedor</th>
          <th className={TH}>Salida</th>
          <th className={TH}>Dónde</th>
          <th className={TH}>Descarga</th>
          <th className={TH}>Próxima carga</th>
          <th className={cn(TH, 'w-8')} title="Observación" />
        </tr>
      </thead>
      <tbody>
        {filas.map((f) => (
          <Fragment key={f.semiId}>
            <Fila
              f={f}
              acc={acc}
              grande={grande}
              zona={zona}
              abierta={abierto === f.semiId}
              reciente={recientes.has(f.semiId)}
              onAbrir={onAbrir}
            />
            {abierto === f.semiId && (
              <tr>
                <td colSpan={total} className="border-b-2 border-[#b8cde6] bg-[#f7f9fc] px-4 py-3">
                  <DetalleUnidad
                    f={f}
                    columnas={columnas}
                    zona={zona}
                    puedeEditar={puedeEditar}
                    lugares={lugares}
                    onCerrar={() => onAbrir(null)}
                  />
                </td>
              </tr>
            )}
          </Fragment>
        ))}
      </tbody>
      {acc.length > 0 && (
        <tfoot>
          <tr className="bg-[#f2f4f7] text-xs font-semibold text-tinta-suave">
            <td className="px-2 py-1.5" colSpan={3}>
              Total entregado
            </td>
            {acc.map((c) => (
              <td key={c.id} className="px-2 py-1.5 text-center tabular-nums" title={`${c.semisConDato} semis con dato`}>
                {c.total}
              </td>
            ))}
            <td colSpan={12} />
          </tr>
        </tfoot>
      )}
    </table>
  );
}

const Fila = memo(function Fila({
  f,
  acc,
  grande,
  zona,
  abierta,
  reciente,
  onAbrir,
}: {
  f: FilaPizarra;
  acc: ColumnaAccesorio[];
  grande: boolean;
  zona: string;
  abierta: boolean;
  reciente: boolean;
  onAbrir: (id: number | null) => void;
}) {
  const nivel = nivelFila(f);
  const info = ESTADO_INFO[f.estado];
  const aTara = alertaDe(f.alertas, 'tara_no_valida', 'tara_por_vencer', 'tara_proxima', 'sin_tara');
  const aTractor = alertaDe(f.alertas, 'tractor_no_activo', 'tractor_duplicado');
  const aChofer = alertaDe(f.alertas, 'chofer_no_activo', 'chofer_duplicado');
  const aSalida = alertaDe(f.alertas, 'asignado_sin_arrancar');
  const aDescarga = alertaDe(f.alertas, 'descarga_vencida');
  const aSenal = alertaDe(f.alertas, 'sin_senal');
  const aEstado = alertaDe(f.alertas, 'taller_con_viaje');
  const ubicacionVieja = f.ubicacionTs && Date.now() - new Date(f.ubicacionTs).getTime() > UBICACION_VIEJA_MS;
  const hoy = f.descarga && diaCorto(f.descarga, zona) === diaCorto(new Date().toISOString(), zona);
  const fondo = abierta ? 'bg-[#e7f0fa]' : reciente ? 'bg-[#fff8d6]' : nivel === 'critico' ? 'bg-[#fff6f5]' : 'bg-panel';

  return (
    <tr
      className={cn(
        'cursor-pointer transition-colors duration-700 hover:bg-[#eef3fa] [&>td]:border-b [&>td]:border-borde',
        fondo,
        grande ? 'h-11' : 'h-[34px]',
      )}
      onClick={() => onAbrir(abierta ? null : f.semiId)}
      aria-expanded={abierta}
    >
      <td className={cn(TD, 'relative pl-3')}>
        {nivel && <span className={cn('absolute inset-y-0 left-0 w-1', nivel === 'critico' ? 'bg-error' : 'bg-[#fdb022]')} />}
        {f.alertas.length > 0 && (
          <span
            title={f.alertas.map((a) => a.texto).join(' · ')}
            className={cn(
              'inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-bold',
              nivel === 'critico' ? 'bg-error text-white' : 'bg-[#fdb022] text-[#3d2a00]',
            )}
          >
            {f.alertas.length}
          </span>
        )}
      </td>
      <td className={TD}>
        <button type="button" className="font-mono font-semibold tracking-wide text-tinta outline-none focus-visible:underline">
          {f.patente}
        </button>
      </td>
      <td className={cn(TD, claseAlerta(aTara))} title={aTara?.texto}>
        {f.taraFecha ? `${diaDeFecha(f.taraFecha)} · ${f.taraDias} d` : 'sin tara'}
      </td>
      {acc.map((c) => {
        const v = f.accesorios[c.id];
        return (
          <td key={c.id} className={cn(TD, 'text-center tabular-nums', v === 0 && 'text-tinta-suave/60')} title={c.nombre}>
            {v ?? ''}
          </td>
        );
      })}
      <td className={cn(TD, 'font-mono text-xs')}>{f.gensetCodigo ?? '—'}</td>
      <td className={TD} title={aEstado?.texto}>
        <span
          className={cn(
            'inline-flex h-5 items-center rounded-[3px] px-1.5 text-xs font-semibold whitespace-nowrap',
            info.clase,
            aEstado && 'ring-2 ring-error',
            grande && 'h-7 px-2 text-sm',
          )}
        >
          {info.etiqueta}
        </span>
      </td>
      <td className={cn(TD, 'font-mono', claseAlerta(aTractor))} title={aTractor?.texto}>
        {f.tractor ?? '—'}
        {aTractor?.codigo === 'tractor_duplicado' && ' ×2'}
      </td>
      <td className={cn(TD, claseAlerta(aChofer))} title={aChofer?.texto}>
        {f.chofer ?? '—'}
        {aChofer?.codigo === 'chofer_duplicado' && ' ×2'}
      </td>
      <td className={cn(TD, 'font-semibold')}>{f.cliente ?? '—'}</td>
      <td className={TD}>{f.producto ?? '—'}</td>
      <td className={cn(TD, 'font-mono text-xs')}>{f.contenedor ?? '—'}</td>
      <td className={cn(TD, claseAlerta(aSalida))} title={aSalida?.texto}>
        {f.salidaTs ? `${diaCorto(f.salidaTs, zona)} ${f.salidaLugar ?? ''}` : '—'}
      </td>
      <td className={cn(TD, aSenal || ubicacionVieja ? 'text-alerta' : '')} title={aSenal?.texto}>
        {f.ubicacion ?? '—'}
        {ubicacionVieja && <span className="ml-1 text-[11px]">{hace(f.ubicacionTs)}</span>}
      </td>
      <td className={cn(TD, aDescarga ? 'font-bold text-error' : hoy ? 'font-bold text-[#0b4a85]' : '')} title={aDescarga?.texto}>
        {diaHora(f.descarga, zona)}
      </td>
      <td className={TD}>
        {f.proxima ? (
          <>
            <span className="font-medium">{f.proxima.cliente}</span>
            {f.proxima.producto && ` · ${f.proxima.producto}`}
            {f.proxima.fecha && ` · ${diaCorto(f.proxima.fecha, zona)}`}
            {f.proxima.lugar && ` ${f.proxima.lugar}`}
          </>
        ) : (
          <span className="text-tinta-suave">—</span>
        )}
      </td>
      <td className={TD} title={f.observacion ?? undefined}>
        {f.observacion && <StickyNote className="size-3.5 text-tinta-suave" aria-label="Tiene observación" />}
      </td>
    </tr>
  );
});

function DetalleUnidad({
  f,
  columnas,
  zona,
  puedeEditar,
  lugares,
  onCerrar,
}: {
  f: FilaPizarra;
  columnas: ColumnaAccesorio[];
  zona: string;
  puedeEditar: boolean;
  lugares: Lugar[];
  onCerrar: () => void;
}) {
  const [editando, setEditando] = useState(false);
  return (
    <div className="grid gap-4 text-[13px] lg:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.3fr)]">
      <Bloque titulo="Viaje">
        <Dato e="Servicio">{f.numeroServicio ?? 'Sin viaje asignado'}</Dato>
        <Dato e="Salida">{f.salidaTs ? `${diaHora(f.salidaTs, zona)} · ${f.salidaLugar ?? ''}` : '—'}</Dato>
        <Dato e="Destino">{f.destino ?? '—'}</Dato>
        <Dato e="Descarga">{diaHora(f.descarga, zona)}</Dato>
        <Dato e="Tara pedida">{f.taraMaxDias ? `${f.taraMaxDias} d` : 'No pide'}</Dato>
      </Bloque>
      <Bloque titulo="Semi y equipo">
        <Dato e="Tipo">{f.tipo}</Dato>
        <Dato e="Tara">{f.taraFecha ? `${diaDeFecha(f.taraFecha)} (hace ${f.taraDias} d)` : 'Sin tara'}</Dato>
        <Dato e="Genset">{f.gensetCodigo ? `${f.gensetCodigo} · desde ${diaCorto(f.gensetDesde, zona)}` : 'Sin genset'}</Dato>
        <Dato e="Dónde">
          {f.ubicacion ?? '—'} {f.ubicacionTs && <span className="text-tinta-suave">({hace(f.ubicacionTs)})</span>}
        </Dato>
        <Dato e="Accesorios">
          {columnas
            .filter((c) => f.accesorios[c.id] !== undefined)
            .map((c) => `${c.nombre} ${f.accesorios[c.id]}`)
            .join(' · ') || 'Sin datos'}
        </Dato>
      </Bloque>
      <Bloque titulo="Próxima carga">
        {f.proxima ? (
          <>
            <Dato e="Cliente">{f.proxima.cliente ?? '—'}</Dato>
            <Dato e="Producto">{f.proxima.producto ?? '—'}</Dato>
            <Dato e="Carga">{`${diaHora(f.proxima.fecha, zona)} · ${f.proxima.lugar ?? ''}`}</Dato>
            <Dato e="Tara pedida">{f.proxima.taraMaxDias ? `${f.proxima.taraMaxDias} d` : 'No pide'}</Dato>
          </>
        ) : (
          <p className="text-tinta-suave">Sin próxima carga asignada.</p>
        )}
      </Bloque>
      <Bloque titulo="Alertas y observación">
        {f.alertas.length === 0 && <p className="text-tinta-suave">Sin alertas.</p>}
        {f.alertas.map((a) => (
          <p key={a.codigo} className={cn('flex items-center gap-2', a.nivel === 'critico' ? 'text-error' : 'text-alerta')}>
            <span className={cn('size-2 shrink-0 rounded-full', a.nivel === 'critico' ? 'bg-error' : 'bg-[#fdb022]')} />
            {a.texto}
          </p>
        ))}
        <p className="mt-2 whitespace-pre-line text-tinta">{f.observacion ?? <span className="text-tinta-suave">Sin observación.</span>}</p>
        {f.observacion && (
          <p className="text-xs text-tinta-suave">
            {f.observacionPor ?? 'Sin usuario'} · {diaHora(f.observacionEn, zona)}
          </p>
        )}
        {puedeEditar && !editando && (
          <button type="button" className="mt-2 text-xs font-medium text-marca hover:underline" onClick={() => setEditando(true)}>
            Editar lugar, observación y accesorios
          </button>
        )}
      </Bloque>
      {editando && (
        <div className="lg:col-span-4" onClick={(e) => e.stopPropagation()}>
          <EditarUnidad
            f={f}
            columnas={columnas}
            lugares={lugares}
            onCerrar={() => {
              setEditando(false);
              onCerrar();
            }}
          />
        </div>
      )}
    </div>
  );
}

function EditarUnidad({
  f,
  columnas,
  lugares,
  onCerrar,
}: {
  f: FilaPizarra;
  columnas: ColumnaAccesorio[];
  lugares: Lugar[];
  onCerrar: () => void;
}) {
  const guardar = useGuardarEdicionPizarra();
  const { error, enviar, campo } = useEnvio();
  const lugarActual = f.ubicacionFuente === 'playa' ? (lugares.find((l) => l.nombre === f.ubicacion)?.id ?? '') : '';
  const [lugarId, setLugarId] = useState<string>(String(lugarActual));
  const [observacion, setObservacion] = useState(f.observacion ?? '');
  const [cant, setCant] = useState<Record<string, string>>(
    Object.fromEntries(columnas.map((c) => [String(c.id), f.accesorios[c.id] === undefined ? '' : String(f.accesorios[c.id])])),
  );
  return (
    <Panel
      titulo={`Editar ${f.patente}`}
      explicacion="Lugar en playa (cuando está desenganchado), observación y accesorios que tiene el semi. El viaje se cambia desde Operación. Un accesorio vacío queda «sin dato»; 0 significa que no tiene."
      error={error}
      ocupado={guardar.isPending}
      textoBoton="Guardar"
      onCerrar={onCerrar}
      onConfirmar={() =>
        enviar(
          guardar.mutateAsync({
            semiId: f.semiId,
            versionFila: f.versionFila,
            lugarId,
            observacion,
            accesorios: Object.fromEntries(Object.entries(cant).map(([k, v]) => [k, v.trim() === '' ? null : v.trim()])),
          }),
          onCerrar,
        )
      }
    >
      <Campo label="Lugar en playa" error={campo('lugarId')} ayuda="Enchufe, PTM, base… Se usa si no hay GPS ni un evento abierto.">
        <select value={lugarId} onChange={(e) => setLugarId(e.target.value)}>
          <option value="">Sin lugar</option>
          {lugares.map((l) => (
            <option key={l.id} value={l.id}>
              {l.nombre}
            </option>
          ))}
        </select>
      </Campo>
      <div className="sm:col-span-2">
        <Campo label="Observación" error={campo('observacion')}>
          <textarea rows={2} maxLength={500} value={observacion} onChange={(e) => setObservacion(e.target.value)} />
        </Campo>
      </div>
      {columnas.map((c) => (
        <Campo key={c.id} label={c.nombre} error={campo(`accesorios.${c.id}`)}>
          <input
            inputMode="numeric"
            placeholder="sin dato"
            value={cant[String(c.id)] ?? ''}
            onChange={(e) => setCant({ ...cant, [String(c.id)]: e.target.value })}
          />
        </Campo>
      ))}
    </Panel>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="space-y-1">
      <h4 className="text-[11px] font-semibold tracking-wide text-tinta-suave uppercase">{titulo}</h4>
      {children}
    </section>
  );
}

function Dato({ e, children }: { e: string; children: React.ReactNode }) {
  return (
    <p className="grid grid-cols-[92px_1fr] gap-2">
      <span className="text-tinta-suave">{e}</span>
      <span className="font-medium text-tinta">{children}</span>
    </p>
  );
}
