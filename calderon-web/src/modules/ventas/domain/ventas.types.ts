import type { Json } from '@/shared/types/database.generated';

/**
 * Ventas (migración 67): seguimiento de clientes, tarifario, cotizaciones y facturación.
 * La base hace todas las cuentas (costos, márgenes, totales, estados); acá solo se lee.
 */
type Obj = Record<string, unknown>;
const o = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Obj) : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const s = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const n = (v: unknown): number | null => (v === null || v === undefined || v === '' ? null : Number(v));
const n0 = (v: unknown): number => n(v) ?? 0;

export type Etapa = 'nuevo' | 'contactado' | 'cotizado' | 'negociacion' | 'ganado' | 'perdido';
export const ETAPAS: readonly Etapa[] = ['nuevo', 'contactado', 'cotizado', 'negociacion', 'ganado', 'perdido'];
export const ETIQUETA_ETAPA: Record<Etapa, string> = {
  nuevo: 'Nuevo',
  contactado: 'Contactado',
  cotizado: 'Cotizado',
  negociacion: 'Negociación',
  ganado: 'Ganado',
  perdido: 'Perdido',
};
export type TipoActividad = 'llamada' | 'reunion' | 'email' | 'visita' | 'tarea';
export const ETIQUETA_ACTIVIDAD: Record<TipoActividad, string> = {
  llamada: 'Llamada',
  reunion: 'Reunión',
  email: 'Email',
  visita: 'Visita',
  tarea: 'Tarea',
};
export type EstadoCotizacion = 'borrador' | 'enviada' | 'vencida' | 'aceptada' | 'rechazada' | 'anulada';
export const ETIQUETA_ESTADO_COT: Record<EstadoCotizacion, string> = {
  borrador: 'Borrador',
  enviada: 'Enviada',
  vencida: 'Vencida',
  aceptada: 'Aceptada',
  rechazada: 'Rechazada',
  anulada: 'Anulada',
};
export type EstadoFactura = 'borrador' | 'emitida' | 'vencida' | 'cobrada' | 'anulada';
export const ETIQUETA_ESTADO_FAC: Record<EstadoFactura, string> = {
  borrador: 'Prefactura',
  emitida: 'Emitida',
  vencida: 'Vencida',
  cobrada: 'Cobrada',
  anulada: 'Anulada',
};
export type UnidadFlete = 'viaje' | 'tonelada' | 'kilo';
export const ETIQUETA_UNIDAD: Record<string, string> = {
  viaje: 'por viaje',
  tonelada: 'por tonelada',
  kilo: 'por kilo',
  fijo: 'fijo',
  por_dia: 'por día',
  por_hora: 'por hora',
  porcentaje: '% del flete',
};
export const ORIGENES = ['referido', 'web', 'llamada', 'visita', 'feria', 'cliente_existente', 'otro'] as const;
export const ETIQUETA_ORIGEN: Record<string, string> = {
  referido: 'Referido',
  web: 'Web',
  llamada: 'Llamada',
  visita: 'Visita',
  feria: 'Feria',
  cliente_existente: 'Ya era cliente',
  otro: 'Otro',
};

