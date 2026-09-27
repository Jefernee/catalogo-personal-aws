"""
Catalogo personal - Proyecto Final Modulo 3 (Backend Serverless en AWS)

Una sola Lambda que atiende los 6 endpoints a traves de API Gateway (HTTP API).
Los nombres de la tabla y el bucket vienen de variables de entorno: nunca hardcodeados.

Acceso: toda peticion debe traer "Authorization: Bearer <token>". Los tokens
validos vienen de TOKEN_PRINCIPAL (el tuyo) y TOKEN_INVITADO (el que se comparte;
cambiarlo corta el acceso a quien lo tenga sin tocar el tuyo). Si TOKEN_PRINCIPAL
no esta configurado, la API rechaza todo: falla cerrada, nunca abierta.
"""

import base64
import hmac
import json
import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal

import boto3
from boto3.dynamodb.conditions import Attr

TABLE_NAME = os.environ["TABLE_NAME"]
BUCKET_NAME = os.environ["BUCKET_NAME"]

table = boto3.resource("dynamodb").Table(TABLE_NAME)
s3 = boto3.client("s3")

# tarea y compra son para el dia a dia: lo que hay que hacer y lo que hay que comprar.
TIPOS_VALIDOS = {"libro", "pelicula", "serie", "musica", "juego", "restaurante",
                 "tarea", "compra", "diario"}
ESTADOS_VALIDOS = {"pendiente", "en_curso", "terminado", "abandonado"}

# Fondos de pagina para las entradas del diario. Se validan para no guardar
# cualquier texto que llegue en el campo.
FONDOS_VALIDOS = {"papel", "crema", "rayado", "cuadricula", "lino",
                  "rosa", "menta", "cielo", "lavanda", "noche"}

CAMPOS_EXTRA = ("rating", "notas", "tags", "autor", "director", "plataforma",
                "ciudad", "lugar", "contenido", "fecha", "fecha_consumido", "fondo")


class DecimalEncoder(json.JSONEncoder):
    """DynamoDB devuelve los numeros como Decimal y json no sabe serializarlos."""

    def default(self, o):
        if isinstance(o, Decimal):
            return int(o) if o % 1 == 0 else float(o)
        return super().default(o)


def responder(status, cuerpo, headers=None):
    # Sin statusCode, headers y body, API Gateway devuelve 502.
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json", **(headers or {})},
        "body": json.dumps(cuerpo, cls=DecimalEncoder, ensure_ascii=False),
    }


# --------------------------------------------------------------------------
# Acceso
# --------------------------------------------------------------------------

def tokens_validos():
    """Se leen en cada llamada: cambiar la variable en la consola surte efecto
    en la siguiente peticion, sin redesplegar."""
    return [t for t in (os.environ.get("TOKEN_PRINCIPAL", "").strip(),
                        os.environ.get("TOKEN_INVITADO", "").strip()) if t]


def token_de(event):
    """Saca el token de "Authorization: Bearer <token>". HTTP API entrega los
    nombres de header en minusculas, pero REST API no: se buscan sin distinguir."""
    headers = event.get("headers") or {}
    valor = next((v for k, v in headers.items() if k.lower() == "authorization"), "")
    tipo, _, token = (valor or "").partition(" ")
    if tipo.lower() != "bearer":
        return ""
    return token.strip()


def autorizado(event):
    """None si pasa; si no, la respuesta de rechazo lista para devolver."""
    validos = tokens_validos()
    if not os.environ.get("TOKEN_PRINCIPAL", "").strip():
        # Falla cerrada: sin token principal configurado no entra nadie.
        return responder(503, {"error": "La API no tiene configurado el acceso"})

    token = token_de(event)
    # compare_digest compara en tiempo constante: no deja adivinar el token
    # midiendo cuanto tarda la respuesta.
    if token and any(hmac.compare_digest(token.encode(), t.encode()) for t in validos):
        return None

    return responder(401, {"error": "Clave de acceso invalida o ausente"},
                     headers={"WWW-Authenticate": "Bearer"})



def ahora():
    return datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")


def a_decimal(valor):
    """DynamoDB no acepta float: un rating de 4.5 lo haria fallar."""
    if isinstance(valor, float):
        return Decimal(str(valor))
    if isinstance(valor, list):
        return [a_decimal(v) for v in valor]
    if isinstance(valor, dict):
        return {k: a_decimal(v) for k, v in valor.items()}
    return valor


