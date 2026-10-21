# Lo que no se ve, también se limpia

Colección de cuatro juegos de 60 segundos sobre calidad en el envasado de cerveza. Usa la
estética del afiche (negros, naranjas quemados, latón steampunk y toques de Halloween).
Cada juego tiene **tres dificultades** (Fácil, Normal y Difícil) y termina con un
**Reporte de Calidad** con rango S/A/B/C.

Cuando el jugador se equivoca, sobre el operario aparece una **burbuja de pensamiento**
que dice **"¡Esto no va así!"** y explica el porqué, por ejemplo *"El agua caliente para
sanitizar debe estar a 85 °C. ¡Las bacterias sobrevivieron!"*. Esos errores se repiten
al final en el reporte, en la sección "Lo que no va así".

| # | Juego | De qué va |
|---|---|---|
| 1 | **Pasteurizadora Flash** · Turno 60 | Mantener temperatura, flujo y retención en rango mientras las alarmas se acumulan. |
| 2 | **CIP Rush** · El Turno de la Limpieza | Químico correcto → TACT en el panel → escobillado de la llenadora → ATP < 50 URL. |
| 3 | **El Cazador de Riesgos** · Recorrido UV | Línea a oscuras: encontrar 5 focos de contaminación con linterna UV y limpiarlos con la herramienta correcta. |
| 4 | **Línea en Paro** · Decisiones Bajo Presión | Aplicar el plan de reacción según cuánto lleva parada la línea, sin ceder a la presión de arrancar ya. |

## Cómo jugar

**Sin conexión:** descarga [`dist/lo-que-no-se-ve.html`](dist/lo-que-no-se-ve.html) y
ábrelo con doble clic en cualquier navegador moderno. Es un único archivo (~310 KB) con
el código y las fuentes incrustados: no pide nada a internet, así que se puede copiar a
un USB o mandar por correo.

**Desde el código:** abre `index.html` directamente (también funciona sin conexión) o
sírvelo con pnpm:

```
pnpm install
pnpm start          # http://localhost:8080
```

Flujo: **menú de juegos** (← → o ratón) → **dificultad** (↑ ↓, 1-3 o clic: cada tarjeta
explica qué cambia) → **turno de 60 s** → **Reporte de Calidad** (ENTER repetir · D
cambiar dificultad · ESC menú). P pausa y M silencia en cualquier juego. Los récords
se guardan por juego y por dificultad en el navegador.

Controles comunes: **WASD/flechas** moverse · **E** operar (E o Esc para salir) ·
**Espacio** confirmar o mantener · **TAB** manual de consulta · **1-4** opciones.

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

## Estructura

```
index.html              lienzo, fuentes locales y carga de scripts
dist/                   exportable de un solo archivo (generado con pnpm build)
assets/fonts/           Rajdhani y Share Tech Mono (SIL Open Font License)
scripts/build.mjs       genera el exportable
src/core/draw.js        lienzo, tema del afiche, HUD, paneles, jugador, utilidades
src/core/bubble.js      burbuja de pensamiento "¡Esto no va así!"
src/core/world.js       movimiento cenital con colisiones y estaciones
src/core/screens.js     menú, selector de dificultad, pausa y Reporte de Calidad
src/content/manual.js   contenido técnico de los juegos (revisar con el manual)
src/games/*.js          un archivo por juego (CIP, cazador, paro, adaptador pasteurizadora)
src/config.js, sim.js, minigames.js, render.js   motor de la Pasteurizadora Flash
src/audio.js            efectos sintetizados con WebAudio
src/main.js             teclado, ratón, bucle y pantallas
test/                   pruebas con node:test
```

La lógica de los juegos no toca el DOM y acepta una semilla, así que se prueba en Node:

```
pnpm test
```

Las pruebas cubren las reglas de cada juego (caminos correctos e incorrectos, burbujas,
puntuación y game over), el balance de la pasteurizadora con un operador automático y
que el exportable esté completo y al día.
