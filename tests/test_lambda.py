"""
Pruebas de la API del catalogo personal.

Se corren contra DynamoDB y S3 emulados (moto). Cubren los 6 endpoints,
las validaciones, los casos de error y el comportamiento del export.

    python -m pytest -v
"""

import json
import uuid
from datetime import datetime, timezone

from conftest import BUCKET_NAME, crear_item, llamar


# ==========================================================================
# POST /catalogo
# ==========================================================================

def test_crear_devuelve_201_y_el_item(lf):
    status, cuerpo, _ = llamar(lf, "POST", "/catalogo", body={
        "tipo": "libro", "titulo": "Piranesi", "autor": "Susanna Clarke",
    })
    assert status == 201
    assert cuerpo["titulo"] == "Piranesi"
    assert cuerpo["autor"] == "Susanna Clarke"
    assert cuerpo["estado"] == "pendiente"      # default
    assert cuerpo["tipo"] == "libro"


def test_crear_genera_un_uuid_valido(lf):
    item = crear_item(lf)
    assert uuid.UUID(item["item_id"]).version == 4


def test_crear_pone_fecha_de_creacion_iso(lf):
    item = crear_item(lf)
    assert item["creado_en"].endswith("Z")
    datetime.fromisoformat(item["creado_en"].replace("Z", "+00:00"))


def test_crear_sin_titulo_devuelve_400(lf):
    status, cuerpo, _ = llamar(lf, "POST", "/catalogo", body={"tipo": "libro"})
    assert status == 400
    assert "titulo" in cuerpo["error"]


def test_crear_con_titulo_en_blanco_devuelve_400(lf):
    status, _, _ = llamar(lf, "POST", "/catalogo", body={"titulo": "   "})
    assert status == 400


def test_crear_con_tipo_invalido_devuelve_400(lf):
    status, cuerpo, _ = llamar(lf, "POST", "/catalogo",
                               body={"titulo": "X", "tipo": "pelicula_de_terror"})
    assert status == 400
    assert "tipo" in cuerpo["error"]


def test_crear_con_estado_invalido_devuelve_400(lf):
    status, cuerpo, _ = llamar(lf, "POST", "/catalogo",
                               body={"titulo": "X", "estado": "casi_terminado"})
    assert status == 400
    assert "estado" in cuerpo["error"]


def test_crear_ignora_campos_desconocidos(lf):
    item = crear_item(lf, campo_inventado="no deberia guardarse")
    assert "campo_inventado" not in item


def test_items_de_distinto_tipo_llevan_distintos_campos(lf):
    """El argumento de 'por que DynamoDB y no RDS' tiene que ser cierto."""
    libro = crear_item(lf, tipo="libro", titulo="Dune", autor="Frank Herbert")
    resto = crear_item(lf, tipo="restaurante", titulo="La Oruga", ciudad="SLP")
    diario = crear_item(lf, tipo="diario", titulo="Hoy", contenido="Arranque el proyecto")

    assert "autor" in libro and "ciudad" not in libro
    assert "ciudad" in resto and "autor" not in resto
    assert "contenido" in diario


def test_crear_acepta_rating_decimal(lf):
    """JSON manda 4.5 como float y DynamoDB no acepta floats."""
    status, cuerpo, _ = llamar(lf, "POST", "/catalogo",
                               body={"titulo": "X", "rating": 4.5})
    assert status == 201, cuerpo
    assert cuerpo["rating"] == 4.5


# ==========================================================================
# GET /catalogo  y  GET /catalogo/{id}
# ==========================================================================

def test_listar_vacio_devuelve_total_cero(lf):
    status, cuerpo, _ = llamar(lf, "GET", "/catalogo")
    assert status == 200
    assert cuerpo == {"total": 0, "items": []}


def test_listar_devuelve_todos(lf):
    for i in range(3):
        crear_item(lf, titulo=f"Libro {i}")
    status, cuerpo, _ = llamar(lf, "GET", "/catalogo")
    assert status == 200
    assert cuerpo["total"] == 3
    assert len(cuerpo["items"]) == 3


