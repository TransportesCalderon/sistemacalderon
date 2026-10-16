'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRightLeft, Gauge, Pencil, Plus, TriangleAlert, UserRound, Warehouse } from 'lucide-react';
import { Panel, useEnvio } from '@/modules/catalogos/components/comun';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora, horaLocalAIso, isoAHoraLocal } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import {
  CATEGORIAS_BASE,
  CATEGORIAS_CON_EVIDENCIA,
  ETIQUETA_CATEGORIA_BASE,
  METODOS_MEDICION,
  type CategoriaBase,
  type TanqueBase,
} from '../../domain/base.types';
import {
  useAsignarResponsableBase,
  useEstaciones,
  useGuardarTanqueBase,
  useRegistrarControlBase,
  useRegistrarMovimientoBase,
  useResponsablesBase,
  useTanquesDeBase,
  useTiposCombustible,
  useTraspasarResponsableBase,
  useUsuarios,
} from '../../queries/hooks';
import { Cargando, Chip, Dato, Encabezado, ErrorLectura, Seccion, Vacio } from '../comun/ui';
import { CampoMetodo } from './base-comun';
import { ControlesBase } from './base-controles';
import { LibroBase } from './base-libro';

type Accion = 'control' | 'movimiento' | 'responsable' | null;

/**
 * Combustible > Base Mendoza: el tanque de la base. Saldo de libro, controles medidos con la
 * diferencia de cada segmento, compras y otros movimientos con motivo, responsable y libro.
 * Las cargas a camiones (surtidor propio) y las descargas de camiones entran solas al libro.
 */
export function BasePantalla() {
  const puedeConfigurar = useCan('configuracion.catalogos:editar');
  const { data: tanques, isPending, isError, refetch } = useTanquesDeBase();
  const [elegido, setElegido] = useState<number | null>(null);
  const [formTanque, setFormTanque] = useState<'nuevo' | 'editar' | null>(null);
  const t = tanques?.find((x) => x.id === elegido) ?? tanques?.[0] ?? null;

  return (
    <div className="space-y-5">
      <Encabezado titulo="Base Mendoza">
        {puedeConfigurar && t && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BOTON_SECUNDARIO} onClick={() => setFormTanque('editar')}>
              <Pencil className="size-4" /> Editar tanque
            </button>
            <button type="button" className={BOTON_SECUNDARIO} onClick={() => setFormTanque('nuevo')}>
              <Plus className="size-4" /> Otro tanque
            </button>
          </div>
        )}
      </Encabezado>

      {formTanque && <FormTanque tanque={formTanque === 'editar' ? t : null} onCerrar={() => setFormTanque(null)} />}

      {isPending ? (
        <Cargando texto="Cargando el tanque de base…" />
      ) : isError ? (
        <ErrorLectura texto="No se pudo cargar el tanque de base." onReintentar={() => refetch()} />
      ) : !t ? (
        <Vacio icono={<Warehouse className="size-6" />} texto="Todavía no hay un tanque de base dado de alta.">
          {puedeConfigurar ? (
            !formTanque && (
              <button type="button" className={BOTON_PRIMARIO} onClick={() => setFormTanque('nuevo')}>
                <Plus className="size-4" /> Dar de alta el tanque
              </button>
            )
          ) : (
            <p className="text-xs text-tinta-suave">Lo da de alta un usuario de TI.</p>
          )}
        </Vacio>
      ) : (
        <>
          {tanques && tanques.length > 1 && (
            <div className="flex flex-wrap gap-2" role="tablist">
              {tanques.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  role="tab"
                  aria-selected={x.id === t.id}
                  onClick={() => setElegido(x.id)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-sm',
                    x.id === t.id ? 'border-marca bg-marca-suave text-marca' : 'border-borde text-tinta-suave',
                  )}
                >
                  {x.nombre}
                </button>
              ))}
            </div>
          )}
          <Resumen key={t.id} t={t} />
          <ControlesBase key={`c${t.id}`} depositoId={t.id} />
          <LibroBase key={`l${t.id}`} depositoId={t.id} />
        </>
      )}
    </div>
  );
}

