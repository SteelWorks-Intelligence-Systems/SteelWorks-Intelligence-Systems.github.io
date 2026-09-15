const params = new URLSearchParams(window.location.search);
const token = params.get("token") || localStorage.getItem("openclaw_command_token") || "";
if (token) localStorage.setItem("openclaw_command_token", token);

const state = {
  data: null,
  selectedDepartment: "executive",
  selectedAgent: "",
  voice: {
    recognition: null,
    listening: false,
    supported: false,
    transcript: "",
    finalTranscript: "",
    speakReplies: true,
    waveStarted: false,
  },
};

const $ = (id) => document.getElementById(id);
const esc = (value) =>
  String(value ?? "").replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );

const BOARD_ROLES = [
  {
    title: "Chair / CEO",
    department: "executive",
    agent: "lead",
    brief: "Strategy, priorities, risk posture, resource allocation.",
  },
  {
    title: "Revenue Director",
    department: "sales",
    agent: "prospecting",
    brief: "Pipeline, close motion, offers, client conversion.",
  },
  {
    title: "Growth Director",
    department: "marketing",
    agent: "marketing",
    brief: "Demand, SEO, social, campaign performance.",
  },
  {
    title: "Operations Director",
    department: "operations",
    agent: "ops",
    brief: "Crons, services, reliability, backups, load control.",
  },
  {
    title: "Product Director",
    department: "production",
    agent: "content",
    brief: "Creative output, publishing quality, product collateral.",
  },
  {
    title: "Risk Director",
    department: "legal_compliance",
    agent: "ops",
    brief: "Claims, compliance, platform rules, external action gates.",
  },
  {
    title: "Research Director",
    department: "rd",
    agent: "research",
    brief: "Market learning, RSI, tooling, future capability gaps.",
  },
  {
    title: "Investment Director",
    department: "investment",
    agent: "trading",
    brief: "Paper trading, risk controls, research, self-funding readiness.",
  },
];

async function api(path, options = {}) {
  const headers = { "X-OpenClaw-Token": token, ...(options.headers || {}) };
  const response = await fetch(path, { ...options, headers });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
  const contentType = response.headers.get("Content-Type") || "";
  return contentType.includes("application/json") ? response.json() : response;
}

function kpi(label, value, className = "") {
  return `<article class="kpi ${className}"><strong>${esc(value)}</strong><span class="muted">${esc(label)}</span></article>`;
}

function mini(label, value) {
  return `<div class="mini-card"><strong>${esc(value)}</strong><span class="muted">${esc(label)}</span></div>`;
}

function actionItem(title, body, meta = "") {
  return `<article class="action-item"><strong>${esc(title)}</strong><p>${esc(body)}</p>${meta ? `<div class="meta">${meta}</div>` : ""}</article>`;
}

function statusClass(value) {
  const raw = String(value || "").toLowerCase();
  if (raw.includes("fail") || raw.includes("error") || raw.includes("blocked")) return "bad";
  if (raw.includes("warn") || raw.includes("unknown") || raw.includes("queued")) return "warn";
  return "good";
}

function departmentName(id) {
  if (id === "all") return "All Departments";
  const dept = (state.data?.departments || []).find((d) => d.id === id);
  return dept?.name || String(id || "executive").replaceAll("_", " ");
}

function selectedDepartment() {
  const departments = state.data?.departments || [];
  if (state.selectedDepartment === "all") {
    return {
      id: "all",
      name: "All Departments",
      owner: "board",
      support: BOARD_ROLES.map((r) => r.agent),
      purpose: "Route a cross-functional command to every department lead.",
      model_lane: "department leads choose their free-first model lanes",
      cron_count: departments.reduce((total, d) => total + Number(d.cron_count || 0), 0),
      routed_events_24h: departments.reduce(
        (total, d) => total + Number(d.routed_events_24h || 0),
        0,
      ),
    };
  }
  return departments.find((d) => d.id === state.selectedDepartment) || departments[0] || {};
}

