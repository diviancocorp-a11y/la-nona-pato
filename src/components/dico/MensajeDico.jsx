/**
 * MensajeDico — lo que dice Dico 2D, en el lenguaje del sistema.
 *
 * POR QUE NO ES EL GLOBO
 * El globo dibujado (`BurbujaDico`) es un objeto de historieta: papel crema,
 * trazo de pluma, trama de imprenta y una cola que apunta a quien habla. Eso
 * funciona cuando el que habla es un personaje presente en la escena —Dico
 * 3D— y se rompe cuando el que habla es un avatar de 60px clavado en el riel:
 * la cola pelea con la posicion, el papel crema no pertenece a ninguna de las
 * dos superficies del panel y el conjunto lee como una calcomania encima de
 * la aplicacion en vez de como una parte de ella.
 *
 * Asi que se parte en dos: **el globo queda para Dico 3D** y Dico 2D habla en
 * una tarjeta con el material del sistema —la misma superficie, el mismo
 * borde, el mismo radio que el resto del panel—.
 *
 * QUE SE CONSERVA, Y POR QUE
 * La letra y el tipeo. Son lo que hace que se sienta Dico y no una
 * notificacion cualquiera: el mismo cuerpo de 14/20, el mismo cursor de
 * consola vieja, la misma velocidad (`useTipeo`, compartido con el globo).
 * Cambia el envase, no la voz.
 *
 * ES UNA CAPA, NO UNA FILA
 * La tarjeta no participa nunca del flujo: la posiciona su contenedor
 * (`.dico-avisos-mensaje`) por encima de la pantalla que este abierta, con
 * sombra propia. Un aviso que empuja el catalogo hacia abajo obliga a
 * releer donde estaba todo cada vez que Dico abre la boca.
 */
import './mensaje.css';
import useTipeo from './useTipeo';

export default function MensajeDico({
  texto,
  nivel = 'sugerencia',
  /** Cuantos avisos quedan detras de este. */
  restantes = 0,
  /** Cual de la cola es este, para poder ubicarse: "2 de 4". */
  indice = 0,
  total = 1,
  accion,
  onAccion,
  onSiguiente,
  onCerrar,
}) {
  const { letras, completo, saltear } = useTipeo(texto);
  const hayPie = accion || restantes > 0;

  return (
    <div className={`dico-mensaje dico-mensaje--${nivel}`} role="status">
      <div className="dico-mensaje-cabecera">
        {/* La firma en Butler es la unica marca editorial de la tarjeta: sin
            ella, con el envase del sistema, el mensaje no se distingue de
            cualquier otro cartel del panel. */}
        <span className="dico-mensaje-firma">Dico</span>
        {total > 1 && (
          <span className="dico-mensaje-paso">{indice + 1} de {total}</span>
        )}
        {onCerrar && (
          <button
            type="button"
            className="dico-mensaje-cerrar"
            onClick={onCerrar}
            aria-label="Cerrar lo que dice Dico"
          >
            ✕
          </button>
        )}
      </div>

      {/* La reserva completa e invisible fija el alto desde el primer frame:
          sin ella la tarjeta crece letra a letra y empuja su propio pie. */}
      <button
        type="button"
        className="dico-mensaje-cuerpo"
        onClick={saltear}
        tabIndex={completo ? -1 : 0}
        aria-label={completo ? undefined : 'Completar mensaje de Dico'}
      >
        <span className="dico-mensaje-reserva" aria-hidden="true">
          {texto}
          <i className="dico-mensaje-cursor-reserva" />
        </span>
        <span className="dico-mensaje-texto" aria-hidden="true">
          {texto.slice(0, letras)}
          {!completo && <i className="dico-mensaje-cursor" />}
        </span>
      </button>

      {/* Para el lector de pantalla, siempre entero y desde el primer frame. */}
      <span className="dico-mensaje-lectura">{texto}</span>

      {hayPie && (
        <div className="dico-mensaje-pie">
          {accion && (
            <button type="button" className="dico-mensaje-accion" onClick={onAccion}>
              {accion}
            </button>
          )}
          {restantes > 0 && (
            <button type="button" className="dico-mensaje-siguiente" onClick={onSiguiente}>
              Siguiente
            </button>
          )}
        </div>
      )}
    </div>
  );
}