function Resumen({ t }: { t: TanqueBase }) {
  const { zonaHoraria } = useSesion();
  const puedeEditar = useCan('combustible.depositos:editar');
  const { data: responsables } = useResponsablesBase(t.id);
  const [accion, setAccion] = useState<Accion>(null);
  const actual = responsables?.find((r) => r.usuarioId === t.responsableUsuarioId && r.hasta === null) ?? null;
  const ocupacion = t.capacidadL > 0 ? Math.round((t.saldoL / t.capacidadL) * 100) : null;
  const hayResponsables = (responsables?.length ?? 0) > 0;

  return (
    <Seccion
      titulo={`${t.nombre} (${t.codigo})`}
      acciones={
        puedeEditar && (
          <div className="flex flex-wrap gap-2">
            <button type="button" className={BOTON_PRIMARIO} onClick={() => setAccion('control')}>
              <Gauge className="size-4" /> {t.ultimoControlId ? 'Registrar control' : 'Control inicial'}
            </button>
            <button type="button" className={BOTON_SECUNDARIO} onClick={() => setAccion('movimiento')}>
              <ArrowRightLeft className="size-4" /> Compra u otro movimiento
            </button>
            <button type="button" className={BOTON_SECUNDARIO} onClick={() => setAccion('responsable')}>
              <UserRound className="size-4" /> {hayResponsables ? 'Traspasar responsable' : 'Asignar responsable'}
            </button>
          </div>
        )
      }
    >
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <Dato etiqueta="Saldo de libro" destacado>
          {formatearNumero(t.saldoL)} L
          {ocupacion !== null && <span className="ml-1 text-xs font-normal text-tinta-suave">({ocupacion} %)</span>}
        </Dato>
        <Dato etiqueta="Capacidad">{formatearNumero(t.capacidadL, 0)} L</Dato>
        <Dato etiqueta="Último control">
          {t.ultimoControlEn ? (
            <>
              {formatearNumero(t.ultimoControlL)} L
              <span className="block text-xs text-tinta-suave">{formatearFechaHora(t.ultimoControlEn, zonaHoraria)}</span>
            </>
          ) : (
            '—'
          )}
        </Dato>
        <Dato etiqueta="Responsable">{actual?.nombre ?? <span className="text-alerta">Sin responsable</span>}</Dato>
        <Dato etiqueta="Pendientes de aprobación">{t.movimientosPendientes}</Dato>
      </dl>

      <div className="flex flex-wrap gap-2">
        {!t.ultimoControlId && <Chip tono="alerta">Falta el control inicial: sin él no hay saldo de partida</Chip>}
        {t.ultimoControlId && t.controlVencido && (
          <Chip tono="alerta" title="Parámetro fue.base_frecuencia_max_horas">
            <TriangleAlert className="size-3.5" /> Control vencido: medí el tanque
          </Chip>
        )}
        {t.movimientosPendientes > 0 && <Chip tono="alerta">Hay movimientos pendientes de aprobación</Chip>}
      </div>

      {accion === 'control' && <FormControl t={t} onCerrar={() => setAccion(null)} />}
      {accion === 'movimiento' && <FormMovimiento t={t} onCerrar={() => setAccion(null)} />}
      {accion === 'responsable' &&
        (hayResponsables ? (
          <FormTraspaso t={t} onCerrar={() => setAccion(null)} />
        ) : (
          <FormResponsable t={t} onCerrar={() => setAccion(null)} />
        ))}

      {responsables && responsables.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-tinta-suave">Historial de responsables</summary>
          <ul className="mt-2 space-y-1">
            {responsables.map((r) => (
              <li key={r.id} className="tabular-nums">
                <span className="font-medium text-tinta">{r.nombre}</span>: desde {formatearFechaHora(r.desde, zonaHoraria)}
                {r.hasta ? ` hasta ${formatearFechaHora(r.hasta, zonaHoraria)}` : ' (actual)'}
              </li>
            ))}
          </ul>
        </details>
      )}
    </Seccion>
  );
}

/** Fecha y hora local del formulario → ISO; '' si no es válida (la valida el esquema). */
function useHora() {
  const { zonaHoraria } = useSesion();
  return {
    zonaHoraria,
    ahora: () => isoAHoraLocal(new Date().toISOString(), zonaHoraria),
    aIso: (v: string) => horaLocalAIso(v, zonaHoraria) ?? '',
  };
}

