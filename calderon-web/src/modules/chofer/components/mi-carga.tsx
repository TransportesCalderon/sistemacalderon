'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ChevronDown, ChevronRight, FileText, FileUp, Gauge, MapPin, Package, Receipt, Truck } from 'lucide-react';
import { Cargando, ErrorLectura } from '@/modules/combustible/components/comun/ui';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { deDondeADonde, lugaresUnicos, observacionParaChofer, type CargaAsignada } from '../domain/chofer.types';
import { useMisCargas } from '../queries/hooks';
import { AvisoCargaChofer } from '@/modules/telemetria/components/aviso-carga-chofer';
import { AvisoTableroInicio } from '@/modules/telemetria/components/aviso-tablero-inicio';
import { CompartirUbicacion } from './compartir-ubicacion';
import { ListaDocumentos, SubirDocumento } from './documentos';
import { RutaDelChofer } from './ruta-chofer';

const ESTADO: Record<string, string> = {
  programado: 'Programada',
  retirado: 'Contenedor retirado',
  posicionado: 'En el lugar de carga',
  aduana: 'En aduana',
  frontera: 'En frontera',
  en_transito: 'En viaje',
  hacia_puerto: 'Hacia el puerto',
  demorado: 'Demorada',
  descargando: 'Descargando',
};

