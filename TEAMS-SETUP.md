# WSDA for Teams: launch and tracking setup

The page code lives in this repo. Everything below needs Walter's own Google and LinkedIn accounts.

## 1. What Walter needs to provide

| Item | Where to find it | Used for |
|---|---|---|
| GTM container ID (`GTM-XXXXXXX`) | tagmanager.google.com, create a Web container for wsdalearning.ai | Replace `GTM-XXXXXXX` in `teams.html`, `teams/thank-you.html`, `index.html`, `about.html`, `contact.html` (2 spots each). The snippet does nothing until replaced. |
| GA4 Measurement ID (`G-XXXXXXXXXX`) | GA4 > Admin > Data streams > Web | GA4 Google tag inside GTM |
| LinkedIn Partner ID | Campaign Manager > Analyze > Insight Tag | LinkedIn Insight Tag inside GTM |
| Formspree form | formspree.io (current site form is `xlgvonak`) | The Teams form posts there today with `inquiry=team-pilot`. A separate Formspree form for Teams is cleaner; swap the `action` URL if you create one. |

## 2. Events the page sends to the dataLayer

| Event | When | Parameters |
|---|---|---|
| `teams_page_view` | `/teams` loads | `page_type`, `utm_*`, `landing_page`, `referring_url` |
| `teams_cta_click` | any primary CTA click | `cta_id`, `cta_text`, `cta_location` |
| `teams_form_start` | first interaction with the form | `form_id` |
| `generate_lead` | only after Formspree confirms the submission | `form_id`, `lead_type`, `team_size`, `utm_*`, `landing_page`, `referring_url` |
| `teams_thank_you_view` | `/teams/thank-you` loads | `page_type`, `lead_confirmed`, `utm_*` |

CTA ids: `nav_request_pilot`, `hero_request_pilot`, `hero_explore_program`, `curriculum_request_pilot`, `pilot_request_pilot`, `outcomes_request_pilot`, `authority_request_pilot`, `form_submit`.

No names, emails or company names go to the dataLayer. UTMs, landing page and referrer are also sent with the form, so they show up in the lead email.

## 3. GTM configuration

Variables (Data Layer Variable, version 2): `cta_id`, `cta_text`, `cta_location`, `form_id`, `lead_type`, `team_size`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `landing_page`, `referring_url`, `lead_confirmed`.

Triggers (Custom Event): one each for `teams_page_view`, `teams_cta_click`, `teams_form_start`, `generate_lead`, `teams_thank_you_view`.

Tags:
1. **Google tag** with the GA4 Measurement ID, trigger Initialization - All Pages.
2. **GA4 Event** tags, one per custom event, event name = the trigger's event name, parameters from the variables above.
3. **LinkedIn Insight Tag** (Community Template "LinkedIn Insight"), Partner ID, trigger All Pages.

Publish, then check in GTM Preview that `generate_lead` fires once per real submission and a CTA click alone never fires it.

## 4. GA4 configuration

1. Admin > Events: mark `generate_lead` as a **key event**. Do not mark `teams_cta_click`.
2. Admin > Custom definitions: add event-scoped dimensions `cta_id`, `cta_location`, `form_id`, `team_size`, `lead_type`. Source/medium/campaign come from GA4's built-in attribution.
3. Optional: an Exploration filtered to `page_path = /teams` comparing `teams_cta_click` by `cta_id`.

## 5. LinkedIn configuration

1. Confirm the Insight Tag shows "Active" for wsdalearning.ai after publishing GTM.
2. Conversion: Campaign Manager > Analyze > Conversion tracking > Create conversion > Insight Tag, **URL match: "starts with" `https://wsdalearning.ai/teams/thank-you`**, type Lead.
3. Retargeting audience: Plan > Audiences > Create > Website, URL **contains** `/teams`. LinkedIn needs 300+ matched members before it can serve.

## 6. Search

1. Search Console: add `wsdalearning.ai` (Domain property), submit `https://wsdalearning.ai/sitemap.xml`, then URL Inspection on `https://wsdalearning.ai/teams` > Request indexing.
2. The thank-you page is `noindex` and stays out of the sitemap.

## 7. UTM check after deploy

`https://wsdalearning.ai/teams?utm_source=linkedin&utm_medium=paid_social&utm_campaign=teams_pilot&utm_content=test` should load without losing the query string, and the parameters should appear in GTM Preview on `teams_page_view`. Also try `www.wsdalearning.ai/teams?...`, since the site links use `www` while the canonical is the bare domain.
