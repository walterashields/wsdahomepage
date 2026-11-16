# WSDA Software Coach landing page: launch and tracking setup

Page: `wsda-deploy/software-coach.html` → `https://wsdalearning.ai/software-coach`
Assets: `wsda-deploy/assets/software-coach/` (own CSS, JS, logo copy, OG image). No existing page or asset was changed.

The page is **not launch-ready until every item in section 1 is done**. Both the signup and the analytics are switched off by design until the real IDs are in place.

## 1. What Walter needs to provide or configure

| # | Item | Where | What to do with it |
|---|---|---|---|
| 1 | **Klaviyo list ID** for a new list "Software Coach Beta" | Klaviyo > Audience > Lists & segments > Create list. The 6-character ID is in the list URL or Settings. | Replace `data-klaviyo-list="XXXXXX"` in `software-coach.html`. Until then the form refuses to send and shows "Signups aren't open yet." |
| 2 | **Klaviyo list opt-in setting** | That list > Settings > Single or double opt-in | Decide. Double opt-in filters fake addresses but adds a confirmation email; single opt-in is lower friction. The page copy works with either. |
| 3 | **GTM container ID** (`GTM-XXXXXXX`) | tagmanager.google.com | Replace `GTM-XXXXXXX` in `software-coach.html` (2 spots). The same placeholder is still in `index.html`, `about.html`, `contact.html`, `teams.html`, `teams/thank-you.html`, so **no page on the site is measured today**. |
| 4 | **GA4 Measurement ID** (`G-…`) | GA4 > Admin > Data streams > Web | Used by the Google tag inside GTM. |
| 5 | **LinkedIn Insight Tag Partner ID** | Campaign Manager > Analyze > Insight Tag | Used by the LinkedIn tag inside GTM. |
| 6 | Product footage | App Development 3 / screen recording | Hero loop, the featured 45–60 s demo, and the carousel demos (title + application name each). Replace the `data-placeholder` figures; instructions are in HTML comments. Add a carousel demo by copying one `<li class="demo-slide">`. Real recordings only, with captions. |
| 7 | Privacy Policy, Terms of Use, Beta participation text | Legal / App Development 3 | Replace the placeholders in `software-coach/privacy.html`, `terms.html`, `beta.html`. Anything about screen data, AI processing, retention or security must be verified with App Development 3. |
| 8 | Capability confirmation | App Development 3 | Confirm macOS-only is current, and that the four example requests in "Made for everyday moments" (first SQL query, sales report, finding settings, saving as PDF) and the chatbot comparison match the current beta. |

## 2. What the page sends

**Klaviyo** (on submit, browser → `a.klaviyo.com/client/subscriptions`, revision 2024-10-15, public key `Xq8cpH`):
- email (lowercased), added to the beta list with email marketing consent
- `custom_source = software_coach_beta`
- profile properties: `signup_source`, `signup_at` (ISO timestamp), `signup_utm_source|medium|campaign|content|term`, `signup_landing_page`, `signup_referrer`

Klaviyo keeps one profile per email, so a repeat signup does not create a duplicate. The page also remembers signups in the browser and shows "You're already on the list" without re-sending. Bot protection: hidden honeypot field, submits under 1.5 s after load are dropped, max 5 attempts per page load.

**dataLayer events** (no email ever goes to the dataLayer):

| Event | When | Parameters |
|---|---|---|
| `coach_page_view` | page load | `page_type`, `utm_*`, `landing_page`, `referring_url` |
| `coach_cta_click` | any primary CTA | `cta_id` (`nav_join_beta`, `hero_join_beta`, `hero_watch_demo`, `form_submit`), `cta_text`, `cta_location` |
| `coach_form_start` | first interaction with the form | `form_id` |
| `generate_lead` | **only after Klaviyo returns 2xx** | `form_id=software_coach_beta`, `lead_type=software_coach_beta`, `utm_*`, `landing_page`, `referring_url` |
| `coach_signup_error` | a failed attempt | `error_type` (`invalid_email`, `not_configured`, `rate_limited`, `network`, `http_<status>`) |
| `coach_video_play` | first play of a demo video | `video_id`, `video_title`, `video_app`, `video_location` (`featured` or `carousel`) |
| `coach_video_complete` | a demo video plays to the end | same as above |

`generate_lead` is shared with the Teams page; tell them apart with `lead_type` (`team_pilot` vs `software_coach_beta`).

## 3. GTM configuration

Variables (Data Layer Variable v2): `video_id`, `video_title`, `video_app`, `video_location`, `cta_id`, `cta_text`, `cta_location`, `form_id`, `lead_type`, `error_type`, `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term`, `landing_page`, `referring_url`.

Triggers (Custom Event): `coach_page_view`, `coach_cta_click`, `coach_form_start`, `generate_lead`, `coach_signup_error`, `coach_video_play`, `coach_video_complete`. Add a second trigger **Software Coach lead** = Custom Event `generate_lead` where `lead_type` equals `software_coach_beta`.

Tags:
1. Google tag (GA4 Measurement ID), trigger Initialization - All Pages.
2. One GA4 Event tag per custom event, parameters from the variables above.
3. LinkedIn Insight Tag (Community Template "LinkedIn Insight"), Partner ID, All Pages.
4. LinkedIn conversion: in Campaign Manager create a conversion (type Lead, method "Event-specific"), then a GTM LinkedIn tag firing that conversion ID on the **Software Coach lead** trigger. (There is no thank-you URL; the confirmation is shown on the page.)

Publish, then in GTM Preview confirm: `coach_page_view` carries UTMs; `generate_lead` fires once per real signup; a CTA click alone never fires it.

## 4. GA4 configuration

1. Admin > Events: mark `generate_lead` as a **key event**.
2. Admin > Custom definitions, event-scoped: `cta_id`, `cta_location`, `form_id`, `lead_type`, `error_type`, `video_id`, `video_title`, `video_app`, `video_location`.
3. Primary metric (visitor → beta signup): Exploration filtered to page path `/software-coach`, users with `coach_page_view` vs users with `generate_lead` where `lead_type = software_coach_beta`, broken down by session source / medium / campaign.

## 5. End-to-end launch test

1. Open `https://wsdalearning.ai/software-coach?utm_source=linkedin&utm_medium=social&utm_campaign=coach_beta_test&utm_content=test` with GTM Preview on.
2. Sign up with a test address. Confirm: on-page "You're on the list", `generate_lead` in Preview, GA4 DebugView shows the event, the profile appears in the Klaviyo beta list with `signup_utm_campaign = coach_beta_test` and a `signup_at` timestamp.
3. Submit the same address again: "You're already on the list", no second Klaviyo request.
4. Delete the test profile from Klaviyo.

## 6. Going public (only after Walter approves)

1. `software-coach.html`: change `<meta name="robots">` to `index, follow`.
2. `_headers`: remove the two `/software-coach` rules.
3. Legal pages: change their robots meta to `index, follow` once the real text is in.
4. `sitemap.xml`: add `https://wsdalearning.ai/software-coach`.
5. Search Console: request indexing for the URL.
