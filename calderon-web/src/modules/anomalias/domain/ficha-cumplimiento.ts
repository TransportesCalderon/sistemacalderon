/**
 * Iris 15 y 16 · Ficha de cumplimiento por persona (Combustible › Alertas). La arma la base
 * (ia.fn_lectura_ficha_cumplimiento por ana.fn_ficha_cumplimiento); acá solo se lee y se ordena para mostrar.
 */
export type Color = 'verde' | 'amarillo' | 'rojo';

export interface FondoMoneda {
  moneda: string;
  entregadoMes: number;
  rendido: number;
  sinRendir: number;
  pctRendido: number | null;
}

export interface FichaChofer {
  chofer: string;
  enRojo: number;
  enAmarillo: number;
  fondo: FondoMoneda[];
  fondoColor: Color | null;
  viajes: number | null;
  combustibleL: number | null;
  combustibleClp: number | null;
  puntaje: number | null;
  ralentiL: number | null;
  ralentiColor: Color | null;
  gastosSubidos: number | null;
  gastosRechazados: number | null;
  diasGasto: number | null;
  cargasSinTicket: number | null;
  ticketsColor: Color | null;
  nochesFueraHorario: number | null;
  horarioColor: Color | null;
  atrasos: string[];
}

export interface FilaOficina {
  quien: string;
  cantidad: number;
  demora: number | null;
  color: Color | null;
}

export interface FichaCumplimiento {
  mes: string;
  choferes: FichaChofer[];
  gastosRevisados: FilaOficina[];
  cierresAprobados: FilaOficina[];
  pedidosResueltos: FilaOficina[];
  colores: string;
  comoLeerlo: string;
  noSePudoLeer: string[];
}

type O = Record<string, unknown>;
const obj = (v: unknown): O => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as O) : {});
const lista = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const num = (v: unknown): number | null => (v === null || v === undefined || v === '' || Number.isNaN(Number(v)) ? null : Number(v));
const txt = (v: unknown): string => (typeof v === 'string' ? v : '');
const color = (v: unknown): Color | null => (v === 'verde' || v === 'amarillo' || v === 'rojo' ? v : null);

function oficina(v: unknown, cantidad: string, demora: string): FilaOficina[] {
  return lista(v).map((x) => {
    const o = obj(x);
    return { quien: txt(o.quien), cantidad: num(o[cantidad]) ?? 0, demora: num(o[demora]), color: color(o.color) };
  });
}

export function parsearFicha(data: unknown): FichaCumplimiento {
  const d = obj(data);
  const of = obj(d.oficina);
  return {
    mes: txt(d.mes),
    choferes: lista(d.choferes).map((x) => {
      const o = obj(x);
      return {
        chofer: txt(o.chofer),
        enRojo: num(o.en_rojo) ?? 0,
        enAmarillo: num(o.en_amarillo) ?? 0,
        fondo: lista(o.fondo_fijo).map((f) => {
          const m = obj(f);
          return {
            moneda: txt(m.moneda),
            entregadoMes: num(m.entregado_en_el_mes) ?? 0,
            rendido: num(m.rendido) ?? 0,
            sinRendir: num(m.sin_rendir) ?? 0,
            pctRendido: num(m.pct_rendido_de_eso),
          };
        }),
        fondoColor: color(o.fondo_color),
        viajes: num(o.viajes_cerrados),
        combustibleL: num(o.combustible_a_su_cargo_l),
        combustibleClp: num(o.combustible_a_su_cargo_clp),
        puntaje: num(o.puntaje_de_manejo),
        ralentiL: num(o.ralenti_de_mas_l),
        ralentiColor: color(o.ralenti_color),
        gastosSubidos: num(o.gastos_subidos),
        gastosRechazados: num(o.gastos_rechazados),
        diasGasto: num(o.dias_que_tarda_en_subir_un_gasto),
        cargasSinTicket: num(o.cargas_sin_ticket),
        ticketsColor: color(o.tickets_color),
        nochesFueraHorario: num(o.noches_fuera_de_horario),
        horarioColor: color(o.horario_color),
        atrasos: lista(o.atrasos_hoy).map(txt).filter((t) => t !== ''),
      };
    }),
    gastosRevisados: oficina(of.gastos_revisados, 'gastos', 'dias_que_tardo'),
    cierresAprobados: oficina(of.cierres_aprobados, 'cierres', 'dias_desde_que_llego_el_camion'),
    pedidosResueltos: oficina(of.pedidos_de_dinero_resueltos, 'pedidos', 'horas_que_tardo'),
    colores: txt(d.colores),
    comoLeerlo: txt(d.como_leerlo),
    noSePudoLeer: lista(d.no_se_pudo_leer).map(txt).filter((t) => t !== ''),
  };
}
