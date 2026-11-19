-- =============================================================================
-- IronTrack — 280 · Cambio 275 · Compras: pedido, cotizaciones, recomendación de Iris y orden de compra
-- -----------------------------------------------------------------------------
-- Pedido del usuario (19/11/2026): un espacio para comprar (por ejemplo repuestos), cargar varias cotizaciones,
-- que Iris ayude a elegir la mejor, que Gerencia la apruebe y que salga la orden de compra. Etapa 1 de 2
-- (la etapa 2 une la factura de compra a la orden y arma la orden de pago).
--   · fin.pedido_compra (PC-000001): qué se necesita, para qué camión (opcional) y si es urgente.
--       cotizando → para_aprobar (Finanzas lo eleva) → aprobado (Gerencia elige la cotización) | rechazado | anulado.
--       Gerencia también puede devolverlo a «cotizando» (pedir otra cotización).
--   · fin.cotizacion_compra: una por proveedor y pedido; total con IVA, flete, moneda, entrega (inmediata o en días),
--       días para pagar (0 = contado), validez, garantía y el archivo de la cotización (carpeta compras/<pedido>/).
--   · fin.orden_compra (OCP-000001): la arma la base al aprobar, con los datos de la cotización elegida.
--   · fin.fn_comparar_cotizaciones(pedido): la recomendación de Iris. Puntaje de 0 a 100 con
--       precio total con IVA y flete en pesos (con el tipo de cambio del día), entrega (inmediata o días),
--       días para pagar e historial del proveedor (compras anteriores). Si el pedido es urgente pesa más la entrega.
--       Precio: la más barata 100, el resto en proporción. Entrega: la más rápida 100 y 6,7 puntos menos por cada día de más
--       (15 días o más de diferencia = 0). Pago: el que da más días 100, al contado 40. Historial: compras anteriores al
--       proveedor (facturas cargadas y órdenes): sin compras 50, el que más compras tiene 100. Vencidas o sin tipo de cambio no se comparan.
--       No llama a ningún servicio: es una cuenta fija y explicada.
--   · Lo cargan Finanzas o TI; aprueban Gerencia o TI, y nunca quien cargó o elevó el pedido.
-- No cambia datos. web.version_base = 280.
-- =============================================================================
SET search_path = public, extensions;
BEGIN;

DO $do$
BEGIN
    IF coalesce((SELECT valor::text::int FROM ref.parametro WHERE codigo = 'web.version_base'), 0) < 279 THEN
        RAISE EXCEPTION 'Falta la migración 279 (comprobante del recibo): aplicarla antes';
    END IF;
    IF to_regclass('fin.pedido_compra') IS NOT NULL THEN
        RAISE EXCEPTION 'La migración 280 (compras y cotizaciones) ya está aplicada';
    END IF;
    IF to_regprocedure('fin.fn_exigir_finanzas()') IS NULL OR to_regprocedure('fin.fn_exigir_lectura_finanzas()') IS NULL
       OR to_regprocedure('fin.fn_tc_clp_o_null(text,date)') IS NULL OR to_regprocedure('ops.fn_avisar(bigint[],text,text,text,text,boolean)') IS NULL
       OR to_regprocedure('fin.fn_guardar_gasto(bigint,integer,jsonb)') IS NULL OR to_regprocedure('fin.fn_gastos(jsonb)') IS NULL THEN
        RAISE EXCEPTION 'Faltan funciones de Finanzas que esta migración usa';
    END IF;
END $do$;

-- 1 · Tablas ------------------------------------------------------------------
CREATE SEQUENCE fin.seq_pedido_compra;
CREATE SEQUENCE fin.seq_orden_compra;

CREATE TABLE fin.pedido_compra (
    id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    numero        text NOT NULL UNIQUE DEFAULT 'PC-' || lpad(nextval('fin.seq_pedido_compra')::text, 6, '0'),
    fecha         date NOT NULL,
    descripcion   text NOT NULL CHECK (length(btrim(descripcion)) BETWEEN 3 AND 200),
    detalle       text CHECK (detalle IS NULL OR length(detalle) <= 2000),
    camion_id     bigint REFERENCES mae.camion (id),
    urgente       boolean NOT NULL DEFAULT false,
    estado        text NOT NULL DEFAULT 'cotizando' CHECK (estado IN ('cotizando', 'para_aprobar', 'aprobado', 'rechazado', 'anulado')),
    nota          text CHECK (nota IS NULL OR length(nota) <= 1000),
    cotizacion_elegida_id bigint,
    recomendada_id bigint,
    elevado_por   bigint,
    elevado_en    timestamptz,
    resuelto_por  bigint,
    resuelto_en   timestamptz,
    creado_en     timestamptz NOT NULL DEFAULT now(),
    creado_por    bigint,
    actualizado_en timestamptz NOT NULL DEFAULT now(),
    version_fila  integer NOT NULL DEFAULT 1
);
COMMENT ON TABLE fin.pedido_compra IS 'Migración 280: pedido de compra (PC-…) con sus cotizaciones; lo aprueba Gerencia eligiendo una.';

CREATE TABLE fin.cotizacion_compra (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    pedido_id         bigint NOT NULL REFERENCES fin.pedido_compra (id),
    proveedor_id      bigint NOT NULL REFERENCES mae.proveedor (id),
    numero_proveedor  text CHECK (numero_proveedor IS NULL OR length(numero_proveedor) <= 40),
    fecha             date NOT NULL,
    valida_hasta      date,
    moneda            character(3) NOT NULL,
    total             numeric(16,2) NOT NULL CHECK (total > 0),
    flete             numeric(16,2) NOT NULL DEFAULT 0 CHECK (flete >= 0),
    entrega_inmediata boolean NOT NULL DEFAULT false,
    entrega_dias      integer CHECK (entrega_dias IS NULL OR entrega_dias BETWEEN 0 AND 365),
    pago_dias         integer NOT NULL DEFAULT 0 CHECK (pago_dias BETWEEN 0 AND 365),
    garantia          text CHECK (garantia IS NULL OR length(garantia) <= 120),
    observacion       text CHECK (observacion IS NULL OR length(observacion) <= 1000),
    archivo_ruta      text CHECK (archivo_ruta IS NULL OR (archivo_ruta ~ '^compras/[0-9]+/[A-Za-z0-9_.-]+$' AND length(archivo_ruta) <= 300)),
    archivo_nombre    text CHECK (archivo_nombre IS NULL OR length(archivo_nombre) <= 200),
    estado            text NOT NULL DEFAULT 'vigente' CHECK (estado IN ('vigente', 'anulada')),
    motivo            text,
    creado_en         timestamptz NOT NULL DEFAULT now(),
    creado_por        bigint,
    actualizado_en    timestamptz NOT NULL DEFAULT now(),
    version_fila      integer NOT NULL DEFAULT 1,
    CHECK (entrega_inmediata OR entrega_dias IS NOT NULL),
    CHECK (valida_hasta IS NULL OR valida_hasta >= fecha)
);
CREATE INDEX ix_cotizacion_compra_pedido ON fin.cotizacion_compra (pedido_id);
-- Un proveedor cotiza una sola vez por pedido (si cambia el precio, se corrige la misma)
CREATE UNIQUE INDEX ux_cotizacion_compra_proveedor ON fin.cotizacion_compra (pedido_id, proveedor_id) WHERE estado = 'vigente';
COMMENT ON TABLE fin.cotizacion_compra IS 'Migración 280: cotización de un proveedor para un pedido de compra.';

