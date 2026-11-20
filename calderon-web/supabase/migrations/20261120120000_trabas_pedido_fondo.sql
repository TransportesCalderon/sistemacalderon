-- =====================================================================================
-- Migración 285 · El chofer no pide dinero si no está al día: gastos sin subir y tareas pendientes
-- =====================================================================================
-- Pedido (20/11/2026): que el chofer no pueda pedir dinero si el sistema entiende que no terminó
-- de subir sus gastos (con una regla flexible) ni si tiene tareas pendientes (ticket de una carga, etc.).
--
-- Regla de los gastos (por moneda, flexible por tres lados):
--   · solo cuenta la plata entregada desde fin.ff_control_desde (el corte: lo anterior no se mira);
--   · la plata de los últimos fin.ff_control_dias días (7) todavía no se exige;
--   · de la plata más vieja alcanza con haber subido gastos o devuelto el fin.ff_control_pct % (70).
--     Cuentan los gastos subidos aunque Finanzas todavía no los haya revisado. No cuentan los rechazados.
--
-- Tareas que frenan (con fin.ff_tarea_gracia_horas de margen, 3):
--   · orden de carga usada sin el ticket subido («Terminé mi carga»), salvo las de tarjeta de flota;
--   · foto del tablero después de una carga a tanque lleno (48 h);
--   · acta de un cierre de viaje sin firmar.
--
-- Solo frena al chofer cuando pide desde su perfil. Operaciones puede pedir por él (queda a su criterio)
-- y ve en el pedido qué le falta al chofer. Se apaga con fin.ff_control_activo = false.
-- No se redefine ninguna función existente. No cambia datos. web.version_base = 285.
-- =====================================================================================
BEGIN;

DO $v$
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 284
       OR to_regprocedure('fin.fn_cuentas_destino_pedidos()') IS NULL THEN
        RAISE EXCEPTION 'Primero hay que aplicar la migración 284 de la cuenta a transferir (20261120100000_cuenta_transferencia_chofer.sql)';
    END IF;
END $v$;

INSERT INTO ref.parametro (codigo, valor, descripcion)
SELECT x.codigo, x.valor, x.descripcion
  FROM (VALUES
    ('fin.ff_control_activo', 'true'::jsonb, 'Migración 285: el chofer no pide dinero desde su perfil si tiene gastos sin subir o tareas pendientes. false = no se controla.'),
    ('fin.ff_control_desde', to_jsonb(to_char((now() AT TIME ZONE 'America/Argentina/Mendoza')::date, 'YYYY-MM-DD')), 'Migración 285: desde qué fecha se mira la plata entregada al chofer para exigir los gastos (lo anterior no se mira).'),
    ('fin.ff_control_dias', '7'::jsonb, 'Migración 285: días de margen: la plata entregada en estos últimos días todavía no se exige rendida.'),
    ('fin.ff_control_pct', '70'::jsonb, 'Migración 285: porcentaje de la plata entregada (más vieja que el margen) que el chofer tiene que haber subido en gastos o devuelto para poder pedir más.'),
    ('fin.ff_tarea_gracia_horas', '3'::jsonb, 'Migración 285: horas de margen para subir el ticket de una carga o la foto del tablero antes de que frene el pedido de dinero.')
  ) x(codigo, valor, descripcion)
 WHERE NOT EXISTS (SELECT 1 FROM ref.parametro p WHERE p.codigo = x.codigo);

-- Qué le falta a un chofer para poder pedir dinero. Lista vacía = está al día.
CREATE OR REPLACE FUNCTION fin.fn_trabas_pedido_fondo(p_chofer bigint)
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE
    v_hoy    date := (now() AT TIME ZONE 'America/Argentina/Mendoza')::date;
    v_desde  date;
    v_dias   int := greatest(coalesce(ref.fn_parametro_num('fin.ff_control_dias', 7), 7), 0)::int;
    v_pct    numeric := least(greatest(coalesce(ref.fn_parametro_num('fin.ff_control_pct', 70), 70), 0), 100);
    v_gracia interval := make_interval(hours => greatest(coalesce(ref.fn_parametro_num('fin.ff_tarea_gracia_horas', 3), 3), 0)::int);
    r record; t jsonb := '[]'; v_falta numeric;
    fmt CONSTANT text := 'FM999G999G999G990';
