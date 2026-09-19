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
  var ENDPOINT = "https://swi-leads.macsmacpro.workers.dev/api/lead";
  var FALLBACK = "admin@steelworksintelligence.com";

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
      fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadObj)
      })
        .then(function (r) { return r.json().catch(function () { return { ok: false, error: "HTTP " + r.status }; }); })
        .then(function (d) {
          if (d && d.ok) {
            note(form, "Got it — check your inbox.", true);
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
        .finally(function () { if (btn) { btn.disabled = false; } });
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
    var HIT = "https://swi-leads.macsmacpro.workers.dev/api/hit";
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
