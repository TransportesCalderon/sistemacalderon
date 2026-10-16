'use client';

import { useState, type ReactNode } from 'react';
import { CircleAlert, Fuel, LoaderCircle, Plus } from 'lucide-react';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import type { ActionResult, ErrorAccion } from '@/server/actions/result';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia, hoyEnZona } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import type { Camion } from '../../domain/camion.types';
import { ETIQUETA_TIPO_TANQUE, TIPOS_TANQUE, type Tanque } from '../../domain/tanque.types';
import {
  useCambiarCapacidadTanque,
  useCrearTanque,
  useDarDeBajaTanque,
  useEditarDescripcionTanque,
  useEliminarTanque,
  useTanques,
} from '../../queries/hooks';

type Accion = 'capacidad' | 'baja' | 'descripcion' | 'eliminar';

const litros = (v: number | null) => (v === null ? '—' : `${formatearNumero(v, v % 1 === 0 ? 0 : 2)} L`);

/**
 * Sección Tanques de la ficha del camión (migración 27). Documenta la configuración real y
 * muestra la capacidad total que calcula la base. Las reglas (útil ≤ nominal, un solo principal,
 * vigencias, tanques con cargas) son de la base: acá solo se muestra su mensaje.
 */
export function TanquesCamion({ camion }: { camion: Camion }) {
  const { zonaHoraria } = useSesion();
  const puedeEditar = useCan('flota.camiones:editar') && camion.eliminadoEn === null;
  const { data, isPending, isError, refetch } = useTanques(camion.id);
  const [alta, setAlta] = useState(false);
  const [abierta, setAbierta] = useState<{ id: number; accion: Accion } | null>(null);
  const hoy = hoyEnZona(zonaHoraria);

  if (isPending) {
    return (
      <Marco>
        <p className="flex items-center gap-2 text-sm text-tinta-suave">
          <LoaderCircle className="size-4 animate-spin" /> Cargando tanques…
        </p>
      </Marco>
    );
  }
  if (isError || !data) {
    return (
      <Marco>
        <p className="text-sm text-error">
          No se pudieron cargar los tanques.{' '}
          <button type="button" onClick={() => refetch()} className="text-marca hover:underline">
            Reintentar
          </button>
        </p>
      </Marco>
    );
  }

  const actuales = data.tanques.filter((t) => t.vigenteHasta === null || t.vigenteHasta > hoy);
  const anteriores = data.tanques.filter((t) => t.vigenteHasta !== null && t.vigenteHasta <= hoy);
  const { capacidad } = data;

  return (
    <Marco
      acciones={
        puedeEditar && !alta ? (
          <button type="button" className={BOTON_SECUNDARIO} onClick={() => setAlta(true)}>
            <Plus className="size-4" /> Agregar tanque
          </button>
        ) : null
      }
    >
      {capacidad.capacidadUtilL === null ? (
        <p className="flex items-start gap-2 rounded-lg border border-alerta/30 bg-alerta-suave p-3 text-sm text-alerta">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          Este camión no tiene tanques cargados. Hasta cargarlos no se conoce su capacidad y no se puede declarar un faltante en el corte de
          viaje.
        </p>
      ) : (
        <div className="flex flex-wrap items-end gap-x-6 gap-y-1">
          <p>
            <span className="text-3xl font-semibold text-tinta tabular-nums">{litros(capacidad.capacidadUtilL)}</span>
            <span className="ml-2 text-sm text-tinta-suave">
              capacidad útil hoy · {capacidad.tanques} {capacidad.tanques === 1 ? 'tanque' : 'tanques'}
            </span>
          </p>
          <p className="text-sm text-tinta-suave">Nominal: {litros(capacidad.capacidadNominalL)}</p>
        </div>
      )}

      {alta && <AltaTanque camion={camion} hoy={hoy} onCerrar={() => setAlta(false)} />}

      {actuales.length > 0 && (
        <ListaTanques tanques={actuales} puedeEditar={puedeEditar} abierta={abierta} onAbrir={setAbierta} hoy={hoy} />
      )}

      {anteriores.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-tinta-suave hover:text-tinta">Vigencias anteriores ({anteriores.length})</summary>
          <div className="mt-2">
            <ListaTanques tanques={anteriores} puedeEditar={false} abierta={null} onAbrir={() => undefined} hoy={hoy} />
          </div>
        </details>
      )}

      <p className="text-xs text-tinta-suave">
        Los tanques documentan la configuración del camión y dan su capacidad total. El combustible se controla para todo el camión junto:
        no hay diferencias por tanque.
      </p>
    </Marco>
  );
}

