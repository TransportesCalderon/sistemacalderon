-- =============================================================================
-- IronTrack — 135 · Rutas para los choferes
-- -----------------------------------------------------------------------------
-- Pedido de Gerencia (30/10/2026): hoy telemetría manda por WhatsApp un link de Google Maps con
-- paradas para que el camión vaya por calles permitidas (altura, tránsito pesado, carga
-- peligrosa). Si el chofer cierra Google Maps, el link vuelve a empezar desde el punto A.
--   · mae.linea_ruta: rutas guardadas por LÍNEA (una o varias: «Normal», «Carga peligrosa»…),
--     con sus puntos en orden (partida, paradas y destino) y un aviso para el chofer. Se editan.
--   · ops.servicio_comercial.ruta_id: la ruta elegida para una operación (si no, la
--     predeterminada de su línea).
--   · El chofer la ve en Mi viaje (ops.fn_mis_cargas → «ruta»): la web arma el link de Google
--     Maps desde donde está, con las paradas que le faltan.
-- Editan: Operaciones, Analista de control (telemetría) y TI. No crea datos.
-- web.version_base = 135.
-- =============================================================================
SET search_path = public, extensions;
BEGIN;

DO $do$
BEGIN
    IF to_regprocedure('ops.fn_crear_viaje_pasado(bigint,bigint)') IS NULL THEN
        RAISE EXCEPTION 'Falta la migración 134 (119_viaje_chofer_pasado.sql): aplicarla antes';
    END IF;
    IF to_regclass('mae.linea_ruta') IS NOT NULL THEN
        RAISE EXCEPTION 'La migración 135 ya está aplicada (existe mae.linea_ruta)';
    END IF;
END $do$;

CREATE TABLE mae.linea_ruta (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    linea_id        bigint NOT NULL REFERENCES mae.linea(id) ON DELETE RESTRICT,
    nombre          text NOT NULL,
    notas           text,
    puntos          jsonb NOT NULL,
    link_original   text,
    predeterminada  boolean NOT NULL DEFAULT false,
    activa          boolean NOT NULL DEFAULT true,
    creado_en       timestamptz NOT NULL DEFAULT now(),
    creado_por      bigint,
    actualizado_en  timestamptz NOT NULL DEFAULT now(),
    actualizado_por bigint,
    eliminado_en    timestamptz,
    eliminado_por   bigint,
    version_fila    integer NOT NULL DEFAULT 1,
    CONSTRAINT ck_ruta_nombre CHECK (length(btrim(nombre)) BETWEEN 1 AND 60),
    CONSTRAINT ck_ruta_textos CHECK (coalesce(length(notas), 0) <= 500 AND coalesce(length(link_original), 0) <= 4000),
    CONSTRAINT ck_ruta_puntos CHECK (jsonb_typeof(puntos) = 'array' AND jsonb_array_length(puntos) BETWEEN 2 AND 25)
);
COMMENT ON TABLE mae.linea_ruta IS 'Migración 135: rutas para el chofer por línea (puntos en orden: partida, paradas y destino; cada uno {nombre, lat, lng}).';
CREATE UNIQUE INDEX ux_ruta_nombre ON mae.linea_ruta (linea_id, lower(btrim(nombre))) WHERE eliminado_en IS NULL AND activa;
CREATE UNIQUE INDEX ux_ruta_predeterminada ON mae.linea_ruta (linea_id) WHERE predeterminada AND activa AND eliminado_en IS NULL;
CREATE TRIGGER tg_05_impedir_borrado BEFORE DELETE ON mae.linea_ruta FOR EACH ROW EXECUTE FUNCTION aud.fn_impedir_borrado_fisico();
CREATE TRIGGER tg_10_columnas_control BEFORE INSERT OR UPDATE ON mae.linea_ruta FOR EACH ROW EXECUTE FUNCTION aud.fn_columnas_control();
CREATE TRIGGER tg_20_soft_delete BEFORE UPDATE ON mae.linea_ruta FOR EACH ROW EXECUTE FUNCTION aud.fn_soft_delete();
CREATE TRIGGER tg_90_auditoria AFTER INSERT OR DELETE OR UPDATE ON mae.linea_ruta FOR EACH ROW EXECUTE FUNCTION aud.fn_auditar();

