"""Stage browser assets before building either a wheel or a self-contained sdist."""

import runpy
from pathlib import Path

from hatchling.builders.hooks.plugin.interface import BuildHookInterface


class CustomBuildHook(BuildHookInterface):
    def initialize(self, version, build_data):
        root = Path(self.root)
        package = root.parent / "holochart"
        if (package / "package.json").exists():
            runpy.run_path(str(root / "build_assets.py"))["build_assets"](package)
        elif not (root / "src/holochart/static/widget.js").exists():
            raise RuntimeError(
                "Missing bundled Holochart assets. Stage them with build_assets.py before building."
            )
