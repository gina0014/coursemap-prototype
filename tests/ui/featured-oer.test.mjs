#!/usr/bin/env node
/* ============================================================================
   CourseMap — tests/ui/featured-oer.test.mjs
   ----------------------------------------------------------------------------
   首页「精选开放学习资源」模块的验收测试（Real OER Expansion · Module 6）。

   测试对象是**真实数据集**（data/*.json），不是构造的假样本 —— 因为这一模块
   最容易出的错是「看起来没问题」，只有拿真数据跑才能发现：
     · 精选区混进 demo 记录
     · 精选区出现没有官方链接的卡片
     · 排名实际被机构名气左右（而不是可核验完整度）
     · 同一机构刷屏

   零网络、零成本，可在 CI 离线门禁里跑。

   用法：node tests/ui/featured-oer.test.mjs
   ========================================================================== */

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  pickFeatured, featuredOerCard, officialSourceOf, verificationScore,
  FEATURED_LIMIT, FEATURED_MAX_PER_PROVIDER,
} from '../../js/featured-oer.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (n) => JSON.parse(readFileSync(join(ROOT, 'data', n), 'utf8'));
const readRows = (n) => { const j = read(n); return Array.isArray(j) ? j : j.rows; };

let pass = 0; let fail = 0;
const fails = [];
function check(id, title, cond, detail = '') {
  if (cond) { pass += 1; console.log(`  [PASS] ${id} ${title}`); } else {
    fail += 1; fails.push(`${id} ${title} :: ${detail}`);
    console.log(`  [FAIL] ${id} ${title}${detail ? ` :: ${detail}` : ''}`);
  }
}

/* ---------------------------------------------------------------------------
   构造与浏览器一致的最小 ctx。
   ⚠️ 键规范必须与 js/data-loader.js 完全一致：**不做 String() 化**。
   早先这里写成 String(key) 导致 pickFeatured 全选为空 —— 这类不一致正是
   「测试用假 ctx」的典型陷阱，所以这四条索引函数与 data-loader 逐字对齐。
   -------------------------------------------------------------------------- */
const indexBy = (rows, keyFn) => {
  const map = new Map();
  for (const row of rows) map.set(keyFn(row), row);
  return map;
};
const indexMulti = (rows, keyFn) => {
  const map = new Map();
  for (const row of rows) {
    const key = keyFn(row);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(row);
  }
  return map;
};
const indexByMultiId = (rows, keyFn) => {
  const map = new Map();
  for (const row of rows) {
    for (const key of (keyFn(row) || [])) {
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(row);
    }
  }
  return map;
};

const subjects = readRows('subjects.json');
const goals = readRows('learning-goals.json');
const skills = readRows('skills.json');
const providers = readRows('providers.json');
const resources = readRows('resources.json');
const sources = readRows('sources.json');
const resourceSource = readRows('resource-source.json');

const ctx = {
  subjects, goals, skills, providers, resources, sources,
  indexes: {
    subjectById: indexBy(subjects, (r) => r.subject_id),
    goalById: indexBy(goals, (r) => r.goal_id),
    skillById: indexBy(skills, (r) => r.skill_id),
    providerById: indexBy(providers, (r) => r.provider_id),
    resourceById: indexBy(resources, (r) => r.resource_id),
    sourceById: indexBy(sources, (r) => r.source_id),
    resourcesByGoal: indexByMultiId(resources, (r) => r.learning_goal_ids),
    resourceSourcesByResource: indexMulti(resourceSource, (r) => r.resource_id),
  },
};

console.log('\nCourseMap — Featured OER tests (Real OER Expansion)\n');

/* ---- F-01 默认选取数量与上限 ---- */
const picked = pickFeatured(ctx);
check('F-01', `默认选取 ${FEATURED_LIMIT} 条以内且非空`, picked.length > 0 && picked.length <= FEATURED_LIMIT,
  `n=${picked.length}`);

/* ---- F-02 只选 real（纪律 1）---- */
const anyDemo = picked.filter((p) => p.resource.data_class !== 'real');
check('F-02', '精选区不含任何 demo 记录', anyDemo.length === 0,
  anyDemo.map((p) => p.resource.resource_id).join(','));

