/* ============================================================================
   CourseMap（学途） — labels.js
   受控枚举的**显示标签**与说明文案。
   注意：这里是「怎么显示」，不是「数据是什么」。
   字段定义的真源是 data/schema/entities-v0.1.json；本文件只做展示映射。
   ========================================================================== */

export const RESOURCE_TYPE = {
  course: '课程',
  tutorial: '教程',
  book: '书籍',
  open_course: '公开课',
  learning_module: '学习模块',
};

export const DIFFICULTY = {
  beginner: { label: '入门', tone: 'verified' },
  intermediate: { label: '进阶', tone: 'unverified' },
  advanced: { label: '高阶', tone: 'demo' },
};

export const LEARNING_MODE = {
  self_paced: '自学节奏',
  instructor_led: '直播/带教',
  hybrid: '混合式',
};

export const LANGUAGE = {
  zh: '中文',
  en: '英文',
  'zh-en': '中英双语',
};

export const RECOMMENDED_LEVEL = {
  beginner: '入门者',
  intermediate: '有基础者',
  advanced: '进阶者',
};

/** 费用核验状态。tone 决定徽标样式；hint 是给用户的解释。 */
export const FEE_VERIFICATION = {
  unverified: { label: '未核验', tone: 'unverified', hint: '该费用尚未经过人工或提供方核验。' },
  editorial_verified: { label: '编辑核验', tone: 'verified', hint: '由 CourseMap 编辑人工核验。' },
  provider_confirmed: { label: '提供方确认', tone: 'verified', hint: '由资源提供方确认。' },
  expired: { label: '已过期观测', tone: 'unknown', hint: '该条观测已被标记为过期，追加了新观测。' },
};

export const SOURCE_TYPE = {
  official_provider: '官方提供方',
  university_site: '大学官方页面',
  government_open_education: '政府/开放教育',
  authorized_api: '已授权 API',
  open_courseware: '开放课件（OCW）',
  open_textbook: '开放教材（OER）',
  editorial_demo: '编辑自建演示',
  product_doc: '产品文档（内部）',
};

export const USAGE_PERMISSION = {
  authorized: { label: '已授权', tone: 'verified' },
  open_license: { label: '开放许可', tone: 'verified' },
  public_domain: { label: '公有领域', tone: 'verified' },
  non_commercial_reuse_with_attribution: { label: '非商业复用（需署名）', tone: 'verified' },
  editor_created_demo: { label: '编辑自建演示', tone: 'demo' },
  pending_review: { label: '待授权审查', tone: 'unverified' },
  restricted: { label: '受限（不可发布）', tone: 'unknown' },
  unknown: { label: '授权状态未知', tone: 'unknown' },
};

export const SOURCE_VERIFICATION = {
  unverified: { label: '未核验', tone: 'unverified' },
  human_verified: { label: '人工核验', tone: 'verified' },
  /* Module C/F：真实 OER 来源的核验状态。含义是「已比对官方页面」，比 human_verified 更弱，
     但仍属于「已核验」，不能被显示为「未核验」。 */
  source_verified: { label: '来源已核验', tone: 'verified' },
};

/* Module G/U：许可语义。免费 ≠ 开放许可 ≠ 公有领域 ≠ 允许商用。
   这些标签把 JSON 布尔字段翻译成人话，避免把「免费」误读成「可以随便用」。 */
export const LICENSE_FLAG = {
  commercial_use: { true: '允许商用', false: '禁止商用' },
  public_domain: { true: '公有领域', false: '非公有领域' },
  adaptation_allowed: { true: '允许改编', false: '禁止改编' },
  attribution_required: { true: '必须署名', false: '无需署名' },
  share_alike: { true: '衍生需同许可', false: '无同许可要求' },
  ai_training_allowed: { true: '允许 AI 训练', false: '禁止 AI 训练（含 LLM 摄取）' },
};

/** 许可语义的关键提示：始终与许可字符串一起展示，防止「免费=可商用」误读。 */
export const LICENSE_SEMANTICS_NOTE
  = '「免费访问」不等于「开放许可」，也不等于「公有领域」，更不等于「允许商用」。';

export const DATA_CLASS = {
  demo: { label: 'DEMO', long: '演示数据', tone: 'demo' },
  real: { label: 'REAL', long: '真实数据', tone: 'verified' },
};

export const AGGREGATE_PROVENANCE = {
  demo_only: { label: '全部为演示评价', tone: 'demo' },
  mixed: { label: '演示与真实评价混合', tone: 'unverified' },
  real_only: { label: '全部为真实评价', tone: 'verified' },
  none: { label: '暂无评价', tone: 'unknown' },
};

export const PROVIDER_TYPE = {
  university_open: '大学开放平台',
  mooc_platform: 'MOOC 平台',
  training_studio: '训练营',
  community: '开源社区',
  language_center: '语言学习机构',
  research_workshop: '科研工作坊',
};

export const COMPLETION_STATUS = {
  completed: '已完成',
  in_progress: '学完一部分',
  dropped: '中途放弃',
};

export const RESOURCE_SOURCE_SCOPE = {
  general: '通用',
  fee: '费用',
  description: '描述',
  outcomes: '学习产出',
  schedule: '时长/工作量',
};

/** 学习评价标签（Review 的受控枚举） */
export const LEARNING_TAGS = {
  practical: '实操多',
  well_structured: '结构清晰',
  beginner_friendly: '对新手友好',
  heavy_workload: '工作量大',
  outdated_examples: '例子偏旧',
  theory_heavy: '理论偏多',
  good_exercises: '练习扎实',
  pace_comfortable: '节奏舒适',
};

export const FEE_TYPE = {
  full: '常规价',
  promo: '优惠价',
  subscription_month: '按月订阅',
};

export const SORT_LABELS = {
  relevance: '相关度',
  fee_asc: '费用从低到高',
  fee_desc: '费用从高到低',
  rating: '学习者评分',
  duration_asc: '总时长从短到长',
  workload_asc: '每周投入从少到多',
};

/** 用于展示「未知」的统一文案 */
export const UNKNOWN = 'Unknown';
export const NOT_VERIFIED = 'Not yet verified';
export const LIMITED_DATA = 'Limited data';

export function labelOf(map, key, fallback = UNKNOWN) {
  if (key === null || key === undefined) return fallback;
  const entry = map[key];
  if (!entry) return String(key);
  return typeof entry === 'string' ? entry : entry.label;
}

export function pickEnum(map, key) {
  if (key === null || key === undefined) return null;
  const entry = map[key];
  if (!entry) return { label: String(key), tone: 'unknown' };
  return typeof entry === 'string' ? { label: entry, tone: 'unknown' } : entry;
}
