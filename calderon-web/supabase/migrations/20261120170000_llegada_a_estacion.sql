-- =============================================================================
-- IronTrack — 287 · Cambio 280 · Aviso cuando un tractor llega a una estación de servicio
-- -----------------------------------------------------------------------------
-- Pedido del usuario (20/11/2026): que a Telemetría, Operaciones y Gerencia les llegue una notificación al teléfono
-- cuando el camión llega a la estación de servicio. Decisión: siempre que el tractor entra a una estación cargada en el
-- sistema y se detiene ahí (menos de 5 km/h); si solo pasa por la ruta, no avisa. Si tiene una orden de carga o una
-- solicitud pendiente para esa estación, el aviso lo dice.
--   · La estación tiene que estar ubicada (Comercial › Estaciones, «Ubicación»): el radio es el de su ubicación o, si no
--     tiene, 250 m (tel.llegada_estacion_radio_m). No cuenta el surtidor propio (es_tanque_propio).
--   · tel.llegada_estacion: una fila por llegada (tractor, estación, llegó, se fue, orden de carga, aviso).
--   · tel.fn_detectar_llegadas_estacion(): cada 5 minutos (pg_cron «llegada_estacion»). Con el último dato del GPS de
--     cada tractor (últimos 15 minutos): si está dentro de una estación y a 5 km/h o menos, abre la llegada y avisa; si
--     se alejó, la cierra. Si vuelve a la misma estación antes de una hora, no avisa de nuevo.
--   · Aviso urgente a Telemetría (analista_control), Operaciones y Gerencia: «Llegó a la estación · patente», con el
--     chofer, la hora y la orden de carga (o la solicitud pendiente, o «sin orden de carga»).
--   · Parámetros: tel.llegada_estacion_activo (true), tel.llegada_estacion_kmh (5), tel.llegada_estacion_radio_m (250).
-- No toca funciones existentes ni la web. web.version_base = 287.
-- =============================================================================
SET search_path = public, extensions;
BEGIN;

DO $do$
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 286 THEN
        RAISE EXCEPTION 'Falta la migración 286 (horario de manejo): aplicarla antes';
    END IF;
    IF to_regclass('tel.llegada_estacion') IS NOT NULL THEN
        RAISE EXCEPTION 'La migración 287 (llegada a la estación) ya está aplicada';
    END IF;
    IF to_regprocedure('ops.fn_avisar(bigint[],text,text,text,text,boolean)') IS NULL OR to_regprocedure('fue.fn_texto_autorizado(fue.orden_carga)') IS NULL
       OR to_regprocedure('mae.fn_chofer_de_tractor(bigint,date)') IS NULL OR to_regprocedure('ops.fn_nombre_chofer(bigint)') IS NULL
       OR to_regclass('tel.pedido_carga') IS NULL OR to_regclass('mae.ubicacion') IS NULL THEN
        RAISE EXCEPTION 'Faltan funciones o tablas que esta migración necesita (avisos, órdenes de carga o ubicaciones)';
    END IF;
END $do$;

INSERT INTO ref.parametro (codigo, valor, descripcion) VALUES
 ('tel.llegada_estacion_activo', 'true', 'Migración 287: «false» apaga el aviso de llegada a la estación de servicio.'),
 ('tel.llegada_estacion_kmh', '5', 'Migración 287: velocidad (km/h) hasta la que el tractor cuenta como detenido en la estación.'),
 ('tel.llegada_estacion_radio_m', '250', 'Migración 287: radio (m) de la estación cuando su ubicación no tiene radio de geocerca.')
ON CONFLICT (codigo) DO NOTHING;

