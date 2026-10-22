'use client';

import { useEffect, useState } from 'react';
import { Pencil } from 'lucide-react';
import { TD, TH, useEnvio } from '@/modules/catalogos/components/comun';
import { Cargando, Chip, Encabezado, ErrorBase, ErrorLectura } from '@/modules/combustible/components/comun/ui';
import { nombrePeriodo } from '@/modules/chofer/domain/chofer.types';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { hoyEnZona } from '@/shared/lib/fechas';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { clp, ETIQUETA_CONTRATO, type DatosLegales, type FichaChofer } from '../domain/legal.types';
import { useDatosLegales, useGuardarEmpresa, useGuardarFicha, useGuardarIndicadores } from '../queries/hooks';

/** Liquidaciones › Datos legales: lo que hace falta para la liquidación de sueldo de Chile. */
export function DatosLegalesPantalla() {
  const { data, isLoading, isError, refetch } = useDatosLegales();
  return (
    <div className="space-y-6">
      <Encabezado titulo="Datos legales" subtitulo="Liquidación de sueldo (Chile)" />
      <p className="text-sm text-tinta-suave">
        Con estos datos el sistema arma la liquidación de sueldo, calcula AFP, salud, cesantía e impuesto, y saca el comprobante de egreso.
      </p>
      {isLoading ? (
        <Cargando texto="Leyendo los datos…" />
      ) : isError || !data ? (
        <ErrorLectura texto="No se pudieron leer los datos legales." onReintentar={() => void refetch()} />
      ) : (
        <>
          <EmpresaForm d={data} />
          <Indicadores d={data} />
          <Fichas d={data} />
          <section className={cn(TARJETA, 'space-y-1 p-4 text-sm text-tinta-suave')}>
            <h2 className="font-semibold text-tinta">Tasas que usa el cálculo</h2>
            <p>
              AFP obligatoria {data.tasas.afp}% + la comisión de cada AFP · salud {data.tasas.salud}% (o el plan de la Isapre si es mayor) · seguro de
              cesantía {data.tasas.cesantia.toLocaleString('es-CL')}% con contrato indefinido (0% a plazo fijo).
            </p>
            <p>
              Impuesto único mensual por tramos en UTM:{' '}
              {data.tramos.map((t) => `desde ${t.desdeUtm.toLocaleString('es-CL')} UTM ${(t.factor * 100).toLocaleString('es-CL')}%`).join(' · ')}.
            </p>
            <p>Si cambia la ley, TI corrige estas tasas en la base.</p>
          </section>
        </>
      )}
    </div>
  );
}

function EmpresaForm({ d }: { d: DatosLegales }) {
  const puede = useCan('liquidacion.reglas:editar');
  const guardar = useGuardarEmpresa();
  const envio = useEnvio();
  const [v, setV] = useState({ razonSocial: '', rut: '', direccion: '', comuna: '' });
  const [ok, setOk] = useState(false);
  useEffect(() => {
    setV({ razonSocial: d.empresa.razonSocial ?? '', rut: d.empresa.rut ?? '', direccion: d.empresa.direccion ?? '', comuna: d.empresa.comuna ?? '' });
  }, [d.empresa]);
  return (
    <section className={cn(TARJETA, 'space-y-3 p-4')}>
      <h2 className="font-semibold text-tinta">Empresa</h2>
      <div className="grid gap-3 sm:grid-cols-4">
        <Campo label="Razón social" error={envio.campo('razonSocial')}>
          <input value={v.razonSocial} disabled={!puede} onChange={(e) => setV({ ...v, razonSocial: e.target.value })} />
        </Campo>
        <Campo label="RUT" error={envio.campo('rut')}>
          <input value={v.rut} disabled={!puede} placeholder="76.123.456-7" onChange={(e) => setV({ ...v, rut: e.target.value })} />
        </Campo>
        <Campo label="Dirección">
          <input value={v.direccion} disabled={!puede} onChange={(e) => setV({ ...v, direccion: e.target.value })} />
        </Campo>
        <Campo label="Comuna y ciudad">
          <input value={v.comuna} disabled={!puede} onChange={(e) => setV({ ...v, comuna: e.target.value })} />
        </Campo>
      </div>
      <ErrorBase error={envio.error} />
      {puede && (
        <div className="flex items-center gap-3">
          <button
            type="button"
            className={BOTON_PRIMARIO}
            disabled={guardar.isPending}
            onClick={() => {
              setOk(false);
              void envio.enviar(guardar.mutateAsync(v), () => setOk(true));
            }}
          >
            Guardar
          </button>
          {ok && <span className="text-sm text-exito">Guardado.</span>}
        </div>
      )}
    </section>
  );
}

/** «71.721» escrito con punto de miles (sin coma) es 71721, no 71,7 */
const miles = (t: string) => (/^\d{1,3}(\.\d{3})+$/.test(t.trim()) ? t.trim().replace(/\./g, '') : t);

