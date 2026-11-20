-- =====================================================================================
-- Iris 15 · Ficha de cumplimiento por persona y seguimiento del control día a día
-- =====================================================================================
-- Sigue el plan de control (20/11/2026). Lo que falta definir de Gerencia (consecuencias) queda pendiente:
-- esto solo mide y muestra.
--
--   1 · Lectura «ficha_cumplimiento» (Gerencia, TI y auditor): por mes
--       · choferes: viajes cerrados, litros a su cargo, puntaje de manejo, ralentí de más, cuánto tardan
--         en subir los gastos y cuántos les rechazaron, cargas sin ticket, noches manejando fuera de
--         horario y si hoy tienen atrasos. Cada cosa con verde, amarillo o rojo.
--       · oficina: quién revisó gastos, aprobó cierres y resolvió pedidos de dinero, y cuánto tardó.
--   2 · Seguimiento: cada mañana se guarda una foto de los números del control (sin nombres) y la lectura
--       «control_seguimiento» dice qué mejoró y qué empeoró desde ayer y desde hace una semana.
--       El aviso de la mañana agrega cuántos temas había ayer.
--   3 · Regla 31 en las instrucciones.
--
-- Solo lee (más la foto diaria). Numeración propia de Iris: no toca web.version_base.
-- =====================================================================================
BEGIN;

DO $do$
BEGIN
    IF to_regprocedure('ia.fn_lectura_control_gerencia(jsonb)') IS NULL
       OR pg_get_functiondef('ia.fn_instrucciones_asistente()'::regprocedure) NOT LIKE '%«control_gerencia»%' THEN
        RAISE EXCEPTION 'Primero hay que aplicar iris_14 (control de Gerencia)';
    END IF;
END $do$;

-- ------------------------------------------------------------------ 1 · ficha de cumplimiento
CREATE OR REPLACE FUNCTION ia.fn_semaforo(p_valor numeric, p_verde numeric, p_amarillo numeric)
RETURNS text LANGUAGE sql IMMUTABLE
AS $f$ SELECT CASE WHEN p_valor IS NULL THEN NULL WHEN p_valor <= p_verde THEN 'verde' WHEN p_valor <= p_amarillo THEN 'amarillo' ELSE 'rojo' END $f$;

