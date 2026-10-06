#!/usr/bin/env node
/* ============================================================================
   CourseMap — scripts/data/ingest_real_oer.mjs
   ----------------------------------------------------------------------------
   真实开放教育资源（OER）入库器 —— CourseMap Data-1 · METADATA + OFFICIAL LINK

   设计原则（对应 docs/data-integration/01..04）：
     1. 本脚本**不抓取、不存储任何课程正文 / 讲义 / 视频 / 图片 / 习题 / PDF**。
        它只把「人工在官方来源上核验过的元数据 + 官方链接」写成结构化记录。
     2. 每个真实资源都绑定一个 Source 记录，Source.official_url 就是该资源在
        官方站点的页面；license 相关字段全部来自官方许可页（见 license_evidence_url）。
     3. 官方来源没有明确支持的字段一律写 null，绝不用推断补全。
        - difficulty：官方只给 Undergraduate/Graduate/Non-Credit 等级，
          映射到 CourseMap 的 beginner/intermediate/advanced 属于「解释」而非「事实」，
          因此 difficulty 保持 null，官方等级原样存入 level_official。
        - duration_hours / weekly_workload_hours / rating：官方未提供 → null。
     4. 幂等：运行前先删除所有 data_class === 'real' 的既有记录，再重新写入。
        demo 记录（resource_id 1..48）永不被修改。

   用法：
     node scripts/data/ingest_real_oer.mjs            # 写入
     node scripts/data/ingest_real_oer.mjs --dry-run  # 只打印统计
   ========================================================================== */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DATA = join(ROOT, 'data');
const DRY = process.argv.includes('--dry-run');

/** 元数据观测日（本次人工核验 OER 的日期） */
const OBSERVED_AT = '2026-10-06';

/** ID 段位：demo 占用 1..48（resources）/ 1..2（sources），真实数据从 101 起，永不复用 */
const RESOURCE_ID_BASE = 101;
const SOURCE_ID_BASE = 101;
const PROVIDER_ID_BASE = 101;
const SKILL_ID_BASE = 19;
const GOAL_ID_BASE = 13;
const SUBJECT_ID = 6;

/* ---------------------------------------------------------------------------
   许可（License）常量 —— 全部来自官方许可页，逐字核验
   -------------------------------------------------------------------------- */
const LICENSE_CC_BY_NC_SA_4 = {
  license: 'CC BY-NC-SA 4.0',
  license_url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/',
  commercial_use: false,       // NonCommercial：不得用于商业目的
  adaptation_allowed: true,    // Adapt：允许 remix / transform / build upon
  attribution_required: true,  // Attribution：必须署名
  share_alike: true,           // ShareAlike：衍生作品须同许可分发
  public_domain: false,        // 明确不是公有领域
  usage_permission: 'non_commercial_reuse_with_attribution',
  ai_training_allowed: null,   // OCW 有条件允许；OpenStax 明确不允许 → 见各 Source
};

/* Google for Developers —— **另一种许可**：CC BY 4.0。
   与 MIT / CS50 的 NC 许可形成对照：CC BY 4.0 **允许商业使用**、无 ShareAlike。
   原文（2026-10-06 核验，页面底部声明）：
     "Except as otherwise noted, the content of this page is licensed under the
      Creative Commons Attribution 4.0 License, and code samples are licensed
      under the Apache 2.0 License."
   注意：Google 的商标与「图片/音视频/外链内容」**不在**该许可内（站点政策页明确排除）。 */
const LICENSE_CC_BY_4 = {
  license: 'CC BY 4.0',
  license_url: 'https://creativecommons.org/licenses/by/4.0/',
  commercial_use: true,        // BY（无 NC）→ 允许商业使用
  adaptation_allowed: true,
  attribution_required: true,
  share_alike: false,          // 无 ShareAlike
  public_domain: false,        // 开放许可 ≠ 公有领域（Module G）
  usage_permission: 'open_license_attribution',
  ai_training_allowed: true,   // CC BY 4.0 未对训练设限（商标/第三方媒体除外）
};

/* 许可状态未知 —— 用于「官方页面本身没有许可声明」的来源。
   Module 5：未知就写 unknown，**绝不**因为「同站其他页面是开放的」而推定。
   commercial_use / adaptation_allowed 等保持 null：不得声明 true（VR-C12）。 */
const LICENSE_UNKNOWN = {
  license: 'unknown',
  /* 许可证名称未知时，证据 URL 指向**官方站点政策页**（记录适用框架），
     而不是假装存在一份许可证。license_note 会写明真正的判定依据。 */
  license_url: 'https://developers.google.cn/terms/site-policies',
  commercial_use: null,
  adaptation_allowed: null,
  attribution_required: null,
  share_alike: null,
  public_domain: null,
  usage_permission: 'unknown',
  ai_training_allowed: null,
};

/* ---------------------------------------------------------------------------
   1. Providers（真实提供方）
   -------------------------------------------------------------------------- */
