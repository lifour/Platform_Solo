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

以下部署文件已纳入仓库（根目录）：

- `Dockerfile` — nginx 托管 `dist/`
- `nginx.conf` — SPA fallback + 缓存 + 安全响应头
- `docker-compose.yml` — 宿主机端口 57282
- `deploy-lighthouse.sh` — 凌晨 4 点自动拉取重建 + 健康检查 + 回滚

## 二、服务器部署步骤

### 1. 克隆项目到服务器

```bash
cd /home/ubuntu/myapp/
git clone git@github.com:lifour/Platform_Solo.git platform-solo
cd platform-solo
git checkout main
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

### 1. 配置权限

```bash
chmod +x /home/ubuntu/myapp/platform-solo/deploy-lighthouse.sh
```

### 2. 添加 Cron 定时任务

```bash
# 编辑 root crontab
sudo crontab -e

# 添加一行：
0 4 * * * /home/ubuntu/myapp/platform-solo/deploy-lighthouse.sh
```

日志文件：`/var/log/platform-solo-deploy.log`

### 3. 手动触发验证

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

## 六、APK 构建

main 分支每次更新，GitHub Actions 会自动构建 APK 并发布到 GitHub Release（`Actions` → `build-apk` 工作流）。

### 本地手动构建

```bash
npm install
npm run build
npm run android:build   # 产出 android/app/build/outputs/apk/debug/app-debug.apk
```

## 七、服务器资源占用（预估）

| 容器 | 内存 |
|------|------|
| platform-solo-nginx | ~5 MB |

纯静态 Nginx，资源几乎可忽略。服务器现有配置（2C/4G/60G）完全足够。