def escanear(**kwargs):
    """scan paginado: un solo scan devuelve como maximo 1 MB de datos."""
    items = []
    respuesta = table.scan(**kwargs)
    items.extend(respuesta.get("Items", []))
    while "LastEvaluatedKey" in respuesta:
        respuesta = table.scan(ExclusiveStartKey=respuesta["LastEvaluatedKey"], **kwargs)
        items.extend(respuesta.get("Items", []))
    return items


# --------------------------------------------------------------------------
# Endpoints
# --------------------------------------------------------------------------

def listar(params):
    """GET /catalogo  ·  ?tipo=libro&estado=pendiente

    Este es el scan con FilterExpression que pide el proyecto: una consulta
    que no es solo por ID. Con volumen alto se cambiaria por un GSI (bonus).
    """
    filtros = None
    for campo in ("tipo", "estado"):
        valor = params.get(campo)
        if valor:
            condicion = Attr(campo).eq(valor)
            filtros = condicion if filtros is None else filtros & condicion

    items = escanear() if filtros is None else escanear(FilterExpression=filtros)
    return responder(200, {"total": len(items), "items": items})


def obtener(item_id):
    """GET /catalogo/{id}"""
    item = table.get_item(Key={"item_id": item_id}).get("Item")
    if not item:
        return responder(404, {"error": "No existe un item con ese id"})
    return responder(200, item)


def crear(cuerpo):
    """POST /catalogo"""
    titulo = (cuerpo.get("titulo") or "").strip()
    if not titulo:
        return responder(400, {"error": "El campo 'titulo' es obligatorio"})

    tipo = cuerpo.get("tipo", "libro")
    if tipo not in TIPOS_VALIDOS:
        return responder(400, {"error": f"tipo invalido. Validos: {sorted(TIPOS_VALIDOS)}"})

    estado = cuerpo.get("estado", "pendiente")
    if estado not in ESTADOS_VALIDOS:
        return responder(400, {"error": f"estado invalido. Validos: {sorted(ESTADOS_VALIDOS)}"})

    item = {
        "item_id": str(uuid.uuid4()),  # UUID, nunca secuencial
        "tipo": tipo,
        "titulo": titulo,
        "estado": estado,
        "creado_en": ahora(),
    }

    fondo = cuerpo.get("fondo")
    if fondo is not None and fondo not in FONDOS_VALIDOS:
        return responder(400, {"error": f"fondo invalido. Validos: {sorted(FONDOS_VALIDOS)}"})

    # Los items no comparten los mismos campos: un libro lleva autor,
    # un restaurante lleva ciudad, una entrada de diario lleva contenido.
    for campo in CAMPOS_EXTRA:
        if cuerpo.get(campo) is not None:
            item[campo] = a_decimal(cuerpo[campo])

    table.put_item(Item=item)
    return responder(201, item)


def actualizar(item_id, cuerpo):
    """PUT /catalogo/{id}"""
    if not table.get_item(Key={"item_id": item_id}).get("Item"):
        return responder(404, {"error": "No existe un item con ese id"})

    editables = ("titulo", "tipo", "estado") + CAMPOS_EXTRA
    cambios = {c: a_decimal(cuerpo[c]) for c in editables if c in cuerpo}
    if not cambios:
        return responder(400, {"error": "No se envio ningun campo editable"})

    if "tipo" in cambios and cambios["tipo"] not in TIPOS_VALIDOS:
        return responder(400, {"error": f"tipo invalido. Validos: {sorted(TIPOS_VALIDOS)}"})
    if "estado" in cambios and cambios["estado"] not in ESTADOS_VALIDOS:
        return responder(400, {"error": f"estado invalido. Validos: {sorted(ESTADOS_VALIDOS)}"})
    if "fondo" in cambios and cambios["fondo"] not in FONDOS_VALIDOS:
        return responder(400, {"error": f"fondo invalido. Validos: {sorted(FONDOS_VALIDOS)}"})

    # Si se marca como terminado y no viene la fecha, se pone sola.
    if cambios.get("estado") == "terminado" and "fecha_consumido" not in cambios:
        cambios["fecha_consumido"] = ahora()[:10]

    cambios["actualizado_en"] = ahora()

    # Los nombres de campo van como placeholders por si alguno es palabra reservada.
    sets = ", ".join(f"#{c} = :{c}" for c in cambios)
    resultado = table.update_item(
        Key={"item_id": item_id},
        UpdateExpression=f"SET {sets}",
        ExpressionAttributeNames={f"#{c}": c for c in cambios},
        ExpressionAttributeValues={f":{c}": v for c, v in cambios.items()},
        ReturnValues="ALL_NEW",
    )
    return responder(200, resultado["Attributes"])


