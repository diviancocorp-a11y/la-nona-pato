/**
 * Vocabulario de Dico — TRES EJES INDEPENDIENTES.
 *
 * La leccion del lote anterior fue que un vocabulario unico para 2D y 3D
 * mezclaba cosas que no son la misma: una expresion facial, una pose corporal y
 * el estado del sistema son tres preguntas distintas y se combinan libremente.
 *
 *   nativeState    que CARA pone Dico 2D
 *   physicalPose   que POSE toma Dico 3D
 *   activity       que esta haciendo el SISTEMA
 *
 * NINGUNO determina a los otros. Que `activity` sea `processing` no implica
 * cara ni pose: el sistema puede estar trabajando con Dico en `neutral`, o
 * quieto con Dico en `alert`. Atarlos fue exactamente el error que dejo a
 * `processing` viviendo como si fuera una emocion.
 */

/* ───────────────────────── nativeState — Dico 2D ─────────────────────────
 * Comunica con CEJAS + OJOS. Sin boca. */
export const NATIVE_STATES = Object.freeze([
  'neutral',    // presencia base
  'curious',    // curiosidad / observacion
  'happy',      // confirmacion positiva
  'celebrate',  // hito / logro
  'alert',      // atencion seria / critico
  'concerned',  // problema suave / pendiente
  'question',   // duda / falta informacion
]);

/* ───────────────────────── physicalPose — Dico 3D ────────────────────────
 * Renders de alta calidad, una pose por archivo. `explain`, `pointDown` y
 * `pointUp` son POSES CORPORALES y no tienen equivalente en 2D: Dico 2D no
 * tiene cuerpo con el que senalar. */
export const PHYSICAL_POSES = Object.freeze([
  'idle',
  'explain',
  'pointDown',
  'pointUp',
  'thinking',
  'worried',
  'success',
  'error',
]);

/* ───────────────────────── activity — el sistema ─────────────────────────
 * Lo que consume `DicoPulso`. Es el unico eje que se expresa por movimiento. */
export const ACTIVITIES = Object.freeze([
  'idle',        // vivo, sin trabajo
  'active',      // invocado / interactuando
  'processing',  // ejecutando
  'thinking',    // analizando
  'attention',   // aviso relevante
]);

/* ───────────────────────────── Alias legacy ──────────────────────────────
 * Solo lo necesario para compatibilidad. `DicoAvisos`, `ProductsPanel`, la
 * vitrina y varios tests siguen pasando los nombres viejos.
 *
 * OJO con lo que revela este mapa: la lista vieja de `DicoCara` mezclaba los
 * tres ejes en uno. `processing` y `thinking` NO eran expresiones faciales,
 * eran actividad del sistema; por eso aparecen del lado de `activity` y no
 * tienen fila en `nativeState`. */
export const ALIAS_NATIVE_STATE = Object.freeze({
  // vocabulario B6 (ingles)
  idle: 'neutral',
  success: 'happy',
  worried: 'concerned',
  error: 'alert',
  question: 'question',
  // vocabulario original (espaniol)
  contento: 'happy',
  preocupado: 'concerned',
  pregunta: 'question',
});

export const ALIAS_PHYSICAL_POSE = Object.freeze({
  'point-down': 'pointDown',
  'point-up': 'pointUp',
  explaining: 'explain',
  pointing: 'pointDown',
  attention: 'pointUp',
});

export const ALIAS_ACTIVITY = Object.freeze({
  esperando: 'processing',
  pensando: 'thinking',
});

/**
 * Estados de la lista vieja de `DicoCara` que NO son expresiones faciales.
 * Se documentan aparte para que la migracion de B6R.4 no los arrastre a
 * `nativeState` por inercia.
 */
export const LEGACY_NO_ES_EXPRESION = Object.freeze({
  processing: 'activity',
  thinking: 'activity',
  esperando: 'activity',
  pensando: 'activity',
});

function resolver(valor, lista, alias, porDefecto) {
  const canonico = alias[valor] || valor;
  return lista.includes(canonico) ? canonico : porDefecto;
}

/** Resuelve alias y valores desconocidos al `neutral`. */
export const nativeStateCanonico = (v) =>
  resolver(v, NATIVE_STATES, ALIAS_NATIVE_STATE, 'neutral');

/** Resuelve alias y valores desconocidos al `idle`. */
export const physicalPoseCanonica = (v) =>
  resolver(v, PHYSICAL_POSES, ALIAS_PHYSICAL_POSE, 'idle');

/** Resuelve alias y valores desconocidos al `idle`. */
export const activityCanonica = (v) =>
  resolver(v, ACTIVITIES, ALIAS_ACTIVITY, 'idle');
