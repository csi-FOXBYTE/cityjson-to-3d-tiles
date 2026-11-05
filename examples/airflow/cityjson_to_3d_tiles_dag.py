from __future__ import annotations

import os
from datetime import datetime

from airflow import DAG
from airflow.providers.docker.operators.docker import DockerOperator
from docker.types import Mount


DAG_ID = "cityjson_to_3d_tiles"
IMAGE = os.getenv(
    "CITYJSON_IMAGE",
    "ghcr.io/csi-foxbyte/cityjson-to-3d-tiles:latest",
)
# This image only reads CityJSON, so CityGML input is converted first with citygml-tools.
CITYGML_TOOLS_IMAGE = os.getenv(
    "CITYGML_TOOLS_IMAGE",
    "ghcr.io/csi-foxbyte/citygml-tools-docker:v2.4.1",
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
    "INPUT_DIR": "/work/cityjson",
}

if SRC_SRS:
    container_env["SRC_SRS"] = SRC_SRS
if DEST_SRS:
    container_env["DEST_SRS"] = DEST_SRS

# Host folder must contain the CityGML input files and will receive /work/cityjson and /work/tiles.
work_mount = [Mount(source=WORK_DIR_ON_HOST, target="/work", type="bind")]
# Run as the worker's uid:gid so the containers can write to the host folder.
container_user = f"{os.getuid()}:{os.getgid()}"
docker_url = os.getenv("DOCKER_HOST", "unix://var/run/docker.sock")


with DAG(
    dag_id=DAG_ID,
    start_date=datetime(2025, 1, 1),
    schedule=None,
    catchup=False,
    tags=["3d-tiles", "cityjson", "citygml"],
) as dag:
    convert_citygml = DockerOperator(
        task_id="convert_citygml_to_cityjson",
        image=CITYGML_TOOLS_IMAGE,
        api_version="auto",
        auto_remove="success",
        mount_tmp_dir=False,
        mounts=work_mount,
        command="to-cityjson /work --output /work/cityjson",
        user=container_user,
        # The conversion reads and writes the mounted folder only.
        network_mode="none",
        docker_url=docker_url,
    )

    generate_tiles = DockerOperator(
        task_id="generate_tiles",
        image=IMAGE,
        api_version="auto",
        auto_remove="success",
        mount_tmp_dir=False,
        mounts=work_mount,
        environment=container_env,
        user=container_user,
        network_mode="none",
        docker_url=docker_url,
    )

    convert_citygml >> generate_tiles