function FormTanque({ tanque, onCerrar }: { tanque: TanqueBase | null; onCerrar: () => void }) {
  const guardar = useGuardarTanqueBase();
  const { data: estaciones } = useEstaciones();
  const { data: combustibles } = useTiposCombustible();
  const { error, enviar, campo } = useEnvio();
  const propias = (estaciones ?? []).filter((e) => e.esTanquePropio);
  const [v, setV] = useState({
    codigo: tanque?.codigo ?? '',
    nombre: tanque?.nombre ?? '',
    estacionId: tanque ? String(tanque.estacionId) : '',
    tipoCombustibleId: tanque ? String(tanque.tipoCombustibleId) : '',
    capacidadL: tanque ? String(tanque.capacidadL) : '',
    observaciones: tanque?.observaciones ?? '',
  });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });

  return (
    <Panel
      titulo={tanque ? `Editar ${tanque.nombre}` : 'Nuevo tanque de base'}
      explicacion={
        tanque
          ? 'El código, el surtidor y el combustible no se cambian.'
          : 'El tanque va ligado al surtidor propio de la base: las cargas que se registran en ese surtidor salen de este tanque.'
      }
      error={error}
      ocupado={guardar.isPending}
      textoBoton={tanque ? 'Guardar cambios' : 'Dar de alta'}
      onCerrar={onCerrar}
      onConfirmar={() => enviar(guardar.mutateAsync({ ...v, id: tanque?.id ?? null, versionFila: tanque?.versionFila ?? null }), onCerrar)}
    >
      <Campo label="Código *" error={campo('codigo')} ayuda="Por ejemplo TQ-MZA-1.">
        <input className="uppercase" maxLength={30} value={v.codigo} onChange={set('codigo')} disabled={Boolean(tanque)} />
      </Campo>
      <Campo label="Nombre *" error={campo('nombre')}>
        <input maxLength={200} value={v.nombre} onChange={set('nombre')} />
      </Campo>
      <Campo label="Capacidad (L) *" error={campo('capacidadL')}>
        <input inputMode="decimal" value={v.capacidadL} onChange={set('capacidadL')} />
      </Campo>
      <Campo
        label="Surtidor propio *"
        error={campo('estacionId')}
        {...(!tanque && propias.length === 0 ? { ayuda: 'No hay estaciones marcadas como surtidor propio.' } : {})}
      >
        <select value={v.estacionId} onChange={set('estacionId')} disabled={Boolean(tanque)}>
          <option value="">Elegí…</option>
          {(tanque ? (estaciones ?? []) : propias).map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
            </option>
          ))}
        </select>
      </Campo>
      <Campo label="Combustible *" error={campo('tipoCombustibleId')}>
        <select value={v.tipoCombustibleId} onChange={set('tipoCombustibleId')} disabled={Boolean(tanque)}>
          <option value="">Elegí…</option>
          {combustibles?.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </Campo>
      <Campo label="Observaciones" error={campo('observaciones')}>
        <input maxLength={500} value={v.observaciones} onChange={set('observaciones')} />
      </Campo>
      {!tanque && propias.length === 0 && (
        <p className="text-sm text-alerta sm:col-span-2 lg:col-span-3">
          Primero marcá el surtidor de la base como «Surtidor propio» en{' '}
          <Link href="/comercial/estaciones" className="font-medium underline">
            Estaciones de servicio
          </Link>
          .
        </p>
      )}
    </Panel>
  );
}