const REAL_PROVIDERS = [
  {
    provider_id: PROVIDER_ID_BASE,           // 101
    name: 'MIT OpenCourseWare',
    name_en: 'MIT OpenCourseWare',
    provider_type: 'university_open',
    description: '麻省理工学院自 2001 年起公开发布的课程材料集合。官方声明「免费且开放」，不代表 MIT 学分或认证。',
    official_url: 'https://ocw.mit.edu/',
    status: 'published',
    data_class: 'real',
  },
  {
    provider_id: PROVIDER_ID_BASE + 1,       // 102
    name: 'OpenStax（莱斯大学）',
    name_en: 'OpenStax (Rice University)',
    provider_type: 'university_open',
    description: '莱斯大学主办的非营利开放教科书出版项目，全部教材在线免费阅读。',
    official_url: 'https://openstax.org/',
    status: 'published',
    data_class: 'real',
  },
  {
    provider_id: PROVIDER_ID_BASE + 2,       // 103
    name: '哈佛大学 CS50 公开课',
    name_en: 'Harvard University (CS50 OpenCourseWare)',
    provider_type: 'university_open',
    description: '哈佛大学 CS50 系列课程的官方公开站点。全部课程可免费在线自学；CS50 另发**免费** CS50 Certificate（非学分、非 Harvard 认证）。',
    official_url: 'https://cs50.harvard.edu/',
    status: 'published',
    data_class: 'real',
  },
  {
    provider_id: PROVIDER_ID_BASE + 3,       // 104
    name: 'Google for Developers（机器学习课程）',
    name_en: 'Google for Developers (Machine Learning Education)',
    provider_type: 'company_open',
    description: 'Google 官方开发者文档站的机器学习教学资源（速成课程、指南、术语库）。页面文字内容按 CC BY 4.0 发布（商标与第三方媒体除外）。',
    official_url: 'https://developers.google.com/machine-learning',
    status: 'published',
    data_class: 'real',
  },
];

/* ---------------------------------------------------------------------------
   2. 分类节点（真实数据所需的最小扩展）
   -------------------------------------------------------------------------- */
const REAL_SUBJECTS = [
  {
    subject_id: SUBJECT_ID,                  // 6
    code: 'academic-skills',
    name: '学术通用能力',
    name_en: 'Academic & General Learning Skills',
    description: '大学学习方法、自我管理与通用学术沟通能力。为接入真实 OER 新增的分类节点。',
    status: 'published',
    data_class: 'real',
  },
];

const REAL_SKILLS = [
  { skill_id: SKILL_ID_BASE,     name: '研究方法设计',     subject_id: 4,          prerequisite_skill_ids: [12], data_class: 'real' },
  { skill_id: SKILL_ID_BASE + 1, name: '科研诚信与伦理',   subject_id: 4,          prerequisite_skill_ids: [],   data_class: 'real' },
  { skill_id: SKILL_ID_BASE + 2, name: '学习策略与时间管理', subject_id: SUBJECT_ID, prerequisite_skill_ids: [],   data_class: 'real' },
  /* ↓ Real OER Expansion 新增：为 CS50 / MIT 的计算机科学类真实资源提供落点。
       不新增这些节点的话，6.006 / 18.S191 / CS50 Web 只能被硬塞进
       「Python 入门」，那属于错误映射（见 13_OER_Expansion.md §Taxonomy）。 */
  { skill_id: SKILL_ID_BASE + 3, name: '算法与数据结构',   subject_id: 1, prerequisite_skill_ids: [1], data_class: 'real' },
  { skill_id: SKILL_ID_BASE + 4, name: 'Web 开发基础',     subject_id: 1, prerequisite_skill_ids: [1, 5], data_class: 'real' },
  { skill_id: SKILL_ID_BASE + 5, name: '计算思维与科学计算', subject_id: 1, prerequisite_skill_ids: [], data_class: 'real' },
  { skill_id: SKILL_ID_BASE + 6, name: '数据分析方法',       subject_id: 2, prerequisite_skill_ids: [6], data_class: 'real' },
];

const REAL_GOALS = [
  {
    goal_id: GOAL_ID_BASE,                   // 13
    name: '研究方法与实验设计',
    subject_id: 4,
    description: '掌握研究设计、资料收集方法与论证流程，能判断一项研究的可信度。',
    recommended_level: 'intermediate',
    related_skill_ids: [SKILL_ID_BASE],
    prerequisite_goal_ids: [],
    next_goal_ids: [],
    aliases: ['研究方法', 'research methods', '实验设计'],
    status: 'published',
    data_class: 'real',
  },
  {
    goal_id: GOAL_ID_BASE + 1,               // 14
    name: '科研诚信与负责任研究',
    subject_id: 4,
    description: '理解科研伦理、数据诚信与负责任研究行为规范。',
    recommended_level: 'beginner',
    related_skill_ids: [SKILL_ID_BASE + 1],
    prerequisite_goal_ids: [],
    next_goal_ids: [GOAL_ID_BASE],
    aliases: ['科研诚信', 'research integrity', '研究伦理'],
    status: 'published',
    data_class: 'real',
  },
  {
    goal_id: GOAL_ID_BASE + 2,               // 15
    name: '大学学习与自我管理',
    subject_id: SUBJECT_ID,
    description: '适应大学学习方式：目标设定、时间管理、主动学习与资源利用。',
    recommended_level: 'beginner',
    related_skill_ids: [SKILL_ID_BASE + 2],
    prerequisite_goal_ids: [],
    next_goal_ids: [],
    aliases: ['大学学习', '学习方法', 'college success'],
    status: 'published',
    data_class: 'real',
  },
  /* ↓ Real OER Expansion 新增的真实学习目标（subject 1 编程） */
  {
    goal_id: GOAL_ID_BASE + 3,               // 16
    name: '算法与数据结构',
    subject_id: 1,
    description: '理解算法设计与复杂度分析，能用代码实现并评估常见算法与数据结构。',
    recommended_level: 'intermediate',
    related_skill_ids: [SKILL_ID_BASE + 3],
    prerequisite_goal_ids: [1],
    next_goal_ids: [],
    aliases: ['算法', '数据结构', 'algorithms', 'data structures'],
    status: 'published',
    data_class: 'real',
  },
  {
    goal_id: GOAL_ID_BASE + 4,               // 17
    name: 'Web 应用开发',
    subject_id: 1,
    description: '用 Python / JavaScript / SQL 构建并部署可交互的 Web 应用。',
    recommended_level: 'intermediate',
    related_skill_ids: [SKILL_ID_BASE + 4],
    prerequisite_goal_ids: [1],
    next_goal_ids: [],
    aliases: ['Web 开发', 'web development', 'django', '前端后端'],
    status: 'published',
    data_class: 'real',
  },
  {
    goal_id: GOAL_ID_BASE + 5,               // 18
    name: '计算思维与科学计算',
    subject_id: 1,
    description: '用编程与数学建模处理真实问题：数据分析、数值方法与计算模型。',
    recommended_level: 'beginner',
    related_skill_ids: [SKILL_ID_BASE + 5],
    prerequisite_goal_ids: [],
    next_goal_ids: [],
    aliases: ['计算思维', 'computational thinking', '科学计算'],
    status: 'published',
    data_class: 'real',
  },
  {
    goal_id: GOAL_ID_BASE + 6,               // 19
    name: '数据分析与统计推断',
    subject_id: 2,
    description: '从数据出发做描述、推断与可视化：理解变异、抽样与统计推断，并把结论用在真实数据集上。',
    recommended_level: 'beginner',
    related_skill_ids: [SKILL_ID_BASE + 6],
    prerequisite_goal_ids: [],
    next_goal_ids: [],
    aliases: ['数据分析', 'data analysis', '统计推断', 'statistical thinking'],
    status: 'published',
    data_class: 'real',
  },
];