BEGIN
    IF coalesce((SELECT valor::text FROM ref.parametro WHERE codigo = 'fin.ff_control_activo' AND eliminado_en IS NULL), 'true') <> 'true' THEN
        RETURN t;
    END IF;
    BEGIN
        v_desde := (SELECT valor #>> '{}' FROM ref.parametro WHERE codigo = 'fin.ff_control_desde' AND eliminado_en IS NULL)::date;
    EXCEPTION WHEN others THEN v_desde := NULL;
    END;

    -- 1 · Gastos: de la plata entregada hace más de N días, tiene que haber subido (o devuelto) el P %
    IF v_desde IS NOT NULL THEN
        FOR r IN
            SELECT m.moneda::text AS moneda,
                   coalesce(sum(m.importe) FILTER (WHERE m.tipo = 'entrega' AND m.estado = 'registrado' AND m.fecha <= v_hoy - v_dias), 0) AS entregado,
                   max(m.fecha) FILTER (WHERE m.tipo = 'entrega' AND m.estado = 'registrado' AND m.fecha <= v_hoy - v_dias) AS hasta,
                   coalesce(sum(m.importe) FILTER (WHERE m.tipo = 'gasto' AND m.estado IN ('por_revisar', 'aprobado', 'apelado')), 0)
                     + coalesce(sum(m.importe) FILTER (WHERE m.tipo = 'devolucion' AND m.estado = 'registrado'), 0) AS rendido
              FROM fin.movimiento_fondo_chofer m
             WHERE m.chofer_id = p_chofer AND m.eliminado_en IS NULL AND m.fecha >= v_desde
             GROUP BY m.moneda ORDER BY m.moneda
        LOOP
            v_falta := round(r.entregado * v_pct / 100 - r.rendido, 0);
            IF r.entregado > 0 AND v_falta > 0 THEN
                t := t || jsonb_build_object('tipo', 'gastos', 'moneda', r.moneda, 'falta', v_falta,
                    'texto', format('Subí tus gastos en %s: hasta el %s recibiste %s y subiste %s. Te falta subir %s.',
                                    r.moneda, to_char(r.hasta, 'DD/MM'),
                                    translate(to_char(r.entregado, fmt), ',', '.'), translate(to_char(r.rendido, fmt), ',', '.'),
                                    translate(to_char(v_falta, fmt), ',', '.')));
            END IF;
        END LOOP;
    END IF;

    -- 2 · Órdenes de carga usadas sin el ticket (las de tarjeta de flota no piden ticket)
    IF to_regclass('fue.orden_carga') IS NOT NULL THEN
        FOR r IN
            SELECT o.numero, e.nombre AS estacion
              FROM fue.orden_carga o LEFT JOIN mae.estacion_servicio e ON e.id = o.estacion_id
             WHERE o.chofer_id = p_chofer AND o.genset_id IS NULL
               AND NOT coalesce(o.autorizada_desde ? 'tarjeta_flota', false)
               AND jsonb_array_length(coalesce(o.tickets, '[]')) = 0
               AND (   o.estado = 'autorizada' AND o.autorizada_en BETWEEN now() - interval '7 days' AND now() - v_gracia
                    OR o.estado = 'cargada'    AND o.cargada_en    BETWEEN now() - interval '7 days' AND now() - v_gracia)
             ORDER BY o.id
        LOOP
            t := t || jsonb_build_object('tipo', 'ticket', 'texto',
                format('Subí el ticket de la carga %s%s y tocá «Terminé mi carga».', r.numero, coalesce(' (' || r.estacion || ')', '')));
        END LOOP;
    END IF;

    -- 3 · Foto del tablero después de una carga a tanque lleno (últimas 48 h)
    FOR r IN
        SELECT m.patente
          FROM (SELECT DISTINCT ON (c.camion_id) c.id, c.camion_id, c.fecha_hora FROM fue.carga_combustible c
                 WHERE c.camion_id IN (SELECT tel.fn_camiones_del_chofer(p_chofer))
                   AND c.tanque_lleno AND c.eliminado_en IS NULL AND coalesce(c.estado_validacion, '') <> 'anulada'
                   AND c.fecha_hora > now() - interval '48 hours'
                 ORDER BY c.camion_id, c.fecha_hora DESC) u
          JOIN mae.camion m ON m.id = u.camion_id
         WHERE u.fecha_hora < now() - v_gracia AND NOT EXISTS (SELECT 1 FROM tel.fn_tableros_de_carga_ids(u.id))
    LOOP
        t := t || jsonb_build_object('tipo', 'tablero', 'texto', format('Subí la foto del tablero del %s después de la carga a tanque lleno.', r.patente));
    END LOOP;

    -- 4 · Acta de un cierre de viaje sin firmar
    FOR r IN SELECT x ->> 'numero' AS numero FROM jsonb_array_elements(coalesce(fue.fn_cierres_sin_cerrar_chofer(p_chofer), '[]')) x
              WHERE x ->> 'motivo' = 'sin firmar'
    LOOP
        t := t || jsonb_build_object('tipo', 'cierre', 'texto', format('Firmá el acta del cierre de viaje %s.', r.numero));
    END LOOP;
    RETURN t;
END $f$;
COMMENT ON FUNCTION fin.fn_trabas_pedido_fondo(bigint) IS
    'Migración 285: qué le falta a un chofer para poder pedir dinero (gastos sin subir y tareas). Lista vacía = está al día.';

-- Lo que ve el chofer antes de pedir
CREATE OR REPLACE FUNCTION fin.fn_mis_trabas_pedido_fondo()
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
BEGIN
    RETURN fin.fn_trabas_pedido_fondo(ops.fn_exigir_mi_chofer());
END $f$;

-- Lo que ve la oficina en cada pedido sin pagar
CREATE OR REPLACE FUNCTION fin.fn_trabas_de_pedidos()
RETURNS jsonb
LANGUAGE plpgsql STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
BEGIN
    IF NOT (fin.fn_puedo_aprobar_fondos() OR fin.fn_puedo_depositar_fondos() OR fin.fn_puedo_pedir_fondos()
            OR EXISTS (SELECT 1 FROM seg.usuario_rol WHERE usuario_id = aud.fn_usuario_actual() AND rol_codigo IN ('gerencia', 'auditor'))) THEN
        RAISE EXCEPTION 'No tenés acceso a los pedidos de FF Chofer' USING ERRCODE = '42501';
    END IF;
    RETURN coalesce((
        SELECT jsonb_object_agg(p.id::text, x.t)
          FROM fin.pedido_fondo p
          CROSS JOIN LATERAL (SELECT fin.fn_trabas_pedido_fondo(p.chofer_id) AS t) x
         WHERE p.estado IN ('solicitado', 'pendiente', 'aprobado') AND jsonb_array_length(x.t) > 0), '{}');
END $f$;

-- El freno: solo cuando pide el chofer desde su perfil
CREATE OR REPLACE FUNCTION fin.fn_pedido_fondo_trabas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE t jsonb;
BEGIN
    IF NOT NEW.pedido_por_chofer THEN RETURN NEW; END IF;
    t := fin.fn_trabas_pedido_fondo(NEW.chofer_id);
    IF jsonb_array_length(t) > 0 THEN
        RAISE EXCEPTION 'Todavía no podés pedir dinero. %',
            (SELECT string_agg(x ->> 'texto', ' ' ORDER BY n) FROM jsonb_array_elements(t) WITH ORDINALITY a(x, n))
            USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END $f$;
DROP TRIGGER IF EXISTS tg_06_trabas ON fin.pedido_fondo;
CREATE TRIGGER tg_06_trabas BEFORE INSERT ON fin.pedido_fondo
    FOR EACH ROW EXECUTE FUNCTION fin.fn_pedido_fondo_trabas();

DO $g$
DECLARE r record;
BEGIN
    REVOKE ALL ON FUNCTION fin.fn_trabas_pedido_fondo(bigint) FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_mis_trabas_pedido_fondo() FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_trabas_de_pedidos() FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_pedido_fondo_trabas() FROM PUBLIC;
    FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'tc\_%' OR rolname = 'authenticated' LOOP
        IF has_function_privilege(r.rolname, 'fin.fn_pedir_fondo_chofer(text,numeric,text)', 'EXECUTE') THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_mis_trabas_pedido_fondo() TO %I', r.rolname);
        END IF;
        IF has_function_privilege(r.rolname, 'fin.fn_pedidos_fondo(boolean)', 'EXECUTE') THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_trabas_de_pedidos() TO %I', r.rolname);
        END IF;
    END LOOP;
END $g$;

UPDATE ref.parametro SET valor = '285' WHERE codigo = 'web.version_base' AND valor::text::int < 285;

COMMIT;

SELECT 'migración 285 aplicada' AS que, (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base,
       (SELECT valor #>> '{}' FROM ref.parametro WHERE codigo = 'fin.ff_control_desde') AS gastos_desde;
