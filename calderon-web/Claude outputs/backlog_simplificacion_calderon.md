# Backlog de simplificación · Sistema Calderón (IronTrack)

13/11/2026 · Convierte la auditoría de complejidad aprobada en trabajo ejecutable. No agrega análisis ni propuestas nuevas.

**Estado: aprobado por Operaciones el 13/11/2026**, con estos ajustes ya incorporados: Permisos (A2) se divide en inventario y migración; el roadmap pasa a cinco sprints (S4 = Permisos, S5 = mochila y compatibilidad heredada); A1 suma la regla de baja y licencia del chofer; A3 conserva la distinción entre tanques, mochila y total.

## Decisiones que este plan respeta

1. Asignar viajes queda en Operaciones y en Pizarra Azul (misma lógica).
2. Alertas queda separada de Hoy.
3. Los tres tipos de viaje quedan. No se fusionan: comparten fuentes de verdad.
4. Pedido y orden de combustible pueden tener valores distintos (recomendación y decisión).
5. Pedido vs. orden es solo de interfaz: qué es cada número, recomendación y decisión, y la diferencia cuando exista.

## Qué está verificado y qué no

- **Verificado en la base** (export del 12/11 más las migraciones 259 a 261): todas las listas de funciones, tablas, triggers y quién llama a quién.
- **Sin verificar:** el menú (`navigation.ts`), la matriz de permisos (`matriz.ts`) y el contenido de las pantallas marcadas en la Fase C. La conexión con la carpeta del repo sigue caída. Donde hace falta leerlos, figura como primer paso del ítem.
- **Tiempos:** son estimaciones en jornadas de trabajo conmigo (armar, probar en la base local, entregar). No incluyen el tiempo de aplicar en Supabase y subir a GitHub.

---

## Fase A · Fuentes de verdad

### A1 · Quién maneja el tractor

- **Fuente de verdad definitiva:** el viaje en curso con sus relevos (`ops.tramo_operativo` más `ops.tramo_chofer`). Si no hay viaje de logística en curso, el viaje del chofer vigente (`ops.viaje_chofer`). Si tampoco, el chofer titular (`mae.asignacion_camion_chofer`). La tarjeta de la telemetría deja de decidir: queda como señal para avisar cuando no coincide.
- **Hoy hay cinco reglas distintas:**

| Función | Regla actual | Quién la usa |
|---|---|---|
| `fue.fn_chofer_actual(camion)` | El de la Pizarra (`ops.fn_datos_salida`) | Orden de carga (preparar y crear) |
| `tel.fn_chofer_actual(camion)` | Tarjeta de las últimas 12 h; si no, cualquier asignación vigente | Mapa de flota |
| `tel.fn_chofer_ahora_viaje(viaje)` | Tarjeta; si no, conductor del tramo en curso; si no, asignación posterior a la salida; si no, el del viaje | Seguimiento y solicitudes de carga |
| `tel.fn_chofer_en(camion, momento, externo)` | Conductor externo; si no, viaje del chofer en ese momento; si no, titular | Alertas, cargas imposibles, patrones de estación, lecturas |
| `mae.fn_chofer_de_tractor(camion, fecha)` | Titular a esa fecha | Contexto de viaje y genset, salidas, tanque bajo |

- **Funciones que sobreviven:**
  - `tel.fn_chofer_en(camion, momento)`, reescrita con la precedencia definitiva. Es la única que responde «quién maneja».
  - `mae.fn_chofer_de_tractor`: responde otra pregunta (quién es el titular) y la usa la anterior.
  - `ops.fn_chofer_de_carga`: es propia de la carga y ya se apoya en `tel.fn_chofer_en`.
  - `ops.fn_mi_chofer` y `ops.fn_chofer_libre`: no responden «quién maneja» (son «mi usuario» y una validación).
- **Funciones que quedan obsoletas:** `fue.fn_chofer_actual`, `tel.fn_chofer_actual` y `tel.fn_chofer_ahora_viaje`. Primero quedan como envoltorio de una línea que llama a la definitiva; se borran cuando ninguna función las nombre.
- **Qué no cambia (confirmado con Operaciones el 13/11):**
  - `mae.asignacion_camion_chofer` sigue siendo la asignación titular (y de relevo), con su vigencia y un solo titular por tractor.
  - El cambio de titular sigue en Flota › Asignaciones, con `mae.fn_asignar_tractor`, que queda igual.
  - La función unificada solo responde quién conduce en un momento dado. Lee la asignación titular como último recurso y nunca escribe en ella. «Quién es el titular» lo sigue respondiendo `mae.fn_chofer_de_tractor`.
  - Cuando cae en el titular, solo lo devuelve si el chofer está activo. Si está de licencia o de baja y no hay viaje ni relevo, responde «sin conductor».
- **Baja y licencia del chofer (decisión de Operaciones del 13/11; se suma a este ítem):**
  - **Hoy:** pasar un chofer a baja o licencia no controla nada y la asignación queda vigente. Eliminar un chofer frena por viajes planificados o en curso y por usuario activo, pero cierra la asignación sola.
  - **Baja:** bloquea si el chofer tiene asignaciones vigentes (titular o relevo), relevos abiertos en un viaje, viajes planificados o viajes en curso. El mensaje dice qué resolver y dónde. Recién con todo resuelto se guarda la baja. Eliminar un chofer pasa a frenar igual, en vez de cerrar la asignación sola.
  - **Licencia:** no bloquea. Muestra una advertencia si tiene asignaciones vigentes o viajes. El titular queda asignado al tractor. El conductor real sigue saliendo de la operación y los relevos.
  - **Cómo se hace:** una función nueva, `mae.fn_chofer_pendientes(chofer)`, lista lo que tiene abierto. Un trigger en `mae.chofer` la usa para frenar la baja; la ficha del chofer la usa para mostrar la advertencia de la licencia; `mae.fn_eliminar_chofer` la usa en lugar de su control actual.
