#!/bin/bash
# Quick deployment script for urnik.anzeblag.us

set -e

echo "🚀 Deploying FERI Timetable to urnik.anzeblag.us"

# Check if .env.local exists
if [ ! -f .env.local ]; then
    echo "❌ Error: .env.local not found!"
    echo "📝 Please create .env.local with your WISE credentials"
    echo "   You can copy from .env.production.example"
    exit 1
fi

# Check if docker compose is installed
if ! command -v docker compose &> /dev/null; then
    echo "❌ Error: docker compose not installed!"
    exit 1
fi

# Pull latest changes
echo "📥 Pulling latest changes..."
git pull origin main

# Stop existing containers
echo "🛑 Stopping existing containers..."
docker compose down

# Build and start
echo "🔨 Building and starting services..."
docker compose up -d --build

# Wait for services to be healthy
echo "⏳ Waiting for services to start..."
sleep 10

# Check status
echo ""
echo "📊 Service Status:"
docker compose ps

echo ""
echo "✅ Deployment complete!"
echo ""
echo "🌐 Your site should be available at: https://urnik.anzeblag.us"
echo ""
echo "📋 Useful commands:"
echo "  View logs:        docker compose logs -f"
echo "  Restart:          docker compose restart"
echo "  Stop:             docker compose down"
echo "  Update:           git pull && docker compose up -d --build"
