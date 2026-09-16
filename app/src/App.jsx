import { useCallback, useEffect, useMemo, useState } from "react";
import { api, guardarUrl, leerUrl } from "./api";
import {
  EntradaDiario,
  Filtros,
  Metricas,
  ModalDiario,
  ModalItem,
  Tarjeta,
} from "./componentes";
import { Alerta, Check, Engrane, Luna, Mas, Nube, Recargar, Sol } from "./iconos";

export default function App() {
  const [url, setUrl] = useState(leerUrl());
  const [pestana, setPestana] = useState("catalogo");
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [brindis, setBrindis] = useState(null);
  const [modal, setModal] = useState(null);   // { tipo: "item" | "diario", item?: {...} }
  const [filtros, setFiltros] = useState({ tipo: "", estado: "", busqueda: "" });
  const [tema, setTema] = useState(() => {
    try {
      return localStorage.getItem("catalogo.tema") || "claro";
    } catch {
      return "claro";
    }
  });

  // El tema vive en el atributo data-tema del <html>; el CSS hace el resto.
  useEffect(() => {
    document.documentElement.dataset.tema = tema;
    try {
      localStorage.setItem("catalogo.tema", tema);
    } catch {
      /* sin persistencia en modo privado */
    }
  }, [tema]);

  const avisar = useCallback((texto, tipo = "ok") => {
    setBrindis({ texto, tipo });
    setTimeout(() => setBrindis(null), 3500);
  }, []);

  // Un 404 quiere decir que la pantalla quedo desactualizada: alguien borro
  // ese item desde otro lado. Se recarga la lista en vez de dejar un error.
  const manejarError = useCallback(async (e, recargar) => {
    if (e?.estado === 404) {
      avisar("Ese ítem ya no existe. Actualicé la lista.");
      await recargar();
      return;
    }
    avisar(e.message, "error");
  }, [avisar]);

  const cargar = useCallback(async () => {
    if (!leerUrl()) return;
    setCargando(true);
    try {
      const datos = await api.listar();
      setItems(datos.items || []);
    } catch (e) {
      avisar(e.message, "error");
    } finally {
      setCargando(false);
    }
  }, [avisar]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // El filtrado se hace en el cliente porque ya tenemos todo en memoria;
  // la API también sabe filtrar (?tipo=&estado=) y es lo que usa el export.
  const visibles = useMemo(() => {
    const texto = filtros.busqueda.trim().toLowerCase();
    return items
      .filter((i) => (pestana === "diario" ? i.tipo === "diario" : i.tipo !== "diario"))
      .filter((i) => (filtros.tipo ? i.tipo === filtros.tipo : true))
      .filter((i) => (filtros.estado ? i.estado === filtros.estado : true))
      .filter((i) => (texto ? (i.titulo || "").toLowerCase().includes(texto) : true))
      .sort((a, b) => String(b.creado_en || "").localeCompare(String(a.creado_en || "")));
  }, [items, filtros, pestana]);

  const delCatalogo = useMemo(() => items.filter((i) => i.tipo !== "diario"), [items]);

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
        avisar(`"${creado.titulo}" agregado`);
      }
      return true;
    } catch (e) {
      await manejarError(e, cargar);
      return e?.estado === 404;   // se cierra el modal: ya no hay nada que editar
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
      await manejarError(e, cargar);
    }
  }

  async function borrar(item) {
    if (!confirm(`¿Borrar "${item.titulo}"?`)) return;
    const antes = items;
    setItems((previos) => previos.filter((i) => i.item_id !== item.item_id));
    try {
      await api.eliminar(item.item_id);
      avisar("Eliminado");
    } catch (e) {
      if (e?.estado === 404) {
        // Ya no estaba: el borrado local es el resultado correcto.
        avisar("Ese ítem ya no existía.");
        return;
      }
      setItems(antes);
      avisar(e.message, "error");
    }
  }

  async function exportar() {
    try {
      const esDiario = pestana === "diario";
      const r = await api.exportar(esDiario ? "diario" : "");
      avisar(`${r.total_registros} registros → ${r.archivo} en S3`);
    } catch (e) {
      avisar(e.message, "error");
    }
  }

  function conectar(nueva) {
    guardarUrl(nueva);
    setUrl(leerUrl());
    cargar();
  }

  if (!url) return <PantallaConexion alConectar={conectar} />;

  return (
    <>
      <header className="cabecera">
        <div className="cabecera-interna">
          <div className="marca">
            <img src="./icono.svg" alt="" />
            <h1>Mi catálogo</h1>
          </div>
          <span className="crece" />
          <button
            className="btn btn--sutil btn--icono"
            onClick={() => setTema(tema === "claro" ? "oscuro" : "claro")}
            title={tema === "claro" ? "Cambiar a tema oscuro" : "Cambiar a tema claro"}
            aria-label="Cambiar tema"
          >
            {tema === "claro" ? <Luna /> : <Sol />}
          </button>
          <button
            className="btn btn--sutil btn--icono"
            onClick={cargar}
            title="Actualizar"
            aria-label="Actualizar"
            disabled={cargando}
          >
            <Recargar />
          </button>
          <button
            className="btn btn--sutil btn--icono"
            title="Cambiar la URL de la API"
            aria-label="Configuración"
            onClick={() => {
              const nueva = prompt("URL de la API", leerUrl());
              if (nueva !== null && nueva.trim()) conectar(nueva);
            }}
          >
            <Engrane />
          </button>
          <button className="btn btn--secundario" onClick={exportar} title="Exportar a S3">
            <Nube />
            <span className="etiqueta-boton">Exportar</span>
          </button>
        </div>
      </header>

      <main className="envoltura">
        <Metricas items={delCatalogo} />

        <div className="pestanas" role="tablist">
          <button role="tab" aria-selected={pestana === "catalogo"} onClick={() => setPestana("catalogo")}>
            Catálogo
          </button>
          <button role="tab" aria-selected={pestana === "diario"} onClick={() => setPestana("diario")}>
            Diario
          </button>
        </div>

        {pestana === "catalogo" && (
          <Filtros
            {...filtros}
            alCambiar={(cambio) => setFiltros((previos) => ({ ...previos, ...cambio }))}
          />
        )}

        {cargando && items.length === 0 ? (
          <div className="rejilla">
            {[0, 1, 2, 3, 4, 5].map((n) => <div key={n} className="esqueleto" />)}
          </div>
        ) : pestana === "catalogo" ? (
          <div className="rejilla">
            {visibles.length === 0 ? (
              <Vacio
                icono="🗂️"
                titulo={items.length === 0 ? "Tu catálogo está vacío" : "Sin resultados"}
                texto={
                  items.length === 0
                    ? "Agrega el primer libro, serie o juego que quieras seguir."
                    : "Ningún ítem coincide con esos filtros."
                }
                accion={
                  items.length === 0 ? (
                    <button className="btn btn--primario" onClick={() => setModal({ tipo: "item" })}>
                      <Mas width={16} height={16} /> Agregar el primero
                    </button>
                  ) : (
                    <button
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
        ) : (
          <div>
            {visibles.length === 0 ? (
              <Vacio
                icono="📔"
                titulo="El diario está en blanco"
                texto="Escribe la primera entrada; no se incluye en el export salvo que lo pidas."
                accion={
                  <button className="btn btn--primario" onClick={() => setModal({ tipo: "diario" })}>
                    <Mas width={16} height={16} /> Escribir entrada
                  </button>
                }
              />
            ) : (
              visibles.map((item) => (
                <EntradaDiario
                  key={item.item_id}
                  item={item}
                  alBorrar={borrar}
                  alEditar={(i) => setModal({ tipo: "diario", item: i })}
                />
              ))
            )}
          </div>
        )}
      </main>

      <button
        className="btn btn--primario flotante"
        onClick={() => setModal({ tipo: pestana === "diario" ? "diario" : "item" })}
      >
        <Mas width={17} height={17} />
        {pestana === "diario" ? "Nueva entrada" : "Agregar"}
      </button>

      {modal?.tipo === "item" && (
        <ModalItem
          key={modal.item?.item_id || "nuevo"}
          item={modal.item}
          alCerrar={() => setModal(null)}
          alGuardar={guardar}
        />
      )}
      {modal?.tipo === "diario" && (
        <ModalDiario
          key={modal.item?.item_id || "nuevo"}
          item={modal.item}
          alCerrar={() => setModal(null)}
          alGuardar={guardar}
        />
      )}

      {brindis && (
        <div className={`brindis ${brindis.tipo === "error" ? "error" : ""}`} role="status">
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

function PantallaConexion({ alConectar }) {
  const [valor, setValor] = useState("");

  return (
    <main className="envoltura">
      <div className="conectar">
        <img src="./icono.svg" alt="" />
        <h2>Conecta tu API</h2>
        <p>Pega la URL de invocación de tu API Gateway. Queda guardada en este dispositivo.</p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (valor.trim()) alConectar(valor);
          }}
        >
          <div className="campo">
            <label htmlFor="api">URL de la API</label>
            <input
              id="api"
              autoFocus
              value={valor}
              onChange={(e) => setValor(e.target.value)}
              placeholder="https://xxxx.execute-api.us-east-1.amazonaws.com"
            />
          </div>
          <button className="btn btn--primario btn--bloque" type="submit">
            Conectar
          </button>
        </form>

        <p className="ayuda">
          Si no carga nada, falta habilitar <code>CORS</code> en API Gateway. Está explicado en
          el LEEME de la app.
        </p>
      </div>
    </main>
  );
}
