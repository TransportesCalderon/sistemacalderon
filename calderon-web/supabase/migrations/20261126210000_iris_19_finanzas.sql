-- =====================================================================================
-- Iris 19 · Finanzas: que Iris conteste como gerente financiero con los números del sistema
-- =====================================================================================
-- Pedido de Gerencia (26/11/2026): «corregir a Iris para que pueda resolver todas las dudas con respecto a las
-- finanzas de la empresa» y que proponga qué hacer con la plata.
--
-- Cinco lecturas nuevas (solo leen):
--   · situacion_financiera: la foto de hoy (caja, cuánto aguanta, lo que nos deben, lo que debemos, lo vencido).
--   · plan_caja: el planificador semana por semana (migración 367).
--   · reparto_plata: qué hacer con la plata que hay o que entra, con las reglas de Gerencia (migración 368).
--   · deudas: cuánto se debe, a quién, los contratos en cuotas, qué deuda cuesta más.
--   · cobranzas: quién nos debe, hace cuánto, cuándo se espera cobrar.
-- Las instrucciones suman el bloque «FINANZAS»: qué lectura usar, cómo responder y con qué criterio.
-- Dos preguntas sugeridas nuevas. Ninguna lectura muestra sueldos ni fondos por persona.
-- Necesita las migraciones 367 y 368 e Iris 11 o posterior. No cambia datos ni web.version_base. Se puede correr más
-- de una vez. Antes de terminar corre las cinco lecturas con los datos de la base: si una falla, no deja nada aplicado.
-- No se pudo probar contra el modelo real: las lecturas y las instrucciones se probaron en la copia.
-- =====================================================================================
BEGIN;

DO $v$
BEGIN
    IF to_regprocedure('fin.fn_plan_caja_calcular(jsonb)') IS NULL THEN
        RAISE EXCEPTION 'Falta la migración 367 (20261126190000_planificador_de_caja.sql): correrla antes que esta';
    END IF;
    IF to_regprocedure('fin.fn_plan_caja_reparto_calcular(jsonb)') IS NULL OR to_regprocedure('fin.fn_plan_caja_salidas(jsonb)') IS NULL
       OR to_regprocedure('fin.fn_plan_caja_contratos()') IS NULL OR to_regprocedure('fin.fn_plan_caja_gasto_operativo(integer)') IS NULL THEN
        RAISE EXCEPTION 'Falta la migración 368 (20261126200000_reparto_de_la_plata.sql): correrla antes que esta';
    END IF;
    IF to_regclass('ia.asistente_herramienta') IS NULL OR to_regclass('ia.asistente_sugerida') IS NULL
       OR to_regprocedure('ia.fn_herramienta(text, jsonb)') IS NULL OR to_regprocedure('ia.fn_instrucciones_asistente()') IS NULL
       OR to_regprocedure('ia.fn_lectura_proyeccion(jsonb)') IS NULL OR to_regprocedure('ia.fn_puede_asistente(bigint)') IS NULL
       OR to_regprocedure('ia.fn_num(jsonb)') IS NULL OR to_regprocedure('ia.fn_texto(jsonb, integer)') IS NULL THEN
        RAISE EXCEPTION 'Falta Iris con sus lecturas (iris_11 o posterior): avisar antes de seguir';
    END IF;
END $v$;

-- Permisos: los mismos que una función vecina (sin PUBLIC)
CREATE OR REPLACE FUNCTION pg_temp.fn_copiar_permisos(p_de regprocedure, p_a regprocedure)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE g text;
BEGIN
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', p_a);
    FOR g IN SELECT r.rolname FROM pg_roles r
              WHERE (r.rolname LIKE 'tc\_%' AND r.rolname <> 'tc_cliente') OR r.rolname = 'authenticated' LOOP
        IF has_function_privilege(g, p_de, 'EXECUTE') THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', p_a, g);
        ELSE
            EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', p_a, g);
        END IF;
    END LOOP;
END $fn$;

-- Funciones internas: solo las usan otras funciones de la base
CREATE OR REPLACE FUNCTION pg_temp.fn_solo_interna(p_fn regprocedure)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE g text;
BEGIN
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', p_fn);
    FOR g IN SELECT r.rolname FROM pg_roles r WHERE r.rolname LIKE 'tc\_%' OR r.rolname IN ('authenticated', 'anon') LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', p_fn, g);
    END LOOP;
END $fn$;

