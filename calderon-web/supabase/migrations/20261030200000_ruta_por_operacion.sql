-- =============================================================================
-- IronTrack — 136 · La ruta del chofer va en cada OPERACIÓN (no en la línea)
-- -----------------------------------------------------------------------------
-- Pedido de Gerencia (30/10/2026): la ruta no se puede atar a la línea porque el destino
-- final cambia según el cliente y dónde quiera que se entregue. Desde ahora:
--   · ops.operacion_ruta: la ruta de UNA operación (puntos en orden: partida, paradas y
--     destino; aviso para el chofer; el link original). La carga telemetría en la operación.
--   · El chofer la sigue viendo en Mi viaje igual (ops.fn_mis_cargas → «ruta»).
--   · Se quita lo de la 135 que ataba la ruta a la línea (funciones y ruta_id). La tabla
--     mae.linea_ruta se borra si está vacía; si tiene rutas, queda guardada sin usarse.
-- Editan: Operaciones, Analista de control (telemetría) y TI. No crea datos.
-- web.version_base = 136.
-- =============================================================================
SET search_path = public, extensions;
BEGIN;

DO $do$
BEGIN
    IF to_regclass('mae.linea_ruta') IS NULL OR to_regprocedure('mae.fn_validar_puntos_ruta(jsonb)') IS NULL THEN
        RAISE EXCEPTION 'Falta la migración 135 (120_rutas_choferes.sql): aplicarla antes';
    END IF;
    IF to_regclass('ops.operacion_ruta') IS NOT NULL THEN
        RAISE EXCEPTION 'La migración 136 ya está aplicada (existe ops.operacion_ruta)';
    END IF;
END $do$;

CREATE TABLE ops.operacion_ruta (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    servicio_id     bigint NOT NULL REFERENCES ops.servicio_comercial(id) ON DELETE RESTRICT,
    puntos          jsonb NOT NULL,
    notas           text,
    link_original   text,
    creado_en       timestamptz NOT NULL DEFAULT now(),
    creado_por      bigint,
    actualizado_en  timestamptz NOT NULL DEFAULT now(),
    actualizado_por bigint,
    eliminado_en    timestamptz,
    eliminado_por   bigint,
    version_fila    integer NOT NULL DEFAULT 1,
    CONSTRAINT ck_opruta_textos CHECK (coalesce(length(notas), 0) <= 500 AND coalesce(length(link_original), 0) <= 4000),
    CONSTRAINT ck_opruta_puntos CHECK (jsonb_typeof(puntos) = 'array' AND jsonb_array_length(puntos) BETWEEN 2 AND 25)
);
COMMENT ON TABLE ops.operacion_ruta IS 'Migración 136: ruta para el chofer de una operación (puntos en orden: partida, paradas y destino; cada uno {nombre, lat, lng}).';
CREATE UNIQUE INDEX ux_opruta_servicio ON ops.operacion_ruta (servicio_id) WHERE eliminado_en IS NULL;
CREATE TRIGGER tg_05_impedir_borrado BEFORE DELETE ON ops.operacion_ruta FOR EACH ROW EXECUTE FUNCTION aud.fn_impedir_borrado_fisico();
CREATE TRIGGER tg_10_columnas_control BEFORE INSERT OR UPDATE ON ops.operacion_ruta FOR EACH ROW EXECUTE FUNCTION aud.fn_columnas_control();
CREATE TRIGGER tg_20_soft_delete BEFORE UPDATE ON ops.operacion_ruta FOR EACH ROW EXECUTE FUNCTION aud.fn_soft_delete();
CREATE TRIGGER tg_90_auditoria AFTER INSERT OR DELETE OR UPDATE ON ops.operacion_ruta FOR EACH ROW EXECUTE FUNCTION aud.fn_auditar();

-- -----------------------------------------------------------------------------
-- Se quita la ruta por línea (135)
-- -----------------------------------------------------------------------------
DROP FUNCTION ops.fn_rutas(bigint);
DROP FUNCTION ops.fn_guardar_ruta(bigint,integer,jsonb);
DROP FUNCTION ops.fn_quitar_ruta(bigint,integer);
DROP FUNCTION ops.fn_elegir_ruta(bigint,bigint);
DROP FUNCTION mae.fn_rutas(bigint);
DROP FUNCTION mae.fn_guardar_ruta(bigint,integer,jsonb);
DROP FUNCTION mae.fn_quitar_ruta(bigint,integer);
ALTER TABLE ops.servicio_comercial DROP COLUMN ruta_id;
DO $do$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM mae.linea_ruta) THEN
        DROP TABLE mae.linea_ruta;
    ELSE
        RAISE NOTICE 'mae.linea_ruta tiene rutas cargadas: queda guardada sin usarse';
    END IF;
END $do$;

