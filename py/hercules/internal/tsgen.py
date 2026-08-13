"""Bridge to the bundled Node schema-conversion helper (``hercules/_tsgen``).

The helper handles the two directions that have no good pure-Python equivalent:

* a Pydantic JSON schema -> an inline TypeScript type expression
  (via ``json-schema-to-typescript``)
* a TypeScript type expression -> a JSON schema
  (via ``ts-json-schema-generator``)

Node must be installed. The helper's own npm dependencies are installed lazily on
first use if ``node_modules`` is missing.
"""
from __future__ import annotations

import json
import shutil
import subprocess
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, Optional

_TSGEN_DIR = Path(__file__).resolve().parent.parent / "_tsgen"
_CONVERT = _TSGEN_DIR / "convert.mjs"


class TsGenError(RuntimeError):
    """Raised when the Node schema-conversion helper cannot run or fails."""


@lru_cache(maxsize=1)
def _node() -> str:
    node = shutil.which("node")
    if node is None:
        raise TsGenError(
            "Node.js is required for TypeScript <-> Pydantic schema conversion "
            "but 'node' was not found on PATH. Install Node.js to continue."
        )
    return node


@lru_cache(maxsize=1)
def _ensure_dependencies() -> None:
    if (_TSGEN_DIR / "node_modules").is_dir():
        return
    npm = shutil.which("npm")
    if npm is None:
        raise TsGenError(
            f"The Node helper dependencies are not installed and 'npm' was not "
            f"found on PATH. Run 'npm install' in {_TSGEN_DIR} manually."
        )
    result = subprocess.run(
        [npm, "install"],
        cwd=_TSGEN_DIR,
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise TsGenError(
            f"Failed to install Node helper dependencies in {_TSGEN_DIR}:\n"
            f"{result.stderr.strip()}"
        )


def _run(request: Dict[str, Any]) -> Dict[str, Any]:
    _ensure_dependencies()
    result = subprocess.run(
        [_node(), str(_CONVERT)],
        input=json.dumps(request),
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise TsGenError(result.stderr.strip() or "Node helper failed.")
    return json.loads(result.stdout)


def json_schema_to_ts(schema: Dict[str, Any], name: str) -> str:
    """Compile a (pre-processed) JSON schema into an inline TypeScript type string."""
    return _run({"mode": "json_schema_to_ts", "schema": schema, "name": name})["type"]


def ts_to_json_schema(
    ts_type: str, name: str, preamble: Optional[str] = None
) -> Dict[str, Any]:
    """Convert a TypeScript type expression into a JSON schema."""
    request: Dict[str, Any] = {
        "mode": "ts_to_json_schema",
        "ts": ts_type,
        "name": name,
    }
    if preamble:
        request["preamble"] = preamble
    return _run(request)["schema"]
