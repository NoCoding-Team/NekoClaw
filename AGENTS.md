# AGENTS.md - Git 规范

## Git 规范

### 分支命名

格式：`<type>/<kebab-case-description>`

- 前缀：`feat`、`fix`、`refactor`、`chore`、`docs`、`perf`、`test`、`build`
- description 使用 kebab-case，2-5 个词，描述分支做什么
- 特殊分支：`main`、`release-<version>`

```
feat/instance-search
fix/deploy-env-serialize
refactor/ce-ee-split
chore/upgrade-fastapi
```

禁止无意义名称（`cccc`、`temp`）、纯日期名称、`feature/` 全称、中文/大写/下划线。

### PR 标题

格式与 commit message 一致：`<type>(<scope>): <中文描述>`，概括整个 PR 的变更目标。

```
feat(backend): 猫咪实例生命周期管理
fix(portal): 修复实例列表分页后状态丢失问题
```

### 自动提交

- 每完成一个单元性改动后，必须立即提交 commit，不要攒多个独立改动一起提交
- 单元性改动指：一个可独立描述、可独立验证、可独立回滚的最小完整改动（如一个 bug 修复、一次样式微调、一次规则更新）
- 只有多个修改明确属于同一个改动单元时，才允许合并为一个 commit

### Commit Message 格式

```
<type>(<scope>): <subject>
```

- type：feat、fix、docs、style、refactor、perf、test、chore
- subject：**必须使用中文**，祈使语态，50字符内

### 示例

```
feat(instance): 实例列表新增搜索和过滤功能
fix(deploy): 修复 env_vars 存数据库未序列化的问题
```

### 禁止

- 禁止 `Co-authored-by` 署名
- 禁止提交 `.env`、`.venv/`、`node_modules/`
