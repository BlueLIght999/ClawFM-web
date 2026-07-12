"""Async HTTP client for the ComfyUI API.

ComfyUI runs as a separate process (default http://127.0.0.1:8188).
This client wraps its REST + WebSocket endpoints behind a clean async
interface so the rest of the service never touches httpx directly.
"""
from __future__ import annotations

import asyncio
import json
from typing import Any

import httpx

from config import COMFYUI_URL, POLL_INTERVAL_SEC, POLL_TIMEOUT_SEC


class ComfyUIClient:
    """Thin async wrapper around ComfyUI's HTTP API."""

    def __init__(
        self,
        base_url: str = COMFYUI_URL,
        *,
        poll_interval: float = POLL_INTERVAL_SEC,
        poll_timeout: float = POLL_TIMEOUT_SEC,
        http_client: httpx.AsyncClient | None = None,
    ):
        self._base_url = base_url.rstrip("/")
        self._poll_interval = poll_interval
        self._poll_timeout = poll_timeout
        self._http = http_client or httpx.AsyncClient(
            base_url=self._base_url,
            timeout=httpx.Timeout(30.0),
        )
        self._owns_client = http_client is None

    async def close(self):
        if self._owns_client:
            await self._http.aclose()

    # ---- Prompt submission ----

    async def queue_prompt(self, workflow: dict) -> dict[str, str]:
        """POST /prompt — queue a workflow for execution.

        Returns ``{"prompt_id": "...", "number": N}``.
        """
        resp = await self._http.post(
            "/prompt",
            json={"prompt": workflow, "client_id": "qclaudio-image-svc"},
        )
        resp.raise_for_status()
        return resp.json()

    # ---- Completion polling ----

    async def wait_for_completion(self, prompt_id: str) -> dict[str, Any]:
        """Poll /history/{prompt_id} until the prompt finishes.

        Returns the history entry containing output images.
        Raises TimeoutError if the prompt doesn't finish in time.
        """
        elapsed = 0.0
        while elapsed < self._poll_timeout:
            resp = await self._http.get(f"/history/{prompt_id}")
            if resp.status_code == 200:
                data = resp.json()
                if prompt_id in data:
                    return self._extract_outputs(data[prompt_id])
            elapsed += self._poll_interval
            await asyncio.sleep(self._poll_interval)
        raise TimeoutError(
            f"ComfyUI prompt {prompt_id} did not complete within {self._poll_timeout}s"
        )

    def _extract_outputs(self, history_entry: dict) -> dict[str, Any]:
        """Pull image info out of the history entry's outputs."""
        outputs = history_entry.get("outputs", {})
        images: list[dict[str, str]] = []
        for node_output in outputs.values():
            for img in node_output.get("images", []):
                images.append(img)
        return {"images": images}

    # ---- Image retrieval ----

    def get_image_url(self, filename: str, subfolder: str = "", img_type: str = "output") -> str:
        """Build the /view URL for a generated image."""
        params = {"filename": filename, "type": img_type}
        if subfolder:
            params["subfolder"] = subfolder
        query = "&".join(f"{k}={v}" for k, v in params.items())
        return f"{self._base_url}/view?{query}"

    # ---- Health ----

    async def health_check(self) -> dict[str, Any]:
        """GET /system_stats — verify ComfyUI is reachable."""
        try:
            resp = await self._http.get("/system_stats")
            if resp.status_code == 200:
                return {"status": "healthy", "url": self._base_url, **resp.json()}
            return {"status": "unhealthy", "url": self._base_url, "code": resp.status_code}
        except httpx.ConnectError:
            return {"status": "unreachable", "url": self._base_url}

    async def list_checkpoints(self) -> list[str]:
        """GET /object_info/CheckpointLoaderSimple — available model files."""
        resp = await self._http.get("/object_info/CheckpointLoaderSimple")
        resp.raise_for_status()
        data = resp.json()
        return data.get("CheckpointLoaderSimple", {}).get("input", {}).get("required", {}).get("ckpt_name", [[""]])[0]
