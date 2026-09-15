# The Free AI Business Stack

### Every tool running my 42-agent business, and what each one replaces

This is the actual stack, not a listicle. It runs a content pipeline, a lead
funnel, a paper-trading desk, and a 190-page website on one M1 MacBook with
zero monthly software spend. Version: 2026-08-09.

---

## 1. The brain — local models, routed by task

**Ollama** (free, ollama.com) running `llama3.2:3b` for fast ops.

The single setting that matters on a 16GB machine: context length. At 32k
context the model holds ~5.9GB resident. Left at its default (model max,
131k) the same model balloons to 17.8GB and OOM-kills whatever else you run.
In the Ollama app: Settings → context length → 32768. Verify:

    grep n_ctx_slot ~/.ollama/logs/server.log | tail -1   # want 32768

Route by task, not loyalty: short/mechanical work goes local; long-context or
frontier-quality tasks go to free cloud tiers (OpenRouter free models, Groq
free tier). ~20 lines of Python picks the lane by prompt length and task type.
Replaces: a $20-200/mo LLM API bill.

## 2. The scheduler — one cron store you can actually query

Everything runs on cron jobs in one SQLite table. Two rules learned the hard
way:

- **A scheduler you can't query is a scheduler you can't trust.** Ours answers
  `select name, enabled, last_run_status from cron_jobs` — 300+ jobs, one query.
- **Silent zombies beat crashes.** A job that logs "ok" and does nothing is
  worse than one that dies loudly. Check the _artifact_ (the file written, the
  row inserted), never the exit banner.

Replaces: Zapier/Make ($20-600/mo at real volume).

## 3. The quality gate — a number in code, not a vibe in a prompt

Nothing publishes below 85/100, scored by a rubric that lives in code.
Prompts drift; regex doesn't. Our gate caught an AI draft inventing a
personal anecdote that _scored 88 on style_ — a code-level fabrication lint
blocked it. If you automate content, build the gate before the generator.
Replaces: an editor on retainer, or public embarrassment.

## 4. The publish-proof rule — no permalink, no success

Every automated post must produce a public URL that a verifier fetches back.
"The API returned 200" is not published. When we audited without this rule,
69% of claimed post "successes" had no evidence they ever existed.
Replaces: dashboards that lie to you.

## 5. Lead capture — a free Cloudflare Worker and a KV namespace

A 100-line Worker takes form posts, validates, writes to KV; a cron pulls
them into SQLite hourly. The Worker returns success only after the KV write
succeeds — a lead that wasn't stored isn't captured.
Replaces: Typeform/ConvertKit capture tiers ($15-50/mo).

## 6. Images and voice — local generation

- **ComfyUI + SD 1.5** for images (SDXL if you have the RAM).
- **Kokoro TTS** for voiceover; run every script through a
  number-normalizer first ("$1,200" → "twelve hundred dollars") or the reads
  are unusable, then verify the audio with local ASR before shipping.

Replaces: Midjourney + ElevenLabs (~$40/mo).

## 7. The kill switch — one flag every autonomous lane checks first

Every lane that can act externally checks a single kill flag before it does
anything, and _fail-closed_: if the flag can't be read, the lane halts. A
publisher that can't confirm it's allowed to publish must not publish.
Cost: ~10 lines. Replaces: the incident you'd otherwise have.

## 8. The free-first rule that makes it all hold

If a paid tool has a capability you need, first ask what the 20% version
looks like built on what you already run. We've built free equivalents of a
lead enricher, a social scheduler, a rank tracker, and an uptime monitor —
none took longer than a day, all of them are boring, all of them work.

---

**Total monthly cost of everything above: $0.**
The trade is real: you spend setup hours instead of subscription dollars,
and you own every piece afterward.

Questions, or want the full blueprint with the routing code and the gate
rubrics? Reply to the email this came in — I read every reply.

— SteelWorks Intelligence Systems · SteelWorks Intelligence
https://steelworksintelligence.com
