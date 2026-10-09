"""Generate downloadable notebooks and matching web cells from canonical percent-cell Python."""

import argparse
import hashlib
import json
import re
from pathlib import Path

from identity import validate

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
SITE = "https://mk7s.dev/holochart"


def learning_introduction(item):
    return f'''# {item['title']}

**Goal:** {item['goal']}

**Estimated tutorial time:** {item['tutorialMinutes']} minutes after environment installation.

**Prerequisites:** {', '.join(item['prerequisites'])}.
Python dependencies: {', '.join(f'`{dependency}`' for dependency in item['dependencies'])}.
Complete the [development setup]({SITE}/getting-started/installation#python-and-jupyter-from-source),
select its kernel, then restart and run all cells.

**Environment and test scope:** Python 3.14.8, anywidget 0.11.0 and ipywidgets 8.1.9 were exercised.
See [the host/version matrix]({SITE}/python/environments) for the actual browser checks, warning
and unsupported editors. `requirements-verified.txt` records exact exercised library versions;
the package's declared minimum ranges are different from this tested environment.

**Data provenance:** {item['dataProvenance']}
'''


def learning_continuations(item):
    links = [f"[Web cells and source]({SITE}/python/notebooks/{item['slug']})",
             f"[Related guide]({SITE}{item['guide']})",
             f"[Troubleshooting]({SITE}/python/troubleshooting)"]
    links += [f"[Gallery: {identifier}]({SITE}/gallery/example/{identifier})" for identifier in item['galleryExamples']]
    links += [f"[Chart guide: {route.rsplit('/', 1)[-1]}]({SITE}{route})" for route in item.get('chartGuides', [])]
    return ("## Continue and verify\n\n"
            f"Restart and run all should create **{item['expectedWidgetOutputs']} widget outputs**. "
            "Check for visible charts, rather than relying on successful Python execution. "
            "The related gallery's single-figure Python download is generated from the same canonical "
            "figure and produces one output. Static screenshots are previews and cannot execute a widget.\n\n"
            + " · ".join(links) + "\n")


def cells(source):
    chunks = re.split(r"^# %% (.+)$", source, flags=re.MULTILINE)
    if chunks[0].strip():
        raise ValueError("Source must start with a percent cell marker")
    result = []
    for title, body in zip(chunks[1::2], chunks[2::2]):
        body = body.strip("\n")
        markdown = title == "[markdown]"
        if markdown:
            body = "\n".join(re.sub(r"^# ?", "", line) for line in body.splitlines())
        cell = {
            "cell_type": "markdown" if markdown else "code",
            "metadata": {} if markdown else {"name": title},
            "source": body + "\n",
        }
        if not markdown:
            compile(body, "<notebook-cell>", "exec")
            cell.update(execution_count=None, outputs=[])
        result.append(cell)
    return result


