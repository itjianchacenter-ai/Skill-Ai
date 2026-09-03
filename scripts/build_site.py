#!/usr/bin/env python3
"""Build a static website from the skills library.

Walks every top-level category folder, renders each ``SKILL.md`` to HTML and
writes an index page with a client-side search box. Output goes to ``_site/``,
which the GitHub Pages workflow publishes to order.jianchatea.com.

Usage: python scripts/build_site.py [output_dir]
"""
from __future__ import annotations

import html
import re
import shutil
import sys
from pathlib import Path

import markdown

ROOT = Path(__file__).resolve().parent.parent
OUT = Path(sys.argv[1]) if len(sys.argv) > 1 else ROOT / "_site"
SITE_TITLE = "Jiancha Tea AI Skills Library"
SITE_URL = "https://order.jianchatea.com"
SKIP_DIRS = {".git", ".github", "_site", "scripts", "node_modules", "__pycache__"}
GUIDE_TXT = ROOT / "AI Flow - คู่มือเริ่มต้น.txt"
GUIDE_PDF = ROOT / "AI Flow - ไดเรกทอรีทักษะ.pdf"

CSS = """
:root{--bg:#faf8f4;--fg:#1f1d1a;--muted:#6b6660;--card:#ffffff;--line:#e6e1d8;--accent:#0f6b4f;--accent-soft:#e3f1ea;--code:#f2efe9}
@media (prefers-color-scheme:dark){:root{--bg:#171512;--fg:#ece8e1;--muted:#a49e95;--card:#211e1a;--line:#36312b;--accent:#5ec49a;--accent-soft:#1d332a;--code:#2a2621}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans Thai",sans-serif}
a{color:var(--accent)}
header.site{border-bottom:1px solid var(--line);background:var(--card)}
header.site .wrap{display:flex;align-items:center;justify-content:space-between;gap:1rem;flex-wrap:wrap}
header.site a.brand{font-weight:700;text-decoration:none;color:var(--fg)}
header.site nav a{margin-left:1rem;font-size:.95rem}
.wrap{max-width:1040px;margin:0 auto;padding:1rem 1.25rem}
main.wrap{padding-top:2rem;padding-bottom:4rem}
h1{font-size:2rem;line-height:1.2;margin:0 0 .5rem}
p.lead{color:var(--muted);margin:0 0 1.5rem;font-size:1.05rem}
input#q{width:100%;padding:.8rem 1rem;font-size:1rem;border:1px solid var(--line);border-radius:10px;background:var(--card);color:var(--fg)}
.stats{color:var(--muted);font-size:.9rem;margin:.5rem 0 2rem}
section.cat{margin-bottom:2.5rem}
section.cat h2{font-size:1.25rem;margin:0 0 .75rem;padding-bottom:.35rem;border-bottom:1px solid var(--line)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:.75rem}
a.card{display:block;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:.85rem 1rem;text-decoration:none;color:inherit;transition:border-color .15s}
a.card:hover{border-color:var(--accent)}
a.card strong{display:block;color:var(--accent);margin-bottom:.2rem}
a.card span{color:var(--muted);font-size:.9rem;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}
.hidden{display:none!important}
.crumbs{font-size:.9rem;color:var(--muted);margin-bottom:1rem}
.crumbs a{text-decoration:none}
.meta{display:flex;gap:.75rem;flex-wrap:wrap;align-items:center;margin:0 0 2rem}
.pill{background:var(--accent-soft);color:var(--accent);border-radius:999px;padding:.2rem .7rem;font-size:.85rem;text-decoration:none}
article{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:1.5rem 2rem}
article h1{font-size:1.7rem}
article h2{margin-top:2rem;font-size:1.3rem}
article h3{font-size:1.1rem}
article pre{background:var(--code);padding:1rem;border-radius:8px;overflow-x:auto;font-size:.9rem}
article code{background:var(--code);padding:.1rem .3rem;border-radius:4px;font-size:.9em}
article pre code{background:none;padding:0}
article table{border-collapse:collapse;width:100%;display:block;overflow-x:auto}
article th,article td{border:1px solid var(--line);padding:.4rem .6rem;text-align:left}
article blockquote{border-left:3px solid var(--accent);margin:1rem 0;padding:.25rem 1rem;color:var(--muted)}
footer.site{border-top:1px solid var(--line);color:var(--muted);font-size:.85rem}
@media (max-width:600px){article{padding:1rem 1.1rem}h1{font-size:1.6rem}}
"""

