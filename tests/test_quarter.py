"""Whole-message quarter matching."""

import quarter


POSITIVES = [
    "25c",
    "25C",
    "25cents",
    "25CENTS",
    "25 cent",
    "25 cents",
    "25  cents",
    "$.25",
    "$ .25",
    "$0.25",
    "$ 0.25",
    "0.25",
    "25¢",
    "25 ¢",
    "  25c  ",
    "25c!",
    "25c?",
    "$0.25.",
    '"25 cents"',
    "($0.25)",
    "quarter",
    "Quarter",
    "a quarter",
    "one quarter",
    "insert quarter",
    "insert a quarter",
    "Insert A Quarter.",
    "25 c",
]

NEGATIVES = [
    "",
    "   ",
    "25",
    "$25",
    "$25.00",
    "0.2",
    "0.250",
    "$0.251",
    "10.25",
    "25cm",
    "25 centavos",
    "25 centipedes",
    "that's $0.25 per call",
    "25 cents more RAM",
    "need 0.25 more",
    "please insert 25c",
    "$0.25 please",
    "about 25 cents",
    "a quarter past three",
    "insert a quarter for the meter",
    "the quarter",
    "25c\nthanks",
    "hello",
    "cents",
]


def test_positives_match():
    for sample in POSITIVES:
        assert quarter.is_quarter_message(sample), sample


def test_negatives_do_not_match():
    for sample in NEGATIVES:
        assert not quarter.is_quarter_message(sample), sample


def test_structured_text_part():
    assert quarter.is_quarter_message([{"text": "25c"}])
    assert not quarter.is_quarter_message([{"text": "25c"}, {"image": "nope"}])


def test_notice_line_is_short():
    assert quarter.NOTICE_LINE == "Thought we wouldn't notice. But we did."
    assert len(quarter.NOTICE_LINE) < 80
