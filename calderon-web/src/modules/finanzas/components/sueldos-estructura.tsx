'use client';

import { useState } from 'react';
import { Pencil, Plus, Users } from 'lucide-react';
import { Panel, TD, TH, useEnvio } from '@/modules/catalogos/components/comun';
import { Chip, Seccion } from '@/modules/combustible/components/comun/ui';
import { cn } from '@/shared/lib/cn';
import { BOTON_ICONO, BOTON_SECUNDARIO } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { dinero, type CuentaContable, type GastoFijo } from '../domain/finanzas.types';
import { AREAS_ESTRUCTURA, agruparSueldos, CUENTA_SUELDOS, nombreSueldo, partesSueldo } from '../domain/sueldos-estructura';
import { useGuardarGastoFijo } from '../queries/hooks';
import { MONEDAS } from './comun';

interface Form {
  id: number | null;
  persona: string;
  area: string;
  otraArea: string;
  moneda: string;
  monto: string;
  diaVence: string;
  desde: string;
  activo: boolean;
  observacion: string;
}
const OTRA = '__otra__';

/**
 * Finanzas › Gastos fijos · Sueldos de la estructura. Un formulario corto (sin proveedor ni documento):
 * cada sueldo queda como un gasto fijo en «Remuneraciones de administración» y el sistema genera el gasto de cada mes.
 */
