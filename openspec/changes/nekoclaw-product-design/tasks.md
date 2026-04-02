## 1. 项目骨架与基础设施

- [x] 1.1 创建项目目录骨架：nekoclaw-backend、nekoclaw-portal、nekoclaw-llm-proxy、nekoclaw-artifacts、deploy、scripts、ee
- [x] 1.2 初始化根级配置文件：features.yaml、docker-compose.yml、docker-compose.ee.yml、.gitignore、README.md
- [x] 1.3 初始化后端 Python 工程与依赖管理（pyproject.toml、alembic.ini、基础包）
- [x] 1.4 初始化 Portal 前端工程（Vite + Vue 3 + TypeScript + Tailwind CSS）
- [x] 1.5 初始化 EE Admin 前端工程（Vite + Vue 3 + TypeScript + shadcn-vue）
- [x] 1.6 初始化 LLM Proxy 工程与基础运行配置
- [x] 1.7 建立 openspec、开发命令、环境变量示例和本地开发启动脚本

## 2. 后端核心框架

- [x] 2.1 实现 FastAPI 主入口、lifespan、日志配置和数据库连接初始化
- [x] 2.2 实现 core/config、core/exceptions、core/deps、core/hooks 基础模块
- [x] 2.3 实现 BaseModel、时间戳混入、软删除能力和 UUID 主键规范
- [x] 2.4 建立 Alembic 异步迁移配置和第一批基础迁移
- [x] 2.5 实现统一 ApiResponse schema 和公共响应封装
- [x] 2.6 建立 API 路由聚合入口与 v1 路由前缀结构

## 3. CE/EE 架构与功能开关

- [x] 3.1 实现 FeatureGate：ee 目录检测、features.yaml 加载、功能启停判断
- [x] 3.2 实现 DeploymentAdapter 抽象与 CE 基础实现
- [x] 3.3 实现 EmailTransport 抽象与 CE 基础实现
- [x] 3.4 实现 OrgProvider 抽象与 CE 基础实现
- [x] 3.5 实现 QuotaChecker 抽象与 CE 基础实现
- [x] 3.6 建立 EE 条件导入机制和 EE models 注册入口
- [x] 3.7 实现 Hooks 事件系统并预留审计日志等 EE 扩展点

## 4. 认证、组织与权限

- [x] 4.1 实现 User、Organization、OAuthConnection、OrgMembership 等核心模型
- [x] 4.2 实现 OAuth 登录流程、用户创建或同步、组织绑定逻辑
- [x] 4.3 实现 JWT access token、refresh token 和鉴权依赖
- [x] 4.4 实现 AuthActor 上下文和请求链路注入
- [x] 4.5 实现 KubeConfig AES-256-GCM 加密与解密能力
- [x] 4.6 实现组织级与实例级角色权限校验

## 5. 猫咪领域模型与实例生命周期

- [x] 5.1 实现 Instance、DeployRecord、Cluster 等核心模型与关联关系
- [x] 5.2 设计并落库猫咪外观与个性字段：品种、毛色、性格标签、主题色
- [x] 5.3 实现实例 CRUD、软删除和列表查询过滤
- [x] 5.4 实现实例状态机与猫咪状态映射
- [x] 5.5 实现资源配置校验：CPU、内存、存储、replicas、provider
- [x] 5.6 实现实例成员管理和权限模型

## 6. K8s 集成与领养部署流程

- [x] 6.1 实现 K8sClient、client manager 和集群连接测试能力
- [x] 6.2 实现 resource builder：Namespace、ConfigMap、PVC、Deployment、Service、Ingress、NetworkPolicy
- [x] 6.3 实现两阶段领养流程：同步创建记录 + 异步后台任务
- [x] 6.4 实现 9 步部署管道与失败回滚或失败标记逻辑
- [x] 6.5 实现 EventBus 发布订阅能力和 adopt_progress 事件模型
- [x] 6.6 实现 SSE 进度接口并与前端 fetch-event-source 对接
- [x] 6.7 实现部署日志记录、超时处理和最终状态收敛

