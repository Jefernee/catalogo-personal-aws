import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import App from "../App";
import { guardarSesion, leerToken } from "../api";

const API = "https://abc123.execute-api.us-east-1.amazonaws.com";

const ITEMS = [
  { item_id: "d1", tipo: "diario", titulo: "Un domingo", contenido: "Salí a caminar", fecha: "2026-09-20", creado_en: "2026-09-20T10:00:00Z" },
  { item_id: "t1", tipo: "tarea", titulo: "Pagar la luz", estado: "pendiente", fecha: "2026-09-30", creado_en: "2026-09-21T10:00:00Z" },
  { item_id: "c1", tipo: "compra", titulo: "Café", estado: "pendiente", lugar: "Soriana", creado_en: "2026-09-22T10:00:00Z" },
  { item_id: "l1", tipo: "libro", titulo: "Piranesi", estado: "terminado", rating: 5, creado_en: "2026-09-19T10:00:00Z" },
];

/** Una API falsa en memoria: responde como la Lambda y registra cada llamada. */
function apiFalsa({ estadoListar = 200 } = {}) {
  const items = ITEMS.map((i) => ({ ...i }));
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (url, opciones = {}) => {
    const { pathname } = new URL(url);
    const metodo = opciones.method || "GET";
    const cuerpo = opciones.body ? JSON.parse(opciones.body) : {};
    const json = (status, datos) => new Response(JSON.stringify(datos), { status });

    if (metodo === "GET" && pathname === "/catalogo") {
      return estadoListar === 200 ? json(200, { total: items.length, items }) : json(estadoListar, { error: "x" });
    }
    if (metodo === "POST" && pathname === "/catalogo") {
      const nuevo = { item_id: `n${items.length}`, creado_en: new Date().toISOString(), estado: "pendiente", ...cuerpo };
      items.push(nuevo);
      return json(201, nuevo);
    }
    const id = decodeURIComponent(pathname.split("/").pop());
    const i = items.findIndex((x) => x.item_id === id);
    if (metodo === "PUT" && i >= 0) {
      items[i] = { ...items[i], ...cuerpo };
      return json(200, items[i]);
    }
    if (metodo === "DELETE" && i >= 0) {
      items.splice(i, 1);
      return json(200, { mensaje: "Item eliminado" });
    }
    return json(404, { error: "No existe" });
  });
}

