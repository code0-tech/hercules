# simple-example-py

A minimal example action built with the Python `hercules` SDK.

This is a self-contained [uv](https://docs.astral.sh/uv/) project that depends on
the SDK from the local checkout (`../..`), mirroring the TypeScript example's
`"@code0-tech/hercules": "file:../.."` setup.

## Setup

```bash
uv sync        # creates .venv and installs hercules (editable) + deps
```

## Run

```bash
uv run python index.py
```

Environment variables (see `example.env`): `ACTION_ID`, `VERSION`, `AQUILA_URL`,
`AUTH_TOKEN`.

## Export the action as a Module JSON

Without connecting to aquila:

```bash
uv run hercules export index.py               # print to stdout
uv run hercules export index.py -o module.json
uv run hercules export index.py --compact
```

## Notes

- Requires **Python 3.10+** (pinned to 3.12 via `.python-version`).
- The SDK converts data-type schemas to TypeScript via a bundled Node helper, so
  **Node.js** must be installed for data types to build.
