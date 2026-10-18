import os
import re
import sqlite3
from contextlib import asynccontextmanager, closing
from datetime import datetime, timezone
from typing import Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator

from security import SecurityGuard

# Base savings rate per building type and climate multiplier per city (from the Iran business plan: 15–25% avg).
BUILDINGS = {"complex": 0.20, "office": 0.18, "tower": 0.22, "villa": 0.25}
CITIES = {"tehran": 1.0, "karaj": 1.0, "mashhad": 1.08, "isfahan": 1.03, "tabriz": 1.12, "rasht": 0.97, "ahvaz": 1.1}
MEASURES = {
    "complex": ["boiler_room", "smart_thermostat", "pipe_insulation", "led"],
    "tower": ["boiler_room", "smart_thermostat", "pipe_insulation", "led"],
    "villa": ["insulation", "windows", "smart_thermostat", "led"],
    "office": ["hvac_control", "led", "window_film", "smart_meter"],
}
SHARE = 0.22  # our cut of verified savings
DB = os.path.join(os.getenv("DATA_DIR", os.path.dirname(__file__)), "leads.db")
MAX_DB_BYTES = 64 * 1024 * 1024
FA_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")

Building = Literal["complex", "office", "tower", "villa"]
City = Literal["tehran", "karaj", "mashhad", "isfahan", "tabriz", "rasht", "ahvaz"]

@asynccontextmanager
async def lifespan(app):
    init_db()
    yield


app = FastAPI(title="Khaneh Behineh API", lifespan=lifespan)
app.add_middleware(SecurityGuard)


@app.exception_handler(RequestValidationError)
async def validation_error(request: Request, exc: RequestValidationError):
    # Do not reflect names/phone numbers or validator internals into responses.
    errors = [{"loc": e["loc"], "msg": e["msg"], "type": e["type"]} for e in exc.errors()]
    return JSONResponse(status_code=422, content={"detail": errors})


class EstimateIn(BaseModel):
    model_config = ConfigDict(extra="forbid")
    building: Building
    city: City
    units: int = Field(ge=1, le=1000, strict=True)
    gas: int = Field(ge=0, le=10_000_000_000, strict=True)  # monthly toman
    electricity: int = Field(ge=0, le=10_000_000_000, strict=True)


class LeadIn(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)
    name: str = Field(min_length=2, max_length=60)
    phone: str = Field(min_length=10, max_length=64)
    city: City
    building: Building
    units: int = Field(ge=1, le=1000, strict=True)

    @field_validator("name")
    @classmethod
    def clean_name(cls, v: str) -> str:
        if any(ord(c) < 32 or 127 <= ord(c) <= 159 for c in v):
            raise ValueError("invalid_name")
        return v

    @field_validator("phone")
    @classmethod
    def iran_mobile(cls, v: str) -> str:
        v = re.sub(r"[\s-]", "", v.translate(FA_DIGITS))
        v = re.sub(r"^(\+98|0098|98)", "0", v)
        if not re.fullmatch(r"09[0-9]{9}", v):
            raise ValueError("invalid_phone")
        return v


def estimate(e: EstimateIn) -> dict:
    baseline = e.gas + e.electricity
    pct = min(BUILDINGS[e.building] * CITIES[e.city], 0.35)
    low, high = round(pct * 0.75, 3), round(min(pct * 1.25, 0.4), 3)
    savings = baseline * pct
    ours = savings * SHARE
    net = savings - ours
    return {
        "baseline": baseline,
        "pct": round(pct, 3),
        "pct_low": low,
        "pct_high": high,
        "savings": round(savings),
        "guaranteed": round(baseline * low * (1 - SHARE)),
        "our_share": round(ours),
        "net": round(net),
        "new_bill": round(baseline - net),
        "yearly": round(net * 12),
        "per_unit": round(net / e.units),
        "share": SHARE,
        "measures": MEASURES[e.building],
    }


