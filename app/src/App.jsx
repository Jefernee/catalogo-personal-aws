import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ErrorApi,
  api,
  cerrarSesion,
  debeBloquearse,
  leerToken,
  leerUrl,
  marcarOculta,
  tomarDatosDelEnlace,
} from "./api";
import { ModalAjustes, ModalCompartir, PantallaAcceso } from "./acceso";
import { Filtros, Metricas, ModalItem, Tarjeta } from "./componentes";
import { EditorPagina, Libro } from "./diario";
import { debeActualizarse } from "./version";
import { Alerta, Candado, Check, Compartir, Engrane, Mas, Recargar } from "./iconos";

// Nombre de la sección de tareas, compras, libros y demás. Cambiarlo aquí basta.
export const NOMBRE_LISTAS = "Listas";

const recordado = (llave, porDefecto) => {
  try {
    return localStorage.getItem(llave) || porDefecto;
  } catch {
    return porDefecto;
  }
};
const recordar = (llave, valor) => {
  try {
    localStorage.setItem(llave, valor);
  } catch {
    /* sin persistencia en modo privado */
  }
};
const olvidar = (llave) => {
  try {
    localStorage.removeItem(llave);
  } catch {
    /* nada que olvidar */
  }
};

/** Dónde se guarda el tema, y solo cuando se elige en Ajustes. */
export const LLAVE_TEMA = "catalogo.tema-elegido";
/** Las versiones anteriores guardaban un tema solas, en cada visita, sin que nadie lo eligiera. */
const TEMAS_GUARDADOS_SOLOS = ["catalogo.tema", "catalogo.apariencia"];

/** La barra del navegador (arriba, en el celular) toma el color del fondo de la app. */
function pintarBarra() {
  const meta = document.querySelector('meta[name="theme-color"]');
  const fondo = getComputedStyle(document.documentElement).getPropertyValue("--fondo").trim();
  if (meta && fondo) meta.setAttribute("content", fondo);
}

