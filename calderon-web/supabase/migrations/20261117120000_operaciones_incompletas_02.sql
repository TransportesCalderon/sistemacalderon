-- Operaciones sin cliente o sin precio · aviso fuerte, escalado a Gerencia y freno al entregar
-- Pedido de Gerencia (17/11/2026). NO cambia web.version_base. Se puede correr más de una vez.
-- Funciona se haya corrido o no «hoy_operaciones_incompletas.sql» (lo reemplaza).
--   1) Una sola fuente: ops.fn_operaciones_incompletas() (para el cartel rojo de Hoy, Operaciones y Pizarra).
--   2) Hoy: cada aviso dice hace cuántos días falta el dato.
--   3) A los 3 días sin resolver (parámetro), le aparece también a Gerencia, con quién cargó la operación; y entra en el informe semanal de Iris.
--   4) FRENO: no se puede marcar «entregada» una operación sin precio o con cliente «SIN CLIENTE» (se apaga con un parámetro).

BEGIN;

INSERT INTO ref.parametro (codigo, valor, descripcion) VALUES
 ('seg.hoy_dias_op_incompleta', '60', 'Hoy: cuántos días hacia atrás se avisa de las operaciones sin cliente o sin precio.'),
 ('seg.hoy_dias_op_a_gerencia', '3', 'Hoy: a los cuántos días sin resolver una operación sin cliente o sin precio le aparece también a Gerencia.'),
 ('ops.entrega_exige_cliente_y_precio', 'true', '«true»: no se puede marcar entregada una operación sin precio o con cliente «SIN CLIENTE». «false» apaga el freno.')
ON CONFLICT (codigo) DO NOTHING;

CREATE OR REPLACE FUNCTION ops.fn_cliente_es_generico(p_cliente bigint)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$ SELECT coalesce((SELECT c.codigo ILIKE '%SIN-CLIENTE%' OR c.razon_social ILIKE 'SIN CLIENTE%' FROM mae.cliente c WHERE c.id = p_cliente), false) $f$;

