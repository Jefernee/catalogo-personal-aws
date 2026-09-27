import { useEffect, useMemo, useRef, useState } from "react";
import { FONDOS, FONDO_POR_DEFECTO, fechaLarga, hoyIso, ordenarPaginas } from "./api";
import { Hoja, esTactil } from "./hoja";
import { Basura, Derecha, Izquierda, Lapiz, Mas } from "./iconos";

/** true mientras la consulta de medios se cumpla; se actualiza al rotar o redimensionar. */
export function useMedia(consulta) {
  const [cumple, setCumple] = useState(() => window.matchMedia?.(consulta).matches ?? false);
  useEffect(() => {
    const m = window.matchMedia?.(consulta);
    if (!m) return undefined;
    const alCambiar = () => setCumple(m.matches);
    alCambiar();
    m.addEventListener("change", alCambiar);
    return () => m.removeEventListener("change", alCambiar);
  }, [consulta]);
  return cumple;
}

const limitar = (n, min, max) => Math.max(min, Math.min(max, n));

/**
 * El diario como un libro: en escritorio se ven dos páginas abiertas; en el
 * celular, una. La página 1 es la más reciente: lo primero que se ve al abrir
 * es lo último que escribiste, y pasar de página va hacia atrás en el tiempo.
 */
export function Libro({ entradas, alEscribir, alEditar, alBorrar }) {
  const paginas = useMemo(() => ordenarPaginas(entradas), [entradas]);
  const dobles = useMedia("(min-width: 900px)");
  const paso = dobles ? 2 : 1;

  const ultima = Math.max(0, paginas.length - 1);
  // En doble página, la izquierda siempre es par: 0-1, 2-3, 4-5…
  const inicioUltima = dobles ? ultima - (ultima % 2) : ultima;

  const [indice, setIndice] = useState(0);
  const [direccion, setDireccion] = useState("adelante");
  const actual = limitar(dobles ? indice - (indice % 2) : indice, 0, inicioUltima);

  // Al escribir una página nueva, el libro vuelve a la primera: la recién escrita.
  const cuantas = useRef(paginas.length);
  useEffect(() => {
    if (paginas.length > cuantas.current) setIndice(0);
    cuantas.current = paginas.length;
  }, [paginas.length]);

  const ir = (destino) => {
    const nuevo = limitar(destino, 0, inicioUltima);
    if (nuevo === actual) return;
    setDireccion(nuevo > actual ? "adelante" : "atras");
    setIndice(nuevo);
  };
  const masAntiguas = () => ir(actual + paso);
  const masRecientes = () => ir(actual - paso);

  // Flechas del teclado, salvo que se esté escribiendo en algún campo.
  useEffect(() => {
    const alPresionar = (e) => {
      if (e.target instanceof HTMLElement && e.target.closest("input, textarea, select, [role=dialog]")) return;
      if (e.key === "ArrowRight") masAntiguas();
      if (e.key === "ArrowLeft") masRecientes();
    };
    window.addEventListener("keydown", alPresionar);
    return () => window.removeEventListener("keydown", alPresionar);
  });

  // Deslizar el dedo pasa de página en el celular, como en un libro.
  const toque = useRef(null);
  const alTocar = (e) => {
    toque.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };
  const alSoltar = (e) => {
    if (!toque.current) return;
    const dx = e.changedTouches[0].clientX - toque.current.x;
    const dy = e.changedTouches[0].clientY - toque.current.y;
    toque.current = null;
    if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.4) (dx < 0 ? masAntiguas : masRecientes)();
  };

  if (paginas.length === 0) {
    return (
      <div className="libro-vacio">
        <div className="portada">
          <span className="portada-emoji" aria-hidden="true">📔</span>
          <h2>Mi diario</h2>
          <p>Todavía no hay páginas.</p>
          <button type="button" className="btn btn--primario" onClick={alEscribir}>
            <Mas width={16} height={16} /> Escribir la primera
          </button>
        </div>
      </div>
    );
  }

  const visibles = dobles ? [actual, actual + 1] : [actual];
  const rango = dobles && paginas[actual + 1]
    ? `Páginas ${actual + 1}–${actual + 2} de ${paginas.length}`
    : `Página ${actual + 1} de ${paginas.length}`;
  const primera = paginas[paginas.length - 1];

  return (
    <section className="libro" aria-label="Diario">
      <div className="libro-controles">
        <button
          type="button"
          className="btn btn--secundario btn--icono"
          onClick={masRecientes}
          disabled={actual === 0}
          aria-label="Páginas más recientes"
          title="Más recientes"
        >
          <Izquierda />
        </button>
        <span className="libro-rango" aria-live="polite">
          {rango}
          {actual === 0 && <span className="libro-rango-nota"> · lo más reciente</span>}
        </span>
        <button
          type="button"
          className="btn btn--secundario btn--icono"
          onClick={masAntiguas}
          disabled={actual >= inicioUltima}
          aria-label="Páginas más antiguas"
          title="Más antiguas"
        >
          <Derecha />
        </button>
        {actual > 0 && (
          <button type="button" className="btn btn--sutil btn--sm" onClick={() => ir(0)}>
            Volver a lo más reciente
          </button>
        )}
      </div>

      {!dobles && paginas.length > 1 && actual === 0 && (
        <p className="libro-pista">Desliza la página para ver las anteriores</p>
      )}

      <div
        key={actual}
        className={`libro-abierto ${dobles ? "libro-abierto--doble" : ""} hojear-${direccion}`}
        onTouchStart={alTocar}
        onTouchEnd={alSoltar}
      >
        {visibles.map((n, i) =>
          paginas[n] ? (
            <Pagina
              key={paginas[n].item_id}
              entrada={paginas[n]}
              numero={n + 1}
              lado={dobles ? (i === 0 ? "izquierda" : "derecha") : "sola"}
              alEditar={alEditar}
              alBorrar={alBorrar}
            />
          ) : (
            // Número impar de páginas: la última hoja del libro marca dónde empezó todo.
            <div key="inicio" className="pagina pagina--derecha pagina--inicio fondo-papel">
              <span className="inicio-destello" aria-hidden="true">✦</span>
              <p className="inicio-texto">Aquí empezó tu diario</p>
              <p className="inicio-fecha">{fechaLarga(primera.fecha || primera.creado_en)}</p>
            </div>
          )
        )}
      </div>

    </section>
  );
}

