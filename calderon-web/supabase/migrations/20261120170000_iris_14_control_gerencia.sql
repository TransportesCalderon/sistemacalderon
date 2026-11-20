-- =====================================================================================
-- Iris 14 · Control de Gerencia: ¿se está usando el control que el sistema ya tiene?
-- =====================================================================================
-- Pedido (20/11/2026): crecer como software de control (robo de combustible, falta de profesionalidad)
-- y que Iris ayude a Gerencia a obtener mejores resultados.
--
-- El sistema ya calcula el faltante de combustible por viaje (cierres), ya tiene alertas con responsable,
-- plazo y descuento, ranking de choferes y actividad de usuarios. Lo que no había es UNA vista que diga
-- si ese control se está cumpliendo y cuánta plata hay en juego, ni alguien que se lo lleve a Gerencia.
--
--   1 · Lectura «control_gerencia» (solo Gerencia, TI y auditor): por los últimos N días
--       · combustible: litros a cargo de choferes, viajes fuera de tolerancia sin decidir, cierres en
--         borrador viejos, viajes sin cierre, y los choferes y camiones que más suman;
--       · alertas: abiertas, vencidas, sin responsable, la más vieja, y cómo se cerraron; reglas apagadas;
--       · gente: choferes con gastos o tareas atrasadas, y lo que la oficina tiene sin revisar;
--       · «para_decidir_hoy»: las pocas cosas que piden una decisión, de mayor a menor.
--   2 · Aviso de cada mañana a Gerencia (7:35 de Mendoza) con esas cosas. Se apaga con
--       ia.control_diario_activo = false.
--   3 · Regla 30 en las instrucciones de Iris.
--
-- Solo lee. No cambia datos ni funciones de control. Numeración propia de Iris: no toca web.version_base.
-- =====================================================================================
BEGIN;

DO $do$
BEGIN
    IF to_regprocedure('ia.fn_lectura_consumo_semanal(jsonb)') IS NULL
       OR pg_get_functiondef('ia.fn_instrucciones_asistente()'::regprocedure) NOT LIKE '%«consumo_semanal»%' THEN
        RAISE EXCEPTION 'Primero hay que aplicar iris_13 (consumo semanal y respuesta vacía)';
    END IF;
END $do$;

INSERT INTO ref.parametro (codigo, valor, descripcion)
SELECT 'ia.control_diario_activo', 'true'::jsonb, 'Iris 14: cada mañana (7:35 de Mendoza) le avisa a Gerencia lo que pide una decisión. false = no avisa.'
 WHERE NOT EXISTS (SELECT 1 FROM ref.parametro WHERE codigo = 'ia.control_diario_activo');

