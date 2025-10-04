# Docker Deployment Guide

## Quick Start

### 1. Clone the repository
```bash
git clone https://github.com/AnzeBlaBla/feri-timetable-plus-plus.git
cd feri-timetable-plus-plus
```

### 2. Create environment file
```bash
cp .env.example .env.local
```

Edit `.env.local` and add your WISE credentials:
```env
WISE_USERNAME=your_wise_username
WISE_PASSWORD=your_wise_password
WISE_URL=https://...
```

⚠️ **Important**: If your password contains `$` character, escape it with backslash: `\$`

### 3. Build and run with Docker Compose
```bash
docker-compose up -d
```

The application will be available at `http://localhost:3000`

### 4. View logs
```bash
docker-compose logs -f app
```

### 5. Stop the application
```bash
docker-compose down
```

## Production Deployment

### Using Docker Compose (Recommended)

1. **Update docker-compose.yml** for production settings:
```yaml
services:
  app:
    restart: always
    ports:
      - "3000:3000"  # Or use a reverse proxy (Nginx, Traefik, Caddy)
```

2. **Build and start**:
```bash
docker-compose up -d --build
```

### Using Docker directly

1. **Build the image**:
```bash
docker build -t feri-timetable:latest .
```

2. **Run the container**:
```bash
docker run -d \
  --name feri-timetable \
  -p 3000:3000 \
  -e WISE_USERNAME=your_username \
  -e WISE_PASSWORD=your_password \
  -e WISE_URL=https://wise.um.si/urnik/2024_2025 \
  --restart unless-stopped \
  feri-timetable:latest
```

### Behind Nginx Reverse Proxy

Example Nginx configuration:
```nginx
server {
    listen 80;
    server_name timetable.yourdomain.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### With Traefik

Example docker-compose.yml with Traefik labels:
```yaml
version: '3.8'

services:
  app:
    build: .
    container_name: feri-timetable-app
    restart: unless-stopped
    env_file:
      - .env.local
    networks:
      - traefik
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.timetable.rule=Host(`timetable.yourdomain.com`)"
      - "traefik.http.routers.timetable.entrypoints=websecure"
      - "traefik.http.routers.timetable.tls.certresolver=letsencrypt"
      - "traefik.http.services.timetable.loadbalancer.server.port=3000"

networks:
  traefik:
    external: true
```

## Updating the Application

1. **Pull latest changes**:
```bash
git pull origin main
```

2. **Rebuild and restart**:
```bash
docker-compose down
docker-compose up -d --build
```

## Monitoring

### Check container status
```bash
docker-compose ps
```

### View resource usage
```bash
docker stats feri-timetable-app
```

### Health check
```bash
curl http://localhost:3000/
```

## Troubleshooting

### Container won't start
```bash
docker-compose logs app
```

### Reset everything
```bash
docker-compose down -v
docker-compose up -d --build
```

### Clear build cache
```bash
docker builder prune -a
```

## Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `WISE_USERNAME` | WISE API username | Yes | - |
| `WISE_PASSWORD` | WISE API password | Yes | - |
| `WISE_URL` | WISE API base URL | No | `https://wise.um.si/urnik/2024_2025` |
| `NODE_ENV` | Node environment | No | `production` |
| `PORT` | Port to run on | No | `3000` |

## Security Notes

- Never commit `.env.local` to version control
- Use Docker secrets for sensitive data in production
- Run behind a reverse proxy with HTTPS
- Keep the Docker image updated regularly

## Performance

The Docker image is optimized using:
- Multi-stage build (reduces image size by ~70%)
- Standalone Next.js output (minimal runtime dependencies)
- Alpine Linux base (small footprint)
- Layer caching for faster rebuilds

Final image size: ~150MB (compared to ~500MB without optimization)
