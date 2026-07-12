"""Tests for image_service — the business logic layer.

TDD Red phase.  These tests use a fake ComfyUI client to isolate the
service from the real ComfyUI server.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock
from app.image_service import ImageService, GenerateRequest, GenerateResult


class TestGenerateRequest:
    def test_defaults(self):
        req = GenerateRequest(prompt="sunset")
        assert req.prompt == "sunset"
        assert req.style is None
        assert req.width == 1024
        assert req.height == 1024
        assert req.steps == 20
        assert req.cfg == 7.0
        assert req.seed == -1

    def test_with_style(self):
        req = GenerateRequest(prompt="sunset", style="landscape")
        assert req.style == "landscape"


class TestImageServiceGenerate:
    """ImageService.generate orchestrates style → workflow → ComfyUI → result."""

    @pytest.fixture
    def fake_client(self):
        client = AsyncMock()
        client.queue_prompt.return_value = {"prompt_id": "test-pid-123"}
        client.wait_for_completion.return_value = {
            "images": [
                {"filename": "test_001.png", "subfolder": "", "type": "output"}
            ]
        }
        client.get_image_url.return_value = "http://localhost:8188/view?filename=test_001.png"
        return client

    @pytest.fixture
    def service(self, fake_client):
        return ImageService(comfyui_client=fake_client)

    @pytest.mark.asyncio
    async def test_generate_returns_result(self, service, fake_client):
        req = GenerateRequest(prompt="mountain lake")
        result = await service.generate(req)
        assert isinstance(result, GenerateResult)
        assert result.image_url is not None
        assert result.seed >= 0

    @pytest.mark.asyncio
    async def test_generate_calls_queue_prompt(self, service, fake_client):
        req = GenerateRequest(prompt="test")
        await service.generate(req)
        fake_client.queue_prompt.assert_called_once()

    @pytest.mark.asyncio
    async def test_generate_calls_wait_for_completion(self, service, fake_client):
        req = GenerateRequest(prompt="test")
        await service.generate(req)
        fake_client.wait_for_completion.assert_called_once_with("test-pid-123")

    @pytest.mark.asyncio
    async def test_generate_applies_style_when_provided(self, service, fake_client):
        req = GenerateRequest(prompt="valley", style="landscape")
        await service.generate(req)
        # The workflow passed to queue_prompt should have the style suffix applied
        call_args = fake_client.queue_prompt.call_args
        workflow = call_args[0][0]  # first positional arg
        # Find the positive CLIPTextEncode node
        clip_nodes = [
            n for n in workflow.values()
            if n["class_type"] == "CLIPTextEncode"
        ]
        positive_texts = [n["inputs"]["text"] for n in clip_nodes]
        # At least one should contain "valley"
        assert any("valley" in t for t in positive_texts)

    @pytest.mark.asyncio
    async def test_generate_with_fixed_seed_returns_same_seed(self, service, fake_client):
        req = GenerateRequest(prompt="test", seed=999)
        result = await service.generate(req)
        assert result.seed == 999

    @pytest.mark.asyncio
    async def test_generate_raises_on_empty_prompt(self, service):
        req = GenerateRequest(prompt="")
        with pytest.raises(ValueError, match="prompt"):
            await service.generate(req)

    @pytest.mark.asyncio
    async def test_generate_raises_on_unknown_style(self, service):
        req = GenerateRequest(prompt="test", style="totally_fake_style")
        with pytest.raises(ValueError, match="style"):
            await service.generate(req)


class TestImageServiceHealth:
    @pytest.fixture
    def service(self):
        client = AsyncMock()
        client.health_check.return_value = {"status": "healthy"}
        return ImageService(comfyui_client=client)

    @pytest.mark.asyncio
    async def test_health_check_delegates_to_client(self, service):
        result = await service.health_check()
        assert result["status"] == "healthy"
