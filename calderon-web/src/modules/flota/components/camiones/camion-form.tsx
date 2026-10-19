'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm, type Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, CircleAlert, LoaderCircle, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { useSesion } from '@/modules/core/session/session-provider';
import type { ErrorAccion } from '@/server/actions/result';
import { cn } from '@/shared/lib/cn';
import { hoyEnZona } from '@/shared/lib/fechas';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import {
  camionAltaSchema,
  normalizarPatente,
  valoresAltaCamion,
  valoresEdicionCamion,
  type CamionDatos,
  type CamionFormInput,
} from '../../domain/camion.schemas';
import { ESTADOS_CAMION, ETIQUETA_ESTADO_CAMION, ETIQUETA_PROPIETARIO, PROPIETARIOS_CAMION, type Camion } from '../../domain/camion.types';
import { filaTanqueVacia, tanqueFilaSchema, type TanqueFilaEntrada } from '../../domain/tanque.schemas';
import { ETIQUETA_TIPO_TANQUE, TIPOS_TANQUE } from '../../domain/tanque.types';
import { useCamion, useCatalogosFlota, useCrearCamion, useCrearTanques, useEditarCamion } from '../../queries/hooks';
import { TanquesCamion } from './tanques-camion';

/** Alta: datos sugeridos (por ejemplo, desde la telemetría: patente, VIN, marca y modelo). */
export type CamionSugerido = Partial<Pick<CamionFormInput, 'patente' | 'paisPatente' | 'vin' | 'marca' | 'modelo'>>;

type Props = { modo: 'alta'; sugerido?: CamionSugerido } | { modo: 'edicion'; camion: Camion };

