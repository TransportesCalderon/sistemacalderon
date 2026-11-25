'use client';

import { useMemo, useState } from 'react';
import { LoaderCircle, Trash2, X } from 'lucide-react';
import { useUbicaciones } from '@/modules/catalogos/queries/hooks';
import { cn } from '@/shared/lib/cn';
import { formatearNumero } from '@/shared/lib/numeros';
import { BOTON_SECUNDARIO } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { leerNumero as aNumero, type BaseCotizador, type TramoEstandar, type ValoresCotizador } from '../domain/cotizador';
import { usd } from '../domain/ventas.types';
import { useBaseCotizador, useGuardarBaseCotizador, useGuardarTramoEstandar } from '../queries/hooks';

type Clave = Exclude<keyof ValoresCotizador, 'gasoilClpLitro' | 'gasoilFuente' | 'gasoilCargas' | 'gasoilLitros' | 'clpPorUsd' | 'gasoilUsdLitro' | 'margenObjetivoPct'>;
/** Los valores que se cambian, con su nombre en la base. */
const CAMPOS: { clave: Clave; base: string; label: string }[] = [
  { clave: 'fijoDiaUsd', base: 'fijo_dia_usd', label: 'Fijo del camión por día (USD)' },
  { clave: 'choferDiaUsd', base: 'chofer_dia_usd', label: 'Chofer por día (USD)' },
  { clave: 'consumoCargadoL100', base: 'consumo_cargado_l100', label: 'Consumo cargado (L cada 100 km)' },
  { clave: 'consumoVacioL100', base: 'consumo_vacio_l100', label: 'Consumo vacío (L cada 100 km)' },
  { clave: 'neumaticosUsdKm', base: 'neumaticos_usd_km', label: 'Neumáticos (USD por km)' },
  { clave: 'peajesUsdKm', base: 'peajes_usd_km', label: 'Peajes sin estándar (USD por km)' },
  { clave: 'kmDiaCargado', base: 'km_dia_cargado', label: 'Km por día cargado' },
  { clave: 'diasExtraCargado', base: 'dias_extra_cargado', label: 'Días de carga y descarga' },
  { clave: 'kmDiaVacio', base: 'km_dia_vacio', label: 'Km por día vacío' },
  { clave: 'gasoilClpLitroFijo', base: 'gasoil_clp_litro_fijo', label: 'Gasoil sin cargas (CLP por litro)' },
  { clave: 'gasoilDias', base: 'gasoil_dias', label: 'Días de cargas para el gasoil' },
  { clave: 'canonNormalClp', base: 'canon_normal_clp', label: 'Canon normal del chofer (CLP)' },
  { clave: 'cargasSocialesPct', base: 'cargas_sociales_pct', label: 'Cargas sociales del canon (%)' },
  { clave: 'margenMinimoPct', base: 'margen_minimo_pct', label: 'Margen mínimo (%)' },
];
const formatos = new Map<number, Intl.NumberFormat>();
/** Para los campos: sin ceros de más (119,5 y no 119,500). */
const num = (v: number | null, decimales = 3): string => {
  if (v === null) return '';
  let f = formatos.get(decimales);
  if (!f) {
    f = new Intl.NumberFormat('es-AR', { maximumFractionDigits: decimales });
    formatos.set(decimales, f);
  }
  return f.format(v);
};

/** Migración 308 · De dónde salen los valores del cotizador: la base, las bases de los vacíos y los tramos estándar. */
export function BaseDelCotizador({ puedeCambiar }: { puedeCambiar: boolean }) {
  const q = useBaseCotizador();
  if (q.isPending) return <p className="text-sm text-tinta-suave">Leyendo los valores…</p>;
  if (q.isError) return <p className="text-sm text-error">{q.error.message}</p>;
  return <Base b={q.data} puedeCambiar={puedeCambiar} />;
}

