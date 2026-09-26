from html.parser import HTMLParser
from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]


class TripPageParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.nav_buttons = []
        self.more_tabs = []
        self.more_subpages = []
        self.top_level_pages = []
        self.contact_navigation_labels = []
        self.contact_call_count = 0
        self.telephone_link_count = 0
        self.overview_days = []
        self.pickup_departure_count = 0
        self.pickup_route_section_count = 0
        self.pickup_route_link_count = 0
        self.overview_tag_count = 0
        self._overview_day = None
        self._capture = None

    @staticmethod
    def _classes(attrs):
        return set(attrs.get("class", "").split())

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        classes = self._classes(attrs)
        inside_nav = any(item[0] == "nav" and "nav" in item[2] for item in self.stack)
        inside_more = any(item[1].get("id") == "more" for item in self.stack)
        inside_contact_actions = any(
            item[0] == "div" and "contact-actions" in item[2]
            for item in self.stack
        )

        if tag == "button" and inside_nav and "tab-btn" in classes:
            self._capture = {
                "kind": "nav",
                "depth": len(self.stack) + 1,
                "attrs": attrs,
                "text": [],
            }
        elif tag == "button" and inside_more and "seg" in classes:
            self._capture = {
                "kind": "tab",
                "depth": len(self.stack) + 1,
                "attrs": attrs,
                "text": [],
            }
        elif tag == "a" and inside_contact_actions:
            self._capture = {
                "kind": "contact-nav",
                "depth": len(self.stack) + 1,
                "attrs": attrs,
                "text": [],
            }
        elif tag == "div" and "overview-line" in classes and self._overview_day is not None:
            self._capture = {
                "kind": "overview-line",
                "depth": len(self.stack) + 1,
                "attrs": attrs,
                "text": [],
                "day": self._overview_day,
            }

        if tag == "a" and "contact-call" in classes:
            self.contact_call_count += 1
        if tag == "a" and attrs.get("href", "").startswith("tel:"):
            self.telephone_link_count += 1

        if tag == "a" and "overview-day" in classes:
            self._overview_day = []
            self.overview_days.append(self._overview_day)
        if tag == "p" and "pickup-depart" in classes:
            self.pickup_departure_count += 1
        if tag == "span" and "overview-tag" in classes:
            self.overview_tag_count += 1
        if tag == "section" and "pickup-routes" in classes:
            self.pickup_route_section_count += 1
        if tag == "a" and any(
            item[0] == "section" and "pickup-routes" in item[2]
            for item in self.stack
        ):
            self.pickup_route_link_count += 1

        if tag == "div" and "page" in classes:
            self.top_level_pages.append(attrs.get("id"))
        if tag == "div" and inside_more and "subpage" in classes:
            self.more_subpages.append(
                {"id": attrs.get("id"), "active": "active" in classes}
            )

        self.stack.append((tag, attrs, classes))

    def handle_data(self, data):
        if self._capture:
            self._capture["text"].append(data)

    def handle_endtag(self, tag):
        if self._capture and self._capture["depth"] == len(self.stack):
            self._capture["text"] = " ".join(
                " ".join(self._capture["text"]).split()
            )
            if self._capture["kind"] == "nav":
                target = self.nav_buttons
            elif self._capture["kind"] == "tab":
                target = self.more_tabs
            elif self._capture["kind"] == "overview-line":
                target = self._capture["day"]
            else:
                target = self.contact_navigation_labels
            target.append(self._capture)
            self._capture = None

        if tag == "a" and self.stack and "overview-day" in self.stack[-1][2]:
            self._overview_day = None

        if self.stack:
            self.stack.pop()


