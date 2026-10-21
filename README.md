# Pasteurizadora Flash: Turno 60

Juego frenético de 60 segundos en vista cenital 2D. Eres el único operador de una
pasteurizadora flash en una cervecería: corres entre estaciones (al estilo *Among Us*),
ajustas variables y reparas fallas mientras las alarmas se acumulan. No hay impostor:
la amenaza es la máquina descontrolándose.

Al terminar el turno ves **HL procesados, aprobados, desechados, eficiencia, causa
principal de descarte y rango (S/A/B/C)**.

## Cómo jugar

Abre `index.html` en el navegador (funciona directamente desde el disco, sin compilar).
También puedes servirlo con `npm start` y entrar en <http://localhost:8080>.

| Tecla | Acción |
|---|---|
| WASD / flechas | Moverse |
| E | Operar la estación cercana (E o Esc para salir) |
| A / D (o ← / →) | Ajustar la variable de la estación |
| Espacio | Mini-juegos de mantener/sincronizar |
| Flechas / WASD | Secuencia de la válvula trabada |
| 1-4 | Patrón de colores del sensor loco |
| P | Pausa · R reinicia desde la pausa |
| M | Silenciar |

## Reglas

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
  antes (rango máximo C). Con solo tres variables, "más de 3" no podría ocurrir nunca,
  así que el umbral es 3. Se desactiva con `PLANT_STOP.enabled` en `src/config.js`.
- **Rango:** S ≥ 95 % · A ≥ 85 % · B ≥ 70 % · C < 70 %.
- La causa principal se marca como *intermitente* si tuvo 3 o más episodios.

### Fallas

| Falla | Estación | Efecto | Solución |
|---|---|---|---|
| Deriva térmica | T | La temperatura sube o baja | Ajustar con A/D hasta estabilizar en la banda ideal |
| Golpe de vapor | T | Subida rápida de temperatura | Mantener Espacio (enfriamiento de emergencia) |
| Deriva de caudal | V | El flujo deriva | Ajustar con A/D |
| Válvula trabada | V | El flujo queda fijo fuera de rango | Secuencia de flechas |
| Espuma | V | Flujo alto y el tiempo de retención baja | Espacio cuando la aguja esté en la zona (×3) |
| Bomba con aire | B | El flujo oscila | Mantener la presión en verde con Espacio |
| Cinta lenta | B | El tiempo de retención sube | Ajustar con A/D |
| Sensor loco | T, V o B | La lectura miente durante unos segundos | Repetir el patrón de colores (1-4) |

Las derivas se cierran manteniendo la variable 0,6 s en la banda ideal estando en la
estación. Las reparaciones quitan la falla, pero lo que ya se desvió (p. ej. la temperatura
tras un golpe de vapor) hay que reajustarlo a mano.

Colores de alarma: **amarillo** = activa o cerca del límite; **rojo** = descartando;
**rojo intermitente** = estación bloqueada o dos o más alarmas rojas a la vez.

### Curva de dificultad

| Tramo | Qué pasa |
|---|---|
| 0–10 s | Una sola deriva: tutorial implícito |
| 10–35 s | Derivas y hasta dos reparaciones, máximo 2 alarmas a la vez |
| 35–50 s | Siempre 2 alarmas simultáneas; entra el sensor loco |
| 50–60 s | Hora pico: hasta 3 fallas, bloqueos breves de estación, sirena y pantalla roja |

## Estructura

```
index.html          lienzo y carga de scripts
src/config.js       todos los números de balance, el mapa y la curva de dificultad
src/minigames.js    lógica pura de los cinco mini-juegos
src/sim.js          simulación determinista (variables, eventos, jugador, contabilidad)
src/render.js       dibujo en canvas: planta, HUD, paneles, pantallas
src/audio.js        efectos sintetizados con WebAudio
src/main.js         teclado, bucle y pantallas
test/               pruebas de la simulación con node:test
```

La simulación no toca el DOM y acepta una semilla, así que se prueba en Node:

```
npm test
```

Las pruebas incluyen un operador automático que recorre el turno con tiempos de viaje
simulados; sirve para medir el balance al tocar `src/config.js`. Con viajes de unos 1,6 s
el bot promedia alrededor de un 84 % (rangos A/B); un operador ocioso apenas pasa del 10 %.