def eliminar(item_id):
    """DELETE /catalogo/{id}"""
    if not table.get_item(Key={"item_id": item_id}).get("Item"):
        return responder(404, {"error": "No existe un item con ese id"})

    table.delete_item(Key={"item_id": item_id})
    return responder(200, {"mensaje": "Item eliminado", "item_id": item_id})


def exportar(params):
    """POST /export  ·  ?tipo=diario para exportar el diario en su lugar

    Por defecto exporta el catalogo y deja fuera las entradas de diario:
    son personales y no tienen por que subir a S3 sin pedirlo.
    """
    tipo = params.get("tipo")
    if tipo:
        items = escanear(FilterExpression=Attr("tipo").eq(tipo))
    else:
        items = escanear(FilterExpression=Attr("tipo").ne("diario"))

    # El nombre lleva qué se exportó y cuándo: dos exports seguidos (el catálogo y
    # el diario, por ejemplo) no se pisan el uno al otro.
    que = "catalogo" if not tipo else "".join(c for c in tipo if c.isalnum())[:20] or "otro"
    key = f"exports/{que}-{datetime.now(timezone.utc):%Y-%m-%d_%H-%M-%S}.json"

    s3.put_object(
        Bucket=BUCKET_NAME,
        Key=key,
        Body=json.dumps(items, cls=DecimalEncoder, ensure_ascii=False, indent=2).encode("utf-8"),
        ContentType="application/json",
    )

    return responder(200, {
        "mensaje": "Exportacion exitosa",
        "archivo": key,
        "total_registros": len(items),
    })


# --------------------------------------------------------------------------
# Router
# --------------------------------------------------------------------------

def lambda_handler(event, context):
    # HTTP API (payload v2) y, por si acaso, REST API (v1).
    contexto_http = event.get("requestContext", {}).get("http", {})
    metodo = contexto_http.get("method") or event.get("httpMethod", "")
    ruta = (contexto_http.get("path") or event.get("path", "")).rstrip("/")

    # En CloudWatch queda solo qué se pidió y cómo salió: nunca el cuerpo (ahí va
    # el texto del diario) ni los headers (ahí va la clave).
    respuesta = atender(event, metodo, ruta)
    print(f"{metodo} {ruta[:120]} -> {respuesta['statusCode']}")
    return respuesta


def atender(event, metodo, ruta):
    try:
        # El acceso se revisa antes que nada, incluso antes de saber si la ruta
        # existe: a quien no tiene clave no se le dice ni que rutas hay.
        rechazo = autorizado(event)
        if rechazo:
            return rechazo

        params = event.get("queryStringParameters") or {}
        segmentos = [s for s in ruta.split("/") if s]

        # El id viene en pathParameters; si no, se saca de la propia ruta.
        item_id = (event.get("pathParameters") or {}).get("id")
        if not item_id and len(segmentos) >= 2 and segmentos[-2] == "catalogo":
            item_id = segmentos[-1]

        cuerpo = {}
        if event.get("body"):
            crudo = event["body"]
            if event.get("isBase64Encoded"):
                crudo = base64.b64decode(crudo).decode("utf-8")
            try:
                cuerpo = json.loads(crudo)
            except (json.JSONDecodeError, UnicodeDecodeError):
                return responder(400, {"error": "El body no es JSON valido"})
            if not isinstance(cuerpo, dict):
                return responder(400, {"error": "El body tiene que ser un objeto JSON"})

        if segmentos and segmentos[-1] == "export":
            if metodo != "POST":
                return responder(404, {"error": f"Ruta no encontrada: {metodo} {ruta}"})
            return exportar(params)

        # Solo /catalogo y /catalogo/{id} son rutas validas.
        if item_id:
            en_catalogo = len(segmentos) >= 2 and segmentos[-2] == "catalogo"
        else:
            en_catalogo = bool(segmentos) and segmentos[-1] == "catalogo"

        if en_catalogo:
            if item_id:
                if metodo == "GET":
                    return obtener(item_id)
                if metodo == "PUT":
                    return actualizar(item_id, cuerpo)
                if metodo == "DELETE":
                    return eliminar(item_id)
            else:
                if metodo == "GET":
                    return listar(params)
                if metodo == "POST":
                    return crear(cuerpo)

        return responder(404, {"error": f"Ruta no encontrada: {metodo} {ruta}"})

    except Exception as error:  # el detalle queda en CloudWatch Logs
        print(f"ERROR en {metodo} {ruta[:120]}: {type(error).__name__}: {error}")
        return responder(500, {"error": "Error interno", "detalle": str(error)})