describe("acceso", () => {
  it("sin sesión pide la clave", () => {
    render(<App />);
    expect(screen.getByLabelText("Contraseña")).toBeInTheDocument();
  });

  it("si la clave deja de valer (401), vuelve a la pantalla de acceso con un aviso", async () => {
    guardarSesion({ url: API, token: "revocada" });
    apiFalsa({ estadoListar: 401 });
    render(<App />);
    expect(await screen.findByText(/contraseña cambió/)).toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña")).toBeInTheDocument();
    expect(leerToken()).toBe("");
  });

  it("bloquear desde Ajustes olvida la clave de este dispositivo", async () => {
    guardarSesion({ url: API, token: "p" });
    apiFalsa();
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Ajustes" }));
    await userEvent.click(screen.getByRole("button", { name: /bloquear ahora/i }));
    expect(screen.getByLabelText("Contraseña")).toBeInTheDocument();
    expect(leerToken()).toBe("");
  });

  it("el candado del encabezado bloquea al instante, para prestar el aparato", async () => {
    guardarSesion({ url: API, token: "p", invitado: "i" });
    apiFalsa();
    render(<App />);
    await screen.findByText("Un domingo");
    await userEvent.click(within(document.querySelector("header.cabecera")).getByRole("button", { name: "Bloquear" }));

    expect(screen.getByLabelText("Contraseña")).toBeInTheDocument();
    expect(screen.queryByText("Un domingo")).not.toBeInTheDocument();
    expect(leerToken()).toBe("");
  });

  it("tras más de 3 minutos fuera de la app, al volver pide la clave", async () => {
    guardarSesion({ url: API, token: "p" });
    apiFalsa();
    render(<App />);
    await screen.findByText("Un domingo");

    const visibilidad = vi.spyOn(document, "visibilityState", "get");
    const ahora = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    visibilidad.mockReturnValue("hidden");
    act(() => document.dispatchEvent(new Event("visibilitychange")));

    ahora.mockReturnValue(1_000_000 + 6 * 60 * 1000);
    visibilidad.mockReturnValue("visible");
    act(() => document.dispatchEvent(new Event("visibilitychange")));

    expect(await screen.findByText(/se bloqueó por seguridad/i)).toBeInTheDocument();
    expect(leerToken()).toBe("");
  });

  it("salir un momento a otra app no la bloquea", async () => {
    guardarSesion({ url: API, token: "p" });
    apiFalsa();
    render(<App />);
    await screen.findByText("Un domingo");

    const visibilidad = vi.spyOn(document, "visibilityState", "get");
    const ahora = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    visibilidad.mockReturnValue("hidden");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    ahora.mockReturnValue(1_000_000 + 2 * 60 * 1000);
    visibilidad.mockReturnValue("visible");
    act(() => document.dispatchEvent(new Event("visibilitychange")));

    expect(screen.getByText("Un domingo")).toBeInTheDocument();
    expect(leerToken()).toBe("p");
  });

  it("si se bloquea a media página, lo escrito sigue ahí al volver a entrar", async () => {
    guardarSesion({ url: API, token: "p" });
    apiFalsa();
    render(<App />);
    await screen.findByText("Un domingo");

    await userEvent.click(screen.getByRole("button", { name: /nueva página/i }));
    await userEvent.type(screen.getByLabelText("Título"), "A medias");
    await userEvent.type(screen.getByLabelText("Contenido"), "Iba escribiendo esto");
    await userEvent.click(screen.getByLabelText("Noche"));

    // Sale 4 minutos a otra app: la app se bloquea.
    const visibilidad = vi.spyOn(document, "visibilityState", "get");
    const ahora = vi.spyOn(Date, "now").mockReturnValue(1_000_000);
    visibilidad.mockReturnValue("hidden");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    ahora.mockReturnValue(1_000_000 + 4 * 60 * 1000);
    visibilidad.mockReturnValue("visible");
    act(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(await screen.findByLabelText("Contraseña")).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText("Contraseña"), "p");
    await userEvent.click(screen.getByRole("button", { name: /entrar/i }));

    expect(await screen.findByLabelText("Título")).toHaveValue("A medias");
    expect(screen.getByLabelText("Contenido")).toHaveValue("Iba escribiendo esto");
    expect(screen.getByLabelText("Noche")).toBeChecked();
  });
});

