from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time

TOKEN_LIFETIME_SECS = 300

_HEADER = base64.urlsafe_b64encode(
    json.dumps({"alg": "HS256", "typ": "JWT"}, separators=(",", ":")).encode()
).rstrip(b"=")


def build_logon_token(secret: str, identifier: str) -> str:
    payload = base64.urlsafe_b64encode(
        json.dumps(
            {"sub": identifier, "exp": int(time.time()) + TOKEN_LIFETIME_SECS},
            separators=(",", ":"),
        ).encode()
    ).rstrip(b"=")

    signing_input = _HEADER + b"." + payload
    signature = hmac.new(secret.encode(), signing_input, hashlib.sha256).digest()
    encoded_signature = base64.urlsafe_b64encode(signature).rstrip(b"=")

    return (signing_input + b"." + encoded_signature).decode()
