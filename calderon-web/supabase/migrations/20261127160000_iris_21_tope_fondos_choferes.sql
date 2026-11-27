-- =====================================================================================
-- Iris 21 · El tope de los pedidos de dinero de los choferes, como analista financiero
-- =====================================================================================
-- Acompaña a la migración 386 (el chofer no pide más dinero que lo que va generando de sueldo).
--   · Lectura nueva «fondos_choferes»: cuántos choferes están pasados del límite, cerca o bien; cuánta plata hay sin
--     rendir y en pedidos abiertos; y el estado de los pedidos sin pagar según su análisis. Todo sumado: sin nombres ni
--     sueldos por persona (regla de Iris). El detalle de cada chofer está en Liquidaciones › Fondos › Pedidos.
--   · Las instrucciones suman el bloque «FONDOS DE LOS CHOFERES»: cómo leerlo y qué recomendar.
-- Solo lee. Necesita la migración 386 e Iris con sus lecturas (iris_11 o posterior). No cambia datos ni
-- web.version_base. Se puede correr más de una vez. No se pudo probar contra el modelo real.
-- =====================================================================================
BEGIN;

DO $v$
BEGIN
    IF to_regprocedure('fin.fn_tope_fondo_calcular(bigint, text, numeric, bigint)') IS NULL THEN
        RAISE EXCEPTION 'Falta la migración 386 (20261127150000_tope_pedido_fondo.sql): correrla antes que esta';
    END IF;
    IF to_regclass('ia.asistente_herramienta') IS NULL OR to_regprocedure('ia.fn_herramienta(text, jsonb)') IS NULL
       OR to_regprocedure('ia.fn_instrucciones_asistente()') IS NULL OR to_regprocedure('ia.fn_lectura_proyeccion(jsonb)') IS NULL
       OR to_regprocedure('ia.fn_puede_asistente(bigint)') IS NULL THEN
        RAISE EXCEPTION 'Falta Iris con sus lecturas (iris_11 o posterior): avisar antes de seguir';
    END IF;
END $v$;