function Indicadores({ d }: { d: DatosLegales }) {
  const { zonaHoraria } = useSesion();
  const puede = useCan('liquidacion.reglas:editar');
  const guardar = useGuardarIndicadores();
  const envio = useEnvio();
  const ultimo = d.indicadores[0];
  const mes = `${hoyEnZona(zonaHoraria).slice(0, 7)}-01`;
  const [v, setV] = useState({
    periodo: mes,
    uf: '',
    utm: '',
    topeImponibleUf: ultimo ? String(ultimo.topeImponibleUf).replace('.', ',') : '',
    topeCesantiaUf: ultimo ? String(ultimo.topeCesantiaUf).replace('.', ',') : '',
  });
  return (
    <section className={cn(TARJETA, 'space-y-3 p-4')}>
      <div>
        <h2 className="font-semibold text-tinta">UF, UTM y topes del mes</h2>
        <p className="text-sm text-tinta-suave">
          Se cargan una vez por mes, con los valores del mes de la liquidación (por ejemplo, de la página del SII o de Previred). Los topes imponibles
          cambian una vez al año.
        </p>
      </div>
      {puede && (
        <div className="grid items-end gap-3 sm:grid-cols-6">
          <Campo label="Mes" error={envio.campo('periodo')}>
            <input type="month" value={v.periodo.slice(0, 7)} onChange={(e) => setV({ ...v, periodo: `${e.target.value}-01` })} />
          </Campo>
          <Campo label="UF ($)" error={envio.campo('uf')}>
            <input inputMode="decimal" value={v.uf} placeholder="Ej.: 39.500,25" onChange={(e) => setV({ ...v, uf: e.target.value })} />
          </Campo>
          <Campo label="UTM ($)" error={envio.campo('utm')}>
            <input inputMode="decimal" value={v.utm} onChange={(e) => setV({ ...v, utm: e.target.value })} />
          </Campo>
          <Campo label="Tope imponible AFP y salud (UF)" error={envio.campo('topeImponibleUf')}>
            <input inputMode="decimal" value={v.topeImponibleUf} onChange={(e) => setV({ ...v, topeImponibleUf: e.target.value })} />
          </Campo>
          <Campo label="Tope seguro de cesantía (UF)" error={envio.campo('topeCesantiaUf')}>
            <input inputMode="decimal" value={v.topeCesantiaUf} onChange={(e) => setV({ ...v, topeCesantiaUf: e.target.value })} />
          </Campo>
          <button type="button" className={BOTON_PRIMARIO} disabled={guardar.isPending} onClick={() => void envio.enviar(guardar.mutateAsync({ ...v, uf: miles(v.uf), utm: miles(v.utm) }), () => undefined)}>
            Guardar el mes
          </button>
        </div>
      )}
      <ErrorBase error={envio.error} />
      {d.indicadores.length === 0 ? (
        <p className="text-sm text-alerta">Todavía no hay ningún mes cargado.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-borde">
              <th className={TH}>Mes</th>
              <th className={cn(TH, 'text-right')}>UF</th>
              <th className={cn(TH, 'text-right')}>UTM</th>
              <th className={cn(TH, 'text-right')}>Tope imponible</th>
              <th className={cn(TH, 'text-right')}>Tope cesantía</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {d.indicadores.map((i) => (
              <tr key={i.periodo}>
                <td className={cn(TD, 'first-letter:uppercase')}>{nombrePeriodo(i.periodo)}</td>
                <td className={cn(TD, 'text-right tabular-nums')}>{i.uf.toLocaleString('es-CL', { minimumFractionDigits: 2 })}</td>
                <td className={cn(TD, 'text-right tabular-nums')}>{clp(i.utm)}</td>
                <td className={cn(TD, 'text-right tabular-nums')}>{i.topeImponibleUf.toLocaleString('es-CL')} UF</td>
                <td className={cn(TD, 'text-right tabular-nums')}>{i.topeCesantiaUf.toLocaleString('es-CL')} UF</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function Fichas({ d }: { d: DatosLegales }) {
  const puede = useCan('liquidacion.reglas:editar');
  const [editando, setEditando] = useState<number | null>(null);
  const sinFicha = d.fichas.filter((f) => !f.ficha).length;
  return (
    <section className={cn(TARJETA, 'space-y-3 p-4')}>
      <div>
        <h2 className="font-semibold text-tinta">Fichas de los choferes</h2>
        <p className="text-sm text-tinta-suave">
          RUT, cargo, AFP, salud y contrato de cada chofer. {sinFicha > 0 && <span className="text-alerta">{sinFicha} chofer(es) sin ficha.</span>}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-borde">
              <th className={TH}>Chofer</th>
              <th className={TH}>RUT</th>
              <th className={TH}>AFP</th>
              <th className={TH}>Salud</th>
              <th className={TH}>Contrato</th>
              <th className={TH} />
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {d.fichas.map((c) => (
              <FilaFicha key={c.choferId} c={c} puede={puede} abierta={editando === c.choferId} onAbrir={() => setEditando(editando === c.choferId ? null : c.choferId)} />
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FilaFicha({ c, puede, abierta, onAbrir }: { c: FichaChofer; puede: boolean; abierta: boolean; onAbrir: () => void }) {
  const f = c.ficha;
  return (
    <>
      <tr>
        <td className={cn(TD, 'font-medium text-tinta')}>{c.chofer}</td>
        <td className={cn(TD, 'tabular-nums')}>{f ? `${f.rut}${f.extranjero ? ' (extranjero)' : ''}` : <Chip tono="alerta">Sin ficha</Chip>}</td>
        <td className={TD}>{f ? `${f.afp} · ${f.afpComisionPct.toLocaleString('es-CL')}%` : ''}</td>
        <td className={TD}>{f ? (f.salud === 'fonasa' ? 'Fonasa' : `${f.isapre ?? 'Isapre'} · ${f.isaprePlanUf?.toLocaleString('es-CL')} UF`) : ''}</td>
        <td className={TD}>
          {f && (
            <>
              {ETIQUETA_CONTRATO[f.contrato]} {!f.contratoFirmado && <Chip tono="alerta">sin firmar</Chip>}
            </>
          )}
        </td>
        <td className={TD}>
          {puede && (
            <button type="button" className="inline-flex items-center gap-1 text-marca hover:underline" onClick={onAbrir}>
              <Pencil className="size-3.5" /> {f ? 'Editar' : 'Cargar'}
            </button>
          )}
        </td>
      </tr>
      {abierta && (
        <tr>
          <td colSpan={6} className="bg-fondo/40 p-3">
            <FormFicha c={c} onListo={onAbrir} />
          </td>
        </tr>
      )}
    </>
  );
}

function FormFicha({ c, onListo }: { c: FichaChofer; onListo: () => void }) {
  const guardar = useGuardarFicha();
  const envio = useEnvio();
  const f = c.ficha;
  const [v, setV] = useState({
    rut: f?.rut ?? '',
    extranjero: f?.extranjero ?? false,
    cargo: f?.cargo ?? '',
    afp: f?.afp ?? '',
    afpComisionPct: f ? String(f.afpComisionPct).replace('.', ',') : '',
    salud: f?.salud ?? 'fonasa',
    isapre: f?.isapre ?? '',
    isaprePlanUf: f?.isaprePlanUf ? String(f.isaprePlanUf).replace('.', ',') : '',
    contrato: f?.contrato ?? 'indefinido',
    contratoFirmado: f?.contratoFirmado ?? false,
    observacion: f?.observacion ?? '',
  });
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-4">
        <Campo label="RUT" error={envio.campo('rut')}>
          <input value={v.rut} placeholder="12.345.678-5" onChange={(e) => setV({ ...v, rut: e.target.value })} />
        </Campo>
        <Campo label="Cargo" error={envio.campo('cargo')}>
          <input value={v.cargo} placeholder="Chofer de cargas internacionales" onChange={(e) => setV({ ...v, cargo: e.target.value })} />
        </Campo>
        <Campo label="AFP" error={envio.campo('afp')}>
          <input value={v.afp} onChange={(e) => setV({ ...v, afp: e.target.value })} />
        </Campo>
        <Campo label="Comisión de la AFP (%)" error={envio.campo('afpComisionPct')}>
          <input inputMode="decimal" value={v.afpComisionPct} onChange={(e) => setV({ ...v, afpComisionPct: e.target.value })} />
        </Campo>
        <Campo label="Salud">
          <select value={v.salud} onChange={(e) => setV({ ...v, salud: e.target.value as 'fonasa' | 'isapre' })}>
            <option value="fonasa">Fonasa</option>
            <option value="isapre">Isapre</option>
          </select>
        </Campo>
        {v.salud === 'isapre' && (
          <>
            <Campo label="Isapre">
              <input value={v.isapre} onChange={(e) => setV({ ...v, isapre: e.target.value })} />
            </Campo>
            <Campo label="Plan (UF)">
              <input inputMode="decimal" value={v.isaprePlanUf} onChange={(e) => setV({ ...v, isaprePlanUf: e.target.value })} />
            </Campo>
          </>
        )}
        <Campo label="Contrato">
          <select value={v.contrato} onChange={(e) => setV({ ...v, contrato: e.target.value as 'indefinido' | 'plazo_fijo' })}>
            <option value="indefinido">Indefinido</option>
            <option value="plazo_fijo">Plazo fijo</option>
          </select>
        </Campo>
      </div>
      <div className="flex flex-wrap gap-6 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" className="size-4 accent-marca" checked={v.extranjero} onChange={(e) => setV({ ...v, extranjero: e.target.checked })} />
          Extranjero
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" className="size-4 accent-marca" checked={v.contratoFirmado} onChange={(e) => setV({ ...v, contratoFirmado: e.target.checked })} />
          El contrato está firmado
        </label>
      </div>
      <ErrorBase error={envio.error} />
      <div className="flex gap-2">
        <button
          type="button"
          className={BOTON_PRIMARIO}
          disabled={guardar.isPending}
          onClick={() => void envio.enviar(guardar.mutateAsync({ choferId: c.choferId, ...v }), onListo)}
        >
          Guardar la ficha
        </button>
        <button type="button" className={BOTON_SECUNDARIO} onClick={onListo}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