## 7. 猫窝系统与实时协同

- [x] 7.1 实现 Workspace、WorkspaceMember、WorkspaceMessage、WorkspaceObjective 等模型
- [x] 7.2 实现猫窝 CRUD、成员管理、角色权限和目标管理 API
- [x] 7.3 实现留言板系统：Blackboard、Post、Reply、附件能力
- [x] 7.4 实现 WorkspaceAgent 绑定关系与六边形坐标字段
- [x] 7.5 实现实时消息广播和任务委派通道
- [x] 7.6 设计人类节点与猫咪节点在同一拓扑中的展示数据结构

## 8. 猫技系统与训练场

- [x] 8.1 实现 Gene、Genome、InstanceGene、GeneEffectLog、GeneRating 模型
- [x] 8.2 实现猫技 CRUD、分类、标签、来源和可见性能力
- [x] 8.3 实现猫技安装流程和实例学习任务下发
- [x] 8.4 实现 learn、forget、create 三种进化流程状态管理
- [x] 8.5 实现训练场列表、搜索、评分和技能套装安装能力
- [x] 8.6 实现使用计数、自评记录和效果追踪

## 9. 猫道、猫粮站与铃铛

- [ ] 9.1 实现内部猫道 WebSocket Tunnel 认证、心跳和重连机制
- [ ] 9.2 实现钉钉猫道消息接入与回复链路
- [ ] 9.3 实现训练猫道任务分发与结果回传
- [ ] 9.4 定义 Channel 插件接口并完成核心插件注册机制
- [ ] 9.5 实现 LLM Proxy 多 Provider 路由、代理鉴权和流式转发
- [ ] 9.6 实现组织级 quota 检查与 token usage 记录
- [ ] 9.7 实现多运行时安全层协议：TypeScript、Python、Rust
- [ ] 9.8 实现安全层 kill switch 和 fail-open 降级逻辑

## 10. Portal 前端与猫咪主题体验

- [ ] 10.1 搭建 portal 路由、main.ts、App.vue、Pinia、vue-i18n、Tailwind 入口
- [ ] 10.2 实现 auth、org、workspace、cluster、gene store
- [ ] 10.3 实现 Axios API 封装、请求拦截器、401 跳转和错误处理
- [ ] 10.4 实现登录页、实例列表、实例详情、创建实例、领养进度等核心页面
- [ ] 10.5 实现 useFeature 等 composables 和 EE route stub 机制
- [ ] 10.6 实现猫咪状态动画、暖色主题变量和猫咪化操作文案
- [ ] 10.7 实现领养进度页的孵化动画与 6 分钟超时保护
- [ ] 10.8 实现猫窝 Three.js 3D 视图、hex grid、猫咪节点与装饰物渲染

## 11. EE Admin 前端

- [ ] 11.1 搭建 ee/nekoclaw-frontend 独立项目结构与构建配置
- [ ] 11.2 集成 shadcn-vue 基础组件和样式系统
- [ ] 11.3 实现组织管理页面：列表、详情、成员、删除与编辑
- [ ] 11.4 实现用户管理页面和跨组织用户视图
- [ ] 11.5 实现套餐与配额管理页面
- [ ] 11.6 实现平台级系统设置与基础统计页面

## 12. 国际化、测试与交付

- [ ] 12.1 建立 zh-CN 与 en-US 词条文件并统一猫咪术语体系
- [ ] 12.2 实现后端错误 message_key 输出与前端本地翻译回退逻辑
- [ ] 12.3 为核心服务补充单元测试：认证、实例、部署、FeatureGate
- [ ] 12.4 为 Portal 核心页面补充组件或集成测试
- [ ] 12.5 完成 Dockerfile、镜像构建脚本和 linux/amd64 目标配置
- [ ] 12.6 完成 docker-compose 与 deploy/k8s 基础部署制品
- [ ] 12.7 完成 README、开发指南和 MVP 启动验证清单