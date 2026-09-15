/* SteelWorks conversion beacon — privacy-respecting by construction.
   Sends: event name, page path, title, clicked href. Nothing else.
   No cookies, no fingerprinting, no third parties; our own free
   Cloudflare worker, events land in BUSINESS_KV and sync to the CRM.
   On pages that load assets/main.js the richer SWITrack tracker is
   already live — this file then only aliases it (no double counting). */
(function () {
  if (window.SWITrack) { window.swTrack = function (e, x) { window.SWITrack(e, x); }; return; }
  var EP = 'https://swi-chatbot.macsmacpro.workers.dev/track';
  function send(event, extra) {
    var payload = {
      event: event,
      page: location.hostname + location.pathname,
      path: location.pathname,
      title: (document.title || '').slice(0, 170)
    };
    if (extra) for (var k in extra) payload[k] = extra[k];
    try {
      /* plain STRING body → text/plain, CORS-safelisted, never preflights */
      var body = JSON.stringify(payload);
      if (navigator.sendBeacon) {
        navigator.sendBeacon(EP, body);
      } else {
        fetch(EP, { method: 'POST', headers: { 'Content-Type': 'text/plain' },
          body: body, keepalive: true }).catch(function () {});
      }
    } catch (e) { /* analytics must never break the page */ }
  }
  send('page_view');
  document.addEventListener('click', function (e) {
    var a = e.target.closest && e.target.closest('a');
    if (!a || !a.href) return;
    if (/gumroad\.com/.test(a.href)) {
      send('gumroad_click', { href: a.href.slice(0, 300) });
    } else if (a.classList.contains('btn') || a.classList.contains('nav-cta')) {
      send('cta_click', { href: a.href.slice(0, 300) });
    }
  }, true);
  window.swTrack = send; // forms call swTrack('intake_submit') on success
})();
