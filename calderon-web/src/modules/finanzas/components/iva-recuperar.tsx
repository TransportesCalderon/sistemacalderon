'use client';

import { useState } from 'react';
import { Plus, ReceiptText, TriangleAlert } from 'lucide-react';
import { Panel, TD, TH, useEnvio } from '@/modules/catalogos/components/comun';
import { Cargando, Chip, ErrorLectura, Seccion, type Tono } from '@/modules/combustible/components/comun/ui';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { hoyEnZona } from '@/shared/lib/fechas';
import { BOTON_SECUNDARIO } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import {
  ESTADO_RECUPERACION,
  FORMA_RECUPERACION,
  montoClp,
  type EstadoRecuperacion,
  type FormaRecuperacion,
  type IvaPorRecuperar,
  type RecuperacionIva,
} from '../domain/iva-recuperar';
import { dinero, mesCorto } from '../domain/finanzas.types';
import { useAnularRecuperacionIva, useGuardarRecuperacionIva, useIvaPorRecuperar, useResolverRecuperacionIva } from '../queries/iva-recuperar.hooks';
import { fecha, Indicador } from './comun';

/**
 * Migración 388 · Finanzas › Informes › IVA por recuperar. Lo que se junta del IVA de las facturas chilenas (y de las compras
 * de vehículos) y lo que se va recuperando. La base hace las cuentas y no deja recuperar más de lo disponible.
 */
const TONO_ESTADO: Record<EstadoRecuperacion, Tono> = { solicitada: 'alerta', recuperada: 'exito', rechazada: 'error', anulada: 'neutro' };

interface FormNueva {
  forma: FormaRecuperacion;
  fecha: string;
  monto: string;
  mesDesde: string;
  mesHasta: string;
  numeroTramite: string;
  nota: string;
  yaRecuperada: boolean;
}
interface FormResolver {
  r: RecuperacionIva;
  recuperada: boolean;
  fecha: string;
  monto: string;
  nota: string;
}

export function IvaPorRecuperarPantalla() {
  const q = useIvaPorRecuperar();
  if (q.isPending) return <Cargando texto="Juntando el IVA de las facturas…" />;
  if (q.isError) return <ErrorLectura texto="No se pudo leer el IVA por recuperar (¿está aplicada la migración 388?)." onReintentar={() => void q.refetch()} error={q.error} />;
  return <Contenido d={q.data} />;
}

