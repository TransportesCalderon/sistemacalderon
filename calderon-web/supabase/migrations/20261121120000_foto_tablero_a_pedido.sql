-- =============================================================================
-- IronTrack — 297 · La foto del tablero solo cuando la pide Telemetría (Mercedes y Scania)
-- -----------------------------------------------------------------------------
-- Pedido del usuario (21/11/2026): «Los Renault y el Volvo no tienen que subir foto del tablero, eso es solo para
-- Mercedes y Scania, y solo cuando Telemetría lo solicita». Decisión del usuario: un botón en Seguimiento de viajes.
--   · Hasta hoy (285) el chofer no podía pedir dinero si su camión fue a tanque lleno en las últimas 48 h y no subió la
--     foto del tablero, cualquiera fuera el camión. Eso se reemplaza por esto:
--   · tel.pedido_tablero: Telemetría (o TI) le pide la foto al chofer desde Seguimiento de viajes. Se cumple sola cuando
--     el chofer sube una foto del tablero de ese camión después del pedido. Vale tel.tablero_pedido_dias días (7).
--   · Solo se puede pedir para los camiones que no mandan sus datos por la API de Renault o Volvo y que no son de esas
--     marcas (tel.fn_pide_foto_tablero): hoy, los Mercedes y los Scania. La verificación 333 lista camión por camión.
--   · tel.fn_pedir_tablero(viaje, motivo): le avisa al teléfono al chofer que maneja ahora (el que muestra Seguimiento);
--     si ya había uno sin cumplir, no se repite: le vuelve a avisar.
--     tel.fn_anular_pedido_tablero(id). tel.fn_pedidos_tablero() (Seguimiento). tel.fn_mis_pedidos_tablero() (Mi viaje).
--   · fin.fn_trabas_pedido_fondo: el punto 3 pasa a ser «Telemetría le pidió la foto y no la subió» (con el margen de
--     fin.ff_tarea_gracia_horas). Se cambia solo ese bloque de la función viva; el resto queda como esté.
-- No toca datos. web.version_base = 297.
-- =============================================================================
SET search_path = public, extensions;
BEGIN;

DO $do$
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 295 THEN
        RAISE EXCEPTION 'Falta la migración 295 (estimar el llenado con el GPS): aplicarla antes';
    END IF;
    IF to_regclass('tel.pedido_tablero') IS NOT NULL THEN
        RAISE EXCEPTION 'La migración 297 (foto del tablero a pedido de Telemetría) ya está aplicada';
    END IF;
    IF to_regprocedure('fin.fn_trabas_pedido_fondo(bigint)') IS NULL THEN
        RAISE EXCEPTION 'Falta la migración 285 (el chofer no pide dinero si no está al día): aplicarla antes';
    END IF;
    IF to_regprocedure('tel.fn_odometro_por_foto(bigint)') IS NULL OR to_regprocedure('tel.fn_camiones_del_chofer(bigint)') IS NULL
       OR to_regprocedure('ops.fn_avisar(bigint[],text,text,text,text,boolean)') IS NULL OR to_regprocedure('ops.fn_mi_chofer()') IS NULL
       OR to_regprocedure('ops.fn_nombre_chofer(bigint)') IS NULL OR to_regclass('tel.tablero') IS NULL OR to_regclass('ops.viaje_chofer') IS NULL
       OR to_regprocedure('tel.fn_pedir_carga(bigint,bigint,numeric,numeric,numeric,numeric,numeric,numeric,numeric,jsonb,text,text)') IS NULL
       OR to_regprocedure('tel.fn_seguimiento_viajes()') IS NULL OR to_regprocedure('tel.fn_tablero_contexto()') IS NULL
       OR to_regprocedure('tel.fn_chofer_ahora_viaje(bigint)') IS NULL THEN
        RAISE EXCEPTION 'Faltan funciones o tablas que esta migración necesita (tablero, seguimiento, avisos o choferes)';
    END IF;
