"""Build ComfyUI API workflow JSON from simple parameters.

This module is pure — no I/O, no network. It constructs the node-graph
dict that ComfyUI's /prompt endpoint expects.

ComfyUI workflow graph (6 nodes):
    [4] CheckpointLoaderSimple  → model, clip, vae
    [6] CLIPTextEncode(positive) ← clip from [4]
    [7] CLIPTextEncode(negative) ← clip from [4]
    [5] EmptyLatentImage(width, height)
    [3] KSampler ← model[4], positive[6], negative[7], latent[5]
    [8] VAEDecode ← samples[3], vae[4]
    [9] SaveImage ← images[8]
"""
from __future__ import annotations

import random
from dataclasses import dataclass, field


@dataclass
class WorkflowInput:
    """Validated input for building a txt2img workflow."""

    prompt: str
    negative_prompt: str = ""
    width: int = 1024
    height: int = 1024
    steps: int = 20
    cfg: float = 7.0
    seed: int = -1  # -1 = random
    checkpoint: str = "sd_xl_base_1.0.safetensors"
    sampler: str = "euler"
    scheduler: str = "normal"
    batch_size: int = 1
    filename_prefix: str = "qclaudio_gen"

    def __post_init__(self):
        if not self.prompt or not self.prompt.strip():
            raise ValueError("prompt must not be empty")
        if self.width <= 0:
            raise ValueError(f"width must be positive, got {self.width}")
        if self.height <= 0:
            raise ValueError(f"height must be positive, got {self.height}")
        if self.width % 8 != 0:
            raise ValueError(f"width must be a multiple of 8, got {self.width}")
        if self.height % 8 != 0:
            raise ValueError(f"height must be a multiple of 8, got {self.height}")
        if self.steps <= 0:
            raise ValueError(f"steps must be positive, got {self.steps}")
        if self.cfg <= 0:
            raise ValueError(f"cfg must be positive, got {self.cfg}")
        if self.batch_size <= 0:
            raise ValueError(f"batch_size must be positive, got {self.batch_size}")


def build_txt2img_workflow(inp: WorkflowInput) -> dict:
    """Construct a ComfyUI API-format workflow dict.

    Returns a dict mapping string node-IDs to node definitions. Each node
    has ``class_type`` and ``inputs``. References between nodes are
    ``[node_id_str, output_index]`` lists.
    """
    seed = inp.seed if inp.seed >= 0 else random.randint(0, 2**32 - 1)

    return {
        "4": {
            "class_type": "CheckpointLoaderSimple",
            "inputs": {
                "ckpt_name": inp.checkpoint,
            },
        },
        "6": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "text": inp.prompt,
                "clip": ["4", 1],
            },
        },
        "7": {
            "class_type": "CLIPTextEncode",
            "inputs": {
                "text": inp.negative_prompt,
                "clip": ["4", 1],
            },
        },
        "5": {
            "class_type": "EmptyLatentImage",
            "inputs": {
                "width": inp.width,
                "height": inp.height,
                "batch_size": inp.batch_size,
            },
        },
        "3": {
            "class_type": "KSampler",
            "inputs": {
                "seed": seed,
                "steps": inp.steps,
                "cfg": inp.cfg,
                "sampler_name": inp.sampler,
                "scheduler": inp.scheduler,
                "denoise": 1.0,
                "model": ["4", 0],
                "positive": ["6", 0],
                "negative": ["7", 0],
                "latent_image": ["5", 0],
            },
        },
        "8": {
            "class_type": "VAEDecode",
            "inputs": {
                "samples": ["3", 0],
                "vae": ["4", 2],
            },
        },
        "9": {
            "class_type": "SaveImage",
            "inputs": {
                "filename_prefix": inp.filename_prefix,
                "images": ["8", 0],
            },
        },
    }
