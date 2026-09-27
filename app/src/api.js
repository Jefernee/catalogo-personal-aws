// Cliente de la API y sesión. Un solo lugar donde viven el fetch y la clave.

/** De quién es el diario: aparece en la invitación y en la pantalla de acceso. */
export const DUENO = "Jefernee";

const LLAVES = {
  url: "catalogo.api",
  token: "catalogo.token",
  invitado: "catalogo.invitado",
};

// La URL de la API por defecto para desarrollo local, desde app/.env.local
// (fuera de git). El build publicado se compila sin ese archivo.
const POR_DEFECTO = {
  url: (import.meta.env.VITE_API_URL || "").replace(/\/$/, ""),
  token: "",
  invitado: "",
};

/**
 * Solo la dirección de la API se recuerda entre visitas. Las claves viven en
 * sessionStorage: se borran al cerrar la app o la pestaña. Así, si prestas el
 * teléfono o la computadora, quien la abra tiene que saber la clave.
 */
const almacen = (campo) => (campo === "url" ? localStorage : sessionStorage);

function leer(campo) {
  try {
    return almacen(campo).getItem(LLAVES[campo]) || POR_DEFECTO[campo];
  } catch {
    return POR_DEFECTO[campo];
  }
}

function guardar(campo, valor) {
  try {
    if (valor) almacen(campo).setItem(LLAVES[campo], valor);
    else almacen(campo).removeItem(LLAVES[campo]);
  } catch {
    /* modo privado: no hay dónde guardar, la app pedirá la clave de nuevo */
  }
}

/**
 * Versiones anteriores guardaban las claves para siempre en localStorage. Se
 * mudan a la sesión actual y se borran de ahí: desde ahora caducan al cerrar.
 */
export function migrarSesionAntigua() {
  try {
    for (const campo of ["token", "invitado"]) {
      const vieja = localStorage.getItem(LLAVES[campo]);
      if (!vieja) continue;
      if (!sessionStorage.getItem(LLAVES[campo])) sessionStorage.setItem(LLAVES[campo], vieja);
      localStorage.removeItem(LLAVES[campo]);
    }
  } catch {
    /* sin almacenamiento no hay nada que mudar */
  }
}

const limpiarUrl = (url) => (url || "").trim().replace(/\/+$/, "");

// Solo se acepta http(s): un enlace manipulado con "javascript:" u otro esquema
// no debe poder colarse como dirección de la API.
const esUrlValida = (url) => /^https?:\/\/[^\s]+$/i.test(url || "");

export const leerUrl = () => leer("url");
export const leerToken = () => leer("token");
export const leerInvitado = () => leer("invitado");

/**
 * Guarda la sesión. La clave queda atada a su servidor: si cambia la dirección
 * de la API y no viene una clave nueva junto con ella, las anteriores se
 * olvidan. Así ningún enlace puede llevarse tu clave a un servidor ajeno.
 */
export function guardarSesion({ url, token, invitado } = {}) {
  if (url !== undefined) {
    const nueva = limpiarUrl(url);
    if (!esUrlValida(nueva)) return;
    const cambiaDeServidor = nueva !== leerUrl();
    guardar("url", nueva);
    if (cambiaDeServidor) {
      if (token === undefined) guardar("token", "");
      if (invitado === undefined) guardar("invitado", "");
    }
  }
  if (token !== undefined) guardar("token", (token || "").trim());
  if (invitado !== undefined) guardar("invitado", (invitado || "").trim());
}

const hostDe = (url) => {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
};

/** Bloquea: olvida las claves en este dispositivo. La URL se queda, al volver solo hace falta la clave. */
export function cerrarSesion() {
  guardar("token", "");
  guardar("invitado", "");
}

/**
 * Toma la sesión del propio enlace y la guarda en este dispositivo:
 *
 *   .../#api=<url>&token=<clave>                    enlace de invitado
 *   .../#api=<url>&token=<clave>&invitado=<clave>   tu enlace completo
 *
 * Después limpia la barra de direcciones para no dejar la clave a la vista.
 * Devuelve true si el enlace traía una sesión.
 */
export function tomarDatosDelEnlace() {
  try {
    const crudo = location.hash.slice(1) || location.search.slice(1);
    if (!crudo) return false;
    const p = new URLSearchParams(crudo);
    const api = limpiarUrl(p.get("api"));
    if (!api && !p.get("token")) return false;
    if (api && !esUrlValida(api)) return false;

    // Un enlace que apunta a otro servidor puede ser una trampa: se pregunta
    // primero, mostrando a dónde lleva. Aunque se acepte, la clave actual se
    // olvida (ver guardarSesion) y no se manda allí.
    const anterior = leerUrl();
    if (api && anterior && api !== anterior) {
      const acepta = window.confirm(
        `Este enlace te conecta a otro servidor:\n\n${hostDe(api)}\n\n` +
          "Solo continúa si confías en quien te lo mandó. Tu clave actual no se enviará allí."
      );
      if (!acepta) {
        history.replaceState(null, "", location.pathname);
        return false;
      }
    }

    guardarSesion({
      url: api || undefined,
      token: p.get("token") ?? undefined,
      // Un enlace de invitado no trae "invitado": no borra la que ya tengas.
      invitado: p.get("invitado") ?? undefined,
    });
    history.replaceState(null, "", location.pathname);
    return true;
  } catch {
    return false; /* si algo falla, la app pide la clave como siempre */
  }
}


