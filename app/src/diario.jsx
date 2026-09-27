import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
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

// ---------------------------------------------------------------------------
// Paginación: una nota larga ocupa varias hojas, como en un libro
// ---------------------------------------------------------------------------

/** Separación entre columnas del flujo. No se ve: cada hoja muestra una sola columna. */
const HUECO = 60;
/** Alto de un renglón. Debe coincidir con --renglon en styles.css. */
const RENGLON = 30;

/**
 * Cuántas hojas ocupa una nota. El texto se maqueta en columnas del ancho de
 * la hoja; el navegador corta entre renglones y aquí solo se cuentan columnas.
 */
export function contarHojas(anchoFlujo, anchoColumna) {
  if (!anchoColumna || !anchoFlujo) return 1;
  return Math.max(1, Math.round((anchoFlujo + HUECO) / (anchoColumna + HUECO)));
}

/** Convierte las notas en hojas: una nota larga ocupa varias seguidas. */
export function repartirEnHojas(paginas, medidas) {
  return paginas.flatMap((entrada) => {
    const total = medidas[entrada.item_id]?.total || 1;
    return Array.from({ length: total }, (_, parte) => ({ entrada, parte, total }));
  });
}

/** El alto del texto se redondea a renglones completos: nunca se corta una línea a la mitad. */
export const aRenglones = (alto) => Math.max(RENGLON * 4, Math.floor(alto / RENGLON) * RENGLON);

/**
 * El tamaño de la hoja según la pantalla. En el celular la hoja llena lo que
 * queda de pantalla; en escritorio, dos hojas iguales. Los cambios chicos de
 * alto (la barra del navegador que aparece y desaparece al hacer scroll) se
 * ignoran: repaginar mientras se lee movería el texto de lugar.
 */
function useTamanoHoja(marco, dobles) {
  const [tamano, setTamano] = useState(null);

  useLayoutEffect(() => {
    const el = marco.current;
    if (!el) return undefined;

    const calcular = () => {
      const anchoLibro = el.clientWidth;
      const ancho = dobles ? Math.floor(Math.min(anchoLibro, 1000) / 2) : Math.min(anchoLibro, 560);
      const arriba = el.getBoundingClientRect().top + window.scrollY;
      const alto = dobles
        ? limitar(window.innerHeight - arriba - 36, 560, 760)
        : Math.max(420, window.innerHeight - arriba - 14);
      setTamano((t) => (t && t.ancho === ancho && Math.abs(t.alto - alto) < 90 ? t : { ancho, alto }));
    };

    calcular();
    const observador = typeof ResizeObserver !== "undefined" ? new ResizeObserver(calcular) : null;
    observador?.observe(el);
    window.addEventListener("resize", calcular);
    return () => {
      observador?.disconnect();
      window.removeEventListener("resize", calcular);
    };
  }, [marco, dobles]);

  return tamano;
}

/**
 * Mide, fuera de la vista, cuántas hojas ocupa cada nota con el tamaño actual.
 * Cada nota se maqueta en una hoja real (mismas clases, mismo fondo), así que
 * los márgenes del rayado o de la tipografía quedan incluidos solos.
 */
function useMedidas(medidor, paginas, tamano) {
  const [medidas, setMedidas] = useState({});
  const [fuentes, setFuentes] = useState(0);

  useEffect(() => {
    document.fonts?.ready?.then(() => setFuentes((n) => n + 1));
  }, []);

  useLayoutEffect(() => {
    const raiz = medidor.current;
    if (!raiz || !tamano) return;
    const nuevas = {};
    for (const hoja of raiz.querySelectorAll("[data-id]")) {
      const ventana = hoja.querySelector(".hoja-ventana");
      const flujo = hoja.querySelector(".hoja-flujo");
      const alto = aRenglones(ventana.clientHeight);
      const ancho = ventana.clientWidth;
      flujo.style.height = `${alto}px`;
      flujo.style.columnWidth = `${ancho}px`;
      nuevas[hoja.dataset.id] = { total: contarHojas(flujo.scrollWidth, ancho), ancho, alto };
    }
    setMedidas((antes) => (JSON.stringify(antes) === JSON.stringify(nuevas) ? antes : nuevas));
  }, [medidor, paginas, tamano, fuentes]);

  return medidas;
}

/**
 * El diario como un libro: en escritorio se ven dos hojas abiertas; en el
 * celular, una. La hoja 1 es la más reciente: lo primero que se ve al abrir es
 * lo último que escribiste, y pasar de hoja va hacia atrás en el tiempo. Una
 * nota larga continúa en las hojas siguientes.
 */
