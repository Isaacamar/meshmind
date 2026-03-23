#!/usr/bin/env bash
# MeshMind — start all services
cd "$(dirname "$0")"
docker compose up --build
