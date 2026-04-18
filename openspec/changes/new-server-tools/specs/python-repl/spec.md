## ADDED Requirements

### Requirement: Python 代码容器化执行
系统 SHALL 在独立 Docker 容器中执行用户提交的 Python 代码，与后端主进程完全隔离。

#### Scenario: 正常代码执行
- **WHEN** Agent 调用 `python_repl` 工具并提供 Python 代码
- **THEN** 系统 SHALL 将代码写入临时文件，通过 Docker SDK 启动临时容器执行，收集 stdout/stderr 作为结果返回

#### Scenario: 容器资源限制
- **WHEN** 容器执行用户代码时
- **THEN** 容器 SHALL 施加以下限制：`--network=none`（禁止网络）、`--memory=256m`、`--cpus=0.5`、`--read-only`（`/tmp` 除外）

#### Scenario: 执行超时
- **WHEN** 代码执行超过 30 秒
- **THEN** 系统 SHALL 强制销毁容器，返回超时错误和已收集的输出

#### Scenario: 容器销毁
- **WHEN** 代码执行完成或超时
- **THEN** 系统 SHALL 立即销毁临时容器（`--rm`），不保留任何状态

#### Scenario: Docker 不可用
- **WHEN** 宿主机未安装 Docker 或 Docker 服务未启动
- **THEN** 系统 SHALL 在启动时检测并禁用 `python_repl` 工具，调用时返回明确错误信息

### Requirement: 预构建 Python 沙盒镜像
系统 SHALL 提供预构建 Docker 镜像，包含常用科学计算库。

#### Scenario: 镜像包含基础库
- **WHEN** 容器启动时
- **THEN** 镜像 SHALL 预装 numpy、pandas、matplotlib、scipy、sympy 等常用库

#### Scenario: 镜像预拉取
- **WHEN** 后端服务启动时
- **THEN** 系统 SHALL 异步检查并拉取沙盒镜像，避免首次调用时的长时间等待
