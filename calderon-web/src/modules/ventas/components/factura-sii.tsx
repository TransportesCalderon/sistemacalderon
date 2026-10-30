'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import { Eye, FileText, LoaderCircle, Save, Send, Undo2, X } from 'lucide-react';
import { useEnvio } from '@/modules/catalogos/components/comun';
import { AccionConMotivo, Chip, ErrorBase, type Tono } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { ETIQUETA_ESTADO_DTE, NOMBRE_DTE, VERSION_SII, type DocumentoSii, type VistaPreviaSii, type EstadoDte, type ResultadoSii, type SiiFactura } from '../domain/sii';
import { useEmitirSii, useGuardarClienteSii, useGuardarGlosaSii, useSiiVistaPrevia, useNotaCreditoSii, useProbarSii, useResolverDte, useSiiEstado, useSiiFactura } from '../queries/hooks';

import logoAurea from './aurea-logo.png';

const TONO_DTE: Record<EstadoDte, Tono> = { aceptado: 'exito', rechazado: 'error', sin_respuesta: 'alerta', descartado: 'neutro' };

/**
 * Migración 124 · Facturación electrónica (Facturacion.cl) dentro de la ficha de la factura.
 * La base decide el tipo (34 exenta para clientes chilenos, 110 exportación para extranjeros),
 * dice qué falta, arma y envía el documento; acá solo se muestra y se piden los datos del cliente.
 */