class FooterNavigationTest(unittest.TestCase):
    CASES = (
        ("fukuoka-golf.html", "更多", ["總覽", "飯店", "行李"]),
        ("fukuoka-golf-v2.html", "更多", ["總覽", "飯店", "行李"]),
        ("fukuoka-golf-en.html", "More", ["Overview", "Hotels", "Packing"]),
    )

    def parse(self, filename):
        parser = TripPageParser()
        parser.feed((ROOT / filename).read_text(encoding="utf-8"))
        return parser

    def test_footer_has_five_days_and_one_more_destination(self):
        for filename, more_label, _ in self.CASES:
            with self.subTest(filename=filename):
                page = self.parse(filename)
                self.assertEqual(6, len(page.nav_buttons))
                self.assertEqual(
                    ["D1", "D2", "D3", "D4", "D5"],
                    [button["text"][:2] for button in page.nav_buttons[:5]],
                )
                self.assertEqual(more_label, page.nav_buttons[-1]["text"])
                self.assertIn("switchPage('more',this)", page.nav_buttons[-1]["attrs"]["onclick"])

    def test_more_flattens_overview_hotels_and_packing_into_peer_tabs(self):
        for filename, _, tab_labels in self.CASES:
            with self.subTest(filename=filename):
                page = self.parse(filename)
                self.assertEqual(
                    ["day1", "day2", "day3", "day4", "day5", "more"],
                    page.top_level_pages,
                )
                self.assertEqual(tab_labels, [tab["text"] for tab in page.more_tabs])
                subpages = {item["id"]: item["active"] for item in page.more_subpages}
                self.assertEqual(
                    {"overview": True, "hotels": False, "packing": False},
                    subpages,
                )

    def test_restaurant_navigation_buttons_match_hotel_google_maps_pattern(self):
        expected = {
            "fukuoka-golf.html": "Google Maps 導航",
            "fukuoka-golf-v2.html": "Google Maps 導航",
            "fukuoka-golf-en.html": "Open in Google Maps",
        }
        for filename, label in expected.items():
            with self.subTest(filename=filename):
                page = self.parse(filename)
                self.assertEqual(4, len(page.contact_navigation_labels))
                self.assertEqual(
                    [label] * 4,
                    [item["text"] for item in page.contact_navigation_labels],
                )
                self.assertTrue(
                    all(
                        "v2-nav-button" in item["attrs"].get("class", "").split()
                        for item in page.contact_navigation_labels
                    )
                )

    def test_restaurant_contacts_keep_navigation_without_phone_actions(self):
        for filename, _, _ in self.CASES:
            with self.subTest(filename=filename):
                page = self.parse(filename)
                self.assertEqual(4, len(page.contact_navigation_labels))
                self.assertEqual(0, page.contact_call_count)
                self.assertEqual(0, page.telephone_link_count)

    def test_english_historical_weather_label_is_compact(self):
        html = (ROOT / "fukuoka-golf-en.html").read_text(encoding="utf-8")
        script = (ROOT / "fukuoka-golf-en-v2.js").read_text(encoding="utf-8")
        self.assertEqual(5, html.count(">(Historical)</span>"))
        self.assertNotIn("Historical temperature reference", html)
        self.assertNotIn("Historical temperature reference", script)

    def test_dress_code_requires_a_jacket_on_day_two_in_both_languages(self):
        english_html = (ROOT / "fukuoka-golf-en.html").read_text(encoding="utf-8")
        english_script = (ROOT / "fukuoka-golf-en-v2.js").read_text(encoding="utf-8")
        chinese_html = (ROOT / "fukuoka-golf.html").read_text(encoding="utf-8")
        chinese_v2_html = (ROOT / "fukuoka-golf-v2.html").read_text(encoding="utf-8")
        chinese_script = (ROOT / "fukuoka-golf-v2.js").read_text(encoding="utf-8")

        self.assertIn("Wear a jacket or suit on arrival.", english_html)
        self.assertGreaterEqual(
            english_script.count("Wear a jacket or suit on arrival."), 2
        )
        self.assertIn("抵達時請穿著夾克或西裝。", chinese_html)
        self.assertIn("抵達時請穿著夾克或西裝。", chinese_v2_html)
        self.assertGreaterEqual(chinese_script.count("抵達時請穿著夾克或西裝。"), 2)

    def test_dress_code_has_no_seasonal_jacket_exception(self):
        files = (
            "fukuoka-golf-en.html",
            "fukuoka-golf-en-v2.js",
            "fukuoka-golf.html",
            "fukuoka-golf-v2.html",
            "fukuoka-golf-v2.js",
        )
        forbidden = (
            "except June",
            "outside summer season",
            "6～9 月除外",
            "6-9 月除外",
            "本次 11 月適用",
            "夏季以外",
        )
        for filename in files:
            content = (ROOT / filename).read_text(encoding="utf-8")
            for phrase in forbidden:
                with self.subTest(filename=filename, phrase=phrase):
                    self.assertNotIn(phrase, content)

    def test_overview_folds_departure_recommendations_into_main_events(self):
        expected = {
            "fukuoka-golf.html": [
                [
                    "08:00 BR106 台北起飛，11:15 抵達福岡",
                    "午後 午餐後前往飯店，15:00 後入住；市區觀光",
                    "18:00 宮中 別邸｜燒肉（建議麗思 17:20 出發）",
                ],
                [
                    "11:06 兩組開球 11:06 / 11:14；不休息連續打球（建議麗思 09:10 出發）",
                    "18:00 Chinpunkampun Hakata（建議麗思 17:15 出發）",
                ],
                [
                    "全天 優先：雷山千如寺、櫻井二見浦、PALM BEACH",
                    "17:30 壽喜燒 山翔｜每人 ¥10,000 含暢飲（建議 16:00 前從糸島最後一站出發）",
                ],
                [
                    "10:00 兩組開球 10:00 / 10:08（建議麗思 07:55 出發）",
                    "18:00 水炊 長野｜雞肉火鍋（建議麗思 17:20 出發）",
                ],
                [
                    "10:08 兩組開球 10:08 / 10:16（建議麗思 07:50 出發）",
                    "球後 全員先到福岡機場，再送 2 位返回麗思",
                    "20:55 BR101 福岡起飛，22:40 抵達台北",
                ],
            ],
            "fukuoka-golf-en.html": [
                [
                    "08:00 BR106 departs Taipei; arrives Fukuoka 11:15",
                    "PM Lunch, hotel after 15:00, then city sightseeing",
                    "18:00 Miyanaka Bettei | Yakiniku (suggested Ritz departure: 17:20)",
                ],
                [
                    "11:06 Tee times 11:06 / 11:14; through play (suggested Ritz departure: 09:10)",
                    "18:00 Chinpunkampun Hakata (suggested Ritz departure: 17:15)",
                ],
                [
                    "Day Priority: Raizan Sennyoji, Sakurai Futamigaura and PALM BEACH",
                    "17:30 Sukiyaki Yamashou | ¥10,000 with drinks (leave the final Itoshima stop by 16:00)",
                ],
                [
                    "10:00 Tee times 10:00 / 10:08 (suggested Ritz departure: 07:55)",
                    "18:00 Mizutaki Nagano | Chicken hot pot (suggested Ritz departure: 17:20)",
                ],
                [
                    "10:08 Tee times 10:08 / 10:16 (suggested Ritz departure: 07:50)",
                    "After Airport first, then 2 guests return to the Ritz",
                    "20:55 BR101 departs Fukuoka; arrives Taipei 22:40",
                ],
            ],
        }

        for filename, expected_days in expected.items():
            with self.subTest(filename=filename):
                page = self.parse(filename)
                actual_days = [
                    [line["text"] for line in day]
                    for day in page.overview_days
                ]
                self.assertEqual(expected_days, actual_days)

    def test_hotel_tab_removes_transport_route_sections(self):
        for filename in ("fukuoka-golf.html", "fukuoka-golf-en.html"):
            with self.subTest(filename=filename):
                page = self.parse(filename)
                self.assertEqual(0, page.pickup_route_section_count)
                self.assertEqual(0, page.pickup_route_link_count)
                self.assertEqual(0, page.pickup_departure_count)

    def test_overview_removes_category_badges(self):
        for filename in ("fukuoka-golf.html", "fukuoka-golf-en.html"):
            with self.subTest(filename=filename):
                page = self.parse(filename)
                self.assertEqual(0, page.overview_tag_count)


if __name__ == "__main__":
    unittest.main()
