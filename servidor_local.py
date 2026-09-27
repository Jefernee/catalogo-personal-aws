"""
La API completa corriendo en tu maquina, sin tocar AWS.

Ejecuta el mismo lambda_function.py que esta desplegado, pero contra un
DynamoDB y un S3 emulados en memoria (moto). Sirve para probar la app o un
cambio en la Lambda antes de pegarlo en la consola. No cuesta nada y no
necesita credenciales.

    python servidor_local.py

API local:   http://localhost:8787
Clave:       local            (se cambia con CATALOGO_TOKEN)

Para usarla desde la app en desarrollo, abrela asi:

    http://localhost:5173/#api=http://localhost:8787&token=local

Los datos viven en memoria: se pierden al cerrar el servidor.
Necesita las dependencias de desarrollo: pip install -r requirements-dev.txt
"""

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import parse_qsl, urlsplit

PUERTO = int(os.environ.get("PUERTO", "8787"))
CLAVE = os.environ.get("CATALOGO_TOKEN", "local")
TABLA = "catalogo-personal-local"
BUCKET = "catalogo-personal-local"

os.environ.update({
    "AWS_DEFAULT_REGION": "us-east-1",
    "AWS_ACCESS_KEY_ID": "local",
    "AWS_SECRET_ACCESS_KEY": "local",
    "TABLE_NAME": TABLA,
    "BUCKET_NAME": BUCKET,
    "TOKEN_PRINCIPAL": CLAVE,
    "TOKEN_INVITADO": os.environ.get("CATALOGO_TOKEN_INVITADO", "local-invitado"),
})

import boto3  # noqa: E402  (despues de fijar las variables de entorno)
from moto import mock_aws  # noqa: E402

CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type, authorization",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Max-Age": "300",
}


class Manejador(BaseHTTPRequestHandler):
    """Traduce cada peticion HTTP al evento que manda API Gateway (HTTP API)."""

    def do_OPTIONS(self):  # noqa: N802  el preflight lo resuelve API Gateway, no la Lambda
        self.send_response(204)
        for k, v in CORS.items():
            self.send_header(k, v)
        self.end_headers()

    def _invocar(self):
        partes = urlsplit(self.path)
        largo = int(self.headers.get("Content-Length") or 0)
        cuerpo = self.rfile.read(largo).decode("utf-8") if largo else None

        segmentos = [s for s in partes.path.split("/") if s]
        item_id = segmentos[1] if len(segmentos) == 2 and segmentos[0] == "catalogo" else None

        evento = {
            "requestContext": {"http": {"method": self.command, "path": partes.path}},
            "headers": {k.lower(): v for k, v in self.headers.items()},
            "queryStringParameters": dict(parse_qsl(partes.query)) or None,
            "pathParameters": {"id": item_id} if item_id else None,
            "body": cuerpo,
        }
        respuesta = lambda_function.lambda_handler(evento, None)

        self.send_response(respuesta["statusCode"])
        for k, v in {**respuesta.get("headers", {}), **CORS}.items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(respuesta["body"].encode("utf-8"))

    do_GET = do_POST = do_PUT = do_DELETE = _invocar  # noqa: N815

    def log_message(self, formato, *args):
        sys.stderr.write(f"  {self.command:6} {self.path}  ->  {args[1]}\n")


if __name__ == "__main__":
    with mock_aws():
        boto3.resource("dynamodb").create_table(
            TableName=TABLA,
            KeySchema=[{"AttributeName": "item_id", "KeyType": "HASH"}],
            AttributeDefinitions=[{"AttributeName": "item_id", "AttributeType": "S"}],
            BillingMode="PAY_PER_REQUEST",
        )
        boto3.client("s3").create_bucket(Bucket=BUCKET)

        import lambda_function  # se importa dentro del mock para que use lo emulado

        print(f"API local en http://localhost:{PUERTO}  ·  clave: {CLAVE}")
        print(f"App:  http://localhost:5173/#api=http://localhost:{PUERTO}&token={CLAVE}")
        print("Ctrl+C para detener.\n")
        try:
            ThreadingHTTPServer(("localhost", PUERTO), Manejador).serve_forever()
        except KeyboardInterrupt:
            print("\nDetenido.")
