#!/usr/bin/env python3
"""生成首页与 404 页面。

首页只是一份极简的链接列表，清单在 sites.json 里。
新增页面只需要加一条记录再 push，GitHub Actions 会自动跑 `python build.py`
并把结果提交回 main。

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


def link_item(page: dict) -> str:
    path = "/" + page["path"].strip("/") + "/"
    meta = page.get("meta")
    meta_html = f'<span class="page-meta" id="{escape(meta)}-meta" hidden></span>' if meta else ""
    return (
        f'        <li class="page-row">'
        f'<a class="page-name" href="{escape(path)}">{escape(page["title"])}</a>'
        f"{meta_html}"
        f"</li>"
    )


def shell(title: str, description: str, body: str) -> str:
    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{escape(title)}</title>
<meta name="description" content="{escape(description)}">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#f6f8fa" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0d1117" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/assets/icon.jpg" type="image/jpeg">
<link rel="apple-touch-icon" href="/assets/icon.jpg">
<link rel="stylesheet" href="/assets/site.css?v=4">
</head>
<body>
{body}
</body>
</html>
"""


def build_home(site: dict) -> str:
    pages = site.get("pages") or []
    links = "\n".join(link_item(p) for p in pages)
    title = site.get("title", "Liijjj")
    tab_title = site.get("tabTitle") or title
    body = f"""<main class="wrap home">
  <h1>{escape(title)}</h1>
  <ol class="links">
{links}
  </ol>
</main>

<script src="/assets/home.js" defer></script>
"""
    return shell(tab_title, site.get("description", ""), body)


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