export function Libro({ entradas, alEscribir, alEditar, alBorrar }) {
  const paginas = useMemo(() => ordenarPaginas(entradas), [entradas]);
  const dobles = useMedia("(min-width: 900px)");
  const paso = dobles ? 2 : 1;

  const marco = useRef(null);
  const medidor = useRef(null);
  const tamano = useTamanoHoja(marco, dobles);
  const medidas = useMedidas(medidor, paginas, tamano);
  const hojas = useMemo(() => repartirEnHojas(paginas, medidas), [paginas, medidas]);

  const ultima = Math.max(0, hojas.length - 1);
  // En doble hoja, la izquierda siempre es par: 0-1, 2-3, 4-5…
  const inicioUltima = dobles ? ultima - (ultima % 2) : ultima;

  const [indice, setIndice] = useState(0);
  const [direccion, setDireccion] = useState("adelante");
  const actual = limitar(dobles ? indice - (indice % 2) : indice, 0, inicioUltima);

  // Al escribir una nota nueva, el libro vuelve a la primera hoja: la recién escrita.
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

  // Deslizar el dedo pasa de hoja en el celular, como en un libro.
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
  const rango = dobles && hojas[actual + 1]
    ? `Páginas ${actual + 1}–${actual + 2} de ${hojas.length}`
    : `Página ${actual + 1} de ${hojas.length}`;
  const primera = paginas[paginas.length - 1];
  const altoHoja = tamano ? { height: tamano.alto } : undefined;

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

      {!dobles && hojas.length > 1 && actual === 0 && (
        <p className="libro-pista">Desliza la página para ver las anteriores</p>
      )}

      <div ref={marco} className="libro-marco">
        <div
          key={actual}
          className={`libro-abierto ${dobles ? "libro-abierto--doble" : ""} hojear-${direccion}`}
          onTouchStart={alTocar}
          onTouchEnd={alSoltar}
        >
          {visibles.map((n, i) =>
            hojas[n] ? (
              <HojaDiario
                key={`${hojas[n].entrada.item_id}-${hojas[n].parte}`}
                hoja={hojas[n]}
                numero={n + 1}
                lado={dobles ? (i === 0 ? "izquierda" : "derecha") : "sola"}
                medida={medidas[hojas[n].entrada.item_id]}
                estilo={altoHoja}
                alEditar={alEditar}
                alBorrar={alBorrar}
              />
            ) : (
              // Número impar de hojas: la última del libro marca dónde empezó todo.
              <div key="inicio" className="pagina pagina--hoja pagina--derecha pagina--inicio fondo-papel" style={altoHoja}>
                <span className="inicio-destello" aria-hidden="true">✦</span>
                <p className="inicio-texto">Aquí empezó tu diario</p>
                <p className="inicio-fecha">{fechaLarga(primera.fecha || primera.creado_en)}</p>
              </div>
            )
          )}
        </div>
      </div>

      {/* Fuera de la vista: aquí se mide cuántas hojas ocupa cada nota. */}
      <div ref={medidor} className="medidor" aria-hidden="true">
        {tamano &&
          paginas.map((entrada) => (
            <div
              key={entrada.item_id}
              data-id={entrada.item_id}
              className={`pagina pagina--hoja fondo-${entrada.fondo || FONDO_POR_DEFECTO}`}
              style={{ width: tamano.ancho, height: tamano.alto }}
            >
              <div className="pagina-cabeza" />
              <div className="hoja-ventana">
                <div className="hoja-flujo">
                  <ContenidoNota entrada={entrada} />
                </div>
              </div>
              <div className="pagina-pie" />
            </div>
          ))}
      </div>
    </section>
  );
}

function ContenidoNota({ entrada }) {
  return (
    <>
      <h3 className="pagina-titulo">{entrada.titulo}</h3>
      {entrada.contenido && <div className="pagina-texto">{entrada.contenido}</div>}
    </>
  );
}

/**
 * Una hoja del libro. Cada hoja muestra una columna del flujo de su nota: la
 * primera lleva la fecha y el título; las siguientes, "continuación".
 */
export function HojaDiario({ hoja, numero, lado, medida, estilo, alEditar, alBorrar }) {
  const { entrada, parte, total } = hoja;
  const fondo = entrada.fondo || FONDO_POR_DEFECTO;
  const flujo = medida
    ? {
        height: medida.alto,
        columnWidth: medida.ancho,
        transform: parte ? `translateX(-${parte * (medida.ancho + HUECO)}px)` : undefined,
      }
    : undefined;

  return (
    <article className={`pagina pagina--hoja pagina--${lado} fondo-${fondo}`} style={estilo}>
      <header className="pagina-cabeza">
        {parte === 0 ? (
          <time dateTime={entrada.fecha}>{fechaLarga(entrada.fecha || entrada.creado_en)}</time>
        ) : (
          <span className="pagina-continua">{entrada.titulo} · continuación</span>
        )}
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

      <div className="hoja-ventana" style={medida ? { height: medida.alto } : undefined}>
        {/* Las hojas de continuación repiten la nota entera desplazada: se ocultan
            a los lectores de pantalla para que la lean una sola vez. */}
        <div className="hoja-flujo" style={flujo} aria-hidden={parte > 0 ? true : undefined}>
          <ContenidoNota entrada={entrada} />
        </div>
      </div>

      <footer className="pagina-pie">
        <span className="pagina-numero">{numero}</span>
        {parte < total - 1 && <span className="pagina-sigue"> · continúa →</span>}
      </footer>
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
