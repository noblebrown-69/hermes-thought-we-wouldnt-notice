"""Tiny on-disk cabinet ledger.

Quarters and the high score live under the Hermes plugin data directory,
not in the install tree. ``hermes plugins update`` can replace the code
without wiping the score.

The file lock uses ``O_EXCL`` rather than ``fcntl`` so the same code works
on Linux, macOS, and Windows.
"""

from __future__ import annotations

import json
import os
import time
from pathlib import Path
from typing import Callable, Optional

PLUGIN_ID = "thought-we-wouldnt-notice"
_STATE_NAME = "cabinet.json"
_LOCK_NAME = "cabinet.lock"
_SOURCES = ("message", "command")


def resolve_data_dir(data_dir: Optional[os.PathLike[str] | str] = None) -> Path:
    """Return the writable ledger directory, creating it if needed."""
    if data_dir is not None:
        path = Path(data_dir)
    elif os.environ.get("TWWWN_DATA_DIR"):
        path = Path(os.environ["TWWWN_DATA_DIR"])
    else:
        path = _hermes_data_dir()
    path.mkdir(parents=True, exist_ok=True)
    return path


def _hermes_data_dir() -> Path:
    try:
        from plugins.plugin_storage import plugin_data_dir

        return Path(plugin_data_dir(PLUGIN_ID))
    except Exception:
        home = os.environ.get("HERMES_HOME")
        root = Path(home) if home else Path.home() / ".hermes"
        return root / "plugin-data" / PLUGIN_ID


def _empty_state() -> dict:
    return {"next_id": 1, "drops": [], "high_score": 0, "total": 0}


def _normalize(raw: object) -> dict:
    if not isinstance(raw, dict):
        raw = {}
    drops_in = raw.get("drops")
    if not isinstance(drops_in, list):
        drops_in = []
    drops: list[dict] = []
    for item in drops_in[-40:]:
        if not isinstance(item, dict):
            continue
        try:
            drop_id = int(item.get("id", 0))
        except (TypeError, ValueError):
            continue
        if drop_id <= 0:
            continue
        try:
            created = float(item.get("created_at", 0))
        except (TypeError, ValueError):
            created = 0.0
        source = item.get("source")
        if source not in _SOURCES:
            source = "message"
        session_id = "".join(
            ch for ch in str(item.get("session_id", "")) if ch.isprintable()
        )[:64]
        drops.append(
            {
                "id": drop_id,
                "created_at": created,
                "session_id": session_id,
                "source": source,
            }
        )
    try:
        next_id = int(raw.get("next_id", 1))
    except (TypeError, ValueError):
        next_id = 1
    if drops:
        next_id = max(next_id, drops[-1]["id"] + 1)
    try:
        high = int(raw.get("high_score", 0))
    except (TypeError, ValueError):
        high = 0
    high = max(0, min(high, 999_999))
    try:
        total = int(raw.get("total", len(drops)))
    except (TypeError, ValueError):
        total = len(drops)
    return {
        "next_id": max(1, next_id),
        "drops": drops,
        "high_score": high,
        "total": max(total, len(drops)),
    }


def _read_file(path: Path) -> dict:
    try:
        raw = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError, UnicodeError):
        raw = None
    return _normalize(raw)


def _write_file(path: Path, state: dict) -> None:
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(state, separators=(",", ":")), encoding="utf-8")
    os.replace(tmp, path)


def _acquire(lock_path: Path) -> int:
    deadline = time.time() + 2.0
    while True:
        try:
            fd = os.open(str(lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(fd, str(time.time()).encode("ascii"))
            return fd
        except FileExistsError:
            try:
                age = time.time() - lock_path.stat().st_mtime
            except OSError:
                age = 0
            if age > 5:
                try:
                    lock_path.unlink()
                except OSError:
                    pass
                continue
            if time.time() > deadline:
                raise TimeoutError("cabinet state lock")
            time.sleep(0.02)


def _release(fd: int, lock_path: Path) -> None:
    try:
        os.close(fd)
    except OSError:
        pass
    try:
        lock_path.unlink()
    except OSError:
        pass


def _with_state(mutator: Callable[[dict], object], data_dir=None, write: bool = True):
    directory = resolve_data_dir(data_dir)
    path = directory / _STATE_NAME
    lock_path = directory / _LOCK_NAME
    fd = _acquire(lock_path)
    try:
        state = _read_file(path)
        result = mutator(state)
        if write:
            _write_file(path, state)
        return result
    finally:
        _release(fd, lock_path)


def record_drop(session_id: str = "", source: str = "message", data_dir=None) -> dict:
    """Append one quarter and return the drop record."""
    if source not in _SOURCES:
        source = "message"
    session = "".join(ch for ch in str(session_id or "") if ch.isprintable())[:64]

    def mutate(state: dict) -> dict:
        drop = {
            "id": int(state["next_id"]),
            "created_at": time.time(),
            "session_id": session,
            "source": source,
        }
        state["next_id"] = drop["id"] + 1
        state["total"] = int(state["total"]) + 1
        drops = list(state["drops"])
        drops.append(drop)
        state["drops"] = drops[-40:]
        return dict(drop)

    return _with_state(mutate, data_dir=data_dir)


def list_drops(since: int = 0, data_dir=None) -> dict:
    """Return drops newer than ``since``, plus the score summary."""
    try:
        cursor = int(since)
    except (TypeError, ValueError):
        cursor = 0
    if cursor < 0:
        cursor = 0

    def read(state: dict) -> dict:
        drops = [dict(item) for item in state["drops"] if int(item["id"]) > cursor]
        latest = int(state["drops"][-1]["id"]) if state["drops"] else 0
        return {
            "drops": drops,
            "latest": latest,
            "high_score": int(state["high_score"]),
            "total": int(state["total"]),
        }

    return _with_state(read, data_dir=data_dir, write=False)


def submit_score(score: object, data_dir=None) -> dict:
    """Raise the stored high score when ``score`` beats it."""
    try:
        value = int(score)
    except (TypeError, ValueError):
        value = 0
    value = max(0, min(value, 999_999))

    def mutate(state: dict) -> dict:
        if value > int(state["high_score"]):
            state["high_score"] = value
        return {"high_score": int(state["high_score"])}

    return _with_state(mutate, data_dir=data_dir)


def status(data_dir=None) -> dict:
    """Summary for the CLI."""
    view = list_drops(since=0, data_dir=data_dir)
    return {
        "high_score": view["high_score"],
        "quarters": view["total"],
        "latest": view["latest"],
    }
