'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Check, ChevronLeft, Pencil, Plus, Star, Trash2, UserCheck } from 'lucide-react';
import { useEnvio } from '@/modules/catalogos/components/comun';
import { Cargando, Chip, ErrorBase, ErrorLectura } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia, hoyEnZona } from '@/shared/lib/fechas';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import {
  ETAPAS,
  ETIQUETA_ACTIVIDAD,
  ETIQUETA_ETAPA,
  ETIQUETA_ORIGEN,
  ORIGENES,
  usd,
  type Contacto,
  type Empresa,
  type Etapa,
  type Negocio,
  type TipoActividad,
} from '../domain/ventas.types';
import {
  useCompletarActividad,
  useEmpresa,
  useEmpresas,
  useGuardarActividad,
  useGuardarContacto,
  useGuardarEmpresa,
  useGuardarNegocio,
  useHacerCliente,
  useMoverNegocio,
  useQuitarActividad,
  useQuitarContacto,
  useTarifario,
} from '../queries/hooks';
import { ChipCotizacion, ChipEtapa, ChipFactura, PAISES } from './comun';
import { SoloEnPagina, useNombreFicha } from '@/modules/core/fichas/contexto';
import { NombreEnlazado } from '@/shared/ui/nombre-enlazado';

/** Ventas › ficha de una empresa: datos, contactos, negocios, actividades, cotizaciones y facturas. */
export function EmpresaFicha({ id }: { id: number }) {
  const { data: e, isLoading, isError, error, refetch } = useEmpresa(id);
  const puede = useCan('ventas.empresas:editar');
  const puedeCotizar = useCan('ventas.cotizaciones:editar');
  const [editando, setEditando] = useState(false);
  useNombreFicha(e?.nombre);

  if (isLoading) return <Cargando texto="Abriendo la empresa…" />;
  if (isError) return <ErrorLectura texto="No se pudo leer la empresa." onReintentar={() => void refetch()} error={error} />;
  if (!e) return <p className="text-sm text-tinta-suave">La empresa no existe.</p>;

  return (
    <div className="space-y-4">
      <SoloEnPagina>
        <Link href="/cotizaciones/clientes" className="inline-flex items-center gap-1 text-sm text-marca hover:underline">
          <ChevronLeft className="size-4" /> Clientes y prospectos
        </Link>
      </SoloEnPagina>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-tinta">
            {e.nombre}{' '}
            {e.clienteId ? <Chip tono="exito">Cliente</Chip> : e.descartada ? <Chip tono="neutro">Descartada</Chip> : <Chip tono="marca">Prospecto</Chip>}
          </h1>
          <p className="text-sm text-tinta-suave">
            {[e.rubro, PAISES.find((p) => p.codigo === e.pais)?.nombre, e.origen && ETIQUETA_ORIGEN[e.origen], e.responsable && `Responsable: ${e.responsable}`]
              .filter(Boolean)
              .join(' · ')}
          </p>
          {e.cliente && (
            <p className="text-sm text-tinta-suave">
              {e.cliente.razonSocial} · {e.cliente.identificadorFiscal} · paga a {e.cliente.condicionPagoDias} días
            </p>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {puedeCotizar && (
            <Link href={`/cotizaciones/nueva?empresa=${e.id}`} className={BOTON_PRIMARIO}>
              <Plus className="size-4" /> Cotizar
            </Link>
          )}
          {puede && (
            <button type="button" className={BOTON_SECUNDARIO} onClick={() => setEditando(!editando)}>
              <Pencil className="size-4" /> Editar datos
            </button>
          )}
        </div>
      </div>
      {editando && <FormDatos e={e} onListo={() => setEditando(false)} />}
      {e.notas && !editando && <p className="rounded-lg bg-fondo/60 p-3 text-sm whitespace-pre-line text-tinta">{e.notas}</p>}
      {!e.clienteId && puede && <PasarACliente e={e} />}

      <div className="grid gap-4 lg:grid-cols-2">
        <Actividades e={e} puede={puede} />
        <div className="space-y-4">
          <Negocios e={e} puede={puede} />
          <Contactos e={e} puede={puede} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={cn(TARJETA, 'space-y-2 p-4')}>
          <h2 className="font-semibold text-tinta">Cotizaciones</h2>
          {e.cotizaciones.length === 0 ? (
            <p className="text-sm text-tinta-suave">Ninguna todavía.</p>
          ) : (
            <ul className="divide-y divide-borde text-sm">
              {e.cotizaciones.map((c) => (
                <li key={c.id} className="flex items-center justify-between gap-3 py-1.5">
                  <Link href={`/cotizaciones/${c.id}`} className="text-marca hover:underline">
                    {c.numero}
                  </Link>
                  <span className="text-tinta-suave">{formatearFechaDia(c.fecha)}</span>
                  <ChipCotizacion estado={c.estado} />
                  <span className="tabular-nums">{usd(c.totalUsd)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className={cn(TARJETA, 'space-y-2 p-4')}>
          <h2 className="font-semibold text-tinta">Facturas</h2>
          {e.facturas.length === 0 ? (
            <p className="text-sm text-tinta-suave">{e.clienteId ? 'Ninguna todavía.' : 'Se factura cuando es cliente.'}</p>
          ) : (
            <ul className="divide-y divide-borde text-sm">
              {e.facturas.map((f) => (
                <li key={f.id} className="flex items-center justify-between gap-3 py-1.5">
                  <NombreEnlazado tipo="factura" id={f.id} className="text-marca hover:underline">
                    {f.numeroFiscal ?? f.numero}
                  </NombreEnlazado>
                  <span className="text-tinta-suave">{f.vence ? `vence ${formatearFechaDia(f.vence)}` : ''}</span>
                  <ChipFactura estado={f.estado} />
                  <span className="tabular-nums">{usd(f.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}

function FormDatos({ e, onListo }: { e: Empresa; onListo: () => void }) {
  const guardar = useGuardarEmpresa();
  const envio = useEnvio();
  const [v, setV] = useState({ nombre: e.nombre, pais: e.pais ?? '', rubro: e.rubro ?? '', origen: e.origen ?? '', notas: e.notas ?? '', descartada: e.descartada });
  return (
    <div className={cn(TARJETA, 'grid gap-3 p-4 sm:grid-cols-4')}>
      <Campo label="Empresa" error={envio.campo('nombre')}>
        <input value={v.nombre} onChange={(x) => setV({ ...v, nombre: x.target.value })} />
      </Campo>
      <Campo label="País">
        <select value={v.pais} onChange={(x) => setV({ ...v, pais: x.target.value })}>
          <option value="">—</option>
          {PAISES.map((p) => (
            <option key={p.codigo} value={p.codigo}>
              {p.nombre}
            </option>
          ))}
        </select>
      </Campo>
      <Campo label="Rubro">
        <input value={v.rubro} onChange={(x) => setV({ ...v, rubro: x.target.value })} />
      </Campo>
      <Campo label="Cómo llegó">
        <select value={v.origen} onChange={(x) => setV({ ...v, origen: x.target.value })}>
          <option value="">—</option>
          {ORIGENES.map((o) => (
            <option key={o} value={o}>
              {ETIQUETA_ORIGEN[o]}
            </option>
          ))}
        </select>
      </Campo>
      <div className="sm:col-span-4">
        <Campo label="Notas">
          <textarea className="h-24 py-2" value={v.notas} onChange={(x) => setV({ ...v, notas: x.target.value })} />
        </Campo>
      </div>
      {!e.clienteId && (
        <label className="flex items-center gap-2 text-sm sm:col-span-4">
          <input type="checkbox" className="size-4 accent-marca" checked={v.descartada} onChange={(x) => setV({ ...v, descartada: x.target.checked })} />
          Descartada (no interesa por ahora)
        </label>
      )}
      <div className="flex gap-2 sm:col-span-4">
        <ErrorBase error={envio.error} />
        <button
          type="button"
          className={BOTON_PRIMARIO}
          disabled={guardar.isPending}
          onClick={() =>
            void envio.enviar(
              guardar.mutateAsync({ id: e.id, ...v, pais: v.pais || null, responsableId: e.responsableId }),
              onListo,
            )
          }
        >
          Guardar
        </button>
        <button type="button" className={BOTON_SECUNDARIO} onClick={onListo}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function PasarACliente({ e }: { e: Empresa }) {
  const hacer = useHacerCliente();
  const clientes = useEmpresas(null, 'clientes');
  const envio = useEnvio();
  const [abierto, setAbierto] = useState(false);
  const [existente, setExistente] = useState('');
  const [v, setV] = useState({ razonSocial: e.nombre, identificadorFiscal: '', pais: e.pais ?? '', dias: '30' });
  if (!abierto)
    return (
      <button type="button" className={BOTON_SECUNDARIO} onClick={() => setAbierto(true)}>
        <UserCheck className="size-4" /> Pasar a cliente
      </button>
    );
  return (
    <section className={cn(TARJETA, 'space-y-3 p-4')}>
      <h2 className="font-semibold text-tinta">Pasar a cliente</h2>
      <p className="text-sm text-tinta-suave">Se da de alta como cliente en dólares. Si ya estaba cargado como cliente, elegilo y se unen.</p>
      <Campo label="¿Ya estaba cargado como cliente?">
        <select value={existente} onChange={(x) => setExistente(x.target.value)}>
          <option value="">No, darlo de alta</option>
          {(clientes.data ?? [])
            .filter((c) => c.clienteId)
            .map((c) => (
              <option key={c.id} value={c.clienteId ?? ''}>
                {c.nombre}
              </option>
            ))}
        </select>
      </Campo>
      {!existente && (
        <div className="grid gap-3 sm:grid-cols-4">
          <Campo label="Razón social">
            <input value={v.razonSocial} onChange={(x) => setV({ ...v, razonSocial: x.target.value })} />
          </Campo>
          <Campo label="CUIT / RUT">
            <input value={v.identificadorFiscal} onChange={(x) => setV({ ...v, identificadorFiscal: x.target.value })} />
          </Campo>
          <Campo label="País">
            <select value={v.pais} onChange={(x) => setV({ ...v, pais: x.target.value })}>
              <option value="">—</option>
              {PAISES.map((p) => (
                <option key={p.codigo} value={p.codigo}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Días para pagar">
            <input inputMode="numeric" value={v.dias} onChange={(x) => setV({ ...v, dias: x.target.value })} />
          </Campo>
        </div>
      )}
      <ErrorBase error={envio.error} />
      <div className="flex gap-2">
        <button
          type="button"
          className={BOTON_PRIMARIO}
          disabled={hacer.isPending}
          onClick={() =>
            void envio.enviar(
              hacer.mutateAsync({
                empresaId: e.id,
                clienteExistenteId: existente ? Number(existente) : null,
                razonSocial: v.razonSocial,
                identificadorFiscal: v.identificadorFiscal,
                pais: v.pais || null,
                condicionPagoDias: v.dias.trim() === '' ? null : Number(v.dias),
              }),
              () => setAbierto(false),
            )
          }
        >
          Confirmar
        </button>
        <button type="button" className={BOTON_SECUNDARIO} onClick={() => setAbierto(false)}>
          Cancelar
        </button>
      </div>
    </section>
  );
}

function Actividades({ e, puede }: { e: Empresa; puede: boolean }) {
  const { zonaHoraria } = useSesion();
  const guardar = useGuardarActividad();
  const completar = useCompletarActividad();
  const quitar = useQuitarActividad();
  const envio = useEnvio();
  const vacia = { tipo: 'llamada' as TipoActividad, titulo: '', fecha: hoyEnZona(zonaHoraria) as string, oportunidadId: '', hecha: false, resultado: '' };
  const [v, setV] = useState(vacia);
  const [resultado, setResultado] = useState<Record<number, string>>({});
  const pendientes = e.actividades.filter((a) => !a.hechaEn);
  const hechas = e.actividades.filter((a) => a.hechaEn);
  return (
    <section className={cn(TARJETA, 'space-y-3 p-4')}>
      <h2 className="font-semibold text-tinta">Actividades</h2>
      {puede && (
        <div className="grid gap-2 rounded-lg bg-fondo/60 p-3 sm:grid-cols-[8rem_1fr_9rem]">
          <select
            aria-label="Tipo"
            className="h-9 rounded-md border border-borde bg-panel px-2 text-sm"
            value={v.tipo}
            onChange={(x) => setV({ ...v, tipo: x.target.value as TipoActividad })}
          >
            {(Object.keys(ETIQUETA_ACTIVIDAD) as TipoActividad[]).map((t) => (
              <option key={t} value={t}>
                {ETIQUETA_ACTIVIDAD[t]}
              </option>
            ))}
          </select>
          <input
            aria-label="Qué"
            className="h-9 rounded-md border border-borde bg-panel px-2 text-sm"
            placeholder="Ej.: llamar por la temporada de fruta"
            value={v.titulo}
            onChange={(x) => setV({ ...v, titulo: x.target.value })}
          />
          <input
            aria-label="Fecha"
            type="date"
            className="h-9 rounded-md border border-borde bg-panel px-2 text-sm"
            value={v.fecha}
            onChange={(x) => setV({ ...v, fecha: x.target.value })}
          />
          {e.negocios.length > 0 && (
            <select
              aria-label="Negocio"
              className="h-9 rounded-md border border-borde bg-panel px-2 text-sm sm:col-span-2"
              value={v.oportunidadId}
              onChange={(x) => setV({ ...v, oportunidadId: x.target.value })}
            >
              <option value="">Sin negocio</option>
              {e.negocios.map((n) => (
                <option key={n.id} value={n.id}>
                  {n.titulo}
                </option>
              ))}
            </select>
          )}
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-marca" checked={v.hecha} onChange={(x) => setV({ ...v, hecha: x.target.checked })} />
            Ya la hice
          </label>
          {v.hecha && (
            <input
              aria-label="Resultado"
              className="h-9 rounded-md border border-borde bg-panel px-2 text-sm sm:col-span-3"
              placeholder="¿Qué salió?"
              value={v.resultado}
              onChange={(x) => setV({ ...v, resultado: x.target.value })}
            />
          )}
          <div className="sm:col-span-3">
            <button
              type="button"
              className={BOTON_PRIMARIO}
              disabled={guardar.isPending}
              onClick={() =>
                void envio.enviar(
                  guardar.mutateAsync({ id: null, empresaId: e.id, ...v, oportunidadId: v.oportunidadId ? Number(v.oportunidadId) : null }),
                  () => setV(vacia),
                )
              }
            >
              <Plus className="size-4" /> Agendar
            </button>
          </div>
        </div>
      )}
      <ErrorBase error={envio.error} />
      {pendientes.length === 0 && <p className="text-sm text-tinta-suave">Nada pendiente.</p>}
      <ul className="space-y-2 text-sm">
        {pendientes.map((a) => (
          <li key={a.id} className="space-y-1 rounded-lg border border-borde p-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-medium tabular-nums">{formatearFechaDia(a.fecha)}</span>
              <span className="text-xs text-tinta-suave uppercase">{ETIQUETA_ACTIVIDAD[a.tipo]}</span>
              <span className="flex-1">{a.titulo}</span>
              {puede && (
                <button
                  type="button"
                  aria-label="Quitar"
                  className="text-tinta-suave hover:text-error"
                  onClick={() => void envio.enviar(quitar.mutateAsync({ id: a.id }), () => undefined)}
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </div>
            {puede && (
              <div className="flex gap-2">
                <input
                  className="h-8 flex-1 rounded-md border border-borde bg-panel px-2 text-xs"
                  placeholder="Resultado (opcional)"
                  value={resultado[a.id] ?? ''}
                  onChange={(x) => setResultado({ ...resultado, [a.id]: x.target.value })}
                />
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-xs font-medium text-marca hover:underline"
                  disabled={completar.isPending}
                  onClick={() => void envio.enviar(completar.mutateAsync({ id: a.id, resultado: resultado[a.id] ?? null }), () => undefined)}
                >
                  <Check className="size-4" /> Hecha
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {hechas.length > 0 && (
        <div>
          <p className="mb-1 text-xs font-semibold text-tinta-suave uppercase">Historial</p>
          <ul className="divide-y divide-borde text-sm">
            {hechas.map((a) => (
              <li key={a.id} className="py-1.5">
                <span className="text-tinta-suave tabular-nums">{formatearFechaDia(a.hechaEn?.slice(0, 10))}</span> · {ETIQUETA_ACTIVIDAD[a.tipo]} · {a.titulo}
                {a.resultado && <span className="block text-tinta-suave">→ {a.resultado}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function Negocios({ e, puede }: { e: Empresa; puede: boolean }) {
  const [editando, setEditando] = useState<Negocio | 'nuevo' | null>(null);
  return (
    <section className={cn(TARJETA, 'space-y-3 p-4')}>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-tinta">Negocios</h2>
        {puede && (
          <button type="button" className="inline-flex items-center gap-1 text-sm text-marca hover:underline" onClick={() => setEditando('nuevo')}>
            <Plus className="size-4" /> Nuevo
          </button>
        )}
      </div>
      {editando && <FormNegocio e={e} n={editando === 'nuevo' ? null : editando} onListo={() => setEditando(null)} />}
      {e.negocios.length === 0 && !editando && <p className="text-sm text-tinta-suave">Sin negocios. Un negocio es, por ejemplo, una ruta con un volumen por mes.</p>}
      <ul className="space-y-2 text-sm">
        {e.negocios.map((n) => (
          <FilaNegocio key={n.id} n={n} puede={puede} onEditar={() => setEditando(n)} />
        ))}
      </ul>
    </section>
  );
}

function FilaNegocio({ n, puede, onEditar }: { n: Negocio; puede: boolean; onEditar: () => void }) {
  const mover = useMoverNegocio();
  const envio = useEnvio();
  const [motivo, setMotivo] = useState<string | null>(null);
  return (
    <li className="space-y-1 rounded-lg border border-borde p-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex-1 font-medium">{n.titulo}</span>
        <ChipEtapa etapa={n.etapa} />
        {puede && (
          <button type="button" aria-label="Editar" className="text-tinta-suave hover:text-marca" onClick={onEditar}>
            <Pencil className="size-4" />
          </button>
        )}
      </div>
      <p className="text-xs text-tinta-suave">
        {[n.linea, n.viajesMes && `${n.viajesMes} viajes/mes`, n.valorMensualUsd && `${usd(n.valorMensualUsd)}/mes`, n.cierreEstimado && `cierre ${formatearFechaDia(n.cierreEstimado)}`]
          .filter(Boolean)
          .join(' · ')}
      </p>
      {n.motivoPerdida && <p className="text-xs text-error">Perdido: {n.motivoPerdida}</p>}
      {puede && (
        <div className="flex flex-wrap gap-1">
          {ETAPAS.filter((x) => x !== n.etapa).map((x) => (
            <button
              key={x}
              type="button"
              className="rounded-full border border-borde px-2 py-0.5 text-xs text-tinta-suave hover:bg-hover"
              disabled={mover.isPending}
              onClick={() =>
                x === 'perdido' ? setMotivo('') : void envio.enviar(mover.mutateAsync({ id: n.id, etapa: x as Etapa, motivo: null }), () => undefined)
              }
            >
              → {ETIQUETA_ETAPA[x]}
            </button>
          ))}
        </div>
      )}
      {motivo !== null && (
        <div className="flex gap-2">
          <input
            className="h-8 flex-1 rounded-md border border-borde bg-panel px-2 text-xs"
            placeholder="¿Por qué se perdió? (precio, tiempos, otro transportista…)"
            value={motivo}
            onChange={(x) => setMotivo(x.target.value)}
          />
          <button
            type="button"
            className="text-xs text-error hover:underline"
            onClick={() => void envio.enviar(mover.mutateAsync({ id: n.id, etapa: 'perdido', motivo }), () => setMotivo(null))}
          >
            Marcar perdido
          </button>
        </div>
      )}
      <ErrorBase error={envio.error} />
    </li>
  );
}

function FormNegocio({ e, n, onListo }: { e: Empresa; n: Negocio | null; onListo: () => void }) {
  const tarifario = useTarifario();
  const guardar = useGuardarNegocio();
  const envio = useEnvio();
  const [v, setV] = useState({
    titulo: n?.titulo ?? '',
    lineaId: n?.lineaId ? String(n.lineaId) : '',
    viajesMes: n?.viajesMes ? String(n.viajesMes) : '',
    valorMensualUsd: n?.valorMensualUsd ? String(n.valorMensualUsd) : '',
    cierreEstimado: n?.cierreEstimado ?? '',
  });
  return (
    <div className="grid gap-3 rounded-lg bg-fondo/60 p-3 sm:grid-cols-2">
      <Campo label="Qué negocio es" error={envio.campo('titulo')}>
        <input value={v.titulo} placeholder="Ej.: exportación de fruta a San Antonio" onChange={(x) => setV({ ...v, titulo: x.target.value })} />
      </Campo>
      <Campo label="Ruta">
        <select value={v.lineaId} onChange={(x) => setV({ ...v, lineaId: x.target.value })}>
          <option value="">—</option>
          {(tarifario.data?.lineas ?? []).map((l) => (
            <option key={l.id} value={l.id}>
              {l.nombre}
            </option>
          ))}
        </select>
      </Campo>
      <Campo label="Viajes por mes (estimado)">
        <input inputMode="decimal" value={v.viajesMes} onChange={(x) => setV({ ...v, viajesMes: x.target.value })} />
      </Campo>
      <Campo label="Valor por mes (USD, estimado)">
        <input inputMode="decimal" value={v.valorMensualUsd} onChange={(x) => setV({ ...v, valorMensualUsd: x.target.value })} />
      </Campo>
      <Campo label="Cierre estimado">
        <input type="date" value={v.cierreEstimado} onChange={(x) => setV({ ...v, cierreEstimado: x.target.value })} />
      </Campo>
      <div className="flex items-end gap-2">
        <button
          type="button"
          className={BOTON_PRIMARIO}
          disabled={guardar.isPending}
          onClick={() =>
            void envio.enviar(
              guardar.mutateAsync({
                id: n?.id ?? null,
                empresaId: e.id,
                titulo: v.titulo,
                lineaId: v.lineaId ? Number(v.lineaId) : null,
                viajesMes: v.viajesMes,
                valorMensualUsd: v.valorMensualUsd,
                cierreEstimado: v.cierreEstimado || null,
              }),
              onListo,
            )
          }
        >
          Guardar
        </button>
        <button type="button" className={BOTON_SECUNDARIO} onClick={onListo}>
          Cancelar
        </button>
      </div>
      <div className="sm:col-span-2">
        <ErrorBase error={envio.error} />
      </div>
    </div>
  );
}

function Contactos({ e, puede }: { e: Empresa; puede: boolean }) {
  const [editando, setEditando] = useState<Contacto | 'nuevo' | null>(null);
  const quitar = useQuitarContacto();
  const envio = useEnvio();
  return (
    <section className={cn(TARJETA, 'space-y-3 p-4')}>
      <div className="flex items-center justify-between">
        <h2 className="font-semibold text-tinta">Contactos</h2>
        {puede && (
          <button type="button" className="inline-flex items-center gap-1 text-sm text-marca hover:underline" onClick={() => setEditando('nuevo')}>
            <Plus className="size-4" /> Nuevo
          </button>
        )}
      </div>
      {editando && <FormContacto e={e} c={editando === 'nuevo' ? null : editando} onListo={() => setEditando(null)} />}
      <ErrorBase error={envio.error} />
      {e.contactos.length === 0 && !editando && <p className="text-sm text-tinta-suave">Sin contactos.</p>}
      <ul className="divide-y divide-borde text-sm">
        {e.contactos.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-2 py-1.5">
            {c.principal && <Star className="size-4 text-alerta" aria-label="Principal" />}
            <span className="font-medium">{c.nombre}</span>
            {c.cargo && <span className="text-tinta-suave">{c.cargo}</span>}
            <span className="flex-1 text-tinta-suave">
              {c.email && (
                <a href={`mailto:${c.email}`} className="text-marca hover:underline">
                  {c.email}
                </a>
              )}
              {c.telefono && ` · ${c.telefono}`}
            </span>
            {puede && (
              <>
                <button type="button" aria-label="Editar" className="text-tinta-suave hover:text-marca" onClick={() => setEditando(c)}>
                  <Pencil className="size-4" />
                </button>
                <button
                  type="button"
                  aria-label="Quitar"
                  className="text-tinta-suave hover:text-error"
                  onClick={() => void envio.enviar(quitar.mutateAsync({ id: c.id }), () => undefined)}
                >
                  <Trash2 className="size-4" />
                </button>
              </>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function FormContacto({ e, c, onListo }: { e: Empresa; c: Contacto | null; onListo: () => void }) {
  const guardar = useGuardarContacto();
  const envio = useEnvio();
  const [v, setV] = useState({ nombre: c?.nombre ?? '', cargo: c?.cargo ?? '', email: c?.email ?? '', telefono: c?.telefono ?? '', principal: c?.principal ?? e.contactos.length === 0 });
  return (
    <div className="grid gap-3 rounded-lg bg-fondo/60 p-3 sm:grid-cols-2">
      <Campo label="Nombre" error={envio.campo('nombre')}>
        <input value={v.nombre} onChange={(x) => setV({ ...v, nombre: x.target.value })} />
      </Campo>
      <Campo label="Cargo">
        <input value={v.cargo} onChange={(x) => setV({ ...v, cargo: x.target.value })} />
      </Campo>
      <Campo label="Email" error={envio.campo('email')}>
        <input type="email" value={v.email} onChange={(x) => setV({ ...v, email: x.target.value })} />
      </Campo>
      <Campo label="Teléfono">
        <input value={v.telefono} onChange={(x) => setV({ ...v, telefono: x.target.value })} />
      </Campo>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" className="size-4 accent-marca" checked={v.principal} onChange={(x) => setV({ ...v, principal: x.target.checked })} />
        Contacto principal
      </label>
      <div className="flex gap-2">
        <button
          type="button"
          className={BOTON_PRIMARIO}
          disabled={guardar.isPending}
          onClick={() => void envio.enviar(guardar.mutateAsync({ id: c?.id ?? null, empresaId: e.id, ...v }), onListo)}
        >
          Guardar
        </button>
        <button type="button" className={BOTON_SECUNDARIO} onClick={onListo}>
          Cancelar
        </button>
      </div>
      <div className="sm:col-span-2">
        <ErrorBase error={envio.error} />
      </div>
    </div>
  );
}
