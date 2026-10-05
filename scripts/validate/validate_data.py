# -*- coding: utf-8 -*-
"""CourseMap 数据校验器（v0.1）

实现 data/schema/validation-rules-v0.1.json 中定义的教育领域规则。
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

    # ---------- 输出 ----------
    blockers = [i for i in issues if i[0] == "BLOCKER"]
    errors = [i for i in issues if i[0] == "ERROR"]
    warns = [i for i in issues if i[0] == "WARN"]
    print(f"CourseMap data validation — BLOCKER: {len(blockers)}  ERROR: {len(errors)}  WARN: {len(warns)}")
    for sev in ("BLOCKER", "ERROR", "WARN"):
        for s, rid_, msg in issues:
            if s == sev:
                print(f"[{s}] {rid_}: {msg}")
    if blockers or errors:
        sys.exit(1)
    print("PASS")


if __name__ == "__main__":
    main()
