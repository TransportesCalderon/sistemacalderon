-- Finanzas › Gastos fijos · Un gasto fijo que cubre varias unidades (por ejemplo, un leasing de 3 tractores y 3 semirremolques)
-- Pedido de Gerencia (17/11/2026). NO cambia web.version_base. Necesita gasto_fijo_cuotas_03.sql. Se puede correr más de una vez.
-- Decisiones: la cuota se reparte en PARTES IGUALES entre las unidades; sirve para saber qué cubre y para el costo fijo por unidad.
-- La cuota se sigue pagando entera (un solo gasto por mes) y la contabilidad no se abre por unidad.

BEGIN;

DO $do$
BEGIN
    IF to_regprocedure('fin.fn_gasto_fijo_cuota_de(bigint, date)') IS NULL THEN RAISE EXCEPTION 'Primero hay que correr gasto_fijo_cuotas_03.sql'; END IF;
END $do$;

CREATE TABLE IF NOT EXISTS fin.gasto_fijo_equipo (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    gasto_fijo_id bigint NOT NULL REFERENCES fin.gasto_fijo(id),
    camion_id     bigint REFERENCES mae.camion(id),
    semi_id       bigint REFERENCES mae.semirremolque(id),
    creado_en     timestamptz NOT NULL DEFAULT now(),
    creado_por    bigint,
    CONSTRAINT ck_gfe_una_unidad CHECK ((camion_id IS NULL) <> (semi_id IS NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS ux_gfe_camion ON fin.gasto_fijo_equipo (gasto_fijo_id, camion_id) WHERE camion_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS ux_gfe_semi ON fin.gasto_fijo_equipo (gasto_fijo_id, semi_id) WHERE semi_id IS NOT NULL;
COMMENT ON TABLE fin.gasto_fijo_equipo IS 'Unidades (tractores y semirremolques) que cubre un gasto fijo. El monto del mes se reparte en partes iguales.';
REVOKE ALL ON fin.gasto_fijo_equipo FROM PUBLIC;

-- Guardar el gasto fijo con sus unidades (todo junto)
CREATE OR REPLACE FUNCTION fin.fn_guardar_gasto_fijo_equipos(p_id bigint, p_datos jsonb, p_camiones bigint[], p_semis bigint[])
 RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE v_id bigint; v_cam bigint[] := coalesce(p_camiones, '{}'); v_sem bigint[] := coalesce(p_semis, '{}'); v_n integer;
BEGIN
    PERFORM fin.fn_exigir_finanzas();
    v_n := coalesce(array_length(v_cam, 1), 0) + coalesce(array_length(v_sem, 1), 0);
    IF v_n > 60 THEN RAISE EXCEPTION 'Son demasiadas unidades' USING ERRCODE = '22023'; END IF;
    IF EXISTS (SELECT 1 FROM unnest(v_cam) x WHERE NOT EXISTS (SELECT 1 FROM mae.camion c WHERE c.id = x AND c.eliminado_en IS NULL))
       OR EXISTS (SELECT 1 FROM unnest(v_sem) x WHERE NOT EXISTS (SELECT 1 FROM mae.semirremolque s WHERE s.id = x AND s.eliminado_en IS NULL)) THEN
        RAISE EXCEPTION 'Alguna de las unidades elegidas no existe' USING ERRCODE = 'P0002';
    END IF;
    -- Con varias unidades, el campo «Camión» del gasto fijo queda vacío (la lista manda)
    v_id := fin.fn_guardar_gasto_fijo(p_id, CASE WHEN v_n > 0 THEN p_datos || '{"camion_id": null}'::jsonb ELSE p_datos END);
    DELETE FROM fin.gasto_fijo_equipo WHERE gasto_fijo_id = v_id;
    INSERT INTO fin.gasto_fijo_equipo (gasto_fijo_id, camion_id, creado_por) SELECT DISTINCT v_id, x, aud.fn_usuario_actual() FROM unnest(v_cam) x;
    INSERT INTO fin.gasto_fijo_equipo (gasto_fijo_id, semi_id, creado_por) SELECT DISTINCT v_id, x, aud.fn_usuario_actual() FROM unnest(v_sem) x;
    RETURN v_id;
END $function$;

-- Costo fijo por unidad en un mes: cada gasto fijo que corresponde a ese mes, repartido en partes iguales entre sus unidades
CREATE OR REPLACE FUNCTION fin.fn_costo_fijo_equipos(p_mes date)
 RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    WITH m AS (SELECT date_trunc('month', coalesce(p_mes, mae.fn_hoy()))::date AS mes),
    u AS (
        SELECT f.id AS fijo, f.nombre, e.camion_id, e.semi_id FROM fin.gasto_fijo f JOIN fin.gasto_fijo_equipo e ON e.gasto_fijo_id = f.id
        UNION ALL
        SELECT f.id, f.nombre, f.camion_id, NULL::bigint FROM fin.gasto_fijo f
         WHERE f.camion_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM fin.gasto_fijo_equipo e WHERE e.gasto_fijo_id = f.id)),
    p AS (
        SELECT u.*, round(f.monto * fin.fn_tc_clp_o_null(f.moneda, mae.fn_hoy()) / count(*) OVER (PARTITION BY u.fijo), 0) AS clp
          FROM u JOIN fin.gasto_fijo f ON f.id = u.fijo, m
         WHERE f.activo AND f.eliminado_en IS NULL AND fin.fn_gasto_fijo_corresponde(f.id, m.mes)),
    t AS (SELECT tc.tasa FROM fin.tipo_cambio tc WHERE tc.moneda_origen = 'USD' AND tc.moneda_destino = 'CLP' AND tc.eliminado_en IS NULL AND tc.fecha <= mae.fn_hoy() ORDER BY tc.fecha DESC LIMIT 1)
    SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.tipo DESC, q.patente), '[]') FROM (
        SELECT CASE WHEN p.camion_id IS NOT NULL THEN 'tractor' ELSE 'semi' END AS tipo, coalesce(p.camion_id, p.semi_id) AS id,
               coalesce(c.patente, s.patente) AS patente, sum(p.clp) AS clp_mes,
               round(sum(p.clp) / nullif((SELECT tasa FROM t), 0)) AS usd_mes, round(sum(p.clp) / nullif((SELECT tasa FROM t), 0) / 30.4, 1) AS usd_dia,
               string_agg(p.nombre, ' · ' ORDER BY p.nombre) AS de
          FROM p LEFT JOIN mae.camion c ON c.id = p.camion_id LEFT JOIN mae.semirremolque s ON s.id = p.semi_id
         GROUP BY 1, 2, 3) q
