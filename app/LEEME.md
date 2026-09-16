# App — Mi catálogo (React + Vite)

Aplicación instalable (PWA) que consume la API del proyecto. **No forma parte de lo evaluado**: el PDF dice que el proyecto es una API y no necesita interfaz. Está aquí para usar el catálogo a diario y para cerrar la demo.

En `../frontend/index.html` queda además una versión de un solo archivo, sin dependencias, por si el día de la presentación no quieres depender de npm.

---

## Requisito previo: CORS

El navegador bloquea las llamadas a otro dominio salvo que la API lo autorice. En la consola de AWS:

**API Gateway** → `catalogo-personal-api` → **CORS** → Configurar

| Campo | Valor |
|---|---|
| Access-Control-Allow-Origin | `*` |
| Access-Control-Allow-Headers | `content-type` |
| Access-Control-Allow-Methods | `GET, POST, PUT, DELETE, OPTIONS` |
| Access-Control-Max-Age | `300` |

En *Origin* y *Headers* hay que escribir el valor **y presionar Agregar**, si no, no se guarda.

---

## Correr en desarrollo

```bash
cd app
npm install
npm run dev
```

Abre <http://localhost:5173>.

La URL de la API sale de `.env.local` (no se sube a git):

```
VITE_API_URL=https://xxxx.execute-api.us-east-1.amazonaws.com
```

Sin ese archivo, la app la pide una vez y la guarda en el navegador. Si el archivo existe, entra directa.

## Configurar la app en otro dispositivo

Abrirla con la URL de la API al final del enlace la deja configurada de una vez:

```
https://jefernee.github.io/catalogo-personal-aws/#api=<URL_DE_LA_API>
```

La app guarda la URL en ese dispositivo y la borra de la barra de direcciones. Ese
enlace es el que conviene guardar en el gestor de contraseñas: sirve para el celular,
para otra computadora o para el día de la demo.

Quien abra la página sin esa parte final solo ve la pantalla de conexión — por eso la
URL no viaja dentro del build publicado.

## Compilar

```bash
npm run build      # genera dist/
npm run preview    # sirve dist/ para revisarlo
```

`dist/` es estático: se puede subir a S3 con hosting web, a GitHub Pages o a cualquier hosting.

---

## Qué hace

- **Métricas** arriba: total, pendientes, en curso, terminados y rating promedio.
- **Catálogo** en tarjetas: buscar por título, filtrar por tipo y estado, avanzar el estado con un clic, calificar con estrellas cuando algo queda terminado, **editar** cualquier campo y borrar.
- **Diario** en su propia pestaña, con fecha y contenido, también editable.
- **Exportar**: dispara `POST /export` y avisa cuántos registros subió a S3 y con qué nombre. Desde la pestaña del diario exporta el diario (`?tipo=diario`).
- **Instalable**: en Chrome/Edge aparece el icono de instalar en la barra de direcciones; en el celular, "Agregar a pantalla de inicio". Requiere servirla por HTTPS (en `localhost` funciona para probar, pero el service worker solo se registra bajo HTTPS).

Las actualizaciones se pintan de inmediato y se revierten solas si la API responde error.

---

## Estructura

```
app/
├── index.html
├── public/           manifest, service worker, iconos
└── src/
    ├── api.js        cliente de la API y catálogos de valores
    ├── App.jsx       estado, carga de datos y acciones
    ├── componentes.jsx  tarjetas, filtros, métricas, modales
    ├── styles.css    tokens de color, claro y oscuro, responsivo
    └── main.jsx
```

Sin librerías de UI ni de estado: React y CSS.

---

## Nota de seguridad

La API es pública y sin autenticación: cualquiera con la URL puede leer y escribir. Para uso diario conviene protegerla con una **API Key** en API Gateway, que además es uno de los bonus del proyecto y cuesta $0.