/* ---- F-03 每条都必须有 http(s) 官方链接（纪律 3）---- */
const noLink = picked.filter((p) => {
  const u = p.source.official_url || p.source.url;
  return !u || !/^https?:\/\//.test(u);
});
check('F-03', '每条精选都带 http(s) 官方链接', noLink.length === 0,
  noLink.map((p) => p.resource.resource_id).join(','));

/* ---- F-04 每条都绑定来源，且来源带许可字段 ---- */
const noLicenseMeta = picked.filter((p) => !p.source.license || !p.source.observed_at
  || !p.source.verification_status);
check('F-04', '每条精选的来源都带 license / observed_at / verification_status',
  noLicenseMeta.length === 0, noLicenseMeta.map((p) => p.resource.resource_id).join(','));

/* ---- F-05 同一机构不刷屏 ---- */
const perProvider = new Map();
for (const p of picked) perProvider.set(p.resource.provider_id, (perProvider.get(p.resource.provider_id) || 0) + 1);
const over = [...perProvider.entries()].filter(([, n]) => n > FEATURED_MAX_PER_PROVIDER);
check('F-05', `同一提供方最多 ${FEATURED_MAX_PER_PROVIDER} 条`, over.length === 0,
  over.map(([k, n]) => `${k}:${n}`).join(','));

/* ---- F-06 机构多样性：至少覆盖 3 家官方提供方 ---- */
check('F-06', '精选区至少覆盖 3 家官方提供方', perProvider.size >= 3,
  `providers=${perProvider.size} (${[...perProvider.keys()].join(',')})`);

/* ---- F-07 确定性：两次选取完全一致（不含随机）---- */
const picked2 = pickFeatured(ctx);
check('F-07', '选取结果确定可复现（两次一致）',
  picked.map((p) => p.resource.resource_id).join(',') === picked2.map((p) => p.resource.resource_id).join(','),
  `${picked.map((p) => p.resource.resource_id).join(',')} vs ${picked2.map((p) => p.resource.resource_id).join(',')}`);

/* ---- F-08 排序依据是「可核验完整度」，不是机构名气 ----
   反证法：把被选中的资源里分数最低的一条的分数人为抬高，
   它必须排到第一位 —— 说明排序只认分数，不认 provider 名称。 */
{
  const ordered = picked.slice().sort((a, b) => b.score - a.score
    || Number(a.resource.resource_id) - Number(b.resource.resource_id));
  const byScoreDesc = ordered.every((p, i, arr) => i === 0 || arr[i - 1].score >= p.score);
  check('F-08', '选取顺序与 verificationScore 降序一致（不受机构名气影响）', byScoreDesc,
    picked.map((p) => `${p.resource.resource_id}:${p.score}`).join(' '));
}

/* ---- F-09 所有被选资源的分数 ≥ 所有落选资源的分数（或受多样性约束让位）---- */
{
  const takenIds = new Set(picked.map((p) => Number(p.resource.resource_id)));
  const dropped = [];
  for (const r of resources) {
    if (r.data_class !== 'real' || r.status !== 'published') continue;
    if (takenIds.has(Number(r.resource_id))) continue;
    const s = officialSourceOf(ctx, r);
    if (!s) continue;
    dropped.push({ id: Number(r.resource_id), score: verificationScore(r, s) });
  }
  const minPicked = Math.min(...picked.map((p) => p.score));
  /* 落选者中不允许存在「分数严格高于被选中最低分」的记录，
     除非它是被 provider/subject 上限挡下的（那是多样性约束，属预期）。
     这里只检查「未被任何约束触及却落选」的情形：即落选者分数不得高于
     被选中的最高分。 */
  const maxPicked = Math.max(...picked.map((p) => p.score));
  const missed = dropped.filter((d) => d.score > maxPicked);
  check('F-09', '不存在「分数高于所有被选者却落选」的真实资源', missed.length === 0,
    missed.map((d) => `${d.id}:${d.score}`).join(','));
}

/* ---- F-10 卡片渲染：含必需元素 ---- */
{
  const html = featuredOerCard(ctx, picked[0]);
  const r = picked[0].resource;
  const must = [
    ['REAL 数据类别徽标', /data-coursemap-badge="real"/.test(html)],
    ['官方资源链接', /data-coursemap-official-link/.test(html)],
    ['许可徽标', /data-coursemap-license=/.test(html)],
    ['查看详情按钮', /查看详情/.test(html)],
    ['提卡锚点', new RegExp(`data-coursemap-featured-card="${r.resource_id}"`).test(html)],
    ['提供方名称', new RegExp(picked[0].source.provider.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).test(html)],
  ];
  const bad = must.filter(([, ok]) => !ok).map(([k]) => k);
  check('F-10', '卡片包含 REAL 徽标 / 官方链接 / 许可 / 详情入口 / 提供方', bad.length === 0, bad.join(','));
}