/** USD con separador de miles y sin decimales si no hacen falta: «USD 1.836» */
export const usd = (v: number | null | undefined, conMoneda = true) =>
  v === null || v === undefined
    ? '—'
    : `${conMoneda ? 'USD ' : ''}${v.toLocaleString('es-AR', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

// ---------------------------------------------------------------------------
// Tablero
// ---------------------------------------------------------------------------
export interface NegocioTablero {
  id: number;
  titulo: string;
  etapa: Etapa;
  empresa: string;
  empresaId: number;
  valorMensualUsd: number | null;
  cierreEstimado: string | null;
  responsable: string | null;
}
export interface ActividadTablero {
  id: number;
  tipo: TipoActividad;
  titulo: string;
  fecha: string;
  empresa: string;
  empresaId: number;
  responsable: string | null;
  mia: boolean;
  atrasada: boolean;
}
export interface Tablero {
  negocios: NegocioTablero[];
  actividades: ActividadTablero[];
  cotizacionesMes: { hechas: number; aceptadas: number; rechazadas: number; aceptadoUsd: number };
  porResponder: number;
  facturadoMesUsd: number;
  porCobrarUsd: number;
  vencidoUsd: number;
  porFacturar: number;
}
export const parsearTablero = (v: Json | unknown): Tablero => {
  const x = o(v);
  const c = o(x.cotizaciones_mes);
  return {
    negocios: arr(x.negocios).map((a) => {
      const y = o(a);
      return {
        id: Number(y.id),
        titulo: s(y.titulo) ?? '',
        etapa: (s(y.etapa) ?? 'nuevo') as Etapa,
        empresa: s(y.empresa) ?? '',
        empresaId: Number(y.empresa_id),
        valorMensualUsd: n(y.valor_mensual_usd),
        cierreEstimado: s(y.cierre_estimado),
        responsable: s(y.responsable),
      };
    }),
    actividades: arr(x.actividades).map(parsearActividadTablero),
    cotizacionesMes: { hechas: n0(c.hechas), aceptadas: n0(c.aceptadas), rechazadas: n0(c.rechazadas), aceptadoUsd: n0(c.aceptado_usd) },
    porResponder: n0(x.por_responder),
    facturadoMesUsd: n0(x.facturado_mes_usd),
    porCobrarUsd: n0(x.por_cobrar_usd),
    vencidoUsd: n0(x.vencido_usd),
    porFacturar: n0(x.por_facturar),
  };
};
const parsearActividadTablero = (a: unknown): ActividadTablero => {
  const y = o(a);
  return {
    id: Number(y.id),
    tipo: (s(y.tipo) ?? 'tarea') as TipoActividad,
    titulo: s(y.titulo) ?? '',
    fecha: s(y.fecha) ?? '',
    empresa: s(y.empresa) ?? '',
    empresaId: Number(y.empresa_id),
    responsable: s(y.responsable),
    mia: y.mia === true,
    atrasada: y.atrasada === true,
  };
};

// ---------------------------------------------------------------------------
// Empresas
// ---------------------------------------------------------------------------
export interface FilaEmpresa {
  id: number;
  nombre: string;
  pais: string | null;
  rubro: string | null;
  clienteId: number | null;
  descartada: boolean;
  responsable: string | null;
  negociosAbiertos: number;
  etapa: Etapa | null;
  proxima: { fecha: string; titulo: string; tipo: TipoActividad } | null;
  ultima: string | null;
}
export const parsearEmpresas = (v: Json | unknown): FilaEmpresa[] =>
  arr(v).map((a) => {
    const y = o(a);
    const p = y.proxima ? o(y.proxima) : null;
    return {
      id: Number(y.id),
      nombre: s(y.nombre) ?? '',
      pais: s(y.pais),
      rubro: s(y.rubro),
      clienteId: n(y.cliente_id),
      descartada: y.descartada === true,
      responsable: s(y.responsable),
      negociosAbiertos: n0(y.negocios_abiertos),
      etapa: s(y.etapa) as Etapa | null,
      proxima: p ? { fecha: s(p.fecha) ?? '', titulo: s(p.titulo) ?? '', tipo: (s(p.tipo) ?? 'tarea') as TipoActividad } : null,
      ultima: s(y.ultima),
    };
  });

export interface Contacto {
  id: number;
  nombre: string;
  cargo: string | null;
  email: string | null;
  telefono: string | null;
  principal: boolean;
}
export interface Negocio {
  id: number;
  titulo: string;
  etapa: Etapa;
  lineaId: number | null;
  linea: string | null;
  viajesMes: number | null;
  valorMensualUsd: number | null;
  cierreEstimado: string | null;
  motivoPerdida: string | null;
}
export interface Actividad {
  id: number;
  tipo: TipoActividad;
  titulo: string;
  fecha: string;
  hechaEn: string | null;
  resultado: string | null;
  oportunidadId: number | null;
  responsable: string | null;
}
export interface Empresa {
  id: number;
  nombre: string;
  pais: string | null;
  rubro: string | null;
  origen: string | null;
  clienteId: number | null;
  cliente: { codigo: string; razonSocial: string; identificadorFiscal: string; condicionPagoDias: number; estado: string } | null;
  responsableId: number | null;
  responsable: string | null;
  notas: string | null;
  descartada: boolean;
  contactos: Contacto[];
  negocios: Negocio[];
  actividades: Actividad[];
  cotizaciones: { id: number; numero: string; fecha: string; estado: EstadoCotizacion; totalUsd: number }[];
  facturas: { id: number; numero: string; numeroFiscal: string | null; estado: EstadoFactura; fechaEmision: string | null; vence: string | null; total: number }[];
}
export const parsearEmpresa = (v: Json | unknown): Empresa | null => {
  if (!v || typeof v !== 'object') return null;
  const x = o(v);
  const c = x.cliente ? o(x.cliente) : null;
  return {
    id: Number(x.id),
    nombre: s(x.nombre) ?? '',
    pais: s(x.pais),
    rubro: s(x.rubro),
    origen: s(x.origen),
    clienteId: n(x.cliente_id),
    cliente: c
      ? {
          codigo: s(c.codigo) ?? '',
          razonSocial: s(c.razon_social) ?? '',
          identificadorFiscal: s(c.identificador_fiscal) ?? '',
          condicionPagoDias: n0(c.condicion_pago_dias),
          estado: s(c.estado) ?? '',
        }
      : null,
    responsableId: n(x.responsable_id),
    responsable: s(x.responsable),
    notas: s(x.notas),
    descartada: x.descartada === true,
    contactos: arr(x.contactos).map((a) => {
      const y = o(a);
      return { id: Number(y.id), nombre: s(y.nombre) ?? '', cargo: s(y.cargo), email: s(y.email), telefono: s(y.telefono), principal: y.principal === true };
    }),
    negocios: arr(x.negocios).map((a) => {
      const y = o(a);
      return {
        id: Number(y.id),
        titulo: s(y.titulo) ?? '',
        etapa: (s(y.etapa) ?? 'nuevo') as Etapa,
        lineaId: n(y.linea_id),
        linea: s(y.linea),
        viajesMes: n(y.viajes_mes),
        valorMensualUsd: n(y.valor_mensual_usd),
        cierreEstimado: s(y.cierre_estimado),
        motivoPerdida: s(y.motivo_perdida),
      };
    }),
    actividades: arr(x.actividades).map((a) => {
      const y = o(a);
      return {
        id: Number(y.id),
        tipo: (s(y.tipo) ?? 'tarea') as TipoActividad,
        titulo: s(y.titulo) ?? '',
        fecha: s(y.fecha) ?? '',
        hechaEn: s(y.hecha_en),
        resultado: s(y.resultado),
        oportunidadId: n(y.oportunidad_id),
        responsable: s(y.responsable),
      };
    }),
    cotizaciones: arr(x.cotizaciones).map((a) => {
      const y = o(a);
      return { id: Number(y.id), numero: s(y.numero) ?? '', fecha: s(y.fecha) ?? '', estado: (s(y.estado) ?? 'borrador') as EstadoCotizacion, totalUsd: n0(y.total_usd) };
    }),
    facturas: arr(x.facturas).map((a) => {
      const y = o(a);
      return {
        id: Number(y.id),
        numero: s(y.numero) ?? '',
        numeroFiscal: s(y.numero_fiscal),
        estado: (s(y.estado) ?? 'borrador') as EstadoFactura,
        fechaEmision: s(y.fecha_emision),
        vence: s(y.vence),
        total: n0(y.total),
      };
    }),
  };
};

// ---------------------------------------------------------------------------
// Tarifario
// ---------------------------------------------------------------------------
export interface CostoViaje {
  km: number | null;
  costoKmUsd: number | null;
  fuente: string | null;
  canonUsd: number | null;
  costoUsd: number | null;
  falta: string | null;
}
const parsearCosto = (v: unknown): CostoViaje | null => {
  if (!v || typeof v !== 'object') return null;
  const y = o(v);
  return { km: n(y.km), costoKmUsd: n(y.costo_km_usd), fuente: s(y.fuente), canonUsd: n(y.canon_usd), costoUsd: n(y.costo_usd), falta: s(y.falta) };
};
export interface Tarifa {
  id: number;
  lineaId: number;
  linea: string;
  clienteId: number | null;
  cliente: string | null;
  unidad: UnidadFlete;
  tipoContenedor: string | null;
  precioUsd: number;
  vigenteDesde: string;
  observacion: string | null;
  vigente: boolean;
  costo: CostoViaje | null;
}
export interface Adicional {
  codigo: string;
  nombre: string;
  unidad: 'fijo' | 'por_dia' | 'por_hora' | 'porcentaje';
  precioUsd: number | null;
  activo: boolean;
}
export interface Linea {
  id: number;
  nombre: string;
  codigo: string;
  km: number | null;
  cruzaFrontera: boolean;
}
export interface CostoKm {
  costoKmUsd: number | null;
  fuente: 'manual' | 'viajes' | null;
  viajes: number | null;
  km: number | null;
  desde: string | null;
  hasta: string | null;
  calculadoEn: string | null;
}
export interface Tarifario {
  tarifas: Tarifa[];
  adicionales: Adicional[];
  lineas: Linea[];
  costoKm: CostoKm | null;
  parametros: { margenObjetivoPct: number; validezDias: number; condiciones: string; costoKmManualUsd: number };
}
export const parsearTarifario = (v: Json | unknown): Tarifario => {
  const x = o(v);
  const p = o(x.parametros);
  const c = x.costo_km ? o(x.costo_km) : null;
  return {
    tarifas: arr(x.tarifas).map((a) => {
      const y = o(a);
      return {
        id: Number(y.id),
        lineaId: Number(y.linea_id),
        linea: s(y.linea) ?? '',
        clienteId: n(y.cliente_id),
        cliente: s(y.cliente),
        unidad: (s(y.unidad) ?? 'viaje') as UnidadFlete,
        tipoContenedor: s(y.tipo_contenedor),
        precioUsd: n0(y.precio_usd),
        vigenteDesde: s(y.vigente_desde) ?? '',
        observacion: s(y.observacion),
        vigente: y.vigente === true,
        costo: parsearCosto(y.costo),
      };
    }),
    adicionales: arr(x.adicionales).map((a) => {
      const y = o(a);
      return {
        codigo: s(y.codigo) ?? '',
        nombre: s(y.nombre) ?? '',
        unidad: (s(y.unidad) ?? 'fijo') as Adicional['unidad'],
        precioUsd: n(y.precio_usd),
        activo: y.activo !== false,
      };
    }),
    lineas: arr(x.lineas).map((a) => {
      const y = o(a);
      return { id: Number(y.id), nombre: s(y.nombre) ?? '', codigo: s(y.codigo) ?? '', km: n(y.km), cruzaFrontera: y.cruza_frontera === true };
    }),
    costoKm: c
      ? {
          costoKmUsd: n(c.costo_km_usd),
          fuente: s(c.fuente) as CostoKm['fuente'],
          viajes: n(c.viajes),
          km: n(c.km),
          desde: s(c.desde),
          hasta: s(c.hasta),
          calculadoEn: s(c.calculado_en),
        }
      : null,
    parametros: {
      margenObjetivoPct: n0(p.margen_objetivo_pct),
      validezDias: n0(p.validez_dias),
      condiciones: s(p.condiciones) ?? '',
      costoKmManualUsd: n0(p.costo_km_manual_usd),
    },
  };
};

export interface Sugerencia {
  linea: string | null;
  tarifaUsd: number | null;
  tarifaDe: 'cliente' | 'general' | null;
  costo: CostoViaje | null;
  margenObjetivoPct: number;
  precioConMargen: number | null;
  sugerido: number | null;
}
export const parsearSugerencia = (v: Json | unknown): Sugerencia => {
  const x = o(v);
  return {
    linea: s(x.linea),
    tarifaUsd: n(x.tarifa_usd),
    tarifaDe: s(x.tarifa_de) as Sugerencia['tarifaDe'],
    costo: parsearCosto(x.costo),
    margenObjetivoPct: n0(x.margen_objetivo_pct),
    precioConMargen: n(x.precio_con_margen),
    sugerido: n(x.sugerido),
  };
};

// ---------------------------------------------------------------------------
// Cotizaciones
// ---------------------------------------------------------------------------
export interface RenglonCotizacion {
  id: number;
  tipo: 'flete' | 'adicional';
  lineaId: number | null;
  linea: string | null;
  adicionalCodigo: string | null;
  descripcion: string;
  tipoOperacion: string | null;
  tipoContenedor: string | null;
  unidad: string;
  cantidad: number;
  viajes: number | null;
  vueltaVacia: boolean;
  precioUsd: number;
  importeUsd: number;
  tarifaUsd: number | null;
  costoUsd: number | null;
}
export interface Cotizacion {
  id: number;
  numero: string;
  empresaId: number;
  empresa: string;
  clienteId: number | null;
  contactoId: number | null;
  contacto: string | null;
  contactoEmail: string | null;
  oportunidadId: number | null;
  fecha: string;
  validezDias: number;
  vence: string;
  estado: EstadoCotizacion;
  condiciones: string | null;
  observacion: string | null;
  motivo: string | null;
  totalUsd: number;
  costoUsd: number | null;
  margenUsd: number | null;
  margenPct: number | null;
  creadoPor: string | null;
  version: number;
  empresaDatos: { razonSocial: string | null; rut: string | null; direccion: string | null; comuna: string | null };
  renglones: RenglonCotizacion[];
}
export const parsearCotizacion = (v: Json | unknown): Cotizacion | null => {
  if (!v || typeof v !== 'object') return null;
  const x = o(v);
  const e = o(x.empresa_datos);
  return {
    id: Number(x.id),
    numero: s(x.numero) ?? '',
    empresaId: Number(x.empresa_id),
    empresa: s(x.empresa) ?? '',
    clienteId: n(x.cliente_id),
    contactoId: n(x.contacto_id),
    contacto: s(x.contacto),
    contactoEmail: s(x.contacto_email),
    oportunidadId: n(x.oportunidad_id),
    fecha: s(x.fecha) ?? '',
    validezDias: n0(x.validez_dias),
    vence: s(x.vence) ?? '',
    estado: (s(x.estado) ?? 'borrador') as EstadoCotizacion,
    condiciones: s(x.condiciones),
    observacion: s(x.observacion),
    motivo: s(x.motivo),
    totalUsd: n0(x.total_usd),
    costoUsd: n(x.costo_usd),
    margenUsd: n(x.margen_usd),
    margenPct: n(x.margen_pct),
    creadoPor: s(x.creado_por),
    version: n(x.version) ?? 1,
    empresaDatos: { razonSocial: s(e.razon_social), rut: s(e.rut), direccion: s(e.direccion), comuna: s(e.comuna) },
    renglones: arr(x.renglones).map((a) => {
      const y = o(a);
      return {
        id: Number(y.id),
        tipo: (s(y.tipo) ?? 'flete') as RenglonCotizacion['tipo'],
        lineaId: n(y.linea_id),
        linea: s(y.linea),
        adicionalCodigo: s(y.adicional_codigo),
        descripcion: s(y.descripcion) ?? '',
        tipoOperacion: s(y.tipo_operacion),
        tipoContenedor: s(y.tipo_contenedor),
        unidad: s(y.unidad) ?? 'viaje',
        cantidad: n0(y.cantidad),
        viajes: n(y.viajes),
        vueltaVacia: y.vuelta_vacia === true,
        precioUsd: n0(y.precio_usd),
        importeUsd: n0(y.importe_usd),
        tarifaUsd: n(y.tarifa_usd),
        costoUsd: n(y.costo_usd),
      };
    }),
  };
};
export interface FilaCotizacion {
  id: number;
  numero: string;
  empresa: string;
  empresaId: number;
  fecha: string;
  vence: string;
  estado: EstadoCotizacion;
  totalUsd: number;
  margenPct: number | null;
  rutas: string | null;
}
export const parsearCotizaciones = (v: Json | unknown): FilaCotizacion[] =>
  arr(v).map((a) => {
    const y = o(a);
    return {
      id: Number(y.id),
      numero: s(y.numero) ?? '',
      empresa: s(y.empresa) ?? '',
      empresaId: Number(y.empresa_id),
      fecha: s(y.fecha) ?? '',
      vence: s(y.vence) ?? '',
      estado: (s(y.estado) ?? 'borrador') as EstadoCotizacion,
      totalUsd: n0(y.total_usd),
      margenPct: n(y.margen_pct),
      rutas: s(y.rutas),
    };
  });

// ---------------------------------------------------------------------------
// Facturación
// ---------------------------------------------------------------------------
export interface PorFacturar {
  servicioId: number;
  numeroOperacion: number;
  clienteId: number;
  cliente: string;
  fecha: string | null;
  linea: string | null;
  tipoOperacion: string | null;
  contenedor: string | null;
  pesoKg: number | null;
  referenciaCliente: string | null;
  precio: { unidad: string | null; cantidad: number | null; precio: number | null; importe: number | null; falta: string | null };
  /** Migración 101: también se facturan antes de entregarse (programadas o en curso). */
  estado: string;
  entregada: boolean;
}

/** Migración 101: los números del módulo de Finanzas › Facturación y cobranzas. */
export interface ResumenFacturacion {
  porFacturarEntregadas: number;
  porFacturarEnCurso: number;
  prefacturas: number;
  porCobrar: number;
  porCobrarUsd: number;
  vencidas: number;
  vencidasUsd: number;
  sinNumero: number;
  cobradoMesUsd: number;
}
export const parsearResumenFacturacion = (v: Json | unknown): ResumenFacturacion => {
  const x = o(v);
  return {
    porFacturarEntregadas: n0(x.por_facturar_entregadas),
    porFacturarEnCurso: n0(x.por_facturar_en_curso),
    prefacturas: n0(x.prefacturas),
    porCobrar: n0(x.por_cobrar),
    porCobrarUsd: n0(x.por_cobrar_usd),
    vencidas: n0(x.vencidas),
    vencidasUsd: n0(x.vencidas_usd),
    sinNumero: n0(x.sin_numero),
    cobradoMesUsd: n0(x.cobrado_mes_usd),
  };
};
export const ESTADO_OPERACION_FAC: Record<string, string> = { planificado: 'Programada', en_curso: 'En curso', entregado: 'Entregada' };
export const parsearPorFacturar = (v: Json | unknown): PorFacturar[] =>
  arr(v).map((a) => {
    const y = o(a);
    const p = o(y.precio);
    return {
      servicioId: Number(y.servicio_id),
      numeroOperacion: n0(y.numero_operacion),
      clienteId: Number(y.cliente_id),
      cliente: s(y.cliente) ?? '',
      fecha: s(y.fecha),
      linea: s(y.linea),
      tipoOperacion: s(y.tipo_operacion),
      contenedor: s(y.contenedor),
      pesoKg: n(y.peso_kg),
      referenciaCliente: s(y.referencia_cliente),
      precio: { unidad: s(p.unidad), cantidad: n(p.cantidad), precio: n(p.precio), importe: n(p.importe), falta: s(p.falta) },
      estado: s(y.estado) ?? 'entregado',
      entregada: y.entregada === undefined ? true : y.entregada === true,
    };
  });

export interface RenglonFactura {
  id: number;
  servicioId: number | null;
  numeroOperacion: number | null;
  descripcion: string;
  cantidad: number;
  precio: number;
  importe: number;
}
export interface Factura {
  id: number;
  numero: string;
  clienteId: number;
  cliente: string;
  identificadorFiscal: string | null;
  condicionPagoDias: number;
  estado: EstadoFactura;
  moneda: string;
  total: number;
  numeroFiscal: string | null;
  fechaEmision: string | null;
  vence: string | null;
  cobradaEn: string | null;
  observacion: string | null;
  motivo: string | null;
  version: number;
  renglones: RenglonFactura[];
}
export const parsearFactura = (v: unknown): Factura => {
  const x = o(v);
  return {
    id: Number(x.id),
    numero: s(x.numero) ?? '',
    clienteId: Number(x.cliente_id),
    cliente: s(x.cliente) ?? '',
    identificadorFiscal: s(x.identificador_fiscal),
    condicionPagoDias: n0(x.condicion_pago_dias),
    estado: (s(x.estado) ?? 'borrador') as EstadoFactura,
    moneda: s(x.moneda) ?? 'USD',
    total: n0(x.total),
    numeroFiscal: s(x.numero_fiscal),
    fechaEmision: s(x.fecha_emision),
    vence: s(x.vence),
    cobradaEn: s(x.cobrada_en),
    observacion: s(x.observacion),
    motivo: s(x.motivo),
    version: n(x.version) ?? 1,
    renglones: arr(x.renglones).map((a) => {
      const y = o(a);
      return {
        id: Number(y.id),
        servicioId: n(y.servicio_id),
        numeroOperacion: n(y.numero_operacion),
        descripcion: s(y.descripcion) ?? '',
        cantidad: n0(y.cantidad),
        precio: n0(y.precio),
        importe: n0(y.importe),
      };
    }),
  };
};
export const parsearFacturas = (v: Json | unknown): Factura[] => arr(v).map(parsearFactura);