- **Pantallas afectadas:** Órdenes de carga (chofer sugerido), Seguimiento de viajes (chofer y el aviso «el viaje lo empezó X»), mapa de flota, solicitudes de carga pendientes y la ficha del chofer en Flota › Choferes (baja y licencia).
- **Migraciones:** una. Reescribe `tel.fn_chofer_en`, convierte las tres obsoletas en envoltorios y agrega `mae.fn_chofer_pendientes` con el trigger de baja. Sin cambios de tablas.
- **Riesgo de regresión:** medio. Donde hoy manda la tarjeta, puede cambiar el nombre que se muestra si el viaje no está actualizado. Se mitiga manteniendo el aviso de discrepancia en Seguimiento. La verificación compara, sobre los viajes reales en curso, el chofer de antes y el de después, y lista las diferencias antes de guardar. También lista los choferes que hoy ya están de baja con asignación vigente, para resolverlos antes de activar el bloqueo.
- **Orden de implementación:** primero de la Fase A. No depende de nada y A2 a A5 no dependen de él.
- **Tiempo estimado:** 3 jornadas (2 de la regla única y 1 de baja y licencia).

### A2 · Permisos

- **Fuente de verdad definitiva:** la base. La web deja de repetir reglas y pregunta.
- **Estado actual:**
  - 76 funciones con listas de roles escritas a mano, en 37 combinaciones distintas. Las más repetidas: Gerencia+TI (6), Telemetría+TI (6), Adm. combustible+TI (5).
  - 40 funciones de ayuda del tipo «exigir» o «puedo», una familia por módulo (`fin.fn_exigir_finanzas`, `fue.fn_exigir_autoriza_cargas`, `ven.fn_exigir`, `mae.fn_exigir_mant`, etc.).
  - 7 marcas por usuario, con sus funciones `seg.fn_marcar_*` y sus listas.
  - La matriz de la web (`matriz.ts`), sin leer todavía.
- **Funciones que sobreviven:**
  - Una tabla nueva `seg.permiso_rol` (permiso, rol) y dos funciones: `seg.fn_puede(permiso)` y `seg.fn_exigir(permiso)`.
  - `seg.fn_mis_permisos()`, que le entrega a la web la lista de lo que el usuario puede.
  - Las marcas por usuario quedan como están: son permisos por persona, no por rol.
  - `seg.fn_exigir_ti`, `ops.fn_exigir_mi_chofer` y las «exigir» que no son de rol (`fue.fn_exigir_abierto`, `fue.fn_exigir_carga_abierta`, `ops.fn_exigir_cierres_al_dia`).
- **Funciones que quedan obsoletas:** las listas escritas a mano dentro de las 76 funciones y las «exigir» por módulo que solo comparan roles. Pasan a llamar a `seg.fn_exigir`.
- **Pantallas afectadas:** todas las que muestran u ocultan botones por permiso. En la web cambia `useCan` y la matriz; las pantallas no se tocan una por una.
- **Se hace en dos etapas. La segunda no empieza sin el mapa completo aprobado.**
- **Etapa 1 · Inventario y validación (solo lectura, no cambia nada):**
  - Leer `matriz.ts` y listar cada permiso de la web con los roles que lo tienen.
  - Listar, función por función, qué roles y qué marcas exige la base (las 76 con listas a mano y las 40 de ayuda).
  - Cruzar los dos lados en una tabla: permiso o acción, quién puede según la web, quién puede según la base, y si coinciden.
  - Entregable: el mapa completo y la lista de diferencias, cada una con su caso (la web muestra y la base rechaza, o la base deja y la web oculta). Vos decidís cuál vale en cada diferencia.
  - Tiempo estimado: 2 jornadas, con el repo conectado.
- **Etapa 2 · Migración (después, con el mapa aprobado):**
  1. Crear `seg.permiso_rol` y las tres funciones, y cargarla con el mapa aprobado. Nada la usa todavía.
  2. Reemplazar las listas a mano por `seg.fn_exigir`, un módulo por migración (Combustible, Finanzas, Flota, Telemetría, Alertas, resto).
  3. La web lee `seg.fn_mis_permisos()` y se retira la matriz.
  - Tiempo estimado: 6 a 8 jornadas (1 para el paso 1, 4 a 5 para el paso 2, 2 para el paso 3).
- **Riesgo de regresión:** alto en la etapa 2. Un permiso mal copiado deja a alguien sin poder trabajar o habilita de más. La verificación de cada paso compara, para cada rol y cada función tocada, si antes podía y si ahora puede; tiene que dar cero diferencias fuera de las que hayas aprobado cambiar. La etapa 1 no tiene riesgo.
- **Orden de implementación:** la etapa 1 puede hacerse en cuanto esté el repo; la etapa 2 es lo último de la Fase A.

### A3 · Capacidad de tanques y mochila (modificado y aprobado el 13/11)