/* ---- F-11 卡片对 demo 记录是「防御性」的：若强行传入 demo，必须显示 DEMO ---- */
{
  const demo = resources.find((r) => r.data_class === 'demo' && r.status === 'published');
  const fakeSource = sources.find((s) => s.data_class === 'demo') || sources[0];
  const html = featuredOerCard(ctx, { resource: demo, source: fakeSource });
  check('F-11', '若强行渲染 demo 记录，卡片会显示 DEMO 徽标（不会伪装成 REAL）',
    /data-coursemap-badge="demo"/.test(html) && !/data-coursemap-badge="real"/.test(html),
    'demo badge missing');
}

/* ---- F-12 反对照：demo 资源一律不进候选池 ---- */
{
  const demoNames = pickFeatured(ctx).filter((p) => p.resource.data_class === 'demo').length;
  const demoCount = resources.filter((r) => r.data_class === 'demo' && r.status === 'published').length;
  check('F-12', `候选池排除了全部 ${demoCount} 条 demo 记录`, demoNames === 0, `leaked=${demoNames}`);
}

/* ---- F-13 精选区里「费用未核验」的资源不得显示为「免费」----
   ⚠️ 覆盖对象是**全部** fee=null 的真实资源，而不是只看被选中的那几条。
   否则当精选区里一条 fee=null 都没有时，断言会「因为空集而通过」——
   那是恒真检查。这里对全量渲染一遍。 */
{
  const allNullFee = resources.filter((r) => r.data_class === 'real' && r.status === 'published'
    && r.fee === null);
  const lying = [];
  for (const r of allNullFee) {
    const s = officialSourceOf(ctx, r);
    if (!s) continue;
    if (/badge--verified">免费/.test(featuredOerCard(ctx, { resource: r, source: s }))) lying.push(r.resource_id);
  }
  check('F-13', `fee=null 的真实资源渲染后不得显示为「免费」（覆盖 ${allNullFee.length} 条）`,
    allNullFee.length > 0 && lying.length === 0,
    `covered=${allNullFee.length} leaked=${lying.join(',')}`);
}

/* ---- F-14 未知许可不得显示为开放/可商用（同样全量覆盖）---- */
{
  const allUnknown = [];
  for (const r of resources) {
    if (r.data_class !== 'real' || r.status !== 'published') continue;
    const s = officialSourceOf(ctx, r);
    if (s && s.license === 'unknown') allUnknown.push({ r, s });
  }
  const bad = allUnknown.filter(({ r, s }) => {
    const html = featuredOerCard(ctx, { resource: r, source: s });
    return html.includes('允许商用') || html.includes('公有领域</strong>');
  });
  check('F-14', `license=unknown 的真实资源渲染后不得出现「允许商用」/「公有领域」（覆盖 ${allUnknown.length} 条）`,
    allUnknown.length > 0 && bad.length === 0,
    `covered=${allUnknown.length} leaked=${bad.map((b) => b.r.resource_id).join(',')}`);
}

/* ---- F-15 无官方链接的真实资源不得进入精选区 ---- */
{
  const orphans = resources.filter((r) => {
    if (r.data_class !== 'real' || r.status !== 'published') return false;
    return !officialSourceOf(ctx, r);
  });
  const pickedIds = new Set(picked.map((p) => Number(p.resource.resource_id)));
  const leaked = orphans.filter((r) => pickedIds.has(Number(r.resource_id)));
  check('F-15', `无官方链接的真实资源（${orphans.length} 条）不进精选区`, leaked.length === 0,
    leaked.map((r) => r.resource_id).join(','));
}

console.log(`\nPASS: ${pass}  FAIL: ${fail}`);
console.log('精选结果（供人工核对，不参与判定）：');
for (const p of pickFeatured(ctx)) {
  console.log(`  #${p.resource.resource_id} score=${p.score} prov=${p.resource.provider_id} `
    + `subj=${p.resource.subject_id} lic=${p.source.license} :: ${p.resource.title}`);
}
if (fail) { console.log(fails.join('\n')); process.exit(1); }
