# Platform_Solo 云部署指南

> 参考项目：doc-qa-assistant（腾讯云 Ubuntu，Docker + Nginx + 二级域名 + 4am 自动部署）
>
> 本文档记录了 2026-08-16 实际部署到 book.onemooring.xyz 的完整流程与最终配置。

## 架构概览

```
用户 → book.onemooring.xyz (HTTPS)
     → 主 Nginx (doc-qa-frontend 容器, lifour/dm 项目) 反向代理
     → 宿主机 57282 端口
     → platform-solo-nginx 容器
     → dist/ 静态文件
```

Platform_Solo 是纯前端项目（无后端），只需一个 Nginx 容器托管 `dist/` 即可。

## 一、项目内部署文件（已纳入本仓库）

以下文件在仓库根目录：

- `Dockerfile` — nginx 托管 `dist/`
- `nginx.conf` — SPA fallback + 缓存 + 安全响应头
- `docker-compose.yml` — 宿主机端口 57282
- `deploy-lighthouse.sh` — 凌晨 4 点自动拉取重建 + 健康检查 + 回滚
- `start.sh` / `start.bat` — 本地一键启动 dev server
- `.gitattributes` — 跨平台行尾处理（.sh 强制 LF，.bat 强制 CRLF）

## 二、服务器部署步骤

服务器路径：`/home/ubuntu/myapp/platform-solo`

### 1. 克隆/更新项目

```bash
cd /home/ubuntu/myapp/
git clone git@github.com:lifour/Platform_Solo.git platform-solo
cd platform-solo
git checkout main
git pull origin main
```

> 注意：如果服务器本地 main 与远程分叉，说明本地有旧 main 的提交。这些内容已备份在 `backup/main-original` 分支，可安全对齐：
> `git reset --hard origin/main`

### 2. 构建前端 + Docker 镜像

```bash
npm install
npm run build
sudo docker compose up -d --build
```

### 3. 验证服务

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:57282
# 应返回 200
```

## 三、配置二级域名

### 1. DNS 解析

在域名 DNS 管理后台添加 A 记录：

| 类型 | 主机记录 | 记录值 |
|------|---------|--------|
| A | book | 106.53.202.101 |

### 2. SSL 证书

book 和 compass 共用一张证书，SAN 含 `book.onemooring.xyz` + `compass.onemooring.xyz`：

- 证书路径（服务器）：`/etc/letsencrypt/live/subdomains/`
- 签发/续期：Let's Encrypt certbot，每天凌晨 4 点自动续期（见第六节）

> ⚠️ 证书路径务必用 `live/subdomains/`，不是 `live/onemooring.xyz/`（后者只含主站域名，不含 book/compass）。

### 3. 主 Nginx 反向代理（已提交进 lifour/dm 仓库）

book 的反向代理 server 块已加入 **`/home/ubuntu/myapp/doc-qa-assistant/frontend/nginx.conf`**（项目 `lifour/dm`），并已提交推送（提交 `197b323`）。随 doc-qa-assistant 的 4am 自动部署自动生效，**无需手动改服务器配置**。

配置要点（server_name `book.onemooring.xyz` → `proxy_pass http://172.17.0.1:57282`）：

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

    ssl_certificate     /etc/letsencrypt/live/subdomains/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/subdomains/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;

    location / {
        proxy_pass http://172.17.0.1:57282;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $proxy_x_forwarded_proto;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection $connection_upgrade;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 600s;
        proxy_connect_timeout 15s;
    }
}
```

如需手动重载 doc-qa-frontend：

```bash
cd /home/ubuntu/myapp/doc-qa-assistant
sudo docker compose restart frontend
# 或：sudo docker exec doc-qa-frontend nginx -s reload
```

## 四、每天 4 点自动部署（Platform_Solo）

### 1. 复制脚本到 /opt 并授权

```bash
sudo cp /home/ubuntu/myapp/platform-solo/deploy-lighthouse.sh /opt/deploy-lighthouse-platformsolo.sh
sudo chmod +x /opt/deploy-lighthouse-platformsolo.sh
```

### 2. 添加 Cron 定时任务

```bash
sudo crontab -e
# 添加一行：
0 4 * * * /opt/deploy-lighthouse-platformsolo.sh
```

日志文件：`/var/log/platform-solo-deploy.log`

### 3. 手动触发验证

```bash
sudo /opt/deploy-lighthouse-platformsolo.sh
sudo tail -20 /var/log/platform-solo-deploy.log
```

### 4. 与 doc-qa-assistant 的 cron 对照（服务器 root crontab 全貌）

```
*/5 * * * *  stargate（腾讯云监控）
0 4 * * *    /opt/deploy-lighthouse.sh              ← doc-qa-assistant 自动更新
*/5 * * * *  watchdog（doc-qa 后端保活）
0 4 * * *    /usr/bin/certbot renew --quiet         ← 证书自动续期
0 4 * * *    /opt/deploy-lighthouse-platformsolo.sh ← Platform_Solo 自动更新
```

四个 4am 任务互不冲突，各自操作不同容器/证书。

## 五、证书自动续期（book / compass）

- 定时：root crontab `0 4 * * * /usr/bin/certbot renew --quiet`（已停用系统 certbot.timer）
- 验证方式：`standalone`（续期前需释放 80 端口）
- 续期钩子（解决 standalone 与 nginx 抢占 80 端口问题）：
  - `/etc/letsencrypt/renewal-hooks/pre/stop-frontend.sh` — 停 doc-qa-frontend 容器释放 80 端口
  - `/etc/letsencrypt/renewal-hooks/post/start-frontend.sh` — 续期后重启容器
- 验证续期：`sudo certbot renew --dry-run`（应显示 `Congratulations, all simulated renewals succeeded`）

> 主站 `onemooring.xyz` 的证书来自 `/etc/nginx/ssl/`（非 certbot 管理，有效期至 2027-01-18），不在自动续期范围内，到期前需手动处理。

## 六、APK 构建

main 分支每次更新，GitHub Actions（`.github/workflows/build-apk.yml`）自动构建 APK 并发布到 GitHub Release，供手动下载安装。

### 本地手动构建

```bash
npm install
npm run build
npm run android:build   # 产出 android/app/build/outputs/apk/debug/app-debug.apk
```

## 七、常用运维命令

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

## 八、已知小问题

- `platform-solo-nginx` 容器可能显示 `unhealthy`：因为 docker-compose 的 healthcheck 用 `wget` 检查，而 `nginx:alpine` 镜像可能未内置 `wget`。**不影响实际访问**（curl 返回 200），后续可将 healthcheck 改为 curl 或移除。

## 九、服务器资源占用（预估）

| 容器 | 内存 |
|------|------|
| platform-solo-nginx | ~5 MB |

纯静态 Nginx，资源几乎可忽略。服务器现有配置（2C/4G/60G）完全足够。
