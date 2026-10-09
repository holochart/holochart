"""Exact figure and source identities for standalone gallery counterparts."""

import ast
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent


def sha256(source):
    return hashlib.sha256(source.encode()).hexdigest()


def literal_figure(source, variable):
    for statement in ast.parse(source).body:
        if isinstance(statement, ast.Assign) and any(
            isinstance(target, ast.Name) and target.id == variable for target in statement.targets
        ):
            return ast.literal_eval(statement.value), ast.get_source_segment(source, statement)
    raise ValueError(f"Missing literal figure: {variable}")


def standalone_source(item, variant, assignment):
    chart = variant["variable"].replace("figure_", "chart_")
    return f'''# %% [markdown]
# # {variant['id']}: Python counterpart
# Generated from {item['source']}; edit that canonical source.
# This complete example needs only holochart-py in a notebook kernel with a widget manager.
# Its explicit data and initial figure match the public JavaScript gallery example.
# No external data, repository helpers or network access are needed.

# %% Imports
from IPython.display import display
from holochart import HolochartWidget

# %% Figure {variant['id']}
{assignment}

# %% Display {variant['id']}
if "{chart}" in globals():
    {chart}.close()
{chart} = HolochartWidget({variant['variable']}, height={variant['height']})
assert {chart}.figure == {variant['variable']}
display({chart})
'''


def identities(item, variant):
    source = (ROOT / item["source"]).read_text()
    figure, assignment = literal_figure(source, variant["variable"])
    captures = json.loads((HERE / "gallery-captures.json").read_text())
    captured = next(example for group in captures for example in group["examples"]
                    if example["id"] == variant["id"])
    if figure != captured["figure"]:
        raise ValueError(f"{variant['id']}: Python/browser figure data drift")
    for file, digest in variant["browserSourceHashes"].items():
        if hashlib.sha256((ROOT / file).read_bytes()).hexdigest() != digest:
            raise ValueError(f"{variant['id']}: browser source dependency changed: {file}")
    text = standalone_source(item, variant, assignment)
    figure_hash = sha256(json.dumps(figure, sort_keys=True, separators=(",", ":"), ensure_ascii=False, allow_nan=False))
    return text, sha256(text), figure_hash


def validate(item, variant):
    text, source_hash, figure_hash = identities(item, variant)
    if variant.get("sourceSha256") != source_hash or variant.get("figureSha256") != figure_hash:
        raise ValueError(f"{variant['id']}: stale standalone source/figure identity; refresh identities and repeat kernel/browser verification")
    verification = variant.get("verification", {})
    if verification.get("browserVerified") and verification.get("sourceSha256") != source_hash:
        raise ValueError(f"{variant['id']}: stale standalone browser evidence")
    return text


def main():
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--refresh", action="store_true", help="Update identities and clear verification for changed sources.")
    args = parser.parse_args()
    manifest_path = HERE / "manifest.json"
    manifest = json.loads(manifest_path.read_text())
    count = 0
    captures = {example["id"]: example for group in json.loads((HERE / "gallery-captures.json").read_text())
                for example in group["examples"]}
    for item in manifest["notebooks"]:
        for variant in item.get("galleryVariants", []):
            changed_browser_source = False
            if args.refresh:
                hashes = captures[variant["id"]]["sourceHashes"]
                changed_browser_source = hashes != variant["browserSourceHashes"]
                variant["browserSourceHashes"] = hashes
            _, source_hash, figure_hash = identities(item, variant)
            if args.refresh:
                if (changed_browser_source or variant.get("sourceSha256") != source_hash
                        or variant.get("figureSha256") != figure_hash):
                    variant["verification"] = {"state": "unverified", "browserVerified": False}
                variant.update(sourceSha256=source_hash, figureSha256=figure_hash)
            else:
                validate(item, variant)
            count += 1
    if args.refresh:
        manifest_path.write_text(json.dumps(manifest, indent=2) + "\n")
    print(f"{'Refreshed' if args.refresh else 'Verified'} {count} exact gallery source/figure identities.")


if __name__ == "__main__":
    main()