ALTER TABLE ops.servicio_comercial ADD COLUMN ruta_id bigint REFERENCES mae.linea_ruta(id) ON DELETE RESTRICT;
COMMENT ON COLUMN ops.servicio_comercial.ruta_id IS 'Migración 135: ruta elegida para el chofer (NULL = la predeterminada de su línea).';

-- -----------------------------------------------------------------------------
-- Funciones
-- -----------------------------------------------------------------------------
-- Quién edita las rutas
CREATE OR REPLACE FUNCTION mae.fn_exigir_editor_rutas()
RETURNS bigint LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, extensions AS $$
DECLARE v_usr bigint := aud.fn_usuario_actual();
BEGIN
    IF v_usr IS NULL OR NOT EXISTS (SELECT 1 FROM seg.usuario_rol WHERE usuario_id = v_usr AND rol_codigo IN ('operaciones', 'analista_control', 'ti')) THEN
        RAISE EXCEPTION 'Las rutas las cargan Operaciones, telemetría (Analista de control) o TI' USING ERRCODE = '42501';
    END IF;
    RETURN v_usr;
END $$;

-- Puntos válidos: 2 a 25, cada uno con nombre (opcional) y coordenadas
CREATE OR REPLACE FUNCTION mae.fn_validar_puntos_ruta(p jsonb)
RETURNS jsonb LANGUAGE plpgsql IMMUTABLE
SET search_path = pg_catalog, public, extensions AS $$
DECLARE e jsonb; i integer := 0; v_lat numeric; v_lng numeric; v_nom text; v_out jsonb := '[]';
BEGIN
    IF p IS NULL OR jsonb_typeof(p) <> 'array' OR jsonb_array_length(p) < 2 THEN
        RAISE EXCEPTION 'La ruta necesita al menos la partida y el destino' USING ERRCODE = '22023';
    END IF;
    IF jsonb_array_length(p) > 25 THEN
        RAISE EXCEPTION 'La ruta puede tener hasta 25 puntos (tiene %)', jsonb_array_length(p) USING ERRCODE = '22023';
    END IF;
    FOR e IN SELECT x FROM jsonb_array_elements(p) x LOOP
        i := i + 1;
        BEGIN
            v_lat := (e ->> 'lat')::numeric; v_lng := (e ->> 'lng')::numeric;
        EXCEPTION WHEN OTHERS THEN v_lat := NULL; v_lng := NULL;
        END;
        v_nom := nullif(btrim(e ->> 'nombre'), '');
        IF v_lat IS NULL OR v_lng IS NULL OR v_lat NOT BETWEEN -90 AND 90 OR v_lng NOT BETWEEN -180 AND 180 OR (v_lat = 0 AND v_lng = 0) THEN
            RAISE EXCEPTION 'El punto % (%) no tiene la ubicación: marcalo en el mapa', i, coalesce(v_nom, 'sin nombre') USING ERRCODE = '22023';
        END IF;
        IF length(coalesce(v_nom, '')) > 80 THEN
            RAISE EXCEPTION 'El nombre del punto % puede tener hasta 80 letras', i USING ERRCODE = '22023';
        END IF;
        v_out := v_out || jsonb_build_object('nombre', coalesce(v_nom, CASE i WHEN 1 THEN 'Partida' WHEN jsonb_array_length(p) THEN 'Destino' ELSE 'Parada ' || (i - 1) END),
                                             'lat', round(v_lat, 6), 'lng', round(v_lng, 6));
    END LOOP;
    RETURN v_out;
END $$;

