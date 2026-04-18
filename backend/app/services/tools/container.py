"""
Docker container execution module for sandboxed Python code.
"""
import asyncio
import logging
from typing import Any

logger = logging.getLogger(__name__)

SANDBOX_IMAGE = "nekoclaw-sandbox:latest"
_docker_available: bool | None = None


async def check_docker() -> bool:
    """Check if Docker daemon is reachable. Caches the result."""
    global _docker_available
    if _docker_available is not None:
        return _docker_available
    try:
        import docker
        client = docker.from_env()
        client.ping()
        _docker_available = True
        client.close()
    except Exception as e:
        logger.warning("Docker is not available: %s", e)
        _docker_available = False
    return _docker_available


async def ensure_sandbox_image() -> bool:
    """Build or verify the sandbox image exists. Returns True if ready."""
    try:
        import docker
        client = docker.from_env()
        try:
            client.images.get(SANDBOX_IMAGE)
            client.close()
            return True
        except docker.errors.ImageNotFound:
            pass

        # Build from backend/sandbox/Dockerfile
        import os
        dockerfile_dir = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
            "sandbox",
        )
        if not os.path.isfile(os.path.join(dockerfile_dir, "Dockerfile")):
            logger.error("Sandbox Dockerfile not found at %s", dockerfile_dir)
            client.close()
            return False

        logger.info("Building sandbox image %s ...", SANDBOX_IMAGE)
        client.images.build(path=dockerfile_dir, tag=SANDBOX_IMAGE, rm=True)
        client.close()
        return True
    except Exception as e:
        logger.error("Failed to ensure sandbox image: %s", e)
        return False


async def run_python_in_container(code: str, timeout: int = 30) -> dict[str, Any]:
    """
    Run Python code in an isolated Docker container.
    Returns {"stdout": str, "stderr": str, "exit_code": int, "error": str|None}.
    """
    import docker
    import docker.errors

    client = docker.from_env()
    container = None
    try:
        container = client.containers.run(
            image=SANDBOX_IMAGE,
            command=["python", "-c", code],
            detach=True,
            network_mode="none",
            mem_limit="256m",
            cpu_quota=50000,  # 0.5 CPU
            read_only=True,
            tmpfs={"/tmp": "size=64m,noexec"},
            user="sandbox",
            stderr=True,
            stdout=True,
        )

        # Wait with timeout
        result = await asyncio.to_thread(container.wait, timeout=timeout)
        exit_code = result.get("StatusCode", -1)

        stdout = (await asyncio.to_thread(container.logs, stdout=True, stderr=False)).decode(
            "utf-8", errors="replace"
        )
        stderr = (await asyncio.to_thread(container.logs, stdout=False, stderr=True)).decode(
            "utf-8", errors="replace"
        )

        return {
            "stdout": stdout[:8000],
            "stderr": stderr[:4000],
            "exit_code": exit_code,
            "error": None,
        }

    except Exception as e:
        return {
            "stdout": "",
            "stderr": "",
            "exit_code": -1,
            "error": str(e),
        }
    finally:
        if container:
            try:
                await asyncio.to_thread(container.remove, force=True)
            except Exception:
                pass
        client.close()
