'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Camera, ChevronLeft, ExternalLink, LoaderCircle, Plus, Undo2 } from 'lucide-react';
import { Cargando, Chip, ErrorBase, ErrorLectura, type Tono } from '@/modules/combustible/components/comun/ui';
import { useSesion } from '@/modules/core/session/session-provider';
import type { ErrorAccion } from '@/server/actions/result';
import { cn } from '@/shared/lib/cn';
import { formatearFechaDia, hoyEnZona } from '@/shared/lib/fechas';
import { BOTON_PRIMARIO, BOTON_SECUNDARIO, TARJETA } from '@/shared/ui/clases';
import { Campo } from '@/shared/ui/campo';
import { dinero, ETIQUETA_ESTADO, ETIQUETA_MOVIMIENTO, nombrePeriodo, type EstadoMovimiento, type MiFondo, type Movimiento, type Saldo } from '../domain/chofer.types';
import { useMiFondo, useRetirarGasto, useSubirGasto } from '../queries/hooks';
import { abrirArchivo, borrarArchivo, posicionActual, subirArchivo } from './archivos';
import { AvisoIA } from '@/modules/ia/aviso-ia';
import { useLectorIA } from '@/modules/ia/use-lector-ia';

export const TONO_ESTADO: Record<EstadoMovimiento, Tono> = {
  registrado: 'neutro',
  por_revisar: 'alerta',
  aprobado: 'exito',
  rechazado: 'error',
  anulado: 'neutro',
};

/** Qué significa el saldo, dicho simple. */
export function TextoSaldo({ s }: { s: Saldo }) {
  return (
    <div className="space-y-0.5">
      <p className={cn('text-2xl font-semibold tabular-nums', s.saldo < 0 ? 'text-exito' : 'text-tinta')}>{dinero(Math.abs(s.saldo), s.moneda)}</p>
      <p className="text-xs text-tinta-suave">{s.saldo > 0 ? 'Tenés para rendir (si no se rinde, se descuenta)' : 'Gastaste de más: se te reintegra'}</p>
    </div>
  );
}

