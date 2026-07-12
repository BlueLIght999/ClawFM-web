"""Tests for the FastAPI routes.

TDD Red phase: define expected endpoints and response shapes.
"""
import pytest
from unittest.mock import AsyncMock
from httpx import AsyncClient, ASGITransport
from main import app


@pytest.fixture
async def client():
    """Test client with a mocked ImageService so no real ComfyUI is needed."""
    from app.image_service import GenerateResult
    fake_service = AsyncMock()
    fake_service.generate.return_value = GenerateResult(
        image_url="http://localhost:8188/view?filename=test.png",
        seed=12345,
        generation_time_ms=1500,
    )
    fake_service.health_check.return_value = {"status": "healthy"}
    fake_service.list_styles.return_value = ["landscape", "music_cover", "abstract"]
    app.state.image_service = fake_service

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c

    app.state.image_service = None


class TestHealthEndpoint:
    @pytest.mark.asyncio
    async def test_health_returns_200(self, client):
        resp = await client.get("/api/health")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_health_has_status_field(self, client):
        resp = await client.get("/api/health")
        data = resp.json()
        assert "status" in data


class TestStylesEndpoint:
    @pytest.mark.asyncio
    async def test_styles_returns_200(self, client):
        resp = await client.get("/api/styles")
        assert resp.status_code == 200

    @pytest.mark.asyncio
    async def test_styles_returns_list(self, client):
        resp = await client.get("/api/styles")
        data = resp.json()
        assert "styles" in data
        assert isinstance(data["styles"], list)
        assert "landscape" in data["styles"]


class TestGenerateEndpoint:
    @pytest.mark.asyncio
    async def test_generate_requires_prompt(self, client):
        resp = await client.post("/api/generate", json={})
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_generate_rejects_empty_prompt(self, client):
        resp = await client.post("/api/generate", json={"prompt": ""})
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_generate_accepts_valid_request(self, client):
        resp = await client.post("/api/generate", json={"prompt": "a mountain"})
        assert resp.status_code == 200
        data = resp.json()
        assert "image_url" in data
        assert "seed" in data
