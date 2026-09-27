import { vi } from "vitest";

/** Las pruebas eligen si la pantalla es "de escritorio" (dos páginas), táctil o en modo oscuro. */
export function simularPantalla({ ancha = false, tactil = false, oscuro = false } = {}) {
  window.matchMedia = vi.fn((consulta) => ({
    matches:
      (consulta.includes("min-width: 900px") && ancha) ||
      (consulta.includes("pointer: coarse") && tactil) ||
      (consulta.includes("prefers-color-scheme: dark") && oscuro),
    media: consulta,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }));
}