def test_filtrar_por_tipo(lf):
    crear_item(lf, tipo="libro", titulo="Dune")
    crear_item(lf, tipo="pelicula", titulo="Arrival")
    crear_item(lf, tipo="pelicula", titulo="Sicario")

    status, cuerpo, _ = llamar(lf, "GET", "/catalogo", params={"tipo": "pelicula"})
    assert status == 200
    assert cuerpo["total"] == 2
    assert {i["titulo"] for i in cuerpo["items"]} == {"Arrival", "Sicario"}


def test_filtrar_por_tipo_y_estado_a_la_vez(lf):
    crear_item(lf, tipo="libro", titulo="A", estado="pendiente")
    crear_item(lf, tipo="libro", titulo="B", estado="terminado")
    crear_item(lf, tipo="serie", titulo="C", estado="pendiente")

    status, cuerpo, _ = llamar(lf, "GET", "/catalogo",
                               params={"tipo": "libro", "estado": "pendiente"})
    assert status == 200
    assert cuerpo["total"] == 1
    assert cuerpo["items"][0]["titulo"] == "A"


def test_filtro_sin_resultados_devuelve_lista_vacia(lf):
    crear_item(lf, tipo="libro")
    status, cuerpo, _ = llamar(lf, "GET", "/catalogo", params={"tipo": "juego"})
    assert status == 200
    assert cuerpo["total"] == 0


def test_obtener_por_id(lf):
    item = crear_item(lf, titulo="Piranesi")
    status, cuerpo, _ = llamar(lf, "GET", "/catalogo", item_id=item["item_id"])
    assert status == 200
    assert cuerpo["titulo"] == "Piranesi"
    assert cuerpo["item_id"] == item["item_id"]


def test_obtener_id_inexistente_devuelve_404(lf):
    status, cuerpo, _ = llamar(lf, "GET", "/catalogo", item_id="no-existe")
    assert status == 404
    assert "error" in cuerpo


def test_los_datos_persisten_entre_llamadas(lf):
    """El 50% de la rubrica: los datos persisten entre llamadas."""
    creado = crear_item(lf, titulo="Persistente")
    _, listado, _ = llamar(lf, "GET", "/catalogo")
    _, leido, _ = llamar(lf, "GET", "/catalogo", item_id=creado["item_id"])

    assert listado["total"] == 1
    assert leido["titulo"] == "Persistente"


# ==========================================================================
# PUT /catalogo/{id}
# ==========================================================================

def test_actualizar_cambia_los_campos(lf):
    item = crear_item(lf, titulo="Piranesi")
    status, cuerpo, _ = llamar(lf, "PUT", "/catalogo", item_id=item["item_id"],
                               body={"estado": "terminado", "rating": 5, "notas": "Precioso"})
    assert status == 200
    assert cuerpo["estado"] == "terminado"
    assert cuerpo["rating"] == 5
    assert cuerpo["notas"] == "Precioso"
    assert cuerpo["titulo"] == "Piranesi"        # lo no enviado no se toca


def test_actualizar_a_terminado_fija_la_fecha_sola(lf):
    item = crear_item(lf)
    _, cuerpo, _ = llamar(lf, "PUT", "/catalogo", item_id=item["item_id"],
                          body={"estado": "terminado"})
    hoy = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    assert cuerpo["fecha_consumido"] == hoy


def test_actualizar_respeta_la_fecha_enviada(lf):
    item = crear_item(lf)
    _, cuerpo, _ = llamar(lf, "PUT", "/catalogo", item_id=item["item_id"],
                          body={"estado": "terminado", "fecha_consumido": "2026-01-01"})
    assert cuerpo["fecha_consumido"] == "2026-01-01"


def test_actualizar_deja_marca_de_tiempo(lf):
    item = crear_item(lf)
    _, cuerpo, _ = llamar(lf, "PUT", "/catalogo", item_id=item["item_id"],
                          body={"notas": "algo"})
    assert "actualizado_en" in cuerpo


