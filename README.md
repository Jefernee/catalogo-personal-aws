# Catálogo personal — API serverless

Proyecto Final · Módulo 3 · Cloud AWS

API REST para llevar un catálogo de lo que consumo (libros, películas, series, música, juegos, restaurantes) con su estado y calificación, más entradas de diario personal. El endpoint de exportación sube el catálogo completo a S3 como JSON.

Todos los ítems viven en una sola tabla de DynamoDB y se distinguen por el campo `tipo`, que además permite que cada uno lleve solo los campos que le corresponden.

---

## Arquitectura

```
                                  ┌──────────────────────────┐
                            ┌────►│  Lambda CRUD             │───┐
                            │     │  /catalogo               │   │   ┌──────────────────┐
┌──────────┐   ┌────────────┴─┐   └──────────────────────────┘   ├──►│   DynamoDB       │
│ Cliente  │──►│ API Gateway  │                                  │   │ catalogo-personal│
│ curl     │   │ HTTP API     │   ┌──────────────────────────┐   │   └──────────────────┘
└──────────┘   └────────────┬─┘   │  Lambda Export           │───┘
                            └────►│  /export                 │───┐   ┌──────────────────┐
                                  └──────────────────────────┘   ├──►│   S3             │
                                                                 │   │ exports/*.json   │
                                                                 │   └──────────────────┘
                                                                 │
                                                                 │   ┌──────────────────┐
                                                                 └──►│   CloudWatch     │
                                                                     │ logs·alarma·dash │
                                                                     └──────────────────┘
```

Los roles IAM con mínimo privilegio no son una capa aparte del diagrama: son una condición de cada flecha.

> En este proyecto el CRUD y el export viven en la **misma función** con un router interno. Separarlos en dos Lambdas es una de las mejoras listadas en el análisis.

---

## Endpoints

| Método | Ruta | Descripción |
|---|---|---|
| `GET` | `/catalogo` | Lista todos los ítems. Acepta `?tipo=` y `?estado=` (scan con FilterExpression) |
| `GET` | `/catalogo/{id}` | Devuelve un ítem por su `item_id` |
| `POST` | `/catalogo` | Crea un ítem. `titulo` es obligatorio; el `item_id` se genera como UUID |
| `PUT` | `/catalogo/{id}` | Actualiza campos de un ítem. Al pasar a `terminado` fija `fecha_consumido` sola |
| `DELETE` | `/catalogo/{id}` | Elimina un ítem |
| `POST` | `/export` | Exporta a S3 y devuelve la key del archivo. `?tipo=diario` para exportar el diario |

**Valores de `tipo`:** `libro` · `pelicula` · `serie` · `musica` · `juego` · `restaurante` · `diario`
**Valores de `estado`:** `pendiente` · `en_curso` · `terminado` · `abandonado`

---

## Ejemplo de llamada

```bash
curl -X POST https://TU-ID.execute-api.us-east-1.amazonaws.com/dev/catalogo \
  -H "Content-Type: application/json" \
  -d '{"tipo":"libro","titulo":"Piranesi","autor":"Susanna Clarke","estado":"pendiente"}'
```

```json
{
  "item_id": "550e8400-e29b-41d4-a716-446655440000",
  "tipo": "libro",
  "titulo": "Piranesi",
  "estado": "pendiente",
  "autor": "Susanna Clarke",
  "creado_en": "2026-09-15T21:04:00Z"
}
```

Respuesta del export:

```json
{
  "mensaje": "Exportacion exitosa",
  "archivo": "exports/export-2026-09-15.json",
  "total_registros": 8
}
```

La secuencia completa de la demo está en [`demo.sh`](demo.sh).

---

## Archivos

