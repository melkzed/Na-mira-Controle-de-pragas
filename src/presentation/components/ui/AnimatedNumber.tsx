import { useEffect, useRef, useState } from 'react';
import { animate } from 'framer-motion';

/** Contador animado — anima de 0 até `value` ao montar/mudar. */
export function AnimatedNumber({
  value,
  format,
  duration = 1.1,
}: {
  value: number;
  format?: (n: number) => string;
  duration?: number;
}) {
  const [display, setDisplay] = useState(0);
  const prev = useRef(0);

  useEffect(() => {
    const controls = animate(prev.current, value, {
      duration,
      ease: [0.22, 1, 0.36, 1],
      onUpdate: (v) => setDisplay(v),
    });
    prev.current = value;
    return () => controls.stop();
  }, [value, duration]);

  return <>{format ? format(display) : Math.round(display).toLocaleString('pt-BR')}</>;
}
