"""FastAPI entrypoint for the image-generator microservice.

Run:  python main.py
Or:   uvicorn main:app --host 0.0.0.0 --port 8288
"""
from __future__ import annotations

from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

from app.comfyui_client import ComfyUIClient
from app.image_service import ImageService, GenerateRequest, GenerateResult
from app.style_presets import list_styles
from config import SERVICE_HOST, SERVICE_PORT, COMFYUI_URL
import uvicorn


# ---------------------------------------------------------------------------
# App lifecycle
# ---------------------------------------------------------------------------

@asynccontextmanager
async def lifespan(app: FastAPI):
    client = ComfyUIClient(base_url=COMFYUI_URL)
    app.state.image_service = ImageService(comfyui_client=client)
    app.state.comfyui_client = client
    yield
    await client.close()


app = FastAPI(
    title="Qclaudio Image Generator",
    description="AIGC image generation microservice (ComfyUI backend)",
    version="1.0.0",
    lifespan=lifespan,
)


def get_image_service() -> ImageService:
    svc = getattr(app.state, "image_service", None)
    if svc is None:
        raise RuntimeError("ImageService not initialised")
    return svc


# ---------------------------------------------------------------------------
# Request / response models
# ---------------------------------------------------------------------------

class GenerateBody(BaseModel):
    prompt: str = Field(..., min_length=1, description="Text prompt for image generation")
    style: str | None = Field(None, description="Style preset name (e.g. landscape, music_cover)")
    width: int = Field(1024, ge=64, le=2048)
    height: int = Field(1024, ge=64, le=2048)
    steps: int = Field(20, ge=1, le=100)
    cfg: float = Field(7.0, gt=0, le=20)
    seed: int = Field(-1, ge=-1, description="-1 for random seed")


class GenerateResponse(BaseModel):
    image_url: str
    seed: int
    generation_time_ms: int


class HealthResponse(BaseModel):
    status: str
    comfyui: dict[str, Any] | None = None


class StylesResponse(BaseModel):
    styles: list[str]


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/api/health", response_model=HealthResponse)
async def health():
    svc = get_image_service()
    comfyui_status = await svc.health_check()
    overall = "healthy" if comfyui_status.get("status") == "healthy" else "degraded"
    return HealthResponse(status=overall, comfyui=comfyui_status)


@app.get("/api/styles", response_model=StylesResponse)
async def styles():
    return StylesResponse(styles=list_styles())


@app.post("/api/generate", response_model=GenerateResponse)
async def generate(body: GenerateBody):
    svc = get_image_service()
    req = GenerateRequest(
        prompt=body.prompt,
        style=body.style,
        width=body.width,
        height=body.height,
        steps=body.steps,
        cfg=body.cfg,
        seed=body.seed,
    )
    try:
        result = await svc.generate(req)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except TimeoutError as e:
        raise HTTPException(status_code=504, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))
    return GenerateResponse(
        image_url=result.image_url,
        seed=result.seed,
        generation_time_ms=result.generation_time_ms,
    )


# ---------------------------------------------------------------------------
# Entrypoint
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    uvicorn.run(
        "main:app",
        host=SERVICE_HOST,
        port=SERVICE_PORT,
        reload=False,
    )
