/**
 * Sprint 8 · Menú «Más» (Plan de migración UX, ítem 32): reemplaza al menú lateral.
 * La barra de arriba tiene Hoy, Pizarra, Mapa, el buscador y «Más»; «Más» lleva a los trabajos
 * largos (Liquidaciones, Cotizaciones, Conciliación), a Análisis y a Ajustes.
 * Cada ítem lista las rutas de sus pestañas: se muestra si la persona puede ver alguna y lleva a
 * la primera que puede ver. El menú solo dibuja: qué pantalla habilita cada ruta lo dice rutas.ts.
 */
export interface ItemMas {
  etiqueta: string;
  /** Las rutas de las pestañas de este ítem, en orden (la primera visible es el destino). */
  rutas: readonly string[];
}

export interface GrupoMas {
  id: 'trabajo' | 'analisis' | 'ajustes';
  etiqueta: string;
  items: readonly ItemMas[];
}

export const MAS: readonly GrupoMas[] = [
  {
    id: 'trabajo',
    etiqueta: 'Trabajo',
    items: [
      { etiqueta: 'Liquidaciones', rutas: ['/liquidaciones', '/liquidaciones/resumen', '/liquidaciones/fondos'] },
      { etiqueta: 'Cotizaciones', rutas: ['/cotizaciones', '/cotizaciones/clientes', '/cotizaciones/datos-clientes', '/cotizaciones/tarifas'] },
      { etiqueta: 'Conciliación', rutas: ['/conciliacion'] },
    ],
  },
  {
    id: 'analisis',
    etiqueta: 'Análisis',
    items: [
      { etiqueta: 'Operaciones', rutas: ['/analisis/operaciones'] },
      {
        etiqueta: 'Viajes y cierres',
        rutas: ['/analisis/viajes', '/analisis/cierres/por-hacer', '/analisis/cierres', '/analisis/cierres/viajes', '/analisis/costos'],
      },
      {
        etiqueta: 'Cargas de combustible',
        rutas: ['/analisis/cargas', '/analisis/cargas/por-validar', '/analisis/cargas/sin-ticket', '/analisis/movimientos'],
      },
      { etiqueta: 'Consumo', rutas: ['/analisis/consumo', '/analisis/consumo/cargado-vs-motor', '/analisis/consumo/ralenti'] },
      { etiqueta: 'Tanque de Base Mendoza', rutas: ['/analisis/tanque'] },
      { etiqueta: 'Ranking de choferes', rutas: ['/analisis/ranking', '/analisis/ranking/periodo'] },
      { etiqueta: 'Alertas de la telemetría', rutas: ['/analisis/alertas'] },
      { etiqueta: 'Gastos', rutas: ['/analisis/gastos', '/analisis/gastos/combustible'] },
      { etiqueta: 'Cobros y pagos', rutas: ['/analisis/cobros-pagos'] },
      { etiqueta: 'Facturación', rutas: ['/analisis/facturacion'] },
      { etiqueta: 'Informes', rutas: ['/analisis/informes'] },
      { etiqueta: 'Resumen financiero', rutas: ['/analisis/resultados'] },
      { etiqueta: 'Ventas', rutas: ['/analisis/ventas'] },
    ],
  },
  {
    id: 'ajustes',
    etiqueta: 'Ajustes',
    items: [
      {
        etiqueta: 'Flota',
        rutas: ['/ajustes/flota', '/ajustes/flota/semirremolques', '/ajustes/flota/gensets', '/ajustes/flota/accesorios', '/ajustes/flota/choferes'],
      },
      // Decisión del 29/10/2026: quedan acá hasta que la Pizarra haga lo mismo
      { etiqueta: 'Asignar viajes', rutas: ['/ajustes/viajes'] },
      { etiqueta: 'Choferes de los tractores', rutas: ['/ajustes/choferes-tractores'] },
      { etiqueta: 'Lugares', rutas: ['/ajustes/lugares'] },
      { etiqueta: 'Líneas', rutas: ['/ajustes/lineas'] },
      { etiqueta: 'Proveedores y estaciones', rutas: ['/ajustes/proveedores', '/ajustes/proveedores/estaciones'] },
      { etiqueta: 'Transportistas externos', rutas: ['/ajustes/transportistas'] },
      { etiqueta: 'Liquidación', rutas: ['/ajustes/liquidacion', '/ajustes/liquidacion/datos-legales'] },
      { etiqueta: 'Plan de cuentas', rutas: ['/ajustes/plan-cuentas'] },
      { etiqueta: 'Gastos fijos', rutas: ['/ajustes/gastos-fijos'] },
      { etiqueta: 'Monedas y tipos de cambio', rutas: ['/ajustes/monedas/tipos-cambio', '/ajustes/monedas'] },
      { etiqueta: 'Usuarios', rutas: ['/ajustes/usuarios'] },
      { etiqueta: 'Parámetros y catálogos', rutas: ['/ajustes/parametros', '/ajustes/parametros/catalogos'] },
      { etiqueta: 'Integraciones', rutas: ['/ajustes/integraciones', '/ajustes/integraciones/equipos'] },
    ],
  },
];

// Sprint 0 (T01): se mudaron a rutas.ts; se re-exportan para no romper importaciones.
export { RUTAS_PUBLICAS, RUTAS_SIN_PANTALLA, esRutaPublica, esRutaSinPantalla, pantallaDeRuta } from './rutas';