-- -----------------------------------------------------------------------------
-- Funciones
-- -----------------------------------------------------------------------------
-- La ruta de una operación (NULL si no tiene)
CREATE OR REPLACE FUNCTION ops.fn_ruta_de_servicio(p_servicio bigint)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, extensions AS $$
    SELECT jsonb_build_object('id', r.id, 'nombre', 'Operación ' || s.numero_operacion, 'notas', r.notas, 'puntos', r.puntos,
                              'link_original', r.link_original, 'version', r.version_fila)
      FROM ops.operacion_ruta r JOIN ops.servicio_comercial s ON s.id = r.servicio_id
     WHERE r.servicio_id = p_servicio AND r.eliminado_en IS NULL
$$;

-- Guardar (o reemplazar) la ruta de una operación
CREATE OR REPLACE FUNCTION ops.fn_guardar_ruta_operacion(p_servicio bigint, p_version integer, p_datos jsonb)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions AS $$
DECLARE s ops.servicio_comercial%ROWTYPE; r ops.operacion_ruta%ROWTYPE; v_puntos jsonb;
BEGIN
    PERFORM mae.fn_exigir_editor_rutas();
    SELECT * INTO s FROM ops.servicio_comercial WHERE id = p_servicio AND eliminado_en IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'La operación no existe' USING ERRCODE = 'P0002'; END IF;
    IF s.estado NOT IN ('sin_confirmar','planificado','en_curso') THEN
        RAISE EXCEPTION 'La operación % ya terminó: no se le cambia la ruta', s.numero_operacion USING ERRCODE = '55000';
    END IF;
    IF length(coalesce(p_datos ->> 'notas', '')) > 500 THEN RAISE EXCEPTION 'El aviso para el chofer puede tener hasta 500 letras' USING ERRCODE = '22023'; END IF;
    v_puntos := mae.fn_validar_puntos_ruta(p_datos -> 'puntos');
    SELECT * INTO r FROM ops.operacion_ruta WHERE servicio_id = p_servicio AND eliminado_en IS NULL FOR UPDATE;
    IF FOUND THEN
        IF p_version IS DISTINCT FROM r.version_fila THEN
            RAISE EXCEPTION 'Otra persona cambió la ruta mientras la editabas: volvé a abrirla' USING ERRCODE = '40001';
        END IF;
        UPDATE ops.operacion_ruta
           SET puntos = v_puntos, notas = nullif(btrim(p_datos ->> 'notas'), ''),
               link_original = coalesce(nullif(btrim(p_datos ->> 'link_original'), ''), link_original)
         WHERE id = r.id;
    ELSE
        INSERT INTO ops.operacion_ruta (servicio_id, puntos, notas, link_original)
        VALUES (p_servicio, v_puntos, nullif(btrim(p_datos ->> 'notas'), ''), nullif(btrim(p_datos ->> 'link_original'), ''));
    END IF;
END $$;

-- Quitar la ruta de una operación
CREATE OR REPLACE FUNCTION ops.fn_quitar_ruta_operacion(p_servicio bigint, p_version integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions AS $$
DECLARE r ops.operacion_ruta%ROWTYPE;
BEGIN
    PERFORM mae.fn_exigir_editor_rutas();
    SELECT * INTO r FROM ops.operacion_ruta WHERE servicio_id = p_servicio AND eliminado_en IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'La operación no tiene ruta' USING ERRCODE = 'P0002'; END IF;
    IF r.version_fila <> p_version THEN RAISE EXCEPTION 'Otra persona cambió la ruta mientras la mirabas: volvé a abrirla' USING ERRCODE = '40001'; END IF;
    UPDATE ops.operacion_ruta SET eliminado_en = now() WHERE id = r.id;
END $$;

-- -----------------------------------------------------------------------------
-- Permisos
-- -----------------------------------------------------------------------------
DO $do$
DECLARE g text; f text;
BEGIN
    FOREACH f IN ARRAY ARRAY['ops.fn_ruta_de_servicio(bigint)', 'ops.fn_guardar_ruta_operacion(bigint,integer,jsonb)', 'ops.fn_quitar_ruta_operacion(bigint,integer)'] LOOP
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
    REVOKE ALL ON TABLE ops.operacion_ruta FROM PUBLIC;
    FOR g IN SELECT a.grantee::regrole::text FROM pg_class c, aclexplode(c.relacl) a
              WHERE c.oid = 'mae.linea'::regclass AND a.privilege_type = 'SELECT' AND a.grantee <> 0 AND a.grantee <> c.relowner LOOP
        EXECUTE format('GRANT SELECT ON TABLE ops.operacion_ruta TO %s', g);
    END LOOP;
END $do$;

UPDATE ref.parametro SET valor = '136' WHERE codigo = 'web.version_base' AND valor::text::int < 136;

NOTIFY pgrst, 'reload schema';

COMMIT;
