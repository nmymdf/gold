"""探測資料來源（除錯用）"""
import re, urllib.request, http.cookiejar
from playwright.sync_api import sync_playwright

UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
URL = "https://rate.bot.com.tw/gold?Lang=zh-TW"

print("===== raw challenge html")
cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
op.addheaders = [("User-Agent", UA), ("Accept-Language", "zh-TW,zh;q=0.9")]
print(op.open(URL, timeout=30).read().decode("utf-8", "replace"))

with sync_playwright() as p:
    b = p.chromium.launch(args=["--disable-blink-features=AutomationControlled"])
    ctx = b.new_context(user_agent=UA, locale="zh-TW", timezone_id="Asia/Taipei")
    pg = ctx.new_page()
    pg.on("response", lambda r: print("  RESP", r.status, r.url[:120]))
    pg.goto(URL, timeout=60000)
    for i in range(8):
        pg.wait_for_timeout(5000)
        html = pg.content()
        print(f"--- t={5*(i+1)}s url={pg.url} title={pg.title()!r} len={len(html)}")
        if "公克" in html:
            t = re.sub(r"\s+", " ", pg.inner_text("body"))
            print(t[:3000]); break
    else:
        print(html[:3000])
    b.close()

UA2 = UA
html = urllib.request.urlopen(urllib.request.Request("https://www.goldlegend.com/bankbook", headers={"User-Agent": UA}), timeout=30).read().decode()
i = html.find("台灣銀行")
for m in re.finditer(r"<h[1-4][^>]*>(.*?)</h[1-4]>", html, re.S):
    print("  H", re.sub(r"<[^>]+>|\s+", " ", m.group(1))[:80])
m = re.search(r"<table.*?</table>", html, re.S)
print(m.group(0)[:2500])
