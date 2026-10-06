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
    const isOpenStax = r.provider_id === PROVIDER_ID_BASE + 1;

    /* ---- Source：官方页面本身即来源 ---- */
    sources.push({
      source_id: sourceId,
      title: r.title,
      provider: isOpenStax ? 'OpenStax（莱斯大学）' : 'MIT OpenCourseWare',
      official_url: r.official_url,
      url: r.official_url,                                   // 兼容既有字段名
      source_type: r.source_type,
      license: LICENSE_CC_BY_NC_SA_4.license,
      license_url: LICENSE_CC_BY_NC_SA_4.license_url,
      license_evidence_url: r.license_evidence_url
        || 'https://ocw.mit.edu/pages/privacy-and-terms-of-use/',
      commercial_use: LICENSE_CC_BY_NC_SA_4.commercial_use,
      adaptation_allowed: LICENSE_CC_BY_NC_SA_4.adaptation_allowed,
      attribution_required: LICENSE_CC_BY_NC_SA_4.attribution_required,
      share_alike: LICENSE_CC_BY_NC_SA_4.share_alike,
      public_domain: LICENSE_CC_BY_NC_SA_4.public_domain,
      usage_permission: LICENSE_CC_BY_NC_SA_4.usage_permission,
      /* 关键合规差异：OpenStax 在 CC BY-NC-SA 之外**额外禁止** LLM 训练/摄取；
         MIT OCW 则在满足署名/非商业/同许可条件下允许 AI 训练。
         这一差异必须逐字记录，不能用站点默认值抹平。 */
      ai_training_allowed: isOpenStax ? false : true,
      license_note: isOpenStax
        ? 'OpenStax 章节署名块明确声明：未经 OpenStax 事先书面许可，本书不得用于训练大语言模型或以其他方式被摄取进 LLM / 生成式 AI 产品。CourseMap 因此只保存元数据与官方链接，不摄取正文。'
        : 'MIT OpenCourseWare 站点许可为 CC BY-NC-SA 4.0（官方 Privacy and Terms of Use 页）。官方另列「Permitted Use of AI Training」条款：在署名、仅非商业、衍生模型同许可的条件下允许用于 AI 训练。',
      retrieval_method: r.retrieval_method,
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
      prerequisite_skill_ids: [],
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
      source_verified_fields: isOpenStax
        ? ['title', 'provider', 'url', 'license', 'language', 'publish_date', 'authors', 'fee']
        : ['title', 'provider', 'url', 'license', 'level_official', 'language', 'learning_mode', 'fee', 'certificate_available'],
      editorially_mapped_fields: isOpenStax
        ? ['subject_id', 'learning_goal_ids', 'skill_ids', 'resource_type', 'learning_mode']
        : ['subject_id', 'learning_goal_ids', 'skill_ids', 'resource_type'],
      note: isOpenStax
        ? '元数据取自 OpenStax 官方书目页与章节署名块；未保存任何正文内容。'
        : '元数据取自 MIT OCW 官方课程页与官方许可页；未保存任何课程正文、讲义或视频。',
    });

    /* ---- Fee 观测（fee=0 是来源支持的观测值，必须带来源与观测日）---- */
    fees.push({
      fee_observation_id: RESOURCE_ID_BASE + i,
      resource_id: resourceId,
      fee: 0,
      currency: null,
      fee_type: 'full',
      observed_at: OBSERVED_AT,
      verification_status: 'source_verified',
      source_id: sourceId,
      data_class: 'real',
      status: 'published',
    });
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