function Pagina({ entrada, numero, lado, alEditar, alBorrar }) {
  const fondo = entrada.fondo || FONDO_POR_DEFECTO;
  return (
    <article className={`pagina pagina--${lado} fondo-${fondo}`}>
      <header className="pagina-cabeza">
        <time dateTime={entrada.fecha}>{fechaLarga(entrada.fecha || entrada.creado_en)}</time>
        <div className="pagina-herramientas">
          <button
            type="button"
            className="btn btn--sutil btn--sm btn--icono"
            onClick={() => alEditar(entrada)}
            aria-label={`Editar ${entrada.titulo}`}
            title="Editar"
          >
            <Lapiz width={15} height={15} />
          </button>
          <button
            type="button"
            className="btn btn--peligro btn--sm btn--icono"
            onClick={() => alBorrar(entrada)}
            aria-label={`Borrar ${entrada.titulo}`}
            title="Borrar"
          >
            <Basura width={15} height={15} />
          </button>
        </div>
      </header>
      <h3 className="pagina-titulo">{entrada.titulo}</h3>
      {entrada.contenido && <div className="pagina-texto">{entrada.contenido}</div>}
      <footer className="pagina-numero">{numero}</footer>
    </article>
  );
}

/** El editor escribe directamente sobre la hoja elegida: lo que ves es la página. */
export function EditorPagina({ item, alCerrar, alGuardar }) {
  const editando = Boolean(item);
  const [enviando, setEnviando] = useState(false);
  const [datos, setDatos] = useState({
    titulo: item?.titulo || "",
    fecha: item?.fecha || hoyIso(),
    contenido: item?.contenido || "",
    fondo: item?.fondo || FONDO_POR_DEFECTO,
  });
  const texto = useRef(null);

  // El área de texto crece con lo que se escribe, en vez de tener su propio scroll.
  useEffect(() => {
    const t = texto.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${t.scrollHeight}px`;
  }, [datos.contenido]);

  async function enviar(e) {
    e.preventDefault();
    if (!datos.titulo.trim()) return;
    setEnviando(true);
    const ok = await alGuardar({
      tipo: "diario",
      titulo: datos.titulo.trim(),
      fecha: datos.fecha || hoyIso(),
      contenido: datos.contenido.trim(),
      fondo: datos.fondo,
    });
    setEnviando(false);
    if (ok) alCerrar();
  }

  return (
    <Hoja
      titulo={editando ? "Editar página" : "Nueva página"}
      alCerrar={alCerrar}
      clase="hoja--pagina"
      acciones={
        <button type="submit" form="form-pagina" className="btn btn--primario" disabled={enviando}>
          {enviando ? "Guardando…" : "Guardar"}
        </button>
      }
    >
      <form id="form-pagina" onSubmit={enviar} className="editor-pagina">
        <fieldset className="selector-fondo">
          <legend>Fondo de la página</legend>
          <div className="muestras">
            {FONDOS.map((f) => (
              <label key={f.id} className={`muestra fondo-${f.id}`} title={f.nombre}>
                <input
                  type="radio"
                  name="fondo"
                  value={f.id}
                  checked={datos.fondo === f.id}
                  onChange={() => setDatos({ ...datos, fondo: f.id })}
                />
                <span className="visualmente-oculto">{f.nombre}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className={`pagina pagina--editor fondo-${datos.fondo}`} data-fondo={datos.fondo}>
          <input
            className="pagina-fecha"
            type="date"
            aria-label="Fecha"
            value={datos.fecha}
            onChange={(e) => setDatos({ ...datos, fecha: e.target.value })}
          />
          <input
            className="pagina-titulo"
            aria-label="Título"
            autoFocus={!esTactil()}
            value={datos.titulo}
            onChange={(e) => setDatos({ ...datos, titulo: e.target.value })}
            placeholder="Título del día"
            required
            enterKeyHint="next"
          />
          <textarea
            ref={texto}
            className="pagina-texto"
            aria-label="Contenido"
            value={datos.contenido}
            onChange={(e) => setDatos({ ...datos, contenido: e.target.value })}
            placeholder="Lo que quieras recordar de hoy…"
            rows={8}
          />
        </div>
      </form>
    </Hoja>
  );
}
