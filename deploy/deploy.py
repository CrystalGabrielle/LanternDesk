#!/usr/bin/env python3
"""可选辅助脚本：把本项目上传到一台支持 Docker Compose 的 NAS / Linux 主机并启动。

这不是运行项目的必需步骤——直接用 ``docker compose up -d --build`` 即可。
脚本主要面向群晖 Container Manager（默认未开放 SFTP 子系统，故用 SSH 通道传 tar 包）。

凭据只从环境变量读取，不写入任何文件，也不会出现在远程命令行里（通过 sudo 的 stdin 传入）：

    NAS_HOST=192.168.x.x NAS_USER=your_user NAS_PWD=your_password \
        python deploy/deploy.py

可选环境变量：
    NAS_REMOTE_DIR   远程项目目录      默认 /volume1/docker/lan-library
    NAS_DOCKER_BIN   docker 可执行路径 默认 /var/packages/ContainerManager/target/usr/bin/docker
    NAS_PORT         站点端口          默认 8090
    NAS_SUDO         是否需要 sudo     默认 1；普通用户在 docker 组时可设为 0
    RESET_DB         设为 1 会删除远端数据库并重建索引（会丢失进度/书签，谨慎！）

依赖：pip install paramiko
"""
import os, sys, time, json

try:
    import paramiko
except ImportError:
    sys.exit('缺少依赖：请先执行 pip install paramiko')


def env(name, default=None, required=False):
    v = os.environ.get(name, default)
    if required and not v:
        sys.exit(f'缺少环境变量 {name}，用法见 deploy/deploy.py 顶部说明')
    return v


HOST = env('NAS_HOST', required=True)
USER = env('NAS_USER', required=True)
PWD = env('NAS_PWD', required=True)
REMOTE = env('NAS_REMOTE_DIR', '/volume1/docker/lan-library')
DOCKER = env('NAS_DOCKER_BIN', '/var/packages/ContainerManager/target/usr/bin/docker')
SITE_PORT = env('NAS_PORT', '8090')
USE_SUDO = env('NAS_SUDO', '1') != '0'
LOCAL = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 只上传运行所需文件；文档、仓库元数据与本地验证产物不进 NAS
SKIP_DIRS = {'_test', '_t2', 'deploy', '.git', '.github', 'docs', 'data',
             'node_modules', '__pycache__', 'screenshots'}
SKIP_FILES = {
    '.DS_Store', 'Thumbs.db', '.gitignore', '.env.example', 'LICENSE',
    'README.md', 'README.en.md', 'CONTRIBUTING.md', 'SECURITY.md',
    'CHANGELOG.md', 'THIRD_PARTY_NOTICES.md',
}


def log(*a):
    print(*a, flush=True)


def collect():
    out = []
    for root, dirs, files in os.walk(LOCAL):
        dirs[:] = [d for d in dirs if d not in SKIP_DIRS]
        for f in files:
            if f in SKIP_FILES:
                continue
            if f.startswith('_') and f.endswith(('.html', '.txt', '.err', '.png')):
                continue
            if f.endswith(('.log', '.db', '.db-wal', '.db-shm')):
                continue
            full = os.path.join(root, f)
            rel = os.path.relpath(full, LOCAL).replace(os.sep, '/')
            out.append((full, rel))
    return sorted(out, key=lambda x: x[1])


def sudo(cmd):
    """把密码通过 stdin 交给 sudo，避免密码出现在远程命令行 / 进程列表。"""
    return f"sudo -S -p '' {cmd}" if USE_SUDO else cmd


def stream(ssh, cmd, timeout=900, stdin_data=None):
    ch = ssh.get_transport().open_session()
    ch.settimeout(5)
    ch.exec_command(cmd)
    if stdin_data is not None:
        ch.sendall((stdin_data + '\n').encode())
        ch.shutdown_write()
    start, chunks = time.time(), []
    while True:
        for ready, recv in ((ch.recv_ready(), ch.recv), (ch.recv_stderr_ready(), ch.recv_stderr)):
            if ready:
                d = recv(65536).decode('utf8', 'replace')
                chunks.append(d)
                sys.stdout.write(d)
                sys.stdout.flush()
        if ch.exit_status_ready() and not ch.recv_ready() and not ch.recv_stderr_ready():
            break
        if time.time() - start > timeout:
            log('\n[deploy] 命令超时')
            break
        time.sleep(0.25)
    rc = ch.recv_exit_status()
    ch.close()
    return rc, ''.join(chunks)


def exec_with_stdin(ssh, cmd, stdin_data=None):
    stdin, out, err = ssh.exec_command(cmd)
    if stdin_data is not None:
        stdin.write(stdin_data + '\n')
        stdin.flush()
        stdin.channel.shutdown_write()
    return out.read().decode('utf8', 'replace'), err.read().decode('utf8', 'replace')


