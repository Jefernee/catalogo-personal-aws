import { useEffect, useState } from "react";
import {
  CAMPO_EXTRA,
  ESTADOS,
  ETIQUETAS,
  ICONOS,
  SIGUIENTE_ESTADO,
  TIPOS,
  detalleDe,
} from "./api";

export function Estrellas({ valor = 0, alElegir }) {
  return (
    <div className="estrellas" role="group" aria-label="Calificación">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          className={n <= Number(valor) ? "activa" : ""}
          aria-label={`${n} de 5`}
          onClick={() => alElegir(n === Number(valor) ? 0 : n)}
        >
          {n <= Number(valor) ? "★" : "☆"}
        </button>
      ))}
    </div>
  );
}

export function Tarjeta({ item, alActualizar, alBorrar }) {
  const detalle = detalleDe(item);
  const siguiente = SIGUIENTE_ESTADO[item.estado] || "pendiente";

  return (
    <article className="tarjeta">
      <div className="tarjeta-arriba">
        <span className="emoji" aria-hidden="true">{ICONOS[item.tipo] || "•"}</span>
        <div style={{ minWidth: 0, flex: 1 }}>
          <h3>{item.titulo}</h3>
          <div className="sub">
            {ETIQUETAS[item.tipo]}
            {detalle ? ` · ${detalle}` : ""}
            {item.fecha_consumido ? ` · ${item.fecha_consumido}` : ""}
          </div>
        </div>
        <span className={`insignia ${item.estado}`}>{ETIQUETAS[item.estado]}</span>
      </div>

      {item.notas && <p className="notas">{item.notas}</p>}

      {item.estado === "terminado" && (
        <Estrellas valor={item.rating} alElegir={(n) => alActualizar(item, { rating: n })} />
      )}

      <div className="acciones">
        <button className="mini" onClick={() => alActualizar(item, { estado: siguiente })}>
          → {ETIQUETAS[siguiente]}
        </button>
        <span style={{ flex: 1 }} />
        <button className="mini peligro" onClick={() => alBorrar(item)} aria-label={`Borrar ${item.titulo}`}>
          Borrar
        </button>
      </div>
    </article>
  );
}

export function EntradaDiario({ item, alBorrar }) {
  return (
    <article className="entrada">
      <header>
        <h3>{item.titulo}</h3>
        <span className="fecha">{item.fecha || (item.creado_en || "").slice(0, 10)}</span>
        <span style={{ flex: 1 }} />
        <button className="mini peligro" onClick={() => alBorrar(item)}>Borrar</button>
      </header>
      {item.contenido && <p>{item.contenido}</p>}
    </article>
  );
}

export function Filtros({ tipo, estado, busqueda, alCambiar }) {
  return (
    <div className="filtros">
      <input
        className="buscador"
        type="search"
        placeholder="Buscar por título…"
        value={busqueda}
        onChange={(e) => alCambiar({ busqueda: e.target.value })}
      />
      <div className="grupo-chips">
        <span className="rotulo">Tipo</span>
        <Chips valores={TIPOS} activo={tipo} alElegir={(v) => alCambiar({ tipo: v })} />
      </div>
      <div className="grupo-chips">
        <span className="rotulo">Estado</span>
        <Chips valores={ESTADOS} activo={estado} alElegir={(v) => alCambiar({ estado: v })} />
      </div>
    </div>
  );
}

function Chips({ valores, activo, alElegir }) {
  return (
    <>
      {["", ...valores].map((v) => (
        <button
          key={v || "todos"}
          className="chip"
          aria-pressed={activo === v}
          onClick={() => alElegir(v)}
        >
          {v ? ETIQUETAS[v] : "Todos"}
        </button>
      ))}
    </>
  );
}

export function Metricas({ items }) {
  const total = items.length;
  const cuenta = (e) => items.filter((i) => i.estado === e).length;
  const calificados = items.filter((i) => Number(i.rating) > 0);
  const promedio = calificados.length
    ? (calificados.reduce((s, i) => s + Number(i.rating), 0) / calificados.length).toFixed(1)
    : "—";

  const datos = [
    { rotulo: "En el catálogo", numero: total },
    { rotulo: "Pendientes", numero: cuenta("pendiente") },
    { rotulo: "En curso", numero: cuenta("en_curso") },
    { rotulo: "Terminados", numero: cuenta("terminado") },
    { rotulo: "Rating medio", numero: promedio },
  ];

  return (
    <div className="metricas">
      {datos.map((d) => (
        <div className="metrica" key={d.rotulo}>
          <div className="numero">{d.numero}</div>
          <div className="rotulo">{d.rotulo}</div>
        </div>
      ))}
    </div>
  );
}

