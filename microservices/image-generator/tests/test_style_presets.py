"""Tests for style_presets — pre-built prompt templates for landscape, music, etc.

TDD Red phase: define expected behaviour before implementation.
"""
import pytest
from app.style_presets import (
    get_style_preset,
    list_styles,
    STYLE_LANDSCAPE,
    STYLE_MUSIC_COVER,
    STYLE_ABSTRACT,
    apply_style,
)


class TestListStyles:
    def test_returns_list_of_style_names(self):
        styles = list_styles()
        assert isinstance(styles, list)
        assert len(styles) >= 3

    def test_includes_landscape(self):
        assert "landscape" in list_styles()

    def test_includes_music_cover(self):
        assert "music_cover" in list_styles()

    def test_includes_abstract(self):
        assert "abstract" in list_styles()


class TestGetStylePreset:
    def test_returns_preset_for_landscape(self):
        preset = get_style_preset("landscape")
        assert preset is not None
        assert preset.name == "landscape"
        assert len(preset.positive_suffix) > 0
        assert len(preset.negative_prompt) > 0
        assert isinstance(preset.default_prompt, str)

    def test_returns_preset_for_music_cover(self):
        preset = get_style_preset("music_cover")
        assert preset is not None
        assert preset.name == "music_cover"

    def test_returns_none_for_unknown_style(self):
        assert get_style_preset("nonexistent") is None


class TestApplyStyle:
    """apply_style merges a style preset into a user prompt."""

    def test_appends_positive_suffix_to_prompt(self):
        result = apply_style("landscape", "a mountain valley")
        assert "a mountain valley" in result
        # The style should add some quality boosters
        assert result != "a mountain valley"

    def test_keeps_original_prompt_when_style_not_found(self):
        result = apply_style("nonexistent", "a mountain valley")
        assert result == "a mountain valley"

    def test_music_cover_adds_album_art_keywords(self):
        result = apply_style("music_cover", "jazz night")
        assert "jazz night" in result
        # Should contain music-related keywords
        result_lower = result.lower()
        assert any(kw in result_lower for kw in ["album", "cover", "art", "vinyl", "music"])


class TestStylePresetStructure:
    """Each StylePreset must have the expected fields."""

    def test_landscape_has_sensible_defaults(self):
        p = STYLE_LANDSCAPE
        assert p.name == "landscape"
        assert "landscape" in p.positive_suffix.lower() or "nature" in p.positive_suffix.lower()
        assert "blurry" in p.negative_prompt.lower() or "low quality" in p.negative_prompt.lower()
        assert p.default_prompt  # non-empty
        assert p.width % 8 == 0
        assert p.height % 8 == 0

    def test_music_cover_has_sensible_defaults(self):
        p = STYLE_MUSIC_COVER
        assert p.name == "music_cover"
        assert p.default_prompt
        assert p.width % 8 == 0
        assert p.height % 8 == 0

    def test_abstract_has_sensible_defaults(self):
        p = STYLE_ABSTRACT
        assert p.name == "abstract"
        assert p.default_prompt
        assert p.width % 8 == 0
        assert p.height % 8 == 0