def test_actualizar_con_cadena_vacia_limpia_el_campo(lf):
    """Editar desde la app manda "" para borrar un dato."""
    item = crear_item(lf, autor="Autor viejo", notas="nota vieja")
    _, cuerpo, _ = llamar(lf, "PUT", "/catalogo", item_id=item["item_id"],
                          body={"autor": "", "notas": ""})
    assert cuerpo["autor"] == ""
    assert cuerpo["notas"] == ""


def test_actualizar_todo_desde_el_formulario_de_edicion(lf):
    """El modal manda titulo, tipo, estado y los extras en una sola llamada."""
    item = crear_item(lf, titulo="Con error", autor="X")
    _, cuerpo, _ = llamar(lf, "PUT", "/catalogo", item_id=item["item_id"], body={
        "titulo": "Corregido", "tipo": "libro", "estado": "en_curso",
        "autor": "Autor bueno", "notas": "nota",
    })
    assert cuerpo["titulo"] == "Corregido"
    assert cuerpo["autor"] == "Autor bueno"
    assert cuerpo["estado"] == "en_curso"


def test_actualizar_id_inexistente_devuelve_404(lf):
    status, _, _ = llamar(lf, "PUT", "/catalogo", item_id="no-existe",
                          body={"estado": "terminado"})
    assert status == 404


def test_actualizar_sin_campos_editables_devuelve_400(lf):
    item = crear_item(lf)
    status, cuerpo, _ = llamar(lf, "PUT", "/catalogo", item_id=item["item_id"],
                               body={"item_id": "intento-de-cambiar-la-clave"})
    assert status == 400


def test_actualizar_con_estado_invalido_devuelve_400(lf):
    item = crear_item(lf)
    status, _, _ = llamar(lf, "PUT", "/catalogo", item_id=item["item_id"],
                          body={"estado": "inventado"})
    assert status == 400


def test_actualizar_todos_los_campos_editables_a_la_vez(lf):
    """Ningun nombre de campo choca con una palabra reservada de DynamoDB."""
    item = crear_item(lf)
    todos = {
        "titulo": "T", "tipo": "juego", "estado": "abandonado", "rating": 3,
        "notas": "N", "tags": ["a", "b"], "autor": "A", "director": "D",
        "plataforma": "P", "ciudad": "C", "contenido": "X", "fecha": "2026-01-01",
        "fecha_consumido": "2026-01-02",
    }
    status, cuerpo, _ = llamar(lf, "PUT", "/catalogo", item_id=item["item_id"], body=todos)
    assert status == 200, cuerpo
    for campo, valor in todos.items():
        assert cuerpo[campo] == valor


# ==========================================================================
# DELETE /catalogo/{id}
# ==========================================================================

def test_eliminar_borra_de_verdad(lf):
    item = crear_item(lf)
    status, _, _ = llamar(lf, "DELETE", "/catalogo", item_id=item["item_id"])
    assert status == 200

    status, _, _ = llamar(lf, "GET", "/catalogo", item_id=item["item_id"])
    assert status == 404

    _, listado, _ = llamar(lf, "GET", "/catalogo")
    assert listado["total"] == 0


def test_eliminar_id_inexistente_devuelve_404(lf):
    status, _, _ = llamar(lf, "DELETE", "/catalogo", item_id="no-existe")
    assert status == 404


# ==========================================================================
# POST /export
# ==========================================================================

def test_export_sube_el_archivo_a_s3(lf, s3):
    crear_item(lf, titulo="Dune")
    crear_item(lf, titulo="Arrival", tipo="pelicula")

    status, cuerpo, _ = llamar(lf, "POST", "/export")
    assert status == 200
    assert cuerpo["mensaje"] == "Exportacion exitosa"
    assert cuerpo["total_registros"] == 2

    objeto = s3.get_object(Bucket=BUCKET_NAME, Key=cuerpo["archivo"])
    contenido = json.loads(objeto["Body"].read())
    assert len(contenido) == 2
    assert {i["titulo"] for i in contenido} == {"Dune", "Arrival"}