export function SueldosEstructura({ fijos, plan, puede, mesActual }: { fijos: GastoFijo[]; plan: CuentaContable[]; puede: boolean; mesActual: string }) {
  const guardar = useGuardarGastoFijo();
  const envio = useEnvio();
  const [form, setForm] = useState<Form | null>(null);
  const grupos = agruparSueldos(fijos);
  const total = grupos.reduce((s, g) => s + g.totalClp, 0);
  const personas = grupos.reduce((s, g) => s + g.sueldos.filter((x) => x.activo).length, 0);
  const cuenta = plan.find((c) => c.codigo === CUENTA_SUELDOS && c.imputable);

  const nuevo = (): Form => ({ id: null, persona: '', area: 'Operaciones', otraArea: '', moneda: 'CLP', monto: '', diaVence: '5', desde: mesActual, activo: true, observacion: '' });
  const editar = (f: GastoFijo): Form => {
    const { area, persona } = partesSueldo(f.nombre);
    const conocida = (AREAS_ESTRUCTURA as readonly string[]).includes(area);
    return {
      id: f.id,
      persona,
      area: conocida ? area : OTRA,
      otraArea: conocida ? '' : area,
      moneda: f.moneda,
      monto: String(f.monto),
      diaVence: String(f.diaVence),
      desde: f.desde,
      activo: f.activo,
      observacion: f.observacion ?? '',
    };
  };

  return (
    <Seccion
      titulo={personas > 0 ? `Sueldos de la estructura · ${personas} ${personas === 1 ? 'persona' : 'personas'} · ${dinero(total)} por mes` : 'Sueldos de la estructura'}
      acciones={
        puede && !form && cuenta ? (
          <button type="button" className={BOTON_SECUNDARIO} onClick={() => setForm(nuevo())}>
            <Plus className="size-4" /> Agregar sueldo
          </button>
        ) : undefined
      }
    >
      <p className="text-sm text-tinta-suave">
        Gerencia, operaciones, telemetría, administración y el resto de la oficina. Sin proveedor ni factura: cargá la persona o el puesto, el área y lo que
        se le paga por mes. Los sueldos de los choferes no van acá: salen de RR. HH. › Liquidaciones.
      </p>
      {!cuenta && <p className="text-sm text-alerta">Falta la cuenta {CUENTA_SUELDOS} (Remuneraciones de administración) en el plan de cuentas: sin ella no se pueden cargar sueldos.</p>}

      {form && cuenta && (
        <Panel
          titulo={form.id ? 'Cambiar el sueldo' : 'Agregar un sueldo'}
          explicacion="El monto es lo que cuesta por mes. El día 1 el sistema crea el gasto del mes; cuando se paga, se registra el pago como cualquier gasto."
          error={envio.error}
          ocupado={guardar.isPending}
          textoBoton="Guardar"
          onCerrar={() => setForm(null)}
          onConfirmar={() => {
            const area = form.area === OTRA ? form.otraArea : form.area;
            if (form.persona.trim().length < 2 || area.trim().length < 2) {
              envio.setError({ codigo: 'validacion', mensaje: 'Escribí la persona o el puesto, y el área.' });
              return;
            }
            void envio.enviar(
              guardar.mutateAsync({
                id: form.id,
                nombre: nombreSueldo(area, form.persona).slice(0, 100),
                proveedorId: null,
                cuentaId: cuenta.id,
                tipoDocumento: 'sin_documento',
                moneda: form.moneda,
                monto: form.monto,
                diaVence: Number(form.diaVence) || 0,
                camionId: null,
                desde: form.desde,
                hasta: null,
                cuotas: null,
                cuotasPrevias: null,
                activo: form.activo,
                observacion: form.observacion,
              }),
              () => setForm(null),
            );
          }}
        >
          <Campo label="Persona o puesto">
            <input value={form.persona} maxLength={60} placeholder="Ej.: Jefe de operaciones" onChange={(e) => setForm({ ...form, persona: e.target.value })} />
          </Campo>
          <Campo label="Área">
            <select value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })}>
              {AREAS_ESTRUCTURA.map((a) => (
                <option key={a}>{a}</option>
              ))}
              <option value={OTRA}>Otra…</option>
            </select>
          </Campo>
          {form.area === OTRA ? (
            <Campo label="Cuál área">
              <input value={form.otraArea} maxLength={30} onChange={(e) => setForm({ ...form, otraArea: e.target.value })} />
            </Campo>
          ) : (
            <span className="hidden lg:block" />
          )}
          <Campo label="Sueldo del mes" ayuda="Lo que le cuesta a la empresa por mes.">
            <input inputMode="decimal" value={form.monto} onChange={(e) => setForm({ ...form, monto: e.target.value })} />
          </Campo>
          <Campo label="Moneda">
            <select value={form.moneda} onChange={(e) => setForm({ ...form, moneda: e.target.value })}>
              {MONEDAS.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
          </Campo>
          <Campo label="Día de pago" ayuda="De 1 a 28.">
            <input inputMode="numeric" value={form.diaVence} onChange={(e) => setForm({ ...form, diaVence: e.target.value })} />
          </Campo>
          <Campo label="Desde (mes)">
            <input type="date" value={form.desde} onChange={(e) => setForm({ ...form, desde: e.target.value })} />
          </Campo>
          <Campo label="Nota">
            <input value={form.observacion} maxLength={500} onChange={(e) => setForm({ ...form, observacion: e.target.value })} />
          </Campo>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" className="size-4 accent-marca" checked={form.activo} onChange={(e) => setForm({ ...form, activo: e.target.checked })} />
            Activo (destildar si ya no trabaja)
          </label>
        </Panel>
      )}

      {grupos.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-tinta-suave">
          <Users className="size-4" /> Todavía no hay sueldos cargados.
        </p>
      ) : (
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-y border-borde bg-fondo">
              <tr>
                <th className={TH}>Área y persona</th>
                <th className={cn(TH, 'text-right')}>Sueldo del mes</th>
                <th className={TH}>Día de pago</th>
                <th className={TH}>Este mes</th>
                <th className={TH} />
              </tr>
            </thead>
            {grupos.map((g) => (
              <tbody key={g.area} className="divide-y divide-borde">
                <tr className="bg-fondo/60">
                  <td className={cn(TD, 'font-medium text-tinta')}>{g.area}</td>
                  <td className={cn(TD, 'text-right font-medium tabular-nums')}>{dinero(g.totalClp)}</td>
                  <td className={TD} colSpan={3} />
                </tr>
                {g.sueldos.map((f) => (
                  <tr key={f.id} className={cn(!f.activo && 'text-tinta-suave')}>
                    <td className={cn(TD, 'pl-8')}>{partesSueldo(f.nombre).persona}</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>
                      {dinero(f.monto, f.moneda)}
                      {f.moneda !== 'CLP' && f.montoClp !== null && <span className="block text-xs text-tinta-suave">= {dinero(f.montoClp)}</span>}
                    </td>
                    <td className={cn(TD, 'tabular-nums')}>día {f.diaVence}</td>
                    <td className={TD}>
                      {!f.activo ? <Chip tono="neutro">Inactivo</Chip> : f.generadoMes ? <Chip tono="exito">Generado</Chip> : <Chip tono="alerta">Falta</Chip>}
                    </td>
                    <td className={cn(TD, 'text-right')}>
                      {puede && !form && (
                        <button type="button" className={BOTON_ICONO} aria-label={`Cambiar el sueldo de ${partesSueldo(f.nombre).persona}`} onClick={() => setForm(editar(f))}>
                          <Pencil className="size-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      )}
    </Seccion>
  );
}
