"""TypeScript type string -> Pydantic v2 model code.

Pipeline:

    TS type expression --(Node: ts-json-schema-generator)--> JSON schema
                       --(datamodel-code-generator)--------> Pydantic v2 code

``datamodel-code-generator`` does not parse TypeScript itself, so the TypeScript
is first turned into a JSON schema by the bundled Node helper
(:mod:`hercules.internal.tsgen`).

Custom/referenced types that appear in the TypeScript (other data types) can be
declared up front via ``preamble`` so the generator resolves them, e.g.
``preamble="type CustomType = unknown;"``.
"""
from __future__ import annotations

import json
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Optional

from hercules.internal.tsgen import ts_to_json_schema


class PydanticCodegenError(RuntimeError):
    """Raised when Pydantic code generation fails."""


def _datamodel_codegen() -> str:
    exe = shutil.which("datamodel-codegen")
    if exe is None:
        raise PydanticCodegenError(
            "datamodel-code-generator is not installed. Install it with "
            "'pip install datamodel-code-generator' (or the 'codegen' extra)."
        )
    return exe


def ts_to_pydantic(
    ts_type: str,
    name: str,
    *,
    preamble: Optional[str] = None,
    snake_case_fields: bool = False,
) -> str:
    """Convert a TypeScript type expression into Pydantic v2 model source code.

    ``name`` becomes the root model's class name. Nested object types become
    their own models; unions and custom references are preserved.
    """
    schema = ts_to_json_schema(ts_type, name, preamble)

    with tempfile.TemporaryDirectory() as tmp:
        tmp_path = Path(tmp)
        in_file = tmp_path / "schema.json"
        out_file = tmp_path / "model.py"
        in_file.write_text(json.dumps(schema))

        cmd = [
            _datamodel_codegen(),
            "--input", str(in_file),
            "--input-file-type", "jsonschema",
            "--output", str(out_file),
            "--output-model-type", "pydantic_v2.BaseModel",
            "--class-name", name,
            "--use-standard-collections",
            "--use-union-operator",
            "--disable-timestamp",
            "--formatters", "black", "isort",
        ]
        if snake_case_fields:
            cmd.append("--snake-case-field")

        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode != 0:
            raise PydanticCodegenError(
                result.stderr.strip() or "datamodel-code-generator failed."
            )
        return out_file.read_text()
