'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Camera, ChevronDown, ChevronUp, FileCheck2, FileWarning, LoaderCircle, Plus, Printer, Trash2, Upload } from 'lucide-react';
import { ETIQUETA_DATO } from '@/modules/anomalias/domain/alerta.types';
import { useEnvio } from '@/modules/catalogos/components/comun';
import { abrirArchivo, borrarArchivo, subirArchivo } from '@/modules/chofer/components/archivos';
import { AccionConMotivo, Cargando, Chip, Dato, Encabezado, ErrorBase, ErrorLectura, Vacio, type Tono } from '@/modules/combustible/components/comun/ui';
import { useCamionesCombustible, useChoferesCombustible, useMonedas } from '@/modules/combustible/queries/hooks';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora, horaLocalAIso, hoyEnZona } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, CONTROL_FILTRO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { NombreEnlazado } from '@/shared/ui/nombre-enlazado';
import {
  carpetaActa,
  ETIQUETA_ESTADO_ACTA,
  ETIQUETA_TIPO_ACTA,
  esTipoActa,
  EVIDENCIA_OCULTA,
  TIPOS_ACTA,
  VERSION_ACTAS,
  type Acta,
  type EstadoActa,
  type TipoActa,
} from '../domain/acta.types';
import { useActas, useAgregarFotoActa, useAnularActa, useCambiarActa, useCrearActa, useFirmarActa, useQuitarFotoActa } from '../queries/hooks';

const TONO_ESTADO: Record<EstadoActa, Tono> = { registrada: 'alerta', firmada: 'exito', anulada: 'neutro' };
const TONO_TIPO: Record<TipoActa, Tono> = { consumo_excesivo: 'marca', danos_unidad: 'error', exceso_velocidad: 'alerta' };
const importe = (moneda: string | null, v: number | null) => (v === null ? '—' : `${moneda ?? ''} ${formatearNumero(v, 0)}`.trim());
const mesDe = (periodo: string | null) =>
  periodo ? new Date(`${periodo}T12:00:00`).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }) : '—';

/**
 * Migración 122 · Actas de infracción (consumo excesivo, daños en la unidad, velocidad excesiva).
 * Se hacen desde una alerta confirmada (?alerta=ID) o a mano; se imprimen para que las firme el
 * chofer; el monto y el descuento en la liquidación los ponen Gerencia u Operaciones. Todo lo
 * decide la base: la pantalla muestra su mensaje tal cual.
 */
