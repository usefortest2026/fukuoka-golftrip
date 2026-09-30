import json
import re
import struct
import unittest
from html.parser import HTMLParser
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HTML_FILES = ("fukuoka-golf.html", "fukuoka-golf-v2.html", "fukuoka-golf-en.html")


class HeadMetadataParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
        self.metas = []

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)
        if tag == "link":
            self.links.append(attributes)
        elif tag == "meta":
            self.metas.append(attributes)


def png_size(path):
    with path.open("rb") as image:
        header = image.read(24)
    if header[:8] != b"\x89PNG\r\n\x1a\n":
        raise AssertionError(f"{path} is not a PNG")
    return struct.unpack(">II", header[16:24])


class PwaAssetsTest(unittest.TestCase):
    def test_manifest_describes_the_trip_app(self):
        manifest = json.loads((ROOT / "manifest.webmanifest").read_text(encoding="utf-8"))
        self.assertEqual("2026 福岡高爾夫", manifest["name"])
        self.assertEqual("福岡高爾夫", manifest["short_name"])
        self.assertEqual("./fukuoka-golf.html", manifest["start_url"])
        self.assertEqual("./", manifest["scope"])
        self.assertEqual("standalone", manifest["display"])
        self.assertEqual("#173629", manifest["theme_color"])
        self.assertEqual("#eef1eb", manifest["background_color"])
        self.assertEqual(
            [
                {"src": "icons/icon-192.png", "sizes": "192x192", "type": "image/png"},
                {"src": "icons/icon-512.png", "sizes": "512x512", "type": "image/png"},
            ],
            manifest["icons"],
        )
        self.assertNotIn("coupon-", json.dumps(manifest))

    def test_manifest_icons_have_the_declared_dimensions(self):
        self.assertEqual((192, 192), png_size(ROOT / "icons/icon-192.png"))
        self.assertEqual((512, 512), png_size(ROOT / "icons/icon-512.png"))

    def test_each_entry_point_exposes_install_metadata(self):
        for filename in HTML_FILES:
            with self.subTest(filename=filename):
                parser = HeadMetadataParser()
                parser.feed((ROOT / filename).read_text(encoding="utf-8"))
                manifest_links = [item for item in parser.links if item.get("rel") == "manifest"]
                apple_icons = [item for item in parser.links if item.get("rel") == "apple-touch-icon"]
                theme = [item for item in parser.metas if item.get("name") == "theme-color"]
                capable = [item for item in parser.metas if item.get("name") == "apple-mobile-web-app-capable"]
                viewport = [item for item in parser.metas if item.get("name") == "viewport"]
                self.assertEqual(1, len(manifest_links))
                self.assertTrue(manifest_links[0]["href"].startswith("manifest.webmanifest"))
                self.assertEqual(1, len(apple_icons))
                self.assertTrue(apple_icons[0]["href"].startswith("icons/icon-192.png"))
                self.assertEqual(["#173629"], [item.get("content") for item in theme])
                self.assertEqual(["yes"], [item.get("content") for item in capable])
                self.assertEqual(1, len(viewport))
                self.assertIn("viewport-fit=cover", viewport[0].get("content", ""))

    def test_release_version_is_aligned_across_offline_assets(self):
        version = (ROOT / "version.txt").read_text(encoding="utf-8").strip()
        self.assertEqual("20260930-51", version)
        for filename in HTML_FILES:
            source = (ROOT / filename).read_text(encoding="utf-8")
            self.assertEqual([version], re.findall(r'APP_VERSION="([0-9-]+)"', source), filename)
            query_versions = re.findall(r'(?:src|href)="[^"?]+\?v=([0-9-]+)"', source)
            self.assertTrue(query_versions, filename)
            self.assertEqual({version}, set(query_versions), filename)
        worker = (ROOT / "service-worker.js").read_text(encoding="utf-8")
        self.assertEqual([version], re.findall(r"const APP_VERSION = '([0-9-]+)'", worker))
        self.assertIn(version, (ROOT / "README.md").read_text(encoding="utf-8"))


if __name__ == "__main__":
    unittest.main()
