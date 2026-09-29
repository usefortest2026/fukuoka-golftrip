import subprocess
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
ENTRY_POINTS = (
    "fukuoka-golf.html",
    "fukuoka-golf-v2.html",
    "fukuoka-golf-en.html",
)


class ServiceWorkerStaticTest(unittest.TestCase):
    def test_worker_and_controller_are_valid_javascript(self):
        for filename in ("service-worker.js", "pwa.js"):
            path = ROOT / filename
            self.assertTrue(path.is_file(), f"missing {filename}")
            result = subprocess.run(
                ["node", "--check", str(path)],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)

    def test_each_entry_point_loads_the_pwa_controller_once(self):
        for filename in ENTRY_POINTS:
            source = (ROOT / filename).read_text(encoding="utf-8")
            self.assertEqual(source.count('src="pwa.js?'), 1, filename)

    def test_no_unencrypted_private_payload_is_created(self):
        self.assertFalse((ROOT / "private-trip-info.json").exists())


if __name__ == "__main__":
    unittest.main()
