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
    coach_video_play     first play of a demo video (video_id, video_title, video_app, video_location)
    coach_video_complete a demo video played to the end (same parameters)

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

  // Demo videos: any <video> on the page reports play (once) and completion. Title and app come from
  // data attributes on the video or its carousel slide.
  Array.prototype.forEach.call(document.querySelectorAll("video"), function (v) {
    if (v.autoplay && v.muted) return; // decorative loops are not demo views
    var slide = v.closest ? v.closest(".demo-slide") : null;
    var info = {
      video_id: v.getAttribute("data-video-id") || (slide && slide.getAttribute("data-video-id")) || "",
      video_title: v.getAttribute("data-video-title") || "",
      video_app: v.getAttribute("data-video-app") || "",
      video_location: slide ? "carousel" : "featured"
    };
    var played = false, completed = false;
    v.addEventListener("play", function () {
      if (played) return; played = true;
      var e = { event: "coach_video_play" }; for (var k in info) e[k] = info[k]; dl.push(e);
    });
    v.addEventListener("ended", function () {
      if (completed) return; completed = true;
      var e = { event: "coach_video_complete" }; for (var k in info) e[k] = info[k]; dl.push(e);
    });
    // Only one demo plays at a time.
    v.addEventListener("play", function () {
      Array.prototype.forEach.call(document.querySelectorAll("video"), function (o) { if (o !== v && !o.paused && !(o.autoplay && o.muted)) o.pause(); });
    });
  });

  // Carousel: arrows move one slide; counter and arrow state follow scrolling. Works with any number of slides.
  var track = document.getElementById("demo-track");
  if (track) {
    var slidesEls = track.querySelectorAll(".demo-slide");
    var prev = document.querySelector('.carousel-btn[data-dir="-1"]');
    var next = document.querySelector('.carousel-btn[data-dir="1"]');
    var count = document.querySelector(".carousel-count");
    function step() { return slidesEls.length > 1 ? slidesEls[1].offsetLeft - slidesEls[0].offsetLeft : track.clientWidth; }
    function update() {
      var max = track.scrollWidth - track.clientWidth - 2;
      var first = Math.round(track.scrollLeft / (step() || 1));
      var visible = Math.max(1, Math.round(track.clientWidth / (step() || 1)));
      var last = Math.min(slidesEls.length, first + visible);
      if (prev) prev.disabled = track.scrollLeft <= 2;
      if (next) next.disabled = track.scrollLeft >= max;
      if (count) count.textContent = slidesEls.length > visible ? (first + 1) + (last > first + 1 ? "–" + last : "") + " of " + slidesEls.length : "";
    }
    [prev, next].forEach(function (b) {
      if (!b) return;
      b.addEventListener("click", function () { track.scrollBy({ left: step() * Number(b.getAttribute("data-dir")), behavior: "smooth" }); });
    });
    track.addEventListener("keydown", function (e) {
      if (e.target !== track) return;
      if (e.key === "ArrowRight") { e.preventDefault(); track.scrollBy({ left: step(), behavior: "smooth" }); }
      if (e.key === "ArrowLeft") { e.preventDefault(); track.scrollBy({ left: -step(), behavior: "smooth" }); }
    });
    var t;
    track.addEventListener("scroll", function () { clearTimeout(t); t = setTimeout(update, 60); }, { passive: true });
    window.addEventListener("resize", update);
    update();
  }

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
