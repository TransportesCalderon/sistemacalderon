'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, LoaderCircle, Save } from 'lucide-react';
import { useEnvio } from '@/modules/catalogos/components/comun';
import { ErrorBase } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { cn } from '@/shared/lib/cn';
import { BOTON_PRIMARIO } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { clp } from '../domain/legal.types';
import type { Liquidacion } from '../domain/liquidacion.types';
import { useDatosLegales, useGuardarLegal } from '../queries/hooks';

/**
 * Liquidación de sueldo (Chile) dentro de la ficha: RRHH escribe los días y el reparto de los haberes;
 * la base calcula AFP, salud, cesantía, impuesto, líquido y lo que se paga.
 */
export function SueldoLegal({ l }: { l: Liquidacion }) {
  const puede = useCan('liquidacion.liquidaciones:editar') && l.estado === 'borrador';
  const datos = useDatosLegales(puede);
  const guardar = useGuardarLegal();
  const envio = useEnvio();
  const g = l.legal;
  const carga = l.legalCarga;
  const [dias, setDias] = useState({ licencia: '0', sinLicencia: '0', vacaciones: '0' });
  const [importes, setImportes] = useState<Record<string, string>>({});

  useEffect(() => {
    setDias({
      licencia: String(carga?.diasLicencia ?? 0),
      sinLicencia: String(carga?.diasSinLicencia ?? 0),
      vacaciones: String(carga?.diasVacaciones ?? 0),
    });
    setImportes(Object.fromEntries((carga?.haberes ?? []).map((h) => [h.codigo, String(h.importe)])));
  }, [carga]);

  const entero = (t: string) => (t.trim() === '' ? 0 : Number(t));

  return (
    <section className="space-y-3 rounded-lg border border-borde p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-semibold text-tinta">Liquidación de sueldo (Chile)</h3>
        <Link href="/rrhh/datos-legales" className="text-xs text-marca hover:underline">
          Empresa, UF/UTM y fichas de los choferes
        </Link>
      </div>

      {g && g.faltan.length > 0 && (
        <ul className="space-y-1 rounded-lg bg-alerta-suave p-3 text-sm text-alerta">
          {g.faltan.map((f) => (
            <li key={f} className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" /> {f}
            </li>
          ))}
        </ul>
      )}

      {puede && (
        <>
          <p className="text-sm text-tinta-suave">
            Escribí el reparto legal del bruto de la planilla ({clp(l.remunerativo + l.noRemunerativo)}). Tiene que sumar lo mismo para poder aprobar.
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <Campo label="Días con licencia">
              <input inputMode="numeric" value={dias.licencia} onChange={(e) => setDias({ ...dias, licencia: e.target.value })} />
            </Campo>
            <Campo label="Días sin licencia (ausencias)">
              <input inputMode="numeric" value={dias.sinLicencia} onChange={(e) => setDias({ ...dias, sinLicencia: e.target.value })} />
            </Campo>
            <Campo label="Días de vacaciones">
              <input inputMode="numeric" value={dias.vacaciones} onChange={(e) => setDias({ ...dias, vacaciones: e.target.value })} />
            </Campo>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {(datos.data?.conceptos ?? []).map((c) => (
              <Campo key={c.codigo} label={`${c.nombre}${c.imponible ? '' : ' (no imponible)'}`}>
                <input
                  inputMode="numeric"
                  value={importes[c.codigo] ?? ''}
                  placeholder="0"
                  onChange={(e) => setImportes({ ...importes, [c.codigo]: e.target.value })}
                />
              </Campo>
            ))}
          </div>
          <ErrorBase error={envio.error} />
          <button
            type="button"
            className={BOTON_PRIMARIO}
            disabled={guardar.isPending}
            onClick={() =>
              void envio.enviar(
                guardar.mutateAsync({
                  liquidacionId: l.id,
                  diasLicencia: entero(dias.licencia),
                  diasSinLicencia: entero(dias.sinLicencia),
                  diasVacaciones: entero(dias.vacaciones),
                  haberes: Object.entries(importes)
                    .filter(([, v]) => v.trim() !== '')
                    .map(([codigo, importe]) => ({ codigo, importe: importe.replace(/[^\d]/g, '') || '0' })),
                }),
                () => undefined,
              )
            }
          >
            {guardar.isPending ? <LoaderCircle className="size-4 animate-spin" /> : <Save className="size-4" />} Guardar y calcular
          </button>
        </>
      )}

      {g && g.totalHaberes > 0 && (
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          <Dato t="Total haberes" v={clp(g.totalHaberes)} />
          <Dato t="Imponible / no imponible" v={`${clp(g.totalImponible)} / ${clp(g.totalNoImponible)}`} />
          <Dato t="AFP (10 % + comisión)" v={clp(g.afpTotal)} />
          <Dato t="Salud" v={clp(g.salud)} />
          <Dato t="Seguro de cesantía" v={clp(g.cesantia)} />
          <Dato t="Impuesto único" v={clp(g.impuesto)} />
          <Dato t="Total líquido (liquidación de sueldo)" v={clp(g.liquido)} fuerte />
          <Dato t="Otros descuentos de la planilla" v={clp(g.otrosDescuentos)} />
          <Dato t="A pagar (comprobante de egreso)" v={clp(g.aPagar)} fuerte />
          {g.diferencia !== 0 && (
            <p className="text-error sm:col-span-2">
              Los haberes suman {clp(g.totalHaberes)} y la planilla {clp(g.planillaBruto)}: diferencia {clp(g.diferencia)}.
            </p>
          )}
          {g.congelado && <p className="text-xs text-tinta-suave sm:col-span-2">Cálculo congelado al aprobar.</p>}
        </dl>
      )}
    </section>
  );
}

function Dato({ t, v, fuerte = false }: { t: string; v: string; fuerte?: boolean }) {
  return (
    <div className={cn('flex justify-between gap-3 border-b border-borde py-1', fuerte && 'font-semibold text-tinta')}>
      <dt className="text-tinta-suave">{t}</dt>
      <dd className="tabular-nums">{v}</dd>
    </div>
  );
}
