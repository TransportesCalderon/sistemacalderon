-- =====================================================================================
-- Migración 381 · Si se anula la carga de salida de un viaje abierto y se registra la buena, el viaje toma la buena
-- =====================================================================================
-- Caso (27/11/2026): VC-000067 (SWTB72, Jabdor). La salida se registró el 19/11 19:56 (carga 148, Shell Lo Espejo).
-- Estaba mal: la anularon y la registraron de nuevo el 18/11 19:56 (carga 150). El viaje siguió con la carga 148
-- anulada, y el seguimiento (Telemetría) medía «desde la salida» del 19/11.
--
--   · ops.fn_viaje_corregir_salida(camión): cada viaje abierto del camión cuya carga de salida está anulada o
--     borrada pasa a la carga que la reemplaza:
--       - la que la reemplaza con «anula_id»; si no hay,
--       - la única carga de corte de viaje vigente del mismo camión a 3 días o menos de la anulada, que no sea la salida
--         de otro viaje o cierre (sí puede ser la llegada del viaje anterior: la carga a tanque lleno cierra uno y abre otro).
--     Si hay más de una posible, no elige: lo deja como estaba. Devuelve lo que cambió.
--   · Corre sola (tg_59_viaje_sigue_salida) cuando se registra una carga de corte, se anula una carga o le cambian la
--     fecha. Si falla, no frena la carga (solo un aviso en el registro).
--   · ops.viaje_chofer: la carga de salida sigue sin poder cambiarse a mano. Solo la cambia esta función
--     (tg_30_inmutables pasa a ops.fn_viaje_chofer_inmutables, con las mismas columnas).
-- No toca datos: VC-000067 se arregla con el script 382. Se puede correr más de una vez.
-- =====================================================================================
BEGIN;

-- Lo que no cambia en un viaje: número, camión y carga de salida (esta solo la cambia ops.fn_viaje_corregir_salida)
CREATE OR REPLACE FUNCTION ops.fn_viaje_chofer_inmutables()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    IF NEW.numero IS DISTINCT FROM OLD.numero OR NEW.camion_id IS DISTINCT FROM OLD.camion_id
       OR (NEW.carga_salida_id IS DISTINCT FROM OLD.carga_salida_id AND coalesce(current_setting('ops.viaje_salida_fn', true), '') <> '1') THEN
        RAISE EXCEPTION 'La columna ops.viaje_chofer (número, camión o carga de salida) es inmutable (id=%): registrar anulación, nueva versión o nueva vigencia',
            OLD.id USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS tg_30_inmutables ON ops.viaje_chofer;
CREATE TRIGGER tg_30_inmutables BEFORE UPDATE ON ops.viaje_chofer FOR EACH ROW EXECUTE FUNCTION ops.fn_viaje_chofer_inmutables();

