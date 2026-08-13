"""Base manager (port of ``src/manager/BaseManager.ts``)."""
from __future__ import annotations

from typing import Callable, Dict, Generic, Iterator, List, Optional, Tuple, TypeVar

K = TypeVar("K")
V = TypeVar("V")
T = TypeVar("T")


class BaseManager(Generic[K, V]):
    def __init__(self) -> None:
        self.cache: Dict[K, V] = {}

    @property
    def size(self) -> int:
        return len(self.cache)

    def get(self, key: K) -> Optional[V]:
        return self.cache.get(key)

    def has(self, key: K) -> bool:
        return key in self.cache

    def set(self, key: K, value: V) -> "BaseManager[K, V]":
        self.cache[key] = value
        return self

    def delete(self, key: K) -> bool:
        if key in self.cache:
            del self.cache[key]
            return True
        return False

    def clear(self) -> None:
        self.cache.clear()

    def values(self) -> List[V]:
        return list(self.cache.values())

    def keys(self) -> List[K]:
        return list(self.cache.keys())

    def entries(self) -> List[Tuple[K, V]]:
        return list(self.cache.items())

    def find(self, predicate: Callable[[V, K], bool]) -> Optional[V]:
        for key, value in self.cache.items():
            if predicate(value, key):
                return value
        return None

    def filter(self, predicate: Callable[[V, K], bool]) -> List[V]:
        return [value for key, value in self.cache.items() if predicate(value, key)]

    def map(self, fn: Callable[[V, K], T]) -> List[T]:
        return [fn(value, key) for key, value in self.cache.items()]

    def some(self, predicate: Callable[[V, K], bool]) -> bool:
        return any(predicate(value, key) for key, value in self.cache.items())

    def every(self, predicate: Callable[[V, K], bool]) -> bool:
        return all(predicate(value, key) for key, value in self.cache.items())

    def for_each(self, fn: Callable[[V, K], None]) -> None:
        for key, value in self.cache.items():
            fn(value, key)

    def __iter__(self) -> Iterator[Tuple[K, V]]:
        return iter(self.cache.items())

    def __len__(self) -> int:
        return len(self.cache)
