"""Hook and command registration."""

import argparse

import cabinet_state
import quarter


def test_register_hooks_and_commands(plugin, ctx):
    plugin.register(ctx)
    names = [item[0] for item in ctx.hooks]
    assert names == ["pre_llm_call"]
    assert ctx.hooks[0][1] is plugin.on_pre_llm_call
    assert ctx.commands[0]["name"] == "quarter"
    assert ctx.cli[0]["name"] == "thought-we-wouldnt-notice"
    assert ctx.cli[0]["setup_fn"] is not None
    assert ctx.cli[0]["handler_fn"] is plugin._run_cli


def test_quarter_blocks_and_records(plugin, cabinet_home):
    blocked = plugin.on_pre_llm_call(user_message="  $0.25  ", session_id="sess-1")
    assert blocked == {"action": "block", "message": quarter.NOTICE_LINE}
    view = cabinet_state.list_drops(data_dir=cabinet_home)
    assert view["total"] == 1
    assert view["drops"][0]["session_id"] == "sess-1"
    assert view["drops"][0]["source"] == "message"


def test_mid_sentence_does_not_block_or_record(plugin, cabinet_home):
    result = plugin.on_pre_llm_call(
        user_message="that's $0.25 per call",
        session_id="sess-2",
    )
    assert result is None
    assert cabinet_state.status(data_dir=cabinet_home)["quarters"] == 0


def test_more_ram_does_not_block(plugin):
    assert plugin.on_pre_llm_call(user_message="25 cents more RAM") is None


def test_slash_command_records_without_model(plugin, cabinet_home):
    line = plugin.on_quarter_command("now", session_id="sess-3")
    assert line == quarter.NOTICE_LINE
    view = cabinet_state.list_drops(data_dir=cabinet_home)
    assert view["drops"][0]["source"] == "command"


def test_cli_status_prints(plugin, ctx, capsys):
    plugin.register(ctx)
    parser = argparse.ArgumentParser()
    sub = parser.add_subparsers(dest="top")
    command = sub.add_parser("thought-we-wouldnt-notice")
    ctx.cli[0]["setup_fn"](command)
    args = parser.parse_args(["thought-we-wouldnt-notice", "status"])
    args.func(args)
    out = capsys.readouterr().out
    assert "High score: 0" in out
    assert "25c" in out

    bare = parser.parse_args(["thought-we-wouldnt-notice"])
    bare.func(bare)
    usage = capsys.readouterr().out
    assert "Usage:" in usage
