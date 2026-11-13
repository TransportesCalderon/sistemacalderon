-- =============================================================================
-- IronTrack — 261 · Cambio 251 · La Pizarra Azul no pasa sola a la siguiente operación
-- -----------------------------------------------------------------------------
-- Hasta ahora, al marcar «Entregó» el viaje del semi se cerraba y la Pizarra mostraba en esa
-- fila la próxima operación planificada del equipo (semi, tractor y chofer).
-- Desde ahora:
--   · Al entregar, si el semi ya tiene la próxima planificada, la fila sigue mostrando la
--     operación entregada, con estado «Entregado». La próxima se ve en «Próxima carga».
--   · Pasa a la siguiente cuando alguien da el OK («Pasar a la siguiente»). Lo pueden hacer
--     los mismos que mueven los pasos de la operación.
--   · Si el viaje siguiente arranca antes (se inicia desde Operación), la fila muestra ese viaje.
--   · Si no tiene próxima planificada, queda como antes (disponible con su tractor y chofer).
--   · Las entregas anteriores a este cambio quedan como están.
-- No cambia ninguna operación ni viaje: solo lo que muestra la Pizarra. web.version_base = 261.
-- =============================================================================
SET search_path = public, extensions;
BEGIN;

DO $do$
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 260 THEN
        RAISE EXCEPTION 'Falta la migración 260 (cambio 250): aplicarla antes';
    END IF;
    IF to_regclass('ops.pizarra_espera') IS NOT NULL THEN
        RAISE EXCEPTION 'La migración 261 (OK para pasar a la siguiente) ya está aplicada';
    END IF;
END $do$;

-- -----------------------------------------------------------------------------
-- 1 · Entregas que esperan el OK
-- -----------------------------------------------------------------------------
CREATE TABLE ops.pizarra_espera (
    id               bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    semirremolque_id bigint NOT NULL REFERENCES mae.semirremolque(id) ON DELETE RESTRICT,
    tramo_id         bigint NOT NULL REFERENCES ops.tramo_operativo(id) ON DELETE RESTRICT,
    servicio_id      bigint REFERENCES ops.servicio_comercial(id) ON DELETE RESTRICT,
    entregado_ts     timestamptz NOT NULL,
    creado_en        timestamptz NOT NULL DEFAULT now(),
    creado_por       bigint REFERENCES seg.usuario(id) ON DELETE RESTRICT DEFAULT aud.fn_usuario_actual(),
    ok_en            timestamptz,
    ok_por           bigint REFERENCES seg.usuario(id) ON DELETE RESTRICT,
    CONSTRAINT ck_pizarra_espera_ok CHECK ((ok_en IS NULL) = (ok_por IS NULL)),
    CONSTRAINT ux_pizarra_espera UNIQUE (semirremolque_id, tramo_id)
);
CREATE INDEX ix_pizarra_espera_pendiente ON ops.pizarra_espera (semirremolque_id, entregado_ts DESC) WHERE ok_en IS NULL;
COMMENT ON TABLE ops.pizarra_espera IS 'Migración 261: entrega de un semi que espera el OK para que la Pizarra muestre la operación siguiente.';
CREATE TRIGGER tg_90_auditoria AFTER INSERT OR DELETE OR UPDATE ON ops.pizarra_espera FOR EACH ROW EXECUTE FUNCTION aud.fn_auditar();

-- Los mismos permisos de tabla que ops.desenganche (la escriben funciones que corren con el usuario)
DO $do$
DECLARE r record;
BEGIN
    REVOKE ALL ON ops.pizarra_espera FROM PUBLIC;
    FOR r IN SELECT CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(x.grantee)) END AS rol, x.privilege_type AS priv
               FROM pg_class c, aclexplode(c.relacl) x
              WHERE c.oid = 'ops.desenganche'::regclass AND x.grantee <> c.relowner LOOP
        EXECUTE format('GRANT %s ON ops.pizarra_espera TO %s', r.priv, r.rol);
    END LOOP;
END $do$;

