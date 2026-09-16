# Frontend

Una sola página HTML que consume la API. No es parte de lo que se evalúa (el PDF dice que el proyecto es una API y no necesita interfaz), pero sirve para usar el catálogo a diario y para cerrar la demo.

No usa librerías ni build: es un archivo, se abre y ya.

---

## 1 · Habilitar CORS en API Gateway (una sola vez)

El navegador bloquea las llamadas a otro dominio salvo que la API lo autorice. Sin esto, la página no carga nada.

1. Consola de AWS → **API Gateway** → tu API `catalogo-personal-api`
2. Menú izquierdo → **CORS** → **Configurar**
3. Llena así:

| Campo | Valor |
|---|---|
| Access-Control-Allow-Origin | `*` |
| Access-Control-Allow-Headers | `content-type` |
| Access-Control-Allow-Methods | `GET, POST, PUT, DELETE, OPTIONS` |
| Access-Control-Max-Age | `300` |

4. **Guardar**

Los cambios aplican solos porque la etapa `$default` tiene implementación automática.

> `*` significa "desde cualquier origen". Para un proyecto de clase está bien. Si algún día publicas la página, ahí sí conviene poner solo tu dominio.

---

## 2 · Abrir la página

Desde la carpeta del proyecto:

```bash
python -m http.server 8000 --directory frontend
```

Y abre <http://localhost:8000> en el navegador.

También funciona con doble clic al archivo, pero servirlo así evita problemas de origen `null`.

---

## 3 · Conectarla

Pega la URL de tu API en el campo de arriba y dale **Conectar**. Queda guardada en el
navegador, no hay que volver a escribirla.

La URL está en `DATOS-PRIVADOS.md`, que no se sube a git.

---

## Qué hace

- **Catálogo**: agregar, filtrar por tipo y estado, avanzar el estado con un clic (pendiente → en curso → terminado), calificar con estrellas al terminar, borrar.
- **Diario**: entradas con fecha y contenido, en su propia pestaña.
- **Exportar a S3**: dispara `POST /export` y muestra la key del archivo generado.

Cada acción es una llamada real a la API: `GET /catalogo`, `POST /catalogo`, `PUT /catalogo/{id}`, `DELETE /catalogo/{id}`, `POST /export`. Los seis endpoints del proyecto se ejercitan desde aquí.

---

## Nota de seguridad

La API es pública y sin autenticación: cualquiera que tenga la URL puede leer y escribir. Para uso diario conviene protegerla con una **API Key** en API Gateway — que además es uno de los bonus del proyecto y cuesta $0.