/** Mi carga: lo que Logística le asignó al chofer, para leer en el celular. */
export function MiCarga() {
  const { data, isLoading, isError, refetch } = useMisCargas();

  if (isLoading) return <Cargando texto="Buscando tu carga…" />;
  if (isError || !data) return <ErrorLectura texto="No se pudo leer tu carga." onReintentar={() => void refetch()} />;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <header>
        <h1 className="text-2xl font-semibold text-tinta">Mi carga</h1>
        {data.chofer && <p className="text-sm text-tinta-suave">{data.chofer}</p>}
      </header>

      <AvisoCargaChofer />
      <AvisoTableroInicio />

      <CompartirUbicacion habilitado={data.compartirUbicacion} intervaloS={data.intervaloS} viaje={data.cargas.map((c) => c.servicioId).join(',')} />

      {data.cargas.length === 0 ? (
        <div className={cn(TARJETA, 'space-y-2 p-6 text-center')}>
          <Package className="mx-auto size-8 text-tinta-suave" />
          <p className="font-medium text-tinta">No tenés ninguna carga asignada.</p>
          <p className="text-sm text-tinta-suave">Cuando Logística te asigne una, aparece acá.</p>
        </div>
      ) : (
        data.cargas.map((c) => <TarjetaCarga key={c.servicioId} c={c} />)
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        <Link href="/mi-viaje?ver=tablero" className={`${BOTON_SECUNDARIO} w-full sm:col-span-2`}>
          <Gauge className="size-5" /> Fotos del tablero del camión
        </Link>
        <Link href="/mi-viaje?ver=gastos" className={`${BOTON_SECUNDARIO} w-full`}>
          <Receipt className="size-5" /> Mis gastos y fondo
        </Link>
        <Link href="/mi-viaje?ver=liquidaciones" className={`${BOTON_SECUNDARIO} w-full`}>
          <FileText className="size-5" /> Mis liquidaciones
        </Link>
      </div>
    </div>
  );
}

function Dato({ etiqueta, valor, mono }: { etiqueta: string; valor: string | null | undefined; mono?: boolean }) {
  if (!valor) return null;
  return (
    <div>
      <dt className="text-xs text-tinta-suave">{etiqueta}</dt>
      <dd className={cn('text-tinta', mono && 'font-mono')}>{valor}</dd>
    </div>
  );
}

/**
 * Una carga del chofer, simple (02/11/2026): de dónde a dónde en grande, los lugares sin repetir, los
 * datos de la carga plegados y los documentos con un botón. `ruta`: la ruta en curso, si va adentro de
 * la tarjeta (con una base anterior a la 161; desde la 161 va arriba de todo, en Mi viaje).
 */
export function TarjetaCarga({ c, conRuta = true }: { c: CargaAsignada; conRuta?: boolean }) {
  const { zonaHoraria } = useSesion();
  const [subir, setSubir] = useState(false);
  const [verDatos, setVerDatos] = useState(false);
  const { desde, hasta } = deDondeADonde(c);
  const lugares = lugaresUnicos(c);
  const obs = observacionParaChofer(c.observacion);
  return (
    <article className={cn(TARJETA, 'space-y-4 p-4')}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm text-tinta-suave">
            Operación {c.numero}
            {c.cliente && ` · ${c.cliente}`}
          </p>
          {(desde || hasta) && (
            <h2 className="text-xl leading-tight font-semibold text-tinta">
              {desde ?? '—'} → {hasta ?? '—'}
            </h2>
          )}
        </div>
        {c.estado && <span className="shrink-0 rounded-full bg-marca-suave px-2.5 py-1 text-xs font-medium text-marca">{ESTADO[c.estado] ?? c.estado}</span>}
      </div>

      {c.presentacion && c.estado === 'programado' && (
        <p className="rounded-md bg-alerta-suave px-3 py-2 text-sm text-alerta">Presentarse: {formatearFechaHora(c.presentacion, zonaHoraria)}</p>
      )}

      {/* Migración 135: la ruta para Google Maps, desde donde esté */}
      {conRuta && c.ruta && <RutaDelChofer ruta={c.ruta} servicioId={c.servicioId} />}

      <ul className="divide-y divide-borde">
        {lugares.map((g) => (
          <li key={g.titulo + g.lugar.nombre} className="flex items-center gap-3 py-2">
            <MapPin className="size-5 shrink-0 text-marca" />
            <div className="min-w-0 flex-1">
              <p className="text-xs text-tinta-suave">{g.titulo}</p>
              <p className="font-medium text-tinta">{g.lugar.nombre}</p>
            </div>
          </li>
        ))}
      </ul>

      {obs && <p className="rounded-md bg-alerta-suave px-3 py-2 text-sm whitespace-pre-line text-tinta">{obs}</p>}

      <div>
        <button type="button" onClick={() => setVerDatos((v) => !v)} className="flex w-full items-center justify-between py-1 text-sm font-semibold text-tinta">
          <span className="flex items-center gap-2">
            <Package className="size-4" /> Datos de la carga
            {c.producto && <span className="font-normal text-tinta-suave">· {c.producto}</span>}
          </span>
          <ChevronDown className={cn('size-4 transition-transform', verDatos && 'rotate-180')} />
        </button>
        {verDatos && (
          <div className="mt-2 space-y-3">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <Dato etiqueta="Mercadería" valor={c.producto} />
              <Dato etiqueta="Peso" valor={c.pesoKg !== null ? `${c.pesoKg.toLocaleString('es-AR')} kg` : null} />
              <Dato etiqueta="Tipo de carga" valor={c.tipoContenedor} />
              <Dato etiqueta="Contenedor" valor={c.contenedor} mono />
              <Dato etiqueta="Precinto" valor={c.precinto} mono />
              <Dato etiqueta="Booking · BL" valor={c.booking} mono />
              <Dato etiqueta="MIC" valor={c.mic} mono />
              <Dato etiqueta="CRT" valor={c.crt} mono />
              <Dato etiqueta="Entrega programada" valor={c.entregaPactada ? formatearFechaHora(c.entregaPactada, zonaHoraria) : null} />
              <Dato etiqueta="Presentarse" valor={c.presentacion ? formatearFechaHora(c.presentacion, zonaHoraria) : null} />
            </dl>
            {(c.tractor || c.semi) && (
              <p className="flex items-center gap-2 text-sm text-tinta-suave">
                <Truck className="size-4" />
                {[c.tractor && `Tractor ${c.tractor}`, c.semi && `Semi ${c.semi}`].filter(Boolean).join(' · ')}
              </p>
            )}
          </div>
        )}
      </div>

      <div id={`documentos-${c.servicioId}`} className="scroll-mt-20 space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-tinta">
          <FileUp className="size-4" /> Documentos ({c.documentos.length})
        </h3>
        {c.documentos.length > 0 && <ListaDocumentos documentos={c.documentos} modo="chofer" puedeQuitar />}
        {subir ? (
          <SubirDocumento servicioId={c.servicioId} modo="chofer" />
        ) : (
          <button type="button" className={`${BOTON_SECUNDARIO} w-full`} onClick={() => setSubir(true)}>
            <FileUp className="size-5" /> Subir documento
          </button>
        )}
      </div>
    </article>
  );
}

/** Las cargas que vienen después: una línea cada una; al tocarla se abre. */
export function CargaSiguiente({ c }: { c: CargaAsignada }) {
  const { zonaHoraria } = useSesion();
  const [abierta, setAbierta] = useState(false);
  const { desde, hasta } = deDondeADonde(c);
  if (abierta) {
    return (
      <div className="space-y-1">
        <button type="button" onClick={() => setAbierta(false)} className="text-sm text-marca">
          Cerrar
        </button>
        <TarjetaCarga c={c} />
      </div>
    );
  }
  return (
    <button type="button" onClick={() => setAbierta(true)} className={cn(TARJETA, 'flex w-full items-center gap-3 p-3 text-left active:bg-hover')}>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-tinta-suave">Operación {c.numero}</p>
        <p className="truncate font-medium text-tinta">
          {desde ?? '—'} → {hasta ?? '—'}
        </p>
        {c.presentacion && <p className="text-xs text-tinta-suave">{formatearFechaHora(c.presentacion, zonaHoraria)}</p>}
      </div>
      <ChevronRight className="size-5 shrink-0 text-tinta-suave" />
    </button>
  );
}
