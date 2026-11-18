-- Iris 12 · Proyección, segunda parte: lo que mostraron los gastos fijos reales (18/11/2026)
-- Al verificar lo cargado apareció que: hay vehículos comprados en cuotas cargados como gasto fijo en una cuenta de activo
-- (se pagan todos los meses pero no son gasto), hay cuotas de leasing vencidas, faltan categorías enteras (seguros, arriendos…)
-- y el fijo real por camión da bastante menos que el de la cuenta del viaje. NO cambia web.version_base.
-- Necesita iris_11_proyeccion.sql. Se puede correr más de una vez. Solo lee.
--  · Punto de equilibrio también «de caja»: sumando lo que se paga y no es gasto (cuotas de vehículos, préstamos).
--  · Punto de equilibrio si los fijos fueran los de la cuenta del viaje, y aviso cuando parece que faltan gastos por cargar.
--  · Lista de lo que se paga y no es gasto, cuándo se termina de pagar cada cosa, y las cuotas vencidas sin pagar.
--  · Aviso de las categorías sin ningún gasto fijo cargado.
--  · Los honorarios salen sin el nombre de la persona.
--  · Regla 28: cuando parece que faltan gastos fijos, Iris dice los dos números; la deuda vencida va aparte.

BEGIN;

DO $do$
BEGIN
    IF to_regprocedure('ia.fn_lectura_proyeccion(jsonb)') IS NULL OR to_regprocedure('ia.fn_fijos_del_mes(date)') IS NULL THEN
        RAISE EXCEPTION 'Primero hay que correr iris_11_proyeccion.sql';
    END IF;
