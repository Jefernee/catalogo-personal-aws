import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ModalAjustes, ModalCompartir, PantallaAcceso, enlaceWhatsApp, mensajeInvitacion, ocultarClave } from "../acceso";
import { DUENO, guardarSesion, leerToken } from "../api";
import { simularPantalla } from "./pantalla";

const API = "https://abc123.execute-api.us-east-1.amazonaws.com";
const responder = (status, cuerpo = {}) =>
  vi.spyOn(globalThis, "fetch").mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify(cuerpo), { status }))
  );

describe("mensaje para compartir", () => {
  const mensaje = mensajeInvitacion({ enlace: "https://x/diario/", contrasena: "luna-cafe-27" });

  it("dice de quién es y qué es", () => {
    expect(mensaje).toContain(`El diario de ${DUENO}`);
    expect(mensaje).toContain(`Soy ${DUENO}`);
    expect(mensaje).toMatch(/páginas del día/);
  });

  it("trae la página y la contraseña, paso a paso", () => {
    expect(mensaje).toContain("Cómo entrar");
    expect(mensaje).toContain("https://x/diario/");
    expect(mensaje).toContain("Escribe la contraseña: *luna-cafe-27*");
    expect(mensaje).toContain("Toca *Entrar*");
    expect(mensaje).toMatch(/cada vez que abras la app/);
  });

  it("va entero en el enlace de WhatsApp, sin número: WhatsApp deja elegir el contacto", () => {
    const wa = enlaceWhatsApp(mensaje);
    expect(wa.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(wa.split("text=")[1])).toBe(mensaje);
  });

  it("la vista previa oculta cada aparición de la contraseña", () => {
    const oculto = ocultarClave("clave: abc y otra vez abc", "abc");
    expect(oculto).not.toContain("abc");
    expect(oculto.match(/••••••••/g)).toHaveLength(2);
  });
});

describe("pantalla de acceso", () => {
  it("con la contraseña correcta entra y la guarda en la sesión", async () => {
    guardarSesion({ url: API });
    responder(200, { total: 0, items: [] });
    const alEntrar = vi.fn();
    render(<PantallaAcceso alEntrar={alEntrar} />);

    await userEvent.type(screen.getByLabelText("Contraseña"), "la-buena");
    await userEvent.click(screen.getByRole("button", { name: /entrar/i }));

    expect(alEntrar).toHaveBeenCalled();
    expect(leerToken()).toBe("la-buena");
  });

  it("con una contraseña equivocada lo dice y no guarda nada", async () => {
    guardarSesion({ url: API });
    responder(401, { error: "no" });
    const alEntrar = vi.fn();
    render(<PantallaAcceso alEntrar={alEntrar} />);

    await userEvent.type(screen.getByLabelText("Contraseña"), "adivinando");
    await userEvent.click(screen.getByRole("button", { name: /entrar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Esa contraseña no es correcta");
    expect(alEntrar).not.toHaveBeenCalled();
    expect(leerToken()).toBe("");
  });

  it("si ya sabe el servidor, solo pide la contraseña", () => {
    guardarSesion({ url: API });
    render(<PantallaAcceso alEntrar={() => {}} />);
    expect(screen.queryByLabelText("Dirección de la API")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Contraseña")).toBeInTheDocument();
  });

  it("es un campo de contraseña, para que Bitwarden la ofrezca guardar", () => {
    guardarSesion({ url: API });
    render(<PantallaAcceso alEntrar={() => {}} />);
    const campo = screen.getByLabelText("Contraseña");
    expect(campo).toHaveAttribute("type", "password");
    expect(campo).toHaveAttribute("autocomplete", "current-password");
  });

  it("dice de quién es el diario", () => {
    render(<PantallaAcceso alEntrar={() => {}} />);
    expect(screen.getByText(new RegExp(`El diario de ${DUENO}`))).toBeInTheDocument();
  });
});

describe("compartir", () => {
  it("WhatsApp lleva la página y la contraseña con la que entraste", () => {
    guardarSesion({ url: API, token: "luna-cafe-27" });
    render(<ModalCompartir alCerrar={() => {}} avisar={() => {}} />);

    const boton = screen.getByRole("link", { name: /enviar por whatsapp/i });
    const texto = decodeURIComponent(boton.getAttribute("href").split("text=")[1]);
    expect(texto).toContain("luna-cafe-27");
    expect(texto).toContain(location.origin);
    expect(boton).toHaveAttribute("target", "_blank");
  });

  it("copiar pone el mensaje completo en el portapapeles", async () => {
    guardarSesion({ url: API, token: "p" });
    const avisar = vi.fn();
    render(<ModalCompartir alCerrar={() => {}} avisar={avisar} />);

    await userEvent.click(screen.getByRole("button", { name: /^copiar$/i }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining("Cómo entrar"));
    expect(avisar).toHaveBeenCalledWith(expect.stringMatching(/copiado/i));
  });

  it("la vista previa no muestra la contraseña hasta que se pide", async () => {
    guardarSesion({ url: API, token: "secreta-123" });
    render(<ModalCompartir alCerrar={() => {}} avisar={() => {}} />);

    const vista = screen.getByLabelText("Vista previa del mensaje");
    expect(vista).not.toHaveTextContent("secreta-123");
    await userEvent.click(screen.getByRole("button", { name: /mostrar contraseña/i }));
    expect(vista).toHaveTextContent("secreta-123");
  });
});

describe("ajustes: apariencia", () => {
  const ajustes = (tema) =>
    render(
      <ModalAjustes tema={tema} alElegirTema={vi.fn()} alCerrar={vi.fn()} alSalir={vi.fn()}
        items={[]} alRespaldarEnNube={vi.fn()} avisar={vi.fn()} />
    );

  it("según el teléfono, dice en qué modo está: así se nota si el navegador no lo sigue", () => {
    simularPantalla({ oscuro: true });
    ajustes("sistema");
    expect(screen.getByText(/Tu teléfono está en modo oscuro, y la app también/)).toBeInTheDocument();
  });

  it("en Samsung Internet explica cómo evitar que el navegador oscurezca las hojas", () => {
    vi.spyOn(navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0 Mobile Safari/537.36"
    );
    ajustes("claro");
    expect(screen.getByText(/Es Samsung Internet, que oscurece las páginas/)).toBeInTheDocument();
    expect(screen.getByText("Usar tema oscuro del sitio web")).toBeInTheDocument();
  });

  it("en otros navegadores no muestra ese aviso", () => {
    ajustes("claro");
    expect(screen.queryByText(/Samsung Internet/)).not.toBeInTheDocument();
  });

  it("con un tema fijo, avisa que no cambia con el teléfono", () => {
    ajustes("claro");
    expect(screen.getByText(/Siempre en claro, aunque el teléfono esté en oscuro/)).toBeInTheDocument();
    // Y deja claro que las hojas no cambian con el tema.
    expect(screen.getByText(/Las hojas del diario conservan siempre su color/)).toBeInTheDocument();
  });
});
