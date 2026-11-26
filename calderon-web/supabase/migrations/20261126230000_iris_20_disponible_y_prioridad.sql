-- =====================================================================================
-- Iris 20 · Disponible hoy, la plata por moneda y «pagar primero»
-- =====================================================================================
-- Acompaña a la migración 369. Iris ahora puede contestar «¿cuánto podemos usar?» con un solo número y su cuenta,
-- avisa cuando hay que comprar o vender moneda, y respeta lo que Gerencia o Finanzas marcaron como «pagar primero».
--   · «reparto_plata» trae «disponible», la plata por moneda y la marca en cada renglón.
--   · «situacion_financiera» trae «disponible_hoy» y la caja por moneda.
--   · «deudas» dice qué contratos, proveedores o deudas están marcados.
--   · Las instrucciones suman F9 (disponible), F10 (monedas) y F11 («pagar primero»), al final del bloque de finanzas.
-- Solo leen. Ninguna lectura muestra sueldos ni fondos por persona (sigue igual que en iris_19).
-- Necesita iris_19 y la migración 369. No cambia datos ni web.version_base. Se puede correr más de una vez.
-- Antes de terminar corre las lecturas con los datos de la base: si una falla, no deja nada aplicado.
-- No se pudo probar contra el modelo real: las lecturas y las instrucciones se probaron en la copia.
-- =====================================================================================
BEGIN;

DO $v$
BEGIN
    IF to_regprocedure('ia.fn_lectura_reparto_plata(jsonb)') IS NULL OR to_regprocedure('ia.fn_lectura_situacion_financiera(jsonb)') IS NULL
       OR to_regprocedure('ia.fn_fin_deudas(jsonb, text)') IS NULL OR to_regprocedure('ia.fn_fin_grupo(text, bigint)') IS NULL
       OR pg_get_functiondef('ia.fn_instrucciones_asistente()'::regprocedure) NOT LIKE '%«reparto_plata»%' THEN
        RAISE EXCEPTION 'Falta iris_19 (20261126210000_iris_19_finanzas.sql): correrla antes que esta';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'fin' AND table_name = 'plan_caja_mora' AND column_name = 'pagar_primero') THEN
        RAISE EXCEPTION 'Falta la migración 369 (20261126220000_disponible_hoy_y_pagar_primero.sql): correrla antes que esta';
    END IF;
END $v$;

