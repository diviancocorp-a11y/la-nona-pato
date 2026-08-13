# Hoja REAL HOY / MOCK — vacuna anti-riesgo #1

> Abrir ESTA hoja antes de cada demo. Cuando el prospecto pregunte "y esto
> cuando lo tengo?", la respuesta sale de aca, no del entusiasmo del momento.
> Regla: una fila pasa de MOCK a REAL HOY **solo** cuando esta en produccion y
> probada. Ultima actualizacion: 9/jul/2026.

---

## Las dos columnas

| REAL HOY (productivo, se puede prometer) | MOCK (dibujo en la demo, NO existe aun) |
|------------------------------------------|------------------------------------------|
| Catalogo, pedidos y pagos online (gastro) — codigo probado, se re-monta en el edificio nuevo | Todo BARBERIA: agenda/turnos, staff+comisiones, ficha de visita, memberships |
| Cobro online con MercadoPago (checkout) | Todo ROPA: variantes talle/color, barcode, devoluciones/nota de credito, etiquetas |
| Auth + roles + panel admin | POS + Caja presencial (arqueo, pago mixto, fiado, ticket termico) |
| Stock, compras, gastos, proveedores, merma | Multi-tenant / 1 DB compartida con aislamiento |
| CRM + push + cupones/referidos | Pagina de registro self-service que provisiona el tenant |
| Facturacion AFIP | Vocabulario por rubro / module registry (nav que cambia por vertical) |
| Recetas/BOM, food cost, menu engineering (gastro) | Sincronizacion e-com <-> local para ropa |
| Reportes y exports | Recordatorios de turno SMS/push (barberia) |

---

## Respuestas listas (guion honesto)

**"Cuando lo tengo?"**
La base ya esta productiva hoy (catalogo, pedidos, pagos online, stock, caja de
numeros). Barberia y ropa las construimos al cerrar con vos; te doy fecha por
modulo cuando definimos tu pack. Lo que ves de agenda o de variantes en esta
pantalla es maqueta para mostrarte el flujo.

**"Puedo cobrar en el local hoy?"**
El POS presencial (caja, arqueo, ticket) esta en construccion y es lo primero
del core. Real hoy es el cobro online con MercadoPago.

**"Mis datos quedan separados de otros comercios?"**
Si. Aislamiento por tenant con control a nivel base de datos y test de
aislamiento automatico. En la plataforma nueva es requisito desde el dia 1.

**"Se sincroniza mi tienda online con el local?"**
Es parte del pack ropa; hoy es maqueta. El catalogo + stock unificado que ya
corre en gastro es la base sobre la que se construye.

---

## Como usar esta hoja

1. Antes de la demo: releer las dos columnas y los 3-4 guiones que apliquen al rubro del prospecto.
2. Durante la demo: si algo no esta en la columna REAL HOY, no se promete con fecha. Se dice "esto es lo que viene, lo definimos en tu plan".
3. Despues de cada release: mover a REAL HOY solo lo que quedo en produccion y probado. Nada mas.