export function ActasPantalla() {
  const hay = useBaseTiene(VERSION_ACTAS);
  const sp = useSearchParams();
  const router = useRouter();
  const choferUrl = Number(sp.get('chofer')) || null;
  const alertaUrl = Number(sp.get('alerta')) || null;
  const [tipo, setTipo] = useState<TipoActa | ''>('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [chofer, setChofer] = useState(choferUrl ? String(choferUrl) : '');
  const [nueva, setNueva] = useState<boolean>(alertaUrl !== null || sp.get('nueva') === '1');
  const [abierta, setAbierta] = useState<number | null>(null);
  const { data: choferes } = useChoferesCombustible();
  const filtro = { desde: desde || null, hasta: hasta || null, choferId: chofer ? Number(chofer) : null, tipo: tipo || null };
  const { data, isPending, isError, error, isFetching, refetch } = useActas(filtro, hay);
  const puedeEditar = useCan('operacion.actas:editar');

  const cerrarNueva = () => {
    setNueva(false);
    if (alertaUrl) router.replace('/actas', { scroll: false });
  };

  return (
    <div className="space-y-5">
      <Encabezado titulo="Actas de infracción" subtitulo="Alertas">
        {hay && puedeEditar && data?.puedeCrear && !nueva && (
          <button type="button" className={BOTON_PRIMARIO} onClick={() => setNueva(true)}>
            <Plus className="size-4" /> Nueva acta
          </button>
        )}
      </Encabezado>
      <p className="max-w-3xl text-sm text-tinta-suave">
        Por consumo excesivo, daños en la unidad o velocidad excesiva. Las de consumo y velocidad se hacen desde la alerta confirmada; los daños, acá,
        con fotos de la rotura. Se imprimen para que el chofer las firme. Descontarle al chofer es una opción: el monto lo ponen Gerencia o el jefe de
        Operaciones.
      </p>
      {!hay ? (
        <Vacio icono={<FileWarning className="size-6" />} texto="La base todavía no tiene las actas de infracción. Falta aplicar la migración 122 (107_actas_infraccion.sql)." />
      ) : (
        <>
          {nueva && data?.puedeCrear && (
            <FormNueva alertaId={alertaUrl} choferInicial={choferUrl} puedeMonto={data.puedeMonto} onCerrar={cerrarNueva} onCreada={(id) => (cerrarNueva(), setAbierta(id))} />
          )}
          <div className="flex flex-wrap items-end gap-3">
            <label className="space-y-1 text-sm">
              <span className="block text-xs text-tinta-suave">Tipo</span>
              <select className={CONTROL_FILTRO} value={tipo} onChange={(e) => setTipo(esTipoActa(e.target.value) ? e.target.value : '')}>
                <option value="">Todos</option>
                {TIPOS_ACTA.map((t) => (
                  <option key={t} value={t}>
                    {ETIQUETA_TIPO_ACTA[t]}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="block text-xs text-tinta-suave">Chofer</span>
              <select className={CONTROL_FILTRO} value={chofer} onChange={(e) => setChofer(e.target.value)}>
                <option value="">Todos</option>
                {choferes?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </label>
            <label className="space-y-1 text-sm">
              <span className="block text-xs text-tinta-suave">Desde</span>
              <input type="date" className={CONTROL_FILTRO} value={desde} onChange={(e) => setDesde(e.target.value)} />
            </label>
            <label className="space-y-1 text-sm">
              <span className="block text-xs text-tinta-suave">Hasta</span>
              <input type="date" className={CONTROL_FILTRO} value={hasta} onChange={(e) => setHasta(e.target.value)} />
            </label>
            {isFetching && !isPending && <LoaderCircle className="mb-2 size-4 animate-spin text-tinta-suave" />}
          </div>
          {data?.porTipo && (
            <p className="text-sm text-tinta-suave">
              Este chofer tiene {TIPOS_ACTA.map((t) => `${data.porTipo?.[t] ?? 0} de ${ETIQUETA_TIPO_ACTA[t].toLowerCase()}`).join(', ')} (sin contar las anuladas).
            </p>
          )}
          {isPending ? (
            <Cargando texto="Cargando las actas…" />
          ) : isError ? (
            <ErrorLectura texto={error instanceof Error ? error.message : 'No se pudieron leer las actas.'} onReintentar={() => refetch()} />
          ) : data.actas.length === 0 ? (
            <Vacio icono={<FileWarning className="size-6" />} texto="No hay actas con esos filtros." />
          ) : (
            <ul className="space-y-3">
              {data.actas.map((a) => (
                <FilaActa
                  key={a.id}
                  a={a}
                  puedeEditar={puedeEditar && data.puedeCrear}
                  puedeMonto={puedeEditar && data.puedeMonto}
                  abierta={abierta === a.id}
                  onAlternar={() => setAbierta(abierta === a.id ? null : a.id)}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Alta
// ---------------------------------------------------------------------------
function FormNueva({
  alertaId,
  choferInicial,
  puedeMonto,
  onCerrar,
  onCreada,
}: {
  alertaId: number | null;
  choferInicial: number | null;
  puedeMonto: boolean;
  onCerrar: () => void;
  onCreada: (id: number) => void;
}) {
  const { zonaHoraria, monedaBase } = useSesion();
  const { data: choferes } = useChoferesCombustible();
  const { data: camiones } = useCamionesCombustible();
  const crear = useCrearActa();
  const agregarFoto = useAgregarFotoActa();
  const { error, setError } = useEnvio();
  const [f, setF] = useState({
    tipo: 'danos_unidad' as TipoActa,
    choferId: choferInicial ? String(choferInicial) : '',
    camionId: '',
    fecha: '',
    lugar: '',
    descripcion: '',
  });
  const [dinero, setDinero] = useState<Dinero>(dineroVacio(monedaBase, hoyEnZona(zonaHoraria)));
  const [fotos, setFotos] = useState<File[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const set = (k: keyof typeof f) => (v: string) => setF((p) => ({ ...p, [k]: v }));

  const guardar = async () => {
    setError(null);
    const r = await crear.mutateAsync({
      alertaId,
      tipo: alertaId ? null : f.tipo,
      choferId: f.choferId ? Number(f.choferId) : null,
      camionId: f.camionId ? Number(f.camionId) : null,
      fecha: f.fecha ? horaLocalAIso(f.fecha, zonaHoraria) : null,
      lugar: f.lugar,
      descripcion: f.descripcion,
      ...dineroAEnviar(puedeMonto ? dinero : null),
    });
    if (!r.ok) return setError(r.error);
    const id = r.data;
    // Las fotos van a la carpeta del acta (la base la exige), por eso se suben después de crearla
    if (fotos.length > 0) {
      setSubiendo(true);
      try {
        for (const archivo of fotos) {
          const s = await subirArchivo(archivo, carpetaActa(id));
          const g = await agregarFoto.mutateAsync({ actaId: id, ruta: s.ruta, nombre: s.nombre });
          if (!g.ok) {
            await borrarArchivo(s.ruta);
            break;
          }
        }
      } catch {
        // el acta ya quedó guardada: las fotos se pueden volver a subir desde su detalle
      } finally {
        setSubiendo(false);
      }
    }
    onCreada(id);
  };

  return (
    <form
      noValidate
      className={cn(TARJETA, 'space-y-4 p-4')}
      onSubmit={(e) => {
        e.preventDefault();
        void guardar();
      }}
    >
      <h2 className="font-semibold text-tinta">{alertaId ? `Acta desde la alerta ${alertaId}` : 'Nueva acta de infracción'}</h2>
      {alertaId && (
        <p className="text-sm text-tinta-suave">El tipo, el chofer, el camión, la fecha y los datos de la telemetría salen de la alerta. Si no escribís qué pasó, se usa lo que dice la alerta.</p>
      )}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {!alertaId && (
          <>
            <Campo label="Tipo">
              <select value={f.tipo} onChange={(e) => esTipoActa(e.target.value) && set('tipo')(e.target.value)}>
                {TIPOS_ACTA.map((t) => (
                  <option key={t} value={t}>
                    {ETIQUETA_TIPO_ACTA[t]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Chofer">
              <select value={f.choferId} onChange={(e) => set('choferId')(e.target.value)}>
                <option value="">Elegí…</option>
                {choferes?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Camión (opcional)">
              <select value={f.camionId} onChange={(e) => set('camionId')(e.target.value)}>
                <option value="">—</option>
                {camiones?.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.patente}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Cuándo pasó">
              <input type="datetime-local" value={f.fecha} onChange={(e) => set('fecha')(e.target.value)} />
            </Campo>
          </>
        )}
        <Campo label="Lugar (opcional)">
          <input maxLength={200} value={f.lugar} onChange={(e) => set('lugar')(e.target.value)} placeholder="Ruta 7 km 1.050, playa de la base…" />
        </Campo>
      </div>
      <Campo label={alertaId ? 'Qué pasó (opcional)' : 'Qué pasó'}>
        <textarea rows={3} maxLength={2000} value={f.descripcion} onChange={(e) => set('descripcion')(e.target.value)} />
      </Campo>
      {puedeMonto && <CamposDinero d={dinero} onCambiar={setDinero} />}
      <ElegirFotos fotos={fotos} onCambiar={setFotos} />
      <ErrorBase error={error} />
      <div className="flex flex-wrap gap-3">
        <button type="submit" className={BOTON_PRIMARIO} disabled={crear.isPending || subiendo}>
          {(crear.isPending || subiendo) && <LoaderCircle className="size-4 animate-spin" />} Guardar el acta
        </button>
        <button type="button" className={BOTON_SECUNDARIO} onClick={onCerrar} disabled={crear.isPending || subiendo}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function ElegirFotos({ fotos, onCambiar }: { fotos: File[]; onCambiar: (f: File[]) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="space-y-2 text-sm">
      <input
        ref={input}
        type="file"
        accept="image/*,application/pdf"
        multiple
        className="hidden"
        onChange={(e) => {
          const nuevas = Array.from(e.target.files ?? []);
          e.target.value = '';
          onCambiar([...fotos, ...nuevas]);
        }}
      />
      <button type="button" className={BOTON_SECUNDARIO} onClick={() => input.current?.click()}>
        <Camera className="size-4" /> Agregar fotos (pruebas)
      </button>
      {fotos.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {fotos.map((f, i) => (
            <li key={`${f.name}-${i}`} className="inline-flex items-center gap-1 rounded-full border border-borde px-2 py-0.5 text-xs">
              {f.name}
              <button type="button" aria-label={`Quitar ${f.name}`} onClick={() => onCambiar(fotos.filter((_, j) => j !== i))}>
                <Trash2 className="size-3 text-tinta-suave" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Monto y descuento (Gerencia u Operaciones)
// ---------------------------------------------------------------------------
interface Dinero {
  monto: string;
  moneda: string;
  descontar: boolean;
  importeDescuento: string;
  mes: string;
}
const dineroVacio = (moneda: string | null, hoy: string): Dinero => ({ monto: '', moneda: moneda ?? '', descontar: false, importeDescuento: '', mes: hoy.slice(0, 7) });
const dineroDeActa = (a: Acta, moneda: string | null, hoy: string): Dinero => ({
  monto: a.monto === null ? '' : String(a.monto),
  moneda: a.moneda ?? moneda ?? '',
  descontar: a.descontar,
  importeDescuento: a.importeDescuento === null ? '' : String(a.importeDescuento),
  mes: (a.periodoDescuento ?? hoy).slice(0, 7),
});
const numero = (v: string) => (v.trim() === '' ? null : Number(v.replace(/\./g, '').replace(',', '.')));
function dineroAEnviar(d: Dinero | null) {
  if (!d) return { monto: null, moneda: null, descontar: false, importeDescuento: null, periodoDescuento: null };
  const monto = numero(d.monto);
  return {
    monto,
    moneda: monto === null ? null : d.moneda || null,
    descontar: d.descontar,
    importeDescuento: d.descontar ? (numero(d.importeDescuento) ?? monto) : null,
    periodoDescuento: d.descontar && d.mes ? `${d.mes}-01` : null,
  };
}

function CamposDinero({ d, onCambiar }: { d: Dinero; onCambiar: (d: Dinero) => void }) {
  const { data: monedas } = useMonedas();
  return (
    <fieldset className="space-y-3 rounded-lg border border-borde p-3">
      <legend className="px-1 text-sm font-medium text-tinta">Monto (Gerencia o jefe de Operaciones)</legend>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Campo label="Monto del daño o del consumo" ayuda="Opcional.">
          <input inputMode="decimal" value={d.monto} onChange={(e) => onCambiar({ ...d, monto: e.target.value })} />
        </Campo>
        <Campo label="Moneda">
          <select value={d.moneda} onChange={(e) => onCambiar({ ...d, moneda: e.target.value })}>
            <option value="">Elegí…</option>
            {monedas?.map((m) => (
              <option key={m.codigo} value={m.codigo}>
                {m.codigo}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      <label className="flex items-center gap-2 text-sm text-tinta">
        <input type="checkbox" className="accent-marca" checked={d.descontar} onChange={(e) => onCambiar({ ...d, descontar: e.target.checked })} />
        Descontárselo al chofer en la liquidación
      </label>
      {d.descontar && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Campo label="Cuánto se descuenta" ayuda="Vacío = todo el monto.">
            <input inputMode="decimal" value={d.importeDescuento} onChange={(e) => onCambiar({ ...d, importeDescuento: e.target.value })} />
          </Campo>
          <Campo label="En la liquidación de">
            <input type="month" value={d.mes} onChange={(e) => onCambiar({ ...d, mes: e.target.value })} />
          </Campo>
        </div>
      )}
    </fieldset>
  );
}

// ---------------------------------------------------------------------------
// Fila y detalle
// ---------------------------------------------------------------------------
function FilaActa({ a, puedeEditar, puedeMonto, abierta, onAlternar }: { a: Acta; puedeEditar: boolean; puedeMonto: boolean; abierta: boolean; onAlternar: () => void }) {
  const { zonaHoraria } = useSesion();
  return (
    <li className={cn(TARJETA, 'p-4', a.estado === 'anulada' && 'opacity-70')}>
      <button type="button" className="flex w-full flex-wrap items-start justify-between gap-3 text-left" onClick={onAlternar} aria-expanded={abierta}>
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono font-medium text-tinta">{a.numero}</span>
            <Chip tono={TONO_TIPO[a.tipo]}>{ETIQUETA_TIPO_ACTA[a.tipo]}</Chip>
            <Chip tono={TONO_ESTADO[a.estado]}>{a.estado === 'firmada' && a.seNegoFirmar ? 'Se negó a firmar' : ETIQUETA_ESTADO_ACTA[a.estado]}</Chip>
            {a.descontar && a.estado !== 'anulada' && <Chip tono="error">Se descuenta</Chip>}
          </div>
          <p className="text-sm text-tinta-suave">
            {a.chofer}
            {a.patente && (
              <>
                {' · '}
                <span className="font-mono text-tinta">{a.patente}</span>
              </>
            )}
            {' · '}
            {formatearFechaHora(a.fecha, zonaHoraria)}
          </p>
          {!abierta && <p className="line-clamp-1 text-sm text-tinta">{a.descripcion}</p>}
        </div>
        <div className="flex items-center gap-4">
          {a.monto !== null && <p className="text-right font-semibold text-tinta tabular-nums">{importe(a.moneda, a.monto)}</p>}
          {abierta ? <ChevronUp className="size-5 text-tinta-suave" /> : <ChevronDown className="size-5 text-tinta-suave" />}
        </div>
      </button>
      {abierta && <DetalleActa a={a} puedeEditar={puedeEditar} puedeMonto={puedeMonto} />}
    </li>
  );
}

function DetalleActa({ a, puedeEditar, puedeMonto }: { a: Acta; puedeEditar: boolean; puedeMonto: boolean }) {
  const { zonaHoraria, monedaBase } = useSesion();
  const puedeAnular = useCan('operacion.actas:transicionar');
  const anular = useAnularActa();
  const envioAnular = useEnvio();
  const [aviso, setAviso] = useState<string | null>(null);
  const viva = a.estado !== 'anulada';
  const datos = Object.entries(a.evidencia).filter(([k, v]) => !EVIDENCIA_OCULTA.has(k) && v !== null && typeof v !== 'object');

  return (
    <div className="mt-4 space-y-4 border-t border-borde pt-4">
      <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Dato etiqueta="Chofer">
          <NombreEnlazado tipo="chofer" id={a.choferId} className="text-marca hover:underline">
            {a.chofer}
          </NombreEnlazado>
        </Dato>
        <Dato etiqueta="Camión">
          {a.camionId ? (
            <NombreEnlazado tipo="camion" id={a.camionId} className="font-mono text-marca hover:underline">
              {a.patente}
            </NombreEnlazado>
          ) : (
            '—'
          )}
        </Dato>
        <Dato etiqueta="Lugar">{a.lugar ?? '—'}</Dato>
        <Dato etiqueta="Hecha por">
          {a.creadoPor ?? '—'} · {formatearFechaHora(a.creadoEn, zonaHoraria)}
        </Dato>
        {a.alertaId && (
          <Dato etiqueta="Alerta">
            <Link href="/analisis/alertas" className="text-marca hover:underline">
              {a.alerta ?? `Alerta ${a.alertaId}`}
            </Link>
          </Dato>
        )}
        {datos.map(([k, v]) => (
          <Dato key={k} etiqueta={ETIQUETA_DATO[k] ?? (k === 'valor_observado' ? 'Valor medido' : k === 'valor_esperado' ? 'Referencia' : k)}>
            {typeof v === 'number' ? formatearNumero(v, 1) : String(v)}
          </Dato>
        ))}
      </dl>
      <p className="text-sm whitespace-pre-line text-tinta">{a.descripcion}</p>

      <Dinero a={a} puede={puedeMonto && viva} monedaBase={monedaBase} hoy={hoyEnZona(zonaHoraria)} />
      <Fotos a={a} puede={puedeEditar && a.estado === 'registrada'} onAviso={setAviso} />
      <Firma a={a} puede={puedeEditar} onAviso={setAviso} />
      {aviso && <p className="text-sm text-error">{aviso}</p>}

      {a.estado === 'anulada' && (
        <p className="rounded-lg bg-hover p-3 text-sm text-tinta">
          Anulada el {formatearFechaHora(a.anuladaEn, zonaHoraria)}: {a.motivoAnulacion}
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <Link href={`/actas/${a.id}/imprimir`} target="_blank" className={BOTON_SECUNDARIO}>
          <Printer className="size-4" /> Imprimir para firmar
        </Link>
        {viva && puedeAnular && puedeMonto && (
          <AccionConMotivo
            etiqueta="Anular"
            titulo={`Anular el acta ${a.numero}`}
            explicacion="Queda en el historial como anulada y deja de descontarse."
            ocupado={anular.isPending}
            error={envioAnular.error}
            onConfirmar={async (motivo) => {
              let bien = false;
              await envioAnular.enviar(anular.mutateAsync({ id: a.id, motivo }), () => (bien = true));
              return bien;
            }}
          />
        )}
      </div>
    </div>
  );
}

function Dinero({ a, puede, monedaBase, hoy }: { a: Acta; puede: boolean; monedaBase: string | null; hoy: string }) {
  const [editando, setEditando] = useState(false);
  const [d, setD] = useState<Dinero>(dineroDeActa(a, monedaBase, hoy));
  const cambiar = useCambiarActa();
  const { error, enviar } = useEnvio();
  if (editando) {
    return (
      <div className="space-y-3">
        <CamposDinero d={d} onCambiar={setD} />
        <ErrorBase error={error} />
        <div className="flex gap-3">
          <button
            type="button"
            className={BOTON_PRIMARIO}
            disabled={cambiar.isPending}
            onClick={() =>
              void enviar(
                cambiar.mutateAsync({ id: a.id, version: a.version, lugar: a.lugar ?? '', descripcion: a.descripcion, dinero: dineroAEnviar(d) }),
                () => setEditando(false),
              )
            }
          >
            {cambiar.isPending && <LoaderCircle className="size-4 animate-spin" />} Guardar el monto
          </button>
          <button type="button" className={BOTON_SECUNDARIO} onClick={() => setEditando(false)}>
            Cancelar
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-borde p-3 text-sm">
      <span>
        <span className="text-tinta-suave">Monto: </span>
        <span className="font-semibold text-tinta">{importe(a.moneda, a.monto)}</span>
        {a.montoPor && <span className="text-tinta-suave"> (lo puso {a.montoPor})</span>}
      </span>
      <span>
        {a.descontar ? (
          <>
            Se descuentan <b>{importe(a.moneda, a.importeDescuento)}</b> en la liquidación de {mesDe(a.periodoDescuento)}
            {a.liquidacion && ` (${a.liquidacion.numero}, ${a.liquidacion.estado})`}
          </>
        ) : (
          <span className="text-tinta-suave">No se le descuenta al chofer.</span>
        )}
      </span>
      {puede && (
        <button type="button" className="text-marca hover:underline" onClick={() => setEditando(true)}>
          Cambiar monto o descuento
        </button>
      )}
    </div>
  );
}

function Fotos({ a, puede, onAviso }: { a: Acta; puede: boolean; onAviso: (t: string | null) => void }) {
  const [fotos, setFotos] = useState<File[]>([]);
  const [subiendo, setSubiendo] = useState(false);
  const agregar = useAgregarFotoActa();
  const quitar = useQuitarFotoActa();
  const subir = async () => {
    onAviso(null);
    setSubiendo(true);
    try {
      for (const archivo of fotos) {
        const s = await subirArchivo(archivo, carpetaActa(a.id));
        const r = await agregar.mutateAsync({ actaId: a.id, ruta: s.ruta, nombre: s.nombre });
        if (!r.ok) {
          await borrarArchivo(s.ruta);
          onAviso(r.error.mensaje);
          break;
        }
      }
      setFotos([]);
    } catch (e) {
      onAviso(e instanceof Error ? e.message : 'No se pudo subir la foto.');
    } finally {
      setSubiendo(false);
    }
  };
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-tinta">Pruebas ({a.fotos.length})</h3>
      {a.fotos.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {a.fotos.map((f, i) => (
            <li key={f.id} className="inline-flex items-center gap-1 rounded-full border border-borde px-2 py-0.5 text-xs">
              <button type="button" className="text-marca hover:underline" onClick={() => void abrirArchivo(f.ruta).then(onAviso)}>
                {f.nombre ?? `Foto ${i + 1}`}
              </button>
              {puede && (
                <button
                  type="button"
                  aria-label="Quitar la foto"
                  onClick={() =>
                    void quitar.mutateAsync({ fotoId: f.id }).then((r) => (r.ok ? borrarArchivo(r.data) : onAviso(r.error.mensaje)))
                  }
                >
                  <Trash2 className="size-3 text-tinta-suave" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {puede && (
        <div className="flex flex-wrap items-center gap-3">
          <ElegirFotos fotos={fotos} onCambiar={setFotos} />
          {fotos.length > 0 && (
            <button type="button" className={BOTON_PRIMARIO} disabled={subiendo} onClick={() => void subir()}>
              {subiendo ? <LoaderCircle className="size-4 animate-spin" /> : <Upload className="size-4" />} Subir {fotos.length === 1 ? 'la foto' : `${fotos.length} fotos`}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function Firma({ a, puede, onAviso }: { a: Acta; puede: boolean; onAviso: (t: string | null) => void }) {
  const { zonaHoraria } = useSesion();
  const [abierto, setAbierto] = useState(false);
  const [archivo, setArchivo] = useState<File | null>(null);
  const [descargo, setDescargo] = useState('');
  const [seNego, setSeNego] = useState(false);
  const [subiendo, setSubiendo] = useState(false);
  const firmar = useFirmarActa();
  const { error, setError } = useEnvio();
  const input = useRef<HTMLInputElement>(null);

  if (a.estado === 'firmada') {
    return (
      <div className="space-y-1 rounded-lg border border-exito/30 bg-exito/5 p-3 text-sm">
        <p className="flex flex-wrap items-center gap-2 text-tinta">
          <FileCheck2 className="size-4 text-exito" />
          {a.seNegoFirmar ? 'El chofer se negó a firmar' : 'Firmada'} · {formatearFechaHora(a.firmadaEn, zonaHoraria)}
          {a.firmadaRuta && (
            <button type="button" className="text-marca hover:underline" onClick={() => void abrirArchivo(a.firmadaRuta!).then(onAviso)}>
              Ver la copia firmada
            </button>
          )}
        </p>
        {a.descargo && <p className="text-tinta-suave">Descargo del chofer: {a.descargo}</p>}
      </div>
    );
  }
  if (a.estado !== 'registrada' || !puede) return null;
  if (!abierto) {
    return (
      <button type="button" className={BOTON_SECUNDARIO} onClick={() => setAbierto(true)}>
        <FileCheck2 className="size-4" /> Marcar firmada
      </button>
    );
  }
  const guardar = async () => {
    onAviso(null);
    let ruta: string | null = null;
    if (archivo) {
      setSubiendo(true);
      try {
        ruta = (await subirArchivo(archivo, carpetaActa(a.id))).ruta;
      } catch (e) {
        onAviso(e instanceof Error ? e.message : 'No se pudo subir la copia.');
        setSubiendo(false);
        return;
      }
      setSubiendo(false);
    }
    setError(null);
    const r = await firmar.mutateAsync({ id: a.id, ruta, descargo, seNego });
    if (r.ok) return setAbierto(false);
    setError(r.error);
    if (ruta) await borrarArchivo(ruta);
  };
  return (
    <div className="space-y-3 rounded-lg border border-borde p-3">
      <h3 className="text-sm font-medium text-tinta">Marcar firmada</h3>
      <input
        ref={input}
        type="file"
        accept="application/pdf,image/*"
        className="hidden"
        onChange={(e) => {
          setArchivo(e.target.files?.[0] ?? null);
          e.target.value = '';
        }}
      />
      <div className="flex flex-wrap items-center gap-3 text-sm">
        <button type="button" className={BOTON_SECUNDARIO} onClick={() => input.current?.click()}>
          <Upload className="size-4" /> {archivo ? archivo.name : 'Copia firmada (escaneada o foto)'}
        </button>
        <label className="flex items-center gap-2 text-tinta">
          <input type="checkbox" className="accent-marca" checked={seNego} onChange={(e) => setSeNego(e.target.checked)} /> El chofer se negó a firmar
        </label>
      </div>
      <Campo label="Descargo del chofer (opcional)">
        <textarea rows={2} maxLength={2000} value={descargo} onChange={(e) => setDescargo(e.target.value)} />
      </Campo>
      <ErrorBase error={error} />
      <div className="flex gap-3">
        <button type="button" className={BOTON_PRIMARIO} disabled={firmar.isPending || subiendo} onClick={() => void guardar()}>
          {(firmar.isPending || subiendo) && <LoaderCircle className="size-4 animate-spin" />} Guardar
        </button>
        <button type="button" className={BOTON_SECUNDARIO} onClick={() => setAbierto(false)}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
