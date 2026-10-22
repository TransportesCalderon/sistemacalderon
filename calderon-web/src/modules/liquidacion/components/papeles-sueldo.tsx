import type { ReactNode } from 'react';
import { nombrePeriodo } from '@/modules/chofer/domain/chofer.types';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia } from '@/shared/lib/fechas';
import { clp, ETIQUETA_CONTRATO, type Empresa, type Legal } from '../domain/legal.types';
import type { Liquidacion } from '../domain/liquidacion.types';

/**
 * Los tres papeles que firma el chofer (migración 66): liquidación de sueldo, planilla y
 * comprobante de egreso. Todas las cuentas y los montos en letras vienen de la base.
 */
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const mesLargo = (periodo: string) => {
  const [a, m] = periodo.split('-').map(Number);
  if (!a || !m) return periodo;
  const mes = MESES[m - 1] ?? '';
  return `${mes.charAt(0).toUpperCase()}${mes.slice(1)} de ${a}`;
};
const fechaLarga = (dia: string | null) => {
  if (!dia) return '';
  const [a, m, d] = dia.split('-').map(Number);
  return a && m && d ? `${d} de ${MESES[m - 1]} de ${a}` : dia;
};
const mayus = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const neg = (v: number) => `(${clp(v)})`;

function CabeceraEmpresa({ e }: { e: Empresa }) {
  return (
    <div className="text-xs leading-snug">
      <p className="text-sm font-bold uppercase">{e.razonSocial ?? 'Falta la razón social'}</p>
      {e.direccion && <p>{e.direccion}</p>}
      {e.comuna && <p>{e.comuna}</p>}
      <p>RUT: {e.rut ?? '—'}</p>
    </div>
  );
}

function Fila({ izq, der, nivel = 1, fuerte = false }: { izq: ReactNode; der?: ReactNode; nivel?: 0 | 1 | 2; fuerte?: boolean }) {
  return (
    <tr className={cn(fuerte && 'font-semibold')}>
      <td className={cn('py-0.5 pr-2', nivel === 0 && 'pl-2', nivel === 1 && 'pl-6', nivel === 2 && 'pl-3')}>{izq}</td>
      <td className="w-36 border-l border-black py-0.5 pr-2 text-right tabular-nums">{der}</td>
    </tr>
  );
}
const Espacio = () => (
  <tr>
    <td className="h-3" />
    <td className="border-l border-black" />
  </tr>
);

