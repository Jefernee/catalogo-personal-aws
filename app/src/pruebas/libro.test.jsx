import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EditorPagina, HojaDiario, Libro, aRenglones, contarHojas, repartirEnHojas } from "../diario";
import { simularPantalla } from "./pantalla";

const pagina = (n, dia) => ({
  item_id: `p${n}`,
  tipo: "diario",
  titulo: `Página ${n}`,
  contenido: `Texto ${n}`,
  fecha: `2026-09-${String(dia).padStart(2, "0")}`,
  creado_en: `2026-09-${String(dia).padStart(2, "0")}T12:00:00Z`,
});
// Cinco páginas escritas en días distintos; la del día 25 es la más reciente.
const cinco = [pagina(1, 5), pagina(2, 10), pagina(3, 15), pagina(4, 20), pagina(5, 25)];

const verLibro = (entradas = cinco) =>
  render(<Libro entradas={entradas} alEscribir={vi.fn()} alEditar={vi.fn()} alBorrar={vi.fn()} />);

const titulos = () => screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);

describe("libro en el celular (una página)", () => {
  it("abre en la página más reciente", () => {
    verLibro();
    expect(titulos()).toEqual(["Página 5"]);
    expect(screen.getByText(/Página 1 de 5/)).toBeInTheDocument();
    expect(screen.getByText(/lo más reciente/)).toBeInTheDocument();
  });

  it("pasar de página va hacia atrás en el tiempo, y se puede volver", async () => {
    verLibro();
    await userEvent.click(screen.getByLabelText("Páginas más antiguas"));
    expect(titulos()).toEqual(["Página 4"]);
    await userEvent.click(screen.getByLabelText("Páginas más antiguas"));
    expect(titulos()).toEqual(["Página 3"]);
    await userEvent.click(screen.getByRole("button", { name: /volver a lo más reciente/i }));
    expect(titulos()).toEqual(["Página 5"]);
  });

  it("no pasa más allá de la primera ni de la última hoja", () => {
    verLibro();
    expect(screen.getByLabelText("Páginas más recientes")).toBeDisabled();
    for (let i = 0; i < 10; i++) fireEvent.click(screen.getByLabelText("Páginas más antiguas"));
    expect(titulos()).toEqual(["Página 1"]);
    expect(screen.getByLabelText("Páginas más antiguas")).toBeDisabled();
  });

  it("deslizar el dedo a la izquierda pasa a la página anterior en el tiempo", () => {
    verLibro();
    const hoja = document.querySelector(".libro-abierto");
    fireEvent.touchStart(hoja, { touches: [{ clientX: 300, clientY: 400 }] });
    fireEvent.touchEnd(hoja, { changedTouches: [{ clientX: 150, clientY: 405 }] });
    expect(titulos()).toEqual(["Página 4"]);
  });

  it("un desplazamiento vertical no pasa de página", () => {
    verLibro();
    const hoja = document.querySelector(".libro-abierto");
    fireEvent.touchStart(hoja, { touches: [{ clientX: 200, clientY: 600 }] });
    fireEvent.touchEnd(hoja, { changedTouches: [{ clientX: 150, clientY: 200 }] });
    expect(titulos()).toEqual(["Página 5"]);
  });

  it("cada página lleva su fondo", () => {
    verLibro([{ ...pagina(1, 5), fondo: "noche" }]);
    expect(document.querySelector(".pagina")).toHaveClass("fondo-noche");
  });

  it("sin páginas muestra la portada con una invitación a escribir", () => {
    const alEscribir = vi.fn();
    render(<Libro entradas={[]} alEscribir={alEscribir} alEditar={vi.fn()} alBorrar={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /escribir la primera/i }));
    expect(alEscribir).toHaveBeenCalled();
  });

  it("al escribir una página nueva, el libro vuelve a lo más reciente", async () => {
    const { rerender } = verLibro();
    await userEvent.click(screen.getByLabelText("Páginas más antiguas"));
    await userEvent.click(screen.getByLabelText("Páginas más antiguas"));
    rerender(
      <Libro entradas={[...cinco, pagina(6, 26)]} alEscribir={vi.fn()} alEditar={vi.fn()} alBorrar={vi.fn()} />
    );
    expect(titulos()).toEqual(["Página 6"]);
  });
});

