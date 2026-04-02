import pytest
from app.services.instance_service import validate_state_transition, validate_resource_config
from app.core.exceptions import BadRequestError


class TestValidateStateTransition:
    def test_creating_to_deploying(self):
        assert validate_state_transition("creating", "deploying") is True

    def test_creating_to_failed(self):
        assert validate_state_transition("creating", "failed") is True

    def test_running_to_learning(self):
        assert validate_state_transition("running", "learning") is True

    def test_running_to_deleting(self):
        assert validate_state_transition("running", "deleting") is True

    def test_deleting_to_anything_is_false(self):
        assert validate_state_transition("deleting", "running") is False
        assert validate_state_transition("deleting", "failed") is False

    def test_running_to_creating_is_false(self):
        assert validate_state_transition("running", "creating") is False

    def test_failed_to_deploying(self):
        assert validate_state_transition("failed", "deploying") is True

    def test_failed_to_restarting(self):
        assert validate_state_transition("failed", "restarting") is True

    def test_learning_to_running(self):
        assert validate_state_transition("learning", "running") is True

    def test_unknown_state(self):
        assert validate_state_transition("nonexistent", "running") is False


class TestValidateResourceConfig:
    def test_valid_config_passes(self):
        validate_resource_config("500m", "1000m", "512Mi", "1024Mi")

    def test_none_values_pass(self):
        validate_resource_config(None, None, None, None)

    def test_request_gt_limit_raises(self):
        with pytest.raises(BadRequestError):
            validate_resource_config("2000m", "1000m", "512Mi", "1024Mi")

    def test_mem_request_gt_limit_raises(self):
        with pytest.raises(BadRequestError):
            validate_resource_config("500m", "1000m", "2048Mi", "1024Mi")
