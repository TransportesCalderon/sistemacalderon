-- =====================================================================================
-- Migración 309 · ¿Cuánto cargar para llegar? (Seguimiento de viajes e Iris)
-- =====================================================================================
-- Pedido (26/11/2026): «si el camión está en Los Andes, tiene que descargar en un cliente de Santiago, después ir a
-- San Antonio a retirar el contenedor y llegar a la estación de Lo Espejo, y tiene Y litros: ¿cuántos litros más
-- necesita para llegar bien?». Dos opciones: la justa y la recomendada, con litros de más para no rabear ni quedar
-- tirado si se desvía.
--   · fue.fn_litros_para_recorrido(camión, desde, paradas, litros): el cálculo.
--       - Sale desde donde está el camión (última posición del GPS, no más vieja que fue.orden_camino_gps_horas = 12)
--         o desde un lugar. Pasa por las paradas en orden; cada una dice si el tramo que llega a ella va cargado o vacío.
--       - Km de cada tramo: los de los viajes hechos en esa ruta (mediana) o los de la línea; si no hay, el mapa
--         (queda guardado). Desde la posición del GPS: el mapa (guardado 6 horas, como en la orden de carga).
--       - Consumo de cada tramo: el promedio medido de los camiones en esa ruta, cargado o vacío (fue.fn_consumo_esperado:
--         este camión → su marca → todos los camiones → este camión en general → su marca). Si no hay, el del camión
--         (fue.fn_rendimiento_camion) o el consumo por defecto de la orden (35 L/100 km).
--       - Litros que tiene: los que se escriben o los del sistema (fue.fn_combustible_actual: tanques y mochila).
--       - Justo = lo que gasta el recorrido − lo que tiene (llega sin reserva).
--         Recomendado = lo justo + la reserva de «Solicitar carga» (fue.reserva_pedido_l = 100 L).
--         Si no entra (más que el lleno), lo dice: hay que cargar en el camino.
--   · tel.fn_cuanto_cargar(camión, datos): para la tarjeta del viaje en Seguimiento (la usan quienes ven Seguimiento).
--   · Iris: lectura «cuanto_cargar» (patente, desde, paradas por nombre, litros); ia.fn_lugar_por_nombre encuentra
--     el lugar por su nombre, código o el nombre de la estación, y si hay varios parecidos pide cuál.
-- No cambia datos. Va después de la 308 (cotizador). web.version_base = 309.
-- =====================================================================================
BEGIN;

