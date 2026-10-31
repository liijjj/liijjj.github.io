#!/usr/bin/env python3
"""抓取阮一峰博客的全部文章标题和链接，生成 posts.json。

站点只提供「最近 20 篇」，但每月存档页（/blog/YYYY/MM/）包含当月全部文章，
脚本按月抓取并存成索引。默认只刷新最近两个月，首次运行或 --full 时抓全部。
"""

from __future__ import annotations

import argparse
import html
import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

import requests
import xml.etree.ElementTree as ET

BASE = "https://www.ruanyifeng.com/blog"
SOURCE = "https://www.ruanyifeng.com/blog/archives.html"
RECENT_URL = SOURCE
ATOM_URL = "https://www.ruanyifeng.com/blog/atom.xml"
ATOM_NS = {"atom": "http://www.w3.org/2005/Atom"}
UA = "liijjj-blog-index/1.0 (+https://github.com/liijjj/liijjj.github.io)"
FIRST_YEAR, FIRST_MONTH = 2003, 12
CST = timezone(timedelta(hours=8))
TIMEOUT = 30
RETRIES = 4
WORKERS = 1
# 站点前面有 Cloudflare，并发请求会返回 429，只能放慢速度逐个抓
REQUEST_DELAY = 0.8

ITEM_RE = re.compile(
    r'<li class="module-list-item">(\d{4})\.(\d{2})\.(\d{2})：\s*'
    r'<a href="([^"]+)">([\s\S]*?)</a>'
)
TAG_RE = re.compile(r"<[^>]+>")


def month_range(start: tuple[int, int], end: tuple[int, int]) -> list[tuple[int, int]]:
    year, month = start
    result = []
    while (year, month) <= end:
        result.append((year, month))
        month += 1
        if month > 12:
            month = 1
            year += 1
    return result


def fetch_month(year: int, month: int) -> list[dict]:
    url = f"{BASE}/{year}/{month:02d}/"
    last_error: Exception | None = None
    for attempt in range(1, RETRIES + 1):
        try:
            response = requests.get(url, headers={"User-Agent": UA}, timeout=TIMEOUT)
            if response.status_code == 404:
                print(f"[404] {year}-{month:02d}", flush=True)
                time.sleep(REQUEST_DELAY)
                return []
            if response.status_code == 429:
                wait = int(response.headers.get("Retry-After", "60"))
                print(f"[429] {year}-{month:02d}，等待 {wait}s", flush=True)
                time.sleep(max(wait, 30))
                raise ValueError("429 Too Many Requests")
            response.raise_for_status()
            # 站点是 UTF-8，响应头不一定带 charset，显式指定避免中文乱码
            response.encoding = "utf-8"
            html_text = response.text
            if "module-list" not in html_text:
                raise ValueError("页面不完整（没有文章列表）")
            posts = []
            for match in ITEM_RE.finditer(html_text):
                y, m, d, href, raw_title = match.groups()
                title = html.unescape(TAG_RE.sub("", raw_title)).strip()
                if not title:
                    continue
                if href.startswith("/"):
                    href = "https://www.ruanyifeng.com" + href
                posts.append({"date": f"{y}-{m}-{d}", "title": title, "url": href})
            print(f"[ok] {year}-{month:02d}: {len(posts)}", flush=True)
            time.sleep(REQUEST_DELAY)
            return posts
        except Exception as exc:  # noqa: BLE001
            last_error = exc
            time.sleep(attempt * 3)
    raise RuntimeError(f"{year}-{month:02d}: {last_error}")


def fetch_recent() -> list[dict]:
    """归档首页的最近 20 篇；月度存档有时比新文章晚生成，用它补最新。"""
    try:
        response = requests.get(RECENT_URL, headers={"User-Agent": UA}, timeout=TIMEOUT)
        response.raise_for_status()
        response.encoding = "utf-8"
        html_text = response.text
        posts = []
        for match in ITEM_RE.finditer(html_text):
            y, m, d, href, raw_title = match.groups()
            title = html.unescape(TAG_RE.sub("", raw_title)).strip()
            if not title:
                continue
            if href.startswith("/"):
                href = "https://www.ruanyifeng.com" + href
            posts.append({"date": f"{y}-{m}-{d}", "title": title, "url": href})
        print(f"[recent] {len(posts)}", flush=True)
        return posts
    except Exception as exc:  # noqa: BLE001
        print(f"[recent] 失败：{exc}", file=sys.stderr, flush=True)
        return []


