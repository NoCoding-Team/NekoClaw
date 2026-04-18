---
name: get-weather
description: 获取指定城市的实时天气信息
triggers:
  - 天气
  - weather
  - 气温
  - 温度
  - 天气预报
requires_tools:
  - fetch_url
author: system
version: "1.0"
---

# 获取天气信息

## 使用场景
用户询问某个城市/地区当前的天气状况、温度、湿度等信息。

## 步骤

1. 从用户消息中提取城市名称。如果用户没有指定城市，请询问用户。
2. 使用 `fetch_url` 访问 wttr.in 获取天气数据：
   ```
   fetch_url(url="https://wttr.in/{城市名}?format=j1&lang=zh")
   ```
   - 将 `{城市名}` 替换为英文城市名（如 Beijing, Shanghai, Tokyo）
   - `format=j1` 返回 JSON 格式
   - `lang=zh` 返回中文描述

3. 从返回的 JSON 中提取关键信息：
   - `current_condition[0]`: 当前天气
     - `temp_C`: 温度（摄氏度）
     - `humidity`: 湿度
     - `weatherDesc[0].value`: 天气描述
     - `windspeedKmph`: 风速
     - `FeelsLikeC`: 体感温度
   - `nearest_area[0].areaName[0].value`: 地区名

4. 用自然语言向用户报告天气信息，包含温度、体感温度、湿度、风速和天气状况。

## 注意事项
- 如果 wttr.in 返回错误，可以尝试不同的城市英文名拼写
- 中文城市名需要转换为拼音或英文名（如"北京" → "Beijing"）