// ---------------------------------------------------------------------------
// Bloqueo por inactividad
// ---------------------------------------------------------------------------

/**
 * Tiempo fuera de la app tras el que vuelve a pedir la clave. Da para salir a
 * otra app un momento y regresar; si el aparato se queda por ahí, se protege.
 */
export const BLOQUEO_MS = 3 * 60 * 1000;
const LLAVE_OCULTA = "catalogo.oculta-desde";

/** Anota cuándo la app dejó de verse (se cambió de app, se apagó la pantalla…). */
export function marcarOculta(ahora = Date.now()) {
  try {
    sessionStorage.setItem(LLAVE_OCULTA, String(ahora));
  } catch {
    /* sin almacenamiento, el bloqueo depende de cerrar la app */
  }
}

/** true si pasó más de BLOQUEO_MS desde que la app dejó de verse. Limpia la marca. */
export function debeBloquearse(ahora = Date.now()) {
  try {
    const desde = Number(sessionStorage.getItem(LLAVE_OCULTA) || 0);
    sessionStorage.removeItem(LLAVE_OCULTA);
    return Boolean(desde) && ahora - desde > BLOQUEO_MS;
  } catch {
    return false;
  }
}

export class ErrorDeRed extends Error {}

/** Error de la API que conserva el código HTTP para poder reaccionar a él. */
export class ErrorApi extends Error {
  constructor(mensaje, estado) {
    super(mensaje);
    this.estado = estado;
  }
}

async function pedir(ruta, opciones = {}, sesion = {}) {
  const base = limpiarUrl(sesion.url ?? leerUrl());
  const token = sesion.token ?? leerToken();
  if (!base) throw new ErrorDeRed("Falta configurar la URL de la API");

  const headers = {};
  if (opciones.body) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  let respuesta;
  try {
    respuesta = await fetch(base + ruta, { ...opciones, headers });
  } catch {
    // El navegador no distingue "sin internet" de "CORS" en el error, pero
    // navigator.onLine sí sabe si hay red: se dice lo primero antes de mandar
    // a revisar la configuración.
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      throw new ErrorDeRed("Parece que no hay conexión a internet.");
    }
    throw new ErrorDeRed("No se pudo conectar. Puede ser la conexión, la URL de la API o CORS.");
  }

  const texto = await respuesta.text();
  let datos = {};
  try {
    datos = texto ? JSON.parse(texto) : {};
  } catch {
    datos = {};
  }

  if (!respuesta.ok) {
    const mensaje =
      respuesta.status === 401 ? "La contraseña no es correcta." :
      respuesta.status === 503 ? "La API todavía no tiene configurado el acceso." :
      datos.error || `Error ${respuesta.status}`;
    throw new ErrorApi(mensaje, respuesta.status);
  }
  return datos;
}