CREATE OR REPLACE FUNCTION ia.fn_lectura_control_gerencia(p_entrada jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
    v_usr   bigint := aud.fn_usuario_actual();
    v_dias  int := least(greatest(coalesce(nullif(p_entrada ->> 'dias', '')::int, 30), 7), 120);
    v_nom   boolean := coalesce((p_entrada ->> 'sin_nombres')::boolean, false) IS NOT TRUE;
    v_desde timestamptz := now() - make_interval(days => least(greatest(coalesce(nullif(p_entrada ->> 'dias', '')::int, 30), 7), 120));
    v_precio numeric := coalesce(ref.fn_parametro_num('ia.costeo_gasoil_clp', 1630), 1630);
    v_comb jsonb; v_pend jsonb; v_al jsonb; v_reg jsonb; v_gente jsonb; v_of jsonb;
    v_dec jsonb := '[]'; v_err jsonb := '[]';
    n int; l numeric; x numeric;
BEGIN
    -- Solo Gerencia, TI y auditor. Sin usuario, solo la tarea de la mañana.
    IF v_usr IS NULL THEN
        IF coalesce(current_setting('ia.control_auto', true), '') <> '1' THEN
            RAISE EXCEPTION 'El control de Gerencia necesita un usuario' USING ERRCODE = '42501';
        END IF;
    ELSIF NOT EXISTS (SELECT 1 FROM seg.usuario_rol WHERE usuario_id = v_usr AND rol_codigo IN ('gerencia', 'ti', 'auditor')) THEN
        RAISE EXCEPTION 'El control de Gerencia lo ven Gerencia, TI y el auditor' USING ERRCODE = '42501';
    END IF;

    -- 1 · Combustible: lo que dicen los cierres de viaje
    BEGIN
        SELECT jsonb_build_object(
                 'cierres', count(*),
                 'por_estado', (SELECT jsonb_object_agg(e.estado, e.n) FROM (SELECT cv2.estado, count(*) AS n FROM fue.cierre_viaje cv2
                                  WHERE cv2.llegada_ts >= v_desde AND cv2.eliminado_en IS NULL GROUP BY 1) e),
                 'litros_a_cargo_de_choferes', round(coalesce(sum(cv.imputable_total_l) FILTER (WHERE cv.estado <> 'anulado' AND cv.imputable_total_l > 0), 0)),
                 'valor_estimado_clp', round(coalesce(sum(cv.imputable_total_l) FILTER (WHERE cv.estado <> 'anulado' AND cv.imputable_total_l > 0), 0) * v_precio),
                 'viajes_fuera_de_tolerancia', count(*) FILTER (WHERE cv.estado <> 'anulado' AND abs(coalesce(cv.diferencia_l, 0)) > coalesce(cv.tolerancia_l, 0)),
                 'fuera_de_tolerancia_sin_decidir', count(*) FILTER (WHERE cv.estado <> 'anulado' AND abs(coalesce(cv.diferencia_l, 0)) > coalesce(cv.tolerancia_l, 0) AND cv.decision_diferencia IS NULL),
                 'litros_sin_decidir', round(coalesce(sum(abs(cv.diferencia_l)) FILTER (WHERE cv.estado <> 'anulado' AND abs(coalesce(cv.diferencia_l, 0)) > coalesce(cv.tolerancia_l, 0) AND cv.decision_diferencia IS NULL), 0)),
                 'borradores_de_mas_de_7_dias', count(*) FILTER (WHERE cv.estado = 'borrador' AND cv.llegada_ts < now() - interval '7 days'),
                 'por_chofer', (SELECT jsonb_agg(jsonb_build_object('chofer', q.quien, 'viajes', q.n, 'litros_a_su_cargo', q.l) ORDER BY q.l DESC)
                                  FROM (SELECT CASE WHEN v_nom THEN coalesce(ch.apellido || ', ' || ch.nombre, 'sin chofer') ELSE 'chofer ' || coalesce(c3.chofer_responsable_id::text, '?') END AS quien,
                                               count(*) AS n, round(sum(c3.imputable_total_l)) AS l
                                          FROM fue.cierre_viaje c3 LEFT JOIN mae.chofer ch ON ch.id = c3.chofer_responsable_id
                                         WHERE c3.llegada_ts >= v_desde AND c3.eliminado_en IS NULL AND c3.estado <> 'anulado' AND c3.imputable_total_l > 0
                                         GROUP BY 1 ORDER BY 3 DESC LIMIT 5) q),
                 'por_camion', (SELECT jsonb_agg(jsonb_build_object('patente', q.patente, 'viajes', q.n, 'litros', q.l) ORDER BY q.l DESC)
                                  FROM (SELECT m.patente, count(*) AS n, round(sum(c4.imputable_total_l)) AS l
                                          FROM fue.cierre_viaje c4 JOIN mae.camion m ON m.id = c4.camion_id
                                         WHERE c4.llegada_ts >= v_desde AND c4.eliminado_en IS NULL AND c4.estado <> 'anulado' AND c4.imputable_total_l > 0
                                         GROUP BY 1 ORDER BY 3 DESC LIMIT 5) q))
          INTO v_comb
          FROM fue.cierre_viaje cv
         WHERE cv.llegada_ts >= v_desde AND cv.eliminado_en IS NULL;
    EXCEPTION WHEN OTHERS THEN v_err := v_err || to_jsonb('combustible: ' || SQLERRM);
    END;

    -- 2 · Viajes terminados que todavía no tienen cierre
    BEGIN
        SELECT jsonb_build_object('viajes_sin_cerrar', count(*), 'vencidos', count(*) FILTER (WHERE p.vencido),
                                  'por_situacion', (SELECT jsonb_object_agg(s.situacion, s.n) FROM (SELECT situacion, count(*) AS n FROM fue.fn_cierres_pendientes() GROUP BY 1) s))
          INTO v_pend FROM fue.fn_cierres_pendientes() p;
    EXCEPTION WHEN OTHERS THEN v_err := v_err || to_jsonb('viajes sin cierre: ' || SQLERRM);
    END;

    -- 3 · Alertas: ¿alguien las está contestando?
    BEGIN
        SELECT jsonb_build_object(
                 'abiertas', count(*) FILTER (WHERE a.estado IN ('nueva', 'en_revision')),
                 'sin_mirar', count(*) FILTER (WHERE a.estado = 'nueva'),
                 'vencidas', count(*) FILTER (WHERE a.estado IN ('nueva', 'en_revision') AND a.vence_en < now()),
                 'sin_responsable', count(*) FILTER (WHERE a.estado IN ('nueva', 'en_revision') AND a.responsable_id IS NULL AND a.responsable_rol IS NULL),
                 'dias_de_la_mas_vieja', (SELECT floor(extract(epoch FROM now() - min(a2.detectada_en)) / 86400)::int FROM ana.alerta a2 WHERE a2.estado IN ('nueva', 'en_revision')),
                 'cerradas_en_el_periodo', count(*) FILTER (WHERE a.cerrada_en >= v_desde),
                 'como_se_cerraron', (SELECT jsonb_object_agg(coalesce(r.resolucion, r.estado), r.n) FROM (SELECT a3.resolucion, a3.estado, count(*) AS n FROM ana.alerta a3
                                        WHERE a3.cerrada_en >= v_desde GROUP BY 1, 2) r),
                 'litros_a_descontar_decididos', round(coalesce(sum(a.descuento_l) FILTER (WHERE a.cerrada_en >= v_desde AND a.resolucion = 'a_descontar'), 0)),
                 'abiertas_por_regla', (SELECT jsonb_agg(jsonb_build_object('regla', q.nombre, 'abiertas', q.n, 'vencidas', q.v) ORDER BY q.n DESC)
                                          FROM (SELECT rg.nombre, count(*) AS n, count(*) FILTER (WHERE a4.vence_en < now()) AS v
                                                  FROM ana.alerta a4 JOIN ana.regla_anomalia rg ON rg.id = a4.regla_id
                                                 WHERE a4.estado IN ('nueva', 'en_revision') GROUP BY 1 ORDER BY 2 DESC LIMIT 8) q))
          INTO v_al
          FROM ana.alerta a
         WHERE a.estado IN ('nueva', 'en_revision') OR a.cerrada_en >= v_desde;
        SELECT jsonb_build_object(
                 'reglas', count(*), 'en_productivo', count(*) FILTER (WHERE r.activa AND r.modo = 'productivo'),
                 'apagadas_o_en_silencio', (SELECT jsonb_agg(jsonb_build_object('regla', r2.nombre, 'categoria', r2.categoria, 'modo', r2.modo, 'activa', r2.activa) ORDER BY r2.categoria, r2.nombre)
                                              FROM ana.regla_anomalia r2
                                             WHERE r2.eliminado_en IS NULL AND (r2.vigente_hasta IS NULL OR r2.vigente_hasta >= current_date) AND NOT (r2.activa AND r2.modo = 'productivo')))
          INTO v_reg
          FROM ana.regla_anomalia r
         WHERE r.eliminado_en IS NULL AND (r.vigente_hasta IS NULL OR r.vigente_hasta >= current_date);
    EXCEPTION WHEN OTHERS THEN v_err := v_err || to_jsonb('alertas: ' || SQLERRM);
    END;

    -- 4 · Gente: choferes atrasados y lo que la oficina tiene sin revisar
    BEGIN
        IF to_regprocedure('fin.fn_trabas_pedido_fondo(bigint)') IS NOT NULL THEN
            SELECT jsonb_build_object('choferes_con_atrasos', count(*),
                     'detalle', jsonb_agg(jsonb_build_object('chofer', q.quien, 'le_falta', q.t) ORDER BY jsonb_array_length(q.t) DESC))
              INTO v_gente
              FROM (SELECT CASE WHEN v_nom THEN ch.apellido || ', ' || ch.nombre ELSE 'chofer ' || ch.id END AS quien,
                           (SELECT jsonb_agg(e ->> 'texto') FROM jsonb_array_elements(fin.fn_trabas_pedido_fondo(ch.id)) e) AS t
                      FROM mae.chofer ch
                     WHERE EXISTS (SELECT 1 FROM fin.movimiento_fondo_chofer m WHERE m.chofer_id = ch.id AND m.fecha >= current_date - 90 AND m.eliminado_en IS NULL)) q
             WHERE q.t IS NOT NULL;
        END IF;
    EXCEPTION WHEN OTHERS THEN v_err := v_err || to_jsonb('choferes: ' || SQLERRM);
    END;
    BEGIN
        v_of := jsonb_build_object(
            'gastos_de_choferes_sin_revisar', (SELECT count(*) FROM fin.movimiento_fondo_chofer m WHERE m.tipo = 'gasto' AND m.estado IN ('por_revisar', 'apelado') AND m.eliminado_en IS NULL),
            'dias_del_gasto_mas_viejo_sin_revisar', (SELECT floor(extract(epoch FROM now() - min(m.creado_en)) / 86400)::int FROM fin.movimiento_fondo_chofer m
                                                      WHERE m.tipo = 'gasto' AND m.estado IN ('por_revisar', 'apelado') AND m.eliminado_en IS NULL),
            'pedidos_de_dinero_sin_resolver', (SELECT count(*) FROM fin.pedido_fondo p WHERE p.estado IN ('solicitado', 'pendiente', 'aprobado')),
            'cargas_de_combustible_sin_validar_de_mas_de_3_dias', (SELECT count(*) FROM fue.carga_combustible c
                                                                    WHERE c.estado_validacion = 'pendiente' AND c.eliminado_en IS NULL AND c.fecha_hora < now() - interval '3 days'
                                                                      AND c.fecha_hora >= now() - interval '120 days'));
    EXCEPTION WHEN OTHERS THEN v_err := v_err || to_jsonb('oficina: ' || SQLERRM);
    END;

    -- 5 · Lo que pide una decisión, de mayor a menor
    l := coalesce((v_comb ->> 'litros_sin_decidir')::numeric, 0); n := coalesce((v_comb ->> 'fuera_de_tolerancia_sin_decidir')::int, 0);
    IF n > 0 THEN v_dec := v_dec || to_jsonb(format('Combustible: %s viaje(s) con diferencia fuera de tolerancia sin decidir, %s L (unos %s CLP).', n, l, round(l * v_precio))); END IF;
    n := coalesce((v_pend ->> 'vencidos')::int, 0);
    IF n > 0 THEN v_dec := v_dec || to_jsonb(format('Hay %s viaje(s) terminados con el cierre de combustible vencido: sin cierre no se sabe si faltó combustible.', n)); END IF;
    n := coalesce((v_comb ->> 'borradores_de_mas_de_7_dias')::int, 0);
    IF n > 0 THEN v_dec := v_dec || to_jsonb(format('%s cierre(s) de viaje en borrador hace más de 7 días, sin aprobar.', n)); END IF;
    n := coalesce((v_al ->> 'vencidas')::int, 0);
    IF n > 0 THEN v_dec := v_dec || to_jsonb(format('%s alerta(s) vencidas sin resolver (de %s abiertas; la más vieja tiene %s días).', n, v_al ->> 'abiertas', v_al ->> 'dias_de_la_mas_vieja')); END IF;
    n := coalesce((v_al ->> 'sin_responsable')::int, 0);
    IF n > 0 THEN v_dec := v_dec || to_jsonb(format('%s alerta(s) abiertas no tienen responsable.', n)); END IF;
    n := CASE WHEN jsonb_typeof(v_reg -> 'apagadas_o_en_silencio') = 'array' THEN jsonb_array_length(v_reg -> 'apagadas_o_en_silencio') ELSE 0 END;
    IF n > 0 THEN v_dec := v_dec || to_jsonb(format('%s regla(s) de control están apagadas o en silencio: no generan alertas.', n)); END IF;
    n := coalesce((v_gente ->> 'choferes_con_atrasos')::int, 0);
    IF n > 0 THEN v_dec := v_dec || to_jsonb(format('%s chofer(es) con gastos sin subir o tareas atrasadas.', n)); END IF;
    n := coalesce((v_of ->> 'gastos_de_choferes_sin_revisar')::int, 0); x := coalesce((v_of ->> 'dias_del_gasto_mas_viejo_sin_revisar')::numeric, 0);
    IF n > 0 AND x >= 5 THEN v_dec := v_dec || to_jsonb(format('La oficina tiene %s gasto(s) de choferes sin revisar; el más viejo, de hace %s días.', n, x)); END IF;

    RETURN jsonb_build_object(
        'periodo_dias', v_dias,
        'para_decidir_hoy', v_dec,
        'combustible_segun_los_cierres', v_comb,
        'viajes_sin_cierre', v_pend,
        'alertas', v_al,
        'reglas_de_control', v_reg,
        'choferes', coalesce(v_gente, jsonb_build_object('choferes_con_atrasos', 0)),
        'oficina', v_of,
        'no_se_pudo_leer', CASE WHEN jsonb_array_length(v_err) > 0 THEN v_err END,
        'como_leerlo', 'Los litros «a cargo de choferes» son los que el cierre de viaje dejó como imputables después de tolerancias y justificaciones. '
            || 'El valor en CLP es una estimación a ' || v_precio || ' CLP por litro. «Sin decidir» = hay diferencia y nadie resolvió si se descuenta o se justifica. '
            || 'Esta lectura no dice quién robó: dice dónde falta combustible y dónde el control no se está haciendo.');
END $function$;
REVOKE ALL ON FUNCTION ia.fn_lectura_control_gerencia(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ia.fn_lectura_control_gerencia(jsonb) TO tc_app, tc_admin, tc_lectura;

INSERT INTO ia.asistente_herramienta (codigo, orden, descripcion, etiqueta, leyendo, pantalla, entrada, activa)
VALUES ('control_gerencia', 37,
        'El estado del CONTROL de la empresa, para Gerencia: litros de combustible a cargo de choferes y cuánta plata es, viajes con diferencia sin decidir, cierres atrasados, '
        || 'alertas abiertas, vencidas o sin responsable, reglas de control apagadas, choferes con gastos o tareas atrasadas, y lo que la oficina tiene sin revisar. Trae «para_decidir_hoy». '
        || 'Usala cuando pregunten «¿qué tengo que decidir hoy?», «¿cómo está el control?», «¿nos están robando combustible?», «¿quién no está cumpliendo?», «¿dónde estamos perdiendo plata?» o pidan un resumen para Gerencia. '
        || 'Solo la pueden leer Gerencia, TI y el auditor.',
        'Control de Gerencia', 'Revisando cómo está el control…', '/combustible/cierres',
        '{"type": "object", "properties": {
            "dias": {"type": "integer", "description": "Cuántos días hacia atrás mirar (7 a 120). Si no se manda: 30."}}}'::jsonb, true)
ON CONFLICT (codigo) DO UPDATE
   SET descripcion = EXCLUDED.descripcion, etiqueta = EXCLUDED.etiqueta, leyendo = EXCLUDED.leyendo, pantalla = EXCLUDED.pantalla,
       entrada = EXCLUDED.entrada, activa = true;

DO $do$
DECLARE v_def text := pg_get_functiondef('ia.fn_herramienta(text, jsonb)'::regprocedure);
        v_a2 constant text := 'ELSE ia.fn_lectura_tipo_cambio(p_entrada) END);';
BEGIN
    IF v_def LIKE '%control_gerencia%' THEN RETURN; END IF;
    IF v_def !~ 'p_codigo IN \(''viento_en_ruta''[^)]*\)' OR position(v_a2 IN v_def) = 0 THEN
        RAISE EXCEPTION 'ia.fn_herramienta no es la que esperaba esta migración: avisar antes de seguir';
    END IF;
    v_def := regexp_replace(v_def, '(p_codigo IN \(''viento_en_ruta''[^)]*)\)', '\1, ''control_gerencia'')');
    v_def := replace(v_def, v_a2, 'WHEN ''control_gerencia'' THEN ia.fn_lectura_control_gerencia(p_entrada)
                    ' || v_a2);
    EXECUTE v_def;
END $do$;

-- El aviso de cada mañana
CREATE OR REPLACE FUNCTION ia.fn_control_gerencia_avisar()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE d jsonb; v_dest bigint[]; v_txt text; n int;
        v_hoy date := (now() AT TIME ZONE 'America/Argentina/Mendoza')::date;
BEGIN
    IF coalesce((SELECT valor::text FROM ref.parametro WHERE codigo = 'ia.control_diario_activo' AND eliminado_en IS NULL), 'true') <> 'true' THEN RETURN 0; END IF;
    PERFORM set_config('ia.control_auto', '1', true);
    d := ia.fn_lectura_control_gerencia('{}'::jsonb);
    PERFORM set_config('ia.control_auto', '', true);
    n := jsonb_array_length(coalesce(d -> 'para_decidir_hoy', '[]'));
    IF n = 0 THEN RETURN 0; END IF;
    SELECT array_agg(DISTINCT r.usuario_id) INTO v_dest FROM seg.usuario_rol r JOIN seg.usuario u ON u.id = r.usuario_id
     WHERE r.rol_codigo = 'gerencia' AND u.activo;
    IF v_dest IS NULL THEN RETURN 0; END IF;
    SELECT string_agg(t, E'\n' ORDER BY i) INTO v_txt
      FROM (SELECT '• ' || (x #>> '{}') AS t, i FROM jsonb_array_elements(d -> 'para_decidir_hoy') WITH ORDINALITY a(x, i) WHERE i <= 4) q;
    PERFORM ops.fn_avisar(v_dest, 'control:' || v_hoy, 'Control de hoy: ' || n || ' tema(s) para decidir',
                          v_txt || CASE WHEN n > 4 THEN E'\n' || 'Y ' || (n - 4) || ' más. Preguntale a Iris: «¿qué tengo que decidir hoy?»' ELSE '' END,
                          '/combustible/cierres', false);
    RETURN n;
END $function$;
REVOKE ALL ON FUNCTION ia.fn_control_gerencia_avisar() FROM PUBLIC;

DO $do$
BEGIN
    IF to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL THEN
        PERFORM cron.schedule('iris_control_diario', '35 10 * * *', 'SELECT ia.fn_control_gerencia_avisar()');   -- 7:35 de Mendoza
    END IF;
END $do$;

-- Regla 30
DO $do$
DECLARE
    v_def text := pg_get_functiondef('ia.fn_instrucciones_asistente()'::regprocedure);
    v_ancla constant text := 'decí qué falta y contestá con lo que tengas.''';
    v_nuevo constant text := $t$
        || ' 30) Si Gerencia pregunta qué tiene que decidir, cómo está el control, si roban combustible, quién no cumple o dónde se pierde plata, usá «control_gerencia». '
        || 'Empezá por «para_decidir_hoy»: como mucho cinco temas, cada uno con su número (litros, plata o cantidad) y qué decisión pide. Después, si lo piden, el detalle. '
        || 'Nunca acuses a una persona de robar: decí cuántos litros quedaron a su cargo según los cierres y que eso hay que verlo caso por caso. '
        || 'Si hay reglas de control apagadas o alertas sin responsable, decilo: es control que no se está haciendo. Aclarar una sola vez que la plata es estimada. '
        || 'Si «no_se_pudo_leer» trae algo, nombralo.'$t$;
BEGIN
    IF v_def LIKE '%«control_gerencia»%' THEN RETURN; END IF;
    IF position(v_ancla IN v_def) = 0 THEN
        RAISE EXCEPTION 'ia.fn_instrucciones_asistente no es la que esperaba esta migración (falta la regla 29 de iris_13): avisar antes de seguir';
    END IF;
    EXECUTE replace(v_def, v_ancla, v_ancla || v_nuevo);
END $do$;

DO $do$
BEGIN
    IF NOT has_function_privilege('tc_app', 'ia.fn_lectura_control_gerencia(jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'La lectura quedó sin el permiso de la web: avisar antes de seguir';
    END IF;
END $do$;

COMMIT;

SELECT 'iris 14 aplicada' AS que, (SELECT count(*) FROM ia.asistente_herramienta WHERE activa) AS lecturas_activas;
