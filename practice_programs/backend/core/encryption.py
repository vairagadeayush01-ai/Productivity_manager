"""
core/encryption.py — AES-256-GCM symmetric encryption for sensitive fields.

Used for:
  - GitHub Personal Access Tokens (github_pat_enc on User model)
  - Google Calendar OAuth refresh tokens (future)

Key derivation:
  Priority 1: ENCRYPTION_KEY env var (32-byte hex string, 64 hex chars)
  Priority 2: Derive from APP_SECRET using PBKDF2 (development fallback)

Usage:
  from core.encryption import encrypt, decrypt

  # Store
  user.github_pat_enc = encrypt(pat_plaintext)

  # Retrieve
  pat_plaintext = decrypt(user.github_pat_enc)
"""
import base64
import hashlib
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

_NONCE_BYTES = 12  # GCM standard nonce size


def _get_key() -> bytes:
    """
    Returns a 32-byte AES key.
    Reads ENCRYPTION_KEY from env (must be 64 hex chars = 32 bytes).
    Falls back to PBKDF2(APP_SECRET | SECRET_KEY) for dev convenience.
    """
    raw = os.getenv("ENCRYPTION_KEY", "").strip()
    if raw:
        try:
            key = bytes.fromhex(raw)
            if len(key) == 32:
                return key
        except ValueError:
            pass

    # Dev fallback: derive from whatever secret is available
    secret = (
        os.getenv("APP_SECRET")
        or os.getenv("SECRET_KEY")
        or "dev-insecure-default-key-change-in-prod"
    )
    # PBKDF2-SHA256, 100k iterations → 32 bytes
    return hashlib.pbkdf2_hmac(
        "sha256",
        secret.encode(),
        b"antigravity-enc-salt-v1",
        100_000,
        dklen=32,
    )


def encrypt(plaintext: str) -> str:
    """
    Encrypts plaintext using AES-256-GCM.
    Returns a base64-encoded string: base64(nonce || ciphertext_with_tag).
    The nonce is randomly generated per call (12 bytes).
    """
    if not plaintext:
        return ""
    key = _get_key()
    aesgcm = AESGCM(key)
    nonce = os.urandom(_NONCE_BYTES)
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
    # Prepend nonce to ciphertext before encoding
    return base64.b64encode(nonce + ciphertext).decode("ascii")


def decrypt(ciphertext_b64: str) -> str:
    """
    Decrypts a base64-encoded AES-256-GCM ciphertext.
    Returns the plaintext string, or raises ValueError on bad input/key.
    """
    if not ciphertext_b64:
        return ""
    key = _get_key()
    aesgcm = AESGCM(key)
    raw = base64.b64decode(ciphertext_b64)
    nonce, ciphertext = raw[:_NONCE_BYTES], raw[_NONCE_BYTES:]
    try:
        return aesgcm.decrypt(nonce, ciphertext, None).decode("utf-8")
    except Exception as exc:
        raise ValueError(f"Decryption failed — wrong key or corrupted data: {exc}") from exc