END $do$;

-- Copia los permisos de ejecución de una función a otra: solo roles tc_* (nunca tc_cliente) y authenticated
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

INSERT INTO ref.parametro (codigo, valor, descripcion) VALUES
 ('tel.tablero_pedido_dias', '7', 'Migración 297: días que vale el pedido de la foto del tablero que hace Telemetría (después ya no frena el pedido de dinero).')
ON CONFLICT (codigo) DO NOTHING;

-- 1 · El pedido -------------------------------------------------------------------------------------
CREATE TABLE tel.pedido_tablero (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    camion_id bigint NOT NULL REFERENCES mae.camion (id),
    viaje_id bigint REFERENCES ops.viaje_chofer (id),
    chofer_id bigint REFERENCES mae.chofer (id),
    motivo text,
    pedido_por bigint NOT NULL,
    pedido_en timestamptz NOT NULL DEFAULT now(),
    avisado_en timestamptz,
    anulado_por bigint,
    anulado_en timestamptz,
    CONSTRAINT ck_pedido_tablero_motivo CHECK (motivo IS NULL OR length(motivo) <= 300)
);
CREATE INDEX ix_pedido_tablero_camion ON tel.pedido_tablero (camion_id, pedido_en DESC) WHERE anulado_en IS NULL;
CREATE INDEX ix_pedido_tablero_chofer ON tel.pedido_tablero (chofer_id, pedido_en DESC) WHERE anulado_en IS NULL;
COMMENT ON TABLE tel.pedido_tablero IS
    'Migración 297: Telemetría le pide al chofer la foto del tablero (solo Mercedes y Scania). Se cumple cuando sube una foto de ese camión después del pedido.';
REVOKE ALL ON tel.pedido_tablero FROM PUBLIC;

-- Si a ese camión se le puede pedir la foto: no manda sus datos por la API de Renault o Volvo ni es de esas marcas
CREATE FUNCTION tel.fn_pide_foto_tablero(p_camion bigint)
RETURNS boolean
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT EXISTS (SELECT 1 FROM mae.camion c WHERE c.id = p_camion AND c.eliminado_en IS NULL
                      AND coalesce(c.marca, '') !~* '(renault|volvo)')
       AND tel.fn_odometro_por_foto(p_camion)
$f$;
COMMENT ON FUNCTION tel.fn_pide_foto_tablero(bigint) IS
    'Migración 297: true si Telemetría le puede pedir la foto del tablero a ese camión (hoy, Mercedes y Scania: sin la API de Renault o Volvo).';
REVOKE ALL ON FUNCTION tel.fn_pide_foto_tablero(bigint) FROM PUBLIC;

-- Cuándo llegó la foto del pedido (NULL = todavía no la subió)
CREATE FUNCTION tel.fn_pedido_tablero_recibido(p_pedido bigint)
RETURNS timestamptz
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT min(t.creado_en)
      FROM tel.pedido_tablero p
      JOIN tel.tablero t ON t.camion_id = p.camion_id AND t.anulado_en IS NULL AND t.creado_en >= p.pedido_en
     WHERE p.id = p_pedido
$f$;
COMMENT ON FUNCTION tel.fn_pedido_tablero_recibido(bigint) IS 'Migración 297: cuándo subió el chofer la foto pedida (NULL = todavía no).';
REVOKE ALL ON FUNCTION tel.fn_pedido_tablero_recibido(bigint) FROM PUBLIC;

