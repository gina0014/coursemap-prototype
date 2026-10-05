# 04 · 信息架构（Information Architecture）

## 导航结构

```
首页（index.html）
├── 找课程（pages/search.html?q=&goal=&...）
│    ├── 学习资源详情（pages/resource.html?id=）
│    │    └── 写学习评价（pages/review.html?resource_id=）
│    ├── 提供方详情（pages/provider.html?id=）
│    └── 同目标对比（pages/compare.html?goal=）
├── 学习路径（pages/paths.html）
│    └── 路径详情（pages/path.html?id=）
├── 课程对比（pages/compare.html —— 从目标进入）
├── 收藏（pages/favorites.html）
├── 数据方法论（pages/data-methodology.html）
├── 关于（pages/about.html）
└── AI 学习顾问（pages/advisor.html）—— Preview
404（404.html）
```

## 设计原则

1. **首页即决策入口**：Hero 文案「今天想学什么？」直接表达核心主张
   「按学习目标找资源，而不是先找平台再翻课程」。
2. **目标优先于平台**：搜索与浏览的主轴是 Learning Goal，Provider 是资源的属性
   而非浏览主单位（与 DishMap 的 Restaurant-first 相反）。
3. **详情回答决策问题**：资源详情页结构按 15 个决策问题组织。
4. **治理入口始终可见**：数据方法论、来源与核验状态从导航可达。
5. **URL 即状态**：筛选与视图状态全部编码在 query parameter 中，可分享可回退。

## 页面与 MoT 对应

| 页面 | 承担的 MoT |
| --- | --- |
| 首页 | MoT #1 |
| 找课程 | MoT #2 |
| 同目标对比 | MoT #3 |
| 资源详情 | MoT #4 |
| 学习路径 | MoT #5 |
| AI 学习顾问 | MoT #6 |

## 命名规范

运行时语义一律使用教育领域术语（resource / goal / skill / provider / path /
review / source），文件名、路由、CSS class、JSON key 保持一致；
旧餐饮术语仅允许出现在 `docs/migration/` 中。
