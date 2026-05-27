import os
import sys
import time
import requests

# 创建缓存输出/缓存目录
output_dir = "monitor/weather/quzhou/output"
os.makedirs(output_dir, exist_ok=True)

# 从 GitHub Secrets 中读取 Key 和域名
qweather_key = os.environ.get("QWEATHER_KEY")
qweather_domain = os.environ.get("QWEATHER_DOMAIN")

if not qweather_key or not qweather_domain:
    print("❌ 错误: 无法从环境变量中读取 QWEATHER_KEY 或 QWEATHER_DOMAIN，请检查 Secrets 配置！")
    sys.exit(1)

timestamp = int(time.time() * 1000)

def save_json(url, filename):
    print(f"\n🚀 正在请求: {url}")
    try:
        response = requests.get(url, timeout=15)
        
        # 【核心修复】显式指定编码，强行让 requests 自动解压商业版专属域名的 Gzip 压缩包
        response.encoding = 'utf-8' 
        
        if response.status_code == 200:
            # 确保拿到的内容不为空且是合法的 JSON 格式开头
            if response.text.strip().startswith('{'):
                file_path = os.path.join(output_dir, filename)
                with open(file_path, "w", encoding="utf-8") as f:
                    f.write(response.text)
                print(f"  ✅ 成功更新并保存: {filename}")
            else:
                print(f"  ❌ 接口返回的数据格式异常，并非合法的 JSON！内容前缀: {response.text[:100]}")
                sys.exit(1) # 强行报错，拒绝静默通过
        else:
            print(f"  ❌ 请求失败 {filename} -> 状态码: {response.status_code}，详情: {response.text}")
            sys.exit(1) # 强行报错
    except Exception as e:
        print(f"  💥 运行出现崩溃异常 {filename} -> {str(e)}")
        sys.exit(1) # 强行报错

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

print("\n🎉 [OK] 所有的天气 JSON 文件已全部在虚拟机内成功落盘！")