export function FacturaSii({ facturaId, version, estado, fecha }: { facturaId: number; version: number; estado: string; fecha: string }) {
  const hay = useBaseTiene(VERSION_SII);
  const puedeEstado = useCan('ventas.facturacion:transicionar');
  const { data: s } = useSiiFactura(facturaId, hay && puedeEstado);
  const emitir = useEmitirSii();
  const envio = useEnvio();
  const [resultado, setResultado] = useState<ResultadoSii | null>(null);
  const [verPrevia, setVerPrevia] = useState(false);

  if (!hay || !puedeEstado || !s) return null;
  // Una factura hecha por fuera del sistema (sin envíos al SII) no muestra el recuadro
  if (estado !== 'borrador' && s.documentos.length === 0) return null;
  const prueba = s.ambiente === 'prueba';
  const faltaCliente = s.faltantes.some((x) => x.startsWith('Cliente:') || x.includes('RUT'));

  return (
    <div className="space-y-3 rounded-lg border border-borde p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="font-semibold text-tinta">
          Facturación electrónica (SII) · <span className="font-normal">{s.tipoNombre}</span>
        </h3>
        {prueba && <Chip tono="alerta">Ambiente de PRUEBA: no es una factura real</Chip>}
      </div>
      <Conexion />

      {s.tipo === 34 && estado === 'borrador' && s.tcClp !== null && s.totalClp !== null && (
        <p className="text-sm text-tinta-suave">
          Precio pactado en dólares. Se emite en pesos chilenos al dólar de hoy ({formatearNumero(s.tcClp, 2)}): <b className="text-tinta">CLP {formatearNumero(s.totalClp, 0)}</b>.
          La factura lleva la leyenda con el valor en dólares (se ve en la vista previa).
        </p>
      )}
      {s.faltantes.length > 0 && estado === 'borrador' && (
        <div className="rounded-md bg-alerta/10 p-2 text-sm text-tinta">
          <p className="font-medium">Antes de emitir falta:</p>
          <ul className="list-disc pl-5">
            {s.faltantes.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      )}
      {faltaCliente && estado === 'borrador' && <DatosClienteSii s={s} />}

      {estado === 'borrador' && !verPrevia && (
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" className={BOTON_PRIMARIO} disabled={!s.puedeEmitir} onClick={() => { setResultado(null); setVerPrevia(true); }}>
            <Eye className="size-4" /> Ver vista previa
          </button>
          <span className="text-xs text-tinta-suave">Revisá la factura antes de enviarla. Con la fecha de la factura de abajo ({formatearFechaDia(fecha)}).</span>
        </div>
      )}
      {estado === 'borrador' && verPrevia && (
        <VistaPrevia
          facturaId={facturaId}
          fecha={fecha}
          prueba={prueba}
          enviando={emitir.isPending}
          onCerrar={() => setVerPrevia(false)}
          onEnviar={() => {
            setResultado(null);
            void envio.enviar(
              emitir.mutateAsync({ id: facturaId, version, fecha }).then((r) => {
                if (r.ok) {
                  setResultado(r.data);
                  if (r.data.ok) setVerPrevia(false);
                }
                return r;
              }),
              () => undefined,
            );
          }}
        />
      )}
      <ErrorBase error={envio.error} />
      {resultado && !resultado.ok && resultado.error && (
        <p className="rounded-md bg-error/10 p-2 text-sm text-error">{resultado.error}</p>
      )}
      {resultado?.ok && (
        <p className="rounded-md bg-exito/10 p-2 text-sm text-tinta">
          {prueba ? 'Envío de prueba aceptado' : 'Emitida en el SII'} con folio {resultado.folio}.
        </p>
      )}

      {s.documentos.length > 0 && (
        <ul className="divide-y divide-borde text-sm">
          {s.documentos.map((d) => (
            <FilaDocumento key={d.id} d={d} puedeAnular={s.puedeAnular && d.estado === 'aceptado' && (d.tipo === 34 || d.tipo === 110)} />
          ))}
        </ul>
      )}
    </div>
  );
}

function FilaDocumento({ d, puedeAnular }: { d: DocumentoSii; puedeAnular: boolean }) {
  const nc = useNotaCreditoSii();
  const envio = useEnvio();
  const [error, setError] = useState<string | null>(null);
  return (
    <li className="space-y-1 py-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">
          {NOMBRE_DTE[d.tipo] ?? `Documento ${d.tipo}`} {d.folio !== null && `N° ${d.folio}`}
        </span>
        <Chip tono={TONO_DTE[d.estado] ?? 'neutro'}>{ETIQUETA_ESTADO_DTE[d.estado] ?? d.estado}</Chip>
        {d.ambiente === 'prueba' && <Chip tono="neutro">prueba</Chip>}
        <span className="text-xs text-tinta-suave">
          {formatearFechaDia(d.fecha)}
          {d.creadoPor && ` · ${d.creadoPor}`}
        </span>
        {d.urlOriginal && (
          <a className="inline-flex items-center gap-1 text-marca hover:underline" href={d.urlOriginal} target="_blank" rel="noreferrer">
            <FileText className="size-4" /> PDF
          </a>
        )}
        {d.urlCedible && (
          <a className="inline-flex items-center gap-1 text-marca hover:underline" href={d.urlCedible} target="_blank" rel="noreferrer">
            <FileText className="size-4" /> Cedible
          </a>
        )}
      </div>
      {d.motivo && <p className="text-xs text-tinta-suave">Motivo: {d.motivo}</p>}
      {d.error && <p className={cn('text-xs', d.estado === 'aceptado' ? 'text-alerta' : 'text-error')}>{d.error}</p>}
      {d.estado === 'sin_respuesta' && <ResolverEnvio d={d} />}
      {puedeAnular && (
        <AccionConMotivo
          etiqueta="Nota de crédito"
          icono={<Undo2 className="size-4" />}
          titulo="Anular con nota de crédito"
          explicacion={
            d.ambiente === 'prueba'
              ? 'Se envía una nota de crédito de prueba que anula este documento.'
              : 'Se emite en el SII una nota de crédito que anula este documento, y la factura queda anulada (las operaciones vuelven a quedar para facturar).'
          }
          ocupado={nc.isPending}
          error={envio.error}
          onConfirmar={async (motivo) => {
            setError(null);
            const r = await nc.mutateAsync({ dteId: d.id, motivo });
            if (!r.ok) {
              envio.setError(r.error);
              return false;
            }
            if (!r.data.ok) setError(r.data.error);
            return true;
          }}
        />
      )}
      {error && <p className="rounded-md bg-error/10 p-2 text-sm text-error">{error}</p>}
    </li>
  );
}

/** Un envío sin respuesta se revisa en la web de Facturacion.cl (Libro de ventas) y se marca acá. */
function ResolverEnvio({ d }: { d: DocumentoSii }) {
  const resolver = useResolverDte();
  const envio = useEnvio();
  const [folio, setFolio] = useState('');
  return (
    <div className="space-y-2 rounded-md bg-alerta/10 p-2">
      <p className="text-sm">
        No llegó la respuesta. Fijate en la web de Facturacion.cl (Contabilidad › Libro de ventas) si el documento quedó emitido:
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <Campo label="Folio que muestra Facturacion.cl">
          <input inputMode="numeric" value={folio} onChange={(e) => setFolio(e.target.value)} />
        </Campo>
        <button
          type="button"
          className={BOTON_SECUNDARIO}
          disabled={resolver.isPending}
          onClick={() => void envio.enviar(resolver.mutateAsync({ dteId: d.id, folio: folio.trim() === '' ? 0 : Number(folio) }), () => setFolio(''))}
        >
          Sí, se emitió con ese folio
        </button>
        <button
          type="button"
          className={BOTON_SECUNDARIO}
          disabled={resolver.isPending}
          onClick={() => void envio.enviar(resolver.mutateAsync({ dteId: d.id, folio: null }), () => undefined)}
        >
          No se emitió (volver a enviar)
        </button>
      </div>
      <ErrorBase error={envio.error} />
    </div>
  );
}

function DatosClienteSii({ s }: { s: SiiFactura }) {
  const guardar = useGuardarClienteSii();
  const envio = useEnvio();
  const [d, setD] = useState({ giro: '', direccion: '', comuna: '', ciudad: '', correo: '' });
  useEffect(() => {
    setD({ giro: s.cliente.giro, direccion: s.cliente.direccion, comuna: s.cliente.comuna, ciudad: s.cliente.ciudad, correo: s.cliente.correo });
  }, [s.cliente]);
  const chileno = s.tipo === 34;
  return (
    <div className="space-y-2 rounded-md border border-borde p-2">
      <p className="text-sm font-medium">
        Datos de {s.cliente.razonSocial} para el SII{chileno && ` (RUT ${s.cliente.identificadorFiscal})`}
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        <Campo label={chileno ? 'Giro' : 'Giro (opcional)'}>
          <input value={d.giro} onChange={(e) => setD({ ...d, giro: e.target.value })} />
        </Campo>
        <Campo label="Dirección">
          <input value={d.direccion} onChange={(e) => setD({ ...d, direccion: e.target.value })} />
        </Campo>
        <Campo label={chileno ? 'Comuna' : 'Comuna / provincia (opcional)'}>
          <input value={d.comuna} onChange={(e) => setD({ ...d, comuna: e.target.value })} />
        </Campo>
        <Campo label="Ciudad">
          <input value={d.ciudad} onChange={(e) => setD({ ...d, ciudad: e.target.value })} />
        </Campo>
        <Campo label="Correo para enviarle la factura (opcional; varios con ;)">
          <input value={d.correo} onChange={(e) => setD({ ...d, correo: e.target.value })} />
        </Campo>
      </div>
      <button
        type="button"
        className={BOTON_SECUNDARIO}
        disabled={guardar.isPending}
        onClick={() => void envio.enviar(guardar.mutateAsync({ clienteId: s.cliente.id, ...d }), () => undefined)}
      >
        <Save className="size-4" /> Guardar los datos del cliente
      </button>
      <ErrorBase error={envio.error} />
    </div>
  );
}

/** Estado de la conexión: credenciales en Vault y prueba de inicio de sesión. */
function Conexion() {
  const { data: e } = useSiiEstado();
  const probar = useProbarSii();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  if (!e) return null;
  if (e.conectado && !msg) return null;
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      {!e.credenciales ? (
        <span className="text-error">
          Faltan las credenciales de Facturacion.cl en Supabase Vault (facturacion_cl_usuario, facturacion_cl_rut, facturacion_cl_clave).
        </span>
      ) : (
        <button
          type="button"
          className={BOTON_SECUNDARIO}
          disabled={probar.isPending}
          onClick={async () => {
            setMsg(null);
            const r = await probar.mutateAsync({});
            if (!r.ok) setMsg({ ok: false, texto: r.error.mensaje });
            else setMsg(r.data.ok ? { ok: true, texto: `Conectado a Facturacion.cl (ambiente de ${r.data.ambiente === 'produccion' ? 'producción' : 'prueba'}).` } : { ok: false, texto: r.data.error ?? '' });
          }}
        >
          {probar.isPending && <LoaderCircle className="size-4 animate-spin" />} Probar la conexión con Facturacion.cl
        </button>
      )}
      {msg && <span className={msg.ok ? 'text-exito' : 'text-error'}>{msg.texto}</span>}
    </div>
  );
}

