'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { TD, TH } from '@/modules/catalogos/components/comun';
import { Cargando, ErrorLectura } from '@/modules/combustible/components/comun/ui';
import { useSesion } from '@/modules/core/session/session-provider';
import { CuentaDeCliente } from '@/modules/ventas/components/cuenta-corriente';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia, formatearFechaHora } from '@/shared/lib/fechas';
import { formatearNumero } from '@/shared/lib/numeros';
import { RepoError } from '@/shared/repository/types';
import { browserDb } from '@/shared/supabase/browser';
import { TARJETA } from '@/shared/ui/clases';
import { ETIQUETA_ESTADO_SERVICIO, nombreMes, parsearClienteResumen } from '../../domain/cliente-resumen';

export type PestanaCliente = 'Servicios' | 'Ingresos' | 'Rentabilidad mensual' | 'Auditoría';

const NUM = 'text-right font-mono tabular-nums whitespace-nowrap';
const usd = (n: number | null) => (n === null ? '—' : formatearNumero(n, 0));
const aviso = (t: string) => <p className={cn(TARJETA, 'p-5 text-sm text-tinta-suave')}>{t}</p>;

function useClienteResumen(id: number) {
  return useQuery({
    queryKey: ['comercial', 'cliente-resumen', id] as const,
    queryFn: async () => {
      const { data, error } = await browserDb().schema('ops').rpc('fn_ven_cliente_resumen', { p_cliente: id });
      if (error) throw new RepoError(error);
      return parsearClienteResumen(data);
    },
    staleTime: 60_000,
  });
}