-- 2 · Pedir y cancelar (Telemetría o TI) ------------------------------------------------------------
CREATE FUNCTION tel.fn_pedir_tablero(p_viaje bigint, p_motivo text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE
    v_usr bigint := aud.fn_usuario_actual(); v ops.viaje_chofer%ROWTYPE; v_chofer bigint; v_pat text; v_motivo text; v_id bigint;
    v_nuevo boolean := false;
BEGIN
    IF v_usr IS NULL OR NOT EXISTS (SELECT 1 FROM seg.usuario_rol WHERE usuario_id = v_usr AND rol_codigo IN ('analista_control', 'ti')) THEN
        RAISE EXCEPTION 'La foto del tablero la pide Telemetría o TI' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v FROM ops.viaje_chofer WHERE id = p_viaje AND eliminado_en IS NULL;
    IF v.id IS NULL THEN RAISE EXCEPTION 'El viaje no existe' USING ERRCODE = 'P0002'; END IF;
    IF v.estado <> 'abierto' THEN RAISE EXCEPTION 'El viaje ya no está en curso' USING ERRCODE = '55000'; END IF;
    SELECT patente INTO v_pat FROM mae.camion WHERE id = v.camion_id;
    IF NOT tel.fn_pide_foto_tablero(v.camion_id) THEN
        RAISE EXCEPTION 'El % manda sus datos por la API de Renault o Volvo: no hace falta la foto del tablero', coalesce(v_pat, 'camión')
            USING ERRCODE = '22023';
    END IF;
    -- El chofer que maneja ahora (el mismo que muestra Seguimiento); si no se sabe, el del viaje
    v_chofer := coalesce(tel.fn_chofer_ahora_viaje(v.id), v.chofer_id);
    IF v_chofer IS NULL THEN RAISE EXCEPTION 'El viaje no tiene chofer: no hay a quién pedirle la foto' USING ERRCODE = '22023'; END IF;
    v_motivo := nullif(btrim(coalesce(p_motivo, '')), '');
    IF length(v_motivo) > 300 THEN RAISE EXCEPTION 'El motivo es muy largo (hasta 300 letras)' USING ERRCODE = '22023'; END IF;

    -- Si ya hay uno sin cumplir para ese camión y ese chofer, no se repite: se le vuelve a avisar
    SELECT p.id INTO v_id FROM tel.pedido_tablero p
     WHERE p.camion_id = v.camion_id AND p.chofer_id = v_chofer AND p.anulado_en IS NULL
       AND p.pedido_en > now() - make_interval(days => greatest(coalesce(ref.fn_parametro_num('tel.tablero_pedido_dias', 7), 7), 1)::int)
       AND tel.fn_pedido_tablero_recibido(p.id) IS NULL
     ORDER BY p.pedido_en DESC LIMIT 1;
    IF v_id IS NULL THEN
        INSERT INTO tel.pedido_tablero (camion_id, viaje_id, chofer_id, motivo, pedido_por)
        VALUES (v.camion_id, v.id, v_chofer, v_motivo, v_usr) RETURNING id INTO v_id;
        v_nuevo := true;
    ELSIF v_motivo IS NOT NULL THEN
        UPDATE tel.pedido_tablero SET motivo = v_motivo WHERE id = v_id;
    END IF;

    PERFORM ops.fn_avisar(
        ARRAY(SELECT u.id FROM seg.usuario u WHERE u.chofer_id = v_chofer AND u.activo),
        'pedido_tablero:' || v_id || ':' || to_char(clock_timestamp(), 'YYYYMMDDHH24MISS'),
        'Telemetría te pide la foto del tablero',
        concat_ws(' · ', 'Del ' || v_pat, v_motivo, 'Subila en Mi viaje › Foto del tablero'),
        '/mi-viaje?ver=tablero', true);
    UPDATE tel.pedido_tablero SET avisado_en = now() WHERE id = v_id;
    RETURN jsonb_build_object('id', v_id, 'nuevo', v_nuevo);
END $f$;
COMMENT ON FUNCTION tel.fn_pedir_tablero(bigint, text) IS
    'Migración 297: Telemetría o TI le pide la foto del tablero al chofer que maneja el camión (solo Mercedes y Scania) y le avisa al teléfono.';

CREATE FUNCTION tel.fn_anular_pedido_tablero(p_id bigint)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_usr bigint := aud.fn_usuario_actual();
BEGIN
    IF v_usr IS NULL OR NOT EXISTS (SELECT 1 FROM seg.usuario_rol WHERE usuario_id = v_usr AND rol_codigo IN ('analista_control', 'ti')) THEN
        RAISE EXCEPTION 'El pedido de la foto lo cancela Telemetría o TI' USING ERRCODE = '42501';
    END IF;
    UPDATE tel.pedido_tablero SET anulado_en = now(), anulado_por = v_usr WHERE id = p_id AND anulado_en IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'El pedido no existe o ya estaba cancelado' USING ERRCODE = 'P0002'; END IF;
END $f$;
COMMENT ON FUNCTION tel.fn_anular_pedido_tablero(bigint) IS 'Migración 297: cancela un pedido de la foto del tablero (deja de frenar el pedido de dinero).';

-- 3 · Lo que se ve --------------------------------------------------------------------------------
-- Seguimiento de viajes: a qué camiones se les puede pedir y los pedidos de los últimos días
CREATE FUNCTION tel.fn_pedidos_tablero()
RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT jsonb_build_object(
        'dias', greatest(coalesce(ref.fn_parametro_num('tel.tablero_pedido_dias', 7), 7), 1)::int,
        'por_foto', coalesce((SELECT jsonb_agg(c.id ORDER BY c.id) FROM mae.camion c
                               WHERE c.eliminado_en IS NULL AND tel.fn_pide_foto_tablero(c.id)), '[]'),
        'pedidos', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                       'id', p.id, 'camion_id', p.camion_id, 'viaje_id', p.viaje_id, 'chofer_id', p.chofer_id,
                       'chofer', ops.fn_nombre_chofer(p.chofer_id), 'motivo', p.motivo, 'pedido_en', p.pedido_en,
                       'pedido_por', (SELECT u.nombre FROM seg.usuario u WHERE u.id = p.pedido_por),
                       'recibido_en', tel.fn_pedido_tablero_recibido(p.id)) ORDER BY p.pedido_en DESC)
              FROM tel.pedido_tablero p
             WHERE p.anulado_en IS NULL
               AND p.pedido_en > now() - make_interval(days => greatest(coalesce(ref.fn_parametro_num('tel.tablero_pedido_dias', 7), 7), 1)::int)), '[]'))