function departmentAgents(department) {
  const agents = state.data?.agents || [];
  const ids = [department.owner, ...(department.support || [])].filter(Boolean);
  const unique = [...new Set(ids)];
  return unique.map(
    (id) =>
      agents.find((a) => a.id === id) || {
        id,
        has_soul: false,
        has_ollama_auth: false,
        updated: "unknown",
      },
  );
}

function allAgentIds() {
  const fromDepartments = (state.data?.departments || []).flatMap((d) => [
    d.owner,
    ...(d.support || []),
  ]);
  const fromAgents = (state.data?.agents || []).map((a) => a.id);
  return [...new Set([...fromDepartments, ...fromAgents].filter(Boolean))].sort();
}

function setDepartment(id, agent = "") {
  state.selectedDepartment = id || "executive";
  state.selectedAgent = agent;
  render();
}

function fillCommand({ department, target = "department", text, agent = "" }) {
  if (department) state.selectedDepartment = department;
  if (agent) state.selectedAgent = agent;
  render();
  $("departmentSelect").value = state.selectedDepartment;
  $("targetSelect").value = agent ? "specific-agent" : target;
  renderAgentTarget();
  if (agent) $("agentSelect").value = agent;
  $("commandText").value = text;
  $("commandText").focus();
}

function renderNav(departments) {
  $("departmentNav").innerHTML = departments
    .map(
      (d) => `
    <button class="nav-item ${d.id === state.selectedDepartment ? "active" : ""}" data-dept="${esc(d.id)}">
      <strong>${esc(d.name)}</strong><br><span>${esc(d.owner)}</span>
    </button>
  `,
    )
    .join("");
  $("departmentNav")
    .querySelectorAll("button")
    .forEach((button) => {
      button.addEventListener("click", () => setDepartment(button.dataset.dept));
    });
}

function renderAgentTarget() {
  const target = $("targetSelect").value;
  $("agentTargetField").classList.toggle("hidden", target !== "specific-agent");
}

function renderSelects(departments) {
  $("departmentSelect").innerHTML = [
    `<option value="all">All Departments</option>`,
    ...departments.map((d) => `<option value="${esc(d.id)}">${esc(d.name)}</option>`),
  ].join("");
  $("departmentSelect").value = state.selectedDepartment;

  const selected = selectedDepartment();
  const scopedAgents = departmentAgents(selected).map((a) => a.id);
  const remaining = allAgentIds().filter((id) => !scopedAgents.includes(id));
  $("agentSelect").innerHTML = [
    ...scopedAgents.map(
      (id) =>
        `<option value="${esc(id)}">${esc(id)} · ${esc(departmentName(selected.id))}</option>`,
    ),
    ...remaining.map((id) => `<option value="${esc(id)}">${esc(id)}</option>`),
  ].join("");
  if (!state.selectedAgent) state.selectedAgent = scopedAgents[0] || allAgentIds()[0] || "";
  $("agentSelect").value = state.selectedAgent;
  renderAgentTarget();
}

function renderKpis(data) {
  const k = data.kpis || {};
  $("kpis").innerHTML = [
    kpi(
      "Company Health",
      k.company_health ?? "unknown",
      Number(k.company_health) >= 90 ? "good" : "warn",
    ),
    kpi("Revenue", k.revenue_total ?? "$0.00"),
    kpi("MRR", k.mrr ?? "$0.00"),
    kpi("Cron Failures", k.cron_failures ?? 0, Number(k.cron_failures) ? "bad" : "good"),
    kpi(
      "PC Ollama",
      k.pc_ollama ?? "unknown",
      String(k.pc_ollama).toLowerCase() === "ok" ? "good" : "warn",
    ),
    kpi("Telegram Interrupts 24h", k.telegram_immediate_24h ?? 0),
  ].join("");
}