-- -----------------------------------------------------------------------------
-- 2 · Al entregar se anota la espera (solo cambia ops.fn_terminar_descarga: se toma la
--     versión que está en la base y se le agrega el registro después de pasar a «entregado»)
-- -----------------------------------------------------------------------------
DO $do$
DECLARE
    f regprocedure := 'ops.fn_terminar_descarga(bigint,timestamptz,numeric)';
    v_def text; n int;
    v_ancla constant text := 'UPDATE ops.servicio_comercial SET estado = ''entregado'', fecha_real_fin = v_fin WHERE id = v_serv AND estado = ''en_curso'';';
    v_nuevo constant text := E'\n        -- Migración 261: el semi espera el OK para pasar a la siguiente en la Pizarra'
        || E'\n        INSERT INTO ops.pizarra_espera (semirremolque_id, tramo_id, servicio_id, entregado_ts)'
        || E'\n        SELECT ts.semirremolque_id, p_tramo, v_serv, v_fin FROM ops.tramo_semirremolque ts'
        || E'\n         WHERE ts.tramo_id = p_tramo AND ts.eliminado_en IS NULL'
        || E'\n        ON CONFLICT (semirremolque_id, tramo_id) DO NOTHING;';
BEGIN
    v_def := pg_get_functiondef(f);
    n := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);
    IF n <> 1 THEN
        RAISE EXCEPTION 'En ops.fn_terminar_descarga el paso a «entregado» aparece % veces (se esperaba 1): avisar antes de seguir', n;
    END IF;
    EXECUTE replace(v_def, v_ancla, v_ancla || v_nuevo);
    IF position('pizarra_espera' IN (SELECT prosrc FROM pg_proc WHERE oid = f)) = 0 THEN
        RAISE EXCEPTION 'No se pudo cambiar ops.fn_terminar_descarga';
    END IF;
END $do$;

-- -----------------------------------------------------------------------------
-- 3 · La Pizarra: con la espera pendiente y la próxima planificada, muestra la entregada
--     (estado «entregado»). Se cambian solo cuatro líneas de ops.fn_pizarra().
-- -----------------------------------------------------------------------------
DO $do$
DECLARE
    f regprocedure := 'ops.fn_pizarra()';
    v_def text; n int; i int;
    a text[] := ARRAY[
        -- a) la espera pendiente del semi (si después no arrancó otro viaje y tiene la próxima planificada)
        '      LEFT JOIN viajes v ON v.semirremolque_id = s.id AND v.orden = 1',
        -- b) la operación entregada en lugar de la del relevo (si no hay viaje)
        '      LEFT JOIN ops.servicio_comercial se ON se.id = esp.servicio_id',
        -- c) salida, origen y destino de la entregada
        '           v.inicio_real, v.inicio_planificado, v.origen_id, v.destino_id,',
        -- d) el estado
        '               WHEN b.tramo_id IS NULL         THEN ''disponible'''];
    b text[] := ARRAY[
        E'      -- Migración 261: entregó y ya tiene la próxima planificada: la fila espera el OK para pasar a la siguiente\n'
        || E'      LEFT JOIN LATERAL (SELECT pe.servicio_id, pe.tramo_id FROM ops.pizarra_espera pe\n'
        || E'                          WHERE pe.semirremolque_id = s.id AND pe.ok_en IS NULL\n'
        || E'                            AND EXISTS (SELECT 1 FROM viajes vv WHERE vv.semirremolque_id = s.id AND vv.estado = ''planificado'')\n'
        || E'                            AND NOT EXISTS (SELECT 1 FROM ops.tramo_semirremolque x JOIN ops.tramo_operativo t2 ON t2.id = x.tramo_id\n'
        || E'                                             WHERE x.semirremolque_id = s.id AND x.eliminado_en IS NULL AND t2.eliminado_en IS NULL\n'
        || E'                                               AND t2.id <> pe.tramo_id AND t2.inicio_real >= pe.entregado_ts)\n'
        || E'                          ORDER BY pe.entregado_ts DESC LIMIT 1) pend ON true\n'
        || E'      LEFT JOIN viajes v ON v.semirremolque_id = s.id AND v.orden = 1 AND NOT (v.estado = ''planificado'' AND pend.tramo_id IS NOT NULL)\n'
        || E'      LEFT JOIN ops.tramo_operativo ent_t ON ent_t.id = pend.tramo_id AND v.id IS NULL',
        '      LEFT JOIN ops.servicio_comercial se ON se.id = coalesce(esp.servicio_id, CASE WHEN v.id IS NULL THEN pend.servicio_id END)',
        '           coalesce(v.inicio_real, ent_t.inicio_real) AS inicio_real, v.inicio_planificado, coalesce(v.origen_id, ent_t.origen_id) AS origen_id, '
        || E'coalesce(v.destino_id, ent_t.destino_id) AS destino_id,\n'
        || '           ent_t.id AS entregado_tramo_id,',
        E'               WHEN b.tramo_id IS NULL AND b.entregado_tramo_id IS NOT NULL THEN ''entregado''   -- Migración 261\n'
        || '               WHEN b.tramo_id IS NULL         THEN ''disponible'''];
