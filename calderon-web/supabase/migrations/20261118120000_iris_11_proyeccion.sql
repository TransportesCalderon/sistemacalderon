-- Iris 11 · Proyección: cómo viene el trabajo contra los gastos fijos reales, y a dónde vamos
-- Pedido de Gerencia (18/11/2026): Iris contestó que no podía hacer proyecciones. Motivo: su regla 2 le prohíbe estimar
-- cifras y no tenía ninguna lectura que cruzara las operaciones con los gastos fijos que ahora están cargados.
-- NO cambia web.version_base. Necesita Iris 09 (o posterior) y los gastos fijos con cuotas (gasto_fijo_cuotas_02 o posterior).
-- Se puede correr más de una vez. Solo lee: no crea ni cambia ningún dato del negocio.
--
-- Lectura nueva «proyeccion». La cuenta la hace la base (Iris no inventa nada):
--   · Operaciones del mes: cuántas van, en qué estado, a cuántas se llega a fin de mes a este ritmo y cómo veníamos el mes pasado.
--   · Por operación: ingreso promedio menos lo que se gasta por hacerla (combustible, equipos de frío, canon y gastos de viaje
--     REALES de los últimos días, divididos por las operaciones propias del mismo período) = lo que aporta cada operación.
--   · A cubrir por mes: los gastos fijos cargados en Finanzas (sin el IVA que se recupera), los sueldos de los choferes
--     (los cargados; si no están, estimados con el parámetro de la cuenta del viaje), la depreciación e intereses de los
--     vehículos comprados y el promedio de los otros gastos cargados (mantenimiento, neumáticos…).
--   · Punto de equilibrio: operaciones por mes para cubrir todo eso, cuántas faltan, ritmo por semana, y el resultado proyectado.
--   · Próximos 6 meses (qué gasto fijo termina o empieza), el año a este ritmo, y la historia mes a mes.
--   · Escenarios: «operaciones_mes», «precio_promedio_usd», «fijos_extra_usd».

BEGIN;

DO $do$
BEGIN
    IF pg_get_functiondef('ia.fn_instrucciones_asistente()'::regprocedure) NOT LIKE '%«tipo_cambio»%' THEN
        RAISE EXCEPTION 'Primero hay que correr iris_09_tipo_de_cambio.sql (y las anteriores)';
    END IF;
    IF to_regprocedure('fin.fn_gasto_fijo_corresponde(bigint, date)') IS NULL THEN
        RAISE EXCEPTION 'Primero hay que correr gasto_fijo_cuotas_02.sql (y las siguientes de gastos fijos)';
    END IF;
END $do$;

INSERT INTO ref.parametro (codigo, valor, descripcion) VALUES
 ('ia.proyeccion_dias_referencia', '60', 'Iris, proyección: cuántos días hacia atrás se miran para sacar el ingreso y el gasto promedio por operación (30 a 180).'),
 ('ia.proyeccion_estimar_choferes', 'true', 'Iris, proyección: «true» = si los sueldos de los choferes no están cargados como gasto fijo, se estiman con ia.costeo_chofer_dia_usd por camión y por día. «false» = no se estiman.')
ON CONFLICT (codigo) DO NOTHING;

-- Los gastos fijos que corresponden a un mes, valuados con el cambio de hoy.
--   clase: «fijo», «sueldo» (estructura), «chofer», o «no_es_costo» (documentos de una compra, préstamos: se pagan pero no son gasto).
--   costo = sin el IVA de las facturas en pesos chilenos (se recupera) · a_pagar = lo que sale de caja.
CREATE OR REPLACE FUNCTION ia.fn_fijos_del_mes(p_mes date)
 RETURNS TABLE(id bigint, etiqueta text, categoria text, clase text, costo_clp numeric, a_pagar_clp numeric, sin_cambio boolean)
 LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT f.id,
           -- Sin nombres de personas: los sueldos salen por área
           CASE WHEN coalesce(cc.uso, '') IN ('REM_CHOFERES', 'LEYES_CHOFERES') OR f.nombre ~* '(chofer|conductor)' THEN 'Costo de choferes'
                WHEN f.nombre LIKE 'Sueldo · %' THEN 'Sueldo de ' || split_part(f.nombre, ' · ', 2)
                WHEN cc.codigo IN ('6.1.01', '6.1.02') THEN 'Sueldo de administración'
                ELSE f.nombre END,
           cc.codigo || ' ' || cc.nombre,
           CASE WHEN (to_jsonb(f) ->> 'compra_rodado_id') IS NOT NULL OR cc.tipo NOT IN ('costo', 'gasto') THEN 'no_es_costo'
                WHEN coalesce(cc.uso, '') IN ('REM_CHOFERES', 'LEYES_CHOFERES') OR f.nombre ~* '(chofer|conductor)' THEN 'chofer'
                WHEN f.nombre LIKE 'Sueldo · %' OR cc.codigo IN ('6.1.01', '6.1.02') THEN 'sueldo'
                ELSE 'fijo' END,
           round(x.tc * CASE WHEN f.tipo_documento = 'factura' AND f.moneda = 'CLP' THEN f.monto / (1 + ref.fn_parametro_num('fin.iva_pct', 19) / 100)
                             WHEN f.tipo_documento = 'boleta_honorarios' THEN f.monto / (1 - ref.fn_parametro_num('fin.retencion_honorarios_pct', 15.25) / 100)
                             ELSE f.monto END),
           round(x.tc * f.monto),
           x.tc IS NULL
      FROM fin.gasto_fijo f
      JOIN fin.cuenta_contable cc ON cc.id = f.cuenta_id
      CROSS JOIN LATERAL (SELECT fin.fn_tc_clp_o_null(f.moneda::text, mae.fn_hoy()) AS tc) x
     WHERE f.activo AND f.eliminado_en IS NULL AND fin.fn_gasto_fijo_corresponde(f.id, date_trunc('month', p_mes)::date)
$f$;

-- Depreciación e intereses del mes de los vehículos comprados (si la base tiene la compra de vehículos; si no, cero)
CREATE OR REPLACE FUNCTION ia.fn_depreciacion_del_mes(p_mes date)
 RETURNS numeric
 LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v numeric := 0;
