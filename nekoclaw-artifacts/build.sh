#!/usr/bin/env bash
set -euo pipefail

REGISTRY="${IMAGE_REGISTRY:-}"
TAG="${IMAGE_TAG:-latest}"
PLATFORM="linux/amd64"

build_and_push() {
  local name="$1"
  local context="$2"
  local dockerfile="${3:-$context/Dockerfile}"
  local image="${REGISTRY:+$REGISTRY/}nekoclaw-${name}:${TAG}"

  echo "==> Building $image ($PLATFORM)"
  docker build --platform "$PLATFORM" -t "$image" -f "$dockerfile" "$context"

  if [ -n "$REGISTRY" ]; then
    echo "==> Pushing $image"
    docker push "$image"
  fi
}

cd "$(dirname "$0")/.."

build_and_push backend nekoclaw-backend
build_and_push portal nekoclaw-portal
build_and_push llm-proxy nekoclaw-llm-proxy

if [ -d ee/nekoclaw-frontend ]; then
  build_and_push admin ee/nekoclaw-frontend
fi

echo "==> Done"
