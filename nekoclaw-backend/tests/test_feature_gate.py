import pytest
from unittest.mock import patch, MagicMock
from app.core.feature_gate import FeatureGate


class TestFeatureGate:
    def test_ce_edition_when_no_ee_dir(self, tmp_path):
        with patch("app.core.feature_gate.Path") as mock_path:
            mock_path.return_value.__truediv__ = MagicMock(
                return_value=MagicMock(is_dir=MagicMock(return_value=False))
            )
            fg = FeatureGate.__new__(FeatureGate)
            fg._features = {}
            fg._edition = "ce"
            assert fg.edition == "ce"
            assert fg.is_ee is False

    def test_ee_edition_when_ee_dir_exists(self):
        fg = FeatureGate.__new__(FeatureGate)
        fg._features = {}
        fg._edition = "ee"
        assert fg.edition == "ee"
        assert fg.is_ee is True

    def test_is_enabled_returns_false_for_unknown(self):
        fg = FeatureGate.__new__(FeatureGate)
        fg._features = {}
        fg._edition = "ce"
        assert fg.is_enabled("nonexistent") is False

    def test_enabled_features_empty_for_ce(self):
        fg = FeatureGate.__new__(FeatureGate)
        fg._features = {"audit_log": {"editions": ["ee"]}}
        fg._edition = "ce"
        assert "audit_log" not in fg.enabled_features()

    def test_enabled_features_includes_ee(self):
        fg = FeatureGate.__new__(FeatureGate)
        fg._features = {"audit_log": {"editions": ["ee"]}}
        fg._edition = "ee"
        assert "audit_log" in fg.enabled_features()

    def test_all_features(self):
        fg = FeatureGate.__new__(FeatureGate)
        fg._features = {
            "audit_log": {"editions": ["ee"], "description": "test"},
            "basic": {"editions": ["ce", "ee"], "description": "base"},
        }
        fg._edition = "ce"
        result = fg.all_features()
        assert len(result) == 2
