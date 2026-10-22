'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FileText, FileUp, MapPin, Navigation, Package, Receipt, Truck } from 'lucide-react';
import { Cargando, ErrorLectura } from '@/modules/combustible/components/comun/ui';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { enlaceMapa, type CargaAsignada, type Lugar } from '../domain/chofer.types';
import { useMisCargas } from '../queries/hooks';
import { CompartirUbicacion } from './compartir-ubicacion';
import { ListaDocumentos, SubirDocumento } from './documentos';

const TIPO: Record<string, string> = { exportacion: 'Exportación', importacion: 'Importación', nacional: 'Nacional', round_trip: 'Round trip' };
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

      <CompartirUbicacion habilitado={data.compartirUbicacion} intervaloS={data.intervaloS} />

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
        <Link href="/chofer/gastos" className={`${BOTON_SECUNDARIO} w-full`}>
          <Receipt className="size-5" /> Mis gastos y fondo
        </Link>
        <Link href="/chofer/liquidaciones" className={`${BOTON_SECUNDARIO} w-full`}>
          <FileText className="size-5" /> Mis liquidaciones
        </Link>
      </div>
    </div>
  );
}

function FilaLugar({ titulo, l }: { titulo: string; l: Lugar | null }) {
  if (!l) return null;
  const href = l.latitud !== null && l.longitud !== null ? enlaceMapa(l.latitud, l.longitud) : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(l.nombre)}`;
  return (
    <li className="flex items-center gap-3 py-2">
      <MapPin className="size-5 shrink-0 text-marca" />
      <div className="flex-1">
        <p className="text-xs text-tinta-suave">{titulo}</p>
        <p className="font-medium text-tinta">{l.nombre}</p>
      </div>
      <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-borde px-3 py-2 text-sm text-marca">
        <Navigation className="size-4" /> Mapa
      </a>
    </li>
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

function TarjetaCarga({ c }: { c: CargaAsignada }) {
  const { zonaHoraria } = useSesion();
  const [subir, setSubir] = useState(c.documentos.length === 0);
  return (
    <article className={cn(TARJETA, 'space-y-4 p-4')}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-tinta">Operación {c.numero}</h2>
          <p className="text-sm text-tinta-suave">
            {c.tipo ? TIPO[c.tipo] ?? c.tipo : ''}
            {c.cliente && ` · ${c.cliente}`}
          </p>
        </div>
        {c.estado && <span className="rounded-full bg-marca-suave px-2.5 py-1 text-xs font-medium text-marca">{ESTADO[c.estado] ?? c.estado}</span>}
      </div>

      {c.presentacion && (
        <p className="rounded-md bg-alerta-suave px-3 py-2 text-sm text-alerta">Presentarse: {formatearFechaHora(c.presentacion, zonaHoraria)}</p>
      )}

      <ul className="divide-y divide-borde">
        <FilaLugar titulo="Retirar el contenedor en" l={c.retiro} />
        <FilaLugar titulo="Cargar en" l={c.carga} />
        <FilaLugar titulo="Aduana" l={c.aduana} />
        <FilaLugar titulo="Entregar en" l={c.entrega} />
      </ul>

      <div>
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-tinta">
          <Package className="size-4" /> Qué cargás
        </h3>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <Dato etiqueta="Mercadería" valor={c.producto} />
          <Dato etiqueta="Peso" valor={c.pesoKg !== null ? `${c.pesoKg.toLocaleString('es-AR')} kg` : null} />
          <Dato etiqueta="Contenedor" valor={[c.tipoContenedor, c.contenedor].filter(Boolean).join(' · ') || null} mono />
          <Dato etiqueta="Precinto" valor={c.precinto} mono />
          <Dato etiqueta="Booking · BL" valor={c.booking} mono />
          <Dato etiqueta="MIC" valor={c.mic} mono />
          <Dato etiqueta="CRT" valor={c.crt} mono />
          <Dato etiqueta="Entrega programada" valor={c.entregaPactada ? formatearFechaHora(c.entregaPactada, zonaHoraria) : null} />
        </dl>
        {c.observacion && <p className="mt-3 rounded-md bg-hover px-3 py-2 text-sm text-tinta">{c.observacion}</p>}
      </div>

      {(c.tractor || c.semi) && (
        <p className="flex items-center gap-2 text-sm text-tinta-suave">
          <Truck className="size-4" />
          {[c.tractor && `Tractor ${c.tractor}`, c.semi && `Semi ${c.semi}`].filter(Boolean).join(' · ')}
        </p>
      )}

      <div className="space-y-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-tinta">
          <FileUp className="size-4" /> Documentos ({c.documentos.length})
        </h3>
        <ListaDocumentos documentos={c.documentos} modo="chofer" puedeQuitar />
        {subir ? (
          <SubirDocumento servicioId={c.servicioId} modo="chofer" />
        ) : (
          <button type="button" className={`${BOTON_SECUNDARIO} w-full`} onClick={() => setSubir(true)}>
            <FileUp className="size-5" /> Subir MIC, fotos u otro documento
          </button>
        )}
      </div>
    </article>
  );
}