- **Regla operativa que se conserva:** tanques completos no es lo mismo que camión completamente lleno. Normalmente se llenan los tanques y lo que falta es de la mochila.
- **Fuente de verdad definitiva:** los tanques del camión (`mae.tanque_combustible`), con su tipo (principal, secundario, mochila) y su vigencia. De ahí salen las tres capacidades: de tanques, de mochila y total. No se vuelve al modelo de mochila como depósito.
- **Datos reales (consulta del 13/11):**
  - Los 19 camiones tienen entre 650 y 830 L de tanques y 720 L de mochila (780 L el Volvo), cargada como tanque de tipo mochila. Total: 1.430 a 1.550 L. El detalle por camión está en la condición de aceptación.
  - Queda confirmado el problema del pedido de carga: toma la capacidad total como si fuera la de tanques.
  - De 22 cargas con faltante, 20 dicen que faltó en la mochila. Dos no cumplen la regla: la carga 88 (20 L en el tanque principal) y la carga 91 (20 L en el principal y 169 L en la mochila). Por eso la parte de mochila se guarda como dato y no se calcula.
- **Qué se hace:**
  1. **Una sola función de capacidad con tres números.** `fue.fn_capacidad_camion(camión, momento)` devuelve tanques, mochila y total, de las mismas filas de `mae.tanque_combustible`. `fue.fn_capacidad_mochila` pasa a leer de ella.
  2. **Cada función usa el número que le corresponde** (tabla de abajo). Ninguna vuelve a tratar el total como tanques.
  3. **El faltante lleva su parte de mochila, guardada.** Columna nueva en la carga (`faltante_mochila_l`). El faltante de tanques es la diferencia con el total. Al cargar se propone por la regla (todo a la mochila, hasta su capacidad) y se puede corregir. La base valida que la parte de mochila no supere el faltante ni la capacidad de la mochila.
  4. **El combustible actual devuelve tanques y mochila** con la regla «tanques llenos primero, el resto en la mochila». En pantalla va marcado como estimado.
  5. **El cierre y el acta muestran el faltante separado** en tanques y mochila, tomado de las cargas de salida y llegada.
  6. **Cargas ya registradas:** las 22 con faltante se completan por la regla, salvo la 88 (0 de mochila) y la 91 (169 de mochila). La 126 (RRVF47, 220 L) faltó en la mochila, confirmado por Operaciones el 13/11: cumple la regla. Va como corrección de datos con simulación.
- **Quién necesita qué:**

| Función | Pantalla | Necesita |
|---|---|---|
| `fue.fn_preparar_orden_carga`, `fue.fn_detalle_orden`, `fue.fn_crear_orden_carga` | Órdenes de carga | Tanques, mochila y total |
| `tel.fn_preparar_pedido_carga`, `tel.fn_pedir_carga` | Seguimiento › Solicitar carga y el mensaje | Tanques y mochila por separado |
| `fue.fn_combustible_actual` | Mapa de flota, Pizarra, órdenes, pedido | Total para el cálculo; tanques y mochila para mostrar |
| `fue.fn_estimar_llenado` | «Para quedar lleno» de la orden | Total, con el detalle de tanques y mochila |
| `fue.fn_carga_faltante`, `fue.fn_editar_carga` | Ficha de la carga y Editar | Total, y mochila para validar su parte |
| `fue.fn_registrar_carga_orden` | Órdenes por registrar | Faltante con su parte de mochila |
| `fue.fn_revisar_carga_imposible` | Alerta de carga que no entra | Total |
| `fue.fn_tanque_cierre`, `fue.fn_hechos_viaje`, `fue.fn_aprobar_cierre`, `fue.fn_resultado_viaje` | Cierre de viaje | Total para el balance; faltante con su parte de mochila |
| `fue.fn_acta_cierre` | Acta del cierre | Las tres, para decir dónde faltó |
| `tel.fn_mapa_flota`, `tel.fn_actualizar_resumen_camiones`, `fue.fn_revisar_combustible_actual` | Mapa y resumen de camiones | Total, y tanques y mochila si se muestran |

- **No cambian:** `mae.fn_capacidad_sensor` y el aviso de tanque bajo (es el tanque que mide el sensor); `fue.fn_carga_validar`, `fue.fn_contexto_viaje` y `mae.fn_cambiar_capacidad_tanque` (leen los tanques directo); `fue.fn_litros_pendientes` (autonomía: no usa capacidad).
- **Función que queda obsoleta:** `mae.fn_capacidad_camion(camión, fecha)` y la vista `mae.v_capacidad_camion`. Sus tres llamadores pasan a la función única.
- **Pantallas afectadas:** Órdenes de carga, Solicitar carga, ficha de la carga y Editar, Órdenes por registrar, mapa de flota y Pizarra, cierre de viaje y acta.
- **Migraciones:** dos. La primera, la función única y sus llamadores, sin cambios de tablas. La segunda, la columna del faltante de mochila, con su validación, las pantallas y la corrección de las cargas ya registradas.
- **Riesgo de regresión:** medio. Cambia lo que el pedido muestra como tanques y mochila, que hoy está mal repartido.
- **Condición de aceptación (pedida por Operaciones el 13/11):** la verificación compara camión por camión, en especial los Renault de 1.420 a 1.550 L, y no se da por buena hasta que los litros de tanques y de mochila queden repartidos exactamente como opera Calderón hoy.
  1. **Antes de escribir la migración:** Operaciones revisa la lista de capacidades cargadas hoy (consulta `09_consulta_capacidades_por_camion.sql`) y corrige en Flota lo que no coincida con el camión real.
     - **Hecho el 13/11: Operaciones confirmó que las capacidades cargadas están correctas.** Lista «antes» (litros útiles, 19 camiones): Renault (13) 830 de tanques + 720 de mochila = 1.550, con GCSC92 en 520 + 310 y los otros 12 en 510 + 320; Mercedes (3) 730 (400 + 330) + 720 = 1.450; Scania (2) 800 (400 + 400) + 720 = 1.520; Volvo SHXB49 650 (400 + 250) + 780 = 1.430. La mochila de 720 L útiles tiene 750 L nominales; todo se calcula con los útiles. En los 19 el pedido toma hoy la mochila como tanque. La verificación tiene que dar exactamente estos números.
  2. **En la verificación:** por cada camión, las tres capacidades antes y después; el total no cambia en ninguno; tanques + mochila = total; el pedido deja de tomar la mochila como tanque.
  3. **Con casos reales:** el pedido y el combustible actual de cada camión con viaje en curso, antes y después, y los faltantes de los cierres abiertos.
  4. Cualquier camión que no cierre frena la migración hasta resolverlo.
