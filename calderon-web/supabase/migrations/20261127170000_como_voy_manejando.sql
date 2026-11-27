-- =====================================================================================
-- Migración 387 · «Cómo voy manejando»: el chofer ve cómo viene con el bono, el consumo, el ralentí y su manejo
-- =====================================================================================
-- Pedido (27/11/2026): en la app del chofer, un apartado para que vea si va cumpliendo el objetivo del bono, cómo va con
-- el ralentí y con el consumo, para alentarlo a mejorar. Decisiones: bono + consumo, ralentí y estilo de manejo; el consumo
-- se muestra de dos formas (lo que cuenta para el bono = cierres aprobados, y «cómo venís ahora» según el motor); se
-- muestra el monto del bono; el ralentí solo en litros (sin el descuento en plata).
--
-- Lectura nueva tel.fn_mi_manejo(): solo los datos del propio chofer (ops.fn_exigir_mi_chofer). Solo lee.
--   · Bono: misma regla que fin.fn_bono_propuesta (cierres aprobados del período de liquidación, por llegada; consumo
--     máximo fin.bono_desempeno_consumo_max; sin faltantes). Cuidado de la unidad y limpieza los evalúa RRHH.
--   · Consumo según el motor: tel.conduccion_diaria del período (solo los días con litros) y de los últimos 7 días.
--   · Ralentí: litros del mes calendario contra fue.ralenti_permitido_l_mes (como fue.fn_ralenti_mes), con el ritmo a fin de mes.
--   · Estilo: programador, exceso de velocidad, frenadas fuertes y RPM altas, con las mismas cuentas que tel.fn_puntaje_choferes.
--   · Consejos: lo que más le conviene mejorar, en palabras simples.
-- No cambia datos ni web.version_base. Se puede correr más de una vez.
-- =====================================================================================
BEGIN;

DO $v$
BEGIN
    IF to_regclass('tel.conduccion_diaria') IS NULL OR to_regclass('fue.cierre_viaje') IS NULL
       OR to_regprocedure('ops.fn_exigir_mi_chofer()') IS NULL OR to_regprocedure('fin.fn_rango_periodo(date)') IS NULL
       OR to_regprocedure('fin.fn_bono_propuesta(bigint)') IS NULL OR to_regprocedure('tel.fn_mis_pedidos_tablero()') IS NULL THEN
        RAISE EXCEPTION 'Faltan la conducción diaria, los cierres o el bono por desempeño (342): avisar antes de seguir';
    END IF;
END $v$;

-- Números como se leen acá: 33,2 · 200.000 · 34 (sin «,0»)
CREATE OR REPLACE FUNCTION tel.fn_num_es(p text, p_de text, p_a text)
 RETURNS text LANGUAGE sql IMMUTABLE
 SET search_path TO 'pg_catalog'
AS $f$ SELECT regexp_replace(translate(p, p_de, p_a), ',0$', '') $f$;
REVOKE ALL ON FUNCTION tel.fn_num_es(text, text, text) FROM PUBLIC;

