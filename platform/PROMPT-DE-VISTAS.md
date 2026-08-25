# Cómo pedir una vista de Dico

> Plantilla para generar pantallas del panel (propias o con un modelo) sin que
> salgan inconsistentes. Complementa `PLAN-DICO.md` (el personaje) y el sistema
> visual (los colores). Esto es **cómo se pide**, no qué color se usa.

---

## La regla de fondo

El sistema visual **no se pega en el prompt**. Vive en un archivo de tokens del
repo y el prompt dice "usá las variables, nada de hex crudo". Un documento de
16 secciones pegado en cada pedido diluye la única instrucción que importa
—cuál es la acción principal de esta pantalla— entre 4000 palabras de
justificación cromática.

Lo que sí se pega, siempre, son **los datos que existen de verdad**. El 90% de
lo que sale mal de una pantalla generada no es el color: son campos inventados,
roles que no existen y estados que nadie contempló.

---

## El esqueleto (8 bloques, en este orden)

### 1. Contrato de datos
Tabla, columnas reales y RPC que la lee. Literal, copiado del schema.

> Lee `sales` (id, total, payment_method, created_at, branch_id) vía la RPC
> `ventas_del_dia(p_branch_id)`. **No inventes columnas**: si algo falta,
> decilo en vez de suponerlo.

Sin esto el modelo escribe `sale.customerName` porque suena razonable, y no
existe.

### 2. Rol y alcance
El id sale de `src/modules/roles.js`. Los roles son siete: `owner`, `manager`,
`cashier`, `attendant`, `kitchen`, `marketer`, `accountant`. El nivel de acceso
por módulo sale de la matriz `ACCESO` del mismo archivo: `completo`, `propio`,
`lectura`, `nada`.

> Rol: `cashier`. Acceso a `ventas`: `propio` — ve **sólo lo de su turno**, no
> lo de la sucursal. `finanzas` en `nada`: la sección no se renderiza, no se
> renderiza deshabilitada.

Esto es lo que hace determinista la "vista por rol". Sin la matriz, cada
pantalla inventa su propio criterio de qué esconder.

**Ojo:** esconder en la UI no es permiso. El permiso está en las policies
(0050). El prompt pide la vista; la policy ya decide.

### 3. Rubro
`gastro | barber | retail`, y la terminología sale de `src/modules/registry.js`.

> Rubro `barber`. El operario del servicio se llama **Barbero**, no Mozo. No
> preguntes `vertical === 'barber'` en el componente: preguntale al registry.

### 4. Objetivo en una frase + la acción principal
Una sola. Es el único amarillo de la pantalla.

> Objetivo: que el cajero cierre su turno sin pensar. Acción principal:
> **Cerrar caja**. Todo lo demás es secundario o terciario.

Si no podés nombrar una sola acción principal, la pantalla hace dos cosas y
hay que partirla antes de dibujarla.

### 5. Densidad
Dispositivo y filas visibles sin scroll. Es el bloque que más cambia el
resultado y el que siempre se omite.

> Teléfono en la mano de un mozo, una mano, pantalla sucia. 6 pedidos visibles
> sin scrollear. Target táctil mínimo 48px. Nada de hover como único indicador.

### 6. Los cuatro estados obligatorios
Vacío, cargando, error y sin permiso. Son los que el operador ve todos los días
y los que la pantalla generada nunca trae.

> Vacío: negocio recién dado de alta, cero ventas — texto que diga qué hacer,
> no "sin datos". Cargando: esqueleto, no spinner centrado. Error: qué pasó y
> qué botón apretar. Sin permiso: no mostrar la sección.

### 7. Dico
Qué estado y cuándo. Ver la sección de abajo.

### 8. Prohibiciones
Cuatro líneas, no dieciséis secciones.

> Sin hex crudos (variables del archivo de tokens). Sin librerías nuevas. Sin
> color como único portador de significado: todo estado lleva texto o forma.
> Amarillo sólo en la acción principal, el foco y el ítem seleccionado.

---

## Ejemplo armado

