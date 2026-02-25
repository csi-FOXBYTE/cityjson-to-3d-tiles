from __future__ import annotations

import os
from datetime import datetime

from airflow import DAG
from airflow.providers.docker.operators.docker import DockerOperator


DAG_ID = "cityjson_to_3d_tiles"
IMAGE = os.getenv(
    "CITYJSON_IMAGE",
    "ghcr.io/csi-foxbyte/cityjson-to-3d-tiles:latest",
)
WORK_DIR_ON_HOST = os.getenv(
    "CITYJSON_WORK_DIR",
    "/opt/airflow/data/cityjson-to-3d-tiles",
)
SRC_SRS = os.getenv("CITYJSON_SRC_SRS", "")
DEST_SRS = os.getenv("CITYJSON_DEST_SRS", "")


container_env = {
    "APPEARANCE": os.getenv("CITYJSON_APPEARANCE", "rgbTexture"),
    "THREAD_COUNT": os.getenv("CITYJSON_THREAD_COUNT", "4"),
    "HAS_ALPHA_ENABLED": os.getenv("CITYJSON_HAS_ALPHA_ENABLED", "true"),
    "SIMPLIFY_ADDRESSES": os.getenv("CITYJSON_SIMPLIFY_ADDRESSES", "false"),
}

if SRC_SRS:
    container_env["SRC_SRS"] = SRC_SRS
if DEST_SRS:
    container_env["DEST_SRS"] = DEST_SRS


with DAG(
    dag_id=DAG_ID,
    start_date=datetime(2025, 1, 1),
    schedule=None,
    catchup=False,
    tags=["3d-tiles", "cityjson", "citygml"],
) as dag:
    DockerOperator(
        task_id="generate_tiles",
        image=IMAGE,
        api_version="auto",
        auto_remove="success",
        mount_tmp_dir=False,
        # Host folder must contain input files and will receive /work/cityjson and /work/tiles.
        volumes=[f"{WORK_DIR_ON_HOST}:/work"],
        environment=container_env,
        docker_url=os.getenv("DOCKER_HOST", "unix://var/run/docker.sock"),
    )
