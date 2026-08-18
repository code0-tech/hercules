"""Generate the ``hercules/definitions`` package from a code0-definition release.

Python port of ``ts/scripts/build-definitions.ts``. Downloads the upstream
``definitions.zip``, then for every definition emits a Python module:

* data types      -> a schema variable + ``register_schema`` call
* runtime funcs   -> a decorated ``RuntimeFunctionRunnable`` subclass
* runtime flows   -> a decorated ``RuntimeEventRunnable`` subclass

Usage::

    python scripts/build_definitions.py --version def-0.0.35
"""
from __future__ import annotations

import argparse
import io
import json
import os
import re
import shutil
import sys
import urllib.request
import zipfile
from pathlib import Path
from typing import Dict, List, Optional, Set, Tuple

# ``build_definitions`` runs standalone; make sure the package is importable.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
from hercules.internal.pydantic_codegen import ts_to_pydantic

REPO = "code0-tech/code0-definition"
OUTPUT_DIR = Path(__file__).resolve().parent.parent / "hercules" / "definitions"


# ── Naming helpers ─────────────────────────────────────────────────────────────

def to_pascal_case(value: str) -> str:
    value = value.replace("::", "_")
    parts = [p for p in _split_words(value) if p]
    return "".join(p[:1].upper() + p[1:].lower() for p in parts)


def _split_words(value: str) -> List[str]:
    out, cur = [], ""
    for ch in value:
        if ch in "_-":
            out.append(cur)
            cur = ""
        else:
            cur += ch
    out.append(cur)
    return out


def sanitize_segment(segment: str) -> str:
    """Make a directory name a valid Python package name (``rest-action`` -> ``rest_action``)."""
    return segment.replace("-", "_")


def to_model_name(identifier: str) -> str:
    """Class name for a data type's generated Pydantic model (``OBJECT`` -> ``Object``)."""
    name = to_pascal_case(identifier)
    if not name or not name[0].isalpha():
        name = "DataType" + name
    return name


_TS_IDENT_RE = re.compile(r"^[A-Za-z_$][A-Za-z0-9_$]*$")


def module_dotted(rel_module: str, file_name: str) -> str:
    segments = [sanitize_segment(s) for s in Path(rel_module).parts]
    return ".".join(["hercules", "definitions", *segments, file_name])


# ── Definition records ─────────────────────────────────────────────────────────

class DataTypeDef:
    def __init__(self, identifier, type_str, generic_keys, rel_module, file_name):
        self.identifier = identifier
        self.type_str = type_str
        self.generic_keys = generic_keys
        self.rel_module = rel_module
        self.file_name = file_name


# ── Translation / decorator rendering ──────────────────────────────────────────

def _py_translations(items) -> str:
    return "[" + ", ".join(
        f'{{"code": "{t["code"]}", "content": {json.dumps(t["content"])}}}' for t in items
    ) + "]"


def _translation_decorator(name: str, items) -> List[str]:
    if not items:
        return []
    args = ", ".join(
        f'{{"code": "{t["code"]}", "content": {json.dumps(t["content"])}}}' for t in items
    )
    return [f"@{name}({args})"]


def _meta_decorators(json_obj: dict, identifier_key: str) -> Tuple[List[str], List[str]]:
    """Return (decorator lines, imported decorator names)."""
    lines: List[str] = [f"@Identifier({json.dumps(json_obj[identifier_key])})"]
    names = {"Identifier"}
    if json_obj.get("signature"):
        lines.append(f"@Signature({json.dumps(json_obj['signature'])})")
        names.add("Signature")
    for key, deco in (
        ("name", "Name"),
        ("description", "Description"),
        ("documentation", "Documentation"),
        ("displayMessage", "DisplayMessage"),
        ("alias", "Alias"),
    ):
        if json_obj.get(key):
            lines += _translation_decorator(deco, json_obj[key])
            names.add(deco)
    if json_obj.get("displayIcon"):
        lines.append(f"@DisplayIcon({json.dumps(json_obj['displayIcon'])})")
        names.add("DisplayIcon")
    return lines, sorted(names)


