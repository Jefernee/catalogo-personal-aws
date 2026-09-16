# Contexto del proyecto

Proyecto Final del **Módulo 3 (Cloud AWS)** del curso de Creai. Es individual y se
entrega con **demo en vivo + repositorio**, en las semanas 23 y 24.

Dominio elegido: **catálogo personal** — libros, películas, series, música, juegos y
restaurantes, con estado y calificación, más un **diario** que vive en la misma tabla
como un `tipo` más.

Repositorio: <https://github.com/Jefernee/catalogo-personal-aws> (público)

---

## Lo desplegado en AWS

Todo en **us-east-1**, cuenta `610156626281`, creada con usuario root.

| Recurso | Nombre / valor |
|---|---|
| API Gateway (HTTP API) | `catalogo-personal-api` · `https://dirb0jl8r2.execute-api.us-east-1.amazonaws.com` |
| Etapa | `$default`, con implementación automática |
| Lambda | `catalogo-personal-api` · Python 3.13 · timeout 30 s |
| Rol de ejecución | `catalogo-personal-lambda-role` + política insertada `catalogo-personal-permisos` |
| Tabla DynamoDB | `catalogo-personal` · PK `item_id` (String, UUID) · bajo demanda |
| Bucket S3 | `catalogo-personal-jefernee-2026` · exports en `exports/` |
| Log group | `/aws/lambda/catalogo-personal-api` · retención 7 días |
| Alarma | `catalogo-personal-errores` · `Errors > 0` (Suma, 5 min) → SNS `catalogo-personal-alertas` |
| Dashboard | `catalogo-personal` · widgets de Invocations y Errors |
| CORS | Origin `*`, headers `content-type`, métodos GET/POST/PUT/DELETE/OPTIONS |

La suscripción de correo al tema de SNS quedó **pendiente de confirmar** (el correo de
confirmación nunca llegó). No afecta la calificación: la alarma existe y está configurada.

**Variables de entorno de la Lambda:** `TABLE_NAME` y `BUCKET_NAME`. Los nombres nunca
van escritos en el código.

---

## Costos

- Plan gratuito nuevo de AWS, con **$120 USD de crédito** que vencen el **16/09/2027**.
- Presupuesto *zero spend* configurado: avisa a `jefernee50@gmail.com` si el gasto pasa de $0.01.
- El proyecto entero cabe en la capa gratuita. Lo único que cobra por hora sería
  ECS/Fargate, que **no** se usó.

---

## Estructura

```
lambda_function.py      la función: router + 6 endpoints + export
iam-policy.json         política de mínimo privilegio (ya con cuenta y bucket reales)
datos-prueba.json       10 registros de ejemplo
cargar_datos.py         los carga por la API o por boto3
demo.sh                 guion de la demo en vivo
pruebas_e2e.py          16 verificaciones contra la API desplegada
tests/                  51 pruebas con pytest + moto
app/                    aplicación React + Vite (PWA instalable)
frontend/index.html     la misma idea en un archivo, sin dependencias
DESPLIEGUE.md           paso a paso en la consola de AWS
PLAN-proyecto-final-modulo3.md   el plan contra la rúbrica
```

## Comandos

```bash
python -m pytest tests -q                                   # 51 pruebas locales
python pruebas_e2e.py https://dirb0jl8r2.execute-api.us-east-1.amazonaws.com
python cargar_datos.py https://dirb0jl8r2.execute-api.us-east-1.amazonaws.com
cd app && npm run dev                                       # app en localhost:5173
```

La app toma la URL de la API de `app/.env.local`, que **no se sube a git** para que el
build publicado no la lleve dentro. Sin ese archivo, la app la pide una vez y la guarda
en el navegador.

---

## Reglas del proyecto que conviene no romper

De la rúbrica (el PDF está en `../proyecto-final-modulo-3.pdf`):

- **50 %** es que la API responda **en vivo** el día de la demo y que los datos persistan.
- **30 %** es cubrir el stack: IAM específico, API Gateway sobre Lambda, DynamoDB, S3 y
  CloudWatch con logs, alarma y dashboard.
- **20 %** es defender las decisiones de diseño.
- **No se evalúa**: calidad del código, manejo exhaustivo de errores, tests, frontend ni
  documentación más allá del README. La app de `app/` es un extra.
- `AdministratorAccess` y `AmazonDynamoDBFullAccess` están **prohibidos**.
- El día de la demo hacen falta **entre 5 y 10 registros** en la tabla.

Mínimos técnicos: 6 endpoints, partition key apropiada, al menos una consulta que no sea
por ID (aquí, `scan` con `FilterExpression`), export que cree un archivo real en S3, y
retención de logs distinta de "nunca vence".