/* ---------------------------------------------------------------------------
   3. 真实 OER 目录（人工在官方页面核验）
   ----------------------------------------------------------------------------
   ocw(): MIT OpenCourseWare 课程。官方站点许可 CC BY-NC-SA 4.0（站点级声明），
          官方明确「免费」且「不提供学分或认证」→ fee=0 / certificate_available=false
          属于来源支持字段（见 MIT OCW 许可页 + About 页）。
   -------------------------------------------------------------------------- */
const OCW = (num, slug, title, level, goals, skills, subject) => ({
  title: `${num} ${title}`,
  official_url: `https://ocw.mit.edu/courses/${slug}/`,
  provider_id: PROVIDER_ID_BASE,
  source_type: 'open_courseware',
  resource_type: 'open_course',
  level_official: level,
  learning_goal_ids: goals,
  skill_ids: skills,
  subject_id: subject,
  language: 'en',
  learning_mode: 'self_paced',          // OCW："Freely browse and use OCW materials at your own pace."
  fee: 0,                                // OCW：免费（官方 About 页与站点标题均声明免费）
  certificate_available: false,          // OCW："MIT does not offer credit or certification to users of OCW."
  retrieval_method: 'official_course_page',
});

const OPENSTAX = (slug, title, goals, skills, subject, publishDate, authors) => ({
  title,
  official_url: `https://openstax.org/details/books/${slug}`,
  license_evidence_url: `https://openstax.org/books/${slug}/pages/1-introduction`,
  provider_id: PROVIDER_ID_BASE + 1,
  source_type: 'open_textbook',
  resource_type: 'book',
  level_official: 'College',             // OpenStax 官方书目页自述为 college textbook
  learning_goal_ids: goals,
  skill_ids: skills,
  subject_id: subject,
  language: 'en',
  learning_mode: 'self_paced',
  fee: 0,                                // OpenStax：官方「always free online, and as a PDF」
  certificate_available: null,           // 官方未就教材发放证书作出说明 → null（不猜）
  publish_date: publishDate,
  authors,
  retrieval_method: 'official_book_page',
});

/* Harvard CS50。官方事实（2026-10-06 逐页核验）：
   - "you are welcome to 'take' this course for free via this OpenCourseWare"
   - 许可：CC BY-NC-SA 4.0（各课程 /license/ 页原文）
   - 证书：CS50 FAQ 原文 "A CS50 Certificate is a free certificate from CS50 itself."
     且 "we offer verified certificates for a fee and a free certificate"
     → course 的免费路径 **含** 免费证书；付费的只是 edX verified certificate。
     → certificate_available = true（与 MIT OCW 的「不发证」形成对比，两者都是来源事实）
   - 免费证书仍需注册（免费）edX 账号 → 记入 prerequisites 说明，不改变 fee=0。 */
const HARVARD = (slug, title, { goals, skills, subject, level, prereqOfficial = null, prereqSkills = [], license = 'NC' }) => ({
  title,
  official_url: `https://cs50.harvard.edu/${slug}/`,
  license_evidence_url: `https://cs50.harvard.edu/${slug}/license/`,
  provider_id: PROVIDER_ID_BASE + 2,     // 103
  source_type: 'open_courseware',
  resource_type: 'open_course',
  level_official: level,
  learning_goal_ids: goals,
  skill_ids: skills,
  subject_id: subject,
  language: 'en',
  learning_mode: 'self_paced',
  fee: 0,                                // 免费 OpenCourseWare
  certificate_available: true,           // 免费 CS50 Certificate（官方 FAQ 原文）
  prerequisites_official: prereqOfficial,
  prerequisite_skill_ids: prereqSkills,
  license,
  retrieval_method: 'official_course_page',
});

