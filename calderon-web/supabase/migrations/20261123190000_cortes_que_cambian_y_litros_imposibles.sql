-- =============================================================================
-- IronTrack — 298 · Si cambia un corte de viaje, los viajes y los cierres se acomodan solos; litros imposibles no entran
-- -----------------------------------------------------------------------------
-- Pedido del usuario (23/11/2026), con el SHXB49: «no me deja cerrar el viaje porque figura esto» (Este camión ya tiene
-- un cierre que se superpone con ese viaje) y «Marea mucho el tema de los cierres pendientes, viajes abiertos, etc.
-- Hay que simplificar un poco».
-- Qué pasó: la carga #161 se registró a mano desde una orden con 11.992 L (el punto separa los miles: once mil litros)
-- y como corte de viaje. El sistema armó solo un viaje del chofer y un borrador de cierre que salían de ella. Cuando se
-- anuló la carga nada de eso se acomodó: el borrador anterior seguía llegando a la #161 y, al guardarlo, chocaba con el
-- borrador que salía de la #161.
--   · fue.fn_acomodar_viajes_camion(camión, motivo): ordena los viajes y los cierres sin aprobar de un camión según sus
--     cortes vigentes:
--       1. viajes del chofer abiertos que salen de una carga que ya no es corte y no tienen nada cargado (operaciones,
--          gastos, fondos ni órdenes de carga): se anulan, y con ellos su borrador de cierre (regla de siempre);
--       2. borradores de cierre que salen de una carga que ya no es corte: se anulan;
--       3. borradores cuya llegada ya no es la vigente: toman la llegada vigente (lo que antes pedía «guardá el borrador
--          de nuevo para tomar la llegada vigente»);
--       4. viajes cerrados, sin cierre aprobado, que llegaban a una carga que ya no es corte: toman la llegada vigente.
--     Nunca toca cierres aprobados ni viajes con datos cargados. Devuelve lo que hizo.
--   · tg_61_cortes_acomodar (fue.carga_combustible): cuando una carga deja de ser corte vigente (se anula, se elimina o se
--     le quita el corte), pasa a serlo, o un corte cambia de fecha o de camión, llama a esa función. Si algo falla avisa
--     (WARNING) y no frena el cambio de la carga.
--   · tg_02_litros_posibles (fue.carga_combustible): una carga que registra una persona (origen «manual»: a mano, desde
--     una orden o desde un remito) al tanque del camión no puede tener más litros de los que entran en el camión
--     (tanques + mochila) más 10 % (mínimo 50 L). Si el camión no tiene la capacidad cargada, el tope es 3.000 L.
--     Las de tarjeta e importación siguen como hasta hoy (quedan observadas).
-- No toca datos (el script 335 destraba el SHXB49). web.version_base = 298.
-- =============================================================================
SET search_path = public, extensions;
BEGIN;

DO $do$
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 297 THEN
        RAISE EXCEPTION 'Falta la migración 297 (foto del tablero a pedido de Telemetría): aplicarla antes';
    END IF;
    IF to_regprocedure('fue.fn_acomodar_viajes_camion(bigint,text)') IS NOT NULL THEN
        RAISE EXCEPTION 'La migración 298 (cortes de viaje que cambian y litros imposibles) ya está aplicada';
    END IF;
    IF to_regprocedure('ops.fn_anular_viaje_chofer(bigint,text)') IS NULL OR to_regprocedure('fue.fn_anular_cierre(bigint,integer,text)') IS NULL
       OR to_regprocedure('ops.fn_corte_siguiente(bigint,timestamp with time zone)') IS NULL OR to_regprocedure('ops.fn_vc_permitir()') IS NULL
       OR to_regprocedure('fue.fn_es_frontera(bigint,bigint)') IS NULL
       OR to_regprocedure('fue.fn_capacidad_camion(bigint,timestamp with time zone)') IS NULL
       OR to_regclass('ops.viaje_chofer_item') IS NULL OR to_regclass('fin.costo_directo') IS NULL
       OR to_regclass('fin.movimiento_fondo_chofer') IS NULL OR to_regclass('fin.pedido_fondo') IS NULL OR to_regclass('tel.pedido_carga') IS NULL THEN
        RAISE EXCEPTION 'Faltan funciones o tablas que esta migración necesita (viajes del chofer, cierres, fondos u órdenes de carga)';
    END IF;
