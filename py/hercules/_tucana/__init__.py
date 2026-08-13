"""Runtime bootstrap for the ``tucana`` protobuf package.

The generated protobuf modules published in ``tucana`` cross-import each other
with top-level roots (``from shared import ...``, ``from aquila import ...``), so
the ``tucana/generated`` directory has to be on ``sys.path`` for them to import.

Importing this package performs that wiring once. The rest of the SDK then imports
the proto modules from their real location (``tucana.generated.shared`` /
``tucana.generated.aquila``) so that static analysis and IDEs can resolve them.

The struct <-> value helpers live in :mod:`hercules._tucana.helpers`.
"""
from __future__ import annotations

import sys

import tucana.generated as _generated


def ensure_tucana_path() -> None:
    """Put ``tucana/generated`` on ``sys.path`` (idempotent)."""
    root = list(_generated.__path__)[0]
    if root not in sys.path:
        sys.path.insert(0, root)


ensure_tucana_path()

__all__ = ["ensure_tucana_path"]