```
Pantalla: cierre de caja.
1. DATOS: `cash_sessions` (id, opened_at, closed_at, opening_amount,
   counted_amount, branch_id) + `payments` del turno. RPC `arqueo_del_turno`.
   No inventes columnas.
2. ROL: cashier. `caja`=completo (sólo SU turno), `ventas`=propio,
   `finanzas`=nada, `personal`=nada.
3. RUBRO: gastro.
4. OBJETIVO: cerrar el turno sin pensar. Acción principal: Cerrar caja.
5. DENSIDAD: teléfono, una mano. Los medios de pago entran sin scroll.
   Targets 48px.
6. ESTADOS: turno sin ventas / cargando / falla la RPC / no hay turno abierto.
7. DICO: `preocupado` sólo si la diferencia del arqueo supera el umbral.
   `contento` al cerrar sin diferencia. En ningún otro momento.
8. PROHIBIDO: hex crudos, librerías nuevas, color solo, amarillo fuera de
   "Cerrar caja".
```

---

## Dico dentro del sistema

Dico **ya existe y está deployado**: `src/components/dico/DicoCara.jsx`, cinco
estados (`idle`, `esperando`, `contento`, `preocupado`, `pregunta`), usado en
`DicoAvisos.jsx`, con las reglas de cuándo aparece en `src/modules/dico/`
(`reglas.js`, tope de 4 avisos; `oportunidades.js`, tope de 2).

El sistema visual no tiene que reinventarlo. Tiene que describir **su lugar**:

- **Dico define el amarillo, no compite con él.** Es el punto más cálido y más
  saturado de la marca y ya está en pantalla. El token de acción se acomoda a
  la moneda; al revés se ve como un error de impresión.
- **Sus estados son el puente con la paleta semántica**: `contento` ↔ éxito,
  `preocupado` ↔ advertencia, `pregunta` ↔ información. Ese mapeo es lo que
  convierte al personaje en parte del sistema y no en un adorno.
- **Un Dico por pantalla, y nunca en la misma fila que la acción principal.**
  Si los dos pelean por el 10% de amarillo, pierde el botón — que es lo único
  que el operador necesita encontrar rápido.
- **El único lugar donde se permite una superficie amarilla grande es el alta**,
  porque todavía no hay datos con los que competir.
- Respeta `prefers-reduced-motion`: quien pidió menos movimiento lo ve quieto.

---

## La página de alta

**No se crea: ya existe.** `src/pages/Signup.jsx`, 300 líneas, ruta `/registro`,
sólo en el dominio raíz (en el subdominio de un tenant no tiene sentido). Y
funciona: se verificó contra la base que `tienda-nueva` nació de ahí con dueño,
settings, tres medios de pago y sucursal creados solos.

O sea que el pedido es **rediseño**, y hay que decirlo en el prompt o sale una
pantalla linda que escribe en campos que no existen y rompe un camino que anda.

La estructura que se le pasa al modelo es esta:

| Bloque | Qué |
|---|---|
| Campos | `bizName`, `slug`, `vertical`, `modo`, `country`, `email`, `password`. Siete, ninguno más |
| Lo que NO pregunta | Los canales. Son diez y la pantalla promete "un minuto"; se derivan de rubro+modo (`canalesSugeridos`) y se editan después. **Está decidido, no lo agregues** |
| Fuentes | `VERTICALES` local, `modosDisponibles()` y `paisesDisponibles()` de los registries |
| Async | `slugDisponible()` con debounce → `null / 'checking' / true / false`. `registrarNegocio()` → RPC `signup_tenant` |
| Reglas del slug | `slugify` + `validateSlug` + reservados (viven en **dos** lugares: `src/lib/tenantHost.js` y `is_reserved_slug`) |
| Estados | `enviando`, `error`, `listo` |
| Paleta actual | Un objeto `C` hardcodeado con `#e8b947` — que es la moneda de Dico, no el amarillo del doc |

Esa última fila es el punto: **el rediseño del alta es exactamente donde se
decide el amarillo de la marca.** Conviene resolverlo ahí antes de tocar el
panel, porque es una pantalla sola y sin datos.

---

## Mejora al proceso

Antes de generar una sola vista más, dos cosas de una tarde:

1. **Un archivo de tokens y un alcance escrito.** Hoy hay tres
   (`hermes-tokens.css` catálogo, `admin-tokens.css` panel legacy,
   `catalog-pro/tokens.css` temas). Un cuarto sin regla de alcance no unifica
   nada: multiplica. Que el archivo diga en la cabecera qué pantallas manda.
2. **Un check de pre-commit que falle con hex crudo** en archivos nuevos del
   panel. Es la misma familia de bug que el Zod vs DB: la convención que no
   tiene un check que la sostenga se rompe sola en tres semanas. Ahí ya hay
   cuatro checks corriendo; este entra al lado.

Con eso, el prompt se vuelve corto de verdad —"usá las variables"— y la
consistencia deja de depender de acordarse.
