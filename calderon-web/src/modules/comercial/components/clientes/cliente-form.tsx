'use client';

import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useForm, type Path } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ArrowLeft, CircleAlert, LoaderCircle, RefreshCw, TriangleAlert } from 'lucide-react';
import type { ErrorAccion } from '@/server/actions/result';
import { cn } from '@/shared/lib/cn';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import type { ClienteId } from '@/shared/types/dominio';
import {
  clienteAltaSchema,
  normalizarRazonSocial,
  valoresAltaCliente,
  valoresEdicionCliente,
  type ClienteDatos,
  type ClienteFormInput,
} from '../../domain/cliente.schemas';
import {
  AYUDA_ESTADO_CLIENTE,
  CONDICION_PAGO_MAX,
  ESTADOS_CLIENTE,
  ETIQUETA_ESTADO_CLIENTE,
  type Cliente,
} from '../../domain/cliente.types';
import { nombreIdentificador } from '../../domain/identificador-fiscal';
import {
  useCatalogosComercial,
  useCliente,
  useClientesParecidos,
  useCrearCliente,
  useEditarCliente,
  useSegmentosCliente,
} from '../../queries/hooks';
import { EstadoClienteChip } from './estado-cliente';

type Props = { modo: 'alta' } | { modo: 'edicion'; cliente: Cliente };

const AYUDA_IDENTIFICADOR: Record<string, string> = {
  AR: '11 dígitos, con o sin guiones; se verifica el dígito final.',
  CL: 'Formato 76123456-7; se verifica el dígito final.',
};

