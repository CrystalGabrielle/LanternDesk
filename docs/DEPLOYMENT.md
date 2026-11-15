# 部署、备份与排障

本文是 [README](../README.md) 快速开始的展开版，覆盖群晖 NAS、普通 Linux 主机、本机开发，以及升级、迁移和常见问题排查。

---

## 1. 部署前检查

```text
资料目录（只读索引）
  └─ <PUBLIC_HOST>/<LIBRARY_SUBDIR>/        例：/srv/library/学习资料
       ├─ 小说/克苏鲁/…/第01回.pdf
       └─ 计算机/Python/入门.pdf

同一个 <PUBLIC_HOST> 下还会自动生成
  ├─ _导入图书/                 网页导入的书
  └─ _图书馆分类/               硬链接镜像（可选）

应用数据（独立卷）
  └─ <DATA_HOST>/library.db + covers/
```

检查清单：

- [ ] `PUBLIC_HOST` 是**单个挂载点**，资料目录与 `_图书馆分类` 不会被分到不同卷（否则硬链接失败）。
- [ ] 运行容器的用户对 `PUBLIC_HOST` 有写权限（要写 `_导入图书` 与 `_图书馆分类`），对 `DATA_HOST` 有写权限。
- [ ] `.env` 里的 `HOST_IP` 是主机的**局域网 IP**，`PORT` 未被占用。
- [ ] 主机防火墙放行该端口；路由器上**没有**为该端口配置端口转发 / DMZ。
- [ ] `.env` 已被 `.gitignore` 忽略，不会被提交到仓库。

> 资料通常用 SMB / NFS 共享给 Windows、macOS 与手机，但这不是必需的：网页通过容器内的 bind mount 读取，客户端只需要 HTTP。

---

## 2. 群晖 Synology / Container Manager

适合资料本来就在 NAS 上的场景：扫描在本地磁盘完成，不走网络文件系统，站点 24 小时在线。

### 2.1 准备

1. DSM → 套件中心安装 **Container Manager**。
2. 控制面板 → 终端机和 SNMP → 开启 SSH。
3. 在共享文件夹（假设 `/volume1/your-share`）下确认资料目录，例如 `/volume1/your-share/学习资料`。
4. 建立项目目录与数据目录：

   ```bash
   mkdir -p /volume1/docker/lan-library/data
   ```

### 2.2 配置文件

把仓库内容放到 `/volume1/docker/lan-library/`，创建 `.env`：

```ini
HOST_IP=192.168.1.10
PORT=8090
PUBLIC_HOST=/volume1/your-share
LIBRARY_SUBDIR=学习资料
DATA_HOST=/volume1/docker/lan-library/data
SCAN_INTERVAL_MIN=10
```

关键点：`PUBLIC_HOST` 填**资料目录的父目录**（`/volume1/your-share`），而不是 `/volume1/your-share/学习资料`；容器把父目录整体挂到 `/lanpublic`，这样 `_图书馆分类` 与资料才在同一挂载点。

### 2.3 启动

**方式一：DSM 图形界面**

Container Manager → 项目 → 新增 → 选择项目目录 `/volume1/docker/lan-library` → 使用已有的 `docker-compose.yml` → 构建并启动。

**方式二：SSH**

```bash
cd /volume1/docker/lan-library
sudo /var/packages/ContainerManager/target/usr/bin/docker compose up -d --build
sudo /var/packages/ContainerManager/target/usr/bin/docker compose logs -f
```

**方式三：从开发机一键上传**

仓库的 `deploy/deploy.py` 通过 SSH 的 `exec` 通道传 `tar.gz`（部分群晖未开放 SFTP 子系统），然后在 NAS 上执行 compose：

```bash
pip install paramiko
NAS_HOST=192.168.1.10 NAS_USER=your_user NAS_PWD=your_password \
  python deploy/deploy.py
```

可用环境变量：`NAS_REMOTE_DIR`（默认 `/volume1/docker/lan-library`）、`NAS_DOCKER_BIN`、`NAS_PORT`、`NAS_SUDO=0`（用户已在 docker 组时）、`RESET_DB=1`（**危险**：删除数据库重建索引，会丢进度/书签）。

密码只从环境变量读取，通过 `sudo` 的 stdin 传入，不写入文件、不出现在远程命令行。

### 2.4 验证

```bash
curl http://<HOST_IP>:8090/api/health
curl -s http://<HOST_IP>:8090/api/state | head -c 400
```

从局域网其他设备访问 `http://192.168.1.10:8090`。如果原来已有别的站点占用 8080/3001，本项目使用独立的 8090，互不影响。

---

## 3. 普通 Linux 主机 / 家庭服务器

```bash
git clone https://github.com/<your-name>/lan-library.git
cd lan-library
cp .env.example .env
```

编辑 `.env`：

```ini
HOST_IP=192.168.1.20
PORT=8090
PUBLIC_HOST=/srv/library
LIBRARY_SUBDIR=学习资料
DATA_HOST=./data
SCAN_INTERVAL_MIN=10
```

```bash
mkdir -p /srv/library data
# 已有资料直接软链接进去即可，无需复制 800 GB 数据：
ln -s /mnt/disk/学习资料 /srv/library/学习资料
docker compose up -d --build
```

> 若用软链接，注意 `PUBLIC_HOST` 与链接目标仍需在**同一文件系统**，否则硬链接镜像无法创建（索引与网页不受影响）。

---

## 4. Windows / macOS 本机试用（Docker Desktop）

