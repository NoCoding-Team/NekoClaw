# NekoClaw LLM Proxy

NekoClaw LLM 代理 -- 猫咪的智力供给中枢。负责大语言模型 API 的请求转发、鉴权、额度检查和用量记录。

## 功能

- 通过 `proxy_token` 鉴权
- 支持 OpenAI、Anthropic、Gemini、OpenRouter 等 Provider
- 流式/非流式请求转发
- Token 用量记录

## 开发

```bash
uv sync
uv run uvicorn app.main:app --reload --port 8080
```
