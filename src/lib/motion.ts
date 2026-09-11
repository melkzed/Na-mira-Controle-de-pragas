/** Variantes de animação compartilhadas.
 *
 *  Ficam fora do arquivo de componentes: um módulo que exporta componentes e
 *  mais alguma coisa perde o hot reload no Vite. */
export const staggerItem = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.22, 1, 0.36, 1] } },
};
