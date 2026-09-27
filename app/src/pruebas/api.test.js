import { describe, expect, it, vi } from "vitest";
import {
  ErrorApi,
  ErrorDeRed,
  api,
  cerrarSesion,
  enlaceInvitado,
  etiquetaEstado,
  guardarSesion,
  hoyIso,
  leerInvitado,
  leerToken,
  leerUrl,
  ordenarPaginas,
  seCalifica,
  siguientePaso,
  tomarDatosDelEnlace,
} from "../api";

const API = "https://abc123.execute-api.us-east-1.amazonaws.com";

function respuesta(status, cuerpo = {}) {
  return Promise.resolve(new Response(JSON.stringify(cuerpo), { status }));
}

describe("sesión desde el enlace", () => {
  it("guarda la API, la clave y la de invitado, y limpia la barra de direcciones", () => {
    history.replaceState(null, "", `/#api=${API}&token=principal&invitado=inv`);
    expect(tomarDatosDelEnlace()).toBe(true);
    expect(leerUrl()).toBe(API);
    expect(leerToken()).toBe("principal");
    expect(leerInvitado()).toBe("inv");
    expect(location.hash).toBe(""); // la clave no queda a la vista
  });

  it("acepta la URL codificada o sin codificar", () => {
    history.replaceState(null, "", `/#api=${encodeURIComponent(API)}&token=t`);
    tomarDatosDelEnlace();
    expect(leerUrl()).toBe(API);
  });

  it("un enlace de invitado no borra la clave de invitado que ya tengas", () => {
    guardarSesion({ url: API, token: "principal", invitado: "inv" });
    history.replaceState(null, "", `/#api=${API}&token=otra`);
    tomarDatosDelEnlace();
    expect(leerToken()).toBe("otra");
    expect(leerInvitado()).toBe("inv");
  });

  it("rechaza una dirección que no sea http(s)", () => {
    history.replaceState(null, "", "/#api=javascript:alert(1)&token=x");
    expect(tomarDatosDelEnlace()).toBe(false);
    expect(leerUrl()).toBe("");
    expect(leerToken()).toBe("");
  });

  it("sin datos en el enlace no hace nada", () => {
    history.replaceState(null, "", "/#seccion");
    expect(tomarDatosDelEnlace()).toBe(false);
  });
});

describe("enlace de invitado", () => {
  it("lleva la clave de invitado, nunca la tuya", () => {
    guardarSesion({ url: API, token: "clave-principal", invitado: "clave-invitado" });
    const enlace = enlaceInvitado();
    expect(enlace).toContain("token=clave-invitado");
    expect(enlace).not.toContain("clave-principal");
  });

  it("es legible: la dirección no sale codificada", () => {
    guardarSesion({ url: API, token: "p", invitado: "i" });
    expect(enlaceInvitado()).toContain(`#api=${API}&token=i`);
  });

  it("sin clave de invitado no hay enlace que compartir", () => {
    guardarSesion({ url: API, token: "p" });
    expect(enlaceInvitado()).toBe("");
  });

  it("al abrirlo en otro dispositivo, deja la sesión del invitado", () => {
    guardarSesion({ url: API, token: "p", invitado: "i" });
    const enlace = new URL(enlaceInvitado());
    localStorage.clear();
    history.replaceState(null, "", `/${enlace.hash}`);
    tomarDatosDelEnlace();
    expect(leerUrl()).toBe(API);
    expect(leerToken()).toBe("i");
  });
});

describe("cerrar sesión", () => {
  it("olvida las claves y conserva la dirección", () => {
    guardarSesion({ url: API, token: "p", invitado: "i" });
    cerrarSesion();
    expect(leerToken()).toBe("");
    expect(leerInvitado()).toBe("");
    expect(leerUrl()).toBe(API);
  });
});

