-- =====================================================================================
-- Migración 304 · El sistema aprende a qué cuenta se le transfiere a cada chofer y la recomienda
-- =====================================================================================
-- Pedido (24/11/2026): «el sistema debe aprender a qué cuenta se transfiere normalmente para recomendar una».
--   · Mira los últimos 10 pedidos de dinero PAGADOS de ese chofer en esa moneda (último año) y a qué cuenta fueron
--     (por el id guardado en el pedido o, en los viejos, por el número de cuenta).
--   · Recomienda la más usada; si empatan, la usada más recientemente. Sin historial, la principal.
--   · Cada cuenta trae cuántas veces se le transfirió y cuándo fue la última; la recomendada viene marcada con el motivo.
--   · Si nadie elige cuenta al pedir, el pedido va a la recomendada (antes, a la principal).
-- Pide la 303. No toca web.version_base: la web lee los campos nuevos si vienen.
-- =====================================================================================
BEGIN;

DO $v$
BEGIN
    IF to_regprocedure('fin.fn_cuenta_transferencia_json_id(bigint)') IS NULL THEN
        RAISE EXCEPTION 'Primero hay que aplicar la migración 303 (varias cuentas por chofer)';
    END IF;
END $v$;

-- A qué cuenta fueron los pagos de un chofer en una moneda: veces y último pago, por cuenta vigente
CREATE OR REPLACE FUNCTION fin.fn_uso_cuentas_chofer(p_chofer bigint, p_moneda text)
RETURNS TABLE (cuenta_id bigint, veces integer, ultima date)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    WITH pagos AS (
        SELECT p.id, p.cuenta_destino, coalesce(p.fecha_deposito, p.depositado_en::date, p.pedido_en::date) AS fecha
          FROM fin.pedido_fondo p
         WHERE p.chofer_id = p_chofer AND p.moneda = p_moneda AND p.estado = 'depositado' AND p.cuenta_destino IS NOT NULL
           AND coalesce(p.fecha_deposito, p.depositado_en::date, p.pedido_en::date) > current_date - 365
         ORDER BY coalesce(p.depositado_en, p.pedido_en) DESC
         LIMIT 10
    )
    SELECT c.id, count(*)::int, max(g.fecha)
      FROM pagos g
      JOIN fin.chofer_cuenta_transferencia c
        ON c.chofer_id = p_chofer AND c.moneda = p_moneda AND c.eliminado_en IS NULL
       AND (c.id = nullif(g.cuenta_destino ->> 'id', '')::bigint
            OR ((g.cuenta_destino ->> 'id') IS NULL
                AND upper(regexp_replace(c.numero, '[^A-Za-z0-9]', '', 'g'))
                    = upper(regexp_replace(coalesce(g.cuenta_destino ->> 'numero', ''), '[^A-Za-z0-9]', '', 'g'))))
     GROUP BY c.id
$f$;

-- La recomendada: la más usada en los últimos pagos; si empatan, la más reciente; sin historial, la principal
CREATE OR REPLACE FUNCTION fin.fn_cuenta_recomendada(p_chofer bigint, p_moneda text)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT coalesce(
        (SELECT jsonb_build_object('id', u.cuenta_id, 'veces', u.veces, 'ultima', u.ultima,
                    'motivo', format('Se le transfirió %s %s en los últimos pagos (la última, el %s)', u.veces,
                                     CASE WHEN u.veces = 1 THEN 'vez' ELSE 'veces' END, to_char(u.ultima, 'DD/MM/YYYY')))
           FROM fin.fn_uso_cuentas_chofer(p_chofer, p_moneda) u
          ORDER BY u.veces DESC, u.ultima DESC LIMIT 1),
        (SELECT jsonb_build_object('id', c.id, 'veces', 0, 'ultima', NULL, 'motivo', 'Todavía no se le transfirió: es la principal')
           FROM fin.chofer_cuenta_transferencia c
          WHERE c.chofer_id = p_chofer AND c.moneda = p_moneda AND c.eliminado_en IS NULL
          ORDER BY c.principal DESC, c.id LIMIT 1))
$f$;