function renderContext() {
  const dept = selectedDepartment();
  const agents = departmentAgents(dept);
  $("contextTitle").textContent = dept.name ? `Call ${dept.name}` : "Call The Company";
  $("contextSummary").innerHTML = `
    <div><strong>${esc(dept.owner || "lead")}</strong><span class="muted"> Department lead</span></div>
    <p>${esc(dept.purpose || "Route work through the internal agent structure.")}</p>
    <div class="meta">
      <span>Model: ${esc(dept.model_lane || "default free-first lane")}</span>
      <span>Crons: ${esc(dept.cron_count ?? 0)}</span>
      <span>Events 24h: ${esc(dept.routed_events_24h ?? 0)}</span>
    </div>
    <div class="agent-chip-row">
      ${agents.map((a) => `<button class="agent-chip" data-agent="${esc(a.id)}" type="button">${esc(a.id)}</button>`).join("")}
    </div>
  `;
  $("contextSummary")
    .querySelectorAll(".agent-chip")
    .forEach((button) => {
      button.addEventListener("click", () =>
        fillCommand({
          department: dept.id,
          agent: button.dataset.agent,
          text: `Ask ${button.dataset.agent} for expert analysis on the current ${dept.name} priorities, blockers, and next autonomous actions.`,
        }),
      );
    });
}

function renderCampaign(data) {
  const lane = data.lanes?.content_revenue_os || {};
  const summary = lane.summary || {};
  $("campaignTitle").textContent = lane.campaign || "No active campaign";
  $("campaignStatus").textContent = lane.status || "unknown";
  $("campaignSummary").innerHTML = Object.entries(summary)
    .map(([key, value]) => mini(key.replaceAll("_", " "), value))
    .join("");
  $("agentActions").innerHTML =
    (lane.actions || [])
      .slice(0, 5)
      .map((a) =>
        actionItem(
          `${a.owner} · ${a.priority}`,
          a.action,
          `<span>${esc(a.campaign_title || "")}</span>`,
        ),
      )
      .join("") ||
    actionItem("No actions", "The daily campaign lane has not published actions yet.");
}

function recommendationSeed(data) {
  const dept = selectedDepartment();
  const cron = data.lanes?.cron || {};
  const trading = data.lanes?.trading || {};
  const campaign = data.lanes?.content_revenue_os || {};
  const market = data.lanes?.market_intelligence || {};
  const items = [
    {
      label: "Department Brief",
      department: dept.id || "executive",
      target: "department",
      text: `${dept.name || "Executive Command"}, review current priorities, identify blockers, assign autonomous fixes, and escalate only executive-grade issues.`,
    },
    {
      label: "Board Review",
      department: "all",
      target: "all-leads",
      text: "Board review: each department lead reports critical blockers, revenue opportunities, risk items, and the next autonomous action required today.",
    },
    {
      label: "Opportunity Monetization",
      department: "business_development",
      target: "department",
      text: "Business Development, find and vet the strongest free-first revenue opportunity, hand off campaign requirements to Sales and Marketing, and log build blockers.",
    },
    {
      label: "Marketing Output",
      department: "marketing",
      target: "department",
      text: `Marketing, improve the active campaign "${campaign.campaign || "AI Search Website OS"}", check SEO/social content quality, and queue the next publish-ready assets.`,
    },
    {
      label: "Sales Pipeline",
      department: "sales",
      target: "department",
      text: "Sales, review CRM and prospecting sources for qualified opportunities, separate real buyer signals from system noise, and draft the next conversion actions.",
    },
    {
      label: "Trading Risk",
      department: "investment",
      target: "department",
      text: `Investment, review paper trading readiness, current market research, risk controls, and blockers. Current status: ${trading.status || trading.health_status || "unknown"}.`,
    },
  ];
  if (Number(cron.failing_count || 0) > 0) {
    items.unshift({
      label: "Fix Cron Failures",
      department: "operations",
      target: "department",
      text: `Operations, triage ${cron.failing_count} cron failure records, fix safe internal issues, reduce free-tier load, and escalate only hard blockers.`,
    });
  }
  if ((market.actions || []).length) {
    items.push({
      label: "Market Signals",
      department: "analytics_bi",
      target: "department",
      text: "Analytics, summarize the latest market intelligence signals, convert them into ranked business actions, and route owners internally.",
    });
  }
  return items.slice(0, 8);
}

