-- Combustible · La carga queda con la HORA DEL TICKET, y los litros con sus decimales
-- Pedido de Gerencia (17/11/2026). NO cambia web.version_base. Se puede correr más de una vez.
--  1) Cuando Iris lee el ticket de una orden de carga, la carga se propone y se registra con la fecha y la hora que
--     figuran en el ticket (antes: la hora en que la estación autorizó la orden). Si el ticket no trae hora, o la hora
--     leída no tiene sentido para esa orden, se sigue usando la de la autorización y la pantalla lo avisa.
--     La hora del ticket se toma tal cual está impresa, igual que cuando se carga a mano.
--  2) Litros: la orden guarda los litros cargados con 2 decimales (antes 1) y, al registrar la carga, no se aceptan
--     los litros redondeados si el ticket leído trae decimales.
--  3) Iris lee del ticket los litros con todos sus decimales y la hora de la carga.
--  4) Los mensajes de la base dicen «Iris» en lugar de «la IA».

BEGIN;

DO $do$
BEGIN
    IF to_regprocedure('fue.fn_propuesta_carga_orden(bigint)') IS NULL OR to_regprocedure('fue.fn_registrar_carga_orden(bigint, boolean, jsonb)') IS NULL THEN
        RAISE EXCEPTION 'Faltan las funciones de órdenes de carga (migración 253): avisar antes de seguir';
    END IF;
END $do$;

-- La hora del ticket (el primero que la traiga), si cae entre la autorización y el cierre de la orden (con 2 h de margen)
CREATE OR REPLACE FUNCTION fue.fn_hora_ticket(p_lecturas bigint[], p_desde timestamptz, p_hasta timestamptz)
 RETURNS timestamptz LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT x.ts FROM (
        SELECT ((l.propuesta ->> 'fecha')::date + (l.propuesta ->> 'hora')::time) AT TIME ZONE 'America/Argentina/Mendoza' AS ts
          FROM ia.lectura l
         WHERE l.id = ANY (coalesce(p_lecturas, '{}')) AND l.estado = 'lista' AND l.tipo = 'ticket_combustible'
           AND (l.propuesta ->> 'fecha') ~ '^\d{4}-\d{2}-\d{2}$' AND (l.propuesta ->> 'hora') ~ '^([01]\d|2[0-3]):[0-5]\d$') x
     WHERE (p_desde IS NULL OR x.ts >= p_desde - interval '2 hours') AND x.ts <= coalesce(p_hasta, now()) + interval '2 hours'
     ORDER BY x.ts LIMIT 1
$f$;
REVOKE ALL ON FUNCTION fue.fn_hora_ticket(bigint[], timestamptz, timestamptz) FROM PUBLIC;

-- Litros que Iris leyó en los tickets de una orden (con todos sus decimales)
CREATE OR REPLACE FUNCTION fue.fn_litros_ticket(p_lecturas bigint[])
 RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT sum((l.propuesta ->> 'litros')::numeric) FROM ia.lectura l
     WHERE l.id = ANY (coalesce(p_lecturas, '{}')) AND l.estado = 'lista' AND l.tipo = 'ticket_combustible'
$f$;
REVOKE ALL ON FUNCTION fue.fn_litros_ticket(bigint[]) FROM PUBLIC;

-- La orden guarda los litros cargados con 2 decimales (los mismos que la carga)
DO $do$
BEGIN
    IF (SELECT numeric_scale FROM information_schema.columns WHERE table_schema = 'fue' AND table_name = 'orden_carga' AND column_name = 'litros_cargados') < 2 THEN
        ALTER TABLE fue.orden_carga ALTER COLUMN litros_cargados TYPE numeric(9,2);
    END IF;
END $do$;

-- 1) La propuesta de la carga usa la hora del ticket
DO $do$
DECLARE v_def text := pg_get_functiondef('fue.fn_propuesta_carga_orden(bigint)'::regprocedure);
        v_a1 constant text := 'v_ts := coalesce(o.autorizada_en, o.cargada_en);';
        v_a2 constant text := '''medio_pago'', ''cuenta_corriente'');';
BEGIN
    IF v_def LIKE '%fn_hora_ticket%' THEN RETURN; END IF;
    IF position(v_a1 IN v_def) = 0 OR position(v_a2 IN v_def) = 0 THEN
        RAISE EXCEPTION 'fue.fn_propuesta_carga_orden no es la que esperaba esta migración: avisar antes de seguir';
    END IF;
    v_def := replace(v_def, v_a1, 'v_ts := coalesce(fue.fn_hora_ticket(o.lecturas, o.autorizada_en, o.cargada_en), o.autorizada_en, o.cargada_en);');
    v_def := replace(v_def, v_a2, '''medio_pago'', ''cuenta_corriente'',
        ''hora_del_ticket'', fue.fn_hora_ticket(o.lecturas, o.autorizada_en, o.cargada_en) IS NOT NULL,
        ''litros_ticket'', fue.fn_litros_ticket(o.lecturas));');
    -- Órdenes viejas guardadas con 1 decimal: si coinciden con el ticket, se proponen los litros del ticket con 2 decimales
    v_def := replace(v_def, '''fecha_hora'', v_ts, ''litros'', o.litros_cargados,',
        '''fecha_hora'', v_ts, ''litros'', CASE WHEN round(fue.fn_litros_ticket(o.lecturas), 1) = round(o.litros_cargados, 1)
                                                THEN round(fue.fn_litros_ticket(o.lecturas), 2) ELSE o.litros_cargados END,');
    EXECUTE v_def;
END $do$;

-- 2) Al registrar: no se aceptan los litros redondeados cuando el ticket leído trae decimales
DO $do$
DECLARE v_def text := pg_get_functiondef('fue.fn_registrar_carga_orden(bigint, boolean, jsonb)'::regprocedure);
        v_a constant text := 'IF v_lit IS NULL OR v_lit <= 0 THEN RAISE EXCEPTION ''Faltan los litros cargados'' USING ERRCODE = ''23502''; END IF;';