BEGIN
    IF to_regclass('fin.compra_rodado') IS NULL THEN RETURN 0; END IF;
    EXECUTE $q$SELECT coalesce(sum(fin.fn_rodado_dep_mes(c, $1)
                      + CASE WHEN c.gasto_fijo_id IS NOT NULL THEN fin.fn_rodado_interes_doc(c, fin.fn_gasto_fijo_cuota_de(c.gasto_fijo_id, $1)) ELSE 0 END), 0)
                 FROM fin.compra_rodado c WHERE c.estado = 'vigente'$q$
       INTO v USING date_trunc('month', p_mes)::date;
    RETURN coalesce(v, 0);
EXCEPTION WHEN OTHERS THEN
    RETURN 0;
END $f$;

-- Combustible gastado en un período, en pesos chilenos. Lo que se compra para el tanque de la base es stock (no se cuenta);
-- lo que sale del surtidor propio al camión (carga sin importe) se valúa al costo medio del tanque o, si no hay, al precio promedio del mes.
CREATE OR REPLACE FUNCTION ia.fn_proy_combustible(p_desde date, p_hasta date)
 RETURNS numeric
 LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT coalesce(sum(CASE WHEN coalesce(k.importe_moneda_base, 0) > 0 THEN k.importe_moneda_base
                             ELSE round(k.litros * coalesce(fin.fn_costo_medio_tanques(k.fecha_hora),
                                                            fue.fn_precio_promedio_mes((k.fecha_hora AT TIME ZONE 'America/Argentina/Mendoza')::date), 0)) END), 0)
      FROM fue.carga_combustible k
      LEFT JOIN fue.deposito_combustible d ON d.id = k.deposito_id
     WHERE k.eliminado_en IS NULL AND coalesce(k.estado_validacion, '') <> 'anulada'
       AND coalesce(d.tipo, '') <> 'tanque_base'
       AND (k.fecha_hora AT TIME ZONE 'America/Argentina/Mendoza')::date BETWEEN p_desde AND p_hasta
$f$;

-- Las operaciones que cuentan (propias y con carga), como tabla
CREATE OR REPLACE FUNCTION ia.fn_proy_ops(p jsonb)
 RETURNS TABLE(id bigint, fecha date, cliente_id bigint, estado text, linea_id bigint, usd numeric)
 LANGUAGE sql IMMUTABLE
AS $f$
    SELECT t.id, t.fecha, t.cliente_id, t.estado, t.linea_id, t.usd
      FROM jsonb_to_recordset(p) AS t(id bigint, fecha date, cliente_id bigint, estado text, linea_id bigint, usd numeric)
$f$;

