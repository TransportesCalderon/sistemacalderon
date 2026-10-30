-- =============================================================================
-- IronTrack — 134 · Viaje del chofer para un viaje que ya terminó
-- -----------------------------------------------------------------------------
-- Falla (30/10/2026): el cierre CV-000007 (SHXB49, 16/10 → 30/10) no deja cargar la línea.
-- La línea, las operaciones, el canon y los km del chofer van en el VIAJE DEL CHOFER, y ese
-- viaje no tiene uno (la carga del 16/10 es de antes de los viajes automáticos).
-- Arreglo: ops.fn_crear_viaje_pasado(carga de salida, chofer) crea el viaje del chofer de un
-- viaje ya terminado (entre dos cargas a tanque lleno), aunque el tractor ya esté en otro
-- viaje y sin el bloqueo de cierres vencidos (es justamente para cerrarlo). Después se le
-- agregan las operaciones o la línea en su ficha y se cierra como siempre; el cierre de
-- combustible que ya tenga se le asocia solo (misma carga de salida). Si ya tiene viaje de
-- chofer, devuelve ese.
-- web.version_base = 134. No crea datos.
-- =============================================================================
SET search_path = public, extensions;
BEGIN;

DO $do$
BEGIN
    IF to_regprocedure('fue.fn_cierres_pendientes()') IS NULL THEN
        RAISE EXCEPTION 'Falta la migración 133 (118_cierres_obligatorios.sql): aplicarla antes';
    END IF;
END $do$;

CREATE OR REPLACE FUNCTION ops.fn_crear_viaje_pasado(p_carga_salida bigint, p_chofer bigint DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql
SET search_path = pg_catalog, public, extensions AS $$
DECLARE k record; c record; v_sig record; v_chofer bigint; v_id bigint;
BEGIN
    SELECT id, camion_id, chofer_id, fecha_hora INTO k FROM fue.carga_combustible WHERE id = p_carga_salida AND eliminado_en IS NULL;
    IF NOT FOUND OR NOT fue.fn_es_frontera(k.id, k.camion_id) THEN
        RAISE EXCEPTION 'La carga de salida tiene que ser una carga a tanque lleno (corte de viaje) vigente' USING ERRCODE = '23514';
    END IF;
    SELECT patente INTO c FROM mae.camion WHERE id = k.camion_id;
    SELECT * INTO v_sig FROM ops.fn_corte_siguiente(k.camion_id, k.fecha_hora);
    IF v_sig.carga_id IS NULL AND NOT EXISTS (SELECT 1 FROM ops.viaje_chofer v WHERE v.carga_salida_id = k.id AND v.estado <> 'anulado' AND v.eliminado_en IS NULL) THEN
        RAISE EXCEPTION 'El viaje del tractor % todavía no terminó (falta la carga a tanque lleno de llegada): se abre desde la Pizarra', c.patente
            USING ERRCODE = '55000';
    END IF;
    -- Si ya lo tiene, se devuelve ese (la web lo abre para cargarle operaciones y línea)
    SELECT v.id INTO v_id FROM ops.viaje_chofer v WHERE v.carga_salida_id = k.id AND v.estado <> 'anulado' AND v.eliminado_en IS NULL;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;
    v_chofer := coalesce(p_chofer, k.chofer_id, mae.fn_chofer_de_tractor(k.camion_id));
    IF v_chofer IS NULL THEN
        RAISE EXCEPTION 'No se sabe quién manejó: elegí el chofer' USING ERRCODE = '23502';
    END IF;
    -- Es un viaje que ya pasó: no se controla si hoy está en otro viaje, de licencia, etc.
    IF NOT EXISTS (SELECT 1 FROM mae.chofer WHERE id = v_chofer AND eliminado_en IS NULL) THEN
        RAISE EXCEPTION 'El chofer no existe o fue eliminado' USING ERRCODE = 'P0002';
    END IF;
    PERFORM ops.fn_vc_permitir();
    INSERT INTO ops.viaje_chofer (camion_id, chofer_id, carga_salida_id, salida_ts, observacion)
    VALUES (k.camion_id, v_chofer, k.id, k.fecha_hora, 'Viaje ya terminado: se armó para cargarle operaciones y cerrarlo')
    RETURNING id INTO v_id;
    RETURN v_id;
END $$;

-- Permisos: los mismos que iniciar un viaje de chofer
DO $do$
DECLARE g text;
BEGIN
    REVOKE ALL ON FUNCTION ops.fn_crear_viaje_pasado(bigint,bigint) FROM PUBLIC;
    FOREACH g IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = g);
        EXECUTE format('REVOKE ALL ON FUNCTION ops.fn_crear_viaje_pasado(bigint,bigint) FROM %I', g);
    END LOOP;
    FOR g IN SELECT a.grantee::regrole::text FROM pg_proc p, aclexplode(p.proacl) a
              WHERE p.oid = 'ops.fn_iniciar_viaje_chofer(bigint,bigint,bigint,jsonb,text)'::regprocedure
                AND a.privilege_type = 'EXECUTE' AND a.grantee <> 0 AND a.grantee <> p.proowner LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION ops.fn_crear_viaje_pasado(bigint,bigint) TO %s', g);
    END LOOP;
END $do$;

-- «Cierres por hacer»: el viaje sin viaje de chofer dice cómo cargarle la línea
DO $do$
DECLARE v text; n text;
BEGIN
    v := pg_get_functiondef('ops.fn_cierres_por_hacer(integer)'::regprocedure);
    n := replace(v, $a$'faltan_viaje', '[]'::jsonb, 'operaciones_para_agregar', 0,$a$,
                    $a$'faltan_viaje', '["No tiene viaje de chofer (operaciones, línea, canon y km): tocá «Crear el viaje del chofer»"]'::jsonb, 'operaciones_para_agregar', 0,$a$);
    IF n = v THEN RAISE EXCEPTION 'No se pudo ajustar ops.fn_cierres_por_hacer (cambió su texto)'; END IF;
    EXECUTE n;
END $do$;

UPDATE ref.parametro SET valor = '134' WHERE codigo = 'web.version_base' AND valor::text::int < 134;

NOTIFY pgrst, 'reload schema';

COMMIT;
