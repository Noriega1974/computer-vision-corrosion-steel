"""
CorriaStorageStack — DynamoDB tables and S3 bucket.

Two structural changes vs. the source system:

1. `usuarios` table: same shape as source, minus the `empresa` field (that
   field is dropped at the application layer — the table schema itself only
   declares key/GSI attributes, so there is nothing to remove there).

2. `puntos` + `mediciones` are FUSED into a single table
   (`fused_puntos_mediciones`). Partition key `id_punto`; sort key `sk`:
     - point (parent) records use sk = "METADATA"
     - medición (child) records use sk = "MED#{timestamp}"
   Three GSIs are migrated as-is from the source tables (exact names/types
   pulled from `aws dynamodb describe-table` against the source account):
     - ClaveLogicaIndex        (HASH clave_logica)            — from puntos
     - nivel-timestamp-index   (HASH nivel_corrosion, RANGE timestamp) — from mediciones
     - tipo-timestamp-index    (HASH tipo_registro,  RANGE timestamp) — from mediciones
   Plus one NEW GSI added for this migration:
     - usuario-timestamp-index (HASH usuario_id, RANGE timestamp)
       Populated with `creado_por_id` on parent/punto records and
       `tomado_por_id` on child/medición records — both aliased into the
       common `usuario_id` attribute at write time by the Lambda handlers.
       Point records did not previously carry a `timestamp` attribute (only
       `fecha_creacion`); the ported Lambda code now also writes `timestamp`
       on point records so they participate in this GSI's sort key.
"""
from aws_cdk import (
    Stack,
    RemovalPolicy,
    Duration,
    aws_dynamodb as dynamodb,
    aws_s3 as s3,
)
from constructs import Construct


class CorriaStorageStack(Stack):
    def __init__(self, scope: Construct, construct_id: str, **kwargs) -> None:
        super().__init__(scope, construct_id, **kwargs)

        # ── usuarios table ───────────────────────────────────────────────
        self.usuarios_table = dynamodb.Table(
            self,
            "UsuariosTable",
            table_name="pf-corrosion-usuarios",
            partition_key=dynamodb.Attribute(name="id_usuario", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN,
        )
        self.usuarios_table.add_global_secondary_index(
            index_name="email-index",
            partition_key=dynamodb.Attribute(name="email", type=dynamodb.AttributeType.STRING),
            projection_type=dynamodb.ProjectionType.ALL,
        )

        # ── fused puntos + mediciones table ─────────────────────────────
        self.puntos_mediciones_table = dynamodb.Table(
            self,
            "PuntosMedicionesTable",
            table_name="pf-corrosion-puntos-mediciones",
            partition_key=dynamodb.Attribute(name="id_punto", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="sk", type=dynamodb.AttributeType.STRING),
            billing_mode=dynamodb.BillingMode.PAY_PER_REQUEST,
            removal_policy=RemovalPolicy.RETAIN,
        )

        # Migrated from source `corria-puntos` (ClaveLogicaIndex).
        self.puntos_mediciones_table.add_global_secondary_index(
            index_name="ClaveLogicaIndex",
            partition_key=dynamodb.Attribute(name="clave_logica", type=dynamodb.AttributeType.STRING),
            projection_type=dynamodb.ProjectionType.ALL,
        )

        # Migrated from source `corria-mediciones` (nivel-timestamp-index).
        self.puntos_mediciones_table.add_global_secondary_index(
            index_name="nivel-timestamp-index",
            partition_key=dynamodb.Attribute(name="nivel_corrosion", type=dynamodb.AttributeType.NUMBER),
            sort_key=dynamodb.Attribute(name="timestamp", type=dynamodb.AttributeType.STRING),
            projection_type=dynamodb.ProjectionType.ALL,
        )

        # Migrated from source `corria-mediciones` (tipo-timestamp-index).
        self.puntos_mediciones_table.add_global_secondary_index(
            index_name="tipo-timestamp-index",
            partition_key=dynamodb.Attribute(name="tipo_registro", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="timestamp", type=dynamodb.AttributeType.STRING),
            projection_type=dynamodb.ProjectionType.ALL,
        )

        # NEW: reverse lookup by user (added in this migration).
        self.puntos_mediciones_table.add_global_secondary_index(
            index_name="usuario-timestamp-index",
            partition_key=dynamodb.Attribute(name="usuario_id", type=dynamodb.AttributeType.STRING),
            sort_key=dynamodb.Attribute(name="timestamp", type=dynamodb.AttributeType.STRING),
            projection_type=dynamodb.ProjectionType.ALL,
        )

        # ── images bucket ────────────────────────────────────────────────
        # Replicates the source bucket's configuration exactly: full public
        # access block, AES256 default encryption, and CORS restricted to
        # known frontend origins.
        self.images_bucket = s3.Bucket(
            self,
            "ImagesBucket",
            bucket_name=f"corria-images-{Stack.of(self).account}",
            block_public_access=s3.BlockPublicAccess(
                block_public_acls=True,
                ignore_public_acls=True,
                block_public_policy=True,
                restrict_public_buckets=True,
            ),
            encryption=s3.BucketEncryption.S3_MANAGED,
            removal_policy=RemovalPolicy.RETAIN,
            cors=[
                s3.CorsRule(
                    allowed_methods=[s3.HttpMethods.GET, s3.HttpMethods.PUT, s3.HttpMethods.POST],
                    allowed_origins=[
                        "http://localhost:5173",
                        # 2026-08-18: el frontend real ya existe (era un TODO)
                        # -- sin este origen, cualquier `fetch(url_imagen)`
                        # desde la app en producción fallaba por CORS. Esto
                        # rompía la descarga de imágenes (necesita leer los
                        # bytes vía fetch, no solo mostrarlas en un <img>).
                        "https://computer-vision-corrosion-steel.vercel.app",
                        "https://computer-vision-corrosion-steel-noriega1974s-projects.vercel.app",
                    ],
                    allowed_headers=["*"],
                    max_age=3600,
                )
            ],
        )