$f$;
COMMENT ON FUNCTION tel.fn_pedidos_tablero() IS 'Migración 297: para Seguimiento de viajes, los camiones a los que se les pide la foto y los pedidos vigentes.';

-- Mi viaje: lo que Telemetría le pidió al chofer y todavía no subió
CREATE FUNCTION tel.fn_mis_pedidos_tablero()
RETURNS jsonb
LANGUAGE sql STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', p.id, 'camion_id', p.camion_id, 'patente', m.patente, 'motivo', p.motivo,
                                                 'pedido_en', p.pedido_en) ORDER BY p.pedido_en), '[]')
      FROM tel.pedido_tablero p JOIN mae.camion m ON m.id = p.camion_id
     WHERE ops.fn_mi_chofer() IS NOT NULL AND p.anulado_en IS NULL
       AND (p.chofer_id = ops.fn_mi_chofer()
            OR (p.chofer_id IS NULL AND p.camion_id IN (SELECT tel.fn_camiones_del_chofer(ops.fn_mi_chofer()))))
       AND p.pedido_en > now() - make_interval(days => greatest(coalesce(ref.fn_parametro_num('tel.tablero_pedido_dias', 7), 7), 1)::int)
       AND tel.fn_pide_foto_tablero(p.camion_id)
       AND tel.fn_pedido_tablero_recibido(p.id) IS NULL
$f$;
COMMENT ON FUNCTION tel.fn_mis_pedidos_tablero() IS 'Migración 297: las fotos del tablero que Telemetría le pidió al chofer y todavía no subió.';