/* Google for Developers 机器学习课程。官方事实（2026-10-06 逐页核验）：
   - 页面底部声明（模块页/指南页均携带）：
       "Except as otherwise noted, the content of this page is licensed under the
        Creative Commons Attribution 4.0 License, and code samples are licensed
        under the Apache 2.0 License."
     → CC BY 4.0（允许商用、无 ShareAlike、需署名）
   - 例外：MLCC **落地页**（/machine-learning/crash-course）经真实浏览器渲染后
     DOM 内无任何 "license" / "Creative Commons" 字样 → 该页许可记 unknown，
     不由「同站其他页是 CC BY 4.0」推定（Module 5）。 */
const GOOGLE = (path, title, { goals, skills, subject, type, prereqOfficial = null, prereqSkills = [], license = 'BY' }) => ({
  title,
  official_url: `https://developers.google.com/${path}`,
  /* 本网络无法直连 developers.google.com（DNS/SNI），
     故许可与内容核验在 **Google 官方中国域** developers.google.cn 的同名路径上完成。 */
  verification_url: `https://developers.google.cn/${path}`,
  license_evidence_url: 'https://developers.google.com/terms/site-policies',
  provider_id: PROVIDER_ID_BASE + 3,     // 104
  source_type: 'official_documentation',
  resource_type: type,
  level_official: null,                  // 官方未给出课程等级 → null，不猜
  learning_goal_ids: goals,
  skill_ids: skills,
  subject_id: subject,
  language: 'en',
  learning_mode: 'self_paced',
  /* 费用：官方页面**没有**就课程收费与否作出任何声明。
     页面上唯一与 "free" 相关的文字是「Join the Google Developer Program for free」，
     那指的是**开发者计划**，不是本课程。
     → 按 Module 2「官方未明确说明的字段写 null，禁止用常识推断」记 null。
     这正是「免费访问 ≠ 已核验免费」的实例：Google 课程事实上可免费阅读，
     但 CourseMap 不用「看起来显然」替代来源声明。 */
  fee: null,
  certificate_available: null,           // 官方未就课程发放证书作出说明 → null
  prerequisites_official: prereqOfficial,
  prerequisite_skill_ids: prereqSkills,
  license,
  retrieval_method: 'official_course_page',
});

