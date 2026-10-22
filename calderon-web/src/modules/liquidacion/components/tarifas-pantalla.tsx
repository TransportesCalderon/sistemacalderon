'use client';

import { useState } from 'react';
import { Pencil, Plus, Trash2 } from 'lucide-react';
import { TD, TH, useEnvio } from '@/modules/catalogos/components/comun';
import { Cargando, Chip, Encabezado, ErrorBase } from '@/modules/combustible/components/comun/ui';
import { useChoferesCombustible } from '@/modules/combustible/queries/hooks';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia, hoyEnZona } from '@/shared/lib/fechas';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { ETIQUETA_CALCULO, ETIQUETA_TIPO, pesos, TIPOS_RENGLON, type CalculoConcepto, type Concepto, type TipoRenglon } from '../domain/liquidacion.types';
import { useConceptos, useGuardarConcepto, useGuardarTarifa, useQuitarTarifa, useTarifas } from '../queries/hooks';

/** Administración › Tarifas y conceptos: sueldo fijo, precio por km y los conceptos que define RRHH. */
export function TarifasPantalla() {
  return (
    <div className="space-y-6">
      <Encabezado titulo="Tarifas y conceptos" subtitulo="Administración" />
      <Tarifas />
      <Conceptos />
    </div>
  );
}

