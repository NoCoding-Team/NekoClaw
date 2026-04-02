import pytest
from unittest.mock import patch
from app.core.security import create_access_token, create_refresh_token, decode_token, encrypt_sensitive, decrypt_sensitive


class TestJWT:
    def test_create_and_decode_access_token(self):
        token = create_access_token(user_id="user-123", subject="user-123")
        payload = decode_token(token)
        assert payload["sub"] == "user-123"
        assert payload["user_id"] == "user-123"
        assert payload["type"] == "access"

    def test_create_and_decode_refresh_token(self):
        token = create_refresh_token(user_id="user-456")
        payload = decode_token(token)
        assert payload["sub"] == "user-456"
        assert payload["type"] == "refresh"

    def test_extra_claims_in_access_token(self):
        token = create_access_token(
            user_id="u1", subject="u1",
            extra_claims={"is_super_admin": True},
        )
        payload = decode_token(token)
        assert payload["is_super_admin"] is True

    def test_invalid_token_raises(self):
        from fastapi import HTTPException
        with pytest.raises(HTTPException):
            decode_token("invalid-garbage-token")


class TestEncryption:
    def test_encrypt_decrypt_roundtrip(self):
        plaintext = "super-secret-kubeconfig-data"
        encrypted = encrypt_sensitive(plaintext)
        assert encrypted != plaintext
        decrypted = decrypt_sensitive(encrypted)
        assert decrypted == plaintext

    def test_different_encryptions_differ(self):
        plaintext = "same-input"
        enc1 = encrypt_sensitive(plaintext)
        enc2 = encrypt_sensitive(plaintext)
        assert enc1 != enc2

    def test_empty_string(self):
        encrypted = encrypt_sensitive("")
        assert decrypt_sensitive(encrypted) == ""
