'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm, type Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, CircleAlert, LoaderCircle, RefreshCw } from 'lucide-react';
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
import { useCamion, useCatalogosFlota, useCrearCamion, useEditarCamion } from '../../queries/hooks';

type Props = { modo: 'alta' } | { modo: 'edicion'; camion: Camion };

/** F-MAE-01 · Alta y edición de camión. */
export function CamionForm(props: Props) {
  const router = useRouter();
  const { zonaHoraria } = useSesion();
  const { data: catalogos, isPending: cargandoCatalogos } = useCatalogosFlota();
  const crear = useCrearCamion();
  const editar = useEditarCamion();

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
    defaultValues: original ? valoresEdicionCamion(original) : valoresAltaCamion(hoyEnZona(zonaHoraria)),
    mode: 'onTouched',
  });
  const { register, formState, handleSubmit, setValue, reset } = form;
  const e = formState.errors;
  const enviando = crear.isPending || editar.isPending || formState.isSubmitting;

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
    const r = original
      ? await editar.mutateAsync({ ...valores, id: original.id, versionFila: version })
      : await crear.mutateAsync(valores);
    if (!r.ok) return mostrarError(r.error);
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
    <form noValidate onSubmit={enviar} className="max-w-4xl space-y-5">
      <Link href={volver} className="inline-flex items-center gap-1 text-sm text-tinta-suave hover:text-tinta">
        <ArrowLeft className="size-4" /> {original ? original.codigoInterno : 'Camiones'}
      </Link>

      <header>
        <h1 className="text-2xl font-semibold text-tinta">{original ? `Editar camión ${original.codigoInterno}` : 'Nuevo camión'}</h1>
        <p className="mt-1 text-sm text-tinta-suave">Los campos con * son obligatorios.</p>
      </header>

      {error && (
        <div ref={avisoRef} role="alert" className="flex flex-wrap items-start gap-3 rounded-lg border border-error/30 bg-error-suave p-3 text-sm text-error">
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