function Marco({ children, acciones }: { children: ReactNode; acciones?: ReactNode }) {
  return (
    <section id="tanques" className={cn(TARJETA, 'scroll-mt-4 space-y-4 p-5')} aria-label="Tanques del camión">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-tinta">
          <Fuel className="size-4" /> Tanques
        </h2>
        {acciones}
      </div>
      {children}
    </section>
  );
}

function ListaTanques({
  tanques,
  puedeEditar,
  abierta,
  onAbrir,
  hoy,
}: {
  tanques: Tanque[];
  puedeEditar: boolean;
  abierta: { id: number; accion: Accion } | null;
  onAbrir: (v: { id: number; accion: Accion } | null) => void;
  hoy: string;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-borde text-left text-xs text-tinta-suave">
            <th className="py-2 pr-3 font-medium">Nº</th>
            <th className="py-2 pr-3 font-medium">Tipo</th>
            <th className="py-2 pr-3 font-medium">Descripción</th>
            <th className="py-2 pr-3 text-right font-medium">Útil</th>
            <th className="py-2 pr-3 text-right font-medium">Nominal</th>
            <th className="py-2 pr-3 font-medium">Vigencia</th>
            {puedeEditar && <th className="py-2 font-medium" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-borde">
          {tanques.map((t) => {
            const abierto = abierta?.id === t.id ? abierta.accion : null;
            return <FilaTanque key={t.id} t={t} puedeEditar={puedeEditar} abierto={abierto} onAbrir={onAbrir} hoy={hoy} />;
          })}
        </tbody>
      </table>
    </div>
  );
}

function FilaTanque({
  t,
  puedeEditar,
  abierto,
  onAbrir,
  hoy,
}: {
  t: Tanque;
  puedeEditar: boolean;
  abierto: Accion | null;
  onAbrir: (v: { id: number; accion: Accion } | null) => void;
  hoy: string;
}) {
  const boton = (accion: Accion, texto: string) => (
    <button
      type="button"
      onClick={() => onAbrir(abierto === accion ? null : { id: t.id, accion })}
      className={cn('text-xs hover:underline', abierto === accion ? 'font-semibold text-marca' : 'text-marca')}
    >
      {texto}
    </button>
  );
  const cerrar = () => onAbrir(null);
  return (
    <>
      <tr className="align-top">
        <td className="py-2 pr-3 tabular-nums">{t.numero}</td>
        <td className="py-2 pr-3 font-medium text-tinta">{ETIQUETA_TIPO_TANQUE[t.tipo]}</td>
        <td className="py-2 pr-3 text-tinta-suave">{t.descripcion ?? '—'}</td>
        <td className="py-2 pr-3 text-right tabular-nums">{litros(t.capacidadUtilL)}</td>
        <td className="py-2 pr-3 text-right tabular-nums text-tinta-suave">{litros(t.capacidadNominalL)}</td>
        <td className="py-2 pr-3 whitespace-nowrap text-tinta-suave">
          desde {formatearFechaDia(t.vigenteDesde)}
          {t.vigenteHasta && <> · hasta {formatearFechaDia(t.vigenteHasta)}</>}
        </td>
        {puedeEditar && (
          <td className="py-2">
            <div className="flex flex-wrap justify-end gap-x-3 gap-y-1">
              {t.vigenteHasta === null && boton('capacidad', 'Cambiar capacidad')}
              {t.vigenteHasta === null && boton('baja', 'Dar de baja')}
              {boton('descripcion', 'Descripción')}
              {boton('eliminar', 'Eliminar')}
            </div>
          </td>
        )}
      </tr>
      {abierto && (
        <tr>
          <td colSpan={7} className="pb-3">
            {abierto === 'capacidad' && <CambioCapacidadPanel t={t} hoy={hoy} onCerrar={cerrar} />}
            {abierto === 'baja' && <BajaPanel t={t} hoy={hoy} onCerrar={cerrar} />}
            {abierto === 'descripcion' && <DescripcionPanel t={t} onCerrar={cerrar} />}
            {abierto === 'eliminar' && <EliminarPanel t={t} onCerrar={cerrar} />}
          </td>
        </tr>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// Paneles de acción
// ---------------------------------------------------------------------------

function useEnvio() {
  const [error, setError] = useState<ErrorAccion | null>(null);
  const enviar = async (p: Promise<ActionResult<unknown>>, onBien: () => void) => {
    setError(null);
    const r = await p;
    if (r.ok) onBien();
    else setError(r.error);
  };
  const campo = (nombre: string) => error?.campos?.[nombre];
  return { error, enviar, campo };
}

function Panel({
  titulo,
  explicacion,
  error,
  ocupado,
  textoBoton,
  onConfirmar,
  onCerrar,
  children,
}: {
  titulo: string;
  explicacion?: string;
  error: ErrorAccion | null;
  ocupado: boolean;
  textoBoton: string;
  onConfirmar: () => void;
  onCerrar: () => void;
  children?: ReactNode;
}) {
  return (
    <form
      className="space-y-3 rounded-lg border border-borde bg-fondo/40 p-4"
      onSubmit={(e) => {
        e.preventDefault();
        onConfirmar();
      }}
      noValidate
    >
      <h3 className="font-medium text-tinta">{titulo}</h3>
      {explicacion && <p className="text-sm text-tinta-suave">{explicacion}</p>}
      {children && <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{children}</div>}
      {error && (
        <p role="alert" className="flex items-start gap-2 rounded-lg border border-error/30 bg-error-suave p-3 text-sm text-error">
          <CircleAlert className="mt-0.5 size-4 shrink-0" />
          <span className="whitespace-pre-line">{error.mensaje}</span>
        </p>
      )}
      <div className="flex flex-wrap gap-3">
        <button type="submit" className={BOTON_PRIMARIO} disabled={ocupado}>
          {ocupado && <LoaderCircle className="size-4 animate-spin" />} {textoBoton}
        </button>
        <button type="button" className={BOTON_SECUNDARIO} onClick={onCerrar} disabled={ocupado}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

function AltaTanque({ camion, hoy, onCerrar }: { camion: Camion; hoy: string; onCerrar: () => void }) {
  const crear = useCrearTanque();
  const { error, enviar, campo } = useEnvio();
  const [tipo, setTipo] = useState<string>('principal');
  const [descripcion, setDescripcion] = useState('');
  const [nominal, setNominal] = useState('');
  const [util, setUtil] = useState('');
  const [desde, setDesde] = useState<string>(camion.fechaAlta <= hoy ? camion.fechaAlta : hoy);
  return (
    <Panel
      titulo="Agregar tanque"
      explicacion="La capacidad útil es lo que realmente entra (igual o menor que la nominal). El número lo asigna el sistema."
      error={error}
      ocupado={crear.isPending}
      textoBoton="Agregar"
      onCerrar={onCerrar}
      onConfirmar={() =>
        enviar(
          crear.mutateAsync({
            camionId: camion.id,
            tipo: tipo as 'principal',
            descripcion,
            capacidadNominalL: nominal,
            capacidadUtilL: util,
            vigenteDesde: desde,
          }),
          onCerrar,
        )
      }
    >
      <Campo label="Tipo *" error={campo('tipo')}>
        <select value={tipo} onChange={(e) => setTipo(e.target.value)}>
          {TIPOS_TANQUE.map((t) => (
            <option key={t} value={t}>
              {ETIQUETA_TIPO_TANQUE[t]}
            </option>
          ))}
        </select>
      </Campo>
      <Campo label="Capacidad nominal (L) *" error={campo('capacidadNominalL')}>
        <input inputMode="decimal" value={nominal} onChange={(e) => setNominal(e.target.value)} />
      </Campo>
      <Campo label="Capacidad útil (L) *" error={campo('capacidadUtilL')}>
        <input inputMode="decimal" value={util} onChange={(e) => setUtil(e.target.value)} />
      </Campo>
      <Campo label="Desde *" error={campo('vigenteDesde')} ayuda="Si siempre lo tuvo: la fecha de alta del camión.">
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
      </Campo>
      <div className="sm:col-span-2 lg:col-span-4">
        <Campo
          label={tipo === 'otro' ? 'Descripción *' : 'Descripción'}
          error={campo('descripcion')}
          ayuda="Ubicación, marca u otra referencia."
        >
          <input value={descripcion} maxLength={200} onChange={(e) => setDescripcion(e.target.value)} />
        </Campo>
      </div>
    </Panel>
  );
}

function CambioCapacidadPanel({ t, hoy, onCerrar }: { t: Tanque; hoy: string; onCerrar: () => void }) {
  const cambiar = useCambiarCapacidadTanque();
  const { error, enviar, campo } = useEnvio();
  const [desde, setDesde] = useState(hoy);
  const [nominal, setNominal] = useState(String(t.capacidadNominalL));
  const [util, setUtil] = useState(String(t.capacidadUtilL));
  return (
    <Panel
      titulo={`Cambiar la capacidad del tanque ${t.numero}`}
      explicacion="La capacidad anterior queda en el historial hasta el día anterior a la fecha del cambio; desde esa fecha rige la nueva."
      error={error}
      ocupado={cambiar.isPending}
      textoBoton="Cambiar capacidad"
      onCerrar={onCerrar}
      onConfirmar={() =>
        enviar(
          cambiar.mutateAsync({
            camionId: t.camionId,
            tanqueId: t.id,
            desde,
            capacidadNominalL: nominal,
            capacidadUtilL: util,
          }),
          onCerrar,
        )
      }
    >
      <Campo label="Desde *" error={campo('desde')}>
        <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} />
      </Campo>
      <Campo label="Capacidad nominal (L) *" error={campo('capacidadNominalL')}>
        <input inputMode="decimal" value={nominal} onChange={(e) => setNominal(e.target.value)} />
      </Campo>
      <Campo label="Capacidad útil (L) *" error={campo('capacidadUtilL')}>
        <input inputMode="decimal" value={util} onChange={(e) => setUtil(e.target.value)} />
      </Campo>
    </Panel>
  );
}

function BajaPanel({ t, hoy, onCerrar }: { t: Tanque; hoy: string; onCerrar: () => void }) {
  const baja = useDarDeBajaTanque();
  const { error, enviar, campo } = useEnvio();
  const [hasta, setHasta] = useState(hoy);
  return (
    <Panel
      titulo={`Dar de baja el tanque ${t.numero} (${ETIQUETA_TIPO_TANQUE[t.tipo].toLowerCase()})`}
      explicacion="Desde esa fecha el camión deja de tener este tanque y su capacidad baja. No se puede deshacer."
      error={error}
      ocupado={baja.isPending}
      textoBoton="Dar de baja"
      onCerrar={onCerrar}
      onConfirmar={() =>
        enviar(
          baja.mutateAsync({
            camionId: t.camionId,
            tanqueId: t.id,
            versionFila: t.versionFila,
            hasta,
          }),
          onCerrar,
        )
      }
    >
      <Campo label="Desde *" error={campo('hasta')}>
        <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} />
      </Campo>
    </Panel>
  );
}

function DescripcionPanel({ t, onCerrar }: { t: Tanque; onCerrar: () => void }) {
  const editar = useEditarDescripcionTanque();
  const { error, enviar, campo } = useEnvio();
  const [descripcion, setDescripcion] = useState(t.descripcion ?? '');
  return (
    <Panel
      titulo={`Descripción del tanque ${t.numero}`}
      error={error}
      ocupado={editar.isPending}
      textoBoton="Guardar"
      onCerrar={onCerrar}
      onConfirmar={() =>
        enviar(
          editar.mutateAsync({
            camionId: t.camionId,
            tanqueId: t.id,
            versionFila: t.versionFila,
            descripcion,
          }),
          onCerrar,
        )
      }
    >
      <div className="sm:col-span-2 lg:col-span-4">
        <Campo label="Descripción" error={campo('descripcion')}>
          <input value={descripcion} maxLength={200} onChange={(e) => setDescripcion(e.target.value)} />
        </Campo>
      </div>
    </Panel>
  );
}

function EliminarPanel({ t, onCerrar }: { t: Tanque; onCerrar: () => void }) {
  const eliminar = useEliminarTanque();
  const { error, enviar } = useEnvio();
  return (
    <Panel
      titulo={`Eliminar el tanque ${t.numero}`}
      explicacion="Solo para un tanque cargado por error. Si el camión tuvo el tanque y ya no lo tiene, usá Dar de baja. Un tanque con cargas no se puede eliminar."
      error={error}
      ocupado={eliminar.isPending}
      textoBoton="Eliminar"
      onCerrar={onCerrar}
      onConfirmar={() =>
        enviar(
          eliminar.mutateAsync({
            camionId: t.camionId,
            tanqueId: t.id,
            versionFila: t.versionFila,
          }),
          onCerrar,
        )
      }
    />
  );
}
