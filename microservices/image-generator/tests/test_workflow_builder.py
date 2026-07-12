"""Tests for workflow_builder — ComfyUI workflow JSON construction.

TDD Red phase: These tests describe the desired behaviour before any
implementation exists.  Run them, watch them fail, then implement.
"""
import pytest
from app.workflow_builder import build_txt2img_workflow, WorkflowInput


class TestWorkflowInputValidation:
    """Input validation for WorkflowInput."""

    def test_default_values_are_sensible(self):
        inp = WorkflowInput(prompt="a mountain")
        assert inp.prompt == "a mountain"
        assert inp.negative_prompt == ""
        assert inp.width == 1024
        assert inp.height == 1024
        assert inp.steps == 20
        assert inp.cfg == 7.0
        assert inp.seed == -1
        assert inp.checkpoint == "sd_xl_base_1.0.safetensors"
        assert inp.sampler == "euler"
        assert inp.scheduler == "normal"
        assert inp.batch_size == 1
        assert inp.filename_prefix == "qclaudio_gen"

    def test_prompt_cannot_be_empty(self):
        with pytest.raises(ValueError, match="prompt"):
            WorkflowInput(prompt="")

    def test_prompt_cannot_be_whitespace(self):
        with pytest.raises(ValueError, match="prompt"):
            WorkflowInput(prompt="   ")

    def test_dimensions_must_be_positive_multiple_of_8(self):
        with pytest.raises(ValueError, match="width"):
            WorkflowInput(prompt="x", width=0)
        with pytest.raises(ValueError, match="width"):
            WorkflowInput(prompt="x", width=-8)

    def test_dimensions_must_be_multiple_of_8(self):
        with pytest.raises(ValueError, match="multiple of 8"):
            WorkflowInput(prompt="x", width=100)

    def test_steps_must_be_positive(self):
        with pytest.raises(ValueError, match="steps"):
            WorkflowInput(prompt="x", steps=0)

    def test_cfg_must_be_positive(self):
        with pytest.raises(ValueError, match="cfg"):
            WorkflowInput(prompt="x", cfg=0)

    def test_batch_size_must_be_positive(self):
        with pytest.raises(ValueError, match="batch"):
            WorkflowInput(prompt="x", batch_size=0)


class TestBuildWorkflowStructure:
    """The returned dict must be a valid ComfyUI API workflow graph."""

    @pytest.fixture
    def workflow(self):
        return build_txt2img_workflow(WorkflowInput(prompt="sunset over ocean"))

    def test_returns_dict(self, workflow):
        assert isinstance(workflow, dict)

    def test_has_all_required_nodes(self, workflow):
        node_types = {n["class_type"] for n in workflow.values()}
        assert "CheckpointLoaderSimple" in node_types
        assert "CLIPTextEncode" in node_types
        assert "EmptyLatentImage" in node_types
        assert "KSampler" in node_types
        assert "VAEDecode" in node_types
        assert "SaveImage" in node_types

    def test_has_exactly_7_nodes(self, workflow):
        assert len(workflow) == 7

    def test_node_ids_are_string_integers(self, workflow):
        for key in workflow:
            assert key.isdigit()
            assert int(key) >= 0


