from pydantic import ValidationError

from main import EstimateIn, LeadIn, estimate

r = estimate(EstimateIn(building="complex", city="tehran", units=10, gas=6_000_000, electricity=4_000_000))
assert r["baseline"] == 10_000_000 and r["savings"] == 2_000_000
assert r["our_share"] == 440_000 and r["net"] == 1_560_000 and r["new_bill"] == 8_440_000
assert r["per_unit"] == 156_000 and r["pct_low"] < r["pct"] < r["pct_high"]
assert LeadIn(name="Ali", phone="+98 912-345 6789", city="rasht", building="villa", units=1).phone == "09123456789"
assert LeadIn(name="Ali", phone="۰۹۱۲۳۴۵۶۷۸۹", city="rasht", building="villa", units=1).phone == "09123456789"
try:
    LeadIn(name="Ali", phone="12345", city="rasht", building="villa", units=1)
    raise AssertionError("bad phone accepted")
except ValidationError:
    pass
print("ok")