/** Mis gastos: el fondo que recibió el chofer, lo que gastó y en qué estado está cada gasto. */
export function MisGastos() {
  const { data, isLoading, isError, refetch } = useMiFondo();
  const [cargar, setCargar] = useState(false);

  if (isLoading) return <Cargando texto="Leyendo tu fondo…" />;
  if (isError || !data) return <ErrorLectura texto="No se pudo leer tu fondo." onReintentar={() => void refetch()} />;

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <Link href="/chofer" className="inline-flex items-center gap-1 text-sm text-marca">
        <ChevronLeft className="size-4" /> Mi carga
      </Link>
      <header>
        <h1 className="text-2xl font-semibold text-tinta">Mis gastos</h1>
        <p className="text-sm text-tinta-suave">
          Período {nombrePeriodo(data.periodo)}: del {formatearFechaDia(data.desde)} al {formatearFechaDia(data.hasta)}
        </p>
      </header>

      <section className={cn(TARJETA, 'space-y-3 p-4')}>
        <h2 className="text-sm font-semibold text-tinta">Mi fondo</h2>
        {data.saldos.filter((s) => s.saldo !== 0).length === 0 ? (
          <p className="text-sm text-tinta-suave">No tenés dinero de la empresa para rendir.</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            {data.saldos
              .filter((s) => s.saldo !== 0)
              .map((s) => (
                <TextoSaldo key={s.moneda} s={s} />
              ))}
          </div>
        )}
        <p className="text-xs text-tinta-suave">
          Lo que te entrega Administración suma; los gastos aprobados y los vueltos que devolvés restan. Un gasto cuenta cuando Administración lo
          aprueba.
        </p>
      </section>

      {cargar ? (
        <NuevoGasto fondo={data} onListo={() => setCargar(false)} onCancelar={() => setCargar(false)} />
      ) : (
        <button type="button" className={`${BOTON_PRIMARIO} h-12 w-full text-base`} onClick={() => setCargar(true)}>
          <Plus className="size-5" /> Cargar un gasto
        </button>
      )}

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-tinta">Últimos movimientos</h2>
        {data.movimientos.length === 0 ? (
          <p className="text-sm text-tinta-suave">Todavía no hay movimientos.</p>
        ) : (
          <ul className="space-y-2">
            {data.movimientos.map((m) => (
              <FilaMovimiento key={m.id} m={m} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function FilaMovimiento({ m }: { m: Movimiento }) {
  const retirar = useRetirarGasto();
  const [error, setError] = useState<ErrorAccion | null>(null);
  const signo = m.efecto > 0 ? '+' : m.efecto < 0 ? '−' : '';
  return (
    <li className={cn(TARJETA, 'space-y-1 p-3 text-sm')}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-tinta">{m.tipo === 'gasto' ? m.categoriaNombre ?? 'Gasto' : ETIQUETA_MOVIMIENTO[m.tipo]}</p>
          <p className="text-xs text-tinta-suave">
            {formatearFechaDia(m.fecha)}
            {m.lugar && ` · ${m.lugar}`}
            {m.operacion && ` · Operación ${m.operacion}`}
          </p>
        </div>
        <div className="text-right">
          <p className="font-semibold tabular-nums text-tinta">
            {signo} {dinero(Math.abs(m.tipo === 'cierre' ? m.importe : m.importe), m.moneda)}
          </p>
          {m.tipo === 'gasto' && <Chip tono={TONO_ESTADO[m.estado]}>{ETIQUETA_ESTADO[m.estado]}</Chip>}
        </div>
      </div>
      {m.detalle && <p className="text-tinta-suave">{m.detalle}</p>}
      {m.motivo && (m.estado === 'rechazado' || m.estado === 'anulado') && <p className="text-error">Motivo: {m.motivo}</p>}
      <div className="flex gap-4">
        {m.comprobante && (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-marca"
            onClick={async () => {
              const e = await abrirArchivo(m.comprobante!);
              setError(e ? { codigo: 'desconocido', mensaje: e } : null);
            }}
          >
            <ExternalLink className="size-4" /> Comprobante
          </button>
        )}
        {m.estado === 'por_revisar' && (
          <button
            type="button"
            className="inline-flex items-center gap-1 text-tinta-suave"
            disabled={retirar.isPending}
            onClick={async () => {
              setError(null);
              const r = await retirar.mutateAsync({ gastoId: m.id });
              if (r.ok) await borrarArchivo(r.data);
              else setError(r.error);
            }}
          >
            <Undo2 className="size-4" /> Retirar (lo cargué mal)
          </button>
        )}
      </div>
      <ErrorBase error={error} />
    </li>
  );
}

function NuevoGasto({ fondo, onListo, onCancelar }: { fondo: MiFondo; onListo: () => void; onCancelar: () => void }) {
  const { zonaHoraria, choferId } = useSesion();
  const subir = useSubirGasto();
  const [v, setV] = useState({ categoria: '', importe: '', moneda: fondo.monedas[0] ?? '', fecha: hoyEnZona(zonaHoraria) as string, lugar: '', detalle: '' });
  const [archivo, setArchivo] = useState<File | null>(null);
  const [error, setError] = useState<ErrorAccion | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const ocupado = subiendo || subir.isPending;
  const campo = (n: string) => error?.campos?.[n];
  // Migración 64: con la IA activada, la foto del comprobante completa los datos (el chofer los revisa)
  const lector = useLectorIA('comprobante_gasto');
  const elegirFoto = async (f: File) => {
    setArchivo(f);
    if (!lector.disponible) return;
    const r = await lector.leer(f);
    if (!r) return;
    const p = r.propuesta;
    setV((x) => ({
      ...x,
      categoria: p.categoria && fondo.categorias.some((c) => c.codigo === p.categoria) ? p.categoria : x.categoria,
      importe: p.importe_total ? String(p.importe_total).replace('.', ',') : x.importe,
      moneda: p.moneda && fondo.monedas.includes(p.moneda) ? p.moneda : x.moneda,
      fecha: p.fecha ?? x.fecha,
      lugar: p.lugar ?? x.lugar,
      detalle: p.detalle ?? x.detalle,
    }));
  };

  const enviar = async () => {
    setError(null);
    setSubiendo(true);
    let ruta: string | null = null;
    try {
      const [subido, donde] = await Promise.all([archivo ? subirArchivo(archivo, `${choferId}/gastos`) : Promise.resolve(null), posicionActual()]);
      ruta = subido?.ruta ?? null;
      setSubiendo(false);
      const r = await subir.mutateAsync({
        categoria: v.categoria,
        importe: v.importe,
        moneda: v.moneda,
        fecha: v.fecha,
        lugar: v.lugar,
        detalle: v.detalle,
        comprobante: subido?.ruta ?? null,
        hash: subido?.hash ?? null,
        nombreArchivo: subido?.nombre ?? null,
        latitud: donde?.latitud ?? null,
        longitud: donde?.longitud ?? null,
      });
      if (!r.ok) {
        await borrarArchivo(ruta);
        setError(r.error);
        return;
      }
      await lector.marcarUsada({ categoria: v.categoria, importe_total: v.importe, moneda: v.moneda, fecha: v.fecha });
      onListo();
    } catch (e) {
      setSubiendo(false);
      await borrarArchivo(ruta);
      setError({ codigo: 'desconocido', mensaje: e instanceof Error ? e.message : 'No se pudo cargar el gasto.' });
    }
  };

  return (
    <section className={cn(TARJETA, 'space-y-3 p-4')}>
      <h2 className="font-semibold text-tinta">Nuevo gasto</h2>
      <label className={`${BOTON_SECUNDARIO} w-full cursor-pointer`}>
        <Camera className="size-5" />
        {archivo ? archivo.name : lector.disponible ? 'Foto del comprobante (la IA completa los datos)' : 'Foto del comprobante'}
        <input
          type="file"
          accept="image/*,application/pdf"
          capture="environment"
          className="sr-only"
          disabled={lector.estado.fase === 'leyendo'}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void elegirFoto(f);
          }}
        />
      </label>
      <AvisoIA estado={lector.estado} />
      <Campo label="¿Qué gasto es?" error={campo('categoria')}>
        <select value={v.categoria} onChange={(e) => setV({ ...v, categoria: e.target.value })}>
          <option value="">Elegí…</option>
          {fondo.categorias.map((c) => (
            <option key={c.codigo} value={c.codigo}>
              {c.nombre}
            </option>
          ))}
        </select>
      </Campo>
      <div className="grid grid-cols-[1fr_7rem] gap-3">
        <Campo label="Importe" error={campo('importe')}>
          <input inputMode="decimal" value={v.importe} onChange={(e) => setV({ ...v, importe: e.target.value })} placeholder="0,00" />
        </Campo>
        <Campo label="Moneda" error={campo('moneda')}>
          <select value={v.moneda} onChange={(e) => setV({ ...v, moneda: e.target.value })}>
            {fondo.monedas.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </Campo>
      </div>
      <Campo label="Fecha del comprobante" error={campo('fecha')}>
        <input type="date" value={v.fecha} onChange={(e) => setV({ ...v, fecha: e.target.value })} />
      </Campo>
      <Campo label="Dónde (opcional)" error={campo('lugar')}>
        <input value={v.lugar} maxLength={120} onChange={(e) => setV({ ...v, lugar: e.target.value })} placeholder="Ej.: peaje Uspallata" />
      </Campo>
      <Campo label="Detalle" error={campo('detalle')} ayuda="Obligatorio si elegís «Otros».">
        <input value={v.detalle} maxLength={500} onChange={(e) => setV({ ...v, detalle: e.target.value })} />
      </Campo>
      <ErrorBase error={error} />
      <div className="flex gap-3">
        <button type="button" className={`${BOTON_PRIMARIO} flex-1`} disabled={ocupado} onClick={() => void enviar()}>
          {ocupado && <LoaderCircle className="size-4 animate-spin" />} Cargar gasto
        </button>
        <button type="button" className={BOTON_SECUNDARIO} disabled={ocupado} onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </section>
  );
}
