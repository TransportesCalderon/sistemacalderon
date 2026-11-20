-- =====================================================================================
-- Migración 293 · El monto a transferir no aparecía en las cargas a tanque lleno
-- =====================================================================================
-- Caso (20/11/2026): OC-000033, Shell Lo Espejo, «Tanques: llenos · Mochila: llena», precio 1.425 por litro: Finanzas veía
-- «Plata aproximada: —». La orden a tanque lleno no tiene litros fijos y, cuando el camión no informa el nivel del tanque,
-- tampoco «litros calculados»; además la solicitud de Seguimiento (con sus litros aproximados) se une a la orden recién
-- después de crearla. Sin litros no había monto.
--   · fin.fn_litros_orden_para_pago(orden): los litros que va a cargar, en este orden: los de la orden, los calculados,
--     los del detalle, los de la solicitud (la que se está aprobando o la ya unida) y, si no hay nada, la estimación por
--     km desde el último lleno + lo que gasta hasta la estación (291) + los litros de la mochila si se pidieron en litros.
--   · fin.fn_orden_carga_a_finanzas usa esa función; el precio también lo busca en la solicitud que se está aprobando.
--   · Las que están pendientes sin monto se recalculan.
-- web.version_base = 293.
-- =====================================================================================
BEGIN;

