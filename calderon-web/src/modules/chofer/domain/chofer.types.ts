import type { Json } from '@/shared/types/database.generated';
import { parsearRutaChofer, type RutaChofer } from '@/modules/logistica/domain/rutas';

/**
 * Módulo del chofer (migraciones 60 y 61). La base arma todo; acá solo se lee el JSON
 * y se le da forma para mostrar. Ninguna regla de negocio se repite en la pantalla.
 */

/** Bucket privado: el chofer sube a la carpeta con su número de chofer. */
export const BUCKET_OPERACION = 'documentos-operacion';

export const TIPOS_DOCUMENTO_OPERACION = ['mic', 'crt', 'foto_contenedor', 'foto_precinto', 'remito', 'guia', 'factura', 'otro'] as const;
export type TipoDocumentoOperacion = (typeof TIPOS_DOCUMENTO_OPERACION)[number];
export const ETIQUETA_DOCUMENTO: Record<TipoDocumentoOperacion, string> = {
  mic: 'MIC',
  crt: 'CRT',
  foto_contenedor: 'Foto del contenedor',
  foto_precinto: 'Foto del precinto',
  remito: 'Remito',
  guia: 'Guía',
  factura: 'Factura',
  otro: 'Otro',
};

type Obj = Record<string, unknown>;
const o = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const s = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const n = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));

export interface Lugar {
  nombre: string;
  tipo: string | null;
  pais: string | null;
  latitud: number | null;
  longitud: number | null;
}
const lugar = (v: unknown): Lugar | null => {
  const x = o(v);
  return s(x.nombre) ? { nombre: s(x.nombre)!, tipo: s(x.tipo), pais: s(x.pais), latitud: n(x.latitud), longitud: n(x.longitud) } : null;
};

export interface DocumentoOperacion {
  id: number;
  tipo: TipoDocumentoOperacion;
  archivo: string;
  nombreArchivo: string | null;
  nota: string | null;
  subidoEn: string;
  porChofer: boolean;
  subidoPor: string | null;
}
export const parsearDocumentos = (v: Json | unknown): DocumentoOperacion[] =>
  arr(v).map((d) => {
    const x = o(d);
    return {
      id: Number(x.id),
      tipo: (s(x.tipo) ?? 'otro') as TipoDocumentoOperacion,
      archivo: s(x.archivo) ?? '',
      nombreArchivo: s(x.nombre_archivo),
      nota: s(x.nota),
      subidoEn: s(x.subido_en) ?? '',
      porChofer: x.por_chofer === true,
      subidoPor: s(x.subido_por),
    };
  });

export interface CargaAsignada {
  servicioId: number;
  numero: number;
  tipo: string | null;
  estado: string | null;
  paso: string | null;
  cliente: string | null;
  retiro: Lugar | null;
  carga: Lugar | null;
  aduana: Lugar | null;
  entrega: Lugar | null;
  presentacion: string | null;
  entregaPactada: string | null;
  producto: string | null;
  pesoKg: number | null;
  tipoContenedor: string | null;
  contenedor: string | null;
  precinto: string | null;
  booking: string | null;
  mic: string | null;
  crt: string | null;
  tractor: string | null;
  semi: string | null;
  observacion: string | null;
  documentos: DocumentoOperacion[];
  /** Migración 135: la ruta para Google Maps (la elegida o la predeterminada de su línea). */
  ruta: RutaChofer | null;
}

export interface MisCargas {
  chofer: string | null;
  cargas: CargaAsignada[];
  compartirUbicacion: boolean;
  intervaloS: number;
}

export const parsearMisCargas = (v: Json | unknown): MisCargas => {
  const x = o(v);
  return {
    chofer: s(x.chofer),
    compartirUbicacion: x.compartir_ubicacion === true,
    intervaloS: Math.max(20, n(x.intervalo_s) ?? 60),
    cargas: arr(x.cargas).map((c) => {
      const y = o(c);
      return {
        servicioId: Number(y.servicio_id),
        numero: Number(y.numero),
        tipo: s(y.tipo),
        estado: s(y.estado),
        paso: s(y.paso),
        cliente: s(y.cliente),
        retiro: lugar(y.retiro),
        carga: lugar(y.carga),
        aduana: lugar(y.aduana),
        entrega: lugar(y.entrega),
        presentacion: s(y.presentacion),
        entregaPactada: s(y.entrega_pactada),
        producto: s(y.producto),
        pesoKg: n(y.peso_kg),
        tipoContenedor: s(y.tipo_contenedor),
        contenedor: s(y.contenedor),
        precinto: s(y.precinto),
        booking: s(y.booking),
        mic: s(y.mic),
        crt: s(y.crt),
        tractor: s(y.tractor),
        semi: s(y.semi),
        observacion: s(y.observacion),
        documentos: parsearDocumentos(y.documentos),
        ruta: parsearRutaChofer(y.ruta),
      };
    }),
  };
};