const MAX_GLOSA = 100;
const plata = (moneda: 'CLP' | 'USD', n: number) => (moneda === 'CLP' ? `$ ${formatearNumero(n, 0)}` : `U$D ${formatearNumero(n, 2)}`);

/**
 * Migración 138: vista previa de la factura electrónica, como la va a recibir el SII. Los datos y la
 * leyenda los arma la base (ven.fn_sii_vista_previa); acá se muestran y se puede cambiar la leyenda.
 */
function VistaPrevia({
  facturaId,
  fecha,
  prueba,
  enviando,
  onCerrar,
  onEnviar,
}: {
  facturaId: number;
  fecha: string;
  prueba: boolean;
  enviando: boolean;
  onCerrar: () => void;
  onEnviar: () => void;
}) {
  const { data: v, error, isLoading } = useSiiVistaPrevia(facturaId, fecha, true);
  if (isLoading) return <p className="flex items-center gap-2 text-sm text-tinta-suave"><LoaderCircle className="size-4 animate-spin" /> Armando la vista previa…</p>;
  if (error || !v) return <p className="rounded-md bg-error/10 p-2 text-sm text-error">{error instanceof Error ? error.message : 'No se pudo armar la vista previa.'}</p>;
  return <HojaFactura v={v} facturaId={facturaId} prueba={prueba} enviando={enviando} onCerrar={onCerrar} onEnviar={onEnviar} />;
}

