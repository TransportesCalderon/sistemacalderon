'use client';

import { useRef, useState } from 'react';
import { LoaderCircle, Unlink, Undo2 } from 'lucide-react';
import { useBasesOperativas } from '@/modules/logistica/queries/hooks';
import type { ErrorAccion } from '@/server/actions/result';
import { cn } from '@/shared/lib/cn';
import { ErrorBase } from '@/shared/ui/errores';
import { CampoGlobo, ENTRADA_GLOBO, Globo } from '@/shared/ui/globo';
import type { FilaPizarra } from '../domain/pizarra.types';
import { useDesengancharSemi, useDeshacerDesenganche } from '../queries/hooks';

export const VERSION_DESENGANCHE = 184;

const BOTON = 'inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs font-semibold whitespace-nowrap disabled:opacity-60';

/**
 * Migración 184 · Desenganche desde la Pizarra: el semi terminó su viaje y sigue enganchado a su
 * tractor; Operaciones registra dónde quedó solo (base o aduana). Si fue un error, se deshace.
 * En viaje no se ofrece: ahí se usa «Relevo» desde la operación (la base lo controla igual).
 */
export function Desenganche({ f }: { f: FilaPizarra }) {
  const ancla = useRef<HTMLButtonElement>(null);
  const [abierto, setAbierto] = useState(false);
  const [lugar, setLugar] = useState('');
  const [error, setError] = useState<ErrorAccion | null>(null);
  const desenganchar = useDesengancharSemi();
  const deshacer = useDeshacerDesenganche();
  const bases = useBasesOperativas(abierto);

  if (f.ubicacionFuente === 'desenganche' && !f.tractor) {
    return (
      <span onClick={(e) => e.stopPropagation()} className="inline-flex flex-col">
        <button
          type="button"
          className="inline-flex items-center gap-1 text-[11px] text-tinta-suave hover:text-marca"
          disabled={deshacer.isPending}
          title="Si el desenganche se cargó por error, el semi vuelve a quedar con su tractor y su chofer"
          onClick={async () => {
            setError(null);
            const r = await deshacer.mutateAsync({ semiId: f.semiId });
            if (!r.ok) setError(r.error);
          }}
        >
          <Undo2 className="size-3" /> Deshacer desenganche
        </button>
        <ErrorBase error={error} />
      </span>
    );
  }
  if (!f.enganchado) return null;

  const enviar = async () => {
    setError(null);
    const r = await desenganchar.mutateAsync({ semiId: f.semiId, lugarId: Number(lugar) });
    if (!r.ok) return setError(r.error);
    setAbierto(false);
    setLugar('');
  };

  return (
    <span onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
      <button ref={ancla} type="button" className={cn(BOTON, 'border border-borde bg-panel text-tinta hover:bg-hover')} onClick={() => setAbierto(true)}>
        <Unlink className="size-3.5" /> Desenganchar
      </button>
      {abierto && (
        <Globo titulo={`Desenganchar ${f.patente} de ${f.tractor ?? 'su tractor'}`} ancla={ancla} onCerrar={() => setAbierto(false)}>
          <div className="space-y-3">
            <CampoGlobo etiqueta="¿Dónde queda el semi?" ayuda="El tractor y el chofer quedan libres; el semi queda solo en ese lugar.">
              <select className={ENTRADA_GLOBO} value={lugar} onChange={(e) => setLugar(e.target.value)}>
                <option value="">Elegí la base o la aduana…</option>
                {(bases.data ?? []).map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.tipo === 'aduana' ? 'Aduana · ' : 'Base · '}
                    {b.nombre}
                  </option>
                ))}
              </select>
            </CampoGlobo>
            <ErrorBase error={error} />
            <button type="button" className={cn(BOTON, 'bg-marca text-white hover:bg-marca/90')} disabled={desenganchar.isPending || !lugar} onClick={() => void enviar()}>
              {desenganchar.isPending && <LoaderCircle className="size-3.5 animate-spin" />}
              Desenganchar
            </button>
          </div>
        </Globo>
      )}
    </span>
  );
}
