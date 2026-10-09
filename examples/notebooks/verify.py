"""Restart/run-all canonical notebooks and record kernel-only evidence without saving outputs."""

import argparse
import hashlib
import json
import platform
from datetime import date
from importlib.metadata import version
from pathlib import Path

import nbformat
from nbclient import NotebookClient
from generate import cells
from identity import validate

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--kernel", default="holochart")
    parser.add_argument("--date", default=date.today().isoformat())
    parser.add_argument("--only", nargs="+", help="Recheck selected notebook slugs, preserving unchanged evidence for the rest.")
    parser.add_argument("--output", type=Path, help="Write a run report here without modifying canonical verification or browser metadata.")
    args = parser.parse_args()
    manifest = json.loads((HERE / "manifest.json").read_text())
    selected = set(args.only or [item["slug"] for item in manifest["notebooks"]])
    unknown = selected - {item["slug"] for item in manifest["notebooks"]}
    if unknown:
        raise ValueError(f"Unknown notebook slugs: {sorted(unknown)}")
    previous_report = json.loads((HERE / "verification.json").read_text()) if (HERE / "verification.json").exists() else {}
    previous_evidence = {}
    previous_variant_evidence = {}
    if (HERE / "verification.json").exists():
        previous_evidence = {item["slug"]: item["sourceSha256"] for item in json.loads((HERE / "verification.json").read_text())["notebooks"]}
        previous_variant_evidence = {item["id"]: item["sourceSha256"] for item in json.loads((HERE / "verification.json").read_text()).get("variants", [])}
    evidence = {
        "date": args.date,
        "scope": "Fresh-kernel execution and widget MIME/state assertions; not notebook-host browser rendering.",
        "kernel": args.kernel,
        "driverEnvironment": {
            "os": platform.system(),
            "architecture": platform.machine(),
            "python": platform.python_version(),
            **{package: version(package) for package in ["ipykernel", "nbclient", "nbformat", "holochart-py", "plotly", "anywidget", "ipywidgets", "pandas", "numpy"]},
        },
        "notebooks": [item for item in previous_report.get("notebooks", []) if item["slug"] not in selected],
        "variants": [item for item in previous_report.get("variants", [])
                     if item["id"] not in {variant["id"] for notebook in manifest["notebooks"]
                                           if notebook["slug"] in selected for variant in notebook.get("galleryVariants", [])}],
    }
    for item in manifest["notebooks"]:
        if item["slug"] not in selected:
            digest = hashlib.sha256((ROOT / item["source"]).read_bytes()).hexdigest()
            if previous_evidence.get(item["slug"]) != digest:
                raise ValueError(f"{item['slug']}: changed source must be included in this verification run")
            for variant in item.get("galleryVariants", []):
                validate(item, variant)
                if previous_variant_evidence.get(variant["id"]) != variant["sourceSha256"]:
                    raise ValueError(f"{variant['id']}: changed standalone source must be verified")
            continue
        notebook = nbformat.read(ROOT / item["notebook"], as_version=4)
        NotebookClient(notebook, kernel_name=args.kernel, timeout=90).execute()
        outputs = [output for cell in notebook.cells if cell.cell_type == "code" for output in cell.outputs]
        widget_outputs = sum("application/vnd.jupyter.widget-view+json" in output.get("data", {}) for output in outputs)
        if widget_outputs != item["expectedWidgetOutputs"]:
            raise AssertionError(f"{item['slug']}: expected {item['expectedWidgetOutputs']} widget outputs, got {widget_outputs}")
        source_hash = hashlib.sha256((ROOT / item["source"]).read_bytes()).hexdigest()
        evidence["notebooks"].append({
            "slug": item["slug"],
            "sourceSha256": source_hash,
            "widgetOutputs": widget_outputs,
            "execution": "passed",
        })
        previous = item.get("verification", {})
        keep_browser_evidence = (previous.get("browserVerified", False)
                                 and previous.get("sourceSha256") == source_hash
                                 and previous_evidence.get(item["slug"]) == source_hash)
        if not keep_browser_evidence:
            item["environments"] = [f"Python {platform.python_version()} isolated ipykernel {version('ipykernel')}; notebook-host rendering tracked separately"]
            item["verification"] = {
                "state": "executed",
                "browserVerified": False,
                "sourceSha256": source_hash,
                "method": "nbclient restart/run-all in an isolated kernel; exact widget MIME counts and replacement-state assertions. Browser notebook hosts tracked separately.",
                "artifact": "examples/notebooks/verification.json",
            }
        print(f"{item['slug']}: passed ({widget_outputs} widget MIME outputs)", flush=True)
        for variant in item.get("galleryVariants", []):
            text = validate(item, variant)
            if (ROOT / variant["source"]).read_text() != text:
                raise ValueError(f"{variant['id']}: stale standalone download; regenerate first")
            standalone = nbformat.from_dict({"nbformat": 4, "nbformat_minor": 4, "metadata": {}, "cells": cells(text)})
            NotebookClient(standalone, kernel_name=args.kernel, timeout=90).execute()
            variant_outputs = sum("application/vnd.jupyter.widget-view+json" in output.get("data", {})
                                  for cell in standalone.cells if cell.cell_type == "code" for output in cell.outputs)
            if variant_outputs != variant["expectedWidgetOutputs"]:
                raise AssertionError(f"{variant['id']}: expected one standalone widget output, got {variant_outputs}")
            evidence["variants"].append({"id": variant["id"], "sourceSha256": variant["sourceSha256"],
                                         "figureSha256": variant["figureSha256"], "widgetOutputs": variant_outputs, "execution": "passed"})
            old = variant.get("verification", {})
            keep = (old.get("browserVerified", False) and old.get("sourceSha256") == variant["sourceSha256"]
                    and previous_variant_evidence.get(variant["id"]) == variant["sourceSha256"])
            if not keep:
                variant["verification"] = {"state": "executed", "browserVerified": False,
                                            "sourceSha256": variant["sourceSha256"], "date": args.date,
                                            "method": "Fresh isolated kernel; one widget MIME output and exact browser/Python figure identity. Notebook-host rendering tracked separately.",
                                            "artifact": "examples/notebooks/verification.json"}
            print(f"  {variant['id']}: passed (one exact standalone widget)", flush=True)
    order = {item["slug"]: index for index, item in enumerate(manifest["notebooks"])}
    variant_order = {variant["id"]: index for index, variant in enumerate(
        variant for notebook in manifest["notebooks"] for variant in notebook.get("galleryVariants", []))}
    evidence["notebooks"].sort(key=lambda item: order[item["slug"]])
    evidence["variants"].sort(key=lambda item: variant_order[item["id"]])
    output = args.output or HERE / "verification.json"
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(evidence, indent=2) + "\n")
    if args.output is None:
        (HERE / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")


if __name__ == "__main__":
    main()