- **Dependencia:** el retiro del modelo anterior de mochila (D2, en S5) se hace después de este cambio.
- **Orden de implementación:** tercero.
- **Tiempo estimado:** 3,5 jornadas (1,5 la función única y 2 el faltante con su parte de mochila).

### A4 · Consumo objetivo

- **Fuente de verdad definitiva:** la regla por tramo, que ya es la misma en los dos lugares: tramo vacío usa el parámetro de vacío; contenedor vacío usa el suyo; cargado usa el objetivo de la línea. La auditoría lo tenía «a confirmar»: está confirmado.
- **Problema real:** la regla está escrita dos veces, en `tel.fn_objetivo_viaje` (Seguimiento) y en `fue.fn_objetivo_cierre` (cierre y acta). Si se cambia una y no la otra, un viaje puede dar bien en ruta y mal en el cierre.
- **Funciones que sobreviven:**
  - Una función nueva chica, `fue.fn_objetivo_tramo(operación, línea)`, con la regla.
  - `tel.fn_objetivo_viaje` y `fue.fn_objetivo_cierre`, que pasan a llamarla. El cierre conserva lo suyo: los km sin tramo cuentan como vacío.
- **Funciones que quedan obsoletas:** ninguna. Se elimina la regla repetida, no una función.
- **Fuera de alcance:** el consumo de referencia del camión (`mae.camion.consumo_referencia_l_100km`) responde otra pregunta y lo usan las alertas y los litros sugeridos. El consumo por defecto de la orden solo se usa para estimar el llenado. No se tocan.
- **Pantallas afectadas:** Seguimiento de viajes, cierre de viaje y acta. Sin cambios visibles.
- **Migraciones:** una. Sin cambios de tablas.
- **Riesgo de regresión:** bajo. La verificación recalcula el objetivo de los viajes en curso y de los últimos cierres, y tiene que dar igual que antes.
- **Orden de implementación:** segundo.
- **Tiempo estimado:** 1 jornada.

### A5 · Clientes

- **Fuente de verdad definitiva:** `mae.cliente`. Los datos de Ventas (`ven.cliente_detalle`, `ven.cliente_sii`) ya cuelgan del cliente por su clave y quedan así.
- **Estado actual:**
  - Un cliente nace por tres caminos: Comercial › Clientes, pasar un prospecto a cliente (`ven.fn_hacer_cliente`) y el importador Redline (`ops.fn_importar_redline`), que crea clientes por código y un cliente genérico «sin cliente».
  - Hay un espejo automático: cada cliente genera su empresa en Ventas (`ven.fn_espejo_cliente`, trigger en `mae.cliente`).
- **Funciones que sobreviven:** `ven.fn_hacer_cliente`, `ven.fn_espejo_cliente`, `ven.fn_guardar_detalle_cliente`.
- **Función nueva:** `mae.fn_crear_cliente(datos)`, única puerta de alta, con el control de parecidos (nombre e identificador fiscal).
- **Qué queda obsoleto:** las altas directas. El `INSERT` de `ven.fn_hacer_cliente` y los dos del importador pasan a llamar a la puerta única, igual que el alta desde la web.
- **Pantallas afectadas:** Comercial › Clientes (alta), Ventas › Empresas (pasar a cliente), importación Redline. Las pantallas de clientes bajo Cotizaciones se resuelven en la Fase C.
- **Migraciones:** una para la función y los tres llamadores. Antes, una consulta de solo lectura que liste los clientes ya duplicados, para que decidas cuáles unir. Unirlos es una corrección de datos aparte, con simulación.
- **Riesgo de regresión:** medio. El importador Redline puede empezar a rechazar altas que hoy pasan; se define que en la importación el parecido avise y no frene.
- **Orden de implementación:** cuarto.
- **Tiempo estimado:** 2 jornadas, sin contar la unión de duplicados.

### Orden de la Fase A

1. A1 Chofer del tractor.
2. A4 Consumo objetivo.
3. A3 Capacidad de tanques.
4. A5 Clientes.
5. A2 Permisos.

---

## Fase B · Limpieza rápida

### B1 · Mensajes de la base que apuntan a menús viejos