-- La lista, según el alcance: 'todas' o 'vencidas' (las que pasaron el plazo de Gerencia)
CREATE OR REPLACE FUNCTION ops.fn_operaciones_incompletas_de(p_alcance text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
    v_hoy date := mae.fn_hoy();
    v_dias integer := ref.fn_parametro_num('seg.hoy_dias_op_incompleta', 60)::integer;
    v_plazo integer := ref.fn_parametro_num('seg.hoy_dias_op_a_gerencia', 3)::integer;
    r jsonb;
BEGIN
    WITH o AS (
        SELECT s.id, coalesce(s.numero_operacion::text, s.numero_servicio) AS numero, s.estado, s.creado_en, s.fecha_operacion,
               ops.fn_cliente_es_generico(s.cliente_id) AS falta_cliente,
               (s.precio_viaje IS NULL OR s.precio_viaje <= 0) AND s.estado <> 'facturado' AS falta_precio,
               c.razon_social AS cliente, l.codigo AS linea,
               v_hoy - (s.creado_en AT TIME ZONE 'America/Argentina/Mendoza')::date AS dias,
               (SELECT u.nombre FROM seg.usuario u WHERE u.id = s.creado_por) AS cargada_por
          FROM ops.servicio_comercial s JOIN mae.cliente c ON c.id = s.cliente_id LEFT JOIN mae.linea l ON l.id = s.linea_id
         WHERE s.eliminado_en IS NULL AND s.estado <> 'cancelado'
           AND coalesce(s.fecha_operacion, s.creado_en::date) >= v_hoy - v_dias),
    f AS (SELECT * FROM o WHERE (falta_cliente OR falta_precio) AND (p_alcance = 'todas' OR dias >= v_plazo))
    SELECT jsonb_build_object(
        'alcance', p_alcance, 'plazo_gerencia_dias', v_plazo,
        'total', count(*), 'sin_cliente', count(*) FILTER (WHERE falta_cliente), 'sin_precio', count(*) FILTER (WHERE falta_precio),
        'vencidas', count(*) FILTER (WHERE dias >= v_plazo),
        'entregadas_sin_dato', count(*) FILTER (WHERE estado = 'entregado'),
        'operaciones', coalesce((SELECT jsonb_agg(jsonb_build_object('servicio_id', x.id, 'numero', x.numero, 'estado', x.estado, 'creado_en', x.creado_en,
                'fecha', x.fecha_operacion, 'falta_cliente', x.falta_cliente, 'falta_precio', x.falta_precio, 'cliente', x.cliente, 'linea', x.linea,
                'dias', x.dias, 'vencida', x.dias >= v_plazo, 'cargada_por', x.cargada_por) ORDER BY x.dias DESC, x.id)
              FROM (SELECT * FROM f ORDER BY dias DESC, id LIMIT 200) x), '[]'))
      INTO r FROM f;
    RETURN r;
END $function$;

-- Lo que llama la web: Operaciones ve todas; Gerencia, las que pasaron el plazo; el resto, nada
CREATE OR REPLACE FUNCTION ops.fn_operaciones_incompletas()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE v_roles text[];
BEGIN
    SELECT coalesce(array_agg(rol_codigo), '{}') INTO v_roles FROM seg.usuario_rol WHERE usuario_id = aud.fn_usuario_actual();
    IF v_roles && ARRAY['operaciones'] THEN RETURN ops.fn_operaciones_incompletas_de('todas');
    ELSIF v_roles && ARRAY['gerencia'] THEN RETURN ops.fn_operaciones_incompletas_de('vencidas');
    END IF;
    RETURN jsonb_build_object('alcance', 'nada', 'total', 0, 'sin_cliente', 0, 'sin_precio', 0, 'vencidas', 0, 'operaciones', '[]'::jsonb);
END $function$;

REVOKE ALL ON FUNCTION ops.fn_cliente_es_generico(bigint) FROM PUBLIC;
REVOKE ALL ON FUNCTION ops.fn_operaciones_incompletas_de(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION ops.fn_operaciones_incompletas() FROM PUBLIC;
DO $do$
DECLARE r record;
BEGIN
    FOR r IN SELECT rolname FROM pg_roles WHERE rolname IN ('tc_app', 'tc_admin', 'tc_lectura', 'tc_auditor')
                AND has_function_privilege(oid, 'seg.fn_lo_mio_de_hoy()', 'EXECUTE') LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION ops.fn_operaciones_incompletas() TO %I', r.rolname);
        EXECUTE format('GRANT EXECUTE ON FUNCTION ops.fn_cliente_es_generico(bigint) TO %I', r.rolname);
    END LOOP;
    IF NOT has_function_privilege('tc_app', 'ops.fn_operaciones_incompletas()', 'EXECUTE')
       OR NOT has_function_privilege('tc_lectura', 'ops.fn_operaciones_incompletas()', 'EXECUTE') THEN
        RAISE EXCEPTION 'Los roles de la web (Operaciones o Gerencia) no quedaron con permiso';
    END IF;
END $do$;

-- Hoy: el bloque 4a (se saca el anterior si estaba y se pone el nuevo)
DO $do$
DECLARE
    v_def text := pg_get_functiondef('seg.fn_lo_mio_de_hoy()'::regprocedure);
    v_ancla constant text := '    -- 4 · Operaciones: sin confirmar, sin equipo y frío sin genset';
    v_viejo constant text := '    -- 4a · ';
    i integer; j integer;
    v_nuevo constant text := $t$    -- 4a · Operaciones sin cliente o sin precio (v2, 17/11/2026): a Operaciones todas; a Gerencia las que pasaron el plazo
    IF v_roles && ARRAY['operaciones', 'gerencia'] THEN
        BEGIN
            RETURN QUERY
            SELECT 'revisar'::text,
                   CASE WHEN v_roles && ARRAY['operaciones'] THEN CASE WHEN (x ->> 'falta_cliente')::boolean THEN 'op_sin_cliente' ELSE 'op_sin_precio' END
                        ELSE 'op_incompleta_gerencia' END,
                   'operacion'::text, (x ->> 'servicio_id')::bigint, (x ->> 'creado_en')::timestamptz,
                   CASE WHEN (x ->> 'falta_cliente')::boolean AND (x ->> 'falta_precio')::boolean THEN 'Faltan el cliente y el precio de la operación '
                        WHEN (x ->> 'falta_cliente')::boolean THEN 'Falta el cliente de la operación '
                        ELSE 'Falta el precio de la operación ' END || (x ->> 'numero')
                   || CASE WHEN (x ->> 'dias')::integer >= 1 THEN ' · hace ' || (x ->> 'dias') || CASE WHEN (x ->> 'dias')::integer = 1 THEN ' día' ELSE ' días' END ELSE ' · cargada hoy' END,
                   concat_ws(' · ',
                       CASE WHEN NOT (v_roles && ARRAY['operaciones']) THEN 'Operaciones no lo resolvió' || coalesce(' · la cargó ' || (x ->> 'cargada_por'), '') END,
                       CASE WHEN (x ->> 'falta_cliente')::boolean THEN 'Figura «' || (x ->> 'cliente') || '»: poné el cliente con su razón social correcta' ELSE x ->> 'cliente' END,
                       x ->> 'linea', to_char((x ->> 'fecha')::date, 'DD/MM/YYYY'),
                       CASE WHEN x ->> 'estado' = 'entregado' THEN 'YA ENTREGADA' END),
                   NULL::text, 'operacion.servicios'::text, 1
              FROM (SELECT z AS x FROM jsonb_array_elements(ops.fn_operaciones_incompletas() -> 'operaciones') z LIMIT 40) q;
        EXCEPTION WHEN OTHERS THEN
            RETURN QUERY SELECT 'revisar'::text, 'error_seccion'::text, NULL::text, NULL::bigint, now(), 'No se pudo leer «Operaciones con datos que faltan»'::text,
                                SQLERRM, '/operacion/operaciones'::text, 'operacion.servicios'::text, 1;
        END;
    END IF;

$t$;
BEGIN
    IF v_def LIKE '%-- 4a · Operaciones sin cliente o sin precio (v2%' THEN RETURN; END IF;
    j := position(v_ancla IN v_def);
    IF j = 0 THEN RAISE EXCEPTION 'seg.fn_lo_mio_de_hoy no es la que esperaba esta migración: avisar antes de seguir'; END IF;
    i := position(v_viejo IN v_def);
    IF i > 0 AND i < j THEN v_def := substring(v_def FROM 1 FOR i - 1) || substring(v_def FROM j); END IF;
    EXECUTE replace(v_def, v_ancla, v_nuevo || v_ancla);
END $do$;

-- 4) El freno: no se entrega sin cliente real y sin precio
CREATE OR REPLACE FUNCTION ops.fn_entrega_completa()
 RETURNS trigger LANGUAGE plpgsql
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE v_falta text;
BEGIN
    IF NEW.estado = 'entregado' AND OLD.estado IN ('sin_confirmar', 'planificado', 'en_curso')
       AND ref.fn_parametro_texto('ops.entrega_exige_cliente_y_precio', 'true') = 'true' THEN
        v_falta := concat_ws(' y ',
            CASE WHEN ops.fn_cliente_es_generico(NEW.cliente_id) THEN 'el cliente (figura «SIN CLIENTE»)' END,
            CASE WHEN NEW.precio_viaje IS NULL OR NEW.precio_viaje <= 0 THEN 'el precio' END);
        IF v_falta <> '' THEN
            RAISE EXCEPTION 'La operación % no se puede marcar entregada: falta %. Completalo en la operación y volvé a intentar',
                coalesce(NEW.numero_operacion::text, NEW.numero_servicio), v_falta USING ERRCODE = '55000';
        END IF;
    END IF;
    RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS tg_18_entrega_completa ON ops.servicio_comercial;
CREATE TRIGGER tg_18_entrega_completa BEFORE UPDATE OF estado ON ops.servicio_comercial
    FOR EACH ROW EXECUTE FUNCTION ops.fn_entrega_completa();

-- 3) Iris: lectura y lugar en el informe semanal (solo si Iris ya tiene sus lecturas nuevas; si no, se saltea)
CREATE OR REPLACE FUNCTION ia.fn_lectura_ops_incompletas()
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
BEGIN
    IF NOT (ia.fn_puede_asistente() OR session_user = 'postgres') THEN RAISE EXCEPTION 'Iris es para Gerencia' USING ERRCODE = '42501'; END IF;
    RETURN ops.fn_operaciones_incompletas_de('todas');
