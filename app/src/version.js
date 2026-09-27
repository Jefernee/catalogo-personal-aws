// La versión que corre y cómo saber si ya se publicó otra. Una app instalada en
// el celular puede pasar días sin recargarse: al volver a ella, si hay una
// versión nueva, se recarga sola (ver App.jsx).

/** Cuándo se compiló esta versión (lo pone vite.config.js). */
export const VERSION = typeof __VERSION__ === "undefined" ? "" : __VERSION__;

const LLAVE = "catalogo.recargada-por";

/** El script principal que carga una página de la app, según su HTML. */
export function scriptPrincipal(html) {
  return String(html).match(/src="([^"]*assets\/index-[\w-]+\.js)"/)?.[1] || "";
}

/** El script que cargó esta página. En desarrollo no hay compilación: vacío. */
export function scriptEnUso() {
  const s = document.querySelector('script[type="module"][src*="assets/index-"]');
  return s ? s.getAttribute("src") : "";
}

/**
 * true si la página publicada ya carga otro script que esta. Sin red, en
 * desarrollo o si ya se recargó una vez por esa misma versión, no: nunca
 * queda recargándose en bucle.
 */
export async function debeActualizarse({ actual = scriptEnUso(), pedir = fetch } = {}) {
  if (!actual || navigator.onLine === false) return false;
  try {
    const respuesta = await pedir("./", { cache: "no-store" });
    if (!respuesta.ok) return false;
    const publicada = scriptPrincipal(await respuesta.text());
    if (!publicada || publicada === actual) return false;
    if (sessionStorage.getItem(LLAVE) === publicada) return false;
    sessionStorage.setItem(LLAVE, publicada);
    return true;
  } catch {
    return false;
  }
}

/** "27 sep, 16:40": para que se sepa qué versión se tiene abierta. */
export function fechaDeVersion(iso = VERSION) {
  const f = new Date(iso);
  if (!iso || Number.isNaN(f.getTime())) return "de desarrollo";
  return `del ${f.toLocaleString("es-MX", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`;
}