- **Funciones afectadas (36):**
  - Finanzas: `fin.fn_calculo_legal`, `fin.fn_contabilizar_carga`, `fin.fn_guardar_cuenta_contable`, `fin.fn_preparar_liquidacion`, `fin.fn_resolver_pedido_fondo`, `fin.fn_tc_clp`, `fin.tg_carga_eliminada`.
  - Combustible: `fue.fn_carga_cotizacion_del_dia`, `fue.fn_carga_faltante`, `fue.fn_combustible_actual`, `fue.fn_cotizacion_para_carga`, `fue.fn_detalle_orden`, `fue.fn_estimar_llenado`, `fue.fn_exigir_aprobador_cierre`, `fue.fn_exigir_autoriza_cargas`, `fue.fn_mis_pendientes`, `fue.fn_ralenti_solo_funciones`, `fue.fn_revisar_combustible_actual`, `fue.fn_tanque_cierre`.
  - Operación y flota: `mae.fn_eliminar_chofer`, `mae.fn_ingreso_compra`, `ops.fn_asignar_equipo`, `ops.fn_continuar_operacion`, `ops.fn_exigir_mi_chofer`, `ops.fn_iniciar_viaje_chofer`, `ops.fn_servicio_hito_reglas`.
  - Ventas: `ven.fn_anular_factura`, `ven.fn_cobrar_factura`, `ven.fn_costo_viaje`, `ven.fn_emitir_sii`, `ven.fn_nota_credito_sii`, `ven.fn_sii_vista_previa`.
  - Otros: `ia.fn_carga_detalle`, `ref.fn_exigir_tipo_carga`, `seg.fn_lo_mio_de_hoy`, `tel.fn_evaluar_seguimiento`.
- **Textos que no coinciden entre sí:** «Ajustes › Usuarios» y «Configuración › Usuarios»; «Ajustes › Líneas» y «Datos › Líneas»; «Finanzas › Tipos de cambio», «Finanzas › Monedas y tipos de cambio» y «Configuración › Monedas»; «Flota > Camiones» y «Flota › Camiones».
- **Archivos afectados:** una migración. La web no cambia.
- **Cómo se hace:** la migración lee cada función de la base y reemplaza solo el texto del menú. Si un texto no aparece la cantidad de veces esperada, frena.
- **Primer paso obligatorio:** leer el menú real para saber el nombre vigente de cada destino.
- **Complejidad:** baja. **Tiempo estimado:** 1 jornada.

### B2 · Compuertas de versión ya cumplidas

- **Qué son:** controles del tipo «¿la base ya tiene el cambio N?». La base está en 261, así que todos los menores dan siempre que sí.
- **Archivos afectados conocidos (24 controles en los 70 archivos que tengo):**
  - `telemetria/components/seguimiento-viajes.tsx` y `pedido-carga.tsx` (194, 195, 197, 240, 259).
  - `combustible/components/ordenes/ordenes-carga.tsx` y `ordenes-por-registrar.tsx` (234, 247, 252, 253, 259).
  - `pizarra/components/tabla-pizarra.tsx` y `desenganche.tsx` (184, 261).
  - `logistica/components/operaciones-pantalla.tsx` (118, 166, 172, 173, 174, 176).
  - `chofer/components/mi-viaje.tsx` (161), `flota/components/choferes/foto-chofer.tsx` (239, 246), más los de consumo aprendido (223) y aprobación cruzada (170).
- **Primer paso obligatorio:** buscar el resto en todo el repo; son 613 archivos y solo vi 70.
- **Funciones afectadas:** ninguna de la base. Queda `ref.fn_version_base` para los cambios futuros.
- **Regla:** se quita la compuerta y el camino «todavía no está aplicado». Las constantes `VERSION_*` que queden sin uso se borran. Se dejan las del último cambio entregado, por si no se aplicó.
- **Complejidad:** baja, mecánica. **Tiempo estimado:** 1 a 2 jornadas, según cuántas aparezcan.

### B3 · Observadas y Sin documento como filtros

- **Archivos afectados:**
  - `app/(app)/combustible/observadas/page.tsx` y `app/(app)/combustible/sin-documento/page.tsx`: pasan a redirigir a Cargas con el filtro puesto.
  - `combustible/components/cargas/cargas-lista.tsx` y `combustible/domain/carga.lista.ts`: suman los dos filtros.
  - `combustible/components/cargas/bandejas.tsx` y las pestañas de Cargas (`shared/ui/pestanas-secciones.ts`), si hoy las listan.
  - El menú y `tests/rutas.snapshot.json`: este último no lo piso; te aviso qué línea cambia.
- **Funciones afectadas:** ninguna nueva si la lista de cargas ya filtra por estado de validación y por «tiene documento». Hay que leer el repositorio de cargas para confirmarlo.
- **Complejidad:** baja a media. **Tiempo estimado:** 1 jornada.

### B4 · Un solo aviso al teléfono

- **Funciones afectadas:**
  - Nueva: `ops.fn_avisar(usuarios, clave, título, cuerpo, url, urgente)`.
  - `fin.fn_avisar_fondo` y `tel.fn_avisar_pedido_carga`: quedan como envoltorio y después se borran.
  - Llamadores: `fin.fn_pedir_fondo`, `fin.fn_resolver_pedido_fondo`, `fin.fn_depositar_pedido_fondo`, `tel.fn_pedir_carga`, `fue.fn_aprobar_solicitud_carga`, `fue.fn_rechazar_solicitud_carga`.
  - `fin.fn_subir_gasto_verificado`: inserta el aviso a mano; pasa a la función nueva.
- **No se toca:** `ops.fn_push_generar` (los avisos que se buscan cada tanto) ni `ops.fn_enviar_push` (el envío). Son otra parte del mismo circuito, no un duplicado.
- **Archivos afectados:** una migración. La web no cambia.
- **Complejidad:** baja. **Tiempo estimado:** media jornada.

### B5 · Orden de camión y orden de genset

