# -*- coding: utf-8 -*-
"""CourseMap 数据校验器（v0.2 · Data-1 · Real OER Expansion）

实现 data/schema/validation-rules-v0.2.json：
  - v0.1 全部规则（实体完整性、枚举、评分聚合、demo 外链）
  - v0.2 新增「真实性」规则（VR-C11..C16 / VR-E10..E13）：
      * REAL 资源必须有官方 URL、observed_at、verification_status
      * REAL 资源绑定的 Source 必须有完整许可元数据
      * **未知许可不得被表示为开放许可**
      * fee / certificate / rating / duration 若没有被绑定来源声明为
        source_verified_fields，即视为「猜的值」→ BLOCKER
  - v0.3 新增「来源治理」规则：
      * VR-C18 REAL 来源的 official_url 必须落在官方域名白名单内
        （把「不得使用聚合站/盗版站/未授权搬运站」变成机器可执行约束）
退出码：0 = BLOCKER=0 且 ERROR=0（WARN 不影响）；1 = 存在 BLOCKER/ERROR。

用法：
    python scripts/validate/validate_data.py [项目根目录]
"""
import json
import sys
from datetime import date, datetime
from pathlib import Path

RATING_MIN_SAMPLE = 3
FEE_RECHECK_DAYS = 180

ENUMS = {
    "difficulty": {"beginner", "intermediate", "advanced"},
    "resource_type": {"course", "tutorial", "book", "open_course", "learning_module"},
    "learning_mode": {"self_paced", "instructor_led", "hybrid"},
    "language": {"zh", "en", "bilingual"},
}
RATING_FIELDS = (
    "overall_rating", "content_quality", "difficulty_match",
    "practical_value", "workload_accuracy",
)

issues = []  # (severity, rule_id, message)


def add(sev, rid, msg):
    issues.append((sev, rid, msg))


def load(root: Path, name: str):
    p = root / "data" / name
    with open(p, encoding="utf-8") as f:
        return json.load(f)


def rows_of(x):
    return x if isinstance(x, list) else x.get("rows", [])


