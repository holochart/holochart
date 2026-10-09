"""Prepared copies preserve executable cells and never alter canonical proof."""

import importlib.util
import json
import tempfile
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("prepare_host_check", HERE / "prepare-host-check.py")
prepare_host = importlib.util.module_from_spec(spec)
spec.loader.exec_module(prepare_host)


class HostPreparationTests(unittest.TestCase):
    def test_fresh_copies_preserve_code_and_clear_outputs_without_mutating_proof(self):
        protected = [HERE / "manifest.json", HERE / "verification.json"]
        before = [file.read_bytes() for file in protected]
        manifest = json.loads(before[0])
        with tempfile.TemporaryDirectory(prefix="holochart-host-preparation-") as directory:
            # A second preparation still creates one marker, not an accumulating test notebook.
            prepare_host.prepare(directory, "holochart-test")
            inputs = prepare_host.prepare(directory, "holochart-test")
            self.assertEqual(len(inputs), len(manifest["notebooks"]) + sum(len(item.get("galleryVariants", [])) for item in manifest["notebooks"]))
            for slug, item in inputs.items():
                for host in ["lab", "notebooks"]:
                    copied = json.loads((Path(directory) / "notebooks" / f"{slug}-{host}.ipynb").read_text())
                    code = [prepare_host.source_text(cell) for cell in copied["cells"] if cell["cell_type"] == "code"]
                    if item["kind"] == "notebook":
                        original = next(notebook for notebook in manifest["notebooks"] if notebook["slug"] == slug)
                        canonical = json.loads((prepare_host.REPO / original["notebook"]).read_text())
                        expected = [prepare_host.source_text(cell) for cell in canonical["cells"] if cell["cell_type"] == "code"]
                    else:
                        text = (prepare_host.REPO / item["source"]).read_text()
                        expected = [cell["source"] for cell in prepare_host.cells(text) if cell["cell_type"] == "code"]
                    self.assertEqual(code[:-1], expected)
                    self.assertEqual(code[-1], f'print("HOLOCHART_COMPLETE_{slug}")\n')
                    self.assertEqual(copied["metadata"]["kernelspec"]["name"], "holochart-test")
                    for cell in copied["cells"]:
                        if cell["cell_type"] == "code":
                            self.assertEqual(cell["outputs"], [])
                            self.assertIsNone(cell["execution_count"])
        self.assertEqual([file.read_bytes() for file in protected], before)

    def test_checked_in_repository_cannot_be_used_as_run_directory(self):
        with self.assertRaisesRegex(ValueError, "outside the repository"):
            prepare_host.prepare(prepare_host.REPO / "docs/site", "holochart-test")


if __name__ == "__main__":
    unittest.main()