const REAL_RESOURCES = [
  /* ---- Programming / Python（subject 1 · goal 1 Python 入门）---- */
  OCW('6.0001', '6-0001-introduction-to-computer-science-and-programming-in-python-fall-2016',
    'Introduction to Computer Science and Programming in Python', 'Undergraduate', [1], [1], 1),
  OCW('6.100L', '6-100l-introduction-to-cs-and-programming-using-python-fall-2022',
    'Introduction to CS and Programming using Python', 'Undergraduate', [1], [1], 1),
  OCW('6.189', '6-189-a-gentle-introduction-to-programming-using-python-january-iap-2011',
    'A Gentle Introduction to Programming Using Python', 'Undergraduate', [1], [1], 1),
  OCW('6.189', '6-189-a-gentle-introduction-to-programming-using-python-january-iap-2008',
    'A Gentle Introduction to Programming Using Python', 'Undergraduate', [1], [1], 1),
  OCW('6.S095', '6-s095-programming-for-the-puzzled-january-iap-2018',
    'Programming for the Puzzled', 'Undergraduate', [1], [1], 1),
  OCW('12.010', '12-010-computational-methods-of-scientific-programming-fall-2024',
    'Computational Methods of Scientific Programming', 'Undergraduate', [1], [1, 18], 1),
  OCW('12.010', '12-010-computational-methods-of-scientific-programming-fall-2011',
    'Computational Methods of Scientific Programming', 'Undergraduate', [1], [1, 18], 1),

  /* ---- Data Analysis / Statistics（goal 2 subject 2 / goal 5 subject 4）---- */
  OCW('6.0002', '6-0002-introduction-to-computational-thinking-and-data-science-fall-2016',
    'Introduction to Computational Thinking and Data Science', 'Undergraduate', [2], [1, 2, 3], 2),
  OCW('18.443', '18-443-statistics-for-applications-spring-2015',
    'Statistics for Applications', 'Undergraduate', [5], [6], 4),
  OCW('18.443', '18-443-statistics-for-applications-fall-2006',
    'Statistics for Applications', 'Undergraduate', [5], [6], 4),
  OCW('18.655', '18-655-mathematical-statistics-spring-2016',
    'Mathematical Statistics', 'Graduate', [5], [6], 4),
  OCW('18.S997', '18-s997-high-dimensional-statistics-spring-2015',
    'High-Dimensional Statistics', 'Graduate', [5], [6], 4),
  OCW('14.381', '14-381-statistical-method-in-economics-fall-2018',
    'Statistical Method in Economics', 'Graduate', [5], [6], 4),
  OCW('15.097', '15-097-prediction-machine-learning-and-statistics-spring-2012',
    'Prediction: Machine Learning and Statistics', 'Graduate', [4], [6, 9], 3),
  OCW('18.465', '18-465-topics-in-statistics-statistical-learning-theory-spring-2007',
    'Topics in Statistics: Statistical Learning Theory', 'Graduate', [5], [6], 4),

  /* ---- Artificial Intelligence / Machine Learning（subject 3 · goal 4）---- */
  OCW('6.036', '6-036-introduction-to-machine-learning-fall-2020',
    'Introduction to Machine Learning', 'Undergraduate', [4], [9], 3),
  OCW('6.867', '6-867-machine-learning-fall-2006',
    'Machine Learning', 'Graduate', [4], [9], 3),
  OCW('18.657', '18-657-mathematics-of-machine-learning-fall-2015',
    'Mathematics of Machine Learning', 'Graduate', [4], [9], 3),
  OCW('18.409', '18-409-algorithmic-aspects-of-machine-learning-spring-2015',
    'Algorithmic Aspects of Machine Learning', 'Graduate', [4], [9], 3),
  OCW('6.S897', '6-s897-machine-learning-for-healthcare-spring-2019',
    'Machine Learning for Healthcare', 'Graduate', [4], [9], 3),
  OCW('6.S980', '6-s980-machine-learning-for-inverse-graphics-fall-2022',
    'Machine Learning for Inverse Graphics', 'Graduate', [4], [9], 3),
  OCW('RES.LL-005', 'res-ll-005-mathematics-of-big-data-and-machine-learning-january-iap-2020',
    'Mathematics of Big Data and Machine Learning', 'Undergraduate', [4], [9], 3),
  OCW('RES.EC-001', 'res-ec-001-exploring-fairness-in-machine-learning-for-international-development-spring-2020',
    'Exploring Fairness in Machine Learning for International Development', 'Non-Credit', [4], [9, 11], 3),

  /* ---- Research Methods（subject 4 · goal 13）---- */
  OCW('15.347', '15-347-doctoral-seminar-in-research-methods-i-fall-2004',
    'Doctoral Seminar in Research Methods I', 'Graduate', [13], [19], 4),
  OCW('15.348', '15-348-doctoral-seminar-in-research-methods-ii-spring-2004',
    'Doctoral Seminar in Research Methods II', 'Graduate', [13], [19], 4),
  OCW('21H.931', '21h-931-seminar-in-historical-methods-spring-2002',
    'Seminar in Historical Methods', 'Undergraduate', [13], [19], 4),
  OCW('21H.931', '21h-931-seminar-in-historical-methods-spring-2003',
    'Seminar in Historical Methods', 'Undergraduate', [13], [19], 4),
  OCW('17.801', '17-801-political-science-scope-and-methods-fall-2017',
    'Political Science Scope and Methods', 'Undergraduate', [13], [19], 4),
  OCW('11.237', '11-237-practice-of-participatory-action-research-par-spring-2016',
    'Practice of Participatory Action Research (PAR)', 'Graduate', [13], [19], 4),

  /* ---- Research Integrity（subject 4 · goal 14）---- */
  OCW('HST.502', 'hst-502-survival-skills-for-researchers-the-responsible-conduct-of-research-spring-2003',
    'Survival Skills for Researchers: The Responsible Conduct of Research', 'Graduate', [14], [20], 4),

  /* ---- Academic Writing（subject 5 · goal 8 学术英语写作）---- */
  OCW('21W.036', '21w-036-science-writing-and-new-media-writing-and-the-environment-spring-2022',
    'Science Writing and New Media: Writing and the Environment', 'Undergraduate', [8], [13], 5),
  OCW('11.229', '11-229-advanced-writing-seminar-spring-2004',
    'Advanced Writing Seminar', 'Graduate', [8], [13], 5),
  OCW('21W.015', '21w-015-writing-and-rhetoric-writing-about-sports-fall-2013',
    'Writing and Rhetoric: Writing about Sports', 'Undergraduate', [8], [13], 5),
  OCW('21W.022', '21w-022-03-writing-and-experience-reading-and-writing-autobiography-spring-2014',
    'Writing and Experience: Reading and Writing Autobiography', 'Undergraduate', [8], [13], 5),
  OCW('7.02CI', '7-02ci-experimental-biology-communications-intensive-spring-2005',
    'Experimental Biology - Communications Intensive', 'Undergraduate', [8], [13], 5),
  OCW('21L.000J', '21l-000j-writing-about-literature-writing-about-love-fall-2015',
    'Writing About Literature: Writing About Love', 'Undergraduate', [8], [13], 5),

  /* ---- OpenStax（真实开放教科书）---- */
  OPENSTAX('introduction-python-programming', 'Introduction to Python Programming',
    [1], [1], 1, '2024-03-13', 'Udayan Das, Aubrey Lawson, Chris Mayfield, Narges Norouzi'),
  OPENSTAX('introductory-statistics-2e', 'Introductory Statistics 2e',
    [5], [6], 4, '2023-12-13', 'Barbara Illowsky, Susan Dean'),
  OPENSTAX('writing-guide', 'Writing Guide with Handbook',
    [8], [13], 5, '2021-12-21', 'Michelle Bachelor Robinson, Maria Jerskey, featuring Toby Fulwiler'),
  OPENSTAX('college-success', 'College Success',
    [15], [21], SUBJECT_ID, '2020-03-27', 'Amy Baldwin'),

  /* ==========================================================================
     Real OER Expansion（本轮新增）
     --------------------------------------------------------------------------
     追加在列表末尾 → 既有 101..140 的 ID 保持不变，新资源从 141 起。
     ======================================================================== */

  /* ---- MIT OCW：候选清单中的新增项 ---- */
  OCW('6.006', '6-006-introduction-to-algorithms-spring-2020',
    'Introduction to Algorithms', 'Undergraduate', [16], [22], 1),
  OCW('18.S191', '18-s191-introduction-to-computational-thinking-fall-2020',
    'Introduction to Computational Thinking', 'Undergraduate', [18], [24], 1),
  OCW('RES.1-002', 'introduction-to-r-and-gis-fall-2023',
    'Introduction to R and Geographic Information Systems (GIS)', 'Non-Credit', [3], [7], 4),

  /* ---- Harvard CS50（全部 6 门候选课）---- */
  HARVARD('x', 'CS50x: Introduction to Computer Science', {
    goals: [1], skills: [1], subject: 1, level: 'Introductory',
    prereqOfficial: '官方原文："for concentrators and non-concentrators alike, with or without prior programming experience."（无先修要求）',
  }),
  HARVARD('python', "CS50's Introduction to Programming with Python", {
    goals: [1], skills: [1], subject: 1, level: 'Introductory',
    prereqOfficial: '官方原文："Designed for students with or without prior programming experience who\'d like to learn Python specifically."（无先修要求）',
  }),
  HARVARD('ai', "CS50's Introduction to Artificial Intelligence with Python", {
    goals: [4, 10], skills: [9, 11], subject: 3, level: 'Intermediate',
    prereqOfficial: '官方 Prerequisites 原文："CS50x or at least one year of experience with Python."',
    prereqSkills: [1],
  }),
  HARVARD('r', "CS50's Introduction to Programming with R", {
    goals: [3], skills: [7], subject: 4, level: 'Introductory',
    prereqOfficial: '官方未列出先修要求（"You can take CS50R before CS50x, during CS50x, or after CS50x."）',
  }),
  HARVARD('sql', "CS50's Introduction to Databases with SQL", {
    goals: [12], skills: [5], subject: 2, level: 'Introductory',
    prereqOfficial: '官方未列出先修要求（"You can take CS50 SQL before CS50x, during CS50x, or after CS50x."）',
  }),
  HARVARD('web', "CS50's Web Programming with Python and JavaScript", {
    goals: [17], skills: [23], subject: 1, level: 'Intermediate',
    prereqOfficial: '官方 Prerequisites 原文："CS50x or prior experience in any programming language."',
    prereqSkills: [1],
  }),

  /* ---- Google for Developers（机器学习教育）---- */
  GOOGLE('machine-learning/crash-course', 'Machine Learning Crash Course', {
    goals: [4], skills: [9], subject: 3, type: 'course', license: 'UNKNOWN',
    prereqOfficial: '官方原文："Machine Learning Crash Course does not presume or require any prior knowledge in machine learning." 但建议："You should be a good programmer. Ideally, you should have some experience programming in Python."',
  }),
  GOOGLE('machine-learning/intro-to-ml', 'Introduction to Machine Learning', {
    goals: [4], skills: [9], subject: 3, type: 'course',
  }),
  GOOGLE('machine-learning/problem-framing', 'Introduction to Machine Learning Problem Framing', {
    goals: [4, 10], skills: [9, 11], subject: 3, type: 'learning_module',
  }),
  GOOGLE('machine-learning/managing-ml-projects', 'Managing Machine Learning Projects', {
    goals: [4, 10], skills: [9], subject: 3, type: 'learning_module',
  }),
  GOOGLE('machine-learning/guides/rules-of-ml', 'Rules of Machine Learning', {
    goals: [4], skills: [9], subject: 3, type: 'tutorial',
  }),
  GOOGLE('machine-learning/decision-forests', 'Decision Forests', {
    goals: [4], skills: [9], subject: 3, type: 'learning_module',
  }),

  /* ---- 补强「数据分析 / 统计」方向（任务列为优先扩充方向）---- */
  OCW('15.075J', '15-075j-statistical-thinking-and-data-analysis-fall-2011',
    'Statistical Thinking and Data Analysis', 'Undergraduate', [19], [25], 2),
  OCW('14.310x', '14-310x-data-analysis-for-social-scientists-spring-2023',
    'Data Analysis for Social Scientists', 'Graduate', [19], [25], 2),
  OPENSTAX('principles-data-science', 'Principles of Data Science',
    [19, 2], [25, 1], 2, '2025-01-24', 'Shaun V. Ault, Soohyun Nam Liao, Larry Musolino'),
  OPENSTAX('introductory-business-statistics-2e', 'Introductory Business Statistics 2e',
    [5], [6], 4, '2023-12-13', 'Alexander Holmes, Barbara Illowsky, Susan Dean'),
];

