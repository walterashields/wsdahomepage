/*
  WSDA Software Coach landing page: measurement + beta signup.
  Pushes dataLayer events for Google Tag Manager (mapped to GA4 and LinkedIn in GTM).
  Email addresses are never pushed to the dataLayer.

  Events
    coach_page_view      page load (utm_*, landing_page, referring_url)
    coach_cta_click      any element with data-cta-id (cta_id, cta_text, cta_location)
    coach_form_start     first interaction with the signup form, once per page load
    generate_lead        only after Klaviyo accepts the signup (lead_type=software_coach_beta)
    coach_signup_error   a signup attempt failed (error_type only)

  Signup goes to Klaviyo's client subscriptions endpoint, list set in the form's data-klaviyo-list.
*/
(function () {
  "use strict";
  window.dataLayer = window.dataLayer || [];
  var dl = window.dataLayer;

  var SOURCE = "software_coach_beta";
  var ATTR_KEY = "wsda_coach_attribution";
  var DONE_KEY = "wsda_coach_signups";
  var UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
  var MIN_FILL_MS = 1500;   // faster than this from page load is treated as a bot
  var MAX_ATTEMPTS = 5;     // per page load
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function storage(kind) { try { var s = window[kind]; s.getItem("x"); return s; } catch (e) { return null; } }
  function read(kind, key) { var s = storage(kind); if (!s) return null; try { return JSON.parse(s.getItem(key) || "null"); } catch (e) { return null; } }
  function write(kind, key, val) { var s = storage(kind); if (!s) return; try { s.setItem(key, JSON.stringify(val)); } catch (e) {} }

  // Attribution: first landing in a session wins, unless a new visit arrives with fresh UTMs.
  function attribution() {
    var params = new URLSearchParams(window.location.search);
    var hasUtm = UTM_KEYS.some(function (k) { return params.get(k); });
    var saved = read("sessionStorage", ATTR_KEY);
    if (saved && !hasUtm) return saved;
    var a = {};
    UTM_KEYS.forEach(function (k) { a[k] = (params.get(k) || "").slice(0, 200); });
    a.landing_page = (window.location.pathname + window.location.search).slice(0, 500);
    a.referrer = (document.referrer || "").slice(0, 500);
    write("sessionStorage", ATTR_KEY, a);
    return a;
  }
  function withAttribution(obj) {
    var a = attribution();
    UTM_KEYS.forEach(function (k) { obj[k] = a[k]; });
    obj.landing_page = a.landing_page;
    obj.referring_url = a.referrer;
    return obj;
  }

  // A short, non-reversible fingerprint so a repeat signup from this browser is recognised
  // without storing the address itself.
  function fingerprint(email) {
    var h = 5381;
    for (var i = 0; i < email.length; i++) { h = ((h << 5) + h + email.charCodeAt(i)) >>> 0; }
    return h.toString(36);
  }
  function alreadySignedUp(email) { var list = read("localStorage", DONE_KEY) || []; return list.indexOf(fingerprint(email)) !== -1; }
  function rememberSignup(email) {
    var list = read("localStorage", DONE_KEY) || [];
    var f = fingerprint(email);
    if (list.indexOf(f) === -1) list.push(f);
    write("localStorage", DONE_KEY, list.slice(-10));
  }

  dl.push(withAttribution({ event: "coach_page_view", page_type: "software_coach_landing" }));

  var form = document.getElementById("beta-form");
  var input = document.getElementById("beta-email");

  // CTA clicks. Primary CTAs carry a unique data-cta-id. Jump CTAs also move focus to the email field.
  document.addEventListener("click", function (e) {
    var el = e.target.closest ? e.target.closest("[data-cta-id]") : null;
    if (!el) return;
    dl.push({
      event: "coach_cta_click",
      cta_id: el.getAttribute("data-cta-id"),
      cta_text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 100),
      cta_location: el.getAttribute("data-cta-location") || ""
    });
    if (el.getAttribute("href") === "#join" && input && !form.hidden) {
      setTimeout(function () { try { input.focus({ preventScroll: true }); } catch (err) { input.focus(); } }, 450);
    }
  });

  if (!form || !input) return;

  var loadedAt = Date.now();
  var attempts = 0;
  var sending = false;
  var msg = document.getElementById("beta-msg");
  var button = form.querySelector('button[type="submit"]');
  var success = document.getElementById("beta-success");
  var honeypot = form.querySelector('input[name="website"]');
  var company = form.getAttribute("data-klaviyo-company") || "";
  var listId = form.getAttribute("data-klaviyo-list") || "";
  var preview = form.getAttribute("data-preview") === "true";
  var configured = /^[A-Za-z0-9]{6}$/.test(company) && /^[A-Za-z0-9]{6}$/.test(listId) && !/X{4}/.test(listId);

  var started = false;
  function onStart() {
    if (started) return;
    started = true;
    dl.push({ event: "coach_form_start", form_id: "software_coach_beta" });
  }
  form.addEventListener("focusin", onStart);
  form.addEventListener("input", onStart);
  input.addEventListener("input", function () { input.removeAttribute("aria-invalid"); msg.textContent = ""; });

  function showError(text, type) {
    msg.textContent = text;
    if (type) dl.push({ event: "coach_signup_error", form_id: "software_coach_beta", error_type: type });
  }
  function showSuccess(title) {
    form.hidden = true;
    if (title) document.getElementById("beta-success-title").textContent = title;
    success.hidden = false;
    success.focus();
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    if (sending) return;

    var email = (input.value || "").trim().toLowerCase();
    if (!EMAIL_RE.test(email) || email.length > 254) {
      input.setAttribute("aria-invalid", "true");
      showError("Please enter a valid email address.", "invalid_email");
      input.focus();
      return;
    }

    // Bots: fill the hidden field or submit instantly. Look successful, send nothing.
    if ((honeypot && honeypot.value) || Date.now() - loadedAt < MIN_FILL_MS) { showSuccess(); return; }

    if (alreadySignedUp(email)) { showSuccess("You're already on the list."); return; }

    if (++attempts > MAX_ATTEMPTS) { showError("Too many attempts. Please refresh the page and try again.", "rate_limited"); return; }

    if (!configured && !preview) {
      if (window.console) console.warn("Software Coach signup: set data-klaviyo-list on #beta-form to the beta list ID.");
      showError("Signups aren't open yet. Please check back soon.", "not_configured");
      return;
    }

    var a = attribution();
    var properties = {
      signup_source: SOURCE,
      signup_at: new Date().toISOString(),
      signup_landing_page: a.landing_page,
      signup_referrer: a.referrer
    };
    UTM_KEYS.forEach(function (k) { properties["signup_" + k] = a[k]; });

    sending = true;
    msg.textContent = "";
    button.disabled = true;
    var label = button.textContent;
    button.textContent = "Joining…";

    var request = preview
      ? new Promise(function (resolve) { setTimeout(function () { resolve({ ok: true, status: 202 }); }, 600); })
      : fetch("https://a.klaviyo.com/client/subscriptions/?company_id=" + encodeURIComponent(company), {
          method: "POST",
          headers: { "Content-Type": "application/vnd.api+json", "Accept": "application/vnd.api+json", "revision": "2024-10-15" },
          body: JSON.stringify({
            data: {
              type: "subscription",
              attributes: {
                custom_source: SOURCE,
                profile: { data: { type: "profile", attributes: {
                  email: email,
                  properties: properties,
                  subscriptions: { email: { marketing: { consent: "SUBSCRIBED" } } }
                } } }
              },
              relationships: { list: { data: { type: "list", id: listId } } }
            }
          })
        });

    request.then(function (res) {
      if (!res.ok) throw new Error("status " + res.status);
      rememberSignup(email);
      dl.push(withAttribution({ event: "generate_lead", form_id: "software_coach_beta", lead_type: SOURCE }));
      showSuccess();
    }).catch(function (err) {
      sending = false;
      button.disabled = false;
      button.textContent = label;
      var status = err && /status (\d+)/.exec(err.message);
      showError("Something went wrong. Please try again in a moment.", status ? "http_" + status[1] : "network");
    });
  });
})();
