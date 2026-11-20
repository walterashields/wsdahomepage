# Production verification, 2026-11-20

Live site checked in the built-in browser (same-origin fetches of each URL, SHA-256 of the decoded bytes; the
GitHub copy fetched from raw.githubusercontent.com and compared line by line).

| File | GitHub `main` vs live | Action | Package vs live |
|---|---|---|---|
| index.html | differs: GTM-W9KRWMZ8 (3 places); "20+" -> "25+" years (4 lines) | rebuilt from live diff | identical, sha256 7064840b…56c1 |
| about.html | differs: GTM (3); "25+ years" (3 lines); corporate-training block now points to Team Pilots (pricing tags, market stats and "unfair advantage" paragraph removed live) | rebuilt from live diff | identical, sha256 534fff3d…d4fb |
| contact.html | differs: GTM only (3) | rebuilt | identical, sha256 ddb52f37…8e5e |
| teams.html | differs: GTM (3); "25+ years"; pilot size "5 to 25 analysts over about six weeks"; industries list | rebuilt | identical, sha256 4bd5fff6…46a5 |
| teams/thank-you.html | differs: GTM only (3) | rebuilt | identical, sha256 80c75c7f…f9ab |
| robots.txt, sitemap.xml | identical | none | identical |
| assets/teams/* (6 files) | identical | none | identical |
| _redirects | not served by Pages; behaviour verified (/pages/ai-data-analyst -> learn.wsdalearning.ai) | kept from repo | unchanged |
| _headers | production has none (only Pages default headers observed) | new: noindex for /software-coach only | new |

Live tracking: GTM-W9KRWMZ8 loads, and through it GA4 G-QSX0D1LGHW and the LinkedIn Insight tag.
Live routing: unknown paths (including /software-coach today) return the homepage with status 200.
Full per-file list with SHA-256: PACKAGE-MANIFEST.tsv.