describe("peticiones", () => {
  it("mandan la clave como Bearer", async () => {
    guardarSesion({ url: API, token: "mi-clave" });
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => respuesta(200, { total: 0, items: [] }));
    await api.listar();
    expect(fetch).toHaveBeenCalledWith(`${API}/catalogo`, expect.objectContaining({
      headers: expect.objectContaining({ Authorization: "Bearer mi-clave" }),
    }));
  });

  it("sin clave no mandan el header", async () => {
    guardarSesion({ url: API });
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => respuesta(200, {}));
    await api.listar();
    expect(fetch.mock.calls[0][1].headers.Authorization).toBeUndefined();
  });

  it("probar() usa la clave que se le da, no la guardada", async () => {
    guardarSesion({ url: API, token: "vieja" });
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => respuesta(200, {}));
    await api.probar(API, "nueva");
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe("Bearer nueva");
  });

  it("un 401 se convierte en ErrorApi con su código", async () => {
    guardarSesion({ url: API, token: "mala" });
    vi.spyOn(globalThis, "fetch").mockImplementation(() => respuesta(401, { error: "x" }));
    await expect(api.listar()).rejects.toMatchObject({ estado: 401, message: "La clave no es válida." });
    await expect(api.listar()).rejects.toBeInstanceOf(ErrorApi);
  });

  it("sin internet lo dice en vez de culpar a CORS", async () => {
    guardarSesion({ url: API, token: "p" });
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new TypeError("Failed to fetch"));
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await expect(api.listar()).rejects.toThrow("no hay conexión");
    await expect(api.listar()).rejects.toBeInstanceOf(ErrorDeRed);
  });

  it("los ids van codificados en la ruta", async () => {
    guardarSesion({ url: API, token: "p" });
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(() => respuesta(200, {}));
    await api.eliminar("a/b?c");
    expect(fetch.mock.calls[0][0]).toBe(`${API}/catalogo/a%2Fb%3Fc`);
  });
});

describe("tareas y compras", () => {
  it("una compra pendiente se marca como comprada de un clic", () => {
    expect(siguientePaso({ tipo: "compra", estado: "pendiente" })).toEqual({ estado: "terminado", etiqueta: "Comprado" });
    expect(siguientePaso({ tipo: "compra", estado: "terminado" }).estado).toBe("pendiente");
  });

  it("una tarea pendiente se marca como hecha de un clic", () => {
    expect(siguientePaso({ tipo: "tarea", estado: "pendiente" })).toEqual({ estado: "terminado", etiqueta: "Hecha" });
  });

  it("un libro sigue el ciclo pendiente → en curso → terminado", () => {
    expect(siguientePaso({ tipo: "libro", estado: "pendiente" })).toEqual({ estado: "en_curso", etiqueta: "Empezar" });
    expect(siguientePaso({ tipo: "libro", estado: "en_curso" })).toEqual({ estado: "terminado", etiqueta: "Terminar" });
  });

  it("la insignia habla el idioma del tipo", () => {
    expect(etiquetaEstado({ tipo: "compra", estado: "terminado" })).toBe("Comprado");
    expect(etiquetaEstado({ tipo: "tarea", estado: "terminado" })).toBe("Hecha");
    expect(etiquetaEstado({ tipo: "libro", estado: "terminado" })).toBe("Terminado");
  });

  it("tareas y compras no se califican con estrellas", () => {
    expect(seCalifica({ tipo: "tarea" })).toBe(false);
    expect(seCalifica({ tipo: "compra" })).toBe(false);
    expect(seCalifica({ tipo: "serie" })).toBe(true);
  });
});

describe("diario", () => {
  it("la página más reciente va primero, por cuándo se escribió", () => {
    const paginas = ordenarPaginas([
      { titulo: "vieja", creado_en: "2026-09-10T10:00:00Z", fecha: "2026-09-10" },
      // Escrita hoy pero con fecha de la semana pasada: igual va primero.
      { titulo: "nueva", creado_en: "2026-09-26T10:00:00Z", fecha: "2026-09-19" },
      { titulo: "media", creado_en: "2026-09-18T10:00:00Z", fecha: "2026-09-18" },
    ]);
    expect(paginas.map((p) => p.titulo)).toEqual(["nueva", "media", "vieja"]);
  });

  it("la fecha de hoy es la local, no la de UTC", () => {
    // 23:30 del 26 en México es ya el 27 en UTC: debe seguir diciendo 26.
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 26, 23, 30));
    expect(hoyIso()).toBe("2026-09-26");
    vi.useRealTimers();
  });
});