BEGIN
    v_def := pg_get_functiondef(f);
    FOR i IN 1 .. array_length(a, 1) LOOP
        n := (length(v_def) - length(replace(v_def, a[i], ''))) / length(a[i]);
        IF n <> 1 THEN
            RAISE EXCEPTION 'En ops.fn_pizarra la línea % aparece % veces (se esperaba 1): avisar antes de seguir', a[i], n;
        END IF;
        v_def := replace(v_def, a[i], b[i]);
    END LOOP;
    EXECUTE v_def;
END $do$;

-- -----------------------------------------------------------------------------
-- 4 · El OK: «Pasar a la siguiente»
-- -----------------------------------------------------------------------------
CREATE FUNCTION ops.fn_pizarra_pasar_siguiente(p_semi bigint)
RETURNS void LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $fn$
DECLARE v_usr bigint := aud.fn_usuario_actual();
BEGIN
    IF v_usr IS NULL THEN RAISE EXCEPTION 'Dar el OK exige un usuario identificado' USING ERRCODE = '42501'; END IF;
    UPDATE ops.pizarra_espera SET ok_en = now(), ok_por = v_usr
     WHERE semirremolque_id = p_semi AND ok_en IS NULL;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Este semi no está esperando el OK: ya pasó a la siguiente' USING ERRCODE = '55000';
    END IF;
END $fn$;
-- Los mismos que mueven los pasos de la operación (ops.fn_avanzar)
DO $do$
DECLARE g text;
BEGIN
    REVOKE ALL ON FUNCTION ops.fn_pizarra_pasar_siguiente(bigint) FROM PUBLIC;
    FOREACH g IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = g);
        EXECUTE format('REVOKE ALL ON FUNCTION ops.fn_pizarra_pasar_siguiente(bigint) FROM %I', g);
    END LOOP;
    FOR g IN SELECT DISTINCT CASE WHEN x.grantee = 0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(x.grantee)) END
               FROM pg_proc p, aclexplode(p.proacl) x
              WHERE p.oid = 'ops.fn_avanzar(bigint,text,timestamptz,numeric,text)'::regprocedure AND x.privilege_type = 'EXECUTE' LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION ops.fn_pizarra_pasar_siguiente(bigint) TO %s', g);
    END LOOP;
    IF (SELECT proacl FROM pg_proc WHERE oid = 'ops.fn_avanzar(bigint,text,timestamptz,numeric,text)'::regprocedure) IS NULL THEN
        GRANT EXECUTE ON FUNCTION ops.fn_pizarra_pasar_siguiente(bigint) TO PUBLIC;
    END IF;
END $do$;

UPDATE ref.parametro SET valor = '261' WHERE codigo = 'web.version_base' AND valor::text::int < 261;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'migración 261 aplicada' AS que, (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base,
       (SELECT count(*) FROM ops.fn_pizarra()) AS filas_pizarra;