BEGIN
    IF v_def LIKE '%fn_litros_ticket%' THEN RETURN; END IF;
    IF position(v_a IN v_def) = 0 THEN RAISE EXCEPTION 'fue.fn_registrar_carga_orden no es la que esperaba esta migración: avisar antes de seguir'; END IF;
    EXECUTE replace(v_def, v_a, v_a || '
    IF round(fue.fn_litros_ticket(o.lecturas), 2) <> round(v_lit, 2) AND abs(fue.fn_litros_ticket(o.lecturas) - v_lit) < 1 THEN
        RAISE EXCEPTION ''El ticket dice % L: cargá los litros con sus decimales, sin redondear'', replace(to_char(round(fue.fn_litros_ticket(o.lecturas), 2), ''FM999999990.00''), ''.'', '','') USING ERRCODE = ''23514'';
    END IF;');
END $do$;

-- La carga del genset que nace de la orden también toma la hora del ticket
DO $do$
DECLARE v_def text; v_a constant text := '''fecha_hora'', coalesce(o.autorizada_en, now())';
BEGIN
    IF to_regprocedure('fue.fn_registrar_carga_orden_genset(bigint, numeric, numeric, numeric, bigint[])') IS NULL THEN RETURN; END IF;
    v_def := pg_get_functiondef('fue.fn_registrar_carga_orden_genset(bigint, numeric, numeric, numeric, bigint[])'::regprocedure);
    IF v_def LIKE '%fn_hora_ticket%' THEN RETURN; END IF;
    IF position(v_a IN v_def) = 0 THEN
        RAISE NOTICE 'La carga del genset por orden no es la que esperaba: queda con la hora de la autorización (no se cambió)';
        RETURN;
    END IF;
    EXECUTE replace(v_def, v_a, '''fecha_hora'', coalesce(fue.fn_hora_ticket(p_lecturas, o.autorizada_en, now()), o.autorizada_en, now())');
END $do$;

-- 3) Lo que se le pide a Iris al leer un ticket de combustible
DO $do$
DECLARE v_def text := pg_get_functiondef('ia.fn_instrucciones(text)'::regprocedure);
        v_a constant text := '"fecha" (AAAA-MM-DD), "hora" (HH:MM, 24 h), "litros" (número), ';
BEGIN
    IF v_def LIKE '%con TODOS los decimales%' THEN RETURN; END IF;
    IF position(v_a IN v_def) = 0 THEN RAISE EXCEPTION 'ia.fn_instrucciones no es la que esperaba esta migración: avisar antes de seguir'; END IF;
    EXECUTE replace(v_def, v_a, '"fecha" (AAAA-MM-DD, la de la carga), "hora" (HH:MM, 24 h: la hora de la carga o de emisión impresa en el ticket; si hay varias, la de la venta, no la de una reimpresión; null si no figura), '
        || '"litros" (número con TODOS los decimales tal cual figuran en el ticket, por ejemplo 345.678; nunca redondees), ');
END $do$;

-- 4) Los mensajes dicen «Iris», no «la IA» (pedido de Gerencia): en todas las funciones que hablan de la lectura de documentos
DO $do$
DECLARE r record; v_def text; n integer := 0;
BEGIN
    FOR r IN SELECT p.oid FROM pg_proc p JOIN pg_namespace ns ON ns.oid = p.pronamespace
              WHERE ns.nspname IN ('ia', 'fue', 'fin', 'tel', 'ops') AND p.prokind = 'f' AND p.prosrc ~ '[Ll]a IA' ORDER BY p.oid LOOP
        v_def := pg_get_functiondef(r.oid);
        v_def := replace(replace(replace(replace(replace(v_def, 'de la IA', 'de Iris'), 'con la IA', 'con Iris'), 'a la IA', 'a Iris'), 'La IA', 'Iris'), 'la IA', 'Iris');
        EXECUTE v_def;
        n := n + 1;
    END LOOP;
    RAISE NOTICE 'Funciones con el texto cambiado a «Iris»: %', n;
END $do$;

COMMIT;