function FormControl({ t, onCerrar }: { t: TanqueBase; onCerrar: () => void }) {
  const registrar = useRegistrarControlBase();
  const { error, enviar, campo } = useEnvio();
  const hora = useHora();
  const [v, setV] = useState({ fechaHoraLocal: hora.ahora(), litros: '', metodo: 'varilla', observaciones: '' });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });

  return (
    <Panel
      titulo={t.ultimoControlId ? 'Registrar control del tanque' : 'Control inicial (puesta en marcha)'}
      explicacion={
        t.ultimoControlId
          ? 'Litros medidos en el tanque. Cierra el segmento desde el control anterior: la diferencia con el libro queda a cargo del responsable de la base hasta que otro usuario la apruebe.'
          : 'Litros que hay en el tanque al empezar a usar el sistema. Es el saldo de partida del libro.'
      }
      error={error}
      ocupado={registrar.isPending}
      textoBoton="Registrar"
      onCerrar={onCerrar}
      onConfirmar={() =>
        enviar(
          registrar.mutateAsync({
            depositoId: t.id,
            fechaHora: hora.aIso(v.fechaHoraLocal),
            litros: v.litros,
            metodo: v.metodo as (typeof METODOS_MEDICION)[number],
            observaciones: v.observaciones,
            reemplazaId: null,
            motivoReemplazo: '',
          }),
          onCerrar,
        )
      }
    >
      <Campo label="Fecha y hora *" error={campo('fechaHora')} ayuda={`Hora de ${hora.zonaHoraria}`}>
        <input type="datetime-local" value={v.fechaHoraLocal} onChange={set('fechaHoraLocal')} />
      </Campo>
      <Campo label="Litros medidos *" error={campo('litros')}>
        <input inputMode="decimal" value={v.litros} onChange={set('litros')} />
      </Campo>
      <CampoMetodo valor={v.metodo} error={campo('metodo')} onChange={set('metodo')} />
      <Campo label="Observaciones" error={campo('observaciones')}>
        <input maxLength={500} value={v.observaciones} onChange={set('observaciones')} />
      </Campo>
    </Panel>
  );
}

function FormMovimiento({ t, onCerrar }: { t: TanqueBase; onCerrar: () => void }) {
  const registrar = useRegistrarMovimientoBase();
  const { error, enviar, campo } = useEnvio();
  const hora = useHora();
  const [v, setV] = useState({ categoria: 'compra_granel', fechaHoraLocal: hora.ahora(), litros: '', motivo: '', evidencia: '' });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });
  const conEvidencia = CATEGORIAS_CON_EVIDENCIA.includes(v.categoria as CategoriaBase);

  return (
    <Panel
      titulo="Compra u otro movimiento del tanque"
      explicacion="Entra al libro en el momento y queda pendiente: lo aprueba o lo rechaza otro usuario con rol aprobador. Las cargas a camiones y las descargas de camiones no se registran acá: entran solas."
      error={error}
      ocupado={registrar.isPending}
      textoBoton="Registrar"
      onCerrar={onCerrar}
      onConfirmar={() =>
        enviar(
          registrar.mutateAsync({
            depositoId: t.id,
            categoria: v.categoria as CategoriaBase,
            litros: v.litros,
            fechaHora: hora.aIso(v.fechaHoraLocal),
            motivo: v.motivo,
            evidencia: v.evidencia,
          }),
          onCerrar,
        )
      }
    >
      <Campo label="Qué movimiento es *" error={campo('categoria')}>
        <select value={v.categoria} onChange={set('categoria')}>
          <optgroup label="Entra al tanque">
            {CATEGORIAS_BASE.slice(0, 2).map((c) => (
              <option key={c} value={c}>
                {ETIQUETA_CATEGORIA_BASE[c]}
              </option>
            ))}
          </optgroup>
          <optgroup label="Sale del tanque">
            {CATEGORIAS_BASE.slice(2).map((c) => (
              <option key={c} value={c}>
                {ETIQUETA_CATEGORIA_BASE[c]}
              </option>
            ))}
          </optgroup>
        </select>
      </Campo>
      <Campo label="Fecha y hora *" error={campo('fechaHora')} ayuda={`Hora de ${hora.zonaHoraria}`}>
        <input type="datetime-local" value={v.fechaHoraLocal} onChange={set('fechaHoraLocal')} />
      </Campo>
      <Campo label="Litros *" error={campo('litros')}>
        <input inputMode="decimal" value={v.litros} onChange={set('litros')} />
      </Campo>
      <Campo label="Detalle *" error={campo('motivo')} ayuda="Proveedor, quién lo hizo, qué pasó.">
        <input maxLength={500} value={v.motivo} onChange={set('motivo')} />
      </Campo>
      <Campo label={conEvidencia ? 'Evidencia *' : 'Evidencia'} error={campo('evidencia')} ayuda="Número de remito, factura o denuncia.">
        <input maxLength={500} value={v.evidencia} onChange={set('evidencia')} />
      </Campo>
    </Panel>
  );
}