export interface Posicion {
  fuente: 'telemetria' | 'celular';
  ts: string;
  latitud: number;
  longitud: number;
  velocidadKmh: number | null;
  precisionM: number | null;
}
const posicion = (v: unknown): Posicion | null => {
  const x = o(v);
  if (n(x.latitud) === null || n(x.longitud) === null || !s(x.ts)) return null;
  return {
    fuente: x.fuente === 'telemetria' ? 'telemetria' : 'celular',
    ts: s(x.ts)!,
    latitud: n(x.latitud)!,
    longitud: n(x.longitud)!,
    velocidadKmh: n(x.velocidad_kmh),
    precisionM: n(x.precision_m),
  };
};

export interface Seguimiento {
  telemetria: Posicion | null;
  celular: Posicion | null;
  ultima: Posicion | null;
  recorrido: [number, number, string][];
}
export const parsearSeguimiento = (v: Json | unknown): Seguimiento => {
  const x = o(v);
  return {
    telemetria: posicion(x.telemetria),
    celular: posicion(x.celular),
    ultima: posicion(x.ultima),
    recorrido: arr(x.recorrido_celular).map((p) => {
      const a = arr(p);
      return [Number(a[0]), Number(a[1]), String(a[2])] as [number, number, string];
    }),
  };
};

