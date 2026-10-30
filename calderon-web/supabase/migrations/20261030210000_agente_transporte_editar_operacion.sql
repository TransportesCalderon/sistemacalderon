-- =============================================================================
-- IronTrack — 137 · Agente de transporte y modificar operaciones ya salidas
-- -----------------------------------------------------------------------------
-- Pedido de Gerencia (30/10/2026):
--   1. Agente de transporte: catálogo mae.agente_transporte (la lista de RedLine) y el dato en
--      la operación (ops.servicio_comercial.agente_transporte_id), entre lugar de carga y aduana.
--   2. Modificar operaciones después de creadas: muchas vinieron mal de RedLine (por ejemplo la
--      fecha de presentación). Ahora se modifican todos los datos mientras no estén facturadas ni
--      canceladas (también en viaje o entregadas). Si la operación está en una prefactura, el
--      cliente no se cambia (hay que sacarla de la prefactura). En un viaje en curso se actualiza
--      el lugar de entrega del viaje.
-- La lista de agentes es la de RedLine (datos reales de la empresa; sin «PRUEBA AGENTES»).
-- web.version_base = 137.
-- =============================================================================
SET search_path = public, extensions;
BEGIN;

DO $do$
BEGIN
    IF to_regclass('ops.operacion_ruta') IS NULL THEN
        RAISE EXCEPTION 'Falta la migración 136 (121_ruta_por_operacion.sql): aplicarla antes';
    END IF;
    IF to_regclass('mae.agente_transporte') IS NOT NULL THEN
        RAISE EXCEPTION 'La migración 137 ya está aplicada (existe mae.agente_transporte)';
    END IF;
END $do$;

-- -----------------------------------------------------------------------------
-- 1 · Agentes de transporte
-- -----------------------------------------------------------------------------
CREATE TABLE mae.agente_transporte (
    id              bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    nombre          text NOT NULL,
    activo          boolean NOT NULL DEFAULT true,
    creado_en       timestamptz NOT NULL DEFAULT now(),
    creado_por      bigint,
    actualizado_en  timestamptz NOT NULL DEFAULT now(),
    actualizado_por bigint,
    eliminado_en    timestamptz,
    eliminado_por   bigint,
    version_fila    integer NOT NULL DEFAULT 1,
    CONSTRAINT ck_agente_nombre CHECK (length(btrim(nombre)) BETWEEN 1 AND 120)
);
COMMENT ON TABLE mae.agente_transporte IS 'Migración 137: agentes de transporte (como en RedLine). Se eligen en la operación.';
CREATE UNIQUE INDEX ux_agente_nombre ON mae.agente_transporte (upper(btrim(nombre))) WHERE eliminado_en IS NULL;
CREATE TRIGGER tg_05_impedir_borrado BEFORE DELETE ON mae.agente_transporte FOR EACH ROW EXECUTE FUNCTION aud.fn_impedir_borrado_fisico();
CREATE TRIGGER tg_10_columnas_control BEFORE INSERT OR UPDATE ON mae.agente_transporte FOR EACH ROW EXECUTE FUNCTION aud.fn_columnas_control();
CREATE TRIGGER tg_20_soft_delete BEFORE UPDATE ON mae.agente_transporte FOR EACH ROW EXECUTE FUNCTION aud.fn_soft_delete();
CREATE TRIGGER tg_90_auditoria AFTER INSERT OR DELETE OR UPDATE ON mae.agente_transporte FOR EACH ROW EXECUTE FUNCTION aud.fn_auditar();

INSERT INTO mae.agente_transporte (nombre) VALUES
    ('AGUSTIN FLEITAS'), ('CLEMENT'), ('CRISTIAN REYNOSO'), ('DINO PASCUALETTI'), ('ENRIQUE TORRES'), ('GERARDO SANCHEZ'),
    ('GERONIMO MECOZZI'), ('JOSE MANUEL BISCARO'), ('JULIETA RODRIGO'), ('MARIA PAULA PRIETTO'), ('MARIA S. MARTINEZ IBACACHE'),
    ('MARINA BULLA'), ('TRANSOCEAN S.A.');

ALTER TABLE ops.servicio_comercial ADD COLUMN agente_transporte_id bigint REFERENCES mae.agente_transporte(id) ON DELETE RESTRICT;
COMMENT ON COLUMN ops.servicio_comercial.agente_transporte_id IS 'Migración 137: agente de transporte de la operación.';

-- Lista (activos y, si se pide, también los inactivos)
CREATE OR REPLACE FUNCTION ops.fn_agentes_transporte(p_todos boolean DEFAULT false)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = pg_catalog, public, extensions AS $$
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'nombre', a.nombre, 'activo', a.activo, 'version', a.version_fila,
                                                 'operaciones', (SELECT count(*) FROM ops.servicio_comercial s WHERE s.agente_transporte_id = a.id AND s.eliminado_en IS NULL))
                              ORDER BY a.nombre), '[]'::jsonb)
      FROM mae.agente_transporte a
     WHERE a.eliminado_en IS NULL AND (p_todos OR a.activo)