function renderRecommendations(data) {
  const items = recommendationSeed(data);
  $("recommendationCount").textContent = String(items.length);
  $("recommendedCommands").innerHTML = items
    .map(
      (item) => `
    <article class="recommendation">
      <button type="button" data-department="${esc(item.department)}" data-target="${esc(item.target)}" data-text="${esc(item.text)}">
        <strong>${esc(item.label)}</strong>
        <span>${esc(departmentName(item.department))}</span>
      </button>
      <p>${esc(item.text)}</p>
    </article>
  `,
    )
    .join("");
  $("recommendedCommands")
    .querySelectorAll("button")
    .forEach((button) => {
      button.addEventListener("click", () =>
        fillCommand({
          department: button.dataset.department,
          target: button.dataset.target,
          text: button.dataset.text,
        }),
      );
    });
}

function renderBoard() {
  $("boardRoles").innerHTML = BOARD_ROLES.map(
    (role) => `
    <article class="board-card">
      <button type="button" data-department="${esc(role.department)}" data-agent="${esc(role.agent)}">
        <strong>${esc(role.title)}</strong>
        <span>${esc(role.agent)} · ${esc(departmentName(role.department))}</span>
      </button>
      <p>${esc(role.brief)}</p>
    </article>
  `,
  ).join("");
  $("boardRoles")
    .querySelectorAll("button")
    .forEach((button) => {
      button.addEventListener("click", () =>
        fillCommand({
          department: button.dataset.department,
          agent: button.dataset.agent,
          text: `Ask ${button.dataset.agent} to provide board-level analysis for ${departmentName(button.dataset.department)}: priorities, risks, blockers, opportunities, and next actions.`,
        }),
      );
    });
}

function renderDepartments(data) {
  const departments = data.departments || [];
  const selected = selectedDepartment();
  $("selectedAgentCount").textContent = `${departmentAgents(selected).length} agents`;
  $("departments").innerHTML = departments
    .map((d) => {
      const agents = departmentAgents(d);
      return `
      <details class="department-card" ${d.id === state.selectedDepartment ? "open" : ""}>
        <summary>
          <span><strong>${esc(d.name)}</strong><small>${esc(d.owner)}</small></span>
          <button type="button" data-dept="${esc(d.id)}">Focus</button>
        </summary>
        <p>${esc(d.purpose)}</p>
        <div class="meta">
          <span>Crons: ${esc(d.cron_count)}</span>
          <span>Events 24h: ${esc(d.routed_events_24h)}</span>
        </div>
        <div class="agent-drilldown">
          ${agents
            .map(
              (a) => `
            <button type="button" class="agent-row" data-dept="${esc(d.id)}" data-agent="${esc(a.id)}">
              <span>${esc(a.id)}</span>
              <small class="${a.has_soul ? "good" : "warn"}">SOUL ${a.has_soul ? "ok" : "missing"}</small>
              <small class="${a.has_ollama_auth ? "good" : "warn"}">Ollama ${a.has_ollama_auth ? "ok" : "missing"}</small>
            </button>
          `,
            )
            .join("")}
        </div>
      </details>
    `;
    })
    .join("");
  $("departments")
    .querySelectorAll("summary button")
    .forEach((button) => {
      button.addEventListener("click", (event) => {
        event.preventDefault();
        setDepartment(button.dataset.dept);
      });
    });
  $("departments")
    .querySelectorAll(".agent-row")
    .forEach((button) => {
      button.addEventListener("click", () =>
        fillCommand({
          department: button.dataset.dept,
          agent: button.dataset.agent,
          text: `Ask ${button.dataset.agent} for specific expertise on ${departmentName(button.dataset.dept)} execution quality, gaps, and recommended autonomous actions.`,
        }),
      );
    });
}