JS = """
(function(){
  var q=document.getElementById('q');if(!q)return;
  var cards=[].slice.call(document.querySelectorAll('a.card'));
  var sections=[].slice.call(document.querySelectorAll('section.cat'));
  var count=document.getElementById('count');var total=cards.length;
  function run(){
    var t=q.value.trim().toLowerCase();var shown=0;
    cards.forEach(function(c){var hit=!t||c.dataset.k.indexOf(t)>-1;c.classList.toggle('hidden',!hit);if(hit)shown++;});
    sections.forEach(function(s){var any=s.querySelector('a.card:not(.hidden)');s.classList.toggle('hidden',!any);});
    count.textContent=t?shown+' of '+total+' skills match':total+' skills in '+sections.length+' categories';
  }
  q.addEventListener('input',run);run();
})();
"""


def slugify(name: str) -> str:
    s = name.lower().replace("&", " and ")
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")


def parse_front_matter(text: str) -> tuple[dict[str, str], str]:
    """Return (top-level scalar fields, body). Only needs name/description."""
    if not text.startswith("---"):
        return {}, text
    m = re.match(r"^---[ \t]*\r?\n(.*?)\r?\n---[ \t]*\r?\n?", text, re.S)
    if not m:
        return {}, text
    fields: dict[str, str] = {}
    for line in m.group(1).splitlines():
        if not line or line[0] in " \t#":
            continue
        key, sep, value = line.partition(":")
        if not sep:
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        fields[key.strip()] = value
    return fields, text[m.end():]


LIST_RE = re.compile(r"^[ \t]*(?:[-*+]|\d+[.)])[ \t]+")


def fix_lists(text: str) -> str:
    """Insert the blank line Markdown needs before a list that follows a paragraph.

    Most SKILL.md files put "- item" directly under an intro sentence, which
    Python-Markdown would otherwise merge into the paragraph. Fenced code blocks
    are left untouched.
    """
    out: list[str] = []
    in_fence = False
    prev = ""
    for line in text.splitlines():
        if line.lstrip().startswith(("```", "~~~")):
            in_fence = not in_fence
        elif (not in_fence and LIST_RE.match(line) and prev.strip()
              and not LIST_RE.match(prev) and not prev.lstrip().startswith(("#", "|", ">"))
              and not line.startswith((" ", "\t"))):
            out.append("")
        out.append(line)
        prev = line
    return "\n".join(out) + "\n"


