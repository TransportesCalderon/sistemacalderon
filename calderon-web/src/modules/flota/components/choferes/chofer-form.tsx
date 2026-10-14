'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm, type Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, CircleAlert, LoaderCircle, Lock, RefreshCw } from 'lucide-react';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import type { ErrorAccion } from '@/server/actions/result';
import { cn } from '@/shared/lib/cn';
import { hoyEnZona } from '@/shared/lib/fechas';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { choferFormSchema, valoresAltaChofer, valoresEdicionChofer, type ChoferFormInput, type ChoferFormSalida } from '../../domain/chofer.schemas';
import {
  ESTADOS_CHOFER,
  ETIQUETA_ESTADO_CHOFER,
  ETIQUETA_TIPO_DOCUMENTO,
  TIPOS_DOCUMENTO,
  nombreCompleto,
  type Chofer,
} from '../../domain/chofer.types';
import { useBases, useCatalogosFlota, useChofer, useCrearChofer, useEditarChofer } from '../../queries/hooks';

type Props = { modo: 'alta' } | { modo: 'edicion'; chofer: Chofer };

const AYUDA_DOCUMENTO: Record<string, string> = {
  DNI: '7 u 8 dígitos, sin puntos.',
  CUIL: '11 dígitos; se verifica el dígito final.',
  RUT: 'Formato 12345678-9; se verifica el dígito final.',
  PASAPORTE: 'Letras y números, tal como figura en el pasaporte.',
  OTRO: 'Letras, números o guiones.',
};

