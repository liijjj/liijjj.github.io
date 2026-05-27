import os
import time
import requests
#GitHub Actions 将运行fetch_data.py来定时更新数据。

# 创建缓存输出/缓存目录
output_dir = "monitor/weather/quzhou/output"
os.makedirs(output_dir, exist_ok=True)

# 从 GitHub Secrets 中读取 Key
aqicn_token = os.environ.get("AQICN_TOKEN")
qweather_key = os.environ.get("QWEATHER_KEY")
qweather_domain = os.environ.get("QWEATHER_DOMAIN")

timestamp = int(time.time() * 1000)
#请求成功则写入文件，请求失败则报错
def save_json(url, filename):
    try:
        response = requests.get(url, timeout=15)
        if response.status_code == 200:
            with open(os.path.join(output_dir, filename), "w", encoding="utf-8") as f:
                f.write(response.text)
            print(f"成功更新: {filename}")
        else:
            print(f"请求失败 {filename}: 状态码 {response.status_code}")
    except Exception as e:
        print(f"错误 {filename}: {str(e)}")

# 1. 抓取和风 24小时预报
url_24h = f"https://{qweather_domain}/v7/weather/24h?location=118.865,28.98&key={qweather_key}&_t={timestamp}"
save_json(url_24h, "weather_24h.json")

# 2. 抓取和风 空气质量逐小时预报
url_aqi = f"https://{qweather_domain}/airquality/v1/hourly/28.98/118.865?key={qweather_key}&_t={timestamp}"
save_json(url_aqi, "aqi_hourly.json")

# 3. 抓取和风 5分钟级降水
url_minutely = f"https://{qweather_domain}/v7/minutely/5m?location=118.865,28.98&key={qweather_key}&_t={timestamp}"
save_json(url_minutely, "weather_minutely.json")

# 4. 抓取和风 灾害预警
url_alert = f"https://{qweather_domain}/weatheralert/v1/current/28.98/118.865?key={qweather_key}&_t={timestamp}"
save_json(url_alert, "weather_alert.json")