ALTER TABLE fin.pedido_compra
    ADD CONSTRAINT fk_pedido_compra_elegida FOREIGN KEY (cotizacion_elegida_id) REFERENCES fin.cotizacion_compra (id),
    ADD CONSTRAINT fk_pedido_compra_recomendada FOREIGN KEY (recomendada_id) REFERENCES fin.cotizacion_compra (id);

CREATE TABLE fin.orden_compra (
    id                bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    numero            text NOT NULL UNIQUE DEFAULT 'OCP-' || lpad(nextval('fin.seq_orden_compra')::text, 6, '0'),
    fecha             date NOT NULL,
    pedido_id         bigint NOT NULL REFERENCES fin.pedido_compra (id),
    cotizacion_id     bigint NOT NULL REFERENCES fin.cotizacion_compra (id),
    proveedor_id      bigint NOT NULL REFERENCES mae.proveedor (id),
    descripcion       text NOT NULL,
    camion_id         bigint REFERENCES mae.camion (id),
    moneda            character(3) NOT NULL,
    total             numeric(16,2) NOT NULL,
    flete             numeric(16,2) NOT NULL DEFAULT 0,
    entrega_inmediata boolean NOT NULL,
    entrega_dias      integer,
    pago_dias         integer NOT NULL,
    estado            text NOT NULL DEFAULT 'emitida' CHECK (estado IN ('emitida', 'anulada')),
    motivo            text,
    gasto_id          bigint REFERENCES fin.gasto (id),
    creado_en         timestamptz NOT NULL DEFAULT now(),
    creado_por        bigint
);
CREATE UNIQUE INDEX ux_orden_compra_pedido ON fin.orden_compra (pedido_id) WHERE estado = 'emitida';
COMMENT ON TABLE fin.orden_compra IS 'Migración 280: orden de compra (OCP-…) armada al aprobar el pedido. gasto_id = la factura de compra (etapa 2).';

-- Permisos de las tablas: los mismos que fin.gasto (Finanzas escribe solo por funciones)
DO $do$
DECLARE r record; p text; t text;
BEGIN
    FOREACH t IN ARRAY ARRAY['fin.pedido_compra', 'fin.cotizacion_compra', 'fin.orden_compra'] LOOP
        EXECUTE format('REVOKE ALL ON TABLE %s FROM PUBLIC', t);
    END LOOP;
    REVOKE ALL ON SEQUENCE fin.seq_pedido_compra FROM PUBLIC;
    REVOKE ALL ON SEQUENCE fin.seq_orden_compra FROM PUBLIC;
    FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'tc\_%' OR rolname IN ('authenticated', 'anon') LOOP
        FOREACH p IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
            IF has_table_privilege(r.rolname, 'fin.gasto', p) THEN
                FOREACH t IN ARRAY ARRAY['fin.pedido_compra', 'fin.cotizacion_compra', 'fin.orden_compra'] LOOP
                    EXECUTE format('GRANT %s ON TABLE %s TO %I', p, t, r.rolname);
                END LOOP;
            END IF;
        END LOOP;
    END LOOP;
END $do$;

-- 2 · Quién aprueba -----------------------------------------------------------
CREATE FUNCTION fin.fn_puedo_aprobar_compras()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
    SELECT EXISTS (SELECT 1 FROM seg.usuario_rol ur JOIN seg.usuario u ON u.id = ur.usuario_id AND u.activo
                    WHERE ur.usuario_id = aud.fn_usuario_actual() AND ur.rol_codigo IN ('gerencia', 'ti'))
$f$;

