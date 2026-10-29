# Lo que no se ve, también se limpia

Colección de ocho juegos cortos sobre calidad, gestión y seguridad en el envasado de cerveza. Usa la
estética del afiche (negros, naranjas quemados, latón steampunk y toques de Halloween).
Cada juego tiene **tres dificultades** (Fácil, Normal y Difícil) y termina con un
**Reporte de Calidad** con rango S/A/B/C. Se juega con **teclado y ratón, con mando de
PlayStation o Xbox, o con pantallas táctiles** (móviles, tabletas y pantallas grandes tipo
TV): los botones que se ven en pantalla cambian solos según cómo se esté jugando.

Cuando el jugador se equivoca aparece una **burbuja de pensamiento** que dice **"¡Esto
no va así!"** y explica el porqué, por ejemplo *"El agua caliente para sanitizar debe
estar a 85 °C. ¡Las bacterias sobrevivieron!"*. Esos errores se repiten al final en el
reporte, en la sección "Lo que no va así".

Para que no estorben, los mensajes van **a un lado**:

- En los juegos de mapa, un panel **MENSAJES** en la barra lateral reúne los avisos del
  turno, las fichas "Sabías que", las notificaciones de presión y la burbuja del
  operario. Sobre el operario solo aparece una nubecita junto a la cabeza que indica
  que hay un mensaje nuevo.
- En Control de UP, una barra de mensajes entre el proceso y los paneles de control.

| # | Juego | De qué va |
|---|---|---|
| 1 | **Pasteurizadora Flash** · Turno 60 | Mantener temperatura, flujo y retención en rango mientras las alarmas se acumulan. |
| 2 | **CIP Rush** · El Turno de la Limpieza | Químico correcto → TACT en el panel → escobillado de la llenadora → ATP < 50 URL. |
| 3 | **El Cazador de Riesgos** · Recorrido UV | Línea a oscuras: encontrar 5 focos de contaminación con linterna UV y limpiarlos con la herramienta correcta. |
| 4 | **Línea en Paro** · Decisiones Bajo Presión | Aplicar el plan de reacción según cuánto lleva parada la línea, sin ceder a la presión de arrancar ya. |
| 5 | **Control de UP** · Unidades de Pasteurización | Panel de control sin muñeco: mantener cada lote entre 24 y 30 UP (ideal 26) con la temperatura y decidir con la llave de paso si va a la llenadora o al descarte. Duración ajustable de 40 a 60 s. |
| 6 | **Supervisor de Turno** · LEF · GLY · OSE | Administración del turno: leer el tablero de LEF, GLY y OSE para descubrir dónde se pierden las horas (modo *Diagnóstico*) o marcar, en cada pérdida del reporte, todos los KPIs que afecta (modo *¿Qué KPIs caen?*: se pueden marcar varios). 6 turnos de 12 h simulados en 6 s, con 30, 40 o 50 s para responder cada uno. |
| 7 | **Guía Rápida de Reacción** · Une los puntos | Unir los puntos en orden para armar la ruta de reacción de cada emergencia: derrame de sustancia química, contacto con sustancia química, conato de incendio y emergencia, hasta su procedimiento ACADIA. |
| 8 | **Pictograma Correcto** · Respuesta rápida | 3 preguntas rápidas: se ve una escena de la planta y hay que elegir el pictograma de seguridad que le corresponde (proyección de partículas, atrapamiento, tropiezo, riesgo eléctrico o maquinaria en funcionamiento). |

## Cómo jugar

**Sin conexión:** descarga [`dist/lo-que-no-se-ve.html`](dist/lo-que-no-se-ve.html) y
ábrelo con doble clic en cualquier navegador moderno. Hay dos versiones:

- [`lo-que-no-se-ve.html`](dist/lo-que-no-se-ve.html): **con configuración** (clave, ver
  más abajo).
- [`lo-que-no-se-ve-sin-ajustes.html`](dist/lo-que-no-se-ve-sin-ajustes.html): **sin
  configuración**. No tiene botón ⚙ y usa siempre los valores por defecto: Pasteurizadora
  Flash y Línea en Paro desactivadas, y cada jugador elige la dificultad.