---

## Decisiones ya tomadas (y por qué)

- **Una sola Lambda con router interno** para CRUD y export. Separarlas está listado como
  mejora, no como deuda oculta.
- **`scan` con `FilterExpression`, no GSI.** El proyecto acepta el scan; el GSI es bonus y
  además es la respuesta a "¿y si mañana hay 10 000 usuarios?".
- **El diario queda fuera del export** salvo que se pida con `?tipo=diario`. Cumple el
  requisito tal cual está escrito y no sube entradas personales a S3 sin pedirlo.
- **Floats convertidos a `Decimal`**: DynamoDB no acepta float, y un rating de 4.5 hacía
  fallar la API.
- **`scan` paginado** con `LastEvaluatedKey`: sin eso, con volumen alto el listado y el
  export salían incompletos en silencio.
- **Estilo del código y de la interfaz en español**, igual que el resto del proyecto.

---

## Cómo cambiar cosas

**Lo más importante: la Lambda no se despliega sola.** El repositorio no está conectado
con AWS. Cambiar `lambda_function.py` aquí no cambia nada en la nube: hay que abrir la
consola → Lambda → `catalogo-personal-api` → pestaña **Code**, pegar el archivo completo
y darle a **Deploy**. Después conviene correr `pruebas_e2e.py` para confirmar.

La app de `app/` **sí** se publica sola: cada push a `main` que toque `app/` dispara el
workflow de `.github/workflows/pages.yml` y actualiza GitHub Pages.

| Quiero… | Dónde se toca |
|---|---|
| Agregar un tipo (por ejemplo `podcast`) | `TIPOS_VALIDOS` en `lambda_function.py`, y `TIPOS` + `ICONOS` + `CAMPO_EXTRA` en `app/src/api.js`. Luego pegar la Lambda en la consola. |
| Agregar un campo nuevo a los ítems | la lista de campos en `crear()` y la de `editables` en `actualizar()`, en `lambda_function.py`. DynamoDB no necesita cambios: no tiene esquema fijo. |
| Cambiar un estado o su orden | `ESTADOS_VALIDOS` en la Lambda; `ESTADOS`, `SIGUIENTE_ESTADO` y `ACCION_ESTADO` en `app/src/api.js`. |
| Agregar un endpoint | la función y el router en `lambda_function.py`, **y** la ruta en API Gateway → Rutas (si no existe la ruta, da 404 aunque el código esté bien). |
| Cambiar colores o tipografía | los tokens al inicio de `app/src/styles.css`. Todo el resto los hereda, incluido el tema oscuro. |
| Cambiar los permisos de la Lambda | `iam-policy.json` aquí, y pegarlo en IAM → Roles → `catalogo-personal-lambda-role` → política `catalogo-personal-permisos`. |
| Permitir otro origen en el navegador | API Gateway → CORS. Recordar: el valor hay que escribirlo **y darle a Agregar**, si no, no se guarda. |
| Cambiar la URL de la API en la app | `app/.env.local` (local), o el engrane dentro de la app (por navegador). |

**Antes de dar por bueno un cambio:**

```bash
python -m pytest tests -q          # la lógica, contra AWS emulado
python pruebas_e2e.py <url>        # la API real, ya desplegada
```

**Errores típicos y qué significan** (están también en `DESPLIEGUE.md`):

- **502** — el `return` de la Lambda no trae `statusCode`, `headers` o `body`.
- **403** — API Gateway no tiene permiso para invocar la Lambda.
- **404 desde la app** — la ruta no existe en API Gateway, o la pantalla quedó
  desactualizada (la app recarga sola en ese caso).
- **"No se pudo conectar" en el navegador** — casi siempre CORS.
- El traceback completo de cualquier error está en **CloudWatch Logs**, nunca en la
  pantalla de Lambda.

---

## Pendientes

- [ ] Confirmar con Ericka (la profesora) que el dominio *catálogo personal* está libre.
      Mel tomó gestor de tareas, Dani tracker de hábitos, Andrés reservaciones, Joan inventario.
- [ ] Llenar el catálogo con datos reales antes de la demo (mínimo 5).
- [ ] Ensayar los 10-15 minutos: intro, diagrama, demo en vivo, una decisión, preguntas.
- [ ] Opcional (bonus, $0): API Key en API Gateway, GSI por `tipo`+`estado`, Pulumi.
- [ ] La API es **pública y sin autenticación**. Para uso diario conviene la API Key.

**No borrar nada de AWS hasta después de presentar.** El orden de limpieza, si algún día
se decide, está al final de `DESPLIEGUE.md`.
