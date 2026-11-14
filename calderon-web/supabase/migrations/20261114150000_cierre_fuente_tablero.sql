-- =============================================================================
-- IronTrack — 270 · El cierre acepta el consumo tomado del tablero del camión
-- -----------------------------------------------------------------------------
-- Problema: cuando el consumo del viaje sale de la foto del tablero, el cálculo del cierre
-- lo marca con fuente «tablero». La tabla fue.cierre_viaje solo aceptaba «telemetria»,
-- «agregado_diario» o «manual», así que al aprobar (CV-000032) la base rechazaba el guardado
-- y la web mostraba «El dato no cumple una regla del sistema».
-- Arreglo: las dos reglas de fuente (km y consumo) aceptan también «tablero».
-- No cambia funciones ni datos. Se frena sola si las reglas no son las esperadas.
-- web.version_base = 270.
-- =============================================================================
SET search_path = public, extensions;
BEGIN;

DO $do$
DECLARE v_cons text; v_km text;
BEGIN
    SELECT pg_get_constraintdef(oid) INTO v_cons FROM pg_constraint
     WHERE conrelid = 'fue.cierre_viaje'::regclass AND conname = 'ck_cv_fuente_cons';
    SELECT pg_get_constraintdef(oid) INTO v_km FROM pg_constraint
     WHERE conrelid = 'fue.cierre_viaje'::regclass AND conname = 'ck_cv_fuente_km';
    IF v_cons IS NULL OR v_km IS NULL THEN
        RAISE EXCEPTION 'No están las reglas ck_cv_fuente_cons / ck_cv_fuente_km: avisar antes de seguir';
    END IF;
    IF v_cons LIKE '%tablero%' AND v_km LIKE '%tablero%' THEN
        RAISE EXCEPTION 'La migración 270 (fuente «tablero» en el cierre) ya está aplicada';
    END IF;
END $do$;

ALTER TABLE fue.cierre_viaje DROP CONSTRAINT ck_cv_fuente_cons;
ALTER TABLE fue.cierre_viaje ADD CONSTRAINT ck_cv_fuente_cons
    CHECK (fuente_consumo_plataforma IS NULL OR fuente_consumo_plataforma IN ('telemetria', 'agregado_diario', 'manual', 'tablero'));

ALTER TABLE fue.cierre_viaje DROP CONSTRAINT ck_cv_fuente_km;
ALTER TABLE fue.cierre_viaje ADD CONSTRAINT ck_cv_fuente_km
    CHECK (fuente_km IS NULL OR fuente_km IN ('telemetria', 'cargas', 'tramos', 'manual', 'tablero'));

UPDATE ref.parametro SET valor = '270' WHERE codigo = 'web.version_base' AND valor::text::int < 270;

COMMIT;

SELECT 'migración 270 aplicada' AS que, conname AS regla, pg_get_constraintdef(oid) AS definicion
  FROM pg_constraint
 WHERE conrelid = 'fue.cierre_viaje'::regclass AND conname IN ('ck_cv_fuente_cons', 'ck_cv_fuente_km');
