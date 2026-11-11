"""Load the plugin the way Hermes loads a directory plugin."""

from __future__ import annotations

import importlib.util
import sys
import types
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))


def load_plugin():
    name = "hermes_plugins.thought_we_wouldnt_notice"
    cached = sys.modules.get(name)
    if cached is not None and getattr(cached, "register", None):
        return cached
    parent = "hermes_plugins"
    if parent not in sys.modules:
        package = types.ModuleType(parent)
        package.__path__ = []
        package.__package__ = parent
        sys.modules[parent] = package
    spec = importlib.util.spec_from_file_location(
        name,
        ROOT / "__init__.py",
        submodule_search_locations=[str(ROOT)],
    )
    module = importlib.util.module_from_spec(spec)
    module.__package__ = name
    module.__path__ = [str(ROOT)]
    sys.modules[name] = module
    assert spec.loader is not None
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def plugin():
    return load_plugin()


class FakeCtx:
    def __init__(self):
        self.hooks = []
        self.commands = []
        self.cli = []

    def register_hook(self, name, callback, **kwargs):
        self.hooks.append((name, callback, kwargs))

    def register_command(self, name, handler, description="", args_hint="", **kwargs):
        self.commands.append(
            {"name": name, "handler": handler, "description": description, "args_hint": args_hint}
        )

    def register_cli_command(self, name, help, setup_fn, handler_fn=None, description=""):
        self.cli.append(
            {
                "name": name,
                "help": help,
                "setup_fn": setup_fn,
                "handler_fn": handler_fn,
                "description": description,
            }
        )


@pytest.fixture
def ctx():
    return FakeCtx()


@pytest.fixture(autouse=True)
def cabinet_home(tmp_path, monkeypatch):
    monkeypatch.setenv("TWWWN_DATA_DIR", str(tmp_path))
    return tmp_path