export function ModalItem({ alCerrar, alGuardar }) {
  const [enviando, setEnviando] = useState(false);
  const [datos, setDatos] = useState({
    titulo: "",
    tipo: "libro",
    estado: "pendiente",
    extra: "",
    notas: "",
  });

  useEffect(() => {
    const cerrarConEsc = (e) => e.key === "Escape" && alCerrar();
    window.addEventListener("keydown", cerrarConEsc);
    return () => window.removeEventListener("keydown", cerrarConEsc);
  }, [alCerrar]);

  const campoExtra = CAMPO_EXTRA[datos.tipo];

  async function enviar(e) {
    e.preventDefault();
    if (!datos.titulo.trim()) return;
    setEnviando(true);
    const item = { titulo: datos.titulo.trim(), tipo: datos.tipo, estado: datos.estado };
    if (datos.extra.trim()) item[campoExtra.clave] = datos.extra.trim();
    if (datos.notas.trim()) item.notas = datos.notas.trim();
    const ok = await alGuardar(item);
    setEnviando(false);
    if (ok) alCerrar();
  }

  return (
    <div className="fondo-modal" onMouseDown={(e) => e.target === e.currentTarget && alCerrar()}>
      <form className="modal" onSubmit={enviar}>
        <h2>Agregar al catálogo</h2>

        <div className="campo">
          <label htmlFor="titulo">Título</label>
          <input
            id="titulo"
            autoFocus
            value={datos.titulo}
            onChange={(e) => setDatos({ ...datos, titulo: e.target.value })}
            placeholder="El nombre del viento"
            required
          />
        </div>

        <div className="dos-columnas">
          <div className="campo">
            <label htmlFor="tipo">Tipo</label>
            <select id="tipo" value={datos.tipo} onChange={(e) => setDatos({ ...datos, tipo: e.target.value })}>
              {TIPOS.map((t) => (
                <option key={t} value={t}>{ICONOS[t]} {ETIQUETAS[t]}</option>
              ))}
            </select>
          </div>
          <div className="campo">
            <label htmlFor="estado">Estado</label>
            <select id="estado" value={datos.estado} onChange={(e) => setDatos({ ...datos, estado: e.target.value })}>
              {ESTADOS.map((s) => (
                <option key={s} value={s}>{ETIQUETAS[s]}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="campo">
          <label htmlFor="extra">{campoExtra.etiqueta}</label>
          <input
            id="extra"
            value={datos.extra}
            onChange={(e) => setDatos({ ...datos, extra: e.target.value })}
            placeholder="Opcional"
          />
        </div>

        <div className="campo">
          <label htmlFor="notas">Notas</label>
          <textarea
            id="notas"
            style={{ minHeight: 70 }}
            value={datos.notas}
            onChange={(e) => setDatos({ ...datos, notas: e.target.value })}
            placeholder="Opcional"
          />
        </div>

        <div className="pie-modal">
          <button type="button" className="boton" onClick={alCerrar}>Cancelar</button>
          <button type="submit" className="boton primario" disabled={enviando}>
            {enviando ? "Guardando…" : "Agregar"}
          </button>
        </div>
      </form>
    </div>
  );
}

export function ModalDiario({ alCerrar, alGuardar }) {
  const [enviando, setEnviando] = useState(false);
  const hoy = new Date().toISOString().slice(0, 10);
  const [datos, setDatos] = useState({ titulo: "", fecha: hoy, contenido: "" });

  useEffect(() => {
    const cerrarConEsc = (e) => e.key === "Escape" && alCerrar();
    window.addEventListener("keydown", cerrarConEsc);
    return () => window.removeEventListener("keydown", cerrarConEsc);
  }, [alCerrar]);

  async function enviar(e) {
    e.preventDefault();
    if (!datos.titulo.trim()) return;
    setEnviando(true);
    const ok = await alGuardar({
      tipo: "diario",
      titulo: datos.titulo.trim(),
      fecha: datos.fecha || hoy,
      contenido: datos.contenido.trim(),
    });
    setEnviando(false);
    if (ok) alCerrar();
  }

  return (
    <div className="fondo-modal" onMouseDown={(e) => e.target === e.currentTarget && alCerrar()}>
      <form className="modal" onSubmit={enviar}>
        <h2>Nueva entrada del diario</h2>

        <div className="dos-columnas">
          <div className="campo">
            <label htmlFor="d-titulo">Título</label>
            <input
              id="d-titulo"
              autoFocus
              value={datos.titulo}
              onChange={(e) => setDatos({ ...datos, titulo: e.target.value })}
              placeholder="Cómo estuvo el día"
              required
            />
          </div>
          <div className="campo">
            <label htmlFor="d-fecha">Fecha</label>
            <input
              id="d-fecha"
              type="date"
              value={datos.fecha}
              onChange={(e) => setDatos({ ...datos, fecha: e.target.value })}
            />
          </div>
        </div>

        <div className="campo">
          <label htmlFor="d-contenido">Contenido</label>
          <textarea
            id="d-contenido"
            value={datos.contenido}
            onChange={(e) => setDatos({ ...datos, contenido: e.target.value })}
            placeholder="Lo que quieras recordar de hoy…"
          />
        </div>

        <div className="pie-modal">
          <button type="button" className="boton" onClick={alCerrar}>Cancelar</button>
          <button type="submit" className="boton primario" disabled={enviando}>
            {enviando ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </div>
  );
}