-- Rutas de una línea (o de todas)
CREATE OR REPLACE FUNCTION mae.fn_rutas(p_linea bigint DEFAULT NULL)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, extensions AS $$
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', r.id, 'linea_id', r.linea_id, 'linea', l.codigo, 'nombre', r.nombre, 'notas', r.notas,
                                                 'puntos', r.puntos, 'link_original', r.link_original, 'predeterminada', r.predeterminada,
                                                 'version', r.version_fila,
                                                 'operaciones_activas', (SELECT count(*) FROM ops.servicio_comercial s
                                                                          WHERE s.ruta_id = r.id AND s.eliminado_en IS NULL
                                                                            AND s.estado IN ('sin_confirmar','planificado','en_curso')))
                              ORDER BY l.codigo, r.predeterminada DESC, r.nombre), '[]'::jsonb)
      FROM mae.linea_ruta r JOIN mae.linea l ON l.id = r.linea_id
     WHERE r.eliminado_en IS NULL AND r.activa AND (p_linea IS NULL OR r.linea_id = p_linea)
$$;

-- Guardar (nueva si p_id es NULL). Devuelve el id.
CREATE OR REPLACE FUNCTION mae.fn_guardar_ruta(p_id bigint, p_version integer, p_datos jsonb)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions AS $$
DECLARE r mae.linea_ruta%ROWTYPE; v_linea bigint; v_nombre text := nullif(btrim(p_datos ->> 'nombre'), ''); v_puntos jsonb;
        v_pred boolean := coalesce((p_datos ->> 'predeterminada')::boolean, false); v_id bigint;
BEGIN
    PERFORM mae.fn_exigir_editor_rutas();
    IF v_nombre IS NULL THEN RAISE EXCEPTION 'Poné un nombre a la ruta (por ejemplo «Normal» o «Carga peligrosa»)' USING ERRCODE = '22023'; END IF;
    IF length(v_nombre) > 60 THEN RAISE EXCEPTION 'El nombre puede tener hasta 60 letras' USING ERRCODE = '22023'; END IF;
    IF length(coalesce(p_datos ->> 'notas', '')) > 500 THEN RAISE EXCEPTION 'El aviso para el chofer puede tener hasta 500 letras' USING ERRCODE = '22023'; END IF;
    v_puntos := mae.fn_validar_puntos_ruta(p_datos -> 'puntos');
    IF p_id IS NULL THEN
        v_linea := (p_datos ->> 'linea_id')::bigint;
        IF NOT EXISTS (SELECT 1 FROM mae.linea WHERE id = v_linea AND eliminado_en IS NULL) THEN
            RAISE EXCEPTION 'La línea no existe' USING ERRCODE = 'P0002';
        END IF;
    ELSE
        SELECT * INTO r FROM mae.linea_ruta WHERE id = p_id AND eliminado_en IS NULL AND activa FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'La ruta no existe' USING ERRCODE = 'P0002'; END IF;
        IF r.version_fila <> p_version THEN RAISE EXCEPTION 'Otra persona cambió la ruta mientras la editabas: volvé a abrirla' USING ERRCODE = '40001'; END IF;
        v_linea := r.linea_id;
    END IF;
    IF EXISTS (SELECT 1 FROM mae.linea_ruta WHERE linea_id = v_linea AND lower(btrim(nombre)) = lower(v_nombre) AND id IS DISTINCT FROM p_id
                 AND eliminado_en IS NULL AND activa) THEN
        RAISE EXCEPTION 'Esa línea ya tiene una ruta «%»', v_nombre USING ERRCODE = '23505';
    END IF;
    -- La primera ruta de la línea queda predeterminada; si se marca otra, deja de serlo la anterior
    IF NOT EXISTS (SELECT 1 FROM mae.linea_ruta WHERE linea_id = v_linea AND id IS DISTINCT FROM p_id AND predeterminada AND activa AND eliminado_en IS NULL) THEN
        v_pred := true;
    ELSIF v_pred THEN
        UPDATE mae.linea_ruta SET predeterminada = false WHERE linea_id = v_linea AND id IS DISTINCT FROM p_id AND predeterminada AND activa AND eliminado_en IS NULL;
    END IF;
    IF p_id IS NULL THEN
        INSERT INTO mae.linea_ruta (linea_id, nombre, notas, puntos, link_original, predeterminada)
        VALUES (v_linea, v_nombre, nullif(btrim(p_datos ->> 'notas'), ''), v_puntos, nullif(btrim(p_datos ->> 'link_original'), ''), v_pred)
        RETURNING id INTO v_id;
    ELSE
        UPDATE mae.linea_ruta
           SET nombre = v_nombre, notas = nullif(btrim(p_datos ->> 'notas'), ''), puntos = v_puntos,
               link_original = coalesce(nullif(btrim(p_datos ->> 'link_original'), ''), link_original),
               predeterminada = v_pred OR (predeterminada AND NOT EXISTS (SELECT 1 FROM mae.linea_ruta x WHERE x.linea_id = v_linea AND x.id <> p_id
                                                                           AND x.predeterminada AND x.activa AND x.eliminado_en IS NULL))
         WHERE id = p_id RETURNING id INTO v_id;
    END IF;
    RETURN v_id;
