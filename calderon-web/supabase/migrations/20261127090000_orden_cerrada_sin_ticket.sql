-- =====================================================================================
-- Migración 379 · Orden de carga cargada sin ticket: la oficina la da por cerrada
-- =====================================================================================
-- Caso (27/11/2026): OC-000043 (RRVF47, Castro, Shell Rodriguez Peña). La carga quedó registrada (carga 171, 624,71 L)
-- pero el chofer nunca subió el ticket. Por eso no puede pedir dinero y le aparece «Subí el ticket de la carga
-- OC-000043… y tocá «Terminé mi carga»». Pedido: que deje de aparecer.
--
--   · fue.orden_carga: sin_ticket_motivo, sin_ticket_por, sin_ticket_en.
--   · fue.fn_orden_sin_ticket(orden, motivo): para una orden «cargada» sin tickets. La pueden usar Gerencia, Adm. de
--     combustible y TI (los mismos que suben el ticket por el chofer). No toca la carga ni sus importes.
--   · El freno del pedido de dinero (punto 2, «Órdenes de carga usadas sin el ticket») no cuenta las órdenes dadas por
--     cerradas sin ticket. Se cambia una línea de la función viva (con control: si no aparece exactamente una vez,
--     no se aplica nada).
-- No toca datos: OC-000043 se cierra con el script 380. Se puede correr más de una vez.
-- =====================================================================================
BEGIN;

ALTER TABLE fue.orden_carga ADD COLUMN IF NOT EXISTS sin_ticket_motivo text;
ALTER TABLE fue.orden_carga ADD COLUMN IF NOT EXISTS sin_ticket_por bigint REFERENCES seg.usuario(id) ON DELETE RESTRICT;
ALTER TABLE fue.orden_carga ADD COLUMN IF NOT EXISTS sin_ticket_en timestamptz;
DO $c$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ck_orden_sin_ticket_motivo' AND conrelid = 'fue.orden_carga'::regclass) THEN
        ALTER TABLE fue.orden_carga ADD CONSTRAINT ck_orden_sin_ticket_motivo
            CHECK (sin_ticket_motivo IS NULL OR length(btrim(sin_ticket_motivo)) BETWEEN 3 AND 300);
    END IF;
END $c$;
COMMENT ON COLUMN fue.orden_carga.sin_ticket_motivo IS
    'Migración 379 · la oficina dio por cerrada la orden cargada sin ticket (por qué). El chofer deja de tener el freno del pedido de dinero.';

CREATE OR REPLACE FUNCTION fue.fn_orden_sin_ticket(p_orden bigint, p_motivo text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $function$
DECLARE o fue.orden_carga%ROWTYPE; v_usr bigint := aud.fn_usuario_actual();
BEGIN
    IF NOT EXISTS (SELECT 1 FROM seg.usuario_rol WHERE usuario_id = v_usr AND rol_codigo IN ('gerencia', 'adm_combustible', 'ti')) THEN
        RAISE EXCEPTION 'Dar por cerrada una orden sin ticket lo hacen Gerencia, Adm. de combustible o TI' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO o FROM fue.orden_carga WHERE id = p_orden FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'La orden no existe' USING ERRCODE = 'P0002'; END IF;
    IF o.estado <> 'cargada' THEN
        RAISE EXCEPTION 'La orden % está «%»: solo se da por cerrada sin ticket una orden cargada (si no cargó, se anula)', o.numero, o.estado USING ERRCODE = '55000';
    END IF;
    IF jsonb_array_length(coalesce(o.tickets, '[]')) > 0 THEN
        RAISE EXCEPTION 'La orden % ya tiene el ticket', o.numero USING ERRCODE = '55000';
    END IF;
    IF length(btrim(coalesce(p_motivo, ''))) < 3 THEN RAISE EXCEPTION 'Escribí por qué se cierra sin ticket' USING ERRCODE = '22023'; END IF;
    UPDATE fue.orden_carga SET sin_ticket_motivo = left(btrim(p_motivo), 300), sin_ticket_por = v_usr, sin_ticket_en = now()
     WHERE id = o.id;
    RETURN jsonb_build_object('id', o.id, 'numero', o.numero, 'sin_ticket', true);
END $function$;
REVOKE ALL ON FUNCTION fue.fn_orden_sin_ticket(bigint, text) FROM PUBLIC;

-- El freno del pedido de dinero: no cuenta las órdenes cerradas sin ticket
DO $p$
DECLARE v_fn regprocedure; v_def text; v_ancla text := $a$AND jsonb_array_length(coalesce(o.tickets, '[]')) = 0$a$; n int; r record;
BEGIN
    v_fn := coalesce(to_regprocedure('fin.fn_trabas_pedido_fondo_sin_chile(bigint)'), to_regprocedure('fin.fn_trabas_pedido_fondo(bigint)'));
    IF v_fn IS NULL THEN RAISE EXCEPTION 'No encuentro fin.fn_trabas_pedido_fondo: no se aplicó nada'; END IF;
    v_def := pg_get_functiondef(v_fn);
    IF position('sin_ticket_motivo' IN v_def) > 0 THEN RETURN; END IF;   -- ya estaba
    n := (length(v_def) - length(replace(v_def, v_ancla, ''))) / length(v_ancla);
    IF n <> 1 THEN
        RAISE EXCEPTION '% cambió (la condición del ticket aparece % veces, se esperaba 1): no se aplicó nada', v_fn, n;
    END IF;
    EXECUTE replace(v_def, v_ancla, v_ancla || ' AND o.sin_ticket_motivo IS NULL');
END $p$;

-- Permisos: los mismos que subir el ticket por el chofer
DO $g$
DECLARE r record;
BEGIN
    FOR r IN SELECT a.grantee FROM pg_proc p, aclexplode(p.proacl) a
              WHERE p.oid = 'fue.fn_terminar_orden_carga(bigint,jsonb,bigint[],numeric,numeric)'::regprocedure
                AND a.privilege_type = 'EXECUTE' AND a.grantee <> 0 LOOP
        EXECUTE format('GRANT EXECUTE ON FUNCTION fue.fn_orden_sin_ticket(bigint, text) TO %I', pg_get_userbyid(r.grantee));
    END LOOP;
END $g$;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'Listo: una orden cargada sin ticket se puede dar por cerrada y deja de frenar el pedido de dinero' AS resultado,
       (SELECT count(*) FROM fue.orden_carga WHERE estado = 'cargada' AND jsonb_array_length(coalesce(tickets, '[]')) = 0
          AND cargada_en > now() - interval '7 days') AS cargadas_sin_ticket_ultimos_7_dias;
