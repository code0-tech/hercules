# code0-hercules (Python)

Python SDK for the hercules action runner — the counterpart to the TypeScript
`@code0-tech/hercules` package. Define data types, functions, and events, and
connect them to aquila.

## Install

```bash
pip install code0-hercules
```

Requirements:

- **Python 3.10+**
- **Node.js** — data-type schemas are converted to/from TypeScript via a bundled
  Node helper (`hercules/_tsgen`). Its npm dependencies are installed automatically
  on first use.

## Develop

This project uses [uv](https://docs.astral.sh/uv/).

```bash
uv sync                                   # create .venv + install (incl. dev deps)
npm ci --prefix hercules/_tsgen           # install the Node schema helper
uv run pytest                             # run the tests
```

The runnable example lives in [`examples/simple-example-py`](examples/simple-example-py).

## Built-in definitions

The built-in data types / functions in `hercules/definitions/` are **generated**
(not committed) from a [`code0-definition`](https://github.com/code0-tech/code0-definition)
release:

```bash
uv run python scripts/build_definitions.py --version def-0.0.34
```

## Build & release

Packages are built with `uv build` and published to PyPI from CI:

- **`build.yml`** builds and tests the package on every push.
- **`publish.yml`** runs on a pushed git tag: it sets the package version from the
  tag, regenerates the definitions, builds, and publishes to PyPI via
  [trusted publishing](https://docs.pypi.org/trusted-publishers/) (OIDC — no token).

To cut a release, push a PEP 440 version tag (e.g. `0.1.0`):

```bash
git tag 0.1.0 && git push origin 0.1.0
```

The `code0-definition` release used for the built-in definitions is controlled by
the `HERCULES_DEFINITIONS_VERSION` repository variable (default `def-0.0.34`).

Build locally:

```bash
uv build          # -> dist/*.whl and dist/*.tar.gz
```
