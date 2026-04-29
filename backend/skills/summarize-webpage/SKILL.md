---
name: summarize-webpage
description: 获取网页内容并生成摘要
default_enabled: true
triggers:
  - 总结网页
  - 网页摘要
  - summarize
  - 帮我看看这个链接
  - 这个网页讲了什么
requires_tools:
  - http_request
author: system
version: "1.0"
---

# 网页内容摘要

## 使用场景
用户提供一个 URL，希望你获取网页内容并生成结构化摘要。

## 步骤

1. 从用户消息中提取目标 URL。

2. 使用 `http_request` 获取网页内容：
   ```
   http_request(url="<目标URL>", parse_html=true)
   ```

3. 分析获取到的内容，生成结构化摘要：
   - **标题**：网页标题
   - **核心观点**：2-3 句话概括主旨
   - **关键要点**：以列表形式列出 3-5 个要点
   - **结论/行动建议**（如适用）

4. 如果网页内容过长，聚焦于最重要的部分进行摘要。

## 注意事项
- 如果 URL 无法访问，告知用户并建议检查链接是否正确
- 对于需要登录才能查看的页面，说明无法获取内容
- 保持摘要客观，不添加个人评价
