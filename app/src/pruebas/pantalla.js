import { vi } from "vitest";

/** Las pruebas eligen si la pantalla es "de escritorio" (dos páginas) o táctil. */
export function simularPantalla({ ancha = false, tactil = false } = {}) {
  window.matchMedia = vi.fn((consulta) => ({
    matches:
      (consulta.includes("min-width: 900px") && ancha) ||
      (consulta.includes("pointer: coarse") && tactil),
    media: consulta,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}