**SharePoint:** las dos versiones se abren directamente desde SharePoint. SharePoint
muestra el HTML en un marco aislado que no deja guardar nada en el navegador; ahí el
juego funciona igual, pero los récords y la configuración duran solo mientras la página
esté abierta. La pantalla de configuración lo avisa. Si se quiere que los récords o la
configuración se guarden, hay que descargar el archivo y abrirlo con doble clic.

Cada versión es un único archivo (~530 KB) con
el código y las fuentes incrustados: no pide nada a internet, así que se puede copiar a
un USB o mandar por correo.

**Desde el código:** abre `index.html` directamente (también funciona sin conexión) o
sírvelo con pnpm:

```
pnpm install
pnpm start          # http://localhost:8080
```

Flujo: **menú de juegos** (← → o ratón) → **dificultad** (↑ ↓, 1-3 o clic: cada tarjeta
explica qué cambia; en Control de UP también la **duración**, ← →) → **turno** →
**Reporte de Calidad** (ENTER repetir · D cambiar dificultad · ESC menú). P pausa y M
silencia en cualquier juego; con el ratón o el dedo, tocar el reloj del turno también
pausa. Las pantallas de inicio, pausa y reporte tienen botones que se pueden tocar o
clicar. Los récords se guardan por juego y por dificultad en el navegador.

**Instrucciones antes de jugar:** cada tarjeta del menú tiene un botón **ⓘ**, y la
pantalla de inicio de cada juego un botón **INSTRUCCIONES** (también la tecla **I** o
△ / Y en el mando). Se abre una ventana con cómo se juega, las dificultades y una tabla
de controles con la acción, la tecla, el botón del mando PS y Xbox, y qué hacer en
pantallas táctiles. Se cierra con ESC, ○ / B o tocando la pantalla.

Controles comunes: **WASD/flechas** moverse · **E** operar (E o Esc para salir) ·
**Espacio** confirmar o mantener · **TAB** manual de consulta · **1-4** opciones.

### Mando (PlayStation / Xbox)

Conecta el mando y pulsa cualquier botón: el juego detecta si es de PlayStation (✕ ○ □ △,
L1/R1, OPTIONS) o de Xbox (A B X Y, LB/RB, MENU) y desde ese momento todas las ayudas en
pantalla muestran sus botones. Si vuelves a tocar el teclado o el ratón, las ayudas
vuelven a mostrar teclas. Cualquier otro mando se muestra con los botones de Xbox.

| Acción | PlayStation | Xbox |
|---|---|---|
| Menús: elegir / aceptar / volver | cruceta o stick · ✕ · ○ | cruceta o stick · A · B |
| Pausa · reiniciar desde la pausa | OPTIONS · △ | MENU · Y |
| Control de UP: temperatura | cruceta ▲▼ o stick izquierdo | cruceta ▲▼ o stick izquierdo |
| Control de UP: llave → llenadora / descarte / alternar | ✕ / ○ / R1 | A / B / RB |
| Control de UP: ayuda (pausa el turno) | △ | Y |
| Juegos de mapa: mover · operar · confirmar · manual | stick · □ · ✕ · △ | stick · X · A · Y |
| Juegos de mapa: opciones 1-4 | L1 · R1 · L2 · R2 | LB · RB · LT · RT |

Las ayudas de todos los juegos cambian según el mando: las indicaciones sobre el
operario, las ventanas de estación, los mini-juegos (por ejemplo, el patrón de colores
usa L1 R1 L2 R2 / LB RB LT RT), las herramientas y el pie de controles de la barra
lateral. En Línea en Paro, las notificaciones de presión se responden con L2 / LT
("arrancar ya") o R2 / RT ("seguir el protocolo").

### Pantallas táctiles (móvil, tableta o TV táctil)

Al tocar la pantalla, el juego pasa a modo táctil: el menú dice "Toca un juego para
empezar" y las ayudas de cada juego muestran los botones que hay en pantalla.

