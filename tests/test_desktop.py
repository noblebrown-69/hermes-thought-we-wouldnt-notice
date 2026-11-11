"""Desktop popup: the hook notifies the app, and Esc is the dismiss key."""

import json
import subprocess
from pathlib import Path

import desktop_bridge

ROOT = Path(__file__).resolve().parents[1]


def test_publish_coin_uses_the_public_event(monkeypatch):
    import sys
    import types

    calls = []

    def broadcast(plugin_id, event, payload=None):
        calls.append((plugin_id, event, payload))

    events = types.ModuleType("hermes_cli.plugin_events")
    events.broadcast_plugin_event = broadcast
    monkeypatch.setitem(sys.modules, "hermes_cli", types.ModuleType("hermes_cli"))
    monkeypatch.setitem(sys.modules, "hermes_cli.plugin_events", events)

    assert desktop_bridge.publish_coin(
        {"id": 4, "created_at": 10.5, "source": "message", "session_id": "sess"}
    ) is True
    plugin_id, event, payload = calls[0]
    assert plugin_id == "thought-we-wouldnt-notice"
    assert event == "coin"
    assert payload["id"] == 4
    assert payload["created_at"] == 10.5
    assert payload["source"] == "message"
    assert "session_id" not in payload
    assert 'data-popup="1"' in payload["html"]
    assert "twwwn-standalone" in payload["html"]
    assert "TOP SAILS" in payload["html"]
    assert 'name="viewport"' in payload["html"]


def test_publish_coin_is_quiet_without_the_bridge(monkeypatch):
    import sys
    import types

    monkeypatch.setitem(sys.modules, "hermes_cli", types.ModuleType("hermes_cli"))
    monkeypatch.setitem(sys.modules, "hermes_cli.plugin_events", types.ModuleType("hermes_cli.plugin_events"))
    assert desktop_bridge.publish_coin({"id": 1, "created_at": 1, "source": "command"}) is False


def test_quarter_notifies_desktop_and_still_blocks(plugin, monkeypatch):
    seen = []
    monkeypatch.setattr(plugin, "publish_coin", lambda drop: seen.append(drop) or True)
    blocked = plugin.on_pre_llm_call(user_message="25c", session_id="desk")
    assert blocked["action"] == "block"
    assert seen[0]["source"] == "message"
    assert seen[0]["session_id"] == "desk"


def test_unmatched_message_does_not_notify(plugin, monkeypatch):
    monkeypatch.setattr(plugin, "publish_coin", lambda drop: (_ for _ in ()).throw(AssertionError(drop)))
    assert plugin.on_pre_llm_call(user_message="25 cents more RAM") is None


def test_desktop_plugin_picks_a_surface_and_dismisses_on_esc():
    src = (ROOT / "desktop" / "plugin.js").read_text(encoding="utf-8")
    assert "from '@hermes/plugin-sdk'" in src
    assert "eval(" not in src
    assert "document.body" not in src
    assert "payload.html" in src
    start = src.index("export const COIN_EVENT")
    end = src.index("const host = sdk.host")
    program = src[start:end] + """
const out = {
  dialog: chooseSurface({ dialog: true, openWorkspace: true, pane: true }),
  workspace: chooseSurface({ dialog: false, openWorkspace: true, pane: true }),
  pane: chooseSurface({ dialog: false, openWorkspace: false, pane: true }),
  none: chooseSurface({}),
  esc: isDismissKey({ key: "Escape" }),
  escWord: isDismissKey({ key: "Esc" }),
  enter: isDismissKey({ key: "Enter" }),
  empty: isDismissKey(null),
  event: COIN_EVENT,
}
console.log(JSON.stringify(out))
"""
    result = subprocess.run(
        ["node", "--input-type=module", "-e", program],
        check=True,
        capture_output=True,
        text=True,
    )
    data = json.loads(result.stdout)
    assert data == {
        "dialog": "dialog",
        "workspace": "workspace",
        "pane": "pane",
        "none": "none",
        "esc": True,
        "escWord": True,
        "enter": False,
        "empty": False,
        "event": "plugin.thought-we-wouldnt-notice.coin",
    }
    assert "70vh" not in src
    assert "cabinetFrameSize" in src
    assert "CABINET_NATURAL_WIDTH" in src
    assert "size.width + 'px'" in src
    assert "overflow: 'hidden'" in src
    assert "height: 'min(96vh" not in src


def test_cabinet_frame_size_fits_the_window():
    src = (ROOT / "desktop" / "plugin.js").read_text(encoding="utf-8")
    start = src.index("const CABINET_NATURAL_WIDTH")
    end = src.index("function useFitSize")
    program = src[start:end] + """
const tight = cabinetFrameSize({ width: 500, height: 500 })
const wide = cabinetFrameSize({ width: 2000, height: 2000 })
const out = {
  tightW: tight.width,
  tightH: tight.height,
  tightRatio: tight.width / tight.height,
  wideW: wide.width,
  wideH: wide.height,
  naturalRatio: 436 / 814,
}
console.log(JSON.stringify(out))
"""
    result = subprocess.run(
        ["node", "--input-type=module", "-e", program],
        check=True,
        capture_output=True,
        text=True,
    )
    data = json.loads(result.stdout)
    assert data["tightW"] <= 500
    assert data["tightH"] <= 500 - 60
    assert abs(data["tightRatio"] - data["naturalRatio"]) < 0.02
    assert data["wideW"] <= 2000
    assert data["wideH"] <= 2000 - 60
    assert data["wideW"] > 420
    assert abs(data["tightRatio"] - data["naturalRatio"]) < 0.02
