# Platform_Solo 云部署指南

> 参考项目：doc-qa-assistant（腾讯云 Ubuntu，Docker + Nginx + 二级域名 + 4am 自动部署）

## 架构概览

```
用户 → book.onemooring.xyz (HTTPS)
     → 主 Nginx (doc-qa-frontend 容器) 反向代理
     → 宿主机 57282 端口
     → platform-solo-nginx 容器
     → dist/ 静态文件
```

Platform_Solo 是纯前端项目（无后端），只需一个 Nginx 容器托管 `dist/` 即可。

## 一、需要创建的文件

在项目根目录创建以下文件：

### 1. `Dockerfile`

```dockerfile
FROM nginx:alpine
COPY dist/ /usr/share/nginx/html/
COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
```

### 2. `nginx.conf`

```nginx
worker_processes auto;
events { worker_connections 1024; }

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;
    sendfile      on;
    tcp_nopush    on;
    keepalive_timeout 120;

    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_comp_level 6;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/json;

    server {
        listen 80;
        server_name localhost _;
        root /usr/share/nginx/html;
        index index.html;

        # 静态资源强缓存（文件名带 hash）
        location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?|ttf|otf)$ {
            expires 1y;
            add_header Cache-Control "public, immutable";
        }

        # data/ 目录（经文 JSON 数据）
        location /data/ {
            expires 1d;
            add_header Cache-Control "public";
        }

        # SPA 路由：所有路径 fallback 到 index.html
        location / {
            try_files $uri $uri/ /index.html;
            expires -1;
        }

        add_header X-Content-Type-Options "nosniff" always;
        add_header X-XSS-Protection "1; mode=block" always;
        add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    }
}
```

### 3. `docker-compose.yml`

```yaml
version: '3.8'

services:
  nginx:
    build: .
    container_name: platform-solo-nginx
    ports:
      - "57282:80"
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "wget -qO- http://localhost/ || exit 1"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s
```

## 二、服务器部署步骤

### 1. 克隆项目到服务器

```bash
cd /home/ubuntu/myapp/
git clone git@github.com:lifour/Platform_Solo.git platform-solo
cd platform-solo
```

### 2. 构建前端 + Docker 镜像

```bash
# 安装 Node.js 依赖并构建
npm install
npm run build

# 构建 Docker 镜像并启动
sudo docker compose up -d --build
```

### 3. 验证服务

```bash
# 本地测试
curl -s -o /dev/null -w "%{http_code}" http://localhost:57282
# 应返回 200
```

## 三、配置二级域名

### 1. DNS 解析

在域名 DNS 管理后台添加 A 记录：

| 类型 | 主机记录 | 记录值 |
|------|---------|--------|
| A | sutra | 106.53.202.101 |

### 2. 扩展 SSL 证书

```bash
sudo certbot certonly --standalone --cert-name onemooring.xyz \
  -d onemooring.xyz -d compass.onemooring.xyz -d book.onemooring.xyz
```

### 3. 主 Nginx 添加反向代理

在 `/home/ubuntu/myapp/doc-qa-assistant/frontend/nginx.conf` 的 `http` 块末尾添加（与 compass 子域名配置方式一致）：

```nginx
# book.onemooring.xyz — 阅藏·经文阅读器
server {
    listen 80;
    server_name book.onemooring.xyz;
    return 301 https://book.onemooring.xyz$request_uri;
}

server {
    listen 443 ssl;
    http2 on;
    server_name book.onemooring.xyz;

    ssl_certificate     /etc/letsencrypt/live/onemooring.xyz/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/onemooring.xyz/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        proxy_pass http://172.17.0.1:57282;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 4. 重载 Nginx

```bash
cd /home/ubuntu/myapp/doc-qa-assistant
sudo docker compose restart frontend
# 或：sudo docker exec doc-qa-frontend nginx -s reload
```

## 四、每天 4 点自动部署

### 1. 创建部署脚本

将以下内容保存为项目根目录的 `deploy-lighthouse.sh`：

```bash
#!/bin/bash
set -e
cd /home/ubuntu/myapp/platform-solo
exec >> /var/log/platform-solo-deploy.log 2>&1
echo "=== $(date +%F_%T) start ==="

BEFORE=$(git rev-parse HEAD)
git pull origin main
AFTER=$(git rev-parse HEAD)

if [ "$BEFORE" = "$AFTER" ]; then
    echo "no update"
    exit 0
fi

echo "deploying: $(echo $BEFORE | cut -c1-7) -> $(echo $AFTER | cut -c1-7)"

# 重新构建前端
npm install
npm run build

# 重建 Docker 容器
sudo docker compose up -d --build

# 健康检查
health_ok() {
    curl -sf --max-time 10 http://localhost:57282/ > /dev/null
}

sleep 3

if health_ok; then
    echo "health check passed"
    echo "=== done ==="
    exit 0
fi

# 回滚
echo "health check failed, rolling back to $(echo $BEFORE | cut -c1-7)"
git checkout "$BEFORE"
npm run build
sudo docker compose up -d --build
sleep 3

if health_ok; then
    echo "rollback success, service restored"
    echo "=== done (rolled back) ==="
    exit 0
fi

echo "FATAL: all attempts failed, manual intervention required"
exit 1
```

### 2. 上传到服务器并配置权限

```bash
# 在服务器上
chmod +x /home/ubuntu/myapp/platform-solo/deploy-lighthouse.sh
```

### 3. 添加 Cron 定时任务

```bash
# 编辑 root crontab
sudo crontab -e

# 添加一行：
0 4 * * * /home/ubuntu/myapp/platform-solo/deploy-lighthouse.sh
```

日志文件：`/var/log/platform-solo-deploy.log`

### 4. 手动触发验证

```bash
sudo /home/ubuntu/myapp/platform-solo/deploy-lighthouse.sh
sudo tail -20 /var/log/platform-solo-deploy.log
```

## 五、常用运维命令

```bash
# 查看容器状态
sudo docker ps --filter name=platform-solo

# 查看日志
sudo docker logs platform-solo-nginx --tail 50

# 重启
cd /home/ubuntu/myapp/platform-solo && sudo docker compose restart

# 重建
cd /home/ubuntu/myapp/platform-solo && npm run build && sudo docker compose up -d --build

# 停止
cd /home/ubuntu/myapp/platform-solo && sudo docker compose down
```

## 六、服务器资源占用（预估）

| 容器 | 内存 |
|------|------|
| platform-solo-nginx | ~5 MB |

纯静态 Nginx，资源几乎可忽略。服务器现有配置（2C/4G/60G）完全足够。

## 七、快速检查清单

- [ ] `Dockerfile`、`nginx.conf`、`docker-compose.yml` 已创建并提交到仓库
- [ ] `deploy-lighthouse.sh` 已创建并提交到仓库
- [ ] 服务器上已 `git clone` 项目
- [ ] `npm run build` 成功
- [ ] `docker compose up -d --build` 成功
- [ ] `curl localhost:57282` 返回 200
- [ ] DNS A 记录 `book.onemooring.xyz` → `106.53.202.101`
- [ ] SSL 证书已扩展包含 `book.onemooring.xyz`
- [ ] 主 Nginx 配置文件已添加 `sutra` 反向代理 server block
- [ ] 主 Nginx 已 reload
- [ ] `https://book.onemooring.xyz` 可正常访问
- [ ] Cron `0 4 * * *` 已配置