1. 复制 `.env.example` 为 `.env`，`HOST_IP` 填本机局域网 IP。
2. `PUBLIC_HOST` 用相对路径，例如 `./library-data`；把资料放到 `library-data/学习资料/`。
3. 确认 Docker Desktop 的文件共享包含项目目录。
4. `docker compose up -d --build`，浏览器访问 `http://127.0.0.1:8090`。

Windows 上的硬链接在某些文件系统/共享配置下可能受限；若 `materialize` 报 `failed`，可忽略分类镜像，其余功能正常。

不装 Docker 也可以直接用 Node 22 运行，见 README 的「方式 C」。

---

## 5. 备份、迁移与升级

### 备份

只需备份 `DATA_HOST` 整个目录：

```bash
# 推荐：先停容器，避免 WAL 写入过程中拷贝
docker compose down
cp -a ./data ./data-backup-$(date +%F)
docker compose up -d
```

`data/` 包含 `library.db`（分类、书架、进度、书签、设置、AI Key）与 `covers/`（封面缓存）。**资料目录本身不属于本项目数据，不需要也不应该由本项目备份。**

### 迁移到新主机

1. 在新主机按同样结构放好资料目录（路径可以不同，改 `.env` 即可）。
2. 复制仓库与 `data/`。
3. `docker compose up -d --build` 后点一次「同步」；扫描会按 `path/size/mtime` 重新对齐索引，`dir_path` 会自动重算，进度、书签、书架均保留。

### 升级

```bash
git pull
docker compose up -d --build
```

数据库会在启动时执行字段迁移（`PRAGMA table_info` → `ALTER TABLE ADD COLUMN`），**不删库、不重置数据**。只有明确执行 `RESET_DB=1` 或手动删除 `library.db` 才会重建索引。

### 卸载（不碰资料）

```bash
docker compose down
# 确认 data/ 与项目目录，按需删除；资料目录与 _图书馆分类 是独立文件，不会自动删除
```

`_图书馆分类` 里是与原件共享 inode 的硬链接：删除链接不影响原文件。若想清理，直接删除该目录即可，**不要**在编辑器里改写其中的文件。

---

## 6. 排障

| 现象 | 原因与处理 |
| --- | --- |
| 其他设备打不开 | `HOST_IP` 填成了 `127.0.0.1` 或填错；改成主机真实局域网 IP，检查防火墙与 `docker compose ps` 的端口映射 |
| 返回 `403 本站点仅供局域网访问` | 请求来源 IP 不在私有网段（常见于反向代理、容器网桥、Docker Desktop 的 NAT）；本项目刻意如此设计，不要用反代「绕过」 |
| 返回 `401 需要访问口令` | 已开启 PIN，先在登录框输入；忘记口令可在数据库中清空 `settings` 表的 `pin_hash` 后重启 |
| `materialize` 的 `failed` 很多 | 硬链接跨挂载点（`EXDEV`）。检查 `PUBLIC_HOST` 是否为单一 bind mount；把资料与镜像放到同一卷 |
| 导入失败 / `EXDEV` | 上传临时文件与目标文件不在同一挂载点；新版已改为在目标目录内创建 `.upload_*.part`，若仍失败请检查目录权限 |
| 扫描数量与文件数不一致 | 噪音文件被有意排除：`@eaDir`、`Thumbs.db`、`desktop.ini`、`.tmp/.part/.crdownload`、隐藏文件、超过 12 层的目录、带「封面/cover」字样的图片（`is_asset`） |
| PDF 中文乱码 / 缺字 | 确认 `public/vendor/cmaps/` 与 `standard_fonts/` 随镜像一起部署（它们已内置，不要用 CDN 替换） |
| 封面迟迟不出现 | PDF 首页由浏览器首次打开时渲染并回传；超大文件（> 260 MB）会跳过。查看 `/api/state` 的 `covers` 计数，或手动 `POST /api/cover/:id` |
| RMVB / FLV / MKV 无法播放 | 浏览器不支持这些编码；点击下载，用本地播放器打开 |
| 容器反复重启 | `docker compose logs` 看报错；常见为 `PUBLIC_HOST` 路径不存在、目录无写权限、Node 镜像未拉取成功 |
| AI 提示无法连接 | 只有 AI 问答需要外网；检查 NAS 的 DNS / 出网策略与 `baseUrl`，用 `POST /api/ai/test` 验证 |

### 性能参考

- 索引是 SQLite 表，扫描只 `readdir` + `stat`，不读取文件内容：6000+ 文件的全量扫描约 1 秒，增量扫描更快。
- 首次启动会执行一次全量扫描；之后按 `SCAN_INTERVAL_MIN` 定时执行。
- 封面缓存按需生成，一张 JPEG 通常几十 KB；只对可视区域内的 PDF 排队渲染，并跳过超大文件。
- 视频 / 大 PDF 通过 HTTP Range 流式读取，不会整文件载入内存；导入请求体上限 16 MB 适用于一般电子书，超大文件建议直接放到资料目录后触发扫描。

---

## 7. 不建议做的事

- ❌ 把 8090 端口映射到公网、配置 DDNS / FRP / 内网穿透。
- ❌ 在公网上加一层反向代理「顺便」对外提供访问——本项目没有账号体系、限流与 WAF。
- ❌ 直接编辑 `_图书馆分类` 里的硬链接文件（改动会同步到原件）。
- ❌ 用 `RESET_DB=1` 当作常规升级手段（会丢失进度、书签与自建书架）。
- ❌ 把 `.env`（含内网地址与路径）提交到公开仓库。