$$;

-- Alta o modificación (Operaciones o TI)
CREATE OR REPLACE FUNCTION ops.fn_guardar_agente_transporte(p_id bigint, p_version integer, p_nombre text, p_activo boolean DEFAULT true)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions AS $$
DECLARE v_usr bigint := aud.fn_usuario_actual(); v_nombre text := upper(regexp_replace(btrim(coalesce(p_nombre, '')), '\s+', ' ', 'g')); v_id bigint;
BEGIN
    IF v_usr IS NULL OR NOT EXISTS (SELECT 1 FROM seg.usuario_rol WHERE usuario_id = v_usr AND rol_codigo IN ('operaciones', 'ti')) THEN
        RAISE EXCEPTION 'Los agentes de transporte los cargan Operaciones o TI' USING ERRCODE = '42501';
    END IF;
    IF v_nombre = '' THEN RAISE EXCEPTION 'Escribí el nombre del agente' USING ERRCODE = '22023'; END IF;
    IF length(v_nombre) > 120 THEN RAISE EXCEPTION 'El nombre puede tener hasta 120 letras' USING ERRCODE = '22023'; END IF;
    IF EXISTS (SELECT 1 FROM mae.agente_transporte WHERE upper(btrim(nombre)) = v_nombre AND id IS DISTINCT FROM p_id AND eliminado_en IS NULL) THEN
        RAISE EXCEPTION 'Ya existe el agente «%»', v_nombre USING ERRCODE = '23505';
    END IF;
    IF p_id IS NULL THEN
        INSERT INTO mae.agente_transporte (nombre, activo) VALUES (v_nombre, coalesce(p_activo, true)) RETURNING id INTO v_id;
        RETURN v_id;
    END IF;
    UPDATE mae.agente_transporte SET nombre = v_nombre, activo = coalesce(p_activo, true)
     WHERE id = p_id AND eliminado_en IS NULL AND version_fila = p_version RETURNING id INTO v_id;
    IF v_id IS NULL THEN
        RAISE EXCEPTION 'El agente no existe o alguien lo cambió mientras lo editabas: volvé a abrirlo' USING ERRCODE = '40001';
    END IF;
    RETURN v_id;
END $$;

-- -----------------------------------------------------------------------------
-- 2 · Guardar operación: el agente y modificar después de salir
-- -----------------------------------------------------------------------------
DO $do$
DECLARE v text; n text;
BEGIN
    v := pg_get_functiondef('ops.fn_guardar_operacion(bigint,integer,jsonb)'::regprocedure);
    n := replace(v, $a$    v_sin_conf    boolean     := coalesce((d->>'sin_confirmar')::boolean, false);
BEGIN
$a$, $a$    v_sin_conf    boolean     := coalesce((d->>'sin_confirmar')::boolean, false);
    v_agente      bigint      := nullif(d->>'agente_transporte_id', '')::bigint;   -- Migración 137
BEGIN
    IF v_agente IS NOT NULL AND NOT EXISTS (SELECT 1 FROM mae.agente_transporte WHERE id = v_agente AND eliminado_en IS NULL
                                              AND (activo OR id = (SELECT x.agente_transporte_id FROM ops.servicio_comercial x WHERE x.id = p_servicio))) THEN
        RAISE EXCEPTION 'El agente de transporte no existe o está inactivo' USING ERRCODE = '23503';
    END IF;
$a$);
    n := replace(n, $a$booking, referencia_cliente, buque, crt, mic, observacion, km_facturables, contenedor_vacio, guia)$a$,
                    $a$booking, referencia_cliente, buque, crt, mic, observacion, km_facturables, contenedor_vacio, guia, agente_transporte_id)$a$);
    n := replace(n, $a$coalesce((d->>'contenedor_vacio')::boolean, false), upper(nullif(btrim(d->>'guia'), '')))$a$,
                    $a$coalesce((d->>'contenedor_vacio')::boolean, false), upper(nullif(btrim(d->>'guia'), '')), v_agente)$a$);
    -- Se modifica todo mientras no esté facturada ni cancelada
    n := replace(n, $a$    IF s.estado IN ('sin_confirmar','planificado') OR (s.estado = 'entregado' AND EXISTS (SELECT 1 FROM ops.servicio_redline WHERE servicio_id = s.id)) THEN$a$,
                    $a$    -- Migración 137: se modifica todo mientras no esté facturada ni cancelada (también en viaje o entregada)
    IF s.estado IN ('sin_confirmar','planificado','en_curso','entregado') THEN
        IF v_cliente IS DISTINCT FROM s.cliente_id AND ven.fn_factura_de_servicio(s.id) IS NOT NULL THEN
            RAISE EXCEPTION 'La operación % está en una prefactura: sacala de la prefactura antes de cambiar el cliente', s.numero_operacion
                USING ERRCODE = '55000';
        END IF;$a$);
    n := replace(n, $a$               observacion = d->>'observacion',
               km_facturables$a$, $a$               observacion = d->>'observacion',
               agente_transporte_id = CASE WHEN d ? 'agente_transporte_id' THEN v_agente ELSE agente_transporte_id END,
               km_facturables$a$);
    n := replace(n, $a$             WHERE id = v_tramo AND estado = 'planificado';
        END IF;$a$, $a$             WHERE id = v_tramo AND estado = 'planificado';
            -- Migración 137: en un viaje en curso se corrige el lugar de entrega
            UPDATE ops.tramo_operativo SET destino_id = v_entrega WHERE id = v_tramo AND estado = 'en_curso' AND destino_id IS DISTINCT FROM v_entrega;
        END IF;$a$);
    IF n = v OR (length(n) - length(replace(n, 'v_agente', ''))) / length('v_agente') < 5
       OR position('Migración 137: se modifica todo' in n) = 0 OR position('agente_transporte_id = CASE' in n) = 0
       OR position('Migración 137: en un viaje en curso' in n) = 0 THEN
        RAISE EXCEPTION 'No se pudo ajustar ops.fn_guardar_operacion (cambió su texto)';
    END IF;
    EXECUTE n;