def _parameter_decorators(params) -> List[str]:
    out = []
    for p in params or []:
        props = [f'"runtime_name": {json.dumps(p["runtimeName"])}']
        if p.get("name"):
            props.append(f'"name": {_py_translations(p["name"])}')
        if p.get("description"):
            props.append(f'"description": {_py_translations(p["description"])}')
        if p.get("optional"):
            props.append('"optional": True')
        if p.get("hidden"):
            props.append('"hidden": True')
        out.append("@Parameter({" + ", ".join(props) + "})")
    return out


def _setting_decorators(settings) -> List[str]:
    out = []
    for s in settings or []:
        props = [f'"identifier": {json.dumps(s["identifier"])}']
        if s.get("unique") and s["unique"] != "NONE":
            props.append(f'"unique": {json.dumps(s["unique"])}')
        if s.get("name"):
            props.append(f'"name": {_py_translations(s["name"])}')
        if s.get("description"):
            props.append(f'"description": {_py_translations(s["description"])}')
        if s.get("optional"):
            props.append('"optional": True')
        if s.get("hidden"):
            props.append('"hidden": True')
        out.append("@EventSetting({" + ", ".join(props) + "})")
    return out


# ── File generators ────────────────────────────────────────────────────────────

def generate_runtime_function(json_obj: dict, class_name: str) -> str:
    params = json_obj.get("runtimeParameterDefinitions")
    meta_lines, meta_names = _meta_decorators(json_obj, "runtimeName")
    func_names = []
    if json_obj.get("throwsError"):
        func_names.append("ThrowsError")
    if params:
        func_names.append("Parameter")

    lines = [
        "from hercules.models.runtime_function import RuntimeFunctionRunnable",
        f"from hercules.decorators.meta import {', '.join(meta_names)}",
        "from hercules.decorators.runtime_function import OmitRuntimeFunction",
    ]
    if func_names:
        lines.append(f"from hercules.decorators.function import {', '.join(func_names)}")
    lines += ["", "", "@OmitRuntimeFunction()"]
    lines += meta_lines
    if json_obj.get("throwsError"):
        lines.append("@ThrowsError()")
    lines += _parameter_decorators(params)
    lines += [
        f"class {class_name}(RuntimeFunctionRunnable):",
        "    def run(self, *args):",
        f'        raise NotImplementedError("{class_name}.run() is not implemented")',
        "",
    ]
    return "\n".join(lines)


def generate_runtime_flow_type(json_obj: dict, class_name: str) -> str:
    settings = json_obj.get("runtimeSettings")
    meta_lines, meta_names = _meta_decorators(json_obj, "identifier")

    lines = [
        "from hercules.models.runtime_event import RuntimeEventRunnable",
        f"from hercules.decorators.meta import {', '.join(meta_names)}",
    ]
    if settings:
        lines.append("from hercules.decorators.event import EventSetting")
    lines += ["", ""]
    lines += meta_lines
    lines += _setting_decorators(settings)
    lines += [f"class {class_name}(RuntimeEventRunnable):", "    pass", ""]
    return "\n".join(lines)


def _strip_codegen_header(code: str) -> str:
    """Drop the leading ``# generated by datamodel-codegen`` banner."""
    lines = code.splitlines()
    start = 0
    while start < len(lines) and (
        lines[start].startswith("#") or not lines[start].strip()
    ):
        start += 1
    return "\n".join(lines[start:]).strip()


def _reference_preamble(dt: "DataTypeDef", ref_map, generic_key_set: Set[str]) -> str:
    """Declare every other data-type identifier / generic key as an opaque TS type.

    The referenced data types are only *registered* for reference resolution, so it
    is enough for the generator to see them as opaque (``unknown``) here; the exact
    cross-references are preserved separately in the emitted ``TypeString``.
    """
    names = set(ref_map) | set(generic_key_set) | set(dt.generic_keys)
    names.discard(dt.identifier)
    stubs = [
        f"type {name} = unknown;"
        for name in sorted(names)
        if _TS_IDENT_RE.match(name)
    ]
    return "\n".join(stubs)


