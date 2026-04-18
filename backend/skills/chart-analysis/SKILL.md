---
name: chart-analysis
description: 使用 Python 分析数据并生成图表
triggers:
  - 画图
  - 图表
  - chart
  - 数据可视化
  - 柱状图
  - 折线图
  - 饼图
  - plot
requires_tools:
  - python_repl
author: system
version: "1.0"
---

# 数据图表分析

## 使用场景
用户提供数据并希望生成图表进行可视化分析，或者需要对数据进行统计分析。

## 步骤

1. 理解用户的数据和需求：
   - 数据来源（用户直接提供 / 文件中的数据）
   - 图表类型（柱状图、折线图、饼图、散点图等）
   - 分析目标（趋势、分布、对比等）

2. 使用 `python_repl` 编写并执行 Python 代码：
   ```python
   import matplotlib
   matplotlib.use('Agg')  # 非交互模式
   import matplotlib.pyplot as plt
   import matplotlib.font_manager as fm
   
   # 设置中文字体
   plt.rcParams['font.sans-serif'] = ['SimHei', 'Microsoft YaHei', 'DejaVu Sans']
   plt.rcParams['axes.unicode_minus'] = False
   
   # 准备数据
   # ... 根据用户数据填充
   
   # 创建图表
   fig, ax = plt.subplots(figsize=(10, 6))
   # ... 根据需求绘制
   
   ax.set_title('标题')
   ax.set_xlabel('X轴')
   ax.set_ylabel('Y轴')
   
   plt.tight_layout()
   plt.savefig('/tmp/chart.png', dpi=150)
   plt.close()
   print("图表已保存到 /tmp/chart.png")
   ```

3. 向用户描述图表中的关键发现和趋势。

## 常用图表模板

### 柱状图
```python
ax.bar(categories, values, color='#4C72B0')
```

### 折线图
```python
ax.plot(x, y, marker='o', linewidth=2)
```

### 饼图
```python
ax.pie(sizes, labels=labels, autopct='%1.1f%%', startangle=90)
```

## 注意事项
- 始终设置中文字体支持
- 使用 `Agg` 后端避免显示窗口
- 图表保存到 `/tmp/` 目录
- 添加适当的标题、轴标签和图例