CREATE OR REPLACE FUNCTION ops.fn_viaje_corregir_salida(p_camion bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE v record; c fue.carga_combustible%ROWTYPE; v_n int; r jsonb := '[]'::jsonb;
BEGIN
    FOR v IN SELECT vc.id, vc.numero, vc.carga_salida_id, vc.salida_ts
               FROM ops.viaje_chofer vc JOIN fue.carga_combustible s ON s.id = vc.carga_salida_id
              WHERE vc.camion_id = p_camion AND vc.estado = 'abierto' AND vc.eliminado_en IS NULL
                AND (s.estado_validacion = 'anulada' OR s.eliminado_en IS NOT NULL)
              FOR UPDATE OF vc LOOP
        c := NULL;
        -- 1 · la que la reemplaza (anula_id), siguiendo la cadena hasta una vigente
        WITH RECURSIVE cad AS (
            SELECT x.* FROM fue.carga_combustible x WHERE x.anula_id = v.carga_salida_id
            UNION ALL
            SELECT x.* FROM fue.carga_combustible x JOIN cad ON x.anula_id = cad.id)
        SELECT * INTO c FROM cad WHERE cad.estado_validacion <> 'anulada' AND cad.eliminado_en IS NULL AND cad.es_frontera
         ORDER BY cad.id DESC LIMIT 1;
        -- 2 · si no, la única carga de corte vigente del camión a 3 días o menos
        IF c.id IS NULL THEN
            SELECT count(*) INTO v_n FROM fue.carga_combustible x
             WHERE x.camion_id = p_camion AND x.es_frontera AND x.estado_validacion <> 'anulada' AND x.eliminado_en IS NULL
               AND abs(extract(epoch FROM x.fecha_hora - v.salida_ts)) <= 3 * 86400
               AND NOT EXISTS (SELECT 1 FROM ops.viaje_chofer o WHERE o.carga_salida_id = x.id
                                  AND o.estado <> 'anulado' AND o.eliminado_en IS NULL)
               AND NOT EXISTS (SELECT 1 FROM fue.cierre_viaje k WHERE k.carga_salida_id = x.id
                                  AND k.estado <> 'anulado' AND k.eliminado_en IS NULL);
            IF v_n = 1 THEN
                SELECT x.* INTO c FROM fue.carga_combustible x
                 WHERE x.camion_id = p_camion AND x.es_frontera AND x.estado_validacion <> 'anulada' AND x.eliminado_en IS NULL
                   AND abs(extract(epoch FROM x.fecha_hora - v.salida_ts)) <= 3 * 86400
                   AND NOT EXISTS (SELECT 1 FROM ops.viaje_chofer o WHERE o.carga_salida_id = x.id
                                      AND o.estado <> 'anulado' AND o.eliminado_en IS NULL)
                   AND NOT EXISTS (SELECT 1 FROM fue.cierre_viaje k WHERE k.carga_salida_id = x.id
                                      AND k.estado <> 'anulado' AND k.eliminado_en IS NULL);
            END IF;
        END IF;
        IF c.id IS NULL OR c.camion_id <> p_camion OR c.fecha_hora > now() THEN CONTINUE; END IF;

        PERFORM set_config('ops.viaje_salida_fn', '1', true);
        PERFORM set_config('ops.viaje_chofer_fn', '1', true);
        UPDATE ops.viaje_chofer SET carga_salida_id = c.id, salida_ts = c.fecha_hora WHERE id = v.id;
        PERFORM set_config('ops.viaje_salida_fn', '', true);
        r := r || jsonb_build_object('viaje', v.numero, 'carga_anulada', v.carga_salida_id, 'carga_nueva', c.id,
                                     'salida_antes', v.salida_ts, 'salida_ahora', c.fecha_hora);
    END LOOP;
    RETURN r;
END $function$;
REVOKE ALL ON FUNCTION ops.fn_viaje_corregir_salida(bigint) FROM PUBLIC;

-- Corre sola al registrar una carga de corte, al anular una carga o al cambiarle la fecha
CREATE OR REPLACE FUNCTION ops.fn_tg_viaje_sigue_salida()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE r jsonb;
BEGIN
    IF NEW.camion_id IS NULL THEN RETURN NULL; END IF;
    BEGIN
        r := ops.fn_viaje_corregir_salida(NEW.camion_id);
        IF jsonb_array_length(r) > 0 THEN RAISE NOTICE 'Viaje con la salida corregida: %', r; END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'No se corrigió la salida del viaje del camión %: %', NEW.camion_id, SQLERRM;
    END;
    RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS tg_59_viaje_sigue_salida ON fue.carga_combustible;
CREATE TRIGGER tg_59_viaje_sigue_salida AFTER INSERT OR UPDATE OF es_frontera, estado_validacion, fecha_hora, eliminado_en ON fue.carga_combustible
    FOR EACH ROW EXECUTE FUNCTION ops.fn_tg_viaje_sigue_salida();

NOTIFY pgrst, 'reload schema';

COMMIT;

-- Viajes abiertos que hoy tienen la salida en una carga anulada (el script 382 los corrige)
SELECT 'Listo: si se anula la carga de salida de un viaje abierto y se registra la buena, el viaje toma la buena' AS resultado,
       (SELECT string_agg(vc.numero, ', ') FROM ops.viaje_chofer vc JOIN fue.carga_combustible s ON s.id = vc.carga_salida_id
         WHERE vc.estado = 'abierto' AND vc.eliminado_en IS NULL AND (s.estado_validacion = 'anulada' OR s.eliminado_en IS NOT NULL))
           AS viajes_abiertos_con_salida_anulada;