describe("libro en escritorio (dos páginas)", () => {
  it("muestra la más reciente a la izquierda y la anterior a la derecha", () => {
    simularPantalla({ ancha: true });
    verLibro();
    expect(titulos()).toEqual(["Página 5", "Página 4"]);
    expect(screen.getByText(/Páginas 1–2 de 5/)).toBeInTheDocument();
  });

  it("hojea de dos en dos y cierra con la hoja de dónde empezó el diario", async () => {
    simularPantalla({ ancha: true });
    verLibro();
    await userEvent.click(screen.getByLabelText("Páginas más antiguas"));
    expect(titulos()).toEqual(["Página 3", "Página 2"]);
    await userEvent.click(screen.getByLabelText("Páginas más antiguas"));
    expect(titulos()).toEqual(["Página 1"]);
    expect(screen.getByText("Aquí empezó tu diario")).toBeInTheDocument();
  });

  it("las flechas del teclado pasan de página", () => {
    simularPantalla({ ancha: true });
    verLibro();
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" })));
    expect(titulos()).toEqual(["Página 3", "Página 2"]);
    act(() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft" })));
    expect(titulos()).toEqual(["Página 5", "Página 4"]);
  });
});

describe("editor de página", () => {
  it("guarda con el fondo elegido y la fecha de hoy", async () => {
    const alGuardar = vi.fn().mockResolvedValue(true);
    render(<EditorPagina alCerrar={vi.fn()} alGuardar={alGuardar} />);

    await userEvent.type(screen.getByLabelText("Título"), "Un buen día");
    await userEvent.type(screen.getByLabelText("Contenido"), "Salí a caminar.");
    await userEvent.click(screen.getByLabelText("Rayado"));
    await userEvent.click(screen.getByRole("button", { name: "Guardar" }));

    expect(alGuardar).toHaveBeenCalledWith(expect.objectContaining({
      tipo: "diario",
      titulo: "Un buen día",
      contenido: "Salí a caminar.",
      fondo: "rayado",
    }));
    expect(alGuardar.mock.calls[0][0].fecha).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("se escribe sobre la hoja: la vista cambia con el fondo elegido", async () => {
    render(<EditorPagina alCerrar={vi.fn()} alGuardar={vi.fn()} />);
    await userEvent.click(screen.getByLabelText("Menta"));
    expect(document.querySelector(".pagina--editor")).toHaveClass("fondo-menta");
  });

  it("al editar arranca con lo que ya tenía la página", () => {
    render(<EditorPagina item={{ ...pagina(1, 5), fondo: "cielo" }} alCerrar={vi.fn()} alGuardar={vi.fn()} />);
    expect(screen.getByLabelText("Título")).toHaveValue("Página 1");
    expect(screen.getByLabelText("Cielo")).toBeChecked();
  });

  it("en un celular no abre el teclado de golpe", () => {
    simularPantalla({ tactil: true });
    render(<EditorPagina alCerrar={vi.fn()} alGuardar={vi.fn()} />);
    expect(screen.getByLabelText("Título")).not.toHaveFocus();
  });

  it("en escritorio pone el cursor en el título", () => {
    render(<EditorPagina alCerrar={vi.fn()} alGuardar={vi.fn()} />);
    expect(screen.getByLabelText("Título")).toHaveFocus();
  });

  it("Escape cierra el editor", () => {
    const alCerrar = vi.fn();
    render(<EditorPagina alCerrar={alCerrar} alGuardar={vi.fn()} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(alCerrar).toHaveBeenCalled();
  });
});

describe("hojas: una nota larga continúa en la siguiente", () => {
  it("cuenta cuántas columnas del ancho de la hoja ocupó el texto", () => {
    // Columnas de 400 px separadas por 60 px: 1 hoja = 400, 3 hojas = 400*3 + 60*2.
    expect(contarHojas(400, 400)).toBe(1);
    expect(contarHojas(400 * 3 + 60 * 2, 400)).toBe(3);
    // Sin medidas (antes de maquetar) siempre hay al menos una hoja.
    expect(contarHojas(0, 0)).toBe(1);
  });

  it("reparte cada nota en sus hojas, en orden", () => {
    const hojas = repartirEnHojas([pagina(2, 10), pagina(1, 5)], { p2: { total: 3 } });
    expect(hojas.map((h) => `${h.entrada.item_id}:${h.parte}/${h.total}`)).toEqual([
      "p2:0/3", "p2:1/3", "p2:2/3", "p1:0/1",
    ]);
  });

  it("el alto del texto se redondea a renglones completos", () => {
    expect(aRenglones(455)).toBe(450);
    expect(aRenglones(480)).toBe(480);
    expect(aRenglones(50)).toBe(120); // nunca menos de 4 renglones
  });

  it("la primera hoja lleva la fecha; las siguientes, 'continuación'", () => {
    const nota = pagina(1, 5);
    const { rerender } = render(
      <HojaDiario hoja={{ entrada: nota, parte: 0, total: 3 }} numero={1} lado="sola"
        alEditar={vi.fn()} alBorrar={vi.fn()} />
    );
    expect(document.querySelector("time")).toBeInTheDocument();
    expect(screen.getByText(/continúa/)).toBeInTheDocument();

    rerender(
      <HojaDiario hoja={{ entrada: nota, parte: 2, total: 3 }} numero={3} lado="sola"
        alEditar={vi.fn()} alBorrar={vi.fn()} />
    );
    expect(screen.getByText("Página 1 · continuación")).toBeInTheDocument();
    // La última hoja de la nota ya no dice "continúa".
    expect(screen.queryByText(/continúa/)).not.toBeInTheDocument();
  });

  it("una hoja de continuación muestra su trozo desplazando el texto", () => {
    render(
      <HojaDiario hoja={{ entrada: pagina(1, 5), parte: 2, total: 3 }} numero={3} lado="sola"
        medida={{ total: 3, ancho: 400, alto: 450 }} alEditar={vi.fn()} alBorrar={vi.fn()} />
    );
    const flujo = document.querySelector(".hoja-flujo");
    expect(flujo.style.transform).toBe("translateX(-920px)"); // 2 × (400 + 60)
    expect(flujo).toHaveAttribute("aria-hidden", "true"); // el lector de pantalla la lee una vez
  });

  it("editar desde cualquier hoja abre la nota completa", async () => {
    const alEditar = vi.fn();
    const nota = pagina(1, 5);
    render(
      <HojaDiario hoja={{ entrada: nota, parte: 1, total: 2 }} numero={2} lado="sola"
        alEditar={alEditar} alBorrar={vi.fn()} />
    );
    await userEvent.click(screen.getByLabelText("Editar Página 1"));
    expect(alEditar).toHaveBeenCalledWith(nota);
  });
});
