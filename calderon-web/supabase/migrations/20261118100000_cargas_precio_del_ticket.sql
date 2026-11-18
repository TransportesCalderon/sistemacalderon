-- Combustible · La carga de una orden toma el PRECIO POR LITRO que figura en el ticket
-- Pedido del 18/11/2026: en Shell Rodríguez Peña todas las cargas fueron a 2.609 ARS el litro y varias quedaron con
-- 2.609,06 / 2.609,22 / 2.608,85 / 1.912,82. Causa: el precio se calculaba como importe ÷ litros (con los litros
-- redondeados y, a veces, con un importe mal leído), aunque Iris había leído bien el precio del ticket.
-- NO cambia web.version_base. Necesita cargas_hora_del_ticket.sql. Se puede correr más de una vez.
--  · Primero vale el precio por litro leído en el ticket; solo si no se leyó, se calcula importe ÷ litros.
--  · Si el importe leído no coincide con litros × precio (más de 0,5 %), la propuesta lo avisa para que se mire el ticket.

BEGIN;

DO $do$
DECLARE v_def text := pg_get_functiondef('fue.fn_propuesta_carga_orden(bigint)'::regprocedure);
        v_a1 constant text := 'v_precio := coalesce(CASE WHEN o.importe_cargado > 0 AND o.litros_cargados > 0 THEN round(o.importe_cargado / o.litros_cargados, 4) END,';
        v_a2 constant text := '''tickets'', o.tickets, ''alerta'', o.alerta,';
BEGIN
    IF v_def LIKE '%precio_del_ticket%' THEN RETURN; END IF;
    IF position(v_a1 IN v_def) = 0 OR position(v_a2 IN v_def) = 0 OR v_def NOT LIKE '%fn_hora_ticket%' THEN
        RAISE EXCEPTION 'fue.fn_propuesta_carga_orden no es la que esperaba esta migración (¿falta cargas_hora_del_ticket.sql?): avisar antes de seguir';
    END IF;
    v_def := replace(v_def, v_a1, 'v_precio := coalesce(nullif((l ->> ''precio_unitario'')::numeric, 0),   -- precio_del_ticket: lo que dice el ticket va primero
                         CASE WHEN o.importe_cargado > 0 AND o.litros_cargados > 0 THEN round(o.importe_cargado / o.litros_cargados, 4) END,');
    v_def := replace(v_def, v_a2, '''tickets'', o.tickets,
        ''alerta'', concat_ws('' · '', o.alerta,
            CASE WHEN nullif((l ->> ''precio_unitario'')::numeric, 0) IS NOT NULL AND o.importe_cargado > 0 AND o.litros_cargados > 0
                      AND abs(o.importe_cargado - o.litros_cargados * (l ->> ''precio_unitario'')::numeric) > greatest(o.importe_cargado * 0.005, 1)
                 THEN format(''El importe leído (%s) no coincide con litros × precio del ticket (%s): mirá el ticket antes de registrar.'',
                             tel.fn_num_ar(round(o.importe_cargado)), tel.fn_num_ar(round(o.litros_cargados * (l ->> ''precio_unitario'')::numeric))) END),');
    EXECUTE v_def;
END $do$;

COMMIT;