def test_el_archivo_lleva_la_fecha_en_el_nombre(lf):
    _, cuerpo, _ = llamar(lf, "POST", "/export")
    hoy = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    assert cuerpo["archivo"] == f"exports/export-{hoy}.json"


def test_el_export_deja_fuera_el_diario(lf, s3):
    """Las entradas personales no suben a S3 salvo que se pidan."""
    crear_item(lf, tipo="libro", titulo="Dune")
    crear_item(lf, tipo="diario", titulo="Hoy", contenido="algo privado")

    _, cuerpo, _ = llamar(lf, "POST", "/export")
    assert cuerpo["total_registros"] == 1

    contenido = json.loads(s3.get_object(Bucket=BUCKET_NAME, Key=cuerpo["archivo"])["Body"].read())
    assert [i["titulo"] for i in contenido] == ["Dune"]
    assert "algo privado" not in json.dumps(contenido)


def test_export_del_diario_cuando_se_pide(lf, s3):
    crear_item(lf, tipo="libro", titulo="Dune")
    crear_item(lf, tipo="diario", titulo="Hoy", contenido="algo")

    _, cuerpo, _ = llamar(lf, "POST", "/export", params={"tipo": "diario"})
    assert cuerpo["total_registros"] == 1

    contenido = json.loads(s3.get_object(Bucket=BUCKET_NAME, Key=cuerpo["archivo"])["Body"].read())
    assert contenido[0]["titulo"] == "Hoy"


def test_export_con_tabla_vacia_igual_crea_el_archivo(lf, s3):
    status, cuerpo, _ = llamar(lf, "POST", "/export")
    assert status == 200
    assert cuerpo["total_registros"] == 0
    assert json.loads(s3.get_object(Bucket=BUCKET_NAME, Key=cuerpo["archivo"])["Body"].read()) == []


def test_el_json_exportado_no_trae_decimales_de_dynamodb(lf, s3):
    crear_item(lf, rating=5)
    _, cuerpo, _ = llamar(lf, "POST", "/export")
    crudo = s3.get_object(Bucket=BUCKET_NAME, Key=cuerpo["archivo"])["Body"].read().decode()
    assert "Decimal" not in crudo
    assert json.loads(crudo)[0]["rating"] == 5


# ==========================================================================
# Router, formato de respuesta y errores
# ==========================================================================

def test_toda_respuesta_trae_los_tres_campos(lf):
    """Sin statusCode, headers y body, API Gateway devuelve 502."""
    _, _, respuesta = llamar(lf, "GET", "/catalogo")
    assert set(respuesta) >= {"statusCode", "headers", "body"}
    assert respuesta["headers"]["Content-Type"] == "application/json"
    assert isinstance(respuesta["body"], str)


def test_body_que_no_es_json_devuelve_400(lf):
    status, cuerpo, _ = llamar(lf, "POST", "/catalogo", crudo="esto no es json {{{")
    assert status == 400
    assert "JSON" in cuerpo["error"]


def test_ruta_desconocida_devuelve_404(lf):
    status, _, _ = llamar(lf, "GET", "/otra-cosa")
    assert status == 404


def test_metodo_no_soportado_devuelve_404(lf):
    status, _, _ = llamar(lf, "PATCH", "/catalogo")
    assert status == 404


def test_funciona_con_el_stage_en_la_ruta(lf):
    """API Gateway manda /dev/catalogo, no /catalogo."""
    status, _, _ = llamar(lf, "GET", "/dev/catalogo")
    assert status == 200

    status, cuerpo, _ = llamar(lf, "POST", "/dev/export")
    assert status == 200, cuerpo


def test_acepta_el_payload_v1_de_rest_api(lf):
    """Por si la API se crea como REST API en vez de HTTP API."""
    evento = {"httpMethod": "GET", "path": "/catalogo",
              "queryStringParameters": None, "pathParameters": None, "body": None}
    respuesta = lf.lambda_handler(evento, None)
    assert respuesta["statusCode"] == 200


