'use client';

import { useQueryClient, type QueryClient } from '@tanstack/react-query';

/**
 * Sprint 0 · T03 (docs/DECISIONES.md, regla 4): qué se vuelve a leer cuando se guarda algo.
 * Un solo mapa para toda la web: ninguna pantalla llama a invalidateQueries por su cuenta
 * (lo controla tests/invalidar.test.ts). Cada objeto lista los prefijos de clave que hay que
 * recargar; se armó con exactamente lo que cada pantalla recargaba antes del Sprint 0.
 * Si un guardado tiene que actualizar otra pantalla, se agrega el prefijo acá, no en la pantalla.
 */

/** Primer elemento de las claves de consulta de cada módulo. */
export const RAICES = [
  'anomalias',
  'catalogos',
  'chofer',
  'combustible',
  'comercial',
  'finanzas',
  'flota',
  'ia',
  'liquidacion',
  'logistica',
  'pendientes',
  'pizarra',
  'tablero',
  'telemetria',
  'usuarios',
  'ventas',
] as const;
export type Raiz = (typeof RAICES)[number];

type Prefijo = readonly [Raiz, ...string[]];

/** «Todo»: vuelve a leer todas las consultas (cierres de viaje, que tocan muchos módulos). */
export const TODO = 'todo' as const;

export const OBJETOS = {
  /** Alertas de la telemetría: la bandeja y Mis pendientes. */
  alerta: [['anomalias'], ['pendientes']],
  /** Camión guardado (la ficha se deja en caché aparte con setQueryData). */
  camion: [['flota', 'camiones', 'lista']],
  /** Tanques de un camión. */
  tanque: [['flota', 'camiones', 'tanques']],
  /** Chofer guardado o eliminado. */
  chofer: [['flota', 'choferes', 'lista']],
  /** Cliente guardado: listas, aviso de parecidos y segmentos. */
  cliente: [
    ['comercial', 'clientes', 'lista'],
    ['comercial', 'clientes', 'parecidos'],
    ['comercial', 'clientes', 'segmentos'],
  ],
  /** Catálogos y parámetros: también los formularios de Combustible, Flota y Pizarra que los usan. */
  catalogo: [['catalogos'], ['combustible'], ['flota'], ['pizarra']],
  /** Cualquier escritura de Combustible (también «Hoy», desde el Sprint 3). */
  combustible: [['combustible'], ['pendientes']],
  /** Pizarra, semis, accesorios y gensets: los gensets también se eligen en Combustible y en Operaciones. */
  pizarra: [['pizarra'], ['flota'], ['combustible', 'gensets'], ['logistica', 'gensets']],
  /** Aviso en tiempo real «cambió la pizarra». */
  pizarra_en_vivo: [['pizarra']],
  /** El mismo aviso, en las pantallas de viajes y operaciones. */
  viajes_en_vivo: [['pizarra'], ['logistica']],
  /** Operaciones, tramos y viajes: también la Pizarra y el combustible del viaje. */
  operacion: [['logistica'], ['pizarra'], ['combustible'], ['pendientes']],
  /** Ventas: emitir o cobrar cambia también Finanzas y los viajes. */
  venta: [['ventas'], ['finanzas'], ['logistica']],
  /** Finanzas: un cobro cambia también Ventas › Facturación. */
  finanzas: [['finanzas'], ['ventas']],
  /** Liquidación de choferes. */
  liquidacion: [['liquidacion']],
  /** Lo que carga el chofer desde el celular. */
  chofer_portal: [['chofer']],
  /** Tablero del chofer (fotos del tablero del camión). */
  tablero: [['tablero']],
  /** Aviso de carga visto por el chofer. */
  aviso_carga: [['tablero', 'mis-avisos']],
  /** Telemetría: importar ahora y equipos Trackerway. */
  telemetria: [['telemetria']],
  /** Usuarios del sistema. */
  usuario: [['usuarios']],
  /** Aprobar cierres o completar operaciones de un viaje: toca casi todo. */
  cierre: TODO,
} as const satisfies Record<string, readonly Prefijo[] | typeof TODO>;

export type Objeto = keyof typeof OBJETOS;

/** Vuelve a leer lo que depende de los objetos guardados. */
export function invalidar(qc: QueryClient, ...objetos: Objeto[]): Promise<void> {
  const prefijos: (readonly string[])[] = [];
  for (const o of objetos) {
    const destino = OBJETOS[o];
    if (destino === TODO) return qc.invalidateQueries();
    prefijos.push(...destino);
  }
  return Promise.all(prefijos.map((queryKey) => qc.invalidateQueries({ queryKey }))).then(() => undefined);
}

/** Hook: devuelve invalidar(...objetos) ya atado al QueryClient de la sesión. */
export function useInvalidar() {
  const qc = useQueryClient();
  return (...objetos: Objeto[]) => invalidar(qc, ...objetos);
}