- **Juegos de mapa** (Pasteurizadora Flash, CIP Rush, El Cazador de Riesgos, Línea en
  Paro): arrastra el dedo en la mitad izquierda para mover al operario. El joystick
  aparece donde apoyas el dedo. A la derecha están los botones del juego, con su nombre
  (A Confirmar, X Operar, Y Manual o Plan, B Salir). Los botones 1-4 de las herramientas
  y los mini-juegos van a la izquierda. Las opciones de las ventanas (tanques,
  herramientas, CIP…) también se pueden tocar.
- **Control de UP:** arrastra el dedo hacia arriba o abajo en la mitad izquierda para
  cambiar la temperatura. La llave de paso se cambia tocando LLENADORA o DESCARTE, o con
  los botones A y B.
- **Supervisor de Turno y Guía Rápida de Reacción:** todo se toca directamente: el rombo
  de respuestas, las herramientas, los puntos, Continuar y "ayuda" o "guía". La ayuda se
  cierra tocando la pantalla.
- **En un móvil apaisado**, los botones van en las franjas negras a los lados del juego,
  para no tapar nada. En tabletas y TV van encima del juego, semitransparentes.
- En vertical, el juego pide girar el dispositivo y se pausa.
- El botón ⛶ del menú pone el juego en pantalla completa. En Android, además, fija la
  pantalla en horizontal.
- Tocar el reloj del turno (o el ⏸ que tiene al lado) pausa el juego.

### Configuración (clave)

El botón ⚙ del menú (también **C** en el teclado o SHARE / VIEW en el mando) pide una
clave: **Odiseo**. No distingue mayúsculas, porque los teclados de móvil ponen la
primera en mayúscula. Con la clave se puede:

- **Activar o desactivar juegos.** Los desactivados no aparecen en el menú. Por defecto
  están desactivados **Pasteurizadora Flash** y **Línea en Paro**. Siempre queda al
  menos un juego activo.
- **Fijar una dificultad general** (Fácil, Normal o Difícil) para todos los juegos, o
  dejar que cada jugador la elija. Con la dificultad fijada, la pantalla de inicio la
  muestra bloqueada (🔒) y solo deja elegir las opciones propias del juego, como el modo
  o el tiempo para responder.

La configuración se guarda en el navegador de cada dispositivo, junto con los récords:
hay que hacerla una vez en cada equipo donde se juegue. La clave sirve para evitar
cambios casuales de los jugadores. No es una protección fuerte: el juego funciona sin
conexión y la clave está dentro del propio archivo.

### Generar el exportable

```
pnpm build                                        # → las dos versiones en dist/
node scripts/build.mjs ruta/otro-nombre.html      # una sola, con configuración
node scripts/build.mjs ruta/otro.html --sin-ajustes
```

`scripts/build.mjs` toma `index.html`, incrusta cada `<script src>` y convierte las fuentes
en `data:` URIs. La versión sin ajustes es igual, con una marca al inicio que oculta la
configuración. Si queda algún recurso externo, el build falla. Los archivos de `dist/` se
versionan para poder descargarlos desde GitHub. `pnpm test` avisa si quedaron desactualizados,
así que después de tocar `src/` hay que volver a ejecutar `pnpm build`.

## Contenido técnico: revisar con el manual

Todo el texto didáctico (químicos, valores TACT, protocolos de paro, riesgos,
herramientas y fichas "Sabías que") está en **`src/content/manual.js`**, así que se puede
corregir sin tocar la lógica. Lo que venía en el material original se usa tal cual; lo
demás es un valor de referencia marcado con `VERIFICAR` en el código:

- **Del material original:** limpieza alcalina con soda cáustica (Bevrosheen) a 85 °C y
  2,0 %; limpieza ácida con ácido nítrico; agua caliente a 85 °C para sanitizar;
  ATP < 50 URL; paro de 6 a 52 h → CIP Intermedio; paro de 60 min a 6 h → vaciado de
  tazón + limpieza interna mínima (agua caliente) + limpieza externa mínima; vidrio →
  escoba y pala (COP); levadura → espuma cáustica (Topax 66); biofilm → ácido
  peracético; llenadoras con presión positiva → limpieza externa cada 8 h.
- **A verificar:** tiempo y acción (velocidad de flujo) del TACT alcalino; todos los
  parámetros de la limpieza ácida y de la sanitización con peracético; paro de más de
  52 h → CIP Completo; sarro → desincrustante ácido; algunas fichas "Sabías que".

