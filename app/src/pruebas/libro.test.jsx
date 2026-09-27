import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { EditorPagina, HojaDiario, Libro } from "../diario";
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

  it("al escribir la página de hoy, el libro se abre en ella: es la más reciente", async () => {
    const { rerender } = verLibro();
    await userEvent.click(screen.getByLabelText("Páginas más antiguas"));
    await userEvent.click(screen.getByLabelText("Páginas más antiguas"));
    rerender(
      <Libro entradas={[...cinco, pagina(6, 26)]} alEscribir={vi.fn()} alEditar={vi.fn()} alBorrar={vi.fn()} />
    );
    expect(titulos()).toEqual(["Página 6"]);
    expect(screen.getByText(/Página 1 de 6/)).toBeInTheDocument();
  });

  it("una página de un día pasado no queda primero: se abre donde le toca por su fecha", () => {
    const { rerender } = verLibro();
    // Escrita hoy, pero con fecha del día 12: va entre la del 15 y la del 10.
    const atrasada = { ...pagina(6, 12), creado_en: "2026-09-27T09:00:00Z" };
    rerender(<Libro entradas={[...cinco, atrasada]} alEscribir={vi.fn()} alEditar={vi.fn()} alBorrar={vi.fn()} />);
    expect(titulos()).toEqual(["Página 6"]);
    expect(screen.getByText(/Página 4 de 6/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /volver a lo más reciente/i }));
    expect(titulos()).toEqual(["Página 5"]);
  });

  it("los botones de abajo también pasan de hoja, para no subir tras leer", async () => {
    verLibro();
    const abajo = within(screen.getByRole("navigation", { name: "Pasar de hoja" }));
    expect(abajo.getByRole("button", { name: "Más recientes" })).toBeDisabled();
    await userEvent.click(abajo.getByRole("button", { name: "Más antiguas" }));
    expect(titulos()).toEqual(["Página 4"]);
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

  it("la página escrita se abre en su par de hojas", () => {
    simularPantalla({ ancha: true });
    const { rerender } = verLibro();
    const atrasada = { ...pagina(6, 12), creado_en: "2026-09-27T09:00:00Z" };
    rerender(<Libro entradas={[...cinco, atrasada]} alEscribir={vi.fn()} alEditar={vi.fn()} alBorrar={vi.fn()} />);
    expect(titulos()).toEqual(["Página 3", "Página 6"]);
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

  it("Enter en el título pasa a escribir el día, no guarda a medias", async () => {
    const alGuardar = vi.fn();
    render(<EditorPagina alCerrar={vi.fn()} alGuardar={alGuardar} />);
    await userEvent.type(screen.getByLabelText("Título"), "Un buen día{Enter}");
    expect(alGuardar).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Contenido")).toHaveFocus();
  });

  it("Escape cierra el editor", () => {
    const alCerrar = vi.fn();
    render(<EditorPagina alCerrar={alCerrar} alGuardar={vi.fn()} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(alCerrar).toHaveBeenCalled();
  });
});

describe("una hoja por día", () => {
  const larga = Array.from({ length: 120 }, (_, n) => `Renglón ${n + 1} de un día muy largo.`).join("\n");

  it("una nota larga va entera en su hoja: no se parte en varias", () => {
    verLibro([{ ...pagina(1, 5), contenido: larga }]);
    expect(screen.getByText(/Página 1 de 1/)).toBeInTheDocument();
    expect(document.querySelectorAll(".pagina")).toHaveLength(1);
    expect(document.querySelector(".pagina-texto").textContent).toBe(larga);
    expect(screen.queryByText(/continuación|continúa/)).not.toBeInTheDocument();
  });

  it("la hoja lleva la fecha del día y su número", () => {
    render(<HojaDiario entrada={pagina(1, 5)} numero={3} lado="sola" alEditar={vi.fn()} alBorrar={vi.fn()} />);
    expect(document.querySelector("time")).toHaveAttribute("dateTime", "2026-09-05");
    expect(screen.getByText("3")).toHaveClass("pagina-numero");
  });

  it("editar desde la hoja abre la nota completa", async () => {
    const alEditar = vi.fn();
    const nota = { ...pagina(1, 5), contenido: larga };
    render(<HojaDiario entrada={nota} numero={1} lado="sola" alEditar={alEditar} alBorrar={vi.fn()} />);
    await userEvent.click(screen.getByLabelText("Editar Página 1"));
    expect(alEditar).toHaveBeenCalledWith(nota);
  });

  it("si se bajó leyendo, la hoja siguiente se ve desde arriba", () => {
    const subir = vi.fn();
    Element.prototype.scrollIntoView = subir;
    try {
      verLibro();
      // El libro quedó por encima de la pantalla: se había bajado hasta el final de la nota.
      vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({ top: -900 });
      fireEvent.click(screen.getByLabelText("Páginas más antiguas"));
      expect(subir).toHaveBeenCalledWith({ block: "start" });
    } finally {
      delete Element.prototype.scrollIntoView;
    }
  });

  it("sin haber bajado, pasar de hoja no mueve la pantalla", () => {
    const subir = vi.fn();
    Element.prototype.scrollIntoView = subir;
    try {
      verLibro();
      fireEvent.click(screen.getByLabelText("Páginas más antiguas"));
      expect(subir).not.toHaveBeenCalled();
    } finally {
      delete Element.prototype.scrollIntoView;
    }
  });
});
