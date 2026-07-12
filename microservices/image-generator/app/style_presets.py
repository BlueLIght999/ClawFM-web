"""Pre-built style presets for common image generation scenarios.

Each preset bundles prompt suffixes, negative prompts, default dimensions,
and a sensible default prompt so the API caller can just say
  {"style": "landscape"}
and get a good result.
"""
from dataclasses import dataclass


@dataclass(frozen=True)
class StylePreset:
    """Immutable style definition."""
    name: str
    positive_suffix: str
    negative_prompt: str
    default_prompt: str
    width: int = 1024
    height: int = 1024


# ---------------------------------------------------------------------------
# Built-in presets
# ---------------------------------------------------------------------------

STYLE_LANDSCAPE = StylePreset(
    name="landscape",
    positive_suffix=(
        "breathtaking landscape, highly detailed, cinematic lighting, "
        "golden hour, nature photography, 8k, sharp focus, professional"
    ),
    negative_prompt=(
        "blurry, low quality, distorted, watermark, text, "
        "people, buildings, oversaturated, noisy"
    ),
    default_prompt="misty mountain valley at sunrise with a serene lake",
    width=1280,
    height=720,
)

STYLE_MUSIC_COVER = StylePreset(
    name="music_cover",
    positive_suffix=(
        "album cover art, vinyl record sleeve, artistic, "
        "music inspired, creative composition, vibrant colors, "
        "professional graphic design, square format"
    ),
    negative_prompt=(
        "blurry, low quality, distorted, watermark, text, "
        "cluttered, amateur, messy"
    ),
    default_prompt="abstract jazz night with neon lights and smooth rhythm",
    width=1024,
    height=1024,
)

STYLE_ABSTRACT = StylePreset(
    name="abstract",
    positive_suffix=(
        "abstract art, digital painting, flowing colors, "
        "creative composition, modern art, high detail, "
        "artistic, imaginative"
    ),
    negative_prompt=(
        "blurry, low quality, distorted, watermark, text, "
        "realistic, photographic, mundane"
    ),
    default_prompt="colorful abstract waves of energy and sound",
    width=1024,
    height=1024,
)

STYLE_PORTRAIT = StylePreset(
    name="portrait",
    positive_suffix=(
        "portrait, detailed face, professional photography, "
        "soft lighting, bokeh, high quality, 8k"
    ),
    negative_prompt=(
        "blurry, low quality, distorted, watermark, text, "
        "deformed, ugly, cartoon"
    ),
    default_prompt="a thoughtful person in warm afternoon light",
    width=832,
    height=1216,
)

# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

_STYLES: dict[str, StylePreset] = {
    s.name: s
    for s in [STYLE_LANDSCAPE, STYLE_MUSIC_COVER, STYLE_ABSTRACT, STYLE_PORTRAIT]
}


def list_styles() -> list[str]:
    """Return all available style names."""
    return list(_STYLES.keys())


def get_style_preset(name: str) -> StylePreset | None:
    """Look up a style by name. Returns None if not found."""
    return _STYLES.get(name)


def apply_style(style_name: str, user_prompt: str) -> str:
    """Merge a style's positive suffix into the user prompt.

    If the style doesn't exist, the prompt is returned unchanged.
    """
    preset = _STYLES.get(style_name)
    if preset is None:
        return user_prompt
    return f"{user_prompt}, {preset.positive_suffix}"