-- VOLATILE: el análisis de cada chofer arma un borrador de liquidación de prueba y lo deshace
CREATE OR REPLACE FUNCTION ia.fn_lectura_fondos_choferes(p_entrada jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
 SET jit TO 'off'
AS $f$
DECLARE v jsonb; v_ped jsonb; v_per jsonb;
BEGIN
    IF NOT (ia.fn_puede_asistente() OR session_user = 'postgres') THEN RAISE EXCEPTION 'Iris es para Gerencia' USING ERRCODE = '42501'; END IF;
    IF coalesce((SELECT valor::text FROM ref.parametro WHERE codigo = 'fin.ff_tope_activo' AND eliminado_en IS NULL), 'true') <> 'true' THEN
        RETURN jsonb_build_object('control_activo', false, 'que_es', 'El tope de los pedidos de dinero de los choferes está apagado (fin.ff_tope_activo).');
    END IF;

    -- Los choferes en actividad con plata sin rendir o con pedidos abiertos (los demás no tienen nada que analizar)
    WITH c AS (
        SELECT fin.fn_tope_fondo_calcular(ch.id, NULL, 0, NULL) AS a
          FROM mae.chofer ch
         WHERE ch.eliminado_en IS NULL AND (ch.fecha_egreso IS NULL OR ch.fecha_egreso >= mae.fn_hoy())
           AND (EXISTS (SELECT 1 FROM fin.movimiento_fondo_chofer m WHERE m.chofer_id = ch.id AND m.eliminado_en IS NULL AND m.fecha >= mae.fn_hoy() - 120)
                OR EXISTS (SELECT 1 FROM fin.pedido_fondo p WHERE p.chofer_id = ch.id AND p.estado IN ('solicitado', 'pendiente', 'aprobado')))
         LIMIT 80
    )
    SELECT jsonb_build_object(
               'choferes_mirados', count(*),
               'pasados_del_limite', count(*) FILTER (WHERE a ->> 'estado' = 'pasado'),
               'cerca_del_limite', count(*) FILTER (WHERE a ->> 'estado' = 'cerca'),
               'dentro_del_limite', count(*) FILTER (WHERE a ->> 'estado' = 'ok'),
               'sin_datos_para_calcular', count(*) FILTER (WHERE a ->> 'estado' = 'sin_datos'),
               'sin_rendir_total_clp', coalesce(sum((a ->> 'sin_rendir_clp')::numeric), 0),
               'sin_rendir_de_los_pasados_clp', coalesce(sum((a ->> 'sin_rendir_clp')::numeric) FILTER (WHERE a ->> 'estado' = 'pasado'), 0),
               'excedido_total_clp', coalesce(sum(-(a ->> 'margen_clp')::numeric) FILTER (WHERE a ->> 'estado' = 'pasado'), 0),
               'en_pedidos_abiertos_clp', coalesce(sum((a ->> 'pedidos_abiertos_clp')::numeric), 0),
               'generado_en_mano_total_clp', coalesce(sum((a ->> 'en_mano')::numeric) FILTER (WHERE a ->> 'estado' <> 'sin_datos'), 0)),
           (SELECT jsonb_build_object('periodo', a ->> 'periodo', 'desde', a ->> 'desde', 'hasta', a ->> 'hasta', 'dias', (a ->> 'dias')::int,
                                      'dias_pasados', (a ->> 'dias_pasados')::int) FROM c LIMIT 1)
      INTO v, v_per
      FROM c;

    -- Los pedidos sin pagar, según el análisis guardado al pedir
    SELECT jsonb_build_object(
               'sin_pagar', count(*),
               'pedidos_por_la_oficina_pasados_del_limite', count(*) FILTER (WHERE p.analisis ->> 'estado' = 'pasado' AND NOT p.pedido_por_chofer),
               'cerca_del_limite', count(*) FILTER (WHERE p.analisis ->> 'estado' = 'cerca'),
               'sin_analisis', count(*) FILTER (WHERE p.analisis IS NULL),
               'monto_clp', coalesce(sum(round(p.importe * fin.fn_tc_clp_o_null(p.moneda::text, mae.fn_hoy()))), 0))
      INTO v_ped
      FROM fin.pedido_fondo p WHERE p.estado IN ('solicitado', 'pendiente', 'aprobado');

    RETURN jsonb_strip_nulls(jsonb_build_object(
        'control_activo', true, 'moneda', 'CLP', 'periodo_de_liquidacion', v_per,
        'regla', jsonb_build_object(
            'que_es', 'El chofer no puede pedir dinero si la plata sin rendir, más sus pedidos abiertos y lo que pide, supera lo que lleva generado de sueldo en mano en el período (sueldo fijo proporcional a los días + bono de los tramos hechos + km, menos las cargas legales). Si pasa el aviso, puede pedir con un aviso. Operaciones puede pedir por él igual: el pedido queda con el análisis.',
            'descuento_legal_pct', ref.fn_parametro_num('fin.ff_tope_descuento_pct', 20), 'aviso_pct', ref.fn_parametro_num('fin.ff_tope_aviso_pct', 80)),
        'choferes', v,
        'pedidos_sin_pagar', v_ped,
        'donde_se_ve', 'El detalle de cada chofer y de cada pedido está en Liquidaciones › Fondos de choferes › Pedidos.',
        'ojo', 'A principio del período lo generado es poco (pocos días y pocos tramos): es normal que haya más choferes pasados del límite los primeros días.'));
END $f$;
COMMENT ON FUNCTION ia.fn_lectura_fondos_choferes(jsonb) IS
    'Iris 21: el tope de los pedidos de dinero de los choferes (migración 386), sumado: pasados del límite, cerca, plata sin rendir y pedidos sin pagar. Sin nombres ni sueldos por persona.';

-- Permisos: como «proyeccion»
DO $p$
DECLARE g text; f regprocedure := 'ia.fn_lectura_fondos_choferes(jsonb)';
BEGIN
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    FOR g IN SELECT r.rolname FROM pg_roles r WHERE (r.rolname LIKE 'tc\_%' AND r.rolname <> 'tc_cliente') OR r.rolname = 'authenticated' LOOP
        IF has_function_privilege(g, 'ia.fn_lectura_proyeccion(jsonb)', 'EXECUTE') THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', f, g);
        ELSE
            EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', f, g);
        END IF;
    END LOOP;
END $p$;

-- La lista de lecturas
INSERT INTO ia.asistente_herramienta (codigo, orden, descripcion, etiqueta, leyendo, pantalla, entrada, activa)
VALUES ('fondos_choferes', 45,
        'El control de los pedidos de dinero de los choferes, como analista financiero: cuántos choferes están pasados del límite (la plata sin rendir supera lo que llevan generado de sueldo en mano), cuántos cerca, '
        || 'cuánta plata hay sin rendir y en pedidos abiertos, y cómo están los pedidos sin pagar. Todo sumado, sin nombres. '
        || 'Usala para «¿cómo están los fondos de los choferes?», «¿hay choferes que deben más de lo que ganan?», «¿cuánta plata tienen sin rendir?», «¿podemos seguir dándoles plata?».',
        'Fondos de los choferes', 'Revisando los fondos de los choferes…', '/liquidaciones/fondos?vista=pedidos',
        '{"type": "object", "properties": {}}'::jsonb, true)
ON CONFLICT (codigo) DO UPDATE
   SET descripcion = EXCLUDED.descripcion, etiqueta = EXCLUDED.etiqueta, leyendo = EXCLUDED.leyendo, pantalla = EXCLUDED.pantalla,
       entrada = EXCLUDED.entrada, activa = true;

-- El despacho de lecturas la conoce (igual que Iris 19)
DO $do$
DECLARE v_def text := pg_get_functiondef('ia.fn_herramienta(text, jsonb)'::regprocedure);
        v_a2 constant text := 'ELSE ia.fn_lectura_tipo_cambio(p_entrada) END);';
BEGIN
    IF v_def LIKE '%''fondos_choferes''%' THEN RETURN; END IF;
    IF v_def !~ 'p_codigo IN \(''viento_en_ruta''[^)]*\)' OR position(v_a2 IN v_def) = 0 THEN
        RAISE EXCEPTION 'ia.fn_herramienta no es la que esperaba esta migración: avisar antes de seguir';
    END IF;
    v_def := regexp_replace(v_def, '(p_codigo IN \(''viento_en_ruta''[^)]*)\)', '\1, ''fondos_choferes'')');
    v_def := replace(v_def, v_a2, 'WHEN ''fondos_choferes'' THEN ia.fn_lectura_fondos_choferes(p_entrada)
                    ' || v_a2);
    EXECUTE v_def;
END $do$;

-- Las instrucciones: el bloque al final (sin tocar lo que ya está)
DO $do$
DECLARE
    v_def text := pg_get_functiondef('ia.fn_instrucciones_asistente()'::regprocedure);
    v_nuevo constant text := $t$
        || ' FONDOS DE LOS CHOFERES. Para cómo están los fondos de los choferes y sus pedidos de dinero usá «fondos_choferes». Respondé como analista financiero: '
        || 'primero cuántos choferes están pasados del límite y cuánto suman por encima de lo que generaron, después los que están cerca y la plata sin rendir total; '
        || 'recomendá que rindan sus gastos antes de darles más y que Operaciones pida por ellos solo si es urgente para un viaje. '
        || 'Aclará que a principio del período de liquidación lo generado es poco. No des nombres ni el sueldo de ningún chofer: el detalle está en Liquidaciones › Fondos de choferes › Pedidos.'$t$;
BEGIN
    IF v_def LIKE '%«fondos_choferes»%' THEN RETURN; END IF;
    IF v_def !~ '\$function\$\s*$' THEN
        RAISE EXCEPTION 'ia.fn_instrucciones_asistente no es la que esperaba esta migración: avisar antes de seguir';
    END IF;
    BEGIN
        EXECUTE regexp_replace(v_def, ';?\s*\$function\$\s*$', v_nuevo || E'\n$function$\n');
    EXCEPTION WHEN OTHERS THEN
        RAISE EXCEPTION 'No se pudo agregar el bloque de fondos a las instrucciones de Iris (%). No se aplicó nada: avisar antes de seguir.', SQLERRM;
    END;
END $do$;

-- Prueba por el mismo camino que usa Iris
DO $t$
DECLARE r jsonb;
BEGIN
    r := ia.fn_herramienta('fondos_choferes', '{}'::jsonb);
    IF NOT coalesce((r ->> 'ok')::boolean, false) THEN RAISE EXCEPTION 'la lectura no anduvo: %', coalesce(r ->> 'error', 'sin respuesta'); END IF;
    IF ia.fn_instrucciones_asistente() NOT LIKE '%«fondos_choferes»%' THEN RAISE EXCEPTION 'las instrucciones quedaron sin el bloque'; END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Iris 21 no pasó su prueba (%). No se aplicó nada: avisar antes de seguir.', SQLERRM;
END $t$;

COMMIT;

NOTIFY pgrst, 'reload schema';

SELECT 'iris 21 aplicada' AS que,
       (l #>> '{choferes,pasados_del_limite}')::int AS choferes_pasados_del_limite,
       (l #>> '{choferes,cerca_del_limite}')::int AS choferes_cerca_del_limite,
       (l #>> '{choferes,sin_rendir_total_clp}')::numeric AS sin_rendir_total_clp,
       ia.fn_instrucciones_asistente() LIKE '%«fondos_choferes»%' AS con_el_bloque_de_fondos
  FROM ia.fn_lectura_fondos_choferes('{}') AS l;