- **Funciones afectadas:**
  - Nueva: `fue.fn_mail_orden(orden)`, que arma el mail a la estación para los dos casos (incluida la fila «Combustible» del cambio 250).
  - `fue.fn_crear_orden_carga` y `fue.fn_crear_orden_genset`: dejan de tener el mail copiado y llaman a la nueva.
  - `fue.fn_preparar_orden_carga` y `fue.fn_preparar_orden_genset`: se revisa qué comparten (correo de la estación, orden vigente, estado del mail) y eso pasa a una función común.
- **Alcance:** se unifica lo repetido (mail y datos de la estación). No se funden las dos órdenes en una función: las validaciones de camión y de genset son distintas de verdad.
- **Archivos afectados:** una migración. En la web, `ordenes-carga.tsx` solo si cambia la forma de lo que devuelve «preparar»; la intención es que no cambie.
- **Complejidad:** media. **Tiempo estimado:** 1,5 jornadas.

---

## Fase C · Navegación

No se elimina nada todavía. La tabla marca la **propuesta** con lo que hoy se sabe. El primer trabajo es leer cada página y el menú para confirmar qué está vivo; sin eso, ninguna fila es definitiva.

Evidencia que ya tengo:

- La base nombra en sus mensajes «Liquidaciones › Tarifas», «Liquidaciones › Datos legales» y «Ventas › Tarifas». Eso indica que Liquidaciones y Ventas son los menús vigentes, y que `/rrhh/*` y `/cotizaciones/*` serían los anteriores.
- El código de Mi viaje dice que junta Mi carga, Mis gastos, Mis liquidaciones y Tablero.
- Las acciones de la Pizarra refrescan tanto `/pizarra` como `/flota/pizarra`: las dos rutas todavía se consideran.
- Existe un test de redirecciones y una página comodín para rutas viejas.

| Pantalla | Mantener | Fusionar | Redirigir | Eliminar | Motivo |
|---|---|---|---|---|---|
| Combustible › Observadas | | En Cargas, como filtro | Sí, a Cargas con el filtro | | Es un filtro de la misma lista (B3) |
| Combustible › Sin documento | | En Cargas, como filtro | Sí, a Cargas con el filtro | | Es un filtro de la misma lista (B3) |
| Combustible › Viajes | A confirmar | Con Cierres, si solo lista viajes entre cortes | Si se fusiona | | Hay que leerla: puede ser la entrada para crear cierres |
| Combustible › Costo medio | A confirmar | | | Si la pantalla no muestra nada útil | Su tabla no la usa ninguna función; hay que ver de dónde lee |
| Operación › Tractores | | Con Viajes de chofer, como pestaña | Sí | | Dos vistas del mismo viaje del chofer |
| Operación › Viajes de chofer | Sí | Recibe a Tractores | | | Queda como pantalla del viaje del chofer |
| Telemetría › Datos | Sí, reubicada | | Sí, a Configuración | | Diagnóstico de TI, no trabajo diario |
| Telemetría › Equipos | Sí, reubicada | | Sí, a Configuración | | Diagnóstico de TI |
| Telemetría › Choferes | A confirmar | | | | Hay que leerla: puede ser el enlace de choferes con la telemetría |
| Flota › Accesorios | | En Semirremolques o en Catálogos, como pestaña | Sí | | Catálogo chico que se edita desde la Pizarra |
| Flota › Asignaciones | Sí | | | | Es donde se carga el chofer titular (A1) |
| Configuración › Monedas | | Con Finanzas › Tipos de cambio | Sí | | Dos entradas para el mismo tema |
| Finanzas › Tipos de cambio | Sí | Recibe a Monedas | | | Queda como única entrada |
| Ajustes › Parámetros › Tipos de carga | | En Configuración › Catálogos | Sí | | Catálogo suelto bajo otro menú |
| `/flota/pizarra` | | | Sí, a `/pizarra` | Después de un tiempo | La Pizarra ya es menú propio |
| `/cotizaciones` y `/cotizaciones/[id]` | | | Sí, a Ventas › Cotizaciones | Después de un tiempo | Ventas sería la vigente (a confirmar) |
| `/cotizaciones/tarifas` | | | Sí, a Ventas › Tarifas | Después de un tiempo | Ídem |
| `/cotizaciones/clientes` y `/cotizaciones/datos-clientes` | A confirmar | Con Ventas › Empresas | Si se fusiona | | Hay que ver si los datos de cotización del cliente tienen otra entrada |
| `/chofer`, `/chofer/gastos`, `/chofer/liquidaciones`, `/chofer/tablero` | | | Sí, a Mi viaje | Después de un tiempo | Mi viaje las junta (a confirmar que no queda nada solo ahí) |
| `/inicio` | A confirmar | | Si Hoy es la entrada | | Es la página más grande de las tres; hay que leerla |
| `/pendientes` | | | Sí, a Hoy | Después de un tiempo | Hoy es el trabajo pendiente (decisión 2) |
| `/conciliacion`, `/conciliacion/[id]`, `/conciliacion/cambios` | A confirmar | | | | Hay que ver cuál de las dos conciliaciones es la viva |
| `/combustible/conciliacion` | A confirmar | | | | Ídem |
| `/rrhh/liquidacion`, `/rrhh/liquidaciones`, `/rrhh/fondos`, `/rrhh/tarifas`, `/rrhh/datos-legales` | | | Sí, a Liquidaciones | Después de un tiempo | Liquidaciones sería la vigente (a confirmar) |
| `/liquidaciones`, `/liquidaciones/fondos`, `/liquidaciones/resumen` | Sí | | | | Es el nombre que usa la base en sus mensajes |

