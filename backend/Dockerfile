# Stage 1: 仅构建依赖环境，不包含业务代码
FROM crpi-pqzengdgydwtnauc.cn-shanghai.personal.cr.aliyuncs.com/mjxj-env/python:3.11 AS base

# 切换阿里云 apt 源（加速国内构建）
RUN sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list.d/debian.sources \
    || sed -i 's/deb.debian.org/mirrors.aliyun.com/g' /etc/apt/sources.list

# 系统依赖（asyncpg 编译需要 gcc / libpq）
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# 只复制依赖文件，build cache 稳定
COPY requirements.txt .

# 安装 uv（pip resolver-too-deep 的替代方案，速度快且无深度限制）
RUN pip install --no-cache-dir uv -i https://mirrors.aliyun.com/pypi/simple/

# 安装 Python 依赖（阿里云 PyPI 镜像，清华镜像备用）
RUN uv pip install --system --no-cache -r requirements.txt \
    --index-url https://mirrors.aliyun.com/pypi/simple/ \
    --extra-index-url https://pypi.tuna.tsinghua.edu.cn/simple/

# 代码通过 docker-compose volume 挂载进来，此处不 COPY app/
# 容器启动时 /app/app/ 目录由宿主机挂载提供

EXPOSE 8000

# 默认启动命令，docker-compose 可覆盖
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