CREATE OR REPLACE FUNCTION ia.fn_lectura_proyeccion(p_entrada jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
    e jsonb := coalesce(p_entrada, '{}');
    v_zona constant text := 'America/Argentina/Mendoza';
    v_meses constant text[] := ARRAY['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
    v_hoy date := mae.fn_hoy();
    v_mes date; v_fin_mes date; v_mes_ant date; v_dias_mes integer; v_dia integer; v_quedan integer;
    v_dias_ref integer; v_esc_ops numeric; v_esc_precio numeric; v_esc_fijos numeric;
    v_tc numeric; v_litro numeric; v_ref_desde date; v_ref_dias integer; v_hist date; v_primera date;
    v_ops jsonb; v_terceros integer; v_vacios integer;
    v_n_ref integer; v_sin_precio integer; v_ingreso_ref numeric; v_km_prom numeric;
    v_comb numeric; v_gen numeric; v_canon numeric; v_gastos numeric; v_otros numeric;
    v_camiones integer;
    v_fijos numeric; v_chof_carg numeric; v_a_pagar numeric; v_no_costo numeric; v_sin_tc integer; v_n_fijos integer;
    v_dep numeric; v_chof_est numeric := 0; v_modo text;
    v_var numeric; v_var_fuente text; v_ingreso_op numeric; v_aporte numeric;
    v_fijos_usd numeric; v_otros_mes numeric; v_cubrir numeric; v_eq integer;
    m record; f record;
    v_ritmo numeric; v_proy numeric; v_proy_como text; v_ops_mes_ref numeric; v_ops_anio numeric; v_faltan integer;
    v_res numeric; v_anio numeric := 0;
    v_cat jsonb; v_areas jsonb; v_grandes jsonb; v_hist_j jsonb; v_fut jsonb := '[]';
    v_notas text[] := '{}';
    i integer; v_m date; v_term text; v_emp text; v_cub_m numeric;
    v_fijo_dia_real numeric; v_fijo_dia_param numeric := ref.fn_parametro_num('ia.costeo_fijo_dia_usd', 119.5);
    v_chofer_dia numeric := ref.fn_parametro_num('ia.costeo_chofer_dia_usd', 58);
BEGIN
    IF NOT (ia.fn_puede_asistente() OR session_user = 'postgres') THEN RAISE EXCEPTION 'Iris es para Gerencia' USING ERRCODE = '42501'; END IF;

    v_mes := date_trunc('month', v_hoy)::date;
    v_fin_mes := (v_mes + interval '1 month' - interval '1 day')::date;
    v_mes_ant := (v_mes - interval '1 month')::date;
    v_dias_mes := extract(day FROM v_fin_mes)::integer;
    v_dia := extract(day FROM v_hoy)::integer;
    v_quedan := v_dias_mes - v_dia;

    v_dias_ref := coalesce(ia.fn_num(e -> 'dias_referencia'), ref.fn_parametro_num('ia.proyeccion_dias_referencia', 60))::integer;
    IF v_dias_ref NOT BETWEEN 30 AND 180 THEN RAISE EXCEPTION 'Los días de referencia van de 30 a 180' USING ERRCODE = '22023'; END IF;
    v_esc_ops := ia.fn_num(e -> 'operaciones_mes');
    IF v_esc_ops IS NOT NULL AND v_esc_ops NOT BETWEEN 1 AND 2000 THEN RAISE EXCEPTION 'Las operaciones por mes del escenario van de 1 a 2.000' USING ERRCODE = '22023'; END IF;
    v_esc_precio := ia.fn_num(e -> 'precio_promedio_usd');
    IF v_esc_precio IS NOT NULL AND v_esc_precio NOT BETWEEN 100 AND 100000 THEN RAISE EXCEPTION 'El precio promedio del escenario va de 100 a 100.000 USD' USING ERRCODE = '22023'; END IF;
    v_esc_fijos := coalesce(ia.fn_num(e -> 'fijos_extra_usd'), 0);
    IF v_esc_fijos NOT BETWEEN -5000000 AND 5000000 THEN RAISE EXCEPTION 'El gasto fijo de más (o de menos) del escenario está fuera de rango' USING ERRCODE = '22023'; END IF;

    v_tc := fin.fn_tc_clp_o_null('USD', v_hoy);
    IF v_tc IS NULL OR v_tc <= 0 THEN RAISE EXCEPTION 'No hay tipo de cambio USD a CLP cargado' USING ERRCODE = '55000'; END IF;
    v_litro := ref.fn_parametro_num('ia.costeo_gasoil_clp', 1630) / v_tc;

    -- 1) Operaciones de los últimos meses con su precio en USD: el de la operación o la tarifa; si no hay, lo facturado
    v_hist := least((v_mes - interval '5 months')::date, v_hoy - v_dias_ref);
    WITH t AS (
        SELECT s.id, s.fecha_operacion AS fecha, s.cliente_id, s.estado, s.linea_id, s.transportista_id IS NULL AS propia, s.contenedor_vacio AS vacio,
               coalesce(nullif(ven.fn_precio_servicio(s.id) ->> 'importe', '')::numeric,
                        (SELECT round(sum(ven.fn_a_usd(r.importe, fa.moneda::text, fa.fecha_emision)), 2)
                           FROM ven.factura_renglon r JOIN ven.factura fa ON fa.id = r.factura_id
                          WHERE r.servicio_id = s.id AND fa.estado IN ('emitida', 'cobrada') AND fa.eliminado_en IS NULL)) AS usd
          FROM ops.servicio_comercial s
         WHERE s.eliminado_en IS NULL AND s.estado <> 'cancelado' AND s.fecha_operacion >= v_hist AND s.fecha_operacion <= v_fin_mes)
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', t.id, 'fecha', t.fecha, 'cliente_id', t.cliente_id, 'estado', t.estado, 'linea_id', t.linea_id, 'usd', t.usd))
                      FILTER (WHERE t.propia AND NOT (t.vacio AND t.usd IS NULL)), '[]'),
           (count(*) FILTER (WHERE NOT t.propia AND t.fecha BETWEEN v_mes AND v_hoy))::integer,
           (count(*) FILTER (WHERE t.propia AND t.vacio AND t.usd IS NULL AND t.fecha BETWEEN v_mes AND v_hoy))::integer
      INTO v_ops, v_terceros, v_vacios
      FROM t;

    -- 2) Período de referencia: los últimos días, pero nunca antes de la primera carga de combustible registrada
    SELECT min((k.fecha_hora AT TIME ZONE v_zona)::date) INTO v_primera
      FROM fue.carga_combustible k WHERE k.eliminado_en IS NULL AND coalesce(k.estado_validacion, '') <> 'anulada';
    v_ref_desde := greatest(v_hoy - v_dias_ref, coalesce(v_primera, v_hoy - v_dias_ref));
    v_ref_dias := v_hoy - v_ref_desde + 1;

    -- Lo que se gastó de verdad por hacer los viajes en ese período (en pesos chilenos, la moneda de la contabilidad)
    v_comb := ia.fn_proy_combustible(v_ref_desde, v_hoy);
    BEGIN
        SELECT coalesce(sum((fue.fn_imputacion_genset(g.id) ->> 'importe_base')::numeric), 0) INTO v_gen
          FROM fue.genset_registro g
         WHERE g.tipo = 'carga' AND g.eliminado_en IS NULL AND (g.fecha_hora AT TIME ZONE v_zona)::date BETWEEN v_ref_desde AND v_hoy;
    EXCEPTION WHEN OTHERS THEN
        v_gen := 0;
        v_notas := v_notas || 'No se pudo leer el combustible de los gensets: el gasto por operación no lo incluye.'::text;
    END;
    SELECT coalesce(sum(ops.fn_a_moneda_base(it.canon, it.canon_moneda::text, (vj.salida_ts AT TIME ZONE v_zona)::date)), 0) INTO v_canon
      FROM ops.viaje_chofer_item it JOIN ops.viaje_chofer vj ON vj.id = it.viaje_id
     WHERE it.eliminado_en IS NULL AND it.canon IS NOT NULL AND vj.eliminado_en IS NULL AND vj.estado <> 'anulado'
       AND (vj.salida_ts AT TIME ZONE v_zona)::date BETWEEN v_ref_desde AND v_hoy;
    SELECT coalesce(sum(coalesce(c.importe_base, ops.fn_a_moneda_base(c.importe_original, c.moneda::text, c.fecha))), 0) INTO v_gastos
      FROM fin.costo_directo c
     WHERE c.estado = 'registrado' AND c.eliminado_en IS NULL AND c.fecha BETWEEN v_ref_desde AND v_hoy;
    -- Otros gastos cargados en Finanzas que no son fijos ni combustible (mantenimiento, neumáticos, recargos…), sin IVA
    SELECT coalesce(sum(round((g.neto + g.exento) * g.tc_clp)), 0) INTO v_otros
      FROM fin.gasto g JOIN fin.cuenta_contable cc ON cc.id = g.cuenta_id
     WHERE g.estado = 'vigente' AND g.eliminado_en IS NULL AND g.gasto_fijo_id IS NULL
       AND cc.tipo IN ('costo', 'gasto') AND coalesce(cc.uso, '') <> 'COMBUSTIBLE'
       AND NOT EXISTS (SELECT 1 FROM fin.gasto_carga gc WHERE gc.gasto_id = g.id)
       AND g.fecha BETWEEN v_ref_desde AND v_hoy;

    -- Operaciones del período de referencia: a las que no tienen precio se les pone el promedio de su cliente (o el general)
    WITH r AS (SELECT * FROM ia.fn_proy_ops(v_ops) o WHERE o.fecha BETWEEN v_ref_desde AND v_hoy),
         pc AS (SELECT r.cliente_id, avg(r.usd) AS prom FROM r WHERE r.usd IS NOT NULL GROUP BY 1),
         gl AS (SELECT avg(r.usd) AS prom FROM r WHERE r.usd IS NOT NULL)
    SELECT count(*)::integer, (count(*) FILTER (WHERE r.usd IS NULL))::integer, sum(coalesce(r.usd, pc.prom, gl.prom)),
           avg(l.distancia_km) FILTER (WHERE l.distancia_km > 0)
      INTO v_n_ref, v_sin_precio, v_ingreso_ref, v_km_prom
      FROM r LEFT JOIN pc ON pc.cliente_id = r.cliente_id CROSS JOIN gl LEFT JOIN mae.linea l ON l.id = r.linea_id;

    SELECT count(*)::integer INTO v_camiones FROM mae.camion c WHERE c.eliminado_en IS NULL AND c.estado IN ('activo', 'taller') AND c.fecha_baja IS NULL;

    -- 3) Lo que hay que cubrir este mes
    SELECT coalesce(sum(d.costo_clp) FILTER (WHERE d.clase IN ('fijo', 'sueldo') AND NOT d.sin_cambio), 0),
           coalesce(sum(d.costo_clp) FILTER (WHERE d.clase = 'chofer' AND NOT d.sin_cambio), 0),
           coalesce(sum(d.a_pagar_clp) FILTER (WHERE NOT d.sin_cambio), 0),
           coalesce(sum(d.a_pagar_clp) FILTER (WHERE d.clase = 'no_es_costo' AND NOT d.sin_cambio), 0),
           (count(*) FILTER (WHERE d.sin_cambio))::integer, count(*)::integer
      INTO v_fijos, v_chof_carg, v_a_pagar, v_no_costo, v_sin_tc, v_n_fijos
      FROM ia.fn_fijos_del_mes(v_mes) d;
    v_dep := ia.fn_depreciacion_del_mes(v_mes);

    IF v_chof_carg > 0 THEN
        v_modo := 'cargado';
    ELSIF ref.fn_parametro_texto('ia.proyeccion_estimar_choferes', 'true') = 'true' THEN
        v_modo := 'estimado';
        v_chof_est := round(v_chofer_dia * 30.4 * v_camiones);
    ELSE
        v_modo := 'no';
    END IF;

    -- 4) Por operación. Con choferes estimados (sueldo todo incluido) el canon no se suma otra vez.
    IF v_n_ref >= 5 AND v_ref_dias >= 14 AND v_comb > 0 THEN
        v_var := (v_comb + v_gen + v_gastos + CASE WHEN v_modo = 'estimado' THEN 0 ELSE v_canon END) / v_tc / v_n_ref;
        v_var_fuente := 'real';
    ELSIF v_km_prom IS NOT NULL THEN
        v_var := v_km_prom * (ref.fn_parametro_num('ia.costeo_consumo_cargado', 38.7) / 100 * v_litro + ref.fn_parametro_num('ia.costeo_neumaticos_km_usd', 0.028));
        v_var_fuente := 'estimado';
    END IF;
    v_ingreso_op := coalesce(v_esc_precio, CASE WHEN v_n_ref > 0 THEN v_ingreso_ref / v_n_ref END);
    v_aporte := v_ingreso_op - v_var;

    v_fijos_usd := (v_fijos + v_chof_carg) / v_tc;
    v_otros_mes := v_otros / v_tc * 30.4 / v_ref_dias;
    v_cubrir := v_fijos_usd + v_dep / v_tc + v_chof_est + v_otros_mes + v_esc_fijos;
    IF v_aporte > 0 THEN v_eq := ceil(v_cubrir / v_aporte)::integer; END IF;

    -- 5) Cómo viene el mes
    SELECT (count(*) FILTER (WHERE o.fecha BETWEEN v_mes AND v_hoy))::integer AS hechas,
           (count(*) FILTER (WHERE o.fecha BETWEEN v_mes AND v_hoy AND o.estado IN ('entregado', 'facturado')))::integer AS entregadas,
           (count(*) FILTER (WHERE o.fecha BETWEEN v_mes AND v_hoy AND o.estado = 'en_curso'))::integer AS en_curso,
           (count(*) FILTER (WHERE o.fecha BETWEEN v_mes AND v_hoy AND o.estado IN ('planificado', 'sin_confirmar')))::integer AS por_salir,
           (count(*) FILTER (WHERE o.fecha > v_hoy AND o.fecha <= v_fin_mes))::integer AS futuras,
           (count(*) FILTER (WHERE o.fecha BETWEEN v_mes_ant AND least(v_mes_ant + (v_dia - 1), v_mes - 1)))::integer AS ant_mismo_dia,
           (count(*) FILTER (WHERE o.fecha >= v_mes_ant AND o.fecha < v_mes))::integer AS ant_completo
      INTO m
      FROM ia.fn_proy_ops(v_ops) o;

    v_ritmo := m.hechas::numeric / v_dia;
    v_proy := greatest(round(v_ritmo * v_dias_mes), m.hechas + m.futuras);
    v_proy_como := 'el ritmo de lo que va del mes llevado a todo el mes';
    IF v_esc_ops IS NOT NULL THEN v_proy := v_esc_ops; v_proy_como := 'escenario pedido'; END IF;
    v_ops_mes_ref := v_n_ref::numeric / v_ref_dias * 30.4;
    v_ops_anio := coalesce(v_esc_ops, v_ops_mes_ref);
    v_faltan := greatest(v_eq - m.hechas, 0);
    v_res := v_proy * v_aporte - v_cubrir;

    -- 6) Los gastos fijos, para mostrarlos
    SELECT coalesce(jsonb_agg(jsonb_build_object('categoria', q.categoria, 'cantidad', q.n, 'usd_por_mes', q.usd) ORDER BY q.usd DESC), '[]') INTO v_cat FROM (
        SELECT CASE WHEN z.pos <= 7 THEN z.categoria ELSE 'Otras categorías' END AS categoria, sum(z.n) AS n, sum(z.usd) AS usd
          FROM (SELECT d.categoria, count(*) AS n, round(sum(d.costo_clp) / v_tc) AS usd, row_number() OVER (ORDER BY sum(d.costo_clp) DESC) AS pos
                  FROM ia.fn_fijos_del_mes(v_mes) d WHERE d.clase <> 'no_es_costo' AND NOT d.sin_cambio GROUP BY d.categoria) z
         GROUP BY 1) q;
    SELECT coalesce(jsonb_agg(jsonb_build_object('area', q.area, 'personas', q.n, 'usd_por_mes', q.usd) ORDER BY q.usd DESC), '[]') INTO v_areas FROM (
        SELECT substr(d.etiqueta, 11) AS area, count(*) AS n, round(sum(d.costo_clp) / v_tc) AS usd
          FROM ia.fn_fijos_del_mes(v_mes) d WHERE d.clase = 'sueldo' AND NOT d.sin_cambio GROUP BY 1 ORDER BY 3 DESC LIMIT 8) q;
    SELECT coalesce(jsonb_agg(jsonb_build_object('nombre', q.etiqueta, 'usd_por_mes', q.usd) ORDER BY q.usd DESC), '[]') INTO v_grandes FROM (
        SELECT d.etiqueta, round(d.costo_clp / v_tc) AS usd FROM ia.fn_fijos_del_mes(v_mes) d
         WHERE d.clase = 'fijo' AND NOT d.sin_cambio ORDER BY d.costo_clp DESC LIMIT 8) q;
    v_fijo_dia_real := round((v_fijos / v_tc + v_dep / v_tc) / nullif(v_camiones, 0) / 30.4, 1);

    -- 7) Los próximos meses (los 6 que siguen) y el año a este ritmo (los 12 desde este mes)
    FOR i IN 0..11 LOOP
        v_m := (v_mes + make_interval(months => i))::date;
        SELECT coalesce(sum(d.costo_clp) FILTER (WHERE d.clase <> 'no_es_costo'), 0) / v_tc AS costo, coalesce(sum(d.a_pagar_clp), 0) / v_tc AS pagar
          INTO f FROM ia.fn_fijos_del_mes(v_m) d WHERE NOT d.sin_cambio;
        v_cub_m := f.costo + ia.fn_depreciacion_del_mes(v_m) / v_tc + v_chof_est + v_otros_mes + v_esc_fijos;
        IF v_aporte IS NOT NULL THEN v_anio := v_anio + v_ops_anio * v_aporte - v_cub_m; END IF;
        IF i BETWEEN 1 AND 6 THEN
            SELECT string_agg(z.etiqueta, ', ') INTO v_term FROM (
                SELECT a.etiqueta FROM ia.fn_fijos_del_mes((v_m - interval '1 month')::date) a
                 WHERE a.clase <> 'no_es_costo' AND NOT EXISTS (SELECT 1 FROM ia.fn_fijos_del_mes(v_m) b WHERE b.id = a.id)
                 ORDER BY a.costo_clp DESC NULLS LAST LIMIT 4) z;
            SELECT string_agg(z.etiqueta, ', ') INTO v_emp FROM (
                SELECT b.etiqueta FROM ia.fn_fijos_del_mes(v_m) b
                 WHERE b.clase <> 'no_es_costo' AND NOT EXISTS (SELECT 1 FROM ia.fn_fijos_del_mes((v_m - interval '1 month')::date) a WHERE a.id = b.id)
                 ORDER BY b.costo_clp DESC NULLS LAST LIMIT 4) z;
            v_fut := v_fut || jsonb_strip_nulls(jsonb_build_object(
                'mes', to_char(v_m, 'MM/YYYY'), 'a_cubrir_usd', round(v_cub_m), 'gastos_fijos_a_pagar_usd', round(f.pagar),
                'operaciones_para_cubrir', CASE WHEN v_aporte > 0 THEN ceil(v_cub_m / v_aporte) END,
                'termina', v_term, 'empieza', v_emp));
        END IF;
    END LOOP;

    -- 8) La historia, mes a mes
    SELECT coalesce(jsonb_agg(jsonb_strip_nulls(to_jsonb(h) - 'orden') ORDER BY h.orden), '[]') INTO v_hist_j FROM (
        SELECT x.mes AS orden, to_char(x.mes, 'MM/YYYY') AS mes, CASE WHEN x.mes = v_mes THEN 'en curso, hasta hoy' END AS nota,
               (SELECT count(*) FROM ia.fn_proy_ops(v_ops) o WHERE o.fecha >= x.mes AND o.fecha < x.sig AND o.fecha <= v_hoy) AS operaciones,
               (SELECT nullif(count(*), 0) FROM ia.fn_proy_ops(v_ops) o WHERE o.fecha >= x.mes AND o.fecha < x.sig AND o.fecha <= v_hoy AND o.usd IS NULL) AS sin_precio,
               (SELECT round(sum(o.usd)) FROM ia.fn_proy_ops(v_ops) o WHERE o.fecha >= x.mes AND o.fecha < x.sig AND o.fecha <= v_hoy) AS ingreso_con_precio_usd,
               (SELECT round(sum(ven.fn_a_usd(fa.total, fa.moneda::text, fa.fecha_emision))) FROM ven.factura fa
                 WHERE fa.estado IN ('emitida', 'cobrada') AND fa.eliminado_en IS NULL AND fa.fecha_emision >= x.mes AND fa.fecha_emision < x.sig) AS facturado_usd,
               nullif(round(ia.fn_proy_combustible(x.mes, least(x.sig - 1, v_hoy)) / v_tc), 0) AS combustible_usd
          FROM (SELECT d::date AS mes, (d + interval '1 month')::date AS sig
                  FROM generate_series((v_mes - interval '5 months')::timestamp, v_mes::timestamp, interval '1 month') d) x) h
     WHERE h.operaciones > 0 OR coalesce(h.facturado_usd, 0) > 0 OR coalesce(h.combustible_usd, 0) > 0;

    -- 9) Lo que conviene saber de los datos
    IF v_n_fijos = 0 THEN v_notas := v_notas || 'No hay gastos fijos cargados para este mes (Finanzas › Gastos fijos): la cuenta de lo que hay que cubrir queda corta.'::text; END IF;
    IF v_sin_precio > 0 THEN
        v_notas := v_notas || format('%s de las %s operaciones del período no tienen precio ni factura: se les puso el precio promedio de su cliente (o el general). Cargar esos precios afina la cuenta.', v_sin_precio, v_n_ref);
    END IF;
    IF v_var_fuente = 'estimado' THEN
        v_notas := v_notas || 'Todavía no hay suficientes operaciones y cargas de combustible para medir el gasto real por operación: está estimado con los parámetros de la cuenta del viaje, sin tramos vacíos.'::text;
    ELSIF v_var_fuente IS NULL THEN
        v_notas := v_notas || 'No hay datos para saber cuánto se gasta por operación: no se puede calcular el punto de equilibrio.'::text;
    END IF;
    IF v_ingreso_op IS NULL THEN v_notas := v_notas || 'Ninguna operación del período tiene precio ni factura: no se puede calcular el ingreso por operación.'::text; END IF;
    IF v_modo = 'estimado' THEN
        v_notas := v_notas || format('Los sueldos de los choferes no están cargados como gasto fijo: se estiman en %s USD por mes (%s USD por día por cada uno de los %s camiones, el criterio de la cuenta del viaje). Si se cargan en Gastos fijos, se usa lo real.',
                                     round(v_chof_est), v_chofer_dia, v_camiones);
    ELSIF v_canon = 0 THEN
        v_notas := v_notas || 'No hay canon de choferes cargado en los viajes del período: el gasto por operación no lo incluye.'::text;
    END IF;
    IF v_otros = 0 THEN v_notas := v_notas || 'No hay gastos de mantenimiento, neumáticos u otros cargados en Finanzas en el período: la cuenta no los incluye.'::text; END IF;
    IF v_sin_tc > 0 THEN v_notas := v_notas || format('%s gasto(s) fijo(s) están en una moneda sin tipo de cambio cargado: no entraron en la cuenta.', v_sin_tc); END IF;
    IF v_dia < 7 AND v_esc_ops IS NULL THEN v_notas := v_notas || 'Van pocos días del mes: la proyección por ritmo todavía es poco firme; conviene mirar también el mes pasado.'::text; END IF;
    IF v_ref_dias < 30 THEN v_notas := v_notas || format('El sistema tiene pocos días de datos (%s): los promedios se van a ir afinando.', v_ref_dias); END IF;
    IF v_terceros > 0 THEN v_notas := v_notas || format('Este mes hay %s operación(es) hechas con transportistas de terceros: no están en esta cuenta.', v_terceros); END IF;
    IF v_vacios > 0 THEN v_notas := v_notas || format('Este mes hay %s movimiento(s) de contenedor vacío sin precio: no se cuentan como operación (su gasto sí está en el combustible).', v_vacios); END IF;

    RETURN jsonb_strip_nulls(jsonb_build_object(
        'hoy', to_char(v_hoy, 'DD/MM/YYYY'),
        'mes', jsonb_build_object('nombre', v_meses[extract(month FROM v_mes)::integer] || ' de ' || to_char(v_mes, 'YYYY'), 'dia', v_dia, 'dias_del_mes', v_dias_mes, 'dias_que_quedan', v_quedan),
        'operaciones_del_mes', jsonb_build_object(
            'hasta_hoy', m.hechas, 'entregadas', m.entregadas, 'en_curso', m.en_curso, 'por_salir', m.por_salir,
            'ya_cargadas_para_lo_que_queda_del_mes', nullif(m.futuras, 0),
            'proyeccion_a_fin_de_mes', v_proy, 'como_se_proyecta', v_proy_como,
            'mes_pasado_al_mismo_dia', m.ant_mismo_dia, 'mes_pasado_completo', m.ant_completo,
            'promedio_por_mes_ultimos_dias', round(v_ops_mes_ref, 1),
            'por_camion_por_mes', round(v_ops_mes_ref / nullif(v_camiones, 0), 1)),
        'por_operacion_usd', jsonb_build_object(
            'ingreso_promedio', round(v_ingreso_op), 'gasto_por_hacerla', round(v_var), 'aporte', round(v_aporte),
            'gasto_medido_o_estimado', CASE v_var_fuente WHEN 'real' THEN 'medido' WHEN 'estimado' THEN 'estimado' END,
            'detalle_del_gasto', CASE WHEN v_var_fuente = 'real' THEN jsonb_build_object(
                'combustible', round(v_comb / v_tc / v_n_ref), 'equipos_de_frio_y_gensets', nullif(round(v_gen / v_tc / v_n_ref), 0),
                'canon_de_choferes', CASE WHEN v_modo <> 'estimado' THEN nullif(round(v_canon / v_tc / v_n_ref), 0) END,
                'peajes_y_gastos_de_viaje', nullif(round(v_gastos / v_tc / v_n_ref), 0)) END,
            'operaciones_del_periodo', v_n_ref, 'sin_precio', nullif(v_sin_precio, 0),
            'periodo', to_char(v_ref_desde, 'DD/MM/YYYY') || ' al ' || to_char(v_hoy, 'DD/MM/YYYY') || ' (' || v_ref_dias || ' días)'),
        'a_cubrir_por_mes_usd', jsonb_build_object(
            'total', round(v_cubrir),
            'gastos_fijos_cargados', round(v_fijos_usd),
            'choferes_estimados', nullif(round(v_chof_est), 0),
            'depreciacion_e_intereses_de_vehiculos_comprados', nullif(round(v_dep / v_tc), 0),
            'otros_gastos_promedio', nullif(round(v_otros_mes), 0),
            'escenario_gasto_de_mas', nullif(round(v_esc_fijos), 0)),
        'punto_de_equilibrio', CASE WHEN v_eq IS NOT NULL THEN jsonb_build_object(
            'operaciones_por_mes', v_eq, 'por_semana', round(v_eq / (v_dias_mes / 7.0), 1), 'por_camion_por_mes', round(v_eq::numeric / nullif(v_camiones, 0), 1),
            'llevamos', m.hechas, 'faltan', v_faltan,
            'ritmo_actual_por_semana', round(v_ritmo * 7, 1),
            'ritmo_necesario_por_semana_en_lo_que_queda', CASE WHEN v_quedan > 0 THEN round(v_faltan::numeric / v_quedan * 7, 1) END,
            'se_llega', v_proy >= v_eq,
            'operaciones_de_mas_o_de_menos_a_fin_de_mes', v_proy - v_eq)
          WHEN v_aporte <= 0 THEN jsonb_build_object('no_se_puede', 'Cada operación gasta más de lo que cobra: ninguna cantidad cubre los gastos. Hay que mirar el precio o el gasto por operación.') END,
        'resultado_proyectado_del_mes_usd', CASE WHEN v_aporte IS NOT NULL THEN jsonb_build_object(
            'operaciones', v_proy, 'ingreso', round(v_proy * v_ingreso_op), 'gasto_de_los_viajes', round(v_proy * v_var),
            'aporte_total', round(v_proy * v_aporte), 'gastos_a_cubrir', round(v_cubrir), 'resultado', round(v_res),
            'margen_sobre_el_ingreso_pct', round(100 * v_res / nullif(v_proy * v_ingreso_op, 0), 1)) END,
        'a_este_ritmo', CASE WHEN v_aporte IS NOT NULL THEN jsonb_build_object(
            'operaciones_por_mes', round(v_ops_anio, 1),
            'resultado_por_mes_usd', round(v_ops_anio * v_aporte - v_cubrir),
            'resultado_proximos_12_meses_usd', round(v_anio)) END,
        'gastos_fijos', jsonb_build_object(
            'cantidad', v_n_fijos, 'costo_por_mes_usd', round(v_fijos_usd), 'se_paga_por_mes_usd', round(v_a_pagar / v_tc),
            'pagos_que_no_son_gasto_usd', nullif(round(v_no_costo / v_tc), 0),
            'por_categoria', v_cat, 'sueldos_por_area', CASE WHEN jsonb_array_length(v_areas) > 0 THEN v_areas END, 'los_mas_grandes', v_grandes,
            'camiones', v_camiones,
            'fijo_real_por_camion_por_dia_usd', v_fijo_dia_real,
            'fijo_que_usa_la_cuenta_del_viaje_usd', v_fijo_dia_param,
            'nota', 'El fijo real por camión no incluye choferes, igual que el de la cuenta del viaje. Si los dos números son muy distintos, conviene que Gerencia actualice el parámetro ia.costeo_fijo_dia_usd.'),
        'proximos_meses', v_fut,
        'historia', v_hist_j,
        'escenario', CASE WHEN v_esc_ops IS NOT NULL OR v_esc_precio IS NOT NULL OR v_esc_fijos <> 0 THEN jsonb_build_object(
            'operaciones_mes', v_esc_ops, 'precio_promedio_usd', v_esc_precio, 'fijos_extra_usd', nullif(v_esc_fijos, 0),
            'ojo', 'Estos números son de un escenario pedido, no de lo que está pasando.') END,
        'datos_que_faltan', CASE WHEN array_length(v_notas, 1) > 0 THEN to_jsonb(v_notas) END,
        'dolar_usado_clp', round(v_tc, 2),
        'aviso', 'Es una proyección: sale del ritmo de este mes y de los promedios de los últimos ' || v_ref_dias || ' días. No es el resultado contable.',
        'como_se_calcula', 'Operaciones: las propias, no canceladas, por su fecha de operación. '
            || 'Ingreso por operación: precio de la operación o de la tarifa; si falta, lo facturado; si tampoco hay, el promedio del cliente. '
            || 'Gasto por hacerla: combustible, equipos de frío, canon y gastos de viaje realmente cargados en el período, divididos por las operaciones del mismo período (así entran los tramos vacíos). '
            || 'Aporte = ingreso menos ese gasto. A cubrir por mes: gastos fijos de Finanzas sin el IVA que se recupera, choferes, depreciación e intereses de vehículos comprados y el promedio de otros gastos cargados. '
            || 'Punto de equilibrio = a cubrir ÷ aporte. Resultado proyectado = operaciones proyectadas × aporte − a cubrir. Todo en USD con el dólar de hoy.'));