function Base({ b, puedeCambiar }: { b: BaseCotizador; puedeCambiar: boolean }) {
  const lugares = useUbicaciones();
  const guardar = useGuardarBaseCotizador();
  const [textos, setTextos] = useState<Partial<Record<Clave, string>>>({});
  const [bases, setBases] = useState<number[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState(false);
  const ordenados = useMemo(() => [...(lugares.data ?? [])].sort((a, c) => a.nombre.localeCompare(c.nombre, 'es')), [lugares.data]);
  const basesVista = bases ?? b.bases.map((x) => x.id);
  const nombre = (id: number) => b.bases.find((x) => x.id === id)?.nombre ?? ordenados.find((u) => u.id === id)?.nombre ?? `#${id}`;
  const cambiados = CAMPOS.filter((c) => textos[c.clave] !== undefined);
  const hayCambios = cambiados.length > 0 || bases !== null;

  return (
    <div className="space-y-4 rounded-lg border border-borde p-3 text-sm">
      <div className="space-y-1 text-tinta">
        <p>
          <strong>Gasoil:</strong> {formatearNumero(b.gasoilClpLitro, 0)} CLP por litro = {b.gasoilUsdLitro !== null ? `USD ${formatearNumero(b.gasoilUsdLitro, 2)}` : '—'}{' '}
          {b.gasoilFuente === 'cargas'
            ? `(promedio de ${b.gasoilCargas} ${b.gasoilCargas === 1 ? 'carga' : 'cargas'} en Chile de los últimos ${b.gasoilDias} días, ${formatearNumero(b.gasoilLitros, 0)} L)`
            : `(valor fijo: no hubo cargas en Chile en los últimos ${b.gasoilDias} días)`}
          . Dólar a {formatearNumero(b.clpPorUsd, 2)} CLP.
        </p>
        <p>
          <strong>Día de camión con chofer:</strong> {usd(b.fijoDiaUsd + b.choferDiaUsd)} (fijo {usd(b.fijoDiaUsd)} + chofer {usd(b.choferDiaUsd)}).{' '}
          <strong>Margen objetivo:</strong> {formatearNumero(b.margenObjetivoPct, 0)} % sobre el precio (se cambia en Tarifas a clientes).
        </p>
        <p className="text-tinta-suave">
          Cada tramo suma gasoil (km × consumo × precio), días × camión con chofer, peajes y neumáticos. El cargado suma lo que el canon de su ruta pase del
          normal, con cargas sociales. Los vacíos van desde la base más cercana al origen y hasta la más cercana al destino.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {CAMPOS.map((c) => (
          <Campo key={c.clave} label={c.label}>
            <input
              inputMode="decimal"
              disabled={!puedeCambiar}
              value={textos[c.clave] ?? num(b[c.clave])}
              onChange={(e) => {
                setOk(false);
                setTextos({ ...textos, [c.clave]: e.target.value });
              }}
            />
          </Campo>
        ))}
      </div>

      <div className="space-y-2">
        <p className="font-medium text-tinta">Bases de los vacíos</p>
        <div className="flex flex-wrap items-center gap-2">
          {basesVista.length === 0 && <span className="text-alerta">Sin bases: no se suman vacíos.</span>}
          {basesVista.map((id) => (
            <span key={id} className="inline-flex items-center gap-1 rounded-full border border-borde px-2 py-0.5 text-tinta">
              {nombre(id)}
              {puedeCambiar && (
                <button type="button" aria-label={`Quitar ${nombre(id)}`} className="text-tinta-suave hover:text-error" onClick={() => setBases(basesVista.filter((x) => x !== id))}>
                  <X className="size-3.5" />
                </button>
              )}
            </span>
          ))}
          {puedeCambiar && (
            <select
              className="h-8 rounded-md border border-borde bg-panel px-2 text-sm"
              value=""
              aria-label="Agregar una base"
              onChange={(e) => {
                const id = Number(e.target.value);
                if (id && !basesVista.includes(id)) setBases([...basesVista, id]);
              }}
            >
              <option value="">Agregar una base…</option>
              {ordenados
                .filter((u) => !basesVista.includes(u.id))
                .map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre}
                    {u.pais ? ` (${u.pais})` : ''}
                  </option>
                ))}
            </select>
          )}
        </div>
      </div>

      {puedeCambiar && (
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={BOTON_SECUNDARIO}
            disabled={!hayCambios || guardar.isPending}
            onClick={async () => {
              setError(null);
              const valores: Record<string, number> = {};
              for (const c of cambiados) {
                const v = aNumero(textos[c.clave] ?? '');
                if (v === null) return setError(`Revisá «${c.label}».`);
                valores[c.base] = v;
              }
              const r = await guardar.mutateAsync({ valores, bases });
              if (!r.ok) return setError(r.error.mensaje);
              setTextos({});
              setBases(null);
              setOk(true);
            }}
          >
            {guardar.isPending && <LoaderCircle className="size-4 animate-spin" />} Guardar los valores
          </button>
          {ok && <span className="text-exito">Guardado: el cotizador ya usa los valores nuevos.</span>}
          {error && <span className="text-error">{error}</span>}
        </div>
      )}

      <div className="space-y-2">
        <p className="font-medium text-tinta">Tramos estándar (mandan sobre los valores de arriba)</p>
        {b.tramos.length === 0 ? (
          <p className="text-tinta-suave">Todavía no hay. Se guardan desde el cotizador con «Estándar», en cada tramo.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead className="text-xs text-tinta-suave">
                <tr>
                  <th className="py-1 pr-3">Tramo</th>
                  <th className="w-24 py-1 pr-3">Km</th>
                  <th className="w-20 py-1 pr-3">Días</th>
                  <th className="w-24 py-1 pr-3">L cada 100 km</th>
                  <th className="w-24 py-1 pr-3">Peajes (USD)</th>
                  {puedeCambiar && <th className="py-1" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-borde tabular-nums">
                {b.tramos.map((t) => (
                  <FilaEstandar key={`${t.id}-${t.km}-${t.dias}-${t.consumoL100}-${t.peajesUsd}`} t={t} puedeCambiar={puedeCambiar} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/** Un tramo estándar: se corrige o se quita (vacío en consumo o peajes = los de la base). */
function FilaEstandar({ t, puedeCambiar }: { t: TramoEstandar; puedeCambiar: boolean }) {
  const guardar = useGuardarTramoEstandar();
  const inicial = { km: num(t.km, 1), dias: num(t.dias, 1), consumo: num(t.consumoL100, 2), peajes: num(t.peajesUsd, 2) };
  const [v, setV] = useState(inicial);
  const [error, setError] = useState<string | null>(null);
  const distinto = v.km !== inicial.km || v.dias !== inicial.dias || v.consumo !== inicial.consumo || v.peajes !== inicial.peajes;
  const enviar = async (quitar: boolean) => {
    setError(null);
    const r = await guardar.mutateAsync({
      desdeId: t.desdeId,
      hastaId: t.hastaId,
      lineaId: t.lineaId,
      km: aNumero(v.km),
      dias: aNumero(v.dias),
      consumoL100: aNumero(v.consumo),
      peajesUsd: aNumero(v.peajes),
      quitar,
    });
    if (!r.ok) setError(r.error.mensaje);
  };
  const celda = (clave: keyof typeof v, etiqueta: string) => (
    <input
      aria-label={`${etiqueta} de ${t.desde} → ${t.hasta}`}
      inputMode="decimal"
      disabled={!puedeCambiar}
      className="h-8 w-full rounded-md border border-borde bg-panel px-2 text-sm tabular-nums"
      value={v[clave]}
      onChange={(e) => setV({ ...v, [clave]: e.target.value })}
    />
  );
  return (
    <tr className="align-top text-tinta">
      <td className="py-1.5 pr-3">
        <p>
          {t.desde} → {t.hasta}
          {t.ruta ? <span className="text-tinta-suave"> · ruta {t.ruta}</span> : <span className="text-tinta-suave"> · vacío o cualquier ruta</span>}
        </p>
        {t.nota && <p className="text-xs text-tinta-suave">{t.nota}</p>}
        {t.actualizadoPor && <p className="text-xs text-tinta-suave">Último cambio: {t.actualizadoPor}</p>}
        {error && <p className="text-xs text-error">{error}</p>}
      </td>
      <td className="py-1.5 pr-3">{celda('km', 'Km')}</td>
      <td className="py-1.5 pr-3">{celda('dias', 'Días')}</td>
      <td className="py-1.5 pr-3">{celda('consumo', 'Consumo')}</td>
      <td className="py-1.5 pr-3">{celda('peajes', 'Peajes')}</td>
      {puedeCambiar && (
        <td className="whitespace-nowrap py-1.5">
          <button
            type="button"
            className={cn('rounded-md px-2 py-1 text-xs text-marca hover:bg-marca/10 disabled:opacity-40', !distinto && 'invisible')}
            disabled={!distinto || guardar.isPending}
            onClick={() => void enviar(false)}
          >
            Guardar
          </button>
          <button
            type="button"
            aria-label={`Quitar el estándar de ${t.desde} → ${t.hasta}`}
            className="rounded-md p-1 text-tinta-suave hover:bg-error/10 hover:text-error disabled:opacity-40"
            disabled={guardar.isPending}
            onClick={() => void enviar(true)}
          >
            <Trash2 className="size-4" />
          </button>
        </td>
      )}
    </tr>
  );
}
