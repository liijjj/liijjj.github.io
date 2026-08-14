import akshare as ak
from datetime import datetime, timezone, timedelta

# ============================================================
# 北京时间
# ============================================================

CST = timezone(timedelta(hours=8))
now = datetime.now(CST)
today = now.strftime('%Y-%m-%d')
year = now.year

# ============================================================
# 获取可转债数据
# ============================================================

print('正在获取 AkShare 可转债数据...')

df = ak.bond_zh_cov()

print(f'原始数据：{len(df)} 条')

# ============================================================
# 只保留今年的数据
# ============================================================

df['申购日期'] = df['申购日期'].astype(str)

df = df[
    df['申购日期'].str.startswith(str(year))
].copy()

# ============================================================
# 只保留需要显示的字段
# ============================================================

df = df[
    ['债券简称', '申购日期', '申购代码']
].copy()

# ============================================================
# 按申购日期排序
# ============================================================

df = df.sort_values(
    '申购日期',
    ascending=True
)

print(f'{year} 年可转债：{len(df)} 条')


# ============================================================
# 生成 HTML
# ============================================================

rows = []

for _, row in df.iterrows():

    name = str(row['债券简称'])
    date = str(row['申购日期'])
    code = str(row['申购代码'])

    # --------------------------------------------------------
    # 今日及未来 → 高亮
    # --------------------------------------------------------

    future = date >= today

    cls = 'future' if future else ''

    rows.append(f'''
<tr class="{cls}">
    <td>{name}</td>
    <td>{date}</td>
    <td>{code}</td>
</tr>
''')


html = f'''<!DOCTYPE html>
<html lang="zh-CN">

<head>

<meta charset="UTF-8">

<meta
    name="viewport"
    content="width=device-width,initial-scale=1"
>

<title>{year}年可转债申购</title>

<style>

body {{
    margin: 20px;
    font-family:
        Arial,
        "Microsoft YaHei",
        sans-serif;

    background: #f5f5f5;
}}

h2 {{
    margin-bottom: 5px;
}}

.info {{
    color: #777;
    margin-bottom: 15px;
}}

table {{
    border-collapse: collapse;
    width: 100%;
    max-width: 900px;
    background: white;
}}

th,
td {{
    border: 1px solid #ddd;
    padding: 9px 12px;
    text-align: left;
}}

th {{
    background: #eee;
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

<h2>{year} 年可转债申购</h2>

<div class="info">
更新时间：{now.strftime('%Y-%m-%d %H:%M:%S')}
　
今日：{today}
</div>

<table>

<thead>
<tr>
    <th>债券简称</th>
    <th>申购日期</th>
    <th>申购代码</th>
</tr>
</thead>

<tbody>

{''.join(rows)}

</tbody>

</table>

</body>

</html>
'''


# ============================================================
# 写入 index.html
# ============================================================

with open('index.html', 'w', encoding='utf-8') as f:
    f.write(html)

print('index.html 已生成')

# ============================================================
# 输出结果
# ============================================================

print()
print(df.to_string(index=False))
