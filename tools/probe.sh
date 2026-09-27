#!/usr/bin/env bash
# 探測資料來源頁面結構（除錯用）
UA="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
urls=(
  "https://rate.bot.com.tw/gold?Lang=zh-TW"
  "https://rate.bot.com.tw/gold/chart/year/TWD"
  "https://rate.bot.com.tw/gold/csv/0"
  "https://www.goldlegend.com/tw/price"
  "https://tw9999.tw/"
  "https://jf520web.com/gold9999/"
  "https://www.tbja.org.tw/"
  "http://www.tbja.org.tw/"
)
for u in "${urls[@]}"; do
  echo "=================== $u"
  curl -sSL -m 30 -A "$UA" -D - -o body "$u" | head -15
  echo "--- size: $(wc -c < body)"
  # 把 HTML 標籤去掉，只印含關鍵字的行
  sed -e 's/<[^>]*>/ /g' body | tr -s ' \t' ' ' | grep -E '公克|買進|賣出|掛牌|牌價|錢|時間|[0-9]{4}/[0-9]{2}' | head -60
  echo "--- links:"
  grep -oE 'href="[^"]*(csv|download|gold)[^"]*"' body | sort -u | head -30
done