-- Permisos: pedir y cancelar como la solicitud de carga; la lista como Seguimiento; lo del chofer como su tablero
SELECT pg_temp.fn_copiar_permisos('tel.fn_pedir_carga(bigint,bigint,numeric,numeric,numeric,numeric,numeric,numeric,numeric,jsonb,text,text)',
                                  'tel.fn_pedir_tablero(bigint,text)');
SELECT pg_temp.fn_copiar_permisos('tel.fn_pedir_carga(bigint,bigint,numeric,numeric,numeric,numeric,numeric,numeric,numeric,jsonb,text,text)',
                                  'tel.fn_anular_pedido_tablero(bigint)');
SELECT pg_temp.fn_copiar_permisos('tel.fn_seguimiento_viajes()', 'tel.fn_pedidos_tablero()');
SELECT pg_temp.fn_copiar_permisos('tel.fn_tablero_contexto()', 'tel.fn_mis_pedidos_tablero()');

-- 4 · El freno del pedido de dinero: el punto 3 de fin.fn_trabas_pedido_fondo -------------------------
DO $do$
DECLARE
    v_def text := pg_get_functiondef('fin.fn_trabas_pedido_fondo(bigint)'::regprocedure);
    v_ini int; v_fin int;
    c_ini CONSTANT text := '    -- 3 · Foto del tablero después de una carga a tanque lleno (últimas 48 h)';
    c_fin CONSTANT text := '    -- 4 · Acta de un cierre de viaje sin firmar';
    v_nuevo CONSTANT text := $b$    -- 3 · Migración 297: la foto del tablero que pidió Telemetría (solo Mercedes y Scania) y el chofer no subió
    FOR r IN
        SELECT m.patente, p.pedido_en
          FROM tel.pedido_tablero p JOIN mae.camion m ON m.id = p.camion_id
         WHERE p.anulado_en IS NULL
           AND (p.chofer_id = p_chofer OR (p.chofer_id IS NULL AND p.camion_id IN (SELECT tel.fn_camiones_del_chofer(p_chofer))))
           AND p.pedido_en < now() - v_gracia
           AND p.pedido_en > now() - make_interval(days => greatest(coalesce(ref.fn_parametro_num('tel.tablero_pedido_dias', 7), 7), 1)::int)
           AND tel.fn_pide_foto_tablero(p.camion_id)
           AND tel.fn_pedido_tablero_recibido(p.id) IS NULL
         ORDER BY p.pedido_en
    LOOP
        t := t || jsonb_build_object('tipo', 'tablero', 'texto',
            format('Subí la foto del tablero del %s que te pidió Telemetría el %s.', r.patente,
                   to_char(r.pedido_en AT TIME ZONE 'America/Argentina/Mendoza', 'DD/MM HH24:MI')));
    END LOOP;

$b$;
BEGIN
    IF (length(v_def) - length(replace(v_def, c_ini, ''))) / length(c_ini) <> 1
       OR (length(v_def) - length(replace(v_def, c_fin, ''))) / length(c_fin) <> 1 THEN
        RAISE EXCEPTION 'fin.fn_trabas_pedido_fondo cambió (no se encontró el punto 3 de la foto del tablero): no se aplicó nada';
    END IF;
    v_ini := strpos(v_def, c_ini);
    v_fin := strpos(v_def, c_fin);
    IF v_fin <= v_ini THEN RAISE EXCEPTION 'fin.fn_trabas_pedido_fondo cambió (orden inesperado): no se aplicó nada'; END IF;
    EXECUTE substr(v_def, 1, v_ini - 1) || v_nuevo || substr(v_def, v_fin);
END $do$;

UPDATE ref.parametro SET valor = '297' WHERE codigo = 'web.version_base' AND valor::text::int < 297;

COMMIT;

NOTIFY pgrst, 'reload schema';

SELECT 'migración 297 aplicada' AS que, (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base,
       (SELECT string_agg(c.patente, ', ' ORDER BY c.patente) FROM mae.camion c WHERE c.eliminado_en IS NULL AND tel.fn_pide_foto_tablero(c.id))
           AS camiones_con_foto;
