"""
【需求说明】
1. 抓取 AkShare 可转债最新数据，更新并生成网页 index.html。
2. 检查当天（today）是否有新债申购：
   - 若发现当天有新债申购：仅由本后端脚本触发钉钉机器人通知，及时提醒用户申购。
   - 若当天无新债申购：跳过钉钉推送。
"""

import os
import json
import urllib.request
import akshare as ak
import pandas as pd
from datetime import datetime, timezone, timedelta
from html import escape

# 1. 时区与时间初始化（使用 CST 北京时间）
CST = timezone(timedelta(hours=8))
now = datetime.now(CST)
today = now.strftime('%Y-%m-%d')
year = now.year

print('正在获取 AkShare 可转债数据...')
df = ak.bond_zh_cov()
print('原始数据：', len(df))

df['申购日期'] = df['申购日期'].astype(str)
df = df[df['申购日期'].str.startswith(str(year))].copy()
df = df.sort_values('申购日期', ascending=False)
print(f'{year} 年数据：{len(df)} 条')

# 2. 生成网页首行提醒文字 (notice)
weekdays = ['星期一', '星期二', '星期三', '星期四', '星期五', '星期六', '星期日']
future_df = df[df['申购日期'] >= today].copy()
groups = []

for date, group in future_df.groupby('申购日期', sort=True):
    dt = datetime.strptime(date, '%Y-%m-%d')
    date_text = f'{dt.month}月{dt.day}日{weekdays[dt.weekday()]}'
    names = [str(x) for x in group['债券简称']]
    if len(names) == 1:
        names_text = names[0]
    elif len(names) == 2:
        names_text = '和'.join(names)
    else:
        names_text = '、'.join(names[:-1]) + '和' + names[-1]
    # 注意：此处包含 class="date" 供前端选择器精准匹配
    groups.append(f'<span class="date">{date_text}</span>的{escape(names_text)}')

if groups:
    notice = '，'.join(groups)
    notice = f'更新于{now.strftime("%Y-%m-%d %H:%M:%S")}:{notice}'
else:
    notice = f'更新于{now.strftime("%Y-%m-%d %H:%M:%S")}'

# -------------------------------------------------------------
# 3. 后端钉钉推送逻辑：仅在【申购日当天】发现新债时触发
# -------------------------------------------------------------
today_df = df[df['申购日期'] == today].copy()

if not today_df.empty:
    today_names = [str(x) for x in today_df['债券简称']]
    if len(today_names) == 1:
        today_names_text = today_names[0]
    elif len(today_names) == 2:
        today_names_text = '和'.join(today_names)
    else:
        today_names_text = '、'.join(today_names[:-1]) + '和' + today_names[-1]
    
    print(f"【后端提醒】检测到今日（{today}）有可转债申购：{today_names_text}")
    
    # 从 GitHub Secrets / 环境变量中提取 Webhook 地址
    webhook_url = os.environ.get('DINGTALK_WEBHOOK')
    
    if not webhook_url:
        print("未检测到 DINGTALK_WEBHOOK 环境变量，跳过钉钉推送。")
    else:
        msg = {
            "msgtype": "markdown",
            "markdown": {
                "title": today_names_text,
                "text": f"### 🔔 今日可转债申购提醒\n- **日期**: {today}\n- **申购目标**: **{today_names_text}**"
            }
            # "markdown": {
            #     "title": "可转债申购提醒",
            #     "text": f"### 🔔 今日可转债申购提醒\n- **日期**: {today}\n- **申购目标**: **{today_names_text}**"
            # }
        }
        try:
            req = urllib.request.Request(
                webhook_url,
                data=json.dumps(msg).encode('utf-8'),
                headers={'Content-Type': 'application/json'}
            )
            with urllib.request.urlopen(req) as response:
                print("钉钉推送成功响应:", response.read().decode('utf-8'))
        except Exception as e:
            print("钉钉推送失败:", e)
else:
    print(f"今日（{today}）无新债申购，不触发后端钉钉推送。")

# 4. 生成 index.html 网页文件
headers = ''.join(f'<th>{escape(str(col))}</th>' for col in df.columns)
rows = []
for _, row in df.iterrows():
    date = str(row['申购日期'])
    future = date >= today
    cls = 'future' if future else ''
    cells = []
    for value in row:
        if pd.isna(value):
            value = ''
        else:
            value = str(value)
        cells.append(f'<td>{escape(value)}</td>')
    rows.append(f'<tr class="{cls}">' + ''.join(cells) + '</tr>')

html = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{year}年可转债</title>
<style>
* {{
    box-sizing: border-box;
}}
body {{
    margin: 20px;
    font-family: Arial,"Microsoft YaHei",sans-serif;
    background: #f5f5f5;
}}
h2 {{
    margin: 0 0 8px 0;
}}
.info {{
    color: #777;
    margin-bottom: 15px;
}}
.notice {{
    color: #333;
    margin-bottom: 15px;
    font-size: 16px;
}}
.notice .date {{
    color: red;
    font-weight: bold;
}}
.table-wrap {{
    width: 100%;
    overflow-x: auto;
    background: white;
}}
table {{
    border-collapse: collapse;
    white-space: nowrap;
    min-width: max-content;
}}
th,td {{
    border: 1px solid #ddd;
    padding: 7px 10px;
    text-align: left;
}}
th {{
    background: #eee;
    position: sticky;
    top: 0;
}}
tr.future {{
    color: red;
    font-weight: bold;
}}
</style>
</head>
<body>
<h2>{year} 年可转债</h2>
<div class="notice">{notice}</div>
<div class="table-wrap">
<table>
<thead>
<tr>{headers}</tr>
</thead>
<tbody>
{''.join(rows)}
</tbody>
</table>
</div>
</body>
</html>'''

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)

print('index.html 已成功生成')