function renderMarketAndOps(data) {
  const marketActions = data.lanes?.market_intelligence?.actions || [];
  $("marketActions").innerHTML =
    marketActions
      .slice(0, 7)
      .map((a) =>
        actionItem(
          `${a.priority || "review"} · ${a.owner || "market"}`,
          a.next_action || a.type || "Review action",
          `<span>${esc(a.target || "")}</span>`,
        ),
      )
      .join("") ||
    actionItem("No market actions", "Market intelligence is waiting for the next scan.");

  const cron = data.lanes?.cron || {};
  const trading = data.lanes?.trading || {};
  const items = [
    actionItem(
      "Cron failures",
      `${cron.failing_count || 0} active failure records`,
      `<span>${esc(cron.enabled || 0)} enabled</span>`,
    ),
    actionItem(
      "Trading status",
      trading.status || trading.health_status || "unknown",
      `<span>${esc((trading.hard_blocks || []).join(", ") || "no hard blocks listed")}</span>`,
    ),
    actionItem("Social lane", data.kpis?.social_ready || "unknown"),
  ];
  (cron.failing || [])
    .slice(0, 5)
    .forEach((f) =>
      items.push(
        actionItem(`Cron: ${f.name}`, f.last_error || f.status, `<span>${esc(f.agent)}</span>`),
      ),
    );
  $("opsHealth").innerHTML = items.join("");
}

function renderAgents(data) {
  const agents = data.agents || [];
  $("agentCount").textContent = `${agents.length} agents`;
  $("agents").innerHTML = agents
    .map(
      (a) => `
    <article class="agent-card">
      <h3>${esc(a.id)}</h3>
      <div class="meta">
        <span class="${a.has_soul ? "good" : "warn"}">SOUL ${a.has_soul ? "ok" : "missing"}</span>
        <span class="${a.has_ollama_auth ? "good" : "warn"}">Ollama ${a.has_ollama_auth ? "ok" : "missing"}</span>
        <span>${esc(a.updated)}</span>
      </div>
    </article>
  `,
    )
    .join("");
}

function timelineStatus(command) {
  if (command.mode === "voice") return "voice routed";
  if (String(command.target || "").startsWith("agent:")) return "agent routed";
  if (command.target === "all-leads") return "board routed";
  return command.status || "queued";
}

function renderCommands(data) {
  const commands = data.commands_recent || [];
  $("recentCommands").innerHTML =
    commands
      .slice()
      .reverse()
      .map((c) =>
        actionItem(
          `${c.department} · ${c.status}`,
          c.text,
          `<span>${esc(c.created_at || "")}</span>`,
        ),
      )
      .join("") ||
    actionItem(
      "No routed commands",
      "Use the command router to send a request to the agent structure.",
    );
  $("commandTimeline").innerHTML =
    commands
      .slice()
      .reverse()
      .slice(0, 8)
      .map(
        (c) => `
    <article class="timeline-item">
      <span class="timeline-dot ${statusClass(timelineStatus(c))}"></span>
      <div>
        <strong>${esc(timelineStatus(c))}</strong>
        <p>${esc(c.text)}</p>
        <div class="meta">
          <span>${esc(departmentName(c.department))}</span>
          <span>${esc(c.lead_agent || c.target || "")}</span>
          <span>${esc(c.created_at || "")}</span>
        </div>
      </div>
    </article>
  `,
      )
      .join("") || actionItem("No routed commands", "Commands will appear here after routing.");
}

function renderVoiceStatus(data) {
  const voice = data.voice || {};
  const whisperReady = Boolean(voice.whisper_cpp?.available);
  const piperReady = Boolean(voice.piper?.available);
  const wakeReady = Boolean(voice.openwakeword?.available);
  const backend = whisperReady ? "Whisper Ready" : "Browser STT";
  $("voiceBackend").textContent =
    `${backend}${piperReady ? " + Piper" : ""}${wakeReady ? " + Wake" : ""}`;
  if (!state.voice.listening && !state.voice.transcript) {
    $("voiceState").textContent = state.voice.supported
      ? "Standing By"
      : "Voice Needs Browser Support";
  }
}