END $$;

-- Quitar una ruta (deja de ofrecerse; las operaciones que la tenían vuelven a la predeterminada)
CREATE OR REPLACE FUNCTION mae.fn_quitar_ruta(p_id bigint, p_version integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions AS $$
DECLARE r mae.linea_ruta%ROWTYPE;
BEGIN
    PERFORM mae.fn_exigir_editor_rutas();
    SELECT * INTO r FROM mae.linea_ruta WHERE id = p_id AND eliminado_en IS NULL AND activa FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'La ruta no existe' USING ERRCODE = 'P0002'; END IF;
    IF r.version_fila <> p_version THEN RAISE EXCEPTION 'Otra persona cambió la ruta mientras la mirabas: volvé a abrirla' USING ERRCODE = '40001'; END IF;
    UPDATE ops.servicio_comercial SET ruta_id = NULL WHERE ruta_id = p_id;
    UPDATE mae.linea_ruta SET activa = false, predeterminada = false WHERE id = p_id;
    IF r.predeterminada THEN
        UPDATE mae.linea_ruta SET predeterminada = true
         WHERE id = (SELECT id FROM mae.linea_ruta WHERE linea_id = r.linea_id AND activa AND eliminado_en IS NULL ORDER BY id LIMIT 1);
    END IF;
END $$;

-- La ruta de una operación: la elegida o la predeterminada de su línea (NULL si no hay)
CREATE OR REPLACE FUNCTION ops.fn_ruta_de_servicio(p_servicio bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, extensions AS $$
    SELECT jsonb_build_object('id', r.id, 'nombre', r.nombre, 'notas', r.notas, 'puntos', r.puntos, 'linea', l.codigo,
                              'elegida', s.ruta_id IS NOT NULL)
      FROM ops.servicio_comercial s
      JOIN mae.linea_ruta r ON r.id = coalesce(s.ruta_id, (SELECT x.id FROM mae.linea_ruta x WHERE x.linea_id = s.linea_id AND x.predeterminada
                                                                AND x.activa AND x.eliminado_en IS NULL))
      JOIN mae.linea l ON l.id = r.linea_id
     WHERE s.id = p_servicio AND r.activa AND r.eliminado_en IS NULL
$$;

-- Elegir la ruta de una operación (NULL = la predeterminada de su línea)
CREATE OR REPLACE FUNCTION ops.fn_elegir_ruta(p_servicio bigint, p_ruta bigint)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions AS $$
DECLARE s ops.servicio_comercial%ROWTYPE;
BEGIN
    PERFORM mae.fn_exigir_editor_rutas();
    SELECT * INTO s FROM ops.servicio_comercial WHERE id = p_servicio AND eliminado_en IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'La operación no existe' USING ERRCODE = 'P0002'; END IF;
    IF s.estado NOT IN ('sin_confirmar','planificado','en_curso') THEN
        RAISE EXCEPTION 'La operación % ya terminó: no se le cambia la ruta', s.numero_operacion USING ERRCODE = '55000';
    END IF;
    IF p_ruta IS NOT NULL AND NOT EXISTS (SELECT 1 FROM mae.linea_ruta WHERE id = p_ruta AND linea_id = s.linea_id AND activa AND eliminado_en IS NULL) THEN
        RAISE EXCEPTION 'Esa ruta no es de la línea de la operación %', s.numero_operacion USING ERRCODE = '22023';
    END IF;
    UPDATE ops.servicio_comercial SET ruta_id = p_ruta WHERE id = p_servicio;
END $$;

-- Mi viaje: cada carga del chofer trae su ruta
DO $do$
DECLARE v text; n text;
BEGIN
    v := pg_get_functiondef('ops.fn_mis_cargas()'::regprocedure);
    n := replace(v, $a$'documentos', ops.fn_documentos_de(o.servicio_id))$a$,
                    $a$'documentos', ops.fn_documentos_de(o.servicio_id),
               'ruta', ops.fn_ruta_de_servicio(o.servicio_id))   -- Migración 135$a$);
    IF n = v THEN RAISE EXCEPTION 'No se pudo ajustar ops.fn_mis_cargas (cambió su texto)'; END IF;
    EXECUTE n;
