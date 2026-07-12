"""Image generation service — the application/business-logic layer.

Orchestrates: style preset → workflow build → ComfyUI submit → poll → result.
This is the only class the API layer should talk to.
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any, Protocol

from app.style_presets import get_style_preset, apply_style, list_styles
from app.workflow_builder import WorkflowInput, build_txt2img_workflow
from config import DEFAULT_CHECKPOINT


class ComfyUIProtocol(Protocol):
    """Structural type for the ComfyUI client (enables easy mocking)."""

    async def queue_prompt(self, workflow: dict) -> dict[str, str]: ...
    async def wait_for_completion(self, prompt_id: str) -> dict[str, Any]: ...
    def get_image_url(self, filename: str, subfolder: str, img_type: str) -> str: ...
    async def health_check(self) -> dict[str, Any]: ...


@dataclass
class GenerateRequest:
    """User-facing request."""
    prompt: str
    style: str | None = None
    width: int = 1024
    height: int = 1024
    steps: int = 20
    cfg: float = 7.0
    seed: int = -1


@dataclass
class GenerateResult:
    """User-facing result."""
    image_url: str
    seed: int
    generation_time_ms: int


class ImageService:
    """Coordinates the full generation pipeline."""

    def __init__(self, comfyui_client: ComfyUIProtocol):
        self._client = comfyui_client

    async def generate(self, req: GenerateRequest) -> GenerateResult:
        start = time.monotonic()

        # Validate
        if not req.prompt or not req.prompt.strip():
            raise ValueError("prompt must not be empty")

        # Resolve style
        positive = req.prompt
        negative = ""
        if req.style:
            preset = get_style_preset(req.style)
            if preset is None:
                raise ValueError(f"unknown style: {req.style}")
            positive = apply_style(req.style, req.prompt)
            negative = preset.negative_prompt
            # Use preset dimensions if user didn't override
            if req.width == 1024 and req.height == 1024:
                req.width = preset.width
                req.height = preset.height

        # Build workflow
        wf_input = WorkflowInput(
            prompt=positive,
            negative_prompt=negative,
            width=req.width,
            height=req.height,
            steps=req.steps,
            cfg=req.cfg,
            seed=req.seed,
            checkpoint=DEFAULT_CHECKPOINT,
        )
        workflow = build_txt2img_workflow(wf_input)

        # Submit to ComfyUI
        resp = await self._client.queue_prompt(workflow)
        prompt_id = resp["prompt_id"]

        # Wait for completion
        result = await self._client.wait_for_completion(prompt_id)
        images = result.get("images", [])
        if not images:
            raise RuntimeError("ComfyUI returned no images")

        img = images[0]
        image_url = self._client.get_image_url(
            img["filename"], img.get("subfolder", ""), img.get("type", "output")
        )

        # Extract actual seed used
        seed = req.seed if req.seed >= 0 else _extract_seed(workflow)

        elapsed_ms = int((time.monotonic() - start) * 1000)
        return GenerateResult(
            image_url=image_url,
            seed=seed,
            generation_time_ms=elapsed_ms,
        )

    async def health_check(self) -> dict[str, Any]:
        return await self._client.health_check()

    def list_styles(self) -> list[str]:
        return list_styles()


def _extract_seed(workflow: dict) -> int:
    """Read the seed value from the KSampler node."""
    for node in workflow.values():
        if node.get("class_type") == "KSampler":
            return node["inputs"]["seed"]
    return -1