/* ---------------------------------------------------------------------------
   4. 组装 Source / Resource / Resource-Source / Fee-History
   -------------------------------------------------------------------------- */
function readJson(name) {
  return JSON.parse(readFileSync(join(DATA, name), 'utf8'));
}
function writeJson(name, value) {
  writeFileSync(join(DATA, name), `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function build() {
  const sources = [];
  const resources = [];
  const relations = [];
  const fees = [];

  REAL_RESOURCES.forEach((r, i) => {
    const resourceId = RESOURCE_ID_BASE + i;
    const sourceId = SOURCE_ID_BASE + i;

    /* ---- 提供方画像：名称、许可、许可说明、核验字段清单一处定义 ---- */
    const PROFILE = {
      [PROVIDER_ID_BASE]: {
        provider: 'MIT OpenCourseWare',
        license: LICENSE_CC_BY_NC_SA_4,
        ai_training_allowed: true,
        verified: ['title', 'provider', 'url', 'license', 'level_official', 'language',
          'learning_mode', 'fee', 'certificate_available'],
        mapped: ['subject_id', 'learning_goal_ids', 'skill_ids', 'resource_type'],
        note: '元数据取自 MIT OCW 官方课程页与官方许可页；未保存任何课程正文、讲义或视频。',
        license_note: 'MIT OpenCourseWare 站点许可为 CC BY-NC-SA 4.0（官方 Privacy and Terms of Use 页）。官方另列「Permitted Use of AI Training」条款：在署名、仅非商业、衍生模型同许可的条件下允许用于 AI 训练。',
      },
      [PROVIDER_ID_BASE + 1]: {
        provider: 'OpenStax（莱斯大学）',
        license: LICENSE_CC_BY_NC_SA_4,
        ai_training_allowed: false,
        verified: ['title', 'provider', 'url', 'license', 'language', 'publish_date', 'authors', 'fee'],
        mapped: ['subject_id', 'learning_goal_ids', 'skill_ids', 'resource_type', 'learning_mode'],
        note: '元数据取自 OpenStax 官方书目页与章节署名块；未保存任何正文内容。',
        license_note: 'OpenStax 章节署名块明确声明：未经 OpenStax 事先书面许可，本书不得用于训练大语言模型或以其他方式被摄取进 LLM / 生成式 AI 产品。CourseMap 因此只保存元数据与官方链接，不摄取正文。',
      },
      [PROVIDER_ID_BASE + 2]: {
        provider: '哈佛大学 CS50 公开课',
        license: LICENSE_CC_BY_NC_SA_4,
        ai_training_allowed: null,   // CS50 许可页只声明 CC BY-NC-SA 4.0，未就 AI 训练表态 → null
        verified: ['title', 'provider', 'url', 'license', 'level_official', 'language',
          'learning_mode', 'fee', 'certificate_available', 'prerequisites_official'],
        mapped: ['subject_id', 'learning_goal_ids', 'skill_ids', 'resource_type', 'prerequisite_skill_ids'],
        note: '元数据取自 CS50 官方课程页、/license/ 页与官方 FAQ；未保存任何课程正文、讲义或视频。',
        license_note: 'CS50 各课程 /license/ 页原文：本课程按 Creative Commons Attribution-NonCommercial-ShareAlike 4.0 International（CC BY-NC-SA 4.0）许可发布。官方许可页未就 AI 训练作出说明，故该项记为未知。证书：官方 FAQ 原文「A CS50 Certificate is a free certificate from CS50 itself.」——免费路径本身即含免费证书（非学分、非 Harvard 认证）。',
      },
      [PROVIDER_ID_BASE + 3]: {
        provider: 'Google for Developers（机器学习课程）',
        license: LICENSE_CC_BY_4,
        ai_training_allowed: true,
        verified: ['title', 'provider', 'url', 'license', 'language', 'prerequisites_official'],
        mapped: ['subject_id', 'learning_goal_ids', 'skill_ids', 'resource_type', 'level_official'],
        note: '元数据取自 Google for Developers 官方机器学习课程/指南页；未保存任何课程正文、视频或图片。',
        license_note: 'Google for Developers 页面底部声明原文：「Except as otherwise noted, the content of this page is licensed under the Creative Commons Attribution 4.0 License, and code samples are licensed under the Apache 2.0 License.」→ CC BY 4.0：允许商业使用、需署名、无 ShareAlike。注意 Google 商标与页面中的图片/音视频/外链内容不在此许可范围内（站点政策页明确排除）。',
      },
    };

    const profile = PROFILE[r.provider_id];
    if (!profile) throw new Error(`未知 provider_id: ${r.provider_id}`);

    /* 许可可按资源覆盖：Google 的 MLCC 落地页无许可声明 → unknown。 */
    const license = r.license === 'UNKNOWN' ? LICENSE_UNKNOWN
      : (r.license === 'BY' ? LICENSE_CC_BY_4 : profile.license);
    const isLicenseUnknown = r.license === 'UNKNOWN';

    /* ---- Source：官方页面本身即来源 ---- */
    sources.push({
      source_id: sourceId,
      title: r.title,
      provider: profile.provider,
      official_url: r.official_url,
      url: r.official_url,                                   // 兼容既有字段名
      source_type: r.source_type,
      license: license.license,
      license_url: license.license_url,
      license_evidence_url: r.license_evidence_url
        || 'https://ocw.mit.edu/pages/privacy-and-terms-of-use/',
      commercial_use: license.commercial_use,
      adaptation_allowed: license.adaptation_allowed,
      attribution_required: license.attribution_required,
      share_alike: license.share_alike,
      public_domain: license.public_domain,
      usage_permission: license.usage_permission,
      /* 关键合规差异：OpenStax 在 CC BY-NC-SA 之外**额外禁止** LLM 训练/摄取；
         MIT OCW 则在满足署名/非商业/同许可条件下允许 AI 训练；
         CS50 未表态 → null；Google（CC BY 4.0）无训练限制。
         这一差异必须逐字记录，不能用站点默认值抹平。 */
      ai_training_allowed: profile.ai_training_allowed,
      license_note: isLicenseUnknown
        ? '本页经真实浏览器渲染后，DOM 内不存在任何 "license" / "Creative Commons" / "Except as otherwise" 字样（2026-10-06 核验）；同站其他机器学习模块页均携带 CC BY 4.0 声明。按 Module 5「未知记 unknown、不推定」处理，因此本来源不声明任何开放许可，也不声明公有领域或允许商用。'
        : profile.license_note,
      retrieval_method: r.retrieval_method,
      verification_url: r.verification_url || null,   // 实际完成核验的等价官方URL（Google 用 .cn 官方域）
      observed_at: OBSERVED_AT,
      retrieved_at: OBSERVED_AT,                             // 兼容既有字段名
      verification_status: 'source_verified',
      status: 'published',
      data_class: 'real',
    });

    /* ---- Resource ---- */
    resources.push({
      resource_id: resourceId,
      title: r.title,
      provider_id: r.provider_id,
      subject_id: r.subject_id,
      learning_goal_ids: r.learning_goal_ids,
      skill_ids: r.skill_ids,
      resource_type: r.resource_type,
      /* difficulty 保持 null：官方只给 Undergraduate/Graduate 等级，
         映射到 CourseMap 枚举属于解释而非事实（Module D：Unknown = null）。 */
      difficulty: null,
      level_official: r.level_official,
      language: r.language,
      fee: r.fee,
      currency: null,                                        // fee=0（免费）不涉及币种，避免编造 USD/CNY
      duration_hours: null,
      weekly_workload_hours: null,
      learning_mode: r.learning_mode,
      prerequisite_skill_ids: r.prerequisite_skill_ids || [],
      prerequisites_official: r.prerequisites_official || null,
      certificate_available: r.certificate_available,
      rating: null,
      rating_count: null,
      learning_outcomes: [],
      description: null,                                     // 官方描述未逐条核验 → 保持 null，不生成
      authors: r.authors || null,
      publish_date: r.publish_date || null,
      url: r.official_url,
      updated_at: null,
      observed_at: OBSERVED_AT,
      verification_status: 'editorial_verified',
      data_class: 'real',
      status: 'published',
      source_ids: [sourceId],
    });

    /* ---- Resource-Source 关系（字段级证据范围）----
       source_verified_fields：由官方来源**直接支持**的字段；
       editorially_mapped_fields：CourseMap 编辑所做的分类映射（非来源事实）。
       validator 依据这份清单判定「猜字段」BLOCKER。 */
    relations.push({
      resource_source_id: RESOURCE_ID_BASE + i,
      resource_id: resourceId,
      source_id: sourceId,
      field_scope: 'provenance',
      data_class: 'real',           // 幂等键：重跑时据此清理上一次生成的真实关系
      source_verified_fields: isLicenseUnknown
        ? profile.verified.filter((f) => f !== 'license')
        : [...profile.verified, ...(r.prerequisites_official ? ['prerequisites_official'] : [])]
          .filter((f, idx, arr) => arr.indexOf(f) === idx),
      editorially_mapped_fields: isLicenseUnknown
        ? [...profile.mapped, 'license']
        : profile.mapped,
      note: isLicenseUnknown
        ? `${profile.note} 许可字段无法由本页声明支持，故列入 editorially_mapped_fields 并记为 unknown。`
        : profile.note,
    });

    /* ---- Fee 观测（fee=0 是来源支持的观测值，必须带来源与观测日）----
       fee === null 的资源**不产生**费用观测记录：没有来源声明，
       就不存在「已观测到的费用」。 */
    if (r.fee !== null && r.fee !== undefined) {
      fees.push({
        fee_observation_id: RESOURCE_ID_BASE + i,
        resource_id: resourceId,
        fee: r.fee,
        currency: null,
        fee_type: 'full',
        observed_at: OBSERVED_AT,
        verification_status: 'source_verified',
        source_id: sourceId,
        data_class: 'real',
        status: 'published',
      });
    }
  });

  return { sources, resources, relations, fees };
}

/* ---------------------------------------------------------------------------
   5. 写盘（保持 demo 记录不变）
   -------------------------------------------------------------------------- */
/** 保留 demo 记录：既排除 data_class === 'real'，也排除落在真实 ID 段（>=101）的记录。
    双重条件保证即使历史版本漏写 data_class，重跑也能完全清理上一次生成的真实数据。 */
function keepDemo(list, key) {
  return list.filter((row) => row && row.data_class !== 'real' && Number(row[key]) < 101);
}

function main() {
  const { sources, resources, relations, fees } = build();

  const data = {
    'providers.json': [...keepDemo(readJson('providers.json'), 'provider_id'), ...REAL_PROVIDERS],
    'subjects.json': [...keepDemo(readJson('subjects.json'), 'subject_id'), ...REAL_SUBJECTS],
    'skills.json': [...keepDemo(readJson('skills.json'), 'skill_id'), ...REAL_SKILLS],
    'learning-goals.json': [...keepDemo(readJson('learning-goals.json'), 'goal_id'), ...REAL_GOALS],
    'sources.json': [...keepDemo(readJson('sources.json'), 'source_id'), ...sources],
    'resources.json': [...keepDemo(readJson('resources.json'), 'resource_id'), ...resources],
    'resource-source.json': [...keepDemo(readJson('resource-source.json'), 'resource_source_id'), ...relations],
    'fee-history.json': [...keepDemo(readJson('fee-history.json'), 'fee_observation_id'), ...fees],
  };

  for (const [name, value] of Object.entries(data)) {
    if (!DRY) writeJson(name, value);
    process.stdout.write(`  ${name.padEnd(24)} rows=${value.length}\n`);
  }

  // demo / real 分离统计
  const resDemo = data['resources.json'].filter((r) => r.data_class === 'demo').length;
  const resReal = data['resources.json'].filter((r) => r.data_class === 'real').length;
  process.stdout.write(`\nresources: demo=${resDemo}  real=${resReal}  total=${data['resources.json'].length}\n`);
  process.stdout.write(`sources:   demo=2  real=${sources.length}\n`);
  process.stdout.write(DRY ? '(dry-run, nothing written)\n' : 'written.\n');
}

main();