export const api = {
  /** Prueba una clave antes de guardarla: así el login dice si es correcta. */
  probar(url, token) {
    return pedir("/catalogo", {}, { url, token });
  },
  listar() {
    return pedir("/catalogo");
  },
  crear(item) {
    return pedir("/catalogo", { method: "POST", body: JSON.stringify(item) });
  },
  actualizar(id, cambios) {
    return pedir(`/catalogo/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(cambios) });
  },
  eliminar(id) {
    return pedir(`/catalogo/${encodeURIComponent(id)}`, { method: "DELETE" });
  },
  exportar(tipo) {
    return pedir("/export" + (tipo ? `?tipo=${encodeURIComponent(tipo)}` : ""), { method: "POST" });
  },
};

// ---------------------------------------------------------------------------
// Catálogos de valores
// ---------------------------------------------------------------------------

// Primero lo del día a día: es lo que más se abre.
export const TIPOS = ["tarea", "compra", "libro", "pelicula", "serie", "musica", "juego", "restaurante"];
export const ESTADOS = ["pendiente", "en_curso", "terminado", "abandonado"];

export const ETIQUETAS = {
  tarea: "Tarea",
  compra: "Compra",
  libro: "Libro",
  pelicula: "Película",
  serie: "Serie",
  musica: "Música",
  juego: "Juego",
  restaurante: "Restaurante",
  diario: "Diario",
  pendiente: "Pendiente",
  en_curso: "En curso",
  terminado: "Terminado",
  abandonado: "Abandonado",
};

export const ICONOS = {
  tarea: "📝",
  compra: "🛒",
  libro: "📚",
  pelicula: "🎬",
  serie: "📺",
  musica: "🎧",
  juego: "🎮",
  restaurante: "🍽️",
  diario: "📔",
};

// El campo extra cambia según el tipo: un libro tiene autor, una compra un lugar.
export const CAMPO_EXTRA = {
  tarea: { clave: "fecha", etiqueta: "Para cuándo", tipo: "date" },
  compra: { clave: "lugar", etiqueta: "Dónde comprarlo" },
  libro: { clave: "autor", etiqueta: "Autor" },
  pelicula: { clave: "director", etiqueta: "Director" },
  serie: { clave: "plataforma", etiqueta: "Plataforma" },
  musica: { clave: "autor", etiqueta: "Artista" },
  juego: { clave: "plataforma", etiqueta: "Plataforma" },
  restaurante: { clave: "ciudad", etiqueta: "Ciudad" },
};

/** Las tareas y compras no se califican: las estrellas no tienen sentido ahí. */
export const seCalifica = (item) => !["tarea", "compra"].includes(item.tipo);

const SIGUIENTE_ESTADO = {
  pendiente: "en_curso",
  en_curso: "terminado",
  terminado: "pendiente",
  abandonado: "en_curso",
};

// El botón dice qué va a pasar, no a qué estado salta: "Empezar" se entiende
// mejor que "→ En curso".
const ACCION_ESTADO = {
  pendiente: "Empezar",
  en_curso: "Terminar",
  terminado: "Reiniciar",
  abandonado: "Retomar",
};

/** Qué hace el botón principal de una tarjeta. Las tareas y compras van directo a hecho. */
export function siguientePaso(item) {
  const hecho = item.estado === "terminado";
  if (item.tipo === "compra") {
    return hecho ? { estado: "pendiente", etiqueta: "Volver a la lista" } : { estado: "terminado", etiqueta: "Comprado" };
  }
  if (item.tipo === "tarea") {
    return hecho ? { estado: "pendiente", etiqueta: "Reabrir" } : { estado: "terminado", etiqueta: "Hecha" };
  }
  return { estado: SIGUIENTE_ESTADO[item.estado] || "pendiente", etiqueta: ACCION_ESTADO[item.estado] || "Avanzar" };
}

/** La insignia de estado habla el idioma del tipo: una compra terminada está "comprada". */
export function etiquetaEstado(item) {
  if (item.estado === "terminado" && item.tipo === "compra") return "Comprado";
  if (item.estado === "terminado" && item.tipo === "tarea") return "Hecha";
  return ETIQUETAS[item.estado] || item.estado;
}

export function detalleDe(item) {
  if (item.tipo === "tarea" && item.fecha) return `para el ${fechaCorta(item.fecha)}`;
  return [item.autor, item.director, item.plataforma, item.ciudad, item.lugar].filter(Boolean)[0] || "";
}

// ---------------------------------------------------------------------------
// Diario
// ---------------------------------------------------------------------------

// Mismo orden y mismos valores que FONDOS_VALIDOS en la Lambda.
export const FONDOS = [
  { id: "papel", nombre: "Papel" },
  { id: "crema", nombre: "Crema" },
  { id: "rayado", nombre: "Rayado" },
  { id: "cuadricula", nombre: "Cuadrícula" },
  { id: "lino", nombre: "Lino" },
  { id: "rosa", nombre: "Rosa" },
  { id: "menta", nombre: "Menta" },
  { id: "cielo", nombre: "Cielo" },
  { id: "lavanda", nombre: "Lavanda" },
  { id: "noche", nombre: "Noche" },
];

export const FONDO_POR_DEFECTO = "papel";

const fecha = (iso) => {
  const [a, m, d] = String(iso || "").slice(0, 10).split("-").map(Number);
  return a && m && d ? new Date(a, m - 1, d) : null;
};

export function fechaLarga(iso) {
  const f = fecha(iso);
  return f ? f.toLocaleDateString("es-MX", { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : "";
}

export function fechaCorta(iso) {
  const f = fecha(iso);
  return f ? f.toLocaleDateString("es-MX", { day: "numeric", month: "short" }) : "";
}

export const hoyIso = () => {
  const f = new Date();
  return `${f.getFullYear()}-${String(f.getMonth() + 1).padStart(2, "0")}-${String(f.getDate()).padStart(2, "0")}`;
};

/**
 * La más reciente primero, por cuándo se escribió (creado_en). La fecha que se
 * elige en la página es lo que se muestra, pero no mueve la página de lugar:
 * igual que en un diario de papel, las hojas quedan en el orden en que se llenaron.
 */
export function ordenarPaginas(entradas) {
  const clave = (e) => String(e.creado_en || e.fecha || "");
  return [...entradas].sort((a, b) => clave(b).localeCompare(clave(a)));
}
