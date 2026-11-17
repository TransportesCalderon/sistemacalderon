-- Finanzas › Gastos fijos · Cuotas con atraso (leasing o crédito que se paga más tarde de lo previsto)
-- Pedido de Gerencia (17/11/2026). NO cambia web.version_base. Necesita gasto_fijo_cuotas.sql aplicada. Se puede correr más de una vez.
-- Cambio de regla: un gasto fijo CON CUOTAS ya no termina por fecha sino cuando se emitieron todas sus cuotas.
--   cuotas emitidas = «cuotas ya pagadas antes de cargarlo en el sistema» + los gastos del mes que generó el sistema.
--   Mientras falten cuotas, el sistema sigue generando una por mes aunque haya pasado la fecha original de fin (atraso).
-- Los gastos fijos sin cuotas siguen igual (terminan en «hasta»).

BEGIN;

DO $do$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'fin' AND table_name = 'gasto_fijo' AND column_name = 'cuotas')
       OR pg_get_functiondef('fin.fn_guardar_gasto_fijo(bigint, jsonb)'::regprocedure) NOT LIKE '%v_cuotas%' THEN
        RAISE EXCEPTION 'Primero hay que correr gasto_fijo_cuotas.sql';
    END IF;
END $do$;

ALTER TABLE fin.gasto_fijo ADD COLUMN IF NOT EXISTS cuotas_previas smallint;
COMMENT ON COLUMN fin.gasto_fijo.cuotas_previas IS 'Cuotas ya pagadas antes de que el sistema empezara a generar este gasto (leasing o crédito viejo).';
DO $do$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_gasto_fijo_cuotas_previas') THEN
        ALTER TABLE fin.gasto_fijo ADD CONSTRAINT ck_gasto_fijo_cuotas_previas
            CHECK (cuotas_previas IS NULL OR (cuotas IS NOT NULL AND cuotas_previas BETWEEN 0 AND cuotas));
    END IF;
END $do$;

-- Cuántas cuotas van emitidas (las de antes + las generadas en el sistema)
CREATE OR REPLACE FUNCTION fin.fn_gasto_fijo_cuotas_hechas(p_id bigint)
 RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT coalesce(f.cuotas_previas, 0)::integer
           + (SELECT count(*) FROM fin.gasto g WHERE g.gasto_fijo_id = f.id AND g.estado <> 'anulado' AND g.eliminado_en IS NULL)::integer
      FROM fin.gasto_fijo f WHERE f.id = p_id
$f$;

-- ¿Le corresponde un gasto en ese mes? Sin cuotas: por fechas. Con cuotas: mientras falten (o si el de ese mes ya está generado)
CREATE OR REPLACE FUNCTION fin.fn_gasto_fijo_corresponde(p_id bigint, p_mes date)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT f.desde <= p_mes AND CASE
             WHEN f.cuotas IS NULL THEN f.hasta IS NULL OR f.hasta >= p_mes
             ELSE fin.fn_gasto_fijo_cuotas_hechas(f.id) < f.cuotas
                  OR EXISTS (SELECT 1 FROM fin.gasto g WHERE g.gasto_fijo_id = f.id AND g.periodo = p_mes AND g.estado <> 'anulado' AND g.eliminado_en IS NULL) END
      FROM fin.gasto_fijo f WHERE f.id = p_id
