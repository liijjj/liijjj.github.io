#!/usr/bin/env python3
"""生成首页与 404 页面。

页面清单保存在 sites.json 里，新增页面只需要加一条记录再 push，
GitHub Actions 会自动跑 `python build.py` 并把结果提交回 main。

本地预览：
    python build.py
    python -m http.server 8000
"""

from __future__ import annotations

import json
import sys
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SITES = ROOT / "sites.json"
REPO_URL = "https://github.com/liijjj/liijjj.github.io"

ACCENTS = {"sky", "amber", "violet", "emerald", "rose"}


def load_sites() -> dict:
    with SITES.open(encoding="utf-8") as f:
        data = json.load(f)
    pages = data.get("pages") or []
    missing = []
    for page in pages:
        index = ROOT / page["path"].strip("/") / "index.html"
        if not index.is_file():
            missing.append(str(index.relative_to(ROOT)))
    if missing:
        raise SystemExit("sites.json 里的页面缺少 index.html：\n  " + "\n  ".join(missing))
    return data


def page_card(page: dict) -> str:
    path = "/" + page["path"].strip("/") + "/"
    accent = page.get("accent") if page.get("accent") in ACCENTS else "sky"
    category = escape(page.get("category", ""))
    title = escape(page["title"])
    desc = escape(page.get("description", ""))

    status = page.get("status")
    if status:
        field = page.get("updatedField", "generatedAt")
        badge = (
            f'<span class="card-status" data-status="{escape(status)}"'
            f' data-field="{escape(field)}">更新状态加载中</span>'
        )
    else:
        badge = ""

    cadence = escape(page.get("cadence", ""))
    foot = f'<span class="cadence">{cadence}</span>' if cadence else "<span></span>"

    return f"""      <li>
        <a class="page-card" href="{escape(path)}">
          <div class="pc-head">
            <span class="chip chip--{accent}">{category}</span>
            {badge}
          </div>
          <div class="pc-body">
            <h2>{title}</h2>
            <p class="card-desc">{desc}</p>
          </div>
          <div class="pc-foot">
            {foot}
            <span class="go">打开 →</span>
          </div>
        </a>
      </li>"""


def shell(title: str, description: str, body: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{escape(title)}</title>
<meta name="description" content="{escape(description)}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f4f6f9" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0b1120" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/assets/site.css">
</head>
<body>
{body}
</body>
</html>
"""


def build_home(site: dict) -> str:
    pages = site.get("pages") or []
    cards = "\n".join(page_card(p) for p in pages)
    title = escape(site.get("title", "Liijjj"))
    description = escape(site.get("description", ""))
    body = f"""<header class="site-header wrap">
  <div>
    <p class="eyebrow">个人看板</p>
    <h1>{title}</h1>
    <p class="lede">{description}</p>
  </div>
  <div class="view-switch" role="group" aria-label="显示方式">
    <button type="button" data-view="list" aria-pressed="true">列表</button>
    <button type="button" data-view="grid" aria-pressed="false">卡片</button>
  </div>
</header>

<main class="wrap">
  <ul class="page-list is-list" id="pages">
{cards}
  </ul>
</main>

<footer class="site-footer wrap">
  <span>共 {len(pages)} 个页面 · 数据由 GitHub Actions 定时更新</span>
  <a href="{REPO_URL}" rel="noopener">源码</a>
</footer>

<script src="/assets/portal.js" defer></script>
"""
    return shell(site.get("title", "Liijjj"), site.get("description", ""), body)


def build_404(site: dict) -> str:
    body = """<main class="wrap notfound">
  <p class="eyebrow">404</p>
  <h1>这里没有页面</h1>
  <p class="lede">地址可能写错了，或者这个页面已经被移动。</p>
  <a class="button" href="/">回到首页</a>
</main>
"""
    return shell("页面不存在 · " + site.get("title", "Liijjj"), "页面不存在", body)


def main() -> int:
    site = load_sites()
    outputs = {
        ROOT / "index.html": build_home(site),
        ROOT / "404.html": build_404(site),
    }
    for path, content in outputs.items():
        path.write_text(content, encoding="utf-8", newline="\n")
        print(f"已生成 {path.relative_to(ROOT).as_posix()}")
    print(f"页面数：{len(site.get('pages') or [])}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