| Archivo | Qué es |
|---|---|
| `lambda_function.py` | La función: router + los 6 endpoints |
| `iam-policy.json` | Policy de mínimo privilegio del rol de ejecución |
| `datos-prueba.json` | 10 registros de ejemplo |
| `cargar_datos.py` | Los carga en la tabla (se corre local, no es parte de la Lambda) |
| `demo.sh` | La demo en vivo en orden |
| `tests/` | Suite de pruebas (pytest + moto) |
| `pruebas_e2e.py` | Pruebas de humo contra la API desplegada |
| `app/` | App React instalable para usar el catalogo (extra, no forma parte de lo evaluado) |
| `frontend/` | La misma idea en un solo archivo HTML, sin dependencias |
| `DESPLIEGUE.md` | Paso a paso en la consola de AWS |
| `PLAN-proyecto-final-modulo3.md` | Plan del proyecto contra la rúbrica |

---

## Pruebas

```bash
pip install -r requirements-dev.txt
python -m pytest tests -v
```

49 pruebas contra **DynamoDB y S3 emulados** (moto): los 6 endpoints, las validaciones, los filtros, el contenido real del archivo en S3, el formato de respuesta que exige API Gateway y los caminos de error. No tocan AWS, no cuestan nada y corren en ~15 segundos.

Con la API ya desplegada, las pruebas de humo contra AWS de verdad:

```bash
python pruebas_e2e.py https://TU-ID.execute-api.us-east-1.amazonaws.com/dev
```

Verifican lo que el emulador no puede ver: que API Gateway esté conectado, que el rol IAM tenga los permisos y que el export llegue al bucket. Crean y eliminan sus propios registros. Solo usan la librería estándar.

---

## Interfaz (extra)

El proyecto es una API y no requiere interfaz, pero hay dos, y ambas consumen los seis endpoints:

- **[`app/`](app/LEEME.md)** — aplicación React + Vite, instalable como PWA: métricas, búsqueda, filtros, tarjetas, calificación con estrellas, diario y exportación. `npm install && npm run dev`.
- **[`frontend/`](frontend/LEEME.md)** — la misma idea en un solo archivo HTML sin dependencias, por si no se quiere depender de npm.

Las dos necesitan CORS habilitado en API Gateway (instrucciones en cualquiera de los dos LEEME).

---

## Decisiones técnicas

**Por qué DynamoDB y no RDS.** Los ítems no comparten las mismas columnas: un libro tiene `autor`, un restaurante tiene `ciudad`, una entrada de diario tiene `contenido`. En un relacional serían varias tablas o una tabla con muchas columnas nulas. Tampoco hay relaciones complejas que resolver con joins, y DynamoDB es un servicio de API: no hay VPC que configurar.

**Por qué esa partition key.** `item_id` es un UUID, nunca un número secuencial: distribuye la escritura entre particiones y no filtra información. Las consultas por `tipo` y `estado` se resuelven hoy con un `scan` con `FilterExpression`; con volumen alto eso deja de escalar y la solución sería un GSI sobre esos dos atributos.

**Qué permisos tiene el rol.** Solo los diez de `iam-policy.json`, acotados a esta tabla y a la carpeta `exports/` de este bucket. Nada de `AdministratorAccess` ni `*`.

**Qué vigila la alarma.** La métrica `Errors` de la Lambda: si hay más de 0 en cinco minutos, se dispara. Cubre una sola falla posible, y ese es su límite conocido.

**Retención de logs en 7 días.** Para no acumular costos por logs que no voy a leer.

---

## Análisis

**Fortalezas.** Cero gestión de servidores. Escala automática por invocación. Todo el proyecto entra en free tier: costo real $0. Sin VPC que configurar. Observabilidad incluida sin código extra.

**Debilidades.** El `scan` sobre toda la tabla no escala con el volumen. Cold starts tras inactividad. Una sola alarma cubre una sola falla posible. CRUD y export comparten una misma función.

**Mejoras factibles.** GSI por `tipo` y `estado` en vez de `scan`. Infraestructura definida con Pulumi. API Key en API Gateway. Custom metrics de negocio (`ItemsCreados`) además de las de infraestructura. Separar el export en su propia Lambda.

**Riesgos.** Un rol IAM demasiado amplio abre un radio de daño mayor al necesario. Credenciales en el repositorio si no se usan variables de entorno. Recursos en regiones distintas rompen la integración de forma silenciosa.
