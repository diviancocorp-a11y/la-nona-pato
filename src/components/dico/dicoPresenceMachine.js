export const DICO_PRESENCE_STATES = Object.freeze({
  NATIVE_IDLE: 'native_idle',
  NATIVE_NOTICE: 'native_notice',
  PHYSICAL_OPENING: 'physical_opening',
  PHYSICAL_OPEN: 'physical_open',
  PHYSICAL_CLOSING: 'physical_closing',
});

export const DICO_PRESENCE_EVENTS = Object.freeze({
  OPEN_NOTICE: 'open_notice',
  CLOSE_NOTICE: 'close_notice',
  OPEN_PHYSICAL: 'open_physical',
  PHYSICAL_OPENED: 'physical_opened',
  CLOSE_PHYSICAL: 'close_physical',
  PHYSICAL_CLOSED: 'physical_closed',
});

const S = DICO_PRESENCE_STATES;
const E = DICO_PRESENCE_EVENTS;

export function reduceDicoPresence(estado, evento) {
  switch (evento) {
    case E.OPEN_NOTICE:
      return estado === S.NATIVE_IDLE ? S.NATIVE_NOTICE : estado;
    case E.CLOSE_NOTICE:
      return estado === S.NATIVE_NOTICE ? S.NATIVE_IDLE : estado;
    case E.OPEN_PHYSICAL:
      return estado === S.NATIVE_IDLE || estado === S.NATIVE_NOTICE
        ? S.PHYSICAL_OPENING
        : estado;
    case E.PHYSICAL_OPENED:
      return estado === S.PHYSICAL_OPENING ? S.PHYSICAL_OPEN : estado;
    case E.CLOSE_PHYSICAL:
      return estado === S.PHYSICAL_OPEN ? S.PHYSICAL_CLOSING : estado;
    case E.PHYSICAL_CLOSED:
      return estado === S.PHYSICAL_CLOSING ? S.NATIVE_IDLE : estado;
    default:
      return estado;
  }
}

export function visibilidadDico(estado) {
  const native = estado === S.NATIVE_IDLE || estado === S.NATIVE_NOTICE;
  return {
    native,
    notice: estado === S.NATIVE_NOTICE,
    physical: !native,
  };
}