END $function$;
REVOKE ALL ON FUNCTION ia.fn_lectura_ops_incompletas() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ia.fn_lectura_ops_incompletas() TO tc_app, tc_admin, tc_lectura;

DO $do$
DECLARE v_def text := pg_get_functiondef('ia.fn_herramienta(text, jsonb)'::regprocedure); v_inf text;
BEGIN
    IF v_def NOT LIKE '%operaciones_incompletas%' THEN
        IF position('''negocio_clientes'', ''tipo_cambio''' IN v_def) = 0 OR position('ELSE ia.fn_lectura_tipo_cambio(p_entrada) END);' IN v_def) = 0 THEN
            RAISE NOTICE 'Iris todavía no tiene sus lecturas nuevas (iris_09): no se le agregó la lectura de operaciones incompletas. Lo demás quedó aplicado.';
            RETURN;
        END IF;
        v_def := replace(v_def, '''negocio_clientes'', ''tipo_cambio''', '''negocio_clientes'', ''operaciones_incompletas'', ''tipo_cambio''');
        v_def := replace(v_def, 'ELSE ia.fn_lectura_tipo_cambio(p_entrada) END);',
                         'WHEN ''operaciones_incompletas'' THEN ia.fn_lectura_ops_incompletas()
                    ELSE ia.fn_lectura_tipo_cambio(p_entrada) END);');
        EXECUTE v_def;
    END IF;
    INSERT INTO ia.asistente_herramienta (codigo, orden, descripcion, etiqueta, leyendo, pantalla, entrada, activa)
    VALUES ('operaciones_incompletas', 34,
            'Operaciones de los últimos días a las que les falta el cliente real (figuran «SIN CLIENTE») o el precio: cuántas son, cuántas pasaron el plazo sin resolverse, '
            || 'cuántas ya se entregaron así, y la lista con días de atraso y quién las cargó. Sin esos datos no se pueden facturar. '
            || 'Usala cuando pregunten qué operaciones están sin precio o sin cliente; en el informe semanal va en «Lo que hay que mirar».',
            'Operaciones sin cliente o sin precio', 'Buscando operaciones con datos que faltan…', '/operacion/operaciones',
            '{"type": "object", "properties": {}}'::jsonb, true)
    ON CONFLICT (codigo) DO UPDATE SET descripcion = EXCLUDED.descripcion, etiqueta = EXCLUDED.etiqueta, leyendo = EXCLUDED.leyendo, pantalla = EXCLUDED.pantalla, activa = true;
    v_inf := pg_get_functiondef('ia.fn_informe_lecturas(date, date)'::regprocedure);
    IF v_inf NOT LIKE '%operaciones_incompletas%' AND position('(''operaciones'', v_semana),' IN v_inf) > 0 THEN
        EXECUTE replace(v_inf, '(''operaciones'', v_semana),', '(''operaciones'', v_semana), (''operaciones_incompletas'', ''{}''::jsonb),');
    END IF;
END $do$;

COMMIT;
