## docker-compose

```yaml
# docker-compose.yml
services:
  api:
    build: .
    ports:
      - "8000:8000"
    env_file: .env
    depends_on:
      redis:
        condition: service_healthy
      # Add DB service dependency (based on the DB used)
      # db:
      #   condition: service_healthy
    restart: unless-stopped

  # DB Service — Choose the appropriate DB for your project
  # ── PostgreSQL ──
  # db:
  #   image: postgres:16-alpine
  #   environment:
  #     POSTGRES_DB: myapp
  #     POSTGRES_USER: myapp
  #     POSTGRES_PASSWORD: ${DB_PASSWORD}
  #   volumes:
  #     - postgres_data:/var/lib/postgresql/data
  #   ports:
  #     - "5432:5432"
  #   healthcheck:
  #     test: ["CMD-SHELL", "pg_isready -U myapp"]

  # ── MongoDB ──
  # db:
  #   image: mongo:7
  #   environment:
  #     MONGO_INITDB_ROOT_USERNAME: myapp
  #     MONGO_INITDB_ROOT_PASSWORD: ${DB_PASSWORD}
  #   volumes:
  #     - mongo_data:/data/db
  #   ports:
  #     - "27017:27017"
  #   healthcheck:
  #     test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]

  redis:
    image: redis:7-alpine
    command: redis-server --maxmemory 256mb --maxmemory-policy allkeys-lru
    ports:
      - "6379:6379"
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes: {}
  # postgres_data:
  # mongo_data:
```

### .env.example

```env
# App
APP_NAME=My API
ENVIRONMENT=development
DEBUG=true

# Database (Configure based on mounted DB skill)
DATABASE_URL=your_database_url_here
DB_PASSWORD=your_secure_password

# Redis
REDIS_URL=redis://redis:6379/0

# Auth
SECRET_KEY=your-super-secret-key-change-in-production
ACCESS_TOKEN_EXPIRE_MINUTES=30

# CORS
ALLOWED_ORIGINS=["http://localhost:3000"]
```

### Deployment Checklist

- [ ] Multi-stage Docker build
- [ ] Run as non-root user
- [ ] Healthcheck configuration
- [ ] Adjust uvicorn worker count based on CPU
- [ ] Use uvloop + httptools
- [ ] DB connection/client pool configuration (refer to DB skill)
- [ ] Redis maxmemory configuration
- [ ] Manage secrets via environment variables
- [ ] .dockerignore configuration
- [ ] Enforce HTTPS (nginx/cloudflare)
- [ ] Log collection configuration (JSON format)
- [ ] Metrics/Monitoring endpoints
