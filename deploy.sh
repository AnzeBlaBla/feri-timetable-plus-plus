#!/bin/bash

set -e

git pull --ff-only
docker compose pull traefik
docker compose up -d --build --force-recreate