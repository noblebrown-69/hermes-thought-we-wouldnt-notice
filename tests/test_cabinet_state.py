"""Ledger for quarters and the high score."""

import json

import cabinet_state


def test_drops_increase_and_list_since(cabinet_home):
    first = cabinet_state.record_drop(session_id="a\nb", data_dir=cabinet_home)
    second = cabinet_state.record_drop(session_id="b", source="nope", data_dir=cabinet_home)
    assert first["id"] == 1
    assert second["id"] == 2
    assert "\n" not in first["session_id"]
    assert second["source"] == "message"
    view = cabinet_state.list_drops(since=1, data_dir=cabinet_home)
    assert [item["id"] for item in view["drops"]] == [2]
    assert view["latest"] == 2
    assert view["total"] == 2


def test_score_only_rises(cabinet_home):
    assert cabinet_state.submit_score(120, data_dir=cabinet_home)["high_score"] == 120
    assert cabinet_state.submit_score(40, data_dir=cabinet_home)["high_score"] == 120
    assert cabinet_state.submit_score("nope", data_dir=cabinet_home)["high_score"] == 120
    assert cabinet_state.submit_score(10_000_000, data_dir=cabinet_home)["high_score"] == 999999


def test_corrupt_ledger_recovers(cabinet_home):
    (cabinet_home / "cabinet.json").write_text("{nope", encoding="utf-8")
    drop = cabinet_state.record_drop(session_id="ok", data_dir=cabinet_home)
    assert drop["id"] == 1
    saved = json.loads((cabinet_home / "cabinet.json").read_text(encoding="utf-8"))
    assert saved["total"] == 1
    assert not (cabinet_home / "cabinet.lock").exists()