/** P-CLI-01 · Alta y edición de cliente. */
export function ClienteForm(props: Props) {
  const router = useRouter();
  const { data: catalogos, isPending: cargandoCatalogos } = useCatalogosComercial();
  const { data: segmentos } = useSegmentosCliente();
  const crear = useCrearCliente();
  const editar = useEditarCliente();
  const idSegmentos = useId();

  const original = props.modo === 'edicion' ? props.cliente : null;
  // En edición se lee la ficha de la caché (hidratada por la página) para poder recargarla ante un conflicto.
  const ficha = useCliente((original?.id ?? 0) as ClienteId, { enabled: original !== null });
  const [version, setVersion] = useState(original?.versionFila ?? 0);
  const [error, setError] = useState<ErrorAccion | null>(null);
  const avisoRef = useRef<HTMLDivElement>(null);

  // El aviso queda arriba del formulario: se lleva a la vista para que no pase inadvertido.
  useEffect(() => {
    if (error) avisoRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [error]);

  const form = useForm<ClienteFormInput, unknown, ClienteDatos>({
    resolver: zodResolver(clienteAltaSchema),
    defaultValues: original ? valoresEdicionCliente(original) : valoresAltaCliente(),
    mode: 'onTouched',
  });
  const { register, formState, handleSubmit, setValue, reset, watch } = form;
  const monedaElegida = useRef(false);
  const e = formState.errors;
  const enviando = crear.isPending || editar.isPending || formState.isSubmitting;
  const pais = watch('pais');
  const razonSocial = watch('razonSocial');
  const parecidos = useClientesParecidos(razonSocial, original?.id);

  // En el alta, la moneda sigue a la del país mientras el usuario no la haya elegido a mano.
  useEffect(() => {
    if (original || !catalogos || monedaElegida.current) return;
    const defecto = catalogos.paises.find((p) => p.iso2 === pais)?.monedaDefecto;
    if (defecto) setValue('monedaFacturacion', defecto);
  }, [pais, catalogos, original, setValue]);

  /** Errores de la server action: los de campo se marcan en el formulario, el resto arriba. */
  const mostrarError = (err: ErrorAccion) => {
    setError(err);
    for (const [campo, mensaje] of Object.entries(err.campos ?? {})) {
      form.setError(campo as Path<ClienteFormInput>, { type: 'server', message: mensaje });
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
    router.push(`/comercial/clientes/${r.data.id}`);
  });

  /** Ante un conflicto de versión: trae la versión actual y la carga en el formulario. */
  const recargar = async () => {
    const { data, isError } = await ficha.refetch();
    if (isError || !data) {
      setError({ codigo: 'desconocido', mensaje: 'No se pudo recargar el cliente. Revisá la conexión e intentá de nuevo.' });
      return;
    }
    setVersion(data.versionFila);
    reset(valoresEdicionCliente(data));
    setError(null);
  };

  const volver = original ? `/comercial/clientes/${original.id}` : '/cotizaciones/datos-clientes';
  const estado = watch('estado');
  const listaParecidos = parecidos.data ?? [];
  // Solo se avisa cuando la razón social cambió respecto de la guardada.
  const mostrarParecidos = listaParecidos.length > 0 && normalizarRazonSocial(razonSocial) !== (original?.razonSocial ?? '');

  return (
    <form noValidate onSubmit={enviar} className="max-w-4xl space-y-5">
      <Link href={volver} className="inline-flex items-center gap-1 text-sm text-tinta-suave hover:text-tinta">
        <ArrowLeft className="size-4" /> {original ? original.razonSocial : 'Clientes'}
      </Link>

      <header>
        <h1 className="text-2xl font-semibold text-tinta">{original ? `Editar cliente ${original.codigo}` : 'Nuevo cliente'}</h1>
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
        <Campo label="Código *" error={e.codigo?.message}>
          <input autoComplete="off" maxLength={30} {...register('codigo')} />
        </Campo>
        <Campo label="País *" error={e.pais?.message}>
          <select {...register('pais')} disabled={cargandoCatalogos}>
            <option value="">Elegí…</option>
            {catalogos?.paises.map((p) => (
              <option key={p.iso2} value={p.iso2}>
                {p.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <div className="sm:col-span-2">
          <Campo label="Razón social *" error={e.razonSocial?.message}>
            <input autoComplete="off" maxLength={200} {...register('razonSocial')} />
          </Campo>
          {mostrarParecidos && (
            <div role="status" className="mt-2 rounded-lg border border-alerta/30 bg-alerta-suave p-3 text-sm">
              <p className="flex items-center gap-1.5 font-medium text-alerta">
                <TriangleAlert className="size-4" /> Clientes con nombre parecido: revisá que no sea un duplicado.
              </p>
              <ul className="mt-2 space-y-1">
                {listaParecidos.map((c) => (
                  <li key={c.id} className="flex flex-wrap items-center gap-2">
                    <Link href={`/comercial/clientes/${c.id}`} target="_blank" className="font-medium text-marca hover:underline">
                      {c.razonSocial}
                    </Link>
                    <span className="text-xs text-tinta-suave">
                      {c.codigo} · {c.pais}
                    </span>
                    {c.estado !== 'activo' && <EstadoClienteChip estado={c.estado} />}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <Campo
          label={`${nombreIdentificador(pais)} *`}
          error={e.identificadorFiscal?.message}
          ayuda={AYUDA_IDENTIFICADOR[pais] ?? 'Único por país.'}
        >
          <input autoComplete="off" maxLength={30} className="font-mono uppercase" {...register('identificadorFiscal')} />
        </Campo>
      </Bloque>

      <Bloque titulo="Condiciones comerciales">
        <Campo label="Moneda de facturación *" error={e.monedaFacturacion?.message} ayuda={original ? undefined : 'Por defecto, la del país.'}>
          <select {...register('monedaFacturacion', { onChange: () => (monedaElegida.current = true) })} disabled={cargandoCatalogos}>
            <option value="">Elegí…</option>
            {catalogos?.monedas.map((m) => (
              <option key={m.codigo} value={m.codigo}>
                {m.codigo} · {m.nombre}
              </option>
            ))}
          </select>
        </Campo>
        <Campo label="Condición de pago (días)" error={e.condicionPagoDias?.message} ayuda={`De 0 a ${CONDICION_PAGO_MAX}. 0 = contado.`}>
          <input inputMode="numeric" maxLength={3} {...register('condicionPagoDias')} />
        </Campo>
        <Campo label="Segmento" error={e.segmento?.message} ayuda={segmentos && segmentos.length > 0 ? 'Elegí uno existente o escribí uno nuevo.' : undefined}>
          <input autoComplete="off" maxLength={60} list={idSegmentos} {...register('segmento')} />
        </Campo>
        <datalist id={idSegmentos}>
          {segmentos?.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
      </Bloque>

      <Bloque titulo="Situación">
        <Campo label="Estado *" error={e.estado?.message} ayuda={AYUDA_ESTADO_CLIENTE[estado]}>
          <select {...register('estado')}>
            {ESTADOS_CLIENTE.map((s) => (
              <option key={s} value={s}>
                {ETIQUETA_ESTADO_CLIENTE[s]}
              </option>
            ))}
          </select>
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