-- La cuenta, para un chofer (interna; la usan la lectura del chofer y la prueba)
CREATE OR REPLACE FUNCTION tel.fn_manejo_chofer(p_chofer bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
 SET jit TO 'off'
AS $f$
DECLARE
    v_hoy date := mae.fn_hoy();
    v_per date; r record; c record; m record; s record; v7 record; ral record;
    v_bono_desde date := (ref.fn_parametro_texto('fin.bono_desempeno_desde', '2026-12-01'))::date;
    v_importe numeric := ref.fn_parametro_num('fin.bono_desempeno_importe', 200000);
    v_max numeric := ref.fn_parametro_num('fin.bono_desempeno_consumo_max', 34);
    v_prog_obj numeric := ref.fn_parametro_num('tel.programador_objetivo_pct', 60);
    v_ral_perm numeric := ref.fn_parametro_num('fue.ralenti_permitido_l_mes', 40);
    v_mes date := date_trunc('month', v_hoy)::date;
    v_dias_mes integer; v_cons_c numeric; v_cons_m numeric; v_cons numeric; v_fuente text; v_aplica boolean;
    v_cuidado boolean; v_limpieza boolean; v_liq bigint;
    v_estado text; v_titulo text; v_consejos text[] := '{}'; v_ral_ritmo numeric;
    v_prog numeric; v_vel numeric; v_ff numeric; v_rpm numeric;
    fmt constant text := 'FM999G999G999G990';
    fmt1 constant text := 'FM999G990D0';
BEGIN
    -- El período de liquidación que corre hoy (el del bono)
    v_per := date_trunc('month', v_hoy)::date;
    SELECT * INTO r FROM fin.fn_rango_periodo(v_per);
    IF v_hoy > r.hasta THEN v_per := (v_per + interval '1 month')::date; SELECT * INTO r FROM fin.fn_rango_periodo(v_per); END IF;
    IF v_hoy < r.desde THEN v_per := (v_per - interval '1 month')::date; SELECT * INTO r FROM fin.fn_rango_periodo(v_per); END IF;
    v_aplica := v_per >= v_bono_desde AND v_importe > 0;

    -- 1 · Lo que cuenta para el bono: los cierres aprobados del período (como fin.fn_bono_propuesta)
    SELECT coalesce(sum(coalesce(cv.km_manual, cv.km_recorridos)) FILTER (WHERE cv.estado = 'aprobado'), 0) AS km,
           coalesce(sum(coalesce(cv.libro_l, cv.consumo_llenado_l)) FILTER (WHERE cv.estado = 'aprobado'), 0) AS litros,
           coalesce(sum(coalesce(cv.faltante_salida_l, 0) + coalesce(cv.faltante_llegada_l, 0)) FILTER (WHERE cv.estado = 'aprobado'), 0) AS faltante,
           count(*) FILTER (WHERE cv.estado = 'aprobado')::int AS aprobados,
           count(*) FILTER (WHERE cv.estado NOT IN ('aprobado', 'anulado'))::int AS pendientes
      INTO c
      FROM fue.cierre_viaje cv
     WHERE cv.chofer_responsable_id = p_chofer AND cv.eliminado_en IS NULL
       AND (cv.llegada_ts AT TIME ZONE 'America/Argentina/Mendoza')::date BETWEEN r.desde AND r.hasta;
    v_cons_c := CASE WHEN c.km >= 100 THEN round(100 * c.litros / c.km, 1) END;

    -- Lo que ya evaluó RRHH (si la liquidación del período tiene el bono cargado)
    SELECT l.id INTO v_liq FROM fin.liquidacion_mensual l
     WHERE l.chofer_id = p_chofer AND l.periodo = v_per AND l.eliminado_en IS NULL ORDER BY l.id DESC LIMIT 1;
    IF v_liq IS NOT NULL AND to_regclass('fin.liquidacion_bono') IS NOT NULL THEN
        SELECT b.cuidado_unidad, b.limpieza INTO v_cuidado, v_limpieza FROM fin.liquidacion_bono b WHERE b.liquidacion_id = v_liq;
    END IF;

    -- 2 · Según el motor: el período y los últimos 7 días (solo los días con litros, para no bajar el promedio)
    SELECT coalesce(sum(d.km), 0) AS km, coalesce(sum(d.km) FILTER (WHERE d.litros > 0), 0) AS km_l,
           coalesce(sum(d.litros) FILTER (WHERE d.litros > 0), 0) AS litros, count(DISTINCT d.fecha) FILTER (WHERE d.km > 0)::int AS dias
      INTO m FROM tel.conduccion_diaria d
     WHERE d.chofer_id = p_chofer AND d.fecha BETWEEN r.desde AND least(r.hasta, v_hoy);
    v_cons_m := CASE WHEN m.km_l >= 100 THEN round(100 * m.litros / m.km_l, 1) END;
    SELECT coalesce(sum(d.km) FILTER (WHERE d.litros > 0), 0) AS km_l, coalesce(sum(d.litros) FILTER (WHERE d.litros > 0), 0) AS litros
      INTO v7 FROM tel.conduccion_diaria d
     WHERE d.chofer_id = p_chofer AND d.fecha BETWEEN v_hoy - 6 AND v_hoy;

    -- 3 · Ralentí del mes calendario (como fue.fn_ralenti_mes)
    v_dias_mes := ((v_mes + interval '1 month')::date - v_mes);
    SELECT round(coalesce(sum(d.ralenti_l), 0), 1) AS l, round(coalesce(sum(d.ralenti_h), 0), 1) AS h,
           round(100 * sum(d.ralenti_h) / nullif(sum(d.horas_motor) FILTER (WHERE d.ralenti_h IS NOT NULL), 0), 1) AS pct
      INTO ral FROM tel.conduccion_diaria d
     WHERE d.chofer_id = p_chofer AND d.fecha >= v_mes AND d.fecha <= v_hoy;
    v_ral_ritmo := round(ral.l / greatest(v_hoy - v_mes + 1, 1) * v_dias_mes, 1);

    -- 4 · Estilo de manejo del período (mismas cuentas que tel.fn_puntaje_choferes)
    SELECT sum(d.km) AS km, sum(d.programador_km) FILTER (WHERE d.acumulados) AS prog, sum(d.km) FILTER (WHERE d.acumulados) AS km_acum,
           sum(d.sobre_velocidad_min) AS vel, sum(d.frenada_fuerte_s) AS ff, sum(d.rpm_alta_min) AS rpm, sum(d.movimiento_h) AS mov,
           max(d.velocidad_max) AS vmax
      INTO s FROM tel.conduccion_diaria d
     WHERE d.chofer_id = p_chofer AND d.fecha BETWEEN r.desde AND least(r.hasta, v_hoy);
    v_prog := CASE WHEN s.km_acum > 50 THEN round(least(100, 100 * s.prog / s.km_acum), 0) END;
    v_vel := CASE WHEN s.km > 50 AND s.vel IS NOT NULL THEN round(100 * s.vel / s.km, 1) END;
    v_ff := CASE WHEN s.km > 50 AND s.ff IS NOT NULL THEN round(100 * s.ff / s.km, 1) END;
    v_rpm := CASE WHEN s.mov > 0 AND s.rpm IS NOT NULL THEN round(least(100, 100 * s.rpm / 60 / s.mov), 1) END;

    -- 5 · El veredicto del bono y lo que conviene mejorar
    v_cons := coalesce(v_cons_c, v_cons_m);
    v_fuente := CASE WHEN v_cons_c IS NOT NULL THEN 'cierres' WHEN v_cons_m IS NOT NULL THEN 'motor' END;
    v_estado := CASE
        WHEN NOT v_aplica THEN 'no_aplica'
        WHEN c.faltante > 0 THEN 'faltante'
        WHEN v_cons IS NULL THEN 'sin_datos'
        WHEN v_cons <= v_max THEN 'en_camino'
        WHEN v_cons <= v_max + 1.5 THEN 'cerca'
        ELSE 'lejos' END;
    v_titulo := CASE v_estado
        WHEN 'no_aplica' THEN format('El bono por desempeño arranca con la liquidación de %s. Ya podés ir practicando.', (ARRAY['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'])[extract(month FROM v_bono_desde)::int])
        WHEN 'faltante' THEN format('Este mes tuviste %s L de faltante de combustible: con faltantes no se cobra el bono. Cuidá cada carga.', tel.fn_num_es(to_char(round(c.faltante, 1), fmt1), '.,', ',.'))
        WHEN 'sin_datos' THEN format('Todavía no hay kilómetros suficientes para medir tu consumo. El objetivo es %s L/100 km.', tel.fn_num_es(to_char(v_max, fmt1), '.,', ',.'))
        WHEN 'en_camino' THEN format('¡Vas camino a los $%s! Venís en %s L/100 km y el objetivo es %s.', tel.fn_num_es(to_char(v_importe, fmt), ',', '.'),
                                      tel.fn_num_es(to_char(v_cons, fmt1), '.,', ',.'), tel.fn_num_es(to_char(v_max, fmt1), '.,', ',.'))
        ELSE format('Te falta bajar %s L/100 km para ganar los $%s. Venís en %s y el objetivo es %s.',
                    tel.fn_num_es(to_char(v_cons - v_max, fmt1), '.,', ',.'), tel.fn_num_es(to_char(v_importe, fmt), ',', '.'),
                    tel.fn_num_es(to_char(v_cons, fmt1), '.,', ',.'), tel.fn_num_es(to_char(v_max, fmt1), '.,', ',.')) END;

    IF v_prog IS NOT NULL AND v_prog < v_prog_obj THEN
        v_consejos := array_append(v_consejos, format('Usá más el programador de velocidad: lo usaste en el %s %% de los km y lo ideal es más del %s %%. Es lo que más ahorra en ruta.', v_prog, v_prog_obj));
    END IF;
    IF ral.l > v_ral_perm THEN
        v_consejos := array_append(v_consejos, format('Ya pasaste el ralentí permitido del mes: llevás %s L y el permitido es %s L. Apagá el motor en las esperas.',
                                           tel.fn_num_es(to_char(ral.l, fmt1), '.,', ',.'), tel.fn_num_es(to_char(v_ral_perm, fmt1), '.,', ',.')));
    ELSIF v_ral_ritmo > v_ral_perm AND v_hoy - v_mes + 1 >= 5 THEN
        v_consejos := array_append(v_consejos, format('Ojo con el ralentí: a este ritmo terminás el mes con %s L y el permitido es %s L. Apagá el motor en las esperas.',
                                           tel.fn_num_es(to_char(v_ral_ritmo, fmt1), '.,', ',.'), tel.fn_num_es(to_char(v_ral_perm, fmt1), '.,', ',.')));
    END IF;
    IF v_vel IS NOT NULL AND v_vel > 1 THEN
        v_consejos := array_append(v_consejos, 'Bajá un poco la velocidad: los minutos con exceso de velocidad suben el consumo y el riesgo.');
    END IF;
    IF v_rpm IS NOT NULL AND v_rpm > 10 THEN
        v_consejos := array_append(v_consejos, 'Cambiá antes: muchas RPM altas gastan gasoil de más. Manejá en la zona verde del cuentavueltas.');
    END IF;
    IF v_ff IS NOT NULL AND v_ff > 10 THEN
        v_consejos := array_append(v_consejos, 'Anticipá las frenadas: soltar el acelerador antes y usar el freno motor ahorra gasoil y frenos.');
    END IF;
    IF v_aplica AND c.pendientes > 0 THEN
        v_consejos := array_append(v_consejos, format('Tenés %s cierre%s de viaje sin aprobar: para que cuenten en el bono, que estén completos y firmados.',
                                           c.pendientes, CASE WHEN c.pendientes = 1 THEN '' ELSE 's' END));
    END IF;
    IF cardinality(v_consejos) = 0 AND v_estado IN ('en_camino', 'no_aplica') AND v_cons IS NOT NULL THEN
        v_consejos := array_append(v_consejos, '¡Muy bien! Seguí así: manejo parejo, programador y motor apagado en las esperas.');
    END IF;

    RETURN jsonb_strip_nulls(jsonb_build_object(
        'periodo', jsonb_build_object('desde', r.desde, 'hasta', r.hasta, 'dias', r.hasta - r.desde + 1, 'dias_pasados', least(greatest(v_hoy - r.desde + 1, 0), r.hasta - r.desde + 1)),
        'estado', v_estado, 'titulo', v_titulo,
        'bono', jsonb_build_object(
            'aplica', v_aplica, 'desde', v_bono_desde, 'importe', v_importe, 'consumo_max', v_max,
            'consumo', v_cons, 'consumo_fuente', v_fuente,
            'cumple_consumo', CASE WHEN v_cons IS NULL THEN NULL ELSE v_cons <= v_max END,
            'faltante_l', round(c.faltante, 1), 'sin_faltantes', CASE WHEN c.aprobados = 0 THEN NULL ELSE c.faltante <= 0 END,
            'cuidado_unidad', v_cuidado, 'limpieza', v_limpieza),
        'consumo', jsonb_build_object(
            'cierres', jsonb_build_object('l_100km', v_cons_c, 'km', round(c.km), 'aprobados', c.aprobados, 'pendientes', c.pendientes),
            'motor', jsonb_build_object('l_100km', v_cons_m, 'km', round(m.km), 'dias', m.dias,
                                        'ultimos_7_l_100km', CASE WHEN v7.km_l >= 100 THEN round(100 * v7.litros / v7.km_l, 1) END)),
        'ralenti', jsonb_build_object('mes', v_mes, 'litros', ral.l, 'horas', ral.h, 'pct_motor', ral.pct, 'permitido_l', v_ral_perm,
                                      'ritmo_fin_de_mes_l', v_ral_ritmo, 'quedan_l', greatest(v_ral_perm - ral.l, 0)),
        'estilo', jsonb_build_object('programador_pct', v_prog, 'programador_objetivo_pct', v_prog_obj,
                                     'exceso_velocidad_min_100km', v_vel, 'exceso_velocidad_min', round(s.vel),
                                     'frenadas_fuertes_s_100km', v_ff, 'rpm_altas_pct', v_rpm, 'velocidad_max', round(s.vmax),
                                     -- bien / regular / mejorar (los mismos cortes que los consejos)
                                     'niveles', jsonb_build_object(
                                         'programador', CASE WHEN v_prog IS NULL THEN NULL WHEN v_prog >= v_prog_obj THEN 'bien' WHEN v_prog >= v_prog_obj - 20 THEN 'regular' ELSE 'mejorar' END,
                                         'velocidad', CASE WHEN v_vel IS NULL THEN NULL WHEN v_vel <= 1 THEN 'bien' WHEN v_vel <= 3 THEN 'regular' ELSE 'mejorar' END,
                                         'rpm', CASE WHEN v_rpm IS NULL THEN NULL WHEN v_rpm <= 10 THEN 'bien' WHEN v_rpm <= 20 THEN 'regular' ELSE 'mejorar' END,
                                         'frenadas', CASE WHEN v_ff IS NULL THEN NULL WHEN v_ff <= 10 THEN 'bien' WHEN v_ff <= 25 THEN 'regular' ELSE 'mejorar' END,
                                         'ralenti', CASE WHEN ral.l > v_ral_perm THEN 'mejorar' WHEN v_ral_ritmo > v_ral_perm AND v_hoy - v_mes + 1 >= 5 THEN 'regular' ELSE 'bien' END,
                                         'consumo', CASE WHEN v_cons IS NULL THEN NULL WHEN v_cons <= v_max THEN 'bien' WHEN v_cons <= v_max + 1.5 THEN 'regular' ELSE 'mejorar' END)),
        'consejos', to_jsonb(v_consejos),
        'calculado_en', now()));
END $f$;
COMMENT ON FUNCTION tel.fn_manejo_chofer(bigint) IS
    'Migración 387: cómo viene un chofer con el bono por desempeño, el consumo (cierres y motor), el ralentí del mes y su estilo de manejo, con consejos. Interna.';
REVOKE ALL ON FUNCTION tel.fn_manejo_chofer(bigint) FROM PUBLIC;
DO $p$ DECLARE g text; BEGIN
    FOR g IN SELECT r.rolname FROM pg_roles r WHERE r.rolname LIKE 'tc\_%' OR r.rolname IN ('authenticated', 'anon') LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION tel.fn_manejo_chofer(bigint) FROM %I', g);
    END LOOP;
END $p$;

-- La del chofer: solo lo suyo
CREATE OR REPLACE FUNCTION tel.fn_mi_manejo()
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
BEGIN
    RETURN tel.fn_manejo_chofer(ops.fn_exigir_mi_chofer());
END $f$;
COMMENT ON FUNCTION tel.fn_mi_manejo() IS 'Migración 387: «Cómo voy manejando» del chofer que entra (bono, consumo, ralentí y estilo, con consejos).';

-- Permisos: como tel.fn_mis_pedidos_tablero (la lectura vecina del chofer)
DO $p$
DECLARE g text; f constant text := 'tel.fn_mi_manejo()';
BEGIN
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
    FOR g IN SELECT r.rolname FROM pg_roles r WHERE r.rolname LIKE 'tc\_%' OR r.rolname IN ('authenticated', 'anon') LOOP
        IF has_function_privilege(g, 'tel.fn_mis_pedidos_tablero()', 'EXECUTE') THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', f, g);
        ELSE
            EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', f, g);
        END IF;
    END LOOP;
END $p$;

-- Prueba: la cuenta anda para todos los choferes (sin cambiar nada)
DO $t$
DECLARE x record; v jsonb; n integer := 0;
BEGIN
    FOR x IN SELECT ch.id FROM mae.chofer ch WHERE ch.eliminado_en IS NULL ORDER BY ch.id LIMIT 60 LOOP
        v := tel.fn_manejo_chofer(x.id);
        IF v ->> 'estado' IS NULL OR v ->> 'titulo' IS NULL THEN RAISE EXCEPTION 'chofer %: respuesta incompleta', x.id; END IF;
        n := n + 1;
    END LOOP;
    -- Un chofer de prueba que maneja mal (datos ZZ que se deshacen): tiene que dar consejos
    SELECT ch.id INTO x FROM mae.chofer ch WHERE ch.eliminado_en IS NULL ORDER BY ch.id LIMIT 1;
    IF FOUND AND EXISTS (SELECT 1 FROM mae.camion) THEN
        BEGIN
            DELETE FROM tel.conduccion_diaria WHERE chofer_id = x.id AND fecha >= mae.fn_hoy() - 40;
            INSERT INTO tel.conduccion_diaria (camion_id, chofer_id, fecha, km, litros, horas_motor, movimiento_h, ralenti_h, ralenti_l,
                                               programador_km, sobre_velocidad_min, rpm_alta_min, frenada_fuerte_s, velocidad_max, acumulados, lecturas)
            SELECT (SELECT id FROM mae.camion ORDER BY id LIMIT 1), x.id, mae.fn_hoy(), 600, 260, 12, 8, 4, 45, 100, 30, 120, 200, 110, true, 1;
            v := tel.fn_manejo_chofer(x.id);
            IF (v #>> '{consumo,motor,l_100km}')::numeric <> 43.3 THEN RAISE EXCEPTION 'consumo del motor mal: %', v #>> '{consumo,motor,l_100km}'; END IF;
            IF jsonb_array_length(v -> 'consejos') < 4 THEN RAISE EXCEPTION 'faltan consejos: %', v -> 'consejos'; END IF;
            IF (v #>> '{bono,aplica}')::boolean AND v ->> 'estado' NOT IN ('lejos', 'faltante') THEN RAISE EXCEPTION 'estado mal: %', v ->> 'estado'; END IF;
            RAISE EXCEPTION 'deshacer' USING ERRCODE = 'ZZ387';
        EXCEPTION WHEN SQLSTATE 'ZZ387' THEN NULL;
        END;
    END IF;
EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'La migración 387 no pasó su prueba (%). No se aplicó nada: avisar antes de seguir.', SQLERRM;
END $t$;

COMMIT;

NOTIFY pgrst, 'reload schema';

SELECT 'migración 387 aplicada' AS que,
       count(*) FILTER (WHERE v ->> 'estado' = 'en_camino') AS choferes_en_camino_al_bono,
       count(*) FILTER (WHERE v ->> 'estado' IN ('cerca', 'lejos')) AS choferes_por_encima_del_consumo,
       count(*) FILTER (WHERE v ->> 'estado' = 'faltante') AS choferes_con_faltante,
       count(*) FILTER (WHERE v ->> 'estado' IN ('sin_datos', 'no_aplica')) AS choferes_sin_datos_o_sin_bono_aun
  FROM (SELECT tel.fn_manejo_chofer(ch.id) AS v FROM mae.chofer ch
         WHERE ch.eliminado_en IS NULL AND (ch.fecha_egreso IS NULL OR ch.fecha_egreso >= mae.fn_hoy())) z;