def test_sin_query_string_no_truena(lf):
    """API Gateway manda null, no {}."""
    status, _, _ = llamar(lf, "GET", "/catalogo", params=None)
    assert status == 200


def test_un_fallo_de_aws_devuelve_500_y_no_revienta(lf, monkeypatch):
    def explota(*args, **kwargs):
        raise RuntimeError("DynamoDB no responde")

    monkeypatch.setattr(lf.table, "scan", explota)
    status, cuerpo, _ = llamar(lf, "GET", "/catalogo")
    assert status == 500
    assert "error" in cuerpo


def test_body_en_base64_se_decodifica(lf):
    """API Gateway puede mandar el body codificado."""
    import base64
    crudo = base64.b64encode(json.dumps({"titulo": "Desde base64"}).encode()).decode()
    evento = {
        "requestContext": {"http": {"method": "POST", "path": "/catalogo"}},
        "body": crudo, "isBase64Encoded": True,
        "queryStringParameters": None, "pathParameters": None,
    }
    respuesta = lf.lambda_handler(evento, None)
    assert respuesta["statusCode"] == 201
    assert json.loads(respuesta["body"])["titulo"] == "Desde base64"


def test_body_que_es_una_lista_devuelve_400(lf):
    status, _, _ = llamar(lf, "POST", "/catalogo", crudo='["esto", "es", "una", "lista"]')
    assert status == 400


def test_el_id_se_saca_de_la_ruta_si_no_viene_en_pathParameters(lf):
    item = crear_item(lf, titulo="Sin pathParameters")
    evento = {
        "requestContext": {"http": {"method": "GET", "path": f"/catalogo/{item['item_id']}"}},
        "queryStringParameters": None, "pathParameters": None, "body": None,
    }
    respuesta = lf.lambda_handler(evento, None)
    assert respuesta["statusCode"] == 200
    assert json.loads(respuesta["body"])["titulo"] == "Sin pathParameters"


def test_export_por_get_devuelve_404(lf):
    status, _, _ = llamar(lf, "GET", "/export")
    assert status == 404


def test_listar_pagina_el_scan_completo(lf, monkeypatch):
    """Un scan devuelve como maximo 1 MB: sin paginar, el listado sale incompleto."""
    paginas = [
        {"Items": [{"item_id": "1"}], "LastEvaluatedKey": {"item_id": "1"}},
        {"Items": [{"item_id": "2"}], "LastEvaluatedKey": {"item_id": "2"}},
        {"Items": [{"item_id": "3"}]},
    ]
    llamadas = []

    def scan_falso(**kwargs):
        llamadas.append(kwargs)
        return paginas[len(llamadas) - 1]

    monkeypatch.setattr(lf.table, "scan", scan_falso)
    status, cuerpo, _ = llamar(lf, "GET", "/catalogo")
    assert status == 200
    assert cuerpo["total"] == 3
    assert len(llamadas) == 3
    assert llamadas[1]["ExclusiveStartKey"] == {"item_id": "1"}


def test_export_pagina_el_scan_completo(lf, monkeypatch, s3):
    paginas = [
        {"Items": [{"item_id": "1", "tipo": "libro"}], "LastEvaluatedKey": {"item_id": "1"}},
        {"Items": [{"item_id": "2", "tipo": "libro"}]},
    ]
    llamadas = []

    def scan_falso(**kwargs):
        llamadas.append(kwargs)
        return paginas[len(llamadas) - 1]

    monkeypatch.setattr(lf.table, "scan", scan_falso)
    _, cuerpo, _ = llamar(lf, "POST", "/export")
    assert cuerpo["total_registros"] == 2


def test_los_acentos_sobreviven(lf):
    item = crear_item(lf, titulo="Cien años de soledad", notas="Vale la pena releerlo")
    _, cuerpo, _ = llamar(lf, "GET", "/catalogo", item_id=item["item_id"])
    assert cuerpo["titulo"] == "Cien años de soledad"
