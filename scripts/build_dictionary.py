#!/usr/bin/env python3
"""Build the local WordRecall dictionary without AI or network access.

CSV column aliases are conservative. For differently named releases, place
data/raw/source_config.json with {"filename": {"lemma": "actual_column", ...}}.
Kaikki must be line-delimited JSON (optionally .gz) and is processed as a stream.
"""
from __future__ import annotations
import csv, datetime as dt, gzip, hashlib, html, json, os, re, shutil, sqlite3, sys, tarfile, tempfile, unicodedata
import xml.etree.ElementTree as ET
from collections import defaultdict
from pathlib import Path
from typing import Any, Iterable

ROOT = Path(__file__).resolve().parents[1]
RAW = Path(os.environ.get("WORDRECALL_RAW_DIR", ROOT / "data/raw"))
OUT = Path(os.environ.get("WORDRECALL_OUTPUT_DIR", ROOT / "public/dictionary"))
REPORT_PATH = Path(os.environ.get("WORDRECALL_REPORT_PATH", ROOT / "data_build_report.json"))
SCHEMA_VERSION = 1
EXPECTED = ["cefrj.csv", "octanove_c1c2.csv", "diqt_a1.csv", "diqt_a2.csv", "diqt_b1.csv", "diqt_b2.csv", "diqt_phrase.csv", "diqt_phave.csv", "ejdict.tsv", "wnjpn.db.gz", "freedict-eng-jpn.tar.xz", "JMdict_e.gz", "kaikki-japanese.jsonl.gz", "kaikki.jsonl"]
CEFR = {"A1", "A2", "B1", "B2", "C1", "C2"}
ALIASES = {
 "lemma": ["lemma", "word", "headword", "entry", "phrase", "expression", "title", "見出し語(英語)", "見出し語", "英語"], "cefr": ["cefr", "cefr_level", "level", "cefrレベル", "レベル"],
 "pos": ["pos", "part_of_speech", "part of speech", "品詞"], "meaning": ["meaning", "meaning_ja", "japanese", "translation", "ja", "意味(日本語)", "意味", "日本語訳"],
 "definition": ["definition", "definition_en", "english_definition", "meaning_en", "意味(英語)", "英語の意味", "定義(英語)"], "example": ["example", "sentence", "example_en", "example_sentence", "例文", "英文"],
 "example_ja": ["example_ja", "example_translation", "sentence_ja", "translation_ja", "translated_sentence", "例文の意味", "例文和訳", "和訳"], "ipa": ["ipa", "pronunciation", "発音記号"],
 "target_surface": ["target_surface", "targetsurface", "surface"]
}
TAG_RE = re.compile(r"<[^>]+>")
EJDICT_BE_TO_DO_RE = re.compile(r"《『(be [A-Za-z][A-Za-z' -]* to)』\s*do》", re.IGNORECASE)

