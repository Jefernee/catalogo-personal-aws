import { useEffect, useMemo, useRef, useState } from "react";
import { FONDOS, FONDO_POR_DEFECTO, fechaDeHoja, fechaLarga, hoyIso, ordenarPaginas } from "./api";
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
 * El diario como un libro: en escritorio se ven dos hojas abiertas; en el
 * celular, una. Cada día es una hoja, en orden por su fecha: la 1 es la más
 * reciente y pasar de hoja va hacia atrás en el tiempo. Una nota larga no se
 * parte en varias hojas: la hoja crece y se lee bajando.
 */
export function Libro({ entradas, alEscribir, alEditar, alBorrar }) {
  const paginas = useMemo(() => ordenarPaginas(entradas), [entradas]);
  const dobles = useMedia("(min-width: 900px)");
  const paso = dobles ? 2 : 1;
  const libro = useRef(null);

  const ultima = Math.max(0, paginas.length - 1);
  // En doble hoja, la izquierda siempre es par: 0-1, 2-3, 4-5…
  const inicioUltima = dobles ? ultima - (ultima % 2) : ultima;
  const alinear = (n) => limitar(dobles ? n - (n % 2) : n, 0, inicioUltima);

  const [indice, setIndice] = useState(0);
  const [direccion, setDireccion] = useState("adelante");
  const actual = alinear(indice);

  // Si se bajó leyendo una nota larga, la hoja nueva se ve desde arriba.
  const alPrincipio = () => {
    const el = libro.current;
    if (el && el.getBoundingClientRect().top < 0) el.scrollIntoView?.({ block: "start" });
  };

  const abrirEn = (destino) => {
    const nuevo = alinear(destino);
    if (nuevo === actual) return;
    setDireccion(nuevo > actual ? "adelante" : "atras");
    setIndice(nuevo);
    alPrincipio();
  };
  const masAntiguas = () => abrirEn(actual + paso);
  const masRecientes = () => abrirEn(actual - paso);

  // Al escribir una página, el libro se abre en ella, en el lugar que le toca
  // por su fecha: si es de un día pasado, queda entre las de ese día.
  const vistas = useRef(null);
  if (vistas.current === null) vistas.current = new Set(paginas.map((p) => p.item_id));
  useEffect(() => {
    const nuevas = paginas.filter((p) => !vistas.current.has(p.item_id));
    vistas.current = new Set(paginas.map((p) => p.item_id));
    if (nuevas.length === 1) abrirEn(paginas.indexOf(nuevas[0]));
  }, [paginas]);

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

  // Deslizar el dedo pasa de hoja en el celular, como en un libro. Bajar o
  // subir leyendo no cuenta: solo un gesto claramente de lado.
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
    <section ref={libro} className="libro" aria-label="Diario">
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
          <button type="button" className="btn btn--sutil btn--sm" onClick={() => abrirEn(0)}>
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
            <HojaDiario
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

      {/* Al terminar de leer una nota larga, pasar de hoja queda a la mano. */}
      {paginas.length > paso && (
        <nav className="libro-pie" aria-label="Pasar de hoja">
          <button type="button" className="btn btn--secundario" onClick={masRecientes} disabled={actual === 0}>
            <Izquierda width={16} height={16} /> Más recientes
          </button>
          <button type="button" className="btn btn--secundario" onClick={masAntiguas} disabled={actual >= inicioUltima}>
            Más antiguas <Derecha width={16} height={16} />
          </button>
        </nav>
      )}
    </section>
  );
}

/** Una hoja del libro: un día entero. Si la nota es larga, la hoja crece. */
export function HojaDiario({ entrada, numero, lado, alEditar, alBorrar }) {
  const fondo = entrada.fondo || FONDO_POR_DEFECTO;

  return (
    <article className={`pagina pagina--${lado} fondo-${fondo}`}>
      <header className="pagina-cabeza">
        <time dateTime={entrada.fecha}>{fechaDeHoja(entrada.fecha || entrada.creado_en)}</time>
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

      <div className="pagina-cuerpo">
        <h3 className="pagina-titulo">{entrada.titulo}</h3>
        {entrada.contenido && <div className="pagina-texto">{entrada.contenido}</div>}
      </div>

      <span className="pagina-numero">{numero}</span>
    </article>
  );
}

/** El editor escribe directamente sobre la hoja elegida: lo que ves es la página. */
export function EditorPagina({ item, datosIniciales, alCambiar, alCerrar, alGuardar }) {
  const editando = Boolean(item);
  const [enviando, setEnviando] = useState(false);
  const [datos, setDatos] = useState(
    () =>
      datosIniciales || {
        titulo: item?.titulo || "",
        fecha: item?.fecha || hoyIso(),
        contenido: item?.contenido || "",
        fondo: item?.fondo || FONDO_POR_DEFECTO,
      }
  );
  const texto = useRef(null);

  // Cada cambio se le avisa a la app: si se bloquea a media página, no se pierde.
  useEffect(() => {
    alCambiar?.(datos);
  }, [datos, alCambiar]);

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
            onKeyDown={(e) => {
              // Enter en el título pasa a escribir el día, no guarda a medias.
              if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                e.preventDefault();
                texto.current?.focus();
              }
            }}
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