/** Las pestañas de la ficha del cliente que no son «Datos». Solo lectura: los números los calcula la base. */
export function ClienteSeccion({ clienteId, pestana }: { clienteId: number; pestana: PestanaCliente }) {
  const { zonaHoraria } = useSesion();
  const { data, isPending, isError, error, refetch } = useClienteResumen(clienteId);
  if (isPending) return <Cargando texto="Leyendo los datos del cliente…" />;
  if (isError || !data) return <ErrorLectura texto="No se pudo leer esta sección del cliente." onReintentar={() => void refetch()} error={error} />;

  if (pestana === 'Ingresos') {
    if (!data.veIngresos) return aviso('La cuenta corriente la ven Ventas, Gerencia, Finanzas o TI.');
    return <CuentaDeCliente clienteId={clienteId} />;
  }

  if (pestana === 'Servicios') {
    if (data.servicios.length === 0) return aviso('Este cliente todavía no tiene operaciones.');
    return (
      <div className={cn(TARJETA, 'overflow-x-auto')}>
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className={TH}>Operación</th>
              <th className={TH}>Fecha</th>
              <th className={TH}>Estado</th>
              <th className={TH}>Línea</th>
              <th className={TH}>Contenedor</th>
              <th className={cn(TH, 'text-right')}>Precio</th>
              <th className={TH}>Factura</th>
            </tr>
          </thead>
          <tbody>
            {data.servicios.map((s) => (
              <tr key={s.servicioId}>
                <td className={TD}>
                  <Link href={`/operacion/operaciones?op=${encodeURIComponent(s.numero)}`} className="font-mono font-semibold text-marca hover:underline">
                    {s.numero}
                  </Link>
                </td>
                <td className={cn(TD, 'whitespace-nowrap')}>{s.fecha ? formatearFechaDia(s.fecha) : '—'}</td>
                <td className={TD}>{ETIQUETA_ESTADO_SERVICIO[s.estado] ?? s.estado}</td>
                <td className={TD}>{s.linea ?? '—'}</td>
                <td className={cn(TD, 'font-mono text-xs')}>{s.contenedor ?? '—'}</td>
                <td className={cn(TD, NUM, s.precio === null && s.estado !== 'cancelado' && 'text-error')}>
                  {s.precio !== null ? `${s.moneda ?? ''} ${formatearNumero(s.precio, 2)}` : 'Sin precio'}
                </td>
                <td className={TD}>{s.factura ?? (s.estado === 'facturado' ? 'Hecha por fuera' : '—')}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data.servicios.length >= 150 && <p className="p-3 text-xs text-tinta-suave">Se muestran las últimas 150 operaciones.</p>}
      </div>
    );
  }

  if (pestana === 'Rentabilidad mensual') {
    if (!data.veRentabilidad) return aviso('La rentabilidad la ven Gerencia, Finanzas o TI.');
    const tot = data.rentabilidad.reduce(
      (t, m) => ({ viajes: t.viajes + m.viajes, ingreso: t.ingreso + (m.ingresoUsd ?? 0), ganancia: t.ganancia + (m.gananciaUsd ?? 0), facturado: t.facturado + (m.facturadoUsd ?? 0), cobrado: t.cobrado + (m.cobradoUsd ?? 0) }),
      { viajes: 0, ingreso: 0, ganancia: 0, facturado: 0, cobrado: 0 },
    );
    return (
      <div className="space-y-2">
        <div className={cn(TARJETA, 'overflow-x-auto')}>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={TH}>Mes</th>
                <th className={cn(TH, 'text-right')}>Viajes</th>
                <th className={cn(TH, 'text-right')}>Ingreso (USD)</th>
                <th className={cn(TH, 'text-right')}>Ganancia estimada</th>
                <th className={cn(TH, 'text-right')}>Margen</th>
                <th className={cn(TH, 'text-right')}>Facturado</th>
                <th className={cn(TH, 'text-right')}>Cobrado</th>
              </tr>
            </thead>
            <tbody>
              {data.rentabilidad.map((m) => (
                <tr key={m.mes}>
                  <td className={cn(TD, 'capitalize')}>{nombreMes(m.mes)}</td>
                  <td className={cn(TD, NUM)}>
                    {m.viajes}
                    {m.viajesSinPrecio > 0 && <span className="ml-1 text-xs text-error">({m.viajesSinPrecio} sin precio)</span>}
                  </td>
                  <td className={cn(TD, NUM)}>{usd(m.ingresoUsd)}</td>
                  <td className={cn(TD, NUM)}>{usd(m.gananciaUsd)}</td>
                  <td className={cn(TD, NUM)}>{m.margenPct === null ? '—' : `${m.margenPct} %`}</td>
                  <td className={cn(TD, NUM)}>{usd(m.facturadoUsd)}</td>
                  <td className={cn(TD, NUM)}>{usd(m.cobradoUsd)}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-borde font-semibold">
                <td className={TD}>Total 12 meses</td>
                <td className={cn(TD, NUM)}>{tot.viajes}</td>
                <td className={cn(TD, NUM)}>{usd(tot.ingreso)}</td>
                <td className={cn(TD, NUM)}>{usd(tot.ganancia)}</td>
                <td className={cn(TD, NUM)}>{tot.ingreso > 0 ? `${Math.round((100 * tot.ganancia) / tot.ingreso)} %` : '—'}</td>
                <td className={cn(TD, NUM)}>{usd(tot.facturado)}</td>
                <td className={cn(TD, NUM)}>{usd(tot.cobrado)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="text-xs text-tinta-suave">
          Ingreso: el precio de las operaciones del mes. Ganancia estimada: ingreso menos gasoil, chofer, fijos por día y neumáticos del tramo cargado; no descuenta
          tramos vacíos, peajes ni gastos generales, así que la real es menor. Las operaciones sin precio no suman.
        </p>
      </div>
    );
  }

  if (!data.veAuditoria) return aviso('La auditoría la ven Gerencia, Finanzas, TI o Auditoría.');
  if (data.auditoria.length === 0) return aviso('No hay cambios registrados en la ficha de este cliente.');
  return (
    <div className={cn(TARJETA, 'overflow-x-auto')}>
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className={TH}>Cuándo</th>
            <th className={TH}>Quién</th>
            <th className={TH}>Qué</th>
            <th className={TH}>Datos que cambiaron</th>
            <th className={TH}>Motivo</th>
          </tr>
        </thead>
        <tbody>
          {data.auditoria.map((c, i) => (
            <tr key={i}>
              <td className={cn(TD, 'whitespace-nowrap')}>{formatearFechaHora(c.cuando, zonaHoraria)}</td>
              <td className={TD}>{c.quien ?? 'Sistema'}</td>
              <td className={TD}>
                {c.que} · {c.donde}
              </td>
              <td className={cn(TD, 'text-tinta-suave')}>{c.datos ?? '—'}</td>
              <td className={cn(TD, 'text-tinta-suave')}>{c.motivo ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
