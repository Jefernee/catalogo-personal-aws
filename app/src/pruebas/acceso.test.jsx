import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ModalCompartir, PantallaAcceso, enlaceWhatsApp, mensajeInvitacion, ocultarClave } from "../acceso";
import { DUENO, guardarSesion, leerToken } from "../api";

const API = "https://abc123.execute-api.us-east-1.amazonaws.com";
const responder = (status, cuerpo = {}) =>
  vi.spyOn(globalThis, "fetch").mockImplementation(() =>
    Promise.resolve(new Response(JSON.stringify(cuerpo), { status }))
  );

describe("mensaje de invitación", () => {
  const mensaje = mensajeInvitacion({ enlace: "https://x/#api=a&token=t", servidor: API, clave: "t" });

  it("dice de quién es y qué es", () => {
    expect(mensaje).toContain(`El diario de ${DUENO}`);
    expect(mensaje).toContain(`Soy ${DUENO}`);
    expect(mensaje).toMatch(/páginas del día/);
  });

  it("trae el paso a paso y todo lo necesario para entrar", () => {
    expect(mensaje).toContain("Cómo entrar");
    expect(mensaje).toContain("https://x/#api=a&token=t");
    expect(mensaje).toContain(`Servidor (solo si te lo pide): ${API}`);
    expect(mensaje).toContain("Clave: t");
    // Avisa que la app pide la clave otra vez, para que no se quede afuera.
    expect(mensaje).toMatch(/cada vez que la abras te pedirá la clave/);
    expect(mensaje).toMatch(/pantalla de inicio/);
  });

  it("va entero en el enlace de WhatsApp, sin número: WhatsApp deja elegir el contacto", () => {
    const wa = enlaceWhatsApp(mensaje);
    expect(wa.startsWith("https://wa.me/?text=")).toBe(true);
    expect(decodeURIComponent(wa.split("text=")[1])).toBe(mensaje);
  });

  it("la vista previa oculta cada aparición de la clave", () => {
    const oculto = ocultarClave("clave: abc y enlace ...token=abc", "abc");
    expect(oculto).not.toContain("abc");
    expect(oculto.match(/••••••••/g)).toHaveLength(2);
  });
});

describe("pantalla de acceso", () => {
  it("con la clave correcta entra y la guarda", async () => {
    guardarSesion({ url: API });
    responder(200, { total: 0, items: [] });
    const alEntrar = vi.fn();
    render(<PantallaAcceso alEntrar={alEntrar} />);

    await userEvent.type(screen.getByLabelText("Clave"), "la-buena");
    await userEvent.click(screen.getByRole("button", { name: /entrar/i }));

    expect(alEntrar).toHaveBeenCalled();
    expect(leerToken()).toBe("la-buena");
  });

  it("con una clave equivocada lo dice y no guarda nada", async () => {
    guardarSesion({ url: API });
    responder(401, { error: "no" });
    const alEntrar = vi.fn();
    render(<PantallaAcceso alEntrar={alEntrar} />);

    await userEvent.type(screen.getByLabelText("Clave"), "adivinando");
    await userEvent.click(screen.getByRole("button", { name: /entrar/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Esa clave no es correcta");
    expect(alEntrar).not.toHaveBeenCalled();
    expect(leerToken()).toBe("");
  });

  it("la clave es un campo de contraseña, para que Bitwarden la ofrezca guardar", () => {
    guardarSesion({ url: API });
    render(<PantallaAcceso alEntrar={() => {}} />);
    const clave = screen.getByLabelText("Clave");
    expect(clave).toHaveAttribute("type", "password");
    expect(clave).toHaveAttribute("autocomplete", "current-password");
  });

  it("dice de quién es el diario", () => {
    render(<PantallaAcceso alEntrar={() => {}} />);
    expect(screen.getByText(new RegExp(`El diario de ${DUENO}`))).toBeInTheDocument();
  });
});

describe("compartir", () => {
  it("el botón de WhatsApp lleva el mensaje con la clave de invitado, no la tuya", () => {
    guardarSesion({ url: API, token: "clave-principal", invitado: "clave-invitado" });
    render(<ModalCompartir alCerrar={() => {}} avisar={() => {}} />);

    const boton = screen.getByRole("link", { name: /enviar por whatsapp/i });
    const texto = decodeURIComponent(boton.getAttribute("href").split("text=")[1]);
    expect(texto).toContain("clave-invitado");
    expect(texto).not.toContain("clave-principal");
    expect(boton).toHaveAttribute("target", "_blank");
  });

  it("copiar pone el mensaje completo en el portapapeles", async () => {
    guardarSesion({ url: API, token: "p", invitado: "i" });
    const avisar = vi.fn();
    render(<ModalCompartir alCerrar={() => {}} avisar={avisar} />);

    await userEvent.click(screen.getByRole("button", { name: /^copiar$/i }));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expect.stringContaining("Cómo entrar"));
    expect(avisar).toHaveBeenCalledWith(expect.stringMatching(/copiado/i));
  });

  it("la vista previa no muestra la clave hasta que se pide", async () => {
    guardarSesion({ url: API, token: "p", invitado: "secreta-123" });
    render(<ModalCompartir alCerrar={() => {}} avisar={() => {}} />);

    const vista = screen.getByLabelText("Vista previa del mensaje");
    expect(vista).not.toHaveTextContent("secreta-123");
    await userEvent.click(screen.getByRole("button", { name: /mostrar clave/i }));
    expect(vista).toHaveTextContent("secreta-123");
  });

  it("sin clave de invitado ofrece pegarla, en vez de un enlace vacío", () => {
    guardarSesion({ url: API, token: "p" });
    render(<ModalCompartir alCerrar={() => {}} avisar={() => {}} />);
    expect(screen.queryByRole("link", { name: /whatsapp/i })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Clave de invitado")).toBeInTheDocument();
  });
});

describe("clave de invitado", () => {
  it("no acepta la clave principal, aunque el gestor de contraseñas la rellene", async () => {
    guardarSesion({ url: API, token: "mi-principal" });
    const avisar = vi.fn();
    render(<ModalCompartir alCerrar={() => {}} avisar={avisar} />);

    await userEvent.type(screen.getByLabelText("Clave de invitado"), "mi-principal");
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(avisar).toHaveBeenCalledWith(expect.stringMatching(/principal/), "error");
    expect(screen.queryByRole("link", { name: /whatsapp/i })).not.toBeInTheDocument();
  });

  it("el campo pide al gestor que no rellene la clave guardada", () => {
    guardarSesion({ url: API, token: "p" });
    render(<ModalCompartir alCerrar={() => {}} avisar={() => {}} />);
    expect(screen.getByLabelText("Clave de invitado")).toHaveAttribute("autocomplete", "new-password");
  });
});
