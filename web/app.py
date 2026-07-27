"""Local web UI for browsing the interview question bank."""

from __future__ import annotations

from pathlib import Path

from flask import Flask, jsonify, render_template, request

from scrapers.bank import DEFAULT_BANK_PATH, load_bank, query_bank

ROOT = Path(__file__).resolve().parent
app = Flask(
    __name__,
    template_folder=str(ROOT / "templates"),
    static_folder=str(ROOT / "static"),
)


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/questions")
def api_questions():
    bank = load_bank(DEFAULT_BANK_PATH)
    results = query_bank(
        bank,
        track=request.args.get("track") or None,
        company=request.args.get("company") or None,
        position=request.args.get("position") or None,
    )
    q = (request.args.get("q") or "").strip().lower()
    if q:
        results = [
            item
            for item in results
            if q in (item.get("question") or "").lower()
            or q in (item.get("experience") or "").lower()
            or q in (item.get("process") or "").lower()
        ]

    companies = sorted(
        {item.get("company") for item in bank.get("questions", []) if item.get("company")}
    )
    positions = sorted(
        {
            item.get("position")
            for item in bank.get("questions", [])
            if item.get("position")
        }
    )
    tracks = sorted(
        {item.get("track") for item in bank.get("questions", []) if item.get("track")}
    )

    return jsonify(
        {
            "count": len(results),
            "total": len(bank.get("questions", [])),
            "updated_at": bank.get("updated_at"),
            "filters": {
                "tracks": tracks,
                "companies": companies,
                "positions": positions,
            },
            "questions": results,
        }
    )


def run(host: str = "127.0.0.1", port: int = 5050, debug: bool = False) -> None:
    print(f"Interview bank UI: http://{host}:{port}")
    app.run(host=host, port=port, debug=debug)


if __name__ == "__main__":
    run(debug=True)
