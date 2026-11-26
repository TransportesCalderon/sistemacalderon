'use client';

import { useState } from 'react';
import { AlertTriangle, ArrowDown, ArrowUp, Check, LoaderCircle, Save, Undo2, X } from 'lucide-react';
import { TD, TH, useEnvio } from '@/modules/catalogos/components/comun';
import { Cargando, Chip, ErrorBase, ErrorLectura } from '@/modules/combustible/components/comun/ui';
import { numeroOpc } from '@/modules/ventas/domain/ventas.schemas';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia } from '@/shared/lib/fechas';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { FilaDesplegable, FlechaFila, useFilaAbierta } from '@/shared/ui/fila-desplegable';
import { dinero } from '../domain/finanzas.types';
import {
  moverPaso,
  NOMBRE_PASO,
  OPCIONES_REPARTO_INICIAL,
  reglasCambiadas,
  resumenReparto,
  textoTasa,
  type ItemReparto,
  type OpcionesReparto,
  type PasoCodigo,
  type PasoReparto,
  type ReglasReparto,
  type RepartoCaja as Reparto,
} from '../domain/reparto-caja';
import { useGuardarMoraCaja, useGuardarReglasReparto, useRepartoCaja } from '../queries/plan-caja.hooks';
import { Aviso } from './comun';

const pesos = (n: number) => dinero(n, 'CLP');
const diaMes = (d: string | null) => (d ? formatearFechaDia(d).slice(0, 5) : '—');
const MONEDAS_ENTRA = ['CLP', 'USD', 'ARS'] as const;
/** Lo que escribió la persona («150.000.000», «150000000») como número; vacío o ilegible = 0. */
const aNumero = (t: string) => {
  const r = numeroOpc.safeParse(t);
  return r.success && r.data !== null && r.data > 0 ? r.data : 0;
};

/**
 * Migración 368 · Planificador de caja › «¿Qué hacemos con la plata?».
 * Con la caja de hoy y la plata que entra, la base propone paso por paso qué pagar y qué guardar, con las reglas que
 * puso Gerencia (el orden, la espalda, los días de sueldos). Solo propone: los pagos se hacen en Por pagar.
 */
