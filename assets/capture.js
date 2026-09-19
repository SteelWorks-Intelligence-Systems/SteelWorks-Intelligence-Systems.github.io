/* capture.js — the ONE lead-capture handler for the whole site.

   Why this exists: on 2026-08-07 the site was posting leads to three different
   endpoints. Measured against the live worker:

     POST /api/lead    -> 400 on an empty body  (EXISTS, validates)
     POST /subscribe   -> 404                   (DEAD — 6 pages used it)
     POST /api/leads   -> 404                   (DEAD — 1 page used it)

   Every lead submitted through those six pages went nowhere, and the visitor was
   shown nothing to suggest it had failed. The worker also expects JSON, while a
   plain <form action> posts form-encoded — so those pages were wrong twice over.

   One handler, one endpoint, and it NEVER claims success it did not get: the
   confirmation only appears when the worker returns ok, and a failure tells the
   visitor how to reach a human instead of silently swallowing the lead. */

(function () {
  "use strict";
  var ENDPOINT = "https://leads.steelworksintelligence.com/api/lead";
  var FALLBACK = "admin@steelworksintelligence.com";
  var TURNSTILE_SITEKEY = "0x4AAAAAAE9PHEQZpbgDuX5n";

  /* Bot controls (2026-09-19): a hidden field no person fills, a render
     timestamp, and an invisible Turnstile challenge whose token rides along in
     the payload. The Worker (leads.steelworksintelligence.com) enforces the
     rest: origin allowlist, rate limits, disposable/role/no-MX addresses. */
  var tsReady = null;
  function loadTurnstile() {
    if (tsReady) { return tsReady; }
    tsReady = new Promise(function (resolve) {
      if (window.turnstile) { return resolve(window.turnstile); }
      var s = document.createElement("script");
      s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      s.async = true; s.defer = true;
      s.onload = function () { resolve(window.turnstile || null); };
      s.onerror = function () { resolve(null); };
      document.head.appendChild(s);
    });
    return tsReady;
  }
  function arm(form) {
    if (form.dataset.armed) { return; }
    form.dataset.armed = "1";
    var hp = document.createElement("input");
    hp.type = "text"; hp.name = "company_url"; hp.tabIndex = -1; hp.autocomplete = "off";
    hp.setAttribute("aria-hidden", "true");
    hp.style.cssText = "position:absolute;left:-9999px;top:-9999px;height:0;width:0;opacity:0";
    form.appendChild(hp);
    var t = document.createElement("input");
    t.type = "hidden"; t.name = "_t"; t.value = String(Date.now());
    form.appendChild(t);
    var box = document.createElement("div");
    box.className = "cf-turnstile";
    form.appendChild(box);
    loadTurnstile().then(function (ts) {
      if (!ts) { return; }
      try {
        form._tsId = ts.render(box, {
          sitekey: TURNSTILE_SITEKEY, execution: "execute", appearance: "interaction-only",
          callback: function (token) { form._tsToken = token; if (form._tsResolve) { form._tsResolve(token); form._tsResolve = null; } },
          "error-callback": function () { if (form._tsResolve) { form._tsResolve(""); form._tsResolve = null; } },
          "expired-callback": function () { form._tsToken = ""; }
        });
      } catch (e) { /* widget unavailable: the Worker still has honeypot + rate limits */ }
    });
  }
  function challengeToken(form) {
    return new Promise(function (resolve) {
      if (form._tsToken) { return resolve(form._tsToken); }
      if (!window.turnstile || form._tsId === undefined) { return resolve(""); }
      var done = false;
      form._tsResolve = function (tok) { if (!done) { done = true; resolve(tok || ""); } };
      setTimeout(function () { if (!done) { done = true; form._tsResolve = null; resolve(""); } }, 8000);
      try { window.turnstile.execute(form._tsId); } catch (e) { form._tsResolve = null; resolve(""); }
    });
  }

  function note(form, text, ok) {
    var el = form.querySelector(".capture-msg");
    if (!el) {
      el = document.createElement("p");
      el.className = "capture-msg fine";
      form.appendChild(el);
    }
    el.textContent = text;
    el.setAttribute("role", "status");
    el.dataset.state = ok ? "ok" : "error";
  }

  function wire(form) {
    arm(form);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var email = form.querySelector('input[type="email"]');
      if (!email || !email.value) { return; }
      // 2026-09-02: the free-preview capture asks for the visitor's website so
      // the audit runner has a domain to check. Carried in `company` (the
      // worker's existing schema) and as `website`; absent on plain email forms.
      var site = form.querySelector('input[name="website"]');
      var srcEl = form.querySelector('input[name="source"]');
      // services form (2026-09-02): name, the offer they picked, a message.
      var nameEl = form.querySelector('input[name="name"]');
      var offerEl = form.querySelector('select[name="offer"], input[name="offer"]');
      var msgEl = form.querySelector('textarea[name="message"]');
      var btn = form.querySelector("button");
      if (btn) { btn.disabled = true; }
      note(form, "Sending…", true);

      // 2026-09-03 client onboarding: a form whose hidden source starts with
      // "onboarding:" is a post-purchase intake — every named field goes up
      // (the worker keeps them under `extra`), and the source is sent raw so
      // venture_leads_pull can route it to the client record.
      var isOnboarding = !!(srcEl && /^onboarding:/.test(srcEl.value || ""));
      var payloadObj = {
        name: nameEl && nameEl.value ? nameEl.value : "",
        email: email.value,
        company: site && site.value ? site.value : "",
        website: site && site.value ? site.value : "",
        offer: offerEl && offerEl.value ? offerEl.value : "",
        message: msgEl && msgEl.value ? msgEl.value : "",
        source: isOnboarding ? srcEl.value
          : "web:" + location.pathname + (srcEl && srcEl.value ? "#" + srcEl.value : "")
      };
      if (isOnboarding) {
        Array.prototype.forEach.call(form.querySelectorAll("[name]"), function (el) {
          if (el.name && !(el.name in payloadObj) && el.value) { payloadObj[el.name] = el.value; }
        });
      }
      var hpEl = form.querySelector('input[name="company_url"]');
      var tEl = form.querySelector('input[name="_t"]');
      payloadObj.company_url = hpEl ? hpEl.value : "";
      payloadObj._t = tEl ? tEl.value : "";
      challengeToken(form).then(function (tok) {
        if (tok) { payloadObj.turnstile = tok; }
        return fetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payloadObj)
        });
      })
        .then(function (r) { return r.json().catch(function () { return { ok: false, error: "HTTP " + r.status }; }); })
        .then(function (d) {
          if (d && d.ok) {
            note(form, "Received. An acknowledgement is on its way by email, and a person replies within one business day.", true);
            form.reset();
          } else {
            // Honest failure. A capture that fails must say so, not pretend.
            note(form, "That didn't go through (" + ((d && d.error) || "unknown") +
                       "). Email " + FALLBACK + " and I'll reply.", false);
          }
        })
        .catch(function () {
          note(form, "Couldn't reach the signup server. Email " + FALLBACK + " and I'll reply.", false);
        })
        .finally(function () { if (btn) { btn.disabled = false; } form._tsToken = ""; });
    });
  }

  document.addEventListener("DOMContentLoaded", function () {
    Array.prototype.forEach.call(document.querySelectorAll("form.capture"), wire);
  });
})();

/* pageview beacon (2026-08-09): the site had zero traffic measurement.
   Count only — path, no query string, no IP/UA/cookie stored. sendBeacon so
   it never blocks navigation; fetch keepalive as the fallback. */
(function () {
  "use strict";
  try {
    var HIT = "https://leads.steelworksintelligence.com/api/hit";
    var payload = JSON.stringify({ path: location.pathname });
    /* text/plain is CORS-safelisted; an application/json Blob makes
       sendBeacon require a preflight it cannot perform, and the browser
       silently drops the beacon — measured live 2026-08-09. */
    if (navigator.sendBeacon) {
      navigator.sendBeacon(HIT, payload);
    } else {
      fetch(HIT, { method: "POST", body: payload, keepalive: true });
    }
  } catch (e) { /* a lost count must never break a page */ }
})();
