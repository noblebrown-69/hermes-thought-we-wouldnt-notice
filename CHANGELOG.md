# Changelog

## 0.1.7

- The dashboard hero loads `assets/banner.jpg` through the authenticated plugin API (`authedFetch` plus `?profile=`), so the art shows on a profile-local install instead of the placeholder card.
- `python3 -m pytest` from the plugin root works: `pytest.ini` limits collection to `tests/`, and `__init__.py` can be imported when pytest treats the plugin root as a package.

## 0.1.6

- Official Neo Tokyo banners in both catalog sizes: `assets/banner.jpg` is the 16:9 (1280×720) dashboard hero, and `assets/catalog.jpg` is the 2:1 (1200×600) catalog cover. The plugin name is the caption; Top Sails stays a small easter egg on the cabinet.

## 0.1.5

- Top Sails scales as a percentage of the Desktop window, using the real cabinet size, so the right edge and hint stay visible on any monitor.

## 0.1.4

- The Desktop dialog sizes the cabinet to the window and hugs that size, so Top Sails stays large and does not sit in a tiny strip over a tall empty frame.

## 0.1.3

- Top Sails scales itself to the Desktop window or dashboard overlay so the cabinet fits without a scrollbar.

## 0.1.2

- The Desktop popup carries the cabinet page in the quarter event, so Top Sails opens even when the web dashboard API is not in the launch profile.


## 0.1.1

- A quarter in Desktop chat opens Top Sails over the window. Esc or Close dismisses it and returns to the composer.
- The web dashboard tab, Play Top Sails button, banner, and wider shot lane stay as they were.

## 0.1.0

- First hackathon cut.
- A message that is only a quarter is swallowed on `pre_llm_call` and rings the dashboard cabinet.
- Original fixed shooter, Top Sails: three short waves, geometric bugs, synthesized tones.
- Dashboard tab with a short intro, Play Top Sails, and the cabinet on the same page.
- Official banner at `assets/banner.jpg`, served to the hero and at `GET /banner`.