-- ---------------------------------------------------------------------------------
-- 1 · Las lecturas
-- ---------------------------------------------------------------------------------
-- Un monto dicho o escrito de cualquier forma: 150000000, «150.000.000», «150 millones», «1,5 millones»
CREATE OR REPLACE FUNCTION ia.fn_monto(p jsonb)
 RETURNS numeric
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE t text; v_mult numeric := 1; v_num text;
BEGIN
    IF p IS NULL OR jsonb_typeof(p) = 'null' THEN RETURN NULL; END IF;
    IF jsonb_typeof(p) = 'number' THEN RETURN (p #>> '{}')::numeric; END IF;
    IF jsonb_typeof(p) <> 'string' THEN RETURN NULL; END IF;
    t := lower(btrim(p #>> '{}'));
    IF t ~ 'mill' THEN v_mult := 1000000; ELSIF t ~ '\mmil\M' THEN v_mult := 1000; END IF;
    v_num := substring(t FROM '[0-9][0-9.,]*');
    IF v_num IS NULL THEN RETURN NULL; END IF;
    v_num := rtrim(v_num, '.,');
    IF v_num ~ '^[0-9]{1,3}(\.[0-9]{3})+(,[0-9]+)?$' THEN v_num := replace(replace(v_num, '.', ''), ',', '.');   -- 150.000.000 o 1.500,5
    ELSIF v_num ~ '^[0-9]{1,3}(,[0-9]{3})+(\.[0-9]+)?$' THEN v_num := replace(v_num, ',', '');                      -- 150,000,000
    ELSIF v_num ~ ',' AND v_num !~ '\.' THEN v_num := replace(v_num, ',', '.');                                      -- 1,5
    END IF;
    RETURN v_num::numeric * v_mult;
EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
END $f$;

-- Los renglones que Iris nunca muestra de a uno, porque llevan el nombre de una persona: los sueldos (de choferes y de
-- la estructura, que se llaman «Sueldo · Área · Persona») y los fondos de los choferes. Devuelve el nombre del grupo en
-- el que se suman; vacío si el renglón se puede mostrar tal cual.
CREATE OR REPLACE FUNCTION ia.fn_fin_grupo(p_origen text, p_id bigint)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_fijo text; v_cuenta text; v_clase text;
BEGIN
    IF p_origen = 'liquidacion' THEN RETURN 'Sueldos de choferes'; END IF;
    IF p_origen = 'pedido_fondo' THEN RETURN 'Fondos aprobados a choferes'; END IF;
    IF p_id IS NULL OR p_origen NOT IN ('gasto', 'fijo', 'partida') THEN RETURN NULL; END IF;
    IF p_origen = 'gasto' THEN
        SELECT f.nombre, cc.nombre INTO v_fijo, v_cuenta
          FROM fin.gasto g LEFT JOIN fin.gasto_fijo f ON f.id = g.gasto_fijo_id LEFT JOIN fin.cuenta_contable cc ON cc.id = g.cuenta_id
         WHERE g.id = p_id;
    ELSIF p_origen = 'fijo' THEN
        SELECT f.nombre, cc.nombre INTO v_fijo, v_cuenta
          FROM fin.gasto_fijo f LEFT JOIN fin.cuenta_contable cc ON cc.id = f.cuenta_id
         WHERE f.id = p_id;
    END IF;
    IF v_fijo LIKE 'Sueldo · %' THEN RETURN 'Sueldos de la oficina'; END IF;
    SELECT k.clase INTO v_clase FROM fin.fn_plan_caja_clase(p_origen, p_id) k;
    IF v_clase IS DISTINCT FROM 'sueldo' THEN RETURN NULL; END IF;
    RETURN CASE WHEN p_origen = 'partida' THEN 'Sueldos cargados a mano en el planificador' ELSE coalesce(v_cuenta, 'Sueldos y leyes sociales') END;
END $f$;

-- ── Lo que nos deben, por cliente (sale del plan de caja armado en pesos chilenos) ──────
CREATE OR REPLACE FUNCTION ia.fn_fin_cobranzas(p_plan jsonb, p_cliente text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE
    v_hoy date := (p_plan ->> 'hoy')::date;
    v_filtro text := nullif(btrim(coalesce(p_cliente, '')), '');
    v_e jsonb; v_total numeric; v_vencido numeric; v_sin_fecha numeric; v_clientes jsonb; v_tramos jsonb; v_fact jsonb;
    v_top1 numeric; v_top3 numeric; v_top1_nombre text; v_n integer;
    v_facturado_90 numeric; v_cobrado_30 numeric; v_detalle jsonb;
BEGIN
    -- Cada entrada del plan con su cliente
    SELECT coalesce(jsonb_agg(to_jsonb(z)), '[]'::jsonb) INTO v_e
      FROM (SELECT p.origen, p.id, p.titulo, p.detalle, p.fecha, p.fecha_base AS vence, p.moneda, p.monto, p.monto_vista AS clp, p.certeza, p.cubo,
                   p.nota, p.fecha_cargada, c.id AS cliente_id, c.razon_social AS cliente, coalesce(c.condicion_pago_dias, 0) AS plazo,
                   CASE WHEN p.origen = 'factura' AND p.fecha_base < v_hoy THEN v_hoy - p.fecha_base ELSE 0 END AS dias_vencida,
                   CASE WHEN p.origen = 'servicio' THEN s.estado END AS estado_viaje
              FROM jsonb_to_recordset(p_plan -> 'partidas') AS p(origen text, id bigint, sentido text, titulo text, detalle text, fecha date, fecha_base date,
                                                                 moneda text, monto numeric, monto_vista numeric, certeza text, cubo text, nota text, fecha_cargada date)
              LEFT JOIN ven.factura f ON p.origen IN ('factura', 'prefactura') AND f.id = p.id
              LEFT JOIN ops.servicio_comercial s ON p.origen = 'servicio' AND s.id = p.id
              LEFT JOIN mae.cliente c ON c.id = coalesce(f.cliente_id, s.cliente_id)
             WHERE p.sentido = 'entrada' AND p.origen IN ('factura', 'prefactura', 'servicio') AND p.cubo <> 'sin_cambio') z;

    SELECT coalesce(sum((e ->> 'clp')::numeric), 0), coalesce(sum((e ->> 'clp')::numeric) FILTER (WHERE (e ->> 'dias_vencida')::integer > 0), 0),
           coalesce(sum((e ->> 'clp')::numeric) FILTER (WHERE e ->> 'cubo' = 'sin_fecha'), 0), count(*)
      INTO v_total, v_vencido, v_sin_fecha, v_n
      FROM jsonb_array_elements(v_e) e WHERE e ->> 'origen' = 'factura';

    -- Por cliente (facturas emitidas con saldo)
    WITH fa AS (
        SELECT (e ->> 'cliente_id')::bigint AS cliente_id, e ->> 'cliente' AS cliente, (e ->> 'plazo')::integer AS plazo, (e ->> 'clp')::numeric AS clp,
               (e ->> 'monto')::numeric AS monto, e ->> 'moneda' AS moneda, (e ->> 'dias_vencida')::integer AS dias_vencida, e ->> 'cubo' AS cubo,
               (e ->> 'fecha')::date AS fecha, e ->> 'fecha_cargada' AS fecha_cargada, e ->> 'nota' AS nota
          FROM jsonb_array_elements(v_e) e WHERE e ->> 'origen' = 'factura'
    ), cli AS (
        SELECT a.cliente_id, a.cliente, max(a.plazo) AS plazo, sum(a.clp) AS debe, count(*) AS facturas,
               coalesce(sum(a.clp) FILTER (WHERE a.dias_vencida > 0), 0) AS vencido, max(a.dias_vencida) AS mas_vieja,
               coalesce(sum(a.clp) FILTER (WHERE a.cubo = 'sin_fecha'), 0) AS sin_fecha, min(a.fecha) AS proxima,
               coalesce(sum(a.clp) FILTER (WHERE a.fecha_cargada IS NOT NULL AND a.fecha IS NOT NULL), 0) AS con_fecha_cargada,
               string_agg(DISTINCT a.nota, ' · ') AS notas
          FROM fa a GROUP BY a.cliente_id, a.cliente
    ), mon AS (
        SELECT m.cliente_id, jsonb_object_agg(m.moneda, m.saldo) AS monedas
          FROM (SELECT a.cliente_id, a.moneda, sum(a.monto) AS saldo FROM fa a GROUP BY 1, 2) m GROUP BY 1
    ), ord AS (
        SELECT c.*, m.monedas, row_number() OVER (ORDER BY c.debe DESC, c.cliente) AS puesto
          FROM cli c LEFT JOIN mon m ON m.cliente_id IS NOT DISTINCT FROM c.cliente_id
    )
    SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
               'cliente', o.cliente, 'debe_clp', o.debe, 'en_su_moneda', o.monedas, 'facturas', o.facturas, 'vencido_clp', o.vencido,
               'factura_mas_vieja_vencida_hace_dias', nullif(o.mas_vieja, 0), 'plazo_acordado_dias', o.plazo,
               'suele_pagar_dias_despues_del_vencimiento', (SELECT CASE WHEN count(*) >= 2 THEN least(greatest(round(avg(f.cobrada_en - f.vence))::integer, 0), 60) END
                                                              FROM ven.factura f WHERE f.cliente_id = o.cliente_id AND f.estado = 'cobrada' AND f.eliminado_en IS NULL
                                                               AND f.cobrada_en IS NOT NULL AND f.vence IS NOT NULL AND f.cobrada_en >= v_hoy - 365),
               'proximo_cobro_esperado', o.proxima, 'con_fecha_de_pago_cargada_clp', nullif(o.con_fecha_cargada, 0),
               'vencido_sin_fecha_de_pago_clp', nullif(o.sin_fecha, 0), 'notas_del_plan', o.notas,
               'pesa_en_el_total_pct', CASE WHEN v_total > 0 THEN round(o.debe / v_total * 100) END)) ORDER BY o.puesto) FILTER (WHERE o.puesto <= 15), '[]'::jsonb),
           coalesce(max(o.debe) FILTER (WHERE o.puesto = 1), 0), coalesce(sum(o.debe) FILTER (WHERE o.puesto <= 3), 0),
           max(o.cliente) FILTER (WHERE o.puesto = 1)
      INTO v_clientes, v_top1, v_top3, v_top1_nombre
      FROM ord o;

    -- Por antigüedad
    SELECT jsonb_build_object(
               'al_dia_clp', coalesce(sum(c) FILTER (WHERE d = 0), 0), 'vencido_1_a_30_dias_clp', coalesce(sum(c) FILTER (WHERE d BETWEEN 1 AND 30), 0),
               'vencido_31_a_60_dias_clp', coalesce(sum(c) FILTER (WHERE d BETWEEN 31 AND 60), 0), 'vencido_61_a_90_dias_clp', coalesce(sum(c) FILTER (WHERE d BETWEEN 61 AND 90), 0),
               'vencido_mas_de_90_dias_clp', coalesce(sum(c) FILTER (WHERE d > 90), 0))
      INTO v_tramos
      FROM (SELECT (e ->> 'clp')::numeric AS c, (e ->> 'dias_vencida')::integer AS d FROM jsonb_array_elements(v_e) e WHERE e ->> 'origen' = 'factura') x;

    -- Lo que falta facturar
    SELECT jsonb_build_object(
               'prefacturas_sin_emitir_clp', coalesce(sum(c) FILTER (WHERE o = 'prefactura'), 0), 'prefacturas', count(*) FILTER (WHERE o = 'prefactura'),
               'viajes_entregados_sin_facturar_clp', coalesce(sum(c) FILTER (WHERE o = 'servicio' AND ev = 'entregado'), 0), 'viajes_entregados', count(*) FILTER (WHERE o = 'servicio' AND ev = 'entregado'),
               'viajes_en_curso_o_planificados_clp', coalesce(sum(c) FILTER (WHERE o = 'servicio' AND ev <> 'entregado'), 0), 'viajes_en_curso_o_planificados', count(*) FILTER (WHERE o = 'servicio' AND ev <> 'entregado'))
      INTO v_fact
      FROM (SELECT e ->> 'origen' AS o, (e ->> 'clp')::numeric AS c, coalesce(e ->> 'estado_viaje', '') AS ev FROM jsonb_array_elements(v_e) e WHERE e ->> 'origen' <> 'factura') x;

    -- Ritmo: lo facturado en 90 días y lo cobrado en 30 (para los días de cobro)
    SELECT coalesce(sum(round(f.total * fin.fn_tc_clp_o_null(f.moneda::text, v_hoy))), 0) INTO v_facturado_90
      FROM ven.factura f WHERE f.estado IN ('emitida', 'cobrada') AND f.eliminado_en IS NULL AND f.fecha_emision > v_hoy - 90 AND f.fecha_emision <= v_hoy;
    SELECT coalesce(sum(round(m.monto * fin.fn_tc_clp_o_null(cd.moneda::text, v_hoy))), 0) INTO v_cobrado_30
      FROM fin.movimiento m JOIN fin.cuenta_dinero cd ON cd.id = m.cuenta_dinero_id
     WHERE m.tipo = 'cobro' AND m.estado = 'vigente' AND m.eliminado_en IS NULL AND m.fecha > v_hoy - 30 AND m.fecha <= v_hoy;

    -- El detalle de un cliente, si lo piden
    IF v_filtro IS NOT NULL THEN
        SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                   'cliente', e ->> 'cliente', 'que', e ->> 'titulo', 'tipo', CASE e ->> 'origen' WHEN 'factura' THEN 'factura emitida' WHEN 'prefactura' THEN 'prefactura sin emitir' ELSE 'viaje sin facturar' END,
                   'vence', CASE WHEN e ->> 'origen' = 'factura' THEN e ->> 'vence' END, 'fecha_del_viaje', CASE WHEN e ->> 'origen' = 'servicio' THEN e ->> 'vence' END,
                   'vencida_hace_dias', nullif((e ->> 'dias_vencida')::integer, 0), 'saldo', (e ->> 'monto')::numeric, 'moneda', e ->> 'moneda',
                   'saldo_clp', (e ->> 'clp')::numeric, 'se_espera_cobrar', e ->> 'fecha', 'que_tan_seguro', e ->> 'certeza',
                   'fecha_cargada_a_mano', e ->> 'fecha_cargada', 'nota', e ->> 'nota', 'no_se_cuenta_en_el_plan', CASE WHEN e ->> 'cubo' = 'no_contar' THEN true END))
                   ORDER BY (e ->> 'vence')::date NULLS LAST), '[]'::jsonb)
          INTO v_detalle
          FROM (SELECT e FROM jsonb_array_elements(v_e) e
                 WHERE translate(lower(e ->> 'cliente'), 'áéíóúü', 'aeiouu') LIKE '%' || translate(lower(v_filtro), 'áéíóúü', 'aeiouu') || '%'
                 ORDER BY (e ->> 'vence')::date NULLS LAST LIMIT 40) q;
    END IF;

    RETURN jsonb_strip_nulls(jsonb_build_object(
        'nos_deben_clp', v_total, 'facturas_con_saldo', v_n, 'vencido_clp', v_vencido, 'vencido_sin_fecha_de_pago_clp', v_sin_fecha,
        'vencido_pct', CASE WHEN v_total > 0 THEN round(v_vencido / v_total * 100) END,
        'por_antiguedad', v_tramos,
        'por_cliente', v_clientes,
        'concentracion', CASE WHEN v_total > 0 THEN jsonb_build_object('el_que_mas_debe', v_top1_nombre, 'pesa_pct', round(v_top1 / v_total * 100), 'los_tres_que_mas_deben_pesan_pct', round(v_top3 / v_total * 100)) END,
        'falta_facturar', v_fact,
        'ritmo', jsonb_build_object('facturado_ultimos_90_dias_clp', v_facturado_90, 'cobrado_ultimos_30_dias_clp', v_cobrado_30,
                                    'dias_de_cobro', CASE WHEN v_facturado_90 > 0 THEN round(v_total / (v_facturado_90 / 90)) END,
                                    'como_se_calcula', 'Días de cobro = lo que nos deben ÷ lo facturado por día en los últimos 90 días.'),
        'detalle_del_cliente', v_detalle));