def norm(value: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", value).strip().lower().replace("’", "'").replace("‘", "'").replace("–", "-").replace("—", "-"))
def uid(prefix: str, *parts: str) -> str: return f"{prefix}_{hashlib.sha256('|'.join(parts).encode()).hexdigest()[:20]}"
def clean(value: Any) -> str:
    if value is None: return ""
    return html.unescape(TAG_RE.sub("", str(value))).strip()
def status(count: int) -> str: return "confirmed" if count >= 3 else "supported" if count == 2 else "singleSource"
def pick(row: dict[str, Any], logical: str, mapping: dict[str, str]) -> str:
    if logical in mapping: return clean(row.get(mapping[logical], ""))
    lowered = {k.lower().strip(): k for k in row}
    for alias in ALIASES[logical]:
        if alias in lowered:
            value = clean(row.get(lowered[alias], ""))
            if value: return value
    return ""
def open_text(path: Path):
    return gzip.open(path, "rt", encoding="utf-8") if path.suffix == ".gz" else path.open(encoding="utf-8-sig", newline="")
def iter_csv(path: Path) -> Iterable[dict[str, str]]:
    with open_text(path) as handle:
        yield from csv.DictReader(handle)
def source_for(name: str) -> str:
    if name.startswith("cefrj"): return "CEFR-J"
    if name.startswith("octanove"): return "Octanove"
    if "phrase" in name: return "PHRASE"
    if "phave" in name: return "PHaVE"
    return "DiQt"
def as_list(value: Any) -> list[Any]: return value if isinstance(value, list) else []

def matching_keys(value: str) -> set[str]:
    """Exact spelling aliases only; never infer or translate a headword."""
    key = norm(value)
    return {key, *(norm(part) for part in key.split("/") if part.strip())}

def main() -> int:
    config_path = RAW / "source_config.json"
    config = json.loads(config_path.read_text()) if config_path.exists() else {}
    csv_files = [p for p in RAW.glob("*.csv") if p.is_file()]
    ejdict = RAW / "ejdict.tsv"
    wnjpn = RAW / "wnjpn.db.gz"
    freedict = RAW / "freedict-eng-jpn.tar.xz"
    jmdict = RAW / "JMdict_e.gz"
    kaikki_ja = RAW / "kaikki-japanese.jsonl.gz"
    kaikki_candidates = [path for path in list(RAW.glob("kaikki*.jsonl")) + list(RAW.glob("kaikki*.jsonl.gz")) if "japanese" not in path.name.lower()]
    kaikki = next(iter(kaikki_candidates), None)
    if not csv_files or not all(path.is_file() for path in (ejdict, wnjpn, freedict, jmdict, kaikki_ja)) or kaikki is None:
        missing = [name for name in EXPECTED if not (RAW / name).exists() and not (name == "kaikki.jsonl" and kaikki)]
        print("Missing required raw dictionary files:", ", ".join(missing), file=sys.stderr); print("See README_DATA.md. No generated or fictional data will be substituted.", file=sys.stderr); return 2
    words: dict[str, dict[str, Any]] = {}; expressions: dict[str, dict[str, Any]] = {}
    meanings: list[dict[str, Any]] = []; definitions: list[dict[str, Any]] = []; pronunciations: list[dict[str, Any]] = []; forms: list[dict[str, Any]] = []; examples: list[dict[str, Any]] = []
    expression_meanings: list[dict[str, Any]] = []; expression_examples: list[dict[str, Any]] = []; counts = defaultdict(int); invalid: list[str] = []; conflicts: list[dict[str, Any]] = []
    meaning_ids: set[str] = set(); ja_meaning_word_ids: set[str] = set(); ja_meaning_expression_ids: set[str] = set()
    def add_ja_meaning(item: dict[str, Any], text: str, source: str, *, is_expression: bool = False) -> bool:
        value = clean(text)
        if not value: return False
        target_key = "expressionId" if is_expression else "wordId"
        row_id = uid("m", item["id"], source, value)
        if row_id in meaning_ids: return False
        meaning_ids.add(row_id); item["sources"].add(source)
        (expression_meanings if is_expression else meanings).append({"id": row_id, target_key: item["id"], "language": "ja", "text": value, "source": source})
        (ja_meaning_expression_ids if is_expression else ja_meaning_word_ids).add(item["id"])
        return True
    def ensure_word(lemma: str, source: str, pos: str = "", cefr: str = "") -> dict[str, Any]:
        key = norm(lemma); item = words.get(key)
        if not item:
            item = {"id": uid("w", key), "lemma": lemma.strip(), "normalizedLemma": key, "pos": [], "cefrLevel": None, "cefrSource": None, "sources": set(), "conflicts": []}; words[key] = item
        item["sources"].add(source)
        if pos and pos not in item["pos"]: item["pos"].append(pos)
        if cefr in CEFR:
            if item["cefrLevel"] and item["cefrLevel"] != cefr: item["conflicts"].append(f"CEFR: {item['cefrLevel']} / {cefr}"); conflicts.append({"lemma": lemma, "field": "CEFR", "values": [item["cefrLevel"], cefr]})
            elif not item["cefrLevel"]: item["cefrLevel"], item["cefrSource"] = cefr, source
        return item
    def ensure_expression(text: str, source: str, cefr: str = "") -> dict[str, Any]:
        key = norm(text); item = expressions.get(key)
        if not item:
            item = {"id": uid("x", key), "text": text.strip(), "normalizedText": key, "cefrLevel": None, "inPhraseList": False, "inPhaveList": False, "isUsagePattern": False, "sources": set()}; expressions[key] = item
        item["sources"].add(source); item["inPhraseList"] |= source == "PHRASE"; item["inPhaveList"] |= source == "PHaVE"
        if cefr in CEFR and not item["cefrLevel"]: item["cefrLevel"] = cefr
        return item
    for path in sorted(csv_files):
        source = source_for(path.name.lower()); mapping = config.get(path.name, {}); file_count = 0
        match = re.search(r"(?:^|_)(a1|a2|b1|b2)(?:_|$)", path.stem.lower())
        file_level = match.group(1).upper() if source == "DiQt" and match else ""
        for line, row in enumerate(iter_csv(path), 2):
            lemma = pick(row, "lemma", mapping); cefr = pick(row, "cefr", mapping).upper() or file_level; pos = pick(row, "pos", mapping)
            if not lemma: invalid.append(f"{path.name}:{line}: empty lemma"); continue
            if cefr and cefr not in CEFR: invalid.append(f"{path.name}:{line}: invalid CEFR {cefr}"); continue
            is_expression = source in {"PHRASE", "PHaVE"} or " " in norm(lemma)
            item = ensure_expression(lemma, source, cefr) if is_expression else ensure_word(lemma, source, pos, cefr)
            target_key = "expressionId" if is_expression else "wordId"; target_id = item["id"]
            meaning, definition, ipa = pick(row, "meaning", mapping), pick(row, "definition", mapping), pick(row, "ipa", mapping)
            example, example_ja, target_surface = pick(row, "example", mapping), pick(row, "example_ja", mapping), pick(row, "target_surface", mapping)
            if meaning:
                add_ja_meaning(item, meaning, source, is_expression=is_expression)
            if definition and not is_expression: definitions.append({"id": uid("d", target_id, source, definition), "wordId": target_id, "text": definition, "source": source})
            if ipa and not is_expression: pronunciations.append({"id": uid("p", target_id, source, ipa), "wordId": target_id, "ipa": ipa, "source": source})
            if example:
                surface = target_surface or (lemma if norm(lemma) in norm(example) else None)
                dest = expression_examples if is_expression else examples; dest.append({"id": uid("e", target_id, source, example), target_key: target_id, "sentence": example, "translationJa": example_ja or None, "targetSurface": surface, "source": source})
            file_count += 1
        counts[source] += file_count
    ejdict_matches: set[str] = set(); ejdict_usage_patterns: set[str] = set()
    with ejdict.open(encoding="utf-8-sig") as handle:
        for line_number, raw_line in enumerate(handle, 1):
            line = raw_line.rstrip("\r\n")
            if not line: continue
            if "\t" not in line:
                invalid.append(f"{ejdict.name}:{line_number}: invalid TSV row"); continue
            headwords, raw_meaning = line.split("\t", 1)
            meaning = clean(raw_meaning)
            if not meaning:
                invalid.append(f"{ejdict.name}:{line_number}: empty meaning"); continue
            lemmas = [clean(value) for value in headwords.split(",") if clean(value)]
            for lemma in lemmas:
                key = norm(lemma)
                item = words.get(key) or expressions.get(key)
                if item:
                    add_ja_meaning(item, meaning, "EJDict", is_expression=key in expressions)
                    ejdict_matches.add(item["id"])

                # EJDict explicitly marks a small, high-confidence family of
                # constructions such as "be liable to do". Preserve those
                # sourced patterns as independent study items. We deliberately
                # do not infer collocations from prose or generate meanings.
                for segment in raw_meaning.split(" / "):
                    for match in EJDICT_BE_TO_DO_RE.finditer(segment):
                        expression_text = clean(match.group(1) + " do")
                        pattern_key = norm(expression_text)
                        if not re.search(rf"(?<![\w']){re.escape(key)}(?![\w'])", pattern_key):
                            continue
                        usage_meaning = clean(segment[match.end():]).replace("『", "").replace("』", "")
                        if not usage_meaning:
                            continue
                        word = ensure_word(lemma, "EJDict")
                        add_ja_meaning(word, meaning, "EJDict")
                        expression = ensure_expression(expression_text, "EJDict")
                        expression["isUsagePattern"] = True
                        add_ja_meaning(expression, usage_meaning, "EJDict", is_expression=True)
                        ejdict_matches.add(word["id"]); ejdict_usage_patterns.add(expression["id"])
    counts["EJDict"] = len(ejdict_matches)
    counts["EJDict usage patterns"] = len(ejdict_usage_patterns)

    word_aliases: dict[str, set[str]] = defaultdict(set)
    for key, item in words.items():
        for alias in matching_keys(key): word_aliases[alias].add(item["id"])
    words_by_id = {item["id"]: item for item in words.values()}
    def add_for_english(english: str, japanese_values: Iterable[str], source: str) -> int:
        added = 0
        for word_id in word_aliases.get(norm(english), set()):
            if word_id in ja_meaning_word_ids: continue
            for japanese in japanese_values:
                if add_ja_meaning(words_by_id[word_id], japanese, source):
                    added += 1
                    break
        return added

    # Japanese WordNet is decompressed only into a temporary file for SQLite.
    with tempfile.NamedTemporaryFile(prefix="word-recall-wnjpn-", suffix=".db") as db_file:
        with gzip.open(wnjpn, "rb") as source: shutil.copyfileobj(source, db_file)
        db_file.flush(); connection = sqlite3.connect(db_file.name)
        try:
            query = """SELECT e.lemma, j.lemma FROM word e
                JOIN sense se ON se.wordid=e.wordid AND se.lang='eng'
                JOIN sense sj ON sj.synset=se.synset AND sj.lang='jpn'
                JOIN word j ON j.wordid=sj.wordid AND j.lang='jpn'
                WHERE e.lang='eng'"""
            for english, japanese in connection.execute(query): counts["Japanese WordNet"] += add_for_english(english, [japanese], "Japanese WordNet")
        finally: connection.close()

    # FreeDict TEI is parsed directly from the compressed tar member.
    tei_ns = "{http://www.tei-c.org/ns/1.0}"
    with tarfile.open(freedict, "r:xz") as archive:
        member = next((item for item in archive.getmembers() if item.name.endswith("/eng-jpn.tei")), None)
        if member is None: raise RuntimeError("FreeDict archive does not contain eng-jpn.tei")
        stream = archive.extractfile(member)
        if stream is None: raise RuntimeError("FreeDict eng-jpn.tei could not be opened")
        for _, entry in ET.iterparse(stream, events=("end",)):
            if entry.tag != tei_ns + "entry": continue
            japanese = [node.text or "" for node in entry.findall(f".//{tei_ns}cit[@type='trans']/{tei_ns}quote")]
            for node in entry.findall(f"./{tei_ns}form/{tei_ns}orth"):
                if node.text: counts["FreeDict"] += add_for_english(node.text, japanese, "FreeDict")
            entry.clear()

    # JMdict is Japanese -> English. Only an exact English gloss is reversed.
    with gzip.open(jmdict, "rb") as stream:
        for _, entry in ET.iterparse(stream, events=("end",)):
            if entry.tag != "entry": continue
            japanese = [node.text or "" for node in entry.findall("./k_ele/keb") + entry.findall("./r_ele/reb")]
            for gloss in entry.findall("./sense/gloss"):
                if gloss.text:
                    english = re.sub(r"^to\s+", "", gloss.text, flags=re.IGNORECASE)
                    counts["JMdict"] += add_for_english(english, japanese, "JMdict")
            entry.clear()

    # Japanese Wiktionary entries are also reversed only on exact English glosses.
    with open_text(kaikki_ja) as handle:
        for line_number, line in enumerate(handle, 1):
            try: entry = json.loads(line)
            except json.JSONDecodeError: invalid.append(f"{kaikki_ja.name}:{line_number}: invalid JSON"); continue
            japanese = clean(entry.get("word"))
            if not japanese: continue
            for sense in as_list(entry.get("senses")):
                if not isinstance(sense, dict): continue
                for gloss in as_list(sense.get("glosses")):
                    english = re.sub(r"^to\s+", "", clean(gloss), flags=re.IGNORECASE)
                    counts["Japanese Wiktionary"] += add_for_english(english, [japanese], "Japanese Wiktionary")
    detailed_keys = set(words) | set(expressions)
    existence_tmp = Path(tempfile.mkdtemp(prefix="word-recall-existence-"))
    handles: dict[str, Any] = {}
    try:
        with open_text(kaikki) as handle:
            for line_number, line in enumerate(handle, 1):
                try: entry = json.loads(line)
                except json.JSONDecodeError: invalid.append(f"{kaikki.name}:{line_number}: invalid JSON"); continue
                if entry.get("lang_code") not in (None, "en") and entry.get("lang") != "English": continue
                lemma = clean(entry.get("word")); key = norm(lemma)
                if not key or " " in key and len(key) > 120: continue
                pos = clean(entry.get("pos"))
                bucket = hashlib.sha256(key.encode()).hexdigest()[:1]
                if bucket not in handles: handles[bucket] = (existence_tmp / f"{bucket}.jsonl").open("a", encoding="utf-8")
                handles[bucket].write(json.dumps({"normalizedLemma": key, "lemma": lemma, "pos": pos}, ensure_ascii=False) + "\n")
                if key not in detailed_keys: continue
                word = ensure_word(lemma, "Wiktionary", pos) if key in words else None
                expression = ensure_expression(lemma, "Wiktionary") if key in expressions else None
                target_id = (word or expression)["id"]
                if word:
                    for sound in as_list(entry.get("sounds")):
                        ipa = clean(sound.get("ipa") if isinstance(sound, dict) else "")
                        if ipa: pronunciations.append({"id": uid("p", target_id, "Wiktionary", ipa), "wordId": target_id, "ipa": ipa, "source": "Wiktionary"})
                    for form in as_list(entry.get("forms")):
                        if not isinstance(form, dict): continue
                        value = clean(form.get("form")); tags = ", ".join(str(x) for x in as_list(form.get("tags")))
                        if value and value != "-": forms.append({"id": uid("f", target_id, value, tags), "wordId": target_id, "form": value, "normalizedForm": norm(value), "formType": tags or "form", "source": "Wiktionary"})
                for sense in as_list(entry.get("senses")):
                    if not isinstance(sense, dict): continue
                    for translation in as_list(sense.get("translations")):
                        if not isinstance(translation, dict): continue
                        language = clean(translation.get("lang_code") or translation.get("code") or translation.get("lang"))
                        value = clean(translation.get("word"))
                        if language.lower() in {"ja", "jpn", "japanese"} and value:
                            if word and word["id"] in ja_meaning_word_ids: continue
                            if expression and expression["id"] in ja_meaning_expression_ids: continue
                            counts["Wiktionary Japanese translations"] += add_ja_meaning(word or expression, value, "Wiktionary", is_expression=word is None)
                    for gloss in as_list(sense.get("glosses")):
                        value = clean(gloss)
                        if value and word: definitions.append({"id": uid("d", target_id, "Wiktionary", value), "wordId": target_id, "text": value, "source": "Wiktionary"})
                    for ex in as_list(sense.get("examples")):
                        text = clean(ex.get("text") if isinstance(ex, dict) else ex)
                        if text:
                            surface = lemma if key in norm(text) else None; dest = examples if word else expression_examples; target_key = "wordId" if word else "expressionId"
                            dest.append({"id": uid("e", target_id, "Wiktionary", text), target_key: target_id, "sentence": text, "translationJa": None, "targetSurface": surface, "source": "Wiktionary"})

        # A detailed study entry must always contain a sourced Japanese meaning.
        # Entries without one remain searchable in the lightweight existence index
        # and use the existing user-provided-data flow instead of showing a blank card.
        words_with_ja = {row["wordId"] for row in meanings if row.get("language") == "ja"}
        incomplete_words = [item for item in words.values() if item["id"] not in words_with_ja]
        incomplete_ids = {item["id"] for item in incomplete_words}
        for item in incomplete_words:
            key = item["normalizedLemma"]; bucket = hashlib.sha256(key.encode()).hexdigest()[:1]
            if bucket not in handles: handles[bucket] = (existence_tmp / f"{bucket}.jsonl").open("a", encoding="utf-8")
            handles[bucket].write(json.dumps({"normalizedLemma": key, "lemma": item["lemma"], "pos": ", ".join(item["pos"])}, ensure_ascii=False) + "\n")
            words.pop(key, None)
        if incomplete_ids:
            meanings[:] = [row for row in meanings if row["wordId"] not in incomplete_ids]
            definitions[:] = [row for row in definitions if row["wordId"] not in incomplete_ids]
            pronunciations[:] = [row for row in pronunciations if row["wordId"] not in incomplete_ids]
            forms[:] = [row for row in forms if row["wordId"] not in incomplete_ids]
            examples[:] = [row for row in examples if row["wordId"] not in incomplete_ids]
        for h in handles.values(): h.close()
        OUT.mkdir(parents=True, exist_ok=True)
        for child in OUT.iterdir():
            if child.name != ".gitkeep": shutil.rmtree(child) if child.is_dir() else child.unlink()
        tables: dict[str, list[dict[str, Any]]] = {}
        word_rows = []
        for item in words.values():
            item["sources"] = sorted(item["sources"]); item["sourceCount"] = len(item["sources"]); item["sourceStatus"] = status(item["sourceCount"]); word_rows.append(item)
        expression_rows = []
        for item in expressions.values():
            item["sources"] = sorted(item["sources"]); item["sourceCount"] = len(item["sources"]); item["sourceStatus"] = status(item["sourceCount"]); expression_rows.append(item)
        relations = []
        for expression in expression_rows:
            padded = f" {expression['normalizedText']} "
            for key, word in words.items():
                if re.search(rf"(?<![\w']){re.escape(key)}(?![\w'])", padded): relations.append({"id": uid("r", expression["id"], word["id"]), "expressionId": expression["id"], "wordId": word["id"]})
        tables.update(words=word_rows, meanings=meanings, definitions=definitions, pronunciations=pronunciations, wordForms=forms, examples=examples, expressions=expression_rows, expressionWords=relations, expressionMeanings=expression_meanings, expressionExamples=expression_examples)
        duplicate_count = 0
        for table, rows in tables.items():
            unique: dict[str, dict[str, Any]] = {}
            for row in rows:
                key = str(row.get("id") or row.get("normalizedLemma") or row.get("normalizedText"))
                if key in unique:
                    duplicate_count += 1
                    continue
                unique[key] = row
            tables[table] = list(unique.values())
        word_rows = tables["words"]; expression_rows = tables["expressions"]
        shards = []; total_bytes = 0
        def write_shard(table: str, bucket: str, rows: list[dict[str, Any]]) -> None:
            nonlocal total_bytes
            if not rows: return
            rel = f"{table}/{bucket}.json"; path = OUT / rel; path.parent.mkdir(parents=True, exist_ok=True)
            encoded_rows: Any = rows
            encoding = None
            if table == "wiktionaryExistence":
                encoded_rows = [[row["normalizedLemma"], "" if row["lemma"] == row["normalizedLemma"] else row["lemma"], row["pos"]] for row in rows]
                encoding = "existence-tuple-v1"
            payload = json.dumps(encoded_rows, ensure_ascii=False, separators=(",", ":")).encode(); path.write_bytes(payload); digest = hashlib.sha256(payload).hexdigest()
            shard = {"path": rel, "table": table, "count": len(rows), "bytes": len(payload), "sha256": digest}
            if encoding: shard["encoding"] = encoding
            shards.append(shard); total_bytes += len(payload)
        for table, rows in tables.items():
            buckets: dict[str, list[dict[str, Any]]] = defaultdict(list)
            for row in rows:
                shard_key = str(row.get("normalizedLemma") or row.get("normalizedText") or row["id"])
                buckets[hashlib.sha256(shard_key.encode()).hexdigest()[:1]].append(row)
            for bucket, bucket_rows in sorted(buckets.items()): write_shard(table, bucket, bucket_rows)
        existence_count = 0
        for path in sorted(existence_tmp.glob("*.jsonl")):
            unique: dict[str, dict[str, Any]] = {}
            with path.open(encoding="utf-8") as handle:
                for line in handle:
                    row = json.loads(line); unique.setdefault(row["normalizedLemma"], row)
            rows = list(unique.values()); existence_count += len(rows); write_shard("wiktionaryExistence", path.stem, rows)
        version_seed = "|".join(f"{s['path']}:{s['sha256']}" for s in shards); version = dt.datetime.now(dt.timezone.utc).strftime("%Y.%m.%d") + "-" + hashlib.sha256(version_seed.encode()).hexdigest()[:8]
        manifest = {"schemaVersion": SCHEMA_VERSION, "dictionaryVersion": version, "buildDate": dt.datetime.now(dt.timezone.utc).isoformat(), "wordCount": len(word_rows), "expressionCount": len(expression_rows), "existenceIndexCount": existence_count, "exampleCount": len(examples)+len(expression_examples), "totalBytes": total_bytes, "shards": shards}
        manifest_bytes = json.dumps(manifest, ensure_ascii=False, indent=2).encode(); (OUT/"manifest.json").write_bytes(manifest_bytes); total_bytes += len(manifest_bytes); manifest["totalBytes"] = total_bytes; (OUT/"manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2))
        words_with_ja = {row["wordId"] for row in tables["meanings"] if row.get("language") == "ja"}
        report = {"CEFR-J word count": counts["CEFR-J"], "Octanove count": counts["Octanove"], "DiQt count": counts["DiQt"], "EJDict matched count": counts["EJDict"], "EJDict usage pattern count": counts["EJDict usage patterns"], "Japanese WordNet meanings": counts["Japanese WordNet"], "FreeDict meanings": counts["FreeDict"], "JMdict meanings": counts["JMdict"], "Japanese Wiktionary meanings": counts["Japanese Wiktionary"], "English Wiktionary Japanese translations": counts["Wiktionary Japanese translations"], "PHRASE count": counts["PHRASE"], "PHaVE count": counts["PHaVE"], "Wiktionary detailed count": sum(1 for w in word_rows if "Wiktionary" in w["sources"]), "Wiktionary existence count": existence_count, "combined words": len(word_rows), "combined expressions": len(expression_rows), "words with Japanese meaning": len(words_with_ja), "words without Japanese meaning": len(word_rows) - len(words_with_ja), "existence-only due to missing Japanese meaning": len(incomplete_words), "existence-only headwords": [item["lemma"] for item in incomplete_words], "examples": len(tables["examples"])+len(tables["expressionExamples"]), "meanings": len(tables["meanings"])+len(tables["expressionMeanings"]), "definitions": len(tables["definitions"]), "duplicates": duplicate_count, "conflicts": conflicts, "invalid rows": invalid, "final bytes": total_bytes, "shard count": len(shards)}
        REPORT_PATH.write_text(json.dumps(report, ensure_ascii=False, indent=2))
        print(f"Dictionary {version}: {len(word_rows):,} words, {len(expression_rows):,} expressions, {existence_count:,} existence entries")
        print(f"Final size: {total_bytes/1024/1024:.2f} MB in {len(shards)} shards")
        if total_bytes > 150*1024*1024: print("WARNING: dictionary exceeds 150 MB. Largest tables: " + ", ".join(f"{k}={sum(s['bytes'] for s in shards if s['table']==k)/1024/1024:.1f}MB" for k in tables), file=sys.stderr)
        return 0
    finally:
        for h in handles.values():
            if not h.closed: h.close()
        shutil.rmtree(existence_tmp, ignore_errors=True)
if __name__ == "__main__": raise SystemExit(main())