-- 3 · La recomendación de Iris -----------------------------------------------
-- Devuelve {pesos, cotizaciones:[…con puntaje y notas], recomendada_id, explicacion, advertencias}.
CREATE FUNCTION fin.fn_comparar_cotizaciones(p_pedido bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE
    pc fin.pedido_compra%ROWTYPE;
    v_hoy date := mae.fn_hoy();
    w_precio numeric; w_entrega numeric; w_pago numeric; w_hist numeric;
    v_lista jsonb; v_adv text[] := '{}'; v_n integer;
    v_rec record; v_seg record; v_barata record;
    v_razones text[] := '{}'; v_expl text;
    fmt CONSTANT text := 'FM999,999,999,990';
BEGIN
    SELECT * INTO pc FROM fin.pedido_compra WHERE id = p_pedido;
    IF NOT FOUND THEN RAISE EXCEPTION 'El pedido de compra no existe' USING ERRCODE = 'P0002'; END IF;
    IF pc.urgente THEN w_precio := 0.40; w_entrega := 0.35; w_pago := 0.10; w_hist := 0.15;
    ELSE w_precio := 0.50; w_entrega := 0.20; w_pago := 0.15; w_hist := 0.15; END IF;

    -- Cada cotización vigente con su total en pesos, entrega, días para pagar e historial del proveedor
    WITH base AS (
        SELECT c.id, pr.razon_social AS proveedor, c.moneda::text AS moneda, c.total, c.flete,
               round((c.total + c.flete) * fin.fn_tc_clp_o_null(c.moneda, v_hoy), 0) AS total_clp,
               CASE WHEN c.entrega_inmediata THEN 0 ELSE c.entrega_dias END AS dias, c.entrega_inmediata AS inmediata,
               c.pago_dias AS pago, (c.valida_hasta IS NOT NULL AND c.valida_hasta < v_hoy) AS vencida,
               ((SELECT count(*) FROM fin.gasto g WHERE g.proveedor_id = c.proveedor_id AND g.estado = 'vigente' AND g.eliminado_en IS NULL)
                + (SELECT count(*) FROM fin.orden_compra o WHERE o.proveedor_id = c.proveedor_id AND o.estado = 'emitida' AND o.pedido_id <> c.pedido_id))::int AS compras,
               (SELECT max(g.fecha) FROM fin.gasto g WHERE g.proveedor_id = c.proveedor_id AND g.estado = 'vigente' AND g.eliminado_en IS NULL) AS ultima
          FROM fin.cotizacion_compra c JOIN mae.proveedor pr ON pr.id = c.proveedor_id
         WHERE c.pedido_id = p_pedido AND c.estado = 'vigente'),
    b2 AS (SELECT base.*, (total_clp IS NOT NULL AND NOT vencida) AS comparable FROM base),
    agg AS (SELECT min(total_clp) AS min_total, min(dias) AS min_dias, max(pago) AS max_pago, max(compras) AS max_hist
              FROM b2 WHERE comparable),
    sc AS (
        SELECT b2.*,
               CASE WHEN comparable THEN agg.min_total / nullif(total_clp, 0) END AS p_precio,
               CASE WHEN comparable THEN greatest(0, 1 - least(dias - agg.min_dias, 15)::numeric / 15) END AS p_entrega,
               CASE WHEN comparable THEN CASE WHEN agg.max_pago = 0 THEN 1 ELSE 0.4 + 0.6 * pago::numeric / agg.max_pago END END AS p_pago,
               CASE WHEN comparable THEN CASE WHEN agg.max_hist = 0 THEN 0.5 ELSE 0.5 + 0.5 * ln((1 + compras)::numeric) / ln((1 + agg.max_hist)::numeric) END END AS p_hist
          FROM b2 CROSS JOIN agg),
    fin_ AS (SELECT sc.*, round(100 * (w_precio * p_precio + w_entrega * p_entrega + w_pago * p_pago + w_hist * p_hist), 1) AS puntaje FROM sc)
    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', id, 'proveedor', proveedor, 'moneda', moneda, 'total', total, 'flete', flete, 'total_clp', total_clp,
               'entrega_dias', dias, 'entrega_inmediata', inmediata, 'pago_dias', pago, 'vencida', vencida,
               'compras_anteriores', compras, 'ultima_compra', ultima, 'comparable', comparable, 'puntaje', puntaje,
               'puntajes', CASE WHEN comparable THEN jsonb_build_object(
                   'precio', round(100 * p_precio), 'entrega', round(100 * p_entrega), 'pago', round(100 * p_pago), 'historial', round(100 * p_hist)) END)
             ORDER BY comparable DESC, puntaje DESC NULLS LAST, total_clp NULLS LAST, id), '[]'::jsonb)
      INTO v_lista FROM fin_;

    -- Advertencias
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_lista) x WHERE x -> 'total_clp' = 'null'::jsonb) THEN
        v_adv := v_adv || ('Falta el tipo de cambio de hoy para '
                           || (SELECT string_agg(DISTINCT x ->> 'moneda', ', ') FROM jsonb_array_elements(v_lista) x WHERE x -> 'total_clp' = 'null'::jsonb)
                           || ': esas cotizaciones no se comparan (cargalo en Configuración › Monedas y tipos de cambio)');
    END IF;
    IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_lista) x WHERE (x ->> 'vencida')::boolean) THEN
        v_adv := v_adv || ('Vencida, no se puede elegir: '
                           || (SELECT string_agg(x ->> 'proveedor', ', ') FROM jsonb_array_elements(v_lista) x WHERE (x ->> 'vencida')::boolean));
    END IF;
    SELECT count(*) INTO v_n FROM jsonb_array_elements(v_lista) x WHERE (x ->> 'comparable')::boolean;
    IF v_n = 1 THEN v_adv := v_adv || 'Hay una sola cotización para comparar: conviene pedir otra'::text; END IF;

    -- Recomendada: la de mayor puntaje (ya viene primera); si empatan, la más barata
    SELECT * INTO v_rec FROM jsonb_to_recordset(v_lista) AS x(id bigint, proveedor text, moneda text, total numeric, flete numeric,
           total_clp numeric, entrega_dias int, entrega_inmediata boolean, pago_dias int, compras_anteriores int, comparable boolean, puntaje numeric)
     WHERE comparable ORDER BY puntaje DESC, total_clp, id LIMIT 1;
    SELECT * INTO v_seg FROM jsonb_to_recordset(v_lista) AS x(id bigint, proveedor text, total_clp numeric, entrega_dias int, comparable boolean, puntaje numeric)
     WHERE comparable AND id <> v_rec.id ORDER BY puntaje DESC, total_clp, id LIMIT 1;
    SELECT * INTO v_barata FROM jsonb_to_recordset(v_lista) AS x(id bigint, proveedor text, total_clp numeric, comparable boolean)
     WHERE comparable ORDER BY total_clp, id LIMIT 1;

    IF v_rec.id IS NOT NULL THEN
        IF v_n > 1 AND v_rec.id = v_barata.id THEN
            v_razones := v_razones || 'es la más barata'::text;
        ELSIF v_n > 1 THEN
            v_razones := v_razones || format('cuesta %s %% más que la más barata (%s)',
                to_char(round(100 * (v_rec.total_clp / v_barata.total_clp - 1)), 'FM990'), v_barata.proveedor);
        END IF;
        v_razones := v_razones || CASE WHEN v_rec.entrega_inmediata THEN 'tiene entrega inmediata'
                                       WHEN v_rec.entrega_dias = 1 THEN 'entrega en 1 día'
                                       ELSE format('entrega en %s días', v_rec.entrega_dias) END;
        v_razones := v_razones || CASE WHEN v_rec.pago_dias = 0 THEN 'es al contado' ELSE format('da %s días para pagar', v_rec.pago_dias) END;
        v_razones := v_razones || CASE WHEN v_rec.compras_anteriores = 0 THEN 'no tenemos compras anteriores con este proveedor'
                                       WHEN v_rec.compras_anteriores = 1 THEN 'ya le compramos 1 vez'
                                       ELSE format('ya le compramos %s veces', v_rec.compras_anteriores) END;
        v_expl := format('Iris recomienda %s (%s %s, %s puntos): %s.', v_rec.proveedor, v_rec.moneda,
                         replace(to_char(v_rec.total + v_rec.flete, fmt), ',', '.'), replace(to_char(v_rec.puntaje, 'FM990.0'), '.', ','),
                         array_to_string(v_razones, ', '));
        IF v_seg.id IS NOT NULL THEN
            v_expl := v_expl || format(' La sigue %s (%s puntos)', v_seg.proveedor, replace(to_char(v_seg.puntaje, 'FM990.0'), '.', ','))
                || CASE
                     WHEN v_seg.total_clp < v_rec.total_clp THEN format(', que es %s %% más barata', to_char(round(100 * (1 - v_seg.total_clp / v_rec.total_clp)), 'FM990'))
                         || CASE WHEN v_seg.entrega_dias > v_rec.entrega_dias THEN format(' pero entrega en %s días', v_seg.entrega_dias) ELSE '' END
                     WHEN v_seg.entrega_dias < v_rec.entrega_dias THEN ', que entrega antes'
                     ELSE '' END || '.';
        END IF;
        IF pc.urgente THEN v_expl := v_expl || ' Como el pedido es urgente, la entrega pesa más.'; END IF;
    END IF;

    RETURN jsonb_build_object(
        'pesos', jsonb_build_object('precio', w_precio, 'entrega', w_entrega, 'pago', w_pago, 'historial', w_hist),
        'cotizaciones', (SELECT coalesce(jsonb_agg(x || jsonb_build_object('recomendada', (x ->> 'id')::bigint = v_rec.id)), '[]'::jsonb)
                           FROM jsonb_array_elements(v_lista) x),
        'recomendada_id', v_rec.id,
        'explicacion', v_expl,
        'advertencias', to_jsonb(v_adv));
