#!/usr/bin/env python3
"""抓取衢州天气与空气质量数据，写入 JSON 文件。

数据来源：
- 天气预报、实况、分钟级降水、气象预警：和风天气
- 空气质量（AQI、污染物分指数、预报）：WAQI（aqicn.org）

设计要点：
- 每个接口互相独立，某个接口失败不会影响其他接口落盘；
- 失败信息记录在 meta.json 的 endpoints 里，页面据此判断数据是否可用；
- 输出目录由 --out 指定，GitHub Actions 会把结果推送到 data 分支。

用法：
    QWEATHER_KEY=xxx QWEATHER_DOMAIN=xxx AQICN_TOKEN=xxx \
        python fetch_data.py --out output
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import Any

import requests

CST = timezone(timedelta(hours=8))
SCHEMA = 1
LOCATION = {"name": "衢州", "lat": 28.98, "lon": 118.865}
TIMEOUT = 12
RETRIES = 3

# 页面瓦片使用的公开 token，同时也是可用的 WAQI API token。
# 仓库 Secrets 里配置了 AQICN_TOKEN 时优先使用 Secrets。
FALLBACK_AQICN_TOKEN = "fcb33ba925bd1ca319369d0eb68a0170054b7b05"

# WAQI 的城市监测站。要换城市时改这里，页面上的站名取自接口返回。
WAQI_CITY = "quzhou"


def endpoints(domain: str, key: str, aqicn_token: str) -> list[dict[str, Any]]:
    lon = LOCATION["lon"]
    lat = LOCATION["lat"]
    point = f"{lon},{lat}"
    base = f"https://{domain}"
    return [
        {
            "name": "weather_24h",
            "file": "weather_24h.json",
            "url": f"{base}/v7/weather/24h?location={point}&key={key}",
            "critical": True,
        },
        {
            "name": "weather_now",
            "file": "weather_now.json",
            "url": f"{base}/v7/weather/now?location={point}&key={key}",
            "critical": False,
        },
        {
            "name": "weather_minutely",
            "file": "weather_minutely.json",
            "url": f"{base}/v7/minutely/5m?location={point}&key={key}",
            "critical": False,
        },
        {
            "name": "aqi_waqi",
            "file": "aqi_waqi.json",
            "url": (
                f"https://api.waqi.info/feed/{WAQI_CITY}/"
                f"?token={aqicn_token}"
            ),
            "critical": False,
        },
        {
            "name": "weather_alert",
            "file": "weather_alert.json",
            "url": f"{base}/weatheralert/v1/current/{lat}/{lon}?key={key}",
            "critical": False,
        },
    ]


def fetch_json(session: requests.Session, url: str) -> dict[str, Any]:
    last_error: Exception | None = None
    for attempt in range(1, RETRIES + 1):
        try:
            response = session.get(url, timeout=TIMEOUT)
            response.raise_for_status()
            return response.json()
        except Exception as exc:  # noqa: BLE001 - 重试后统一抛出
            last_error = exc
            if attempt < RETRIES:
                time.sleep(attempt * 2)
    raise RuntimeError(str(last_error))


def check(name: str, data: Any) -> None:
    if not isinstance(data, dict):
        raise ValueError("返回内容不是 JSON 对象")
    if name == "aqi_waqi":
        if data.get("status") != "ok":
            detail = json.dumps(data, ensure_ascii=False)[:200]
            raise ValueError(f"WAQI 返回异常：{detail}")
        payload = data.get("data")
        if not isinstance(payload, dict) or payload.get("aqi") is None:
            raise ValueError("WAQI 没有返回 AQI 数值")
        return
    code = data.get("code")
    if code is not None and str(code) != "200":
        message = str(data.get("message") or "").strip()
        raise ValueError(f"接口返回 code={code}" + (f"：{message}" if message else ""))


def write_json(path: Path, data: Any) -> None:
    tmp = path.with_name(path.name + ".tmp")
    tmp.write_text(
        json.dumps(data, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    tmp.replace(path)


def main() -> int:
    parser = argparse.ArgumentParser(description="抓取衢州天气数据")
    parser.add_argument("--out", default="monitor/weather/quzhou/output", help="输出目录")
    args = parser.parse_args()

    key = os.environ.get("QWEATHER_KEY", "").strip()
    domain = os.environ.get("QWEATHER_DOMAIN", "").strip()
    if not key or not domain:
        print("缺少 QWEATHER_KEY 或 QWEATHER_DOMAIN，请检查仓库 Secrets。", file=sys.stderr)
        return 2

    domain = domain.removeprefix("https://").removeprefix("http://").strip("/")
    aqicn_token = os.environ.get("AQICN_TOKEN", "").strip() or FALLBACK_AQICN_TOKEN

    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)

    session = requests.Session()
    session.headers["User-Agent"] = (
        "liijjj-weather/1.0 (+https://github.com/liijjj/liijjj.github.io)"
    )

    stamp = int(time.time() * 1000)
    now = datetime.now(CST)
    results: dict[str, dict[str, Any]] = {}
    critical_ok = True
    ok_count = 0

    for endpoint in endpoints(domain, key, aqicn_token):
        url = f"{endpoint['url']}&_t={stamp}"
        record: dict[str, Any] = {
            "file": endpoint["file"],
            "ok": False,
            "critical": endpoint["critical"],
        }
        try:
            data = fetch_json(session, url)
            check(endpoint["name"], data)
            write_json(out / endpoint["file"], data)
            record["ok"] = True
            payload = data.get("data")
            record["updateTime"] = data.get("updateTime") or (
                payload.get("time", {}).get("iso") if isinstance(payload, dict) else None
            )
            ok_count += 1
            print(f"[ok]   {endpoint['name']} -> {endpoint['file']}")
        except Exception as exc:  # noqa: BLE001 - 单个接口失败不影响其他接口
            record["error"] = str(exc)
            print(f"[fail] {endpoint['name']}: {exc}", file=sys.stderr)
            if endpoint["critical"]:
                critical_ok = False
        results[endpoint["name"]] = record

    meta = {
        "schema": SCHEMA,
        "generatedAt": now.isoformat(timespec="seconds"),
        "generatedAtUnix": int(now.timestamp()),
        "location": LOCATION,
        "source": "QWeather (天气) + WAQI (空气质量)",
        "ok": ok_count == len(results),
        "criticalOk": critical_ok,
        "endpoints": results,
    }
    write_json(out / "meta.json", meta)

    print(f"\n完成：{ok_count}/{len(results)} 个接口成功 -> {out}")
    return 0 if critical_ok else 1


if __name__ == "__main__":
    sys.exit(main())