$f$;
REVOKE ALL ON FUNCTION fin.fn_gasto_fijo_cuotas_hechas(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION fin.fn_gasto_fijo_corresponde(bigint, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION fin.fn_gasto_fijo_cuotas_hechas(bigint) TO tc_app, tc_admin, tc_lectura, tc_auditor;
GRANT EXECUTE ON FUNCTION fin.fn_gasto_fijo_corresponde(bigint, date) TO tc_app, tc_admin, tc_lectura, tc_auditor;

-- Las tres funciones que decidían por fecha pasan a usar la regla nueva
DO $do$
DECLARE r record; v text; n integer;
BEGIN
    FOR r IN SELECT * FROM (VALUES
        ('fin.fn_generar_gastos_fijos_mes(date)', 'desde <= v_mes AND (hasta IS NULL OR hasta >= v_mes)', 'fin.fn_gasto_fijo_corresponde(gasto_fijo.id, v_mes)'),
        ('fin.fn_gastos_fijos()', 'f.desde <= v_mes AND (f.hasta IS NULL OR f.hasta >= v_mes)', 'fin.fn_gasto_fijo_corresponde(f.id, v_mes)'),
        ('fin.fn_tablero_finanzas()', 'f.desde <= v_mes AND (f.hasta IS NULL OR f.hasta >= v_mes)', 'fin.fn_gasto_fijo_corresponde(f.id, v_mes)')) x(fn, viejo, nuevo) LOOP
        v := pg_get_functiondef(r.fn::regprocedure);
        CONTINUE WHEN v LIKE '%fn_gasto_fijo_corresponde%';
        n := (length(v) - length(replace(v, r.viejo, ''))) / length(r.viejo);
        IF n <> 1 THEN RAISE EXCEPTION '% no es la que esperaba esta migración: avisar antes de seguir', r.fn; END IF;
        EXECUTE replace(v, r.viejo, r.nuevo);
    END LOOP;
END $do$;

-- El gasto que se genera dice qué cuota es
DO $do$
DECLARE v text := pg_get_functiondef('fin.fn_generar_gastos_fijos_mes(date)'::regprocedure);
        a constant text := 'f.nombre || '' · '' || to_char(v_mes, ''MM/YYYY''),';
BEGIN
    IF v LIKE '%cuota '' ||%' THEN RETURN; END IF;
    IF position(a IN v) = 0 THEN RAISE EXCEPTION 'fin.fn_generar_gastos_fijos_mes no es la que esperaba esta migración (descripción)'; END IF;
    EXECUTE replace(v, a, 'f.nombre || '' · '' || to_char(v_mes, ''MM/YYYY'')
               || CASE WHEN f.cuotas IS NOT NULL THEN '' · cuota '' || (fin.fn_gasto_fijo_cuotas_hechas(f.id) + 1) || '' de '' || f.cuotas ELSE '''' END,');
END $do$;

-- La lista: cuotas emitidas, las que faltan, si terminó y si viene atrasado
DO $do$
DECLARE v text := pg_get_functiondef('fin.fn_gastos_fijos()'::regprocedure); i integer; j integer;
BEGIN
    IF v LIKE '%cuotas_previas%' THEN RETURN; END IF;
    i := position('''cuota_actual'', CASE' IN v); j := position('''terminado'', f.hasta IS NOT NULL AND f.hasta < v_mes,' IN v);
    IF i = 0 OR j = 0 OR j < i THEN RAISE EXCEPTION 'fin.fn_gastos_fijos no es la que esperaba esta migración: avisar antes de seguir'; END IF;
    v := substring(v FROM 1 FOR i - 1)
      || '''cuotas_previas'', f.cuotas_previas,
                       ''cuota_actual'', CASE WHEN f.cuotas IS NOT NULL THEN least(fin.fn_gasto_fijo_cuotas_hechas(f.id), f.cuotas) END,
                       ''terminado'', CASE WHEN f.cuotas IS NOT NULL THEN fin.fn_gasto_fijo_cuotas_hechas(f.id) >= f.cuotas AND NOT fin.fn_gasto_fijo_corresponde(f.id, v_mes)
                                         ELSE f.hasta IS NOT NULL AND f.hasta < v_mes END,
                       ''atrasado'', f.cuotas IS NOT NULL AND f.hasta IS NOT NULL AND f.hasta < v_mes AND fin.fn_gasto_fijo_cuotas_hechas(f.id) < f.cuotas,'
      || substring(v FROM j + length('''terminado'', f.hasta IS NOT NULL AND f.hasta < v_mes,'));
    EXECUTE v;
END $do$;

-- Guardar: acepta «cuotas_previas»
DO $do$
DECLARE v text := pg_get_functiondef('fin.fn_guardar_gasto_fijo(bigint, jsonb)'::regprocedure); a text[]; i integer;
BEGIN
    IF v LIKE '%v_previas%' THEN RETURN; END IF;
    a := ARRAY[
        'v_cuotas smallint := nullif(p_datos ->> ''cuotas'', '''')::smallint;',
        'v_cuotas smallint := nullif(p_datos ->> ''cuotas'', '''')::smallint; v_previas smallint := nullif(p_datos ->> ''cuotas_previas'', '''')::smallint;',
        '    IF v_hasta IS NOT NULL AND v_hasta < v_desde THEN',
        '    IF v_cuotas IS NULL THEN v_previas := NULL;
    ELSIF coalesce(v_previas, 0) NOT BETWEEN 0 AND v_cuotas THEN
        RAISE EXCEPTION ''Las cuotas ya pagadas van de 0 a % (el total de cuotas)'', v_cuotas USING ERRCODE = ''22023'';
    END IF;
    IF v_hasta IS NOT NULL AND v_hasta < v_desde THEN',
        'desde, hasta, activo, observacion, cuotas)', 'desde, hasta, activo, observacion, cuotas, cuotas_previas)',
        '''''), v_cuotas)', '''''), v_cuotas, v_previas)',
        'cuotas = v_cuotas,', 'cuotas = v_cuotas, cuotas_previas = v_previas,'];
    FOR i IN 1 .. array_length(a, 1) / 2 LOOP
        IF (length(v) - length(replace(v, a[2 * i - 1], ''))) / length(a[2 * i - 1]) <> 1 THEN
            RAISE EXCEPTION 'fin.fn_guardar_gasto_fijo no es la que esperaba esta migración (paso %): avisar antes de seguir', i;
        END IF;
        v := replace(v, a[2 * i - 1], a[2 * i]);
    END LOOP;
    EXECUTE v;
END $do$;

COMMIT;
