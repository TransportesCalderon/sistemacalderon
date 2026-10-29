'use client';

import { useEffect, useState } from 'react';
import { FileText, LoaderCircle, Save, Send, Undo2 } from 'lucide-react';
import { useEnvio } from '@/modules/catalogos/components/comun';
import { AccionConMotivo, Chip, ErrorBase, type Tono } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { ETIQUETA_ESTADO_DTE, NOMBRE_DTE, VERSION_SII, type DocumentoSii, type EstadoDte, type ResultadoSii, type SiiFactura } from '../domain/sii';
import { useEmitirSii, useGuardarClienteSii, useNotaCreditoSii, useProbarSii, useResolverDte, useSiiEstado, useSiiFactura } from '../queries/hooks';

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
          Cada renglón dice en la factura su precio en dólares.
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

      {estado === 'borrador' && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={BOTON_PRIMARIO}
            disabled={!s.puedeEmitir || emitir.isPending}
            onClick={() => {
              setResultado(null);
              void envio.enviar(
                emitir.mutateAsync({ id: facturaId, version, fecha }).then((r) => {
                  if (r.ok) setResultado(r.data);
                  return r;
                }),
                () => undefined,
              );
            }}
          >
            {emitir.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Send className="size-4" />}
            {prueba ? 'Enviar de prueba al SII' : 'Emitir en el SII'}
          </button>
          <span className="text-xs text-tinta-suave">Con la fecha de la factura de abajo ({formatearFechaDia(fecha)}).</span>
        </div>
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