def parse_observed(s):
    for fmt in ("%Y-%m-%d", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(str(s)[:10] if "T" not in str(s) else str(s)[:19], fmt).date()
        except ValueError:
            continue
    return None


def main():
    root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[2]

    subjects = rows_of(load(root, "subjects.json"))
    goals = rows_of(load(root, "learning-goals.json"))
    skills = rows_of(load(root, "skills.json"))
    providers = rows_of(load(root, "providers.json"))
    resources = rows_of(load(root, "resources.json"))
    paths = rows_of(load(root, "learning-paths.json"))
    steps = rows_of(load(root, "learning-path-steps.json"))
    reviews = rows_of(load(root, "reviews.json"))
    fees = rows_of(load(root, "fee-history.json"))
    sources = rows_of(load(root, "sources.json"))
    res_sources = rows_of(load(root, "resource-source.json"))

    subject_ids = {s["subject_id"] for s in subjects}
    goal_ids = {g["goal_id"] for g in goals}
    skill_ids = {k["skill_id"] for k in skills}
    provider_ids = {p["provider_id"] for p in providers}
    resource_ids = {r["resource_id"] for r in resources}
    path_ids = {p["path_id"] for p in paths}
    source_ids = {s["source_id"] for s in sources}

    # ---------- VR-C01 缺 ID / 重复 ----------
    for name, coll, key in (("resource", resources, "resource_id"),
                            ("subject", subjects, "subject_id"),
                            ("goal", goals, "goal_id"),
                            ("skill", skills, "skill_id"),
                            ("provider", providers, "provider_id"),
                            ("path", paths, "path_id"),
                            ("source", sources, "source_id")):
        seen = set()
        for r in coll:
            rid_ = r.get(key)
            if not rid_:
                add("BLOCKER", "VR-C01", f"{name} 缺少 {key}: {r}")
            elif rid_ in seen:
                add("BLOCKER", "VR-C01", f"{name} {key} 重复: {rid_}")
            else:
                seen.add(rid_)

    # ---------- 实体关系 ----------
    for r in resources:
        rid = r.get("resource_id", "?")
        if r.get("provider_id") not in provider_ids:
            add("BLOCKER", "VR-C02", f"resource {rid} 引用无效 provider_id")
        if r.get("subject_id") not in subject_ids:
            add("BLOCKER", "VR-C02", f"resource {rid} 引用无效 subject_id")
        for gid in r.get("learning_goal_ids") or []:
            if gid not in goal_ids:
                add("BLOCKER", "VR-C03", f"resource {rid} 引用无效 goal_id: {gid}")

    # ---------- VR-C04/C05 published 资源 ----------
    src_by_res = {}
    for rs in res_sources:
        src_by_res.setdefault(rs.get("resource_id"), []).append(rs.get("source_id"))
    for r in resources:
        rid = r.get("resource_id", "?")
        if r.get("status") != "published":
            continue
        if not r.get("title"):
            add("BLOCKER", "VR-C04", f"published resource {rid} 缺少 title")
        if r.get("data_class") == "real":
            if not src_by_res.get(rid):
                add("BLOCKER", "VR-C05", f"published real resource {rid} 无任何 Source")

    # ---------- VR-C06 环检测（Skill prerequisites + Goal prerequisites） ----------
    def detect_cycle(edges, label):
        WHITE, GRAY, BLACK = 0, 1, 2
        color = {n: WHITE for n in edges}
        for start in edges:
            if color[start] != WHITE:
                continue
            stack = [(start, iter(edges[start]))]
            color[start] = GRAY
            while stack:
                node, it = stack[-1]
                nxt = next(it, None)
                if nxt is None:
                    color[node] = BLACK
                    stack.pop()
                    continue
                if nxt not in edges:
                    continue
                if color[nxt] == GRAY:
                    add("BLOCKER", "VR-C06", f"{label} 前置关系成环: {nxt}")
                elif color[nxt] == WHITE:
                    color[nxt] = GRAY
                    stack.append((nxt, iter(edges[nxt])))

    detect_cycle({k["skill_id"]: (k.get("prerequisites") or []) for k in skills}, "Skill")
    detect_cycle({g["goal_id"]: (g.get("prerequisite_goals") or []) for g in goals}, "Goal")

    # ---------- VR-C07 path steps ----------
    for st in steps:
        sid = st.get("step_id", "?")
        if st.get("path_id") not in path_ids:
            add("BLOCKER", "VR-C07", f"step {sid} 引用无效 path_id")
        if st.get("skill_id") and st["skill_id"] not in skill_ids:
            add("BLOCKER", "VR-C07", f"step {sid} 引用无效 skill_id: {st['skill_id']}")
        if st.get("goal_id") and st["goal_id"] not in goal_ids:
            add("BLOCKER", "VR-C07", f"step {sid} 引用无效 goal_id: {st['goal_id']}")
        if st.get("resource_id") and st["resource_id"] not in resource_ids:
            add("BLOCKER", "VR-C07", f"step {sid} 引用无效 resource_id: {st['resource_id']}")

    # ---------- VR-C08 / VR-C09 ----------
    for rv in reviews:
        if rv.get("resource_id") not in resource_ids:
            add("BLOCKER", "VR-C08", f"review {rv.get('review_id','?')} 引用无效 resource_id")
    for f in fees:
        if f.get("resource_id") not in resource_ids:
            add("BLOCKER", "VR-C09", f"fee_history {f.get('fee_id','?')} 引用无效 resource_id")
        if f.get("source_id") not in source_ids:
            add("BLOCKER", "VR-C09", f"fee_history {f.get('fee_id','?')} 引用无效 source_id")

    # ---------- VR-C10 demo 外链 ----------
    real_domains = ("http://", "https://")
    for r in resources:
        url = r.get("url")
        if r.get("data_class") == "demo" and url and url.startswith(real_domains) \
                and "example" not in url and "demo" not in url:
            add("BLOCKER", "VR-C10", f"demo resource {r.get('resource_id','?')} url 指向真实站点: {url}")

    # ==========================================================================
    # Data-1 真实性规则（Module H）—— demo / real 必须严格分离
    # ==========================================================================
    source_by_id = {s["source_id"]: s for s in sources}

    # 每个资源被绑定来源「声明支持」的字段集合
    verified_fields_by_res = {}
    for rs in res_sources:
        rid_ = rs.get("resource_id")
        bag = verified_fields_by_res.setdefault(rid_, set())
        for f in (rs.get("source_verified_fields") or []):
            bag.add(f)

    # 真实字段：官方来源没声明支持，就必须是 null
    REAL_FACT_FIELDS = {
        "fee": "VR-C13",
        "certificate_available": "VR-C14",
        "rating": "VR-C15",
        "rating_count": "VR-C15",
        "duration_hours": "VR-C16",
        "weekly_workload_hours": "VR-C16",
    }
    UNKNOWN_LICENSE_TOKENS = {None, "", "unknown", "unclear", "unknown_license"}
    OPEN_CLAIM_KEYS = ("commercial_use", "public_domain", "adaptation_allowed", "redistribution_allowed")

    # ------------------------------------------------------------------
    # VR-C18 REAL 来源必须落在「官方域名白名单」内（Real OER Expansion 新增）
    # ------------------------------------------------------------------
    # 目的：把「不得使用大众点评式聚合站 / 盗版课程站 / 未授权搬运站 /
    #       第三方转载」从政策文字变成机器可执行的约束。
    # 判定对象是 **Source.official_url** 的 host，而不是 Resource.url，
    # 因为 Resource.url 已经由 VR-C11 + VR-E11 保证等于来源官方链接。
    # 新增官方来源时必须显式在白名单里登记 —— 这一步是「来源治理」的一部分，
    # 不允许通过正则「看起来像教育机构」来放行。
    OFFICIAL_DOMAIN_ALLOWLIST = {
        "ocw.mit.edu": "MIT OpenCourseWare",
        "openstax.org": "OpenStax（莱斯大学）",
        "cs50.harvard.edu": "Harvard CS50 OpenCourseWare",
        "developers.google.com": "Google for Developers",
        "developers.google.cn": "Google for Developers（官方中国域，用于核验）",
    }

    def host_of(u):
        try:
            from urllib.parse import urlparse
            return (urlparse(str(u)).hostname or "").lower()
        except Exception:
            return ""

    for src in sources:
        if src.get("data_class") != "real":
            continue
        h = host_of(src.get("official_url") or src.get("url"))
        if h not in OFFICIAL_DOMAIN_ALLOWLIST:
            add("BLOCKER", "VR-C18",
                f"real source {src.get('source_id')} 的 official_url 主机 "
                f"{h!r} 不在官方域名白名单内 —— 真实来源必须指向已登记的官方站点")

    for r in resources:
        if r.get("data_class") != "real":
            continue
        rid = r.get("resource_id", "?")

        # ---- VR-C11 REAL 资源必须带官方 URL ----
        url = r.get("url")
        if not url or not str(url).startswith(real_domains):
            add("BLOCKER", "VR-C11", f"real resource {rid} 缺少官方 URL（url={url!r}）")

        # ---- VR-E10 REAL 资源必须有 observed_at ----
        if not r.get("observed_at"):
            add("ERROR", "VR-E10", f"real resource {rid} 缺少 observed_at")

        # ---- VR-E13 REAL 资源必须有 verification_status ----
        if not r.get("verification_status"):
            add("ERROR", "VR-E13", f"real resource {rid} 缺少 verification_status")

        # ---- VR-C05 已在上方覆盖：REAL 必须至少有一个 Source ----
        bound_sources = [source_by_id.get(sid) for sid in (src_by_res.get(rid) or [])]

        # ---- VR-E11 来源关系一致性 ----
        declared = set(r.get("source_ids") or [])
        related = set(src_by_res.get(rid) or [])
        if declared != related:
            add("ERROR", "VR-E11",
                f"real resource {rid} 的 source_ids={sorted(declared)} 与 resource-source 关系 {sorted(related)} 不一致")
        for sid in declared:
            if sid not in source_by_id:
                add("ERROR", "VR-E11", f"real resource {rid} 引用不存在的 source_id: {sid}")

        # ---- VR-E12 绑定 Source 的许可元数据必须完整 ----
        for src in bound_sources:
            if src is None:
                continue
            missing = [k for k in ("license", "license_url", "observed_at", "verification_status")
                       if not src.get(k)]
            if missing:
                add("ERROR", "VR-E12",
                    f"real resource {rid} 的 source {src.get('source_id')} 缺少许可元数据: {missing}")

        # ---- VR-C12 未知许可不得表示为开放许可 ----
        for src in bound_sources:
            if src is None:
                continue
            license_unknown = (src.get("license") in UNKNOWN_LICENSE_TOKENS) \
                or (src.get("usage_permission") in UNKNOWN_LICENSE_TOKENS)
            if not license_unknown:
                continue
            claims = [k for k in OPEN_CLAIM_KEYS if src.get(k) is True]
            if claims:
                add("BLOCKER", "VR-C12",
                    f"real resource {rid} 的 source {src.get('source_id')} 许可状态未知，"
                    f"却声明 {claims} —— 未知许可不得被当作开放许可")

        # ---- VR-C13..C16 猜字段 ----
        verified = verified_fields_by_res.get(rid, set())
        for field, rule in REAL_FACT_FIELDS.items():
            if r.get(field) is None:
                continue
            if field not in verified:
                add("BLOCKER", rule,
                    f"real resource {rid} 的 {field}={r.get(field)!r} 没有任何来源在 "
                    f"source_verified_fields 中声明支持 —— 视为猜测值")

    # ---------- ERROR ----------
    published_by_res = {}
    for rv in reviews:
        if rv.get("status") == "published":
            published_by_res.setdefault(rv["resource_id"], []).append(rv)

    for r in resources:
        rid = r.get("resource_id", "?")
        fee = r.get("fee")
        if fee is not None and fee < 0:
            add("ERROR", "VR-E01", f"resource {rid} fee < 0")
        for f in ("duration_hours", "weekly_workload_hours"):
            v = r.get(f)
            if v is not None and v <= 0:
                add("ERROR", "VR-E02", f"resource {rid} {f} <= 0")
        for fld in ENUMS:
            v = r.get(fld)
            if v is not None and v not in ENUMS[fld]:
                add("ERROR", "VR-E04", f"resource {rid} {fld} 非法值: {v!r}")
        if fee is None and r.get("currency") is not None:
            add("ERROR", "VR-E08", f"resource {rid} fee=null 但 currency 非空")
        if r.get("status") == "published" and not (r.get("learning_goal_ids") or []):
            add("ERROR", "VR-E09", f"published resource {rid} learning_goal_ids 为空")

        # VR-E06/E07 评分聚合一致性
        pub = published_by_res.get(rid, [])
        if pub:
            agg = sum(x.get("overall_rating", 0) for x in pub) / len(pub)
            if abs((r.get("rating") or 0) - agg) > 0.01:
                add("ERROR", "VR-E06", f"resource {rid} rating {r.get('rating')} 与聚合 {agg:.3f} 不一致")
            if (r.get("rating_count") or 0) != len(pub):
                add("ERROR", "VR-E07", f"resource {rid} rating_count {r.get('rating_count')} != {len(pub)}")

    for rv in reviews:
        for fld in RATING_FIELDS:
            v = rv.get(fld)
            if v is not None and not (1 <= v <= 5):
                add("ERROR", "VR-E03", f"review {rv.get('review_id','?')} {fld}={v} 超出 [1,5]")

    for p in paths:
        orders = [s.get("step_order") for s in steps if s.get("path_id") == p.get("path_id")]
        if len(orders) != len(set(orders)):
            add("ERROR", "VR-E05", f"path {p.get('path_id','?')} step_order 重复")

    # ---------- WARN ----------
    today = date.today()
    latest_fee = {}
    for f in fees:
        d = parse_observed(f.get("observed_at"))
        if d:
            cur = latest_fee.get(f["resource_id"])
            if cur is None or d > cur:
                latest_fee[f["resource_id"]] = d
    for r in resources:
        rid = r.get("resource_id", "?")
        d = latest_fee.get(rid)
        if d and (today - d).days > FEE_RECHECK_DAYS:
            add("WARN", "VR-W01", f"resource {rid} 费用观测已 {FEE_RECHECK_DAYS}+ 天（{d}）")
        pub = published_by_res.get(rid, [])
        if pub and len(pub) < RATING_MIN_SAMPLE:
            add("WARN", "VR-W02", f"resource {rid} 评价样本 {len(pub)} < {RATING_MIN_SAMPLE}（Limited data）")
        if r.get("status") == "published" and not (r.get("prerequisite_skill_ids") or []):
            add("WARN", "VR-W03", f"published resource {rid} 无前置技能")
        if r.get("duration_hours") is None or r.get("weekly_workload_hours") is None:
            add("WARN", "VR-W04", f"resource {rid} 缺少时长/周投入估算")
        if r.get("certificate_available") is None:
            add("WARN", "VR-W05", f"resource {rid} certificate_available=null")
        if r.get("data_class") == "real" and not r.get("description"):
            add("WARN", "VR-W06", f"real resource {rid} 缺少描述（前端必须显示「官方描述未核验」）")

    # ---------- 输出 ----------
    blockers = [i for i in issues if i[0] == "BLOCKER"]
    errors = [i for i in issues if i[0] == "ERROR"]
    warns = [i for i in issues if i[0] == "WARN"]
    n_demo = sum(1 for r in resources if r.get("data_class") == "demo")
    n_real = sum(1 for r in resources if r.get("data_class") == "real")
    n_src_real = sum(1 for s in sources if s.get("data_class") == "real")
    n_real_no_src = sum(1 for r in resources
                        if r.get("data_class") == "real" and not (src_by_res.get(r.get("resource_id")) or []))
    print("CourseMap data validation (Data-1 · rules v0.2)")
    print(f"  resources: {n_demo} demo + {n_real} real = {len(resources)}")
    print(f"  sources:   {len(sources) - n_src_real} demo + {n_src_real} real = {len(sources)}")
    print(f"  real resources without Source: {n_real_no_src}")
    print(f"  BLOCKER: {len(blockers)}  ERROR: {len(errors)}  WARN: {len(warns)}")
    for sev in ("BLOCKER", "ERROR", "WARN"):
        for s, rid_, msg in issues:
            if s == sev:
                print(f"[{s}] {rid_}: {msg}")
    if blockers or errors:
        sys.exit(1)
    print("PASS")


if __name__ == "__main__":
    main()