describe("con sesión", () => {
  it("abre en el diario, titulado Mi diario", async () => {
    guardarSesion({ url: API, token: "p" });
    apiFalsa();
    render(<App />);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Mi diario");
    expect(await screen.findByText("Un domingo")).toBeInTheDocument();
  });

  it("en el encabezado va Compartir, no Exportar", async () => {
    guardarSesion({ url: API, token: "p" });
    apiFalsa();
    render(<App />);
    const cabecera = document.querySelector("header.cabecera");
    expect(within(cabecera).getByRole("button", { name: /compartir/i })).toBeInTheDocument();
    expect(within(cabecera).queryByRole("button", { name: /exportar/i })).not.toBeInTheDocument();
  });

  it("las listas muestran tareas y compras, con lo pendiente contado arriba", async () => {
    guardarSesion({ url: API, token: "p" });
    apiFalsa();
    render(<App />);
    await userEvent.click(await screen.findByRole("tab", { name: /listas/i }));

    expect(screen.getByText("Pagar la luz")).toBeInTheDocument();
    expect(screen.getByText("Café")).toBeInTheDocument();
    const porHacer = screen.getByText("Por hacer").closest(".metrica");
    expect(porHacer).toHaveTextContent("1");
  });

  it("marcar una compra como comprada la tacha", async () => {
    guardarSesion({ url: API, token: "p" });
    const fetch = apiFalsa();
    render(<App />);
    await userEvent.click(await screen.findByRole("tab", { name: /listas/i }));

    const tarjeta = screen.getByText("Café").closest(".tarjeta");
    await userEvent.click(within(tarjeta).getByRole("button", { name: "Comprado" }));

    await waitFor(() => expect(screen.getByText("Café").closest(".tarjeta")).toHaveClass("tarjeta--hecha"));
    const put = fetch.mock.calls.find(([, o]) => o?.method === "PUT");
    expect(JSON.parse(put[1].body)).toEqual({ estado: "terminado" });
  });

  it("escribir una página la agrega y el libro la muestra primero", async () => {
    guardarSesion({ url: API, token: "p" });
    apiFalsa();
    render(<App />);
    await screen.findByText("Un domingo");

    await userEvent.click(screen.getByRole("button", { name: /nueva página/i }));
    await userEvent.type(screen.getByLabelText("Título"), "Hoy");
    await userEvent.click(screen.getByLabelText("Lavanda"));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(await screen.findByText("Página guardada")).toBeInTheDocument();
    const primera = document.querySelector(".libro-abierto .pagina");
    expect(within(primera).getByRole("heading", { level: 3 })).toHaveTextContent("Hoy");
    expect(primera).toHaveClass("fondo-lavanda");
  });

  it("una página con fecha pasada va en su lugar, no primero, y el libro se abre en ella", async () => {
    guardarSesion({ url: API, token: "p" });
    apiFalsa();
    render(<App />);
    await screen.findByText("Un domingo");

    await userEvent.click(screen.getByRole("button", { name: /nueva página/i }));
    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "2026-09-10" } });
    await userEvent.type(screen.getByLabelText("Título"), "Me acordé tarde");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    // El 10 es antes que el 20: queda como la página 2, y el libro se abre ahí.
    expect(await screen.findByText("Página guardada")).toBeInTheDocument();
    expect(screen.getByText(/Página 2 de 2/)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("Me acordé tarde");

    await userEvent.click(screen.getByRole("button", { name: /volver a lo más reciente/i }));
    expect(screen.getByRole("heading", { level: 3 })).toHaveTextContent("Un domingo");
  });

  it("borrar algo que ya no existe recarga la lista en vez de dejar un error", async () => {
    guardarSesion({ url: API, token: "p" });
    const fetch = apiFalsa();
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<App />);
    await userEvent.click(await screen.findByRole("tab", { name: /listas/i }));

    // Alguien lo borró desde otro dispositivo: la API ya no lo tiene.
    await fetch.getMockImplementation()(`${API}/catalogo/t1`, { method: "DELETE" });
    const tarjeta = screen.getByText("Pagar la luz").closest(".tarjeta");
    await userEvent.click(within(tarjeta).getByRole("button", { name: /borrar/i }));

    await waitFor(() => expect(screen.queryByText("Pagar la luz")).not.toBeInTheDocument());
    expect(screen.queryByRole("status", { name: /error/i })).not.toBeInTheDocument();
  });
});

describe("tema", () => {
  it("por defecto sigue al teléfono: no fija ningún tema", async () => {
    guardarSesion({ url: API, token: "p" });
    apiFalsa();
    render(<App />);
    await screen.findByText("Un domingo");
    expect(document.documentElement.dataset.tema).toBeUndefined();
  });

  it("desde Ajustes se puede fijar el oscuro, y queda guardado", async () => {
    guardarSesion({ url: API, token: "p" });
    apiFalsa();
    render(<App />);
    await userEvent.click(await screen.findByRole("button", { name: "Ajustes" }));
    await userEvent.click(screen.getByRole("radio", { name: /oscuro/i }));
    expect(document.documentElement.dataset.tema).toBe("oscuro");
    expect(localStorage.getItem("catalogo.apariencia")).toBe("oscuro");
  });

  it("el tema que guardaba sola la primera versión ya no impide seguir al teléfono", async () => {
    // La primera versión guardaba "claro" u "oscuro" en cada visita, lo eligiera uno o no.
    localStorage.setItem("catalogo.tema", "oscuro");
    guardarSesion({ url: API, token: "p" });
    apiFalsa();
    render(<App />);
    await screen.findByText("Un domingo");
    expect(document.documentElement.dataset.tema).toBeUndefined();
    expect(localStorage.getItem("catalogo.tema")).toBeNull();
  });
});
