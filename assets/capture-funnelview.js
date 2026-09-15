/* capture-funnelview.js — record a FUNNEL PAGE VIEW where the analytics
   pipeline actually reads.

   WHY THIS EXISTS (2026-08-15)

   `data/funnel/funnel-events.jsonl` had not been written in 7.3 days and the
   health sweep flagged the store as quiet. Nothing was erroring. The cause was
   that the site has TWO tracking paths and they do not meet:

     capture.js  -> POST /api/hit   (swi-leads)   increments hit:<day>:<path>
     capture.py  <- funnel_view:*   (swi-chatbot) written by POST /track

   Every page view on the site went to the counter in the leads worker. The
   A/B ingester reads `funnel_view:` keys in the chatbot worker's KV. Nobody
   wrote them, so it read nothing, forever — 9 view keys total, all from June,
   against 3,020 externally reported views.

   The counter cannot substitute: it is one integer per path per day, and the
   A/B engine needs a per-visitor, per-variant event to compute opt-in rate.
   A denominator of zero is why no A/B decision has ever been valid.

   Scoped to /funnels/ pages on purpose. A site-wide beacon here would write a
   `track:<id>` key per page view into KV, and the list operations that scan
   that namespace are already the subject of an open cost question. Views we
   cannot act on are not worth paying to store. */

(function () {
  "use strict";
  try {
    var m = location.pathname.match(/^\/funnels\/([^\/]+)\//);
    if (!m) { return; }                       // not a funnel page
    var funnel = m[1];

    // Variant comes from the URL when a test is running (?v=b). It is NOT
    // invented here: assigning a variant client-side without the A/B engine
    // knowing the split would poison the very numbers this beacon exists to
    // produce. No ?v= means the control arm, which is what "" already means
    // to the ingester.
    var variant = (new URLSearchParams(location.search).get("v") || "").slice(0, 16);

    // Stable within the tab so a reload is not counted as a second visitor.
    var sid = "";
    try {
      sid = sessionStorage.getItem("swi_sid") || "";
      if (!sid) {
        sid = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        sessionStorage.setItem("swi_sid", sid);
      }
    } catch (e) {
      sid = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
    }

    var payload = JSON.stringify({
      event: "page_view",
      funnel: funnel,
      variant: variant,
      source: "funnel_page",
      sessionId: sid,
      referrer: (document.referrer || "").slice(0, 320)
    });

    /* NOT sendBeacon. sendBeacon cannot set Content-Type: application/json
       without a preflight it is unable to perform, and /track does
       request.json() — a text/plain beacon reaches the worker and 400s. That
       exact mistake is documented in capture.js for /api/hit, which is why
       that one sends text/plain to an endpoint that accepts it. Different
       endpoint, different contract. */
    fetch("https://swi-chatbot.macsmacpro.workers.dev/track", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true
    }).catch(function () { /* a lost view must never break the page */ });
  } catch (e) { /* same */ }
})();