def main():
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    ssh.connect(HOST, username=USER, password=PWD, timeout=20,
                look_for_keys=False, allow_agent=False)
    log('[deploy] SSH 已连接', HOST)

    files = collect()
    total = sum(os.path.getsize(a) for a, _ in files)
    log(f'[deploy] 待上传 {len(files)} 个文件 / {total / 1024 / 1024:.1f} MB')

    # 部分 NAS 未开放 SFTP 子系统，改用 tar.gz + base64 走 SSH exec 通道一次传完
    import io, tarfile, base64
    buf = io.BytesIO()
    with tarfile.open(fileobj=buf, mode='w:gz', compresslevel=6) as tf:
        for full, rel in files:
            tf.add(full, arcname=rel, recursive=False)
    payload = base64.b64encode(buf.getvalue())
    log(f'[deploy] 打包完成，传输 {len(payload) / 1024 / 1024:.2f} MB')

    ch = ssh.get_transport().open_session()
    ch.settimeout(60)
    ch.exec_command(f"mkdir -p {REMOTE}/data && cd {REMOTE} && base64 -d | tar xzf - && echo UNPACK_OK")
    for i in range(0, len(payload), 32768):
        ch.sendall(payload[i:i + 32768])
    ch.shutdown_write()
    chunks, start = [], time.time()
    while True:
        if ch.recv_ready():
            chunks.append(ch.recv(65536).decode('utf8', 'replace'))
        if ch.recv_stderr_ready():
            chunks.append(ch.recv_stderr(65536).decode('utf8', 'replace'))
        if ch.exit_status_ready() and not ch.recv_ready() and not ch.recv_stderr_ready():
            break
        if time.time() - start > 180:
            log('[deploy] 解包超时')
            break
        time.sleep(.2)
    rc = ch.recv_exit_status()
    ch.close()
    text = ''.join(chunks)
    log('[deploy] 解包 rc =', rc, text.strip()[:300])
    if rc != 0 or 'UNPACK_OK' not in text:
        log('[deploy] 上传失败')
        ssh.close()
        return 1
    log('[deploy] 上传完成')

    # 校验关键文件是否存在（不打印 .env 内容，避免泄露本地路径）
    _, o, _ = ssh.exec_command(
        f"cd {REMOTE} && test -f .env && echo ENV_OK; "
        f"test -f docker-compose.yml && echo COMPOSE_OK; "
        f"test -f server/index.js && echo SERVER_OK")
    log('[deploy]', o.read().decode('utf8', 'replace').strip().replace('\n', ' / '))

    extra = ''
    if os.environ.get('RESET_DB') == '1':
        o2, _ = exec_with_stdin(ssh, sudo('sh -c "rm -f '
            f'{REMOTE}/data/library.db {REMOTE}/data/library.db-wal '
            f'{REMOTE}/data/library.db-shm"') + ' && echo DB_RESET', PWD if USE_SUDO else None)
        log('[deploy]', o2.strip())
        extra = ' --force-recreate'

    cmd = f"cd {REMOTE} && {sudo(f'{DOCKER} compose up -d --build{extra}')} 2>&1"
    log('[deploy] 开始构建并启动容器（首次需拉取 node 镜像，可能数分钟）…')
    rc, out = stream(ssh, cmd, timeout=1200, stdin_data=PWD if USE_SUDO else None)
    log('[deploy] compose exit =', rc)

    o3, _ = exec_with_stdin(ssh, sudo(
        f"{DOCKER} ps --filter name=lan-library --format '{{{{.Names}}}}|{{{{.Status}}}}|{{{{.Ports}}}}'"
    ), PWD if USE_SUDO else None)
    log('[deploy] 容器状态:', o3.strip())

    # 从 NAS 本机探测，避免开发机沙箱对内网端口的拦截。
    # compose 默认只绑定 HOST_IP（局域网 IP），因此优先探测该地址，再兜底 127.0.0.1。
    probes = [f"curl -s -m 6 http://{HOST}:{SITE_PORT}/api/state",
              f"curl -s -m 6 http://127.0.0.1:{SITE_PORT}/api/state"]
    for i in range(30):
        for probe in probes:
            _, o4, _ = ssh.exec_command(probe)
            txt = o4.read().decode('utf8', 'replace').strip()
            try:
                d = json.loads(txt)
                log('[deploy] 站点已就绪:', json.dumps(
                    {k: d.get(k) for k in ('total', 'shelves', 'covers', 'lastScanAt', 'intervalMin')},
                    ensure_ascii=False))
                log(f'[deploy] 访问地址: http://{HOST}:{SITE_PORT}')
                ssh.close()
                return 0
            except Exception:
                pass
        time.sleep(2)
    log('[deploy] 站点暂未响应，请检查容器日志：', probes[0])
    ssh.close()
    return 1


if __name__ == '__main__':
    sys.exit(main())
