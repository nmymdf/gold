"""探測資料來源（除錯用）：用真瀏覽器開台銀頁面，並檢查 goldlegend 內嵌資料。"""
import re, urllib.request
from playwright.sync_api import sync_playwright

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"

def show(name, text, n=3000):
    print(f"=================== {name} (len={len(text)})")
    print(text[:n])

with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page(user_agent=UA, locale="zh-TW")
    for url in ["https://rate.bot.com.tw/gold?Lang=zh-TW",
                "https://rate.bot.com.tw/gold/chart/day/TWD"]:
        try:
            pg.goto(url, wait_until="networkidle", timeout=60000)
            pg.wait_for_timeout(5000)
            show(url, pg.inner_text("body"))
            for a in pg.query_selector_all("a[href]"):
                h = a.get_attribute("href")
                if h and ("csv" in h.lower() or "gold/" in h):
                    print("  link:", h)
        except Exception as e:
            print(url, "ERR", e)
    b.close()

for url in ["https://www.goldlegend.com/tw/price", "https://www.goldlegend.com/tw/price/history",
            "https://www.goldlegend.com/bankbook"]:
    html = urllib.request.urlopen(urllib.request.Request(url, headers={"User-Agent": UA}), timeout=30).read().decode("utf-8", "replace")
    print(f"=================== {url} (len={len(html)})")
    for m in re.finditer(r"(var|let|const)\s+(\w+)\s*=\s*(\[.{0,400})", html):
        print("  JSVAR", m.group(2), m.group(3)[:400].replace("\n", " "))
    for m in re.finditer(r"<table.*?</table>", html, re.S):
        t = re.sub(r"<[^>]+>", " ", m.group(0)); t = re.sub(r"\s+", " ", t)
        print("  TABLE", t[:1500])
    for kw in ["臺灣銀行", "台灣銀行", "台銀", "公克"]:
        for m in list(re.finditer(kw, html))[:3]:
            s = re.sub(r"<[^>]+>", " ", html[max(0, m.start()-300):m.end()+300]); print("  KW", kw, re.sub(r"\s+", " ", s))
