# Vitrina

Ver **una** pantalla del panel en el navegador, sin base, sin sesión y sin
tenant.

```bash
npm run vitrina        # http://localhost:5199
```

## Para qué existe

El panel exige login y un negocio real, así que las pantallas nuevas se venían
dando por buenas con tests de render: nadie las miraba. Las etapas 6c-6e
cerraron con la frase *"ninguna pantalla se vio renderizada en un navegador"*.
Esto lo arregla.

**No reemplaza probar contra la base.** Prueba cómo SE VE algo, no si la base
contesta lo que la pantalla cree. Los bugs caros de las últimas etapas
salieron ejecutando SQL y van a seguir saliendo de ahí.

## Agregar una escena

Un archivo en `escenas/`. El glob lo levanta solo, no hay registro que
mantener:

```jsx
// escenas/loquesea.jsx
import MiPantalla from 'app/components/admin/platform/MiPantalla.jsx';

export default {
  titulo: 'Lo que muestra',
  componente: MiPantalla,
  props: { /* lo que la pantalla recibe */ },
  datos: {                       // opcional: sólo si la pantalla consulta
    tablas: { mi_tabla: [ /* filas */ ] },
    rpc: { mi_rpc: (args) => 42 },
    functions: { 'mi-edge-function': async (body) => ({ ok: true }) },
  },
};
```

`app/` apunta a `src/`.

## Cómo funciona

Se intercepta `src/lib/supabase.js` y se lo cambia por `fake-supabase.js`. La
pantalla corre **su service de verdad** —con su traducción de errores y sus
claves de idempotencia—; lo único falso son las filas.

El fake aplica `eq` y ordena. Nada más. Si una pantalla necesita algo que no
hace, la respuesta es probarla contra la base, no agrandar el fake hasta que
sea un motor de consultas peor.

Las RPC y edge functions que la escena no declara devuelven un error que lo
dice con nombre y apellido, en vez de fallar en silencio.

Todo va por `datos` y nada por asignación directa al fake: el glob evalúa
**todas** las escenas al cargar, así que una que le asigne algo al módulo
compartido se lo pisa a las demás. Pasó: la pantalla de cobros recibía el
router de la de equipo.