END $function$;

REVOKE ALL ON FUNCTION ia.fn_fijos_del_mes(date), ia.fn_depreciacion_del_mes(date), ia.fn_proy_combustible(date, date), ia.fn_proy_ops(jsonb), ia.fn_lectura_proyeccion(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ia.fn_lectura_proyeccion(jsonb) TO tc_app, tc_admin, tc_lectura;

INSERT INTO ia.asistente_herramienta (codigo, orden, descripcion, etiqueta, leyendo, pantalla, entrada, activa)
VALUES ('proyeccion', 36,
        'PROYECCIONES y cómo viene la empresa: cuántas operaciones van en el mes, a cuántas se llega a fin de mes a este ritmo y cómo veníamos el mes pasado; '
        || 'cuánto aporta cada operación (ingreso menos combustible, canon y gastos de viaje reales); los gastos fijos REALES cargados en Finanzas (por categoría, sueldos por área, los más grandes) '
        || 'más choferes, depreciación y otros gastos; el punto de equilibrio (operaciones por mes y por semana para cubrir todo, cuántas faltan, si se llega); '
        || 'el resultado proyectado del mes y del año; los próximos 6 meses (qué gasto fijo termina o empieza) y la historia mes a mes (operaciones, facturado, combustible). '
        || 'Usala SIEMPRE que pregunten cómo venimos, cómo viene el mes o el trabajo, si cubrimos los gastos fijos o la estructura, cuántas operaciones necesitamos, cómo cerramos el mes o el año, '
        || 'cuáles son los gastos fijos, o una proyección. Acepta escenarios: «¿y si hacemos 70 operaciones?», «¿y si el precio promedio sube a 3.200?», «¿y si sumamos un leasing de 4.000 USD?».',
        'Proyección', 'Cruzando las operaciones con los gastos fijos…', '/finanzas/gastos-fijos',
        '{"type": "object", "properties": {
            "operaciones_mes": {"type": "number", "description": "Escenario: cuántas operaciones por mes suponer (si no se manda, usa el ritmo real)."},
            "precio_promedio_usd": {"type": "number", "description": "Escenario: precio promedio por operación en USD (si no se manda, usa el promedio real)."},
            "fijos_extra_usd": {"type": "number", "description": "Escenario: gasto fijo mensual de más en USD (negativo si es un gasto que se saca)."},
            "dias_referencia": {"type": "integer", "description": "Cuántos días hacia atrás se promedian (30 a 180). Si no se manda: 60."}}}'::jsonb, true)