## Los juegos

### 1 · Pasteurizadora Flash

| Variable | Ideal | Rango aceptable | Bajo | Alto | Estación |
|---|---:|---:|---|---|---|
| Temperatura | 27 PU | 24–30 PU | subpasteuriza | sobrepasteuriza | T · Temperatura |
| Flujo | 0,90 HL/s | 0,85–0,95 HL/s | sobrepasteuriza | subpasteuriza | V · Válvula |
| Tiempo de retención | 3,0 s | 2,8–3,2 s | subpasteuriza | sobrepasteuriza | B · Bomba |

- **Descarte:** cada 0,1 s se contabiliza el flujo. Si una variable lleva más de
  **0,4 s** fuera de rango, ese volumen va a *desechado*; si no, a *aprobado*.
- **Anti-trampa:** la válvula no baja de 0,6 HL/s. Más de 2 s al mínimo provoca un
  **paro de línea** de 3 s y una purga de 1 HL a descarte.
- **Paro de planta (opcional):** 3 o más alarmas rojas durante 5 s terminan el turno
  antes (rango máximo C). Se desactiva con `PLANT_STOP.enabled` en `src/config.js`.
- **Rango:** S ≥ 95 % · A ≥ 85 % · B ≥ 70 % · C < 70 % de eficiencia.
- **Fallas:** deriva térmica, de caudal y cinta lenta (se corrigen con A/D); golpe de
  vapor (mantener Espacio), válvula trabada (secuencia de flechas), espuma (Espacio a
  tiempo), bomba con aire (presión en verde) y sensor loco (patrón de colores 1-4).
- **Curva:** 0–10 s una deriva · 10–35 s derivas y reparaciones · 35–50 s dos alarmas a
  la vez y sensores locos · 50–60 s hora pico con sirena y bloqueos.
- **Dificultad:** Fácil → derivas al 70 %, fallas más espaciadas, una menos a la vez y
  sin bloqueos. Difícil → derivas al 120 %, una falla simultánea extra y más bloqueos.

### 2 · CIP Rush