CREATE OR REPLACE FUNCTION ia.fn_lectura_ficha_cumplimiento(p_entrada jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
    v_usr  bigint := aud.fn_usuario_actual();
    v_hoy  date := (now() AT TIME ZONE 'America/Argentina/Mendoza')::date;
    v_mes  date := date_trunc('month', coalesce(nullif(p_entrada ->> 'mes', '')::date, v_hoy))::date;
    v_fin  date := (date_trunc('month', coalesce(nullif(p_entrada ->> 'mes', '')::date, v_hoy)) + interval '1 month')::date;
    v_d    timestamptz; v_h timestamptz;
    v_nom  boolean := coalesce((p_entrada ->> 'sin_nombres')::boolean, false) IS NOT TRUE;
    v_busca text := nullif(btrim(lower(coalesce(p_entrada ->> 'chofer', ''))), '');
    f jsonb := '{}'; v_err jsonb := '[]'; r record; k text; v_ch jsonb; v_of jsonb := '{}'; v_tiene_fh boolean := to_regclass('tel.fuera_horario') IS NOT NULL;
BEGIN
    IF v_usr IS NULL OR NOT EXISTS (SELECT 1 FROM seg.usuario_rol WHERE usuario_id = v_usr AND rol_codigo IN ('gerencia', 'ti', 'auditor')) THEN
        RAISE EXCEPTION 'La ficha de cumplimiento la ven Gerencia, TI y el auditor' USING ERRCODE = '42501';
    END IF;
    v_d := (v_mes::timestamp AT TIME ZONE 'America/Argentina/Mendoza'); v_h := (v_fin::timestamp AT TIME ZONE 'America/Argentina/Mendoza');

    -- Cierres de viaje: viajes, km y litros a su cargo
    BEGIN
        FOR r IN SELECT cv.chofer_responsable_id AS id, count(*) AS n, round(coalesce(sum(cv.km_recorridos), 0)) AS km,
                        round(coalesce(sum(cv.imputable_total_l) FILTER (WHERE cv.imputable_total_l > 0), 0)) AS l
                   FROM fue.cierre_viaje cv
                  WHERE cv.llegada_ts >= v_d AND cv.llegada_ts < v_h AND cv.eliminado_en IS NULL AND cv.estado <> 'anulado' AND cv.chofer_responsable_id IS NOT NULL
                  GROUP BY 1 LOOP
            k := r.id::text;
            f := jsonb_set(f, ARRAY[k], coalesce(f -> k, '{}') || jsonb_build_object('viajes_cerrados', r.n, 'km', r.km,
                     'combustible_a_su_cargo_l', r.l, 'combustible_color', ia.fn_semaforo(r.l, 0, 50)));
        END LOOP;
    EXCEPTION WHEN OTHERS THEN v_err := v_err || to_jsonb('cierres: ' || SQLERRM);
    END;
    -- Puntaje de manejo de los cierres (promedio por km)
    BEGIN
        FOR r IN SELECT cp.chofer_id AS id, round(sum(cp.total * coalesce(nullif(cp.km, 0), 1)) / nullif(sum(coalesce(nullif(cp.km, 0), 1)), 0), 1) AS p
                   FROM fue.cierre_puntaje cp WHERE cp.llegada >= v_d AND cp.llegada < v_h AND cp.chofer_id IS NOT NULL AND cp.total IS NOT NULL GROUP BY 1 LOOP
            k := r.id::text; f := jsonb_set(f, ARRAY[k], coalesce(f -> k, '{}') || jsonb_build_object('puntaje_de_manejo', r.p));
        END LOOP;
    EXCEPTION WHEN OTHERS THEN v_err := v_err || to_jsonb('puntaje: ' || SQLERRM);
    END;
    -- Ralentí de más
    BEGIN
        FOR r IN SELECT x.chofer_id AS id, round(coalesce(x.exceso_l, 0)) AS l, round(coalesce(x.ralenti_h, 0), 1) AS h FROM fue.fn_ralenti_mes(v_mes) x WHERE x.chofer_id IS NOT NULL LOOP
            k := r.id::text;
            f := jsonb_set(f, ARRAY[k], coalesce(f -> k, '{}') || jsonb_build_object('ralenti_horas', r.h, 'ralenti_de_mas_l', r.l, 'ralenti_color', ia.fn_semaforo(r.l, 0, 30)));
        END LOOP;
    EXCEPTION WHEN OTHERS THEN v_err := v_err || to_jsonb('ralentí: ' || SQLERRM);
    END;
    -- Gastos: cuántos subió, cuánto tarda en subirlos y cuántos le rechazaron
    BEGIN
        FOR r IN SELECT m.chofer_id AS id, count(*) FILTER (WHERE m.estado <> 'anulado') AS n, count(*) FILTER (WHERE m.estado = 'rechazado') AS rech,
                        round(avg(greatest((m.creado_en AT TIME ZONE 'America/Argentina/Mendoza')::date - m.fecha, 0)) FILTER (WHERE m.estado <> 'anulado'), 1) AS dem
                   FROM fin.movimiento_fondo_chofer m
                  WHERE m.tipo = 'gasto' AND m.eliminado_en IS NULL AND m.fecha >= v_mes AND m.fecha < v_fin GROUP BY 1 LOOP
            k := r.id::text;
            f := jsonb_set(f, ARRAY[k], coalesce(f -> k, '{}') || jsonb_build_object('gastos_subidos', r.n, 'gastos_rechazados', r.rech,
                     'dias_que_tarda_en_subir_un_gasto', r.dem, 'gastos_color', ia.fn_semaforo(r.dem, 3, 7)));
        END LOOP;
    EXCEPTION WHEN OTHERS THEN v_err := v_err || to_jsonb('gastos: ' || SQLERRM);
    END;
    -- Cargas con orden: cuántas dejó sin ticket
    BEGIN
        FOR r IN SELECT o.chofer_id AS id, count(*) AS n,
                        count(*) FILTER (WHERE jsonb_array_length(coalesce(o.tickets, '[]')) = 0 AND NOT coalesce(o.autorizada_desde ? 'tarjeta_flota', false)
                                           AND coalesce(o.cargada_en, o.autorizada_en) < now() - interval '3 hours') AS sin
                   FROM fue.orden_carga o
                  WHERE o.genset_id IS NULL AND o.estado IN ('autorizada', 'cargada') AND coalesce(o.cargada_en, o.autorizada_en) >= v_d AND coalesce(o.cargada_en, o.autorizada_en) < v_h
                  GROUP BY 1 LOOP
            k := r.id::text;
            f := jsonb_set(f, ARRAY[k], coalesce(f -> k, '{}') || jsonb_build_object('cargas_con_orden', r.n, 'cargas_sin_ticket', r.sin, 'tickets_color', ia.fn_semaforo(r.sin, 0, 1)));
        END LOOP;
    EXCEPTION WHEN OTHERS THEN v_err := v_err || to_jsonb('tickets: ' || SQLERRM);
    END;
    -- Noches manejando fuera de horario sin estar habilitado (migración 286, si está)
    IF v_tiene_fh THEN
        BEGIN
            FOR r IN EXECUTE 'SELECT x.chofer_id AS id, count(*) AS n, count(*) FILTER (WHERE x.escalado_en IS NOT NULL) AS esc
                                FROM tel.fuera_horario x WHERE x.chofer_id IS NOT NULL AND NOT x.habilitado AND x.avisado_en IS NOT NULL AND x.noche >= $1 AND x.noche < $2 GROUP BY 1'
                     USING v_mes, v_fin LOOP
                k := r.id::text;
                f := jsonb_set(f, ARRAY[k], coalesce(f -> k, '{}') || jsonb_build_object('noches_fuera_de_horario', r.n, 'noches_que_siguio_despues_del_aviso', r.esc,
                         'horario_color', CASE WHEN r.esc > 0 THEN 'rojo' ELSE ia.fn_semaforo(r.n, 0, 1) END));
            END LOOP;
        EXCEPTION WHEN OTHERS THEN v_err := v_err || to_jsonb('horario de manejo: ' || SQLERRM);
        END;
    END IF;
    -- Atrasos de hoy (migración 285, si está): solo si se mira el mes en curso
    IF v_mes = date_trunc('month', v_hoy)::date AND to_regprocedure('fin.fn_trabas_pedido_fondo(bigint)') IS NOT NULL THEN
        BEGIN
            FOR r IN SELECT ch.id, fin.fn_trabas_pedido_fondo(ch.id) AS t FROM mae.chofer ch
                      WHERE f ? ch.id::text OR EXISTS (SELECT 1 FROM fin.movimiento_fondo_chofer m WHERE m.chofer_id = ch.id AND m.fecha >= v_hoy - 60 AND m.eliminado_en IS NULL) LOOP
                IF jsonb_array_length(r.t) > 0 THEN
                    k := r.id::text;
                    f := jsonb_set(f, ARRAY[k], coalesce(f -> k, '{}') || jsonb_build_object('atrasos_hoy', (SELECT jsonb_agg(e ->> 'texto') FROM jsonb_array_elements(r.t) e), 'atrasos_color', 'rojo'));
                END IF;
            END LOOP;
        EXCEPTION WHEN OTHERS THEN v_err := v_err || to_jsonb('atrasos: ' || SQLERRM);
        END;
    END IF;

    -- Armado: nombre, cuántos rojos y amarillos, ordenado de peor a mejor
    SELECT jsonb_agg(q.j ORDER BY q.rojos DESC, q.amarillos DESC, q.quien)
      INTO v_ch
      FROM (SELECT CASE WHEN v_nom THEN ch.apellido || ', ' || ch.nombre ELSE 'chofer ' || ch.id END AS quien,
                   (SELECT count(*) FROM jsonb_each_text(e.value) c WHERE c.key LIKE '%\_color' AND c.value = 'rojo') AS rojos,
                   (SELECT count(*) FROM jsonb_each_text(e.value) c WHERE c.key LIKE '%\_color' AND c.value = 'amarillo') AS amarillos,
                   jsonb_build_object('chofer', CASE WHEN v_nom THEN ch.apellido || ', ' || ch.nombre ELSE 'chofer ' || ch.id END,
                       'en_rojo', (SELECT count(*) FROM jsonb_each_text(e.value) c WHERE c.key LIKE '%\_color' AND c.value = 'rojo'),
                       'en_amarillo', (SELECT count(*) FROM jsonb_each_text(e.value) c WHERE c.key LIKE '%\_color' AND c.value = 'amarillo')) || e.value AS j
              FROM jsonb_each(f) e JOIN mae.chofer ch ON ch.id = e.key::bigint
             WHERE v_busca IS NULL OR lower(ch.apellido || ' ' || ch.nombre) LIKE '%' || v_busca || '%' OR lower(coalesce(ch.legajo, '')) = v_busca) q;

    -- Oficina: quién revisó, aprobó y resolvió, y cuánto tardó
    BEGIN
        v_of := jsonb_build_object(
            'gastos_revisados', (SELECT jsonb_agg(jsonb_build_object('quien', q.quien, 'gastos', q.n, 'dias_que_tardo', q.d, 'color', ia.fn_semaforo(q.d, 3, 7)) ORDER BY q.n DESC)
                                   FROM (SELECT CASE WHEN v_nom THEN u.nombre ELSE 'usuario ' || u.id END AS quien, count(*) AS n,
                                                round(avg(extract(epoch FROM m.revisado_en - m.creado_en) / 86400)::numeric, 1) AS d
                                           FROM fin.movimiento_fondo_chofer m JOIN seg.usuario u ON u.id = m.revisado_por
                                          WHERE m.tipo = 'gasto' AND m.revisado_en >= v_d AND m.revisado_en < v_h GROUP BY 1) q),
            'cierres_aprobados', (SELECT jsonb_agg(jsonb_build_object('quien', q.quien, 'cierres', q.n, 'dias_desde_que_llego_el_camion', q.d, 'color', ia.fn_semaforo(q.d, 3, 7)) ORDER BY q.n DESC)
                                    FROM (SELECT CASE WHEN v_nom THEN u.nombre ELSE 'usuario ' || u.id END AS quien, count(*) AS n,
                                                 round(avg(extract(epoch FROM cv.aprobado_en - cv.llegada_ts) / 86400)::numeric, 1) AS d
                                            FROM fue.cierre_viaje cv JOIN seg.usuario u ON u.id = cv.aprobado_por
                                           WHERE cv.aprobado_en >= v_d AND cv.aprobado_en < v_h AND cv.eliminado_en IS NULL GROUP BY 1) q),
            'pedidos_de_dinero_resueltos', (SELECT jsonb_agg(jsonb_build_object('quien', q.quien, 'pedidos', q.n, 'horas_que_tardo', q.hs, 'color', ia.fn_semaforo(q.hs, 24, 72)) ORDER BY q.n DESC)
                                              FROM (SELECT CASE WHEN v_nom THEN u.nombre ELSE 'usuario ' || u.id END AS quien, count(*) AS n,
                                                           round(avg(extract(epoch FROM p.resuelto_en - p.pedido_en) / 3600)::numeric, 1) AS hs
                                                      FROM fin.pedido_fondo p JOIN seg.usuario u ON u.id = p.resuelto_por
                                                     WHERE p.resuelto_en >= v_d AND p.resuelto_en < v_h GROUP BY 1) q));
    EXCEPTION WHEN OTHERS THEN v_err := v_err || to_jsonb('oficina: ' || SQLERRM);
    END;

    RETURN jsonb_build_object(
        'mes', to_char(v_mes, 'MM/YYYY'),
        'choferes', coalesce(v_ch, '[]'),
        'oficina', v_of,
        'no_se_pudo_leer', CASE WHEN jsonb_array_length(v_err) > 0 THEN v_err END,
        'colores', 'Combustible a su cargo: verde 0 L, amarillo hasta 50 L, rojo más. Ralentí de más: verde 0, amarillo hasta 30 L, rojo más. '
            || 'Gastos: verde si los sube en hasta 3 días, amarillo hasta 7, rojo más. Cargas sin ticket: verde 0, amarillo 1, rojo 2 o más. '
            || 'Fuera de horario: verde 0 noches, amarillo 1, rojo 2 o más o si siguió después del aviso. Atrasos de hoy: rojo. '
            || 'Oficina: gastos y cierres, verde hasta 3 días, amarillo hasta 7; pedidos de dinero, verde hasta 24 horas, amarillo hasta 72.',
        'como_leerlo', 'Es una ficha para conversar con cada persona, con datos del sistema. Un rojo dice que hay algo para revisar, no que la persona actuó mal: '
            || 'puede faltar un cierre, una carga sin registrar o una justificación. El puntaje de manejo es el de los cierres de viaje.');
END $function$;
REVOKE ALL ON FUNCTION ia.fn_lectura_ficha_cumplimiento(jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION ia.fn_semaforo(numeric, numeric, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ia.fn_lectura_ficha_cumplimiento(jsonb) TO tc_app, tc_admin, tc_lectura;
GRANT EXECUTE ON FUNCTION ia.fn_semaforo(numeric, numeric, numeric) TO tc_app, tc_admin, tc_lectura;

-- ------------------------------------------------------------------ 2 · seguimiento día a día
CREATE TABLE IF NOT EXISTS ia.control_diario (
    fecha     date PRIMARY KEY,
    numeros   jsonb NOT NULL,
    temas     integer NOT NULL DEFAULT 0,
    creado_en timestamptz NOT NULL DEFAULT now()
);
COMMENT ON TABLE ia.control_diario IS 'Iris 15: foto de cada mañana de los números del control de Gerencia (sin nombres), para decir qué mejoró y qué empeoró.';
DO $r$
DECLARE r record;
BEGIN
    REVOKE ALL ON TABLE ia.control_diario FROM PUBLIC;
    FOR r IN SELECT rolname FROM pg_roles WHERE (rolname LIKE 'tc\_%' OR rolname IN ('authenticated', 'anon'))
                AND rolname <> (SELECT pg_get_userbyid(relowner) FROM pg_class WHERE oid = 'ia.control_diario'::regclass) LOOP
        EXECUTE format('REVOKE ALL ON TABLE ia.control_diario FROM %I', r.rolname);
    END LOOP;
END $r$;

-- Los números que se siguen, sacados de la lectura del control
CREATE OR REPLACE FUNCTION ia.fn_control_numeros(p_datos jsonb)
RETURNS jsonb LANGUAGE sql IMMUTABLE
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT jsonb_build_object(
        'litros_de_combustible_sin_decidir', coalesce((p_datos #>> '{combustible_segun_los_cierres,litros_sin_decidir}')::numeric, 0),
        'viajes_con_diferencia_sin_decidir', coalesce((p_datos #>> '{combustible_segun_los_cierres,fuera_de_tolerancia_sin_decidir}')::numeric, 0),
        'cierres_en_borrador_viejos', coalesce((p_datos #>> '{combustible_segun_los_cierres,borradores_de_mas_de_7_dias}')::numeric, 0),
        'viajes_con_cierre_vencido', coalesce((p_datos #>> '{viajes_sin_cierre,vencidos}')::numeric, 0),
        'alertas_abiertas', coalesce((p_datos #>> '{alertas,abiertas}')::numeric, 0),
        'alertas_vencidas', coalesce((p_datos #>> '{alertas,vencidas}')::numeric, 0),
        'alertas_sin_responsable', coalesce((p_datos #>> '{alertas,sin_responsable}')::numeric, 0),
        'choferes_con_atrasos', coalesce((p_datos #>> '{choferes,choferes_con_atrasos}')::numeric, 0),
        'gastos_de_choferes_sin_revisar', coalesce((p_datos #>> '{oficina,gastos_de_choferes_sin_revisar}')::numeric, 0),
        'cargas_sin_validar_viejas', coalesce((p_datos #>> '{oficina,cargas_de_combustible_sin_validar_de_mas_de_3_dias}')::numeric, 0))
$f$;
REVOKE ALL ON FUNCTION ia.fn_control_numeros(jsonb) FROM PUBLIC;

CREATE OR REPLACE FUNCTION ia.fn_lectura_control_seguimiento(p_entrada jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
    v_hoy date := (now() AT TIME ZONE 'America/Argentina/Mendoza')::date;
    v_ahora jsonb; a record; s record; v_lista jsonb := '[]'; r record;
BEGIN
    -- fn_lectura_control_gerencia ya exige Gerencia, TI o auditor
    v_ahora := ia.fn_control_numeros(ia.fn_lectura_control_gerencia(jsonb_build_object('sin_nombres', true)));
    SELECT * INTO a FROM ia.control_diario WHERE fecha < v_hoy ORDER BY fecha DESC LIMIT 1;
    SELECT * INTO s FROM ia.control_diario WHERE fecha <= v_hoy - 7 ORDER BY fecha DESC LIMIT 1;
    IF a.fecha IS NULL THEN
        RETURN jsonb_build_object('ahora', v_ahora, 'aviso', 'Todavía no hay una foto anterior para comparar: la primera se guarda mañana a la mañana.');
    END IF;
    FOR r IN SELECT k.key AS que, (k.value #>> '{}')::numeric AS ahora, (a.numeros ->> k.key)::numeric AS ayer,
                    CASE WHEN s.fecha IS NOT NULL THEN (s.numeros ->> k.key)::numeric END AS semana
               FROM jsonb_each(v_ahora) k LOOP
        v_lista := v_lista || jsonb_build_object('que', replace(r.que, '_', ' '), 'ahora', r.ahora, 'en_la_foto_anterior', r.ayer,
                       'cambio', r.ahora - coalesce(r.ayer, r.ahora),
                       'hace_una_semana', r.semana, 'cambio_en_la_semana', CASE WHEN r.semana IS NOT NULL THEN r.ahora - r.semana END,
                       'como_viene', CASE WHEN r.ahora < coalesce(r.semana, r.ayer, r.ahora) THEN 'mejor' WHEN r.ahora > coalesce(r.semana, r.ayer, r.ahora) THEN 'peor' ELSE 'igual' END);
    END LOOP;
    RETURN jsonb_build_object(
        'comparado_con', to_char(a.fecha, 'DD/MM'), 'y_con', CASE WHEN s.fecha IS NOT NULL THEN to_char(s.fecha, 'DD/MM') END,
        'numeros', v_lista,
        'como_leerlo', 'En todos estos números MENOS es mejor: son cosas sin resolver. «cambio» negativo = se resolvieron cosas. '
            || 'Si un número sube varios días seguidos, ese control no se está haciendo.');
END $function$;
REVOKE ALL ON FUNCTION ia.fn_lectura_control_seguimiento(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ia.fn_lectura_control_seguimiento(jsonb) TO tc_app, tc_admin, tc_lectura;

-- El aviso de la mañana ahora guarda la foto y dice cómo venía ayer
CREATE OR REPLACE FUNCTION ia.fn_control_gerencia_avisar()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE d jsonb; v_dest bigint[]; v_txt text; n int; v_ayer int;
        v_hoy date := (now() AT TIME ZONE 'America/Argentina/Mendoza')::date;
BEGIN
    PERFORM set_config('ia.control_auto', '1', true);
    d := ia.fn_lectura_control_gerencia(jsonb_build_object('sin_nombres', true));
    PERFORM set_config('ia.control_auto', '', true);
    n := jsonb_array_length(coalesce(d -> 'para_decidir_hoy', '[]'));
    SELECT c.temas INTO v_ayer FROM ia.control_diario c WHERE c.fecha < v_hoy ORDER BY c.fecha DESC LIMIT 1;
    -- La foto del día se guarda siempre, aunque no se avise
    INSERT INTO ia.control_diario (fecha, numeros, temas) VALUES (v_hoy, ia.fn_control_numeros(d), n)
    ON CONFLICT (fecha) DO UPDATE SET numeros = EXCLUDED.numeros, temas = EXCLUDED.temas, creado_en = now();
    IF coalesce((SELECT valor::text FROM ref.parametro WHERE codigo = 'ia.control_diario_activo' AND eliminado_en IS NULL), 'true') <> 'true' THEN RETURN 0; END IF;
    IF n = 0 THEN RETURN 0; END IF;
    SELECT array_agg(DISTINCT r.usuario_id) INTO v_dest FROM seg.usuario_rol r JOIN seg.usuario u ON u.id = r.usuario_id
     WHERE r.rol_codigo = 'gerencia' AND u.activo;
    IF v_dest IS NULL THEN RETURN 0; END IF;
    SELECT string_agg(t, E'\n' ORDER BY i) INTO v_txt
      FROM (SELECT '• ' || (x #>> '{}') AS t, i FROM jsonb_array_elements(d -> 'para_decidir_hoy') WITH ORDINALITY a(x, i) WHERE i <= 4) q;
    PERFORM ops.fn_avisar(v_dest, 'control:' || v_hoy, 'Control de hoy: ' || n || ' tema(s) para decidir'
                              || CASE WHEN v_ayer IS NOT NULL AND v_ayer <> n THEN ' (ayer ' || v_ayer || ')' ELSE '' END,
                          v_txt || CASE WHEN n > 4 THEN E'\n' || 'Y ' || (n - 4) || ' más. Preguntale a Iris: «¿qué tengo que decidir hoy?»' ELSE '' END,
                          '/combustible/cierres', false);
    RETURN n;
END $function$;
REVOKE ALL ON FUNCTION ia.fn_control_gerencia_avisar() FROM PUBLIC;

-- ------------------------------------------------------------------ las dos lecturas, en la lista de Iris
INSERT INTO ia.asistente_herramienta (codigo, orden, descripcion, etiqueta, leyendo, pantalla, entrada, activa)
VALUES ('ficha_cumplimiento', 38,
        'La ficha de cumplimiento de un mes, por persona. Choferes: viajes cerrados, litros de combustible a su cargo, puntaje de manejo, ralentí de más, cuánto tardan en subir gastos, '
        || 'gastos rechazados, cargas sin ticket, noches fuera del horario de manejo y atrasos de hoy, cada cosa en verde, amarillo o rojo. Oficina: quién revisó gastos, aprobó cierres y resolvió pedidos de dinero y cuánto tardó. '
        || 'Usala cuando pregunten «¿quién no está cumpliendo?», «¿cómo viene tal chofer?», «¿quiénes son los mejores y los peores choferes?», «¿cómo trabaja la oficina?» o pidan la ficha o la nota de alguien. '
        || 'Solo la pueden leer Gerencia, TI y el auditor.',
        'Ficha de cumplimiento', 'Armando la ficha de cumplimiento…', '/combustible/cierres',
        '{"type": "object", "properties": {
            "mes": {"type": "string", "description": "Un día cualquiera del mes a mirar, AAAA-MM-DD. Si no se manda: el mes actual."},
            "chofer": {"type": "string", "description": "Apellido, nombre o legajo, para traer la ficha de un solo chofer. Si no se manda: todos."}}}'::jsonb, true),
       ('control_seguimiento', 39,
        'Cómo cambió el control desde ayer y desde hace una semana: combustible sin decidir, cierres atrasados, alertas abiertas y vencidas, choferes con atrasos y lo que la oficina tiene sin revisar. '
        || 'Usala cuando pregunten «¿mejoramos el control?», «¿se resolvió lo de ayer?», «¿qué empeoró esta semana?». Solo Gerencia, TI y el auditor.',
        'Seguimiento del control', 'Comparando con los días anteriores…', '/combustible/cierres',
        '{"type": "object", "properties": {}}'::jsonb, true)
ON CONFLICT (codigo) DO UPDATE
   SET descripcion = EXCLUDED.descripcion, etiqueta = EXCLUDED.etiqueta, leyendo = EXCLUDED.leyendo, pantalla = EXCLUDED.pantalla,
       entrada = EXCLUDED.entrada, activa = true;

DO $do$
DECLARE v_def text := pg_get_functiondef('ia.fn_herramienta(text, jsonb)'::regprocedure);
        v_a2 constant text := 'ELSE ia.fn_lectura_tipo_cambio(p_entrada) END);';
BEGIN
    IF v_def LIKE '%ficha_cumplimiento%' THEN RETURN; END IF;
    IF v_def !~ 'p_codigo IN \(''viento_en_ruta''[^)]*\)' OR position(v_a2 IN v_def) = 0 THEN
        RAISE EXCEPTION 'ia.fn_herramienta no es la que esperaba esta migración: avisar antes de seguir';
    END IF;
    v_def := regexp_replace(v_def, '(p_codigo IN \(''viento_en_ruta''[^)]*)\)', '\1, ''ficha_cumplimiento'', ''control_seguimiento'')');
    v_def := replace(v_def, v_a2, 'WHEN ''ficha_cumplimiento'' THEN ia.fn_lectura_ficha_cumplimiento(p_entrada)
                    WHEN ''control_seguimiento'' THEN ia.fn_lectura_control_seguimiento(p_entrada)
                    ' || v_a2);
    EXECUTE v_def;
END $do$;

-- Regla 31
DO $do$
DECLARE
    v_def text := pg_get_functiondef('ia.fn_instrucciones_asistente()'::regprocedure);
    v_ancla constant text := 'Si «no_se_pudo_leer» trae algo, nombralo.''';
    v_nuevo constant text := $t$
        || ' 31) Para hablar de cómo cumple una persona usá «ficha_cumplimiento». Si piden un chofer, mandá su nombre o legajo y contá primero lo que tiene en rojo, con el número, y después lo que está bien. '
        || 'Si piden todos, nombrá los tres que mejor vienen y los tres con más rojos, y ofrecé el detalle. Un rojo es algo para revisar con la persona, no una falta probada: decilo así. '
        || 'No inventes una nota única ni un orden que la lectura no trae. Para saber si el control mejora o empeora en el tiempo usá «control_seguimiento» (menos es mejor).'$t$;
BEGIN
    IF v_def LIKE '%«ficha_cumplimiento»%' THEN RETURN; END IF;
    IF position(v_ancla IN v_def) = 0 THEN
        RAISE EXCEPTION 'ia.fn_instrucciones_asistente no es la que esperaba esta migración (falta la regla 30 de iris_14): avisar antes de seguir';
    END IF;
    EXECUTE replace(v_def, v_ancla, v_ancla || v_nuevo);
END $do$;

DO $do$
BEGIN
    IF NOT has_function_privilege('tc_app', 'ia.fn_lectura_ficha_cumplimiento(jsonb)', 'EXECUTE')
       OR NOT has_function_privilege('tc_app', 'ia.fn_lectura_control_seguimiento(jsonb)', 'EXECUTE') THEN
        RAISE EXCEPTION 'Las lecturas quedaron sin el permiso de la web: avisar antes de seguir';
    END IF;
END $do$;

COMMIT;

SELECT 'iris 15 aplicada' AS que, (SELECT count(*) FROM ia.asistente_herramienta WHERE activa) AS lecturas_activas;