class TestWorkflowContent:
    """Workflow node values must reflect the input parameters."""

    def test_positive_prompt_is_encoded(self):
        wf = build_txt2img_workflow(
            WorkflowInput(prompt="beautiful landscape", negative_prompt="ugly")
        )
        positive_nodes = [
            n for n in wf.values()
            if n["class_type"] == "CLIPTextEncode" and n["inputs"]["text"] == "beautiful landscape"
        ]
        assert len(positive_nodes) == 1

    def test_negative_prompt_is_encoded(self):
        wf = build_txt2img_workflow(
            WorkflowInput(prompt="test", negative_prompt="blurry, bad")
        )
        negative_nodes = [
            n for n in wf.values()
            if n["class_type"] == "CLIPTextEncode" and n["inputs"]["text"] == "blurry, bad"
        ]
        assert len(negative_nodes) == 1

    def test_dimensions_propagate_to_empty_latent(self):
        wf = build_txt2img_workflow(
            WorkflowInput(prompt="t", width=512, height=768)
        )
        latent = [n for n in wf.values() if n["class_type"] == "EmptyLatentImage"][0]
        assert latent["inputs"]["width"] == 512
        assert latent["inputs"]["height"] == 768

    def test_steps_propagate_to_ksampler(self):
        wf = build_txt2img_workflow(
            WorkflowInput(prompt="t", steps=30)
        )
        sampler = [n for n in wf.values() if n["class_type"] == "KSampler"][0]
        assert sampler["inputs"]["steps"] == 30

    def test_cfg_propagate_to_ksampler(self):
        wf = build_txt2img_workflow(
            WorkflowInput(prompt="t", cfg=5.5)
        )
        sampler = [n for n in wf.values() if n["class_type"] == "KSampler"][0]
        assert sampler["inputs"]["cfg"] == 5.5

    def test_seed_propagate_to_ksampler(self):
        wf = build_txt2img_workflow(
            WorkflowInput(prompt="t", seed=42)
        )
        sampler = [n for n in wf.values() if n["class_type"] == "KSampler"][0]
        assert sampler["inputs"]["seed"] == 42

    def test_random_seed_when_negative(self):
        wf = build_txt2img_workflow(
            WorkflowInput(prompt="t", seed=-1)
        )
        sampler = [n for n in wf.values() if n["class_type"] == "KSampler"][0]
        assert sampler["inputs"]["seed"] >= 0
        assert isinstance(sampler["inputs"]["seed"], int)

    def test_checkpoint_propagates(self):
        wf = build_txt2img_workflow(
            WorkflowInput(prompt="t", checkpoint="my_model.safetensors")
        )
        loader = [n for n in wf.values() if n["class_type"] == "CheckpointLoaderSimple"][0]
        assert loader["inputs"]["ckpt_name"] == "my_model.safetensors"

    def test_sampler_name_propagates(self):
        wf = build_txt2img_workflow(
            WorkflowInput(prompt="t", sampler="dpmpp_2m")
        )
        sampler = [n for n in wf.values() if n["class_type"] == "KSampler"][0]
        assert sampler["inputs"]["sampler_name"] == "dpmpp_2m"

    def test_filename_prefix_propagates(self):
        wf = build_txt2img_workflow(
            WorkflowInput(prompt="t", filename_prefix="custom_prefix")
        )
        saver = [n for n in wf.values() if n["class_type"] == "SaveImage"][0]
        assert saver["inputs"]["filename_prefix"] == "custom_prefix"


class TestWorkflowGraphConnectivity:
    """Node references (as [node_id, output_index] tuples) must be consistent."""

    def test_all_references_point_to_existing_nodes(self):
        wf = build_txt2img_workflow(WorkflowInput(prompt="t"))
        node_ids = set(wf.keys())
        for node in wf.values():
            for val in node["inputs"].values():
                if isinstance(val, list) and len(val) == 2 and isinstance(val[0], str):
                    assert val[0] in node_ids, f"Reference to non-existent node {val[0]}"

    def test_ksampler_receives_model_from_checkpoint(self):
        wf = build_txt2img_workflow(WorkflowInput(prompt="t"))
        sampler = [n for n in wf.values() if n["class_type"] == "KSampler"][0]
        loader = [nid for nid, n in wf.items() if n["class_type"] == "CheckpointLoaderSimple"][0]
        assert sampler["inputs"]["model"][0] == loader

    def test_save_image_receives_from_vae_decode(self):
        wf = build_txt2img_workflow(WorkflowInput(prompt="t"))
        saver = [n for n in wf.values() if n["class_type"] == "SaveImage"][0]
        vae_decode = [nid for nid, n in wf.items() if n["class_type"] == "VAEDecode"][0]
        assert saver["inputs"]["images"][0] == vae_decode