$f$;

REVOKE ALL ON FUNCTION fin.fn_guardar_gasto_fijo_equipos(bigint, jsonb, bigint[], bigint[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION fin.fn_costo_fijo_equipos(date) FROM PUBLIC;
DO $do$
DECLARE r record;
BEGIN
    FOR r IN SELECT rolname FROM pg_roles WHERE NOT rolsuper AND rolname LIKE 'tc\_%' AND has_function_privilege(oid, 'fin.fn_guardar_gasto_fijo(bigint, jsonb)', 'EXECUTE') LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_guardar_gasto_fijo_equipos(bigint, jsonb, bigint[], bigint[]) TO %I', r.rolname);
    END LOOP;
    IF NOT has_function_privilege('tc_admin', 'fin.fn_guardar_gasto_fijo_equipos(bigint, jsonb, bigint[], bigint[])', 'EXECUTE') THEN RAISE EXCEPTION 'Faltó el permiso de la web'; END IF;
END $do$;

-- La lista de gastos fijos: unidades de cada uno, el costo por unidad del mes y los semirremolques para elegir
DO $do$
DECLARE v text := pg_get_functiondef('fin.fn_gastos_fijos()'::regprocedure);
        a constant text := '''cuotas_previas'', f.cuotas_previas,'; b constant text := '''mes'', v_mes,';
BEGIN
    IF v LIKE '%fn_costo_fijo_equipos%' THEN RETURN; END IF;
    IF position(a IN v) = 0 OR (length(v) - length(replace(v, b, ''))) / length(b) <> 1 THEN
        RAISE EXCEPTION 'fin.fn_gastos_fijos no es la que esperaba esta migración: avisar antes de seguir';
    END IF;
    v := replace(v, a, a || '
                       ''equipos'', (SELECT coalesce(jsonb_agg(jsonb_build_object(''tipo'', CASE WHEN e.camion_id IS NOT NULL THEN ''tractor'' ELSE ''semi'' END,
                                         ''id'', coalesce(e.camion_id, e.semi_id), ''patente'', coalesce(ec.patente, es.patente)) ORDER BY e.camion_id NULLS LAST, coalesce(ec.patente, es.patente)), ''[]''::jsonb)
                                      FROM fin.gasto_fijo_equipo e LEFT JOIN mae.camion ec ON ec.id = e.camion_id LEFT JOIN mae.semirremolque es ON es.id = e.semi_id
                                     WHERE e.gasto_fijo_id = f.id),');
    v := replace(v, b, b || '
        ''por_unidad'', fin.fn_costo_fijo_equipos(v_mes),
        ''semis'', (SELECT coalesce(jsonb_agg(jsonb_build_object(''id'', s.id, ''patente'', s.patente) ORDER BY s.patente), ''[]''::jsonb) FROM mae.semirremolque s WHERE s.eliminado_en IS NULL),');
    EXECUTE v;
END $do$;

COMMIT;