END $do$;

-- Wrappers para la web (esquema ops, como el resto)
CREATE OR REPLACE FUNCTION ops.fn_rutas(p_linea bigint DEFAULT NULL) RETURNS jsonb LANGUAGE sql STABLE
SET search_path = pg_catalog, public, extensions AS $$ SELECT mae.fn_rutas(p_linea) $$;
CREATE OR REPLACE FUNCTION ops.fn_guardar_ruta(p_id bigint, p_version integer, p_datos jsonb) RETURNS bigint LANGUAGE sql
SET search_path = pg_catalog, public, extensions AS $$ SELECT mae.fn_guardar_ruta(p_id, p_version, p_datos) $$;
CREATE OR REPLACE FUNCTION ops.fn_quitar_ruta(p_id bigint, p_version integer) RETURNS void LANGUAGE sql
SET search_path = pg_catalog, public, extensions AS $$ SELECT mae.fn_quitar_ruta(p_id, p_version) $$;

-- -----------------------------------------------------------------------------
-- Permisos
-- -----------------------------------------------------------------------------
DO $do$
DECLARE g text; f text;
    oficina text[] := ARRAY['mae.fn_rutas(bigint)', 'mae.fn_guardar_ruta(bigint,integer,jsonb)', 'mae.fn_quitar_ruta(bigint,integer)',
        'mae.fn_exigir_editor_rutas()', 'mae.fn_validar_puntos_ruta(jsonb)', 'ops.fn_ruta_de_servicio(bigint)', 'ops.fn_elegir_ruta(bigint,bigint)',
        'ops.fn_rutas(bigint)', 'ops.fn_guardar_ruta(bigint,integer,jsonb)', 'ops.fn_quitar_ruta(bigint,integer)'];
BEGIN
    FOREACH f IN ARRAY oficina LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
        FOREACH g IN ARRAY ARRAY['anon', 'authenticated'] LOOP
            CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = g);
            EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', f, g);
        END LOOP;
        FOREACH g IN ARRAY ARRAY['tc_admin', 'tc_app', 'tc_lectura', 'tc_auditor'] LOOP
            CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = g);
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', f, g);
        END LOOP;
        FOR g IN SELECT DISTINCT pg_get_userbyid(p.proowner) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
                  WHERE n.nspname IN ('fue','ops','tel','ana','fin','ia','mae','ven','seg') AND p.prosecdef LOOP
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', f, g);
        END LOOP;
    END LOOP;
    -- Tabla: se lee como las líneas; se escribe solo por las funciones
    REVOKE ALL ON TABLE mae.linea_ruta FROM PUBLIC;
    FOR g IN SELECT a.grantee::regrole::text FROM pg_class c, aclexplode(c.relacl) a
              WHERE c.oid = 'mae.linea'::regclass AND a.privilege_type = 'SELECT' AND a.grantee <> 0 AND a.grantee <> c.relowner LOOP
        EXECUTE format('GRANT SELECT ON TABLE mae.linea_ruta TO %s', g);
    END LOOP;
END $do$;

UPDATE ref.parametro SET valor = '135' WHERE codigo = 'web.version_base' AND valor::text::int < 135;

NOTIFY pgrst, 'reload schema';

COMMIT;