def generate_data_type(dt: "DataTypeDef", ref_map, generic_key_set) -> str:
    class_name = to_model_name(dt.identifier)
    preamble = _reference_preamble(dt, ref_map, generic_key_set)

    try:
        model_code = _strip_codegen_header(
            ts_to_pydantic(dt.type_str, class_name, preamble=preamble)
        )
    except Exception as exc:  # noqa: BLE001 - keep the build resilient per-definition
        print(f"  ! {dt.identifier}: falling back to RootModel[Any] ({exc})")
        model_code = (
            "from typing import Any\n"
            "from pydantic import RootModel\n\n\n"
            f"class {class_name}(RootModel[Any]):\n    pass"
        )

    lines = [
        model_code,
        "",
        "",
        "from hercules.internal.schema import register_schema",
        f"register_schema({class_name}, {json.dumps(dt.identifier)})",
        "",
    ]
    return "\n".join(lines)


# ── Directory walking ──────────────────────────────────────────────────────────

def walk_defs(defs_dir: Path):
    for path in sorted(defs_dir.rglob("*.json")):
        if path.name == "module.json":
            continue
        rel_module = str(path.parent.relative_to(defs_dir))
        type_folder = path.parent.name
        class_name = to_pascal_case(path.stem)
        file_name = path.stem.lower()
        data = json.loads(path.read_text())
        yield data, class_name, file_name, rel_module, type_folder


def ensure_package(path: Path):
    path.mkdir(parents=True, exist_ok=True)
    init = path / "__init__.py"
    if not init.exists():
        init.write_text("")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--version", required=True)
    args = parser.parse_args()
    version = args.version

    url = f"https://github.com/{REPO}/releases/download/{version}/definitions.zip"
    print(f"Downloading {url}...")
    with urllib.request.urlopen(url) as response:
        payload = response.read()

    extract_dir = Path(os.environ.get("TMPDIR", "/tmp")) / f"hercules-defs-{version}"
    if extract_dir.exists():
        shutil.rmtree(extract_dir)
    with zipfile.ZipFile(io.BytesIO(payload)) as zf:
        zf.extractall(extract_dir)
    defs_dir = extract_dir / "definitions"

    # Collect data type defs first (needed to resolve references).
    data_type_defs: List[DataTypeDef] = []
    generic_key_set: Set[str] = set()
    for data, class_name, file_name, rel_module, type_folder in walk_defs(defs_dir):
        if type_folder != "data_types" or not data.get("identifier") or not data.get("type"):
            continue
        keys = [k.split("extends")[0].strip() for k in (data.get("genericKeys") or [])]
        generic_key_set.update(keys)
        data_type_defs.append(
            DataTypeDef(data["identifier"], data["type"], set(keys), rel_module, file_name)
        )
    ref_map = {d.identifier: d for d in data_type_defs}

    if OUTPUT_DIR.exists():
        shutil.rmtree(OUTPUT_DIR)
    ensure_package(OUTPUT_DIR)

    generated: List[str] = []

    def write_file(rel_module: str, file_name: str, content: str):
        segments = [sanitize_segment(s) for s in Path(rel_module).parts]
        out_dir = OUTPUT_DIR
        for seg in segments:
            out_dir = out_dir / seg
            ensure_package(out_dir)
        (out_dir / f"{file_name}.py").write_text(content)
        generated.append(".".join([*segments, file_name]))

    # Data types.
    for dt in data_type_defs:
        write_file(dt.rel_module, dt.file_name, generate_data_type(dt, ref_map, dt.generic_keys))

    # Runtime functions and flow types.
    for data, class_name, file_name, rel_module, type_folder in walk_defs(defs_dir):
        if type_folder == "runtime_flow_types":
            content = generate_runtime_flow_type(data, class_name)
        elif type_folder == "runtime_functions":
            content = generate_runtime_function(data, class_name)
        else:
            continue
        write_file(rel_module, file_name, content)

    # Top-level package imports every generated module (runs registration).
    index_lines = [
        f"import hercules.definitions.{name}  # noqa: F401"
        for name in sorted(generated)
    ]
    (OUTPUT_DIR / "__init__.py").write_text("\n".join(index_lines) + "\n")

    shutil.rmtree(extract_dir, ignore_errors=True)
    print(f"Generated {len(generated)} definition files in {OUTPUT_DIR}")


if __name__ == "__main__":
    sys.exit(main())
