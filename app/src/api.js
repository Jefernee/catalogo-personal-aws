// Cliente de la API del catálogo. Un solo lugar donde vive el fetch.

const LLAVE = "catalogo.api";

// Si no hay nada guardado, se usa VITE_API_URL (archivo .env.local,
// que no se sube a git). Asi no hay que escribir la URL en cada equipo.
const POR_DEFECTO = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");

export function leerUrl() {
  try {
    return localStorage.getItem(LLAVE) || POR_DEFECTO;
  } catch {
    return POR_DEFECTO;
  }
}

export function guardarUrl(url) {
  try {
    localStorage.setItem(LLAVE, url.trim().replace(/\/$/, ""));
  } catch {
    /* modo privado: la URL solo dura esta sesión */
  }
}

export class ErrorDeRed extends Error {}

async function pedir(ruta, opciones = {}) {
  const base = leerUrl();
  if (!base) throw new ErrorDeRed("Falta configurar la URL de la API");

  let respuesta;
  try {
    respuesta = await fetch(base + ruta, {
      ...opciones,
      headers: opciones.body ? { "Content-Type": "application/json" } : undefined,
    });
  } catch {
    throw new ErrorDeRed(
      "No se pudo conectar. Revisa la URL y que CORS esté habilitado en API Gateway."
    );
  }

  const texto = await respuesta.text();
  const datos = texto ? JSON.parse(texto) : {};
  if (!respuesta.ok) throw new Error(datos.error || `Error ${respuesta.status}`);
  return datos;
}

export const api = {
  listar(filtros = {}) {
    const params = new URLSearchParams();
    if (filtros.tipo) params.set("tipo", filtros.tipo);
    if (filtros.estado) params.set("estado", filtros.estado);
    const cola = params.toString();
    return pedir("/catalogo" + (cola ? `?${cola}` : ""));
  },
  crear(item) {
    return pedir("/catalogo", { method: "POST", body: JSON.stringify(item) });
  },
  actualizar(id, cambios) {
    return pedir(`/catalogo/${id}`, { method: "PUT", body: JSON.stringify(cambios) });
  },
  eliminar(id) {
    return pedir(`/catalogo/${id}`, { method: "DELETE" });
  },
  exportar(tipo) {
    return pedir("/export" + (tipo ? `?tipo=${tipo}` : ""), { method: "POST" });
  },
};

export const TIPOS = ["libro", "pelicula", "serie", "musica", "juego", "restaurante"];
export const ESTADOS = ["pendiente", "en_curso", "terminado", "abandonado"];

export const ETIQUETAS = {
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
  libro: "📚",
  pelicula: "🎬",
  serie: "📺",
  musica: "🎧",
  juego: "🎮",
  restaurante: "🍽️",
  diario: "📔",
};

// El campo extra cambia según el tipo: un libro tiene autor, un restaurante ciudad.
export const CAMPO_EXTRA = {
  libro: { clave: "autor", etiqueta: "Autor" },
  pelicula: { clave: "director", etiqueta: "Director" },
  serie: { clave: "plataforma", etiqueta: "Plataforma" },
  musica: { clave: "autor", etiqueta: "Artista" },
  juego: { clave: "plataforma", etiqueta: "Plataforma" },
  restaurante: { clave: "ciudad", etiqueta: "Ciudad" },
};

export const SIGUIENTE_ESTADO = {
  pendiente: "en_curso",
  en_curso: "terminado",
  terminado: "pendiente",
  abandonado: "en_curso",
};

// El boton dice que va a pasar, no a que estado salta: "Empezar" se
// entiende mejor que "-> En curso".
export const ACCION_ESTADO = {
  pendiente: "Empezar",
  en_curso: "Terminar",
  terminado: "Reiniciar",
  abandonado: "Retomar",
};

export function detalleDe(item) {
  return [item.autor, item.director, item.plataforma, item.ciudad].filter(Boolean)[0] || "";
}
