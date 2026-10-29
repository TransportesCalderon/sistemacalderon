'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, CheckCheck, LoaderCircle, Repeat } from 'lucide-react';
import { useEnvio } from '@/modules/catalogos/components/comun';
import { Cargando, Chip, Encabezado, ErrorBase, ErrorLectura, Vacio } from '@/modules/combustible/components/comun/ui';
import { Cifra, FiltroPeriodo, usePeriodo } from '@/modules/combustible/components/consumo/periodo';
import { useCan } from '@/modules/core/permissions/can';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { BOTON_PRIMARIO, TARJETA } from '@/shared/ui/clases';
import { TD, TH } from '@/modules/catalogos/components/comun';
import { clavePar, VERSION_CAMBIOS, type ParCambio } from '../domain/cambios';
import { useCambiosSugeridos, useConfirmarCambios, useCostoCambios } from '../queries/hooks';

const dinero = (moneda: string, v: number | null, dec = 0) => (v === null ? '—' : `${moneda} ${formatearNumero(v, dec)}`);
const tasa = (v: number | null) => (v === null ? '—' : v >= 1 ? formatearNumero(v, 2) : formatearNumero(v, 6));
const mesDe = (m: string) => new Date(`${m}T12:00:00`).toLocaleDateString('es-AR', { month: 'long', year: 'numeric' });

/**
 * Migración 123 · Conciliación › Cambios de moneda. Una vez por mes se suben los resúmenes de cada
 * banco, aplicación o billetera (Bancos y cajas › Cartola); acá el sistema propone cada cambio
 * (lo que salió de una cuenta y lo que llegó a otra), se confirman de una vez y se ve cuánto costó
 * cambiar la plata. Lo calcula todo la base.
 */
