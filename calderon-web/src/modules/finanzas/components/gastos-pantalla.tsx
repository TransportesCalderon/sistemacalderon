'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Plus, Receipt, Repeat } from 'lucide-react';
import { TD, TH } from '@/modules/catalogos/components/comun';
import { Cargando, Encabezado, ErrorLectura, Seccion, Vacio } from '@/modules/combustible/components/comun/ui';
import { useCan } from '@/modules/core/permissions/can';
import { cn } from '@/shared/lib/cn';
import { BOTON_PRIMARIO, CONTROL_FILTRO } from '@/shared/ui/clases';
import { Pestanas } from '@/shared/ui/pestanas';
import { PESTANAS_GASTOS } from '@/shared/ui/pestanas-secciones';
import { dinero, etiquetaDocumento } from '../domain/finanzas.types';
import { useGastos, usePlanCuentas } from '../queries/hooks';
import { ChipSituacion, fecha } from './comun';

/** Finanzas › Gastos: facturas de proveedores, boletas y gastos sin documento. */
export function GastosPantalla() {
  const puede = useCan('finanzas.gastos:editar');
  const [estado, setEstado] = useState<string>('pendiente');
  const [texto, setTexto] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  const [cuentaId, setCuentaId] = useState<number | null>(null);
  const { data: plan } = usePlanCuentas();
  const { data, isLoading, isError, error, refetch, isFetching } = useGastos({
    estado: estado || null,
    texto: texto.trim() || null,
    desde: desde || null,
    hasta: hasta || null,
    cuentaId,
  });
  const totalClp = (data ?? []).filter((g) => g.situacion !== 'anulado').reduce((s, g) => s + g.totalClp, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Encabezado titulo="Gastos" subtitulo="Finanzas" />
        {puede && (
          <Link href="/finanzas/gastos/nuevo" className={BOTON_PRIMARIO}>
            <Plus className="size-4" /> Nuevo gasto
          </Link>
        )}
      </div>
      <Pestanas items={PESTANAS_GASTOS} />

      <div className="flex flex-wrap items-end gap-2">
        <select className={CONTROL_FILTRO} value={estado} onChange={(e) => setEstado(e.target.value)} aria-label="Estado">
          <option value="pendiente">Por pagar</option>
          <option value="pagado">Pagados</option>
          <option value="anulado">Anulados</option>
          <option value="">Todos</option>
        </select>
        <input className={cn(CONTROL_FILTRO, 'w-56')} placeholder="Buscar proveedor, detalle o número" value={texto} onChange={(e) => setTexto(e.target.value)} aria-label="Buscar" />
        <label className="flex items-center gap-1 text-sm text-tinta-suave">
          Desde <input type="date" className={CONTROL_FILTRO} value={desde} onChange={(e) => setDesde(e.target.value)} />
        </label>
        <label className="flex items-center gap-1 text-sm text-tinta-suave">
          Hasta <input type="date" className={CONTROL_FILTRO} value={hasta} onChange={(e) => setHasta(e.target.value)} />
        </label>
        <select
          className={cn(CONTROL_FILTRO, 'max-w-64')}
          value={cuentaId ?? ''}
          onChange={(e) => setCuentaId(e.target.value ? Number(e.target.value) : null)}
          aria-label="Categoría"
        >
          <option value="">Todas las categorías</option>
          {(plan ?? [])
            .filter((c) => c.imputable && (c.tipo === 'costo' || c.tipo === 'gasto'))
            .map((c) => (
              <option key={c.id} value={c.id}>
                {c.codigo} · {c.nombre}
              </option>
            ))}
        </select>
      </div>

      {isLoading ? (
        <Cargando texto="Buscando gastos…" />
      ) : isError || !data ? (
        <ErrorLectura texto="No se pudieron leer los gastos." onReintentar={() => void refetch()} error={error} />
      ) : data.length === 0 ? (
        <Vacio icono={<Receipt className="size-6" />} texto="No hay gastos con ese filtro.">
          {puede && (
            <Link href="/finanzas/gastos-fijos" className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-marca underline">
              <Repeat className="size-4" /> Cargar los gastos que se repiten todos los meses
            </Link>
          )}
        </Vacio>
      ) : (
        <Seccion titulo={`${data.length} gastos · ${dinero(totalClp)}`}>
          <div className={cn('overflow-x-auto', isFetching && 'opacity-70')}>
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-y border-borde bg-fondo">
                <tr>
                  <th className={TH}>Fecha</th>
                  <th className={TH}>Proveedor y detalle</th>
                  <th className={TH}>Documento</th>
                  <th className={TH}>Categoría</th>
                  <th className={cn(TH, 'text-right')}>Total</th>
                  <th className={cn(TH, 'text-right')}>Falta pagar</th>
                  <th className={TH}>Vence</th>
                  <th className={TH}>Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {data.map((g) => (
                  <tr key={g.id} className="hover:bg-hover">
                    <td className={cn(TD, 'tabular-nums')}>
                      <Link href={`/finanzas/gastos/${g.id}`} className="font-medium text-marca hover:underline">
                        {fecha(g.fecha)}
                      </Link>
                      <span className="block text-xs text-tinta-suave">{g.numero}</span>
                    </td>
                    <td className={TD}>
                      <span className="text-tinta">{g.proveedor ?? '—'}</span>
                      <span className="block text-xs text-tinta-suave">
                        {g.descripcion}
                        {g.camion && ` · ${g.camion}`}
                        {g.fijo && ' · fijo'}
                      </span>
                    </td>
                    <td className={cn(TD, 'text-xs')}>
                      {etiquetaDocumento(g.tipoDocumento)}
                      {g.numeroDocumento && <span className="block text-tinta-suave">N° {g.numeroDocumento}</span>}
                    </td>
                    <td className={cn(TD, 'text-xs text-tinta-suave')}>{g.cuenta}</td>
                    <td className={cn(TD, 'text-right tabular-nums')}>
                      {dinero(g.total, g.moneda)}
                      {g.moneda !== 'CLP' && <span className="block text-xs text-tinta-suave">{dinero(g.totalClp)}</span>}
                    </td>
                    <td className={cn(TD, 'text-right font-medium tabular-nums')}>{g.saldo > 0 ? dinero(g.saldo, g.moneda) : '—'}</td>
                    <td className={cn(TD, 'tabular-nums', g.situacion === 'vencido' && 'text-error')}>{fecha(g.vence)}</td>
                    <td className={TD}>
                      <ChipSituacion s={g.situacion} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Seccion>
      )}
    </div>
  );
}
