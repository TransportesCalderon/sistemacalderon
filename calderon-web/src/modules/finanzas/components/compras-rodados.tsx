'use client';

import { useState } from 'react';
import { Plus, Truck } from 'lucide-react';
import { Panel, TD, TH, useEnvio } from '@/modules/catalogos/components/comun';
import { useProveedores } from '@/modules/catalogos/queries/hooks';
import { Chip, Seccion } from '@/modules/combustible/components/comun/ui';
import { useSesion } from '@/modules/core/session/session-provider';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia, hoyEnZona } from '@/shared/lib/fechas';
import { BOTON_SECUNDARIO } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { aNumero, cuentaCompra } from '../domain/compra-rodado';
import { dinero } from '../domain/finanzas.types';
import { useAnularCompraRodado, useComprasRodados, useRegistrarCompraRodado } from '../queries/compra-rodado.hooks';

interface Form {
  unidad: string;
  descripcion: string;
  fecha: string;
  proveedorId: number | null;
  valorNeto: string;
  conIva: boolean;
  iva: string;
  pie: string;
  piePagadoAntes: boolean;
  documentos: string;
  montoDocumento: string;
  primerVencimiento: string;
  documentosPrevios: string;
  vidaUtilAnios: string;
  valorResidual: string;
  observacion: string;
}
const IVA = 0.19;

/**
 * Finanzas › Gastos fijos · Compra de vehículos con documentos.
 * Se carga la compra una vez; la base da de alta el activo, deja la deuda documentada, separa los intereses y deprecia cada mes.
 */