function HojaFactura({
  v,
  facturaId,
  prueba,
  enviando,
  onCerrar,
  onEnviar,
}: {
  v: VistaPreviaSii;
  facturaId: number;
  prueba: boolean;
  enviando: boolean;
  onCerrar: () => void;
  onEnviar: () => void;
}) {
  const guardar = useGuardarGlosaSii();
  const envio = useEnvio();
  const [glosa, setGlosa] = useState(v.glosa ?? '');
  useEffect(() => setGlosa(v.glosa ?? ''), [v.glosa]);
  const cambiada = glosa.trim() !== (v.glosa ?? '').trim();
  const e = v.emisor;
  const r = v.receptor;
  const lugar = (o: Record<string, string>) => [o.direccion, o.comuna, o.ciudad].filter(Boolean).join(', ');

  return (
    <div className="space-y-3 rounded-lg border-2 border-marca/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <h4 className="font-semibold text-tinta">Vista previa</h4>
        <button type="button" onClick={onCerrar} className="inline-flex items-center gap-1 text-sm text-tinta-suave">
          <X className="size-4" /> Cerrar
        </button>
      </div>

      {/* La hoja */}
      <div className="space-y-4 rounded-md border border-borde bg-white p-4 text-sm text-neutral-900 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1">
            <Image src={logoAurea} alt="AUREA CARGO" className="h-14 w-auto" />
            <p className="font-semibold">{e.razon_social}</p>
            <p className="text-xs">{e.giro}</p>
            <p className="text-xs">{lugar(e)}</p>
            {(e.correo || e.telefono) && <p className="text-xs">{[e.correo, e.telefono].filter(Boolean).join(' · ')}</p>}
          </div>
          <div className="min-w-48 rounded border-2 border-red-600 px-4 py-2 text-center font-semibold text-red-600">
            <p>R.U.T.: {e.rut}</p>
            <p className="uppercase">{v.tipoNombre}</p>
            <p>N° (se asigna al enviar)</p>
          </div>
        </div>

        <div className="grid gap-x-6 gap-y-1 rounded border border-neutral-300 p-2 text-xs sm:grid-cols-2">
          <p><b>Señor(es):</b> {r.razon_social}</p>
          <p><b>{r.pais === 'CL' || !r.pais ? 'R.U.T.' : 'Identificación'}:</b> {r.identificador_fiscal}</p>
          {r.giro && <p><b>Giro:</b> {r.giro}</p>}
          {lugar(r) && <p><b>Dirección:</b> {lugar(r)}</p>}
          <p><b>Fecha de emisión:</b> {formatearFechaDia(v.fecha)}</p>
          {v.vence && <p><b>Vencimiento:</b> {formatearFechaDia(v.vence)}</p>}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-neutral-400 text-left">
                <th className="py-1 pr-2">Detalle</th>
                <th className="py-1 pr-2 text-right">Cant.</th>
                <th className="py-1 pr-2 text-right">Precio</th>
                <th className="py-1 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {v.items.map((it) => (
                <tr key={it.n} className="border-b border-neutral-200 align-top">
                  <td className="py-1 pr-2">
                    <p className="font-medium">{it.nombre}</p>
                    {it.descripcion && <p className="whitespace-pre-line text-neutral-600">{it.descripcion}</p>}
                  </td>
                  <td className="py-1 pr-2 text-right tabular-nums">{formatearNumero(it.cantidad, 0)}</td>
                  <td className="py-1 pr-2 text-right tabular-nums">{plata(v.moneda, it.precio)}</td>
                  <td className="py-1 text-right tabular-nums">{plata(v.moneda, it.monto)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap items-end justify-between gap-4">
          <div className="max-w-md text-xs">
            <p className="font-semibold">Observaciones</p>
            {!v.glosaEnRenglon && <p>{glosa.trim() || <span className="text-neutral-500">(sin leyenda)</span>}</p>}
          </div>
          <div className="text-right">
            <p className="text-base font-bold">Total: {plata(v.moneda, v.total)}</p>
            {v.moneda === 'CLP' && v.tcClp !== null && (
              <p className="text-xs text-neutral-600">
                U$D {formatearNumero(v.totalUsd, 2)} al dólar {formatearNumero(v.tcClp, 2)}
              </p>
            )}
          </div>
        </div>
      </div>

      {/* La leyenda: automática, pero se puede cambiar */}
      <div className="space-y-1">
        <label className="text-sm font-medium text-tinta" htmlFor={`glosa-${facturaId}`}>
          {v.glosaEnRenglon ? 'Leyenda (va al final del detalle del último renglón)' : 'Leyenda de «Observaciones»'} {v.glosaAutomatica && <span className="font-normal text-tinta-suave">(automática)</span>}
        </label>
        <textarea
          id={`glosa-${facturaId}`}
          rows={2}
          maxLength={MAX_GLOSA}
          value={glosa}
          onChange={(ev) => setGlosa(ev.target.value)}
          className="w-full rounded-md border border-borde bg-white p-2 text-sm"
        />
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-tinta-suave">{glosa.length}/{MAX_GLOSA} letras</span>
          <button
            type="button"
            className={BOTON_SECUNDARIO}
            disabled={!cambiada || guardar.isPending}
            onClick={() => void envio.enviar(guardar.mutateAsync({ id: facturaId, glosa }), () => undefined)}
          >
            <Save className="size-4" /> Guardar leyenda
          </button>
          {!v.glosaAutomatica && (
            <button
              type="button"
              className={BOTON_SECUNDARIO}
              disabled={guardar.isPending}
              onClick={() => void envio.enviar(guardar.mutateAsync({ id: facturaId, glosa: null }), () => undefined)}
            >
              <Undo2 className="size-4" /> Usar la automática
            </button>
          )}
        </div>
        <ErrorBase error={envio.error} />
      </div>

      {v.faltantes.length > 0 && (
        <div className="rounded-md bg-alerta/10 p-2 text-sm text-tinta">
          <p className="font-medium">Antes de enviar falta:</p>
          <ul className="list-disc pl-5">
            {v.faltantes.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className={BOTON_PRIMARIO} disabled={enviando || cambiada || v.faltantes.length > 0} onClick={onEnviar}>
          {enviando ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
          {prueba ? 'Enviar de prueba al SII' : 'Enviar al SII'}
        </button>
        {cambiada && <span className="text-xs text-alerta">Guardá la leyenda antes de enviar.</span>}
      </div>
    </div>
  );
}