export function CambiosPantalla() {
  const hay = useBaseTiene(VERSION_CAMBIOS);
  const [p, setP] = usePeriodo('/conciliacion/cambios');
  const sug = useCambiosSugeridos(p.desde, p.hasta, hay);
  const costo = useCostoCambios(p.desde, p.hasta, hay);
  const puede = useCan('finanzas.bancos:editar') && sug.data?.puedeConfirmar === true;
  const confirmar = useConfirmarCambios();
  const { error, setError } = useEnvio();
  const [quitados, setQuitados] = useState<Set<string>>(new Set());
  const [agregados, setAgregados] = useState<Set<string>>(new Set());
  const [hecho, setHecho] = useState<string | null>(null);

  const pares = useMemo(() => sug.data?.pares ?? [], [sug.data]);
  const elegido = (x: ParCambio) => (x.seguro ? !quitados.has(clavePar(x)) : agregados.has(clavePar(x)));
  const alternar = (x: ParCambio) => {
    const k = clavePar(x);
    const cambiar = (s: Set<string>) => {
      const n = new Set(s);
      if (n.has(k)) n.delete(k);
      else n.add(k);
      return n;
    };
    if (x.seguro) setQuitados(cambiar);
    else setAgregados(cambiar);
  };
  const elegidos = pares.filter(elegido);

  const confirmarElegidos = async () => {
    setError(null);
    setHecho(null);
    const r = await confirmar.mutateAsync({ pares: elegidos.map((x) => ({ salida: x.salida, entrada: x.entrada })) });
    if (!r.ok) return setError(r.error);
    setQuitados(new Set());
    setAgregados(new Set());
    setHecho(r.data === 1 ? 'Se registró 1 cambio.' : `Se registraron ${r.data} cambios.`);
  };

  return (
    <div className="space-y-5">
      <Encabezado titulo="Cambios de moneda" subtitulo="Conciliación" />
      <p className="max-w-3xl text-sm text-tinta-suave">
        Una vez por mes, subí el resumen de cada banco, aplicación o billetera en{' '}
        <Link href="/conciliacion" className="text-marca hover:underline">
          Bancos y cajas
        </Link>{' '}
        (cada aplicación es una cuenta, una por moneda). El sistema busca lo que salió de una cuenta y llegó a otra y arma el cambio con los dos montos
        reales. La diferencia con el tipo de cambio oficial es lo que costó cambiar la plata.
      </p>
      {!hay ? (
        <Vacio icono={<Repeat className="size-6" />} texto="La base todavía no arma los cambios de moneda. Falta aplicar la migración 123 (108_cambios_moneda.sql)." />
      ) : (
        <>
          <FiltroPeriodo p={p} onCambiar={setP} />

          <section className="space-y-3">
            <h2 className="font-semibold text-tinta">Cambios encontrados en los resúmenes</h2>
            {sug.isPending ? (
              <Cargando texto="Buscando los cambios…" />
            ) : sug.isError ? (
              <ErrorLectura texto={sug.error instanceof Error ? sug.error.message : 'No se pudieron buscar los cambios.'} onReintentar={() => sug.refetch()} />
            ) : (
              <>
                {sug.data.sinCotizacion > 0 && (
                  <p className="rounded-lg bg-alerta-suave p-3 text-sm text-alerta">
                    {sug.data.sinCotizacion === 1 ? 'Una salida' : `${sug.data.sinCotizacion} salidas`} podrían ser un cambio pero falta el tipo de cambio
                    oficial de ese día (Configuración › Monedas y tipos de cambio).
                  </p>
                )}
                {pares.length === 0 ? (
                  <Vacio
                    icono={<Repeat className="size-6" />}
                    texto="No hay cambios sin registrar en el período. Si faltan, revisá que estén subidos los resúmenes de las dos cuentas."
                  />
                ) : (
                  <>
                    <ListaPares
                      titulo="Listos para confirmar"
                      ayuda={`Llegaron dentro de ${sug.data.dias} días y a menos del 5 % del tipo de cambio oficial.`}
                      pares={pares.filter((x) => x.seguro)}
                      elegido={elegido}
                      alternar={alternar}
                      puede={puede}
                    />
                    <ListaPares
                      titulo="Para revisar"
                      ayuda={`Hay más de una llegada posible o el tipo de cambio se aparta más del 5 % (hasta ${formatearNumero(sug.data.toleranciaPct, 0)} %). Marcalos solo si son un cambio.`}
                      pares={pares.filter((x) => !x.seguro)}
                      elegido={elegido}
                      alternar={alternar}
                      puede={puede}
                    />
                  </>
                )}
                <ErrorBase error={error} />
                {hecho && <p className="text-sm text-exito">{hecho}</p>}
                {puede && pares.length > 0 && (
                  <button type="button" className={BOTON_PRIMARIO} disabled={elegidos.length === 0 || confirmar.isPending} onClick={() => void confirmarElegidos()}>
                    {confirmar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <CheckCheck className="size-4" />}
                    {elegidos.length === 1 ? 'Confirmar 1 cambio' : `Confirmar ${elegidos.length} cambios`}
                  </button>
                )}
              </>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="font-semibold text-tinta">Lo que costó cambiar la plata</h2>
            {costo.isPending ? (
              <Cargando texto="Calculando…" />
            ) : costo.isError ? (
              <ErrorLectura texto={costo.error instanceof Error ? costo.error.message : 'No se pudo calcular.'} onReintentar={() => costo.refetch()} />
            ) : costo.data.filas.length === 0 ? (
              <Vacio icono={<Repeat className="size-6" />} texto="No hay cambios ni transferencias registrados en el período." />
            ) : (
              <>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Cifra
                    etiqueta="Costo de cambiar en el período"
                    valor={dinero(costo.data.moneda, costo.data.totalClp)}
                    detalle="Contra el tipo de cambio oficial. Es lo que va a «Diferencia de cambio»."
                  />
                </div>
                <section className={cn(TARJETA, 'overflow-x-auto')}>
                  <table className="w-full min-w-[860px] text-sm">
                    <thead className="border-b border-borde bg-fondo">
                      <tr>
                        <th className={TH}>Mes</th>
                        <th className={TH}>De → a</th>
                        <th className={cn(TH, 'text-right')}>Salió</th>
                        <th className={cn(TH, 'text-right')}>Llegó</th>
                        <th className={cn(TH, 'text-right')}>Cambio real</th>
                        <th className={cn(TH, 'text-right')}>Oficial</th>
                        <th className={cn(TH, 'text-right')}>Costó</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-borde">
                      {costo.data.filas.map((f) => (
                        <tr key={`${f.mes}-${f.origen}-${f.destino}`}>
                          <td className={cn(TD, 'first-letter:uppercase')}>{mesDe(f.mes)}</td>
                          <td className={TD}>
                            {f.origen} <ArrowRight className="inline size-3.5 text-tinta-suave" /> {f.destino}
                            <span className="block text-xs text-tinta-suave">{f.cambios === 1 ? '1 movimiento' : `${f.cambios} movimientos`}</span>
                          </td>
                          <td className={cn(TD, 'text-right tabular-nums')}>{dinero(f.monedaOrigen, f.salio, 2)}</td>
                          <td className={cn(TD, 'text-right tabular-nums')}>{dinero(f.monedaDestino, f.llego, 2)}</td>
                          <td className={cn(TD, 'text-right tabular-nums')}>{tasa(f.tasaReal)}</td>
                          <td className={cn(TD, 'text-right tabular-nums')}>{tasa(f.tasaOficial)}</td>
                          <td className={cn(TD, 'text-right tabular-nums')}>
                            {f.sinCotizacion ? (
                              <span className="text-alerta">Falta el tipo de cambio</span>
                            ) : (
                              <>
                                {dinero(costo.data.moneda, f.costoClp)}
                                {f.costoPct !== null && <span className="block text-xs text-tinta-suave">{formatearNumero(f.costoPct, 2)} %</span>}
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              </>
            )}
          </section>
        </>
      )}
    </div>
  );
}

function ListaPares({
  titulo,
  ayuda,
  pares,
  elegido,
  alternar,
  puede,
}: {
  titulo: string;
  ayuda: string;
  pares: ParCambio[];
  elegido: (x: ParCambio) => boolean;
  alternar: (x: ParCambio) => void;
  puede: boolean;
}) {
  if (pares.length === 0) return null;
  return (
    <div className="space-y-2">
      <h3 className="text-sm font-medium text-tinta">
        {titulo} ({pares.length})
      </h3>
      <p className="text-xs text-tinta-suave">{ayuda}</p>
      <ul className={cn(TARJETA, 'divide-y divide-borde')}>
        {pares.map((x) => (
          <li key={clavePar(x)}>
            <label className={cn('flex items-start gap-3 p-3 text-sm', puede && 'cursor-pointer hover:bg-hover')}>
              {puede && <input type="checkbox" className="mt-1 accent-marca" checked={elegido(x)} onChange={() => alternar(x)} />}
              <span className="grid flex-1 gap-1 sm:grid-cols-[1fr_auto_1fr_auto] sm:items-center sm:gap-4">
                <span>
                  <span className="font-medium text-tinta">{x.origen}</span>
                  <span className="block font-semibold text-error tabular-nums">− {dinero(x.monedaOrigen, x.montoSalida, 2)}</span>
                  <span className="block text-xs text-tinta-suave">
                    {formatearFechaDia(x.fechaSalida)} · {x.detalleSalida}
                  </span>
                </span>
                <ArrowRight className="hidden size-4 text-tinta-suave sm:block" />
                <span>
                  <span className="font-medium text-tinta">{x.destino}</span>
                  <span className="block font-semibold text-exito tabular-nums">+ {dinero(x.monedaDestino, x.montoEntrada, 2)}</span>
                  <span className="block text-xs text-tinta-suave">
                    {formatearFechaDia(x.fechaEntrada)} · {x.detalleEntrada}
                  </span>
                </span>
                <span className="text-right">
                  {x.cambio ? (
                    <>
                      <span className="block tabular-nums">
                        1 {x.monedaOrigen} = {tasa(x.tasaReal)} {x.monedaDestino}
                      </span>
                      <span className="block text-xs text-tinta-suave tabular-nums">
                        oficial {tasa(x.tasaOficial)} · {formatearNumero(x.desvioPct, 2)} %
                      </span>
                    </>
                  ) : (
                    <Chip tono="neutro">Entre cuentas propias</Chip>
                  )}
                  {x.costoClp !== null && x.costoClp !== 0 && (
                    <span className="block text-xs text-tinta-suave">costó CLP {formatearNumero(x.costoClp, 0)}</span>
                  )}
                </span>
              </span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}
