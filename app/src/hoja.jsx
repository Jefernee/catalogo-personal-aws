import { useEffect, useRef } from "react";
import { Cerrar } from "./iconos";

/**
 * En un celular, el teclado virtual no achica la pantalla: la tapa. Una hoja
 * que mide "100vh" queda con media hoja debajo del teclado, y el campo que se
 * está escribiendo desaparece.
 *
 * visualViewport sí sabe cuánto espacio queda visible. Se publica en dos
 * variables CSS y la hoja se ajusta a ellas: el botón de guardar, que va
 * arriba, nunca queda tapado.
 */
export function useAreaVisible() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return undefined;

    const raiz = document.documentElement;
    const actualizar = () => {
      raiz.style.setProperty("--alto-visible", `${Math.round(vv.height)}px`);
      raiz.style.setProperty("--arriba-visible", `${Math.round(vv.offsetTop)}px`);
    };
    actualizar();
    vv.addEventListener("resize", actualizar);
    vv.addEventListener("scroll", actualizar);
    return () => {
      vv.removeEventListener("resize", actualizar);
      vv.removeEventListener("scroll", actualizar);
    };
  }, []);
}

/** En pantallas táctiles no se enfoca solo: abrir el teclado de golpe empuja todo. */
export const esTactil = () =>
  typeof window !== "undefined" && window.matchMedia?.("(pointer: coarse)").matches;

/** Al enfocar un campo dentro de la hoja, se asegura de que quede a la vista. */
export function alEnfocarMostrar(e) {
  const campo = e.target;
  if (!(campo instanceof HTMLElement) || !campo.matches("input, textarea, select")) return;
  // Espera a que el teclado termine de abrir y el área visible se ajuste. Para
  // entonces la hoja pudo haberse cerrado: solo se mueve si el campo sigue ahí.
  setTimeout(() => {
    if (campo.isConnected) campo.scrollIntoView?.({ block: "center", behavior: "smooth" });
  }, 280);
}

/**
 * Contenedor común de los formularios: en el celular ocupa la pantalla entera
 * con las acciones fijas arriba; en escritorio es un diálogo centrado.
 */
export function Hoja({ titulo, alCerrar, acciones, children, clase = "", estilo }) {
  const ref = useRef(null);

  useAreaVisible();

  useEffect(() => {
    const alPresionar = (e) => e.key === "Escape" && alCerrar();
    window.addEventListener("keydown", alPresionar);
    // Mientras la hoja está abierta, el fondo no se desplaza por debajo.
    const antes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", alPresionar);
      document.body.style.overflow = antes;
    };
  }, [alCerrar]);

  return (
    <div className="fondo-modal" onMouseDown={(e) => e.target === e.currentTarget && alCerrar()}>
      <div
        ref={ref}
        className={`hoja ${clase}`}
        style={estilo}
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        onFocusCapture={alEnfocarMostrar}
      >
        <header className="hoja-barra">
          <button type="button" className="btn btn--sutil btn--icono" onClick={alCerrar} aria-label="Cerrar">
            <Cerrar />
          </button>
          <h2>{titulo}</h2>
          <div className="hoja-acciones">{acciones}</div>
        </header>
        <div className="hoja-cuerpo">{children}</div>
      </div>
    </div>
  );
}
