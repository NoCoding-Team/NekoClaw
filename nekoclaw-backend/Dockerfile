FROM crpi-pqzengdgydwtnauc.cn-shanghai.personal.cr.aliyuncs.com/mjxj-env/python:3.12

RUN pip install uv -i https://pypi.tuna.tsinghua.edu.cn/simple

ENV TZ=Asia/Shanghai

WORKDIR /app

COPY nekoclaw-backend/pyproject.toml ./
RUN uv sync --no-dev --index-url https://pypi.tuna.tsinghua.edu.cn/simple

COPY nekoclaw-backend/ .

EXPOSE 8000

CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