function render() {
  const data = state.data;
  if (!data) return;
  renderNav(data.departments || []);
  renderSelects(data.departments || []);
  renderKpis(data);
  renderContext();
  renderCampaign(data);
  renderRecommendations(data);
  renderBoard();
  renderDepartments(data);
  renderMarketAndOps(data);
  renderAgents(data);
  renderCommands(data);
  renderVoiceStatus(data);
  $("refreshState").textContent = `Live · ${new Date(data.generated_at).toLocaleTimeString()}`;
}

async function loadState() {
  $("refreshState").textContent = "Refreshing";
  try {
    state.data = await api("/api/state");
    render();
  } catch (error) {
    $("refreshState").textContent = "Auth or server error";
    $("kpis").innerHTML = kpi("Command Center", "Locked", "bad");
  }
}

async function routeCommand(payload) {
  const result = await api("/api/command", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  await loadState();
  return result;
}

function inferDepartmentFromText(text) {
  const lowered = text.toLowerCase();
  const patterns = {
    investment: ["trade", "trading", "alpaca", "stock", "option", "forex", "risk", "market"],
    marketing: ["seo", "content", "social", "campaign", "blog", "podcast", "rank", "website"],
    sales: ["lead", "crm", "client", "prospect", "outreach", "close", "proposal", "pipeline"],
    production: ["video", "audio", "visual", "asset", "creative", "publish", "thumbnail"],
    operations: ["cron", "service", "gateway", "backup", "error", "health", "automation"],
    procurement: ["tool", "source", "free", "install", "vendor", "procure", "replace"],
    business_development: ["opportunity", "business", "offer", "package", "monetize", "launch"],
    legal_compliance: ["legal", "compliance", "risk", "privacy", "claim", "policy", "terms"],
    accounting: ["revenue", "cost", "mrr", "profit", "invoice", "gumroad", "cash"],
    analytics_bi: ["analytics", "dashboard", "metric", "report", "trend", "kpi", "signal"],
    rd: ["research", "experiment", "evolve", "skill", "agent", "model", "improve"],
    logistics: ["tailscale", "bridge", "device", "pc", "m1", "queue", "browser"],
  };
  let best = ["executive", 0];
  Object.entries(patterns).forEach(([department, words]) => {
    const score = words.reduce((total, word) => total + (lowered.includes(word) ? 1 : 0), 0);
    if (score > best[1]) best = [department, score];
  });
  return best[0];
}

function updateVoicePulse(department) {
  $("voiceDeptPulse").textContent = departmentName(department);
  $("voiceDeptPulse").dataset.department = department;
}

async function speak(text) {
  if (!state.voice.speakReplies) return;
  try {
    const response = await fetch("/api/tts", {
      method: "POST",
      headers: { "X-OpenClaw-Token": token, "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
    if (response.ok) {
      const blob = await response.blob();
      const audio = new Audio(URL.createObjectURL(blob));
      await audio.play();
      return;
    }
  } catch {
    // Browser speech synthesis remains the free fallback when Piper is unavailable.
  }
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 0.98;
  utterance.pitch = 0.92;
  window.speechSynthesis.speak(utterance);
}

async function routeVoiceTranscript(text, confidence = null) {
  if (!text.trim()) return;
  const department = inferDepartmentFromText(text);
  updateVoicePulse(department);
  $("voiceState").textContent = "Routing";
  $("voiceResult").textContent = "Sending to department lead...";
  try {
    const result = await api("/api/voice-command", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript: text,
        confidence,
        department: "auto",
        target: "department",
        backend: "browser_speech_recognition",
      }),
    });
    const lead = result.command?.lead_agent || department;
    $("voiceState").textContent = "Routed";
    $("voiceResult").textContent = `Lead: ${lead}`;
    speak(result.reply || `Routed to ${lead}.`);
    await loadState();
  } catch (error) {
    $("voiceState").textContent = "Voice Route Failed";
    $("voiceResult").textContent = error.message;
  }
}

function drawWaveform() {
  const canvas = $("voiceWaveform");
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  const width = canvas.width;
  const height = canvas.height;
  let tick = 0;
  function frame() {
    tick += 1;
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = state.voice.listening ? "#00d4b8" : "rgba(159, 176, 195, 0.38)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    const amp = state.voice.listening ? 26 : 9;
    for (let x = 0; x <= width; x += 6) {
      const wave = Math.sin((x + tick * 5) / 18) * amp + Math.sin((x + tick * 2) / 43) * (amp / 2);
      const y = height / 2 + wave;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    requestAnimationFrame(frame);
  }
  frame();
}

function setupVoice() {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  state.voice.supported = Boolean(Recognition);
  if (!state.voice.waveStarted) {
    state.voice.waveStarted = true;
    drawWaveform();
  }
  if (!Recognition) {
    $("voiceState").textContent = "Voice Needs Browser Support";
    $("voiceResult").textContent =
      "Use Chrome on localhost now; Whisper local STT is tracked in the backend.";
    $("voiceButton").disabled = true;
    return;
  }
  const recognition = new Recognition();
  recognition.lang = "en-US";
  recognition.continuous = false;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;
  recognition.onstart = () => {
    state.voice.listening = true;
    state.voice.transcript = "";
    state.voice.finalTranscript = "";
    $("voiceButton").classList.add("listening");
    $("voiceState").textContent = "Listening";
    $("voiceTranscript").textContent = "Listening...";
    $("voiceResult").textContent = "";
  };
  recognition.onresult = (event) => {
    let interim = "";
    let finalText = "";
    let confidence = null;
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const alternative = result[0];
      if (result.isFinal) {
        finalText += alternative.transcript;
        confidence = alternative.confidence;
      } else {
        interim += alternative.transcript;
      }
    }
    if (finalText) state.voice.finalTranscript += finalText;
    const display = `${state.voice.finalTranscript} ${interim}`.trim();
    state.voice.transcript = display;
    $("voiceTranscript").textContent = display || "Listening...";
    updateVoicePulse(inferDepartmentFromText(display));
    state.voice.lastConfidence = confidence;
  };
  recognition.onerror = (event) => {
    $("voiceState").textContent = "Voice Error";
    $("voiceResult").textContent = event.error || "Speech recognition failed";
  };
  recognition.onend = () => {
    state.voice.listening = false;
    $("voiceButton").classList.remove("listening");
    const transcript = (state.voice.finalTranscript || state.voice.transcript || "").trim();
    if (transcript) routeVoiceTranscript(transcript, state.voice.lastConfidence);
    else $("voiceState").textContent = "Standing By";
  };
  state.voice.recognition = recognition;
}

$("refreshButton").addEventListener("click", loadState);

$("departmentSelect").addEventListener("change", (event) => {
  state.selectedDepartment = event.target.value;
  state.selectedAgent = "";
  render();
});

$("targetSelect").addEventListener("change", renderAgentTarget);

$("agentSelect").addEventListener("change", (event) => {
  state.selectedAgent = event.target.value;
});

$("commandForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  $("commandResult").textContent = "Routing...";
  try {
    const target =
      $("targetSelect").value === "specific-agent"
        ? `agent:${$("agentSelect").value}`
        : $("targetSelect").value;
    const result = await routeCommand({
      department: $("departmentSelect").value,
      target,
      text: $("commandText").value,
      mode: "internal",
    });
    $("commandResult").textContent =
      `Routed: ${result.command.lead_agent || result.command.status}`;
    $("commandText").value = "";
  } catch (error) {
    $("commandResult").textContent = `Failed: ${error.message}`;
  }
});

$("boardCommand").addEventListener("click", () =>
  fillCommand({
    department: "all",
    target: "all-leads",
    text: "Board of Directors: run a cross-functional review. Each director should report priorities, risks, revenue opportunities, blockers, and the next autonomous action.",
  }),
);

$("voiceButton").addEventListener("click", () => {
  if (!state.voice.recognition || state.voice.listening) return;
  state.voice.recognition.start();
});

$("voiceSpeakToggle").addEventListener("click", () => {
  state.voice.speakReplies = !state.voice.speakReplies;
  $("voiceSpeakToggle").textContent = state.voice.speakReplies
    ? "Voice Reply On"
    : "Voice Reply Off";
});

setupVoice();
loadState();