/** Enlace para abrir un punto en Google Maps (el celular abre la aplicación). */
export const enlaceMapa = (lat: number, lon: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lon}`;

/* ----------------------------------------------------------------------------
 * Fondo fijo y gastos (migración 61)
 * ------------------------------------------------------------------------- */
export type TipoMovimiento = 'entrega' | 'devolucion' | 'gasto' | 'cierre';
export type EstadoMovimiento = 'registrado' | 'por_revisar' | 'aprobado' | 'rechazado' | 'anulado';

export const ETIQUETA_MOVIMIENTO: Record<TipoMovimiento, string> = {
  entrega: 'Entrega de dinero',
  devolucion: 'Devolución de vuelto',
  gasto: 'Gasto',
  cierre: 'Cierre del período',
};
export const ETIQUETA_ESTADO: Record<EstadoMovimiento, string> = {
  registrado: 'Registrado',
  por_revisar: 'Por revisar',
  aprobado: 'Aprobado',
  rechazado: 'Rechazado',
  anulado: 'Anulado',
};

export interface Saldo {
  moneda: string;
  saldo: number;
}
export const parsearSaldos = (v: unknown): Saldo[] => arr(v).map((x) => ({ moneda: s(o(x).moneda) ?? '', saldo: n(o(x).saldo) ?? 0 }));

export interface Movimiento {
  id: number;
  numero: string;
  tipo: TipoMovimiento;
  fecha: string;
  periodo: string;
  moneda: string;
  importe: number;
  efecto: number;
  estado: EstadoMovimiento;
  categoria: string | null;
  categoriaNombre: string | null;
  detalle: string | null;
  lugar: string | null;
  comprobante: string | null;
  motivo: string | null;
  porChofer: boolean;
  operacion: number | null;
  viaje: string | null;
  tractor: string | null;
  revisadoPor: string | null;
}
export const parsearMovimientos = (v: unknown): Movimiento[] =>
  arr(v).map((m) => {
    const x = o(m);
    return {
      id: Number(x.id),
      numero: s(x.numero) ?? '',
      tipo: (s(x.tipo) ?? 'gasto') as TipoMovimiento,
      fecha: s(x.fecha) ?? '',
      periodo: s(x.periodo) ?? '',
      moneda: s(x.moneda) ?? '',
      importe: n(x.importe) ?? 0,
      efecto: n(x.efecto) ?? 0,
      estado: (s(x.estado) ?? 'registrado') as EstadoMovimiento,
      categoria: s(x.categoria),
      categoriaNombre: s(x.categoria_nombre),
      detalle: s(x.detalle),
      lugar: s(x.lugar),
      comprobante: s(x.comprobante),
      motivo: s(x.motivo),
      porChofer: x.por_chofer === true,
      operacion: n(x.operacion),
      viaje: s(x.viaje),
      tractor: s(x.tractor),
      revisadoPor: s(x.revisado_por),
    };
  });

export interface MiFondo {
  chofer: string | null;
  choferId: number;
  periodo: string;
  desde: string;
  hasta: string;
  saldos: Saldo[];
  movimientos: Movimiento[];
  categorias: { codigo: string; nombre: string }[];
  monedas: string[];
}
export const parsearMiFondo = (v: Json | unknown): MiFondo => {
  const x = o(v);
  return {
    chofer: s(x.chofer),
    choferId: Number(x.chofer_id),
    periodo: s(x.periodo) ?? '',
    desde: s(x.desde) ?? '',
    hasta: s(x.hasta) ?? '',
    saldos: parsearSaldos(x.saldos),
    movimientos: parsearMovimientos(x.movimientos),
    categorias: arr(x.categorias).map((c) => ({ codigo: s(o(c).codigo) ?? '', nombre: s(o(c).nombre) ?? '' })),
    monedas: arr(x.monedas).map(String),
  };
};

export interface FondoDeChofer {
  choferId: number;
  chofer: string;
  legajo: string | null;
  saldos: Saldo[];
  porRevisar: number;
  ultimoMovimiento: string | null;
  ultimoCierre: string | null;
}

export interface GastoPorRevisar {
  id: number;
  numero: string;
  choferId: number;
  chofer: string;
  fecha: string;
  moneda: string;
  importe: number;
  categoria: string;
  detalle: string | null;
  lugar: string | null;
  comprobante: string | null;
  operacion: number | null;
  tractor: string | null;
  repetido: boolean;
}
export const parsearGastosPorRevisar = (v: Json | unknown): GastoPorRevisar[] =>
  arr(v).map((g) => {
    const x = o(g);
    return {
      id: Number(x.id),
      numero: s(x.numero) ?? '',
      choferId: Number(x.chofer_id),
      chofer: s(x.chofer) ?? '',
      fecha: s(x.fecha) ?? '',
      moneda: s(x.moneda) ?? '',
      importe: n(x.importe) ?? 0,
      categoria: s(x.categoria) ?? '',
      detalle: s(x.detalle),
      lugar: s(x.lugar),
      comprobante: s(x.comprobante),
      operacion: n(x.operacion),
      tractor: s(x.tractor),
      repetido: x.repetido === true,
    };
  });

export interface CuentaChofer {
  choferId: number;
  chofer: string;
  saldos: Saldo[];
  ultimoCierre: string | null;
  movimientos: Movimiento[];
}
export const parsearCuenta = (v: Json | unknown): CuentaChofer => {
  const x = o(v);
  return {
    choferId: Number(x.chofer_id),
    chofer: s(x.chofer) ?? '',
    saldos: parsearSaldos(x.saldos),
    ultimoCierre: s(x.ultimo_cierre),
    movimientos: parsearMovimientos(x.movimientos),
  };
};

export interface FilaResumen {
  choferId: number;
  chofer: string;
  legajo: string | null;
  viajes: number;
  viajesNumeros: string | null;
  kmLinea: number | null;
  combustibleL: number | null;
  combustibleImporte: number | null;
  combustibleSinPrecio: boolean;
  combustibleCierres: string | null;
  ralentiL: number | null;
  ralentiImporte: number | null;
  ralentiCierres: string | null;
  fondo: { moneda: string; saldo: number; saldoBase: number | null }[];
  fondoBase: number | null;
  fondoCerrado: boolean;
  fondoSinCotizacion: boolean;
  gastosPorRevisar: number;
  aDescontar: number;
}
export interface ResumenLiquidacion {
  periodo: string;
  desde: string;
  hasta: string;
  monedaBase: string;
  choferes: FilaResumen[];
}
export const parsearResumen = (v: Json | unknown): ResumenLiquidacion => {
  const x = o(v);
  return {
    periodo: s(x.periodo) ?? '',
    desde: s(x.desde) ?? '',
    hasta: s(x.hasta) ?? '',
    monedaBase: s(x.moneda_base) ?? '',
    choferes: arr(x.choferes).map((c) => {
      const y = o(c);
      return {
        choferId: Number(y.chofer_id),
        chofer: s(y.chofer) ?? '',
        legajo: s(y.legajo),
        viajes: n(y.viajes) ?? 0,
        viajesNumeros: s(y.viajes_numeros),
        kmLinea: n(y.km_linea),
        combustibleL: n(y.combustible_l),
        combustibleImporte: n(y.combustible_importe),
        combustibleSinPrecio: y.combustible_sin_precio === true,
        combustibleCierres: s(y.combustible_cierres),
        ralentiL: n(y.ralenti_l),
        ralentiImporte: n(y.ralenti_importe),
        ralentiCierres: s(y.ralenti_cierres),
        fondo: arr(y.fondo).map((f) => ({ moneda: s(o(f).moneda) ?? '', saldo: n(o(f).saldo) ?? 0, saldoBase: n(o(f).saldo_base) })),
        fondoBase: n(y.fondo_base),
        fondoCerrado: y.fondo_cerrado === true,
        fondoSinCotizacion: y.fondo_sin_cotizacion === true,
        gastosPorRevisar: n(y.gastos_por_revisar) ?? 0,
        aDescontar: n(y.a_descontar) ?? 0,
      };
    }),
  };
};

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** «2026-10-01» → «octubre 2026». */
export const nombrePeriodo = (periodo: string) => {
  const [a, m] = periodo.split('-').map(Number);
  if (!a || !m || m < 1 || m > 12) return periodo;
  return `${MESES[m - 1]} ${a}`;
};

export const dinero = (v: number | null | undefined, moneda?: string) =>
  v === null || v === undefined ? '—' : `${moneda ? `${moneda} ` : ''}${v.toLocaleString('es-AR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
