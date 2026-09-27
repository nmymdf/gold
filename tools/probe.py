"""探測資料來源（除錯用）"""
import re, urllib.request

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

def get(url):
    try:
        r = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "zh-TW"}), timeout=30)
        return r.status, r.geturl(), r.read().decode("utf-8", "replace")
    except Exception as e:
        return "ERR", url, str(e)

def text(html):
    html = re.sub(r"<(script|style)\b.*?</\1>", " ", html, flags=re.S)
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", html))

for url in ["https://www.goldlegend.com/bankbook/bot", "https://www.goldlegend.com/bankbook/mega",
            "https://www.goldlegend.com/bankbook/first", "https://www.goldlegend.com/bankbook/esun"]:
    st, u, h = get(url)
    print(f"=================== {url} {st} len={len(h)}")
    for m in re.finditer(r"<table.*?</table>", h, re.S):
        print("  TABLE", text(m.group(0))[:1500])
    for m in re.finditer(r"(var|let|const)\s+(\w+)\s*=\s*([\[{].{0,300})", h):
        print("  JSVAR", m.group(2), m.group(3)[:300].replace("\n", " "))
    for m in re.finditer(r"(api|ajax|json)[^\"' ]{0,120}", h):
        print("  API?", m.group(0)[:140])

cands = [
  "https://www.megabank.com.tw/personal/wealth/gold",
  "https://www.megabank.com.tw/personal/deposit/gold",
  "https://wwwfile.megabank.com.tw/rates/D001/_@V_.asp",
  "https://www.firstbank.com.tw/sites/fcb/GoldPrice",
  "https://ibank.firstbank.com.tw/NetBank/7/0201.html?sh=none",
  "https://www.esunbank.com/zh-tw/personal/deposit/rate/gold",
  "https://www.landbank.com.tw/Category/Items/%E9%BB%83%E9%87%91%E5%AD%98%E6%91%BA%E7%89%8C%E5%83%B9",
  "https://www.tcb-bank.com.tw/personal-banking/deposit-exchange/exchange-rate/gold",
  "https://www.bankchb.com/frontend/G0100_query.jsp",
  "https://www.sinopac.com/bank/personal/mma/goldbook.html",
]
for url in cands:
    st, u, h = get(url)
    t = text(h)
    hits = [m.start() for m in re.finditer("公克", t)][:3]
    print(f"=================== {url} -> {st} {u} len={len(h)}")
    for i in hits:
        print("   ", t[max(0, i-200):i+200])
    if not hits:
        print("   ", t[:300])