/** a) Liquidación de sueldo (formato Chile). */
export function LiquidacionSueldo({ l }: { l: Liquidacion }) {
  const g = l.legal;
  if (!g) return <p className="text-sm">Sin liquidación de sueldo.</p>;
  const f = g.ficha;
  const imp = g.haberes.filter((h) => h.imponible);
  const noImp = g.haberes.filter((h) => !h.imponible);
  return (
    <article className="space-y-4 text-[12px] text-black">
      <CabeceraEmpresa e={g.empresa} />
      <h2 className="text-center text-base font-bold">Liquidación de Sueldo de {mesLargo(l.periodo)}</h2>
      <table className="w-full border border-black">
        <tbody>
          <tr>
            <td className="px-2 pt-2 align-top">
              <p className="font-semibold">Sr(a). {l.chofer}</p>
              <div className="space-y-0.5 pl-6">
                <p>Cargo: {f?.cargo ?? '—'}</p>
                <p>Fecha ingreso: {fechaLarga(g.fechaIngreso)}</p>
                <p>
                  Días no trabajados: con licencia: {g.diasLicencia} · sin licencia: {g.diasSinLicencia} · vacaciones: {g.diasVacaciones}
                </p>
                <p>Días trabajados: {g.diasTrabajados}</p>
              </div>
            </td>
            <td className="w-36 border-l border-black px-2 pt-2 text-right align-top">
              <p className="font-semibold">RUT: {f?.rut ?? '—'}</p>
              {f?.extranjero && <p>(extranjero)</p>}
            </td>
          </tr>
          <Espacio />
          <Fila izq="Haberes tributables e imponibles" nivel={2} fuerte />
          {imp.map((h) => (
            <Fila key={h.codigo} izq={`${h.nombre}:`} der={clp(h.importe)} />
          ))}
          <Fila izq="Total haberes tributables e imponibles" der={clp(g.totalImponible)} nivel={2} fuerte />
          {noImp.length > 0 && (
            <>
              <Fila izq="Haberes no imponibles ni tributables" nivel={2} fuerte />
              {noImp.map((h) => (
                <Fila key={h.codigo} izq={`${h.nombre}:`} der={clp(h.importe)} />
              ))}
              <Fila izq="Total haberes no imponibles ni tributables" der={clp(g.totalNoImponible)} nivel={2} fuerte />
            </>
          )}
          <Espacio />
          <Fila izq="Descuentos legales" nivel={2} fuerte />
          <Fila izq={`Imponible previsional: $${clp(g.basePrevisional)}`} />
          <Fila izq={`Capitalización individual: ${g.afpPct}%`} der={clp(g.afpObligatoria)} />
          <Fila izq={`Comisión AFP ${f?.afp ?? ''} ${f?.afpComisionPct.toLocaleString('es-CL') ?? ''}%:`} der={clp(g.afpComision)} />
          <Fila izq="Total AFP" der={neg(g.afpTotal)} nivel={2} fuerte />
          <Fila izq={f?.salud === 'isapre' ? `Isapre ${f.isapre ?? ''}` : 'Fonasa'} nivel={2} fuerte />
          <Fila izq={f?.salud === 'isapre' ? `Plan ${f.isaprePlanUf?.toLocaleString('es-CL') ?? ''} UF (mínimo ${g.saludPct}%)` : `Salud ${g.saludPct}%`} der={clp(g.salud)} />
          <Fila izq="Total salud" der={neg(g.salud)} nivel={2} fuerte />
          <Espacio />
          <Fila
            izq={`Seguro de cesantía ${g.cesantiaPct.toLocaleString('es-CL')}% (contrato ${f ? ETIQUETA_CONTRATO[f.contrato].toLowerCase() : '—'})`}
            der={neg(g.cesantia)}
          />
          <Fila izq={`Impuesto único (base: $${clp(g.baseTributable)})`} der={neg(g.impuesto)} />
          <Fila izq="Total descuentos legales" der={neg(g.totalDescuentos)} nivel={0} fuerte />
          <Espacio />
          <Fila izq="Total haberes" der={clp(g.totalHaberes)} nivel={0} fuerte />
          <Fila izq="Total descuentos" der={neg(g.totalDescuentos)} nivel={0} fuerte />
          <Fila izq="Total líquido" der={clp(g.liquido)} nivel={0} fuerte />
          <tr className="border-t border-black">
            <td className="px-2 py-1">
              UF del mes: ${g.uf?.toLocaleString('es-CL', { minimumFractionDigits: 2 }) ?? '—'} · UTM del mes: ${clp(g.utm)}
            </td>
            <td className="border-l border-black" />
          </tr>
        </tbody>
      </table>
      <Firma nombre={l.chofer} />
      <p>Recibí conforme, la cantidad de {g.liquidoLetras}.</p>
    </article>
  );
}

function Firma({ nombre, rut }: { nombre: string; rut?: string | null }) {
  return (
    <div className="flex items-end justify-end gap-6 pt-10">
      <div className="w-56 border-t border-black pt-1 text-center">
        <p>{nombre}</p>
        {rut && <p>RUT {rut}</p>}
      </div>
      <div className="flex size-20 items-center justify-center rounded-full border border-dashed border-black text-[10px] text-neutral-500">Huella</div>
    </div>
  );
}

