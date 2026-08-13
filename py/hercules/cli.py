"""``hercules`` command line interface (port of ``src/cli.ts``).

Loads an entry file (without connecting to aquila) and prints the Action as a
JSON document in the shape of the tucana protobuf ``Module`` type.
"""
from __future__ import annotations

import importlib.util
import os
import sys
from pathlib import Path

from google.protobuf import json_format

from hercules.action import Action, registered_actions

USAGE = """Usage: hercules export <entry-file> [options]

Loads the given entry file (without connecting to aquila) and prints the
Action as a JSON document in the shape of the tucana protobuf Module type.

Options:
  -o, --out <file>   Write the JSON to a file instead of stdout
  --compact          Emit compact JSON instead of pretty-printed
  -h, --help         Show this help message

Examples:
  hercules export src/index.py
  hercules export app.py -o module.json
"""


def _fail(message: str):
    sys.stderr.write(f"{message}\n")
    raise SystemExit(1)


def _parse_export_args(argv):
    entry = None
    out = None
    compact = False
    i = 0
    while i < len(argv):
        arg = argv[i]
        if arg in ("-h", "--help"):
            sys.stdout.write(USAGE)
            raise SystemExit(0)
        elif arg in ("-o", "--out"):
            i += 1
            if i >= len(argv):
                _fail(f"Missing value for {arg}\n\n{USAGE}")
            out = argv[i]
        elif arg == "--compact":
            compact = True
        elif arg.startswith("-"):
            _fail(f"Unknown option: {arg}\n\n{USAGE}")
        elif entry is None:
            entry = arg
        else:
            _fail(f"Unexpected argument: {arg}\n\n{USAGE}")
        i += 1
    if entry is None:
        _fail(f"Missing <entry-file> argument\n\n{USAGE}")
    return entry, out, compact


def _is_action(value) -> bool:
    if isinstance(value, Action):
        return True
    return (
        callable(getattr(value, "build_module", None))
        and isinstance(getattr(value, "identifier", None), str)
        and callable(getattr(value, "register_function", None))
    )


def _find_action(module) -> Action:
    for value in vars(module).values():
        if _is_action(value):
            return value
    registered = registered_actions()
    if registered:
        return registered[-1]
    raise Exception(
        "No Action found. Define your Action instance in the entry file or "
        "construct it during module load."
    )


def _load_entry(entry: str):
    entry_path = Path(os.getcwd()) / entry
    if not entry_path.exists():
        _fail(f"Entry file not found: {entry_path}")
    spec = importlib.util.spec_from_file_location("__hercules_entry__", str(entry_path))
    module = importlib.util.module_from_spec(spec)
    # Make the entry's own directory importable so relative sibling imports work.
    sys.path.insert(0, str(entry_path.parent))
    spec.loader.exec_module(module)
    return module


def _run_export(argv):
    entry, out, compact = _parse_export_args(argv)
    # Must be set before the entry file is loaded: it makes connect() a no-op
    # and registers constructed Action instances for _find_action.
    os.environ["HERCULES_EXPORT"] = "1"
    module = _load_entry(entry)
    action = _find_action(module)
    module_message = action.build_module()
    json_text = json_format.MessageToJson(
        module_message,
        indent=None if compact else 2,
        preserving_proto_field_name=False,
    )
    json_text = (json_text if compact else json_text) + "\n"
    if out:
        out_path = Path(os.getcwd()) / out
        out_path.write_text(json_text)
        sys.stderr.write(f"Module written to {out_path}\n")
    else:
        sys.stdout.write(json_text)


def main(argv=None):
    argv = list(sys.argv[1:] if argv is None else argv)
    if not argv or argv[0] in ("-h", "--help"):
        sys.stdout.write(USAGE)
        raise SystemExit(1 if not argv else 0)
    command, *rest = argv
    if command != "export":
        _fail(f"Unknown command: {command}\n\n{USAGE}")
    _run_export(rest)
    raise SystemExit(0)


if __name__ == "__main__":
    main()
