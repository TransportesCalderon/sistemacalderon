-- 11 · CONSULTA DE SOLO LECTURA (no cambia nada) · A1: quién maneja cada tractor
-- Sección A: por tractor, el chofer que da hoy cada una de las cinco reglas y el que daría la regla única.
-- Sección B: choferes de licencia o de baja que todavía tienen algo abierto.
-- Columna «resultado»: igual = las reglas de hoy ya dan lo mismo; completa un vacío = alguna pantalla hoy no muestra chofer
--   y pasaría a mostrarlo; CAMBIA = alguna pantalla hoy muestra otro chofer.
-- Cómo usarla: pegar todo en el SQL Editor de Supabase, Run, y descargar el resultado como CSV.
WITH nom AS (
    SELECT c.id, btrim(coalesce(c.apellido, '') || ' ' || coalesce(c.nombre, '')) AS nombre, c.estado
      FROM mae.chofer c
),
cam AS (
    SELECT c.id, c.patente FROM mae.camion c WHERE c.eliminado_en IS NULL AND c.fecha_baja IS NULL
),
viaje AS (   -- viaje de chofer abierto de cada tractor (el último)
    SELECT DISTINCT ON (v.camion_id) v.camion_id, v.id, v.numero, v.chofer_id
      FROM ops.viaje_chofer v
     WHERE v.estado = 'abierto' AND v.eliminado_en IS NULL
     ORDER BY v.camion_id, v.salida_ts DESC
),
tramo AS (   -- viaje de logística en curso de cada tractor, con su relevo abierto si lo hay
    SELECT DISTINCT ON (t.camion_id) t.camion_id,
           coalesce((SELECT tc.chofer_id FROM ops.tramo_chofer tc
                      WHERE tc.tramo_id = t.id AND tc.rol = 'conductor' AND tc.hasta_ts IS NULL AND tc.eliminado_en IS NULL
                      ORDER BY tc.desde_ts DESC LIMIT 1), t.chofer_id) AS chofer_id
      FROM ops.tramo_operativo t
     WHERE t.estado = 'en_curso' AND t.eliminado_en IS NULL
     ORDER BY t.camion_id, t.inicio_real DESC NULLS LAST
),
reglas AS (
    SELECT cam.id AS camion_id, cam.patente, viaje.numero AS viaje,
           fue.fn_chofer_actual(cam.id)                                   AS r_orden,
           tel.fn_chofer_actual(cam.id)                                   AS r_mapa,
           CASE WHEN viaje.id IS NOT NULL THEN tel.fn_chofer_ahora_viaje(viaje.id) END AS r_seguimiento,
           tel.fn_chofer_en(cam.id, now())                                AS r_alertas,
           mae.fn_chofer_de_tractor(cam.id)                               AS r_titular,
           tramo.chofer_id                                                AS n_tramo,
           viaje.chofer_id                                                AS n_viaje
      FROM cam
      LEFT JOIN viaje ON viaje.camion_id = cam.id
      LEFT JOIN tramo ON tramo.camion_id = cam.id
),
nueva AS (
    SELECT r.*,
           coalesce(r.n_tramo, r.n_viaje,
                    (SELECT n.id FROM nom n WHERE n.id = r.r_titular AND n.estado = 'activo')) AS r_nueva,
           CASE WHEN r.n_tramo IS NOT NULL THEN 'viaje de logística en curso'
                WHEN r.n_viaje IS NOT NULL THEN 'viaje de chofer abierto'
                WHEN r.r_titular IS NOT NULL THEN 'titular' ELSE 'sin datos' END AS origen
      FROM reglas r
),
pend AS (   -- lo que tiene abierto cada chofer que no está activo
    SELECT n.id, n.nombre, n.estado,
           (SELECT string_agg(c.patente || ' (' || a.tipo || ')', ', ' ORDER BY c.patente)
              FROM mae.asignacion_camion_chofer a JOIN mae.camion c ON c.id = a.camion_id
             WHERE a.chofer_id = n.id AND a.eliminado_en IS NULL AND a.vigente_desde <= current_date
               AND (a.vigente_hasta IS NULL OR a.vigente_hasta > current_date)) AS asignaciones,
           (SELECT count(*) FROM ops.tramo_chofer tc JOIN ops.tramo_operativo t ON t.id = tc.tramo_id
             WHERE tc.chofer_id = n.id AND tc.hasta_ts IS NULL AND tc.eliminado_en IS NULL
               AND t.estado IN ('planificado', 'en_curso') AND t.eliminado_en IS NULL) AS relevos,
           (SELECT count(*) FROM ops.tramo_operativo t
             WHERE t.chofer_id = n.id AND t.estado = 'planificado' AND t.eliminado_en IS NULL) AS planificados,
           (SELECT count(*) FROM ops.tramo_operativo t
             WHERE t.chofer_id = n.id AND t.estado = 'en_curso' AND t.eliminado_en IS NULL) AS en_curso,
           (SELECT count(*) FROM ops.viaje_chofer v
             WHERE v.chofer_id = n.id AND v.estado = 'abierto' AND v.eliminado_en IS NULL) AS viajes_chofer
      FROM nom n
      JOIN mae.chofer c ON c.id = n.id AND c.eliminado_en IS NULL
     WHERE n.estado IN ('licencia', 'baja')
)
SELECT 'A · por tractor' AS seccion, x.patente, x.viaje,
       (SELECT nombre FROM nom WHERE id = x.r_orden)       AS orden_de_carga,
       (SELECT nombre FROM nom WHERE id = x.r_mapa)        AS mapa_de_flota,
       (SELECT nombre FROM nom WHERE id = x.r_seguimiento) AS seguimiento,
       (SELECT nombre FROM nom WHERE id = x.r_alertas)     AS alertas,
       (SELECT nombre FROM nom WHERE id = x.r_titular)     AS titular,
       (SELECT nombre FROM nom WHERE id = x.r_nueva)       AS regla_unica,
       x.origen                                            AS sale_de,
       CASE WHEN x.r_nueva IS DISTINCT FROM coalesce(x.r_orden, x.r_nueva)
              OR x.r_nueva IS DISTINCT FROM coalesce(x.r_mapa, x.r_nueva)
              OR x.r_nueva IS DISTINCT FROM coalesce(x.r_seguimiento, x.r_nueva)
              OR x.r_nueva IS DISTINCT FROM coalesce(x.r_alertas, x.r_nueva) THEN 'CAMBIA'
            WHEN x.r_nueva IS NOT NULL AND (x.r_orden IS NULL OR x.r_mapa IS NULL OR x.r_alertas IS NULL) THEN 'completa un vacío'
            ELSE 'igual' END                               AS resultado,
       CASE WHEN x.r_titular IS NOT NULL AND x.r_nueva IS NULL THEN 'El titular no está activo y no hay viaje: quedaría sin conductor' END AS nota
  FROM nueva x
UNION ALL
SELECT 'B · chofer de ' || p.estado, NULL, NULL, NULL, NULL, NULL, NULL, p.nombre, NULL, NULL,
       CASE WHEN p.asignaciones IS NULL AND p.relevos + p.planificados + p.en_curso + p.viajes_chofer = 0 THEN 'sin pendientes'
            WHEN p.estado = 'baja' THEN 'FRENARÍA LA BAJA' ELSE 'advertencia' END,
       concat_ws(' · ',
           'tractores: ' || p.asignaciones,
           CASE WHEN p.relevos > 0 THEN p.relevos || ' relevo(s) abierto(s)' END,
           CASE WHEN p.planificados > 0 THEN p.planificados || ' viaje(s) planificado(s)' END,
           CASE WHEN p.en_curso > 0 THEN p.en_curso || ' viaje(s) en curso' END,
           CASE WHEN p.viajes_chofer > 0 THEN p.viajes_chofer || ' viaje(s) de chofer abierto(s)' END)
  FROM pend p
 ORDER BY 1, 2 NULLS LAST, 8;