END $do$;

-- -----------------------------------------------------------------------------
-- Viajes y cierres de un camión, en orden con sus cortes vigentes
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fue.fn_acomodar_viajes_camion(p_camion bigint, p_motivo text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
    v record; c record; l record;
    r jsonb := '[]'::jsonb;
    v_desde timestamptz := now() - interval '120 days';
    v_motivo_antes text := current_setting('app.motivo', true);
BEGIN
    IF p_camion IS NULL THEN RETURN r; END IF;
    PERFORM set_config('app.motivo', coalesce(nullif(btrim(p_motivo), ''), 'Cambiaron los cortes de viaje del camión'), true);

    -- 1 · Viajes del chofer abiertos que salen de una carga que ya no es corte, sin nada cargado: se anulan
    --     (ops.fn_tg_viaje_anulado_cierre anula su borrador de cierre)
    FOR v IN SELECT w.id, w.numero, w.carga_salida_id FROM ops.viaje_chofer w
              WHERE w.camion_id = p_camion AND w.estado = 'abierto' AND w.eliminado_en IS NULL AND w.salida_ts >= v_desde
                AND NOT fue.fn_es_frontera(w.carga_salida_id, w.camion_id)
                AND NOT EXISTS (SELECT 1 FROM ops.viaje_chofer_item i WHERE i.viaje_id = w.id AND i.eliminado_en IS NULL)
                AND NOT EXISTS (SELECT 1 FROM fin.costo_directo g WHERE g.viaje_chofer_id = w.id AND g.eliminado_en IS NULL)
                AND NOT EXISTS (SELECT 1 FROM fin.movimiento_fondo_chofer m WHERE m.viaje_chofer_id = w.id AND m.eliminado_en IS NULL)
                AND NOT EXISTS (SELECT 1 FROM fin.pedido_fondo p WHERE p.viaje_chofer_id = w.id)
                AND NOT EXISTS (SELECT 1 FROM tel.pedido_carga p WHERE p.viaje_id = w.id)
              ORDER BY w.salida_ts LOOP
        PERFORM ops.fn_anular_viaje_chofer(v.id, format('Salía de la carga #%s, que dejó de ser corte de viaje', v.carga_salida_id));
        r := r || jsonb_build_object('que', 'viaje_anulado', 'numero', v.numero);
    END LOOP;

    -- 2 · Borradores de cierre que salen de una carga que ya no es corte: se anulan
    FOR c IN SELECT o.id, o.numero, o.version_fila, o.carga_salida_id FROM fue.cierre_viaje o
              WHERE o.camion_id = p_camion AND o.estado = 'borrador' AND o.eliminado_en IS NULL AND o.salida_ts >= v_desde
                AND NOT fue.fn_es_frontera(o.carga_salida_id, o.camion_id)
              ORDER BY o.salida_ts LOOP
        PERFORM fue.fn_anular_cierre(c.id, c.version_fila, format('Salía de la carga #%s, que dejó de ser corte de viaje', c.carga_salida_id));
        r := r || jsonb_build_object('que', 'cierre_anulado', 'numero', c.numero);
    END LOOP;

    -- 3 · Borradores cuya llegada ya no es la vigente: toman la llegada vigente
    FOR c IN SELECT o.id, o.numero, o.carga_llegada_id, o.salida_ts, o.llegada_ts, k.fecha_hora AS salida_vigente
               FROM fue.cierre_viaje o JOIN fue.carga_combustible k ON k.id = o.carga_salida_id
              WHERE o.camion_id = p_camion AND o.estado = 'borrador' AND o.eliminado_en IS NULL AND o.salida_ts >= v_desde
                AND fue.fn_es_frontera(o.carga_salida_id, o.camion_id)
              ORDER BY k.fecha_hora LOOP
        SELECT * INTO l FROM ops.fn_corte_siguiente(p_camion, c.salida_vigente);
        CONTINUE WHEN l.carga_id IS NULL   -- todavía no hay llegada: se acomoda cuando el camión vuelva a cortar
                   OR (l.carga_id = c.carga_llegada_id AND l.fecha_hora = c.llegada_ts AND c.salida_vigente = c.salida_ts);
        BEGIN
            UPDATE fue.cierre_viaje SET carga_llegada_id = l.carga_id, salida_ts = c.salida_vigente, llegada_ts = l.fecha_hora
             WHERE id = c.id;
            r := r || jsonb_build_object('que', 'cierre_nueva_llegada', 'numero', c.numero, 'carga', l.carga_id);
        EXCEPTION WHEN exclusion_violation THEN
            r := r || jsonb_build_object('que', 'cierre_se_superpone', 'numero', c.numero, 'carga', l.carga_id);
        END;
    END LOOP;

    -- 4 · Viajes cerrados (sin cierre aprobado) que llegaban a una carga que ya no es corte: toman la llegada vigente
    FOR v IN SELECT w.id, w.numero, w.salida_ts FROM ops.viaje_chofer w
              WHERE w.camion_id = p_camion AND w.estado = 'cerrado' AND w.eliminado_en IS NULL AND w.salida_ts >= v_desde
                AND fue.fn_es_frontera(w.carga_salida_id, w.camion_id) AND NOT fue.fn_es_frontera(w.carga_llegada_id, w.camion_id)
                AND NOT EXISTS (SELECT 1 FROM fue.cierre_viaje o WHERE o.carga_salida_id = w.carga_salida_id AND o.estado = 'aprobado'
                                  AND o.eliminado_en IS NULL)
              ORDER BY w.salida_ts LOOP
        SELECT * INTO l FROM ops.fn_corte_siguiente(p_camion, v.salida_ts);
        CONTINUE WHEN l.carga_id IS NULL;
        PERFORM ops.fn_vc_permitir();
        UPDATE ops.viaje_chofer SET carga_llegada_id = l.carga_id, llegada_ts = l.fecha_hora WHERE id = v.id;
        r := r || jsonb_build_object('que', 'viaje_nueva_llegada', 'numero', v.numero, 'carga', l.carga_id);
    END LOOP;

    PERFORM set_config('app.motivo', coalesce(v_motivo_antes, ''), true);
    RETURN r;
END $function$;

COMMENT ON FUNCTION fue.fn_acomodar_viajes_camion(bigint, text) IS
    'Migración 298: ordena los viajes del chofer y los cierres sin aprobar de un camión según sus cortes de viaje vigentes. No toca cierres aprobados ni viajes con datos cargados.';

-- -----------------------------------------------------------------------------
-- Cuando cambia un corte de viaje, se acomoda solo
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fue.fn_tg_cortes_acomodar()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE
    v_era boolean := false;
    v_es  boolean := NEW.es_frontera AND NEW.estado_validacion <> 'anulada' AND NEW.eliminado_en IS NULL;
    v_movio boolean := false;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        v_era := OLD.es_frontera AND OLD.estado_validacion <> 'anulada' AND OLD.eliminado_en IS NULL;
        v_movio := OLD.fecha_hora IS DISTINCT FROM NEW.fecha_hora OR OLD.camion_id IS DISTINCT FROM NEW.camion_id;
    END IF;
    IF v_era = v_es AND NOT (v_es AND v_movio) THEN
        RETURN NULL;
    END IF;
    BEGIN
        PERFORM fue.fn_acomodar_viajes_camion(NEW.camion_id, format('Cambió el corte de viaje de la carga #%s', NEW.id));
        IF TG_OP = 'UPDATE' THEN
            IF OLD.camion_id IS DISTINCT FROM NEW.camion_id THEN
                PERFORM fue.fn_acomodar_viajes_camion(OLD.camion_id, format('Cambió el corte de viaje de la carga #%s', NEW.id));
            END IF;
        END IF;
    EXCEPTION WHEN OTHERS THEN
        RAISE WARNING 'No se acomodaron los viajes y cierres del camión % (carga %): %', NEW.camion_id, NEW.id, SQLERRM;
    END;
    RETURN NULL;
END $function$;

DROP TRIGGER IF EXISTS tg_61_cortes_acomodar ON fue.carga_combustible;
CREATE TRIGGER tg_61_cortes_acomodar
    AFTER INSERT OR UPDATE OF es_frontera, estado_validacion, eliminado_en, fecha_hora, camion_id ON fue.carga_combustible
    FOR EACH ROW EXECUTE FUNCTION fue.fn_tg_cortes_acomodar();

-- -----------------------------------------------------------------------------
-- Litros que no entran en el camión
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fue.fn_tg_carga_litros_posibles()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE v_cap numeric; v_tope numeric; v_patente text;
BEGIN
    IF NEW.origen_dato IS DISTINCT FROM 'manual' OR NEW.deposito_id IS NOT NULL OR NEW.tanque_reefer_id IS NOT NULL
       OR NEW.estado_validacion = 'anulada' OR NEW.eliminado_en IS NOT NULL OR NEW.litros IS NULL THEN
        RETURN NEW;
    END IF;
    IF TG_OP = 'UPDATE' THEN
        IF NEW.litros IS NOT DISTINCT FROM OLD.litros AND NEW.camion_id IS NOT DISTINCT FROM OLD.camion_id THEN
            RETURN NEW;
        END IF;
    END IF;
    v_cap := (fue.fn_capacidad_camion(NEW.camion_id, NEW.fecha_hora) ->> 'total_l')::numeric;
    v_tope := CASE WHEN coalesce(v_cap, 0) > 0 THEN v_cap + greatest(round(v_cap * 0.10), 50) ELSE 3000 END;
    IF NEW.litros > v_tope THEN
        SELECT patente INTO v_patente FROM mae.camion WHERE id = NEW.camion_id;
        RAISE EXCEPTION '%', CASE WHEN coalesce(v_cap, 0) > 0
                                  THEN format('No pueden ser %s L: en el %s entran %s L entre tanques y mochila.',
                                              replace(to_char(round(NEW.litros), 'FM999,999,999,990'), ',', '.'), v_patente,
                                              replace(to_char(round(v_cap), 'FM999,999,999,990'), ',', '.'))
                                  ELSE format('No pueden ser %s L en un camión.', replace(to_char(round(NEW.litros), 'FM999,999,999,990'), ',', '.')) END
                             || CASE WHEN NEW.litros >= v_tope * 3
                                     THEN ' Revisá el número: el punto separa los miles (11.992 son once mil litros) y los decimales van con coma (11,992).'
                                     ELSE ' Revisá los litros del ticket.' END
            USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS tg_02_litros_posibles ON fue.carga_combustible;
CREATE TRIGGER tg_02_litros_posibles
    BEFORE INSERT OR UPDATE OF litros, camion_id ON fue.carga_combustible
    FOR EACH ROW EXECUTE FUNCTION fue.fn_tg_carga_litros_posibles();

COMMENT ON FUNCTION fue.fn_tg_carga_litros_posibles() IS
    'Migración 298: una carga manual al tanque del camión no puede superar lo que entra en el camión (tanques + mochila) + 10 % (mínimo 50 L); sin capacidad cargada, 3.000 L.';

UPDATE ref.parametro SET valor = '298' WHERE codigo = 'web.version_base' AND valor::text::int < 298;

COMMIT;

NOTIFY pgrst, 'reload schema';

SELECT 'migración 298 aplicada' AS que, (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base,
       (SELECT count(*) FROM fue.v_viaje WHERE situacion = 'cierre_desactualizado') AS cierres_desactualizados,
       (SELECT string_agg(DISTINCT patente::text, ', ') FROM fue.v_viaje WHERE situacion = 'cierre_desactualizado') AS camiones;
