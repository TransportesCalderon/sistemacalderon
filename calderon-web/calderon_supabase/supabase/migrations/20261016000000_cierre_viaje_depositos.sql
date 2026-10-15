-- =============================================================================
-- Transportes Calderón — 24 · Combustible > Cierre de viaje con depósitos (rediseño)
-- -----------------------------------------------------------------------------
-- Implementa las secciones 15 a 20 del documento "Cierre de Viaje (diseño funcional)".
--
-- SOLO ESTRUCTURA: tablas, índices, restricciones, funciones, vistas y permisos.
-- No crea cargas, depósitos, controles, movimientos, cierres ni ningún otro dato.
-- Lo único que escribe son parámetros de configuración en ref.parametro (valores
-- provisionales, ON CONFLICT DO NOTHING), igual que las migraciones anteriores.
--
-- Corte limpio: fue.cierre_viaje de la migración 21 está vacía en Supabase. Esta
-- migración la borra y la crea con el diseño nuevo. La guarda del paso 0 aborta todo
-- si encuentra un cierre, un depósito, un control o un movimiento.
--
-- Principios (sección 15):
--   Hechos       cargas, movimientos reales y controles físicos.   Escribe: el libro.
--   Conciliación cada control vigente tiene su ajuste (libro = físico). Escribe: ajustes.
--   Atribución   el cierre de viaje y la aprobación de control de base. Escribe: solo su fila.
--   · La atribución usa solo hechos, nunca ajustes.
--   · Aprobar o anular nunca escribe el libro. La anulación es libre; la aprobación,
--     en cualquier orden.
--   · Período cerrado = unión de los Φ de los cierres aprobados y de los segmentos de base
--     aprobados. Nada de un Φ cerrado se crea, anula, revierte ni reemplaza.
--
-- Tablas nuevas y por qué:
--   fue.uso_mochila             K3: "usa mochila" con vigencia (no una marca actual).
--   fue.responsable_deposito    C3b: responsable de Base Mendoza con vigencia.
--   fue.aprobacion_control_base C3b: diferencia de cada segmento de base, aprobada y congelada.
--   fue.solicitud_correccion    C3a y K1: anulaciones y reversos que favorecen al responsable
--                               esperan la aprobación de otro usuario.
--   fue.cierre_viaje            Se recrea con el modelo nuevo (componentes tractor y mochila).
--
-- Protocolo de bloqueos (D1, K1–K7): claves de camión y de depósito, orden global
-- camión → cierre → depósitos, ids crecientes, READ COMMITTED. Se toman en los triggers,
-- antes de cualquier comprobación, así que valen para cualquier camino de escritura.
--
-- Ejecutar después de 00–12, 20, 21, 22 y 23 (como postgres en Supabase, o tc_owner).
-- =============================================================================
SET search_path = public, extensions;
SET client_min_messages = warning;
BEGIN;

-- =============================================================================
-- 0. Guarda: la migración supone tablas de cierres y depósitos vacías
-- =============================================================================
DO $$
DECLARE v text;
BEGIN
    SELECT string_agg(t || ': ' || n, ', ') INTO v FROM (
        SELECT 'cierres de viaje' t, count(*) n FROM fue.cierre_viaje
        UNION ALL SELECT 'depósitos', count(*) FROM fue.deposito_combustible
        UNION ALL SELECT 'controles de saldo', count(*) FROM fue.control_saldo_deposito
        UNION ALL SELECT 'movimientos', count(*) FROM fue.movimiento_combustible) x
     WHERE n > 0;
    IF v IS NOT NULL THEN
        RAISE EXCEPTION 'Migración 24 cancelada: hay datos (%). No se modificó nada.', v
            USING HINT = 'La 24 reemplaza fue.cierre_viaje y cambia la estructura de los depósitos. Avisá antes de seguir.';
    END IF;
    IF EXISTS (SELECT 1 FROM fue.carga_combustible WHERE carga_principal_id IS NOT NULL OR deposito_id IS NOT NULL) THEN
        RAISE EXCEPTION 'Migración 24 cancelada: hay cargas a depósito o de misma operación. No se modificó nada.';
    END IF;
END $$;

-- =============================================================================
-- 1. Retiro de los objetos de la migración 21 (modelo inicial) y de la 22 que cambian
-- =============================================================================
DROP VIEW IF EXISTS fue.v_cierre_viaje;
DROP FUNCTION IF EXISTS fue.fn_calcular_cierre_viaje(bigint,bigint,bigint);
DROP FUNCTION IF EXISTS fue.fn_aprobar_cierre_viaje(bigint,integer);
DROP FUNCTION IF EXISTS fue.fn_anular_cierre_viaje(bigint,integer,text);
DROP TABLE IF EXISTS fue.cierre_viaje;
DROP FUNCTION IF EXISTS fue.fn_cierre_viaje_reglas();
DROP SEQUENCE IF EXISTS fue.seq_numero_cierre_viaje;
-- La tolerancia única queda reemplazada por una por componente.
UPDATE ref.parametro SET eliminado_en = now()
 WHERE codigo = 'fue.cierre_viaje_tolerancia_l' AND eliminado_en IS NULL;

DROP VIEW IF EXISTS fue.v_saldo_deposito;
DROP FUNCTION IF EXISTS fue.fn_ajustar_por_control(bigint,text);           -- pasa a ser la conciliación automática
DROP FUNCTION IF EXISTS fue.fn_movimiento_externo(bigint,numeric,timestamptz,text);   -- reemplazada por fn_movimiento_con_motivo

-- =============================================================================
-- 2. Parámetros (configuración, valores provisionales: sección 19)
-- =============================================================================
INSERT INTO ref.parametro (codigo, valor, descripcion) VALUES
    ('fue.cierre_tolerancia_tractor_l', '10'::jsonb,
     'Cierre de viaje: tolerancia (L) de la diferencia del tractor. Por encima, en más o en menos, exige justificación.'),
    ('fue.cierre_tolerancia_mochila_l', '10'::jsonb,
     'Cierre de viaje: tolerancia (L) de la diferencia de la mochila. Por encima, en más o en menos, exige justificación.'),
    ('fue.cierre_ventana_ambiguedad_min', '120'::jsonb,
     'Cierre de viaje: minutos alrededor de una parada frontera en que una carga de mochila suelta de la misma estación es ambigua.'),
    ('fue.cierre_relevo_politica', '"avisar"'::jsonb,
     'PROVISIONAL (validar con Operaciones). Relevo de chofer dentro de un viaje: "avisar" (aviso) o "bloquear" (exige marcar frontera).'),
    ('fue.base_tolerancia_l', '20'::jsonb,
     'PROVISIONAL (recalibrar con el histórico). Base Mendoza: tolerancia (L) de la diferencia de cada segmento entre controles.'),
    ('fue.base_frecuencia_max_horas', '24'::jsonb,
     'PROVISIONAL (validar con Operaciones). Base Mendoza: horas máximas entre dos controles; después, el saldo figura con control vencido.'),
    ('fue.base_traspaso_obligatorio', 'true'::jsonb,
     'PROVISIONAL (validar con Operaciones). Base Mendoza: un cambio de responsable exige un control en el instante del traspaso.'),
    ('fue.correccion_roles_aprobadores', '["adm_combustible","finanzas","ti"]'::jsonb,
     'Roles de aplicación que pueden aprobar correcciones y movimientos con motivo (siempre un usuario distinto del que los registró).')
ON CONFLICT (codigo) DO NOTHING;

