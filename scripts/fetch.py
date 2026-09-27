#!/usr/bin/env python3
"""抓取黃金牌價並更新 data/*.csv。

- 黃金存摺（臺灣銀行，每公克）：取當日「開盤／中午／收盤」三個時點的牌價
- 銀樓牌價（每錢）：每日一筆

臺灣銀行官網（rate.bot.com.tw）有反機器人驗證，雲端主機無法直接存取，
因此改由 goldlegend.com 轉載的牌價頁取得（含每次變價的掛牌時間）。

用法：
    python3 scripts/fetch.py              # 一般更新
    python3 scripts/fetch.py --backfill   # 另外補抓銀樓歷史資料
"""
from __future__ import annotations

import csv
import datetime as dt
import html
import json
import re
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
BOT_CSV = DATA / "bot.csv"
SHOP_CSV = DATA / "shop.csv"

BOT_URL = "https://www.goldlegend.com/bankbook/bot"
SHOP_URL = "https://www.goldlegend.com/tw/price"
SHOP_HISTORY_URL = "https://www.goldlegend.com/tw/price/history"

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
TW = dt.timezone(dt.timedelta(hours=8))

# 時段名稱 → 取「該時間（含）以前最後一筆」掛牌價；開盤取當日第一筆
SLOTS = [("開盤", None), ("中午", dt.time(12, 0)), ("收盤", dt.time(15, 30))]

BOT_FIELDS = ["date", "slot", "time", "sell", "buy"]
SHOP_FIELDS = ["date", "time", "sell", "buy", "bar_recycle", "jewelry_recycle"]

# 合理價格範圍（防止網頁改版時寫入錯誤資料）
GRAM_RANGE = (500, 50000)
QIAN_RANGE = (2000, 200000)


def now_tw() -> dt.datetime:
    return dt.datetime.now(TW)