ON CONFLICT (codigo) DO UPDATE
   SET descripcion = EXCLUDED.descripcion, etiqueta = EXCLUDED.etiqueta, leyendo = EXCLUDED.leyendo, pantalla = EXCLUDED.pantalla,
       entrada = EXCLUDED.entrada, activa = true;

-- El despacho de lecturas conoce la nueva
DO $do$
DECLARE v_def text := pg_get_functiondef('ia.fn_herramienta(text, jsonb)'::regprocedure);
        v_a2 constant text := 'ELSE ia.fn_lectura_tipo_cambio(p_entrada) END);';
BEGIN
    IF v_def LIKE '%fn_lectura_proyeccion%' THEN RETURN; END IF;
    IF v_def !~ 'p_codigo IN \(''viento_en_ruta''[^)]*\)' OR position(v_a2 IN v_def) = 0 THEN
        RAISE EXCEPTION 'ia.fn_herramienta no es la que esperaba esta migración: avisar antes de seguir';
    END IF;
    v_def := regexp_replace(v_def, '(p_codigo IN \(''viento_en_ruta''[^)]*)\)', '\1, ''proyeccion'')');
    v_def := replace(v_def, v_a2, 'WHEN ''proyeccion'' THEN ia.fn_lectura_proyeccion(p_entrada)
                    ' || v_a2);
    EXECUTE v_def;
END $do$;

-- Regla 28: Iris sí proyecta (con los números de la lectura)
DO $do$
DECLARE
    v_def text := pg_get_functiondef('ia.fn_instrucciones_asistente()'::regprocedure);
    v_a27 constant text := 'si no coincide con la hora pedida.''';
    v_a26 constant text := '«mejor dicho»), vale lo último que dijo.''';
    v_ancla text;
    v_nuevo constant text := $t$
        || ' 28) SÍ podés proyectar. Las proyecciones las calcula el sistema en la lectura «proyeccion»: son datos del sistema, no inventos tuyos, así que no chocan con la regla 2. '
        || 'Nunca contestes que no podés hacer proyecciones ni que solo tenés datos del pasado. Usá «proyeccion» cuando pregunten cómo venimos, cómo viene el mes o el trabajo, cuántas operaciones llevamos o necesitamos, '
        || 'si se cubren los gastos fijos o la estructura, cómo cerramos el mes o el año, cuáles son los gastos fijos, o «qué pasa si» (mandá «operaciones_mes», «precio_promedio_usd» o «fijos_extra_usd» según lo que supongan). '
        || 'Si la pregunta trae una tarifa y una línea puntual («cuántos viajes de 3.000 a Mar del Plata»), es la regla 24; si es sobre el mes, la empresa o las operaciones en general, es esta. '
        || 'Respondé corto y en este orden: a) cuántas operaciones van y a cuántas se llega a fin de mes; b) cuántas hacen falta para cubrir los gastos del mes y si se llega o cuántas faltan; '
        || 'c) el resultado proyectado del mes en USD; d) UNA recomendación concreta (cuántas operaciones más por semana, o qué mirar). Si piden más, la tabla de los gastos fijos por categoría, los próximos meses o la historia. '
        || 'Este resultado YA descuenta los gastos fijos: acá no va la frase del margen de contribución de la regla 5. '
        || 'Decí una sola vez, al final, que es una proyección y de qué sale; y si la lectura trae «datos_que_faltan», nombrá el más importante en una frase (por ejemplo operaciones sin precio o choferes estimados). '
        || 'Para lo ya ocurrido y contabilizado usá «estado_resultados»; para el detalle por cliente, «negocio_clientes».'$t$;
BEGIN
    IF v_def LIKE '%«proyeccion»%' THEN RETURN; END IF;
    v_ancla := CASE WHEN position(v_a27 IN v_def) > 0 THEN v_a27 WHEN position(v_a26 IN v_def) > 0 THEN v_a26 END;
    IF v_ancla IS NULL THEN
        RAISE EXCEPTION 'ia.fn_instrucciones_asistente no es la que esperaba esta migración (falta Iris 09): avisar antes de seguir';
    END IF;
    EXECUTE replace(v_def, v_ancla, v_ancla || v_nuevo);
END $do$;

-- El informe de los lunes suma «Cómo venimos» (si el informe no es el esperado, se saltea con un aviso)
DO $do$
DECLARE v_lec text; v_ins text;
        v_a1 constant text := '(''operaciones'', v_semana), ';
        v_a2 constant text := 'por pagar, por facturar); ';
BEGIN
    IF to_regprocedure('ia.fn_informe_lecturas(date, date)') IS NULL OR to_regprocedure('ia.fn_instrucciones_informe(date, date)') IS NULL THEN
        RAISE NOTICE 'El informe semanal no está en esta base: no se cambió';
        RETURN;
    END IF;
    v_lec := pg_get_functiondef('ia.fn_informe_lecturas(date, date)'::regprocedure);
    v_ins := pg_get_functiondef('ia.fn_instrucciones_informe(date, date)'::regprocedure);
    IF v_lec LIKE '%''proyeccion''%' THEN RETURN; END IF;
    IF position(v_a1 IN v_lec) = 0 OR position(v_a2 IN v_ins) = 0 THEN
        RAISE NOTICE 'El informe semanal no es el que esperaba esta migración: queda sin la proyección (no se cambió)';
        RETURN;
    END IF;
    EXECUTE replace(v_lec, v_a1, v_a1 || '(''proyeccion'', ''{}''::jsonb), ');
    EXECUTE replace(v_ins, v_a2, v_a2 || '«Cómo venimos» (con «proyeccion»: operaciones del mes y a cuántas se llega, cuántas hacen falta para cubrir los gastos del mes, '
        || 'resultado proyectado y qué gasto fijo termina o empieza en los próximos meses; aclarar que es una proyección); ');
END $do$;

COMMIT;
