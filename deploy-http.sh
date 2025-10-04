#!/bin/bash
# HTTP-only deployment (no HTTPS/certificates)

echo "🚀 Starting HTTP-only deployment"
echo ""

# Stop any existing containers
echo "🛑 Stopping any existing containers..."
docker-compose -f docker-compose-http.yml down 2>/dev/null
docker-compose down 2>/dev/null

# Build and start
echo "🔨 Building and starting services..."
docker-compose -f docker-compose-http.yml up -d --build

# Wait a bit
echo "⏳ Waiting for services to start..."
sleep 5

# Show status
echo ""
echo "📊 Container Status:"
docker-compose -f docker-compose-http.yml ps

echo ""
echo "✅ HTTP deployment complete!"
echo ""
echo "🌐 Access your app at:"
echo "   http://urnik.anzeblag.us"
echo ""
echo "🔍 Traefik Dashboard:"
echo "   http://YOUR_SERVER_IP:8080/dashboard/"
echo ""
echo "📋 View logs:"
echo "   docker-compose -f docker-compose-http.yml logs -f"
echo ""
echo "🛑 Stop:"
echo "   docker-compose -f docker-compose-http.yml down"