function Contenido({ d }: { d: IvaPorRecuperar }) {
  const { zonaHoraria } = useSesion();
  const hoy = hoyEnZona(zonaHoraria) as string;
  const [nueva, setNueva] = useState<FormNueva | null>(null);
  const [resolviendo, setResolviendo] = useState<FormResolver | null>(null);
  const [anulando, setAnulando] = useState<{ r: RecuperacionIva; motivo: string } | null>(null);
  const guardar = useGuardarRecuperacionIva();
  const resolver = useResolverRecuperacionIva();
  const anular = useAnularRecuperacionIva();
  const envio = useEnvio();
  const envioResolver = useEnvio();
  const envioAnular = useEnvio();
  const r = d.resumen;
  const mesesConDatos = d.meses.filter((m) => m.juntado > 0 || m.recuperado > 0 || m.debitoVentas !== 0);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Indicador titulo="IVA por recuperar" valor={dinero(r.porRecuperar)} detalle={`Juntado ${dinero(r.juntado)} − recuperado ${dinero(r.recuperado)}`} />
        <Indicador
          titulo="Disponible para pedir"
          valor={dinero(r.disponible)}
          detalle={r.enTramite > 0 ? `${dinero(r.enTramite)} ya pedido, en trámite` : 'Nada en trámite'}
          tono={r.enTramite > 0 ? 'alerta' : 'normal'}
        />
        <Indicador
          titulo="IVA juntado de las facturas"
          valor={dinero(r.juntado)}
          detalle={`${r.facturas} factura${r.facturas === 1 ? '' : 's'}${r.vehiculos > 0 ? ` y ${r.vehiculos} compra${r.vehiculos === 1 ? '' : 's'} de vehículo` : ''}${d.desde ? ` desde el ${fecha(d.desde)}` : ''}`}
        />
        <Indicador titulo="Ya recuperado" valor={dinero(r.recuperado)} />
      </div>

      <p className="text-sm text-tinta-suave">
        Se junta el IVA de los gastos con factura chilena (pasado a pesos con el cambio de cada una) y el de las compras de vehículos. A medida que se recupera
        (devolución del SII, uso en el F29 o lo recuperado antes), se descuenta. Las reglas del SII para pedir la devolución hay que confirmarlas con el estudio
        contable.
      </p>

      {d.avisos.length > 0 && (
        <div className="space-y-1 rounded-md border border-alerta/40 bg-alerta/10 p-3 text-sm text-tinta">
          {d.avisos.map((a, i) => (
            <p key={i} className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 size-4 shrink-0 text-alerta" /> {a}
            </p>
          ))}
        </div>
      )}

      <Seccion
        titulo="Recuperaciones"
        acciones={
          d.puedeEditar &&
          !nueva && (
            <button
              type="button"
              className={BOTON_SECUNDARIO}
              onClick={() => (
                envio.setError(null),
                setNueva({ forma: 'devolucion_exportador', fecha: hoy, monto: '', mesDesde: '', mesHasta: '', numeroTramite: '', nota: '', yaRecuperada: false })
              )}
            >
              <Plus className="size-4" /> Registrar recuperación
            </button>
          )
        }
      >
        {nueva && (
          <Panel
            titulo="Registrar una recuperación de IVA"
            explicacion={`Podés registrar hasta ${dinero(r.disponible)}. Una devolución pedida queda «en trámite» hasta que llega la plata; el F29 y lo recuperado antes entran como recuperados.`}
            error={envio.error}
            ocupado={guardar.isPending}
            textoBoton="Registrar"
            onCerrar={() => setNueva(null)}
            onConfirmar={() =>
              void envio.enviar(
                guardar.mutateAsync({
                  forma: nueva.forma,
                  fecha: nueva.fecha,
                  monto: montoClp(nueva.monto),
                  periodoDesde: nueva.mesDesde ? `${nueva.mesDesde}-01` : null,
                  periodoHasta: nueva.mesHasta ? `${nueva.mesHasta}-01` : null,
                  numeroTramite: nueva.numeroTramite.trim() || null,
                  nota: nueva.nota.trim() || null,
                  yaRecuperada: nueva.yaRecuperada,
                }),
                () => setNueva(null),
              )
            }
          >
            <>
              <Campo label="Cómo se recupera">
                <select value={nueva.forma} onChange={(e) => setNueva({ ...nueva, forma: e.target.value as FormaRecuperacion })}>
                  {(Object.keys(FORMA_RECUPERACION) as FormaRecuperacion[]).map((f) => (
                    <option key={f} value={f}>
                      {FORMA_RECUPERACION[f]}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo label={nueva.forma === 'devolucion_exportador' ? 'Fecha del pedido' : 'Fecha'}>
                <input type="date" max={hoy} value={nueva.fecha} onChange={(e) => setNueva({ ...nueva, fecha: e.target.value })} />
              </Campo>
              <Campo label="Monto (CLP)">
                <input inputMode="numeric" placeholder="0" value={nueva.monto} onChange={(e) => setNueva({ ...nueva, monto: e.target.value })} />
              </Campo>
              <Campo label="Compras desde el mes (opcional)">
                <input type="month" value={nueva.mesDesde} onChange={(e) => setNueva({ ...nueva, mesDesde: e.target.value })} />
              </Campo>
              <Campo label="Hasta el mes (opcional)">
                <input type="month" value={nueva.mesHasta} onChange={(e) => setNueva({ ...nueva, mesHasta: e.target.value })} />
              </Campo>
              <Campo label="N° de trámite o folio (opcional)">
                <input maxLength={60} value={nueva.numeroTramite} onChange={(e) => setNueva({ ...nueva, numeroTramite: e.target.value })} />
              </Campo>
            </>
            <Campo label="Nota (opcional)">
              <input maxLength={500} value={nueva.nota} onChange={(e) => setNueva({ ...nueva, nota: e.target.value })} />
            </Campo>
            {(nueva.forma === 'devolucion_exportador' || nueva.forma === 'otra') && (
              <label className="flex items-center gap-2 self-end pb-2 text-sm text-tinta sm:col-span-2">
                <input type="checkbox" className="size-4 accent-marca" checked={nueva.yaRecuperada} onChange={(e) => setNueva({ ...nueva, yaRecuperada: e.target.checked })} />
                La plata ya llegó (se registra como recuperada)
              </label>
            )}
          </Panel>
        )}
        {resolviendo && (
          <Panel
            titulo={`Resultado de ${resolviendo.r.numero}`}
            explicacion={`Se pidieron ${dinero(resolviendo.r.montoSolicitado)}. Si devolvieron menos, lo que falta vuelve a quedar disponible para pedir.`}
            error={envioResolver.error}
            ocupado={resolver.isPending}
            textoBoton="Guardar"
            onCerrar={() => setResolviendo(null)}
            onConfirmar={() =>
              void envioResolver.enviar(
                resolver.mutateAsync({
                  id: resolviendo.r.id,
                  recuperada: resolviendo.recuperada,
                  fecha: resolviendo.fecha,
                  monto: resolviendo.recuperada ? montoClp(resolviendo.monto) : null,
                  nota: resolviendo.nota.trim() || null,
                }),
                () => setResolviendo(null),
              )
            }
          >
            <div className="flex gap-4 text-sm sm:col-span-2 lg:col-span-3">
              <label className="flex items-center gap-2">
                <input type="radio" checked={resolviendo.recuperada} onChange={() => setResolviendo({ ...resolviendo, recuperada: true })} /> Llegó la plata
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" checked={!resolviendo.recuperada} onChange={() => setResolviendo({ ...resolviendo, recuperada: false })} /> La rechazaron
              </label>
            </div>
            <>
              <Campo label="Fecha">
                <input type="date" max={hoy} value={resolviendo.fecha} onChange={(e) => setResolviendo({ ...resolviendo, fecha: e.target.value })} />
              </Campo>
              {resolviendo.recuperada && (
                <Campo label="Monto que llegó (CLP)">
                  <input inputMode="numeric" value={resolviendo.monto} onChange={(e) => setResolviendo({ ...resolviendo, monto: e.target.value })} />
                </Campo>
              )}
            </>
            <Campo label={resolviendo.recuperada ? 'Nota (opcional)' : 'Por qué la rechazaron'}>
              <input maxLength={500} value={resolviendo.nota} onChange={(e) => setResolviendo({ ...resolviendo, nota: e.target.value })} />
            </Campo>
          </Panel>
        )}
        {anulando && (
          <Panel
            titulo={`Anular ${anulando.r.numero}`}
            explicacion="Para lo cargado por error. El monto vuelve a quedar por recuperar."
            error={envioAnular.error}
            ocupado={anular.isPending}
            textoBoton="Anular"
            onCerrar={() => setAnulando(null)}
            onConfirmar={() => void envioAnular.enviar(anular.mutateAsync({ id: anulando.r.id, motivo: anulando.motivo }), () => setAnulando(null))}
          >
            <Campo label="Por qué se anula">
              <input maxLength={500} value={anulando.motivo} onChange={(e) => setAnulando({ ...anulando, motivo: e.target.value })} />
            </Campo>
          </Panel>
        )}
        {d.recuperaciones.length === 0 ? (
          <p className="text-sm text-tinta-suave">Todavía no se registró ninguna recuperación.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borde">
                  <th className={TH}>Número</th>
                  <th className={TH}>Cómo</th>
                  <th className={TH}>Fecha</th>
                  <th className={TH}>Compras de</th>
                  <th className={cn(TH, 'text-right')}>Pedido</th>
                  <th className={cn(TH, 'text-right')}>Recuperado</th>
                  <th className={TH}>Estado</th>
                  {d.puedeEditar && <th className={TH} />}
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {d.recuperaciones.map((x) => (
                  <tr key={x.id} className={cn(x.estado === 'anulada' && 'text-tinta-suave line-through')}>
                    <td className={cn(TD, 'whitespace-nowrap')}>
                      {x.numero}
                      {x.numeroTramite && <span className="block text-xs text-tinta-suave no-underline">{x.numeroTramite}</span>}
                    </td>
                    <td className={TD}>
                      {FORMA_RECUPERACION[x.forma]}
                      {(x.nota || x.motivo) && <span className="block text-xs text-tinta-suave">{x.motivo ?? x.nota}</span>}
                    </td>
                    <td className={cn(TD, 'whitespace-nowrap')}>
                      {fecha(x.fecha)}
                      {x.fechaRecuperada && x.fechaRecuperada !== x.fecha && <span className="block text-xs text-tinta-suave">llegó {fecha(x.fechaRecuperada)}</span>}
                    </td>
                    <td className={cn(TD, 'whitespace-nowrap')}>
                      {x.periodoDesde ? `${mesCorto(x.periodoDesde)}${x.periodoHasta && x.periodoHasta !== x.periodoDesde ? ` a ${mesCorto(x.periodoHasta)}` : ''}` : '—'}
                    </td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{dinero(x.montoSolicitado)}</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{dinero(x.montoRecuperado)}</td>
                    <td className={TD}>
                      <Chip tono={TONO_ESTADO[x.estado]}>{ESTADO_RECUPERACION[x.estado]}</Chip>
                    </td>
                    {d.puedeEditar && (
                      <td className={cn(TD, 'text-right whitespace-nowrap')}>
                        {x.estado === 'solicitada' && (
                          <button
                            type="button"
                            className="text-marca underline"
                            onClick={() => (
                              envioResolver.setError(null),
                              setResolviendo({ r: x, recuperada: true, fecha: hoy, monto: String(x.montoSolicitado), nota: '' })
                            )}
                          >
                            Resultado
                          </button>
                        )}
                        {x.estado !== 'anulada' && (
                          <button type="button" className="ml-3 text-tinta-suave underline" onClick={() => (envioAnular.setError(null), setAnulando({ r: x, motivo: '' }))}>
                            Anular
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Seccion>

      <Seccion titulo="Mes a mes">
        {mesesConDatos.length === 0 ? (
          <p className="flex items-center gap-2 text-sm text-tinta-suave">
            <ReceiptText className="size-4" /> No hay facturas chilenas con IVA cargadas.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-borde">
                  <th className={TH}>Mes</th>
                  <th className={cn(TH, 'text-right')}>Facturas</th>
                  <th className={cn(TH, 'text-right')}>Neto</th>
                  <th className={cn(TH, 'text-right')}>IVA facturas</th>
                  <th className={cn(TH, 'text-right')}>IVA vehículos</th>
                  <th className={cn(TH, 'text-right')}>Recuperado</th>
                  <th className={cn(TH, 'text-right')}>Por recuperar al cierre</th>
                  <th className={cn(TH, 'text-right')} title="Débito fiscal de las ventas en la contabilidad, para comparar">
                    Débito ventas
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {mesesConDatos.map((m) => (
                  <tr key={m.mes}>
                    <td className={cn(TD, 'whitespace-nowrap capitalize')}>{mesCorto(m.mes)}</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{m.facturas}</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{dinero(m.neto)}</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{dinero(m.ivaFacturas)}</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{m.ivaVehiculos ? dinero(m.ivaVehiculos) : '—'}</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{m.recuperado ? dinero(m.recuperado) : '—'}</td>
                    <td className={cn(TD, 'text-right font-medium tabular-nums')}>{dinero(m.porRecuperarAlCierre)}</td>
                    <td className={cn(TD, 'text-right text-tinta-suave tabular-nums')}>{m.debitoVentas ? dinero(m.debitoVentas) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {d.comparar.cuentaIvaCredito !== null && (
          <p className="text-xs text-tinta-suave">
            Para comparar: la cuenta «IVA crédito» de la contabilidad tiene hoy {dinero(d.comparar.cuentaIvaCredito)}. Si es distinto, puede ser porque los F29 o
            las devoluciones se contabilizan aparte, o porque hay facturas con IVA cargadas sin tipo «factura».
          </p>
        )}
      </Seccion>

      {d.proveedores.length > 0 && (
        <Seccion titulo="Los proveedores que más IVA dejaron">
          <ul className="divide-y divide-borde text-sm">
            {d.proveedores.map((p) => (
              <li key={p.proveedor} className="flex items-baseline justify-between gap-3 py-2">
                <span className="text-tinta">
                  {p.proveedor} <span className="text-xs text-tinta-suave">· {p.facturas} factura{p.facturas === 1 ? '' : 's'}</span>
                </span>
                <span className="font-medium tabular-nums">{dinero(p.iva)}</span>
              </li>
            ))}
          </ul>
        </Seccion>
      )}
    </div>
  );
}