/** b) Planilla: viajes, haberes, fondo fijo por moneda y descuentos hasta lo que se paga. */
export function PlanillaLiquidacion({ l }: { l: Liquidacion }) {
  const g = l.legal;
  const haberes = l.renglones.filter((r) => r.tipo !== 'descuento');
  const descuentos = l.renglones.filter((r) => r.tipo === 'descuento');
  const bruto = l.remunerativo + l.noRemunerativo;
  const celda = 'border border-black px-2 py-0.5';
  return (
    <article className="space-y-4 text-[12px] text-black">
      <div className="flex items-start justify-between gap-4">
        {g ? <CabeceraEmpresa e={g.empresa} /> : <span />}
        <div className="text-right">
          <p className="text-sm font-bold uppercase">{nombrePeriodo(l.periodo)} · {l.chofer}</p>
          <p>
            Planilla {l.numero} · del {formatearFechaDia(l.desde)} al {formatearFechaDia(l.hasta)}
          </p>
          {g?.ficha && <p>{g.ficha.contratoFirmado ? 'Con contrato' : 'Contrato sin firmar'}</p>}
        </div>
      </div>

      {l.planilla.viajes.length > 0 && (
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-neutral-100">
              <th className={cn(celda, 'text-left')}>Fecha de salida</th>
              <th className={cn(celda, 'text-left')}>Recorrido</th>
              <th className={cn(celda, 'text-right')}>Km</th>
              <th className={cn(celda, 'text-right')}>Canon</th>
            </tr>
          </thead>
          <tbody>
            {l.planilla.viajes.map((v) => (
              <tr key={v.numero}>
                <td className={celda}>{formatearFechaDia(v.salida)}</td>
                <td className={celda}>
                  {v.recorrido} <span className="text-neutral-500">({v.numero})</span>
                </td>
                <td className={cn(celda, 'text-right tabular-nums')}>{v.km === null ? '' : clp(v.km)}</td>
                <td className={cn(celda, 'text-right tabular-nums')}>{clp(v.canon)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <table className="w-full border-collapse">
        <tbody>
          {haberes.map((r) => (
            <tr key={r.id}>
              <td className={celda}>{r.descripcion}</td>
              <td className={cn(celda, 'w-36 text-right tabular-nums')}>{clp(r.importe)}</td>
            </tr>
          ))}
          <tr className="bg-neutral-100 font-semibold">
            <td className={celda}>Total</td>
            <td className={cn(celda, 'text-right tabular-nums')}>{clp(bruto)}</td>
          </tr>
        </tbody>
      </table>

      {l.planilla.fondo.length > 0 && (
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-neutral-100">
              <th className={cn(celda, 'text-left')}>Fondo fijo</th>
              {l.planilla.fondo.map((f) => (
                <th key={f.moneda} className={cn(celda, 'text-right')}>
                  Efectivo {f.moneda}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(
              [
                ['Total entregado al chofer', 'entregado'],
                ['Gastos presentados por el chofer', 'gastos'],
                ['Devuelto', 'devuelto'],
                ['Diferencia', 'diferencia'],
              ] as const
            ).map(([t, k]) => (
              <tr key={k} className={cn(k === 'diferencia' && 'font-semibold')}>
                <td className={celda}>{t}</td>
                {l.planilla.fondo.map((f) => (
                  <td key={f.moneda} className={cn(celda, 'text-right tabular-nums')}>
                    {clp(f[k])}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <table className="w-full border-collapse">
        <tbody>
          <tr className="bg-neutral-100 font-semibold">
            <td className={celda}>Sub total</td>
            <td className={cn(celda, 'w-36 text-right tabular-nums')}>{clp(bruto)}</td>
          </tr>
          {descuentos.map((r) => (
            <tr key={r.id}>
              <td className={celda}>{r.descripcion}</td>
              <td className={cn(celda, 'text-right tabular-nums')}>{clp(r.importe)}</td>
            </tr>
          ))}
          {g && (
            <>
              <tr>
                <td className={celda}>AFP</td>
                <td className={cn(celda, 'text-right tabular-nums')}>{clp(g.afpTotal)}</td>
              </tr>
              <tr>
                <td className={celda}>{g.ficha?.salud === 'isapre' ? 'Isapre' : 'Fonasa'}</td>
                <td className={cn(celda, 'text-right tabular-nums')}>{clp(g.salud)}</td>
              </tr>
              <tr>
                <td className={celda}>Seguro de cesantía</td>
                <td className={cn(celda, 'text-right tabular-nums')}>{clp(g.cesantia)}</td>
              </tr>
              <tr>
                <td className={celda}>Impuesto único</td>
                <td className={cn(celda, 'text-right tabular-nums')}>{clp(g.impuesto)}</td>
              </tr>
            </>
          )}
          <tr className="bg-neutral-100 text-sm font-bold">
            <td className={celda}>Total a pagar</td>
            <td className={cn(celda, 'text-right tabular-nums')}>{clp(g ? g.aPagar : l.neto)}</td>
          </tr>
        </tbody>
      </table>
      <Firma nombre={l.chofer} />
    </article>
  );
}

/** c) Comprobante de egreso del pago. */
export function ComprobanteEgreso({ l }: { l: Liquidacion }) {
  const g = l.legal;
  const monto = g ? g.aPagar : l.neto;
  const celda = 'border border-black px-2 py-1 align-top';
  return (
    <article className="space-y-4 text-[12px] text-black">
      <div className="flex items-start justify-between gap-4">
        {g ? <CabeceraEmpresa e={g.empresa} /> : <span />}
        <div className="text-right">
          <h2 className="text-base font-bold">Comprobante de egreso</h2>
          <p className="text-sm font-semibold">N° {l.egresoNumero ?? '(se numera al registrar el pago)'}</p>
          <p>Fecha: {formatearFechaDia(l.pagadaEn)}</p>
        </div>
      </div>
      <table className="w-full border-collapse">
        <tbody>
          <tr>
            <td className={cn(celda, 'w-40 font-semibold')}>Beneficiario</td>
            <td className={celda}>
              {l.chofer}
              {g?.ficha && ` · RUT ${g.ficha.rut}`}
            </td>
          </tr>
          <tr>
            <td className={cn(celda, 'font-semibold')}>Concepto</td>
            <td className={celda}>
              Liquidación {l.numero} · {nombrePeriodo(l.periodo)}
            </td>
          </tr>
          <tr>
            <td className={cn(celda, 'font-semibold')}>Forma de pago</td>
            <td className={celda}>
              {[l.formaPago, l.pagoBanco, l.pagoNumero && `N° ${l.pagoNumero}`].filter(Boolean).join(' · ') || '—'}
            </td>
          </tr>
          <tr className="text-sm font-bold">
            <td className={celda}>Total a pagar</td>
            <td className={cn(celda, 'tabular-nums')}>$ {clp(monto)}</td>
          </tr>
          <tr>
            <td className={cn(celda, 'font-semibold')}>Son</td>
            <td className={celda}>{mayus(l.egresoLetras ?? '')}</td>
          </tr>
        </tbody>
      </table>
      <p className="pt-2 text-xs font-semibold uppercase">Recibo conforme</p>
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-neutral-100 text-left">
            <th className={celda}>Nombre</th>
            <th className={celda}>RUT</th>
            <th className={celda}>Firma recepción</th>
            <th className={celda}>Fecha</th>
          </tr>
        </thead>
        <tbody>
          <tr className="h-16">
            <td className={celda}>{l.chofer}</td>
            <td className={celda}>{g?.ficha?.rut}</td>
            <td className={celda} />
            <td className={celda} />
          </tr>
        </tbody>
      </table>
      <div className="flex justify-end">
        <div className="flex size-20 items-center justify-center rounded-full border border-dashed border-black text-[10px] text-neutral-500">Huella</div>
      </div>
      <p className="pt-2 text-xs font-semibold uppercase">Aprobación</p>
      <table className="w-full border-collapse">
        <thead>
          <tr className="bg-neutral-100 text-left">
            <th className={celda}>Procesó</th>
            <th className={celda}>Tesorería</th>
            <th className={celda}>Contabilidad</th>
          </tr>
        </thead>
        <tbody>
          <tr className="h-14">
            <td className={celda}>{l.aprobadaPor}</td>
            <td className={celda} />
            <td className={celda} />
          </tr>
        </tbody>
      </table>
    </article>
  );
}

/** Los tres papeles, uno por hoja. */
export function PapelesSueldo({ l, legal }: { l: Liquidacion; legal: Legal | null }) {
  return (
    <div className="space-y-10 print:space-y-0">
      {legal && (
        <section className="break-after-page">
          <LiquidacionSueldo l={l} />
        </section>
      )}
      <section className="break-after-page">
        <PlanillaLiquidacion l={l} />
      </section>
      <section>
        <ComprobanteEgreso l={l} />
      </section>
    </div>
  );
}