def generated_files():
    manifest = json.loads((HERE / "manifest.json").read_text())
    outputs = {}
    for item in manifest["notebooks"]:
        source = (ROOT / item["source"]).read_text()
        for variant in item.get("galleryVariants", []):
            standalone = validate(item, variant)
            outputs[ROOT / variant["source"]] = standalone
            outputs[ROOT / "apps/docs/public" / variant["download"].lstrip("/")] = standalone
        verification = item.get("verification", {})
        if verification.get("browserVerified") and verification.get("sourceSha256") != hashlib.sha256(source.encode()).hexdigest():
            raise ValueError(f"{item['slug']}: browser verification is stale after source changes; rerun kernel and browser checks before publishing metadata.")
        notebook_cells = cells(source)
        if notebook_cells and notebook_cells[0]["cell_type"] == "markdown":
            notebook_cells[0]["source"] = re.sub(r"^# .+\n", "", notebook_cells[0]["source"], count=1)
        notebook_cells.insert(0, {"cell_type": "markdown", "metadata": {}, "source": learning_introduction(item)})
        notebook_cells.append({"cell_type": "markdown", "metadata": {}, "source": learning_continuations(item)})
        notebook = {
            "nbformat": 4,
            "nbformat_minor": 4,
            "metadata": {
                "kernelspec": {"display_name": "Python (Holochart)", "language": "python", "name": "holochart"},
                "language_info": {"name": "python"},
                "holochart": {"canonical_source": item["source"], "dependencies": item["dependencies"]},
            },
            "cells": notebook_cells,
        }
        encoded = json.dumps(notebook, indent=2, ensure_ascii=False) + "\n"
        outputs[ROOT / item["notebook"]] = encoded
        public = ROOT / "apps/docs/public/notebooks"
        outputs[public / f"{item['slug']}.ipynb"] = encoded
        outputs[public / f"{item['slug']}.py"] = source
        fragment = ["<!-- Generated by examples/notebooks/generate.py; edit the canonical .py file. -->\n"]
        for cell in notebook_cells:
            if cell["cell_type"] == "markdown":
                # The handwritten guide owns its page title; retain the notebook explanation.
                text = re.sub(r"^# .+\n", "", cell["source"], count=1)
                fragment.append(text)
            else:
                fragment.append(f"### {cell['metadata']['name']}\n\n```python\n{cell['source']}```\n")
        outputs[ROOT / f"apps/docs/.vitepress/generated/notebooks/{item['slug']}.md"] = "\n".join(fragment)
        preview = ""
        if (ROOT / f"apps/docs/public/notebooks/previews/{item['slug']}.png").exists():
            preview = (f"![Static notebook screenshot for {item['title']}](/notebooks/previews/{item['slug']}.png)\n\n"
                       "Static preview from a verified notebook host; use the download to execute the widget.\n")
        outputs[ROOT / f"apps/docs/python/notebooks/{item['slug']}.md"] = f'''---
title: {item['title']}
description: {item['description']}
status: complete
---

<script setup>
import NotebookLinks from '../../.vitepress/theme/components/NotebookLinks.vue';
</script>

# {item['title']}

<InstallStatus ecosystem="python" />

These cells come from the canonical `{item['source']}`. First complete the
[Python development setup](/getting-started/installation#python-and-jupyter-from-source)
and select its notebook kernel. See [environment verification](/python/environments) for the
tested versions and scope. Dependencies: {', '.join(f'`{d}`' for d in item['dependencies'])}.

<NotebookLinks slug="{item['slug']}" source-page />

{preview}

<!--@include: ../../.vitepress/generated/notebooks/{item['slug']}.md-->

Continue with [the related guide]({item['guide']}) or [all learning notebooks](/python/notebooks/).
'''
        page_path = ROOT / f"apps/docs/python/notebooks/{item['slug']}.md"
        outputs[page_path] = re.sub(r"\n{3,}", "\n\n", outputs[page_path])
    # Preserve the canonical manifest's formatting as well as its metadata.
    outputs[ROOT / "apps/docs/public/notebooks/manifest.json"] = (HERE / "manifest.json").read_text()
    outputs[ROOT / "apps/docs/public/notebooks/requirements-verified.txt"] = (HERE / "requirements-verified.txt").read_text()
    return outputs


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="Fail on missing or stale committed outputs (excluding ignored build fragments).")
    args = parser.parse_args()
    stale = []
    outputs = generated_files()
    for path, text in outputs.items():
        # VitePress fragments are ignored build outputs, generated by gen:notebooks.
        # A clean checkout must still verify every committed download and guide.
        if args.check and path.is_relative_to(ROOT / "apps/docs/.vitepress/generated"):
            continue
        if args.check:
            if not path.exists() or path.read_text() != text:
                stale.append(str(path.relative_to(ROOT)))
        else:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(text)
    if stale:
        raise SystemExit("Stale notebook outputs:\n" + "\n".join(stale))
    print(f"{'Verified' if args.check else 'Generated'} {len(outputs)} notebook/source/web artifacts.")


if __name__ == "__main__":
    main()