export function ComprasRodados({ puede }: { puede: boolean }) {
  const { zonaHoraria } = useSesion();
  const { data, isError } = useComprasRodados();
  const { data: proveedores } = useProveedores();
  const registrar = useRegistrarCompraRodado();
  const anular = useAnularCompraRodado();
  const envio = useEnvio();
  const envioAnular = useEnvio();
  const [form, setForm] = useState<Form | null>(null);
  const [anulando, setAnulando] = useState<{ id: number; patente: string; motivo: string } | null>(null);

  // Sin la migración en la base (o sin permiso de lectura) el bloque no aparece
  if (isError || !data) return null;

  const nuevo = (): Form => ({
    unidad: 'otro',
    descripcion: '',
    fecha: hoyEnZona(zonaHoraria) as string,
    proveedorId: null,
    valorNeto: '',
    conIva: false,
    iva: '',
    pie: '',
    piePagadoAntes: false,
    documentos: '',
    montoDocumento: '',
    primerVencimiento: '',
    documentosPrevios: '',
    vidaUtilAnios: '7',
    valorResidual: '',
    observacion: '',
  });
  const numeros = (f: Form) => ({
    valorNeto: aNumero(f.valorNeto),
    iva: f.conIva ? aNumero(f.iva) : 0,
    pie: aNumero(f.pie),
    documentos: Math.round(aNumero(f.documentos)),
    montoDocumento: aNumero(f.montoDocumento),
    vidaUtilMeses: Math.round(aNumero(f.vidaUtilAnios) * 12),
    valorResidual: aNumero(f.valorResidual),
  });
  const cuenta = form ? cuentaCompra(numeros(form)) : null;

  return (
    <Seccion
      titulo="Compra de vehículos con pagarés o documentos"
      acciones={
        puede && !form ? (
          <button type="button" className={BOTON_SECUNDARIO} onClick={() => setForm(nuevo())}>
            <Plus className="size-4" /> Registrar compra
          </button>
        ) : undefined
      }
    >
      <p className="text-sm text-tinta-suave">
        Para camionetas, autos, tractores o semirremolques comprados con pagarés. Cargá la compra una sola vez: el sistema da de alta el vehículo en el
        activo, deja como deuda las cuotas que faltan pagar, separa los intereses y registra la depreciación de cada mes. Las cuotas aparecen arriba, mes a
        mes, para pagarlas.
      </p>

      {form && cuenta && (
        <Panel
          titulo="Registrar la compra de un vehículo"
          explicacion={
            cuenta.aviso ??
            `Con documentos se financian ${dinero(cuenta.financiado)} · interés total ${dinero(cuenta.interes)} · depreciación ${dinero(cuenta.depreciacionMes)} por mes.`
          }
          error={envio.error}
          ocupado={registrar.isPending}
          textoBoton="Registrar compra"
          onCerrar={() => setForm(null)}
          onConfirmar={() => {
            const n = numeros(form);
            const [tipo, idTexto] = form.unidad.split('-');
            const idUnidad = Number(idTexto) || null;
            void envio.enviar(
              registrar.mutateAsync({
                camionId: tipo === 't' ? idUnidad : null,
                semiId: tipo === 's' ? idUnidad : null,
                descripcion: form.unidad === 'otro' ? form.descripcion.trim() || null : null,
                fecha: form.fecha,
                proveedorId: form.proveedorId,
                valorNeto: n.valorNeto,
                iva: n.iva,
                pie: n.pie,
                piePagadoAntes: form.piePagadoAntes,
                documentos: n.documentos,
                montoDocumento: n.montoDocumento,
                primerVencimiento: form.primerVencimiento || null,
                documentosPrevios: Math.round(aNumero(form.documentosPrevios)),
                vidaUtilMeses: n.vidaUtilMeses,
                valorResidual: n.valorResidual,
                observacion: form.observacion.trim() || null,
              }),
              () => setForm(null),
            );
          }}
        >
          <Campo label="Qué se compró">
            <select value={form.unidad} onChange={(e) => setForm({ ...form, unidad: e.target.value })}>
              <option value="otro">Camioneta, auto u otro vehículo</option>
              <optgroup label="Tractores">
                {data.tractores.map((t) => (
                  <option key={t.id} value={`t-${t.id}`}>
                    {t.patente}
                  </option>
                ))}
              </optgroup>
              <optgroup label="Semirremolques">
                {data.semis.map((s) => (
                  <option key={s.id} value={`s-${s.id}`}>
                    {s.patente}
                  </option>
                ))}
              </optgroup>
            </select>
          </Campo>
          {form.unidad === 'otro' && (
            <Campo label="Qué vehículo es" ayuda="Marca, modelo y patente. Así va a figurar en el activo.">
              <input value={form.descripcion} maxLength={80} placeholder="Ej.: Camioneta Hilux ABCD12" onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
            </Campo>
          )}
          <Campo label="Fecha de la compra">
            <input type="date" value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
          </Campo>
          <Campo label="A quién se le compró">
            <select value={form.proveedorId ?? ''} onChange={(e) => setForm({ ...form, proveedorId: e.target.value ? Number(e.target.value) : null })}>
              <option value="">— Ninguno —</option>
              {(proveedores ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.razonSocial}
                </option>
              ))}
            </select>
          </Campo>
          <Campo label="Valor contado, sin IVA (pesos)" ayuda="Lo que vale el vehículo sin los intereses.">
            <input
              inputMode="decimal"
              value={form.valorNeto}
              onChange={(e) => setForm({ ...form, valorNeto: e.target.value, iva: form.conIva ? String(Math.round(aNumero(e.target.value) * IVA)) : form.iva })}
            />
          </Campo>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-marca"
              checked={form.conIva}
              onChange={(e) => setForm({ ...form, conIva: e.target.checked, iva: e.target.checked ? String(Math.round(aNumero(form.valorNeto) * IVA)) : '' })}
            />
            La compra lleva IVA para recuperar
          </label>
          {form.conIva ? (
            <Campo label="IVA" ayuda="Se calcula solo; corregilo si la factura dice otro monto.">
              <input inputMode="decimal" value={form.iva} onChange={(e) => setForm({ ...form, iva: e.target.value })} />
            </Campo>
          ) : (
            <span className="hidden lg:block" />
          )}
          <Campo label="Pie (pago inicial)" ayuda="Vacío si no hubo.">
            <input inputMode="decimal" value={form.pie} onChange={(e) => setForm({ ...form, pie: e.target.value })} />
          </Campo>
          <label className="flex items-center gap-2 self-end pb-2 text-sm">
            <input type="checkbox" className="size-4 accent-marca" checked={form.piePagadoAntes} onChange={(e) => setForm({ ...form, piePagadoAntes: e.target.checked })} />
            El pie ya se pagó antes de cargarla acá
          </label>
          <span className="hidden lg:block" />
          <Campo label="Cantidad de cuotas o pagarés (total)" ayuda="Uno por mes. Vacío si se pagó todo al contado.">
            <input inputMode="numeric" value={form.documentos} onChange={(e) => setForm({ ...form, documentos: e.target.value })} />
          </Campo>
          <Campo label="Monto de cada cuota">
            <input inputMode="decimal" value={form.montoDocumento} onChange={(e) => setForm({ ...form, montoDocumento: e.target.value })} />
          </Campo>
          <Campo label="Vencimiento de la primera cuota" ayuda="La cuota 1, aunque ya esté pagada.">
            <input type="date" value={form.primerVencimiento} onChange={(e) => setForm({ ...form, primerVencimiento: e.target.value })} />
          </Campo>
          <Campo label="Cuotas ya pagadas" ayuda="Las que faltan quedan como deuda; las ya vencidas aparecen como atrasadas.">
            <input inputMode="numeric" value={form.documentosPrevios} onChange={(e) => setForm({ ...form, documentosPrevios: e.target.value })} />
          </Campo>
          <Campo label="Vida útil (años)" ayuda="En cuántos años se deprecia.">
            <input inputMode="decimal" value={form.vidaUtilAnios} onChange={(e) => setForm({ ...form, vidaUtilAnios: e.target.value })} />
          </Campo>
          <Campo label="Valor residual" ayuda="Lo que valdrá al final de la vida útil. Vacío = 0.">
            <input inputMode="decimal" value={form.valorResidual} onChange={(e) => setForm({ ...form, valorResidual: e.target.value })} />
          </Campo>
          <Campo label="Nota">
            <input value={form.observacion} maxLength={500} onChange={(e) => setForm({ ...form, observacion: e.target.value })} />
          </Campo>
        </Panel>
      )}

      {anulando && (
        <Panel
          titulo={`Anular la compra de ${anulando.patente}`}
          explicacion="Se dan de baja el activo, los documentos sin pagar y la depreciación. Si ya hay documentos pagados, primero hay que anular esos pagos."
          error={envioAnular.error}
          ocupado={anular.isPending}
          textoBoton="Anular compra"
          onCerrar={() => setAnulando(null)}
          onConfirmar={() => void envioAnular.enviar(anular.mutateAsync({ id: anulando.id, motivo: anulando.motivo }), () => setAnulando(null))}
        >
          <Campo label="Por qué se anula">
            <input value={anulando.motivo} maxLength={500} onChange={(e) => setAnulando({ ...anulando, motivo: e.target.value })} />
          </Campo>
        </Panel>
      )}

      {data.compras.length === 0 ? (
        <p className="flex items-center gap-2 text-sm text-tinta-suave">
          <Truck className="size-4" /> Todavía no hay compras cargadas.
        </p>
      ) : (
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="border-y border-borde bg-fondo">
              <tr>
                <th className={TH}>Unidad</th>
                <th className={TH}>Compra</th>
                <th className={cn(TH, 'text-right')}>Valor contado</th>
                <th className={cn(TH, 'text-right')}>Depreciado</th>
                <th className={cn(TH, 'text-right')}>Valor hoy</th>
                <th className={TH}>Documentos</th>
                <th className={cn(TH, 'text-right')}>Falta pagar</th>
                <th className={TH} />
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {data.compras.map((c) => (
                <tr key={c.id}>
                  <td className={TD}>
                    <span className={cn('font-medium', c.tipo !== 'otro' && 'font-mono')}>{c.patente}</span>
                    {c.tipo !== 'otro' && <span className="ml-2 text-xs text-tinta-suave">{c.tipo === 'semi' ? 'semirremolque' : 'tractor'}</span>}
                  </td>
                  <td className={TD}>
                    {formatearFechaDia(c.fecha)}
                    {c.proveedor && <span className="block text-xs text-tinta-suave">{c.proveedor}</span>}
                  </td>
                  <td className={cn(TD, 'text-right tabular-nums')}>{dinero(c.valorNeto)}</td>
                  <td className={cn(TD, 'text-right tabular-nums')}>
                    {dinero(c.depreciacionAcumulada)}
                    <span className="block text-xs text-tinta-suave">{dinero(c.depreciacionMes)} por mes</span>
                  </td>
                  <td className={cn(TD, 'text-right font-medium tabular-nums')}>{dinero(c.valorLibro)}</td>
                  <td className={TD}>
                    {c.documentos === 0 ? (
                      'Al contado'
                    ) : (
                      <>
                        {c.documentosPagados} de {c.documentos} pagados
                        <span className="block text-xs text-tinta-suave">
                          {dinero(c.montoDocumento)} cada uno · interés total {dinero(c.interesTotal)}
                        </span>
                      </>
                    )}
                  </td>
                  <td className={cn(TD, 'text-right tabular-nums')}>
                    {dinero(c.faltaPagar)}
                    {c.vencido > 0 && (
                      <span className="block">
                        <Chip tono="alerta">{dinero(c.vencido)} vencido</Chip>
                      </span>
                    )}
                  </td>
                  <td className={cn(TD, 'text-right')}>
                    {puede && !anulando && (
                      <button type="button" className="text-xs text-tinta-suave underline hover:text-error" onClick={() => setAnulando({ id: c.id, patente: c.patente, motivo: '' })}>
                        Anular
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Seccion>
  );
}