CREATE OR REPLACE FUNCTION ref.fn_parametro_texto(p_codigo text, p_defecto text)
RETURNS text LANGUAGE sql STABLE PARALLEL SAFE AS $$
    SELECT coalesce((SELECT valor #>> '{}' FROM ref.parametro WHERE codigo = p_codigo AND eliminado_en IS NULL), p_defecto)
$$;
COMMENT ON FUNCTION ref.fn_parametro_texto(text,text) IS 'Lee un parámetro de texto (o booleano como texto) de ref.parametro con valor por defecto.';

-- =============================================================================
-- 3. Protocolo de bloqueos (D1)
-- =============================================================================
-- Clave = (clase << 56) | id. Clase 1 = camión, clase 2 = depósito.
-- Reglas dentro de una transacción:
--   · todas las claves de camión antes que cualquier clave de depósito;
--   · cada grupo en orden creciente de id;
--   · volver a pedir una clave ya tomada no cuenta.
-- Las claves se liberan solas al confirmar o deshacer la transacción.
CREATE OR REPLACE FUNCTION fue.fn_bloquear(p_camiones bigint[], p_depositos bigint[] DEFAULT '{}')
RETURNS void LANGUAGE plpgsql AS $$
DECLARE
    v_claves  text   := coalesce(nullif(current_setting('fue.bloqueo_claves', true), ''), ',');
    v_cam_max bigint := nullif(current_setting('fue.bloqueo_camion_max', true), '')::bigint;
    v_dep_max bigint := nullif(current_setting('fue.bloqueo_deposito_max', true), '')::bigint;
    x bigint;
BEGIN
    FOR x IN SELECT DISTINCT u FROM unnest(p_camiones) u WHERE u IS NOT NULL ORDER BY 1 LOOP
        CONTINUE WHEN position(',c' || x || ',' IN v_claves) > 0;
        IF v_dep_max IS NOT NULL OR x < v_cam_max THEN
            RAISE EXCEPTION 'Orden de bloqueo: el camión % se pide después de otra clave que va detrás en el orden', x
                USING ERRCODE = '55P03',
                      HINT = 'Registrá las operaciones de cada camión en una transacción aparte (una por camión).';
        END IF;
        PERFORM pg_advisory_xact_lock((1::bigint << 56) | x);
        v_claves := v_claves || 'c' || x || ',';
        v_cam_max := x;
    END LOOP;
    FOR x IN SELECT DISTINCT u FROM unnest(p_depositos) u WHERE u IS NOT NULL ORDER BY 1 LOOP
        CONTINUE WHEN position(',d' || x || ',' IN v_claves) > 0;
        IF x < v_dep_max THEN
            RAISE EXCEPTION 'Orden de bloqueo: el depósito % se pide después del depósito %', x, v_dep_max
                USING ERRCODE = '55P03',
                      HINT = 'Registrá las operaciones de cada camión en una transacción aparte (una por camión).';
        END IF;
        PERFORM pg_advisory_xact_lock((2::bigint << 56) | x);
        v_claves := v_claves || 'd' || x || ',';
        v_dep_max := x;
    END LOOP;
    PERFORM set_config('fue.bloqueo_claves', v_claves, true);
    PERFORM set_config('fue.bloqueo_camion_max', coalesce(v_cam_max::text, ''), true);
    PERFORM set_config('fue.bloqueo_deposito_max', coalesce(v_dep_max::text, ''), true);
END $$;
COMMENT ON FUNCTION fue.fn_bloquear(bigint[],bigint[]) IS 'Protocolo D1: toma las claves de camión y depósito hasta el fin de la transacción, en el orden global (camiones por id, después depósitos por id). Rechaza un pedido fuera de orden.';

-- El camino privilegiado: funciones SECURITY DEFINER de esta migración (y el SQL Editor
-- de Supabase, exclusión declarada de la sección 18). Los roles de la aplicación no lo son.
CREATE OR REPLACE FUNCTION fue.fn_es_propietario()
RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT pg_has_role(current_user, n.nspowner, 'USAGE') FROM pg_namespace n WHERE n.nspname = 'fue'
$$;
COMMENT ON FUNCTION fue.fn_es_propietario() IS 'Verdadero dentro de las funciones SECURITY DEFINER del esquema (o para su propietario). Los roles tc_* no lo son.';

-- Usuario habilitado para aprobar correcciones (C3a): rol aprobador y distinto del que registró.
CREATE OR REPLACE FUNCTION fue.fn_validar_aprobador(p_registrado_por bigint)
RETURNS text[] LANGUAGE plpgsql STABLE AS $$
DECLARE v_usr bigint := aud.fn_usuario_actual(); v_roles text[];
BEGIN
    IF v_usr IS NULL THEN
        RAISE EXCEPTION 'Aprobar exige un usuario identificado' USING ERRCODE = '42501';
    END IF;
    IF v_usr = p_registrado_por THEN
        RAISE EXCEPTION 'Nadie aprueba lo que registró: tiene que aprobarlo otro usuario' USING ERRCODE = '42501';
    END IF;
    SELECT array_agg(ur.rol_codigo ORDER BY ur.rol_codigo) INTO v_roles
      FROM seg.usuario_rol ur WHERE ur.usuario_id = v_usr;
    IF NOT coalesce(v_roles && ARRAY(SELECT jsonb_array_elements_text(coalesce(
              (SELECT valor FROM ref.parametro WHERE codigo = 'fue.correccion_roles_aprobadores' AND eliminado_en IS NULL),
              '["adm_combustible","finanzas","ti"]'::jsonb))), false) THEN
        RAISE EXCEPTION 'Tu usuario no tiene un rol que pueda aprobar correcciones (parámetro fue.correccion_roles_aprobadores)'
            USING ERRCODE = '42501';
    END IF;
    RETURN v_roles;   -- foto de los roles del que aprueba (sección 17)
END $$;
COMMENT ON FUNCTION fue.fn_validar_aprobador(bigint) IS 'C3a: el que aprueba es otro usuario y tiene un rol aprobador. Devuelve sus roles para guardarlos como foto.';

-- Formato de fecha para los mensajes
CREATE OR REPLACE FUNCTION fue.fn_fmt_ts(p timestamptz)
RETURNS text LANGUAGE sql STABLE AS $$
    SELECT to_char(p AT TIME ZONE 'America/Argentina/Mendoza', 'DD/MM/YYYY HH24:MI')
$$;

-- =============================================================================
-- 4. Estructura: cargas (frontera, carga aparte, mismo ticket)
-- =============================================================================
ALTER TABLE fue.carga_combustible
    ADD COLUMN es_frontera        boolean NOT NULL DEFAULT false,
    ADD COLUMN aparte_confirmada  boolean NOT NULL DEFAULT false,
    ADD COLUMN mismo_ticket       boolean NOT NULL DEFAULT true,
    ADD CONSTRAINT ck_carga_frontera CHECK (NOT es_frontera OR (tanque_lleno AND deposito_id IS NULL
                                            AND tanque_reefer_id IS NULL AND carga_principal_id IS NULL)),
    ADD CONSTRAINT ck_carga_aparte   CHECK (NOT aparte_confirmada OR (deposito_id IS NOT NULL AND carga_principal_id IS NULL)),
    -- D9: dos llenados del tractor del mismo camión en el mismo instante no tienen orden.
    -- Diferida, como ex_carga_duplicada, para permitir anulación + sustituto en la misma transacción.
    ADD CONSTRAINT ex_carga_llenado_instante EXCLUDE USING btree (camion_id WITH =, fecha_hora WITH =)
        WHERE (tanque_lleno AND deposito_id IS NULL AND tanque_reefer_id IS NULL
               AND estado_validacion <> 'anulada' AND eliminado_en IS NULL)
        DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ix_carga_frontera ON fue.carga_combustible (camion_id, fecha_hora)
    WHERE es_frontera AND estado_validacion <> 'anulada' AND eliminado_en IS NULL;
COMMENT ON COLUMN fue.carga_combustible.es_frontera IS 'D2: llenado del tractor que termina una vuelta y empieza la siguiente. Hecho de la carga: no se modifica (se corrige anulando). Los viajes son los tramos entre fronteras consecutivas.';
COMMENT ON COLUMN fue.carga_combustible.aparte_confirmada IS 'D7: carga de mochila suelta (sin parada) confirmada como aparte de la parada frontera cercana. Pertenece al período del cierre.';
COMMENT ON COLUMN fue.carga_combustible.mismo_ticket IS 'Con carga_principal_id: true = mismo ticket que la principal (el documento va en la principal); false = misma parada con ticket propio.';
COMMENT ON COLUMN fue.carga_combustible.carga_principal_id IS 'Parada de abastecimiento: llenado del tractor (carga principal) al que pertenece esta carga de mochila. Dentro de la parada el orden es por rol: control, llenado, cargas de mochila.';

-- Columnas que no se modifican (las de 05 + las de 22 + las nuevas que forman parte del cierre, K6)
DROP TRIGGER tg_30_inmutables ON fue.carga_combustible;
CREATE TRIGGER tg_30_inmutables BEFORE UPDATE ON fue.carga_combustible
    FOR EACH ROW EXECUTE FUNCTION aud.fn_columnas_inmutables(
        'camion_id','tanque_id','tanque_reefer_id','chofer_id','estacion_id','fecha_hora','tipo_combustible_id',
        'litros','precio_unitario','moneda','importe_original','odometro_km','tanque_lleno','medio_pago',
        'origen_dato','lote_importacion_id','anula_id','deposito_id','carga_principal_id','es_frontera','mismo_ticket');

-- =============================================================================
-- 5. Estructura: depósitos (vigencia de la mochila por paradas frontera)
-- =============================================================================
DROP INDEX fue.ux_dep_mochila_camion;
ALTER TABLE fue.deposito_combustible
    ADD COLUMN parada_desde_id bigint REFERENCES fue.carga_combustible (id) ON DELETE RESTRICT,
    ADD COLUMN parada_hasta_id bigint REFERENCES fue.carga_combustible (id) ON DELETE RESTRICT,
    ADD COLUMN vigente_desde   timestamptz,
    ADD COLUMN vigente_hasta   timestamptz,
    ADD CONSTRAINT ck_dep_vigencia CHECK (
        (tipo = 'mochila' AND parada_desde_id IS NOT NULL AND vigente_desde IS NOT NULL
             AND (parada_hasta_id IS NULL) = (vigente_hasta IS NULL)
             AND (vigente_hasta IS NULL OR vigente_hasta > vigente_desde))
     OR (tipo = 'tanque_base' AND parada_desde_id IS NULL AND parada_hasta_id IS NULL
             AND vigente_desde IS NULL AND vigente_hasta IS NULL)),
    -- Una sola mochila vigente por camión en cada instante (reemplaza "una mochila activa").
    ADD CONSTRAINT ex_dep_mochila_vigencia EXCLUDE USING gist (
        camion_id WITH =, tstzrange(vigente_desde, vigente_hasta, '[)') WITH &&)
        WHERE (tipo = 'mochila' AND eliminado_en IS NULL);
COMMENT ON COLUMN fue.deposito_combustible.parada_desde_id IS 'Mochila: parada frontera de puesta en marcha (llenado del tractor). Su control inicial va en esa parada.';
COMMENT ON COLUMN fue.deposito_combustible.parada_hasta_id IS 'Mochila: parada frontera donde termina la vigencia (D5: la mochila se muda vacía, con control de llegada en 0).';
COMMENT ON COLUMN fue.deposito_combustible.vigente_desde IS 'Instante del control de la parada de puesta en marcha (hora de la parada − 1 µs). Lo fija el trigger.';
COMMENT ON COLUMN fue.deposito_combustible.vigente_hasta IS 'Instante del control de la parada de cierre de vigencia (hora de la parada − 1 µs). Lo fija el trigger.';
DROP TRIGGER tg_30_inmutables ON fue.deposito_combustible;
CREATE TRIGGER tg_30_inmutables BEFORE UPDATE ON fue.deposito_combustible
    FOR EACH ROW EXECUTE FUNCTION aud.fn_columnas_inmutables('tipo','camion_id','estacion_id','tipo_combustible_id','parada_desde_id');

-- =============================================================================
-- 6. Estructura: controles de saldo (rol, parada, declarante, medidor, reemplazo)
-- =============================================================================
DROP INDEX fue.ux_csd_deposito_fecha;
ALTER TABLE fue.control_saldo_deposito
    ADD COLUMN rol                   text   NOT NULL,
    ADD COLUMN origen                text   NOT NULL,
    ADD COLUMN carga_parada_id       bigint REFERENCES fue.carga_combustible (id) ON DELETE RESTRICT,
    ADD COLUMN declarante_tipo       text,
    ADD COLUMN declarante_usuario_id bigint REFERENCES seg.usuario (id) ON DELETE RESTRICT,
    ADD COLUMN medido_por            bigint REFERENCES seg.usuario (id) ON DELETE RESTRICT,
    ADD COLUMN estado                text   NOT NULL DEFAULT 'vigente',
    ADD COLUMN reemplaza_id          bigint REFERENCES fue.control_saldo_deposito (id) ON DELETE RESTRICT,
    ADD COLUMN motivo_reemplazo      text,
    ADD CONSTRAINT ck_csd_rol        CHECK (rol IN ('inicial','llegada','intermedio','base')),
    ADD CONSTRAINT ck_csd_origen     CHECK (origen IN ('puesta_en_marcha','cierre','base','administracion')),
    ADD CONSTRAINT ck_csd_parada     CHECK ((rol = 'llegada' AND carga_parada_id IS NOT NULL)
                                         OR (rol IN ('intermedio','base') AND carga_parada_id IS NULL)
                                         OR rol = 'inicial'),
    ADD CONSTRAINT ck_csd_declarante CHECK ((fuente = 'declaracion') = (declarante_tipo IS NOT NULL)
                                         AND (declarante_tipo IS NULL OR declarante_tipo IN ('chofer','operaciones','base'))
                                         AND (declarante_tipo IS DISTINCT FROM 'chofer' OR chofer_id IS NOT NULL)
                                         AND (declarante_tipo IS NULL OR declarante_tipo = 'chofer' OR declarante_usuario_id IS NOT NULL)),
    ADD CONSTRAINT ck_csd_medido     CHECK (fuente <> 'medicion' OR medido_por IS NOT NULL),
    ADD CONSTRAINT ck_csd_estado     CHECK (estado IN ('vigente','reemplazado')),
    ADD CONSTRAINT ck_csd_reemplazo  CHECK (reemplaza_id IS DISTINCT FROM id
                                         AND (reemplaza_id IS NULL OR nullif(btrim(motivo_reemplazo), '') IS NOT NULL));
CREATE UNIQUE INDEX ux_csd_reemplaza       ON fue.control_saldo_deposito (reemplaza_id) WHERE reemplaza_id IS NOT NULL;
CREATE INDEX ix_csd_parada                 ON fue.control_saldo_deposito (carga_parada_id) WHERE carga_parada_id IS NOT NULL;
COMMENT ON COLUMN fue.control_saldo_deposito.rol IS 'inicial (puesta en marcha de la mochila o primer control de la base) | llegada (frontera de viaje) | intermedio (referencia dentro de un viaje) | base (cierra un segmento de la base).';
COMMENT ON COLUMN fue.control_saldo_deposito.origen IS 'puesta_en_marcha | cierre | base | administracion.';
COMMENT ON COLUMN fue.control_saldo_deposito.carga_parada_id IS 'Control de frontera: parada (llenado frontera) a la que pertenece. Su hora es la de la parada − 1 µs: va antes del llenado y de las cargas de mochila.';
COMMENT ON COLUMN fue.control_saldo_deposito.declarante_tipo IS 'Declaración: chofer (chofer_id) | operaciones | base (declarante_usuario_id).';
COMMENT ON COLUMN fue.control_saldo_deposito.medido_por IS 'Medición: usuario que midió (por defecto, el que registra).';
COMMENT ON COLUMN fue.control_saldo_deposito.estado IS 'vigente | reemplazado. Un control se corrige registrando otro que lo reemplaza (con el período abierto).';
DROP TRIGGER IF EXISTS tg_30_inmutables ON fue.control_saldo_deposito;
CREATE TRIGGER tg_30_inmutables BEFORE UPDATE ON fue.control_saldo_deposito
    FOR EACH ROW EXECUTE FUNCTION aud.fn_columnas_inmutables(
        'deposito_id','fecha_hora','litros','fuente','metodo','chofer_id','saldo_libro_l','observaciones','rol','origen',
        'carga_parada_id','declarante_tipo','declarante_usuario_id','medido_por','reemplaza_id','motivo_reemplazo');

-- =============================================================================
-- 7. Estructura: movimientos con motivo (C3a: catálogo cerrado y aprobación)
-- =============================================================================
ALTER TABLE fue.movimiento_combustible
    ADD COLUMN categoria          text,
    ADD COLUMN evidencia          text,
    ADD COLUMN estado_aprobacion  text,
    ADD COLUMN resuelto_por       bigint REFERENCES seg.usuario (id) ON DELETE RESTRICT,
    ADD COLUMN resuelto_en        timestamptz,
    ADD COLUMN resuelto_roles     text[],
    ADD COLUMN motivo_resolucion  text,
    ADD CONSTRAINT ck_mov_categoria CHECK (
        (tipo IN ('entrada_otra','salida_otra') AND anula_id IS NULL) = (categoria IS NOT NULL)
        AND (categoria IS NULL
             OR (tipo = 'salida_otra'  AND categoria IN ('derrame','robo_denunciado','drenaje_agua'))
             OR (tipo = 'entrada_otra' AND categoria IN ('carga_bidon','compra_granel')))),
    ADD CONSTRAINT ck_mov_evidencia CHECK (categoria IS NULL OR categoria NOT IN ('robo_denunciado','compra_granel')
                                           OR nullif(btrim(evidencia), '') IS NOT NULL),
    ADD CONSTRAINT ck_mov_aprobacion CHECK ((categoria IS NULL) = (estado_aprobacion IS NULL)
        AND (estado_aprobacion IS NULL OR estado_aprobacion IN ('pendiente','aprobado','rechazado'))
        AND ((estado_aprobacion IN ('aprobado','rechazado')) = (resuelto_en IS NOT NULL)));
CREATE INDEX ix_mov_pendiente ON fue.movimiento_combustible (deposito_id, fecha_hora) WHERE estado_aprobacion = 'pendiente';
COMMENT ON COLUMN fue.movimiento_combustible.categoria IS 'Movimiento con motivo (C3a), catálogo cerrado. Salidas: derrame, robo_denunciado, drenaje_agua. Entradas: carga_bidon, compra_granel (solo tanque de base). La merma no es un movimiento: la absorbe la tolerancia.';
COMMENT ON COLUMN fue.movimiento_combustible.evidencia IS 'Evidencia del movimiento con motivo (obligatoria en robo_denunciado: denuncia; en compra_granel: remito o factura).';
COMMENT ON COLUMN fue.movimiento_combustible.estado_aprobacion IS 'Movimiento con motivo: pendiente (integra el libro desde que se registra y bloquea el cierre) | aprobado | rechazado (se revierte en la misma transacción).';
DROP TRIGGER tg_30_inmutables ON fue.movimiento_combustible;
CREATE TRIGGER tg_30_inmutables BEFORE UPDATE ON fue.movimiento_combustible
    FOR EACH ROW EXECUTE FUNCTION aud.fn_columnas_inmutables(
        'deposito_id','fecha_hora','tipo','litros','operacion','carga_id','deposito_contraparte_id',
        'camion_id','control_id','chofer_id','motivo','anula_id','categoria','evidencia');

-- =============================================================================
-- 8. Tablas nuevas
-- =============================================================================
-- 8.1 K3 · "Usa mochila" con vigencia por paradas frontera
CREATE TABLE fue.uso_mochila (
    id               bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    camion_id        bigint       NOT NULL REFERENCES mae.camion (id) ON DELETE RESTRICT,
    parada_desde_id  bigint       NOT NULL REFERENCES fue.carga_combustible (id) ON DELETE RESTRICT,
    parada_hasta_id  bigint       REFERENCES fue.carga_combustible (id) ON DELETE RESTRICT,
    desde_ts         timestamptz  NOT NULL,
    hasta_ts         timestamptz,
    observaciones    text,
    creado_en        timestamptz  NOT NULL DEFAULT now(),
    creado_por       bigint       REFERENCES seg.usuario (id) ON DELETE RESTRICT,
    actualizado_en   timestamptz  NOT NULL DEFAULT now(),
    actualizado_por  bigint       REFERENCES seg.usuario (id) ON DELETE RESTRICT,
    eliminado_en     timestamptz,
    eliminado_por    bigint       REFERENCES seg.usuario (id) ON DELETE RESTRICT,
    version_fila     integer      NOT NULL DEFAULT 1,
    CONSTRAINT ck_uso_hasta   CHECK ((parada_hasta_id IS NULL) = (hasta_ts IS NULL) AND (hasta_ts IS NULL OR hasta_ts > desde_ts)),
    CONSTRAINT ex_uso_solape  EXCLUDE USING gist (camion_id WITH =, tstzrange(desde_ts, hasta_ts, '[)') WITH &&)
        WHERE (eliminado_en IS NULL)
);
CREATE INDEX ix_uso_camion ON fue.uso_mochila (camion_id, desde_ts);
CREATE INDEX ix_uso_parada_desde ON fue.uso_mochila (parada_desde_id);
CREATE INDEX ix_uso_parada_hasta ON fue.uso_mochila (parada_hasta_id) WHERE parada_hasta_id IS NOT NULL;
COMMENT ON TABLE  fue.uso_mochila IS 'K3: períodos en que el camión usa mochila, entre paradas frontera. Un viaje cubierto exige una mochila vigente; uno no cubierto no tiene componente de mochila.';
COMMENT ON COLUMN fue.uso_mochila.desde_ts IS 'Hora de la parada desde (la fija el trigger).';
CALL aud.aplicar_estandar('fue.uso_mochila');
CREATE TRIGGER tg_30_inmutables BEFORE UPDATE ON fue.uso_mochila
    FOR EACH ROW EXECUTE FUNCTION aud.fn_columnas_inmutables('camion_id','parada_desde_id');

-- 8.2 C3b · Responsable del tanque de base
CREATE TABLE fue.responsable_deposito (
    id               bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    deposito_id      bigint       NOT NULL REFERENCES fue.deposito_combustible (id) ON DELETE RESTRICT,
    usuario_id       bigint       NOT NULL REFERENCES seg.usuario (id) ON DELETE RESTRICT,
    desde_ts         timestamptz  NOT NULL,
    hasta_ts         timestamptz,
    observaciones    text,
    creado_en        timestamptz  NOT NULL DEFAULT now(),
    creado_por       bigint       REFERENCES seg.usuario (id) ON DELETE RESTRICT,
    actualizado_en   timestamptz  NOT NULL DEFAULT now(),
    actualizado_por  bigint       REFERENCES seg.usuario (id) ON DELETE RESTRICT,
    eliminado_en     timestamptz,
    eliminado_por    bigint       REFERENCES seg.usuario (id) ON DELETE RESTRICT,
    version_fila     integer      NOT NULL DEFAULT 1,
    CONSTRAINT ck_resp_tiempo CHECK (hasta_ts IS NULL OR hasta_ts > desde_ts),
    -- Rango (desde, hasta]: el control del traspaso cierra el segmento del saliente.
    CONSTRAINT ex_resp_solape EXCLUDE USING gist (deposito_id WITH =, tstzrange(desde_ts, hasta_ts, '(]') WITH &&)
        WHERE (eliminado_en IS NULL)
);
CREATE INDEX ix_resp_deposito ON fue.responsable_deposito (deposito_id, desde_ts);
CREATE INDEX ix_resp_usuario  ON fue.responsable_deposito (usuario_id);
COMMENT ON TABLE  fue.responsable_deposito IS 'C3b: responsable del tanque de base, con vigencia (desde, hasta]. La diferencia de cada segmento se atribuye al responsable vigente en la hora del control que lo cierra.';
CALL aud.aplicar_estandar('fue.responsable_deposito');
CREATE TRIGGER tg_30_inmutables BEFORE UPDATE ON fue.responsable_deposito
    FOR EACH ROW EXECUTE FUNCTION aud.fn_columnas_inmutables('deposito_id','usuario_id','desde_ts');

-- 8.3 C3b · Aprobación de la diferencia de un segmento de base (c⁻, c]
CREATE TABLE fue.aprobacion_control_base (
    id                     bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    deposito_id            bigint        NOT NULL REFERENCES fue.deposito_combustible (id) ON DELETE RESTRICT,
    control_id             bigint        NOT NULL REFERENCES fue.control_saldo_deposito (id) ON DELETE RESTRICT,
    control_anterior_id    bigint        NOT NULL REFERENCES fue.control_saldo_deposito (id) ON DELETE RESTRICT,
    desde_ts               timestamptz   NOT NULL,
    hasta_ts               timestamptz   NOT NULL,
    estado                 text          NOT NULL DEFAULT 'aprobado',
    responsable_usuario_id bigint        NOT NULL REFERENCES seg.usuario (id) ON DELETE RESTRICT,
    fisico_anterior_l      numeric(10,2) NOT NULL,
    real_l                 numeric(10,2) NOT NULL,
    teorico_l              numeric(10,2) NOT NULL,
    fisico_l               numeric(10,2) NOT NULL,
    diferencia_l           numeric(10,2) NOT NULL,
    tolerancia_l           numeric(8,2)  NOT NULL,
    justificacion          text,
    no_imputable_l         numeric(10,2) NOT NULL DEFAULT 0,
    no_imputable_motivo    text,
    imputable_l            numeric(10,2) NOT NULL,
    huella                 text          NOT NULL,
    detalle                jsonb         NOT NULL,
    aprobado_por           bigint        REFERENCES seg.usuario (id) ON DELETE RESTRICT,
    aprobado_en            timestamptz   NOT NULL,
    motivo_anulacion       text,
    anulado_por            bigint        REFERENCES seg.usuario (id) ON DELETE RESTRICT,
    anulado_en             timestamptz,
    creado_en        timestamptz  NOT NULL DEFAULT now(),
    creado_por       bigint       REFERENCES seg.usuario (id) ON DELETE RESTRICT,
    actualizado_en   timestamptz  NOT NULL DEFAULT now(),
    actualizado_por  bigint       REFERENCES seg.usuario (id) ON DELETE RESTRICT,
    eliminado_en     timestamptz,
    eliminado_por    bigint       REFERENCES seg.usuario (id) ON DELETE RESTRICT,
    version_fila     integer      NOT NULL DEFAULT 1,
    CONSTRAINT ck_acb_estado   CHECK (estado IN ('aprobado','anulado')),
    CONSTRAINT ck_acb_tiempo   CHECK (hasta_ts > desde_ts),
    CONSTRAINT ck_acb_anulado  CHECK ((estado = 'anulado') = (anulado_en IS NOT NULL)
                                     AND (estado <> 'anulado' OR nullif(btrim(motivo_anulacion), '') IS NOT NULL)),
    CONSTRAINT ck_acb_no_imp   CHECK (no_imputable_l >= 0 AND (no_imputable_l = 0 OR nullif(btrim(no_imputable_motivo), '') IS NOT NULL))
);
CREATE UNIQUE INDEX ux_acb_control ON fue.aprobacion_control_base (control_id) WHERE estado = 'aprobado';
CREATE INDEX ix_acb_deposito ON fue.aprobacion_control_base (deposito_id, hasta_ts) WHERE estado = 'aprobado';
CREATE INDEX ix_acb_anterior ON fue.aprobacion_control_base (control_anterior_id);
CREATE INDEX ix_acb_responsable ON fue.aprobacion_control_base (responsable_usuario_id);
COMMENT ON TABLE  fue.aprobacion_control_base IS 'C3b: diferencia del segmento de base que termina en un control, d(c) = F(c⁻) + Real(c⁻, c] − F(c), atribuida al responsable vigente y congelada. Mientras está aprobada bloquea c⁻, c y los movimientos de (c⁻, c]. Solo la escriben fn_aprobar_control_base y fn_anular_aprobacion_base.';
COMMENT ON COLUMN fue.aprobacion_control_base.diferencia_l IS 'Positivo = falta combustible.';
CALL aud.aplicar_estandar('fue.aprobacion_control_base', p_hecho_inmutable => true);

-- 8.4 C3a / K1 · Solicitudes de corrección que favorecen al responsable
CREATE TABLE fue.solicitud_correccion (
    id                 bigint       GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    tipo               text         NOT NULL,
    carga_id           bigint       REFERENCES fue.carga_combustible (id) ON DELETE RESTRICT,
    movimiento_id      bigint       REFERENCES fue.movimiento_combustible (id) ON DELETE RESTRICT,
    motivo             text         NOT NULL,
    estado             text         NOT NULL DEFAULT 'pendiente',
    resuelto_por       bigint       REFERENCES seg.usuario (id) ON DELETE RESTRICT,
    resuelto_en        timestamptz,
    resuelto_roles     text[],
    motivo_resolucion  text,
    creado_en        timestamptz  NOT NULL DEFAULT now(),
    creado_por       bigint       REFERENCES seg.usuario (id) ON DELETE RESTRICT,
    actualizado_en   timestamptz  NOT NULL DEFAULT now(),
    actualizado_por  bigint       REFERENCES seg.usuario (id) ON DELETE RESTRICT,
    eliminado_en     timestamptz,
    eliminado_por    bigint       REFERENCES seg.usuario (id) ON DELETE RESTRICT,
    version_fila     integer      NOT NULL DEFAULT 1,
    CONSTRAINT ck_sol_tipo     CHECK ((tipo = 'anular_carga' AND carga_id IS NOT NULL AND movimiento_id IS NULL)
                                   OR (tipo = 'revertir_movimiento' AND movimiento_id IS NOT NULL AND carga_id IS NULL)),
    CONSTRAINT ck_sol_motivo   CHECK (btrim(motivo) <> ''),
    CONSTRAINT ck_sol_estado   CHECK (estado IN ('pendiente','aprobada','rechazada','retirada')),
    CONSTRAINT ck_sol_resuelta CHECK ((estado = 'pendiente') = (resuelto_en IS NULL))
);
CREATE UNIQUE INDEX ux_sol_carga_pendiente ON fue.solicitud_correccion (carga_id) WHERE estado = 'pendiente';
CREATE UNIQUE INDEX ux_sol_mov_pendiente   ON fue.solicitud_correccion (movimiento_id) WHERE estado = 'pendiente';
CREATE INDEX ix_sol_estado ON fue.solicitud_correccion (estado, creado_en);
COMMENT ON TABLE  fue.solicitud_correccion IS 'C3a: anulación de carga o reverso de movimiento que reduce una diferencia. Pendiente no cambia ningún hecho y bloquea el cierre o segmento que contiene el hecho; aprobada (por otro usuario con rol aprobador) ejecuta la corrección.';
CALL aud.aplicar_estandar('fue.solicitud_correccion', p_hecho_inmutable => true);
CREATE TRIGGER tg_30_inmutables BEFORE UPDATE ON fue.solicitud_correccion
    FOR EACH ROW EXECUTE FUNCTION aud.fn_columnas_inmutables('tipo','carga_id','movimiento_id','motivo');

-- 8.5 Cierre de viaje (rediseño)
CREATE SEQUENCE fue.seq_numero_cierre_viaje AS bigint START 1;
COMMENT ON SEQUENCE fue.seq_numero_cierre_viaje IS 'Secuencia de negocio de fue.cierre_viaje.numero.';

CREATE TABLE fue.cierre_viaje (
    id                          bigint        GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    numero                      text          NOT NULL DEFAULT ('CV-' || lpad(nextval('fue.seq_numero_cierre_viaje')::text, 6, '0')),
    camion_id                   bigint        NOT NULL REFERENCES mae.camion (id) ON DELETE RESTRICT,
    carga_salida_id             bigint        NOT NULL REFERENCES fue.carga_combustible (id) ON DELETE RESTRICT,
    carga_llegada_id            bigint        NOT NULL REFERENCES fue.carga_combustible (id) ON DELETE RESTRICT,
    salida_ts                   timestamptz   NOT NULL,
    llegada_ts                  timestamptz   NOT NULL,
    estado                      text          NOT NULL DEFAULT 'borrador',

    -- K2 · chofer responsable explícito (propuesto desde los tramos, editable en borrador)
    chofer_responsable_id       bigint        REFERENCES mae.chofer (id) ON DELETE RESTRICT,
    motivo_chofer               text,

    -- Datos manuales (borrador)
    programador_velocidad_pct   numeric(5,2),
    test_alcohol                text,
    km_manual                   numeric(10,1),
    consumo_plataforma_manual_l numeric(10,2),
    motivo_ajuste               text,
    tractor_no_imputable_l      numeric(10,2) NOT NULL DEFAULT 0,
    tractor_no_imputable_ralenti_h numeric(6,2) NOT NULL DEFAULT 0,
    tractor_no_imputable_motivo text,
    tractor_justificacion       text,
    mochila_no_imputable_l      numeric(10,2) NOT NULL DEFAULT 0,
    mochila_no_imputable_motivo text,
    mochila_justificacion       text,
    observaciones               text,

    -- Congelado al aprobar · tractor
    km_recorridos               numeric(10,1),
    fuente_km                   text,
    litros_carga_salida         numeric(8,2),
    litros_llenados_l           numeric(10,2),
    litros_desde_mochila_l      numeric(10,2),
    consumo_llenado_l           numeric(10,2),
    consumo_plataforma_l        numeric(10,2),
    fuente_consumo_plataforma   text,
    horas_motor                 numeric(8,2),
    horas_ralenti               numeric(8,2),
    ralenti_mes_h               numeric(8,2),
    dias_parado                 smallint,
    capacidad_util_l            numeric(8,2),
    consumo_l_100km             numeric(6,2),
    tractor_diferencia_l        numeric(10,2),
    tractor_tolerancia_l        numeric(8,2),
    tractor_imputable_l         numeric(10,2),

    -- Congelado al aprobar · mochila
    usa_mochila                 boolean,
    deposito_id                 bigint        REFERENCES fue.deposito_combustible (id) ON DELETE RESTRICT,
    control_ancla_id            bigint        REFERENCES fue.control_saldo_deposito (id) ON DELETE RESTRICT,
    control_llegada_id          bigint        REFERENCES fue.control_saldo_deposito (id) ON DELETE RESTRICT,
    mochila_ancla_l             numeric(10,2),
    mochila_entradas_l          numeric(10,2),
    mochila_transferencias_entrada_l numeric(10,2),
    mochila_transferencias_salida_l  numeric(10,2),
    mochila_a_tractor_l         numeric(10,2),
    mochila_con_motivo_l        numeric(10,2),
    mochila_real_l              numeric(10,2),
    mochila_teorico_l           numeric(10,2),
    mochila_fisico_l            numeric(10,2),
    mochila_diferencia_l        numeric(10,2),
    mochila_tolerancia_l        numeric(8,2),
    mochila_imputable_l         numeric(10,2),

    imputable_total_l           numeric(10,2),
    linea_viaje                 text,
    huella                      text,
    detalle                     jsonb,
    calculado_en                timestamptz,
    aprobado_por                bigint        REFERENCES seg.usuario (id) ON DELETE RESTRICT,
    aprobado_en                 timestamptz,
    motivo_anulacion            text,
    anulado_por                 bigint        REFERENCES seg.usuario (id) ON DELETE RESTRICT,
    anulado_en                  timestamptz,

    creado_en        timestamptz  NOT NULL DEFAULT now(),
    creado_por       bigint       REFERENCES seg.usuario (id) ON DELETE RESTRICT,
    actualizado_en   timestamptz  NOT NULL DEFAULT now(),
    actualizado_por  bigint       REFERENCES seg.usuario (id) ON DELETE RESTRICT,
    eliminado_en     timestamptz,
    eliminado_por    bigint       REFERENCES seg.usuario (id) ON DELETE RESTRICT,
    version_fila     integer      NOT NULL DEFAULT 1,

    CONSTRAINT ck_cv_estado        CHECK (estado IN ('borrador','aprobado','anulado')),
    CONSTRAINT ck_cv_cargas        CHECK (carga_salida_id <> carga_llegada_id),
    CONSTRAINT ck_cv_tiempo        CHECK (llegada_ts > salida_ts),
    CONSTRAINT ck_cv_programador   CHECK (programador_velocidad_pct IS NULL OR programador_velocidad_pct BETWEEN 0 AND 100),
    CONSTRAINT ck_cv_test_alcohol  CHECK (test_alcohol IS NULL OR test_alcohol IN ('no_realizado','negativo','positivo')),
    CONSTRAINT ck_cv_no_imp_tractor CHECK (tractor_no_imputable_l >= 0 AND tractor_no_imputable_ralenti_h >= 0
                                      AND ((tractor_no_imputable_l = 0 AND tractor_no_imputable_ralenti_h = 0)
                                           OR nullif(btrim(tractor_no_imputable_motivo), '') IS NOT NULL)),
    CONSTRAINT ck_cv_no_imp_mochila CHECK (mochila_no_imputable_l >= 0
                                      AND (mochila_no_imputable_l = 0 OR nullif(btrim(mochila_no_imputable_motivo), '') IS NOT NULL)),
    CONSTRAINT ck_cv_ajuste        CHECK ((km_manual IS NULL AND consumo_plataforma_manual_l IS NULL) OR nullif(btrim(motivo_ajuste), '') IS NOT NULL),
    CONSTRAINT ck_cv_ajuste_pos    CHECK ((km_manual IS NULL OR km_manual >= 0) AND (consumo_plataforma_manual_l IS NULL OR consumo_plataforma_manual_l >= 0)),
    CONSTRAINT ck_cv_fuente_km     CHECK (fuente_km IS NULL OR fuente_km IN ('telemetria','cargas','tramos','manual')),
    CONSTRAINT ck_cv_fuente_cons   CHECK (fuente_consumo_plataforma IS NULL OR fuente_consumo_plataforma IN ('telemetria','agregado_diario','manual')),
    CONSTRAINT ck_cv_aprobado      CHECK (estado = 'borrador' OR (aprobado_en IS NOT NULL AND calculado_en IS NOT NULL
                                         AND huella IS NOT NULL AND chofer_responsable_id IS NOT NULL
                                         AND consumo_llenado_l IS NOT NULL AND tractor_diferencia_l IS NOT NULL
                                         AND usa_mochila IS NOT NULL AND imputable_total_l IS NOT NULL
                                         AND (NOT usa_mochila OR (deposito_id IS NOT NULL AND control_ancla_id IS NOT NULL
                                              AND control_llegada_id IS NOT NULL AND mochila_diferencia_l IS NOT NULL)))
                                         OR (estado = 'anulado' AND aprobado_en IS NULL)),
    CONSTRAINT ck_cv_anulado       CHECK ((estado = 'anulado') = (anulado_en IS NOT NULL)
                                         AND (estado <> 'anulado' OR nullif(btrim(motivo_anulacion), '') IS NOT NULL)),
    CONSTRAINT ex_cv_solape EXCLUDE USING gist (
        camion_id WITH =, tstzrange(salida_ts, llegada_ts, '[)') WITH &&)
        WHERE (estado <> 'anulado' AND eliminado_en IS NULL)
);
CREATE UNIQUE INDEX ux_cv_numero        ON fue.cierre_viaje (numero) WHERE eliminado_en IS NULL;
CREATE UNIQUE INDEX ux_cv_carga_salida  ON fue.cierre_viaje (carga_salida_id) WHERE estado <> 'anulado' AND eliminado_en IS NULL;
CREATE INDEX ix_cv_camion_salida        ON fue.cierre_viaje (camion_id, salida_ts DESC);
CREATE INDEX ix_cv_aprobado_camion      ON fue.cierre_viaje (camion_id, salida_ts, llegada_ts) WHERE estado = 'aprobado' AND eliminado_en IS NULL;
CREATE INDEX ix_cv_aprobado_deposito    ON fue.cierre_viaje (deposito_id, salida_ts, llegada_ts) WHERE estado = 'aprobado' AND eliminado_en IS NULL;
CREATE INDEX ix_cv_chofer               ON fue.cierre_viaje (chofer_responsable_id, salida_ts DESC);
CREATE INDEX ix_cv_estado               ON fue.cierre_viaje (estado) WHERE eliminado_en IS NULL;
CREATE INDEX ix_cv_carga_llegada        ON fue.cierre_viaje (carga_llegada_id);
CREATE INDEX ix_cv_control_ancla        ON fue.cierre_viaje (control_ancla_id) WHERE control_ancla_id IS NOT NULL;
CREATE INDEX ix_cv_control_llegada      ON fue.cierre_viaje (control_llegada_id) WHERE control_llegada_id IS NOT NULL;
CREATE INDEX ix_cv_aprobado_por         ON fue.cierre_viaje (aprobado_por);

COMMENT ON TABLE  fue.cierre_viaje IS 'Cierre de viaje: atribución de la diferencia de combustible de una vuelta (entre dos fronteras consecutivas del camión) al chofer responsable. Componentes tractor y mochila, cada uno con su tolerancia, sin neteo. Nunca escribe el libro. Aprobado = congelado; mientras lo está, su Φ (hechos del viaje) no se modifica.';
COMMENT ON COLUMN fue.cierre_viaje.carga_llegada_id IS 'Siguiente frontera del camión después de la de salida. La fija el trigger: el cierre no elige límites (D2).';
COMMENT ON COLUMN fue.cierre_viaje.chofer_responsable_id IS 'K2: chofer al que se atribuye el viaje. Propuesto desde los tramos (más km), editable en borrador, congelado al aprobar.';
COMMENT ON COLUMN fue.cierre_viaje.test_alcohol IS 'Dato sensible del chofer: no_realizado, negativo, positivo.';
COMMENT ON COLUMN fue.cierre_viaje.tractor_justificacion IS 'Obligatoria si la diferencia del tractor supera su tolerancia (en más o en menos).';
COMMENT ON COLUMN fue.cierre_viaje.mochila_justificacion IS 'Obligatoria si la diferencia de la mochila supera su tolerancia, o por cambio de chofer con ancla declarada y llegada sin medir (D6).';
COMMENT ON COLUMN fue.cierre_viaje.consumo_llenado_l IS 'Congelado: llenados del tractor en (salida, llegada] + litros pasados desde la mochila.';
COMMENT ON COLUMN fue.cierre_viaje.tractor_diferencia_l IS 'Congelado: consumo por llenado − consumo de plataforma. Positivo = falta combustible.';
COMMENT ON COLUMN fue.cierre_viaje.mochila_diferencia_l IS 'Congelado: físico del ancla + movimientos reales del viaje (sin ajustes) − físico de llegada. Positivo = falta combustible.';
COMMENT ON COLUMN fue.cierre_viaje.imputable_total_l IS 'Faltante del tractor (si es positivo) + faltante de la mochila (si es positivo), cada uno menos su no imputable. Un sobrante nunca descuenta un faltante.';
COMMENT ON COLUMN fue.cierre_viaje.huella IS 'md5 de los hechos usados (Φ). fn_verificar_cierre la recalcula y la compara.';
COMMENT ON COLUMN fue.cierre_viaje.detalle IS 'Foto congelada: telemetría, tramos y relevos, contexto, parámetros, avisos.';
CALL aud.aplicar_estandar('fue.cierre_viaje');
CREATE TRIGGER tg_15_soft_delete_estado BEFORE UPDATE OF eliminado_en ON fue.cierre_viaje
    FOR EACH ROW EXECUTE FUNCTION aud.fn_bloquear_soft_delete_por_estado('estado', 'aprobado');
CREATE TRIGGER tg_30_inmutables BEFORE UPDATE ON fue.cierre_viaje
    FOR EACH ROW EXECUTE FUNCTION aud.fn_columnas_inmutables('numero','camion_id','carga_salida_id');

-- =============================================================================
-- 9. Período cerrado (D3): unión de los Φ aprobados
-- =============================================================================
-- Tractor del camión: cargas en [salida, llegada] de un cierre aprobado (las dos fronteras incluidas).
CREATE OR REPLACE FUNCTION fue.fn_cerrado_camion(p_camion bigint, p_ts timestamptz)
RETURNS text LANGUAGE sql STABLE AS $$
    SELECT numero FROM fue.cierre_viaje
     WHERE camion_id = p_camion AND estado = 'aprobado' AND eliminado_en IS NULL
       AND p_ts BETWEEN salida_ts AND llegada_ts
     ORDER BY salida_ts LIMIT 1
$$;
COMMENT ON FUNCTION fue.fn_cerrado_camion(bigint,timestamptz) IS 'Número del cierre aprobado cuyo período de tractor contiene el instante (NULL = abierto).';

-- Depósito: movimientos en (ancla, llegada] y controles en [ancla, llegada] de un cierre aprobado
-- (mochila), o en (c⁻, c] / [c⁻, c] de un segmento de base aprobado.
CREATE OR REPLACE FUNCTION fue.fn_cerrado_deposito(p_deposito bigint, p_ts timestamptz, p_es_control boolean)
RETURNS text LANGUAGE sql STABLE AS $$
    SELECT que FROM (
        SELECT cv.numero AS que, cv.salida_ts AS orden
          FROM fue.cierre_viaje cv
         WHERE cv.deposito_id = p_deposito AND cv.estado = 'aprobado' AND cv.eliminado_en IS NULL
           AND p_ts <= cv.llegada_ts - interval '1 microsecond'
           AND (p_ts > cv.salida_ts - interval '1 microsecond'
                OR (p_es_control AND p_ts = cv.salida_ts - interval '1 microsecond'))
        UNION ALL
        SELECT 'la aprobación del control de base del ' || fue.fn_fmt_ts(a.hasta_ts), a.desde_ts
          FROM fue.aprobacion_control_base a
         WHERE a.deposito_id = p_deposito AND a.estado = 'aprobado'
           AND p_ts <= a.hasta_ts AND (p_ts > a.desde_ts OR (p_es_control AND p_ts = a.desde_ts))) x
     ORDER BY orden LIMIT 1
$$;
COMMENT ON FUNCTION fue.fn_cerrado_deposito(bigint,timestamptz,boolean) IS 'Qué cierra el instante en el depósito (cierre de viaje o aprobación de base); NULL = abierto. p_es_control incluye el control de inicio del segmento.';

CREATE OR REPLACE FUNCTION fue.fn_exigir_abierto(p_que text, p_hecho text)
RETURNS void LANGUAGE plpgsql IMMUTABLE AS $$
BEGIN
    IF p_que IS NOT NULL THEN
        RAISE EXCEPTION '%: el período está cerrado por %. Anulalo para corregir', p_hecho, p_que USING ERRCODE = '55000';
    END IF;
END $$;

-- Tanque de base de una estación (surtidor propio)
CREATE OR REPLACE FUNCTION fue.fn_deposito_base(p_estacion bigint)
RETURNS bigint LANGUAGE sql STABLE AS $$
    SELECT id FROM fue.deposito_combustible
     WHERE tipo = 'tanque_base' AND estacion_id = p_estacion AND eliminado_en IS NULL
$$;

-- Hora canónica de una carga a depósito: la de su parada (llenado principal) o la propia.
CREATE OR REPLACE FUNCTION fue.fn_ts_canonico(p_carga bigint)
RETURNS timestamptz LANGUAGE sql STABLE AS $$
    SELECT coalesce(p.fecha_hora, c.fecha_hora)
      FROM fue.carga_combustible c LEFT JOIN fue.carga_combustible p ON p.id = c.carga_principal_id
     WHERE c.id = p_carga
$$;

-- Frontera vigente de un camión
CREATE OR REPLACE FUNCTION fue.fn_es_frontera(p_carga bigint, p_camion bigint)
RETURNS boolean LANGUAGE sql STABLE AS $$
    SELECT EXISTS (SELECT 1 FROM fue.carga_combustible
                    WHERE id = p_carga AND camion_id = p_camion AND es_frontera
                      AND estado_validacion <> 'anulada' AND eliminado_en IS NULL)
$$;

-- Viajes con cierre aprobado que intersecan (lo, hi) por las paradas (sin contar los que solo tocan un extremo)
CREATE OR REPLACE FUNCTION fue.fn_cierre_aprobado_entre(p_camion bigint, p_lo timestamptz, p_hi timestamptz)
RETURNS text LANGUAGE sql STABLE AS $$
    SELECT numero FROM fue.cierre_viaje
     WHERE camion_id = p_camion AND estado = 'aprobado' AND eliminado_en IS NULL
       AND llegada_ts > p_lo AND salida_ts < coalesce(p_hi, 'infinity')
     ORDER BY salida_ts LIMIT 1
$$;

-- =============================================================================
-- 10. Cargas: bloqueo, período cerrado, aprobación de anulaciones, fronteras (K1, K6, C3a, D9)
-- =============================================================================
CREATE OR REPLACE FUNCTION fue.fn_carga_periodo()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    v_base    bigint;
    v_tractor boolean := NEW.deposito_id IS NULL AND NEW.tanque_reefer_id IS NULL;
    v_anula   boolean := TG_OP = 'UPDATE' AND NEW.estado_validacion = 'anulada' AND OLD.estado_validacion <> 'anulada';
    v_menos   constant interval := interval '1 microsecond';
BEGIN
    IF TG_OP = 'UPDATE' AND NOT v_anula AND NEW.aparte_confirmada IS NOT DISTINCT FROM OLD.aparte_confirmada THEN
        RETURN NEW;   -- columnas fuera de Φ (K6): documento, validación, observación
    END IF;
    IF NEW.tanque_reefer_id IS NOT NULL THEN
        RETURN NEW;   -- el equipo de frío no forma parte de ningún cierre
    END IF;

    -- D1: claves antes de cualquier comprobación (camión, después depósitos por id)
    v_base := fue.fn_deposito_base(NEW.estacion_id);
    PERFORM fue.fn_bloquear(ARRAY[NEW.camion_id], ARRAY[NEW.deposito_id, v_base]);

    -- C3a: anular una carga reduce la diferencia del viaje o del segmento: la aprueba otro usuario
    IF v_anula AND NOT fue.fn_es_propietario() THEN
        RAISE EXCEPTION 'Anular la carga % reduce una diferencia: pedilo con fue.fn_solicitar_anulacion_carga y lo aprueba otro usuario', NEW.id
            USING ERRCODE = '42501';
    END IF;

    -- Período cerrado (D3), en todas las posiciones de la carga
    IF v_tractor THEN
        PERFORM fue.fn_exigir_abierto(fue.fn_cerrado_camion(NEW.camion_id, NEW.fecha_hora), 'Carga del tractor');
    END IF;
    IF NEW.deposito_id IS NOT NULL THEN
        PERFORM fue.fn_exigir_abierto(
            fue.fn_cerrado_deposito(NEW.deposito_id,
                                    coalesce((SELECT p.fecha_hora FROM fue.carga_combustible p WHERE p.id = NEW.carga_principal_id), NEW.fecha_hora),
                                    false), 'Carga a depósito');
    END IF;
    IF v_base IS NOT NULL AND (TG_OP = 'INSERT' OR v_anula) THEN
        PERFORM fue.fn_exigir_abierto(fue.fn_cerrado_deposito(v_base, NEW.fecha_hora, false), 'Carga en el surtidor propio');
    END IF;

    -- D9: una frontera nueva no puede coincidir con un movimiento de mochila sin parada ni con un control intermedio
    IF TG_OP = 'INSERT' AND NEW.es_frontera THEN
        IF EXISTS (SELECT 1 FROM fue.movimiento_combustible m
                     JOIN fue.deposito_combustible d ON d.id = m.deposito_id AND d.tipo = 'mochila' AND d.camion_id = NEW.camion_id
                    WHERE m.tipo <> 'ajuste' AND m.eliminado_en IS NULL
                      AND (m.fecha_hora = NEW.fecha_hora - v_menos
                           OR (m.fecha_hora = NEW.fecha_hora
                               AND NOT EXISTS (SELECT 1 FROM fue.carga_combustible c
                                                WHERE c.id = m.carga_id AND c.carga_principal_id IS NOT NULL)))) THEN
            RAISE EXCEPTION 'La parada del % coincide con un movimiento de la mochila sin parada: indicá la hora real', fue.fn_fmt_ts(NEW.fecha_hora)
                USING ERRCODE = '23514';
        END IF;
        IF EXISTS (SELECT 1 FROM fue.control_saldo_deposito k
                     JOIN fue.deposito_combustible d ON d.id = k.deposito_id AND d.tipo = 'mochila' AND d.camion_id = NEW.camion_id
                    WHERE k.estado = 'vigente' AND k.eliminado_en IS NULL AND k.rol = 'intermedio'
                      AND k.fecha_hora IN (NEW.fecha_hora, NEW.fecha_hora - v_menos)) THEN
            RAISE EXCEPTION 'La parada del % coincide con un control intermedio de la mochila: indicá la hora real', fue.fn_fmt_ts(NEW.fecha_hora)
                USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END $$;
COMMENT ON FUNCTION fue.fn_carga_periodo() IS 'BEFORE INSERT/UPDATE de cargas: toma las claves (D1), rechaza escrituras en período cerrado (D3, K6), exige aprobación para anular (C3a) y aplica D9 a las fronteras.';
CREATE TRIGGER tg_01_periodo BEFORE INSERT OR UPDATE ON fue.carga_combustible
    FOR EACH ROW EXECUTE FUNCTION fue.fn_carga_periodo();

-- Parada y mismo ticket (reemplaza la versión de la 22)
CREATE OR REPLACE FUNCTION fue.fn_carga_deposito_reglas()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE d fue.deposito_combustible%ROWTYPE; p fue.carga_combustible%ROWTYPE;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.carga_principal_id IS NOT NULL AND NEW.mismo_ticket AND NEW.tiene_documento AND NOT OLD.tiene_documento THEN
            RAISE EXCEPTION 'Mismo ticket: el documento va en la carga principal %', NEW.carga_principal_id USING ERRCODE = '23514';
        END IF;
        RETURN NEW;
    END IF;
    IF NEW.deposito_id IS NOT NULL THEN
        SELECT * INTO d FROM fue.deposito_combustible WHERE id = NEW.deposito_id AND eliminado_en IS NULL;
        IF d.estado IS DISTINCT FROM 'activo' THEN
            RAISE EXCEPTION 'Depósito % inexistente o inactivo', NEW.deposito_id USING ERRCODE = '23514';
        ELSIF d.tipo = 'mochila' AND d.camion_id <> NEW.camion_id THEN
            RAISE EXCEPTION 'La mochila % no es del camión de la carga', d.codigo USING ERRCODE = '23514';
        ELSIF d.tipo = 'tanque_base' AND d.estacion_id = NEW.estacion_id THEN
            RAISE EXCEPTION 'Un depósito no puede cargarse desde su propio surtidor' USING ERRCODE = '23514';
        ELSIF d.tipo_combustible_id <> NEW.tipo_combustible_id THEN
            RAISE EXCEPTION 'El depósito % es de otro tipo de combustible', d.codigo USING ERRCODE = '23514';
        END IF;
    END IF;
    IF NEW.carga_principal_id IS NOT NULL THEN
        SELECT * INTO p FROM fue.carga_combustible WHERE id = NEW.carga_principal_id;
        IF p.id IS NULL OR p.estado_validacion = 'anulada' OR p.carga_principal_id IS NOT NULL
           OR p.deposito_id IS NOT NULL OR p.tanque_reefer_id IS NOT NULL THEN
            RAISE EXCEPTION 'La carga principal % no existe, está anulada o no es una carga al tanque del tractor', NEW.carga_principal_id
                USING ERRCODE = '23514';
        ELSIF p.camion_id <> NEW.camion_id OR p.estacion_id IS DISTINCT FROM NEW.estacion_id
              OR abs(extract(epoch FROM p.fecha_hora - NEW.fecha_hora)) > 3600 THEN
            RAISE EXCEPTION 'Misma parada: debe ser el mismo camión, la misma estación y la misma hora (±1 h) que la carga %', p.id
                USING ERRCODE = '23514';
        ELSIF NEW.mismo_ticket AND NEW.tiene_documento THEN
            RAISE EXCEPTION 'Mismo ticket: el documento va en la carga principal %', p.id USING ERRCODE = '23514';
        END IF;
    END IF;
    RETURN NEW;
END $$;

-- K1: el sustituto solo se liga a una carga ya anulada (la anulación pasa por la aprobación).
-- Excepción: una carga al equipo de frío, que no forma parte de ningún cierre, se sigue anulando sola.
CREATE OR REPLACE FUNCTION fue.fn_carga_anular_original()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE o fue.carga_combustible%ROWTYPE;
BEGIN
    SELECT * INTO o FROM fue.carga_combustible WHERE id = NEW.anula_id;
    IF o.id IS NULL THEN
        RAISE EXCEPTION 'La carga % no existe', NEW.anula_id USING ERRCODE = '23514';
    ELSIF o.estado_validacion = 'anulada' THEN
        RETURN NULL;
    ELSIF o.tanque_reefer_id IS NOT NULL THEN
        UPDATE fue.carga_combustible
           SET estado_validacion = 'anulada', motivo_anulacion = coalesce(motivo_anulacion, format('Sustituida por carga %s', NEW.id))
         WHERE id = o.id;
        RETURN NULL;
    END IF;
    RAISE EXCEPTION 'La carga % no está anulada: primero se pide la anulación (fue.fn_solicitar_anulacion_carga), la aprueba otro usuario y después se registra la que la reemplaza', o.id
        USING ERRCODE = '23514';
END $$;

-- Movimientos de una carga. La entrada a una mochila con parada lleva la hora de la parada (orden por rol).
CREATE OR REPLACE FUNCTION fue.fn_carga_movimientos()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_dep_base bigint;
BEGIN
    IF TG_OP = 'INSERT' AND NEW.estado_validacion <> 'anulada' AND NEW.eliminado_en IS NULL THEN
        IF NEW.deposito_id IS NOT NULL THEN
            INSERT INTO fue.movimiento_combustible (deposito_id, fecha_hora, tipo, litros, carga_id, chofer_id)
            VALUES (NEW.deposito_id, fue.fn_ts_canonico(NEW.id), 'entrada_carga', NEW.litros, NEW.id, NEW.chofer_id);
        END IF;
        v_dep_base := fue.fn_deposito_base(NEW.estacion_id);
        IF v_dep_base IS NOT NULL THEN
            INSERT INTO fue.movimiento_combustible (deposito_id, fecha_hora, tipo, litros, carga_id, camion_id, chofer_id)
            VALUES (v_dep_base, NEW.fecha_hora, 'salida_carga_propia', -NEW.litros, NEW.id, NEW.camion_id, NEW.chofer_id);
        END IF;
    ELSIF TG_OP = 'UPDATE' AND NEW.estado_validacion = 'anulada' AND OLD.estado_validacion <> 'anulada' THEN
        INSERT INTO fue.movimiento_combustible (deposito_id, fecha_hora, tipo, litros, operacion, carga_id, camion_id, anula_id, motivo)
        SELECT m.deposito_id, m.fecha_hora, m.tipo, -m.litros, m.operacion, m.carga_id, m.camion_id, m.id,
               'Carga anulada: ' || coalesce(NEW.motivo_anulacion, 'sin motivo')
          FROM fue.movimiento_combustible m
         WHERE m.carga_id = NEW.id AND m.anula_id IS NULL
           AND NOT EXISTS (SELECT 1 FROM fue.movimiento_combustible r WHERE r.anula_id = m.id)
         ORDER BY m.deposito_id;
    END IF;
    RETURN NULL;
END $$;

-- =============================================================================
-- 11. Depósitos: vigencia de la mochila (K3, K7, D5) y reglas de la 22
-- =============================================================================
CREATE OR REPLACE FUNCTION fue.fn_deposito_reglas()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p fue.carga_combustible%ROWTYPE; v text;
BEGIN
    IF NEW.tipo = 'tanque_base' AND NOT EXISTS (SELECT 1 FROM mae.estacion_servicio e WHERE e.id = NEW.estacion_id AND e.es_tanque_propio) THEN
        RAISE EXCEPTION 'Un tanque de base va ligado a una estación con tanque propio' USING ERRCODE = '23514';
    END IF;
    -- K7: cambiar un depósito toma su clave (y antes la del camión, si es una mochila)
    PERFORM fue.fn_bloquear(ARRAY[NEW.camion_id], ARRAY[NEW.id]);

    IF TG_OP = 'INSERT' THEN
        IF NEW.estado <> 'activo' THEN RAISE EXCEPTION 'Un depósito nace activo' USING ERRCODE = '23514'; END IF;
        IF NEW.tipo = 'mochila' THEN
            IF NEW.parada_hasta_id IS NOT NULL THEN
                RAISE EXCEPTION 'La vigencia de una mochila se cierra después, con el control en 0 de la parada (D5)' USING ERRCODE = '23514';
            END IF;
            SELECT * INTO p FROM fue.carga_combustible WHERE id = NEW.parada_desde_id;
            IF NOT fue.fn_es_frontera(NEW.parada_desde_id, NEW.camion_id) THEN
                RAISE EXCEPTION 'La mochila empieza en una parada frontera (llenado marcado como frontera) del mismo camión' USING ERRCODE = '23514';
            END IF;
            NEW.vigente_desde := p.fecha_hora - interval '1 microsecond';
            NEW.vigente_hasta := NULL;
            IF NOT EXISTS (SELECT 1 FROM fue.uso_mochila u WHERE u.camion_id = NEW.camion_id AND u.eliminado_en IS NULL
                              AND u.desde_ts <= p.fecha_hora AND (u.hasta_ts IS NULL OR u.hasta_ts > p.fecha_hora)) THEN
                RAISE EXCEPTION 'El camión no usa mochila desde esa parada: registrá antes el uso de mochila (fue.uso_mochila)' USING ERRCODE = '23514';
            END IF;
            v := fue.fn_cierre_aprobado_entre(NEW.camion_id, p.fecha_hora, NULL);
            IF v IS NOT NULL THEN
                RAISE EXCEPTION 'La vigencia de la mochila cambiaría el cierre aprobado %: anulalo antes', v USING ERRCODE = '55000';
            END IF;
        ELSE
            NEW.vigente_desde := NULL; NEW.vigente_hasta := NULL;
        END IF;
        RETURN NEW;
    END IF;

    -- Vigencia: solo se cierra una vez (D5: la mochila se muda vacía)
    IF NEW.parada_hasta_id IS DISTINCT FROM OLD.parada_hasta_id THEN
        IF OLD.parada_hasta_id IS NOT NULL THEN
            RAISE EXCEPTION 'La vigencia de la mochila % ya está cerrada', OLD.codigo USING ERRCODE = '55000';
        END IF;
        SELECT * INTO p FROM fue.carga_combustible WHERE id = NEW.parada_hasta_id;
        IF NOT fue.fn_es_frontera(NEW.parada_hasta_id, NEW.camion_id) OR p.fecha_hora - interval '1 microsecond' <= OLD.vigente_desde THEN
            RAISE EXCEPTION 'La vigencia termina en una parada frontera del mismo camión, posterior a la de inicio' USING ERRCODE = '23514';
        END IF;
        NEW.vigente_hasta := p.fecha_hora - interval '1 microsecond';
        IF NOT EXISTS (SELECT 1 FROM fue.control_saldo_deposito k
                        WHERE k.deposito_id = NEW.id AND k.estado = 'vigente' AND k.eliminado_en IS NULL
                          AND k.fecha_hora = NEW.vigente_hasta AND k.litros = 0 AND k.fuente = 'medicion') THEN
            RAISE EXCEPTION 'Para cerrar la vigencia, registrá en esa parada el control de llegada medido en 0 (la mochila se muda vacía)'
                USING ERRCODE = '23514';
        END IF;
        IF EXISTS (SELECT 1 FROM fue.movimiento_combustible m WHERE m.deposito_id = NEW.id AND m.eliminado_en IS NULL
                      AND m.fecha_hora > NEW.vigente_hasta)
           OR EXISTS (SELECT 1 FROM fue.control_saldo_deposito k WHERE k.deposito_id = NEW.id AND k.estado = 'vigente'
                      AND k.eliminado_en IS NULL AND k.fecha_hora > NEW.vigente_hasta) THEN
            RAISE EXCEPTION 'La mochila % tiene movimientos o controles después de esa parada', OLD.codigo USING ERRCODE = '23514';
        END IF;
        v := fue.fn_cierre_aprobado_entre(NEW.camion_id, p.fecha_hora, NULL);
        IF v IS NOT NULL THEN
            RAISE EXCEPTION 'Cerrar la vigencia cambiaría el cierre aprobado %: anulalo antes', v USING ERRCODE = '55000';
        END IF;
    END IF;
    IF NEW.vigente_desde IS DISTINCT FROM OLD.vigente_desde
       OR (NEW.vigente_hasta IS DISTINCT FROM OLD.vigente_hasta AND NEW.parada_hasta_id IS NOT DISTINCT FROM OLD.parada_hasta_id) THEN
        RAISE EXCEPTION 'La vigencia se fija con las paradas, no a mano' USING ERRCODE = '55000';
    END IF;

    IF NEW.estado = 'activo' AND OLD.estado = 'inactivo' AND NEW.tipo = 'mochila' AND OLD.parada_hasta_id IS NOT NULL THEN
        RAISE EXCEPTION 'Una mochila con la vigencia cerrada no se reactiva: creá otra' USING ERRCODE = '23514';
    END IF;
    IF (NEW.estado = 'inactivo' AND OLD.estado = 'activo') OR (NEW.eliminado_en IS NOT NULL AND OLD.eliminado_en IS NULL) THEN
        IF fue.fn_saldo_deposito(OLD.id) <> 0 THEN
            RAISE EXCEPTION 'El depósito % tiene saldo %: llevarlo a cero antes de inactivarlo', OLD.codigo, fue.fn_saldo_deposito(OLD.id) USING ERRCODE = '23514';
        END IF;
    END IF;
    IF NEW.eliminado_en IS NOT NULL AND OLD.eliminado_en IS NULL
       AND (EXISTS (SELECT 1 FROM fue.movimiento_combustible WHERE deposito_id = OLD.id OR deposito_contraparte_id = OLD.id)
            OR EXISTS (SELECT 1 FROM fue.control_saldo_deposito WHERE deposito_id = OLD.id)) THEN
        RAISE EXCEPTION 'El depósito % tiene movimientos: se inactiva, no se da de baja', OLD.codigo USING ERRCODE = '23514';
    END IF;
    RETURN NEW;
END $$;

-- =============================================================================
-- 12. Uso de mochila (K3)
-- =============================================================================
CREATE OR REPLACE FUNCTION fue.fn_uso_mochila_reglas()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE p fue.carga_combustible%ROWTYPE; v text; v_lo timestamptz; v_hi timestamptz;
BEGIN
    PERFORM fue.fn_bloquear(ARRAY[NEW.camion_id]);
    IF TG_OP = 'INSERT' THEN
        IF NOT fue.fn_es_frontera(NEW.parada_desde_id, NEW.camion_id) THEN
            RAISE EXCEPTION 'El uso de mochila empieza en una parada frontera del mismo camión' USING ERRCODE = '23514';
        END IF;
        NEW.desde_ts := (SELECT fecha_hora FROM fue.carga_combustible WHERE id = NEW.parada_desde_id);
    END IF;
    IF NEW.parada_hasta_id IS NOT NULL THEN
        SELECT * INTO p FROM fue.carga_combustible WHERE id = NEW.parada_hasta_id;
        IF NOT fue.fn_es_frontera(NEW.parada_hasta_id, NEW.camion_id) THEN
            RAISE EXCEPTION 'El uso de mochila termina en una parada frontera del mismo camión' USING ERRCODE = '23514';
        END IF;
        NEW.hasta_ts := p.fecha_hora;
    ELSE
        NEW.hasta_ts := NULL;
    END IF;

    -- Una mochila vigente necesita el uso de mochila del camión
    IF (NEW.hasta_ts IS NOT NULL OR NEW.eliminado_en IS NOT NULL)
       AND EXISTS (SELECT 1 FROM fue.deposito_combustible d WHERE d.tipo = 'mochila' AND d.camion_id = NEW.camion_id
                      AND d.eliminado_en IS NULL AND d.vigente_desde >= NEW.desde_ts - interval '1 microsecond'
                      AND (NEW.eliminado_en IS NOT NULL
                           OR coalesce(d.vigente_hasta, 'infinity') > NEW.hasta_ts - interval '1 microsecond')) THEN
        RAISE EXCEPTION 'Hay una mochila vigente en ese período: cerrá antes su vigencia (con el control en 0)' USING ERRCODE = '23514';
    END IF;

    -- Ningún cierre aprobado puede cambiar de "usa mochila" (K3)
    IF TG_OP = 'INSERT' THEN
        v_lo := NEW.desde_ts; v_hi := NEW.hasta_ts;
    ELSIF NEW.eliminado_en IS NOT NULL AND OLD.eliminado_en IS NULL THEN
        v_lo := OLD.desde_ts; v_hi := OLD.hasta_ts;
    ELSIF NEW.hasta_ts IS DISTINCT FROM OLD.hasta_ts THEN
        v_lo := least(coalesce(NEW.hasta_ts, 'infinity'), coalesce(OLD.hasta_ts, 'infinity'));
        v_hi := nullif(greatest(coalesce(NEW.hasta_ts, 'infinity'), coalesce(OLD.hasta_ts, 'infinity')), 'infinity');
    END IF;
    IF v_lo IS NOT NULL THEN
        v := fue.fn_cierre_aprobado_entre(NEW.camion_id, v_lo, v_hi);
        IF v IS NOT NULL THEN
            RAISE EXCEPTION 'El cambio de uso de mochila afecta el cierre aprobado %: anulalo antes', v USING ERRCODE = '55000';
        END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER tg_12_reglas BEFORE INSERT OR UPDATE ON fue.uso_mochila
    FOR EACH ROW EXECUTE FUNCTION fue.fn_uso_mochila_reglas();

-- =============================================================================
-- 13. Controles de saldo: reglas, reemplazo y conciliación automática
-- =============================================================================
-- El reemplazo marca el control viejo después de insertar el nuevo (misma hora en una frontera):
-- las unicidades de controles vigentes se verifican al confirmar.
ALTER TABLE fue.control_saldo_deposito
    ADD CONSTRAINT ex_csd_deposito_fecha EXCLUDE USING btree (deposito_id WITH =, fecha_hora WITH =)
        WHERE (estado = 'vigente' AND eliminado_en IS NULL) DEFERRABLE INITIALLY DEFERRED,
    -- D4: a lo sumo un control de frontera vigente por parada y depósito (inicial o llegada)
    ADD CONSTRAINT ex_csd_frontera EXCLUDE USING btree (deposito_id WITH =, carga_parada_id WITH =)
        WHERE (carga_parada_id IS NOT NULL AND estado = 'vigente' AND eliminado_en IS NULL) DEFERRABLE INITIALLY DEFERRED,
    ADD CONSTRAINT ex_csd_inicial EXCLUDE USING btree (deposito_id WITH =)
        WHERE (rol = 'inicial' AND estado = 'vigente' AND eliminado_en IS NULL) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX ix_csd_deposito_fecha ON fue.control_saldo_deposito (deposito_id, fecha_hora) WHERE estado = 'vigente';

DROP TRIGGER IF EXISTS tg_12_saldo_libro ON fue.control_saldo_deposito;
DROP FUNCTION IF EXISTS fue.fn_control_saldo_libro();

CREATE OR REPLACE FUNCTION fue.fn_control_reglas()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    d fue.deposito_combustible%ROWTYPE;
    o fue.control_saldo_deposito%ROWTYPE;
    p fue.carga_combustible%ROWTYPE;
    v_menos constant interval := interval '1 microsecond';
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF NEW.estado IS DISTINCT FROM OLD.estado AND NOT (OLD.estado = 'vigente' AND NEW.estado = 'reemplazado') THEN
            RAISE EXCEPTION 'Un control solo pasa de vigente a reemplazado' USING ERRCODE = '55000';
        END IF;
        RETURN NEW;
    END IF;

    SELECT * INTO d FROM fue.deposito_combustible WHERE id = NEW.deposito_id AND eliminado_en IS NULL;
    IF d.id IS NULL OR d.estado <> 'activo' THEN
        RAISE EXCEPTION 'Depósito % inexistente o inactivo', NEW.deposito_id USING ERRCODE = '23514';
    END IF;
    PERFORM fue.fn_bloquear(ARRAY[d.camion_id], ARRAY[d.id]);   -- D1, antes de comprobar
    NEW.estado := 'vigente';

    IF NEW.reemplaza_id IS NOT NULL THEN
        SELECT * INTO o FROM fue.control_saldo_deposito WHERE id = NEW.reemplaza_id;
        IF o.id IS NULL OR o.estado <> 'vigente' OR o.deposito_id <> NEW.deposito_id OR o.rol <> NEW.rol THEN
            RAISE EXCEPTION 'El control % no existe, ya fue reemplazado o es de otro depósito o rol', NEW.reemplaza_id USING ERRCODE = '23514';
        END IF;
        IF o.carga_parada_id IS NOT NULL THEN
            NEW.carga_parada_id := coalesce(NEW.carga_parada_id, o.carga_parada_id);
            IF NEW.carga_parada_id <> o.carga_parada_id THEN
                RAISE EXCEPTION 'El reemplazo de un control de frontera es de la misma parada' USING ERRCODE = '23514';
            END IF;
        END IF;
        PERFORM fue.fn_exigir_abierto(fue.fn_cerrado_deposito(d.id, o.fecha_hora, true), 'Reemplazo de control');
    END IF;

    IF d.tipo = 'mochila' THEN
        IF NEW.rol NOT IN ('inicial','llegada','intermedio') THEN
            RAISE EXCEPTION 'Una mochila tiene controles inicial, de llegada o intermedios' USING ERRCODE = '23514';
        END IF;
        IF NEW.rol = 'inicial' THEN
            NEW.carga_parada_id := coalesce(NEW.carga_parada_id, d.parada_desde_id);
            IF NEW.carga_parada_id <> d.parada_desde_id THEN
                RAISE EXCEPTION 'El control inicial va en la parada de puesta en marcha de la mochila (D4)' USING ERRCODE = '23514';
            END IF;
        END IF;
        IF NEW.rol IN ('inicial','llegada') THEN
            SELECT * INTO p FROM fue.carga_combustible WHERE id = NEW.carga_parada_id;
            IF NOT fue.fn_es_frontera(NEW.carga_parada_id, d.camion_id) THEN
                RAISE EXCEPTION 'El control de frontera va ligado a una parada frontera vigente del camión de la mochila' USING ERRCODE = '23514';
            END IF;
            NEW.fecha_hora := p.fecha_hora - v_menos;    -- por rol: antes del llenado y de las cargas de mochila
            IF NEW.rol = 'llegada' AND (NEW.fecha_hora <= d.vigente_desde OR NEW.fecha_hora > coalesce(d.vigente_hasta, 'infinity')) THEN
                RAISE EXCEPTION 'La parada está fuera de la vigencia de la mochila %', d.codigo USING ERRCODE = '23514';
            END IF;
        ELSE
            IF NEW.fecha_hora <= d.vigente_desde OR NEW.fecha_hora > coalesce(d.vigente_hasta, 'infinity') THEN
                RAISE EXCEPTION 'El control está fuera de la vigencia de la mochila %', d.codigo USING ERRCODE = '23514';
            END IF;
            IF EXISTS (SELECT 1 FROM fue.carga_combustible c WHERE c.camion_id = d.camion_id AND c.es_frontera
                          AND c.estado_validacion <> 'anulada' AND c.eliminado_en IS NULL
                          AND NEW.fecha_hora IN (c.fecha_hora, c.fecha_hora - v_menos)) THEN
                RAISE EXCEPTION 'Un control intermedio no puede tener la hora de una parada frontera: indicá la hora real' USING ERRCODE = '23514';
            END IF;
        END IF;
    ELSE
        IF NEW.rol NOT IN ('inicial','base') OR NEW.carga_parada_id IS NOT NULL THEN
            RAISE EXCEPTION 'Un tanque de base tiene control inicial o controles de base, sin parada' USING ERRCODE = '23514';
        END IF;
        IF (NEW.rol = 'inicial') <> NOT EXISTS (SELECT 1 FROM fue.control_saldo_deposito k
                                                  WHERE k.deposito_id = d.id AND k.estado = 'vigente' AND k.eliminado_en IS NULL
                                                    AND k.id IS DISTINCT FROM o.id AND k.fecha_hora < NEW.fecha_hora) THEN
            RAISE EXCEPTION 'El primer control de un tanque de base es el inicial, y solo el primero' USING ERRCODE = '23514';
        END IF;
    END IF;

    IF EXISTS (SELECT 1 FROM fue.control_saldo_deposito k WHERE k.deposito_id = d.id AND k.fecha_hora = NEW.fecha_hora
                  AND k.estado = 'vigente' AND k.eliminado_en IS NULL AND k.id IS DISTINCT FROM o.id) THEN
        RAISE EXCEPTION 'Ya hay un control vigente de % en ese instante (%): para corregirlo, reemplazalo', d.codigo, fue.fn_fmt_ts(NEW.fecha_hora)
            USING ERRCODE = '23505';
    END IF;
    -- D9: ningún movimiento real en el instante de un control
    IF EXISTS (SELECT 1 FROM fue.movimiento_combustible m WHERE m.deposito_id = d.id AND m.fecha_hora = NEW.fecha_hora
                  AND m.tipo <> 'ajuste' AND m.eliminado_en IS NULL) THEN
        RAISE EXCEPTION 'Hay un movimiento en el mismo instante del control (%): indicá la hora real', fue.fn_fmt_ts(NEW.fecha_hora)
            USING ERRCODE = '23514';
    END IF;
    PERFORM fue.fn_exigir_abierto(fue.fn_cerrado_deposito(d.id, NEW.fecha_hora, true), 'Control de saldo');

    IF NEW.fuente = 'medicion' THEN
        NEW.medido_por := coalesce(NEW.medido_por, aud.fn_usuario_actual());
    END IF;
    -- Libro en ese instante sin los ajustes de controles de ese instante (los del control reemplazado)
    NEW.saldo_libro_l := coalesce((SELECT sum(m.litros) FROM fue.movimiento_combustible m
                                    WHERE m.deposito_id = d.id AND m.fecha_hora <= NEW.fecha_hora AND m.eliminado_en IS NULL
                                      AND NOT (m.tipo = 'ajuste' AND m.fecha_hora = NEW.fecha_hora)), 0);
    RETURN NEW;
END $$;
COMMENT ON FUNCTION fue.fn_control_reglas() IS 'BEFORE INSERT/UPDATE de controles: claves (D1), rol y parada (D4), vigencia, D9, período cerrado y saldo de libro del momento.';
CREATE TRIGGER tg_12_reglas BEFORE INSERT OR UPDATE ON fue.control_saldo_deposito
    FOR EACH ROW EXECUTE FUNCTION fue.fn_control_reglas();

-- Conciliación: cada control vigente tiene ajustes que dejan el libro igual al físico.
-- Recorre los controles desde p_desde y se detiene en el primero posterior que ya está conciliado
-- (con libro = físico en un control, los siguientes no cambian).
CREATE OR REPLACE FUNCTION fue.fn_conciliar_deposito(p_deposito bigint, p_desde timestamptz)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions AS $$
DECLARE c record; v_libro numeric; v_actual numeric; v_necesario numeric; n integer := 0;
BEGIN
    -- Los ajustes de controles reemplazados se revierten
    INSERT INTO fue.movimiento_combustible (deposito_id, fecha_hora, tipo, litros, operacion, control_id, anula_id, motivo)
    SELECT a.deposito_id, a.fecha_hora, 'ajuste', -a.litros, a.operacion, a.control_id, a.id, 'Control reemplazado'
      FROM fue.movimiento_combustible a
      JOIN fue.control_saldo_deposito k ON k.id = a.control_id AND k.estado = 'reemplazado'
     WHERE a.deposito_id = p_deposito AND a.tipo = 'ajuste' AND a.anula_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM fue.movimiento_combustible r WHERE r.anula_id = a.id);

    FOR c IN SELECT k.id, k.fecha_hora, k.litros, k.fuente FROM fue.control_saldo_deposito k
              WHERE k.deposito_id = p_deposito AND k.estado = 'vigente' AND k.eliminado_en IS NULL AND k.fecha_hora >= p_desde
              ORDER BY k.fecha_hora LOOP
        SELECT coalesce(sum(m.litros) FILTER (WHERE m.control_id IS DISTINCT FROM c.id), 0),
               coalesce(sum(m.litros) FILTER (WHERE m.control_id = c.id), 0)
          INTO v_libro, v_actual
          FROM fue.movimiento_combustible m
         WHERE m.deposito_id = p_deposito AND m.fecha_hora <= c.fecha_hora AND m.eliminado_en IS NULL;
        v_necesario := c.litros - v_libro;
        IF v_necesario = v_actual THEN
            EXIT WHEN c.fecha_hora > p_desde;
            CONTINUE;
        END IF;
        INSERT INTO fue.movimiento_combustible (deposito_id, fecha_hora, tipo, litros, operacion, control_id, anula_id, motivo)
        SELECT a.deposito_id, a.fecha_hora, 'ajuste', -a.litros, a.operacion, a.control_id, a.id, 'Reconciliación'
          FROM fue.movimiento_combustible a
         WHERE a.control_id = c.id AND a.tipo = 'ajuste' AND a.anula_id IS NULL
           AND NOT EXISTS (SELECT 1 FROM fue.movimiento_combustible r WHERE r.anula_id = a.id);
        IF v_necesario <> 0 THEN
            INSERT INTO fue.movimiento_combustible (deposito_id, fecha_hora, tipo, litros, control_id, motivo)
            VALUES (p_deposito, c.fecha_hora, 'ajuste', v_necesario, c.id, 'Conciliación por ' || c.fuente);
        END IF;
        n := n + 1;
    END LOOP;
    RETURN n;
END $$;
COMMENT ON FUNCTION fue.fn_conciliar_deposito(bigint,timestamptz) IS 'Conciliación automática (sección 15): ajusta los controles vigentes desde una fecha para que libro = físico. Escribe solo ajustes (no pertenecen a ningún Φ). Interna.';

CREATE OR REPLACE FUNCTION fue.fn_control_despues()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions AS $$
DECLARE v_desde timestamptz := NEW.fecha_hora;
BEGIN
    IF NEW.reemplaza_id IS NOT NULL THEN
        UPDATE fue.control_saldo_deposito SET estado = 'reemplazado'
         WHERE id = NEW.reemplaza_id AND estado = 'vigente'
        RETURNING least(fecha_hora, NEW.fecha_hora) INTO v_desde;
        IF v_desde IS NULL THEN
            RAISE EXCEPTION 'El control % ya no está vigente', NEW.reemplaza_id USING ERRCODE = '40001';
        END IF;
    END IF;
    PERFORM fue.fn_conciliar_deposito(NEW.deposito_id, v_desde);
    RETURN NULL;
END $$;
CREATE TRIGGER tg_80_conciliar AFTER INSERT ON fue.control_saldo_deposito
    FOR EACH ROW EXECUTE FUNCTION fue.fn_control_despues();

-- =============================================================================
-- 14. Libro de movimientos: reglas (reemplaza la versión de la 22) y conciliación
-- =============================================================================
CREATE OR REPLACE FUNCTION fue.fn_movimiento_reglas()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    d fue.deposito_combustible%ROWTYPE;
    o fue.movimiento_combustible%ROWTYPE;
    c fue.control_saldo_deposito%ROWTYPE;
    v_parada timestamptz;
    v_menos constant interval := interval '1 microsecond';
BEGIN
    SELECT * INTO d FROM fue.deposito_combustible WHERE id = NEW.deposito_id;
    PERFORM fue.fn_bloquear(ARRAY[d.camion_id], ARRAY[NEW.deposito_id]);   -- D1 (reemplaza el bloqueo por hashtext de la 22)

    IF NEW.tipo = 'ajuste' AND NOT fue.fn_es_propietario() THEN
        RAISE EXCEPTION 'Los ajustes los genera la conciliación al registrar un control' USING ERRCODE = '42501';
    END IF;

    -- Reverso: espejo exacto del original
    IF NEW.anula_id IS NOT NULL THEN
        SELECT * INTO o FROM fue.movimiento_combustible WHERE id = NEW.anula_id;
        IF o.id IS NULL OR o.anula_id IS NOT NULL THEN
            RAISE EXCEPTION 'El movimiento % no existe o ya es un reverso', NEW.anula_id USING ERRCODE = '23514';
        ELSIF (o.deposito_id, o.tipo, o.operacion, o.fecha_hora, -o.litros)
              IS DISTINCT FROM (NEW.deposito_id, NEW.tipo, NEW.operacion, NEW.fecha_hora, NEW.litros) THEN
            RAISE EXCEPTION 'Un reverso debe tener el mismo depósito, tipo, operación y fecha que el movimiento %, con los litros con signo contrario', o.id USING ERRCODE = '23514';
        ELSIF o.tipo IN ('entrada_carga','salida_carga_propia') AND pg_trigger_depth() < 2 THEN
            RAISE EXCEPTION 'El movimiento % viene de una carga: se revierte anulando la carga', o.id USING ERRCODE = '23514';
        END IF;
        IF o.tipo <> 'ajuste' THEN
            -- C3a: un reverso que reduce una diferencia (de una entrada o de un paso al tractor) lo aprueba otro usuario
            IF NOT fue.fn_es_propietario() AND (o.litros > 0 OR o.tipo = 'salida_tractor' OR o.estado_aprobacion = 'pendiente') THEN
                RAISE EXCEPTION 'El reverso del movimiento % reduce una diferencia o está pendiente de aprobación: pedilo con fue.fn_solicitar_reverso', o.id
                    USING ERRCODE = '42501';
            END IF;
            PERFORM fue.fn_exigir_abierto(fue.fn_cerrado_deposito(d.id, NEW.fecha_hora, false), 'Reverso de movimiento');
        END IF;
        RETURN NEW;
    END IF;

    IF d.estado IS DISTINCT FROM 'activo' OR d.eliminado_en IS NOT NULL THEN
        RAISE EXCEPTION 'Depósito % inexistente o inactivo', NEW.deposito_id USING ERRCODE = '23514';
    END IF;
    IF d.tipo = 'mochila' AND (NEW.fecha_hora < d.vigente_desde
                               OR (NEW.tipo <> 'ajuste' AND NEW.fecha_hora = d.vigente_desde)
                               OR NEW.fecha_hora > coalesce(d.vigente_hasta, 'infinity')) THEN
        RAISE EXCEPTION 'El % está fuera de la vigencia de la mochila %', fue.fn_fmt_ts(NEW.fecha_hora), d.codigo USING ERRCODE = '23514';
    END IF;

    IF NEW.tipo <> 'ajuste' THEN
        PERFORM fue.fn_exigir_abierto(fue.fn_cerrado_deposito(d.id, NEW.fecha_hora, false), 'Movimiento de ' || d.codigo);
        -- D9: ningún movimiento real en el instante de un control
        IF EXISTS (SELECT 1 FROM fue.control_saldo_deposito k WHERE k.deposito_id = d.id AND k.fecha_hora = NEW.fecha_hora
                      AND k.estado = 'vigente' AND k.eliminado_en IS NULL) THEN
            RAISE EXCEPTION 'El movimiento coincide con un control de % (%): indicá la hora real', d.codigo, fue.fn_fmt_ts(NEW.fecha_hora)
                USING ERRCODE = '23514';
        END IF;
        -- D9: un movimiento sin parada no puede tener la hora de una parada frontera del camión
        IF d.tipo = 'mochila' THEN
            SELECT f.fecha_hora INTO v_parada FROM fue.carga_combustible f
             WHERE f.camion_id = d.camion_id AND f.es_frontera AND f.estado_validacion <> 'anulada' AND f.eliminado_en IS NULL
               AND NEW.fecha_hora IN (f.fecha_hora, f.fecha_hora - v_menos)
             LIMIT 1;
            IF v_parada IS NOT NULL
               AND NOT (NEW.tipo = 'entrada_carga' AND NEW.fecha_hora = v_parada
                        AND EXISTS (SELECT 1 FROM fue.carga_combustible x WHERE x.id = NEW.carga_id AND x.carga_principal_id IS NOT NULL)) THEN
                RAISE EXCEPTION 'Coincide con la parada del %: indicá la hora real', fue.fn_fmt_ts(v_parada) USING ERRCODE = '23514';
            END IF;
        END IF;
    END IF;

    CASE NEW.tipo
    WHEN 'entrada_carga', 'salida_carga_propia' THEN
        IF pg_trigger_depth() < 2 THEN
            RAISE EXCEPTION 'Los movimientos de tipo % se generan solos al registrar la carga', NEW.tipo USING ERRCODE = '23514';
        END IF;
    WHEN 'salida_tractor' THEN
        IF d.tipo <> 'mochila' OR NEW.camion_id IS DISTINCT FROM d.camion_id THEN
            RAISE EXCEPTION 'Solo una mochila pasa combustible, y solo al tanque de su propio camión' USING ERRCODE = '23514';
        END IF;
    WHEN 'transferencia_salida', 'transferencia_entrada' THEN
        IF NOT EXISTS (SELECT 1 FROM fue.deposito_combustible x WHERE x.id = NEW.deposito_contraparte_id
                        AND x.estado = 'activo' AND x.eliminado_en IS NULL AND x.tipo_combustible_id = d.tipo_combustible_id) THEN
            RAISE EXCEPTION 'El depósito contraparte no existe, está inactivo o es de otro combustible' USING ERRCODE = '23514';
        END IF;
    WHEN 'entrada_otra', 'salida_otra' THEN
        IF NEW.categoria = 'compra_granel' AND d.tipo <> 'tanque_base' THEN
            RAISE EXCEPTION 'La compra a granel entra solo al tanque de base' USING ERRCODE = '23514';
        END IF;
        NEW.estado_aprobacion := 'pendiente';   -- C3a: integra el libro ya; bloquea el cierre hasta que otro usuario lo resuelva
        NEW.resuelto_por := NULL; NEW.resuelto_en := NULL; NEW.resuelto_roles := NULL; NEW.motivo_resolucion := NULL;
    WHEN 'ajuste' THEN
        SELECT * INTO c FROM fue.control_saldo_deposito WHERE id = NEW.control_id AND eliminado_en IS NULL;
        IF c.deposito_id IS DISTINCT FROM NEW.deposito_id OR c.fecha_hora IS DISTINCT FROM NEW.fecha_hora OR c.estado <> 'vigente' THEN
            RAISE EXCEPTION 'El ajuste debe ser de un control vigente, del mismo depósito y fecha' USING ERRCODE = '23514';
        ELSIF NEW.litros <> -fue.fn_diferencia_control(c.id) THEN
            RAISE EXCEPTION 'El ajuste del control % debe ser de % L', c.id, -fue.fn_diferencia_control(c.id) USING ERRCODE = '23514';
        ELSIF EXISTS (SELECT 1 FROM fue.movimiento_combustible a WHERE a.control_id = c.id AND a.tipo = 'ajuste' AND a.anula_id IS NULL
                       AND NOT EXISTS (SELECT 1 FROM fue.movimiento_combustible r WHERE r.anula_id = a.id)) THEN
            RAISE EXCEPTION 'El control % ya tiene su ajuste', c.id USING ERRCODE = '23505';
        END IF;
    ELSE NULL;
    END CASE;
    RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION fue.fn_movimiento_despues()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions AS $$
BEGIN
    PERFORM fue.fn_conciliar_deposito(NEW.deposito_id, NEW.fecha_hora);
    RETURN NULL;
END $$;
CREATE TRIGGER tg_80_conciliar AFTER INSERT ON fue.movimiento_combustible
    FOR EACH ROW WHEN (NEW.tipo <> 'ajuste') EXECUTE FUNCTION fue.fn_movimiento_despues();

-- Estado de aprobación: solo pendiente → aprobado | rechazado (por fn_resolver_movimiento)
CREATE OR REPLACE FUNCTION fue.fn_movimiento_estado()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.estado_aprobacion IS DISTINCT FROM OLD.estado_aprobacion
       AND NOT (OLD.estado_aprobacion = 'pendiente' AND NEW.estado_aprobacion IN ('aprobado','rechazado')) THEN
        RAISE EXCEPTION 'Un movimiento con motivo solo pasa de pendiente a aprobado o rechazado' USING ERRCODE = '55000';
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER tg_13_estado BEFORE UPDATE ON fue.movimiento_combustible
    FOR EACH ROW EXECUTE FUNCTION fue.fn_movimiento_estado();

-- =============================================================================
-- 15. Operaciones sobre el libro (RPC)
-- =============================================================================
-- Claves de todos los depósitos (y sus camiones) de una operación
CREATE OR REPLACE FUNCTION fue.fn_bloquear_operacion(p_operacion uuid)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_cam bigint[]; v_dep bigint[];
BEGIN
    SELECT array_agg(DISTINCT d.camion_id), array_agg(DISTINCT d.id) INTO v_cam, v_dep
      FROM fue.movimiento_combustible m JOIN fue.deposito_combustible d ON d.id = m.deposito_id
     WHERE m.operacion = p_operacion;
    PERFORM fue.fn_bloquear(coalesce(v_cam, '{}'), coalesce(v_dep, '{}'));
END $$;

CREATE OR REPLACE FUNCTION fue.fn_transferir_combustible(
    p_origen bigint, p_destino bigint, p_litros numeric, p_fecha_hora timestamptz,
    p_chofer_id bigint DEFAULT NULL, p_motivo text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE v_op uuid := gen_random_uuid();
BEGIN
    IF p_litros IS NULL OR p_litros <= 0 THEN RAISE EXCEPTION 'Los litros a transferir deben ser mayores que cero' USING ERRCODE = '23514'; END IF;
    -- D1: los dos camiones (si son mochilas) y después los dos depósitos, en orden de id
    PERFORM fue.fn_bloquear(ARRAY(SELECT camion_id FROM fue.deposito_combustible WHERE id IN (p_origen, p_destino)),
                            ARRAY[p_origen, p_destino]);
    SET CONSTRAINTS fue.tg_96_transferencia_pareada, fue.tg_97_limites DEFERRED;
    INSERT INTO fue.movimiento_combustible (deposito_id, fecha_hora, tipo, litros, operacion, deposito_contraparte_id, chofer_id, motivo)
    VALUES (p_origen,  p_fecha_hora, 'transferencia_salida',  -p_litros, v_op, p_destino, p_chofer_id, p_motivo);
    INSERT INTO fue.movimiento_combustible (deposito_id, fecha_hora, tipo, litros, operacion, deposito_contraparte_id, chofer_id, motivo)
    VALUES (p_destino, p_fecha_hora, 'transferencia_entrada',  p_litros, v_op, p_origen,  p_chofer_id, p_motivo);
    SET CONSTRAINTS fue.tg_96_transferencia_pareada, fue.tg_97_limites IMMEDIATE;
    SET CONSTRAINTS fue.tg_96_transferencia_pareada, fue.tg_97_limites DEFERRED;
    RETURN v_op;
END $$;
COMMENT ON FUNCTION fue.fn_transferir_combustible(bigint,bigint,numeric,timestamptz,bigint,text) IS 'Transfiere litros entre depósitos (dos movimientos con la misma operación). Devuelve la operación.';

CREATE OR REPLACE FUNCTION fue.fn_movimiento_con_motivo(
    p_deposito bigint, p_categoria text, p_litros numeric, p_fecha_hora timestamptz, p_motivo text,
    p_evidencia text DEFAULT NULL, p_chofer_id bigint DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_id bigint; v_tipo text;
BEGIN
    IF p_litros IS NULL OR p_litros <= 0 THEN RAISE EXCEPTION 'Los litros deben ser mayores que cero' USING ERRCODE = '23514'; END IF;
    v_tipo := CASE WHEN p_categoria IN ('derrame','robo_denunciado','drenaje_agua') THEN 'salida_otra'
                   WHEN p_categoria IN ('carga_bidon','compra_granel') THEN 'entrada_otra' END;
    IF v_tipo IS NULL THEN
        RAISE EXCEPTION 'Categoría % fuera del catálogo (derrame, robo_denunciado, drenaje_agua, carga_bidon, compra_granel)', p_categoria
            USING ERRCODE = '23514', HINT = 'Una corrección administrativa se hace con un reverso; la merma la absorbe la tolerancia.';
    END IF;
    INSERT INTO fue.movimiento_combustible (deposito_id, fecha_hora, tipo, litros, motivo, categoria, evidencia, chofer_id)
    VALUES (p_deposito, p_fecha_hora, v_tipo, CASE WHEN v_tipo = 'salida_otra' THEN -p_litros ELSE p_litros END,
            p_motivo, p_categoria, p_evidencia, p_chofer_id)
    RETURNING id INTO v_id;
    SET CONSTRAINTS fue.tg_97_limites IMMEDIATE;
    SET CONSTRAINTS fue.tg_97_limites DEFERRED;
    RETURN v_id;
END $$;
COMMENT ON FUNCTION fue.fn_movimiento_con_motivo(bigint,text,numeric,timestamptz,text,text,bigint) IS 'C3a: entrada o salida física de un catálogo cerrado. Nace pendiente: integra el libro y bloquea el cierre hasta que otro usuario la apruebe o la rechace (fn_resolver_movimiento).';

CREATE OR REPLACE FUNCTION fue.fn_revertir_movimiento(p_movimiento bigint, p_motivo text)
RETURNS integer LANGUAGE plpgsql AS $$
DECLARE m fue.movimiento_combustible%ROWTYPE; n integer;
BEGIN
    IF nullif(btrim(p_motivo), '') IS NULL THEN RAISE EXCEPTION 'El motivo es obligatorio' USING ERRCODE = '23514'; END IF;
    SELECT * INTO m FROM fue.movimiento_combustible WHERE id = p_movimiento;
    IF m.id IS NULL OR m.anula_id IS NOT NULL THEN RAISE EXCEPTION 'Movimiento % inexistente o ya es un reverso', p_movimiento USING ERRCODE = '23514'; END IF;
    IF m.tipo = 'ajuste' THEN
        RAISE EXCEPTION 'Un ajuste no se revierte: lo maneja la conciliación (reemplazá el control si estaba mal)' USING ERRCODE = '23514';
    END IF;
    IF m.tipo IN ('entrada_carga','salida_carga_propia') THEN
        RAISE EXCEPTION 'El movimiento % viene de una carga: se revierte anulando la carga', m.id USING ERRCODE = '23514';
    END IF;
    PERFORM fue.fn_bloquear_operacion(m.operacion);
    SET CONSTRAINTS fue.tg_96_transferencia_pareada, fue.tg_97_limites DEFERRED;
    INSERT INTO fue.movimiento_combustible (deposito_id, fecha_hora, tipo, litros, operacion, carga_id, deposito_contraparte_id, camion_id, control_id, anula_id, motivo)
    SELECT x.deposito_id, x.fecha_hora, x.tipo, -x.litros, x.operacion, x.carga_id, x.deposito_contraparte_id, x.camion_id, x.control_id, x.id, p_motivo
      FROM fue.movimiento_combustible x
     WHERE x.operacion = m.operacion AND x.anula_id IS NULL AND x.tipo <> 'ajuste'
       AND NOT EXISTS (SELECT 1 FROM fue.movimiento_combustible r WHERE r.anula_id = x.id)
     ORDER BY x.deposito_id;
    GET DIAGNOSTICS n = ROW_COUNT;
    IF n = 0 THEN RAISE EXCEPTION 'El movimiento % ya estaba revertido', p_movimiento USING ERRCODE = '23514'; END IF;
    SET CONSTRAINTS fue.tg_96_transferencia_pareada, fue.tg_97_limites IMMEDIATE;
    SET CONSTRAINTS fue.tg_96_transferencia_pareada, fue.tg_97_limites DEFERRED;
    RETURN n;
END $$;
COMMENT ON FUNCTION fue.fn_revertir_movimiento(bigint,text) IS 'Reverso de un movimiento manual con todas las patas de su operación. Sin aprobación solo los que aumentan la diferencia (una salida con motivo ya aprobada); el resto, con fue.fn_solicitar_reverso.';

-- =============================================================================
-- 16. Correcciones que reducen una diferencia (C3a) y movimientos con motivo
-- =============================================================================
CREATE OR REPLACE FUNCTION fue.fn_bloquear_carga(p_carga bigint)
RETURNS fue.carga_combustible LANGUAGE plpgsql AS $$
DECLARE c fue.carga_combustible%ROWTYPE;
BEGIN
    SELECT * INTO c FROM fue.carga_combustible WHERE id = p_carga;
    IF c.id IS NULL THEN RAISE EXCEPTION 'La carga % no existe', p_carga USING ERRCODE = 'P0002'; END IF;
    PERFORM fue.fn_bloquear(ARRAY[c.camion_id], ARRAY[c.deposito_id, fue.fn_deposito_base(c.estacion_id)]);
    SELECT * INTO c FROM fue.carga_combustible WHERE id = p_carga;   -- releída con las claves tomadas
    RETURN c;
END $$;

-- Período de una carga (todas sus posiciones), para solicitudes y resoluciones
CREATE OR REPLACE FUNCTION fue.fn_exigir_carga_abierta(c fue.carga_combustible)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_base bigint := fue.fn_deposito_base(c.estacion_id);
BEGIN
    IF c.deposito_id IS NULL AND c.tanque_reefer_id IS NULL THEN
        PERFORM fue.fn_exigir_abierto(fue.fn_cerrado_camion(c.camion_id, c.fecha_hora), 'Carga ' || c.id);
    END IF;
    IF c.deposito_id IS NOT NULL THEN
        PERFORM fue.fn_exigir_abierto(fue.fn_cerrado_deposito(c.deposito_id, fue.fn_ts_canonico(c.id), false), 'Carga ' || c.id);
    END IF;
    IF v_base IS NOT NULL THEN
        PERFORM fue.fn_exigir_abierto(fue.fn_cerrado_deposito(v_base, c.fecha_hora, false), 'Carga ' || c.id);
    END IF;
END $$;

CREATE OR REPLACE FUNCTION fue.fn_solicitar_anulacion_carga(p_carga bigint, p_motivo text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE c fue.carga_combustible%ROWTYPE; v_id bigint;
BEGIN
    c := fue.fn_bloquear_carga(p_carga);
    IF c.estado_validacion = 'anulada' THEN RAISE EXCEPTION 'La carga % ya está anulada', c.id USING ERRCODE = '23514'; END IF;
    IF c.tanque_reefer_id IS NOT NULL THEN
        RAISE EXCEPTION 'Una carga al equipo de frío no forma parte de ningún cierre: se anula directo' USING ERRCODE = '23514';
    END IF;
    PERFORM fue.fn_exigir_carga_abierta(c);
    INSERT INTO fue.solicitud_correccion (tipo, carga_id, motivo) VALUES ('anular_carga', c.id, btrim(p_motivo))
    RETURNING id INTO v_id;
    RETURN v_id;
END $$;
COMMENT ON FUNCTION fue.fn_solicitar_anulacion_carga(bigint,text) IS 'C3a/K1: pide anular una carga. No cambia nada hasta que otro usuario la aprueba; mientras tanto bloquea el cierre o segmento que la contiene.';

CREATE OR REPLACE FUNCTION fue.fn_solicitar_reverso(p_movimiento bigint, p_motivo text)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE m fue.movimiento_combustible%ROWTYPE; v_id bigint;
BEGIN
    SELECT * INTO m FROM fue.movimiento_combustible WHERE id = p_movimiento;
    IF m.id IS NULL OR m.anula_id IS NOT NULL OR m.tipo = 'ajuste' THEN
        RAISE EXCEPTION 'El movimiento % no existe, es un reverso o es un ajuste', p_movimiento USING ERRCODE = '23514';
    ELSIF m.tipo IN ('entrada_carga','salida_carga_propia') THEN
        RAISE EXCEPTION 'El movimiento % viene de una carga: pedí la anulación de la carga %', m.id, m.carga_id USING ERRCODE = '23514';
    ELSIF m.estado_aprobacion = 'pendiente' THEN
        RAISE EXCEPTION 'El movimiento % está pendiente de aprobación: se aprueba o se rechaza (fn_resolver_movimiento)', m.id USING ERRCODE = '23514';
    END IF;
    PERFORM fue.fn_bloquear_operacion(m.operacion);
    IF EXISTS (SELECT 1 FROM fue.movimiento_combustible r WHERE r.anula_id = m.id) THEN
        RAISE EXCEPTION 'El movimiento % ya está revertido', m.id USING ERRCODE = '23514';
    END IF;
    PERFORM fue.fn_exigir_abierto(fue.fn_cerrado_deposito(x.deposito_id, x.fecha_hora, false), 'Movimiento ' || x.id)
       FROM fue.movimiento_combustible x WHERE x.operacion = m.operacion AND x.anula_id IS NULL;
    INSERT INTO fue.solicitud_correccion (tipo, movimiento_id, motivo) VALUES ('revertir_movimiento', m.id, btrim(p_motivo))
    RETURNING id INTO v_id;
    RETURN v_id;
END $$;
COMMENT ON FUNCTION fue.fn_solicitar_reverso(bigint,text) IS 'C3a: pide revertir un movimiento (transferencia, paso al tractor, entrada con motivo). Lo ejecuta la aprobación de otro usuario.';

CREATE OR REPLACE FUNCTION fue.fn_resolver_solicitud(p_id bigint, p_aprobar boolean, p_motivo text DEFAULT NULL)
RETURNS fue.solicitud_correccion LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions AS $$
DECLARE s fue.solicitud_correccion%ROWTYPE; c fue.carga_combustible%ROWTYPE; v_roles text[];
BEGIN
    SELECT * INTO s FROM fue.solicitud_correccion WHERE id = p_id;
    IF s.id IS NULL THEN RAISE EXCEPTION 'La solicitud % no existe', p_id USING ERRCODE = 'P0002'; END IF;
    -- D1: claves del hecho antes de comprobar
    IF s.carga_id IS NOT NULL THEN
        c := fue.fn_bloquear_carga(s.carga_id);
    ELSE
        PERFORM fue.fn_bloquear_operacion((SELECT operacion FROM fue.movimiento_combustible WHERE id = s.movimiento_id));
    END IF;
    SELECT * INTO s FROM fue.solicitud_correccion WHERE id = p_id FOR UPDATE;
    IF s.estado <> 'pendiente' THEN RAISE EXCEPTION 'La solicitud % ya está %', p_id, s.estado USING ERRCODE = '55000'; END IF;
    v_roles := fue.fn_validar_aprobador(s.creado_por);
    IF NOT p_aprobar AND nullif(btrim(p_motivo), '') IS NULL THEN
        RAISE EXCEPTION 'Escribí el motivo del rechazo' USING ERRCODE = '23514';
    END IF;
    IF p_aprobar THEN
        IF s.carga_id IS NOT NULL THEN
            PERFORM fue.fn_exigir_carga_abierta(c);
            UPDATE fue.carga_combustible SET estado_validacion = 'anulada', motivo_anulacion = s.motivo
             WHERE id = s.carga_id AND estado_validacion <> 'anulada';
            IF NOT FOUND THEN RAISE EXCEPTION 'La carga % ya estaba anulada', s.carga_id USING ERRCODE = '55000'; END IF;
        ELSE
            PERFORM fue.fn_revertir_movimiento(s.movimiento_id, s.motivo);
        END IF;
    END IF;
    UPDATE fue.solicitud_correccion
       SET estado = CASE WHEN p_aprobar THEN 'aprobada' ELSE 'rechazada' END,
           resuelto_por = aud.fn_usuario_actual(), resuelto_en = now(), resuelto_roles = v_roles,
           motivo_resolucion = nullif(btrim(p_motivo), '')
     WHERE id = p_id
    RETURNING * INTO s;
    RETURN s;
END $$;
COMMENT ON FUNCTION fue.fn_resolver_solicitud(bigint,boolean,text) IS 'C3a: otro usuario con rol aprobador aprueba (ejecuta la anulación o el reverso) o rechaza una solicitud. Solo con el período abierto.';

CREATE OR REPLACE FUNCTION fue.fn_retirar_solicitud(p_id bigint)
RETURNS fue.solicitud_correccion LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions AS $$
DECLARE s fue.solicitud_correccion%ROWTYPE;
BEGIN
    UPDATE fue.solicitud_correccion SET estado = 'retirada', resuelto_por = aud.fn_usuario_actual(), resuelto_en = now()
     WHERE id = p_id AND estado = 'pendiente' AND creado_por = aud.fn_usuario_actual()
    RETURNING * INTO s;
    IF s.id IS NULL THEN RAISE EXCEPTION 'Solo quien la pidió retira una solicitud pendiente' USING ERRCODE = '42501'; END IF;
    RETURN s;
END $$;

CREATE OR REPLACE FUNCTION fue.fn_resolver_movimiento(p_movimiento bigint, p_aprobar boolean, p_motivo text DEFAULT NULL)
RETURNS fue.movimiento_combustible LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions AS $$
DECLARE m fue.movimiento_combustible%ROWTYPE; v_roles text[];
BEGIN
    SELECT * INTO m FROM fue.movimiento_combustible WHERE id = p_movimiento;
    IF m.id IS NULL OR m.categoria IS NULL THEN
        RAISE EXCEPTION 'El movimiento % no existe o no es un movimiento con motivo', p_movimiento USING ERRCODE = 'P0002';
    END IF;
    PERFORM fue.fn_bloquear_operacion(m.operacion);
    SELECT * INTO m FROM fue.movimiento_combustible WHERE id = p_movimiento FOR UPDATE;
    IF m.estado_aprobacion <> 'pendiente' THEN
        RAISE EXCEPTION 'El movimiento % ya está %', m.id, m.estado_aprobacion USING ERRCODE = '55000';
    END IF;
    v_roles := fue.fn_validar_aprobador(m.creado_por);
    IF NOT p_aprobar AND nullif(btrim(p_motivo), '') IS NULL THEN
        RAISE EXCEPTION 'Escribí el motivo del rechazo' USING ERRCODE = '23514';
    END IF;
    PERFORM fue.fn_exigir_abierto(fue.fn_cerrado_deposito(m.deposito_id, m.fecha_hora, false), 'Movimiento ' || m.id);
    UPDATE fue.movimiento_combustible
       SET estado_aprobacion = CASE WHEN p_aprobar THEN 'aprobado' ELSE 'rechazado' END,
           resuelto_por = aud.fn_usuario_actual(), resuelto_en = now(), resuelto_roles = v_roles,
           motivo_resolucion = nullif(btrim(p_motivo), '')
     WHERE id = m.id
    RETURNING * INTO m;
    IF NOT p_aprobar THEN
        -- Un hecho que no ocurrió se revierte: el faltante vuelve a la diferencia
        PERFORM fue.fn_revertir_movimiento(m.id, 'Rechazado: ' || btrim(p_motivo));
    END IF;
    RETURN m;
END $$;
COMMENT ON FUNCTION fue.fn_resolver_movimiento(bigint,boolean,text) IS 'C3a: otro usuario con rol aprobador aprueba (no cambia ningún número) o rechaza (se revierte en la misma transacción) un movimiento con motivo. Solo con el período abierto.';

-- Una solicitud pendiente bloquea el cierre que contiene su hecho: se registra con las claves del hecho (D1)
-- y solo con el período abierto, venga de la función o de un INSERT directo.
CREATE OR REPLACE FUNCTION fue.fn_solicitud_reglas()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE c fue.carga_combustible%ROWTYPE; m fue.movimiento_combustible%ROWTYPE;
BEGIN
    IF TG_OP = 'UPDATE' THEN
        IF OLD.estado <> 'pendiente' THEN
            RAISE EXCEPTION 'La solicitud % ya está resuelta', OLD.id USING ERRCODE = '55000';
        END IF;
        RETURN NEW;
    END IF;
    NEW.estado := 'pendiente';
    NEW.resuelto_por := NULL; NEW.resuelto_en := NULL; NEW.resuelto_roles := NULL; NEW.motivo_resolucion := NULL;
    IF NEW.carga_id IS NOT NULL THEN
        c := fue.fn_bloquear_carga(NEW.carga_id);
        IF c.estado_validacion = 'anulada' OR c.tanque_reefer_id IS NOT NULL THEN
            RAISE EXCEPTION 'La carga % ya está anulada o es al equipo de frío (se anula directo)', c.id USING ERRCODE = '23514';
        END IF;
        PERFORM fue.fn_exigir_carga_abierta(c);
    ELSE
        SELECT * INTO m FROM fue.movimiento_combustible WHERE id = NEW.movimiento_id;
        IF m.id IS NULL OR m.anula_id IS NOT NULL OR m.tipo IN ('ajuste','entrada_carga','salida_carga_propia')
           OR m.estado_aprobacion = 'pendiente' THEN
            RAISE EXCEPTION 'El movimiento % no se corrige con una solicitud de reverso', NEW.movimiento_id USING ERRCODE = '23514';
        END IF;
        PERFORM fue.fn_bloquear_operacion(m.operacion);
        IF EXISTS (SELECT 1 FROM fue.movimiento_combustible r WHERE r.anula_id = m.id) THEN
            RAISE EXCEPTION 'El movimiento % ya está revertido', m.id USING ERRCODE = '23514';
        END IF;
        PERFORM fue.fn_exigir_abierto(fue.fn_cerrado_deposito(x.deposito_id, x.fecha_hora, false), 'Movimiento ' || x.id)
           FROM fue.movimiento_combustible x WHERE x.operacion = m.operacion AND x.anula_id IS NULL;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER tg_12_reglas BEFORE INSERT OR UPDATE ON fue.solicitud_correccion
    FOR EACH ROW EXECUTE FUNCTION fue.fn_solicitud_reglas();

-- =============================================================================
-- 17. Base Mendoza: responsable, traspaso y aprobación de segmentos (C3b)
-- =============================================================================
CREATE OR REPLACE FUNCTION fue.fn_responsable_reglas()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_lo timestamptz; v_hi timestamptz; v timestamptz;
BEGIN
    PERFORM fue.fn_bloquear('{}', ARRAY[NEW.deposito_id]);   -- D1: la asignación es del depósito
    IF NOT EXISTS (SELECT 1 FROM fue.deposito_combustible WHERE id = NEW.deposito_id AND tipo = 'tanque_base' AND eliminado_en IS NULL) THEN
        RAISE EXCEPTION 'El responsable se asigna a un tanque de base' USING ERRCODE = '23514';
    END IF;
    IF TG_OP = 'INSERT' THEN
        -- Traspaso: un cambio de responsable exige un control en ese instante (parámetro, provisional)
        IF ref.fn_parametro_texto('fue.base_traspaso_obligatorio', 'true') = 'true'
           AND EXISTS (SELECT 1 FROM fue.responsable_deposito r WHERE r.deposito_id = NEW.deposito_id
                          AND r.eliminado_en IS NULL AND r.desde_ts < NEW.desde_ts)
           AND NOT EXISTS (SELECT 1 FROM fue.control_saldo_deposito k WHERE k.deposito_id = NEW.deposito_id
                              AND k.estado = 'vigente' AND k.eliminado_en IS NULL AND k.fecha_hora = NEW.desde_ts) THEN
            RAISE EXCEPTION 'El traspaso de responsable exige un control del tanque en ese instante (usá fue.fn_traspasar_responsable)'
                USING ERRCODE = '23514';
        END IF;
        v_lo := NEW.desde_ts; v_hi := NEW.hasta_ts;
    ELSIF NEW.eliminado_en IS NOT NULL AND OLD.eliminado_en IS NULL THEN
        v_lo := OLD.desde_ts; v_hi := OLD.hasta_ts;
    ELSIF NEW.hasta_ts IS DISTINCT FROM OLD.hasta_ts THEN
        v_lo := least(coalesce(NEW.hasta_ts, 'infinity'), coalesce(OLD.hasta_ts, 'infinity'));
        v_hi := nullif(greatest(coalesce(NEW.hasta_ts, 'infinity'), coalesce(OLD.hasta_ts, 'infinity')), 'infinity');
    END IF;
    -- La asignación que cubre la hora de un control aprobado no se modifica (C3b)
    IF v_lo IS NOT NULL THEN
        SELECT a.hasta_ts INTO v FROM fue.aprobacion_control_base a
         WHERE a.deposito_id = NEW.deposito_id AND a.estado = 'aprobado'
           AND a.hasta_ts > v_lo AND a.hasta_ts <= coalesce(v_hi, 'infinity')
         LIMIT 1;
        IF v IS NOT NULL THEN
            RAISE EXCEPTION 'El cambio afecta al responsable del control aprobado del %: anulá esa aprobación antes', fue.fn_fmt_ts(v)
                USING ERRCODE = '55000';
        END IF;
    END IF;
    RETURN NEW;
END $$;
CREATE TRIGGER tg_12_reglas BEFORE INSERT OR UPDATE ON fue.responsable_deposito
    FOR EACH ROW EXECUTE FUNCTION fue.fn_responsable_reglas();

CREATE OR REPLACE FUNCTION fue.fn_traspasar_responsable(
    p_deposito bigint, p_usuario_entrante bigint, p_fecha_hora timestamptz, p_litros numeric,
    p_metodo text, p_observaciones text DEFAULT NULL)
RETURNS bigint LANGUAGE plpgsql AS $$
DECLARE v_control bigint;
BEGIN
    PERFORM fue.fn_bloquear('{}', ARRAY[p_deposito]);
    INSERT INTO fue.control_saldo_deposito (deposito_id, fecha_hora, litros, fuente, metodo, rol, origen, observaciones)
    VALUES (p_deposito, p_fecha_hora, p_litros, 'medicion', p_metodo,
            CASE WHEN EXISTS (SELECT 1 FROM fue.control_saldo_deposito k WHERE k.deposito_id = p_deposito
                                 AND k.estado = 'vigente' AND k.fecha_hora < p_fecha_hora) THEN 'base' ELSE 'inicial' END,
            'base', coalesce(p_observaciones, 'Control de traspaso de responsable'))
    RETURNING id INTO v_control;
    UPDATE fue.responsable_deposito SET hasta_ts = p_fecha_hora
     WHERE deposito_id = p_deposito AND eliminado_en IS NULL AND desde_ts < p_fecha_hora
       AND (hasta_ts IS NULL OR hasta_ts > p_fecha_hora);
    INSERT INTO fue.responsable_deposito (deposito_id, usuario_id, desde_ts) VALUES (p_deposito, p_usuario_entrante, p_fecha_hora);
    RETURN v_control;
END $$;
COMMENT ON FUNCTION fue.fn_traspasar_responsable(bigint,bigint,timestamptz,numeric,text,text) IS 'C3b: control medido del tanque + cierre del responsable saliente + alta del entrante, en el mismo instante. El control cierra el segmento del saliente.';

-- Segmento de base que termina en un control: d(c) = F(c⁻) + Real(c⁻, c] − F(c). Solo lectura.
CREATE OR REPLACE FUNCTION fue.fn_resultado_control_base(
    p_control bigint, p_justificacion text DEFAULT NULL, p_no_imputable_l numeric DEFAULT 0, p_no_imputable_motivo text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, public, extensions AS $$
DECLARE
    c fue.control_saldo_deposito%ROWTYPE; a fue.control_saldo_deposito%ROWTYPE;
    v_tol numeric := ref.fn_parametro_num('fue.base_tolerancia_l', 20);
    v_real numeric; v_por_tipo jsonb; v_huella text; v_resp record; v_dif numeric; v_libro_a numeric;
    v_pend jsonb := '[]'::jsonb; v_imp numeric;
BEGIN
    SELECT * INTO c FROM fue.control_saldo_deposito WHERE id = p_control;
    IF c.id IS NULL OR NOT EXISTS (SELECT 1 FROM fue.deposito_combustible WHERE id = c.deposito_id AND tipo = 'tanque_base') THEN
        RAISE EXCEPTION 'El control % no existe o no es de un tanque de base', p_control USING ERRCODE = 'P0002';
    END IF;
    IF c.estado <> 'vigente' THEN
        v_pend := v_pend || jsonb_build_object('codigo', 'control_reemplazado', 'mensaje', 'El control fue reemplazado');
    END IF;
    SELECT * INTO a FROM fue.control_saldo_deposito
     WHERE deposito_id = c.deposito_id AND estado = 'vigente' AND eliminado_en IS NULL AND fecha_hora < c.fecha_hora
     ORDER BY fecha_hora DESC LIMIT 1;
    IF a.id IS NULL THEN
        RAISE EXCEPTION 'El control % es el primero del tanque: no cierra ningún segmento', p_control USING ERRCODE = '23514';
    END IF;

    SELECT coalesce(sum(m.litros), 0),
           string_agg('M' || m.id || ':' || m.litros || ':' || coalesce(m.estado_aprobacion, ''), ',' ORDER BY m.id)
      INTO v_real, v_huella
      FROM fue.movimiento_combustible m
     WHERE m.deposito_id = c.deposito_id AND m.fecha_hora > a.fecha_hora AND m.fecha_hora <= c.fecha_hora
       AND m.tipo <> 'ajuste' AND m.eliminado_en IS NULL;
    SELECT coalesce(jsonb_object_agg(x.tipo, x.litros), '{}'::jsonb) INTO v_por_tipo
      FROM (SELECT tipo, sum(litros) AS litros FROM fue.movimiento_combustible
             WHERE deposito_id = c.deposito_id AND fecha_hora > a.fecha_hora AND fecha_hora <= c.fecha_hora
               AND tipo <> 'ajuste' AND eliminado_en IS NULL GROUP BY tipo) x;
    v_dif := a.litros + v_real - c.litros;
    v_huella := md5(concat_ws('|', 'A' || a.id || ':' || a.litros, 'C' || c.id || ':' || c.litros, v_huella));

    SELECT r.usuario_id, u.nombre INTO v_resp FROM fue.responsable_deposito r JOIN seg.usuario u ON u.id = r.usuario_id
     WHERE r.deposito_id = c.deposito_id AND r.eliminado_en IS NULL
       AND r.desde_ts < c.fecha_hora AND (r.hasta_ts IS NULL OR r.hasta_ts >= c.fecha_hora);
    IF v_resp.usuario_id IS NULL THEN
        v_pend := v_pend || jsonb_build_object('codigo', 'sin_responsable', 'mensaje', 'No hay responsable de la base asignado en la hora del control');
    END IF;
    IF EXISTS (SELECT 1 FROM fue.movimiento_combustible m WHERE m.deposito_id = c.deposito_id AND m.estado_aprobacion = 'pendiente'
                  AND m.fecha_hora > a.fecha_hora AND m.fecha_hora <= c.fecha_hora) THEN
        v_pend := v_pend || jsonb_build_object('codigo', 'movimiento_con_motivo_pendiente', 'mensaje', 'Hay movimientos con motivo pendientes de aprobación en el segmento');
    END IF;
    IF EXISTS (SELECT 1 FROM fue.movimiento_combustible m
                 JOIN fue.solicitud_correccion s ON s.estado = 'pendiente'
                      AND (s.carga_id = m.carga_id
                           OR s.movimiento_id IN (SELECT y.id FROM fue.movimiento_combustible y WHERE y.operacion = m.operacion))
                WHERE m.deposito_id = c.deposito_id AND m.fecha_hora > a.fecha_hora AND m.fecha_hora <= c.fecha_hora) THEN
        v_pend := v_pend || jsonb_build_object('codigo', 'correccion_pendiente', 'mensaje', 'Hay solicitudes de corrección pendientes sobre hechos del segmento');
    END IF;
    v_libro_a := fue.fn_saldo_deposito(c.deposito_id, a.fecha_hora);
    IF v_libro_a <> a.litros THEN
        v_pend := v_pend || jsonb_build_object('codigo', 'conciliacion', 'mensaje',
                    format('Alarma: el libro en el control anterior (%s L) no es igual a su físico (%s L)', v_libro_a, a.litros));
    END IF;
    IF abs(v_dif) > v_tol AND nullif(btrim(p_justificacion), '') IS NULL THEN
        v_pend := v_pend || jsonb_build_object('codigo', 'justificacion', 'mensaje',
                    format('La diferencia (%s L) supera la tolerancia de %s L: escribí la justificación', round(v_dif, 2), v_tol));
    END IF;
    IF coalesce(p_no_imputable_l, 0) > greatest(v_dif, 0) THEN
        v_pend := v_pend || jsonb_build_object('codigo', 'no_imputable', 'mensaje', 'El no imputable no puede superar el faltante');
    END IF;
    v_imp := greatest(v_dif, 0) - least(coalesce(p_no_imputable_l, 0), greatest(v_dif, 0));

    RETURN jsonb_build_object(
        'deposito_id', c.deposito_id, 'control_id', c.id, 'control_anterior_id', a.id,
        'desde_ts', a.fecha_hora, 'hasta_ts', c.fecha_hora,
        'fisico_anterior_l', a.litros, 'real_l', v_real, 'real_por_tipo', v_por_tipo,
        'teorico_l', a.litros + v_real, 'fisico_l', c.litros, 'fuente', c.fuente,
        'diferencia_l', v_dif, 'tolerancia_l', v_tol, 'imputable_l', v_imp,
        'responsable_usuario_id', v_resp.usuario_id, 'responsable_nombre', v_resp.nombre,
        'huella', v_huella, 'pendientes', v_pend, 'calculado_en', now());
END $$;
COMMENT ON FUNCTION fue.fn_resultado_control_base(bigint,text,numeric,text) IS 'C3b: diferencia del segmento de base que termina en el control, con responsable, política y pendientes. Misma función para la vista previa y la aprobación.';

CREATE OR REPLACE FUNCTION fue.fn_aprobar_control_base(
    p_control bigint, p_justificacion text DEFAULT NULL, p_no_imputable_l numeric DEFAULT 0, p_no_imputable_motivo text DEFAULT NULL)
RETURNS fue.aprobacion_control_base LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions AS $$
DECLARE r jsonb; v_dep bigint; x fue.aprobacion_control_base%ROWTYPE;
BEGIN
    SELECT deposito_id INTO v_dep FROM fue.control_saldo_deposito WHERE id = p_control;
    IF v_dep IS NULL THEN RAISE EXCEPTION 'El control % no existe', p_control USING ERRCODE = 'P0002'; END IF;
    PERFORM fue.fn_bloquear('{}', ARRAY[v_dep]);     -- D1: antes de la primera lectura
    IF EXISTS (SELECT 1 FROM fue.aprobacion_control_base WHERE control_id = p_control AND estado = 'aprobado') THEN
        RAISE EXCEPTION 'El control % ya tiene la diferencia aprobada', p_control USING ERRCODE = '23505';
    END IF;
    r := fue.fn_resultado_control_base(p_control, p_justificacion, p_no_imputable_l, p_no_imputable_motivo);
    IF jsonb_array_length(r -> 'pendientes') > 0 THEN
        RAISE EXCEPTION 'No se puede aprobar: %', (SELECT string_agg(e ->> 'mensaje', '; ') FROM jsonb_array_elements(r -> 'pendientes') e)
            USING ERRCODE = '23514', DETAIL = (r -> 'pendientes')::text;
    END IF;
    INSERT INTO fue.aprobacion_control_base (
        deposito_id, control_id, control_anterior_id, desde_ts, hasta_ts, responsable_usuario_id,
        fisico_anterior_l, real_l, teorico_l, fisico_l, diferencia_l, tolerancia_l, justificacion,
        no_imputable_l, no_imputable_motivo, imputable_l, huella, detalle, aprobado_por, aprobado_en)
    VALUES (v_dep, p_control, (r ->> 'control_anterior_id')::bigint, (r ->> 'desde_ts')::timestamptz, (r ->> 'hasta_ts')::timestamptz,
            (r ->> 'responsable_usuario_id')::bigint, (r ->> 'fisico_anterior_l')::numeric, (r ->> 'real_l')::numeric,
            (r ->> 'teorico_l')::numeric, (r ->> 'fisico_l')::numeric, (r ->> 'diferencia_l')::numeric, (r ->> 'tolerancia_l')::numeric,
            nullif(btrim(p_justificacion), ''), coalesce(p_no_imputable_l, 0), nullif(btrim(p_no_imputable_motivo), ''),
            (r ->> 'imputable_l')::numeric, r ->> 'huella', r - 'pendientes', aud.fn_usuario_actual(), now())
    RETURNING * INTO x;
    RETURN x;
END $$;
COMMENT ON FUNCTION fue.fn_aprobar_control_base(bigint,text,numeric,text) IS 'C3b: aprueba y congela la diferencia del segmento de base. Mientras esté aprobada, bloquea los dos controles, los movimientos del segmento y el responsable de esa hora.';

CREATE OR REPLACE FUNCTION fue.fn_anular_aprobacion_base(p_id bigint, p_motivo text)
RETURNS fue.aprobacion_control_base LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions AS $$
DECLARE x fue.aprobacion_control_base%ROWTYPE;
BEGIN
    IF nullif(btrim(p_motivo), '') IS NULL THEN RAISE EXCEPTION 'Escribí el motivo de la anulación' USING ERRCODE = '23514'; END IF;
    SELECT * INTO x FROM fue.aprobacion_control_base WHERE id = p_id;
    IF x.id IS NULL THEN RAISE EXCEPTION 'La aprobación % no existe', p_id USING ERRCODE = 'P0002'; END IF;
    PERFORM fue.fn_bloquear('{}', ARRAY[x.deposito_id]);
    UPDATE fue.aprobacion_control_base
       SET estado = 'anulado', motivo_anulacion = btrim(p_motivo), anulado_por = aud.fn_usuario_actual(), anulado_en = now()
     WHERE id = p_id AND estado = 'aprobado'
    RETURNING * INTO x;
    IF x.id IS NULL THEN RAISE EXCEPTION 'La aprobación % ya está anulada', p_id USING ERRCODE = '55000'; END IF;
    RETURN x;
END $$;
COMMENT ON FUNCTION fue.fn_anular_aprobacion_base(bigint,text) IS 'Anula la aprobación de un segmento de base (reabre su período). No toca el libro.';

-- Verificación de un segmento de base aprobado: recalcula desde los hechos y compara (D8)
CREATE OR REPLACE FUNCTION fue.fn_verificar_control_base(p_id bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, public, extensions AS $$
DECLARE x fue.aprobacion_control_base%ROWTYPE; r jsonb; v_def text[] := '{}';
BEGIN
    SELECT * INTO x FROM fue.aprobacion_control_base WHERE id = p_id;
    IF x.id IS NULL OR x.estado <> 'aprobado' THEN RAISE EXCEPTION 'La aprobación % no existe o no está aprobada', p_id USING ERRCODE = 'P0002'; END IF;
    r := fue.fn_resultado_control_base(x.control_id, x.justificacion, x.no_imputable_l, x.no_imputable_motivo);
    IF (r ->> 'control_anterior_id')::bigint <> x.control_anterior_id THEN v_def := v_def || 'control anterior'::text; END IF;
    IF (r ->> 'diferencia_l')::numeric <> x.diferencia_l THEN v_def := v_def || 'diferencia'::text; END IF;
    IF r ->> 'huella' <> x.huella THEN v_def := v_def || 'huella de los hechos'::text; END IF;
    IF (r ->> 'responsable_usuario_id')::bigint IS DISTINCT FROM x.responsable_usuario_id THEN v_def := v_def || 'responsable'::text; END IF;
    RETURN jsonb_build_object('ok', cardinality(v_def) = 0, 'defectos', to_jsonb(v_def), 'recalculado', r);
END $$;

-- =============================================================================
-- 18. Cálculo del viaje (sin monolitos). Todas son de solo lectura.
-- =============================================================================
-- 18.1 Hechos del viaje (categoría A): ventana, tractor, mochila, pendientes de hechos y huella.
--      Ventana: tractor (salida, llegada]; mochila (salida − 1 µs, llegada − 1 µs].
CREATE OR REPLACE FUNCTION fue.fn_hechos_viaje(p_camion bigint, p_carga_salida bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, public, extensions AS $$
DECLARE
    s fue.carga_combustible%ROWTYPE;
    l fue.carga_combustible%ROWTYPE;
    d fue.deposito_combustible%ROWTYPE;
    ka fue.control_saldo_deposito%ROWTYPE;
    kl fue.control_saldo_deposito%ROWTYPE;
    v_menos constant interval := interval '1 microsecond';
    v_ventana interval := make_interval(mins => ref.fn_parametro_num('fue.cierre_ventana_ambiguedad_min', 120)::integer);
    v_a timestamptz; v_l timestamptz;
    v_pend jsonb := '[]'::jsonb; v_avisos text[] := '{}';
    v_llen numeric; v_llen_lista jsonb; v_otros integer;
    v_cubre boolean; v_parcial boolean;
    m record;
    v_mochila jsonb; v_huella text; v_h_mov text; v_h_trac text; v_h_aparte text; v_h_inter text;
BEGIN
    SELECT * INTO s FROM fue.carga_combustible WHERE id = p_carga_salida;
    IF s.id IS NULL OR s.camion_id <> p_camion THEN
        RAISE EXCEPTION 'La carga % no existe o no es del camión %', p_carga_salida, p_camion USING ERRCODE = 'P0002';
    END IF;
    IF NOT s.es_frontera OR s.estado_validacion = 'anulada' OR s.eliminado_en IS NOT NULL THEN
        v_pend := v_pend || jsonb_build_object('codigo', 'salida_no_frontera',
                    'mensaje', 'La carga de salida no es una parada frontera vigente (¿se anuló?)');
    END IF;
    SELECT * INTO l FROM fue.carga_combustible
     WHERE camion_id = p_camion AND es_frontera AND estado_validacion <> 'anulada' AND eliminado_en IS NULL
       AND fecha_hora > s.fecha_hora
     ORDER BY fecha_hora LIMIT 1;
    IF l.id IS NULL THEN
        RETURN jsonb_build_object('carga_salida_id', s.id, 'salida_ts', s.fecha_hora, 'carga_llegada_id', NULL,
            'pendientes', v_pend || jsonb_build_object('codigo', 'sin_llegada', 'mensaje', 'El viaje todavía no tiene parada frontera de llegada'));
    END IF;
    v_a := s.fecha_hora - v_menos;
    v_l := l.fecha_hora - v_menos;

    -- Tractor: llenados en (salida, llegada], mismo combustible que la salida
    SELECT coalesce(sum(cc.litros), 0),
           coalesce(jsonb_agg(jsonb_build_object('id', cc.id, 'fecha_hora', cc.fecha_hora, 'litros', cc.litros,
               'tanque_lleno', cc.tanque_lleno, 'es_frontera', cc.es_frontera, 'estacion_id', cc.estacion_id,
               'odometro_km', cc.odometro_km, 'estado', cc.estado_validacion) ORDER BY cc.fecha_hora), '[]'::jsonb),
           string_agg('C' || cc.id || ':' || cc.litros, ',' ORDER BY cc.id)
      INTO v_llen, v_llen_lista, v_h_trac
      FROM fue.carga_combustible cc
     WHERE cc.camion_id = p_camion AND cc.fecha_hora > s.fecha_hora AND cc.fecha_hora <= l.fecha_hora
       AND cc.deposito_id IS NULL AND cc.tanque_reefer_id IS NULL AND cc.tipo_combustible_id = s.tipo_combustible_id
       AND cc.estado_validacion <> 'anulada' AND cc.eliminado_en IS NULL;
    SELECT count(*) INTO v_otros FROM fue.carga_combustible cc
     WHERE cc.camion_id = p_camion AND cc.fecha_hora > s.fecha_hora AND cc.fecha_hora <= l.fecha_hora
       AND cc.deposito_id IS NULL AND cc.tanque_reefer_id IS NULL AND cc.tipo_combustible_id <> s.tipo_combustible_id
       AND cc.estado_validacion <> 'anulada' AND cc.eliminado_en IS NULL;
    IF v_otros > 0 THEN
        v_avisos := v_avisos || format('%s carga(s) de otro combustible en el viaje no se cuentan en el consumo', v_otros);
    END IF;
    IF EXISTS (SELECT 1 FROM fue.solicitud_correccion sc JOIN fue.carga_combustible cc ON cc.id = sc.carga_id
                WHERE sc.estado = 'pendiente' AND cc.camion_id = p_camion AND cc.deposito_id IS NULL AND cc.tanque_reefer_id IS NULL
                  AND cc.fecha_hora BETWEEN s.fecha_hora AND l.fecha_hora) THEN
        v_pend := v_pend || jsonb_build_object('codigo', 'correccion_pendiente_tractor',
                    'mensaje', 'Hay una anulación de carga del tractor pendiente de aprobación en el viaje');
    END IF;

    -- Mochila: uso (K3) y depósito vigente para todo el viaje
    SELECT bool_or(u.desde_ts <= s.fecha_hora AND (u.hasta_ts IS NULL OR u.hasta_ts >= l.fecha_hora)),
           bool_or(u.desde_ts < l.fecha_hora AND (u.hasta_ts IS NULL OR u.hasta_ts > s.fecha_hora))
      INTO v_cubre, v_parcial
      FROM fue.uso_mochila u WHERE u.camion_id = p_camion AND u.eliminado_en IS NULL;
    v_cubre := coalesce(v_cubre, false);
    v_parcial := coalesce(v_parcial, false) AND NOT v_cubre;
    IF v_parcial THEN
        v_pend := v_pend || jsonb_build_object('codigo', 'uso_mochila_parcial',
                    'mensaje', 'El uso de mochila del camión no está definido para todo el viaje');
    END IF;

    IF NOT v_cubre AND EXISTS (SELECT 1 FROM fue.deposito_combustible x
                                WHERE x.tipo = 'mochila' AND x.camion_id = p_camion AND x.eliminado_en IS NULL
                                  AND x.vigente_desde < v_l AND coalesce(x.vigente_hasta, 'infinity') > v_a) THEN
        v_pend := v_pend || jsonb_build_object('codigo', 'mochila_sin_uso',
                    'mensaje', 'Hay una mochila vigente en el viaje pero el camión no tiene uso de mochila para todo el viaje');
    END IF;

    IF v_cubre THEN
        SELECT * INTO d FROM fue.deposito_combustible
         WHERE tipo = 'mochila' AND camion_id = p_camion AND eliminado_en IS NULL
           AND vigente_desde <= v_a AND coalesce(vigente_hasta, 'infinity') >= v_l;
        IF d.id IS NULL THEN
            v_pend := v_pend || jsonb_build_object('codigo', 'mochila_no_definida',
                        'mensaje', 'El camión usa mochila pero no hay una mochila vigente para todo el viaje');
        ELSE
            SELECT * INTO ka FROM fue.control_saldo_deposito
             WHERE deposito_id = d.id AND fecha_hora = v_a AND rol IN ('inicial','llegada') AND estado = 'vigente' AND eliminado_en IS NULL;
            SELECT * INTO kl FROM fue.control_saldo_deposito
             WHERE deposito_id = d.id AND fecha_hora = v_l AND rol = 'llegada' AND estado = 'vigente' AND eliminado_en IS NULL;
            IF ka.id IS NULL THEN
                v_pend := v_pend || jsonb_build_object('codigo', 'sin_control_ancla',
                            'mensaje', 'Falta el control de la mochila en la parada de salida (ancla)');
            ELSIF fue.fn_saldo_deposito(d.id, v_a) <> ka.litros THEN
                v_pend := v_pend || jsonb_build_object('codigo', 'conciliacion',
                            'mensaje', 'Alarma: el libro de la mochila en el ancla no es igual a su físico');
            END IF;
            IF kl.id IS NULL THEN
                v_pend := v_pend || jsonb_build_object('codigo', 'sin_control_llegada',
                            'mensaje', 'Falta el control de llegada de la mochila (aunque sea 0)');
            END IF;

            SELECT coalesce(sum(x.litros), 0) AS real_l,
                   coalesce(sum(x.litros) FILTER (WHERE x.tipo = 'entrada_carga'), 0) AS entradas,
                   coalesce(sum(x.litros) FILTER (WHERE x.tipo = 'transferencia_entrada'), 0) AS t_entrada,
                   coalesce(sum(x.litros) FILTER (WHERE x.tipo = 'transferencia_salida'), 0) AS t_salida,
                   coalesce(sum(x.litros) FILTER (WHERE x.tipo = 'salida_tractor'), 0) AS a_tractor,
                   coalesce(sum(x.litros) FILTER (WHERE x.tipo IN ('entrada_otra','salida_otra')), 0) AS con_motivo,
                   count(*) FILTER (WHERE x.estado_aprobacion = 'pendiente') AS pendientes,
                   string_agg('M' || x.id || ':' || x.litros || ':' || coalesce(x.estado_aprobacion, ''), ',' ORDER BY x.id) AS huella
              INTO m
              FROM fue.movimiento_combustible x
             WHERE x.deposito_id = d.id AND x.fecha_hora > v_a AND x.fecha_hora <= v_l
               AND x.tipo <> 'ajuste' AND x.eliminado_en IS NULL;
            v_h_mov := m.huella;
            IF m.pendientes > 0 THEN
                v_pend := v_pend || jsonb_build_object('codigo', 'movimiento_con_motivo_pendiente',
                            'mensaje', format('%s movimiento(s) con motivo de la mochila pendientes de aprobación', m.pendientes));
            END IF;
            IF EXISTS (SELECT 1 FROM fue.movimiento_combustible x
                         JOIN fue.solicitud_correccion sc ON sc.estado = 'pendiente'
                              AND (sc.carga_id = x.carga_id
                                   OR sc.movimiento_id IN (SELECT y.id FROM fue.movimiento_combustible y WHERE y.operacion = x.operacion))
                        WHERE x.deposito_id = d.id AND x.fecha_hora > v_a AND x.fecha_hora <= v_l AND x.tipo <> 'ajuste') THEN
                v_pend := v_pend || jsonb_build_object('codigo', 'correccion_pendiente_mochila',
                            'mensaje', 'Hay una corrección de la mochila pendiente de aprobación en el viaje');
            END IF;
            -- Ambigüedad (sección 15): carga de mochila suelta cerca de una parada frontera, misma estación
            IF EXISTS (SELECT 1 FROM fue.carga_combustible x
                        WHERE x.deposito_id = d.id AND x.carga_principal_id IS NULL AND NOT x.aparte_confirmada
                          AND x.estado_validacion <> 'anulada' AND x.eliminado_en IS NULL
                          AND ((x.estacion_id = s.estacion_id AND abs(extract(epoch FROM x.fecha_hora - s.fecha_hora)) <= extract(epoch FROM v_ventana))
                            OR (x.estacion_id = l.estacion_id AND abs(extract(epoch FROM x.fecha_hora - l.fecha_hora)) <= extract(epoch FROM v_ventana)))) THEN
                v_pend := v_pend || jsonb_build_object('codigo', 'carga_mochila_ambigua',
                            'mensaje', 'Hay una carga de mochila suelta cerca de una parada frontera en la misma estación: ligala a la parada (anular y registrar) o confirmá que es aparte');
            END IF;
            SELECT string_agg('A' || x.id || ':' || x.aparte_confirmada, ',' ORDER BY x.id) INTO v_h_aparte
              FROM fue.carga_combustible x
             WHERE x.deposito_id = d.id AND x.carga_principal_id IS NULL AND x.estado_validacion <> 'anulada'
               AND x.fecha_hora BETWEEN s.fecha_hora - v_ventana AND l.fecha_hora + v_ventana;
            SELECT string_agg('I' || k.id || ':' || k.litros, ',' ORDER BY k.id) INTO v_h_inter
              FROM fue.control_saldo_deposito k
             WHERE k.deposito_id = d.id AND k.estado = 'vigente' AND k.fecha_hora > v_a AND k.fecha_hora < v_l;

            v_mochila := jsonb_build_object(
                'deposito_id', d.id, 'codigo', d.codigo,
                'control_ancla', CASE WHEN ka.id IS NOT NULL THEN jsonb_build_object('id', ka.id, 'litros', ka.litros, 'fuente', ka.fuente,
                                     'rol', ka.rol, 'declarante_tipo', ka.declarante_tipo, 'chofer_id', ka.chofer_id) END,
                'control_llegada', CASE WHEN kl.id IS NOT NULL THEN jsonb_build_object('id', kl.id, 'litros', kl.litros, 'fuente', kl.fuente,
                                     'metodo', kl.metodo, 'declarante_tipo', kl.declarante_tipo, 'chofer_id', kl.chofer_id) END,
                'ancla_l', ka.litros, 'entradas_l', m.entradas, 'transferencias_entrada_l', m.t_entrada,
                'transferencias_salida_l', m.t_salida, 'a_tractor_l', m.a_tractor, 'con_motivo_l', m.con_motivo,
                'real_l', m.real_l, 'teorico_l', ka.litros + m.real_l, 'fisico_l', kl.litros,
                'diferencia_l', ka.litros + m.real_l - kl.litros);
        END IF;
    END IF;

    v_huella := md5(concat_ws('|', 'S' || s.id, 'L' || l.id, 'T' || coalesce(v_h_trac, ''), 'U' || v_cubre,
                              'D' || coalesce(d.id::text, ''), 'KA' || coalesce(ka.id || ':' || ka.litros, ''),
                              'KL' || coalesce(kl.id || ':' || kl.litros, ''), coalesce(v_h_mov, ''),
                              coalesce(v_h_aparte, ''), coalesce(v_h_inter, '')));

    RETURN jsonb_build_object(
        'carga_salida_id', s.id, 'salida_ts', s.fecha_hora, 'carga_llegada_id', l.id, 'llegada_ts', l.fecha_hora,
        'salida', jsonb_build_object('id', s.id, 'fecha_hora', s.fecha_hora, 'litros', s.litros, 'odometro_km', s.odometro_km,
                                     'estacion_id', s.estacion_id, 'chofer_id', s.chofer_id),
        'llegada', jsonb_build_object('id', l.id, 'fecha_hora', l.fecha_hora, 'litros', l.litros, 'odometro_km', l.odometro_km,
                                      'estacion_id', l.estacion_id, 'chofer_id', l.chofer_id),
        'tractor', jsonb_build_object('litros_carga_salida', s.litros, 'llenados', v_llen_lista, 'litros_llenados_l', v_llen,
                                      'litros_desde_mochila_l', -coalesce((v_mochila ->> 'a_tractor_l')::numeric, 0)),
        'usa_mochila', v_cubre,
        'mochila', v_mochila,
        'pendientes', v_pend, 'avisos', to_jsonb(v_avisos), 'huella', v_huella);
END $$;
COMMENT ON FUNCTION fue.fn_hechos_viaje(bigint,bigint) IS 'Hechos protegidos del viaje (categoría A): ventana única, llenados, mochila con ancla y llegada, movimientos reales por tipo (sin ajustes), pendientes de hechos y huella. Única función de ventana.';

-- 18.2 Telemetría (categoría B): una sola instrucción, para que la foto sea atómica (K5)
CREATE OR REPLACE FUNCTION fue.fn_telemetria_viaje(p_camion bigint, p_salida timestamptz, p_llegada timestamptz)
RETURNS jsonb LANGUAGE sql STABLE AS $$
    SELECT jsonb_build_object(
        'lectura_salida', (SELECT jsonb_build_object('ts', t.ts, 'odometro_km', t.odometro_km, 'consumo_acumulado_l', t.consumo_acumulado_l,
                                                    'nivel_combustible_l', t.nivel_combustible_l)
                             FROM tel.lectura t
                            WHERE t.camion_id = p_camion AND t.ts BETWEEN p_salida - interval '3 hours' AND p_salida + interval '3 hours'
                              AND t.calidad > 0 AND (t.odometro_km IS NOT NULL OR t.consumo_acumulado_l IS NOT NULL)
                            ORDER BY abs(extract(epoch FROM t.ts - p_salida)) LIMIT 1),
        'lectura_llegada', (SELECT jsonb_build_object('ts', t.ts, 'odometro_km', t.odometro_km, 'consumo_acumulado_l', t.consumo_acumulado_l,
                                                     'nivel_combustible_l', t.nivel_combustible_l)
                              FROM tel.lectura t
                             WHERE t.camion_id = p_camion AND t.ts BETWEEN p_llegada - interval '3 hours' AND p_llegada + interval '3 hours'
                               AND t.calidad > 0 AND (t.odometro_km IS NOT NULL OR t.consumo_acumulado_l IS NOT NULL)
                             ORDER BY abs(extract(epoch FROM t.ts - p_llegada)) LIMIT 1),
        'diario', (SELECT coalesce(jsonb_agg(jsonb_build_object('fecha', a.fecha, 'km', a.km, 'litros', a.litros_consumidos,
                                                                 'horas_motor', a.horas_motor, 'horas_ralenti', a.horas_ralenti) ORDER BY a.fecha), '[]'::jsonb)
                     FROM tel.agregado_diario_camion a
                    WHERE a.camion_id = p_camion
                      AND a.fecha BETWEEN least(p_salida::date, date_trunc('month', p_llegada)::date) AND p_llegada::date),
        'leida_en', now())
$$;
COMMENT ON FUNCTION fue.fn_telemetria_viaje(bigint,timestamptz,timestamptz) IS 'K5: foto de telemetría del viaje (lecturas más cercanas a las fronteras y resumen diario) leída en una sola instrucción. Se congela al aprobar.';

-- 18.3 Contexto (categoría B, informativo): tramos y relevos, chofer propuesto, servicios, controles Mendoza
CREATE OR REPLACE FUNCTION fue.fn_contexto_viaje(p_camion bigint, p_carga_salida bigint, p_salida timestamptz, p_llegada timestamptz)
RETURNS jsonb LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, public, extensions AS $$
DECLARE
    v_pais text; v_tramos jsonb; v_km_tramos numeric; v_linea text; v_chofer bigint; v_conductores jsonb;
    v_semis jsonb; v_servicios jsonb; v_controles jsonb; v_capacidad numeric; v_relevos jsonb;
BEGIN
    SELECT coalesce(e.pais, c.pais_patente) INTO v_pais
      FROM fue.carga_combustible s JOIN mae.camion c ON c.id = s.camion_id
      LEFT JOIN mae.estacion_servicio e ON e.id = s.estacion_id
     WHERE s.id = p_carga_salida;

    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', t.id, 'inicio_real', t.inicio_real, 'fin_real', t.fin_real, 'estado', t.estado,
               'origen', uo.codigo, 'origen_nombre', uo.nombre, 'origen_pais', uo.pais,
               'destino', ud.codigo, 'destino_nombre', ud.nombre, 'destino_pais', ud.pais,
               'km', t.km_recorridos, 'km_telemetria', t.km_recorridos_telemetria, 'chofer_id', t.chofer_id,
               'con_carga', t.con_carga) ORDER BY t.inicio_real), '[]'::jsonb),
           sum(t.km_recorridos)
      INTO v_tramos, v_km_tramos
      FROM ops.tramo_operativo t
      JOIN mae.ubicacion uo ON uo.id = t.origen_id
      JOIN mae.ubicacion ud ON ud.id = t.destino_id
     WHERE t.camion_id = p_camion AND t.estado <> 'anulado' AND t.eliminado_en IS NULL AND t.inicio_real IS NOT NULL
       AND tstzrange(t.inicio_real, coalesce(t.fin_real, t.inicio_real), '[]') && tstzrange(p_salida, p_llegada, '[]');

    SELECT coalesce(jsonb_agg(jsonb_build_object('tramo_id', tc.tramo_id, 'chofer_id', tc.chofer_id, 'desde_ts', tc.desde_ts,
                                                 'hasta_ts', tc.hasta_ts, 'rol', tc.rol) ORDER BY tc.desde_ts), '[]'::jsonb)
      INTO v_relevos
      FROM ops.tramo_chofer tc
     WHERE tc.eliminado_en IS NULL AND tc.tramo_id IN (SELECT (e ->> 'id')::bigint FROM jsonb_array_elements(v_tramos) e);

    SELECT string_agg(codigo, ' - ' ORDER BY ord) INTO v_linea
      FROM (SELECT codigo, ord, lag(codigo) OVER (ORDER BY ord) AS anterior
              FROM (SELECT x.ord * 2 AS ord, x.e ->> 'origen' AS codigo FROM jsonb_array_elements(v_tramos) WITH ORDINALITY AS x(e, ord)
                    UNION ALL
                    SELECT x.ord * 2 + 1, x.e ->> 'destino' FROM jsonb_array_elements(v_tramos) WITH ORDINALITY AS x(e, ord)) p) q
     WHERE anterior IS DISTINCT FROM codigo;

    -- K2: propuesta = el de más km en los tramos
    SELECT (e ->> 'chofer_id')::bigint INTO v_chofer
      FROM jsonb_array_elements(v_tramos) e
     GROUP BY e ->> 'chofer_id'
     ORDER BY sum(coalesce((e ->> 'km')::numeric, 0)) DESC, count(*) DESC LIMIT 1;
    SELECT coalesce(jsonb_agg(DISTINCT x), '[]'::jsonb) INTO v_conductores
      FROM (SELECT (e ->> 'chofer_id')::bigint AS x FROM jsonb_array_elements(v_tramos) e
            UNION SELECT (r ->> 'chofer_id')::bigint FROM jsonb_array_elements(v_relevos) r WHERE r ->> 'rol' = 'conductor') q
     WHERE x IS NOT NULL;

    SELECT coalesce(jsonb_agg(DISTINCT jsonb_build_object('id', sr.id, 'patente', sr.patente)), '[]'::jsonb) INTO v_semis
      FROM ops.tramo_semirremolque ts JOIN mae.semirremolque sr ON sr.id = ts.semirremolque_id
     WHERE ts.eliminado_en IS NULL AND ts.tramo_id IN (SELECT (e ->> 'id')::bigint FROM jsonb_array_elements(v_tramos) e);

    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', sv.id, 'numero', sv.numero_servicio, 'cliente', cl.razon_social, 'cliente_id', cl.id,
               'mercaderia', sv.descripcion_carga, 'sentido', sv.sentido) ORDER BY sv.primer_inicio), '[]'::jsonb)
      INTO v_servicios
      FROM (SELECT sc.id, sc.numero_servicio, sc.cliente_id, sc.descripcion_carga,
                   min((e ->> 'inicio_real')::timestamptz) AS primer_inicio,
                   CASE WHEN bool_and(e ->> 'destino_pais' = v_pais AND e ->> 'origen_pais' <> v_pais) THEN 'regreso' ELSE 'ida' END AS sentido
              FROM jsonb_array_elements(v_tramos) e
              JOIN ops.servicio_tramo st ON st.tramo_id = (e ->> 'id')::bigint AND st.eliminado_en IS NULL
              JOIN ops.servicio_comercial sc ON sc.id = st.servicio_id AND sc.eliminado_en IS NULL
             GROUP BY sc.id, sc.numero_servicio, sc.cliente_id, sc.descripcion_carga) sv
      JOIN mae.cliente cl ON cl.id = sv.cliente_id;

    SELECT sum(tc.capacidad_util_l) INTO v_capacidad
      FROM mae.tanque_combustible tc
     WHERE tc.camion_id = p_camion AND tc.eliminado_en IS NULL
       AND tc.vigente_desde <= p_salida::date AND (tc.vigente_hasta IS NULL OR tc.vigente_hasta > p_salida::date);

    SELECT coalesce(jsonb_agg(jsonb_build_object(
               'id', cm.id, 'fecha_hora', cm.fecha_hora, 'odometro_declarado_km', cm.odometro_declarado_km,
               'odometro_telemetria_km', cm.odometro_telemetria_km, 'diferencia_km', cm.diferencia_km,
               'nivel_declarado_pct', cm.nivel_combustible_declarado_pct,
               'nivel_declarado_l', CASE WHEN v_capacidad IS NOT NULL AND cm.nivel_combustible_declarado_pct IS NOT NULL
                                         THEN round(v_capacidad * cm.nivel_combustible_declarado_pct / 100, 2) END,
               'chofer_id', cm.chofer_id) ORDER BY cm.fecha_hora), '[]'::jsonb)
      INTO v_controles
      FROM ops.control_mendoza cm
     WHERE cm.camion_id = p_camion AND cm.eliminado_en IS NULL AND cm.fecha_hora > p_salida AND cm.fecha_hora < p_llegada;

    RETURN jsonb_build_object('pais_salida', v_pais, 'tramos', v_tramos, 'relevos', v_relevos, 'km_tramos', v_km_tramos,
        'linea_viaje', v_linea, 'chofer_propuesto_id', v_chofer, 'conductores', v_conductores,
        'semirremolques', v_semis, 'servicios', v_servicios, 'capacidad_util_l', v_capacidad, 'controles_mendoza', v_controles);
END $$;
COMMENT ON FUNCTION fue.fn_contexto_viaje(bigint,bigint,timestamptz,timestamptz) IS 'Contexto informativo del viaje (categoría B): tramos y relevos, chofer propuesto, línea, semirremolques, servicios, capacidad y controles Mendoza.';

-- 18.4 Consumo del tractor: llenados (A) + telemetría (B)
CREATE OR REPLACE FUNCTION fue.fn_consumo_tractor(p_hechos jsonb, p_telemetria jsonb, p_contexto jsonb, p_manual jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
    ts jsonb := p_telemetria -> 'lectura_salida'; tl jsonb := p_telemetria -> 'lectura_llegada';
    v_s timestamptz := (p_hechos ->> 'salida_ts')::timestamptz; v_l timestamptz := (p_hechos ->> 'llegada_ts')::timestamptz;
    v_cons numeric; v_cons_f text; v_km numeric; v_km_f text; v_avisos text[] := '{}';
    v_hm numeric; v_hr numeric; v_rm numeric; v_dias integer := 0; v_dia date; v_kmdia numeric;
    v_llenado numeric := (p_hechos #>> '{tractor,litros_llenados_l}')::numeric + (p_hechos #>> '{tractor,litros_desde_mochila_l}')::numeric;
BEGIN
    IF (ts ->> 'consumo_acumulado_l') IS NOT NULL AND (tl ->> 'consumo_acumulado_l') IS NOT NULL
       AND (tl ->> 'consumo_acumulado_l')::numeric >= (ts ->> 'consumo_acumulado_l')::numeric THEN
        v_cons := (tl ->> 'consumo_acumulado_l')::numeric - (ts ->> 'consumo_acumulado_l')::numeric; v_cons_f := 'telemetria';
    ELSE
        SELECT sum((e ->> 'litros')::numeric) INTO v_cons FROM jsonb_array_elements(p_telemetria -> 'diario') e
         WHERE (e ->> 'fecha')::date BETWEEN v_s::date AND v_l::date;
        IF v_cons IS NOT NULL THEN
            v_cons_f := 'agregado_diario';
            v_avisos := v_avisos || 'Consumo de plataforma tomado del resumen diario (días completos): es aproximado.'::text;
        ELSE
            v_avisos := v_avisos || 'Sin datos de consumo de telemetría: cargá el consumo de plataforma a mano.'::text;
        END IF;
    END IF;

    IF (ts ->> 'odometro_km') IS NOT NULL AND (tl ->> 'odometro_km') IS NOT NULL
       AND (tl ->> 'odometro_km')::numeric >= (ts ->> 'odometro_km')::numeric THEN
        v_km := (tl ->> 'odometro_km')::numeric - (ts ->> 'odometro_km')::numeric; v_km_f := 'telemetria';
    ELSIF (p_hechos #>> '{salida,odometro_km}') IS NOT NULL AND (p_hechos #>> '{llegada,odometro_km}') IS NOT NULL
          AND (p_hechos #>> '{llegada,odometro_km}')::numeric >= (p_hechos #>> '{salida,odometro_km}')::numeric THEN
        v_km := (p_hechos #>> '{llegada,odometro_km}')::numeric - (p_hechos #>> '{salida,odometro_km}')::numeric; v_km_f := 'cargas';
        v_avisos := v_avisos || 'Km tomados del odómetro declarado en las cargas (sin telemetría).'::text;
    ELSIF (p_contexto ->> 'km_tramos') IS NOT NULL THEN
        v_km := (p_contexto ->> 'km_tramos')::numeric; v_km_f := 'tramos';
        v_avisos := v_avisos || 'Km tomados de la suma de tramos operativos (sin telemetría ni odómetro en las cargas).'::text;
    ELSE
        v_avisos := v_avisos || 'Sin kilómetros: cargalos a mano.'::text;
    END IF;

    SELECT sum((e ->> 'horas_motor')::numeric), sum((e ->> 'horas_ralenti')::numeric) INTO v_hm, v_hr
      FROM jsonb_array_elements(p_telemetria -> 'diario') e WHERE (e ->> 'fecha')::date BETWEEN v_s::date AND v_l::date;
    SELECT sum((e ->> 'horas_ralenti')::numeric) INTO v_rm
      FROM jsonb_array_elements(p_telemetria -> 'diario') e WHERE (e ->> 'fecha')::date >= date_trunc('month', v_l)::date;
    v_dia := v_l::date - 1;
    LOOP
        SELECT (e ->> 'km')::numeric INTO v_kmdia FROM jsonb_array_elements(p_telemetria -> 'diario') e WHERE (e ->> 'fecha')::date = v_dia;
        EXIT WHEN v_kmdia IS NULL OR v_kmdia >= 5 OR v_dia <= v_s::date;
        v_dias := v_dias + 1; v_dia := v_dia - 1;
    END LOOP;

    -- Correcciones manuales del borrador (con motivo)
    IF (p_manual ->> 'km_manual') IS NOT NULL THEN v_km := (p_manual ->> 'km_manual')::numeric; v_km_f := 'manual'; END IF;
    IF (p_manual ->> 'consumo_plataforma_manual_l') IS NOT NULL THEN
        v_cons := (p_manual ->> 'consumo_plataforma_manual_l')::numeric; v_cons_f := 'manual';
    END IF;

    RETURN jsonb_build_object(
        'litros_carga_salida', p_hechos #> '{tractor,litros_carga_salida}',
        'litros_llenados_l', p_hechos #> '{tractor,litros_llenados_l}',
        'litros_desde_mochila_l', p_hechos #> '{tractor,litros_desde_mochila_l}',
        'consumo_llenado_l', v_llenado,
        'consumo_plataforma_l', round(v_cons, 2), 'fuente_consumo_plataforma', v_cons_f,
        'km_recorridos', v_km, 'fuente_km', v_km_f,
        'horas_motor', v_hm, 'horas_ralenti', v_hr, 'ralenti_mes_h', v_rm, 'dias_parado', v_dias,
        'consumo_l_100km', CASE WHEN v_km > 0 THEN round(v_llenado / v_km * 100, 2) END,
        'diferencia_l', CASE WHEN v_cons IS NOT NULL THEN v_llenado - round(v_cons, 2) END,
        'avisos', to_jsonb(v_avisos));
END $$;
COMMENT ON FUNCTION fue.fn_consumo_tractor(jsonb,jsonb,jsonb,jsonb) IS 'Consumo del tractor: llenados del viaje + litros desde la mochila frente al consumo de plataforma (telemetría congelada o manual).';

-- 18.5 Resultado: compone y evalúa la política. La misma función para la vista previa y la aprobación.
CREATE OR REPLACE FUNCTION fue.fn_resultado_viaje(p_camion bigint, p_carga_salida bigint, p_manual jsonb DEFAULT '{}'::jsonb,
                                                  p_telemetria jsonb DEFAULT NULL, p_contexto jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, public, extensions AS $$
DECLARE
    h jsonb; t jsonb; ctx jsonb; tr jsonb; mo jsonb;
    v_pend jsonb; v_avisos jsonb;
    v_tol_t numeric := ref.fn_parametro_num('fue.cierre_tolerancia_tractor_l', 10);
    v_tol_m numeric := ref.fn_parametro_num('fue.cierre_tolerancia_mochila_l', 10);
    v_ventana numeric := ref.fn_parametro_num('fue.cierre_ventana_ambiguedad_min', 120);
    v_relevo text := ref.fn_parametro_texto('fue.cierre_relevo_politica', 'avisar');
    v_dif_t numeric; v_dif_m numeric; v_noimp_t numeric; v_noimp_m numeric; v_imp_t numeric; v_imp_m numeric := 0;
    v_chofer bigint; v_propuesto bigint;
BEGIN
    h := fue.fn_hechos_viaje(p_camion, p_carga_salida);
    v_pend := h -> 'pendientes';
    v_avisos := h -> 'avisos';
    IF h ->> 'carga_llegada_id' IS NULL THEN
        RETURN h || jsonb_build_object('calculado_en', now());
    END IF;
    IF (p_manual ->> 'carga_llegada_id') IS NOT NULL AND (p_manual ->> 'carga_llegada_id') <> (h ->> 'carga_llegada_id') THEN
        v_pend := v_pend || jsonb_build_object('codigo', 'limites_desactualizados',
                    'mensaje', 'Cambiaron las fronteras del camión: guardá el borrador de nuevo para tomar la llegada vigente');
    END IF;

    t   := coalesce(p_telemetria, fue.fn_telemetria_viaje(p_camion, (h ->> 'salida_ts')::timestamptz, (h ->> 'llegada_ts')::timestamptz));
    ctx := coalesce(p_contexto, fue.fn_contexto_viaje(p_camion, p_carga_salida, (h ->> 'salida_ts')::timestamptz, (h ->> 'llegada_ts')::timestamptz));
    tr  := fue.fn_consumo_tractor(h, t, ctx, p_manual);
    v_avisos := v_avisos || (tr -> 'avisos');

    -- Tractor
    v_dif_t := (tr ->> 'diferencia_l')::numeric;
    v_noimp_t := coalesce((p_manual ->> 'tractor_no_imputable_l')::numeric, 0);
    IF (tr ->> 'km_recorridos') IS NULL OR (tr ->> 'km_recorridos')::numeric <= 0 THEN
        v_pend := v_pend || jsonb_build_object('codigo', 'sin_km', 'mensaje', 'Faltan los kilómetros del viaje: cargalos a mano con un motivo');
    END IF;
    IF v_dif_t IS NULL THEN
        v_pend := v_pend || jsonb_build_object('codigo', 'sin_consumo_plataforma', 'mensaje', 'Falta el consumo de plataforma: cargalo a mano con un motivo');
    ELSE
        IF abs(v_dif_t) > v_tol_t AND nullif(btrim(p_manual ->> 'tractor_justificacion'), '') IS NULL THEN
            v_pend := v_pend || jsonb_build_object('codigo', 'justificacion_tractor',
                        'mensaje', format('La diferencia del tractor (%s L) supera la tolerancia de %s L: escribí la justificación', round(v_dif_t, 2), v_tol_t));
        END IF;
        IF v_noimp_t > greatest(v_dif_t, 0) THEN
            v_pend := v_pend || jsonb_build_object('codigo', 'no_imputable_tractor', 'mensaje', 'El no imputable del tractor no puede superar su faltante');
        END IF;
    END IF;
    v_imp_t := greatest(coalesce(v_dif_t, 0), 0) - least(v_noimp_t, greatest(coalesce(v_dif_t, 0), 0));

    -- Mochila (sin neteo con el tractor)
    mo := h -> 'mochila';
    v_chofer := coalesce((p_manual ->> 'chofer_responsable_id')::bigint, (ctx ->> 'chofer_propuesto_id')::bigint);
    IF mo IS NOT NULL AND mo ->> 'diferencia_l' IS NOT NULL THEN
        v_dif_m := (mo ->> 'diferencia_l')::numeric;
        v_noimp_m := coalesce((p_manual ->> 'mochila_no_imputable_l')::numeric, 0);
        IF abs(v_dif_m) > v_tol_m AND nullif(btrim(p_manual ->> 'mochila_justificacion'), '') IS NULL THEN
            v_pend := v_pend || jsonb_build_object('codigo', 'justificacion_mochila',
                        'mensaje', format('La diferencia de la mochila (%s L) supera la tolerancia de %s L: escribí la justificación', round(v_dif_m, 2), v_tol_m));
        END IF;
        IF v_noimp_m > greatest(v_dif_m, 0) THEN
            v_pend := v_pend || jsonb_build_object('codigo', 'no_imputable_mochila', 'mensaje', 'El no imputable de la mochila no puede superar su faltante');
        END IF;
        -- Una declaración que deja más litros que el teórico + tolerancia exige medición
        IF mo #>> '{control_llegada,fuente}' = 'declaracion' AND v_dif_m < -v_tol_m THEN
            v_pend := v_pend || jsonb_build_object('codigo', 'declaracion_exige_medicion',
                        'mensaje', 'El control de llegada declarado deja más litros que el teórico más la tolerancia: tiene que ser una medición');
        END IF;
        -- D6: cambio de chofer con ancla declarada → llegada medida o justificación
        IF mo #>> '{control_ancla,fuente}' = 'declaracion'
           AND (mo #>> '{control_ancla,chofer_id}')::bigint IS DISTINCT FROM v_chofer
           AND mo #>> '{control_llegada,fuente}' IS DISTINCT FROM 'medicion'
           AND nullif(btrim(p_manual ->> 'mochila_justificacion'), '') IS NULL THEN
            v_pend := v_pend || jsonb_build_object('codigo', 'cambio_chofer_exige_medicion',
                        'mensaje', 'El ancla la declaró otro chofer: la llegada tiene que ser medición, o justificalo');
        END IF;
        v_imp_m := greatest(v_dif_m, 0) - least(v_noimp_m, greatest(v_dif_m, 0));
    END IF;

    -- K2: chofer responsable
    v_propuesto := (ctx ->> 'chofer_propuesto_id')::bigint;
    IF v_chofer IS NULL THEN
        v_pend := v_pend || jsonb_build_object('codigo', 'sin_chofer', 'mensaje', 'Falta el chofer responsable del viaje');
    ELSIF jsonb_array_length(ctx -> 'conductores') > 0 AND NOT (ctx -> 'conductores') @> to_jsonb(v_chofer) THEN
        v_pend := v_pend || jsonb_build_object('codigo', 'chofer_fuera_de_tramos', 'mensaje', 'El chofer responsable no figura en ningún tramo ni relevo del viaje');
    ELSIF v_propuesto IS NOT NULL AND v_chofer <> v_propuesto AND nullif(btrim(p_manual ->> 'motivo_chofer'), '') IS NULL THEN
        v_pend := v_pend || jsonb_build_object('codigo', 'motivo_chofer', 'mensaje', 'Cambiaste el chofer propuesto por los tramos: escribí el motivo');
    END IF;
    IF jsonb_array_length(ctx -> 'conductores') = 0 THEN
        v_avisos := v_avisos || to_jsonb('Sin tramos en el viaje: el chofer responsable no se pudo contrastar con los tramos.'::text);
    END IF;
    IF jsonb_array_length(ctx -> 'conductores') > 1 THEN
        IF v_relevo = 'bloquear' THEN
            v_pend := v_pend || jsonb_build_object('codigo', 'relevo_sin_frontera',
                        'mensaje', 'Hubo relevo de chofer dentro del viaje: marcá una frontera en el relevo (parámetro fue.cierre_relevo_politica)');
        ELSE
            v_avisos := v_avisos || to_jsonb('Hubo relevo de chofer dentro del viaje (regla "relevo = frontera" pendiente de validar con Operaciones).'::text);
        END IF;
    END IF;

    RETURN jsonb_build_object(
        'camion_id', p_camion,
        'camion_patente', (SELECT patente FROM mae.camion WHERE id = p_camion),
        'carga_salida_id', h -> 'carga_salida_id', 'carga_llegada_id', h -> 'carga_llegada_id',
        'salida_ts', h -> 'salida_ts', 'llegada_ts', h -> 'llegada_ts',
        'salida', h -> 'salida', 'llegada', h -> 'llegada',
        'tractor', tr - 'avisos' || jsonb_build_object('llenados', h #> '{tractor,llenados}', 'tolerancia_l', v_tol_t,
                       'no_imputable_l', v_noimp_t, 'imputable_l', v_imp_t),
        'usa_mochila', h -> 'usa_mochila',
        'mochila', CASE WHEN mo IS NOT NULL THEN mo || jsonb_build_object('tolerancia_l', v_tol_m, 'no_imputable_l', v_noimp_m,
                                                                          'imputable_l', v_imp_m) END,
        'imputable_total_l', v_imp_t + v_imp_m,
        'chofer_responsable_id', v_chofer, 'chofer_propuesto_id', v_propuesto,
        'chofer_nombre', (SELECT ch.apellido || ', ' || ch.nombre FROM mae.chofer ch WHERE ch.id = v_chofer),
        'linea_viaje', ctx -> 'linea_viaje',
        'contexto', ctx, 'telemetria', t,
        'parametros', jsonb_build_object('tolerancia_tractor_l', v_tol_t, 'tolerancia_mochila_l', v_tol_m,
                                         'ventana_ambiguedad_min', v_ventana, 'relevo_politica', v_relevo),
        'pendientes', v_pend, 'avisos', v_avisos, 'huella', h -> 'huella', 'calculado_en', now());
END $$;
COMMENT ON FUNCTION fue.fn_resultado_viaje(bigint,bigint,jsonb,jsonb,jsonb) IS 'Resultado del viaje: hechos + telemetría + contexto + política (tolerancias por componente, justificaciones, pendientes bloqueantes). La usan la vista previa, el borrador y la aprobación.';

CREATE OR REPLACE FUNCTION fue.fn_resultado_cierre(p_id bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, public, extensions AS $$
DECLARE cv fue.cierre_viaje%ROWTYPE;
BEGIN
    SELECT * INTO cv FROM fue.cierre_viaje WHERE id = p_id AND eliminado_en IS NULL;
    IF cv.id IS NULL THEN RAISE EXCEPTION 'El cierre % no existe', p_id USING ERRCODE = 'P0002'; END IF;
    IF cv.estado = 'aprobado' THEN
        -- Aprobado: la foto de categoría B es la congelada (D8)
        RETURN fue.fn_resultado_viaje(cv.camion_id, cv.carga_salida_id, to_jsonb(cv), cv.detalle -> 'telemetria', cv.detalle -> 'contexto');
    END IF;
    RETURN fue.fn_resultado_viaje(cv.camion_id, cv.carga_salida_id, to_jsonb(cv));
END $$;
COMMENT ON FUNCTION fue.fn_resultado_cierre(bigint) IS 'Resultado de un cierre con sus datos manuales (vista previa del borrador desde la base).';

-- Compatibilidad con la pantalla actual: vista previa por camión y cargas.
CREATE OR REPLACE FUNCTION fue.fn_calcular_cierre_viaje(p_camion_id bigint, p_carga_salida_id bigint, p_carga_llegada_id bigint)
RETURNS jsonb LANGUAGE sql STABLE AS $$
    SELECT fue.fn_resultado_viaje(p_camion_id, p_carga_salida_id, jsonb_build_object('carga_llegada_id', p_carga_llegada_id))
$$;
COMMENT ON FUNCTION fue.fn_calcular_cierre_viaje(bigint,bigint,bigint) IS 'Vista previa de un viaje (solo lectura). La llegada la fijan las fronteras: si no coincide, figura como pendiente.';

-- =============================================================================
-- 19. Ciclo de vida del cierre
-- =============================================================================
CREATE OR REPLACE FUNCTION fue.fn_cierre_viaje_reglas()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE l fue.carga_combustible%ROWTYPE; s fue.carga_combustible%ROWTYPE;
BEGIN
    IF fue.fn_es_propietario() THEN
        RETURN NEW;   -- aprobación y anulación (SECURITY DEFINER)
    END IF;
    IF TG_OP = 'UPDATE' AND OLD.estado <> 'borrador' THEN
        RAISE EXCEPTION 'El cierre % está % y no se modifica: anulalo y armá uno nuevo', OLD.numero, OLD.estado USING ERRCODE = '55000';
    END IF;
    IF TG_OP = 'INSERT' AND NEW.estado <> 'borrador' OR TG_OP = 'UPDATE' AND NEW.estado <> OLD.estado THEN
        RAISE EXCEPTION 'Un cierre se aprueba con fue.fn_aprobar_cierre y se anula con fue.fn_anular_cierre' USING ERRCODE = '42501';
    END IF;
    -- D2: los límites salen de las fronteras, no los elige el cierre
    SELECT * INTO s FROM fue.carga_combustible WHERE id = NEW.carga_salida_id;
    IF NOT fue.fn_es_frontera(NEW.carga_salida_id, NEW.camion_id) THEN
        RAISE EXCEPTION 'La carga de salida tiene que ser una parada frontera vigente del camión' USING ERRCODE = '23514';
    END IF;
    SELECT * INTO l FROM fue.carga_combustible
     WHERE camion_id = NEW.camion_id AND es_frontera AND estado_validacion <> 'anulada' AND eliminado_en IS NULL
       AND fecha_hora > s.fecha_hora ORDER BY fecha_hora LIMIT 1;
    IF l.id IS NULL THEN
        RAISE EXCEPTION 'El viaje todavía no tiene parada frontera de llegada' USING ERRCODE = '23514';
    END IF;
    NEW.carga_llegada_id := l.id;
    NEW.salida_ts := s.fecha_hora;
    NEW.llegada_ts := l.fecha_hora;
    IF TG_OP = 'INSERT' AND NEW.chofer_responsable_id IS NULL THEN
        NEW.chofer_responsable_id := (fue.fn_contexto_viaje(NEW.camion_id, s.id, s.fecha_hora, l.fecha_hora) ->> 'chofer_propuesto_id')::bigint;
    END IF;
    RETURN NEW;
END $$;
COMMENT ON FUNCTION fue.fn_cierre_viaje_reglas() IS 'BEFORE INSERT/UPDATE de fue.cierre_viaje: el borrador toma la llegada de las fronteras (D2) y propone el chofer (K2); aprobado y anulado no se modifican.';
CREATE TRIGGER tg_12_reglas BEFORE INSERT OR UPDATE ON fue.cierre_viaje
    FOR EACH ROW EXECUTE FUNCTION fue.fn_cierre_viaje_reglas();

CREATE OR REPLACE FUNCTION fue.fn_aprobar_cierre(p_id bigint, p_version integer)
RETURNS fue.cierre_viaje LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions AS $$
DECLARE cv fue.cierre_viaje%ROWTYPE; v_camion bigint; r jsonb; tr jsonb; mo jsonb;
BEGIN
    SELECT camion_id INTO v_camion FROM fue.cierre_viaje WHERE id = p_id AND eliminado_en IS NULL;
    IF v_camion IS NULL THEN RAISE EXCEPTION 'El cierre % no existe', p_id USING ERRCODE = 'P0002'; END IF;
    -- D1: camión → cierre → depósitos, antes de la primera lectura
    PERFORM fue.fn_bloquear(ARRAY[v_camion]);
    SELECT * INTO cv FROM fue.cierre_viaje WHERE id = p_id FOR UPDATE;
    IF cv.version_fila <> p_version THEN
        RAISE EXCEPTION 'Conflicto de concurrencia en fue.cierre_viaje id=%: version_fila enviada %, vigente %', p_id, p_version, cv.version_fila
            USING ERRCODE = '40001';
    END IF;
    IF cv.estado <> 'borrador' THEN
        RAISE EXCEPTION 'Solo se aprueba un cierre en borrador (estado actual: %)', cv.estado USING ERRCODE = '55000';
    END IF;
    PERFORM fue.fn_bloquear('{}', ARRAY(
        SELECT d.id FROM fue.deposito_combustible d
         WHERE d.tipo = 'mochila' AND d.camion_id = v_camion AND d.eliminado_en IS NULL
           AND d.vigente_desde < cv.llegada_ts AND coalesce(d.vigente_hasta, 'infinity') > cv.salida_ts - interval '1 microsecond'));

    r := fue.fn_resultado_cierre(p_id);
    IF (r ->> 'carga_llegada_id')::bigint IS DISTINCT FROM cv.carga_llegada_id THEN
        RAISE EXCEPTION 'Cambiaron las fronteras del camión: guardá el borrador de nuevo antes de aprobar' USING ERRCODE = '55000';
    END IF;
    IF jsonb_array_length(r -> 'pendientes') > 0 THEN
        RAISE EXCEPTION 'No se puede aprobar el cierre %: %', cv.numero,
              (SELECT string_agg(e ->> 'mensaje', '; ') FROM jsonb_array_elements(r -> 'pendientes') e)
            USING ERRCODE = '23514', DETAIL = (r -> 'pendientes')::text;
    END IF;
    tr := r -> 'tractor'; mo := r -> 'mochila';

    UPDATE fue.cierre_viaje SET
        estado = 'aprobado',
        chofer_responsable_id = (r ->> 'chofer_responsable_id')::bigint,
        km_recorridos = (tr ->> 'km_recorridos')::numeric, fuente_km = tr ->> 'fuente_km',
        litros_carga_salida = (tr ->> 'litros_carga_salida')::numeric,
        litros_llenados_l = (tr ->> 'litros_llenados_l')::numeric,
        litros_desde_mochila_l = (tr ->> 'litros_desde_mochila_l')::numeric,
        consumo_llenado_l = (tr ->> 'consumo_llenado_l')::numeric,
        consumo_plataforma_l = (tr ->> 'consumo_plataforma_l')::numeric, fuente_consumo_plataforma = tr ->> 'fuente_consumo_plataforma',
        horas_motor = (tr ->> 'horas_motor')::numeric, horas_ralenti = (tr ->> 'horas_ralenti')::numeric,
        ralenti_mes_h = (tr ->> 'ralenti_mes_h')::numeric, dias_parado = (tr ->> 'dias_parado')::smallint,
        capacidad_util_l = (r #>> '{contexto,capacidad_util_l}')::numeric,
        consumo_l_100km = (tr ->> 'consumo_l_100km')::numeric,
        tractor_diferencia_l = (tr ->> 'diferencia_l')::numeric, tractor_tolerancia_l = (tr ->> 'tolerancia_l')::numeric,
        tractor_imputable_l = (tr ->> 'imputable_l')::numeric,
        usa_mochila = (r ->> 'usa_mochila')::boolean,
        deposito_id = (mo ->> 'deposito_id')::bigint,
        control_ancla_id = (mo #>> '{control_ancla,id}')::bigint, control_llegada_id = (mo #>> '{control_llegada,id}')::bigint,
        mochila_ancla_l = (mo ->> 'ancla_l')::numeric, mochila_entradas_l = (mo ->> 'entradas_l')::numeric,
        mochila_transferencias_entrada_l = (mo ->> 'transferencias_entrada_l')::numeric,
        mochila_transferencias_salida_l = (mo ->> 'transferencias_salida_l')::numeric,
        mochila_a_tractor_l = (mo ->> 'a_tractor_l')::numeric, mochila_con_motivo_l = (mo ->> 'con_motivo_l')::numeric,
        mochila_real_l = (mo ->> 'real_l')::numeric, mochila_teorico_l = (mo ->> 'teorico_l')::numeric,
        mochila_fisico_l = (mo ->> 'fisico_l')::numeric, mochila_diferencia_l = (mo ->> 'diferencia_l')::numeric,
        mochila_tolerancia_l = (mo ->> 'tolerancia_l')::numeric, mochila_imputable_l = (mo ->> 'imputable_l')::numeric,
        imputable_total_l = (r ->> 'imputable_total_l')::numeric,
        linea_viaje = r ->> 'linea_viaje',
        huella = r ->> 'huella',
        detalle = jsonb_build_object('telemetria', r -> 'telemetria', 'contexto', r -> 'contexto', 'parametros', r -> 'parametros',
                                     'avisos', r -> 'avisos', 'llenados', tr -> 'llenados', 'mochila', mo),
        calculado_en = (r ->> 'calculado_en')::timestamptz,
        aprobado_por = aud.fn_usuario_actual(), aprobado_en = now(),
        version_fila = cv.version_fila
     WHERE id = p_id
    RETURNING * INTO cv;
    RETURN cv;
END $$;
COMMENT ON FUNCTION fue.fn_aprobar_cierre(bigint,integer) IS 'Aprueba un cierre en borrador en cualquier orden: bloqueos (camión → cierre → mochila), fn_resultado_cierre, rechazo si hay pendientes y congelamiento. No escribe el libro. Desde ahí su período queda cerrado.';

CREATE OR REPLACE FUNCTION fue.fn_anular_cierre(p_id bigint, p_version integer, p_motivo text)
RETURNS fue.cierre_viaje LANGUAGE plpgsql SECURITY DEFINER
SET search_path = pg_catalog, public, extensions AS $$
DECLARE cv fue.cierre_viaje%ROWTYPE; v_camion bigint;
BEGIN
    IF nullif(btrim(p_motivo), '') IS NULL THEN RAISE EXCEPTION 'Escribí el motivo de la anulación' USING ERRCODE = '23514'; END IF;
    SELECT camion_id INTO v_camion FROM fue.cierre_viaje WHERE id = p_id AND eliminado_en IS NULL;
    IF v_camion IS NULL THEN RAISE EXCEPTION 'El cierre % no existe', p_id USING ERRCODE = 'P0002'; END IF;
    PERFORM fue.fn_bloquear(ARRAY[v_camion]);
    SELECT * INTO cv FROM fue.cierre_viaje WHERE id = p_id FOR UPDATE;
    IF cv.version_fila <> p_version THEN
        RAISE EXCEPTION 'Conflicto de concurrencia en fue.cierre_viaje id=%: version_fila enviada %, vigente %', p_id, p_version, cv.version_fila
            USING ERRCODE = '40001';
    END IF;
    IF cv.estado = 'anulado' THEN RAISE EXCEPTION 'El cierre % ya está anulado', cv.numero USING ERRCODE = '55000'; END IF;
    UPDATE fue.cierre_viaje
       SET estado = 'anulado', motivo_anulacion = btrim(p_motivo), anulado_por = aud.fn_usuario_actual(), anulado_en = now(),
           version_fila = cv.version_fila
     WHERE id = p_id
    RETURNING * INTO cv;
    RETURN cv;
END $$;
COMMENT ON FUNCTION fue.fn_anular_cierre(bigint,integer,text) IS 'Anula un cierre (borrador o aprobado), en cualquier orden. No toca el libro, los controles ni los ajustes: reabre su período.';

-- Verificación para el auditor (D8): recalcula la categoría A desde los hechos; la B se compara como aviso.
CREATE OR REPLACE FUNCTION fue.fn_verificar_cierre(p_id bigint)
RETURNS jsonb LANGUAGE plpgsql STABLE
SET search_path = pg_catalog, public, extensions AS $$
DECLARE cv fue.cierre_viaje%ROWTYPE; h jsonb; mo jsonb; v_def text[] := '{}'; v_av text[] := '{}'; t jsonb; ctx jsonb;
        v_llenado numeric;
BEGIN
    SELECT * INTO cv FROM fue.cierre_viaje WHERE id = p_id AND eliminado_en IS NULL;
    IF cv.id IS NULL OR cv.estado <> 'aprobado' THEN
        RAISE EXCEPTION 'El cierre % no existe o no está aprobado', p_id USING ERRCODE = 'P0002';
    END IF;
    h := fue.fn_hechos_viaje(cv.camion_id, cv.carga_salida_id);
    mo := h -> 'mochila';
    IF (h ->> 'carga_llegada_id')::bigint IS DISTINCT FROM cv.carga_llegada_id THEN v_def := v_def || 'frontera de llegada'::text; END IF;
    IF h ->> 'huella' IS DISTINCT FROM cv.huella THEN v_def := v_def || 'huella de los hechos'::text; END IF;
    v_llenado := (h #>> '{tractor,litros_llenados_l}')::numeric + (h #>> '{tractor,litros_desde_mochila_l}')::numeric;
    IF v_llenado IS DISTINCT FROM cv.consumo_llenado_l THEN v_def := v_def || 'consumo por llenado'::text; END IF;
    IF v_llenado - cv.consumo_plataforma_l IS DISTINCT FROM cv.tractor_diferencia_l THEN v_def := v_def || 'diferencia del tractor'::text; END IF;
    IF (h ->> 'usa_mochila')::boolean IS DISTINCT FROM cv.usa_mochila THEN v_def := v_def || 'uso de mochila'::text; END IF;
    IF (mo ->> 'deposito_id')::bigint IS DISTINCT FROM cv.deposito_id THEN v_def := v_def || 'mochila'::text; END IF;
    IF (mo #>> '{control_ancla,id}')::bigint IS DISTINCT FROM cv.control_ancla_id THEN v_def := v_def || 'control ancla'::text; END IF;
    IF (mo #>> '{control_llegada,id}')::bigint IS DISTINCT FROM cv.control_llegada_id THEN v_def := v_def || 'control de llegada'::text; END IF;
    IF (mo ->> 'diferencia_l')::numeric IS DISTINCT FROM cv.mochila_diferencia_l THEN v_def := v_def || 'diferencia de la mochila'::text; END IF;
    IF jsonb_array_length(h -> 'pendientes') > 0 THEN v_def := v_def || 'pendientes en los hechos'::text; END IF;

    t := fue.fn_telemetria_viaje(cv.camion_id, cv.salida_ts, cv.llegada_ts);
    IF (t - 'leida_en') IS DISTINCT FROM (cv.detalle -> 'telemetria') - 'leida_en' THEN
        v_av := v_av || 'Llegó o cambió telemetría después de aprobar (el cierre conserva su foto).'::text;
    END IF;
    ctx := fue.fn_contexto_viaje(cv.camion_id, cv.carga_salida_id, cv.salida_ts, cv.llegada_ts);
    IF ctx -> 'conductores' IS DISTINCT FROM cv.detalle #> '{contexto,conductores}'
       OR ctx -> 'tramos' IS DISTINCT FROM cv.detalle #> '{contexto,tramos}' THEN
        v_av := v_av || 'Los tramos posteriores no coinciden con la foto del cierre (el responsable no cambia).'::text;
    END IF;
    RETURN jsonb_build_object('ok', cardinality(v_def) = 0, 'defectos', to_jsonb(v_def), 'avisos', to_jsonb(v_av),
                              'verificado_en', now());
END $$;
COMMENT ON FUNCTION fue.fn_verificar_cierre(bigint) IS 'D8: recalcula los hechos protegidos (categoría A) y los compara con lo congelado (defecto si difieren). Telemetría y tramos (categoría B) solo dan avisos.';

-- =============================================================================
-- 20. Vistas
-- =============================================================================
CREATE OR REPLACE VIEW fue.v_cierre_viaje WITH (security_invoker = true) AS
    SELECT * FROM fue.cierre_viaje WHERE eliminado_en IS NULL;
COMMENT ON VIEW fue.v_cierre_viaje IS 'Filas activas de fue.cierre_viaje (soft delete filtrado). Usar desde la aplicación.';

-- La vista de 09 se creó con las columnas de entonces: se rehace para incluir las de 22 y 24.
CREATE OR REPLACE VIEW fue.v_carga_combustible WITH (security_invoker = true) AS
    SELECT * FROM fue.carga_combustible WHERE eliminado_en IS NULL;

CREATE OR REPLACE VIEW fue.v_uso_mochila WITH (security_invoker = true) AS
    SELECT * FROM fue.uso_mochila WHERE eliminado_en IS NULL;
CREATE OR REPLACE VIEW fue.v_responsable_deposito WITH (security_invoker = true) AS
    SELECT * FROM fue.responsable_deposito WHERE eliminado_en IS NULL;
CREATE OR REPLACE VIEW fue.v_solicitud_correccion WITH (security_invoker = true) AS
    SELECT * FROM fue.solicitud_correccion WHERE eliminado_en IS NULL;
CREATE OR REPLACE VIEW fue.v_aprobacion_control_base WITH (security_invoker = true) AS
    SELECT * FROM fue.aprobacion_control_base WHERE eliminado_en IS NULL;

-- Viajes = tramos entre fronteras consecutivas de cada camión, con su cierre (reporte de completitud, D2)
CREATE OR REPLACE VIEW fue.v_viaje WITH (security_invoker = true) AS
WITH f AS (
    SELECT c.camion_id, c.id, c.fecha_hora,
           lead(c.id) OVER w AS siguiente_id, lead(c.fecha_hora) OVER w AS siguiente_ts
      FROM fue.carga_combustible c
     WHERE c.es_frontera AND c.estado_validacion <> 'anulada' AND c.eliminado_en IS NULL
    WINDOW w AS (PARTITION BY c.camion_id ORDER BY c.fecha_hora))
SELECT f.camion_id, cam.patente, f.id AS carga_salida_id, f.fecha_hora AS salida_ts,
       f.siguiente_id AS carga_llegada_id, f.siguiente_ts AS llegada_ts,
       cv.id AS cierre_id, cv.numero AS cierre_numero, cv.estado AS cierre_estado,
       CASE WHEN f.siguiente_id IS NULL THEN 'en_curso'
            WHEN cv.id IS NULL THEN 'sin_cierre'
            WHEN cv.carga_llegada_id <> f.siguiente_id THEN 'cierre_desactualizado'
            ELSE cv.estado END AS situacion
  FROM f
  JOIN mae.camion cam ON cam.id = f.camion_id
  LEFT JOIN fue.cierre_viaje cv ON cv.carga_salida_id = f.id AND cv.estado <> 'anulado' AND cv.eliminado_en IS NULL;
COMMENT ON VIEW fue.v_viaje IS 'Viajes derivados de las fronteras (D2): cada tramo entre dos fronteras consecutivas debe tener cierre. situacion: en_curso | sin_cierre | borrador | aprobado | cierre_desactualizado.';

CREATE OR REPLACE VIEW fue.v_saldo_deposito WITH (security_invoker = true) AS
SELECT d.id AS deposito_id, d.codigo, d.nombre, d.tipo, d.camion_id, d.estacion_id, d.tipo_combustible_id,
       d.capacidad_l, d.estado, d.vigente_desde, d.vigente_hasta,
       coalesce(m.saldo_l, 0) AS saldo_l, m.ultimo_movimiento,
       c.id AS ultimo_control_id, c.fecha_hora AS ultimo_control_en, c.litros AS ultimo_control_l,
       c.fuente AS ultimo_control_fuente, c.rol AS ultimo_control_rol,
       (d.tipo = 'tanque_base' AND (c.id IS NULL OR c.fecha_hora < now()
            - make_interval(hours => ref.fn_parametro_num('fue.base_frecuencia_max_horas', 24)::integer))) AS control_vencido,
       (SELECT count(*) FROM fue.movimiento_combustible x WHERE x.deposito_id = d.id AND x.estado_aprobacion = 'pendiente') AS movimientos_pendientes,
       r.usuario_id AS responsable_usuario_id
  FROM fue.deposito_combustible d
  LEFT JOIN LATERAL (SELECT sum(litros) AS saldo_l, max(fecha_hora) AS ultimo_movimiento
                       FROM fue.movimiento_combustible WHERE deposito_id = d.id AND eliminado_en IS NULL) m ON true
  LEFT JOIN LATERAL (SELECT id, fecha_hora, litros, fuente, rol FROM fue.control_saldo_deposito
                      WHERE deposito_id = d.id AND estado = 'vigente' AND eliminado_en IS NULL ORDER BY fecha_hora DESC LIMIT 1) c ON true
  LEFT JOIN LATERAL (SELECT usuario_id FROM fue.responsable_deposito
                      WHERE deposito_id = d.id AND eliminado_en IS NULL AND desde_ts < now() AND (hasta_ts IS NULL OR hasta_ts >= now())
                      LIMIT 1) r ON true
 WHERE d.eliminado_en IS NULL;
COMMENT ON VIEW fue.v_saldo_deposito IS 'Depósitos con saldo de libro, vigencia, último control, control vencido (base), movimientos con motivo pendientes y responsable actual.';

-- =============================================================================
-- 21. Permisos
-- =============================================================================
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA fue FROM PUBLIC;
REVOKE ALL ON FUNCTION ref.fn_parametro_texto(text,text) FROM PUBLIC;

-- Lectura
GRANT SELECT ON fue.cierre_viaje, fue.v_cierre_viaje, fue.uso_mochila, fue.v_uso_mochila,
                fue.responsable_deposito, fue.v_responsable_deposito, fue.solicitud_correccion, fue.v_solicitud_correccion,
                fue.aprobacion_control_base, fue.v_aprobacion_control_base, fue.v_viaje, fue.v_saldo_deposito, fue.v_carga_combustible
    TO tc_admin, tc_app, tc_etl, tc_motor, tc_lectura, tc_auditor;

-- Escritura directa
GRANT INSERT, UPDATE ON fue.uso_mochila TO tc_admin, tc_app;
GRANT INSERT, UPDATE ON fue.responsable_deposito TO tc_admin, tc_app;
GRANT INSERT ON fue.solicitud_correccion TO tc_admin, tc_app, tc_etl;
-- Cierre: el borrador se edita por columnas; estado y congelados solo con fn_aprobar_cierre / fn_anular_cierre (M4)
GRANT INSERT (camion_id, carga_salida_id, chofer_responsable_id, motivo_chofer, programador_velocidad_pct, test_alcohol,
              km_manual, consumo_plataforma_manual_l, motivo_ajuste, tractor_no_imputable_l, tractor_no_imputable_ralenti_h,
              tractor_no_imputable_motivo, tractor_justificacion, mochila_no_imputable_l, mochila_no_imputable_motivo,
              mochila_justificacion, observaciones)
    ON fue.cierre_viaje TO tc_admin, tc_app;
GRANT UPDATE (chofer_responsable_id, motivo_chofer, programador_velocidad_pct, test_alcohol,
              km_manual, consumo_plataforma_manual_l, motivo_ajuste, tractor_no_imputable_l, tractor_no_imputable_ralenti_h,
              tractor_no_imputable_motivo, tractor_justificacion, mochila_no_imputable_l, mochila_no_imputable_motivo,
              mochila_justificacion, observaciones, eliminado_en, version_fila)
    ON fue.cierre_viaje TO tc_admin, tc_app;
GRANT USAGE ON SEQUENCE fue.seq_numero_cierre_viaje TO tc_admin, tc_app;
-- aprobacion_control_base: sin escritura directa (solo funciones)

-- Funciones que llaman los triggers (corren con el rol que escribe)
GRANT EXECUTE ON FUNCTION
    fue.fn_bloquear(bigint[],bigint[]), fue.fn_es_propietario(), fue.fn_fmt_ts(timestamptz),
    fue.fn_cerrado_camion(bigint,timestamptz), fue.fn_cerrado_deposito(bigint,timestamptz,boolean), fue.fn_exigir_abierto(text,text),
    fue.fn_deposito_base(bigint), fue.fn_ts_canonico(bigint), fue.fn_es_frontera(bigint,bigint),
    fue.fn_cierre_aprobado_entre(bigint,timestamptz,timestamptz), fue.fn_bloquear_carga(bigint), fue.fn_bloquear_operacion(uuid),
    fue.fn_exigir_carga_abierta(fue.carga_combustible),
    fue.fn_saldo_deposito(bigint,timestamptz), fue.fn_diferencia_control(bigint),
    fue.fn_carga_periodo(), fue.fn_carga_deposito_reglas(), fue.fn_carga_anular_original(), fue.fn_carga_movimientos(),
    fue.fn_carga_validar(), fue.fn_movimiento_reglas(), fue.fn_movimiento_estado(), fue.fn_transferencia_pareada(), fue.fn_movimiento_limites(),
    fue.fn_solicitud_reglas(), ref.fn_parametro_texto(text,text)
    TO tc_admin, tc_app, tc_etl;
GRANT EXECUTE ON FUNCTION fue.fn_control_reglas(), fue.fn_uso_mochila_reglas(), fue.fn_responsable_reglas(),
                          fue.fn_cierre_viaje_reglas(), fue.fn_contexto_viaje(bigint,bigint,timestamptz,timestamptz)
    TO tc_admin, tc_app;
GRANT EXECUTE ON FUNCTION fue.fn_deposito_reglas() TO tc_admin;

-- Operaciones (RPC)
GRANT EXECUTE ON FUNCTION
    fue.fn_transferir_combustible(bigint,bigint,numeric,timestamptz,bigint,text),
    fue.fn_pasar_a_tractor(bigint,numeric,timestamptz,bigint),
    fue.fn_movimiento_con_motivo(bigint,text,numeric,timestamptz,text,text,bigint),
    fue.fn_revertir_movimiento(bigint,text),
    fue.fn_solicitar_anulacion_carga(bigint,text), fue.fn_solicitar_reverso(bigint,text),
    fue.fn_resolver_solicitud(bigint,boolean,text), fue.fn_retirar_solicitud(bigint),
    fue.fn_resolver_movimiento(bigint,boolean,text),
    fue.fn_traspasar_responsable(bigint,bigint,timestamptz,numeric,text,text),
    fue.fn_aprobar_control_base(bigint,text,numeric,text), fue.fn_anular_aprobacion_base(bigint,text),
    fue.fn_aprobar_cierre(bigint,integer), fue.fn_anular_cierre(bigint,integer,text)
    TO tc_admin, tc_app;

-- Consultas (solo lectura)
GRANT EXECUTE ON FUNCTION
    fue.fn_hechos_viaje(bigint,bigint), fue.fn_telemetria_viaje(bigint,timestamptz,timestamptz),
    fue.fn_contexto_viaje(bigint,bigint,timestamptz,timestamptz), fue.fn_consumo_tractor(jsonb,jsonb,jsonb,jsonb),
    fue.fn_resultado_viaje(bigint,bigint,jsonb,jsonb,jsonb), fue.fn_resultado_cierre(bigint),
    fue.fn_calcular_cierre_viaje(bigint,bigint,bigint), fue.fn_verificar_cierre(bigint),
    fue.fn_saldo_deposito(bigint,timestamptz), fue.fn_diferencia_control(bigint),
    fue.fn_es_frontera(bigint,bigint), fue.fn_es_propietario(), fue.fn_fmt_ts(timestamptz),
    ref.fn_parametro_texto(text,text), ref.fn_parametro_num(text,numeric)
    TO tc_admin, tc_app, tc_lectura, tc_auditor;
-- La base muestra el nombre del responsable (seg.usuario): sin tc_lectura
GRANT EXECUTE ON FUNCTION fue.fn_resultado_control_base(bigint,text,numeric,text), fue.fn_verificar_control_base(bigint)
    TO tc_admin, tc_app, tc_auditor;

-- Supabase: ningún acceso directo para los roles de la API (entran por el SET ROLE del pre-request).
DO $$
DECLARE r text;
BEGIN
    FOREACH r IN ARRAY ARRAY['anon','authenticated'] LOOP
        CONTINUE WHEN NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r);
        EXECUTE format('REVOKE ALL ON fue.cierre_viaje, fue.v_cierre_viaje, fue.uso_mochila, fue.v_uso_mochila, fue.responsable_deposito, '
                       'fue.v_responsable_deposito, fue.solicitud_correccion, fue.v_solicitud_correccion, fue.aprobacion_control_base, '
                       'fue.v_aprobacion_control_base, fue.v_viaje, fue.v_saldo_deposito, fue.v_carga_combustible FROM %I', r);
        EXECUTE format('REVOKE ALL ON SEQUENCE fue.seq_numero_cierre_viaje FROM %I', r);
        EXECUTE format('REVOKE ALL ON ALL FUNCTIONS IN SCHEMA fue FROM %I', r);
    END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