/** F-MAE-03 · Alta y edición de chofer. */
export function ChoferForm(props: Props) {
  const router = useRouter();
  const { zonaHoraria } = useSesion();
  const { data: catalogos, isPending: cargandoCatalogos } = useCatalogosFlota();
  const { data: bases, isPending: cargandoBases } = useBases();
  const puedeCambiarDocumento = useCan('flota.documento_chofer:editar');
  const crear = useCrearChofer();
  const editar = useEditarChofer();

  const original = props.modo === 'edicion' ? props.chofer : null;
  const ficha = useChofer((original?.id ?? 0) as Chofer['id'], { enabled: original !== null });
  const [version, setVersion] = useState(original?.versionFila ?? 0);
  const [error, setError] = useState<ErrorAccion | null>(null);
  const avisoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (error) avisoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  const form = useForm<ChoferFormInput, unknown, ChoferFormSalida>({
    resolver: zodResolver(choferFormSchema),
    defaultValues: original ? valoresEdicionChofer(original) : valoresAltaChofer(hoyEnZona(zonaHoraria)),
    mode: 'onTouched',
  });
  const { register, formState, handleSubmit, reset, watch, setValue } = form;
  const e = formState.errors;
  const enviando = crear.isPending || editar.isPending || formState.isSubmitting;
  const cambiarDocumento = watch('cambiarDocumento');
  const tipoDocumento = watch('documentoTipo');

  const mostrarError = (err: ErrorAccion) => {
    setError(err);
    for (const [campo, mensaje] of Object.entries(err.campos ?? {})) {
      form.setError(campo as Path<ChoferFormInput>, { type: 'server', message: mensaje });
    }
  };

  const enviar = handleSubmit(async () => {
    setError(null);
    // La action vuelve a validar con su esquema: recibe los valores crudos del formulario.
    const valores = form.getValues();
    const r = original
      ? await editar.mutateAsync({ ...valores, id: original.id, versionFila: version })
      : await crear.mutateAsync({ ...valores, cambiarDocumento: true });
    if (!r.ok) return mostrarError(r.error);
    router.push(`/flota/choferes/${r.data.id}`);
  });

  const recargar = async () => {
    const { data, isError } = await ficha.refetch();
    if (isError || !data) {
      setError({ codigo: 'desconocido', mensaje: 'No se pudo recargar el chofer. Revisá la conexión e intentá de nuevo.' });
      return;
    }
    setVersion(data.versionFila);
    reset(valoresEdicionChofer(data));
    setError(null);
  };

  const volver = original ? `/flota/choferes/${original.id}` : '/flota/choferes';
  const mostrarCamposDocumento = !original || cambiarDocumento;

  return (
    <form noValidate onSubmit={enviar} className="max-w-4xl space-y-5">
      <Link href={volver} className="inline-flex items-center gap-1 text-sm text-tinta-suave hover:text-tinta">
        <ArrowLeft className="size-4" /> {original ? nombreCompleto(original) : 'Choferes'}
      </Link>

      <header>
        <h1 className="text-2xl font-semibold text-tinta">{original ? `Editar chofer ${nombreCompleto(original)}` : 'Nuevo chofer'}</h1>
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

      <Bloque titulo="Datos personales">
        <Campo label="Legajo *" error={e.legajo?.message}>
          <input autoComplete="off" maxLength={20} {...register('legajo')} />
        </Campo>
        <Campo label="País de residencia *" error={e.paisResidencia?.message}>
          <select {...register('paisResidencia')} disabled={cargandoCatalogos}>
            <option value="">Elegí…</option>
            {catalogos?.paises.map((p) => (
              <option key={p.iso2} value={p.iso2}>
                {p.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Nombre *" error={e.nombre?.message}>
          <input autoComplete="off" maxLength={80} {...register('nombre')} />
        </Campo>
        <Campo label="Apellido *" error={e.apellido?.message}>
          <input autoComplete="off" maxLength={80} {...register('apellido')} />
        </Campo>
      </Bloque>

      <fieldset className={cn(TARJETA, 'p-5')}>
        <legend className="sr-only">Documento</legend>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-tinta" aria-hidden>
            Documento
          </h2>
          <span className="inline-flex items-center gap-1 text-xs text-tinta-suave">
            <Lock className="size-3.5" /> Dato personal
          </span>
        </div>

        {original && !cambiarDocumento && (
          <div className="flex flex-wrap items-center gap-3 text-sm text-tinta-suave">
            <span>El documento guardado no se muestra ni se modifica desde aquí.</span>
            {puedeCambiarDocumento ? (
              <button
                type="button"
                className="font-medium text-marca hover:underline"
                onClick={() => setValue('cambiarDocumento', true, { shouldDirty: true })}
              >
                Cambiar documento
              </button>
            ) : (
              <span>Solo Administración y RR. HH. puede cambiarlo.</span>
            )}
          </div>
        )}

        {mostrarCamposDocumento && (
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo label="Tipo de documento *" error={e.documentoTipo?.message}>
              <select {...register('documentoTipo')}>
                {TIPOS_DOCUMENTO.map((t) => (
                  <option key={t} value={t}>
                    {ETIQUETA_TIPO_DOCUMENTO[t]}
                  </option>
                ))}
              </select>
            </Campo>
            <Campo label={original ? 'Número nuevo *' : 'Número *'} error={e.documentoNumero?.message} ayuda={AYUDA_DOCUMENTO[tipoDocumento]}>
              <input autoComplete="off" maxLength={30} className="font-mono uppercase" {...register('documentoNumero')} />
            </Campo>
            {original && (
              <p className="text-xs text-tinta-suave sm:col-span-2">
                El número anterior se reemplaza al guardar.{' '}
                <button
                  type="button"
                  className="font-medium text-marca hover:underline"
                  onClick={() => {
                    setValue('cambiarDocumento', false);
                    setValue('documentoNumero', '');
                    form.clearErrors(['documentoTipo', 'documentoNumero']);
                  }}
                >
                  No cambiar el documento
                </button>
              </p>
            )}
          </div>
        )}
      </fieldset>

      <Bloque titulo="Datos laborales">
        <Campo label="Base" error={e.baseUbicacionId?.message} ayuda={bases?.length === 0 ? 'No hay bases cargadas (Comercial > Ubicaciones).' : undefined}>
          <select {...register('baseUbicacionId')} disabled={cargandoBases}>
            <option value="">Sin base</option>
            {bases?.map((b) => (
              <option key={b.id} value={String(b.id)}>
                {b.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Categoría de liquidación" error={e.categoriaLiquidacion?.message} ayuda="Se usa en las reglas de liquidación por categoría.">
          <input autoComplete="off" maxLength={40} {...register('categoriaLiquidacion')} />
        </Campo>
        <Campo label="Identificador de conductor Optifleet" error={e.idConductorOptifleet?.message} ayuda="Tarjeta o código del conductor en la telemetría.">
          <input autoComplete="off" maxLength={60} {...register('idConductorOptifleet')} />
        </Campo>
      </Bloque>

      <Bloque titulo="Situación">
        <Campo label="Estado *" error={e.estado?.message}>
          <select {...register('estado')}>
            {ESTADOS_CHOFER.map((s) => (
              <option key={s} value={s}>
                {ETIQUETA_ESTADO_CHOFER[s]}
              </option>
            ))}
          </select>
        </Campo>
        <div className="hidden sm:block" />
        <Campo label="Fecha de ingreso *" error={e.fechaIngreso?.message}>
          <input type="date" {...register('fechaIngreso')} />
        </Campo>
        <Campo label="Fecha de egreso" error={e.fechaEgreso?.message} ayuda="Solo para la baja (estado Baja).">
          <input type="date" {...register('fechaEgreso')} />
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
