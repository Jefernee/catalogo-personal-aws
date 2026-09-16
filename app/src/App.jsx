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

export default function App() {
  const [url, setUrl] = useState(leerUrl());
  const [pestana, setPestana] = useState("catalogo");
  const [items, setItems] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [brindis, setBrindis] = useState(null);
  const [modal, setModal] = useState(null);
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

  async function crear(item) {
    try {
      const creado = await api.crear(item);
      setItems((previos) => [creado, ...previos]);
      avisar(`"${creado.titulo}" agregado`);
      return true;
    } catch (e) {
      avisar(e.message, "error");
      return false;
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
      avisar(e.message, "error");
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
            className="icono-boton"
            onClick={() => setTema(tema === "claro" ? "oscuro" : "claro")}
            title={tema === "claro" ? "Cambiar a oscuro" : "Cambiar a claro"}
            aria-label="Cambiar tema"
          >
            {tema === "claro" ? "🌙" : "☀️"}
          </button>
          <button className="icono-boton" onClick={cargar} title="Actualizar" aria-label="Actualizar">↻</button>
          <button className="icono-boton" onClick={exportar} title="Exportar a S3">Exportar</button>
          <button
            className="icono-boton"
            title="Cambiar la URL de la API"
            aria-label="Configuración"
            onClick={() => {
              const nueva = prompt("URL de la API", leerUrl());
              if (nueva !== null) conectar(nueva);
            }}
          >
            ⚙
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
                texto={
                  items.length === 0
                    ? "Tu catálogo está vacío. Agrega lo primero."
                    : "Nada coincide con esos filtros."
                }
              />
            ) : (
              visibles.map((item) => (
                <Tarjeta key={item.item_id} item={item} alActualizar={actualizar} alBorrar={borrar} />
              ))
            )}
          </div>
        ) : (
          <div>
            {visibles.length === 0 ? (
              <Vacio icono="📔" texto="Todavía no hay entradas en el diario." />
            ) : (
              visibles.map((item) => (
                <EntradaDiario key={item.item_id} item={item} alBorrar={borrar} />
              ))
            )}
          </div>
        )}
      </main>

      <button
        className="flotante"
        onClick={() => setModal(pestana === "diario" ? "diario" : "item")}
      >
        <span aria-hidden="true">+</span>
        {pestana === "diario" ? "Nueva entrada" : "Agregar"}
      </button>

      {modal === "item" && <ModalItem alCerrar={() => setModal(null)} alGuardar={crear} />}
      {modal === "diario" && <ModalDiario alCerrar={() => setModal(null)} alGuardar={crear} />}

      {brindis && (
        <div className={`brindis ${brindis.tipo === "error" ? "error" : ""}`} role="status">
          {brindis.texto}
        </div>
      )}
    </>
  );
}

function Vacio({ icono, texto }) {
  return (
    <div className="vacio">
      <div className="grande" aria-hidden="true">{icono}</div>
      {texto}
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
          <button className="boton primario" style={{ width: "100%" }} type="submit">
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
