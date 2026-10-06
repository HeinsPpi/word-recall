#!/usr/bin/env python3
"""Strict, non-mutating validation of a generated WordRecall dictionary."""
from __future__ import annotations
import hashlib, json, os, re, sys, unicodedata
from collections import Counter
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
OUT = Path(os.environ.get("WORDRECALL_OUTPUT_DIR", ROOT / "public/dictionary"))
REPORT = Path(os.environ.get("WORDRECALL_REPORT_PATH", ROOT / "data_build_report.json"))
CEFR = {None, "A1", "A2", "B1", "B2", "C1", "C2"}; TAG = re.compile(r"<[^>]+>"); CONTROL = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")
LIMITS = {"lemma": 160, "text": 5000, "sentence": 8000, "ipa": 500}

def norm(value: str) -> str: return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", value).strip().lower().replace("’", "'").replace("‘", "'").replace("–", "-").replace("—", "-"))
def main() -> int:
    manifest_path = OUT / "manifest.json"
    if not manifest_path.exists(): print("Dictionary manifest is missing. Run scripts/build_dictionary.py.", file=sys.stderr); return 2
    try: manifest = json.loads(manifest_path.read_text())
    except Exception as exc: print(f"Invalid manifest JSON: {exc}", file=sys.stderr); return 2
    errors: list[str] = []; warnings: list[str] = []; ids: dict[str, set[str]] = {}; normalized_words: set[str] = set(); normalized_expressions: set[str] = set(); rows_by_table: Counter[str] = Counter()
    rows_cache: dict[str, list[dict[str, Any]]] = {}
    if manifest.get("schemaVersion") != 1: errors.append("manifest: unsupported schemaVersion")
    for shard in manifest.get("shards", []):
        path = OUT / shard.get("path", "")
        if not path.is_file(): errors.append(f"missing shard: {shard.get('path')}"); continue
        payload = path.read_bytes(); digest = hashlib.sha256(payload).hexdigest()
        if digest != shard.get("sha256"): errors.append(f"checksum mismatch: {shard['path']}")
        if len(payload) != shard.get("bytes"): errors.append(f"byte count mismatch: {shard['path']}")
        try: rows = json.loads(payload)
        except Exception as exc: errors.append(f"invalid JSON {shard['path']}: {exc}"); continue
        if not isinstance(rows, list) or len(rows) != shard.get("count"): errors.append(f"row count mismatch: {shard['path']}"); continue
        table = shard.get("table"); rows_by_table[table] += len(rows); rows_cache.setdefault(table, []).extend(rows)
        if shard.get("encoding") == "existence-tuple-v1":
            if table != "wiktionaryExistence": errors.append(f"invalid tuple encoding table: {shard['path']}"); continue
            if any(not isinstance(row, list) or len(row) != 3 or not all(isinstance(value, str) for value in row) for row in rows):
                errors.append(f"invalid existence tuple: {shard['path']}"); continue
            rows = [{"normalizedLemma": row[0], "lemma": row[1] or row[0], "pos": row[2]} for row in rows]
            rows_cache[table][-len(rows):] = rows
        seen = ids.setdefault(table, set())
        for row in rows:
            key = row.get("id") or row.get("normalizedLemma")
            if not key: errors.append(f"{table}: missing id")
            elif key in seen: errors.append(f"{table}: duplicate id {key}")
            else: seen.add(key)
            for field, value in row.items():
                if isinstance(value, str):
                    if CONTROL.search(value): errors.append(f"{table}:{key}: abnormal control Unicode in {field}")
                    if TAG.search(value): errors.append(f"{table}:{key}: HTML remains in {field}")
                    limit = LIMITS.get(field)
                    if limit and len(value) > limit: errors.append(f"{table}:{key}: {field} exceeds {limit}")
    for row in rows_cache.get("words", []):
        lemma = row.get("lemma", ""); normalized = row.get("normalizedLemma", "")
        if not lemma.strip(): errors.append(f"word {row.get('id')}: empty lemma")
        if normalized != norm(lemma): errors.append(f"word {row.get('id')}: normalized lemma mismatch")
        if normalized in normalized_words: errors.append(f"duplicate normalized lemma: {normalized}")
        normalized_words.add(normalized)
        if row.get("cefrLevel") not in CEFR: errors.append(f"word {row.get('id')}: invalid CEFR")
        if not row.get("sources") or any(not x for x in row.get("sources", [])): errors.append(f"word {row.get('id')}: empty source")
    for row in rows_cache.get("expressions", []):
        key = row.get("normalizedText", "")
        if not row.get("text", "").strip(): errors.append(f"expression {row.get('id')}: empty text")
        if key in normalized_expressions: errors.append(f"duplicate expression: {key}")
        normalized_expressions.add(key)
        if row.get("cefrLevel") not in CEFR: errors.append(f"expression {row.get('id')}: invalid CEFR")
    word_ids, expression_ids = ids.get("words", set()), ids.get("expressions", set())
    japanese_meaning_word_ids = {row.get("wordId") for row in rows_cache.get("meanings", []) if row.get("language") == "ja" and row.get("text", "").strip()}
    for word_id in word_ids - japanese_meaning_word_ids:
        errors.append(f"word {word_id}: Japanese meaning is required for every detailed entry")
    foreign = {"meanings": ("wordId", word_ids), "definitions": ("wordId", word_ids), "pronunciations": ("wordId", word_ids), "wordForms": ("wordId", word_ids), "examples": ("wordId", word_ids), "expressionWords": ("expressionId", expression_ids), "expressionMeanings": ("expressionId", expression_ids), "expressionExamples": ("expressionId", expression_ids)}
    for table, (field, targets) in foreign.items():
        for row in rows_cache.get(table, []):
            if row.get(field) not in targets: errors.append(f"{table}:{row.get('id')}: invalid foreign key {field}")
            if table == "expressionWords" and row.get("wordId") not in word_ids: errors.append(f"expressionWords:{row.get('id')}: invalid wordId")
            if table in {"meanings", "expressionMeanings"} and not row.get("text", "").strip(): errors.append(f"{table}:{row.get('id')}: empty meaning")
    for table in ("examples", "expressionExamples"):
        for row in rows_cache.get(table, []):
            surface = row.get("targetSurface"); sentence = row.get("sentence", "")
            if surface and norm(surface) not in norm(sentence): errors.append(f"{table}:{row.get('id')}: target not in example")
    if rows_by_table["words"] != manifest.get("wordCount"): errors.append("manifest wordCount mismatch")
    if rows_by_table["expressions"] != manifest.get("expressionCount"): errors.append("manifest expressionCount mismatch")
    if rows_by_table["wiktionaryExistence"] != manifest.get("existenceIndexCount"): errors.append("manifest existenceIndexCount mismatch")
    report = json.loads(REPORT.read_text()) if REPORT.exists() else {}; report["validation"] = {"valid": not errors, "errors": errors, "warnings": warnings, "validatedShards": len(manifest.get("shards", []))}; REPORT.write_text(json.dumps(report, ensure_ascii=False, indent=2))
    print(f"Validated {len(manifest.get('shards', []))} shards: {len(errors)} error(s), {len(warnings)} warning(s)")
    for error in errors[:100]: print("ERROR:", error, file=sys.stderr)
    return 1 if errors else 0
if __name__ == "__main__": raise SystemExit(main())