def page(title: str, body: str, depth: int, description: str = "") -> str:
    home = "../" * depth or "./"
    desc = html.escape(description or "A library of 500+ ready-to-use Claude skills for business tasks.")
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(title)}</title>
<meta name="description" content="{desc}">
<link rel="icon" href="data:,">
<style>{CSS}</style>
</head>
<body>
<header class="site"><div class="wrap">
<a class="brand" href="{home}">{html.escape(SITE_TITLE)}</a>
<nav><a href="{home}">All skills</a><a href="{home}guide/getting-started.txt">Getting started</a><a href="{home}guide/skills-directory.pdf">Directory (PDF)</a></nav>
</div></header>
<main class="wrap">
{body}
</main>
<footer class="site"><div class="wrap">Each skill is a folder containing a <code>SKILL.md</code> file that you can upload to Claude.ai or copy into <code>~/.claude/skills/</code>.</div></footer>
<script>{JS}</script>
</body>
</html>
"""


def collect() -> list[tuple[str, str, list[dict]]]:
    categories = []
    for cat_dir in sorted(p for p in ROOT.iterdir() if p.is_dir() and p.name not in SKIP_DIRS):
        skills = []
        for skill_dir in sorted(p for p in cat_dir.iterdir() if p.is_dir()):
            skill_md = skill_dir / "SKILL.md"
            if not skill_md.is_file():
                continue
            text = skill_md.read_text(encoding="utf-8")
            fields, body = parse_front_matter(text)
            name = fields.get("name") or skill_dir.name
            skills.append({
                "dir": skill_dir,
                "slug": slugify(skill_dir.name),
                "name": name,
                "description": fields.get("description", ""),
                "body": body,
                "raw": text,
            })
        if skills:
            categories.append((cat_dir.name, slugify(cat_dir.name), skills))
    return categories


def build() -> int:
    if OUT.exists():
        shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    md = markdown.Markdown(extensions=["fenced_code", "tables", "sane_lists", "toc"])

    categories = collect()
    total = 0
    index_parts = [
        f"<h1>{html.escape(SITE_TITLE)}</h1>",
        "<p class=\"lead\">500+ structured Claude skills for marketing, finance, operations, HR, and more. "
        "Search below, open a skill, then download its <code>SKILL.md</code>.</p>",
        "<input id=\"q\" type=\"search\" placeholder=\"Search skills, e.g. pricing, LinkedIn, invoice…\" autofocus>",
        "<div class=\"stats\" id=\"count\"></div>",
    ]

    for cat_name, cat_slug, skills in categories:
        index_parts.append(f"<section class=\"cat\" id=\"{cat_slug}\"><h2>{html.escape(cat_name)}</h2><div class=\"grid\">")
        for s in skills:
            total += 1
            out_dir = OUT / cat_slug / s["slug"]
            out_dir.mkdir(parents=True, exist_ok=True)
            (out_dir / "SKILL.md").write_text(s["raw"], encoding="utf-8")
            md.reset()
            rendered = md.convert(fix_lists(s["body"]))
            crumbs = (f"<div class=\"crumbs\"><a href=\"../../\">All skills</a> › "
                      f"<a href=\"../../#{cat_slug}\">{html.escape(cat_name)}</a> › {html.escape(s['name'])}</div>")
            meta = (f"<div class=\"meta\"><a class=\"pill\" href=\"SKILL.md\" download>Download SKILL.md</a>"
                    f"<span class=\"pill\">{html.escape(cat_name)}</span></div>")
            desc = f"<p class=\"lead\">{html.escape(s['description'])}</p>" if s["description"] else ""
            body = f"{crumbs}<article>{desc}{meta}{rendered}</article>"
            (out_dir / "index.html").write_text(
                page(f"{s['name']} · {SITE_TITLE}", body, depth=2, description=s["description"]),
                encoding="utf-8")
            key = html.escape(f"{s['name']} {s['description']} {cat_name}".lower(), quote=True)
            index_parts.append(
                f"<a class=\"card\" href=\"{cat_slug}/{s['slug']}/\" data-k=\"{key}\">"
                f"<strong>{html.escape(s['name'])}</strong><span>{html.escape(s['description'])}</span></a>")
        index_parts.append("</div></section>")

    (OUT / "index.html").write_text(page(SITE_TITLE, "\n".join(index_parts), depth=0), encoding="utf-8")
    (OUT / "404.html").write_text(
        page(f"Not found · {SITE_TITLE}", "<h1>Page not found</h1><p class=\"lead\">That skill does not exist. "
             "<a href=\"/\">Browse all skills</a>.</p>", depth=0), encoding="utf-8")

    guide = OUT / "guide"
    guide.mkdir()
    if GUIDE_TXT.is_file():
        shutil.copy(GUIDE_TXT, guide / "getting-started.txt")
    if GUIDE_PDF.is_file():
        shutil.copy(GUIDE_PDF, guide / "skills-directory.pdf")
    cname = ROOT / "CNAME"
    if cname.is_file():
        shutil.copy(cname, OUT / "CNAME")
    (OUT / ".nojekyll").touch()

    print(f"Built {total} skills in {len(categories)} categories -> {OUT}")
    return 0


if __name__ == "__main__":
    sys.exit(build())
