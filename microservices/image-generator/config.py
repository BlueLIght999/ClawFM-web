"""Configuration for the image-generator microservice.

All values can be overridden via environment variables.
"""
import os

COMFYUI_HOST = os.getenv("COMFYUI_HOST", "127.0.0.1")
COMFYUI_PORT = int(os.getenv("COMFYUI_PORT", "8188"))
COMFYUI_URL = os.getenv("COMFYUI_URL", f"http://{COMFYUI_HOST}:{COMFYUI_PORT}")

SERVICE_HOST = os.getenv("IMAGE_SERVICE_HOST", "0.0.0.0")
SERVICE_PORT = int(os.getenv("IMAGE_SERVICE_PORT", "8288"))

POLL_INTERVAL_SEC = float(os.getenv("COMFYUI_POLL_INTERVAL", "0.5"))
POLL_TIMEOUT_SEC = float(os.getenv("COMFYUI_POLL_TIMEOUT", "120"))

DEFAULT_CHECKPOINT = os.getenv("COMFYUI_DEFAULT_CHECKPOINT", "sd_xl_base_1.0.safetensors")
