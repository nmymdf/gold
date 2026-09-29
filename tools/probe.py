"""探測台銀黃金存摺替代資料來源（除錯用）"""
import re, urllib.request, http.cookiejar

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36"
def get(url):
    try:
        op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        op.addheaders = [("User-Agent", UA), ("Accept-Language", "zh-TW,zh;q=0.9"), ("Accept", "text/html,application/json,*/*")]
        r = op.open(url, timeout=30)
        return r.status, r.read().decode("utf-8", "replace")
    except Exception as e:
        return "ERR", str(e)
def text(h):
    h = re.sub(r"<(script|style)\b.*?</\1>", " ", h, flags=re.S)
    return re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", h))

urls = [
  "https://rate.bot.com.tw/gold?Lang=zh-TW",
  "https://rate.bot.com.tw/gold/quote/recent",
  "https://rate.bot.com.tw/gold/passbook?Lang=zh-TW",
  "https://rate.bot.com.tw/gold/chart/ltm/TWD",
  "https://rate.bot.com.tw/gold/history?Lang=zh-TW",
  "https://www.goldlegend.com/bankbook/bot",
  "https://www.goldlegend.com/bankbook/bot/twd",
  "https://www.tcb-bank.com.tw/personal-banking/investment/gold/list-price",
  "https://www.tcbbank.com.tw/Gp_List_Price/Gp_List_Current_Price.aspx",
]
for u in urls:
    st, h = get(u)
    t = text(h)
    print(f"=================== {u} -> {st} len={len(h)} title={re.search(r'<title>(.*?)</title>', h, re.S).group(1).strip()[:60] if '<title>' in h else '-'}")
    idx = [m.start() for m in re.finditer(r"公克|掛牌|9月2[89]日|2026/09/2[89]", t)][:4]
    for i in idx:
        print("   ", t[max(0, i - 150):i + 250])
    for m in list(re.finditer(r"(var|let|const)\s+(\w+)\s*=\s*(\[\s*\[.{0,200})", h, re.S))[:3]:
        print("  JSVAR", m.group(2), m.group(3)[:200].replace("\n", " "))
    for m in list(re.finditer(r"""["'](/[^"']*(?:api|json|ajax|Ajax|Handler)[^"']*)["']""", h))[:8]:
        print("  API?", m.group(1)[:150])
    if "bot/twd" in u:
        tail = re.findall(r"\[\s*(\d{13})\s*,\s*([\d.]+)\s*\]", h)
        print("  pairs:", len(tail), tail[-3:] if tail else "")
