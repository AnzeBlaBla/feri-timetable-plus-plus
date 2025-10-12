#!/bin/bash

# Build and push Docker image to anzeblabla/timetable

set -e

IMAGE_NAME="anzeblabla/timetable"
TAG="${1:-latest}"

echo "Building Docker image: ${IMAGE_NAME}:${TAG}"
docker build -t "${IMAGE_NAME}:${TAG}" .

echo "Pushing Docker image: ${IMAGE_NAME}:${TAG}"
docker push "${IMAGE_NAME}:${TAG}"

echo "Successfully built and pushed ${IMAGE_NAME}:${TAG}"