CREATE TABLE tel.llegada_estacion (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    camion_id bigint NOT NULL REFERENCES mae.camion (id),
    estacion_id bigint NOT NULL REFERENCES mae.estacion_servicio (id),
    chofer_id bigint,
    llegada_ts timestamptz NOT NULL,
    ultimo_ts timestamptz NOT NULL,
    salida_ts timestamptz,
    orden_id bigint REFERENCES fue.orden_carga (id),
    pedido_id bigint,
    avisado_en timestamptz,
    creado_en timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX ux_llegada_estacion_abierta ON tel.llegada_estacion (camion_id) WHERE salida_ts IS NULL;
CREATE INDEX ix_llegada_estacion_camion ON tel.llegada_estacion (camion_id, llegada_ts DESC);
COMMENT ON TABLE tel.llegada_estacion IS 'Migración 287: tractor que llegó (se detuvo) en una estación de servicio, con el aviso a Telemetría, Operaciones y Gerencia.';
REVOKE ALL ON tel.llegada_estacion FROM PUBLIC;

CREATE FUNCTION tel.fn_detectar_llegadas_estacion()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE
    v_kmh numeric := ref.fn_parametro_num('tel.llegada_estacion_kmh', 5);
    v_radio numeric := ref.fn_parametro_num('tel.llegada_estacion_radio_m', 250);
    v_dest bigint[] := ARRAY(SELECT DISTINCT ur.usuario_id FROM seg.usuario_rol ur JOIN seg.usuario u ON u.id = ur.usuario_id AND u.activo
                              WHERE ur.rol_codigo IN ('analista_control', 'operaciones', 'gerencia'));
    r record; a tel.llegada_estacion%ROWTYPE; o fue.orden_carga%ROWTYPE; v_ped bigint; v_cho bigint; v_id bigint; v_txt text; n integer := 0;
BEGIN
    IF ref.fn_parametro_texto('tel.llegada_estacion_activo', 'true') <> 'true' THEN RETURN 0; END IF;

    FOR r IN
        WITH ult AS (   -- el último dato del GPS de cada tractor
            SELECT DISTINCT ON (l.camion_id) l.camion_id, l.ts, l.velocidad_kmh, l.chofer_id,
                   coalesce(l.geom, CASE WHEN l.latitud IS NOT NULL AND l.longitud IS NOT NULL
                                         THEN extensions.st_setsrid(extensions.st_makepoint(l.longitud, l.latitud), 4326)::extensions.geography END) AS geom
              FROM tel.lectura l JOIN mae.camion c ON c.id = l.camion_id AND c.eliminado_en IS NULL
             WHERE l.ts > now() - interval '15 minutes' AND l.ts <= now() + interval '5 minutes' AND coalesce(l.calidad, 1) > 0
               AND (l.geom IS NOT NULL OR (l.latitud IS NOT NULL AND l.longitud IS NOT NULL))
             ORDER BY l.camion_id, l.ts DESC),
        est AS (        -- las estaciones ubicadas
            SELECT e.id, e.nombre, coalesce(nullif(u.radio_geocerca_m, 0), v_radio) AS radio,
                   coalesce(u.geom, extensions.st_setsrid(extensions.st_makepoint(u.longitud, u.latitud), 4326)::extensions.geography) AS geom
              FROM mae.estacion_servicio e JOIN mae.ubicacion u ON u.id = e.ubicacion_id AND u.eliminado_en IS NULL
             WHERE e.eliminado_en IS NULL AND NOT coalesce(e.es_tanque_propio, false)
               AND (u.geom IS NOT NULL OR (u.latitud IS NOT NULL AND u.longitud IS NOT NULL)))
        SELECT ult.camion_id, ult.ts, ult.velocidad_kmh, ult.chofer_id, cerca.id AS estacion_id, cerca.nombre, cerca.dist, cerca.radio
          FROM ult
          LEFT JOIN LATERAL (SELECT est.id, est.nombre, est.radio, extensions.st_distance(ult.geom, est.geom) AS dist
                               FROM est WHERE extensions.st_dwithin(ult.geom, est.geom, est.radio + 100)
                              ORDER BY extensions.st_distance(ult.geom, est.geom) LIMIT 1) cerca ON true
    LOOP
        SELECT * INTO a FROM tel.llegada_estacion WHERE camion_id = r.camion_id AND salida_ts IS NULL FOR UPDATE;
        IF a.id IS NOT NULL THEN
            -- Sigue en la estación (con 100 m de margen) o ya se fue
            IF r.estacion_id = a.estacion_id THEN
                UPDATE tel.llegada_estacion SET ultimo_ts = greatest(ultimo_ts, r.ts) WHERE id = a.id;
                a := NULL;
                CONTINUE;
            END IF;
            UPDATE tel.llegada_estacion SET salida_ts = r.ts WHERE id = a.id;
            a := NULL;
        END IF;

        -- Llegó: dentro del radio y detenido
        CONTINUE WHEN r.estacion_id IS NULL OR r.dist > r.radio OR coalesce(r.velocidad_kmh, 0) > v_kmh;
        -- Si estuvo en la misma estación hace menos de una hora (salió un momento o saltó el GPS), se retoma sin avisar
        SELECT * INTO a FROM tel.llegada_estacion
         WHERE camion_id = r.camion_id AND estacion_id = r.estacion_id AND salida_ts > now() - interval '1 hour'
         ORDER BY salida_ts DESC LIMIT 1;
        IF a.id IS NOT NULL THEN
            UPDATE tel.llegada_estacion SET salida_ts = NULL, ultimo_ts = r.ts WHERE id = a.id;
            a := NULL;
            CONTINUE;
        END IF;

        v_cho := coalesce(r.chofer_id, mae.fn_chofer_de_tractor(r.camion_id, (r.ts AT TIME ZONE 'America/Argentina/Mendoza')::date));
        SELECT * INTO o FROM fue.orden_carga x
         WHERE x.camion_id = r.camion_id AND x.estacion_id = r.estacion_id AND x.genset_id IS NULL
           AND (x.estado = 'emitida' AND x.vence_en > now() OR x.estado = 'autorizada' AND x.carga_id IS NULL AND x.vence_en > now() - interval '12 hours')
         ORDER BY x.creada_en DESC LIMIT 1;
        SELECT p.id INTO v_ped FROM tel.pedido_carga p
         WHERE p.camion_id = r.camion_id AND p.estado = 'pendiente' ORDER BY p.creado_en DESC LIMIT 1;
        INSERT INTO tel.llegada_estacion (camion_id, estacion_id, chofer_id, llegada_ts, ultimo_ts, orden_id, pedido_id, avisado_en)
        VALUES (r.camion_id, r.estacion_id, v_cho, r.ts, r.ts, o.id, v_ped, now())
        RETURNING id INTO v_id;
        v_txt := CASE WHEN o.id IS NOT NULL THEN 'Orden ' || o.numero || ': ' || fue.fn_texto_autorizado(o)
                                                 || CASE WHEN o.litros_calculados IS NOT NULL THEN ' (≈ ' || tel.fn_num_ar(o.litros_calculados) || ' L)' ELSE '' END
                                                 || CASE o.estado WHEN 'emitida' THEN ' · falta que la estación la autorice' ELSE '' END
                      WHEN v_ped IS NOT NULL THEN 'Tiene una solicitud de carga pendiente de aprobar'
                      ELSE 'Sin orden de carga' END;
        PERFORM ops.fn_avisar(
            v_dest, 'llegada_estacion:' || v_id,
            'Llegó a la estación · ' || (SELECT patente FROM mae.camion WHERE id = r.camion_id),
            coalesce(ops.fn_nombre_chofer(v_cho), 'Chofer sin identificar') || ' llegó a ' || r.nombre || ' a las '
                || to_char(r.ts AT TIME ZONE 'America/Argentina/Mendoza', 'HH24:MI') || '. ' || v_txt || '.',
            CASE WHEN v_ped IS NOT NULL AND o.id IS NULL THEN '/combustible/cargas?vista=ordenes' ELSE '/telemetria/seguimiento' END,
            true);
        n := n + 1;
        o := NULL; v_ped := NULL;
    END LOOP;

    -- Sin datos del GPS hace 2 horas: la llegada se da por terminada
    UPDATE tel.llegada_estacion SET salida_ts = ultimo_ts WHERE salida_ts IS NULL AND ultimo_ts < now() - interval '2 hours';
    RETURN n;
END $f$;
REVOKE ALL ON FUNCTION tel.fn_detectar_llegadas_estacion() FROM PUBLIC;

DO $do$
BEGIN
    IF to_regprocedure('cron.schedule(text,text,text)') IS NOT NULL THEN
        PERFORM cron.schedule('llegada_estacion', '*/5 * * * *', 'SELECT tel.fn_detectar_llegadas_estacion()');
    END IF;
END $do$;

UPDATE ref.parametro SET valor = '287' WHERE codigo = 'web.version_base' AND valor::text::int < 287;

COMMIT;

SELECT 'migración 287 aplicada' AS que, (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base,
       (SELECT count(*) FROM mae.estacion_servicio e JOIN mae.ubicacion u ON u.id = e.ubicacion_id
         WHERE e.eliminado_en IS NULL AND NOT coalesce(e.es_tanque_propio, false) AND (u.geom IS NOT NULL OR u.latitud IS NOT NULL)) AS estaciones_ubicadas,
       (SELECT string_agg(e.nombre, ', ' ORDER BY e.nombre) FROM mae.estacion_servicio e LEFT JOIN mae.ubicacion u ON u.id = e.ubicacion_id
         WHERE e.eliminado_en IS NULL AND NOT coalesce(e.es_tanque_propio, false) AND (u.id IS NULL OR (u.geom IS NULL AND u.latitud IS NULL))) AS estaciones_sin_ubicar;
