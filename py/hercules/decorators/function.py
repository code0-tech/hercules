"""Function decorators (port of ``src/decorators/function.dec.ts``)."""
from __future__ import annotations

from typing import Union

from hercules._metadata import define_metadata, get_own_metadata
from hercules.decorators.meta import normalize_translations
from hercules.models.function import FunctionParameterProps


def OmitFunction():
    def decorator(target):
        define_metadata("hercules:omit_function_definition", True, target)
        return target

    return decorator


def Design(design: str):
    def decorator(target):
        define_metadata("hercules:design", design, target)
        return target

    return decorator


def ThrowsError(throws_error: bool = True):
    def decorator(target):
        define_metadata("hercules:throws_error", throws_error, target)
        return target

    return decorator


def _coerce_parameter(parameter: Union[FunctionParameterProps, dict]) -> FunctionParameterProps:
    if isinstance(parameter, FunctionParameterProps):
        return parameter
    param = dict(parameter)
    for key in ("name", "description", "documentation"):
        if param.get(key) is not None:
            param[key] = normalize_translations(param[key])
    return FunctionParameterProps(**param)


def Parameter(parameter: Union[FunctionParameterProps, dict]):
    coerced = _coerce_parameter(parameter)

    def decorator(target):
        # get_own_metadata: getMetadata would return the parent class's array on
        # subclasses, and inserting would mutate the parent's parameters.
        parameters = get_own_metadata("hercules:function_parameters", target) or []
        parameters.insert(0, coerced)
        define_metadata("hercules:function_parameters", parameters, target)
        return target

    return decorator


__all__ = ["OmitFunction", "Design", "ThrowsError", "Parameter"]