def fetch_atom() -> list[dict]:
    """Atom 里总是有最新文章，月度存档偶尔会晚几天才生成。"""
    try:
        response = requests.get(ATOM_URL, headers={"User-Agent": UA}, timeout=TIMEOUT)
        response.raise_for_status()
        root = ET.fromstring(response.content)
        posts = []
        for entry in root.findall("atom:entry", ATOM_NS):
            title = (entry.findtext("atom:title", default="", namespaces=ATOM_NS) or "").strip()
            link = entry.find("atom:link[@rel='alternate']", ATOM_NS)
            published = entry.findtext("atom:published", default="", namespaces=ATOM_NS)
            if not title or link is None or not published:
                continue
            href = link.get("href") or ""
            if not href:
                continue
            moment = datetime.fromisoformat(published.replace("Z", "+00:00")).astimezone(CST)
            posts.append(
                {
                    "date": moment.strftime("%Y-%m-%d"),
                    "title": title,
                    "url": href.replace("http://www.ruanyifeng.com", "https://www.ruanyifeng.com"),
                }
            )
        print(f"[atom] {len(posts)}", flush=True)
        return posts
    except Exception as exc:  # noqa: BLE001
        print(f"[atom] 失败：{exc}", file=sys.stderr, flush=True)
        return []


def crawl(months: list[tuple[int, int]]) -> list[dict]:
    posts: list[dict] = []
    failed: list[tuple[int, int]] = []

    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        futures = {pool.submit(fetch_month, y, m): (y, m) for y, m in months}
        for future in as_completed(futures):
            try:
                posts.extend(future.result())
            except Exception as exc:  # noqa: BLE001
                failed.append(futures[future])
                print(f"[retry] {exc}", flush=True)

    for year, month in failed:
        try:
            posts.extend(fetch_month(year, month))
        except Exception as exc:  # noqa: BLE001
            print(f"[fail] {year}-{month:02d}: {exc}", file=sys.stderr, flush=True)

    return posts


def normalize(posts: list[dict]) -> list[dict]:
    seen = set()
    result = []
    for post in posts:
        url = post.get("url")
        if not url or url in seen:
            continue
        seen.add(url)
        result.append(
            {
                "date": str(post.get("date", ""))[:10],
                "title": str(post.get("title", "")).strip(),
                "url": url,
            }
        )
    result.sort(key=lambda p: (p["date"], p["title"]), reverse=True)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description="抓取阮一峰博客索引")
    parser.add_argument("--out", default="monitor/blog/posts.json")
    parser.add_argument("--full", action="store_true", help="强制抓取全部月份")
    args = parser.parse_args()

    out = Path(args.out)
    existing: list[dict] = []
    if out.is_file():
        try:
            existing = json.loads(out.read_text(encoding="utf-8")).get("posts", [])
        except Exception:  # noqa: BLE001
            existing = []

    today = datetime.now(CST).date()
    full = args.full or not existing
    if full:
        months = month_range(
            (FIRST_YEAR, FIRST_MONTH), (today.year, today.month)
        )
        print(f"全量抓取 {len(months)} 个月…")
        posts = crawl(months)
    else:
        recent = month_range(
            (today.year, today.month), (today.year, today.month)
        )
        previous_month = (today.replace(day=1) - timedelta(days=1))
        recent.insert(0, (previous_month.year, previous_month.month))
        keys = {f"{y}-{m:02d}" for y, m in recent}
        kept = [p for p in existing if p["date"][:7] not in keys]
        print(f"增量抓取 {len(recent)} 个月…")
        posts = kept + crawl(recent)

    # 月度存档有时漏掉最近几周；归档页的最近 20 篇 + Atom 一起补齐
    posts.extend(fetch_recent())
    posts.extend(fetch_atom())
    posts = normalize(posts)
    if len(posts) < 1000:
        print(f"只抓到 {len(posts)} 篇，数据异常，放弃写入", file=sys.stderr)
        return 1

    out.parent.mkdir(parents=True, exist_ok=True)
    payload = {"source": SOURCE, "count": len(posts), "posts": posts}
    out.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"共 {len(posts)} 篇，最新：{posts[0]['date']} {posts[0]['title']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