-- Las cuentas del chofer, con el uso y la recomendada de cada moneda
DO $m$
DECLARE d text := pg_get_functiondef('fin.fn_cuentas_transferencia(bigint)'::regprocedure); n int;
    a text := 'RETURN coalesce((SELECT jsonb_agg(fin.fn_cuenta_transferencia_json_id(c.id) ORDER BY c.moneda, c.principal DESC, c.id)';
    b text := 'RETURN coalesce((SELECT jsonb_agg(fin.fn_cuenta_transferencia_json_id(c.id)   -- Migración 304: uso y recomendada
                                     || jsonb_build_object(''veces'', coalesce(u.veces, 0), ''ultima'', u.ultima,
                                                           ''recomendada'', (r.rec ->> ''id'')::bigint = c.id,
                                                           ''motivo_recomendada'', CASE WHEN (r.rec ->> ''id'')::bigint = c.id THEN r.rec ->> ''motivo'' END)
                                     ORDER BY c.moneda, ((r.rec ->> ''id'')::bigint = c.id) DESC, c.principal DESC, c.id)';
    a2 text := 'FROM fin.chofer_cuenta_transferencia c WHERE c.chofer_id = v_chofer AND c.eliminado_en IS NULL), ''[]'');';
    b2 text := 'FROM fin.chofer_cuenta_transferencia c
                       LEFT JOIN LATERAL (SELECT fin.fn_cuenta_recomendada(v_chofer, c.moneda) AS rec) r ON true
                       LEFT JOIN LATERAL (SELECT x.veces, x.ultima FROM fin.fn_uso_cuentas_chofer(v_chofer, c.moneda) x WHERE x.cuenta_id = c.id) u ON true
                      WHERE c.chofer_id = v_chofer AND c.eliminado_en IS NULL), ''[]'');';
BEGIN
    IF position('Migración 304' IN d) > 0 THEN RETURN; END IF;
    n := (length(d) - length(replace(d, a, ''))) / length(a);
    IF n <> 1 THEN RAISE EXCEPTION 'No encontré la lista de cuentas de la 303 (% coincidencias)', n; END IF;
    n := (length(d) - length(replace(d, a2, ''))) / length(a2);
    IF n <> 1 THEN RAISE EXCEPTION 'No encontré el final de la lista de cuentas de la 303 (% coincidencias)', n; END IF;
    EXECUTE replace(replace(d, a, b), a2, b2);
END $m$;

-- Sin cuenta elegida, el pedido va a la recomendada
DO $m$
DECLARE d text := pg_get_functiondef('fin.fn_pedido_fondo_cuenta_destino()'::regprocedure); n int;
    a text := 'IF NEW.cuenta_destino IS NULL THEN NEW.cuenta_destino := fin.fn_cuenta_transferencia_json(NEW.chofer_id, NEW.moneda); END IF;';
    b text := '-- Migración 304: la que más se usa con ese chofer (sin historial, la principal)
    IF NEW.cuenta_destino IS NULL THEN
        NEW.cuenta_destino := fin.fn_cuenta_transferencia_json_id(nullif(fin.fn_cuenta_recomendada(NEW.chofer_id, NEW.moneda) ->> ''id'', '''')::bigint);
    END IF;
    IF NEW.cuenta_destino IS NULL THEN NEW.cuenta_destino := fin.fn_cuenta_transferencia_json(NEW.chofer_id, NEW.moneda); END IF;';
BEGIN
    IF position('Migración 304' IN d) > 0 THEN RETURN; END IF;
    n := (length(d) - length(replace(d, a, ''))) / length(a);
    IF n <> 1 THEN RAISE EXCEPTION 'No encontré la cuenta por defecto del pedido (% coincidencias)', n; END IF;
    EXECUTE replace(d, a, b);
END $m$;

REVOKE ALL ON FUNCTION fin.fn_uso_cuentas_chofer(bigint, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION fin.fn_cuenta_recomendada(bigint, text) FROM PUBLIC;

COMMIT;

SELECT 'migración 304 aplicada' AS que,
       (SELECT count(*) FROM (SELECT DISTINCT chofer_id, moneda FROM fin.chofer_cuenta_transferencia WHERE eliminado_en IS NULL) x) AS choferes_y_monedas,
       (SELECT count(*) FROM (SELECT DISTINCT c.chofer_id, c.moneda FROM fin.chofer_cuenta_transferencia c
                               WHERE c.eliminado_en IS NULL AND (fin.fn_cuenta_recomendada(c.chofer_id, c.moneda) ->> 'veces')::int > 0) x) AS con_historial_de_pagos;
