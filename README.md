# Lo que no se ve, también se limpia

Colección de seis juegos cortos sobre calidad y gestión en el envasado de cerveza. Usa la
estética del afiche (negros, naranjas quemados, latón steampunk y toques de Halloween).
Cada juego tiene **tres dificultades** (Fácil, Normal y Difícil) y termina con un
**Reporte de Calidad** con rango S/A/B/C. Se juega con **teclado y ratón o con mando de
PlayStation o Xbox**: los botones que se ven en pantalla cambian solos según el mando.

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
| 6 | **Supervisor de Turno** · GLY · LEF · OSE | Administración del turno: leer el tablero de KPI para descubrir dónde se pierden las horas (modo *Diagnóstico*) o clasificar cada pérdida del reporte por el KPI que afecta (modo *¿Qué KPI cae?*). 6 turnos de 20 s: 2 min máximo. |

## Cómo jugar

**Sin conexión:** descarga [`dist/lo-que-no-se-ve.html`](dist/lo-que-no-se-ve.html) y
ábrelo con doble clic en cualquier navegador moderno. Es un único archivo (~380 KB) con
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
silencia en cualquier juego. Los récords se guardan por juego y por dificultad en el
navegador.

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

### Generar el exportable

```
pnpm build                      # → dist/lo-que-no-se-ve.html
pnpm build ruta/otro-nombre.html
```

`scripts/build.mjs` toma `index.html`, incrusta cada `<script src>` y convierte las fuentes
en `data:` URIs. Si queda algún recurso externo, el build falla. El archivo de `dist/` se
versiona para poder descargarlo desde GitHub. `pnpm test` avisa si quedó desactualizado,
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

El objetivo es aprender cómo se relacionan GLY, LEF y OSE, qué las afecta y qué
factores están en el poder de la línea. Cada partida son **6 turnos de 12 h**
simulados en **20 s** cada uno (2 min como máximo). El modo se elige en la pantalla de
inicio, junto a la dificultad.

**Convención (la de los ejemplos del material):** las tres métricas se calculan
sobre las horas totales del turno, y cada una descuenta un nivel más de pérdidas.

| KPI | Fórmula | Pérdidas que descuenta | Ejemplos |
|---|---|---|---|
| GLY | (T − planificación) / T | planificación / utilización | sin personal, sin programa, cambio de formato programado, CIP y preventivo programados |
| LEF | (T − planificación − externas) / T | + externas (otra área) | materiales, espera de Calidad, pallets, servicios industriales, logística, planificación incorrecta |
| OSE | (T − planificación − externas − internas) / T | + internas (la línea) | averías, fallas eléctricas, microparadas, atascos, operación lenta, cambios mal ejecutados |

Siempre GLY ≥ LEF ≥ OSE. Con los turnos A, B y C del material, el juego da exactamente
95,8 / 94,2 / 93,3 %, 95,8 / 79,2 / 77,5 % y 95,8 / 94,2 / 77,5 % (hay una prueba que
lo comprueba).

> El árbol del material pone las paradas programadas *debajo* del GLY, pero su cálculo
> (y los tres ejemplos) las descuenta *en* el GLY. El juego sigue el cálculo. Conviene
> confirmar la definición con el manual de la planta: hay empresas que usan otro
> denominador u otro orden.

**Modo Diagnóstico de turno.** El tablero muestra GLY, LEF y OSE en vivo, acumulados
hasta la hora actual. Cuando ves dónde está la gran caída, respondes en el rombo de
botones, que imita la cara del mando:

| Botón | Respuesta | Patrón |
|---|---|---|
| ▲ (↑ / △ / Y) | Planificación | GLY, LEF y OSE bajos |
| ◀ (← / □ / X) | Externo | GLY alto, LEF y OSE bajos |
| ▶ (→ / ○ / B) | Interno | GLY y LEF altos, OSE bajo |
| ▼ (↓ / ✕ / A) | Excelente | todo alto (≥ 90 %) |

Después viene la segunda pregunta, **"¿con quién la atacas?"**: Mantenimiento u
Operación (en el poder de la línea); Abastecimiento, Calidad o Servicios (se escala);
Planificación; o estandarizar si el turno fue excelente. Diagnóstico +100, acción +50.

**Modo ¿Qué KPI cae?** El turno corre unos segundos con la línea a la vista. Al final
llega el **reporte de fin de turno** con lo que falló, y cada pérdida se clasifica por
el primer KPI que la ve: GLY, LEF u OSE (+50 cada una). Hay pares trampa a propósito:

- *Cambio de formato programado* (GLY) frente a *cambio de formato excedido* (OSE).
- *Sin programa* (GLY) frente a *cambio de plan a última hora* (LEF).
- *Espera de Calidad* (LEF, no interna).
- *Velocidad reducida* (OSE aunque la línea no pare).

**Herramientas y dificultad.** Los KPI se calculan siempre con las causas reales: los
reportes pueden mentir, los números no.

- **Ver la línea** (V / R1 / RB) muestra la causa real en vivo.
- **Llamar y verificar** (C / L1 / LB) confirma los reportes del turno. Se puede usar
  3, 2 o 1 vez por partida.
- **Fácil:** línea y reportes a la vista con su tipo de pérdida, la regla rápida y
  las brechas marcadas en el tablero.
- **Normal:** reportes sin verificar, la línea y los reportes se alternan, y hay
  señuelos que acercan las brechas.
- **Difícil:** reportes equivocados, la línea sin rótulos, y siempre hay señuelos y
  trampas.

La ayuda (H / SHARE / VIEW) pausa el turno y explica el árbol de las métricas, la regla
rápida, los turnos A, B y C, y qué está en el poder de cada uno. El reporte final
muestra los aciertos (por KPI en el segundo modo) y la confusión más frecuente.

## Estructura

```
index.html              lienzo, fuentes locales y carga de scripts
dist/                   exportable de un solo archivo (generado con pnpm build)
assets/fonts/           Rajdhani y Share Tech Mono (SIL Open Font License)
scripts/build.mjs       genera el exportable
src/core/pad.js         mandos PS/Xbox: detección, flancos y traducción a acciones
src/core/draw.js        lienzo, tema del afiche, HUD, paneles, jugador, botones del mando
src/core/bubble.js      burbuja de pensamiento "¡Esto no va así!"
src/core/world.js       movimiento cenital con colisiones y estaciones
src/core/screens.js     menú, selector de dificultad, pausa y Reporte de Calidad
src/content/manual.js   contenido técnico de los juegos (revisar con el manual)
src/content/kpi.js      GLY, LEF y OSE: fórmulas, catálogo de pérdidas y explicaciones
src/games/*.js          un archivo por juego (CIP, cazador, paro, control de UP, supervisor, adaptador pasteurizadora)
src/config.js, sim.js, minigames.js, render.js   motor de la Pasteurizadora Flash
src/audio.js            efectos sintetizados con WebAudio
src/main.js             teclado, ratón, mando, bucle y pantallas
test/                   pruebas con node:test
```

La lógica de los juegos no toca el DOM y acepta una semilla, así que se prueba en Node:

```
pnpm test
```

Las pruebas cubren las reglas de cada juego (caminos correctos e incorrectos, burbujas,
puntuación y game over), la fórmula de UP, la lectura de mandos PS/Xbox, el balance de la
pasteurizadora con un operador automático y que el exportable esté completo y al día.