function Tarifas() {
  const puede = useCan('liquidacion.reglas:editar');
  const { data, isLoading } = useTarifas();
  const quitar = useQuitarTarifa();
  const envio = useEnvio();
  const [nueva, setNueva] = useState(false);
  return (
    <section className={cn(TARJETA, 'space-y-3 p-4')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-tinta">Sueldo fijo y precio por km</h2>
          <p className="text-sm text-tinta-suave">
            La general rige para todos. Si a un chofer se le paga distinto, cargale la suya: lo que dejes vacío lo toma de la general. Cada valor rige
            desde su fecha (un aumento no cambia lo ya liquidado). El canon sale de cada línea.
          </p>
        </div>
        {puede && (
          <button type="button" className={BOTON_PRIMARIO} onClick={() => setNueva(!nueva)}>
            <Plus className="size-4" /> Nueva tarifa
          </button>
        )}
      </div>
      {nueva && <FormTarifa onListo={() => setNueva(false)} />}
      <ErrorBase error={envio.error} />
      {isLoading ? (
        <Cargando texto="Leyendo las tarifas…" />
      ) : (data ?? []).length === 0 ? (
        <p className="text-sm text-alerta">No hay ninguna tarifa cargada: empezá por la general.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-borde">
              <th className={TH}>Para</th>
              <th className={TH}>Desde</th>
              <th className={cn(TH, 'text-right')}>Sueldo fijo</th>
              <th className={cn(TH, 'text-right')}>Precio por km</th>
              <th className={TH}>Nota</th>
              <th className={TH} />
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {(data ?? []).map((t) => (
              <tr key={t.id}>
                <td className={cn(TD, 'font-medium text-tinta')}>{t.chofer ?? 'General (todos)'}</td>
                <td className={TD}>{formatearFechaDia(t.desde)}</td>
                <td className={cn(TD, 'text-right tabular-nums')}>{t.sueldoFijo === null ? 'el general' : pesos(t.sueldoFijo)}</td>
                <td className={cn(TD, 'text-right tabular-nums')}>
                  {t.precioKm === null ? 'el general' : t.precioKm.toLocaleString('es-AR', { maximumFractionDigits: 4 })}
                </td>
                <td className={cn(TD, 'text-tinta-suave')}>{t.observacion}</td>
                <td className={TD}>
                  {puede && (
                    <button
                      type="button"
                      aria-label="Quitar"
                      className="text-tinta-suave hover:text-error"
                      disabled={quitar.isPending}
                      onClick={() => void envio.enviar(quitar.mutateAsync({ id: t.id }), () => undefined)}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function FormTarifa({ onListo }: { onListo: () => void }) {
  const { zonaHoraria } = useSesion();
  const choferes = useChoferesCombustible();
  const guardar = useGuardarTarifa();
  const envio = useEnvio();
  const [v, setV] = useState({ choferId: '', desde: hoyEnZona(zonaHoraria) as string, sueldoFijo: '', precioKm: '', observacion: '' });
  return (
    <div className="grid gap-3 rounded-lg border border-borde bg-fondo/40 p-4 sm:grid-cols-5">
      <Campo label="Para">
        <select value={v.choferId} onChange={(e) => setV({ ...v, choferId: e.target.value })}>
          <option value="">General (todos)</option>
          {(choferes.data ?? []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </Campo>
      <Campo label="Desde" error={envio.campo('desde')}>
        <input type="date" value={v.desde} onChange={(e) => setV({ ...v, desde: e.target.value })} />
      </Campo>
      <Campo label="Sueldo fijo mensual" error={envio.campo('sueldoFijo')} ayuda={v.choferId ? 'Vacío = el general' : undefined}>
        <input inputMode="decimal" value={v.sueldoFijo} onChange={(e) => setV({ ...v, sueldoFijo: e.target.value })} />
      </Campo>
      <Campo label="Precio por km de línea" error={envio.campo('precioKm')} ayuda={v.choferId ? 'Vacío = el general' : undefined}>
        <input inputMode="decimal" value={v.precioKm} onChange={(e) => setV({ ...v, precioKm: e.target.value })} />
      </Campo>
      <Campo label="Nota (opcional)">
        <input value={v.observacion} maxLength={300} onChange={(e) => setV({ ...v, observacion: e.target.value })} placeholder="Ej.: paritaria" />
      </Campo>
      <div className="sm:col-span-5">
        <ErrorBase error={envio.error} />
        <button
          type="button"
          className={BOTON_PRIMARIO}
          disabled={guardar.isPending}
          onClick={() =>
            void envio.enviar(
              guardar.mutateAsync({ choferId: v.choferId ? Number(v.choferId) : null, desde: v.desde, sueldoFijo: v.sueldoFijo, precioKm: v.precioKm, observacion: v.observacion }),
              onListo,
            )
          }
        >
          Guardar
        </button>
      </div>
    </div>
  );
}

function Conceptos() {
  const puede = useCan('liquidacion.reglas:editar');
  const { data, isLoading } = useConceptos();
  const [editando, setEditando] = useState<Concepto | 'nuevo' | null>(null);
  return (
    <section className={cn(TARJETA, 'space-y-3 p-4')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-semibold text-tinta">Conceptos</h2>
          <p className="text-sm text-tinta-suave">
            Aportes, obra social, sindicato, premios, adelantos… Cada uno suma (remunerativo o no) o descuenta; puede ser un importe fijo, un
            porcentaje (sobre lo remunerativo o sobre el bruto) o cargarse a mano en cada liquidación. Los «automáticos» se agregan solos al preparar.
          </p>
        </div>
        {puede && (
          <button type="button" className={BOTON_PRIMARIO} onClick={() => setEditando(editando === 'nuevo' ? null : 'nuevo')}>
            <Plus className="size-4" /> Nuevo concepto
          </button>
        )}
      </div>
      {editando && <FormConcepto c={editando === 'nuevo' ? null : editando} onListo={() => setEditando(null)} />}
      {isLoading ? (
        <Cargando texto="Leyendo los conceptos…" />
      ) : (data ?? []).length === 0 ? (
        <p className="text-sm text-tinta-suave">Todavía no hay conceptos. Cargalos cuando RRHH los defina.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-borde">
              <th className={TH}>Concepto</th>
              <th className={TH}>Tipo</th>
              <th className={TH}>Cálculo</th>
              <th className={TH}>Se agrega</th>
              <th className={TH} />
            </tr>
          </thead>
          <tbody className="divide-y divide-borde">
            {(data ?? []).map((c) => (
              <tr key={c.id} className={cn(!c.activo && 'opacity-60')}>
                <td className={TD}>
                  <span className="font-medium text-tinta">{c.nombre}</span>
                  <span className="block font-mono text-xs text-tinta-suave">{c.codigo}</span>
                </td>
                <td className={TD}>
                  <Chip tono={c.tipo === 'descuento' ? 'error' : 'exito'}>{ETIQUETA_TIPO[c.tipo]}</Chip>
                </td>
                <td className={TD}>
                  {c.calculo === 'porcentaje'
                    ? `${c.valor} % de ${c.base === 'remunerativo' ? 'lo remunerativo' : 'el bruto'}`
                    : c.calculo === 'fijo'
                      ? pesos(c.valor)
                      : 'A mano'}
                </td>
                <td className={TD}>{!c.activo ? 'Inactivo' : c.automatico ? 'Solo, en todas' : 'A mano'}</td>
                <td className={TD}>
                  {puede && (
                    <button type="button" aria-label="Editar" className="text-tinta-suave hover:text-marca" onClick={() => setEditando(c)}>
                      <Pencil className="size-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function FormConcepto({ c, onListo }: { c: Concepto | null; onListo: () => void }) {
  const guardar = useGuardarConcepto();
  const envio = useEnvio();
  const [v, setV] = useState({
    codigo: c?.codigo ?? '',
    nombre: c?.nombre ?? '',
    tipo: (c?.tipo ?? 'descuento') as TipoRenglon,
    calculo: (c?.calculo ?? 'porcentaje') as CalculoConcepto,
    valor: c?.valor?.toString().replace('.', ',') ?? '',
    base: (c?.base ?? 'remunerativo') as 'remunerativo' | 'bruto',
    automatico: c?.automatico ?? true,
    activo: c?.activo ?? true,
    orden: c?.orden ?? 100,
  });
  return (
    <div className="grid gap-3 rounded-lg border border-borde bg-fondo/40 p-4 sm:grid-cols-4">
      <Campo label="Nombre" error={envio.campo('nombre')}>
        <input value={v.nombre} maxLength={80} onChange={(e) => setV({ ...v, nombre: e.target.value })} placeholder="Ej.: Jubilación" />
      </Campo>
      <Campo label="Código" error={envio.campo('codigo')} ayuda="Mayúsculas, sin espacios">
        <input value={v.codigo} maxLength={30} onChange={(e) => setV({ ...v, codigo: e.target.value.toUpperCase().replace(/\s+/g, '_') })} placeholder="JUBILACION" />
      </Campo>
      <Campo label="Tipo">
        <select value={v.tipo} onChange={(e) => setV({ ...v, tipo: e.target.value as TipoRenglon })}>
          {TIPOS_RENGLON.map((t) => (
            <option key={t} value={t}>
              {ETIQUETA_TIPO[t]}
            </option>
          ))}
        </select>
      </Campo>
      <Campo label="Cómo se calcula">
        <select value={v.calculo} onChange={(e) => setV({ ...v, calculo: e.target.value as CalculoConcepto, automatico: e.target.value !== 'manual' && v.automatico })}>
          {(['porcentaje', 'fijo', 'manual'] as const).map((k) => (
            <option key={k} value={k}>
              {ETIQUETA_CALCULO[k]}
            </option>
          ))}
        </select>
      </Campo>
      {v.calculo !== 'manual' && (
        <Campo label={v.calculo === 'porcentaje' ? 'Porcentaje' : 'Importe'} error={envio.campo('valor')}>
          <input inputMode="decimal" value={v.valor} onChange={(e) => setV({ ...v, valor: e.target.value })} placeholder={v.calculo === 'porcentaje' ? '11' : '0,00'} />
        </Campo>
      )}
      {v.calculo === 'porcentaje' && (
        <Campo label="Sobre">
          <select value={v.base} onChange={(e) => setV({ ...v, base: e.target.value as 'remunerativo' | 'bruto' })}>
            <option value="remunerativo">Lo remunerativo</option>
            <option value="bruto">El bruto (remunerativo + no remunerativo)</option>
          </select>
        </Campo>
      )}
      <div className="flex flex-col justify-end gap-2 text-sm text-tinta">
        {v.calculo !== 'manual' && (
          <label className="flex items-center gap-2">
            <input type="checkbox" className="size-4 accent-marca" checked={v.automatico} onChange={(e) => setV({ ...v, automatico: e.target.checked })} />
            Se agrega solo a todas
          </label>
        )}
        <label className="flex items-center gap-2">
          <input type="checkbox" className="size-4 accent-marca" checked={v.activo} onChange={(e) => setV({ ...v, activo: e.target.checked })} />
          Activo
        </label>
      </div>
      <div className="space-y-2 sm:col-span-4">
        <ErrorBase error={envio.error} />
        <div className="flex gap-3">
          <button
            type="button"
            className={BOTON_PRIMARIO}
            disabled={guardar.isPending}
            onClick={() =>
              void envio.enviar(
                guardar.mutateAsync({
                  id: c?.id ?? null,
                  codigo: v.codigo,
                  nombre: v.nombre,
                  tipo: v.tipo,
                  calculo: v.calculo,
                  valor: v.calculo === 'manual' ? null : v.valor,
                  base: v.calculo === 'porcentaje' ? v.base : null,
                  automatico: v.calculo !== 'manual' && v.automatico,
                  activo: v.activo,
                  orden: v.orden,
                }),
                onListo,
              )
            }
          >
            Guardar
          </button>
          <button type="button" className={BOTON_SECUNDARIO} onClick={onListo}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