END $f$;

-- 4 · Pedido ------------------------------------------------------------------
CREATE FUNCTION fin.fn_guardar_pedido_compra(p_id bigint, p_version integer, p_datos jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_usr bigint := fin.fn_exigir_finanzas(); pc fin.pedido_compra%ROWTYPE; v_id bigint;
        v_desc text := btrim(coalesce(p_datos ->> 'descripcion', ''));
        v_det text := nullif(btrim(coalesce(p_datos ->> 'detalle', '')), '');
        v_camion bigint := nullif(p_datos ->> 'camion_id', '')::bigint;
        v_urgente boolean := coalesce((p_datos ->> 'urgente')::boolean, false);
BEGIN
    IF length(v_desc) < 3 THEN RAISE EXCEPTION 'Escribí qué hay que comprar' USING ERRCODE = '22023'; END IF;
    IF length(v_desc) > 200 THEN RAISE EXCEPTION 'Lo que hay que comprar tiene que entrar en 200 letras (el resto va en el detalle)' USING ERRCODE = '22023'; END IF;
    IF length(coalesce(v_det, '')) > 2000 THEN RAISE EXCEPTION 'El detalle es demasiado largo' USING ERRCODE = '22023'; END IF;
    IF v_camion IS NOT NULL AND NOT EXISTS (SELECT 1 FROM mae.camion WHERE id = v_camion AND eliminado_en IS NULL) THEN
        RAISE EXCEPTION 'El camión no existe' USING ERRCODE = 'P0002';
    END IF;
    IF p_id IS NULL THEN
        INSERT INTO fin.pedido_compra (fecha, descripcion, detalle, camion_id, urgente, creado_por)
        VALUES (mae.fn_hoy(), v_desc, v_det, v_camion, v_urgente, v_usr) RETURNING id INTO v_id;
        RETURN v_id;
    END IF;
    SELECT * INTO pc FROM fin.pedido_compra WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'El pedido de compra no existe' USING ERRCODE = 'P0002'; END IF;
    IF pc.version_fila <> p_version THEN RAISE EXCEPTION 'El pedido cambió mientras lo editabas: volvé a abrirlo' USING ERRCODE = '40001'; END IF;
    IF pc.estado <> 'cotizando' THEN RAISE EXCEPTION 'Solo se corrige un pedido mientras se cotiza' USING ERRCODE = '55000'; END IF;
    UPDATE fin.pedido_compra SET descripcion = v_desc, detalle = v_det, camion_id = v_camion, urgente = v_urgente,
           actualizado_en = now(), version_fila = version_fila + 1
     WHERE id = p_id;
    RETURN p_id;
END $f$;

-- 5 · Cotizaciones ------------------------------------------------------------
CREATE FUNCTION fin.fn_guardar_cotizacion_compra(p_id bigint, p_datos jsonb)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_usr bigint := fin.fn_exigir_finanzas(); c fin.cotizacion_compra%ROWTYPE; pc fin.pedido_compra%ROWTYPE; v_id bigint;
        v_pedido bigint := nullif(p_datos ->> 'pedido_id', '')::bigint;
        v_prov bigint := nullif(p_datos ->> 'proveedor_id', '')::bigint;
        v_fecha date := coalesce(nullif(p_datos ->> 'fecha', '')::date, mae.fn_hoy());
        v_valida date := nullif(p_datos ->> 'valida_hasta', '')::date;
        v_moneda text := upper(btrim(coalesce(p_datos ->> 'moneda', '')));
        v_total numeric := nullif(p_datos ->> 'total', '')::numeric;
        v_flete numeric := coalesce(nullif(p_datos ->> 'flete', '')::numeric, 0);
        v_inm boolean := coalesce((p_datos ->> 'entrega_inmediata')::boolean, false);
        v_dias integer := nullif(p_datos ->> 'entrega_dias', '')::integer;
        v_pago integer := coalesce(nullif(p_datos ->> 'pago_dias', '')::integer, 0);
        v_ruta text := nullif(btrim(coalesce(p_datos ->> 'archivo_ruta', '')), '');
        v_nom text := nullif(btrim(coalesce(p_datos ->> 'archivo_nombre', '')), '');
BEGIN
    IF p_id IS NOT NULL THEN
        SELECT * INTO c FROM fin.cotizacion_compra WHERE id = p_id FOR UPDATE;
        IF NOT FOUND THEN RAISE EXCEPTION 'La cotización no existe' USING ERRCODE = 'P0002'; END IF;
        IF c.estado <> 'vigente' THEN RAISE EXCEPTION 'La cotización está anulada' USING ERRCODE = '55000'; END IF;
        v_pedido := c.pedido_id;
    END IF;
    SELECT * INTO pc FROM fin.pedido_compra WHERE id = v_pedido FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'El pedido de compra no existe' USING ERRCODE = 'P0002'; END IF;
    IF pc.estado <> 'cotizando' THEN
        RAISE EXCEPTION 'El pedido ya no está cotizando: las cotizaciones se cargan o corrigen antes de mandarlo a aprobar' USING ERRCODE = '55000';
    END IF;
    IF v_prov IS NULL OR NOT EXISTS (SELECT 1 FROM mae.proveedor WHERE id = v_prov AND eliminado_en IS NULL) THEN
        RAISE EXCEPTION 'Elegí el proveedor' USING ERRCODE = '22023';
    END IF;
    IF EXISTS (SELECT 1 FROM fin.cotizacion_compra WHERE pedido_id = v_pedido AND proveedor_id = v_prov AND estado = 'vigente'
                AND id IS DISTINCT FROM p_id) THEN
        RAISE EXCEPTION 'Ese proveedor ya tiene una cotización en este pedido: corregí esa' USING ERRCODE = '23505';
    END IF;
    IF v_fecha > mae.fn_hoy() + 1 THEN RAISE EXCEPTION 'La fecha de la cotización no puede ser futura' USING ERRCODE = '22023'; END IF;
    IF v_valida IS NOT NULL AND v_valida < v_fecha THEN RAISE EXCEPTION 'La validez no puede terminar antes de la fecha de la cotización' USING ERRCODE = '22023'; END IF;
    IF NOT EXISTS (SELECT 1 FROM ref.moneda WHERE codigo = v_moneda AND eliminado_en IS NULL) THEN
        RAISE EXCEPTION 'Elegí la moneda' USING ERRCODE = '22023';
    END IF;
    IF v_total IS NULL OR v_total <= 0 THEN RAISE EXCEPTION 'Escribí el total con IVA de la cotización' USING ERRCODE = '22023'; END IF;
    IF v_total > 99999999999 OR v_flete > 99999999999 THEN RAISE EXCEPTION 'El monto es demasiado grande' USING ERRCODE = '22023'; END IF;
    IF v_flete < 0 THEN RAISE EXCEPTION 'El flete no puede ser negativo' USING ERRCODE = '22023'; END IF;
    IF v_inm THEN v_dias := 0;
    ELSIF v_dias IS NULL THEN RAISE EXCEPTION 'Decí si tiene entrega inmediata o en cuántos días entrega' USING ERRCODE = '22023';
    END IF;
    IF v_dias NOT BETWEEN 0 AND 365 OR v_pago NOT BETWEEN 0 AND 365 THEN
        RAISE EXCEPTION 'Los días de entrega y de pago van de 0 a 365' USING ERRCODE = '22023';
    END IF;
    IF v_ruta IS NOT NULL AND v_ruta !~ ('^compras/' || v_pedido || '/[A-Za-z0-9_.-]+$') THEN
        RAISE EXCEPTION 'El archivo tiene que estar en la carpeta del pedido' USING ERRCODE = '22023';
    END IF;

    IF p_id IS NULL THEN
        INSERT INTO fin.cotizacion_compra (pedido_id, proveedor_id, numero_proveedor, fecha, valida_hasta, moneda, total, flete,
                                           entrega_inmediata, entrega_dias, pago_dias, garantia, observacion, archivo_ruta, archivo_nombre, creado_por)
        VALUES (v_pedido, v_prov, nullif(btrim(coalesce(p_datos ->> 'numero_proveedor', '')), ''), v_fecha, v_valida, v_moneda,
                round(v_total, 2), round(v_flete, 2), v_inm, v_dias, v_pago,
                nullif(btrim(coalesce(p_datos ->> 'garantia', '')), ''), nullif(btrim(coalesce(p_datos ->> 'observacion', '')), ''),
                v_ruta, CASE WHEN v_ruta IS NOT NULL THEN v_nom END, v_usr)
        RETURNING id INTO v_id;
    ELSE
        UPDATE fin.cotizacion_compra SET proveedor_id = v_prov, numero_proveedor = nullif(btrim(coalesce(p_datos ->> 'numero_proveedor', '')), ''),
               fecha = v_fecha, valida_hasta = v_valida, moneda = v_moneda, total = round(v_total, 2), flete = round(v_flete, 2),
               entrega_inmediata = v_inm, entrega_dias = v_dias, pago_dias = v_pago,
               garantia = nullif(btrim(coalesce(p_datos ->> 'garantia', '')), ''), observacion = nullif(btrim(coalesce(p_datos ->> 'observacion', '')), ''),
               archivo_ruta = coalesce(v_ruta, archivo_ruta), archivo_nombre = CASE WHEN v_ruta IS NOT NULL THEN v_nom ELSE archivo_nombre END,
               actualizado_en = now(), version_fila = version_fila + 1
         WHERE id = p_id;
        v_id := p_id;
    END IF;
    UPDATE fin.pedido_compra SET actualizado_en = now(), version_fila = version_fila + 1 WHERE id = v_pedido;
    RETURN v_id;
END $f$;

CREATE FUNCTION fin.fn_anular_cotizacion_compra(p_id bigint, p_motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE c fin.cotizacion_compra%ROWTYPE;
BEGIN
    PERFORM fin.fn_exigir_finanzas();
    SELECT * INTO c FROM fin.cotizacion_compra WHERE id = p_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'La cotización no existe' USING ERRCODE = 'P0002'; END IF;
    IF c.estado <> 'vigente' THEN RAISE EXCEPTION 'La cotización ya está anulada' USING ERRCODE = '55000'; END IF;
    IF (SELECT estado FROM fin.pedido_compra WHERE id = c.pedido_id) <> 'cotizando' THEN
        RAISE EXCEPTION 'El pedido ya no está cotizando' USING ERRCODE = '55000';
    END IF;
    IF length(btrim(coalesce(p_motivo, ''))) < 3 THEN RAISE EXCEPTION 'Escribí por qué se anula' USING ERRCODE = '22023'; END IF;
    UPDATE fin.cotizacion_compra SET estado = 'anulada', motivo = btrim(p_motivo), actualizado_en = now(), version_fila = version_fila + 1
     WHERE id = p_id;
    UPDATE fin.pedido_compra SET actualizado_en = now(), version_fila = version_fila + 1 WHERE id = c.pedido_id;
END $f$;

-- 6 · Mandar a aprobar --------------------------------------------------------
CREATE FUNCTION fin.fn_elevar_pedido_compra(p_pedido bigint, p_nota text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_usr bigint := fin.fn_exigir_finanzas(); pc fin.pedido_compra%ROWTYPE; v_cmp jsonb;
BEGIN
    SELECT * INTO pc FROM fin.pedido_compra WHERE id = p_pedido FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'El pedido de compra no existe' USING ERRCODE = 'P0002'; END IF;
    IF pc.estado <> 'cotizando' THEN RAISE EXCEPTION 'El pedido no está cotizando' USING ERRCODE = '55000'; END IF;
    v_cmp := fin.fn_comparar_cotizaciones(p_pedido);
    IF v_cmp ->> 'recomendada_id' IS NULL THEN
        RAISE EXCEPTION 'Falta al menos una cotización vigente, no vencida y con tipo de cambio para mandarlo a aprobar' USING ERRCODE = '55000';
    END IF;
    UPDATE fin.pedido_compra SET estado = 'para_aprobar', elevado_por = v_usr, elevado_en = now(),
           nota = nullif(btrim(coalesce(p_nota, '')), ''), actualizado_en = now(), version_fila = version_fila + 1
     WHERE id = p_pedido;
    PERFORM ops.fn_avisar(
        (SELECT array_agg(DISTINCT u.id) FROM seg.usuario u JOIN seg.usuario_rol ur ON ur.usuario_id = u.id
          WHERE u.activo AND ur.rol_codigo = 'gerencia'),
        'compra-' || p_pedido, 'Compra para aprobar: ' || pc.numero, pc.descripcion || coalesce(' · ' || (v_cmp ->> 'explicacion'), ''),
        '/analisis/gastos?vista=compras', pc.urgente);
END $f$;

-- 7 · Gerencia resuelve: aprobar (elige la cotización y sale la orden), devolver o rechazar
CREATE FUNCTION fin.fn_resolver_pedido_compra(p_pedido bigint, p_accion text, p_cotizacion bigint, p_nota text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_usr bigint := aud.fn_usuario_actual(); pc fin.pedido_compra%ROWTYPE; c fin.cotizacion_compra%ROWTYPE;
        v_cmp jsonb; v_rec bigint; v_nota text := nullif(btrim(coalesce(p_nota, '')), ''); v_oc fin.orden_compra%ROWTYPE;
        v_ok boolean;
BEGIN
    IF NOT fin.fn_puedo_aprobar_compras() THEN
        RAISE EXCEPTION 'Las compras las aprueba Gerencia' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO pc FROM fin.pedido_compra WHERE id = p_pedido FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'El pedido de compra no existe' USING ERRCODE = 'P0002'; END IF;
    IF pc.estado <> 'para_aprobar' THEN RAISE EXCEPTION 'El pedido no está para aprobar' USING ERRCODE = '55000'; END IF;
    IF v_usr IN (pc.creado_por, pc.elevado_por) THEN
        RAISE EXCEPTION 'Quien cargó o mandó a aprobar el pedido no puede resolverlo: lo hace otro usuario' USING ERRCODE = '42501';
    END IF;
    IF p_accion NOT IN ('aprobar', 'devolver', 'rechazar') THEN RAISE EXCEPTION 'Acción no válida' USING ERRCODE = '22023'; END IF;

    IF p_accion IN ('devolver', 'rechazar') THEN
        IF v_nota IS NULL OR length(v_nota) < 3 THEN
            RAISE EXCEPTION 'Escribí por qué se %', CASE WHEN p_accion = 'devolver' THEN 'devuelve' ELSE 'rechaza' END USING ERRCODE = '22023';
        END IF;
        UPDATE fin.pedido_compra SET estado = CASE WHEN p_accion = 'devolver' THEN 'cotizando' ELSE 'rechazado' END,
               nota = v_nota, resuelto_por = CASE WHEN p_accion = 'rechazar' THEN v_usr END,
               resuelto_en = CASE WHEN p_accion = 'rechazar' THEN now() END,
               elevado_por = NULL, elevado_en = NULL, actualizado_en = now(), version_fila = version_fila + 1
         WHERE id = p_pedido;
        PERFORM ops.fn_avisar(ARRAY[pc.creado_por, pc.elevado_por]::bigint[], 'compra-' || p_pedido,
            CASE WHEN p_accion = 'devolver' THEN 'Compra devuelta: ' ELSE 'Compra rechazada: ' END || pc.numero, v_nota,
            '/analisis/gastos?vista=compras', false);
        RETURN jsonb_build_object('estado', CASE WHEN p_accion = 'devolver' THEN 'cotizando' ELSE 'rechazado' END);
    END IF;

    -- Aprobar
    SELECT * INTO c FROM fin.cotizacion_compra WHERE id = p_cotizacion AND pedido_id = p_pedido;
    IF NOT FOUND OR c.estado <> 'vigente' THEN RAISE EXCEPTION 'Elegí una cotización vigente de este pedido' USING ERRCODE = '22023'; END IF;
    v_cmp := fin.fn_comparar_cotizaciones(p_pedido);
    v_rec := (v_cmp ->> 'recomendada_id')::bigint;
    SELECT (x ->> 'comparable')::boolean INTO v_ok FROM jsonb_array_elements(v_cmp -> 'cotizaciones') x WHERE (x ->> 'id')::bigint = c.id;
    IF c.valida_hasta IS NOT NULL AND c.valida_hasta < mae.fn_hoy() THEN
        RAISE EXCEPTION 'Esa cotización está vencida: pedí que la renueven' USING ERRCODE = '55000';
    END IF;
    IF NOT coalesce(v_ok, false) THEN
        RAISE EXCEPTION 'Esa cotización no se puede comparar (falta el tipo de cambio de su moneda)' USING ERRCODE = '55000';
    END IF;
    IF c.id IS DISTINCT FROM v_rec AND (v_nota IS NULL OR length(v_nota) < 3) THEN
        RAISE EXCEPTION 'Elegiste otra cotización que la que recomienda Iris: escribí por qué' USING ERRCODE = '22023';
    END IF;
    INSERT INTO fin.orden_compra (fecha, pedido_id, cotizacion_id, proveedor_id, descripcion, camion_id, moneda, total, flete,
                                  entrega_inmediata, entrega_dias, pago_dias, creado_por)
    VALUES (mae.fn_hoy(), p_pedido, c.id, c.proveedor_id, pc.descripcion, pc.camion_id, c.moneda, c.total, c.flete,
            c.entrega_inmediata, c.entrega_dias, c.pago_dias, v_usr)
    RETURNING * INTO v_oc;
    UPDATE fin.pedido_compra SET estado = 'aprobado', cotizacion_elegida_id = c.id, recomendada_id = v_rec, nota = v_nota,
           resuelto_por = v_usr, resuelto_en = now(), actualizado_en = now(), version_fila = version_fila + 1
     WHERE id = p_pedido;
    PERFORM ops.fn_avisar(ARRAY[pc.creado_por, pc.elevado_por]::bigint[], 'compra-' || p_pedido,
        'Compra aprobada: ' || pc.numero, 'Orden ' || v_oc.numero || ' · ' || (SELECT razon_social FROM mae.proveedor WHERE id = c.proveedor_id),
        '/analisis/gastos?vista=compras', false);
    RETURN jsonb_build_object('estado', 'aprobado', 'orden_id', v_oc.id, 'orden', v_oc.numero);
END $f$;

-- 8 · Anular un pedido (y su orden, si todavía no tiene factura)
CREATE FUNCTION fin.fn_anular_pedido_compra(p_pedido bigint, p_motivo text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_usr bigint := fin.fn_exigir_finanzas(); pc fin.pedido_compra%ROWTYPE;
BEGIN
    SELECT * INTO pc FROM fin.pedido_compra WHERE id = p_pedido FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'El pedido de compra no existe' USING ERRCODE = 'P0002'; END IF;
    IF pc.estado IN ('anulado', 'rechazado') THEN RAISE EXCEPTION 'El pedido ya está cerrado' USING ERRCODE = '55000'; END IF;
    IF length(btrim(coalesce(p_motivo, ''))) < 3 THEN RAISE EXCEPTION 'Escribí por qué se anula' USING ERRCODE = '22023'; END IF;
    IF EXISTS (SELECT 1 FROM fin.orden_compra WHERE pedido_id = p_pedido AND estado = 'emitida' AND gasto_id IS NOT NULL) THEN
        RAISE EXCEPTION 'La orden de compra ya tiene la factura cargada: no se anula' USING ERRCODE = '55000';
    END IF;
    UPDATE fin.orden_compra SET estado = 'anulada', motivo = btrim(p_motivo) WHERE pedido_id = p_pedido AND estado = 'emitida';
    UPDATE fin.pedido_compra SET estado = 'anulado', nota = btrim(p_motivo), resuelto_por = v_usr, resuelto_en = now(),
           actualizado_en = now(), version_fila = version_fila + 1
     WHERE id = p_pedido;
END $f$;

-- 9 · Lecturas -----------------------------------------------------------------
CREATE FUNCTION fin.fn_pedidos_compra(p_todos boolean)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
BEGIN
    PERFORM fin.fn_exigir_lectura_finanzas();
    RETURN coalesce((
        SELECT jsonb_agg(jsonb_build_object(
                   'id', p.id, 'numero', p.numero, 'fecha', p.fecha, 'descripcion', p.descripcion, 'urgente', p.urgente,
                   'camion', ca.patente, 'estado', p.estado,
                   'cotizaciones', (SELECT count(*) FROM fin.cotizacion_compra c WHERE c.pedido_id = p.id AND c.estado = 'vigente'),
                   'orden', o.numero, 'proveedor_elegido', pr.razon_social, 'moneda', o.moneda, 'total', o.total + o.flete)
                 ORDER BY CASE p.estado WHEN 'para_aprobar' THEN 0 WHEN 'cotizando' THEN 1 ELSE 2 END, p.id DESC)
          FROM fin.pedido_compra p
          LEFT JOIN mae.camion ca ON ca.id = p.camion_id
          LEFT JOIN fin.orden_compra o ON o.pedido_id = p.id AND o.estado = 'emitida'
          LEFT JOIN mae.proveedor pr ON pr.id = o.proveedor_id
         WHERE p_todos OR p.estado IN ('cotizando', 'para_aprobar') OR p.resuelto_en > now() - interval '30 days'), '[]'::jsonb);
END $f$;

CREATE FUNCTION fin.fn_pedido_compra(p_id bigint)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'extensions'
AS $f$
DECLARE v_usr bigint := fin.fn_exigir_lectura_finanzas(); pc fin.pedido_compra%ROWTYPE; v_fin boolean;
BEGIN
    SELECT * INTO pc FROM fin.pedido_compra WHERE id = p_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'El pedido de compra no existe' USING ERRCODE = 'P0002'; END IF;
    v_fin := EXISTS (SELECT 1 FROM seg.usuario_rol WHERE usuario_id = v_usr AND rol_codigo IN ('finanzas', 'ti'));
    RETURN jsonb_build_object(
        'id', pc.id, 'numero', pc.numero, 'fecha', pc.fecha, 'descripcion', pc.descripcion, 'detalle', pc.detalle,
        'camion_id', pc.camion_id, 'camion', (SELECT patente FROM mae.camion WHERE id = pc.camion_id),
        'urgente', pc.urgente, 'estado', pc.estado, 'nota', pc.nota, 'version', pc.version_fila,
        'cotizacion_elegida_id', pc.cotizacion_elegida_id, 'recomendada_id', pc.recomendada_id,
        'creado_por', (SELECT nombre FROM seg.usuario WHERE id = pc.creado_por),
        'elevado_por', (SELECT nombre FROM seg.usuario WHERE id = pc.elevado_por), 'elevado_en', pc.elevado_en,
        'resuelto_por', (SELECT nombre FROM seg.usuario WHERE id = pc.resuelto_por), 'resuelto_en', pc.resuelto_en,
        'cotizaciones', coalesce((
            SELECT jsonb_agg(jsonb_build_object(
                       'id', c.id, 'proveedor_id', c.proveedor_id, 'proveedor', pr.razon_social, 'rut', pr.identificador_fiscal,
                       'numero_proveedor', c.numero_proveedor, 'fecha', c.fecha, 'valida_hasta', c.valida_hasta,
                       'moneda', c.moneda, 'total', c.total, 'flete', c.flete, 'entrega_inmediata', c.entrega_inmediata,
                       'entrega_dias', c.entrega_dias, 'pago_dias', c.pago_dias, 'garantia', c.garantia, 'observacion', c.observacion,
                       'archivo_ruta', c.archivo_ruta, 'archivo_nombre', c.archivo_nombre, 'estado', c.estado, 'motivo', c.motivo)
                     ORDER BY c.estado DESC, c.id)
              FROM fin.cotizacion_compra c JOIN mae.proveedor pr ON pr.id = c.proveedor_id WHERE c.pedido_id = pc.id), '[]'::jsonb),
        'comparacion', fin.fn_comparar_cotizaciones(pc.id),
        'orden', (SELECT jsonb_build_object('id', o.id, 'numero', o.numero, 'fecha', o.fecha, 'proveedor', pr.razon_social,
                                            'rut', pr.identificador_fiscal, 'moneda', o.moneda, 'total', o.total, 'flete', o.flete,
                                            'entrega_inmediata', o.entrega_inmediata, 'entrega_dias', o.entrega_dias, 'pago_dias', o.pago_dias,
                                            'estado', o.estado, 'gasto_id', o.gasto_id)
                    FROM fin.orden_compra o JOIN mae.proveedor pr ON pr.id = o.proveedor_id
                   WHERE o.pedido_id = pc.id ORDER BY (o.estado = 'emitida') DESC, o.id DESC LIMIT 1),
        'puedo_editar', v_fin AND pc.estado = 'cotizando',
        'puedo_resolver', pc.estado = 'para_aprobar' AND fin.fn_puedo_aprobar_compras() AND v_usr IS DISTINCT FROM pc.creado_por
                          AND v_usr IS DISTINCT FROM pc.elevado_por,
        'puedo_anular', v_fin AND pc.estado IN ('cotizando', 'para_aprobar', 'aprobado'));
END $f$;

-- 10 · Permisos
--   · cargar, mandar a aprobar y anular: como fin.fn_guardar_gasto (Finanzas y TI)
--   · leer: como fin.fn_gastos (Finanzas, Gerencia, TI, Auditoría)
--   · resolver: como fin.fn_guardar_gasto y además el rol de base de Gerencia (la base igual exige Gerencia o TI)
--   · comparar: lo usan las funciones de adentro y la lectura
DO $do$
DECLARE r record; v_mal text;
BEGIN
    REVOKE ALL ON FUNCTION fin.fn_puedo_aprobar_compras() FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_comparar_cotizaciones(bigint) FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_guardar_pedido_compra(bigint, integer, jsonb) FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_guardar_cotizacion_compra(bigint, jsonb) FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_anular_cotizacion_compra(bigint, text) FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_elevar_pedido_compra(bigint, text) FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_resolver_pedido_compra(bigint, text, bigint, text) FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_anular_pedido_compra(bigint, text) FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_pedidos_compra(boolean) FROM PUBLIC;
    REVOKE ALL ON FUNCTION fin.fn_pedido_compra(bigint) FROM PUBLIC;
    FOR r IN SELECT rolname FROM pg_roles WHERE rolname LIKE 'tc\_%' OR rolname = 'authenticated' LOOP
        IF has_function_privilege(r.rolname, 'fin.fn_guardar_gasto(bigint,integer,jsonb)', 'EXECUTE') THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_guardar_pedido_compra(bigint, integer, jsonb) TO %I', r.rolname);
            EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_guardar_cotizacion_compra(bigint, jsonb) TO %I', r.rolname);
            EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_anular_cotizacion_compra(bigint, text) TO %I', r.rolname);
            EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_elevar_pedido_compra(bigint, text) TO %I', r.rolname);
            EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_anular_pedido_compra(bigint, text) TO %I', r.rolname);
        END IF;
        IF has_function_privilege(r.rolname, 'fin.fn_guardar_gasto(bigint,integer,jsonb)', 'EXECUTE')
           OR r.rolname IN (SELECT rol_bd FROM seg.rol_aplicacion WHERE codigo = 'gerencia' AND rol_bd IS NOT NULL) THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_resolver_pedido_compra(bigint, text, bigint, text) TO %I', r.rolname);
        END IF;
        IF has_function_privilege(r.rolname, 'fin.fn_gastos(jsonb)', 'EXECUTE') THEN
            EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_pedidos_compra(boolean) TO %I', r.rolname);
            EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_pedido_compra(bigint) TO %I', r.rolname);
            EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_comparar_cotizaciones(bigint) TO %I', r.rolname);
            EXECUTE format('GRANT EXECUTE ON FUNCTION fin.fn_puedo_aprobar_compras() TO %I', r.rolname);
        END IF;
    END LOOP;
    -- Cargar como los gastos, leer como los gastos
    SELECT string_agg(ro.rolname, ', ') INTO v_mal FROM pg_roles ro
     WHERE ro.rolname IN (SELECT rol_bd FROM seg.rol_aplicacion WHERE rol_bd IS NOT NULL)
       AND (has_function_privilege(ro.rolname, 'fin.fn_guardar_gasto(bigint,integer,jsonb)', 'EXECUTE')
                IS DISTINCT FROM has_function_privilege(ro.rolname, 'fin.fn_guardar_cotizacion_compra(bigint,jsonb)', 'EXECUTE')
            OR has_function_privilege(ro.rolname, 'fin.fn_gastos(jsonb)', 'EXECUTE')
                IS DISTINCT FROM has_function_privilege(ro.rolname, 'fin.fn_pedido_compra(bigint)', 'EXECUTE'));
    IF v_mal IS NOT NULL THEN RAISE EXCEPTION 'Los permisos de compras no quedaron como los de los gastos para: %', v_mal; END IF;
    -- Gerencia tiene que poder aprobar desde la web
    SELECT string_agg(ra.rol_bd, ', ') INTO v_mal FROM seg.rol_aplicacion ra
     WHERE ra.codigo = 'gerencia' AND ra.rol_bd IS NOT NULL
       AND EXISTS (SELECT 1 FROM pg_roles WHERE rolname = ra.rol_bd)
       AND NOT has_function_privilege(ra.rol_bd, 'fin.fn_resolver_pedido_compra(bigint,text,bigint,text)', 'EXECUTE');
    IF v_mal IS NOT NULL THEN RAISE EXCEPTION 'No quedó el permiso de Gerencia para aprobar compras (%)', v_mal; END IF;
END $do$;

UPDATE ref.parametro SET valor = '280' WHERE codigo = 'web.version_base' AND valor::text::int < 280;

NOTIFY pgrst, 'reload schema';

COMMIT;

SELECT 'migración 280 aplicada' AS que, (SELECT valor::text FROM ref.parametro WHERE codigo = 'web.version_base') AS version_base,
       (SELECT string_agg(DISTINCT u.nombre, ', ') FROM seg.usuario u JOIN seg.usuario_rol ur ON ur.usuario_id = u.id
         WHERE u.activo AND ur.rol_codigo = 'gerencia') AS aprueban_compras;