export function RepartoCaja({ onVerPorPagar }: { onVerPorPagar?: (() => void) | undefined }) {
  const [op, setOp] = useState<OpcionesReparto>(OPCIONES_REPARTO_INICIAL);
  const { data: r, isPending, isError, error, refetch, isFetching } = useRepartoCaja(op);
  const [entra, setEntra] = useState('');
  const [moneda, setMoneda] = useState<string>('CLP');
  const paso = useFilaAbierta<PasoCodigo>();

  if (isPending) return <Cargando texto="Armando la propuesta de qué hacer con la plata…" />;
  if (isError) return <ErrorLectura texto="No se pudo armar la propuesta de qué hacer con la plata." error={error} onReintentar={() => void refetch()} />;
  if (!r) {
    return (
      <Aviso>
        Para ver la propuesta de qué hacer con la plata falta correr la migración <b>20261126200000_reparto_de_la_plata.sql</b>.
      </Aviso>
    );
  }

  const res = resumenReparto(r);
  const probando = reglasCambiadas(r);
  // Lo que falta en cada paso ya se ve en la tabla
  const avisos = r.avisos.filter((a) => !a.startsWith('No alcanza para'));
  const calcular = () => setOp({ ...op, entra: aNumero(entra), entraMoneda: moneda });

  return (
    <section className={cn(TARJETA, 'space-y-4 p-4')} aria-label="Qué hacemos con la plata">
      <div>
        <h2 className="font-medium text-tinta">¿Qué hacemos con la plata?</h2>
        <p className="text-xs text-tinta-suave">Una propuesta con las reglas de Gerencia, paso por paso. No registra ningún pago: los pagos se hacen en Por pagar.</p>
      </div>

      {/* Cuánta plata hay para repartir */}
      <form
        className="space-y-2"
        onSubmit={(e) => {
          e.preventDefault();
          calcular();
        }}
      >
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-full sm:w-64">
            <Campo label="Plata que entra">
              <input inputMode="decimal" value={entra} placeholder="150.000.000" onChange={(e) => setEntra(e.target.value)} />
            </Campo>
          </div>
          <div className="w-28">
            <Campo label="Moneda">
              <select value={moneda} onChange={(e) => setMoneda(e.target.value)}>
                {MONEDAS_ENTRA.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </Campo>
          </div>
          <button type="submit" className={BOTON_PRIMARIO} disabled={isFetching}>
            {isFetching ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} Armar la propuesta
          </button>
        </div>
        <p className="text-xs text-tinta-suave">Cargá lo que todavía no está en el saldo del banco. Si ya entró y la cartola está importada, dejalo vacío: ya está contado en la caja.</p>
        <label className="inline-flex items-center gap-2 text-sm text-tinta">
          <input type="checkbox" className="accent-marca" checked={op.usarCaja} onChange={(e) => setOp({ ...op, usarCaja: e.target.checked })} />
          Contar también lo que hay en caja ({pesos(r.dinero.enCaja)})
        </label>
      </form>

      <p
        role="status"
        className={cn(
          'flex items-start gap-2 rounded-lg border p-3 text-sm font-medium',
          res.tono === 'mal' ? 'border-error/30 bg-error-suave text-error' : res.tono === 'justo' ? 'border-alerta/30 bg-alerta-suave text-alerta' : 'border-exito/30 bg-exito/10 text-exito',
        )}
      >
        {res.tono === 'bien' ? <Check className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
        <span>
          {res.texto}
          <span className="block text-xs font-normal">
            Para repartir: {pesos(r.dinero.total)}
            {r.dinero.usaCaja ? ` = ${pesos(r.dinero.enCaja)} en caja` : ' (sin contar la caja)'}
            {r.dinero.entraClp > 0 &&
              ` ${r.dinero.usaCaja ? '+' : '='} ${pesos(r.dinero.entraClp)} que entran${r.dinero.entraMoneda !== 'CLP' ? ` (${dinero(r.dinero.entra, r.dinero.entraMoneda)})` : ''}`}
          </span>
        </span>
      </p>

      {/* Los cuatro pasos, en el orden de las reglas */}
      <div className="overflow-x-auto rounded-lg border border-borde">
        <table className="w-full text-sm">
          <thead className="border-b border-borde bg-fondo">
            <tr>
              <th className={TH}>Paso</th>
              <th className={cn(TH, 'hidden text-right sm:table-cell')}>Hace falta</th>
              <th className={cn(TH, 'text-right')}>Se asigna</th>
              <th className={cn(TH, 'hidden text-right md:table-cell')}>Queda después</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {r.pasos.map((p, n) => (
              <FilaDesplegable
                key={p.codigo}
                abierta={paso.es(p.codigo)}
                onAlternar={() => paso.alternar(p.codigo)}
                columnas={5}
                detalle={<DetallePaso r={r} p={p} onVerPorPagar={onVerPorPagar} />}
              >
                <td className={TD}>
                  <span className="font-medium text-tinta">
                    {n + 1}. {p.titulo}
                  </span>
                  <span className="block text-xs text-tinta-suave sm:hidden">Hace falta {pesos(p.necesita)}</span>
                  {p.falta > 0 && <span className="block text-xs font-medium text-error">Faltan {pesos(p.falta)}</span>}
                </td>
                <td className={cn(TD, 'hidden text-right whitespace-nowrap tabular-nums sm:table-cell')}>{pesos(p.necesita)}</td>
                <td className={cn(TD, 'text-right font-semibold whitespace-nowrap tabular-nums', p.falta > 0 ? 'text-error' : 'text-tinta')}>{pesos(p.asignado)}</td>
                <td className={cn(TD, 'hidden text-right whitespace-nowrap text-tinta-suave tabular-nums md:table-cell')}>{pesos(p.quedaDespues)}</td>
                <td className={cn(TD, 'w-8 px-1')}>
                  <FlechaFila abierta={paso.es(p.codigo)} />
                </td>
              </FilaDesplegable>
            ))}
            <tr className="bg-fondo/60">
              <td className={cn(TD, 'font-medium text-tinta')}>{r.sinCubrir > 0 && r.sobra === 0 ? 'Queda sin cubrir' : 'Sobra'}</td>
              <td className={cn(TD, 'hidden sm:table-cell')} />
              <td className={cn(TD, 'text-right font-semibold whitespace-nowrap tabular-nums', r.sinCubrir > 0 && r.sobra === 0 ? 'text-error' : 'text-exito')}>
                {r.sinCubrir > 0 && r.sobra === 0 ? pesos(r.sinCubrir) : pesos(r.sobra)}
              </td>
              <td className={cn(TD, 'hidden md:table-cell')} />
              <td />
            </tr>
          </tbody>
        </table>
        <p className="border-t border-borde px-3 py-2 text-xs text-tinta-suave">
          Tocá un paso para ver qué se paga y qué no alcanza.{r.sinCubrir > 0 && r.sobra > 0 ? ` Sobran ${pesos(r.sobra)} que no alcanzan para pagar entera ninguna de las deudas que quedan (${pesos(r.sinCubrir)}).` : ''}
        </p>
      </div>

      {avisos.length > 0 && (
        <Aviso>
          <ul className="list-inside list-disc space-y-1">
            {avisos.map((a) => (
              <li key={a}>{a}</li>
            ))}
          </ul>
        </Aviso>
      )}

      <Reglas key={JSON.stringify(r.reglas)} r={r} probando={probando} onProbar={(prueba) => setOp({ ...op, prueba })} />
    </section>
  );
}

/** Lo que entra en un paso: qué se paga, qué no alcanza y, en la espalda, cuántos días de operación cubre. */
function DetallePaso({ r, p, onVerPorPagar }: { r: Reparto; p: PasoReparto; onVerPorPagar?: (() => void) | undefined }) {
  const g = p.gastoOperativo;
  return (
    <div className="space-y-3">
      <p className="text-xs text-tinta-suave">{p.queEs}</p>
      {p.codigo === 'espalda' ? (
        <>
          {g && g.total > 0 ? (
            <p className="text-sm text-tinta">
              En los últimos {g.dias} días se pagaron {pesos(g.total)} para operar: combustible {pesos(g.combustible)}, fondos a choferes {pesos(g.fondos)} y aduana {pesos(g.aduana)}. Son{' '}
              <b>{pesos(g.porDia)} por día</b>
              {p.diasQueCubre !== null && (
                <>
                  : lo asignado cubre <b>unos {p.diasQueCubre} días</b>
                  {p.falta > 0 && p.diasQueCubririaCompleta !== null ? ` (la espalda completa, ${p.diasQueCubririaCompleta})` : ''}
                </>
              )}
              .
            </p>
          ) : (
            <p className="text-sm text-tinta-suave">No hay pagos de combustible, fondos ni aduana anotados en Bancos en los últimos 30 días: no se puede decir cuántos días cubre.</p>
          )}
          {p.items.length > 0 && (
            <>
              <p className="text-xs font-semibold tracking-wide text-tinta-suave uppercase">Ya anotado para estos días · {pesos(p.comprometido)} (sale de la espalda)</p>
              <ListaItems r={r} items={p.items} conInteres={false} />
            </>
          )}
        </>
      ) : p.items.length === 0 ? (
        <p className="text-sm text-tinta-suave">
          {p.codigo === 'cuotas'
            ? 'No hay cuotas vencidas ni que venzan en estos días.'
            : p.codigo === 'sueldos'
              ? 'No hay sueldos cargados para estos días. Si faltan liquidaciones por preparar, cargá el monto como salida prevista.'
              : 'No hay deudas vencidas fuera de lo anterior.'}
        </p>
      ) : (
        <ListaItems r={r} items={p.items} conInteres={p.codigo !== 'sueldos'} />
      )}
      {p.codigo !== 'espalda' && p.codigo !== 'sueldos' && p.items.length > 0 && onVerPorPagar && (
        <button type="button" className="text-sm text-marca hover:underline" onClick={onVerPorPagar}>
          Ir a Por pagar para registrar los pagos →
        </button>
      )}
    </div>
  );
}

/** Los renglones de un paso. En cuotas y deudas, el renglón se abre debajo para cargar el interés que cobra. */
function ListaItems({ r, items, conInteres }: { r: Reparto; items: ItemReparto[]; conInteres: boolean }) {
  const fila = useFilaAbierta<string>();
  return (
    <div className="overflow-x-auto rounded-lg border border-borde bg-panel">
      <table className="w-full text-sm">
        <tbody className="divide-y divide-borde">
          {items.map((i) => {
            const editable = conInteres && r.puedeEditar && i.acreedorTipo !== null && i.acreedorId !== null;
            const celdas = (
              <>
                <td className={cn(TD, 'w-8 px-2')}>
                  {i.sePaga === true && <Check className="size-4 text-exito" aria-label="Se paga" />}
                  {i.sePaga === false && <X className="size-4 text-tinta-suave" aria-label="No alcanza" />}
                </td>
                <td className={cn(TD, 'px-2 sm:px-3', i.sePaga === false && 'opacity-70')}>
                  <span className="font-medium text-tinta">{i.titulo}</span>
                  <span className="block font-medium whitespace-nowrap text-tinta tabular-nums sm:hidden">
                    {pesos(i.clp)}
                    {i.moneda !== 'CLP' && <span className="font-normal text-tinta-suave"> ({dinero(i.monto, i.moneda)})</span>}
                  </span>
                  <span className={cn('block text-xs', i.diasAtraso > 0 ? 'text-error' : 'text-tinta-suave')}>
                    {i.clase === 'operativo'
                      ? i.detalle
                      : i.vence
                        ? i.diasAtraso > 0
                          ? `Venció el ${diaMes(i.vence)}, hace ${i.diasAtraso} ${i.diasAtraso === 1 ? 'día' : 'días'}`
                          : `Vence el ${diaMes(i.vence)}`
                        : i.fecha
                          ? `Para el ${diaMes(i.fecha)}`
                          : i.detalle}
                    {i.masVencidas > 0 && ` · le quedan ${i.masVencidas} ${i.masVencidas === 1 ? 'cuota vencida más' : 'cuotas vencidas más'} (${pesos(i.masVencidasClp)})`}
                  </span>
                  <span className="mt-0.5 flex flex-wrap items-center gap-1.5">
                    {i.sePaga === false && <Chip tono="neutro">No alcanza</Chip>}
                    {i.tasa !== null && <Chip tono={i.tasa > 0 ? 'alerta' : 'neutro'}>{i.tasa > 0 ? `Cobra ${textoTasa(i.tasa)}` : 'No cobra interés'}</Chip>}
                    {i.tasa !== null && i.tasaFuente === 'observada' && <span className="text-xs text-tinta-suave">por la mora que ya cobró</span>}
                    {conInteres && i.tasa === null && i.diasAtraso > 0 && <Chip tono="neutro">Sin el dato del interés</Chip>}
                    {i.critico && i.clase !== 'operativo' && <Chip tono="marca">Combustible</Chip>}
                    {i.tasaNota && <span className="text-xs text-tinta-suave">«{i.tasaNota}»</span>}
                  </span>
                </td>
                <td className={cn(TD, 'hidden text-right whitespace-nowrap tabular-nums sm:table-cell', i.sePaga === false && 'opacity-70')}>
                  <span className="font-medium text-tinta">{pesos(i.clp)}</span>
                  {i.moneda !== 'CLP' && <span className="block text-xs text-tinta-suave">{dinero(i.monto, i.moneda)}</span>}
                </td>
              </>
            );
            return editable ? (
              <FilaDesplegable key={i.clave} abierta={fila.es(i.clave)} onAlternar={() => fila.alternar(i.clave)} columnas={4} detalle={<EditorMora item={i} onListo={fila.cerrar} />}>
                {celdas}
                <td className={cn(TD, 'w-8 px-1')}>
                  <FlechaFila abierta={fila.es(i.clave)} />
                </td>
              </FilaDesplegable>
            ) : (
              <tr key={i.clave}>
                {celdas}
                <td className="w-8" />
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Cuánto cobra de interés por mes este contrato o proveedor si se le paga tarde: decide qué deuda va primero. */
function EditorMora({ item, onListo }: { item: ItemReparto; onListo: () => void }) {
  const guardar = useGuardarMoraCaja();
  const envio = useEnvio();
  const cargada = item.tasaFuente === 'cargada';
  const [tasa, setTasa] = useState(cargada && item.tasa !== null ? String(item.tasa).replace('.', ',') : '');
  const [nota, setNota] = useState(cargada ? (item.tasaNota ?? '') : '');
  if (item.acreedorTipo === null || item.acreedorId === null) return null;
  const mandar = (tasaMensual: string) =>
    void envio.enviar(guardar.mutateAsync({ tipo: item.acreedorTipo!, id: item.acreedorId!, tasaMensual, nota: tasaMensual === '' ? null : nota }), onListo);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <Campo
          label="Interés por mes si se le paga tarde (%)"
          ayuda={
            item.tasaFuente === 'observada' && item.tasa !== null
              ? `Hoy se usa ${textoTasa(item.tasa)}: sale de la mora que ya cobró. Si cargás un número, vale ese.`
              : 'Por ejemplo 2,5. Poné 0 si no cobra interés.'
          }
          error={envio.campo('tasaMensual')}
        >
          <input inputMode="decimal" value={tasa} placeholder="2,5" onChange={(e) => setTasa(e.target.value)} />
        </Campo>
        <Campo label="Nota (opcional)" error={envio.campo('nota')}>
          <input value={nota} maxLength={300} placeholder="De dónde sale el dato" onChange={(e) => setNota(e.target.value)} />
        </Campo>
      </div>
      <p className="text-xs text-tinta-suave">Vale para todo lo que se le debe a {item.acreedor ?? 'este acreedor'}. Con este dato, las deudas más caras se cancelan primero.</p>
      <ErrorBase error={envio.error} />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={BOTON_PRIMARIO} disabled={guardar.isPending || tasa.trim() === ''} onClick={() => mandar(tasa.trim())}>
          {guardar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Check className="size-4" />} Guardar
        </button>
        {cargada && (
          <button type="button" className={BOTON_SECUNDARIO} disabled={guardar.isPending} onClick={() => mandar('')}>
            <Undo2 className="size-4" /> Sacar el dato
          </button>
        )}
      </div>
    </div>
  );
}

/** Las reglas del reparto: el orden de los pasos, la espalda y cuántos días se miran. Se prueban antes de guardarlas. */
function Reglas({ r, probando, onProbar }: { r: Reparto; probando: boolean; onProbar: (prueba: ReglasReparto | null) => void }) {
  const guardar = useGuardarReglasReparto();
  const envio = useEnvio();
  const [orden, setOrden] = useState<PasoCodigo[]>(r.reglas.orden);
  const [espalda, setEspalda] = useState(String(r.reglas.espalda));
  const [diasSueldos, setDiasSueldos] = useState(r.reglas.reservaSueldosDias);
  const [diasCuotas, setDiasCuotas] = useState(r.reglas.cuotasDias);
  const borrador: ReglasReparto = { orden, espalda: aNumero(espalda), reservaSueldosDias: diasSueldos, cuotasDias: diasCuotas };

  return (
    <details className="rounded-lg border border-borde p-3" open={probando}>
      <summary className="cursor-pointer text-sm font-medium text-tinta">
        Reglas de Gerencia
        <span className="font-normal text-tinta-suave">
          {' '}
          · espalda {pesos(r.reglas.espalda)} · sueldos de {r.reglas.reservaSueldosDias} días{probando ? ' · probando otras reglas (sin guardar)' : ''}
        </span>
      </summary>
      <div className="mt-3 space-y-3">
        <div>
          <p className="text-xs font-medium text-tinta-suave">En qué orden se usa la plata</p>
          <ol className="mt-1 divide-y divide-borde rounded-lg border border-borde">
            {orden.map((c, n) => (
              <li key={c} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
                <span>
                  {n + 1}. {NOMBRE_PASO[c]}
                </span>
                {r.puedeEditar && (
                  <span className="flex gap-1">
                    <button type="button" className="rounded-md p-1 text-tinta-suave hover:bg-hover disabled:opacity-30" disabled={n === 0} aria-label={`Subir «${NOMBRE_PASO[c]}»`} onClick={() => setOrden(moverPaso(orden, c, -1))}>
                      <ArrowUp className="size-4" />
                    </button>
                    <button type="button" className="rounded-md p-1 text-tinta-suave hover:bg-hover disabled:opacity-30" disabled={n === orden.length - 1} aria-label={`Bajar «${NOMBRE_PASO[c]}»`} onClick={() => setOrden(moverPaso(orden, c, 1))}>
                      <ArrowDown className="size-4" />
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ol>
        </div>
        {r.puedeEditar ? (
          <>
            <div className="grid gap-3 sm:grid-cols-3">
              <Campo label="Espalda para operar (CLP)" ayuda="Combustible, fondos fijos y gastos de aduana." error={envio.campo('espalda')}>
                <input inputMode="decimal" value={espalda} onChange={(e) => setEspalda(e.target.value)} />
              </Campo>
              <Campo label="Sueldos: guardar los de los próximos días" error={envio.campo('reservaSueldosDias')}>
                <input type="number" min={0} max={60} value={diasSueldos} onChange={(e) => setDiasSueldos(Number(e.target.value))} />
              </Campo>
              <Campo label="Cuotas: las vencidas y las que vencen en (días)" error={envio.campo('cuotasDias')}>
                <input type="number" min={0} max={60} value={diasCuotas} onChange={(e) => setDiasCuotas(Number(e.target.value))} />
              </Campo>
            </div>
            <ErrorBase error={envio.error} />
            <div className="flex flex-wrap gap-2">
              <button type="button" className={BOTON_SECUNDARIO} onClick={() => onProbar(borrador)}>
                Probar sin guardar
              </button>
              <button type="button" className={BOTON_PRIMARIO} disabled={guardar.isPending} onClick={() => void envio.enviar(guardar.mutateAsync({ ...borrador, espalda }), () => onProbar(null))}>
                {guardar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />} Guardar como reglas
              </button>
              {probando && (
                <button type="button" className={BOTON_SECUNDARIO} onClick={() => onProbar(null)}>
                  <Undo2 className="size-4" /> Volver a las guardadas
                </button>
              )}
            </div>
          </>
        ) : (
          <p className="text-xs text-tinta-suave">Las reglas las cambian Finanzas, Gerencia o TI.</p>
        )}
      </div>
    </details>
  );
}