-- ---------------------------------------------------------------------------------
-- 1 · Las lecturas (las mismas de iris_19, con lo nuevo)
-- ---------------------------------------------------------------------------------
-- ── Lo que debemos: ahora dice qué está marcado «pagar primero» ─────────────────────────
CREATE OR REPLACE FUNCTION ia.fn_fin_deudas(p_plan jsonb, p_acreedor text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE
    v_hoy date := (p_plan ->> 'hoy')::date;
    v_filtro text := nullif(btrim(coalesce(p_acreedor, '')), '');
    v_todo jsonb := fin.fn_plan_caja_salidas(p_plan);
    v_sal jsonb; v_vienen jsonb;
    v_clases jsonb; v_contratos jsonb; v_tot_contratos jsonb; v_prov jsonb; v_otras jsonb; v_interes jsonb; v_costo jsonb; v_detalle jsonb;
    v_total numeric; v_vencido numeric; v_7 numeric; v_30 numeric;
BEGIN
    -- Deuda de hoy: los documentos que ya existen y lo que ya venció. Lo que viene (gastos fijos y cuotas sin generar) va aparte.
    SELECT coalesce(jsonb_agg(e) FILTER (WHERE e ->> 'origen' <> 'fijo' OR (e ->> 'vence')::date < v_hoy), '[]'::jsonb),
           jsonb_build_object('monto_clp', coalesce(sum((e ->> 'clp')::numeric) FILTER (WHERE e ->> 'origen' = 'fijo' AND (e ->> 'vence')::date >= v_hoy), 0),
                              'cantidad', count(*) FILTER (WHERE e ->> 'origen' = 'fijo' AND (e ->> 'vence')::date >= v_hoy),
                              'hasta', p_plan ->> 'hasta', 'que_es', 'Gastos fijos y cuotas de los meses que vienen, que todavía no se generaron.')
      INTO v_sal, v_vienen
      FROM jsonb_array_elements(v_todo) e;
    SELECT coalesce(sum((e ->> 'clp')::numeric) FILTER (WHERE e ->> 'origen' <> 'fijo' OR (e ->> 'vence')::date < v_hoy), 0),
           coalesce(sum((e ->> 'clp')::numeric) FILTER (WHERE (e ->> 'vence')::date < v_hoy), 0),
           coalesce(sum((e ->> 'clp')::numeric) FILTER (WHERE coalesce((e ->> 'vence')::date, (e ->> 'fecha')::date) BETWEEN v_hoy AND v_hoy + 7), 0),
           coalesce(sum((e ->> 'clp')::numeric) FILTER (WHERE coalesce((e ->> 'vence')::date, (e ->> 'fecha')::date) BETWEEN v_hoy AND v_hoy + 30), 0)
      INTO v_total, v_vencido, v_7, v_30
      FROM jsonb_array_elements(v_todo) e;

    SELECT coalesce(jsonb_agg(jsonb_build_object('que', x.nombre, 'se_debe_clp', x.total, 'vencido_clp', x.vencido, 'cantidad', x.n) ORDER BY x.orden), '[]'::jsonb) INTO v_clases
      FROM (SELECT k.nombre, k.orden, sum((e ->> 'clp')::numeric) AS total,
                   coalesce(sum((e ->> 'clp')::numeric) FILTER (WHERE (e ->> 'vence')::date < v_hoy), 0) AS vencido, count(*) AS n
              FROM jsonb_array_elements(v_sal) e
              JOIN (VALUES ('cuota', 'Cuotas de leasing y créditos', 1), ('sueldo', 'Sueldos', 2), ('impuesto', 'Impuestos', 3), ('proveedor', 'Proveedores y gastos', 4),
                           ('operativo', 'Combustible y fondos a choferes', 5), ('otra', 'Otras salidas previstas', 6)) k(clase, nombre, orden) ON k.clase = e ->> 'clase'
             GROUP BY k.nombre, k.orden) x;

    -- Contratos en cuotas
    SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
               'contrato', c.contrato, 'a_quien', c.proveedor, 'cuota_clp', c.cuota_clp,
               'cuota_en_su_moneda', CASE WHEN c.moneda <> 'CLP' THEN c.cuota || ' ' || c.moneda END,
               'va_en_la_cuota', c.cuota_actual || ' de ' || c.cuotas, 'cuotas_vencidas', c.vencidas, 'vencido_clp', c.vencido_clp,
               'la_mas_vieja_vencio', c.mas_vieja, 'la_proxima_vence', c.proxima, 'cuotas_futuras', c.faltan,
               'saldo_que_falta_pagar_clp', c.saldo_clp, 'interes_por_mes_pct', c.tasa,
               'pagar_primero', CASE WHEN EXISTS (SELECT 1 FROM fin.plan_caja_mora pm WHERE pm.origen = 'fijo' AND pm.origen_id = c.id AND pm.pagar_primero) THEN true END,
               'el_interes_sale_de', CASE c.tasa_fuente WHEN 'cargada' THEN 'lo cargó Gerencia o Finanzas' WHEN 'observada' THEN 'la mora que ya cobró en el último año' END))
               ORDER BY c.vencidas DESC, c.vencido_clp DESC, c.contrato), '[]'::jsonb),
           jsonb_build_object('contratos', count(*), 'cuota_de_cada_mes_clp', coalesce(sum(c.cuota_clp), 0), 'cuotas_vencidas', coalesce(sum(c.vencidas), 0),
                              'vencido_clp', coalesce(sum(c.vencido_clp), 0), 'saldo_que_falta_pagar_clp', coalesce(sum(c.saldo_clp), 0),
                              'contratos_sin_el_dato_del_interes', count(*) FILTER (WHERE c.tasa IS NULL))
      INTO v_contratos, v_tot_contratos
      FROM fin.fn_plan_caja_contratos() c;

    -- Proveedores
    WITH pr AS (
        SELECT coalesce(e ->> 'acreedor', e ->> 'titulo') AS proveedor, bool_or((e ->> 'critico')::boolean) AS critico,
               sum((e ->> 'clp')::numeric) AS debe, coalesce(sum((e ->> 'clp')::numeric) FILTER (WHERE (e ->> 'vence')::date < v_hoy), 0) AS vencido,
               count(*) AS n, max((e ->> 'dias_atraso')::integer) AS mas_vieja, max((e ->> 'tasa')::numeric) AS tasa, max(e ->> 'tasa_fuente') AS fuente,
               bool_or(coalesce((e ->> 'primero')::boolean, false)) AS primero
          FROM jsonb_array_elements(v_sal) e WHERE e ->> 'clase' = 'proveedor'
         GROUP BY 1
    ), ord AS (SELECT p.*, row_number() OVER (ORDER BY p.vencido DESC, p.debe DESC, p.proveedor) AS puesto FROM pr p)
    SELECT jsonb_build_object(
               'los_que_mas_se_les_debe', coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                   'proveedor', o.proveedor, 'se_le_debe_clp', o.debe, 'vencido_clp', o.vencido, 'documentos', o.n,
                   'lo_mas_viejo_vencio_hace_dias', nullif(o.mas_vieja, 0), 'interes_por_mes_pct', o.tasa,
                   'el_interes_sale_de', CASE o.fuente WHEN 'cargada' THEN 'lo cargó Gerencia o Finanzas' WHEN 'observada' THEN 'la mora que ya cobró en el último año' END,
                   'es_de_combustible', CASE WHEN o.critico THEN true END, 'pagar_primero', CASE WHEN o.primero THEN true END))
                   ORDER BY o.puesto) FILTER (WHERE o.puesto <= 15), '[]'::jsonb),
               'el_resto', jsonb_build_object('proveedores', count(*) FILTER (WHERE o.puesto > 15), 'se_les_debe_clp', coalesce(sum(o.debe) FILTER (WHERE o.puesto > 15), 0),
                                              'vencido_clp', coalesce(sum(o.vencido) FILTER (WHERE o.puesto > 15), 0)))
      INTO v_prov FROM ord o;

    -- Impuestos y otras deudas cargadas
    SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('que', e ->> 'titulo', 'clase', CASE e ->> 'clase' WHEN 'impuesto' THEN 'impuesto' ELSE 'otra' END,
               'vence', e ->> 'vence', 'vencida_hace_dias', nullif((e ->> 'dias_atraso')::integer, 0), 'monto_clp', (e ->> 'clp')::numeric,
               'interes_por_mes_pct', (e ->> 'tasa')::numeric, 'pagar_primero', CASE WHEN (e ->> 'primero')::boolean THEN true END))
               ORDER BY (e ->> 'vence')::date NULLS LAST), '[]'::jsonb)
      INTO v_otras
      FROM (SELECT e FROM jsonb_array_elements(v_sal) e WHERE e ->> 'clase' IN ('impuesto', 'otra') ORDER BY (e ->> 'vence')::date NULLS LAST LIMIT 15) q;

    -- El interés que se genera por mes con lo vencido (solo donde se sabe la tasa)
    SELECT jsonb_build_object(
               'por_mes_clp', coalesce(round(sum((e ->> 'clp')::numeric * (e ->> 'tasa')::numeric / 100) FILTER (WHERE (e ->> 'tasa')::numeric > 0)), 0),
               'vencido_con_dato_del_interes_clp', coalesce(sum((e ->> 'clp')::numeric) FILTER (WHERE e ->> 'tasa' IS NOT NULL), 0),
               'vencido_sin_dato_del_interes_clp', coalesce(sum((e ->> 'clp')::numeric) FILTER (WHERE e ->> 'tasa' IS NULL), 0),
               'como_se_calcula', 'Lo vencido de cada deuda × su interés por mes. Es una estimación: no incluye multas ni gastos de cobranza.')
      INTO v_interes
      FROM jsonb_array_elements(v_sal) e WHERE (e ->> 'vence')::date < v_hoy AND e ->> 'clase' IN ('cuota', 'proveedor', 'impuesto', 'otra');

    -- Lo que ya costó pagar tarde (recargos anotados al pagar)
    SELECT jsonb_build_object('ultimos_90_dias_clp', coalesce(sum(round(r.total * r.tc_clp)) FILTER (WHERE r.fecha > v_hoy - 90), 0),
                              'ultimos_12_meses_clp', coalesce(sum(round(r.total * r.tc_clp)), 0), 'recargos', count(*))
      INTO v_costo
      FROM fin.gasto r WHERE r.recargo_de_id IS NOT NULL AND r.estado <> 'anulado' AND r.eliminado_en IS NULL AND r.fecha > v_hoy - 365;

    IF v_filtro IS NOT NULL THEN
        -- Los sueldos y los fondos de los choferes no se buscan por el nombre de la persona ni se muestran de a uno: van sumados por grupo
        WITH t AS MATERIALIZED (
            SELECT e, ia.fn_fin_grupo(e ->> 'origen', (e ->> 'id')::bigint) AS grupo,
                   (e ->> 'origen' = 'fijo' AND (e ->> 'vence')::date >= v_hoy) AS futuro
              FROM jsonb_array_elements(v_todo) e
        ), f AS MATERIALIZED (
            SELECT t.e, t.grupo, t.futuro FROM t
             WHERE translate(lower(coalesce(t.grupo, concat_ws(' ', t.e ->> 'acreedor', t.e ->> 'titulo'))), 'áéíóúü', 'aeiouu')
                   LIKE '%' || translate(lower(v_filtro), 'áéíóúü', 'aeiouu') || '%'
        ), r AS (
            SELECT (f.e ->> 'vence')::date AS vence, jsonb_strip_nulls(jsonb_build_object(
                       'a_quien', f.e ->> 'acreedor', 'que', f.e ->> 'titulo', 'detalle', f.e ->> 'detalle',
                       'vence', f.e ->> 'vence', 'vencida_hace_dias', nullif((f.e ->> 'dias_atraso')::integer, 0), 'monto_clp', (f.e ->> 'clp')::numeric,
                       'en_su_moneda', CASE WHEN f.e ->> 'moneda' <> 'CLP' THEN (f.e ->> 'monto') || ' ' || (f.e ->> 'moneda') END,
                       'se_piensa_pagar', f.e ->> 'fecha', 'interes_por_mes_pct', (f.e ->> 'tasa')::numeric, 'nota', f.e ->> 'nota',
                       'pagar_primero', CASE WHEN (f.e ->> 'primero')::boolean THEN true END,
                       'todavia_no_se_genero', CASE WHEN f.futuro THEN true END)) AS j
              FROM f WHERE f.grupo IS NULL
            UNION ALL
            SELECT min(coalesce((f.e ->> 'vence')::date, (f.e ->> 'fecha')::date)), jsonb_strip_nulls(jsonb_build_object(
                       'que', f.grupo, 'cantidad', count(*), 'monto_clp', sum((f.e ->> 'clp')::numeric),
                       'atrasado_clp', nullif(coalesce(sum((f.e ->> 'clp')::numeric) FILTER (WHERE (f.e ->> 'dias_atraso')::integer > 0), 0), 0),
                       'se_pagan_desde', min(coalesce((f.e ->> 'fecha')::date, (f.e ->> 'vence')::date)),
                       'todavia_no_se_genero', CASE WHEN f.futuro THEN true END,
                       'como_se_muestra', 'sumado por grupo: los sueldos y los fondos no van por persona'))
              FROM f WHERE f.grupo IS NOT NULL GROUP BY f.grupo, f.futuro
        )
        SELECT coalesce(jsonb_agg(q.j ORDER BY q.vence NULLS LAST), '[]'::jsonb) INTO v_detalle
          FROM (SELECT r.j, r.vence FROM r ORDER BY r.vence NULLS LAST LIMIT 40) q;
    END IF;

    RETURN jsonb_strip_nulls(jsonb_build_object(
        'se_debe_hoy_clp', v_total, 'vencido_clp', v_vencido, 'vence_en_7_dias_clp', v_7, 'vence_en_30_dias_clp', v_30,
        'por_clase', v_clases, 'ademas_viene', v_vienen,
        'contratos_en_cuotas', jsonb_build_object('total', v_tot_contratos, 'contratos', v_contratos),
        'proveedores', v_prov,
        'impuestos_y_otras', v_otras,
        'interes_que_se_esta_generando', v_interes,
        'lo_que_ya_costo_pagar_tarde', v_costo,
        'detalle_de_lo_pedido', v_detalle,
        'marcados_pagar_primero', (SELECT jsonb_agg(DISTINCT coalesce(e ->> 'acreedor', e ->> 'titulo')) FROM jsonb_array_elements(v_sal) e
                                    WHERE (e ->> 'primero')::boolean AND e ->> 'clase' IN ('cuota', 'proveedor', 'impuesto', 'otra')),
        'ojo', 'Solo figura lo cargado en el sistema. Impuestos, imposiciones o préstamos que no estén cargados (como gasto, gasto fijo o salida prevista del planificador) no aparecen.'));