END $f$;

-- ── Lo que debemos (sale del plan de caja armado en pesos chilenos) ─────────────────────
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
               count(*) AS n, max((e ->> 'dias_atraso')::integer) AS mas_vieja, max((e ->> 'tasa')::numeric) AS tasa, max(e ->> 'tasa_fuente') AS fuente
          FROM jsonb_array_elements(v_sal) e WHERE e ->> 'clase' = 'proveedor'
         GROUP BY 1
    ), ord AS (SELECT p.*, row_number() OVER (ORDER BY p.vencido DESC, p.debe DESC, p.proveedor) AS puesto FROM pr p)
    SELECT jsonb_build_object(
               'los_que_mas_se_les_debe', coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
                   'proveedor', o.proveedor, 'se_le_debe_clp', o.debe, 'vencido_clp', o.vencido, 'documentos', o.n,
                   'lo_mas_viejo_vencio_hace_dias', nullif(o.mas_vieja, 0), 'interes_por_mes_pct', o.tasa,
                   'el_interes_sale_de', CASE o.fuente WHEN 'cargada' THEN 'lo cargó Gerencia o Finanzas' WHEN 'observada' THEN 'la mora que ya cobró en el último año' END,
                   'es_de_combustible', CASE WHEN o.critico THEN true END)) ORDER BY o.puesto) FILTER (WHERE o.puesto <= 15), '[]'::jsonb),
               'el_resto', jsonb_build_object('proveedores', count(*) FILTER (WHERE o.puesto > 15), 'se_les_debe_clp', coalesce(sum(o.debe) FILTER (WHERE o.puesto > 15), 0),
                                              'vencido_clp', coalesce(sum(o.vencido) FILTER (WHERE o.puesto > 15), 0)))
      INTO v_prov FROM ord o;

    -- Impuestos y otras deudas cargadas
    SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('que', e ->> 'titulo', 'clase', CASE e ->> 'clase' WHEN 'impuesto' THEN 'impuesto' ELSE 'otra' END,
               'vence', e ->> 'vence', 'vencida_hace_dias', nullif((e ->> 'dias_atraso')::integer, 0), 'monto_clp', (e ->> 'clp')::numeric,
               'interes_por_mes_pct', (e ->> 'tasa')::numeric)) ORDER BY (e ->> 'vence')::date NULLS LAST), '[]'::jsonb)
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
        'ojo', 'Solo figura lo cargado en el sistema. Impuestos, imposiciones o préstamos que no estén cargados (como gasto, gasto fijo o salida prevista del planificador) no aparecen.'));
