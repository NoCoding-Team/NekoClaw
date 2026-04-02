import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from app.core.exceptions import (
    AppException, NotFoundError, ForbiddenError, BadRequestError, ConflictError, K8sError,
)


class TestAppException:
    def test_basic_fields(self):
        exc = AppException(code=40000, message="test error")
        assert exc.code == 40000
        assert exc.error_code == 40000
        assert exc.message == "test error"
        assert exc.status_code == 400
        assert exc.message_key is None

    def test_custom_error_code(self):
        exc = AppException(code=40000, message="test", error_code=40001)
        assert exc.error_code == 40001

    def test_message_key(self):
        exc = AppException(code=40000, message="test", message_key="errors.test.key")
        assert exc.message_key == "errors.test.key"


class TestNotFoundError:
    def test_defaults(self):
        exc = NotFoundError()
        assert exc.code == 40400
        assert exc.status_code == 404
        assert exc.message_key == "errors.common.not_found"

    def test_custom_message(self):
        exc = NotFoundError(message="custom msg")
        assert exc.message == "custom msg"


class TestForbiddenError:
    def test_defaults(self):
        exc = ForbiddenError()
        assert exc.code == 40300
        assert exc.status_code == 403
        assert exc.message_key == "errors.common.forbidden"


class TestBadRequestError:
    def test_defaults(self):
        exc = BadRequestError()
        assert exc.code == 40000
        assert exc.status_code == 400
        assert exc.message_key == "errors.common.bad_request"

    def test_with_params(self):
        exc = BadRequestError(message_params={"field": "name"})
        assert exc.message_params == {"field": "name"}


class TestConflictError:
    def test_defaults(self):
        exc = ConflictError()
        assert exc.code == 40900
        assert exc.status_code == 409


class TestK8sError:
    def test_defaults(self):
        exc = K8sError()
        assert exc.code == 50010
        assert exc.status_code == 502
        assert exc.message_key == "errors.k8s.operation_failed"
