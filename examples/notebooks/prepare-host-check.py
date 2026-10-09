"""Prepare isolated, unexecuted learning and gallery inputs for the real notebook-host driver."""

import argparse
import copy
import hashlib
import json
import re
from pathlib import Path

from generate import cells
from identity import validate

REPO = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent


def source_text(cell):
    source = cell.get("source", "")
    return "".join(source) if isinstance(source, list) else source


def code_hash(notebook):
    code = "\n".join(source_text(cell) for cell in notebook["cells"] if cell["cell_type"] == "code")
    return hashlib.sha256(code.encode()).hexdigest()


def prepare(root, kernel):
    root = Path(root).resolve()
    if root == REPO or REPO in root.parents:
        raise ValueError("Use an isolated run directory outside the repository; checked-in proof must remain untouched.")
    if not re.fullmatch(r"[A-Za-z0-9_.-]+", kernel):
        raise ValueError("Kernel name must contain only letters, numbers, underscore, dot or hyphen.")
    manifest = json.loads((HERE / "manifest.json").read_text())
    notebook_root = root / "notebooks"
    notebook_root.mkdir(parents=True, exist_ok=True)
    inputs = {}

    def add(slug, notebook, source, count, kind, example_id=None):
        if slug in inputs:
            raise ValueError(f"Duplicate host-check slug: {slug}")
        if not isinstance(count, int) or count < 1:
            raise ValueError(f"{slug}: expected widget count must be a positive integer")
        code_sha = code_hash(notebook)
        clean = copy.deepcopy(notebook)
        clean.setdefault("metadata", {})["kernelspec"] = {
            "display_name": "Python (Holochart verification)", "language": "python", "name": kernel,
        }
        for cell in clean["cells"]:
            if cell["cell_type"] == "code":
                cell.update(execution_count=None, outputs=[])
        # This print proves run-all reached the end; it is never added to published notebooks.
        clean["cells"].append({"cell_type": "code", "metadata": {"name": "Verification completion marker"},
                               "execution_count": None, "outputs": [],
                               "source": f"print({json.dumps('HOLOCHART_COMPLETE_' + slug)})\n"})
        if code_hash({"cells": clean["cells"][:-1]}) != code_sha:
            raise ValueError(f"{slug}: preparing a host copy changed canonical executable cells")
        encoded = json.dumps(clean, indent=2, ensure_ascii=False) + "\n"
        for host in ["lab", "notebooks"]:
            (notebook_root / f"{slug}-{host}.ipynb").write_text(encoded)
        inputs[slug] = {"source": source,
                        "sourceSha256": hashlib.sha256((REPO / source).read_bytes()).hexdigest(),
                        "codeSha256": code_sha, "kind": kind, "expectedWidgetOutputs": count}
        if example_id is not None:
            inputs[slug]["exampleId"] = example_id

    for item in manifest["notebooks"]:
        notebook = json.loads((REPO / item["notebook"]).read_text())
        add(item["slug"], notebook, item["source"], item["expectedWidgetOutputs"], "notebook")
        for variant in item.get("galleryVariants", []):
            text = validate(item, variant)
            if (REPO / variant["source"]).read_text() != text:
                raise ValueError(f"{variant['id']}: stale single-figure source; regenerate first")
            standalone = {"nbformat": 4, "nbformat_minor": 4, "metadata": {}, "cells": cells(text)}
            slug = "gallery-" + variant["id"].replace("/", "-")
            add(slug, standalone, variant["source"], variant["expectedWidgetOutputs"], "gallery", variant["id"])
    (root / "inputs.json").write_text(json.dumps(inputs, indent=2) + "\n")
    return inputs


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", required=True, type=Path, help="Isolated output directory outside the repository.")
    parser.add_argument("--kernel", default="holochart", help="Installed verification kernel name.")
    args = parser.parse_args()
    inputs = prepare(args.root, args.kernel)
    print(f"Prepared {len(inputs)} inputs / {2 * len(inputs)} clean host copies in {args.root / 'notebooks'}.")


if __name__ == "__main__":
    main()