DO $v$
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 292 THEN
        RAISE EXCEPTION 'Primero hay que aplicar la migración 292 (precio por litro). La base está en la %',
            coalesce((SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base'), '?');
    END IF;
END $v$;

CREATE OR REPLACE FUNCTION fin.fn_litros_orden_para_pago(p_orden bigint)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE o fue.orden_carga%ROWTYPE; v numeric; v_est numeric; v_cam numeric;
BEGIN
    SELECT * INTO o FROM fue.orden_carga WHERE id = p_orden;
    IF NOT FOUND THEN RETURN NULL; END IF;
    v := coalesce(o.litros, o.litros_calculados, nullif(o.detalle ->> 'litros', '')::numeric,
                  (SELECT p.litros FROM tel.pedido_carga p
                    WHERE p.litros > 0 AND (p.orden_id = o.id OR (p.camion_id = o.camion_id AND p.estado = 'pendiente'))
                    ORDER BY (p.orden_id = o.id) DESC NULLS LAST, p.id DESC LIMIT 1));
    IF v IS NOT NULL OR o.camion_id IS NULL THEN RETURN round(v, 1); END IF;
    -- Sin nada: estimación por km desde el último lleno + el camino hasta la estación + la mochila pedida en litros
    BEGIN
        v_est := nullif(fue.fn_estimar_llenado(o.camion_id) ->> 'litros', '')::numeric;
        v_cam := nullif(fue.fn_camino_a_estacion(o.camion_id, o.estacion_id) ->> 'litros', '')::numeric;
    EXCEPTION WHEN OTHERS THEN v_est := NULL;
    END;
    IF v_est IS NULL THEN RETURN NULL; END IF;
    RETURN round(v_est + coalesce(v_cam, 0) + coalesce(nullif(o.detalle #>> '{mochila,litros}', '')::numeric, 0), 1);
END $f$;
REVOKE ALL ON FUNCTION fin.fn_litros_orden_para_pago(bigint) FROM PUBLIC;

CREATE OR REPLACE FUNCTION fin.fn_orden_carga_a_finanzas()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_medio text; v_lit numeric; v_pre numeric; v_mon text; v_pat text; v_est text; v_dest bigint[];
BEGIN
    IF NEW.genset_id IS NOT NULL OR NOT fue.fn_estacion_tarjeta(NEW.estacion_id) THEN RETURN NEW; END IF;
    -- Se anula la orden: si Finanzas todavía no hizo nada, tampoco tiene que hacerlo
    IF NEW.estado = 'anulada' THEN
        UPDATE fin.pago_carga SET estado = 'anulado', nota = coalesce(nota, 'La orden se anuló') WHERE orden_id = NEW.id AND estado = 'pendiente';
        RETURN NEW;
    END IF;
    IF NEW.estado <> 'autorizada' OR (TG_OP = 'UPDATE' AND OLD.estado = 'autorizada') OR EXISTS (SELECT 1 FROM fin.pago_carga WHERE orden_id = NEW.id) THEN
        RETURN NEW;
    END IF;
    v_medio := coalesce(NEW.detalle ->> 'medio_pago', 'tarjeta');
    v_lit := fin.fn_litros_orden_para_pago(NEW.id);   -- Migración 293
    -- Migración 292: manda el precio que se escribió en la orden; si no, el de la solicitud; si no, el promedio de la estación
    v_pre := nullif(NEW.detalle ->> 'precio_litro', '')::numeric;
    IF v_pre IS NOT NULL THEN
        v_mon := CASE (SELECT e.pais FROM mae.estacion_servicio e WHERE e.id = NEW.estacion_id) WHEN 'CL' THEN 'CLP' WHEN 'AR' THEN 'ARS' END;
    ELSE
        SELECT p.precio_unitario, p.moneda INTO v_pre, v_mon FROM tel.pedido_carga p
         WHERE (p.orden_id = NEW.id OR (p.camion_id = NEW.camion_id AND p.estado = 'pendiente')) AND p.precio_unitario > 0
         ORDER BY (p.orden_id = NEW.id) DESC NULLS LAST, p.id DESC LIMIT 1;
    END IF;
    IF v_pre IS NULL THEN SELECT r.precio, r.moneda INTO v_pre, v_mon FROM fin.fn_precio_referencia_estacion(NEW.estacion_id) r; END IF;
    INSERT INTO fin.pago_carga (orden_id, medio, camion_id, estacion_id, proveedor_id, litros, precio, moneda, importe)
    VALUES (NEW.id, v_medio, NEW.camion_id, NEW.estacion_id,
            (SELECT pr.id FROM mae.proveedor pr
              WHERE pr.id = fin.fn_proveedor_de_carga(NEW.estacion_id, CASE WHEN v_medio = 'tarjeta' THEN 'tarjeta' ELSE 'cuenta_corriente' END)),
            round(v_lit, 1), v_pre, coalesce(v_mon, 'CLP'), round(v_lit * v_pre, 0));
    SELECT patente INTO v_pat FROM mae.camion WHERE id = NEW.camion_id;
    SELECT nombre INTO v_est FROM mae.estacion_servicio WHERE id = NEW.estacion_id;
    SELECT array_agg(DISTINCT r.usuario_id) INTO v_dest FROM seg.usuario_rol r JOIN seg.usuario u ON u.id = r.usuario_id
     WHERE r.rol_codigo = 'finanzas' AND u.activo;
    IF v_dest IS NOT NULL THEN
        PERFORM ops.fn_avisar(v_dest, 'pago_carga:' || NEW.id,
            CASE WHEN v_medio = 'tarjeta' THEN 'Habilitar la tarjeta · ' ELSE 'Transferir a la estación · ' END || coalesce(v_pat, ''),
            concat_ws(' · ', NEW.numero, v_est, '≈ ' || tel.fn_num_ar(v_lit) || ' L',
                      CASE WHEN v_pre IS NOT NULL THEN '≈ $' || tel.fn_num_ar(round(v_lit * v_pre, 0)) || ' ' || coalesce(v_mon, '') END),
            '/analisis/cobros-pagos?ver=pagar', true);
    END IF;
    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- El aviso a Finanzas nunca frena la orden de carga
    RAISE WARNING 'No se pudo armar el pago de la orden %: %', NEW.numero, SQLERRM;
    RETURN NEW;
END $f$;


-- Las pendientes sin monto: se recalculan
UPDATE fin.pago_carga g
   SET litros = x.lit, importe = round(x.lit * g.precio, 0)
  FROM (SELECT g2.id, fin.fn_litros_orden_para_pago(g2.orden_id) AS lit FROM fin.pago_carga g2 WHERE g2.estado = 'pendiente' AND g2.importe IS NULL) x
 WHERE g.id = x.id AND x.lit IS NOT NULL AND g.precio IS NOT NULL;

UPDATE ref.parametro SET valor = '293' WHERE codigo = 'web.version_base' AND valor::text::int < 293;

COMMIT;

SELECT 'migración 293 aplicada' AS que, (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base,
       (SELECT count(*) FROM fin.pago_carga WHERE estado = 'pendiente' AND importe IS NULL) AS pendientes_todavia_sin_monto;