def get(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "zh-TW,zh;q=0.9"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read().decode("utf-8", "replace")


def cell_text(s: str) -> str:
    s = re.sub(r"<(script|style)\b.*?</\1>", " ", s, flags=re.S | re.I)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", s))).strip()


def table_rows(page: str, index: int = 0) -> list[list[str]]:
    tables = re.findall(r"<table\b.*?</table>", page, flags=re.S | re.I)
    if len(tables) <= index:
        raise ValueError(f"找不到第 {index + 1} 個表格")
    rows = []
    for tr in re.findall(r"<tr\b.*?</tr>", tables[index], flags=re.S | re.I):
        cells = [cell_text(c) for c in re.findall(r"<t[dh]\b.*?</t[dh]>", tr, flags=re.S | re.I)]
        if cells:
            rows.append(cells)
    return rows


def num(s: str) -> float:
    return float(s.replace(",", "").strip())


def infer_date(month: int, day: int, today: dt.date) -> dt.date:
    """網頁只給月/日，依今天推回年份（跨年時 12 月資料屬於去年）。"""
    year = today.year - (1 if month > today.month else 0)
    return dt.date(year, month, day)


def check(value: float, rng: tuple[int, int], what: str) -> float:
    if not rng[0] <= value <= rng[1]:
        raise ValueError(f"{what} 價格 {value} 超出合理範圍 {rng}")
    return value


# ---------------------------------------------------------------- 黃金存摺

def parse_bot(page: str, today: dt.date) -> list[tuple[dt.datetime, float, float]]:
    """回傳 [(掛牌時間, 賣出, 買進)]，時間由舊到新。表格欄位：日期 | 買進 | 賣出。"""
    quotes = []
    for cells in table_rows(page, 0):
        if len(cells) < 3:
            continue
        m = re.match(r"(\d{1,2})月(\d{1,2})日\s*(\d{1,2}):(\d{2})", cells[0])
        if not m:
            continue
        mo, d, hh, mm = map(int, m.groups())
        when = dt.datetime.combine(infer_date(mo, d, today), dt.time(hh, mm), TW)
        buy = check(num(cells[1]), GRAM_RANGE, "台銀買進")
        sell = check(num(cells[2]), GRAM_RANGE, "台銀賣出")
        if sell < buy:
            raise ValueError(f"台銀賣出 {sell} 低於買進 {buy}，欄位可能變動")
        quotes.append((when, sell, buy))
    if not quotes:
        raise ValueError("台銀牌價表格沒有資料")
    return sorted(quotes)


def pick_slots(quotes, now: dt.datetime) -> list[dict]:
    """從一天的所有變價紀錄挑出開盤／中午／收盤。時間還沒到的時段不寫入。"""
    rows = []
    by_date: dict[dt.date, list] = {}
    for q in quotes:
        by_date.setdefault(q[0].date(), []).append(q)
    for day, qs in by_date.items():
        for slot, cutoff in SLOTS:
            if cutoff is None:
                chosen = qs[0]
            else:
                if dt.datetime.combine(day, cutoff, TW) > now:
                    continue
                before = [q for q in qs if q[0].time() <= cutoff]
                if not before:
                    continue
                chosen = before[-1]
            when, sell, buy = chosen
            rows.append({"date": day.isoformat(), "slot": slot, "time": when.strftime("%H:%M"),
                         "sell": f"{sell:g}", "buy": f"{buy:g}"})
    return rows


# ---------------------------------------------------------------- 銀樓

def parse_shop(page: str, today: dt.date) -> list[dict]:
    """表格欄位：日期 | 賣出 | 買進 | 漲跌 | 條塊回收 | 飾金回收（每錢）。"""
    rows = []
    for cells in table_rows(page, 0):
        if len(cells) < 6:
            continue
        m = re.search(r"(\d{1,2})/(\d{1,2})", cells[0])
        if not m:
            continue
        day = infer_date(int(m.group(1)), int(m.group(2)), today)
        sell = check(num(cells[1]), QIAN_RANGE, "銀樓賣出")
        buy = check(num(cells[2]), QIAN_RANGE, "銀樓買進")
        if sell < buy:
            raise ValueError(f"銀樓賣出 {sell} 低於買進 {buy}，欄位可能變動")
        rows.append({"date": day.isoformat(), "time": "10:00", "sell": f"{sell:g}", "buy": f"{buy:g}",
                     "bar_recycle": f"{num(cells[4]):g}", "jewelry_recycle": f"{num(cells[5]):g}"})
    if not rows:
        raise ValueError("銀樓牌價表格沒有資料")
    return rows


def parse_shop_history(page: str) -> list[dict]:
    """歷史頁的圖表資料：var buy = [[毫秒, 價格], ...]; var sell = [...]"""
    series = {}
    for name in ("buy", "sell"):
        m = re.search(rf"\b{name}\s*=\s*(\[\s*\[.*?\]\s*\])\s*;", page, flags=re.S)
        if not m:
            raise ValueError(f"歷史頁找不到 {name} 資料")
        series[name] = {int(t): v for t, v in json.loads(m.group(1))}
    rows = []
    for t in sorted(series["sell"].keys() & series["buy"].keys()):
        day = dt.datetime.fromtimestamp(t / 1000, TW).date()
        sell, buy = float(series["sell"][t]), float(series["buy"][t])
        if QIAN_RANGE[0] <= buy <= sell <= QIAN_RANGE[1]:
            rows.append({"date": day.isoformat(), "time": "10:00", "sell": f"{sell:g}", "buy": f"{buy:g}",
                         "bar_recycle": "", "jewelry_recycle": ""})
    return rows


# ---------------------------------------------------------------- CSV

def load(path: Path) -> list[dict]:
    if not path.exists():
        return []
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def save(path: Path, fields: list[str], rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fields, lineterminator="\n", extrasaction="ignore")
        w.writeheader()
        w.writerows(rows)


def upsert(path: Path, fields: list[str], key, new_rows: list[dict], sort_key, keep_existing=False) -> int:
    """合併新資料；回傳新增或變動的筆數。keep_existing=True 時不覆蓋已存在的資料。"""
    rows = {key(r): r for r in load(path)}
    changed = 0
    for r in new_rows:
        k = key(r)
        old = rows.get(k)
        if old is not None and keep_existing:
            continue
        if old is None or any(str(old.get(f, "")) != str(r.get(f, "")) for f in fields if r.get(f, "") != ""):
            merged = {**(old or {}), **{f: v for f, v in r.items() if v != ""}}
            rows[k] = merged
            changed += 1
    save(path, fields, sorted(rows.values(), key=sort_key))
    return changed


SLOT_ORDER = {name: i for i, (name, _) in enumerate(SLOTS)}


def main() -> int:
    backfill = "--backfill" in sys.argv
    now = now_tw()
    errors = []

    try:
        quotes = parse_bot(get(BOT_URL), now.date())
        rows = pick_slots(quotes, now)
        n = upsert(BOT_CSV, BOT_FIELDS, lambda r: (r["date"], r["slot"]), rows,
                   lambda r: (r["date"], SLOT_ORDER.get(r["slot"], 9)))
        print(f"台銀：取得 {len(quotes)} 筆變價，寫入時段 {[(r['date'], r['slot'], r['time'], r['sell']) for r in rows]}，變動 {n} 筆")
    except Exception as e:  # noqa: BLE001
        errors.append(f"台銀：{e}")

    try:
        rows = parse_shop(get(SHOP_URL), now.date())
        n = upsert(SHOP_CSV, SHOP_FIELDS, lambda r: r["date"], rows, lambda r: r["date"])
        print(f"銀樓：取得 {len(rows)} 天，最新 {rows[0]['date']} 賣出 {rows[0]['sell']} 買進 {rows[0]['buy']}，變動 {n} 筆")
    except Exception as e:  # noqa: BLE001
        errors.append(f"銀樓：{e}")

    if backfill:
        try:
            rows = parse_shop_history(get(SHOP_HISTORY_URL))
            n = upsert(SHOP_CSV, SHOP_FIELDS, lambda r: r["date"], rows, lambda r: r["date"], keep_existing=True)
            print(f"銀樓歷史：取得 {len(rows)} 天（{rows[0]['date'] if rows else '-'} 起），新增 {n} 筆")
        except Exception as e:  # noqa: BLE001
            errors.append(f"銀樓歷史：{e}")

    for e in errors:
        print("錯誤", e, file=sys.stderr)
    return 1 if errors else 0


if __name__ == "__main__":
    sys.exit(main())