**Cómo se cierra esta fase**

1. Leer las 30 páginas de la tabla, el menú y el archivo de redirecciones. Media jornada con el repo conectado.
2. Te devuelvo la tabla sin ningún «a confirmar».
3. Con tu OK, se arman las redirecciones. Borrar páginas queda para un cambio posterior.

---

## Fase D · Compatibilidad heredada

### D1 · Compuertas de versión

- **Qué depende de ellas:** nada. Solo eligen entre la pantalla nueva y un cartel de «falta aplicar».
- **¿Se puede retirar hoy?** Sí, todas las menores a 261.
- **¿Requiere migración?** No. Es solo web (ver B2).
- **Riesgo:** bajo.

### D2 · Modelo anterior de mochila

- **Qué es:** la mochila como depósito (`fue.deposito_combustible` de tipo mochila), anterior a la mochila como tanque del camión.
- **Qué depende de él (13 funciones):** `fue.fn_combustible_actual`, `tel.fn_preparar_pedido_carga`, `fue.fn_hechos_viaje`, `fue.fn_editar_carga`, `fue.fn_carga_deposito_reglas`, `fue.fn_carga_periodo`, `fue.fn_cargas_estacion_incidentes`, `fue.fn_control_reglas`, `fue.fn_deposito_reglas`, `fue.fn_movimiento_reglas`, `fue.fn_uso_mochila_reglas`, `fue.fn_mochila_obsoleta` y la vista `fue.v_uso_mochila`. También los cierres con el cálculo de la versión 1.
- **No confundir:** el depósito como tabla sigue vivo para el tanque de base. Solo el tipo mochila es heredado.
- **¿Se puede retirar hoy?** No. Primero hay que saber si queda alguna mochila-depósito vigente o con saldo, y si hay cierres abiertos que la usen. Es una consulta de solo lectura.
- **¿Requiere migración?** Sí, dos: una que saque las ramas de mochila-depósito de las funciones vivas (combustible actual, pedido, hechos del viaje) y otra que retire las reglas y la vista. Los datos históricos quedan.
- **Riesgo:** medio. `fue.fn_combustible_actual` es la fuente del combustible del camión.

### D3 · Liquidación antigua

- **Qué es:** `fin.liquidacion_chofer`, `fin.liquidacion_detalle`, `ops.tramo_liquidable`, `ops.tramo_liquidable_tramo` y sus vistas (`fin.v_liquidacion_chofer`, `fin.v_liquidacion_detalle`, `ops.v_tramo_liquidable`, `ops.v_tramo_liquidable_tramo`).
- **Qué depende de ella:**
  - Un trigger en `fin.liquidacion_detalle` (`tg_50_sincronizar`) que mantiene `fin.liquidacion_chofer`.
  - `ops.fn_volver_paso`, que nombra `ops.tramo_liquidable`.
  - Ninguna otra función escribe en estas tablas. La liquidación vigente (`fin.liquidacion_mensual`) tiene sus 7 funciones propias.
- **¿Se puede retirar hoy?** Casi. Falta confirmar con una consulta que no entran filas nuevas desde que existe la mensual, y leer qué hace `ops.fn_volver_paso` con el tramo liquidable.
- **¿Requiere migración?** Sí, una: quitar la referencia de `ops.fn_volver_paso`, el trigger, las vistas y las tablas. Antes se exportan las tablas por si hay historia que guardar.
- **Riesgo:** bajo a medio.

### D4 · Tablas sin uso

| Tabla | Qué depende de ella | ¿Se retira hoy? | Migración | Riesgo |
|---|---|---|---|---|
| `ana.baseline_consumo` | Nada | Sí, si está vacía | Borrar tabla | Bajo |
| `fin.rentabilidad_servicio` | Nada | Sí, si está vacía | Borrar tabla | Bajo |
| `tel.nivel_suavizado` | Nada | Sí, si está vacía | Borrar tabla | Bajo |
| `tel.sesion_conductor` | Nada | Sí, si está vacía | Borrar tabla | Bajo |
| `fin.asignacion_costo` | Nada; ella apunta a `fue.consumo_servicio` | Sí, si está vacía | Borrar primero | Bajo |
| `fue.consumo_servicio` | `fin.asignacion_costo` | Después de la anterior | Borrar segunda | Bajo |
| `fue.costo_medio_combustible` | `fue.consumo_servicio` y, a confirmar, la pantalla Costo medio | Después de la anterior y de la Fase C | Borrar tercera | Bajo |
| `ana.caso_revision` | `ana.alerta_caso` | Solo junto con `ana.alerta_caso`, si tampoco se usa | Borrar las dos | Bajo a medio |
| `stg.lote_importacion` | Una columna de `fue.carga_combustible` | No hoy | Quitar la columna de la carga (toca vistas y el trigger de inmutables) | Medio |

**Paso previo para toda la tabla:** una consulta de solo lectura con la cantidad de filas de cada una. Si alguna tiene datos, se exporta antes o se deja.

---

## Tabla final

Ordenada por impacto, después riesgo, después esfuerzo.

