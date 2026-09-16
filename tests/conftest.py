"""
Infraestructura de las pruebas.

Levanta un DynamoDB y un S3 emulados con moto (no son stubs escritos a mano:
es la implementacion real de la API de AWS en memoria), crea la tabla y el
bucket, y recarga el modulo de la Lambda para que tome esos recursos.

No toca AWS de verdad: no hay red, no hay costos, no hay credenciales reales.
"""

import importlib
import json
import os
import sys
from pathlib import Path

import boto3
import pytest
from moto import mock_aws

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

TABLE_NAME = "catalogo-personal-test"
BUCKET_NAME = "catalogo-personal-test-bucket"
REGION = "us-east-1"


@pytest.fixture
def lf():
    """El modulo lambda_function, conectado a un AWS emulado y vacio."""
    with mock_aws():
        os.environ.update({
            "AWS_DEFAULT_REGION": REGION,
            "AWS_ACCESS_KEY_ID": "testing",
            "AWS_SECRET_ACCESS_KEY": "testing",
            "AWS_SECURITY_TOKEN": "testing",
            "AWS_SESSION_TOKEN": "testing",
            "TABLE_NAME": TABLE_NAME,
            "BUCKET_NAME": BUCKET_NAME,
        })

        boto3.resource("dynamodb", region_name=REGION).create_table(
            TableName=TABLE_NAME,
            KeySchema=[{"AttributeName": "item_id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "item_id", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        boto3.client("s3", region_name=REGION).create_bucket(Bucket=BUCKET_NAME)

        import lambda_function
        importlib.reload(lambda_function)  # reconecta table y s3 al mock actual
        yield lambda_function


@pytest.fixture
def s3():
    return boto3.client("s3", region_name=REGION)


# --------------------------------------------------------------------------
# Helpers
# --------------------------------------------------------------------------

def llamar(lf, metodo, ruta, body=None, params=None, item_id=None, crudo=None):
    """Arma un evento de API Gateway (HTTP API, payload v2) y lo invoca."""
    # API Gateway manda el id en la ruta Y en pathParameters.
    if item_id and not ruta.rstrip("/").endswith(item_id):
        ruta = f"{ruta.rstrip('/')}/{item_id}"

    evento = {
        "requestContext": {"http": {"method": metodo, "path": ruta}},
        "queryStringParameters": params,
        "pathParameters": {"id": item_id} if item_id else None,
        "body": crudo if crudo is not None else (json.dumps(body) if body is not None else None),
    }
    respuesta = lf.lambda_handler(evento, None)
    return respuesta["statusCode"], json.loads(respuesta["body"]), respuesta


def crear_item(lf, **campos):
    """Crea un item y devuelve su cuerpo."""
    datos = {"tipo": "libro", "titulo": "Un libro"}
    datos.update(campos)
    status, cuerpo, _ = llamar(lf, "POST", "/catalogo", body=datos)
    assert status == 201, cuerpo
    return cuerpo