END $f$;

-- ── Qué hacer con la plata: ahora trae el disponible, la plata por moneda y la marca en cada renglón ──
CREATE OR REPLACE FUNCTION ia.fn_lectura_reparto_plata(p_entrada jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
 SET jit TO 'off'
AS $f$
DECLARE
    e jsonb := coalesce(p_entrada, '{}'::jsonb); o jsonb; r jsonb; p jsonb; v_pasos jsonb := '[]'::jsonb; v_reng jsonb; v_no jsonb; n integer := 0;
    c_nombres constant jsonb := '{"cuotas": "una cuota de cada leasing o crédito", "sueldos": "guardar para los sueldos", "espalda": "espalda para operar", "deudas": "cancelar deudas vencidas"}';
BEGIN
    IF NOT (ia.fn_puede_asistente() OR session_user = 'postgres') THEN RAISE EXCEPTION 'Iris es para Gerencia' USING ERRCODE = '42501'; END IF;
    IF e ? 'entra' AND jsonb_typeof(e -> 'entra') <> 'null' AND ia.fn_monto(e -> 'entra') IS NULL THEN
        RAISE EXCEPTION 'No entendí cuánta plata entra: mandá el número completo, por ejemplo 150000000' USING ERRCODE = '22023';
    END IF;
    o := jsonb_strip_nulls(jsonb_build_object(
             'entra', ia.fn_monto(e -> 'entra'), 'entra_moneda', upper(ia.fn_texto(e -> 'entra_moneda', 3)), 'usar_caja', ia.fn_si(e -> 'usar_caja'),
             'espalda', ia.fn_monto(e -> 'espalda'), 'reserva_sueldos_dias', ia.fn_num(e -> 'reserva_sueldos_dias'),
             'orden', CASE WHEN jsonb_typeof(e -> 'orden') = 'array' THEN e -> 'orden' END));
    r := fin.fn_plan_caja_reparto_calcular(o);

    FOR p IN SELECT x FROM jsonb_array_elements(r -> 'pasos') x LOOP
        n := n + 1;
        v_no := NULL;
        IF p ->> 'codigo' = 'sueldos' THEN
            -- Por grupo, nunca por persona
            SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('que', q.que, 'cantidad', nullif(q.n, 1), 'monto_clp', q.clp, 'se_pagan_desde', q.desde,
                              'atrasados_clp', nullif(q.atrasado, 0))) ORDER BY q.clp DESC), '[]'::jsonb) INTO v_reng
              FROM (SELECT coalesce(ia.fn_fin_grupo(i ->> 'origen', (i ->> 'id')::bigint), 'Sueldos') AS que, count(*) AS n, sum((i ->> 'clp')::numeric) AS clp,
                           min(coalesce((i ->> 'fecha')::date, (i ->> 'vence')::date)) AS desde,
                           coalesce(sum((i ->> 'clp')::numeric) FILTER (WHERE (i ->> 'dias_atraso')::integer > 0), 0) AS atrasado
                      FROM jsonb_array_elements(p -> 'items') i GROUP BY 1 ORDER BY 3 DESC LIMIT 15) q;
        ELSIF p ->> 'codigo' = 'espalda' THEN
            SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('ya_anotado_para_estos_dias', q.que, 'cantidad', nullif(q.n, 1), 'monto_clp', q.clp)) ORDER BY q.clp DESC), '[]'::jsonb) INTO v_reng
              FROM (SELECT coalesce(ia.fn_fin_grupo(i ->> 'origen', (i ->> 'id')::bigint), i ->> 'titulo') AS que, count(*) AS n, sum((i ->> 'clp')::numeric) AS clp
                      FROM jsonb_array_elements(p -> 'items') i GROUP BY 1 ORDER BY 3 DESC LIMIT 6) q;
        ELSE
            SELECT coalesce(jsonb_agg(q.j), '[]'::jsonb) INTO v_reng
              FROM (SELECT jsonb_strip_nulls(jsonb_build_object(
                               'a_quien', i ->> 'acreedor', 'que', i ->> 'titulo', 'vence', i ->> 'vence', 'vencida_hace_dias', nullif((i ->> 'dias_atraso')::integer, 0),
                               'monto_clp', (i ->> 'clp')::numeric, 'en_su_moneda', CASE WHEN i ->> 'moneda' <> 'CLP' THEN (i ->> 'monto') || ' ' || (i ->> 'moneda') END,
                               'se_paga', (i ->> 'se_paga')::boolean, 'interes_por_mes_pct', (i ->> 'tasa')::numeric,
                               'el_interes_sale_de', CASE i ->> 'tasa_fuente' WHEN 'cargada' THEN 'lo cargó Gerencia o Finanzas' WHEN 'observada' THEN 'la mora que ya cobró en el último año' END,
                               'otras_cuotas_vencidas_del_contrato', nullif((i ->> 'mas_vencidas')::integer, 0), 'otras_vencidas_clp', nullif((i ->> 'mas_vencidas_clp')::numeric, 0),
                               'es_de_combustible', CASE WHEN (i ->> 'critico')::boolean THEN true END,
                               'pagar_primero', CASE WHEN (i ->> 'primero')::boolean THEN true END)) AS j
                      FROM jsonb_array_elements(p -> 'items') WITH ORDINALITY t(i, pos) ORDER BY pos LIMIT 15) q;
            SELECT jsonb_build_object('cantidad', count(*), 'monto_clp', coalesce(sum((i ->> 'clp')::numeric), 0),
                                      'de_esos_se_pagan_clp', coalesce(sum((i ->> 'clp')::numeric) FILTER (WHERE (i ->> 'se_paga')::boolean), 0))
              INTO v_no
              FROM jsonb_array_elements(p -> 'items') WITH ORDINALITY t(i, pos) WHERE pos > 15 HAVING count(*) > 0;
        END IF;
        v_pasos := v_pasos || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object(
            'paso', n, 'para_que', p ->> 'titulo', 'como_se_arma', p ->> 'que_es', 'hace_falta_clp', (p ->> 'necesita')::numeric, 'se_asigna_clp', (p ->> 'asignado')::numeric,
            'falta_clp', nullif((p ->> 'falta')::numeric, 0), 'queda_despues_clp', (p ->> 'queda_despues')::numeric, 'renglones', v_reng, 'renglones_que_no_se_muestran', v_no,
            'gasto_de_operar_ultimos_30_dias', p -> 'gasto_operativo', 'dias_de_operacion_que_cubre', p -> 'dias_que_cubre',
            'ya_anotado_para_estos_dias_clp', p -> 'comprometido')));
    END LOOP;

    RETURN jsonb_strip_nulls(jsonb_build_object(
        'hoy', r ->> 'hoy', 'moneda', 'CLP',
        'plata', jsonb_build_object('en_caja_hoy_clp', r #> '{dinero,en_caja}', 'se_cuenta_la_caja', r #> '{dinero,usa_caja}', 'entra_clp', r #> '{dinero,entra_clp}',
                                    'entra_en_su_moneda', CASE WHEN r #>> '{dinero,entra_moneda}' <> 'CLP' THEN (r #>> '{dinero,entra}') || ' ' || (r #>> '{dinero,entra_moneda}') END,
                                    'para_repartir_clp', r #> '{dinero,total}',
                                    'por_moneda', (SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                                                              'moneda', z ->> 'moneda', 'hay', (z ->> 'tiene')::numeric,
                                                              'en_clp_al_cambio_de_hoy', CASE WHEN z ->> 'moneda' <> 'CLP' THEN (z ->> 'tiene_clp')::numeric END,
                                                              'este_reparto_usa', (z ->> 'se_usa')::numeric, 'sobra_o_falta_en_esa_moneda', (z ->> 'diferencia')::numeric)))
                                                     FROM jsonb_array_elements(r #> '{dinero,por_moneda}') z),
                                    'como_leer_por_moneda', 'En «este_reparto_usa» no está la espalda (no tiene una moneda fija). Si «sobra_o_falta_en_esa_moneda» es negativo, falta esa moneda para pagar.'),
        'disponible', CASE WHEN r ? 'disponible' THEN jsonb_build_object(
            'disponible_clp', r #> '{disponible,monto}',
            'cuenta', jsonb_build_object('plata_para_repartir_clp', r #> '{disponible,plata}', 'menos_cuotas_de_estos_dias_clp', r #> '{disponible,cuotas}',
                                         'menos_sueldos_que_vienen_clp', r #> '{disponible,sueldos}', 'menos_espalda_clp', r #> '{disponible,espalda}'),
            'deudas_vencidas_por_cancelar_clp', r #> '{disponible,deudas_vencidas}', 'vence_en_7_dias_y_no_se_guarda_clp', r #> '{disponible,vence_7_dias}',
            'que_es', 'La plata menos lo que ya tiene destino. Si es positivo, se puede usar sin tocar lo planificado (la propuesta lo manda a cancelar deudas vencidas). Si es negativo, es lo que falta para cubrir cuotas, sueldos y espalda.') END,
        'reglas_de_gerencia', jsonb_build_object(
            'orden', (SELECT jsonb_agg(c_nombres ->> x ORDER BY i) FROM jsonb_array_elements_text(r #> '{reglas,orden}') WITH ORDINALITY t(x, i)),
            'espalda_clp', r #> '{reglas,espalda}', 'dias_de_sueldos_que_se_guardan', r #> '{reglas,reserva_sueldos_dias}',
            'se_esta_probando_otra_cosa', CASE WHEN (r -> 'reglas') - 'guardadas' IS DISTINCT FROM r #> '{reglas,guardadas}' THEN true END,
            'las_guardadas', CASE WHEN (r -> 'reglas') - 'guardadas' IS DISTINCT FROM r #> '{reglas,guardadas}' THEN r #> '{reglas,guardadas}' END),
        'pasos', v_pasos,
        'se_reparte_clp', r -> 'repartido', 'sobra_clp', r -> 'sobra', 'queda_sin_cubrir_clp', r -> 'sin_cubrir',
        'interes_por_mes', jsonb_build_object('se_deja_de_generar_clp', r #> '{interes,se_corta_por_mes}', 'sigue_generandose_clp', r #> '{interes,sigue_por_mes}',
                                              'como_se_calcula', 'Lo vencido × su interés por mes, solo en las deudas donde se conoce el interés.'),
        'vence_en_7_dias_y_no_se_guarda', jsonb_build_object('monto_clp', r #> '{vence_pronto,monto}', 'cantidad', r #> '{vence_pronto,cantidad}',
            'renglones', (SELECT coalesce(jsonb_agg(q.j), '[]'::jsonb) FROM (SELECT jsonb_build_object('que', i ->> 'titulo', 'vence', i ->> 'vence', 'monto_clp', (i ->> 'clp')::numeric) AS j
                            FROM jsonb_array_elements(r #> '{vence_pronto,items}') i ORDER BY (i ->> 'clp')::numeric DESC LIMIT 6) q)),
        'avisos', r -> 'avisos',
        'como_leerlo', 'Es una propuesta armada con las reglas que puso Gerencia: no registra ningún pago. Los pagos se hacen en Finanzas › Cobros y pagos › Por pagar; las reglas, el interés de cada deuda y la marca «pagar primero» se cambian en el Planificador de caja.'));
END $f$;

-- ── La foto de hoy: ahora trae el disponible de hoy y la caja por moneda ────────────────
CREATE OR REPLACE FUNCTION ia.fn_lectura_situacion_financiera(p_entrada jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
 SET jit TO 'off'
AS $f$
DECLARE
    v_hoy date := mae.fn_hoy(); v_plan jsonb; v_res jsonb; v_cob jsonb; v_deu jsonb; v_oper jsonb; v_caja numeric; v_pordia numeric;
    v_seguro_30 numeric; v_faltan text[] := '{}'; v_no text[] := '{}'; a text; v_rep jsonb;
BEGIN
    IF NOT (ia.fn_puede_asistente() OR session_user = 'postgres') THEN RAISE EXCEPTION 'Iris es para Gerencia' USING ERRCODE = '42501'; END IF;
    v_plan := fin.fn_plan_caja_calcular('{"moneda": "CLP"}'::jsonb);
    v_res := v_plan -> 'resumen';
    v_caja := coalesce((v_plan #>> '{caja,total}')::numeric, 0);
    BEGIN v_cob := ia.fn_fin_cobranzas(v_plan, NULL); EXCEPTION WHEN OTHERS THEN v_no := v_no || ('lo que nos deben (' || SQLERRM || ')'); END;
    BEGIN v_deu := ia.fn_fin_deudas(v_plan, NULL); EXCEPTION WHEN OTHERS THEN v_no := v_no || ('lo que debemos (' || SQLERRM || ')'); END;
    BEGIN v_oper := fin.fn_plan_caja_gasto_operativo(30); EXCEPTION WHEN OTHERS THEN v_no := v_no || ('el gasto de operar (' || SQLERRM || ')'); END;
    BEGIN v_rep := fin.fn_plan_caja_reparto_calcular('{}'::jsonb); EXCEPTION WHEN OTHERS THEN v_no := v_no || ('el disponible de hoy (' || SQLERRM || ')'); END;
    v_pordia := nullif((v_oper ->> 'por_dia')::numeric, 0);
    -- Cobros seguros de los próximos 30 días (los que el plan cuenta como seguros)
    SELECT coalesce(sum(p.monto_vista), 0) INTO v_seguro_30
      FROM jsonb_to_recordset(v_plan -> 'partidas') AS p(sentido text, fecha date, monto_vista numeric, certeza text, cubo text)
     WHERE p.sentido = 'entrada' AND p.cubo = 'semana' AND p.certeza = 'segura' AND p.fecha <= v_hoy + 30;

    FOR a IN SELECT x FROM jsonb_array_elements_text(v_plan -> 'avisos') x LOOP v_faltan := v_faltan || a; END LOOP;
    IF (v_deu #>> '{interes_que_se_esta_generando,vencido_sin_dato_del_interes_clp}')::numeric > 0 THEN
        v_faltan := v_faltan || ('Hay ' || translate(to_char((v_deu #>> '{interes_que_se_esta_generando,vencido_sin_dato_del_interes_clp}')::numeric, 'FM999G999G999G990'), ',', '.')
                    || ' CLP de deuda vencida sin el dato de cuánto cobra de interés: se carga en el Planificador de caja.');
    END IF;

    RETURN jsonb_strip_nulls(jsonb_build_object(
        'hoy', v_hoy, 'moneda', 'CLP',
        'caja', jsonb_build_object('hoy_clp', v_caja,
                    'cuentas', (SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('cuenta', c ->> 'nombre', 'saldo', (c ->> 'saldo')::numeric, 'moneda', c ->> 'moneda',
                                                'en_clp', (c ->> 'saldo_vista')::numeric, 'ultima_cartola', c ->> 'cartola_fecha'))), '[]'::jsonb) FROM jsonb_array_elements(v_plan #> '{caja,cuentas}') c)),
        'caja_por_moneda', (SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object('moneda', z ->> 'moneda', 'hay', (z ->> 'en_caja')::numeric,
                                       'en_clp_al_cambio_de_hoy', CASE WHEN z ->> 'moneda' <> 'CLP' THEN (z ->> 'tiene_clp')::numeric END)))
                              FROM jsonb_array_elements(v_rep #> '{dinero,por_moneda}') z WHERE (z ->> 'en_caja')::numeric <> 0),
        'disponible_hoy', CASE WHEN v_rep ? 'disponible' THEN jsonb_build_object(
            'disponible_clp', v_rep #> '{disponible,monto}',
            'cuenta', jsonb_build_object('caja_clp', v_rep #> '{disponible,plata}', 'menos_cuotas_de_estos_dias_clp', v_rep #> '{disponible,cuotas}',
                                         'menos_sueldos_que_vienen_clp', v_rep #> '{disponible,sueldos}', 'menos_espalda_clp', v_rep #> '{disponible,espalda}'),
            'deudas_vencidas_por_cancelar_clp', v_rep #> '{disponible,deudas_vencidas}', 'vence_en_7_dias_clp', v_rep #> '{disponible,vence_7_dias}',
            'que_es', 'La caja de hoy menos lo que ya tiene destino (una cuota de cada leasing o crédito de estos días, los sueldos que vienen y la espalda). Si es negativo, hoy no hay plata libre: es lo que falta para cubrir eso.') END,
        'lo_que_viene', jsonb_build_object(
                    'semanas_miradas', (v_plan ->> 'semanas')::integer, 'entra_clp', v_res -> 'entradas', 'sale_clp', v_res -> 'salidas', 'saldo_al_final_clp', v_res -> 'saldo_final',
                    'punto_mas_bajo', v_res -> 'saldo_minimo', 'primera_semana_sin_caja', v_res -> 'primera_negativa',
                    'si_solo_entra_lo_seguro', jsonb_build_object('punto_mas_bajo', v_res -> 'prudente_minimo', 'primera_semana_sin_caja', v_res -> 'prudente_primera_negativa'),
                    'proximas_4_semanas', (SELECT coalesce(jsonb_agg(jsonb_build_object('desde', s ->> 'desde', 'hasta', s ->> 'hasta', 'entra_clp', (s ->> 'entradas')::numeric,
                                                    'sale_clp', (s ->> 'salidas')::numeric, 'saldo_al_final_clp', (s ->> 'saldo')::numeric,
                                                    'saldo_si_solo_entra_lo_seguro_clp', (s ->> 'saldo_prudente')::numeric) ORDER BY (s ->> 'n')::integer), '[]'::jsonb)
                                             FROM jsonb_array_elements(v_plan -> 'plan') s WHERE (s ->> 'n')::integer < 4),
                    'por_cobrar_vencido_que_no_esta_en_ninguna_semana_clp', v_res #> '{sin_fecha_cobrar,monto}',
                    'por_pagar_sin_fecha_que_no_esta_en_ninguna_semana_clp', v_res #> '{sin_fecha_pagar,monto}'),
        'nos_deben', CASE WHEN v_cob IS NOT NULL THEN jsonb_build_object(
                    'total_clp', v_cob -> 'nos_deben_clp', 'vencido_clp', v_cob -> 'vencido_clp', 'vencido_pct', v_cob -> 'vencido_pct', 'por_antiguedad', v_cob -> 'por_antiguedad',
                    'concentracion', v_cob -> 'concentracion', 'falta_facturar', v_cob -> 'falta_facturar', 'dias_de_cobro', v_cob #> '{ritmo,dias_de_cobro}',
                    'los_que_mas_deben', (SELECT coalesce(jsonb_agg(q.c), '[]'::jsonb) FROM (SELECT jsonb_build_object('cliente', c ->> 'cliente', 'debe_clp', c -> 'debe_clp', 'vencido_clp', c -> 'vencido_clp') AS c
                                            FROM jsonb_array_elements(v_cob -> 'por_cliente') WITH ORDINALITY t(c, i) ORDER BY i LIMIT 5) q)) END,
        'debemos', CASE WHEN v_deu IS NOT NULL THEN jsonb_build_object(
                    'hoy_clp', v_deu -> 'se_debe_hoy_clp', 'vencido_clp', v_deu -> 'vencido_clp', 'vence_en_7_dias_clp', v_deu -> 'vence_en_7_dias_clp',
                    'vence_en_30_dias_clp', v_deu -> 'vence_en_30_dias_clp', 'por_clase', v_deu -> 'por_clase',
                    'deuda_en_cuotas', v_deu #> '{contratos_en_cuotas,total}', 'interes_que_se_esta_generando', v_deu -> 'interes_que_se_esta_generando',
                    'lo_que_ya_costo_pagar_tarde', v_deu -> 'lo_que_ya_costo_pagar_tarde') END,
        'cuanto_aguanta_la_caja', jsonb_build_object(
                    'caja_menos_lo_vencido_por_pagar_clp', v_caja - coalesce((v_deu ->> 'vencido_clp')::numeric, 0),
                    'caja_contra_lo_que_vence_en_7_dias', CASE WHEN (v_deu ->> 'vence_en_7_dias_clp')::numeric > 0 THEN round(v_caja / (v_deu ->> 'vence_en_7_dias_clp')::numeric, 2) END,
                    'caja_mas_cobros_seguros_de_30_dias_contra_pagos_de_30_dias', CASE WHEN (v_deu ->> 'vence_en_30_dias_clp')::numeric > 0
                                                                                        THEN round((v_caja + v_seguro_30) / (v_deu ->> 'vence_en_30_dias_clp')::numeric, 2) END,
                    'cobros_seguros_de_30_dias_clp', v_seguro_30,
                    'gasto_de_operar_por_dia_clp', v_pordia, 'dias_de_operacion_que_cubre_la_caja', CASE WHEN v_pordia > 0 THEN floor(greatest(v_caja, 0) / v_pordia) END,
                    'como_leerlo', 'Menos de 1 quiere decir que la plata no alcanza para lo que vence en ese plazo. El gasto de operar es combustible, fondos a choferes y aduana pagados en los últimos 30 días.'),
        'datos_que_faltan', CASE WHEN array_length(v_faltan, 1) > 0 THEN to_jsonb(v_faltan) END,
        'no_se_pudo_leer', CASE WHEN array_length(v_no, 1) > 0 THEN to_jsonb(v_no) END,
        'aviso', 'Es la foto de hoy con lo cargado en el sistema: lo que no está cargado (impuestos, préstamos, sueldos sin liquidar) no figura.'));
END $f$;

-- ---------------------------------------------------------------------------------
-- 2 · La lista de lecturas: para que Iris sepa que ahí está el disponible
-- ---------------------------------------------------------------------------------
UPDATE ia.asistente_herramienta
   SET descripcion = 'La propuesta de QUÉ HACER CON LA PLATA y cuánta hay DISPONIBLE: con la caja de hoy más la plata que entra, reparte paso por paso según las reglas que puso Gerencia '
        || '(una cuota de cada leasing o crédito, guardar para los sueldos que vienen, la espalda para operar y, con el resto, cancelar deudas vencidas: primero las marcadas «pagar primero» y después las que cobran interés). '
        || 'Trae «disponible» (la plata menos cuotas, sueldos y espalda: lo que se puede usar sin tocar lo planificado), cuánto va a cada paso, qué renglones se pagan, qué queda sin cubrir, cuánto sobra, '
        || 'la plata por moneda (si hay que comprar o vender dólares o pesos argentinos), lo que vence en estos días y no se guarda, y los avisos. '
        || 'Usala cuando digan «entran 150 millones, ¿qué hacemos?», «¿cuánto podemos usar?», «¿cuánta plata hay libre?», «¿puedo gastar tanto?», «¿qué pagamos primero?», «¿a qué le damos prioridad?», '
        || '«¿cuánto podemos destinar a deudas?», «¿nos alcanza para los sueldos?». Se pueden probar otra espalda u otro orden sin cambiar las reglas guardadas. Es solo una propuesta: no registra pagos.'
 WHERE codigo = 'reparto_plata';

UPDATE ia.asistente_herramienta
   SET descripcion = 'La foto financiera de HOY, para Gerencia: plata en bancos y cajas y en qué moneda está; el disponible de hoy (la caja menos lo que ya tiene destino: cuotas de estos días, sueldos que vienen y espalda); '
        || 'cuántas semanas alcanza con lo previsto y si solo entra lo seguro; lo que nos deben (vencido, por antigüedad, cuánto pesa el cliente más grande, días de cobro); '
        || 'lo que debemos por clase (cuotas de leasing y créditos, sueldos, impuestos, proveedores) y cuánto está vencido; lo que vence en 7 y en 30 días; la deuda en cuotas que falta pagar; '
        || 'el interés que se está generando; y cuántos días de operación cubre la caja. '
        || 'Usala PRIMERO cuando pregunten «¿cómo estamos de plata?», «¿alcanza la caja?», «¿cuál es la situación financiera?», «¿cuánto debemos y cuánto nos deben?» o cualquier pregunta amplia de finanzas.'
 WHERE codigo = 'situacion_financiera';

-- ---------------------------------------------------------------------------------
-- 3 · Las instrucciones: F9, F10 y F11, al final del bloque de finanzas
-- ---------------------------------------------------------------------------------
DO $do$
DECLARE
    v_def text := pg_get_functiondef('ia.fn_instrucciones_asistente()'::regprocedure);
    v_nuevo constant text := $t$
        || ' F9) «Disponible» es la plata menos lo que ya tiene destino: una cuota de cada leasing o crédito de estos días, los sueldos que vienen y la espalda. '
        || 'Viene en «disponible» de «reparto_plata» y en «disponible_hoy» de «situacion_financiera». Si preguntan «¿cuánto podemos usar?», «¿cuánta plata hay libre?» o «¿puedo gastar tanto?», '
        || 'respondé con ese número y con su cuenta en una línea (caja menos cuotas, sueldos y espalda). Si es negativo, decí que hoy no hay plata libre y cuánto falta. '
        || 'Si preguntan por un gasto puntual, compará el monto con el disponible y decí qué quedaría sin cubrir si se pasa. '
        || 'F10) Monedas: la plata se suma en pesos chilenos al cambio de hoy, pero «por_moneda» dice cuánto hay en cada moneda y cuánto paga el reparto en cada una. '
        || 'Si hay que comprar dólares para pagar, o si parte de la plata está en dólares o en pesos argentinos y habría que venderla para pagar en pesos, decilo con el número (viene en los avisos). '
        || 'No sumes ni compares monedas distintas por tu cuenta. '
        || 'F11) «pagar_primero» es una marca que pusieron Gerencia o Finanzas en un contrato, un proveedor o una deuda: en el reparto va antes que el resto aunque no cobre interés. '
        || 'Nombrala cuando aparezca; si lo marcado no alcanza a pagarse, decilo entre los primeros avisos. Vos no podés marcar: se hace en el Planificador de caja, abriendo el renglón de la deuda.'$t$;
BEGIN
    IF v_def LIKE '%F9) «Disponible»%' THEN RETURN; END IF;
    IF v_def !~ '\$function\$\s*$' OR v_def NOT LIKE '%FINANZAS. %' OR v_def NOT LIKE '%F8) %' THEN
        RAISE EXCEPTION 'ia.fn_instrucciones_asistente no tiene el bloque de finanzas de iris_19: correr iris_19 antes';
    END IF;
    -- Se agrega al final del texto, justo antes de que cierre la función (si terminaba con punto y coma, se saca)
    BEGIN
        EXECUTE regexp_replace(v_def, ';?\s*\$function\$\s*$', v_nuevo || E'\n$function$\n');
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'No se pudieron agregar las reglas F9 a F11 a las instrucciones de Iris (%). No se aplicó nada: avisar antes de seguir.', SQLERRM;
    END;
END $do$;

-- ---------------------------------------------------------------------------------
-- 4 · Prueba con los datos de esta base, por el mismo camino que usa Iris
-- ---------------------------------------------------------------------------------
DO $t$
DECLARE r jsonb; l record; v_txt text;
BEGIN
    FOR l IN SELECT * FROM (VALUES ('situacion_financiera', '{}'::jsonb, 'disponible_hoy'), ('reparto_plata', '{"entra": 150000000}', 'disponible'),
                                   ('reparto_plata', '{}', 'disponible'), ('deudas', '{"acreedor": "a"}', 'se_debe_hoy_clp')) x(codigo, entrada, clave) LOOP
        r := ia.fn_herramienta(l.codigo, l.entrada);
        IF NOT coalesce((r ->> 'ok')::boolean, false) THEN
            RAISE EXCEPTION 'la lectura «%» no anduvo: %', l.codigo, coalesce(r ->> 'error', 'sin respuesta');
        END IF;
        IF NOT (r -> 'datos') ? l.clave THEN
            RAISE EXCEPTION 'la lectura «%» no trae «%»', l.codigo, l.clave;
        END IF;
        IF length((r -> 'datos')::text) > 30000 THEN
            RAISE EXCEPTION 'la lectura «%» es demasiado grande para Iris (% letras)', l.codigo, length((r -> 'datos')::text);
        END IF;
    END LOOP;
    v_txt := ia.fn_instrucciones_asistente();
    IF v_txt NOT LIKE '%F9) «Disponible»%' OR v_txt NOT LIKE '%F10) Monedas%' OR v_txt NOT LIKE '%F11) «pagar_primero»%' THEN
        RAISE EXCEPTION 'las instrucciones quedaron sin las reglas F9 a F11';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Iris 20 no pasó su prueba con los datos de esta base (%). No se aplicó nada: avisar antes de seguir.', SQLERRM;
END $t$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Resultado: lo que Iris va a decir hoy del disponible
SELECT 'iris 20 aplicada' AS que,
       (ia.fn_lectura_situacion_financiera('{}') #>> '{disponible_hoy,disponible_clp}')::numeric AS disponible_hoy_clp,
       (ia.fn_lectura_reparto_plata('{}') #>> '{disponible,disponible_clp}')::numeric AS disponible_segun_el_reparto,
       ia.fn_instrucciones_asistente() LIKE '%F11) «pagar_primero»%' AS con_las_reglas_f9_a_f11,
       length(ia.fn_instrucciones_asistente()) AS letras_de_las_instrucciones,
       (SELECT count(*) FROM fin.plan_caja_mora WHERE pagar_primero) AS marcados_pagar_primero;