END $f$;

-- ── El plan de caja resumido para Iris: sin nombres de personas (los sueldos de choferes van juntos) ──
CREATE OR REPLACE FUNCTION ia.fn_fin_plan(p_plan jsonb, p_semana integer DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_r jsonb; v_res jsonb := p_plan -> 'resumen'; v_detalle jsonb;
BEGIN
    -- Los sueldos y los fondos de los choferes se suman por grupo y por semana: nunca un renglón por persona.
    -- (El grupo se busca una sola vez por renglón: por eso va en una tabla aparte.)
    WITH x AS MATERIALIZED (
        SELECT p.*, CASE WHEN p.sentido = 'salida' THEN ia.fn_fin_grupo(p.origen, p.id) END AS grupo
          FROM jsonb_to_recordset(p_plan -> 'partidas') AS p(clave text, origen text, id bigint, sentido text, titulo text, detalle text, fecha date, moneda text,
                                                             monto numeric, monto_vista numeric, certeza text, cubo text, semana integer, cuenta boolean,
                                                             nota text, ajustada boolean)
    )
    SELECT coalesce(jsonb_agg(to_jsonb(z)), '[]'::jsonb) INTO v_r
      FROM (SELECT coalesce(x.grupo, x.titulo) AS que,
                   max(CASE WHEN x.grupo IS NULL THEN x.detalle END) AS detalle,
                   x.sentido, min(x.fecha) AS fecha, x.cubo, x.semana, x.certeza, x.cuenta, sum(x.monto_vista) AS monto, count(*) AS cantidad,
                   max(CASE WHEN x.grupo IS NULL AND x.moneda <> (p_plan ->> 'moneda') THEN x.monto || ' ' || x.moneda END) AS en_su_moneda,
                   max(CASE WHEN x.grupo IS NULL THEN x.nota END) AS nota, bool_or(coalesce(x.ajustada, false)) AS cambiada_a_mano
              FROM x
             GROUP BY coalesce(x.grupo, x.titulo), CASE WHEN x.grupo IS NULL THEN x.clave END, CASE WHEN x.grupo IS NULL THEN x.fecha END,
                      x.sentido, x.cubo, x.semana, x.certeza, x.cuenta) z;

    IF p_semana IS NOT NULL THEN
        SELECT jsonb_build_object('semana', p_semana, 'renglones', coalesce(jsonb_agg(q.j), '[]'::jsonb)) INTO v_detalle
          FROM (SELECT jsonb_strip_nulls(jsonb_build_object('entra_o_sale', e ->> 'sentido', 'que', e ->> 'que', 'detalle', e ->> 'detalle', 'fecha', e ->> 'fecha', 'monto', (e ->> 'monto')::numeric,
                           'cantidad', nullif((e ->> 'cantidad')::integer, 1), 'en_su_moneda', e ->> 'en_su_moneda', 'que_tan_seguro', e ->> 'certeza',
                           'no_se_cuenta', CASE WHEN NOT (e ->> 'cuenta')::boolean THEN true END, 'nota', e ->> 'nota')) AS j
                  FROM jsonb_array_elements(v_r) e WHERE e ->> 'cubo' = 'semana' AND (e ->> 'semana')::integer = p_semana
                 ORDER BY e ->> 'sentido', (e ->> 'monto')::numeric DESC LIMIT 40) q;
    END IF;

    RETURN jsonb_strip_nulls(jsonb_build_object(
        'hoy', p_plan ->> 'hoy', 'moneda', p_plan ->> 'moneda', 'cuenta_los_cobros_dudosos', (p_plan ->> 'con_dudosas')::boolean, 'cuenta_los_viajes_sin_facturar', (p_plan ->> 'con_viajes')::boolean,
        'caja_hoy', jsonb_build_object('total', (p_plan #>> '{caja,total}')::numeric,
                    'cuentas', (SELECT coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object('cuenta', c ->> 'nombre', 'saldo', (c ->> 'saldo')::numeric, 'moneda', c ->> 'moneda',
                                                'en_la_moneda_del_plan', (c ->> 'saldo_vista')::numeric, 'ultima_cartola', c ->> 'cartola_fecha',
                                                'lineas_sin_conciliar', nullif((c ->> 'por_conciliar')::integer, 0)))), '[]'::jsonb) FROM jsonb_array_elements(p_plan #> '{caja,cuentas}') c)),
        'semanas', (SELECT coalesce(jsonb_agg(jsonb_build_object('semana', (s ->> 'n')::integer, 'desde', s ->> 'desde', 'hasta', s ->> 'hasta', 'entra', (s ->> 'entradas')::numeric,
                                              'sale', (s ->> 'salidas')::numeric, 'saldo_al_final', (s ->> 'saldo')::numeric,
                                              'saldo_si_solo_entra_lo_seguro', (s ->> 'saldo_prudente')::numeric) ORDER BY (s ->> 'n')::integer), '[]'::jsonb)
                      FROM jsonb_array_elements(p_plan -> 'plan') s),
        'resumen', jsonb_build_object('entra', (v_res ->> 'entradas')::numeric, 'sale', (v_res ->> 'salidas')::numeric, 'saldo_al_final', (v_res ->> 'saldo_final')::numeric,
                    'punto_mas_bajo', v_res -> 'saldo_minimo', 'primera_semana_sin_caja', v_res -> 'primera_negativa',
                    'si_solo_entra_lo_seguro', jsonb_build_object('punto_mas_bajo', v_res -> 'prudente_minimo', 'primera_semana_sin_caja', v_res -> 'prudente_primera_negativa'),
                    'cobros_dudosos_que_no_se_cuentan', v_res #> '{dudosas_sin_contar,entradas}', 'marcado_para_no_contar', v_res -> 'no_contar',
                    'despues_de_estas_semanas', jsonb_build_object('entra', v_res -> 'despues_entradas', 'sale', v_res -> 'despues_salidas')),
        'por_cobrar_vencido_sin_fecha_de_pago', jsonb_build_object('monto', v_res #> '{sin_fecha_cobrar,monto}', 'cantidad', v_res #> '{sin_fecha_cobrar,cantidad}',
                    'renglones', (SELECT coalesce(jsonb_agg(q.j), '[]'::jsonb) FROM (SELECT jsonb_strip_nulls(jsonb_build_object('que', e ->> 'que', 'detalle', e ->> 'detalle', 'monto', (e ->> 'monto')::numeric,
                                                 'en_su_moneda', e ->> 'en_su_moneda', 'nota', e ->> 'nota')) AS j FROM jsonb_array_elements(v_r) e
                                         WHERE e ->> 'cubo' = 'sin_fecha' AND e ->> 'sentido' = 'entrada' ORDER BY (e ->> 'monto')::numeric DESC LIMIT 10) q)),
        'por_pagar_sin_fecha_de_pago', jsonb_build_object('monto', v_res #> '{sin_fecha_pagar,monto}', 'cantidad', v_res #> '{sin_fecha_pagar,cantidad}',
                    'renglones', (SELECT coalesce(jsonb_agg(q.j), '[]'::jsonb) FROM (SELECT jsonb_strip_nulls(jsonb_build_object('que', e ->> 'que', 'detalle', e ->> 'detalle', 'monto', (e ->> 'monto')::numeric,
                                                 'cantidad', nullif((e ->> 'cantidad')::integer, 1), 'nota', e ->> 'nota')) AS j FROM jsonb_array_elements(v_r) e
                                         WHERE e ->> 'cubo' = 'sin_fecha' AND e ->> 'sentido' = 'salida' ORDER BY (e ->> 'monto')::numeric DESC LIMIT 10) q)),
        'lo_mas_grande_que_entra', (SELECT coalesce(jsonb_agg(q.j), '[]'::jsonb) FROM (SELECT jsonb_strip_nulls(jsonb_build_object('que', e ->> 'que', 'fecha', e ->> 'fecha', 'monto', (e ->> 'monto')::numeric,
                                                 'que_tan_seguro', e ->> 'certeza', 'no_se_cuenta', CASE WHEN NOT (e ->> 'cuenta')::boolean THEN true END,
                                                 'fecha_cargada_a_mano', CASE WHEN (e ->> 'cambiada_a_mano')::boolean THEN true END, 'nota', e ->> 'nota')) AS j
                                          FROM jsonb_array_elements(v_r) e WHERE e ->> 'cubo' = 'semana' AND e ->> 'sentido' = 'entrada' ORDER BY (e ->> 'monto')::numeric DESC LIMIT 12) q),
        'lo_mas_grande_que_sale', (SELECT coalesce(jsonb_agg(q.j), '[]'::jsonb) FROM (SELECT jsonb_strip_nulls(jsonb_build_object('que', e ->> 'que', 'fecha', e ->> 'fecha', 'monto', (e ->> 'monto')::numeric,
                                                 'cantidad', nullif((e ->> 'cantidad')::integer, 1), 'nota', e ->> 'nota')) AS j
                                          FROM jsonb_array_elements(v_r) e WHERE e ->> 'cubo' = 'semana' AND e ->> 'sentido' = 'salida' ORDER BY (e ->> 'monto')::numeric DESC LIMIT 12) q),
        'detalle_de_la_semana', v_detalle,
        'avisos', p_plan -> 'avisos',
        'que_no_incluye', 'El plan usa solo lo cargado en el sistema y lo agregado a mano en el planificador. No estima: los sueldos de los meses que vienen, el combustible que falta cargar y los impuestos no aparecen si no se cargaron como salida prevista.'));
END $f$;

-- ── Las cinco lecturas ─────────────────────────────────────────────────────────────────
-- Van sin «jit»: son muchas cuentas chicas sobre pocos renglones y compilarlas tarda más que hacerlas.
-- «sí», true, 1 → true; «no», false, 0 → false; otra cosa → no dice nada
CREATE OR REPLACE FUNCTION ia.fn_si(p jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT CASE WHEN p IS NULL OR jsonb_typeof(p) = 'null' THEN NULL
                WHEN jsonb_typeof(p) = 'boolean' THEN (p #>> '{}')::boolean
                WHEN lower(btrim(p #>> '{}')) IN ('true', 't', 'si', 'sí', '1', 'yes') THEN true
                WHEN lower(btrim(p #>> '{}')) IN ('false', 'f', 'no', '0') THEN false END
$f$;

CREATE OR REPLACE FUNCTION ia.fn_lectura_plan_caja(p_entrada jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
 SET jit TO 'off'
AS $f$
DECLARE e jsonb := coalesce(p_entrada, '{}'::jsonb); v_sem integer; v_una integer; v_plan jsonb;
BEGIN
    IF NOT (ia.fn_puede_asistente() OR session_user = 'postgres') THEN RAISE EXCEPTION 'Iris es para Gerencia' USING ERRCODE = '42501'; END IF;
    v_sem := ia.fn_num(e -> 'semanas')::integer;
    IF v_sem IS NOT NULL AND v_sem NOT BETWEEN 4 AND 26 THEN RAISE EXCEPTION 'Las semanas del plan van de 4 a 26' USING ERRCODE = '22023'; END IF;
    v_una := ia.fn_num(e -> 'semana')::integer;
    v_plan := fin.fn_plan_caja_calcular(jsonb_strip_nulls(jsonb_build_object(
                  'moneda', CASE WHEN upper(coalesce(e ->> 'moneda', '')) IN ('USD', 'DOLARES', 'DÓLARES') THEN 'USD' ELSE 'CLP' END,
                  'semanas', v_sem, 'con_dudosas', ia.fn_si(e -> 'con_dudosas'), 'con_viajes', ia.fn_si(e -> 'con_viajes'))));
    IF v_una IS NOT NULL AND (v_una < 0 OR v_una >= (v_plan ->> 'semanas')::integer) THEN
        RAISE EXCEPTION 'Esa semana no está en el plan: van de 0 (esta semana) a %', (v_plan ->> 'semanas')::integer - 1 USING ERRCODE = '22023';
    END IF;
    RETURN ia.fn_fin_plan(v_plan, v_una);
END $f$;

CREATE OR REPLACE FUNCTION ia.fn_lectura_cobranzas(p_entrada jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
 SET jit TO 'off'
AS $f$
DECLARE e jsonb := coalesce(p_entrada, '{}'::jsonb);
BEGIN
    IF NOT (ia.fn_puede_asistente() OR session_user = 'postgres') THEN RAISE EXCEPTION 'Iris es para Gerencia' USING ERRCODE = '42501'; END IF;
    RETURN jsonb_build_object('hoy', mae.fn_hoy(), 'moneda', 'CLP')
        || ia.fn_fin_cobranzas(fin.fn_plan_caja_calcular('{"moneda": "CLP", "con_dudosas": true}'::jsonb), ia.fn_texto(e -> 'cliente', 80));
END $f$;

CREATE OR REPLACE FUNCTION ia.fn_lectura_deudas(p_entrada jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
 SET jit TO 'off'
AS $f$
DECLARE e jsonb := coalesce(p_entrada, '{}'::jsonb);
BEGIN
    IF NOT (ia.fn_puede_asistente() OR session_user = 'postgres') THEN RAISE EXCEPTION 'Iris es para Gerencia' USING ERRCODE = '42501'; END IF;
    RETURN jsonb_build_object('hoy', mae.fn_hoy(), 'moneda', 'CLP')
        || ia.fn_fin_deudas(fin.fn_plan_caja_calcular('{"moneda": "CLP"}'::jsonb), ia.fn_texto(e -> 'acreedor', 80));
END $f$;

-- Qué hacer con la plata: la propuesta del planificador, resumida y sin nombres de personas
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
                               'es_de_combustible', CASE WHEN (i ->> 'critico')::boolean THEN true END)) AS j
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
                                    'para_repartir_clp', r #> '{dinero,total}'),
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
        'como_leerlo', 'Es una propuesta armada con las reglas que puso Gerencia: no registra ningún pago. Los pagos se hacen en Finanzas › Cobros y pagos › Por pagar; las reglas y el interés de cada deuda se cambian en el Planificador de caja.'));
END $f$;

-- La foto de hoy: caja, lo que viene, lo que nos deben, lo que debemos y cuánto aguanta la caja
CREATE OR REPLACE FUNCTION ia.fn_lectura_situacion_financiera(p_entrada jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
 SET jit TO 'off'
AS $f$
DECLARE
    v_hoy date := mae.fn_hoy(); v_plan jsonb; v_res jsonb; v_cob jsonb; v_deu jsonb; v_oper jsonb; v_caja numeric; v_pordia numeric;
    v_seguro_30 numeric; v_faltan text[] := '{}'; v_no text[] := '{}'; a text;
BEGIN
    IF NOT (ia.fn_puede_asistente() OR session_user = 'postgres') THEN RAISE EXCEPTION 'Iris es para Gerencia' USING ERRCODE = '42501'; END IF;
    v_plan := fin.fn_plan_caja_calcular('{"moneda": "CLP"}'::jsonb);
    v_res := v_plan -> 'resumen';
    v_caja := coalesce((v_plan #>> '{caja,total}')::numeric, 0);
    BEGIN v_cob := ia.fn_fin_cobranzas(v_plan, NULL); EXCEPTION WHEN OTHERS THEN v_no := v_no || ('lo que nos deben (' || SQLERRM || ')'); END;
    BEGIN v_deu := ia.fn_fin_deudas(v_plan, NULL); EXCEPTION WHEN OTHERS THEN v_no := v_no || ('lo que debemos (' || SQLERRM || ')'); END;
    BEGIN v_oper := fin.fn_plan_caja_gasto_operativo(30); EXCEPTION WHEN OTHERS THEN v_no := v_no || ('el gasto de operar (' || SQLERRM || ')'); END;
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
-- 2 · La lista de lecturas de Iris
-- ---------------------------------------------------------------------------------
INSERT INTO ia.asistente_herramienta (codigo, orden, descripcion, etiqueta, leyendo, pantalla, entrada, activa)
VALUES ('situacion_financiera', 40,
        'La foto financiera de HOY, para Gerencia: plata en bancos y cajas; cuántas semanas alcanza con lo previsto y si solo entra lo seguro; lo que nos deben (vencido, por antigüedad, '
        || 'cuánto pesa el cliente más grande, días de cobro); lo que debemos por clase (cuotas de leasing y créditos, sueldos, impuestos, proveedores) y cuánto está vencido; '
        || 'lo que vence en 7 y en 30 días; la deuda en cuotas que falta pagar; el interés que se está generando; y cuántos días de operación cubre la caja. '
        || 'Usala PRIMERO cuando pregunten «¿cómo estamos de plata?», «¿alcanza la caja?», «¿cuál es la situación financiera?», «¿cuánto debemos y cuánto nos deben?» o cualquier pregunta amplia de finanzas.',
        'Situación financiera', 'Mirando la caja, lo que nos deben y lo que debemos…', '/analisis/cobros-pagos?ver=plan',
        '{"type": "object", "properties": {}}'::jsonb, true),
       ('plan_caja', 41,
        'El plan de caja semana por semana (el planificador de Finanzas › Cobros y pagos): caja de hoy por cuenta y, para cada semana, lo que entra, lo que sale y el saldo, con el saldo «si solo entra lo seguro»; '
        || 'lo más grande que entra y que sale; lo vencido que todavía no tiene fecha de cobro o de pago; y los avisos de lo que falta cargar. '
        || 'Usala cuando pregunten «¿cuándo nos quedamos sin plata?», «¿qué entra y qué sale esta semana o este mes?», «¿cómo viene la caja?», «¿qué cobramos en diciembre?». '
        || 'Con «semana» trae el detalle de una semana; con «con_dudosas» cuenta también los cobros dudosos (el escenario optimista).',
        'Plan de caja', 'Armando el plan de caja semana por semana…', '/analisis/cobros-pagos?ver=plan',
        '{"type": "object", "properties": {
            "semanas": {"type": "integer", "description": "Cuántas semanas mirar, de 4 a 26. Si no se manda: 13."},
            "moneda": {"type": "string", "enum": ["CLP", "USD"], "description": "En qué moneda ver el plan. Si no se manda: pesos chilenos."},
            "con_dudosas": {"type": "boolean", "description": "true para contar también los cobros marcados como dudosos (escenario optimista)."},
            "con_viajes": {"type": "boolean", "description": "false para no contar los viajes que todavía no se facturaron."},
            "semana": {"type": "integer", "description": "Para traer el detalle de una semana: 0 es esta semana, 1 la que viene, y así."}}}'::jsonb, true),
       ('reparto_plata', 42,
        'La propuesta de QUÉ HACER CON LA PLATA: con la caja de hoy más la plata que entra, reparte paso por paso según las reglas que puso Gerencia '
        || '(una cuota de cada leasing o crédito, guardar para los sueldos que vienen, la espalda para operar y, con el resto, cancelar deudas vencidas empezando por las que cobran interés). '
        || 'Dice cuánto va a cada paso, qué renglones se pagan, qué queda sin cubrir, cuánto sobra, lo que vence en estos días y no se guarda, y los avisos. '
        || 'Usala cuando digan «entran 150 millones, ¿qué hacemos?», «¿qué pagamos primero?», «¿a qué le damos prioridad?», «¿cuánto podemos destinar a deudas?», «¿nos alcanza para los sueldos?». '
        || 'Se pueden probar otra espalda u otro orden sin cambiar las reglas guardadas. Es solo una propuesta: no registra pagos.',
        'Qué hacer con la plata', 'Repartiendo la plata paso por paso…', '/analisis/cobros-pagos?ver=plan',
        '{"type": "object", "properties": {
            "entra": {"type": "number", "description": "Plata que entra y todavía NO está en el saldo del sistema, en la moneda de «entra_moneda». Número completo, sin puntos: 150 millones = 150000000. Si la plata ya está en bancos y la cartola está importada, no lo mandes: ya está en la caja."},
            "entra_moneda": {"type": "string", "enum": ["CLP", "USD", "ARS"], "description": "Moneda de «entra». Si no se manda: pesos chilenos."},
            "usar_caja": {"type": "boolean", "description": "false para repartir SOLO lo que entra, sin contar lo que ya hay en bancos y cajas. Si no se manda: se cuenta."},
            "espalda": {"type": "number", "description": "Para probar otra espalda, en pesos chilenos, sin cambiar la regla guardada."},
            "reserva_sueldos_dias": {"type": "integer", "description": "Para probar guardando los sueldos de otra cantidad de días (0 a 60)."},
            "orden": {"type": "array", "items": {"type": "string", "enum": ["cuotas", "sueldos", "espalda", "deudas"]}, "description": "Para probar otro orden de los cuatro pasos (los cuatro, una vez cada uno) sin cambiar la regla guardada."}}}'::jsonb, true),
       ('deudas', 43,
        'Todo lo que la empresa debe hoy: total y vencido; por clase (cuotas de leasing y créditos, sueldos, impuestos, proveedores, combustible); cada contrato en cuotas '
        || '(cuotas vencidas, cuota de cada mes, en qué cuota va, cuántas faltan y el saldo que queda por pagar, con el interés por mes si se sabe); los proveedores a los que más se les debe; '
        || 'el interés que se está generando por mes con lo vencido; y lo que ya costó pagar tarde. Con «acreedor» trae los documentos de un contrato, banco o proveedor uno por uno. '
        || 'Usala para «¿cuánto debemos?», «¿a quién le debemos más?», «¿cómo están los leasing?», «¿qué deuda nos cuesta más?», «¿cuánto pagamos de intereses por atraso?».',
        'Deudas', 'Sumando lo que debemos…', '/analisis/cobros-pagos?ver=pagar',
        '{"type": "object", "properties": {
            "acreedor": {"type": "string", "description": "Parte del nombre de un proveedor, banco o contrato para traer sus documentos uno por uno (por ejemplo «leasing» o el nombre del banco)."}}}'::jsonb, true),
       ('cobranzas', 44,
        'Lo que nos deben los clientes: total, vencido y por antigüedad (1 a 30, 31 a 60, 61 a 90 y más de 90 días); por cliente (cuánto debe, cuánto vencido, hace cuánto, cuánto suele tardar, '
        || 'cuándo se espera cobrar y las notas cargadas en el planificador); cuánto pesa el cliente más grande; lo que falta facturar; lo facturado y lo cobrado últimamente y los días de cobro. '
        || 'Con «cliente» trae sus facturas una por una. Usala para «¿quién nos debe?», «¿cuánto nos debe tal cliente?», «¿cuándo cobramos?», «¿qué cobranzas vienen?», «¿a quién hay que reclamarle?».',
        'Cobranzas', 'Sumando lo que nos deben…', '/analisis/cobros-pagos?ver=cobrar',
        '{"type": "object", "properties": {
            "cliente": {"type": "string", "description": "Parte del nombre de un cliente para traer sus facturas una por una."}}}'::jsonb, true)
ON CONFLICT (codigo) DO UPDATE
   SET descripcion = EXCLUDED.descripcion, etiqueta = EXCLUDED.etiqueta, leyendo = EXCLUDED.leyendo, pantalla = EXCLUDED.pantalla,
       entrada = EXCLUDED.entrada, activa = true;

-- El despacho de lecturas conoce las nuevas (igual que Iris 10 a 15 y la 309)
DO $do$
DECLARE v_def text := pg_get_functiondef('ia.fn_herramienta(text, jsonb)'::regprocedure);
        v_a2 constant text := 'ELSE ia.fn_lectura_tipo_cambio(p_entrada) END);';
BEGIN
    IF v_def LIKE '%situacion_financiera%' THEN RETURN; END IF;
    IF v_def !~ 'p_codigo IN \(''viento_en_ruta''[^)]*\)' OR position(v_a2 IN v_def) = 0 THEN
        RAISE EXCEPTION 'ia.fn_herramienta no es la que esperaba esta migración: avisar antes de seguir';
    END IF;
    v_def := regexp_replace(v_def, '(p_codigo IN \(''viento_en_ruta''[^)]*)\)', '\1, ''situacion_financiera'', ''plan_caja'', ''reparto_plata'', ''deudas'', ''cobranzas'')');
    v_def := replace(v_def, v_a2, 'WHEN ''situacion_financiera'' THEN ia.fn_lectura_situacion_financiera(p_entrada)
                    WHEN ''plan_caja'' THEN ia.fn_lectura_plan_caja(p_entrada)
                    WHEN ''reparto_plata'' THEN ia.fn_lectura_reparto_plata(p_entrada)
                    WHEN ''deudas'' THEN ia.fn_lectura_deudas(p_entrada)
                    WHEN ''cobranzas'' THEN ia.fn_lectura_cobranzas(p_entrada)
                    ' || v_a2);
    EXECUTE v_def;
END $do$;

-- ---------------------------------------------------------------------------------
-- 3 · Las instrucciones: el bloque de finanzas (se agrega al final, sin tocar las reglas que ya están)
-- ---------------------------------------------------------------------------------
DO $do$
DECLARE
    v_def text := pg_get_functiondef('ia.fn_instrucciones_asistente()'::regprocedure);
    v_nuevo constant text := $t$
        || ' FINANZAS. Cuando pregunten por la plata de la empresa (caja, bancos, qué pagar, qué hacer con plata que entra, deudas, leasing, intereses, sueldos por pagar, cobranzas, clientes que deben, '
        || 'si alcanza la plata) respondé como el gerente financiero de la empresa: con los números del sistema, una recomendación concreta y los riesgos. Para estos temas, estas reglas valen por encima de la 2 y de la 28. '
        || 'F1) Qué lectura usar: «situacion_financiera» para la foto general (cómo estamos, si alcanza la plata, cuánto aguantamos); «plan_caja» para semana por semana: qué entra, qué sale y cuándo falta plata; '
        || '«reparto_plata» para qué hacer con la plata que hay o con plata que entra; «deudas» para cuánto debemos, a quién, qué está vencido, cómo están los leasing y qué deuda cuesta más; '
        || '«cobranzas» para quién nos debe, cuánto, hace cuánto y cuándo se espera cobrar. Si la pregunta es amplia, empezá por «situacion_financiera» y después pedí la que haga falta. '
        || 'Para lo ya ocurrido y contabilizado siguen «estado_resultados» y «flujo_caja»; «proyeccion» queda para el resultado del mes y el punto de equilibrio, no para la caja ni las deudas. '
        || 'F2) Si dicen «qué hacemos con la plata», «entran X», «nos pagan X» o «cobramos X», usá «reparto_plata» y mandá en «entra» el monto que dicen, completo (150 millones = 150000000; si no dicen la moneda son pesos chilenos). '
        || 'Si la plata ya está en el banco y en el saldo del sistema, no mandes «entra»: ya está contada en la caja; si no queda claro, tomala como plata que todavía no entró y decí ese supuesto en una frase. '
        || 'Respondé en este orden: a) cuánta plata hay para repartir (caja de hoy más lo que entra); '
        || 'b) una tabla con los pasos en el orden de las reglas (esta tabla no se ordena de mayor a menor): para qué, cuánto se asigna y cuánto queda; c) qué queda sin cubrir o cuánto sobra; '
        || 'd) hasta tres avisos o riesgos, los más importantes; e) qué harías esta semana, en una o dos frases. Si piden el detalle de un paso, la lista de sus renglones. '
        || 'F3) El orden del reparto, la espalda y los días de sueldos los pone Gerencia y vienen en «reglas_de_gerencia»: respetalos. Si con tu criterio conviene otra cosa, decilo aparte, como sugerencia, '
        || 'con el motivo y el número: podés probar otro orden con «orden» u otra espalda con «espalda» y comparar los dos resultados. Nunca presentes tu sugerencia como si fuera la regla. '
        || 'F4) Tu criterio para sugerir y para avisar riesgos: primero que la empresa pueda seguir operando (combustible, fondos de los choferes, aduana), porque sin viajes no entra plata; '
        || 'los sueldos con sus cotizaciones y los impuestos suelen ser lo más caro y riesgoso de atrasar: avisalo y decí que lo confirmen con el estudio contable; '
        || 'en los leasing el riesgo es juntar cuotas vencidas en un mismo contrato, porque pueden reclamar el equipo: mejor una cuota en cada contrato que varias en uno solo; '
        || 'después, primero la deuda que más interés cobra y, a igual interés, la más vieja; no adelantes pagos que no vencen ni generan interés mientras haya deuda cara; '
        || 'no cuentes con cobros dudosos: mirá también el saldo «si solo entra lo seguro»; si un solo cliente pesa mucho en lo que nos deben, decilo como riesgo; y dejá siempre la espalda. '
        || 'Podés proponer acciones de gestión atadas a un número de la lectura: a quién reclamarle primero (el que más debe vencido), a quién pedirle fecha de pago, con qué acreedor conviene negociar plazo '
        || '(el que más interés cobra o el contrato con más cuotas vencidas), qué pagos pasar de semana. No recomiendes inversiones ni productos financieros puntuales. '
        || 'F5) Decí lo que le falta a la cuenta para ser firme, si la lectura lo trae en «avisos» o «datos_que_faltan»: deudas sin el dato del interés, liquidaciones sin preparar, cartolas viejas o líneas sin conciliar '
        || '(la caja puede no ser la real), impuestos o préstamos que no están cargados, viajes sin precio. Con una frase alcanza, eligiendo lo que más cambia el resultado. '
        || 'F6) Los números salen de las lecturas. Podés sumar, restar, sacar porcentajes y comparar esos números; cuando lo hagas, decí «cuenta mía». No inventes tasas, fechas de pago ni montos. '
        || 'Para suponer algo («si tal cliente no paga», «si entra el doble», «si guardamos menos») usá las opciones de las lecturas («con_dudosas», «entra», «espalda», «orden», «reserva_sueldos_dias»); '
        || 'si no hay una opción para eso, decí que esa simulación no la podés hacer exacta y qué se puede mirar en su lugar. '
        || 'F7) Hablá en pesos chilenos salvo que pidan dólares; los montos grandes, en millones con un decimal («59,1 millones de pesos») y con la moneda en letras. '
        || 'Los sueldos y los fondos de los choferes nunca van por persona: por grupo (choferes, oficina). '
        || 'F8) Vos proponés; decide Gerencia, y los pagos se registran en Finanzas › Cobros y pagos › Por pagar. No digas que algo es obligatorio por ley ni des consejo legal o tributario: '
        || 'nombrá el riesgo y decí que lo confirmen con el estudio contable. Si te piden cambiar las reglas, la espalda o el interés de una deuda, explicá que se hace en Finanzas › Cobros y pagos › Planificador de caja.'$t$;
BEGIN
    IF v_def LIKE '%«reparto_plata»%' THEN RETURN; END IF;
    IF v_def !~ '\$function\$\s*$' OR v_def NOT LIKE '%REGLAS: %' THEN
        RAISE EXCEPTION 'ia.fn_instrucciones_asistente no es la que esperaba esta migración: avisar antes de seguir';
    END IF;
    -- Se agrega al final del texto, justo antes de que cierre la función (si terminaba con punto y coma, se saca)
    BEGIN
        EXECUTE regexp_replace(v_def, ';?\s*\$function\$\s*$', v_nuevo || E'\n$function$\n');
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'No se pudo agregar el bloque de finanzas a las instrucciones de Iris (%). No se aplicó nada: avisar antes de seguir.', SQLERRM;
    END;
END $do$;

-- ---------------------------------------------------------------------------------
-- 4 · Dos preguntas sugeridas (ya traen sus lecturas hechas)
-- ---------------------------------------------------------------------------------
-- Van al final de las que ya hay (si ya estaban, conservan su lugar)
INSERT INTO ia.asistente_sugerida (codigo, orden, pregunta, herramientas, activa)
SELECT x.codigo, least((SELECT coalesce(max(s.orden), 0) FROM ia.asistente_sugerida s WHERE s.codigo NOT LIKE 'finanzas\_%') + x.n, 32000), x.pregunta, x.herramientas, true
  FROM (VALUES ('finanzas_que_hacer', 1, '¿Qué hacemos con la plata que hay hoy?', '[{"herramienta": "reparto_plata", "entrada": {}}]'::jsonb),
               ('finanzas_como_estamos', 2, '¿Cómo estamos de caja y qué viene en las próximas semanas?', '[{"herramienta": "situacion_financiera", "entrada": {}}]'::jsonb)
       ) x(codigo, n, pregunta, herramientas)
ON CONFLICT (codigo) DO UPDATE SET pregunta = EXCLUDED.pregunta, herramientas = EXCLUDED.herramientas, activa = true;

-- ---------------------------------------------------------------------------------
-- 5 · Permisos: las lecturas, como «proyeccion»; lo demás es interno
-- ---------------------------------------------------------------------------------
SELECT pg_temp.fn_copiar_permisos('ia.fn_lectura_proyeccion(jsonb)', 'ia.fn_lectura_situacion_financiera(jsonb)');
SELECT pg_temp.fn_copiar_permisos('ia.fn_lectura_proyeccion(jsonb)', 'ia.fn_lectura_plan_caja(jsonb)');
SELECT pg_temp.fn_copiar_permisos('ia.fn_lectura_proyeccion(jsonb)', 'ia.fn_lectura_reparto_plata(jsonb)');
SELECT pg_temp.fn_copiar_permisos('ia.fn_lectura_proyeccion(jsonb)', 'ia.fn_lectura_deudas(jsonb)');
SELECT pg_temp.fn_copiar_permisos('ia.fn_lectura_proyeccion(jsonb)', 'ia.fn_lectura_cobranzas(jsonb)');
SELECT pg_temp.fn_solo_interna('ia.fn_fin_cobranzas(jsonb, text)');
SELECT pg_temp.fn_solo_interna('ia.fn_fin_deudas(jsonb, text)');
SELECT pg_temp.fn_solo_interna('ia.fn_fin_plan(jsonb, integer)');
SELECT pg_temp.fn_copiar_permisos('ia.fn_num(jsonb)', 'ia.fn_monto(jsonb)');
SELECT pg_temp.fn_copiar_permisos('ia.fn_num(jsonb)', 'ia.fn_si(jsonb)');
SELECT pg_temp.fn_solo_interna('ia.fn_fin_grupo(text, bigint)');

-- ---------------------------------------------------------------------------------
-- 6 · Prueba con los datos de esta base: las cinco lecturas por el mismo camino que usa Iris
-- ---------------------------------------------------------------------------------
DO $t$
DECLARE r jsonb; l record; v_txt text;
BEGIN
    FOR l IN SELECT * FROM (VALUES ('situacion_financiera', '{}'::jsonb), ('plan_caja', '{"semanas": 8, "semana": 0}'), ('reparto_plata', '{"entra": 150000000}'),
                                   ('deudas', '{"acreedor": "a"}'), ('cobranzas', '{"cliente": "a"}')) x(codigo, entrada) LOOP
        r := ia.fn_herramienta(l.codigo, l.entrada);
        IF NOT coalesce((r ->> 'ok')::boolean, false) THEN
            RAISE EXCEPTION 'la lectura «%» no anduvo: %', l.codigo, coalesce(r ->> 'error', 'sin respuesta');
        END IF;
        IF length((r -> 'datos')::text) > 30000 THEN
            RAISE EXCEPTION 'la lectura «%» es demasiado grande para Iris (% letras)', l.codigo, length((r -> 'datos')::text);
        END IF;
    END LOOP;
    v_txt := ia.fn_instrucciones_asistente();
    IF v_txt NOT LIKE '%FINANZAS. %' OR v_txt NOT LIKE '%«reparto_plata»%' OR v_txt NOT LIKE '%F8) %' THEN
        RAISE EXCEPTION 'las instrucciones quedaron sin el bloque de finanzas';
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles g, (VALUES ('ia.fn_lectura_situacion_financiera(jsonb)'), ('ia.fn_lectura_plan_caja(jsonb)'), ('ia.fn_lectura_reparto_plata(jsonb)'),
                                               ('ia.fn_lectura_deudas(jsonb)'), ('ia.fn_lectura_cobranzas(jsonb)')) f(fn)
                WHERE (g.rolname LIKE 'tc\_%' OR g.rolname = 'authenticated')
                  AND has_function_privilege(g.rolname, 'ia.fn_lectura_proyeccion(jsonb)', 'EXECUTE') <> has_function_privilege(g.rolname, f.fn, 'EXECUTE')) THEN
        RAISE EXCEPTION 'las lecturas nuevas quedaron con un permiso distinto al de «proyeccion»';
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Iris 19 no pasó su prueba con los datos de esta base (%). No se aplicó nada: avisar antes de seguir.', SQLERRM;
END $t$;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Resultado: lo que Iris va a leer hoy
SELECT 'iris 19 aplicada' AS que,
       (SELECT count(*) FROM ia.asistente_herramienta WHERE activa) AS lecturas_activas,
       (SELECT string_agg(codigo, ', ' ORDER BY orden) FROM ia.asistente_herramienta WHERE codigo IN ('situacion_financiera', 'plan_caja', 'reparto_plata', 'deudas', 'cobranzas') AND activa) AS lecturas_de_finanzas,
       length(ia.fn_instrucciones_asistente()) AS letras_de_las_instrucciones,
       ia.fn_instrucciones_asistente() LIKE '%FINANZAS. %' AS con_el_bloque_de_finanzas,
       (SELECT count(*) FROM ia.asistente_sugerida WHERE activa AND codigo LIKE 'finanzas\_%') AS preguntas_sugeridas_de_finanzas,
       (ia.fn_lectura_situacion_financiera('{}') #>> '{caja,hoy_clp}')::numeric AS caja_hoy_clp,
       (ia.fn_lectura_reparto_plata('{}') ->> 'queda_sin_cubrir_clp')::numeric AS sin_cubrir_con_la_caja_de_hoy;
