# 08 · 数据来源与治理（Source Governance）

## 数据类别（data_class）

- `demo`：编辑构造的演示数据。页面必须渲染**不可隐藏**的 DEMO 徽标
  （`badgeDemo`），首页与详情页均有全局 Demo 提示条。
- `real`：可合法公开核验的真实信息。**必须有 Source 关联**（VR-C05），
  且记录 source URL / observed date / verification status / field scope。

本版本（v0.1）全部数据为 demo。

## Source 类型

| source_type | 说明 | 允许的采集方式 |
| --- | --- | --- |
| official_provider | 课程/资源官方页面 | 人工查阅并记录 URL + 观测日期 |
| university_site | 大学官方页面 | 人工查阅 |
| open_education | 政府开放教育资源 | 人工查阅 / 开放 API |
| authorized_api | 明确授权的 API | 按 API 条款 |
| editor_demo | 编辑构造的演示来源 | 仅限 demo 数据 |

**禁止**：未经授权批量抓取受限制商业平台的课程信息、评价或内容；
猜测价格、评分、证书与课时。

## 治理状态机

```
draft → pending → published
```

- 前端只展示 `published`（`config.VISIBLE_STATUS`）。
- 级联可见性：Resource 依赖 Provider / Subject / Goal 全部 published 才可见；
  Review / Fee 依赖其 Resource 可见。实现在 `js/data-loader.js`（唯一实现处）。

## 时间字段语义

- `observed_at`：某事实被观察/构造的时间。
- `updated_at`：记录最后一次编辑的时间。
- 费用显示「观测于 YYYY-MM-DD」，超过 `feeRecheckDays`（180 天）显示
  「建议复检」——这是**内部重新核验触发器**，绝不表示「费用在 N 天内有效」。

## 评分统计口径

- 评分聚合只统计该资源自身的 `published` 评价（`js/derive.js` 唯一实现）。
- 显示格式：`★ 4.6 · 12 条评价`。
- 样本 < `ratingMinSample`（3）→ 显示「Limited data（样本不足）」徽标。
- 无评价 → 「暂无评价」；绝不拿 Provider 评分冒充资源评分。

## 未知值

任何无法核验的字段一律 `null`（UI 显示 `—`）。禁止猜、禁止用 0 占位。