DO $v$
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 308 THEN
        RAISE EXCEPTION 'Primero hay que aplicar la migración 308 (20261124240000_cotizador_como_las_presentaciones.sql). La base está en la %',
            coalesce((SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base'), '?');
    END IF;
    IF to_regprocedure('tel.fn_cuanto_cargar(bigint, jsonb)') IS NOT NULL THEN
        RAISE EXCEPTION 'La migración 309 ya está aplicada';
    END IF;
    IF to_regprocedure('fue.fn_consumo_esperado(bigint, bigint, bigint, boolean, bigint)') IS NULL
       OR to_regprocedure('fue.fn_km_ruta(bigint, bigint)') IS NULL
       OR to_regprocedure('fue.fn_combustible_actual(bigint)') IS NULL
       OR to_regprocedure('fue.fn_rendimiento_camion(bigint)') IS NULL
       OR to_regclass('fue.km_estacion_cache') IS NULL THEN
        RAISE EXCEPTION 'Falta el consumo por ruta o el camino hasta la estación (migraciones 223 y 291)';
    END IF;
    IF to_regprocedure('tel.fn_preparar_pedido_carga(bigint, bigint)') IS NULL THEN
        RAISE EXCEPTION 'Falta «Solicitar carga» en Seguimiento (migración 195)';
    END IF;
    IF to_regprocedure('ia.fn_lectura_tipo_cambio(jsonb)') IS NULL OR to_regclass('ia.asistente_herramienta') IS NULL THEN
        RAISE EXCEPTION 'Falta Iris 09 (20261116220000_iris_09_tipo_de_cambio.sql)';
    END IF;
END $v$;

-- Copia los permisos de ejecución de una función a otra: solo roles tc_* (nunca tc_cliente) y authenticated (como la 297)
CREATE FUNCTION pg_temp.fn_copiar_permisos(p_de regprocedure, p_a regprocedure)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE g text;
BEGIN
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', p_a);
    FOR g IN SELECT r.rolname FROM pg_roles r
              WHERE (r.rolname LIKE 'tc\_%' AND r.rolname <> 'tc_cliente') OR r.rolname = 'authenticated' LOOP
        IF has_function_privilege(g, p_de, 'EXECUTE') THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', p_a, g);
        END IF;
    END LOOP;
END $fn$;

-- Funciones internas: solo las usan otras funciones de la base
CREATE FUNCTION pg_temp.fn_solo_interna(p_fn regprocedure)
RETURNS void LANGUAGE plpgsql AS $fn$
DECLARE g text;
BEGIN
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', p_fn);
    FOR g IN SELECT r.rolname FROM pg_roles r WHERE r.rolname LIKE 'tc\_%' OR r.rolname IN ('authenticated', 'anon') LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', p_fn, g);
    END LOOP;
END $fn$;

-- ---------------------------------------------------------------------------------
-- 1 · Km desde donde está el camión hasta un lugar (mapa, guardado 6 horas; si no, línea recta × factor)
-- ---------------------------------------------------------------------------------
CREATE FUNCTION fue.fn_km_desde_gps(p_lat numeric, p_lng numeric, p_lugar bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE u mae.ubicacion%ROWTYPE; v_recta numeric; v_clave text; v_km numeric; o record;
BEGIN
    SELECT * INTO u FROM mae.ubicacion WHERE id = p_lugar;
    IF u.geom IS NULL THEN
        RETURN jsonb_build_object('km', NULL, 'falta', format('%s no tiene la ubicación en el mapa: cargala en Configuración › Lugares', u.nombre));
    END IF;
    v_recta := round((extensions.ST_Distance(extensions.ST_SetSRID(extensions.ST_MakePoint(p_lng, p_lat), 4326)::extensions.geography, u.geom) / 1000)::numeric, 1);
    IF v_recta < 2 THEN RETURN jsonb_build_object('km', 0, 'fuente', 'ya_esta'); END IF;
    -- Una ubicación mal cargada (por ejemplo, con el signo cambiado) da distancias imposibles
    IF v_recta > 4000 THEN
        RETURN jsonb_build_object('km', NULL,
            'falta', format('%s tiene mal la ubicación en el mapa (queda a %s km del camión): corregila en Configuración › Lugares', u.nombre, tel.fn_num_ar(v_recta)));
    END IF;
    v_clave := 'u' || p_lugar || '|' || round(p_lat, 2) || '|' || round(p_lng, 2);
    SELECT k.km INTO v_km FROM fue.km_estacion_cache k WHERE k.clave = v_clave AND k.creado_en > now() - interval '6 hours';
    IF v_km IS NULL AND coalesce((SELECT valor #>> '{}' FROM ref.parametro WHERE codigo = 'fue.orden_camino_osrm' AND eliminado_en IS NULL), 'true') = 'true' THEN
        BEGIN
            SELECT * INTO o FROM tel.fn_osrm_camino(jsonb_build_array(jsonb_build_object('lat', p_lat, 'lng', p_lng),
                                                                      jsonb_build_object('lat', u.latitud, 'lng', u.longitud)));
            -- Fuera de 0,9 a 2,5 veces la línea recta, no se le cree al servicio de mapas (como en la orden de carga)
            IF o.error IS NULL AND o.km BETWEEN v_recta * 0.9 AND v_recta * 2.5 THEN v_km := round(o.km); END IF;
        EXCEPTION WHEN OTHERS THEN v_km := NULL;
        END;
        IF v_km IS NOT NULL THEN
            INSERT INTO fue.km_estacion_cache (clave, km, metodo) VALUES (v_clave, v_km, 'mapa')
            ON CONFLICT (clave) DO UPDATE SET km = EXCLUDED.km, metodo = EXCLUDED.metodo, creado_en = now();
        END IF;
    END IF;
    IF v_km IS NULL THEN
        RETURN jsonb_build_object('km', round(v_recta * ref.fn_parametro_num('fue.orden_factor_camino', 1.3)), 'fuente', 'recta',
            'aviso', format('Los km hasta %s son estimados en línea recta (el mapa no respondió)', u.nombre));
    END IF;
    RETURN jsonb_build_object('km', v_km, 'fuente', 'mapa');
END $f$;

-- ---------------------------------------------------------------------------------
-- 2 · El cálculo: cuánto gasta el recorrido y cuánto cargar (justo y recomendado)
--     p_paradas: [{lugar_id, con_carga}] en orden; con_carga = el tramo que llega a esa parada va cargado (por defecto, sí)
-- ---------------------------------------------------------------------------------
CREATE FUNCTION fue.fn_litros_para_recorrido(p_camion bigint, p_desde bigint, p_paradas jsonb, p_litros numeric DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE
    c mae.camion%ROWTYPE;
    v_reserva numeric := ref.fn_parametro_num('fue.reserva_pedido_l', 100);
    v_defecto numeric := ref.fn_parametro_num('fue.orden_carga_consumo_defecto_l_100km', 35);
    v_gps_horas integer := greatest(1, coalesce(ref.fn_parametro_num('fue.orden_camino_gps_horas', 12), 12))::integer;
    v_lat numeric; v_lng numeric; v_ts timestamptz; v_punto extensions.geography;
    v_cerca_id bigint; v_cerca_nombre text; v_cerca_km numeric;
    v_ant bigint; v_ant_nombre text; v_desde_txt text;
    x jsonb; i integer := 0; v_lugar bigint; v_nombre text; v_carga boolean;
    v_km numeric; v_fkm text; e jsonb; v_l100 numeric; v_fcons text; v_l numeric; k jsonb;
    v_tramos jsonb := '[]'; v_tot numeric := 0; v_kmt numeric := 0; v_falta text; v_avisos jsonb := '[]'; v_ruta_ok boolean := true;
    ca jsonb; v_act numeric; v_cap numeric; v_justo numeric; v_rec numeric; v_entra numeric; v_txt text; v_lleno numeric;
BEGIN
    SELECT * INTO c FROM mae.camion WHERE id = p_camion AND eliminado_en IS NULL;
    IF c.id IS NULL THEN RAISE EXCEPTION 'El camión no existe' USING ERRCODE = 'P0002'; END IF;
    IF jsonb_typeof(p_paradas) IS DISTINCT FROM 'array' OR jsonb_array_length(p_paradas) = 0 THEN
        RAISE EXCEPTION 'Agregá a dónde tiene que llegar' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(p_paradas) > 10 THEN RAISE EXCEPTION 'Hasta 10 paradas' USING ERRCODE = '22023'; END IF;
    IF p_litros IS NOT NULL AND (p_litros < 0 OR p_litros > 5000) THEN
        RAISE EXCEPTION 'Los litros que tiene van de 0 a 5.000' USING ERRCODE = '22023';
    END IF;

    -- De dónde sale: un lugar, o donde está ahora según el GPS
    IF p_desde IS NOT NULL THEN
        SELECT id, nombre INTO v_ant, v_ant_nombre FROM mae.ubicacion WHERE id = p_desde AND eliminado_en IS NULL;
        IF v_ant IS NULL THEN RAISE EXCEPTION 'El lugar de salida no existe' USING ERRCODE = '22023'; END IF;
        v_desde_txt := v_ant_nombre;
    ELSE
        SELECT l.latitud, l.longitud, l.ts INTO v_lat, v_lng, v_ts FROM tel.lectura l
         WHERE l.camion_id = p_camion AND l.latitud IS NOT NULL AND l.longitud IS NOT NULL AND l.ts > now() - interval '3 days'
         ORDER BY l.ts DESC LIMIT 1;
        IF v_ts IS NULL OR v_ts < now() - make_interval(hours => v_gps_horas) THEN
            RAISE EXCEPTION 'El % no tiene posición del GPS de las últimas % horas: elegí desde dónde sale', c.patente, v_gps_horas
                USING ERRCODE = '22023';
        END IF;
        v_punto := extensions.ST_SetSRID(extensions.ST_MakePoint(v_lng, v_lat), 4326)::extensions.geography;
        -- Un lugar conocido cerca (hasta 30 km) para buscar el consumo medido de esa ruta: primero uno con tramos medidos
        -- hasta la primera parada, después el más cercano
        SELECT u.id, u.nombre, round((extensions.ST_Distance(u.geom, v_punto) / 1000)::numeric, 1)
          INTO v_cerca_id, v_cerca_nombre, v_cerca_km
          FROM mae.ubicacion u
         WHERE u.eliminado_en IS NULL AND u.geom IS NOT NULL AND extensions.ST_DWithin(u.geom, v_punto, 30000)
         ORDER BY EXISTS (SELECT 1 FROM fue.consumo_tramo t
                           WHERE t.valido AND t.origen_id = u.id AND t.fin > now() - interval '400 days'
                             AND t.destino_id::text = (p_paradas -> 0 ->> 'lugar_id')) DESC,
                  extensions.ST_Distance(u.geom, v_punto)
         LIMIT 1;
        v_ant := v_cerca_id;
        v_desde_txt := 'Donde está ahora' || CASE WHEN v_cerca_id IS NULL THEN ''
                                                  WHEN v_cerca_km < 2 THEN format(' (en %s)', v_cerca_nombre)
                                                  ELSE format(' (a %s km de %s)', tel.fn_num_ar(v_cerca_km), v_cerca_nombre) END;
        v_ant_nombre := v_desde_txt;
    END IF;

    FOR x IN SELECT * FROM jsonb_array_elements(p_paradas) LOOP
        i := i + 1;
        v_lugar := CASE WHEN (x ->> 'lugar_id') ~ '^\d+$' THEN (x ->> 'lugar_id')::bigint END;
        v_nombre := NULL;
        SELECT nombre INTO v_nombre FROM mae.ubicacion WHERE id = v_lugar AND eliminado_en IS NULL;
        IF v_nombre IS NULL THEN RAISE EXCEPTION 'Elegí el lugar de la parada %', i USING ERRCODE = '22023'; END IF;
        v_carga := CASE WHEN jsonb_typeof(x -> 'con_carga') = 'boolean' THEN (x ->> 'con_carga')::boolean ELSE true END;
        IF v_lugar = v_ant AND (i > 1 OR p_desde IS NOT NULL) THEN
            RAISE EXCEPTION 'La parada % es el mismo lugar que el anterior', i USING ERRCODE = '22023';
        END IF;

        -- Km del tramo
        k := NULL; v_km := NULL; v_fkm := NULL;
        IF i = 1 AND p_desde IS NULL THEN
            k := fue.fn_km_desde_gps(v_lat, v_lng, v_lugar);
            v_km := (k ->> 'km')::numeric; v_fkm := k ->> 'fuente';
        ELSE
            v_km := fue.fn_km_ruta(v_ant, v_lugar);
            IF v_km IS NOT NULL THEN
                v_fkm := CASE WHEN EXISTS (SELECT 1 FROM fue.consumo_tramo t WHERE t.origen_id = v_ant AND t.destino_id = v_lugar AND t.km >= 30
                                              AND t.fin > now() - interval '400 days') THEN 'viajes' ELSE 'ruta' END;
            ELSE
                k := ven.fn_km_lugares(v_ant, v_lugar, true, true);
                v_km := (k ->> 'km')::numeric; v_fkm := k ->> 'fuente';
            END IF;
        END IF;

        -- Consumo del tramo: el medido en esa ruta (cargado o vacío); si no, el del camión; si no, el de la orden
        e := fue.fn_consumo_esperado(p_camion, v_ant, v_lugar, v_carga);
        v_l100 := (e ->> 'l_100km')::numeric; v_fcons := e ->> 'texto';
        IF v_l100 IS NULL THEN
            v_l100 := fue.fn_rendimiento_camion(p_camion);
            v_fcons := 'el consumo de este camión (tablero, cierres o ficha)';
        END IF;
        IF v_l100 IS NULL THEN
            v_l100 := v_defecto; v_fcons := 'el consumo por defecto (no hay datos de este camión)';
        END IF;
        v_l := CASE WHEN v_km IS NOT NULL THEN round(v_km * v_l100 / 100) END;
        IF v_l IS NULL THEN
            v_ruta_ok := false;
            v_falta := coalesce(v_falta, k ->> 'falta', format('No se pudieron calcular los km de %s a %s', v_ant_nombre, v_nombre));
        END IF;
        IF k ->> 'aviso' IS NOT NULL THEN v_avisos := v_avisos || to_jsonb(k ->> 'aviso'); END IF;

        v_tramos := v_tramos || jsonb_build_object(
            'n', i, 'desde', v_ant_nombre, 'desde_id', CASE WHEN i = 1 AND p_desde IS NULL THEN NULL ELSE v_ant END,
            'hasta', v_nombre, 'hasta_id', v_lugar, 'con_carga', v_carga,
            'km', v_km, 'fuente_km', v_fkm, 'l_100km', v_l100, 'consumo_de', v_fcons, 'litros', v_l, 'falta', k ->> 'falta');
        v_tot := v_tot + coalesce(v_l, 0);
        v_kmt := v_kmt + coalesce(v_km, 0);
        v_ant := v_lugar; v_ant_nombre := v_nombre;
    END LOOP;

    -- Lo que tiene y lo que entra
    ca := fue.fn_combustible_actual(p_camion);
    v_act := coalesce(p_litros, (ca ->> 'litros')::numeric);
    v_cap := coalesce((ca ->> 'capacidad_l')::numeric, (fue.fn_capacidad_camion(p_camion, now()) ->> 'total_l')::numeric);
    IF v_act IS NULL THEN
        v_falta := coalesce(v_falta, 'No se sabe cuántos litros tiene ahora' || coalesce(' (' || (ca ->> 'motivo') || ')', '') || ': escribilos');
    END IF;

    IF v_falta IS NULL THEN
        v_justo := greatest(0, ceil(v_tot - v_act));
        v_rec := greatest(0, ceil(v_tot + v_reserva - v_act));
        v_entra := CASE WHEN v_cap IS NOT NULL THEN greatest(0, floor(v_cap - v_act)) END;
        v_txt := format('%s: de %s a %s, %s km. Gasta ≈ %s L y tiene %s L.', c.patente,
                        CASE WHEN p_desde IS NULL THEN 'd' || substr(v_desde_txt, 2) ELSE v_desde_txt END, v_nombre,
                        tel.fn_num_ar(v_kmt), tel.fn_num_ar(v_tot), tel.fn_num_ar(v_act))
              || CASE WHEN v_rec = 0 THEN format(' No hace falta cargar: llega con %s L.', tel.fn_num_ar(v_act - v_tot))
                      WHEN v_justo = 0 THEN format(' Le alcanza justo: llega con %s L. Recomendado: cargar %s L para llegar con %s L de reserva.',
                                                   tel.fn_num_ar(v_act - v_tot), tel.fn_num_ar(v_rec), tel.fn_num_ar(v_reserva))
                      ELSE format(' Justo: cargar %s L (llega sin reserva). Recomendado: cargar %s L (llega con %s L de reserva).',
                                  tel.fn_num_ar(v_justo), tel.fn_num_ar(v_rec), tel.fn_num_ar(v_reserva)) END;
        IF v_entra IS NOT NULL AND v_rec > v_entra THEN
            v_lleno := v_act + v_entra - v_tot;
            v_txt := v_txt || format(' Ojo: hasta llenar entran %s L.', tel.fn_num_ar(v_entra))
                  || CASE WHEN v_lleno >= 0 THEN format(' Con el tanque lleno llega con %s L: menos que la reserva.', tel.fn_num_ar(v_lleno))
                          ELSE format(' Con el tanque lleno le faltan %s L: tiene que cargar en el camino.', tel.fn_num_ar(-v_lleno)) END;
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'camion_id', p_camion, 'patente', c.patente,
        'desde', v_desde_txt, 'desde_gps', p_desde IS NULL, 'gps_en', v_ts,
        'tramos', v_tramos, 'km', v_kmt, 'litros_necesarios', CASE WHEN v_ruta_ok THEN v_tot END,
        'litros_actuales', v_act, 'litros_a_mano', p_litros IS NOT NULL,
        'litros_sistema', (ca ->> 'litros')::numeric, 'litros_sistema_motivo', ca ->> 'motivo', 'litros_sistema_aviso', ca ->> 'aviso',
        'capacidad_l', v_cap, 'reserva_l', v_reserva,
        'justo_l', v_justo, 'recomendado_l', v_rec, 'entra_l', v_entra,
        'llega_justo_l', v_act + v_justo - v_tot, 'llega_recomendado_l', v_act + v_rec - v_tot,
        'no_entra', coalesce(v_rec > v_entra, false),
        'falta', v_falta, 'avisos', v_avisos, 'texto', v_txt);
END $f$;

-- ---------------------------------------------------------------------------------
-- 3 · Seguimiento de viajes: la tarjeta del viaje (la usan quienes ven Seguimiento)
--     p_datos: {desde_id (vacío = donde está ahora), paradas: [{lugar_id, con_carga}], litros (vacío = los del sistema)}
-- ---------------------------------------------------------------------------------
CREATE FUNCTION tel.fn_cuanto_cargar(p_camion bigint, p_datos jsonb DEFAULT '{}')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE d jsonb := coalesce(p_datos, '{}'); v_usr bigint := aud.fn_usuario_actual(); v_lit numeric;
BEGIN
    IF v_usr IS NULL OR NOT EXISTS (SELECT 1 FROM seg.usuario_rol WHERE usuario_id = v_usr
           AND rol_codigo IN ('gerencia', 'operaciones', 'base_mendoza', 'adm_combustible', 'analista_control', 'ti', 'auditor',
                              'mantenimiento_jefe', 'mecanico')) THEN
        RAISE EXCEPTION 'Esto lo usan quienes ven Seguimiento de viajes' USING ERRCODE = '42501';
    END IF;
    IF nullif(d ->> 'litros', '') IS NOT NULL THEN
        IF (d ->> 'litros') !~ '^\d+(\.\d+)?$' THEN RAISE EXCEPTION 'Los litros que tiene van de 0 a 5.000' USING ERRCODE = '22023'; END IF;
        v_lit := (d ->> 'litros')::numeric;
    END IF;
    RETURN fue.fn_litros_para_recorrido(p_camion,
        CASE WHEN (d ->> 'desde_id') ~ '^\d+$' THEN (d ->> 'desde_id')::bigint END,
        coalesce(d -> 'paradas', '[]'), v_lit);
END $f$;

-- ---------------------------------------------------------------------------------
-- 4 · Iris: el lugar por su nombre, y la lectura «cuanto_cargar»
-- ---------------------------------------------------------------------------------
-- El lugar que más se parece a lo que escribió la persona (nombre, código o nombre de la estación).
-- Si hay varios igual de parecidos o ninguno, avisa con los nombres para que Iris pregunte.
CREATE FUNCTION ia.fn_lugar_por_nombre(p_texto text)
RETURNS bigint
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_n text := seg.fn_normalizar_busqueda(p_texto); v_ops jsonb;
BEGIN
    IF length(v_n) < 2 THEN RAISE EXCEPTION 'Falta el nombre del lugar' USING ERRCODE = '22023'; END IF;
    WITH cand AS (
        SELECT u.id, u.nombre || coalesce(' (' || u.pais || ')', '') AS nombre, seg.fn_normalizar_busqueda(u.nombre) AS bruto,
               seg.fn_normalizar_busqueda(t.n) AS n
          FROM mae.ubicacion u CROSS JOIN LATERAL (VALUES (u.nombre), (u.codigo)) t(n)
         WHERE u.eliminado_en IS NULL AND t.n IS NOT NULL
        UNION ALL
        SELECT u.id, u.nombre || coalesce(' (' || u.pais || ')', ''), seg.fn_normalizar_busqueda(u.nombre), seg.fn_normalizar_busqueda(e.nombre)
          FROM mae.estacion_servicio e JOIN mae.ubicacion u ON u.id = e.ubicacion_id
         WHERE e.eliminado_en IS NULL AND u.eliminado_en IS NULL
    ), punt AS (
        -- s: cuánto se parece el nombre del lugar (desempata, por ejemplo, entre un nombre y el código de otro lugar)
        SELECT c.id, c.nombre, round(extensions.similarity(min(c.bruto), v_n)::numeric, 2) AS s,
               -- igual 100; empieza igual 80 a 90 y lo contiene 70 a 80 (más, cuanto más del nombre cubre); el nombre está
               -- dentro de lo escrito 60 a 70; si no, el parecido por trigramas (hasta 70)
               max(CASE WHEN c.n = '' THEN 0
                        WHEN c.n = v_n THEN 100
                        WHEN c.n LIKE v_n || '%' THEN 80 + round(10.0 * length(v_n) / length(c.n))
                        WHEN c.n LIKE '%' || v_n || '%' THEN 70 + round(10.0 * length(v_n) / length(c.n))
                        WHEN length(c.n) >= 5 AND v_n LIKE '%' || c.n || '%' THEN 60 + round(10.0 * length(c.n) / length(v_n))
                        ELSE round((extensions.similarity(c.n, v_n) * 70)::numeric) END) AS p
          FROM cand c GROUP BY c.id, c.nombre
    )
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', x.id, 'nombre', x.nombre, 'p', x.p, 's', x.s) ORDER BY x.p DESC, x.s DESC, length(x.nombre), x.nombre), '[]')
      INTO v_ops
      FROM (SELECT * FROM punt WHERE p >= 15 ORDER BY p DESC, s DESC, length(nombre), nombre LIMIT 5) x;
    IF jsonb_array_length(v_ops) = 0 OR (v_ops -> 0 ->> 'p')::int < 30 THEN
        RAISE EXCEPTION 'No encuentro el lugar «%»%', p_texto,
            coalesce('. Parecidos: ' || (SELECT string_agg(o ->> 'nombre', ', ') FROM jsonb_array_elements(v_ops) o), '')
            USING ERRCODE = 'P0002';
    END IF;
    IF jsonb_array_length(v_ops) > 1 AND (v_ops -> 1 ->> 'p')::int = (v_ops -> 0 ->> 'p')::int
       AND (v_ops -> 1 ->> 's')::numeric = (v_ops -> 0 ->> 's')::numeric THEN
        RAISE EXCEPTION 'Hay varios lugares parecidos a «%»: %. Preguntá cuál', p_texto,
            (SELECT string_agg(o ->> 'nombre', ', ') FROM jsonb_array_elements(v_ops) o
              WHERE (o ->> 'p')::int = (v_ops -> 0 ->> 'p')::int AND (o ->> 's')::numeric = (v_ops -> 0 ->> 's')::numeric)
            USING ERRCODE = '22023';
    END IF;
    RETURN (v_ops -> 0 ->> 'id')::bigint;
END $f$;

-- Lectura de Iris: patente, desde (vacío = donde está), paradas [{lugar, cargado}] y litros que tiene (si los dijo)
CREATE FUNCTION ia.fn_lectura_cuanto_cargar(p_entrada jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE
    e jsonb := coalesce(p_entrada, '{}');
    v_pat text := upper(regexp_replace(coalesce(e ->> 'patente', ''), '[^A-Za-z0-9]', '', 'g'));
    v_cam bigint; v_desde bigint; v_par jsonb := '[]'; x jsonb; v_lugar text;
BEGIN
    IF NOT ia.fn_puede_asistente() THEN RAISE EXCEPTION 'Iris es para Gerencia' USING ERRCODE = '42501'; END IF;
    IF v_pat = '' THEN RAISE EXCEPTION 'Falta la patente del camión' USING ERRCODE = '22023'; END IF;
    SELECT c.id INTO v_cam FROM mae.camion c
     WHERE c.eliminado_en IS NULL AND (upper(regexp_replace(c.patente, '[^A-Za-z0-9]', '', 'g')) = v_pat OR upper(c.codigo_interno) = v_pat)
     ORDER BY (upper(regexp_replace(c.patente, '[^A-Za-z0-9]', '', 'g')) = v_pat) DESC LIMIT 1;
    IF v_cam IS NULL THEN RAISE EXCEPTION 'No encuentro el camión «%»', e ->> 'patente' USING ERRCODE = 'P0002'; END IF;
    IF nullif(btrim(coalesce(e ->> 'desde', '')), '') IS NOT NULL
       AND seg.fn_normalizar_busqueda(e ->> 'desde') NOT IN ('dondeesta', 'dondeestaahora', 'ahora', 'gps', 'posicionactual') THEN
        v_desde := ia.fn_lugar_por_nombre(e ->> 'desde');
    END IF;
    IF jsonb_typeof(e -> 'paradas') IS DISTINCT FROM 'array' OR jsonb_array_length(e -> 'paradas') = 0 THEN
        RAISE EXCEPTION 'Faltan los lugares por donde pasa y a dónde tiene que llegar' USING ERRCODE = '22023';
    END IF;
    FOR x IN SELECT * FROM jsonb_array_elements(e -> 'paradas') LOOP
        v_lugar := CASE WHEN jsonb_typeof(x) = 'string' THEN x #>> '{}' ELSE x ->> 'lugar' END;
        v_par := v_par || jsonb_build_object('lugar_id', ia.fn_lugar_por_nombre(v_lugar),
            'con_carga', CASE WHEN jsonb_typeof(x -> 'cargado') = 'boolean' THEN (x ->> 'cargado')::boolean ELSE true END);
    END LOOP;
    RETURN fue.fn_litros_para_recorrido(v_cam, v_desde, v_par,
        CASE WHEN jsonb_typeof(e -> 'litros_actuales') = 'number' THEN (e ->> 'litros_actuales')::numeric END);
END $f$;

INSERT INTO ia.asistente_herramienta (codigo, orden, descripcion, etiqueta, leyendo, pantalla, entrada, activa)
VALUES ('cuanto_cargar', 37,
        'Cuántos litros cargar para que UN camión haga un recorrido y llegue bien al último lugar (por ejemplo, a una estación de servicio). '
        || 'Sale desde donde está ahora según el GPS (o desde el lugar que digan), pasa por las paradas en orden y suma los km y el consumo promedio '
        || 'medido de los camiones en cada tramo, cargado o vacío. Usa los litros que tiene según el sistema, o los que diga la persona. '
        || 'Devuelve dos opciones: la justa (llega sin reserva) y la recomendada (llega con la reserva de 100 L para no rabear ni quedar tirado si se desvía). '
        || 'Usala SIEMPRE que pregunten cuánto combustible le falta a un camión o cuánto cargar para llegar a un lugar. '
        || 'Respondé con las dos cantidades y con cuántos litros llega en cada una; si dice que no entra, avisá que tiene que cargar en el camino. '
        || 'Si un lugar no se encuentra o hay varios parecidos, preguntá cuál.',
        'Cuánto cargar para llegar', 'Sumando los km y el consumo de cada tramo…', '/telemetria/seguimiento',
        '{"type": "object", "required": ["patente", "paradas"], "properties": {
            "patente": {"type": "string", "description": "Patente o código interno del tractor (ej. SHXB49)."},
            "desde": {"type": "string", "description": "Lugar desde donde sale, si la persona lo dice. Si no se manda: donde está ahora según el GPS."},
            "paradas": {"type": "array", "description": "Los lugares por donde pasa, en orden. El último es a donde tiene que llegar (por ejemplo, la estación).",
                        "items": {"type": "object", "required": ["lugar"], "properties": {
                            "lugar": {"type": "string", "description": "Nombre del lugar, cliente o estación (ej. San Antonio, Lo Espejo)."},
                            "cargado": {"type": "boolean", "description": "Si va cargado en el tramo que llega a este lugar. Si no se sabe: true."}}}},
            "litros_actuales": {"type": "number", "description": "Litros que tiene ahora, si los dijo la persona. Si no se manda: los del sistema."}}}'::jsonb, true)
ON CONFLICT (codigo) DO UPDATE
   SET descripcion = EXCLUDED.descripcion, etiqueta = EXCLUDED.etiqueta, leyendo = EXCLUDED.leyendo, pantalla = EXCLUDED.pantalla,
       entrada = EXCLUDED.entrada, activa = true;

-- El despacho de lecturas conoce la nueva (igual que Iris 10 a 15)
DO $do$
DECLARE v_def text := pg_get_functiondef('ia.fn_herramienta(text, jsonb)'::regprocedure);
        v_a2 constant text := 'ELSE ia.fn_lectura_tipo_cambio(p_entrada) END);';
BEGIN
    IF v_def LIKE '%cuanto_cargar%' THEN RETURN; END IF;
    IF v_def !~ 'p_codigo IN \(''viento_en_ruta''[^)]*\)' OR position(v_a2 IN v_def) = 0 THEN
        RAISE EXCEPTION 'ia.fn_herramienta no es la que esperaba esta migración: avisar antes de seguir';
    END IF;
    v_def := regexp_replace(v_def, '(p_codigo IN \(''viento_en_ruta''[^)]*)\)', '\1, ''cuanto_cargar'')');
    v_def := replace(v_def, v_a2, 'WHEN ''cuanto_cargar'' THEN ia.fn_lectura_cuanto_cargar(p_entrada)
                    ' || v_a2);
    EXECUTE v_def;
END $do$;

-- ---------------------------------------------------------------------------------
-- 5 · Permisos
-- ---------------------------------------------------------------------------------
SELECT pg_temp.fn_solo_interna('fue.fn_km_desde_gps(numeric, numeric, bigint)');
SELECT pg_temp.fn_solo_interna('fue.fn_litros_para_recorrido(bigint, bigint, jsonb, numeric)');
SELECT pg_temp.fn_solo_interna('ia.fn_lugar_por_nombre(text)');
SELECT pg_temp.fn_copiar_permisos('tel.fn_preparar_pedido_carga(bigint, bigint)', 'tel.fn_cuanto_cargar(bigint, jsonb)');
SELECT pg_temp.fn_copiar_permisos('ia.fn_lectura_tipo_cambio(jsonb)', 'ia.fn_lectura_cuanto_cargar(jsonb)');

UPDATE ref.parametro SET valor = '309' WHERE codigo = 'web.version_base' AND valor::text::int < 309;

COMMIT;

NOTIFY pgrst, 'reload schema';

-- Resultado: con qué datos va a calcular
SELECT 'migración 309 aplicada' AS que,
       (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base,
       ref.fn_parametro_num('fue.reserva_pedido_l', 100) AS reserva_l,
       (SELECT count(*) FROM fue.consumo_tramo t WHERE t.valido AND t.fin > now() - interval '400 days') AS tramos_medidos,
       (SELECT count(DISTINCT (t.origen_id, t.destino_id, t.con_carga)) FROM fue.consumo_tramo t
         WHERE t.valido AND t.fin > now() - interval '400 days') AS rutas_con_consumo_medido,
       (SELECT count(*) FROM mae.camion c WHERE c.eliminado_en IS NULL
           AND EXISTS (SELECT 1 FROM tel.lectura l WHERE l.camion_id = c.id AND l.latitud IS NOT NULL AND l.ts > now() - interval '12 hours'))
           AS camiones_con_gps_reciente;