La orden de limpieza (p. ej. *"Parada de 6 a 52 horas → CIP Intermedio: limpieza
ALCALINA"*) se completa en cuatro estaciones y en orden. La **Tarjeta de verificación**
de la barra lateral marca el avance:

1. **Tanques:** conectar la manguera del químico correcto.
2. **Panel CIP:** ajustar Tiempo, Acción, Concentración y Temperatura (el **CIP Master
   Plan** se abre con TAB).
3. **Llenadora:** frotar válvulas y tazón hasta quitar toda la suciedad (WASD o ratón y
   Espacio).
4. **Verificación:** pasar el hisopo en zigzag (← →) y leer el luminómetro. Con menos de
   50 URL el lote queda aprobado y llega una orden nueva. Si quedó suciedad, el ATP sale
   alto y hay que volver a frotar.

Puntuación: 35 por lote aprobado (+10 si no hubo errores), −5 por error y −5 por ATP
rechazado. Fácil muestra si cada químico es alcalino o ácido y marca los objetivos TACT.
Difícil resta 3 s por error y añade la sanitización química.

### 3 · El Cazador de Riesgos

La linterna UV revela "monstruos" de contaminación: vidrio roto, sarro, levadura seca y
biofilm. Hay 5 por turno, en posiciones aleatorias y con al menos uno de cada tipo. Para
limpiarlos: acercarse, pulsar E, elegir la herramienta (1-4) y mantener Espacio. Cada
limpieza muestra una ficha "Sabías que". Una herramienta equivocada abre la burbuja de
error y, en Normal y Difícil, resta tiempo. Difícil reduce la luz, la hace parpadear y
añade más falsas alarmas.

- **Todos los focos se pueden alcanzar caminando.** Una prueba recorre el mapa con las
  mismas colisiones del juego y comprueba que a cada foco y falsa alarma se llega sin
  atravesar máquinas.
- **No se limpia a través de una máquina:** si hay una cinta, la estrella o el tanque
  entre el operario y el foco, hay que rodearla.
- **Comodín de luz total** (C, △ / Y o el botón "Luz" en pantallas táctiles): enciende
  toda la línea durante 3 s y marca todos los focos en la lista. Se puede usar una vez
  por recorrido, y el reporte indica si se usó.

### 4 · Línea en Paro

Salta un aviso como *"Línea detenida hace 2 horas"*. Hay que aplicar el **plan de
reacción** (TAB, o el tablero del mapa en Difícil): vaciar el tazón, hacer la limpieza
interna con agua caliente y la externa, o elegir CIP Intermedio o CIP Completo en el
panel. Después se arranca en START. Las notificaciones de presión ("El jefe de turno
quiere arrancar YA") ofrecen **Y = arrancar ya**. Arrancar sin el protocolo completo
saca **cerveza contaminada** y cuesta una vida (3/2/1 según dificultad). En Difícil es
game over directo.

### 5 · Control de UP

Basado en la fórmula clásica para cerveza y bebidas:

**UP = t × 1,393^(T − 60)**, donde UP son las unidades de pasteurización acumuladas,
t los minutos a la temperatura T, T la temperatura real del producto en °C, 60 °C la
referencia (1 UP por minuto) y 1,393 el factor derivado de z = 10 °C.

- Los lotes cruzan el túnel durante **t minutos** (10 min a velocidad normal) y acumulan
  UP minuto a minuto según la **temperatura real**. Si la temperatura cambia mientras un
  lote está dentro, su UP final lo refleja.
- El jugador maneja la **consigna** de temperatura. La temperatura real la sigue con
  retraso y con perturbaciones: caída o pico de vapor, botellas frías y cambios de
  velocidad de la línea, que cambian t.
- **Menos de 24 UP:** subpasteurizada, turbia y con bolitas verde pálido. **24–30 UP:**
  en rango, dorada (ideal 26). **Más de 30 UP:** sobrepasteurizada, con aspecto quemado.
  El aspecto se ve en cada botella al salir del túnel.
- La **llave de paso** decide el destino de cada lote al llegar a ella. Puntos: lote
  en rango a la llenadora +10 (+15 si está entre 25 y 27); lote malo al descarte +5
  (decisión correcta); lote bueno al descarte −5 (cerveza buena botada); lote malo a la
  llenadora −20 (la burbuja explica el porqué).
- El panel muestra la fórmula con los números actuales, el indicador de UP del lote que
  entra, el termómetro con la ventana de temperatura buena y el historial de lotes.
  La **ayuda** (H / △ / Y) pausa el turno y explica la fórmula y los tres aspectos.
- **Duración:** 40, 45, 50, 55 o 60 s. **Dificultad:** Fácil responde rápido, tiene
  pocas perturbaciones y sugiere la llave. Normal añade cambios de velocidad y no da
  sugerencias. Difícil tarda más en responder, tiene perturbaciones fuertes y no muestra
  estimaciones ni la ventana buena.

### 6 · Supervisor de Turno

El objetivo es aprender cómo se relacionan LEF, GLY y OSE, qué las afecta y qué
factores están en el poder de la línea. Cada partida son **6 turnos de 12 h**,
cada uno simulado en **6 s**. No es un juego de reflejos:

- Al terminar la simulación tienes **30, 40 o 50 s para responder**. Ese tiempo se
  elige en la pantalla de inicio, aparte de la dificultad.
- El juego espera tu respuesta. Si se acaba el tiempo, lo que falte cuenta como fallo,
  se muestra la solución unos segundos y el juego pasa solo al siguiente turno.
- Al responder, la explicación queda en pantalla hasta que pulsas **Continuar**
  (Enter / ✕ / A).

En la pantalla de inicio eliges también el modo. Con ↑ ↓ (o la cruceta) pasas de la
dificultad a las filas de opciones, y con ← → cambias la opción.

**Modelo.** Las tres métricas comparten el mismo numerador, el **EPT** (tiempo de
producción efectiva), y difieren en el denominador:

| KPI | Fórmula | La detecta primero |
|---|---|---|
| LEF | EPT / LET (tiempo de operación de la línea) | pérdidas **internas** de la línea |
| GLY | EPT / tiempo programado | **paradas planificadas** y **causas externas**, que el LEF excluye |
| OSE | EPT / tiempo total | tiempo **no programado**, que el GLY no ve |

Siempre **LEF ≥ GLY ≥ OSE**. Toda pérdida que baja el EPT baja los tres KPIs:
ninguna pérdida interna afecta "solo al LEF". Lo que cambia es cuál la detecta
primero.

**Catálogo de pérdidas** (`src/content/kpi.js`): los 24 ítems de la investigación del
área de envasado.

- **LEF:** fallas mecánicas o eléctricas, microparadas, velocidad bajo la nominal,
  rechazos, mal balance de línea, ajustes y recuperación.
- **GLY:** cambios de formato dentro del estándar, CIP, mantenimiento planificado,
  falta de cerveza, falta de materiales de envase, fallas de servicios.
- **OSE:** demanda menor a la capacidad, turnos no programados, portafolio cargado
  en otra línea, restricciones aguas arriba, overhauls, feriados.
- **Los que pueden caer en más de un KPI (19-22)** se separan en variantes con una
  sola respuesta. Ejemplo: ausentismo, según si la línea corre más lenta (interna), se
  detiene (externa) o el turno no se programa (no programada).
- **Velocidad nominal mal configurada (23):** afecta a **los tres** KPIs.
- **Falla interna registrada como externa (24):** pregunta qué KPI queda
  distorsionado: solo el LEF, que sube artificialmente.

**Modo Diagnóstico de turno.** El tablero muestra LEF, GLY y OSE en vivo, acumulados
hasta la hora actual. La pregunta es **¿qué KPI detecta la gran caída?** Se responde en
el rombo de botones, que imita la cara del mando. Puedes responder antes de que acabe
la simulación. Este modo usa solo los ítems de un KPI (1-18).

| Botón | Respuesta | Patrón | Causa |
|---|---|---|---|
| ▲ (↑ / △ / Y) | LEF | LEF bajo (arrastra a GLY y OSE) | problema interno |
| ◀ (← / □ / X) | GLY | LEF alto, GLY bajo | planificada o externa |
| ▶ (→ / ○ / B) | OSE | LEF y GLY altos, OSE bajo | sin programar |
| ▼ (↓ / ✕ / A) | Ninguno | todo alto (≥ 90 %) | turno excelente |

Después viene la segunda pregunta, **"¿con quién la atacas?"**:

- Mantenimiento u Operación (en el poder de la línea).
- Equipo SMED, Calidad o Mantenimiento, para las paradas planificadas.
- Abastecimiento, Elaboración o Utilities, para las causas externas.
- Planificación y ventas, para la capacidad sin programar.
- Estandarizar, si el turno fue excelente.

Diagnóstico +100, acción +50.

**Modo ¿Qué KPIs caen?** El turno corre 6 s con la línea a la vista. Al final llega el
**reporte de fin de turno**. En cada pérdida se marcan **todos** los KPIs que afecta,
porque una misma pérdida baja varios: el EPT es el numerador de los tres, así que cae
cada KPI cuyo denominador incluye ese tiempo.

| Tipo de pérdida | KPIs que caen |
|---|---|
| Interna de la línea | LEF, GLY y OSE (el LEF la detecta primero) |
| Planificada o externa | GLY y OSE (el LEF la excluye) |
| No programada | solo OSE |
| Velocidad nominal mal configurada | los tres (error de dato) |
| Falla interna registrada como externa | solo el LEF, que se distorsiona |

Con el rombo, ▲ LEF, ◀ GLY y ▶ OSE (o △ □ ○, Y X B, o tocándolos) **marcan y
desmarcan**, y ▼ / ✕ / A / ENTER **confirma**. Cada pérdida vale 50 puntos: 15 por cada
KPI bien decidido (marcado si cae, sin marcar si no) y 5 más si están los tres. Si
marcas de más o de menos, la burbuja dice cuál sobró o faltó y por qué. En el reporte,
cada KPI se ve como una casilla: verde, bien marcado; rojo, de más; naranja, faltó. En
Fácil, la regla aparece bajo el rombo. En Normal y Difícil aparecen los ítems que pueden
caer en más de un KPI; Difícil incluye también los errores de dato.

**Herramientas y dificultad.** Los KPI se calculan siempre con las causas reales: los
reportes pueden mentir, los números no.

- **Ver la línea** (V / R1 / RB) muestra la causa real en vivo.
- **Llamar y verificar** (C / L1 / LB) confirma los reportes del turno. Se puede usar
  3, 2 o 1 vez por partida.
- **Fácil:** línea y reportes a la vista con su tipo de pérdida, la regla rápida y
  las brechas marcadas en el tablero.
- **Normal:** reportes sin verificar, la línea y los reportes se alternan, y hay
  señuelos.
- **Difícil:** reportes equivocados, la línea sin rótulos y más trampas.

La ayuda (H / SHARE / VIEW) pausa el turno y explica el árbol de tiempos (total →
programado → LET → EPT), la regla rápida, cuatro turnos de ejemplo y qué está en el
poder de cada uno. El reporte final muestra, en ¿Qué KPIs caen?, cuántas pérdidas tuvieron
todos los KPIs bien y las decisiones correctas sobre cada KPI, además de la confusión
más frecuente (por ejemplo "LEF de más · planificada").

### 7 · Guía Rápida de Reacción

El objetivo es que la gente de la planta aprenda los planes de reacción del afiche
"Guía Rápida de Reacción". Cada situación es un dibujo de "une los puntos": desde la
situación se unen, en orden, los pasos de su ruta hasta el procedimiento. Las
situaciones salen en orden aleatorio.

Los ID (COM, DEL…) son solo referencia interna: en el juego, cada punto lleva el texto
completo y un dibujo del equipo. El contenido está en `src/content/reaction.js`.

| Situación | Ruta correcta |
|---|---|
| Derrame de sustancia química | Comunicación (dar aviso) → Delimitación (conos / barreras) → EPP’s (traje, guantes, protección respiratoria) → Uso de kit antiderrames → ACADIA QUI-ENV-SOP-260 |
| Contacto con sustancia química | Comunicación (dar aviso) → Lavaojos (mín. 15 min) → Ducha de emergencia (mín. 15 min) → Hoja de seguridad MSDS |
| Conato de incendio | Comunicación (dar aviso) → Pulsador de alarma “FIRE” → Extintor (técnica PASS) → Gabinete / manguera contra incendio → ACADIA QUI-SEG-SOP-0092 |
| Emergencia (sismo / incidente mayor) | Comunicación (dar aviso) → Alarma / sirena de evacuación → Salida de emergencia (ruta señalizada) → Punto de encuentro (conteo de personal) → ACADIA QUI-SEG-SOP-0085 |

El **detector de humo** aparece en la guía junto al conato de incendio, pero no es un
paso de la ruta: detecta por sí solo. En el tablero funciona como señuelo y, si lo
eliges, se explica por qué no va.

**Cómo se juega.**

- Mueve el cursor entre los puntos con ↑ ↓ ← → (o WASD, la cruceta o el stick).
- Conecta con Enter, Espacio, ✕ / A o un clic.
- Cada acierto suma 10 puntos y muestra qué se hace en ese paso.
- Cada error resta 3 puntos y muestra una burbuja "¡Esto no va así!" que explica el
  motivo: toda ruta empieza por la comunicación, el paso es de otra situación, el
  procedimiento ACADIA es de otra situación, o el paso sí va pero más adelante.
- Al completar una ruta, se ve entera, como una fila del afiche, con lo que se hace en
  cada paso. Queda en pantalla hasta pulsar Continuar.
- **La guía completa** (H / SHARE / VIEW) muestra el afiche con las cuatro rutas y
  pausa el tiempo.

| Dificultad | Tablero | Ayuda | Tiempo y guía |
|---|---|---|---|
| Fácil | solo los pasos de la ruta y 3 señuelos | el paso correcto se dice y parpadea al primer error | 5 min · guía sin costo |
| Normal | los 17 puntos | pista tras 2 errores en el mismo paso | 4 min · cada consulta resta 5 puntos |
| Difícil | los 17 puntos, solo texto, sin dibujos ni número de pasos | pista tras 3 errores en el mismo paso | 3 min · cada consulta resta 10 puntos |

El Reporte de Calidad muestra los errores en cada situación, las consultas a la guía y
el tiempo usado.

### 8 · Pictograma Correcto

Un juego de respuestas rápidas para relacionar cada riesgo de la planta con su
pictograma de advertencia. Cada partida tiene **3 preguntas** (como máximo), sin
repetir. En cada una se ve una escena dibujada y hay que elegir el pictograma correcto
antes de que se acabe el tiempo.

| Escena | Pictograma correcto |
|---|---|
| Una botella estalla en la línea y lanza vidrio | ¡Atención! Riesgo de proyección de partículas |
| Cadenas, piñones y transportador en movimiento | ¡Atención! Riesgo de atrapamiento |
| Piso mojado en el pasillo de la línea | ¡Atención! Riesgo de tropezar |
| Tablero eléctrico abierto | Riesgo eléctrico |
| Montacargas circulando en el patio | Peligro: maquinaria en funcionamiento |

- Acertar suma 60 puntos y la rapidez hasta 40 más (100 por pregunta).
- **Al elegir una opción, bien o mal, se pasa en el acto a la siguiente pregunta** (o
  al reporte). Arriba de las opciones se ve un momento el resultado ("✔ ¡Correcto!
  +98" o "✖ Era «…»"), y la burbuja de la barra de mensajes explica de qué advierte el
  pictograma elegido y por qué la escena lleva el otro. Los errores quedan en el
  reporte.
- Se responde con ← → (y ↑ ↓) + ENTER, con los números 1-5, con la cruceta y ✕ / A, o
  tocando la tarjeta.

| Dificultad | Opciones | Tiempo por pregunta | Ayudas |
|---|---|---|---|
| Fácil | 3, con su nombre | 12 s | la escena trae su descripción |
| Normal | 4, solo el pictograma | 8 s | la escena trae su descripción |
| Difícil | los 5, sin nombre | 6 s | sin descripción |

Las escenas y los pictogramas se dibujan en el propio juego, sin imágenes externas,
para que siga siendo un solo archivo que funciona sin conexión.

## Estructura

```
index.html              lienzo, fuentes locales y carga de scripts
dist/                   exportable de un solo archivo (generado con pnpm build)
assets/fonts/           Rajdhani y Share Tech Mono (SIL Open Font License)
scripts/build.mjs       genera el exportable
src/core/pad.js         mandos PS/Xbox: detección, flancos y traducción a acciones
src/core/touch.js       pantallas táctiles: joystick flotante, botones virtuales y toques
src/core/settings.js    configuración con clave: juegos activos y dificultad general
src/core/draw.js        lienzo, tema del afiche, HUD, paneles, jugador, botones del mando
src/core/bubble.js      burbuja de pensamiento "¡Esto no va así!"
src/core/world.js       movimiento cenital con colisiones y estaciones
src/core/screens.js     menú, selector de dificultad, pausa y Reporte de Calidad
src/content/manual.js   contenido técnico de los juegos (revisar con el manual)
src/content/kpi.js      LEF, GLY y OSE: fórmulas (EPT), catálogo de 24 pérdidas y explicaciones
src/content/reaction.js Guía Rápida de Reacción: situaciones, puntos con su texto completo y rutas
src/games/*.js          un archivo por juego (CIP, cazador, paro, control de UP, supervisor, reacción, pictogramas, adaptador pasteurizadora)
src/config.js, sim.js, minigames.js, render.js   motor de la Pasteurizadora Flash
src/audio.js            efectos sintetizados con WebAudio
src/main.js             teclado, ratón, toque, mando, bucle, pantallas y configuración
test/                   pruebas con node:test
```

La lógica de los juegos no toca el DOM y acepta una semilla, así que se prueba en Node:

```
pnpm test
```

Las pruebas cubren las reglas de cada juego (caminos correctos e incorrectos, burbujas,
puntuación y game over), la fórmula de UP, la lectura de mandos PS/Xbox, el mando táctil, la configuración con
clave, el balance de la
pasteurizadora con un operador automático y que el exportable esté completo y al día.
