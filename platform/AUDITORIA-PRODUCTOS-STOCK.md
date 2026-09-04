# Auditoría — ¿Productos e Inventario son un solo workspace?

Fecha: 2026-09-04 · Estado: **AUDITORÍA. No se implementó nada.**
Origen: Phase 4 · VISUAL CONVALIDATION PASS 2, punto 8.

La pregunta: si conviene evolucionar hacia `CATÁLOGO → [ Productos ] [ Inventario ]`.
La respuesta corta: **para dos de los tres rubros sí, para gastronomía no**, y
eso mismo es el hallazgo que decide el diseño.

---

## 1. Qué son hoy, en el esquema real

Leído de `scripts/platform-schema.json` y `src/modules/registry.js`.

| Tabla | Columnas relevantes |
|---|---|
| `products` | id, type, name, price, active, category, **stock**, duration_min, requires_age_gate, image_url |
| `ingredients` | id, name, unit, **cost**, **stock**, **min_stock**, category, food_category, is_archived |
| `product_ingredients` | product_id, ingredient_id, **qty** |
| `product_variants` | product_id, size, color, sku, barcode, price, **stock** |
| `inventory_movements` | ingredient_id, **variant_id**, kind, qty, unit_cost, reference |

**Hay tres lugares distintos donde vive un "stock"** —`products.stock`,
`ingredients.stock`, `product_variants.stock`— y no son lo mismo:

- `products.stock` es el de una **unidad que se vende tal cual**.
- `ingredients.stock` es el de un **insumo que se consume** al vender otra cosa.
- `product_variants.stock` es el de un **talle/color concreto**.

## 2. Por vertical

### Gastronomía (`gastro`, `receta: true`)

Módulos: products, orders, stock, finanzas, ventas, caja, **mesas**, personal.

**Lo que se vende no es lo que se stockea.** Una milanesa napolitana no tiene
stock: tienen stock la carne, el pan rallado y el queso. La relación es
`product_ingredients` con una cantidad, y es de muchos a muchos.

- Comparten: nada directamente. Se tocan **a través de la receta**.
- No se pueden fusionar: la unidad de `products` es "plato" y la de
  `ingredients` es kg/litro/unidad. Una grilla común mentiría en la columna
  cantidad.
- **Veredicto: NO fusionar.** Son dos entidades con vocabularios distintos.
  Lo que sí tiene sentido acá es lo contrario: mostrar en el producto **qué
  insumos lo componen** —ya existe `margen()` haciendo ese cruce— y en el
  insumo **qué platos lo usan**.

### Barbería (`barber`)

Módulos: products, orders, **agenda**, stock, finanzas, ventas, caja, personal.
Campos: los base + `duration_min`. **Sin `stock` y sin receta.**

**Lo que se vende es tiempo, no cosas.** Un corte de pelo no tiene existencias.
El módulo `stock` acá sirve para lo que se *usa* (tinturas, shampoo) y para lo
que se *revende* (productos de peinado), pero eso hoy vive todo en
`ingredients`.

- Comparten: nada. `products` es el menú de servicios; `ingredients` es el
  depósito.
- **Veredicto: fusionar es engañoso**, pero por otra razón que en gastro: acá
  el catálogo **no tiene stock en absoluto**, así que una pestaña
  "Inventario" al lado de "Servicios" sugiere una relación que no existe.

### Indumentaria / retail (`retail`)

Módulos: products, orders, **variants**, stock, finanzas, ventas, caja, personal.
Campos: los base + **`stock`** + requires_age_gate.

**Acá sí son la misma cosa.** Una remera talle M azul *es* una fila de
`product_variants` con su `stock` y su `sku`. Vender una unidad baja ese stock
directamente: no hay receta en el medio. `inventory_movements` incluso tiene
`variant_id` para eso.

- Comparten: **la identidad**. El producto y su existencia son la misma fila.
- **Veredicto: fusionar es lo correcto**, y de hecho hoy están artificialmente
  separados: cargar un producto y después ir a otra pantalla a decirle cuántos
  hay es un paso de más que sólo existe por cómo está partida la navegación.

## 3. Respuestas a lo preguntado

**Qué entidades comparten.** Sólo retail comparte identidad
(`products` ↔ `product_variants`). Gastro comparte una *relación*
(`product_ingredients`), no una entidad. Barbería no comparte nada.

**Qué datos no pueden fusionarse.** La unidad de medida y el costo.
`ingredients` tiene `unit`, `cost` y `min_stock`; `products` no tiene ninguno
de los tres, y el edificio **no tiene modelo de costos** (`unit_cost` va en 0,
ver el HANDOFF). Una grilla común tendría tres columnas vacías para gastro y
llenas para retail.

**Qué navegación podríamos eliminar.** En retail, la pestaña `stock` entera:
su contenido cabe como una columna más en la fila del producto. En gastro y
barbería no se elimina nada — se renombra.

**Qué podría verse unido sin cambiar el modelo.** Tres cosas, todas de
presentación:

1. **La columna "sin stock" del resumen de Productos** — ya implementada en
   este pase, y ya condicionada a que existan datos.
2. **En retail**, mostrar el stock de la variante en la fila del producto.
   Lectura sola, sin editar: `product_variants.stock` ya está.
3. **En gastro**, mostrar en la fila **de qué insumo depende** un producto sin
   receta cargada. Es la información que hace que `margen()` devuelva `null`.

## 4. Recomendación

**No hacer un workspace `CATÁLOGO` único para los tres rubros.** El registry ya
resuelve por rubro qué módulos existen (`modulosDe`); la fusión correcta es
**por vertical**, no global:

- **retail** → `Catálogo` con Productos e Inventario como dos vistas de lo
  mismo. Es la única donde la pestaña separada es puro costo de navegación.
- **gastro** → dejar separado y **cruzar por receta**, que es la relación real.
- **barber** → dejar separado; renombrar `stock` a algo que diga que es el
  depósito y no el catálogo de servicios.

Hacerlo global forzaría a gastro y barbería a una metáfora que no es la suya
para ahorrarle una pestaña a retail.

## 5. STOP

Nada de esto está implementado. Requiere decisión de producto y, si se aprueba
la variante de retail, su propia fase — toca navegación, el registry y la
pantalla de Stock, que es un componente **del admin legacy reusado**.
