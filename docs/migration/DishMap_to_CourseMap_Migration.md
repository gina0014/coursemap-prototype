# DishMap → CourseMap 领域迁移记录（Migration）

> 本文档是旧餐饮术语**唯一允许出现**的地方（生产 Runtime 不得残留）。
> 它存在的目的：证明 CourseMap 不是 DishMap 的机械换名（rename），
> 而是一次 DOMAIN REMODELING。

## 1. 旧 → 新核心链路

```
DishMap:  Dish → Restaurant → Price → Rating → Value Score → Distance（地理地图）
CourseMap: Learning Goal → Learning Resource → Provider → Cost → Difficulty
           → Duration → Quality → Learning Path → Evidence
```

结构性变化：

- 浏览主单位从 **Provider（餐厅）** 变为 **Learning Resource（资源）**，
  且入口从「位置」变为「学习目标」。
- 搜索单位从 Dish（菜品）变为 Learning Resource；Goal 成为一等实体。
- 「地理地图」整体删除，替换为 Learning Path（学习路径）。
- Value Score（加权合成总分）删除；v0.1 明确不合成总分，分指标一等展示。

## 2. 逐模块决策（REUSED / REFACTORED / REWRITTEN / DELETED）

| 模块 | 决策 | 说明 |
| --- | --- | --- |
| `css/reset.css` / `layout.css` / `responsive.css` | **REUSED** | 领域无关的响应式骨架（CSS 变量前缀 `--dm-`→`--cm-`） |
| `css/components.css` / `pages.css` | **REFACTORED** | 卡片系统 / 状态组件复用，餐饮语义类名与配色全部重写（`.dish-card`→`.resource-card`），视觉从 Food/Warm 改为 Learning/Trust（靛蓝+青玉） |
| `js/utils.js` | **REUSED** | 通用工具（esc / money / parseQuery / daysSince 等），仅注释与 tiebreak 字段名改写 |
| `js/storage.js` | **REWRITTEN** | 存储骨架复用；数据结构完全重写为收藏资源/目标 + 结构化学习评价（旧结构无教育语义） |
| `js/config.js` | **REWRITTEN** | 阈值/检索预设/存储键全部按教育领域重新定义；新增 FIT_SCORE 实验位与 AI 配置 |
| `js/labels.js` | **REWRITTEN** | 枚举字典：难度 / 学习模式 / 语言 / 完成状态 / 学习标签 / 来源类型等 |
| `js/data-loader.js` | **REWRITTEN**（骨架 REUSED） | 单点数据访问 + 级联可见性机制复用；实体清单与关系全部教育化 |
| `js/search.js` | **REWRITTEN** | 搜索/筛选从菜品/餐厅/价格改为资源/目标/预算/时长/负荷等 12 维 |
| `js/components.js` | **REWRITTEN**（组件族 REUSED） | 卡片 / 徽标 / 状态 / 对比表 / 来源区块全部按教育语义与治理规则重写 |
| `js/ai-advisor.js` | **NEW** | 旧项目没有 AI 层。LearningDecisionRequest/Response + 规则解析 + LLM Adapter 位 |
| `js/derive.js` | **NEW**（思想 REUSED） | 「派生计算单一真源」原则保留；全部计算按教育口径重写（评分聚合 / 费用观测 / 对比统计 / 路径视图） |
| `js/pages/*`（12 个页面控制器） | **REWRITTEN** | base.js 引导机制 REUSED；页面结构与断言全部教育化（首页/搜索/详情/对比/路径/收藏/评价/顾问/方法论/关于/404） |
| 地理地图页与定位逻辑（dish-map / ORIGIN / 商圈） | **DELETED** | 教育领域无地理语义，学习路径取代之 |
| Value Score 计算 | **DELETED** | 加权合成分子无教育效度；保留实验性接口位（FIT_SCORE，enabled=false） |
| 餐厅评分体系 | **DELETED** | Provider 级评分被领域规则禁止；评分只属于 Resource 且必须带样本量 |
| Demo 数据集（菜品/餐厅 JSON） | **DELETED + REGENERATED** | 由 `scripts/build/generate_demo_dataset.py` 生成全新教育数据集 |
| CDP 浏览器冒烟探针 | **REFACTORED** | 探针机制复用（附加式导航 / 控制台取证 / 截图证据），目标与断言全部重写 |
| Node 测试套件 | **REWRITTEN** | 75 项断言覆盖教育域功能与 MoT #1–#6 |

## 3. 运行时清理验证

对 `js/`、`css/`、`data/`、`pages/`、`index.html`、`404.html`、`tests/`、
`scripts/` 全量扫描旧业务词：dish / restaurant / food / taste / portion /
商圈 / 叉烧 / 烧鹅 / 肠粉 / 餐厅 / 菜品 / finding-dish 等——
**生产 Runtime 命中 = 0**（docs/migration 本文档除外）。
扫描方式与结果见最终报告。

## 4. 为什么这不是换皮

1. 实体模型不同：新增 Goal / Skill / Path / Source / Fee_History 等
   旧系统完全不存在的实体与关系。
2. 主浏览单位反转：Restaurant-first → Goal/Resource-first。
3. 核心交互不同：地理检索 → 目标检索 + 跨资源比较 + 路径规划。
4. 治理规则不同：评分样本量、费用观测语义、DEMO 披露、AI 披露全部新建。
5. 复用仅限于**领域无关的工程资产**（响应式骨架、状态机模式、探针机制、
   存储模式），所有领域语义层都是新写的。