/** F-MAE-01 · Alta y edición de camión. */
export function CamionForm(props: Props) {
  const router = useRouter();
  const { zonaHoraria } = useSesion();
  const { data: catalogos, isPending: cargandoCatalogos } = useCatalogosFlota();
  const crear = useCrearCamion();
  const editar = useEditarCamion();
  const crearTanques = useCrearTanques();
  // Alta: tanques del camión nuevo (se guardan después del camión, todos juntos)
  const [tanques, setTanques] = useState<TanqueFilaEntrada[]>([
    { tipo: 'principal', descripcion: '', capacidadNominalL: '', capacidadUtilL: '' },
  ]);
  const [erroresTanques, setErroresTanques] = useState<Record<string, string>>({});

  const original = props.modo === 'edicion' ? props.camion : null;
  // En edición se lee la ficha de la caché (hidratada por la página) para poder recargarla ante un conflicto.
  const ficha = useCamion((original?.id ?? 0) as Camion['id'], { enabled: original !== null });
  const [version, setVersion] = useState(original?.versionFila ?? 0);
  const [error, setError] = useState<ErrorAccion | null>(null);
  const avisoRef = useRef<HTMLDivElement>(null);

  // El aviso queda arriba del formulario: se lleva a la vista para que no pase inadvertido.
  useEffect(() => {
    if (error) avisoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  const form = useForm<CamionFormInput, unknown, CamionDatos>({
    resolver: zodResolver(camionAltaSchema),
    defaultValues: original
      ? valoresEdicionCamion(original)
      : { ...valoresAltaCamion(hoyEnZona(zonaHoraria)), ...(props.modo === 'alta' ? props.sugerido : {}) },
    mode: 'onTouched',
  });
  const { register, formState, handleSubmit, setValue, reset } = form;
  const e = formState.errors;
  const enviando = crear.isPending || editar.isPending || crearTanques.isPending || formState.isSubmitting;

  /** Errores de la server action: los de campo se marcan en el formulario, el resto arriba. */
  const mostrarError = (err: ErrorAccion) => {
    setError(err);
    for (const [campo, mensaje] of Object.entries(err.campos ?? {})) {
      form.setError(campo as Path<CamionFormInput>, { type: 'server', message: mensaje });
    }
  };

  const enviar = handleSubmit(async () => {
    setError(null);
    // La action vuelve a validar con el mismo esquema: recibe los valores crudos del formulario.
    const valores = form.getValues();
    if (original) {
      const r = await editar.mutateAsync({ ...valores, id: original.id, versionFila: version });
      if (!r.ok) return mostrarError(r.error);
      router.push(`/flota/camiones/${r.data.id}`);
      return;
    }

    // Alta: primero se revisa la forma de los tanques (números bien escritos) para no crear el camión a medias.
    const filas = tanques.filter((t) => !filaTanqueVacia(t));
    const errores: Record<string, string> = {};
    filas.forEach((t) => {
      const p = tanqueFilaSchema.safeParse(t);
      if (!p.success) for (const i of p.error.issues) errores[`${tanques.indexOf(t)}.${String(i.path[0])}`] ??= i.message;
    });
    setErroresTanques(errores);
    if (Object.keys(errores).length > 0) {
      setError({ codigo: 'validacion', mensaje: 'Revisá los tanques marcados.' });
      return;
    }

    const r = await crear.mutateAsync(valores);
    if (!r.ok) return mostrarError(r.error);
    if (filas.length > 0) {
      const t = await crearTanques.mutateAsync({ camionId: r.data.id, vigenteDesde: valores.fechaAlta, tanques: filas });
      if (!t.ok) {
        // El camión ya existe: se abre su ficha con el mensaje de la base para cargar los tanques ahí.
        router.push(`/flota/camiones/${r.data.id}?tanques=${encodeURIComponent(t.error.mensaje)}#tanques`);
        return;
      }
    }
    router.push(`/flota/camiones/${r.data.id}`);
  });

  /** Ante un conflicto de versión: trae la versión actual y la carga en el formulario. */
  const recargar = async () => {
    const { data, isError } = await ficha.refetch();
    if (isError || !data) {
      setError({ codigo: 'desconocido', mensaje: 'No se pudo recargar el camión. Revisá la conexión e intentá de nuevo.' });
      return;
    }
    setVersion(data.versionFila);
    reset(valoresEdicionCamion(data));
    setError(null);
  };

  const volver = original ? `/flota/camiones/${original.id}` : '/flota/camiones';

  return (
    <div className="max-w-4xl space-y-5">
      <form noValidate onSubmit={enviar} className="space-y-5">
        <Link href={volver} className="inline-flex items-center gap-1 text-sm text-tinta-suave hover:text-tinta">
          <ArrowLeft className="size-4" /> {original ? original.codigoInterno : 'Camiones'}
        </Link>

        <header>
          <h1 className="text-2xl font-semibold text-tinta">{original ? `Editar camión ${original.codigoInterno}` : 'Nuevo camión'}</h1>
          <p className="mt-1 text-sm text-tinta-suave">Los campos con * son obligatorios.</p>
        </header>

        {error && (
          <div
            ref={avisoRef}
            role="alert"
            className="flex flex-wrap items-start gap-3 rounded-lg border border-error/30 bg-error-suave p-3 text-sm text-error"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0" />
            <p className="flex-1">{error.mensaje}</p>
            {error.codigo === 'conflicto_version' && (
              <button type="button" onClick={recargar} className="inline-flex items-center gap-1 font-medium underline">
                <RefreshCw className="size-3.5" /> Recargar datos actuales
              </button>
            )}
          </div>
        )}

        <Bloque titulo="Identificación">
          <Campo label="Código interno *" error={e.codigoInterno?.message}>
            <input autoComplete="off" maxLength={30} {...register('codigoInterno')} />
          </Campo>
          <Campo label="Patente *" error={e.patente?.message} ayuda="Se guarda en mayúsculas y sin espacios.">
            <input
              autoComplete="off"
              maxLength={14}
              className="font-mono uppercase"
              {...register('patente', {
                onBlur: (ev: { target: { value: string } }) => setValue('patente', normalizarPatente(ev.target.value)),
              })}
            />
          </Campo>
          <Campo label="País de la patente *" error={e.paisPatente?.message}>
            <select {...register('paisPatente')} disabled={cargandoCatalogos}>
              <option value="">Elegí…</option>
              {catalogos?.paises.map((p) => (
                <option key={p.iso2} value={p.iso2}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="VIN" error={e.vin?.message}>
            <input autoComplete="off" maxLength={20} className="font-mono uppercase" {...register('vin')} />
          </Campo>
          <Campo label="Identificador Optifleet" error={e.idOptifleet?.message} ayuda="Enlace con la telemetría de Renault.">
            <input autoComplete="off" maxLength={60} {...register('idOptifleet')} />
          </Campo>
        </Bloque>

        <Bloque titulo="Vehículo">
          <Campo label="Marca" error={e.marca?.message}>
            <input maxLength={60} {...register('marca')} />
          </Campo>
          <Campo label="Modelo" error={e.modelo?.message}>
            <input maxLength={60} {...register('modelo')} />
          </Campo>
          <Campo label="Año" error={e.anio?.message}>
            <input inputMode="numeric" maxLength={4} placeholder="AAAA" {...register('anio')} />
          </Campo>
          <Campo label="Tipo de combustible *" error={e.tipoCombustibleId?.message}>
            <select {...register('tipoCombustibleId')} disabled={cargandoCatalogos}>
              <option value="">Elegí…</option>
              {catalogos?.tiposCombustible.map((t) => (
                <option key={t.id} value={String(t.id)}>
                  {t.nombre}
                </option>
              ))}
            </select>
          </Campo>
          <Campo
            label="Consumo de referencia (l/100 km)"
            error={e.consumoReferencia?.message}
            ayuda="Base teórica; no reemplaza la línea base real."
          >
            <input inputMode="decimal" placeholder="Ej.: 32,5" {...register('consumoReferencia')} />
          </Campo>
        </Bloque>

        <Bloque titulo="Situación">
          <Campo label="Estado *" error={e.estado?.message}>
            <select {...register('estado')}>
              {ESTADOS_CAMION.map((s) => (
                <option key={s} value={s}>
                  {ETIQUETA_ESTADO_CAMION[s]}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Propietario *" error={e.propietarioTipo?.message}>
            <select {...register('propietarioTipo')}>
              {PROPIETARIOS_CAMION.map((p) => (
                <option key={p} value={p}>
                  {ETIQUETA_PROPIETARIO[p]}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Fecha de alta *" error={e.fechaAlta?.message}>
            <input type="date" {...register('fechaAlta')} />
          </Campo>
          <Campo label="Fecha de baja" error={e.fechaBaja?.message} ayuda="Solo para la baja operativa (estado Inactivo).">
            <input type="date" {...register('fechaBaja')} />
          </Campo>
        </Bloque>

        {!original && <TanquesAlta tanques={tanques} onCambiar={setTanques} errores={erroresTanques} />}

        <div className="flex flex-wrap items-center gap-3">
          <button type="submit" disabled={enviando} className={BOTON_PRIMARIO}>
            {enviando && <LoaderCircle className="size-4 animate-spin" />}
            {original ? 'Guardar cambios' : 'Dar de alta'}
          </button>
          <Link href={volver} className={BOTON_SECUNDARIO}>
            Cancelar
          </Link>
        </div>
      </form>

      {original && (
        <>
          <p className="pt-2 text-sm text-tinta-suave">
            Los tanques se guardan al momento, cada cambio por separado (no con «Guardar cambios»).
          </p>
          <TanquesCamion camion={original} />
        </>
      )}
    </div>
  );
}

/** Alta del camión: tanques que tiene (todos rigen desde la fecha de alta). Opcional. */
function TanquesAlta({
  tanques,
  onCambiar,
  errores,
}: {
  tanques: TanqueFilaEntrada[];
  onCambiar: (t: TanqueFilaEntrada[]) => void;
  errores: Record<string, string>;
}) {
  const cambiar = (i: number, campo: keyof TanqueFilaEntrada, valor: string) =>
    onCambiar(tanques.map((t, j) => (j === i ? { ...t, [campo]: valor } : t)));
  const siguienteTipo = (): TanqueFilaEntrada['tipo'] =>
    tanques.some((t) => t.tipo === 'principal') ? (tanques.some((t) => t.tipo === 'secundario') ? 'mochila' : 'secundario') : 'principal';

  return (
    <fieldset className={cn(TARJETA, 'p-5')}>
      <legend className="sr-only">Tanques de combustible</legend>
      <h2 className="text-sm font-semibold text-tinta" aria-hidden>
        Tanques de combustible
      </h2>
      <p className="mt-1 mb-4 text-sm text-tinta-suave">
        Capacidad de cada tanque (principal, secundario, mochila). La suma es la capacidad del camión. La útil es lo que realmente entra. Se
        puede dejar vacío y cargarlo después desde la ficha.
      </p>
      <div className="space-y-3">
        {tanques.map((t, i) => (
          <div key={i} className="grid items-start gap-3 sm:grid-cols-[9rem_1fr_1fr_1.5fr_auto]">
            <Campo label="Tipo" error={errores[`${i}.tipo`]}>
              <select value={t.tipo} onChange={(ev) => cambiar(i, 'tipo', ev.target.value)}>
                {TIPOS_TANQUE.map((x) => (
                  <option key={x} value={x}>
                    {ETIQUETA_TIPO_TANQUE[x]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label="Nominal (L)" error={errores[`${i}.capacidadNominalL`]}>
              <input inputMode="decimal" value={t.capacidadNominalL} onChange={(ev) => cambiar(i, 'capacidadNominalL', ev.target.value)} />
            </Campo>
            <Campo label="Útil (L)" error={errores[`${i}.capacidadUtilL`]}>
              <input inputMode="decimal" value={t.capacidadUtilL} onChange={(ev) => cambiar(i, 'capacidadUtilL', ev.target.value)} />
            </Campo>
            <Campo label={t.tipo === 'otro' ? 'Descripción *' : 'Descripción'} error={errores[`${i}.descripcion`]}>
              <input maxLength={200} value={t.descripcion ?? ''} onChange={(ev) => cambiar(i, 'descripcion', ev.target.value)} />
            </Campo>
            <button
              type="button"
              aria-label="Quitar este tanque"
              className="mt-7 inline-flex size-10 items-center justify-center rounded-md border border-borde text-tinta-suave hover:bg-hover"
              onClick={() => onCambiar(tanques.filter((_, j) => j !== i))}
            >
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        className={cn(BOTON_SECUNDARIO, 'mt-4')}
        onClick={() => onCambiar([...tanques, { tipo: siguienteTipo(), descripcion: '', capacidadNominalL: '', capacidadUtilL: '' }])}
      >
        <Plus className="size-4" /> Agregar tanque
      </button>
    </fieldset>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <fieldset className={cn(TARJETA, 'p-5')}>
      <legend className="sr-only">{titulo}</legend>
      <h2 className="mb-4 text-sm font-semibold text-tinta" aria-hidden>
        {titulo}
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>
    </fieldset>
  );
}
