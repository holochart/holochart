"""Fault-injection checks for semantic and source proof guards; no checkout files are mutated."""

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import identity


class GalleryIdentityTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.here = self.root / "examples/notebooks"
        self.here.mkdir(parents=True)
        self.browser = self.root / "examples/bar/sample.ts"
        self.browser.parent.mkdir(parents=True)
        self.browser.write_text("public browser figure source")
        self.source = self.here / "sample.py"
        self.source.write_text("figure = {'data': [{'type': 'bar', 'y': [3, 5]}]}\n")
        self.item = {"source": "examples/notebooks/sample.py"}
        self.variant = {"id": "bar/sample", "variable": "figure", "height": 360,
                        "browserSourceHashes": {"examples/bar/sample.ts": identity.sha256(self.browser.read_text())},
                        "verification": {"browserVerified": False}}
        self.captures = [{"examples": [{"id": "bar/sample", "figure": {"data": [{"type": "bar", "y": [3, 5]}]}}]}]
        (self.here / "gallery-captures.json").write_text(json.dumps(self.captures))
        self.addCleanup(patch.stopall)
        patch.object(identity, "ROOT", self.root).start()
        patch.object(identity, "HERE", self.here).start()
        _, source_hash, figure_hash = identity.identities(self.item, self.variant)
        self.variant.update(sourceSha256=source_hash, figureSha256=figure_hash)

    def test_valid_counterpart_is_complete_and_has_one_display(self):
        text = identity.validate(self.item, self.variant)
        self.assertIn("from holochart import HolochartWidget", text)
        self.assertEqual(text.count("display("), 1)
        self.assertIn("'y': [3, 5]", text)
        self.assertIn(".close()", text)

    def test_changed_python_values_cannot_keep_browser_identity(self):
        self.source.write_text("figure = {'data': [{'type': 'bar', 'y': [3, 9]}]}\n")
        with self.assertRaisesRegex(ValueError, "figure data drift"):
            identity.validate(self.item, self.variant)

    def test_changed_browser_dependency_cannot_keep_capture_proof(self):
        self.browser.write_text("changed browser figure source")
        with self.assertRaisesRegex(ValueError, "source dependency changed"):
            identity.validate(self.item, self.variant)

    def test_stale_source_and_browser_claims_are_rejected(self):
        self.variant["height"] = 400
        with self.assertRaisesRegex(ValueError, "stale standalone source/figure identity"):
            identity.validate(self.item, self.variant)
        _, source_hash, figure_hash = identity.identities(self.item, self.variant)
        self.variant.update(sourceSha256=source_hash, figureSha256=figure_hash)
        self.variant["verification"] = {"browserVerified": True, "sourceSha256": "stale"}
        with self.assertRaisesRegex(ValueError, "stale standalone browser evidence"):
            identity.validate(self.item, self.variant)

    def test_intentional_capture_refresh_clears_previous_browser_claim(self):
        self.variant["verification"] = {"browserVerified": True, "sourceSha256": self.variant["sourceSha256"]}
        self.browser.write_text("intentionally refreshed browser source")
        hashes = {"examples/bar/sample.ts": identity.sha256(self.browser.read_text())}
        self.captures[0]["examples"][0]["sourceHashes"] = hashes
        (self.here / "gallery-captures.json").write_text(json.dumps(self.captures))
        self.item["galleryVariants"] = [self.variant]
        (self.here / "manifest.json").write_text(json.dumps({"notebooks": [self.item]}))
        with patch("sys.argv", ["identity.py", "--refresh"]):
            identity.main()
        updated = json.loads((self.here / "manifest.json").read_text())["notebooks"][0]["galleryVariants"][0]
        self.assertEqual(updated["browserSourceHashes"], hashes)
        self.assertFalse(updated["verification"]["browserVerified"])
        identity.validate(self.item, updated)


if __name__ == "__main__":
    unittest.main()
