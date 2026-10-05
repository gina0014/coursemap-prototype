#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
CourseMap — generate_demo_dataset.py

教育领域演示数据集生成器（确定性，随机种子固定，可重复构建）。

设计约束（与 docs/product/08_Source_Governance.md 一致）：
  1. 全部记录 data_class = 'demo'（本原型不引入任何"真实"记录）。
  2. 不伪造任何真实机构 / 真实课程 / 真实评价：Provider 均为虚构演示实体，
     评价由生成器合成并整体标记 demo_dataset。
  3. 评分只由该资源的已发布评价聚合得出（不偷用 Provider 级信息）。
  4. 未知值一律 null（费用未知 / 时长未知 / 证书未知），不得猜测。
  5. ID-based relational computation：不存冗余名称字段
     （如 subject_name / provider_name / goal_name），全部由 ID 关联推导。

运行：
  python scripts/build/generate_demo_dataset.py
输出：data/*.json
"""

import json
import random
from datetime import date, timedelta
from pathlib import Path

HERE = Path(__file__).resolve().parent
DATA = HERE.parent.parent / "data"

random.seed(20261006)

STATUS = "published"
DATA_CLASS = "demo"


def d(days_ago: int) -> str:
    """以 2026-10-05 为构建基准日，返回 ISO 日期。"""
    return (date(2026, 10, 5) - timedelta(days=days_ago)).isoformat()


# ---------------------------------------------------------------------------
# Subjects（5）
# ---------------------------------------------------------------------------
SUBJECTS = [
    {"subject_id": 1, "code": "programming", "name": "编程", "name_en": "Programming",
     "description": "从零基础到能独立写出小工具：Python、命令行与工程习惯。",
     "status": STATUS, "data_class": DATA_CLASS},
    {"subject_id": 2, "code": "data-analysis", "name": "数据分析", "name_en": "Data Analysis",
     "description": "用 Python / SQL / 电子表格处理数据、做图、回答业务与科研问题。",
     "status": STATUS, "data_class": DATA_CLASS},
    {"subject_id": 3, "code": "ai", "name": "人工智能", "name_en": "Artificial Intelligence",
     "description": "机器学习与深度学习基础，以及把 AI 工具用在学习与科研里。",
     "status": STATUS, "data_class": DATA_CLASS},
    {"subject_id": 4, "code": "research-methods", "name": "科研方法", "name_en": "Research Methods",
     "description": "文献检索、统计基础、学术诚信与科研数据分析工作流。",
     "status": STATUS, "data_class": DATA_CLASS},
    {"subject_id": 5, "code": "academic-english", "name": "学术英语", "name_en": "Academic English",
     "description": "学术写作、听说训练与标准化考试（四六级 / 雅思）备考。",
     "status": STATUS, "data_class": DATA_CLASS},
]

# ---------------------------------------------------------------------------
# Skills（轻量技能图，prerequisite_skill_ids = JSON adjacency）
# ---------------------------------------------------------------------------
SKILLS = [
    {"skill_id": 1, "name": "Python 基础", "subject_id": 1, "prerequisite_skill_ids": []},
    {"skill_id": 2, "name": "NumPy 数组计算", "subject_id": 2, "prerequisite_skill_ids": [1]},
    {"skill_id": 3, "name": "Pandas 数据处理", "subject_id": 2, "prerequisite_skill_ids": [2]},
    {"skill_id": 4, "name": "数据可视化", "subject_id": 2, "prerequisite_skill_ids": [3]},
    {"skill_id": 5, "name": "SQL 基础", "subject_id": 2, "prerequisite_skill_ids": []},
    {"skill_id": 6, "name": "统计基础", "subject_id": 4, "prerequisite_skill_ids": []},
    {"skill_id": 7, "name": "R 语言基础", "subject_id": 4, "prerequisite_skill_ids": [6]},
    {"skill_id": 8, "name": "数据清洗", "subject_id": 2, "prerequisite_skill_ids": [3]},
    {"skill_id": 9, "name": "机器学习基础", "subject_id": 3, "prerequisite_skill_ids": [3, 6]},
    {"skill_id": 10, "name": "深度学习入门", "subject_id": 3, "prerequisite_skill_ids": [9]},
    {"skill_id": 11, "name": "AI 工具使用", "subject_id": 3, "prerequisite_skill_ids": []},
    {"skill_id": 12, "name": "文献检索", "subject_id": 4, "prerequisite_skill_ids": []},
    {"skill_id": 13, "name": "学术写作", "subject_id": 5, "prerequisite_skill_ids": [12]},
    {"skill_id": 14, "name": "英语听说基础", "subject_id": 5, "prerequisite_skill_ids": []},
    {"skill_id": 15, "name": "学术词汇", "subject_id": 5, "prerequisite_skill_ids": [14]},
    {"skill_id": 16, "name": "生物信息学基础", "subject_id": 4, "prerequisite_skill_ids": [7]},
    {"skill_id": 17, "name": "单细胞数据分析", "subject_id": 4, "prerequisite_skill_ids": [16]},
    {"skill_id": 18, "name": "Git 与命令行", "subject_id": 1, "prerequisite_skill_ids": []},
]

# ---------------------------------------------------------------------------
# Learning Goals（12，一级实体）
# ---------------------------------------------------------------------------
GOALS = [
    {"goal_id": 1, "name": "Python 入门", "subject_id": 1,
     "description": "从零开始学会用 Python 写程序：语法、函数、文件与一个小项目。",
     "recommended_level": "beginner", "related_skill_ids": [1, 18],
     "prerequisite_goal_ids": [], "next_goal_ids": [2, 4], "aliases": ["python", "py", "编程入门"],
     "status": STATUS, "data_class": DATA_CLASS},
    {"goal_id": 2, "name": "Python 数据分析", "subject_id": 2,
     "description": "用 NumPy / Pandas 完成读取、清洗、分析与可视化一条龙。",
     "recommended_level": "beginner", "related_skill_ids": [2, 3, 4, 8],
     "prerequisite_goal_ids": [1], "next_goal_ids": [4], "aliases": ["数据分析", "pandas", "data analysis"],
     "status": STATUS, "data_class": DATA_CLASS},
    {"goal_id": 3, "name": "R 语言入门", "subject_id": 4,
     "description": "掌握 R 基础语法与 tidyverse 工作流，为统计分析打地基。",
     "recommended_level": "beginner", "related_skill_ids": [7],
     "prerequisite_goal_ids": [5], "next_goal_ids": [6], "aliases": ["r", "r语言"],
     "status": STATUS, "data_class": DATA_CLASS},
    {"goal_id": 4, "name": "机器学习基础", "subject_id": 3,
     "description": "理解常见模型原理并能跑通端到端的小型机器学习项目。",
     "recommended_level": "intermediate", "related_skill_ids": [9],
     "prerequisite_goal_ids": [2], "next_goal_ids": [], "aliases": ["ml", "机器学习"],
     "status": STATUS, "data_class": DATA_CLASS},
    {"goal_id": 5, "name": "科研统计基础", "subject_id": 4,
     "description": "描述统计、假设检验与置信区间：看懂论文里的数字。",
     "recommended_level": "beginner", "related_skill_ids": [6],
     "prerequisite_goal_ids": [], "next_goal_ids": [3, 6], "aliases": ["统计", "statistics"],
     "status": STATUS, "data_class": DATA_CLASS},
    {"goal_id": 6, "name": "单细胞 RNA-seq 入门", "subject_id": 4,
     "description": "从原始数据到细胞分群：单细胞转录组分析的最小工作流。",
     "recommended_level": "advanced", "related_skill_ids": [16, 17],
     "prerequisite_goal_ids": [3, 5], "next_goal_ids": [], "aliases": ["scrna", "单细胞"],
     "status": STATUS, "data_class": DATA_CLASS},
    {"goal_id": 7, "name": "文献检索", "subject_id": 4,
     "description": "高效查找、筛选、管理文献，并跟踪领域最新进展。",
     "recommended_level": "beginner", "related_skill_ids": [12],
     "prerequisite_goal_ids": [], "next_goal_ids": [8], "aliases": ["文献", "检索", "literature"],
     "status": STATUS, "data_class": DATA_CLASS},
    {"goal_id": 8, "name": "学术英语写作", "subject_id": 5,
     "description": "从段落逻辑到投稿信：写出结构清晰、表达地道的学术文本。",
     "recommended_level": "intermediate", "related_skill_ids": [13, 15],
     "prerequisite_goal_ids": [7], "next_goal_ids": [], "aliases": ["写作", "academic writing", "论文写作"],
     "status": STATUS, "data_class": DATA_CLASS},
    {"goal_id": 9, "name": "英语六级", "subject_id": 5,
     "description": "六级听力、阅读、写作与翻译的系统备考路线。",
     "recommended_level": "intermediate", "related_skill_ids": [14, 15],
     "prerequisite_goal_ids": [], "next_goal_ids": [], "aliases": ["cet6", "六级", "cet-6"],
     "status": STATUS, "data_class": DATA_CLASS},
    {"goal_id": 10, "name": "AI 工具使用", "subject_id": 3,
     "description": "把 AI 助手用在学习、写作与编程里：提示词、边界与核验。",
     "recommended_level": "beginner", "related_skill_ids": [11],
     "prerequisite_goal_ids": [], "next_goal_ids": [], "aliases": ["ai工具", "chatgpt", "提示词"],
     "status": STATUS, "data_class": DATA_CLASS},
    {"goal_id": 11, "name": "数据可视化", "subject_id": 2,
     "description": "选择正确的图表，把数据讲成一个可信的故事。",
     "recommended_level": "beginner", "related_skill_ids": [4],
     "prerequisite_goal_ids": [2], "next_goal_ids": [], "aliases": ["可视化", "visualization"],
     "status": STATUS, "data_class": DATA_CLASS},
    {"goal_id": 12, "name": "SQL 与数据库入门", "subject_id": 2,
     "description": "从 SELECT 到 JOIN：查询和分析数据库里的业务数据。",
     "recommended_level": "beginner", "related_skill_ids": [5],
     "prerequisite_goal_ids": [], "next_goal_ids": [], "aliases": ["sql", "数据库"],
     "status": STATUS, "data_class": DATA_CLASS},
]

# ---------------------------------------------------------------------------
# Providers（10，全部为虚构演示实体，DEMO 由 data_class + UI 徽标呈现）
# ---------------------------------------------------------------------------
PROVIDERS = [
    {"provider_id": 1, "name": "示范大学在线（DEMO）", "provider_type": "university_open",
     "description": "虚构的大学开放课程平台演示实体，用于原型数据。",
     "status": STATUS, "data_class": DATA_CLASS},
    {"provider_id": 2, "name": "云岭开放课程平台（DEMO）", "provider_type": "mooc_platform",
     "description": "虚构的 MOOC 平台演示实体。",
     "status": STATUS, "data_class": DATA_CLASS},
    {"provider_id": 3, "name": "极舟学堂（DEMO）", "provider_type": "training_studio",
     "description": "虚构的小型训练营演示实体。",
     "status": STATUS, "data_class": DATA_CLASS},
    {"provider_id": 4, "name": "星洲大学公开课（DEMO）", "provider_type": "university_open",
     "description": "虚构的大学公开课演示实体。",
     "status": STATUS, "data_class": DATA_CLASS},
    {"provider_id": 5, "name": "码巢开源学习社区（DEMO）", "provider_type": "community",
     "description": "虚构的开源社区学习频道演示实体。",
     "status": STATUS, "data_class": DATA_CLASS},
    {"provider_id": 6, "name": "青檬数据学院（DEMO）", "provider_type": "training_studio",
     "description": "虚构的数据技能培训演示实体。",
     "status": STATUS, "data_class": DATA_CLASS},
    {"provider_id": 7, "name": "湖畔外语学习中心（DEMO）", "provider_type": "language_center",
     "description": "虚构的语言学习机构演示实体。",
     "status": STATUS, "data_class": DATA_CLASS},
    {"provider_id": 8, "name": "木铎学术工坊（DEMO）", "provider_type": "research_workshop",
     "description": "虚构的科研方法工作坊演示实体。",
     "status": STATUS, "data_class": DATA_CLASS},
    {"provider_id": 9, "name": "南山理工公开课（DEMO）", "provider_type": "university_open",
     "description": "虚构的理工类公开课演示实体。",
     "status": STATUS, "data_class": DATA_CLASS},
    {"provider_id": 10, "name": "白泽 AI 公开课（DEMO）", "provider_type": "community",
     "description": "虚构的 AI 社区公开课演示实体。",
     "status": STATUS, "data_class": DATA_CLASS},
]

# ---------------------------------------------------------------------------
# Learning Resources（48）
# 字段顺序：(title, provider_id, subject_id, goal_ids, skill_ids, resource_type,
#            difficulty, language, fee, duration_hours, weekly_workload_hours,
#            learning_mode, prerequisite_skill_ids, certificate_available,
#            learning_outcomes, description)
# fee=None 表示未知（不得猜测）；duration/workload/cert 亦可为 None。
# ---------------------------------------------------------------------------
R = [
    ("Python 基础入门", 1, 1, [1], [1], "course", "beginner", "zh", 0, 30, 5, "self_paced", [], True,
     ["写出并运行自己的 Python 脚本", "掌握变量、循环、函数与文件读写", "完成一个命令行小项目"],
     "零基础友好的 Python 入门课，从安装环境讲到第一个完整小项目。"),
    ("Git 与命令行实战", 5, 1, [1], [18], "tutorial", "beginner", "zh", 49, 8, 3, "self_paced", [], False,
     ["熟练使用终端常用命令", "用 Git 管理代码版本与分支", "建立个人项目的工程习惯"],
     "面向初学者的命令行与 Git 教程，覆盖学习与科研中的版本管理场景。"),
    ("Python 进阶编程练习", 3, 1, [1], [1, 18], "learning_module", "intermediate", "zh", 129, 20, 6, "self_paced", [1], True,
     ["用面向对象方式组织代码", "读懂并调试他人的项目", "掌握常用标准库"],
     "以练习为主的进阶模块，适合完成入门后巩固提高。"),
    ("编程思维与问题求解", 4, 1, [1], [1], "open_course", "beginner", "zh", 0, 24, 4, "self_paced", [], True,
     ["把问题拆解为可执行的步骤", "用伪代码与流程图梳理思路", "建立独立排错的能力"],
     "公开课侧重思维方式训练，弱化语法细节，适合编程零基础的学习者。"),
    ("用 Python 做小事：项目式入门", 9, 1, [1], [1, 18], "course", "beginner", "zh", 199, 36, 6, "hybrid", [], True,
     ["独立完成三个实用小工具", "学会阅读文档与查错", "形成每周编码的习惯"],
     "项目制入门课，每周围绕一个能用的成品展开，含直播答疑。"),
    ("Python 数据分析全能课", 6, 2, [2, 11], [2, 3, 4, 8], "course", "intermediate", "zh", 299, 60, 8, "hybrid", [1], True,
     ["独立完成一份完整的数据分析报告", "掌握 NumPy / Pandas / 可视化主流程", "学会提出可被数据回答的问题"],
     "从数据到结论的全流程课程，含案例项目与助教批改。"),
    ("NumPy 与数组计算", 6, 2, [2], [2], "tutorial", "intermediate", "zh", 0, 10, 4, "self_paced", [1], False,
     ["理解向量化运算的思维方式", "熟练使用数组切片与广播", "为学习 Pandas 打好基础"],
     "免费教程，聚焦 NumPy 核心概念，练习量适中。"),
    ("Pandas 数据处理实战", 2, 2, [2], [3, 8], "course", "intermediate", "zh", 149, 28, 6, "self_paced", [2], True,
     ["完成真实数据集的清洗与整合", "掌握 groupby 与透视表", "输出规范的 tidy 数据"],
     "以实战案例为主的 Pandas 专题课，附带练习数据包。"),
    ("数据可视化：从图表到故事", 2, 2, [11], [4], "course", "beginner", "zh", 99, 18, 4, "self_paced", [3], True,
     ["为不同数据形态选择合适图表", "避免常见的误导性图表", "完成一份可视化叙事作品"],
     "强调表达与叙事的可视化课，案例覆盖商业与科研场景。"),
    ("SQL 与数据库入门", 1, 2, [12], [5], "course", "beginner", "zh", 0, 22, 5, "self_paced", [], True,
     ["写出常用 SELECT / JOIN 查询", "理解数据库表设计与索引", "完成一个查询分析小项目"],
     "大学开放平台出品，覆盖关系数据库基础与常见分析查询。"),
    ("数据清洗实战工作坊", 6, 2, [2], [8, 3], "learning_module", "intermediate", "zh", 179, 16, 5, "instructor_led", [3], False,
     ["处理缺失值与异常值的系统方法", "把脏数据整理成可分析形态", "建立可复用的清洗脚本"],
     "直播工作坊形式，围绕真实感的脏数据练习。"),
    ("商业数据分析案例集", 3, 2, [2, 11], [4, 8], "learning_module", "intermediate", "zh", None, 15, 4, "self_paced", [3], False,
     ["读懂常见的业务分析框架", "复现五个完整分析案例", "形成自己的分析模板"],
     "案例合集模块，费用信息暂缺（演示未知值处理）。"),
    ("R 语言入门", 9, 4, [3], [7], "course", "beginner", "zh", 0, 26, 5, "self_paced", [6], True,
     ["安装并配置 R 与 RStudio", "掌握数据结构与其操作", "完成基础统计绘图"],
     "面向科研场景的 R 入门公开课，假设已具备基本统计概念。"),
    ("统计学基础：从描述到推断", 1, 2, [5], [6], "course", "beginner", "zh", 0, 32, 6, "self_paced", [], True,
     ["读懂均值、方差与分布", "理解假设检验与 p 值的含义与误用", "用统计语言描述不确定性"],
     "不依赖编程的统计入门课，重点是概念直觉与正确解读。"),
    ("数据分析思维导论", 4, 2, [2], [3, 8], "open_course", "beginner", "zh", 0, 12, 3, "self_paced", [], False,
     ["理解数据分析的完整流程", "学会提出假设并设计验证", "判断分析结论的证据强度"],
     "轻量导论课，适合在动手前先建立整体认知。"),
    ("电子表格数据分析", 2, 2, [2, 12], [5, 8], "tutorial", "beginner", "zh", 39, 10, 3, "self_paced", [], False,
     ["用透视表快速汇总数据", "掌握常用函数与图表", "为过渡到编程分析做准备"],
     "以电子表格为工具的轻量数据分析教程。"),
    ("数据分析英文报告阅读", 7, 2, [2], [15], "learning_module", "intermediate", "bilingual", 69, 12, 3, "self_paced", [], False,
     ["读懂英文分析报告的结构", "积累数据类学术词汇", "能复述报告的核心论证"],
     "结合数据分析语料的学术英语阅读模块。"),
    ("机器学习基础", 10, 3, [4], [9], "course", "intermediate", "zh", 0, 45, 8, "self_paced", [3, 6], True,
     ["理解监督学习的基本范式", "跑通分类与回归的完整实验", "正确解读评估指标"],
     "社区口碑较好的机器学习公开课，作业偏代码实践。"),
    ("深度学习入门：神经网络", 10, 3, [4], [10], "open_course", "advanced", "bilingual", 0, 50, 10, "self_paced", [9], True,
     ["手写一个最小神经网络", "理解反向传播的直觉", "完成一个图像分类小项目"],
     "强度较大的进阶公开课，建议每周投入 10 小时以上。"),
    ("AI 工具使用入门", 5, 3, [10], [11], "tutorial", "beginner", "zh", 0, None, 2, "self_paced", [], False,
     ["写出结构清晰的提示词", "识别 AI 回答中的事实错误", "把 AI 融入日常学习流程"],
     "免费教程，总时长信息暂缺，内容按主题单元组织。"),
    ("面向学习者的 AI 提效指南", 3, 3, [10], [11], "learning_module", "beginner", "zh", 59, 8, 2, "self_paced", [], False,
     ["为学习任务选择合适的 AI 工具", "建立个人提示词模板库", "掌握信息核验的基本习惯"],
     "以学习场景为中心的 AI 工具模块，案例覆盖笔记与复习。"),
    ("机器学习数学基础", 4, 3, [4], [6, 9], "open_course", "intermediate", "zh", 0, 36, 7, "self_paced", [6], True,
     ["补齐线性代数与微积分最小集", "理解概率视角下的模型", "推导常见损失函数"],
     "为机器学习服务的数学公开课，跳过与建模无关的内容。"),
    ("提示工程与 LLM 应用实践", 10, 3, [10, 4], [11, 9], "learning_module", "intermediate", "zh", 129, 14, 4, "hybrid", [11], False,
     ["设计可复用的复杂提示流程", "评估 LLM 输出的质量", "完成一个小型 LLM 应用原型"],
     "面向已有 AI 使用经验的学习者，含直播工作坊。"),
    ("科研方法导论", 8, 4, [5, 7], [6, 12], "open_course", "beginner", "zh", 0, 20, 4, "self_paced", [], True,
     ["理解科学研究的基本规范", "设计一个可检验的研究问题", "识别常见的论证谬误"],
     "面向低年级本科生的科研入门公开课。"),
    ("文献检索与管理", 8, 4, [7], [12], "tutorial", "beginner", "zh", 29, 8, 2, "self_paced", [], False,
     ["组合使用数据库与关键词策略", "用文献管理工具建立个人库", "追踪领域内的新文献"],
     "短小实用的检索教程，覆盖常见学术数据库的通用技巧。"),
    ("学术论文写作入门", 8, 4, [8], [13], "course", "intermediate", "zh", 159, 24, 5, "instructor_led", [12], True,
     ["搭建论文的标准结构", "写出清晰的引言与讨论", "根据审稿意见修改稿件"],
     "直播小班课，包含两轮逐段批改。"),
    ("R 语言与科研数据分析", 9, 4, [3, 5], [7, 6], "course", "intermediate", "zh", 199, 40, 7, "self_paced", [6], True,
     ["用 R 完成常见统计检验", "绘制出版级图表", "写出可复现的分析脚本"],
     "把统计与 R 结合起来的科研数据分析课。"),
    ("生物信息学基础", 4, 4, [6], [16], "open_course", "advanced", "bilingual", 0, 55, 10, "self_paced", [7], True,
     ["理解组学数据的产生与处理", "跑通标准上游分析流程", "读懂生信方法的原始文献"],
     "强度较大的公开课，需要一定的编程与统计基础。"),
    ("单细胞 RNA-seq 数据分析入门", 10, 4, [6], [16, 17], "learning_module", "advanced", "en", 0, 30, 8, "self_paced", [16], False,
     ["完成质控、归一化与降维", "解释细胞聚类结果的生物学含义", "复现一篇教程级分析"],
     "英文教程模块，聚焦单细胞分析的最小工作流。"),
    ("问卷设计与调查方法", 8, 4, [5, 7], [6], "learning_module", "beginner", "zh", 79, 12, 3, "self_paced", [], False,
     ["设计信效度合格的问卷", "选择合适的抽样策略", "避免常见的引导性提问"],
     "调查方法专题，适合做社会学与教育类课题的同学。"),
    ("学术诚信与引用规范", 1, 4, [7, 8], [12, 13], "tutorial", "beginner", "zh", 0, 4, 1, "self_paced", [], False,
     ["正确引用直接与间接来源", "识别自我抄袭与不当署名", "使用引用管理工具规范输出"],
     "短教程，覆盖学术写作中最常见的诚信规则。"),
    ("R 语言进阶：tidyverse 数据科学", 9, 4, [3], [7, 8], "course", "intermediate", "en", 0, 28, 6, "self_paced", [7], False,
     ["用管道语法组织数据工作流", "掌握 ggplot2 的图形语法", "写出整洁的分析代码"],
     "英文进阶课，假设已完成 R 入门。"),
    ("科研数据可视化（R/ggplot2）", 9, 4, [3, 11], [4, 7], "learning_module", "intermediate", "en", 0, 14, 4, "self_paced", [7], False,
     ["为论文选择合适的图形形式", "用 ggplot2 定制出版级图表", "批量输出可复现的图"],
     "专题模块，例子偏科研出版场景。"),
    ("学术英语写作基础", 7, 5, [8], [13, 15], "course", "intermediate", "bilingual", 129, 30, 5, "hybrid", [15], True,
     ["掌握学术段落的结构与衔接", "积累常用学术表达", "完成一篇短文并获批改"],
     "中英双语授课，适合首次接触学术写作的学习者。"),
    ("英语六级备考全程班", 7, 5, [9], [14, 15], "course", "intermediate", "zh", 249, 60, 8, "instructor_led", [14], True,
     ["系统过完六级核心词汇", "掌握听力与阅读的做题策略", "完成三套全真模考"],
     "直播全程班，按周发布任务，含班主任督学。"),
    ("英语六级词汇速记", 7, 5, [9], [15], "learning_module", "beginner", "zh", 49, 20, 0.5, "self_paced", [], False,
     ["按词频记忆六级核心词", "用词根词缀扩展词汇量", "通过打卡维持每日投入"],
     "轻量词汇打卡模块，每日约半小时。"),
    ("学术英语听说训练", 7, 5, [8, 9], [14], "course", "intermediate", "en", 99, 24, 4, "instructor_led", [14], False,
     ["听懂学术讲座的主干论证", "做结构化的讲座笔记", "用英语进行学术讨论"],
     "以真实讲座语料为素材的听说训练课。"),
    ("英文学术论文阅读方法", 8, 4, [7, 8], [12, 15], "tutorial", "intermediate", "bilingual", 39, 10, 3, "self_paced", [12], False,
     ["用三遍阅读法拆解论文", "快速定位论文的贡献与局限", "建立文献阅读笔记模板"],
     "教你高效读论文的短教程，配套阅读模板。"),
    ("学术演讲与展示", 7, 5, [8], [13, 14], "learning_module", "intermediate", "en", 89, 12, 3, "hybrid", [13], False,
     ["组织清晰的学术报告结构", "设计有效的展示幻灯", "应对提问环节"],
     "以组会与会议报告为场景的演讲模块。"),
    ("英语语法精讲（学术向）", 1, 5, [8, 9], [15], "open_course", "beginner", "zh", 0, 18, 3, "self_paced", [], True,
     ["理清英语句子成分", "修正中式英语常见错误", "写出语法可靠的学术句子"],
     "面向学术写作的语法公开课，配有改错练习。"),
    ("雅思学术英语入门", 7, 5, [8], [14, 15], "course", "intermediate", "bilingual", 199, 45, 7, "hybrid", [14], True,
     ["了解雅思四个单项的评分逻辑", "完成口语与写作的入门训练", "制定个人备考计划"],
     "雅思入门课，适合计划出国的学习者。"),
    ("Python 数据分析入门（免费公开课）", 2, 2, [1, 2], [1, 2, 3], "open_course", "beginner", "zh", 0, 40, 6, "self_paced", [], True,
     ["从 Python 基础过渡到数据分析", "完成三个入门分析案例", "判断是否继续深入该方向"],
     "平台免费公开课，覆盖入门到分析的衔接内容。"),
    ("Excel 到 Pandas：数据分析过渡指南", 6, 2, [2], [3, 5, 8], "tutorial", "beginner", "zh", 0, 9, 3, "self_paced", [], False,
     ["把熟悉的表格操作映射到 Pandas", "理解索引与向量化思维", "完成同一任务的两种实现对比"],
     "专为电子表格用户设计的过渡教程。"),
    ("机器学习实践：竞赛入门", 5, 3, [4, 2], [3, 9], "learning_module", "advanced", "en", 0, 25, 6, "self_paced", [9], None,
     ["完成一次完整的建模竞赛流程", "掌握特征工程的基本手法", "学会复盘与迭代模型"],
     "竞赛实践模块，证书信息暂缺（演示未知值处理）。"),
    ("大学生科研入门训练营", 8, 4, [5, 7, 8], [6, 12, 13], "learning_module", "beginner", "zh", 299, 35, 6, "instructor_led", [], True,
     ["完整走一遍小型科研流程", "写出开题报告与文献综述", "建立与导师沟通的基本方法"],
     "面向本科生的综合训练营，含导师指导环节。"),
    ("AI 辅助科研工具实战", 10, 3, [10, 7], [11, 12], "tutorial", "intermediate", "zh", 69, None, None, "self_paced", [11], False,
     ["用 AI 工具加速文献调研", "评估 AI 生成内容的可靠性", "搭建个人科研工作流"],
     "聚焦科研场景的 AI 工具教程，时长与工作量信息暂缺。"),
    ("SQL 进阶：分析查询优化", 1, 2, [12], [5], "course", "advanced", "zh", 119, 16, 4, "self_paced", [5], False,
     ["写出复杂的多表分析查询", "理解查询计划与索引优化", "为分析场景建模数据仓库"],
     "面向已掌握 SQL 基础的学习者的进阶课。"),
    ("学术英语写作工作坊（小班）", 7, 5, [8], [13], "course", "advanced", "en", 399, 20, 5, "instructor_led", [13], True,
     ["在高强度互评中打磨稿件", "掌握期刊投稿的完整流程", "获得逐句级别的语言反馈"],
     "高价位小班工作坊，适合有明确投稿计划的写作者。"),
]

RESOURCES = []
for idx, row in enumerate(R, start=1):
    (title, provider_id, subject_id, goal_ids, skill_ids, rtype, difficulty, language,
     fee, duration, workload, mode, prereq_skills, cert, outcomes, desc) = row
    updated = d(random.randint(20, 120))
    observed = d(random.randint(5, 60))
    RESOURCES.append({
        "resource_id": idx,
        "title": title,
        "provider_id": provider_id,
        "subject_id": subject_id,
        "learning_goal_ids": goal_ids,
        "skill_ids": skill_ids,
        "resource_type": rtype,
        "difficulty": difficulty,
        "language": language,
        "fee": fee,
        "currency": "CNY" if fee is not None else None,
        "duration_hours": duration,
        "weekly_workload_hours": workload,
        "learning_mode": mode,
        "prerequisite_skill_ids": prereq_skills,
        "certificate_available": cert,
        "rating": None,           # 由评价聚合回填
        "rating_count": 0,        # 由评价聚合回填
        "learning_outcomes": outcomes,
        "description": desc,
        "url": None,              # 演示数据不指向任何真实第三方页面
        "updated_at": updated,
        "observed_at": observed,
        "verification_status": "unverified",
        "data_class": DATA_CLASS,
        "status": STATUS,
        "source_ids": [1],
    })

# ---------------------------------------------------------------------------
# Reviews（合成演示评价；评分聚合在生成器与前端 derive 中保持同一规则）
# ---------------------------------------------------------------------------
POSITIVE = [
    "讲解节奏清晰，跟下来不费劲。", "练习设计得很扎实，做完确实会了。",
    "案例贴近真实场景，不是干讲概念。", "答疑很及时，卡住的地方都能解决。",
    "结构清楚，能感觉到教研下了功夫。", "学完就用在课业里了，实用。",
]
NEGATIVE = [
    "后半段难度陡增，对新手不够友好。", "部分内容有些过时，例子偏老。",
    "作业量比页面标注的大，时间预估偏乐观。", "理论偏多，实操环节不够。",
    "节奏偏快，建议先补前置知识。", "内容还行，但性价比一般。",
]
NEUTRAL = [
    "内容中规中矩，适合当入门索引。", "看完一遍，准备二刷巩固。",
    "适合有基础的人快速过一遍。", "配套资料比视频本身更有价值。",
]
TAG_POOL = ["practical", "well_structured", "beginner_friendly", "heavy_workload",
            "outdated_examples", "theory_heavy", "good_exercises", "pace_comfortable"]

REVIEW_TARGETS = {}
# 明确安排样本多样性：0 条 / 1-2 条（limited）/ 3 条以上（sufficient）
for res in RESOURCES:
    rid = res["resource_id"]
    if rid in {29, 37, 44, 48}:
        REVIEW_TARGETS[rid] = 0 if rid in {44, 48} else (1 if rid == 29 else 2)
    else:
        REVIEW_TARGETS[rid] = random.randint(3, 8)

REVIEWS = []
review_id = 0
for res in RESOURCES:
    rid = res["resource_id"]
    for _ in range(REVIEW_TARGETS[rid]):
        review_id += 1
        base = random.choice([3, 4, 4, 5, 5, 5, 4])
        overall = max(1, min(5, base + random.choice([-1, 0, 0, 1])))
        if overall >= 4:
            comment = random.choice(POSITIVE)
            tags = random.sample(["practical", "well_structured", "beginner_friendly",
                                  "good_exercises", "pace_comfortable"], k=random.randint(1, 2))
        elif overall == 3:
            comment = random.choice(NEUTRAL + NEGATIVE)
            tags = random.sample(TAG_POOL, k=random.randint(1, 2))
        else:
            comment = random.choice(NEGATIVE)
            tags = random.sample(["heavy_workload", "outdated_examples", "theory_heavy"],
                                 k=random.randint(1, 2))
        REVIEWS.append({
            "review_id": review_id,
            "resource_id": rid,
            "overall_rating": overall,
            "content_quality": max(1, min(5, overall + random.choice([-1, 0, 0, 1]))),
            "difficulty_match": max(1, min(5, random.randint(3, 5))),
            "practical_value": max(1, min(5, overall + random.choice([-1, 0, 1]))),
            "workload_accuracy": max(1, min(5, random.randint(2, 5))),
            "would_recommend": overall >= 4,
            "completion_status": random.choice(["completed", "completed", "in_progress", "dropped"]),
            "learning_tags": tags,
            "comment": comment,
            "review_origin": "demo_dataset",
            "submitted_at": d(random.randint(10, 150)),
            "data_class": DATA_CLASS,
            "status": STATUS,
        })

# 评分聚合回填（与 js/derive.js ratingAggregate 同一规则：只取 published）
for res in RESOURCES:
    rows = [r for r in REVIEWS if r["resource_id"] == res["resource_id"] and r["status"] == STATUS]
    if rows:
        res["rating_count"] = len(rows)
        res["rating"] = round(sum(r["overall_rating"] for r in rows) / len(rows), 2)
    else:
        res["rating"] = None
        res["rating_count"] = 0

# ---------------------------------------------------------------------------
# Learning Paths（7）与路径步骤
# ---------------------------------------------------------------------------
PATHS = [
    {"path_id": 1, "name": "零基础到 Python 数据分析", "description": "从编程入门到能独立完成一份数据分析报告的最短路线。",
     "goal_ids": [1, 2], "target_audience": "零基础本科生", "status": STATUS, "data_class": DATA_CLASS},
    {"path_id": 2, "name": "科研统计与 R 语言路线", "description": "先建立统计直觉，再用 R 落地到科研数据分析。",
     "goal_ids": [5, 3], "target_audience": "需要做数据类毕业论文的学生", "status": STATUS, "data_class": DATA_CLASS},
    {"path_id": 3, "name": "单细胞 RNA-seq 分析入门路线", "description": "从统计与 R 基础走到单细胞转录组分析的最小工作流。",
     "goal_ids": [5, 3, 6], "target_audience": "生命科学方向研究生", "status": STATUS, "data_class": DATA_CLASS},
    {"path_id": 4, "name": "从文献检索到学术写作", "description": "先会找文献、读文献，再进入学术写作与投稿流程。",
     "goal_ids": [7, 8], "target_audience": "准备发表论文的学生", "status": STATUS, "data_class": DATA_CLASS},
    {"path_id": 5, "name": "机器学习基础路线", "description": "补数学、练代码、跑通第一个端到端机器学习项目。",
     "goal_ids": [2, 4], "target_audience": "有一定编程基础的学习者", "status": STATUS, "data_class": DATA_CLASS},
    {"path_id": 6, "name": "英语六级备考路线", "description": "词汇、听力、阅读到模考的系统备考安排。",
     "goal_ids": [9], "target_audience": "备考六级的大学生", "status": STATUS, "data_class": DATA_CLASS},
    {"path_id": 7, "name": "AI 工具高效学习路线", "description": "把 AI 工具安全地融入学习、写作与科研流程。",
     "goal_ids": [10], "target_audience": "所有想提效的学习者", "status": STATUS, "data_class": DATA_CLASS},
]

PATH_STEPS = [
    # path_id, step_order, skill_id, goal_id, title, description, core, optional
    (1, 1, 1, 1, "打好 Python 基础", "选择一门入门课，完成环境搭建与第一个项目。", [1, 42], [4, 5]),
    (1, 2, 18, 1, "建立工程习惯", "学会用 Git 与命令行管理练习代码。", [2], [3]),
    (1, 3, 2, 2, "进入数组与向量化思维", "用 NumPy 理解数据计算的基本抽象。", [7], []),
    (1, 4, 3, 2, "掌握 Pandas 数据处理", "完成真实数据集的读取、清洗与整合。", [8, 43], [11]),
    (1, 5, 4, 11, "让结果可被看见", "选择合适的图表并完成一份可视化叙事。", [9], [33]),
    (2, 1, 6, 5, "建立统计直觉", "先修统计概念，不急于上手软件。", [14], [24]),
    (2, 2, 7, 3, "R 语言起步", "安装环境，掌握数据结构与基础绘图。", [13], [32]),
    (2, 3, 8, 3, "用 R 处理真实数据", "把统计检验落到可复现的脚本上。", [27], []),
    (3, 1, 6, 5, "统计基础", "理解分布、检验与多重比较问题。", [14], []),
    (3, 2, 7, 3, "R 语言基础", "完成 R 入门与 tidyverse 工作流。", [13], [32]),
    (3, 3, 16, 6, "生物信息学基础", "理解组学数据与上游分析流程。", [28], []),
    (3, 4, 17, 6, "单细胞分析实战", "跑通质控、降维、聚类与注释。", [29], []),
    (4, 1, 12, 7, "学会找文献", "组合数据库与关键词策略建立检索能力。", [25], [38]),
    (4, 2, 12, 7, "高效读文献", "用三遍阅读法拆解领域内代表论文。", [38], [31]),
    (4, 3, 13, 8, "学术写作入门", "从段落结构写起，完成第一篇短文。", [34], [40, 26]),
    (5, 1, 1, 1, "Python 基础", "先完成编程入门，能读写基本脚本。", [1], [42]),
    (5, 2, 3, 2, "数据处理能力", "掌握 Pandas 与数据清洗。", [8], [43]),
    (5, 3, 6, 5, "数学与统计补齐", "为机器学习补齐线性代数与概率。", [22], [14]),
    (5, 4, 9, 4, "机器学习入门", "跑通分类与回归的完整实验。", [18], [44]),
    (6, 1, 15, 9, "词汇先行", "按词频开始每日词汇打卡。", [36], []),
    (6, 2, 14, 9, "听力与阅读策略", "进入系统备考，掌握做题方法。", [35], [37]),
    (6, 3, 15, 9, "模考与复盘", "完成全真模考并针对性补弱。", [35], []),
    (7, 1, 11, 10, "AI 工具初识", "建立提示词与信息核验的基本习惯。", [20], [21]),
    (7, 2, 11, 10, "融入学习流程", "为笔记、复习与写作搭建个人模板。", [21], [23]),
    (7, 3, 12, 10, "科研场景进阶", "把 AI 用在文献调研并守住可靠性底线。", [46], []),
]

PATH_STEPS_JSON = []
step_id = 0
for (pid, order, skill, goal, title, desc, core, optional) in PATH_STEPS:
    step_id += 1
    PATH_STEPS_JSON.append({
        "step_id": step_id,
        "path_id": pid,
        "step_order": order,
        "skill_id": skill,
        "goal_id": goal,
        "title": title,
        "description": desc,
        "core_resource_ids": core,
        "optional_resource_ids": optional,
    })

# ---------------------------------------------------------------------------
# Fee History（append-only 费用观测；仅对非免费、费用已知的资源生成）
# ---------------------------------------------------------------------------
FEE_HISTORY = []
fid = 0
for res in RESOURCES:
    fee = res["fee"]
    if fee is None or fee == 0:
        continue
    n_obs = random.randint(1, 3)
    base_fee = fee
    obs_days = sorted(random.sample(range(30, 170), n_obs), reverse=True)
    for i, days_ago in enumerate(obs_days):
        # 早期观测允许 ±15% 的浮动，最后一观测等于当前登记费用
        if i < n_obs - 1:
            f = round(base_fee * random.uniform(0.85, 1.15) / 10) * 10
        else:
            f = base_fee
        fid += 1
        FEE_HISTORY.append({
            "fee_observation_id": fid,
            "resource_id": res["resource_id"],
            "fee": f,
            "currency": "CNY",
            "fee_type": random.choice(["full", "full", "full", "promo"]),
            "observed_at": d(days_ago),
            "verification_status": "unverified",
            "source_id": 1,
            "data_class": DATA_CLASS,
            "status": STATUS,
        })

# ---------------------------------------------------------------------------
# Sources 与 Resource-Source
# ---------------------------------------------------------------------------
SOURCES = [
    {"source_id": 1, "title": "CourseMap 编辑演示数据集", "source_type": "editorial_demo",
     "provider": "CourseMap 编辑组（虚构演示）", "url": None,
     "usage_permission": "editor_created_demo", "verification_status": "unverified",
     "retrieved_at": d(1),
     "license_note": "全部为编辑自建演示数据，不指向、不引用任何真实第三方课程或机构。",
     "status": STATUS, "data_class": DATA_CLASS},
    {"source_id": 2, "title": "CourseMap 产品文档（内部）", "source_type": "product_doc",
     "provider": "docs/product/06_Domain_Model.md", "url": None,
     "usage_permission": "editor_created_demo", "verification_status": "human_verified",
     "retrieved_at": d(1),
     "license_note": "实体关系与字段语义以产品文档为准。",
     "status": STATUS, "data_class": DATA_CLASS},
]

RESOURCE_SOURCE = []
rsid = 0
for res in RESOURCES:
    rsid += 1
    RESOURCE_SOURCE.append({
        "resource_source_id": rsid,
        "resource_id": res["resource_id"],
        "source_id": 1,
        "field_scope": "general",
        "note": "资源全部字段均为编辑演示数据。",
    })

# ---------------------------------------------------------------------------
# 写出
# ---------------------------------------------------------------------------
def dump(name, rows):
    path = DATA / name
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"  {name:<28} {len(rows):>4} 条")

DATA.mkdir(parents=True, exist_ok=True)
print("CourseMap demo dataset generation:")
dump("subjects.json", SUBJECTS)
dump("learning-goals.json", GOALS)
dump("skills.json", SKILLS)
dump("providers.json", PROVIDERS)
dump("resources.json", RESOURCES)
dump("learning-paths.json", PATHS)
dump("learning-path-steps.json", PATH_STEPS_JSON)
dump("reviews.json", REVIEWS)
dump("fee-history.json", FEE_HISTORY)
dump("sources.json", SOURCES)
dump("resource-source.json", RESOURCE_SOURCE)
print("done.")
