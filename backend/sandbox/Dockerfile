FROM python:3.12-slim

RUN pip install --no-cache-dir \
    numpy pandas matplotlib scipy sympy

# Non-root user for extra isolation
RUN useradd -m -s /bin/bash sandbox
USER sandbox
WORKDIR /home/sandbox
