#!/bin/bash
# Traefik debugging script

echo "🔍 Traefik Configuration Check"
echo "================================"
echo ""

echo "📋 Container Status:"
docker-compose ps
echo ""

echo "🌐 Network Configuration:"
docker network inspect feri-timetable-plus-plus_feri-network --format '{{range .Containers}}{{.Name}}: {{.IPv4Address}}{{"\n"}}{{end}}' 2>/dev/null || echo "Network not found"
echo ""

echo "🏷️  Traefik Labels on App Container:"
docker inspect feri-timetable-app --format '{{range $key, $value := .Config.Labels}}{{$key}}: {{$value}}{{"\n"}}{{end}}' | grep traefik
echo ""

echo "🔌 Test App from Traefik Container:"
docker-compose exec -T traefik wget -qO- http://app:3000 2>&1 | head -5 || echo "❌ Cannot reach app"
echo ""

echo "📊 Traefik API (if enabled):"
echo "Visit: http://localhost:8080/dashboard/ (if API is enabled)"
echo ""

echo "🔍 Recent Traefik Logs:"
docker-compose logs --tail=50 traefik | grep -E "(error|Error|rule|router|service)"
echo ""

echo "💡 Testing HTTPS Connection:"
curl -sSL -D- https://urnik.anzeblag.us -o /dev/null 2>&1 | head -20
echo ""

echo "🔑 Certificate Status:"
docker-compose exec -T traefik cat /letsencrypt/acme.json 2>/dev/null | grep -q "urnik.anzeblag.us" && echo "✅ Certificate exists" || echo "❌ No certificate found"