function FormResponsable({ t, onCerrar }: { t: TanqueBase; onCerrar: () => void }) {
  const asignar = useAsignarResponsableBase();
  const { data: usuarios } = useUsuarios();
  const { error, enviar, campo } = useEnvio();
  const hora = useHora();
  const [v, setV] = useState({ usuarioId: '', desdeLocal: hora.ahora() });

  return (
    <Panel
      titulo="Asignar el responsable de la base"
      explicacion="La diferencia de cada segmento se atribuye a quien era responsable en ese momento. Los cambios posteriores se hacen por traspaso, con una medición."
      error={error}
      ocupado={asignar.isPending}
      textoBoton="Asignar"
      onCerrar={onCerrar}
      onConfirmar={() =>
        enviar(asignar.mutateAsync({ depositoId: t.id, usuarioId: v.usuarioId, desde: hora.aIso(v.desdeLocal) }), onCerrar)
      }
    >
      <SelectorUsuario valor={v.usuarioId} usuarios={usuarios} error={campo('usuarioId')} onChange={(x) => setV({ ...v, usuarioId: x })} />
      <Campo label="Desde *" error={campo('desde')} ayuda="Anterior al control inicial, si ya está registrado.">
        <input type="datetime-local" value={v.desdeLocal} onChange={(e) => setV({ ...v, desdeLocal: e.target.value })} />
      </Campo>
    </Panel>
  );
}

function FormTraspaso({ t, onCerrar }: { t: TanqueBase; onCerrar: () => void }) {
  const traspasar = useTraspasarResponsableBase();
  const { data: usuarios } = useUsuarios();
  const { error, enviar, campo } = useEnvio();
  const hora = useHora();
  const [v, setV] = useState({ usuarioId: '', fechaHoraLocal: hora.ahora(), litros: '', metodo: 'varilla', observaciones: '' });
  const set = (k: keyof typeof v) => (e: { target: { value: string } }) => setV({ ...v, [k]: e.target.value });

  return (
    <Panel
      titulo="Traspasar la base a otro responsable"
      explicacion="Se mide el tanque en el momento del traspaso: esa medición cierra el segmento del responsable que sale y abre el del que entra."
      error={error}
      ocupado={traspasar.isPending}
      textoBoton="Traspasar"
      onCerrar={onCerrar}
      onConfirmar={() =>
        enviar(
          traspasar.mutateAsync({
            depositoId: t.id,
            usuarioId: v.usuarioId,
            fechaHora: hora.aIso(v.fechaHoraLocal),
            litros: v.litros,
            metodo: v.metodo as (typeof METODOS_MEDICION)[number],
            observaciones: v.observaciones,
          }),
          onCerrar,
        )
      }
    >
      <SelectorUsuario
        valor={v.usuarioId}
        usuarios={usuarios}
        error={campo('usuarioId')}
        etiqueta="Recibe la base *"
        onChange={(x) => setV({ ...v, usuarioId: x })}
      />
      <Campo label="Fecha y hora *" error={campo('fechaHora')} ayuda={`Hora de ${hora.zonaHoraria}`}>
        <input type="datetime-local" value={v.fechaHoraLocal} onChange={set('fechaHoraLocal')} />
      </Campo>
      <Campo label="Litros medidos *" error={campo('litros')}>
        <input inputMode="decimal" value={v.litros} onChange={set('litros')} />
      </Campo>
      <CampoMetodo valor={v.metodo} error={campo('metodo')} onChange={set('metodo')} />
      <Campo label="Observaciones" error={campo('observaciones')}>
        <input maxLength={500} value={v.observaciones} onChange={set('observaciones')} />
      </Campo>
    </Panel>
  );
}

function SelectorUsuario({
  valor,
  usuarios,
  error,
  etiqueta = 'Responsable *',
  onChange,
}: {
  valor: string;
  usuarios: { id: number; nombre: string }[] | undefined;
  error: string | undefined;
  etiqueta?: string;
  onChange: (v: string) => void;
}) {
  return (
    <Campo label={etiqueta} error={error}>
      <select value={valor} onChange={(e) => onChange(e.target.value)}>
        <option value="">Elegí…</option>
        {usuarios?.map((u) => (
          <option key={u.id} value={u.id}>
            {u.nombre}
          </option>
        ))}
      </select>
    </Campo>
  );
}
