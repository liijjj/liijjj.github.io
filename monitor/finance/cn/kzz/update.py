import akshare as ak
import pandas as pd
from datetime import datetime, timezone, timedelta
from html import escape

# 北京时间
CST = timezone(timedelta(hours=8))
now = datetime.now(CST)

today = now.strftime('%Y-%m-%d')
year = now.year

# 获取全部可转债数据
print('正在获取 AkShare 可转债数据...')
df = ak.bond_zh_cov()
print('原始数据：', len(df))
print('全部字段：', list(df.columns))

# 处理申购日期
df['申购日期'] = df['申购日期'].astype(str)
# 只保留今年
df = df[
    df['申购日期'].str.startswith(str(year))
].copy()
# 按申购日期：未来 → 过去
df = df.sort_values(
    '申购日期',
    ascending=False
)
print(f'{year} 年数据：{len(df)} 条')

# 生成表头
headers = ''.join(
    f'<th>{escape(str(col))}</th>'
    for col in df.columns
)
# 生成表格
rows = []

for _, row in df.iterrows():

    date = str(row['申购日期'])

    # 今日及未来
    future = date >= today

    cls = 'future' if future else ''

    cells = []

    for value in row:

        # NaN / None → 空白
        if pd.isna(value):
            value = ''
        else:
            value = str(value)

        cells.append(
            f'<td>{escape(value)}</td>'
        )

    rows.append(
        f'<tr class="{cls}">'
        + ''.join(cells)
        + '</tr>'
    )
# 生成 HTML
html = f'''<!DOCTYPE html>
<html lang="zh-CN">

<head>

<meta charset="UTF-8">

<meta
    name="viewport"
    content="width=device-width,initial-scale=1"
>

<title>{year}年可转债</title>

<style>

* {{
    box-sizing: border-box;
}}

body {{
    margin: 20px;
    font-family:
        Arial,
        "Microsoft YaHei",
        sans-serif;

    background: #f5f5f5;
}}

h2 {{
    margin: 0 0 8px 0;
}}

.info {{
    color: #777;
    margin-bottom: 15px;
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

th,
td {{
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
    background: #fff3cd;
    font-weight: bold;
}}

tr.future td {{
    color: #d35400;
}}

</style>

</head>

<body>

<h2>{year} 年可转债</h2>

<div class="info">
更新时间：{now.strftime('%Y-%m-%d %H:%M:%S')}
　
今日：{today}
　
共 {len(df)} 条
</div>

<div class="table-wrap">

<table>

<thead>

<tr>
{headers}
</tr>

</thead>

<tbody>

{''.join(rows)}

</tbody>

</table>

</div>

</body>

</html>
'''

# 写入 index.html
with open(
    'index.html',
    'w',
    encoding='utf-8'
) as f:

    f.write(html)

print('index.html 已生成')
# 输出数据
print(df.to_string(index=False))
