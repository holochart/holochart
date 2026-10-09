"""Committed artifact checks work in a clean checkout without ignored build output."""

import contextlib
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import generate


class GenerationCheckTests(unittest.TestCase):
    def test_check_ignores_build_fragments_but_rejects_stale_downloads(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            download = root / 'apps/docs/public/notebooks/example.py'
            fragment = root / 'apps/docs/.vitepress/generated/notebooks/example.md'
            download.parent.mkdir(parents=True)
            download.write_text('current')
            outputs = {download: 'current', fragment: 'generated'}
            with patch.object(generate, 'ROOT', root), patch.object(generate, 'generated_files', return_value=outputs), patch('sys.argv', ['generate.py', '--check']), contextlib.redirect_stdout(io.StringIO()):
                generate.main()
                self.assertFalse(fragment.exists())
                download.write_text('stale')
                with self.assertRaisesRegex(SystemExit, 'public/notebooks/example.py'):
                    generate.main()
                self.assertEqual(download.read_text(), 'stale')
                download.unlink()
                with self.assertRaisesRegex(SystemExit, 'public/notebooks/example.py'):
                    generate.main()
            with patch.object(generate, 'ROOT', root), patch.object(generate, 'generated_files', return_value=outputs), patch('sys.argv', ['generate.py']), contextlib.redirect_stdout(io.StringIO()):
                generate.main()
                self.assertEqual(fragment.read_text(), 'generated')
                self.assertEqual(download.read_text(), 'current')


if __name__ == '__main__':
    unittest.main()
