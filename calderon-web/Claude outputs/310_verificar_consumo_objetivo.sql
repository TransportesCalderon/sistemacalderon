-- =============================================================================
-- IronTrack — Verificación 310 · Cambio 259 (migración 266) · Consumo objetivo único
-- -----------------------------------------------------------------------------
-- Correr DESPUÉS de la migración 266. NO GUARDA NADA y no crea datos: recalcula el objetivo
-- de todos los viajes y de todos los cierres con la regla escrita aparte (como estaba antes)
-- y lo compara con lo que dan Seguimiento y el cierre. Termina con un error a propósito
-- («VERIFICACIÓN 310 OK …»). Si termina con otro error, copiarlo y mandarlo.
-- =============================================================================
DO $do$
DECLARE
    v_vacio numeric := ref.fn_parametro_num('fue.consumo_objetivo_vacio_l_100km', 26);
    v_cont numeric := ref.fn_parametro_num('fue.consumo_objetivo_contenedor_vacio_l_100km', 28);
    r record; v_mal text; v_n int; v_viajes int := 0; v_con int := 0; v_cierres int := 0; v_tramos int := 0; v_ok text[] := '{}';
    v_s bigint; v_l bigint; v_obj numeric;
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 266 THEN
        RAISE EXCEPTION 'Falta aplicar la migración 266';
    END IF;

    -- 1 · La regla, caso por caso
    IF fue.fn_objetivo_tramo(NULL, NULL) IS DISTINCT FROM v_vacio
       OR fue.fn_objetivo_tramo(NULL, (SELECT id FROM mae.linea ORDER BY id LIMIT 1)) IS DISTINCT FROM v_vacio THEN
        RAISE EXCEPTION 'FALLA 1: un tramo sin operación tiene que dar el objetivo de vacío (%)', v_vacio;
    END IF;
    SELECT s.id, s.linea_id INTO v_s, v_l FROM ops.servicio_comercial s WHERE s.contenedor_vacio ORDER BY s.id DESC LIMIT 1;
    IF v_s IS NOT NULL AND fue.fn_objetivo_tramo(v_s, v_l) IS DISTINCT FROM v_cont THEN
        RAISE EXCEPTION 'FALLA 1: una operación con contenedor vacío tiene que dar % y dio %', v_cont, fue.fn_objetivo_tramo(v_s, v_l);
    END IF;
    SELECT s.id, s.linea_id, l.consumo_objetivo_l_100km INTO v_s, v_l, v_obj
      FROM ops.servicio_comercial s JOIN mae.linea l ON l.id = s.linea_id
     WHERE NOT coalesce(s.contenedor_vacio, false) AND l.consumo_objetivo_l_100km IS NOT NULL ORDER BY s.id DESC LIMIT 1;
    IF v_s IS NOT NULL AND fue.fn_objetivo_tramo(v_s, v_l) IS DISTINCT FROM v_obj THEN
        RAISE EXCEPTION 'FALLA 1: una operación cargada tiene que dar el objetivo de su línea (%) y dio %', v_obj, fue.fn_objetivo_tramo(v_s, v_l);
    END IF;
    v_ok := v_ok || format('1 la regla: vacío %s, contenedor vacío %s, cargado el de la línea', v_vacio, v_cont);

    -- 2 · Seguimiento: todos los viajes, contra la regla escrita aparte
    SELECT count(*), count(*) FILTER (WHERE q.esperado IS NOT NULL),
           count(*) FILTER (WHERE q.esperado IS DISTINCT FROM q.dio),
           string_agg(q.numero || ': esperado ' || coalesce(q.esperado::text, 'nada') || ', dio ' || coalesce(q.dio::text, 'nada'), ' | ')
               FILTER (WHERE q.esperado IS DISTINCT FROM q.dio)
      INTO v_viajes, v_con, v_n, v_mal
      FROM (SELECT v.numero, tel.fn_objetivo_viaje(v.id) AS dio,
                   (SELECT round(sum(x.km * x.obj) / nullif(sum(x.km), 0), 2)
                      FROM (SELECT coalesce(i.km, l.distancia_km) AS km,
                                   CASE WHEN i.servicio_id IS NULL THEN v_vacio WHEN s.contenedor_vacio THEN v_cont ELSE l.consumo_objetivo_l_100km END AS obj
                              FROM ops.viaje_chofer_item i
                              LEFT JOIN mae.linea l ON l.id = i.linea_id
                              LEFT JOIN ops.servicio_comercial s ON s.id = i.servicio_id
                             WHERE i.viaje_id = v.id AND i.eliminado_en IS NULL) x
                     WHERE x.km > 0 AND x.obj IS NOT NULL) AS esperado
              FROM ops.viaje_chofer v WHERE v.eliminado_en IS NULL) q;
    IF v_n > 0 THEN RAISE EXCEPTION 'FALLA 2: el objetivo de Seguimiento no coincide en % viaje(s): %', v_n, left(v_mal, 1200); END IF;
    v_ok := v_ok || format('2 Seguimiento igual en %s viajes (%s con objetivo)', v_viajes, v_con);

    -- 3 · Cierre y acta: cada tramo de cada cierre, contra la regla escrita aparte
    v_mal := NULL;
    FOR r IN SELECT c.id, fue.fn_objetivo_cierre(c.id, 1000) AS o FROM fue.cierre_viaje c WHERE c.eliminado_en IS NULL LOOP
        v_cierres := v_cierres + 1;
        SELECT count(*), string_agg(coalesce(t ->> 'linea', 'sin línea') || ' dio ' || coalesce(t ->> 'objetivo_l_100km', 'nada'), ', ')
                   FILTER (WHERE (t ->> 'objetivo_l_100km')::numeric IS DISTINCT FROM
                                 CASE WHEN (t ->> 'vacio')::boolean THEN v_vacio WHEN (t ->> 'contenedor_vacio')::boolean THEN v_cont
                                      ELSE (SELECT l.consumo_objetivo_l_100km FROM mae.linea l WHERE l.codigo = t ->> 'linea' ORDER BY l.eliminado_en NULLS FIRST, l.id DESC LIMIT 1) END)
          INTO v_n, v_mal FROM jsonb_array_elements(r.o -> 'tramos') t;
        v_tramos := v_tramos + v_n;
        IF v_mal IS NOT NULL THEN RAISE EXCEPTION 'FALLA 3: en el cierre % hay tramos con otro objetivo: %', r.id, v_mal; END IF;
        IF (r.o ->> 'vacio_l_100km')::numeric IS DISTINCT FROM v_vacio OR (r.o ->> 'contenedor_vacio_l_100km')::numeric IS DISTINCT FROM v_cont THEN
            RAISE EXCEPTION 'FALLA 3: el cierre % no informa los parámetros de vacío', r.id;
        END IF;
    END LOOP;
    v_ok := v_ok || format('3 cierre y acta iguales en %s cierres (%s tramos)', v_cierres, v_tramos);

    -- 4 · La regla no quedó escrita en otro lado
    IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                WHERE (n.nspname, p.proname) IN (('tel', 'fn_objetivo_viaje'), ('fue', 'fn_objetivo_cierre'))
                  AND (p.prosrc NOT LIKE '%fue.fn_objetivo_tramo(%' OR p.prosrc LIKE '%l.consumo_objetivo_l_100km%')) THEN
        RAISE EXCEPTION 'FALLA 4: Seguimiento o el cierre todavía tienen la regla escrita adentro';
    END IF;
    v_ok := v_ok || '4 Seguimiento y el cierre llaman a la función única'::text;

    RAISE EXCEPTION 'VERIFICACIÓN 310 OK (no se guardó nada): %', array_to_string(v_ok, ' · ');
END $do$;