def init_db():
    os.makedirs(os.path.dirname(os.path.abspath(DB)), mode=0o700, exist_ok=True)
    # Create private files from the start; sqlite WAL sidecars inherit DB mode.
    fd = os.open(DB, os.O_CREAT | os.O_RDWR, 0o600)
    os.close(fd)
    os.chmod(DB, 0o600)
    with closing(sqlite3.connect(DB, timeout=2)) as con:
        con.execute("PRAGMA journal_mode=WAL")
        con.execute(
            "CREATE TABLE IF NOT EXISTS leads (id INTEGER PRIMARY KEY, name TEXT, phone TEXT, city TEXT,"
            " building TEXT, units INTEGER, created TEXT, request_key TEXT)"
        )
        if "request_key" not in {row[1] for row in con.execute("PRAGMA table_info(leads)")}:
            con.execute("ALTER TABLE leads ADD COLUMN request_key TEXT")
        con.execute("CREATE UNIQUE INDEX IF NOT EXISTS lead_request_key ON leads(request_key)")
        limit_storage(con)
        con.commit()


def limit_storage(con):
    page_size = con.execute("PRAGMA page_size").fetchone()[0]
    current = con.execute("PRAGMA page_count").fetchone()[0]
    # Never shrink an existing database; refuse further growth past this cap.
    con.execute(f"PRAGMA max_page_count={max(current, MAX_DB_BYTES // page_size)}")


@app.get("/api/health")
def health():
    return {"ok": True}


@app.post("/api/estimate")
def post_estimate(e: EstimateIn):
    return estimate(e)


@app.post("/api/leads", status_code=201)
def post_lead(lead: LeadIn, request: Request):
    request_key = request.headers.get("idempotency-key")
    if request_key is not None and not re.fullmatch(r"[A-Za-z0-9_-]{16,64}", request_key):
        raise HTTPException(status_code=400, detail="invalid_request_key")
    values = (lead.name, lead.phone, lead.city, lead.building, lead.units)
    try:
        with closing(sqlite3.connect(DB, timeout=2)) as con, con:
            limit_storage(con)
            cur = con.execute(
                "INSERT OR IGNORE INTO leads (name, phone, city, building, units, created, request_key) VALUES (?,?,?,?,?,?,?)",
                (*values, datetime.now(timezone.utc).isoformat(), request_key),
            )
            lead_id = cur.lastrowid
            if request_key is not None:
                row = con.execute("SELECT id, name, phone, city, building, units FROM leads WHERE request_key=?", (request_key,)).fetchone()
                if tuple(row[1:]) != values:
                    raise HTTPException(status_code=409, detail="request_key_conflict")
                lead_id = row[0]
    except sqlite3.Error:
        raise HTTPException(status_code=503, detail="storage_unavailable", headers={"Retry-After": "5"}) from None
    return {"id": lead_id, "ticket": f"KB-{lead_id:05d}"}


@app.get("/api/dashboard")
def dashboard():
    # ponytail: static demo customer; swap for per-user data once auth exists
    months = [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5, 6]  # Mehr 1404 → Shahrivar 1405
    base = [38, 52, 68, 74, 70, 55, 40, 34, 36, 42, 46, 44]  # million toman
    rate = [0.06, 0.14, 0.21, 0.23, 0.24, 0.22, 0.20, 0.21, 0.22, 0.23, 0.22, 0.23]
    series = [{"month": m, "baseline": b, "actual": round(b * (1 - r), 1)} for m, b, r in zip(months, base, rate)]
    last = series[-1]
    saved = last["baseline"] - last["actual"]
    total = sum(s["baseline"] - s["actual"] for s in series)
    return {
        "customer": {"name": "aseman", "units": 48, "city": "tehran"},
        "series": series,
        "bill": {
            "month": last["month"],
            "baseline": last["baseline"],
            "energy": last["actual"],
            "our_share": round(saved * SHARE, 1),
            "total": round(last["actual"] + saved * SHARE, 1),
            "saved": round(saved * (1 - SHARE), 1),
        },
        "guarantee": {"min": 0.15, "achieved": round(sum(rate[2:]) / len(rate[2:]), 3)},
        "total_saved": round(total * (1 - SHARE), 1),
        "measures": [
            {"key": "boiler_room", "status": "done", "pct": 9},
            {"key": "smart_thermostat", "status": "done", "pct": 6},
            {"key": "pipe_insulation", "status": "done", "pct": 4},
            {"key": "led", "status": "in_progress", "pct": 2},
            {"key": "solar_water", "status": "planned", "pct": 3},
        ],
    }
