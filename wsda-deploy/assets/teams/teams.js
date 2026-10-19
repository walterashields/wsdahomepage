/*
  WSDA for Teams: measurement + lead form.
  Pushes dataLayer events for Google Tag Manager. GTM maps them to GA4 and LinkedIn.
  No names, emails or company names are ever pushed to the dataLayer.

  Events
    teams_page_view       on load of /teams
    teams_cta_click       any element with data-cta-id (cta_id, cta_text, cta_location)
    teams_form_start      first interaction with the pilot form (once per page load)
    generate_lead         only after the form endpoint confirms the submission
    teams_thank_you_view  on load of /teams/thank-you
*/
(function () {
  "use strict";
  window.dataLayer = window.dataLayer || [];
  var dl = window.dataLayer;

  var ATTR_KEY = "wsda_teams_attribution";
  var LEAD_KEY = "wsda_teams_lead";
  var UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];

  function store(kind) {
    try { return window[kind]; } catch (e) { return null; }
  }
  function read(kind, key) {
    var s = store(kind);
    if (!s) return null;
    try { return JSON.parse(s.getItem(key) || "null"); } catch (e) { return null; }
  }
  function write(kind, key, val) {
    var s = store(kind);
    if (!s) return;
    try { s.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  // Attribution: the first landing in a session wins, unless a new visit arrives with fresh UTMs.
  function attribution() {
    var params = new URLSearchParams(window.location.search);
    var hasUtm = UTM_KEYS.some(function (k) { return params.get(k); });
    var saved = read("sessionStorage", ATTR_KEY);
    if (saved && !hasUtm) return saved;
    var a = {};
    UTM_KEYS.forEach(function (k) { a[k] = params.get(k) || ""; });
    a.landing_page = window.location.pathname + window.location.search;
    a.referrer = document.referrer || "";
    write("sessionStorage", ATTR_KEY, a);
    return a;
  }

  function withAttribution(obj) {
    var a = attribution();
    obj.utm_source = a.utm_source;
    obj.utm_medium = a.utm_medium;
    obj.utm_campaign = a.utm_campaign;
    obj.utm_content = a.utm_content;
    obj.utm_term = a.utm_term;
    obj.landing_page = a.landing_page;
    obj.referring_url = a.referrer;
    return obj;
  }

  var page = document.body.getAttribute("data-page");

  if (page === "teams") {
    dl.push(withAttribution({ event: "teams_page_view", page_type: "teams_landing" }));

    // CTA clicks. Every primary CTA carries a unique data-cta-id.
    document.addEventListener("click", function (e) {
      var el = e.target.closest ? e.target.closest("[data-cta-id]") : null;
      if (!el) return;
      dl.push({
        event: "teams_cta_click",
        cta_id: el.getAttribute("data-cta-id"),
        cta_text: (el.textContent || "").trim().replace(/\s+/g, " ").slice(0, 100),
        cta_location: el.getAttribute("data-cta-location") || ""
      });
    });

    var form = document.getElementById("team-pilot-form");
    if (form) {
      // Copy attribution into hidden fields so it travels with the inquiry email too.
      var a = attribution();
      Object.keys(a).forEach(function (k) {
        var input = form.querySelector('input[name="' + k + '"]');
        if (input) input.value = a[k];
      });

      var started = false;
      function onStart() {
        if (started) return;
        started = true;
        dl.push({ event: "teams_form_start", form_id: "team_pilot" });
      }
      form.addEventListener("focusin", onStart);
      form.addEventListener("input", onStart);

      var errorEl = document.getElementById("form-error");
      var button = form.querySelector('button[type="submit"]');
      var thankYou = form.getAttribute("data-thank-you") || "/teams/thank-you";

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        if (!form.checkValidity()) { form.reportValidity(); return; }
        if (form.querySelector('input[name="_gotcha"]').value) return;

        errorEl.textContent = "";
        button.disabled = true;
        var label = button.textContent;
        button.textContent = "Sending...";

        fetch(form.action, {
          method: "POST",
          body: new FormData(form),
          headers: { Accept: "application/json" }
        }).then(function (res) {
          if (!res.ok) throw new Error("status " + res.status);
          var teamSize = form.querySelector('[name="team_size"]').value;
          write("sessionStorage", LEAD_KEY, { team_size: teamSize, ts: Date.now() });

          var done = false;
          function go() {
            if (done) return;
            done = true;
            window.location.href = thankYou;
          }
          dl.push(withAttribution({
            event: "generate_lead",
            form_id: "team_pilot",
            lead_type: "team_pilot",
            team_size: teamSize,
            eventCallback: go,
            eventTimeout: 1500
          }));
          // Fallback if GTM is not loaded, so the visitor always reaches the thank-you page.
          setTimeout(go, 1600);
        }).catch(function () {
          button.disabled = false;
          button.textContent = label;
          errorEl.textContent = "Something went wrong sending your request. Please try again, or email via the contact page.";
        });
      });
    }
  }

  if (page === "teams-thank-you") {
    var lead = read("sessionStorage", LEAD_KEY);
    dl.push(withAttribution({
      event: "teams_thank_you_view",
      page_type: "teams_thank_you",
      lead_confirmed: lead ? "yes" : "no"
    }));
  }
})();