END $do$;

-- Operaciones: el agente (id y nombre)
DO $do$
DECLARE f text; v text; n text; acl aclitem[]; dueno oid; a record;
BEGIN
    FOREACH f IN ARRAY ARRAY['ops.fn_operacion(bigint)', 'ops.fn_operaciones(date,date)'] LOOP
        SELECT proacl, proowner INTO acl, dueno FROM pg_proc WHERE oid = f::regprocedure;
        v := pg_get_functiondef(f::regprocedure);
        n := regexp_replace(v, '(RETURNS TABLE\([^\n]*, guia text)\)\n', '\1, agente_transporte_id bigint, agente_transporte text)' || E'\n');
        n := regexp_replace(n, '(\n\s+f\.guia)(\s+FROM f\s)', E'\\1,\n            f.agente_transporte_id, (SELECT ag.nombre FROM mae.agente_transporte ag WHERE ag.id = f.agente_transporte_id)\\2');
        IF n NOT LIKE '%agente_transporte text)%' OR n NOT LIKE '%f.agente_transporte_id, (SELECT ag.nombre%' THEN
            RAISE EXCEPTION 'No se pudo ajustar % (cambió su texto)', f;
        END IF;
        EXECUTE 'DROP FUNCTION ' || f;
        EXECUTE n;
        EXECUTE format('ALTER FUNCTION %s OWNER TO %I', f, pg_get_userbyid(dueno));
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
        FOR a IN SELECT x.grantee FROM aclexplode(acl) x WHERE x.grantee <> 0 AND x.grantee <> dueno LOOP
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %s', f, a.grantee::regrole::text);
        END LOOP;
    END LOOP;
END $do$;

-- -----------------------------------------------------------------------------
-- Permisos
-- -----------------------------------------------------------------------------
DO $do$
DECLARE g text; f text;
BEGIN
    FOREACH f IN ARRAY ARRAY['ops.fn_agentes_transporte(boolean)', 'ops.fn_guardar_agente_transporte(bigint,integer,text,boolean)'] LOOP
        EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', f);
        FOREACH g IN ARRAY ARRAY['anon', 'authenticated'] LOOP
            CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = g);
            EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I', f, g);
        END LOOP;
        FOREACH g IN ARRAY ARRAY['tc_admin', 'tc_app', 'tc_lectura', 'tc_auditor'] LOOP
            CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = g);
            EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', f, g);
        END LOOP;
    END LOOP;
    REVOKE ALL ON TABLE mae.agente_transporte FROM PUBLIC;
    FOR g IN SELECT a.grantee::regrole::text FROM pg_class c, aclexplode(c.relacl) a
              WHERE c.oid = 'mae.linea'::regclass AND a.privilege_type = 'SELECT' AND a.grantee <> 0 AND a.grantee <> c.relowner LOOP
        EXECUTE format('GRANT SELECT ON TABLE mae.agente_transporte TO %s', g);
    END LOOP;
END $do$;

UPDATE ref.parametro SET valor = '137' WHERE codigo = 'web.version_base' AND valor::text::int < 137;

NOTIFY pgrst, 'reload schema';

COMMIT;
