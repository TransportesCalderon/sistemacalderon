'use client';

import { useState } from 'react';
import { Pencil, SlidersHorizontal } from 'lucide-react';
import { useCan } from '@/modules/core/permissions/can';
import { useSesion } from '@/modules/core/session/session-provider';
import { CLASE_TEXTAREA, Cargando, Chip, Encabezado, ErrorLectura, Vacio } from '@/modules/combustible/components/comun/ui';
import { cn } from '@/shared/lib/cn';
import { formatearFechaHora } from '@/shared/lib/fechas';
import { TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { normalizarDecimal } from '../domain/catalogos.schemas';
import type { Parametro } from '../domain/catalogos.types';
import { useGuardarParametro, useParametros } from '../queries/hooks';
import { Panel, useEnvio } from './comun';

/** Cómo se muestra un valor guardado (sin interpretarlo). */
function mostrar(v: unknown): string {
  if (typeof v === 'boolean') return v ? 'Sí' : 'No';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

/**
 * Configuración > Parámetros. Cada cambio queda en la auditoría. Los cierres aprobados conservan
 * la tolerancia que usaron: cambiar el parámetro solo afecta lo que se apruebe después.
 */
export function ParametrosPantalla() {
  const puede = useCan('configuracion.catalogos:editar');
  const { zonaHoraria } = useSesion();
  const { data, isPending, isError, refetch } = useParametros();
  const [verObsoletos, setVerObsoletos] = useState(false);
  const [editando, setEditando] = useState<string | null>(null);
  const filas = (data ?? []).filter((p) => verObsoletos || !p.obsoleto);

  return (
    <div className="space-y-5">
      <Encabezado titulo="Parámetros" subtitulo="Catálogos" />
      <p className="max-w-3xl text-sm text-tinta-suave">
        La empresa puede modificar los parámetros. Cada cambio queda registrado en la auditoría, y los cierres ya aprobados guardan la
        tolerancia que usaron. Los marcados <Chip tono="alerta">Provisional</Chip> esperan la confirmación de Operaciones.
      </p>
      <label className="flex items-center gap-2 text-sm text-tinta-suave">
        <input type="checkbox" className="accent-marca" checked={verObsoletos} onChange={(e) => setVerObsoletos(e.target.checked)} /> Mostrar también los
        obsoletos
      </label>

      <div className={cn(TARJETA, 'divide-y divide-borde')}>
        {isPending ? (
          <Cargando texto="Cargando parámetros…" />
        ) : isError ? (
          <ErrorLectura texto="No se pudieron cargar los parámetros." onReintentar={() => refetch()} />
        ) : filas.length === 0 ? (
          <Vacio icono={<SlidersHorizontal className="size-5" />} texto="No hay parámetros." />
        ) : (
          filas.map((p) => (
            <div key={p.codigo} className="space-y-2 p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm text-tinta">{p.codigo}</span>
                    {p.provisional && <Chip tono="alerta">Provisional</Chip>}
                    {p.obsoleto && <Chip tono="neutro">Obsoleto</Chip>}
                  </p>
                  <p className="text-sm text-tinta-suave">{p.descripcion}</p>
                  <p className="text-xs text-tinta-suave">Modificado {formatearFechaHora(p.actualizadoEn, zonaHoraria)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="rounded-md bg-hover px-2.5 py-1 font-mono text-sm font-semibold text-tinta">{mostrar(p.valor)}</span>
                  {puede && !p.obsoleto && (
                    <button type="button" className="inline-flex items-center gap-1 text-xs text-marca hover:underline" onClick={() => setEditando(editando === p.codigo ? null : p.codigo)}>
                      <Pencil className="size-3.5" /> Cambiar
                    </button>
                  )}
                </div>
              </div>
              {editando === p.codigo && <EditarParametro p={p} onCerrar={() => setEditando(null)} />}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function EditarParametro({ p, onCerrar }: { p: Parametro; onCerrar: () => void }) {
  const guardar = useGuardarParametro();
  const { error, enviar, campo, setError } = useEnvio();
  const [texto, setTexto] = useState(p.tipoValor === 'string' ? String(p.valor) : p.tipoValor === 'number' ? String(p.valor).replace('.', ',') : JSON.stringify(p.valor));
  const [booleano, setBooleano] = useState(p.valor === true);
  const [descripcion, setDescripcion] = useState(p.descripcion);

  /** Texto del formulario → valor JSON del mismo tipo que el guardado (la base lo vuelve a controlar). */
  const valor = (): { ok: true; v: unknown } | { ok: false } => {
    if (p.tipoValor === 'boolean') return { ok: true, v: booleano };
    if (p.tipoValor === 'string') return { ok: true, v: texto };
    if (p.tipoValor === 'number') {
      const n = Number(normalizarDecimal(texto));
      return texto.trim() !== '' && Number.isFinite(n) ? { ok: true, v: n } : { ok: false };
    }
    try {
      return { ok: true, v: JSON.parse(texto) };
    } catch {
      return { ok: false };
    }
  };

  return (
    <Panel
      titulo={`Cambiar ${p.codigo}`}
      error={error}
      ocupado={guardar.isPending}
      textoBoton="Guardar"
      onCerrar={onCerrar}
      onConfirmar={() => {
        const r = valor();
        if (!r.ok) {
          setError({ codigo: 'validacion', mensaje: 'Revisá el valor: no se entiende como ' + (p.tipoValor === 'number' ? 'número.' : 'lista JSON.') });
          return;
        }
        void enviar(guardar.mutateAsync({ codigo: p.codigo, versionFila: p.versionFila, valor: r.v, descripcion }), onCerrar);
      }}
    >
      {p.tipoValor === 'boolean' ? (
        <Campo label="Valor *">
          <select value={booleano ? 'si' : 'no'} onChange={(e) => setBooleano(e.target.value === 'si')}>
            <option value="si">Sí</option>
            <option value="no">No</option>
          </select>
        </Campo>
      ) : (
        <Campo label="Valor *" error={campo('valor')} ayuda={p.tipoValor === 'number' ? 'Número; admite coma decimal.' : p.tipoValor === 'string' ? undefined : 'Lista en formato JSON, por ejemplo ["ti"].'}>
          <input inputMode={p.tipoValor === 'number' ? 'decimal' : undefined} className="font-mono" value={texto} onChange={(e) => setTexto(e.target.value)} />
        </Campo>
      )}
      <div className="sm:col-span-2">
        <label className="block space-y-1.5">
          <span className="block text-sm font-medium text-tinta">Descripción *</span>
          <textarea rows={3} className={CLASE_TEXTAREA} value={descripcion} onChange={(e) => setDescripcion(e.target.value)} />
          <span className="block text-xs text-tinta-suave">Al confirmarlo con Operaciones, quitá «PROVISIONAL» de la descripción.</span>
        </label>
      </div>
    </Panel>
  );
}