export default function App() {
  const [conSesion, setConSesion] = useState(() => Boolean(leerUrl() && leerToken()));
  const [avisoAcceso, setAvisoAcceso] = useState("");
  const [pestana, setPestana] = useState(() => recordado("catalogo.pestana", "diario"));
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [brindis, setBrindis] = useState(null);
  const [modal, setModal] = useState(null); // { tipo: "item" | "pagina" | "ajustes", item? }
  const [filtros, setFiltros] = useState({ tipo: "", estado: "", busqueda: "" });
  // La app arranca en claro, como se diseñó, aunque el teléfono esté en
  // oscuro. Oscuro y "según el teléfono" se eligen en Ajustes, y solo entonces
  // se guarda el tema. Lo que las versiones anteriores guardaron solas se borra.
  const [tema, setTema] = useState(() => {
    TEMAS_GUARDADOS_SOLOS.forEach(olvidar);
    return recordado(LLAVE_TEMA, "claro");
  });
  const elegirTema = (elegido) => {
    setTema(elegido);
    recordar(LLAVE_TEMA, elegido);
  };

  // El tema vive en el atributo data-tema del <html>; el CSS hace el resto.
  // Con "sistema", el CSS sigue a prefers-color-scheme por su cuenta.
  useEffect(() => {
    document.documentElement.dataset.tema = tema;
    pintarBarra();
    if (tema !== "sistema") return undefined;
    const telefono = window.matchMedia?.("(prefers-color-scheme: dark)");
    telefono?.addEventListener?.("change", pintarBarra);
    return () => telefono?.removeEventListener?.("change", pintarBarra);
  }, [tema]);

  useEffect(() => recordar("catalogo.pestana", pestana), [pestana]);

  const avisar = useCallback((texto, tipo = "ok") => {
    setBrindis({ texto, tipo, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!brindis) return undefined;
    const t = setTimeout(() => setBrindis(null), 3600);
    return () => clearTimeout(t);
  }, [brindis]);

  // Lo que se está escribiendo en un formulario abierto. Si la app se bloquea
  // a media edición, se guarda aquí (solo en memoria, nunca en disco) y el
  // formulario se reabre tal cual al volver a entrar.
  const modalRef = useRef(null);
  const borrador = useRef(null);
  const pendiente = useRef(null);
  useEffect(() => {
    modalRef.current = modal;
    if (!modal) borrador.current = null;
  }, [modal]);

  /** Bloquea: vuelve a la pantalla de acceso y olvida la clave de este dispositivo. */
  const expulsar = useCallback((aviso = "") => {
    const abierto = modalRef.current;
    if (abierto && (abierto.tipo === "item" || abierto.tipo === "pagina") && borrador.current) {
      pendiente.current = { modal: abierto, datos: borrador.current };
    }
    cerrarSesion();
    setItems([]);
    setModal(null);
    setAvisoAcceso(aviso);
    setConSesion(false);
  }, []);

  const cargar = useCallback(async () => {
    setCargando(true);
    try {
      const datos = await api.listar();
      setItems(datos.items || []);
    } catch (e) {
      if (e instanceof ErrorApi && e.estado === 401) expulsar("La contraseña cambió. Vuelve a entrar.");
      else avisar(e.message, "error");
    } finally {
      setCargando(false);
    }
  }, [avisar, expulsar]);

  useEffect(() => {
    if (conSesion) cargar();
  }, [conSesion, cargar]);

  // Bloqueo por inactividad: si la app estuvo más de 3 minutos sin verse, al
  // volver pide la clave. Salir un momento a otra app no la bloquea. Se revisa
  // también al abrir, por si el navegador restauró la pestaña con la sesión dentro.
  useEffect(() => {
    if (!conSesion) return undefined;
    const bloquear = () => expulsar("Se bloqueó por seguridad: pasaron más de 3 minutos fuera de la app.");
    if (debeBloquearse()) {
      bloquear();
      return undefined;
    }
    const alCambiarVisibilidad = () => {
      if (document.visibilityState === "hidden") marcarOculta();
      else if (debeBloquearse()) bloquear();
    };
    document.addEventListener("visibilitychange", alCambiarVisibilidad);
    return () => document.removeEventListener("visibilitychange", alCambiarVisibilidad);
  }, [conSesion, expulsar]);

  // Una app instalada puede pasar días sin recargarse. Al volver a ella, si ya
  // se publicó una versión nueva, se recarga sola, salvo que haya algo a medio
  // escribir: eso nunca se pierde.
  useEffect(() => {
    const alVolver = async () => {
      if (document.visibilityState !== "visible") return;
      if (modalRef.current || pendiente.current) return;
      if (await debeActualizarse()) window.location.reload();
    };
    document.addEventListener("visibilitychange", alVolver);
    return () => document.removeEventListener("visibilitychange", alVolver);
  }, []);

  // Abrir un enlace de acceso con la app ya abierta en esa pestaña no recarga
  // la página: solo cambia lo que va después del "#". Se escucha ese cambio.
  useEffect(() => {
    const alCambiarEnlace = () => {
      if (!tomarDatosDelEnlace()) return;
      setAvisoAcceso("");
      if (conSesion) cargar();
      else setConSesion(Boolean(leerUrl() && leerToken()));
    };
    window.addEventListener("hashchange", alCambiarEnlace);
    return () => window.removeEventListener("hashchange", alCambiarEnlace);
  }, [conSesion, cargar]);

  // 401: la clave cambió (o la revocaron) → a la pantalla de acceso.
  // 404: la pantalla quedó desactualizada → se recarga la lista.
  const manejarError = useCallback(
    async (e) => {
      if (e instanceof ErrorApi && e.estado === 401) {
        expulsar("La contraseña cambió. Vuelve a entrar.");
        return;
      }
      if (e instanceof ErrorApi && e.estado === 404) {
        avisar("Eso ya no existe. Actualicé la lista.");
        await cargar();
        return;
      }
      avisar(e.message, "error");
    },
    [avisar, cargar, expulsar]
  );

  const diario = useMemo(() => items.filter((i) => i.tipo === "diario"), [items]);
  const listas = useMemo(() => items.filter((i) => i.tipo !== "diario"), [items]);

  const visibles = useMemo(() => {
    const texto = filtros.busqueda.trim().toLowerCase();
    return listas
      .filter((i) => (filtros.tipo ? i.tipo === filtros.tipo : true))
      .filter((i) => (filtros.estado ? i.estado === filtros.estado : true))
      .filter((i) => (texto ? (i.titulo || "").toLowerCase().includes(texto) : true))
      // Lo pendiente arriba; lo terminado baja al final.
      .sort((a, b) =>
        Number(a.estado === "terminado") - Number(b.estado === "terminado") ||
        String(b.creado_en || "").localeCompare(String(a.creado_en || ""))
      );
  }, [listas, filtros]);

  async function guardar(cuerpo) {
    const editando = modal?.item;
    try {
      if (editando) {
        const nuevo = await api.actualizar(editando.item_id, cuerpo);
        setItems((previos) => previos.map((i) => (i.item_id === nuevo.item_id ? nuevo : i)));
        avisar("Cambios guardados");
      } else {
        const creado = await api.crear(cuerpo);
        setItems((previos) => [creado, ...previos]);
        avisar(creado.tipo === "diario" ? "Página guardada" : `"${creado.titulo}" agregado`);
      }
      return true;
    } catch (e) {
      await manejarError(e);
      return e instanceof ErrorApi && e.estado === 404; // se cierra: ya no hay nada que editar
    }
  }

  async function actualizar(item, cambios) {
    const antes = items;
    setItems((previos) => previos.map((i) => (i.item_id === item.item_id ? { ...i, ...cambios } : i)));
    try {
      const nuevo = await api.actualizar(item.item_id, cambios);
      setItems((previos) => previos.map((i) => (i.item_id === nuevo.item_id ? nuevo : i)));
    } catch (e) {
      setItems(antes); // se revierte lo que se pintó por adelantado
      await manejarError(e);
    }
  }

  async function borrar(item) {
    const que = item.tipo === "diario" ? "esta página" : `"${item.titulo}"`;
    if (!window.confirm(`¿Borrar ${que}? No se puede deshacer.`)) return;
    const antes = items;
    setItems((previos) => previos.filter((i) => i.item_id !== item.item_id));
    try {
      await api.eliminar(item.item_id);
      avisar(item.tipo === "diario" ? "Página borrada" : "Eliminado");
    } catch (e) {
      if (e instanceof ErrorApi && e.estado === 404) return; // ya no estaba: el borrado local es correcto
      setItems(antes);
      await manejarError(e);
    }
  }

  /** Copia en el bucket de S3: el catálogo y, aparte, el diario. */
  async function respaldarEnNube() {
    try {
      const [listasS3, diarioS3] = await Promise.all([api.exportar(""), api.exportar("diario")]);
      avisar(`Copia guardada en S3: ${listasS3.total_registros + diarioS3.total_registros} registros`);
    } catch (e) {
      await manejarError(e);
    }
  }

  if (!conSesion) {
    return (
      <PantallaAcceso
        aviso={avisoAcceso}
        alEntrar={() => {
          setAvisoAcceso("");
          setConSesion(true);
          // Si se bloqueó con un formulario a medias, se reabre con lo escrito.
          if (pendiente.current) {
            const { modal: anterior, datos } = pendiente.current;
            pendiente.current = null;
            setModal({ ...anterior, datosIniciales: datos });
          }
        }}
      />
    );
  }

  const nuevo = () =>
    setModal(
      pestana === "diario"
        ? { tipo: "pagina" }
        : { tipo: "item", tipoInicial: filtros.tipo || "tarea" }
    );

  return (
    <>
      <header className="cabecera">
        <div className="cabecera-interna">
          <div className="marca">
            <img src="./icono.svg" alt="" />
            <h1>Mi diario</h1>
          </div>
          <button
            type="button"
            className="btn btn--sutil btn--icono"
            onClick={async () => {
              // Si ya se publicó una versión nueva de la app, se trae; si no, solo los datos.
              if (await debeActualizarse()) window.location.reload();
              else cargar();
            }}
            title="Actualizar"
            aria-label="Actualizar"
            disabled={cargando}
          >
            <Recargar className={cargando ? "girando" : ""} />
          </button>
          <button
            type="button"
            className="btn btn--sutil btn--icono"
            title="Ajustes"
            aria-label="Ajustes"
            onClick={() => setModal({ tipo: "ajustes" })}
          >
            <Engrane />
          </button>
          <button
            type="button"
            className="btn btn--sutil btn--icono"
            title="Bloquear: vuelve a pedir la contraseña"
            aria-label="Bloquear"
            onClick={() => expulsar("Bloqueado. Escribe la contraseña para entrar.")}
          >
            <Candado />
          </button>
          <button
            type="button"
            className="btn btn--secundario"
            onClick={() => setModal({ tipo: "compartir" })}
            title="Compartir"
          >
            <Compartir />
            <span className="etiqueta-boton">Compartir</span>
          </button>
        </div>
      </header>

      <main className={`envoltura envoltura--${pestana}`}>
        <div className="pestanas" role="tablist">
          <button type="button" role="tab" aria-selected={pestana === "diario"} onClick={() => setPestana("diario")}>
            Diario
            {diario.length > 0 && <span className="contador">{diario.length}</span>}
          </button>
          <button type="button" role="tab" aria-selected={pestana === "listas"} onClick={() => setPestana("listas")}>
            {NOMBRE_LISTAS}
            {listas.length > 0 && <span className="contador">{listas.length}</span>}
          </button>
        </div>

        {pestana === "diario" ? (
          cargando && items.length === 0 ? (
            <div className="esqueleto esqueleto--libro" />
          ) : (
            <Libro
              entradas={diario}
              alEscribir={() => setModal({ tipo: "pagina" })}
              alEditar={(i) => setModal({ tipo: "pagina", item: i })}
              alBorrar={borrar}
            />
          )
        ) : (
          <>
            <Metricas items={listas} />
            <Filtros {...filtros} alCambiar={(cambio) => setFiltros((p) => ({ ...p, ...cambio }))} />
            {cargando && items.length === 0 ? (
              <div className="rejilla">
                {[0, 1, 2, 3, 4, 5].map((n) => <div key={n} className="esqueleto" />)}
              </div>
            ) : (
              <div className="rejilla">
                {visibles.length === 0 ? (
                  <Vacio
                    icono={listas.length === 0 ? "🗒️" : "🔎"}
                    titulo={listas.length === 0 ? "Tus listas están vacías" : "Sin resultados"}
                    texto={
                      listas.length === 0
                        ? "Anota una tarea, algo que comprar o una serie por ver."
                        : "Nada coincide con esos filtros."
                    }
                    accion={
                      listas.length === 0 ? (
                        <button type="button" className="btn btn--primario" onClick={nuevo}>
                          <Mas width={16} height={16} /> Agregar lo primero
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn btn--secundario"
                          onClick={() => setFiltros({ tipo: "", estado: "", busqueda: "" })}
                        >
                          Limpiar filtros
                        </button>
                      )
                    }
                  />
                ) : (
                  visibles.map((item) => (
                    <Tarjeta
                      key={item.item_id}
                      item={item}
                      alActualizar={actualizar}
                      alBorrar={borrar}
                      alEditar={(i) => setModal({ tipo: "item", item: i })}
                    />
                  ))
                )}
              </div>
            )}
          </>
        )}
      </main>

      <button
        type="button"
        className="btn btn--primario flotante"
        onClick={nuevo}
        aria-label={pestana === "diario" ? "Nueva página" : "Agregar"}
      >
        <Mas width={18} height={18} />
        <span className="etiqueta-flotante">{pestana === "diario" ? "Nueva página" : "Agregar"}</span>
      </button>

      {modal?.tipo === "item" && (
        <ModalItem
          key={modal.item?.item_id || "nuevo"}
          item={modal.item}
          tipoInicial={modal.tipoInicial}
          datosIniciales={modal.datosIniciales}
          alCambiar={(d) => (borrador.current = d)}
          alCerrar={() => setModal(null)}
          alGuardar={guardar}
        />
      )}
      {modal?.tipo === "pagina" && (
        <EditorPagina
          key={modal.item?.item_id || "nueva"}
          item={modal.item}
          datosIniciales={modal.datosIniciales}
          alCambiar={(d) => (borrador.current = d)}
          alCerrar={() => setModal(null)}
          alGuardar={guardar}
        />
      )}
      {modal?.tipo === "ajustes" && (
        <ModalAjustes
          alCerrar={() => setModal(null)}
          alSalir={() => expulsar("Bloqueado. Escribe la contraseña para entrar.")}
          tema={tema}
          alElegirTema={elegirTema}
          items={items}
          alRespaldarEnNube={respaldarEnNube}
          avisar={avisar}
        />
      )}
      {modal?.tipo === "compartir" && <ModalCompartir alCerrar={() => setModal(null)} avisar={avisar} />}

      {brindis && (
        <div key={brindis.id} className={`brindis ${brindis.tipo === "error" ? "error" : ""}`} role="status">
          {brindis.tipo === "error" ? <Alerta width={17} height={17} /> : <Check width={17} height={17} />}
          {brindis.texto}
        </div>
      )}
    </>
  );
}

function Vacio({ icono, titulo, texto, accion }) {
  return (
    <div className="vacio">
      <div className="grande" aria-hidden="true">{icono}</div>
      {titulo && <div className="titulo-vacio">{titulo}</div>}
      <div>{texto}</div>
      {accion && <div style={{ marginTop: 18 }}>{accion}</div>}
    </div>
  );
}
