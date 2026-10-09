"""Embed a built npm package's IIFEs and fonts in an anywidget ES module."""

import argparse
import base64
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent
OUTPUT = ROOT / "src/holochart/static/widget.js"


def build_assets(package: Path) -> None:
    """Accept packages/holochart or the root of an unpacked npm tarball."""
    dist = package / "dist"
    try:
        scripts = [
            (dist / name).read_text(encoding="utf-8")
            for name in ("holochart.iife.min.js", "holochart-3d.iife.min.js")
        ]
        fonts = {
            face: "data:font/otf;base64,"
            + base64.b64encode(
                (dist / f"fonts/texgyreheros-{file}.otf").read_bytes()
            ).decode("ascii")
            for face, file in (
                ("regular", "regular"),
                ("bold", "bold"),
                ("italic", "italic"),
                ("boldItalic", "bolditalic"),
            )
        }
        metadata = json.loads((package / "package.json").read_text(encoding="utf-8"))
        licenses = {
            "LICENSE": (package / "LICENSE")
            if (package / "LICENSE").exists()
            else ROOT.parent.parent / "LICENSE",
            "THIRD_PARTY_NOTICES.md": package / "THIRD_PARTY_NOTICES.md",
            "GUST-FONT-LICENSE.txt": dist / "fonts/GUST-FONT-LICENSE.txt",
        }
        license_text = {name: path.read_bytes() for name, path in licenses.items()}
    except FileNotFoundError as error:
        raise RuntimeError(
            "Holochart browser assets are missing. Run `pnpm build:packages`, "
            "or `python build_assets.py --package /path/to/unpacked/npm/package`."
        ) from error

    # Keep the IIFE's `var Holochart` and the add-on in the same local scope. No eval,
    # script injection, CDN, or window.Holochart collision with other notebook outputs.
    scripts = [
        "\n".join(line for line in script.splitlines() if not line.startswith("//# sourceMappingURL="))
        for script in scripts
    ]
    source = (
        f"// Generated from @mk7s/holochart {metadata['version']}. See THIRD_PARTY_NOTICES.md.\n"
        "const holochart = (() => {\n"
        + scripts[0]
        # The add-on uses both `Holochart` and `globalThis.Holochart`. Give it a
        # scoped global reference without changing the notebook's actual global.
        + "\n((globalThis) => {\n"
        + scripts[1]
        + "\n})(Object.assign(Object.create(globalThis), { Holochart }));\n"
        + f"\nHolochart.render.configureText({{ defaultFontFaces: {json.dumps(fonts)} }});\n"
        + "return Holochart;\n})();\n"
        + (ROOT / "frontend/widget.js").read_text(encoding="utf-8")
        + "\nexport default createWidget(holochart);\n"
    )
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(source, encoding="utf-8")
    for name, content in license_text.items():
        (ROOT / name).write_bytes(content)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--package", type=Path, default=ROOT.parent / "holochart")
    build_assets(parser.parse_args().package)