END $do$;

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
                WHEN f.tipo_documento = 'boleta_honorarios' OR cc.nombre ~* '^honorarios' THEN 'Honorarios'
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
    v_caja numeric; v_eq_caja integer; v_cubrir_cv numeric; v_eq_cv integer; v_parece_incompleto boolean := false;
    v_pagos jsonb; v_sin_cat text; v_deja text; v_emp_pago text; v_venc_n integer; v_venc_clp numeric;
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
    -- Lo que sale de caja además del gasto: cuotas de vehículos comprados y préstamos (en vez de su depreciación e intereses)
    v_caja := v_cubrir - v_dep / v_tc + v_no_costo / v_tc;
    -- Lo mismo, pero con los fijos que supone la cuenta del viaje (por si todavía faltan gastos fijos por cargar)
    v_cubrir_cv := v_fijo_dia_param * 30.4 * v_camiones + v_chof_carg / v_tc + v_chof_est + v_otros_mes + v_esc_fijos;
    IF v_aporte > 0 THEN
        v_eq := ceil(v_cubrir / v_aporte)::integer;
        v_eq_caja := ceil(v_caja / v_aporte)::integer;
        v_eq_cv := ceil(v_cubrir_cv / v_aporte)::integer;
    END IF;

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
        SELECT d.etiqueta || CASE WHEN count(*) > 1 THEN ' (' || count(*) || ')' ELSE '' END AS etiqueta, round(sum(d.costo_clp) / v_tc) AS usd
          FROM ia.fn_fijos_del_mes(v_mes) d
         WHERE d.clase = 'fijo' AND NOT d.sin_cambio GROUP BY d.etiqueta ORDER BY sum(d.costo_clp) DESC LIMIT 8) q;
    -- Lo que se paga todos los meses y no es gasto: cuotas de vehículos comprados, préstamos
    SELECT coalesce(jsonb_agg(jsonb_build_object('nombre', q.etiqueta, 'usd_por_mes', q.usd) ORDER BY q.usd DESC), '[]') INTO v_pagos FROM (
        SELECT d.etiqueta, round(d.a_pagar_clp / v_tc) AS usd FROM ia.fn_fijos_del_mes(v_mes) d
         WHERE d.clase = 'no_es_costo' AND NOT d.sin_cambio ORDER BY d.a_pagar_clp DESC LIMIT 8) q;
    v_fijo_dia_real := round((v_fijos / v_tc + v_dep / v_tc) / nullif(v_camiones, 0) / 30.4, 1);
    v_parece_incompleto := v_fijo_dia_real < v_fijo_dia_param * 0.8;
    -- Cuotas de gastos fijos ya vencidas y sin pagar (deuda atrasada: no está en lo que hay que cubrir por mes)
    SELECT count(*)::integer, coalesce(sum(fin.fn_saldo_gasto(g.id) * coalesce(fin.fn_tc_clp_o_null(g.moneda::text, v_hoy), 0)), 0) INTO v_venc_n, v_venc_clp
      FROM fin.gasto g
     WHERE g.gasto_fijo_id IS NOT NULL AND g.estado <> 'anulado' AND g.eliminado_en IS NULL AND g.vence < v_hoy AND fin.fn_saldo_gasto(g.id) > 0;
    -- Categorías que casi toda empresa de transporte paga todos los meses y que no tienen ningún gasto fijo cargado
    SELECT string_agg(cc.nombre, '; ' ORDER BY cc.codigo) INTO v_sin_cat
      FROM fin.cuenta_contable cc
     WHERE cc.eliminado_en IS NULL AND cc.imputable AND cc.activa AND cc.tipo IN ('costo', 'gasto')
       AND (coalesce(cc.uso, '') IN ('SEGUROS_FLOTA', 'PERMISOS') OR cc.codigo IN ('6.1.03', '6.1.04', '6.1.06', '6.1.07'))
       AND NOT EXISTS (SELECT 1 FROM fin.gasto_fijo gf WHERE gf.cuenta_id = cc.id AND gf.activo AND gf.eliminado_en IS NULL);

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
            SELECT string_agg(z.etiqueta, ', ') INTO v_deja FROM (
                SELECT a.etiqueta FROM ia.fn_fijos_del_mes((v_m - interval '1 month')::date) a
                 WHERE a.clase = 'no_es_costo' AND NOT EXISTS (SELECT 1 FROM ia.fn_fijos_del_mes(v_m) b WHERE b.id = a.id)
                 ORDER BY a.a_pagar_clp DESC NULLS LAST LIMIT 4) z;
            SELECT string_agg(z.etiqueta, ', ') INTO v_emp_pago FROM (
                SELECT b.etiqueta FROM ia.fn_fijos_del_mes(v_m) b
                 WHERE b.clase = 'no_es_costo' AND NOT EXISTS (SELECT 1 FROM ia.fn_fijos_del_mes((v_m - interval '1 month')::date) a WHERE a.id = b.id)
                 ORDER BY b.a_pagar_clp DESC NULLS LAST LIMIT 4) z;
            v_fut := v_fut || jsonb_strip_nulls(jsonb_build_object(
                'mes', to_char(v_m, 'MM/YYYY'), 'a_cubrir_usd', round(v_cub_m), 'gastos_fijos_a_pagar_usd', round(f.pagar),
                'operaciones_para_cubrir', CASE WHEN v_aporte > 0 THEN ceil(v_cub_m / v_aporte) END,
                'termina', v_term, 'empieza', v_emp,
                'se_termina_de_pagar', v_deja, 'se_empieza_a_pagar', v_emp_pago));
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
    IF v_sin_cat IS NOT NULL THEN
        v_notas := v_notas || ('No hay ningún gasto fijo cargado en estas categorías: ' || v_sin_cat || '. Si la empresa los paga, falta cargarlos y lo que hay que cubrir queda corto.');
    END IF;
    IF v_parece_incompleto THEN
        v_notas := v_notas || format('Los gastos fijos cargados dan %s USD por camión y por día, y la cuenta del viaje supone %s: lo más probable es que todavía falten gastos fijos por cargar (o el valor de los tractores propios para su depreciación).',
                                     v_fijo_dia_real, v_fijo_dia_param);
    END IF;
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
            'operaciones_de_mas_o_de_menos_a_fin_de_mes', v_proy - v_eq,
            'contando_tambien_lo_que_se_paga_y_no_es_gasto', CASE WHEN v_no_costo > 0 THEN jsonb_build_object(
                'usd_por_mes', round(v_caja), 'operaciones_por_mes', v_eq_caja, 'se_llega', v_proy >= v_eq_caja,
                'que_es', 'Suma las cuotas de vehículos comprados y préstamos (plata que sale aunque no sea gasto).') END,
            'si_los_fijos_fueran_los_de_la_cuenta_del_viaje', jsonb_build_object(
                'usd_por_mes', round(v_cubrir_cv), 'operaciones_por_mes', v_eq_cv, 'se_llega', v_proy >= v_eq_cv),
            'ojo', CASE WHEN v_parece_incompleto THEN 'Parece que faltan gastos fijos por cargar. Mientras tanto decí los dos números: con lo cargado hacen falta '
                || v_eq || ' operaciones por mes; con los fijos que supone la cuenta del viaje, ' || v_eq_cv || '. El real va a estar entre los dos.' END)
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
            'pagos_que_no_son_gasto', CASE WHEN jsonb_array_length(v_pagos) > 0 THEN v_pagos END,
            'cuotas_vencidas_sin_pagar', CASE WHEN v_venc_n > 0 THEN jsonb_build_object('cantidad', v_venc_n, 'usd', round(v_venc_clp / v_tc),
                'que_es', 'Deuda ya vencida de gastos fijos (cuotas atrasadas). No está en lo que hay que cubrir por mes: hay que pagarla aparte.') END,
            'categorias_sin_ningun_gasto_fijo', v_sin_cat,
            'por_categoria', v_cat, 'sueldos_por_area', CASE WHEN jsonb_array_length(v_areas) > 0 THEN v_areas END, 'los_mas_grandes', v_grandes,
            'camiones', v_camiones,
            'fijo_real_por_camion_por_dia_usd', v_fijo_dia_real,
            'fijo_que_usa_la_cuenta_del_viaje_usd', v_fijo_dia_param,
            'nota', CASE WHEN v_parece_incompleto
                THEN 'El fijo real por camión (sin choferes) da bastante menos que el de la cuenta del viaje. Antes de bajar el parámetro hay que completar lo que falta cargar: no recomiendes cambiarlo todavía.'
                WHEN v_fijo_dia_real > v_fijo_dia_param * 1.2
                THEN 'El fijo real por camión (sin choferes) da más que el de la cuenta del viaje: conviene que Gerencia revise el parámetro ia.costeo_fijo_dia_usd, porque los precios se están calculando con menos costo del real.'
                ELSE 'El fijo real por camión (sin choferes) está en línea con el de la cuenta del viaje.' END),
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

