#!/usr/bin/env python3
"""检查今天是否有可转债申购，有就推送一次钉钉。

数据来源：东方财富「新股申购 - 可转债」使用的同一个接口。
推送时间由 workflow 的 cron 决定（北京时间 07:33），推送内容与旧版一致：

    标题 / 正文：10月31日星期五的某某转债
    正文末尾的 U 是钉钉机器人的关键词，不能删。
"""

from __future__ import annotations

import json
import os
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone

CST = timezone(timedelta(hours=8))
API = "https://datacenter-web.eastmoney.com/api/data/v1/get"
WEEKDAYS = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"]
USER_AGENT = "liijjj-kzz/1.0 (+https://github.com/liijjj/liijjj.github.io)"


def fetch_today(day: str) -> list[dict]:
    params = {
        "reportName": "RPT_BOND_CB_LIST",
        "columns": "SECURITY_CODE,SECURITY_NAME_ABBR,CORRECODE,PUBLIC_START_DATE",
        "filter": f"(PUBLIC_START_DATE='{day}')",
        "pageNumber": "1",
        "pageSize": "50",
        "source": "WEB",
        "client": "WEB",
    }
    url = f"{API}?{urllib.parse.urlencode(params)}"
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    with urllib.request.urlopen(request, timeout=20) as response:
        payload = json.load(response)

    # 9201 表示当天没有数据；其他错误直接抛出来，让任务变红
    if payload.get("code") == 9201:
        return []
    if payload.get("code") != 0:
        raise RuntimeError(payload.get("message") or f"接口返回 {payload.get('code')}")

    return (payload.get("result") or {}).get("data") or []


def push(webhook: str, title: str, text: str) -> str:
    message = {"msgtype": "markdown", "markdown": {"title": title, "text": text}}
    request = urllib.request.Request(
        webhook,
        data=json.dumps(message).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return response.read().decode("utf-8", "replace")


def main() -> int:
    now = datetime.now(CST)
    today = now.strftime("%Y-%m-%d")

    rows = fetch_today(today)
    if not rows:
        print(f"今日（{today}）没有可转债申购，不推送。")
        return 0

    names = "、".join(
        str(row.get("SECURITY_NAME_ABBR") or row.get("SECURITY_CODE")) for row in rows
    )
    day = datetime.strptime(today, "%Y-%m-%d")
    title = f"{day.month}月{day.day}日{WEEKDAYS[day.weekday()]}的{names}"
    print(f"检测到今日可转债申购：{names}")

    webhook = os.environ.get("DINGTALK_WEBHOOK", "").strip()
    if not webhook:
        print("未配置 DINGTALK_WEBHOOK，跳过钉钉推送。")
        return 0

    try:
        response = push(webhook, title, title + "U")
        print("钉钉推送成功：", response)
    except Exception as exc:  # noqa: BLE001 - 推送失败要让任务变红
        print("钉钉推送失败：", exc, file=sys.stderr)
        return 1

    return 0


if __name__ == "__main__":
    sys.exit(main())