| # | Cambio | Fase | Impacto | Riesgo | Esfuerzo |
|---|---|---|---|---|---|
| 1 | Interfaz pedido y orden: etiquetar cada número, mostrar recomendación y decisión, mostrar la diferencia | Decisión 5 | Alto | Bajo | 1 jornada |
| 2 | Confirmar qué pantallas están vivas y armar las redirecciones | C | Alto | Bajo | 0,5 + 1,5 jornadas |
| 3 | Chofer del tractor: una sola regla, más el control de baja y licencia | A1 | Alto | Medio | 3 jornadas |
| 4 | Clientes: una sola puerta de alta | A5 | Alto | Medio | 2 jornadas |
| 5a | Permisos, etapa 1: mapa completo de diferencias entre la matriz y la base | A2 | Alto | Ninguno (solo lectura) | 2 jornadas |
| 5b | Permisos, etapa 2: migración, con el mapa aprobado | A2 | Alto | Alto | 6 a 8 jornadas |
| 6 | Mensajes de la base con el menú vigente | B1 | Medio | Bajo | 1 jornada |
| 7 | Quitar compuertas de versión cumplidas | B2 y D1 | Medio | Bajo | 1 a 2 jornadas |
| 8 | Observadas y Sin documento como filtros | B3 | Medio | Bajo | 1 jornada |
| 9 | Consumo objetivo: la regla escrita una vez | A4 | Medio | Bajo | 1 jornada |
| 10 | Capacidad de tanques, mochila y total desde una función; faltante con su parte de mochila | A3 | Alto | Medio | 3,5 jornadas |
| 11 | Mail compartido entre orden de camión y de genset | B5 | Medio | Medio | 1,5 jornadas |
| 12 | Retirar la liquidación antigua | D3 | Medio | Bajo a medio | 1 jornada |
| 13 | Retirar el modelo anterior de mochila | D2 | Medio | Medio | 3 jornadas |
| 14 | Un solo aviso al teléfono | B4 | Bajo | Bajo | 0,5 jornada |
| 15 | Borrar las tablas sin uso | D4 | Bajo | Bajo | 0,5 jornada |

---

## Roadmap

### Sprint S1 · Limpieza sin cambio de comportamiento

- **Cambios incluidos:**
  - Lectura del repo: menú, matriz de permisos, las 30 páginas de la Fase C y el resto de las compuertas.
  - Consultas de solo lectura de la Fase D: filas de las tablas sin uso, mochilas-depósito vigentes, altas en la liquidación antigua, clientes duplicados.
  - Interfaz pedido y orden (#1).
  - Mensajes de la base (#6).
  - Compuertas de versión (#7).
  - Un solo aviso al teléfono (#14).
- **Dependencias:** que vuelva la conexión con la carpeta del repo. Sin eso solo se pueden hacer el #14 y las consultas.
- **Beneficio esperado:** la Fase C queda sin «a confirmar»; el usuario deja de ver menús que no existen y dos números sin explicar; el código pierde ramas que ya no se ejecutan.
- **Tamaño:** unas 5 jornadas.

### Sprint S2 · Fuentes de verdad de bajo riesgo

- **Cambios incluidos:**
  - Chofer del tractor, con el control de baja y licencia (#3).
  - Consumo objetivo (#9).
  - Capacidad de tanques y mochila, y faltante con su parte de mochila (#10).
  - Observadas y Sin documento como filtros (#8).
  - Mail compartido de las órdenes (#11).
- **Dependencias:** S1 para el #8 (necesita el menú). El resto no depende de S1.
- **Beneficio esperado:** una sola respuesta a «quién maneja», el mismo objetivo en ruta y en el cierre, y tanques y mochila distinguidos en órdenes, pedidos, combustible actual, cierres y actas.
- **Tamaño:** unas 10 jornadas.

### Sprint S3 · Navegación, clientes y mapa de permisos

- **Cambios incluidos:**
  - Redirecciones y fusiones de la Fase C ya confirmadas (#2).
  - Clientes: puerta única de alta (#4), más la unión de duplicados como corrección de datos con simulación.
  - Permisos, etapa 1: inventario y validación de diferencias entre la matriz y la base (#5a). Solo lectura.
- **Dependencias:** la tabla de la Fase C aprobada por vos; la lista de duplicados para #4; el repo conectado para #5a.
- **Beneficio esperado:** menos entradas de menú para lo mismo, altas de cliente controladas y el mapa completo de permisos listo para que decidas las diferencias.
- **Tamaño:** unas 5,5 jornadas, sin contar la unión de duplicados.

### Sprint S4 · Permisos

- **Cambios incluidos:**
  - Permisos, etapa 2 (#5b): tabla y funciones, reemplazo por módulo, la web lee de la base.
- **Dependencias:** el mapa de la etapa 1 completo y aprobado, con cada diferencia decidida. Sin eso, este sprint no empieza.
- **Beneficio esperado:** un cambio de permiso se hace en un solo lugar.
- **Tamaño:** 6 a 8 jornadas. Conviene que no coincida con cierres de mes.

### Sprint S5 · Mochila y compatibilidad heredada

- **Cambios incluidos:**
  - Retirar el modelo anterior de mochila (#13).
  - Retirar la liquidación antigua (#12).
  - Borrar las tablas sin uso (#15).
- **Dependencias:** las consultas de solo lectura de S1 (mochilas-depósito vigentes, altas en la liquidación antigua, filas de las tablas); A1 y A3 ya aplicados (A3 es condición: el retiro de la mochila anterior depende de él); la Fase C cerrada para la tabla de costo medio.
- **Beneficio esperado:** `fue.fn_combustible_actual` queda con un solo modelo de mochila, y hay menos tablas, vistas y triggers que mantener.
- **Tamaño:** unas 4,5 jornadas.

---

## Cómo se entrega cada ítem

Como hasta ahora: una migración con su verificación (datos ZZ, termina en error a propósito), los archivos del repo escritos en su lugar, los scripts para Supabase por el chat y el detalle de qué subir y si hay que borrar algo.