-- Regla 28, agregado: los dos números cuando faltan gastos fijos por cargar, la caja y las cuotas vencidas
DO $do$
DECLARE
    v_def text := pg_get_functiondef('ia.fn_instrucciones_asistente()'::regprocedure);
    v_ancla constant text := 'para el detalle por cliente, «negocio_clientes».''';
    v_nuevo constant text := $t$
        || ' Si «punto_de_equilibrio» trae «ojo», decí los dos números (con lo cargado y con los fijos de la cuenta del viaje) y que el real está entre los dos porque faltan gastos fijos por cargar; no des uno solo. '
        || 'Si preguntan por la caja, por lo que hay que pagar o por las deudas, usá «contando_tambien_lo_que_se_paga_y_no_es_gasto», «pagos_que_no_son_gasto» y «cuotas_vencidas_sin_pagar»; '
        || 'las cuotas vencidas son deuda atrasada: nombralas aparte, en una frase, y no las sumes a lo que hay que cubrir por mes.'$t$;
BEGIN
    IF v_def LIKE '%«cuotas_vencidas_sin_pagar»%' THEN RETURN; END IF;
    IF position(v_ancla IN v_def) = 0 THEN
        RAISE EXCEPTION 'ia.fn_instrucciones_asistente no es la que esperaba esta migración (falta la regla 28 de iris_11): avisar antes de seguir';
    END IF;
    EXECUTE replace(v_def, v_ancla, v_ancla || v_nuevo);
END $do$;

DO $do$
BEGIN
    IF NOT has_function_privilege('tc_lectura', 'ia.fn_lectura_proyeccion(jsonb)', 'EXECUTE') OR NOT has_function_privilege('tc_app', 'ia.fn_lectura_proyeccion(jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'La lectura quedó sin el permiso de la web: avisar antes de seguir';
    END IF;
END $do$;

COMMIT;
