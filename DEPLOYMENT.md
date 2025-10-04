# Production Deployment Guide for urnik.anzeblag.us

## Prerequisites

1. **Server Requirements:**
   - Ubuntu/Debian Linux server with public IP
   - Docker and Docker Compose installed
   - Ports 80 and 443 open in firewall
   - Domain `urnik.anzeblag.us` pointing to your server's IP

2. **DNS Configuration:**
   ```
   A Record: urnik.anzeblag.us → YOUR_SERVER_IP
   ```

## Deployment Steps

### 1. Prepare the Server

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# Install Docker Compose
sudo apt install docker-compose -y

# Add your user to docker group (optional)
sudo usermod -aG docker $USER
# Log out and back in for this to take effect
```

### 2. Clone and Configure

```bash
# Clone repository
git clone https://github.com/AnzeBlaBla/feri-timetable-plus-plus.git
cd feri-timetable-plus-plus

# Create environment file
cp .env.production.example .env.local

# Edit with your credentials
nano .env.local
```

Add your WISE credentials:
```env
WISE_USERNAME=your_username
WISE_PASSWORD=your_password
WISE_URL=https://wise.um.si/urnik/2024_2025
```

⚠️ **Important**: If password contains `$`, escape it: `\$`

### 3. Update Email for Let's Encrypt

Edit `docker-compose.yml` and change the email:
```yaml
- "--certificatesresolvers.letsencrypt.acme.email=YOUR_EMAIL@example.com"
```

### 4. Deploy

```bash
# Build and start services
sudo docker-compose up -d --build

# View logs
sudo docker-compose logs -f

# Check status
sudo docker-compose ps
```

### 5. Verify Deployment

1. **Check Traefik:**
   ```bash
   sudo docker-compose logs traefik
   ```
   Look for "Configuration loaded" and certificate generation messages.

2. **Test the site:**
   - Visit: https://urnik.anzeblag.us
   - Should automatically redirect HTTP to HTTPS
   - Should show valid Let's Encrypt certificate

3. **Test IP blocking:**
   ```bash
   # Should NOT work (404 or connection refused)
   curl http://YOUR_SERVER_IP
   curl https://YOUR_SERVER_IP
   ```

## How It Works

### Traefik Reverse Proxy
- **Listens on ports 80 and 443**
- Automatically obtains Let's Encrypt certificates
- Routes traffic based on `Host` header
- Only responds to `urnik.anzeblag.us` - IP access is blocked
- Redirects HTTP → HTTPS automatically

### Security Features
- ✅ Automatic HTTPS with Let's Encrypt
- ✅ Only responds to specific domain (blocks IP access)
- ✅ HTTP to HTTPS redirect
- ✅ HSTS headers (forces HTTPS in browsers)
- ✅ Automatic certificate renewal

## Maintenance

### View Logs
```bash
# All services
sudo docker-compose logs -f

# Just the app
sudo docker-compose logs -f app

# Just Traefik
sudo docker-compose logs -f traefik
```

### Update Application
```bash
# Pull latest changes
git pull origin main

# Rebuild and restart
sudo docker-compose down
sudo docker-compose up -d --build
```

### Restart Services
```bash
# Restart everything
sudo docker-compose restart

# Restart just the app
sudo docker-compose restart app
```

### Stop Services
```bash
sudo docker-compose down
```

### Check Certificate Status
```bash
# View certificate info
sudo docker exec feri-timetable-traefik cat /letsencrypt/acme.json | jq
```

## Troubleshooting

### Certificate Issues

**Problem:** Certificate not generating

**Solutions:**
1. Verify DNS points to your server:
   ```bash
   dig urnik.anzeblag.us
   nslookup urnik.anzeblag.us
   ```

2. Check ports are open:
   ```bash
   sudo netstat -tlnp | grep -E ':(80|443)'
   ```

3. Check Traefik logs:
   ```bash
   sudo docker-compose logs traefik | grep -i acme
   ```

4. Ensure no other service is using ports 80/443:
   ```bash
   sudo lsof -i :80
   sudo lsof -i :443
   ```

### Site Not Loading

1. **Check containers are running:**
   ```bash
   sudo docker-compose ps
   ```

2. **Check app logs:**
   ```bash
   sudo docker-compose logs app
   ```

3. **Verify Traefik routing:**
   ```bash
   sudo docker-compose logs traefik | grep urnik
   ```

### IP Access Still Works

If IP access isn't blocked, verify the Host rule:
```bash
curl -H "Host: urnik.anzeblag.us" http://YOUR_SERVER_IP
# Should work

curl http://YOUR_SERVER_IP
# Should NOT work (404)
```

## Firewall Configuration

### UFW (Ubuntu)
```bash
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw allow 22/tcp  # SSH
sudo ufw enable
```

### iptables
```bash
sudo iptables -A INPUT -p tcp --dport 80 -j ACCEPT
sudo iptables -A INPUT -p tcp --dport 443 -j ACCEPT
sudo iptables-save
```

## Backup

### Backup certificates
```bash
sudo docker cp feri-timetable-traefik:/letsencrypt/acme.json ./acme.json.backup
```

### Restore certificates
```bash
sudo docker cp ./acme.json.backup feri-timetable-traefik:/letsencrypt/acme.json
sudo docker-compose restart traefik
```

## Environment Variables

| Variable | Description | Required | Example |
|----------|-------------|----------|---------|
| `WISE_USERNAME` | WISE API username | Yes | `your_user` |
| `WISE_PASSWORD` | WISE API password | Yes | `your_pass` |
| `WISE_URL` | WISE API endpoint | No | `https://wise.um.si/urnik/2024_2025` |

## Performance

- **Initial startup:** ~30 seconds (includes certificate generation)
- **Subsequent starts:** ~10 seconds
- **Certificate renewal:** Automatic every 60 days
- **Resource usage:** ~200MB RAM, minimal CPU

## Security Best Practices

1. ✅ Keep Docker and system updated
2. ✅ Use strong passwords in `.env.local`
3. ✅ Never commit `.env.local` to git
4. ✅ Regularly check logs for suspicious activity
5. ✅ Keep application updated with `git pull`

## Support

If you encounter issues:
1. Check logs: `sudo docker-compose logs -f`
2. Verify DNS configuration
3. Ensure ports 80/443 are accessible
4. Check firewall rules
5. Review Traefik documentation: https://doc.traefik.io/traefik/
