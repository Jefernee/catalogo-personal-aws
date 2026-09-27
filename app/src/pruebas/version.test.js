import { describe, expect, it, vi } from "vitest";
import { debeActualizarse, fechaDeVersion, scriptPrincipal } from "../version";

const pagina = (script) =>
  `<!doctype html><html><head><script type="module" crossorigin src="${script}"></script></head></html>`;
const publicada = (script, status = 200) =>
  vi.fn().mockResolvedValue(new Response(pagina(script), { status }));

describe("versión nueva", () => {
  it("lee qué script carga la página publicada", () => {
    expect(scriptPrincipal(pagina("./assets/index-AbC_12-x.js"))).toBe("./assets/index-AbC_12-x.js");
    expect(scriptPrincipal("<html></html>")).toBe("");
  });

  it("si la publicada carga otro script, hay que actualizarse; si es el mismo, no", async () => {
    expect(await debeActualizarse({ actual: "./assets/index-viejo.js", pedir: publicada("./assets/index-nuevo.js") })).toBe(true);
    expect(await debeActualizarse({ actual: "./assets/index-igual.js", pedir: publicada("./assets/index-igual.js") })).toBe(false);
  });

  it("pide la página sin caché, para no leer una copia vieja", async () => {
    const pedir = publicada("./assets/index-nuevo.js");
    await debeActualizarse({ actual: "./assets/index-viejo.js", pedir });
    expect(pedir).toHaveBeenCalledWith("./", { cache: "no-store" });
  });

  it("no se recarga dos veces por la misma versión: nunca queda en bucle", async () => {
    const pedir = publicada("./assets/index-nuevo.js");
    expect(await debeActualizarse({ actual: "./assets/index-viejo.js", pedir })).toBe(true);
    expect(await debeActualizarse({ actual: "./assets/index-viejo.js", pedir })).toBe(false);
  });

  it("sin red, con error o en desarrollo, no hace nada", async () => {
    expect(await debeActualizarse({ actual: "", pedir: publicada("./assets/index-nuevo.js") })).toBe(false);
    expect(await debeActualizarse({ actual: "./assets/index-viejo.js", pedir: publicada("x", 500) })).toBe(false);
    expect(await debeActualizarse({ actual: "./assets/index-viejo.js", pedir: vi.fn().mockRejectedValue(new TypeError("sin red")) })).toBe(false);
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    expect(await debeActualizarse({ actual: "./assets/index-viejo.js", pedir: publicada("./assets/index-nuevo.js") })).toBe(false);
  });

  it("dice de cuándo es la versión", () => {
    expect(fechaDeVersion("2026-09-27T22:40:00.000Z")).toMatch(/^del 27 sep/);
    expect(fechaDeVersion("")).toBe("de desarrollo");
  });
});
