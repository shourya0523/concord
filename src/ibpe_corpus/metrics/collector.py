"""Stable metric counters for corpus jobs."""

from __future__ import annotations

from collections import defaultdict
from typing import Any

METRIC_NAMES = (
    "pages_discovered",
    "pages_fetched",
    "pages_blocked",
    "pages_unchanged",
    "search_pages_exhausted",
    "question_details_reached",
    "responses_reached",
    "exact_questions",
    "topic_signals",
    "core_pe_records",
    "pe_false_positives",
    "source_answers",
    "matched_answers",
    "generated_answers",
    "validated_answers",
    "rejected_answers",
    "canonical_questions",
    "duplicate_rate",
    "parser_failure_rate",
    "zero_result_anomalies",
)


class MetricsCollector:
    def __init__(self) -> None:
        self._values: dict[str, float] = defaultdict(float)
        self._alerts: list[str] = []

    def incr(self, name: str, amount: float | int = 1) -> None:
        self._values[name] += float(amount)

    def set(self, name: str, value: float | int) -> None:
        self._values[name] = float(value)

    def add_from(self, metrics: dict[str, Any] | None) -> None:
        if not metrics:
            return
        for key, value in metrics.items():
            if isinstance(value, (int, float)):
                self.incr(key, value)

    def alert(self, message: str) -> None:
        self._alerts.append(message)

    def snapshot(self) -> dict[str, float | int]:
        out: dict[str, float | int] = {}
        for name in METRIC_NAMES:
            if name in self._values:
                val = self._values[name]
                out[name] = int(val) if val == int(val) else val
        for key, val in sorted(self._values.items()):
            if key not in out:
                out[key] = int(val) if val == int(val) else val
        return out

    @property
    def alerts(self) -> list[str]:
        return list(self._alerts)
