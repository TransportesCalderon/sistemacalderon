'use client';

import { useState, type SelectHTMLAttributes } from 'react';
import { Package, Pencil, Plus, Snowflake } from 'lucide-react';
import { Cargando, Chip, Encabezado, ErrorLectura, Vacio } from '@/modules/combustible/components/comun/ui';
import { useBaseTiene } from '@/shared/hooks/use-version-base';
import { cn } from '@/shared/lib/cn';
import { BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { opcionesTipoCarga, VERSION_TIPOS_CARGA, type TipoCarga } from '../domain/tipos-carga';
import { useGuardarTipoCarga, useTiposCarga } from '../queries/hooks';
import { Panel, TD, TH, useEnvio } from './comun';

/**
 * Migración 121 · Ajustes › Catálogos › Tipos de carga. La lista que se elige en la operación, la
 * tarifa y la cotización. La editan Gerencia o TI (lo decide la base); uno en uso no cambia de
 * nombre, se desactiva.
 */
export function TiposCargaPantalla() {
  const hay = useBaseTiene(VERSION_TIPOS_CARGA);
  const { data, isPending, isError, error, refetch } = useTiposCarga(hay);
  const [editando, setEditando] = useState<TipoCarga | 'nuevo' | null>(null);

  return (
    <div className="space-y-5">
      <Encabezado titulo="Tipos de carga" subtitulo="Catálogos">
        {data?.puedeEditar && editando === null && (
          <button type="button" className={BOTON_SECUNDARIO} onClick={() => setEditando('nuevo')}>
            <Plus className="size-4" /> Nuevo tipo
          </button>
        )}
      </Encabezado>
      <p className="max-w-3xl text-sm text-tinta-suave">
        La mercadería que se transporta. Se elige en cada operación, tarifa y cotización, y la tarifa puede tener un precio distinto para cada tipo.
        Los «con frío» avisan en Hoy si la operación no tiene genset.
      </p>
      {!hay ? (
        <Vacio icono={<Package className="size-6" />} texto="La base todavía no tiene los tipos de carga. Falta aplicar la migración 121 (106_tipos_carga.sql)." />
      ) : isPending ? (
        <Cargando texto="Cargando los tipos de carga…" />
      ) : isError ? (
        <ErrorLectura texto={error instanceof Error ? error.message : 'No se pudieron leer los tipos de carga.'} onReintentar={() => refetch()} />
      ) : (
        <>
          {editando !== null && <FormTipo tipo={editando === 'nuevo' ? null : editando} onCerrar={() => setEditando(null)} />}
          <section className={cn(TARJETA, 'overflow-x-auto')}>
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-b border-borde bg-fondo">
                <tr>
                  <th className={TH}>Tipo de carga</th>
                  <th className={TH}>Va en</th>
                  <th className={cn(TH, 'text-right')}>Usado en</th>
                  <th className={TH}>Estado</th>
                  {data.puedeEditar && <th className={TH} />}
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {data.tipos.map((t) => (
                  <tr key={t.id} className={cn(!t.activo && 'text-tinta-suave')}>
                    <td className={cn(TD, 'font-medium')}>
                      {t.nombre}
                      {t.requiereFrio && (
                        <span className="ml-2 inline-flex items-center gap-1 text-xs text-[#0b4a85]">
                          <Snowflake className="size-3" /> con frío
                        </span>
                      )}
                    </td>
                    <td className={TD}>{t.esContenedor ? 'Contenedor' : 'Semi (sin contenedor)'}</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>{t.usos === 1 ? '1 operación o tarifa' : `${t.usos} operaciones o tarifas`}</td>
                    <td className={TD}>{t.activo ? <Chip tono="exito">Activo</Chip> : <Chip tono="neutro">Desactivado</Chip>}</td>
                    {data.puedeEditar && (
                      <td className={cn(TD, 'text-right')}>
                        <button type="button" className="inline-flex items-center gap-1 text-marca hover:underline" onClick={() => setEditando(t)}>
                          <Pencil className="size-3.5" /> Cambiar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}

function FormTipo({ tipo, onCerrar }: { tipo: TipoCarga | null; onCerrar: () => void }) {
  const [f, setF] = useState({
    nombre: tipo?.nombre ?? '',
    requiereFrio: tipo?.requiereFrio ?? false,
    esContenedor: tipo?.esContenedor ?? false,
    activo: tipo?.activo ?? true,
    orden: String(tipo?.orden ?? 100),
  });
  const guardar = useGuardarTipoCarga();
  const { error, enviar, campo } = useEnvio();
  const check = (k: 'requiereFrio' | 'esContenedor' | 'activo', texto: string) => (
    <label className="flex items-center gap-2 self-end pb-2 text-sm text-tinta">
      <input type="checkbox" className="accent-marca" checked={f[k]} onChange={(e) => setF((p) => ({ ...p, [k]: e.target.checked }))} /> {texto}
    </label>
  );
  return (
    <Panel
      titulo={tipo ? `Cambiar ${tipo.nombre}` : 'Nuevo tipo de carga'}
      explicacion={tipo && tipo.usos > 0 ? 'Ya se usa: el nombre no se puede cambiar. Si ya no se usa más, desactivalo.' : undefined}
      error={error}
      ocupado={guardar.isPending}
      textoBoton="Guardar"
      onCerrar={onCerrar}
      onConfirmar={() =>
        void enviar(
          guardar.mutateAsync({ id: tipo?.id ?? null, nombre: f.nombre, requiereFrio: f.requiereFrio, esContenedor: f.esContenedor, activo: f.activo, orden: Number(f.orden) || 0 }),
          onCerrar,
        )
      }
    >
      <Campo label="Nombre" error={campo('nombre')}>
        <input className="uppercase" maxLength={30} value={f.nombre} onChange={(e) => setF((p) => ({ ...p, nombre: e.target.value }))} placeholder="GRANEL LÍQUIDO" />
      </Campo>
      <Campo label="Orden en la lista" error={campo('orden')} ayuda="Los más chicos van primero.">
        <input inputMode="numeric" value={f.orden} onChange={(e) => setF((p) => ({ ...p, orden: e.target.value }))} />
      </Campo>
      {check('esContenedor', 'Va en contenedor')}
      {check('requiereFrio', 'Necesita frío (genset)')}
      {tipo && check('activo', 'Activo (se puede elegir)')}
    </Panel>
  );
}

/**
 * El tipo de carga en un formulario: la lista activa (y el valor viejo del registro, si tenía uno).
 * Con una base anterior a la 121 es un texto libre, como antes. Va dentro de <Campo>, que le pasa
 * id, clase y avisos.
 */
export function SelectTipoCarga({
  value,
  onValor,
  vacio = 'Elegí…',
  ...resto
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'value' | 'onChange'> & { value: string; onValor: (v: string) => void; vacio?: string }) {
  const hay = useBaseTiene(VERSION_TIPOS_CARGA);
  const { data } = useTiposCarga(hay);
  if (!hay) {
    const { className, id, disabled } = resto;
    return (
      <input id={id} className={cn('uppercase', className)} disabled={disabled} maxLength={30} value={value} onChange={(e) => onValor(e.target.value)} />
    );
  }
  return (
    <select {...resto} value={value} onChange={(e) => onValor(e.target.value)}>
      <option value="">{vacio}</option>
      {opcionesTipoCarga(data?.tipos, value).map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.etiqueta}
        </option>
      ))}
    </select>
  );
}
