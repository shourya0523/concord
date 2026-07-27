const trackEl = document.getElementById("track");
const companyEl = document.getElementById("company");
const positionEl = document.getElementById("position");
const qEl = document.getElementById("q");
const listEl = document.getElementById("list");
const countEl = document.getElementById("count");
const metaEl = document.getElementById("meta");
const emptyEl = document.getElementById("empty");

let debounceTimer = null;
let filtersReady = false;

function fillSelect(select, values, allLabel) {
  const current = select.value;
  select.innerHTML = "";
  const all = document.createElement("option");
  all.value = "";
  all.textContent = allLabel;
  select.appendChild(all);
  for (const value of values) {
    const opt = document.createElement("option");
    opt.value = value;
    opt.textContent = value;
    select.appendChild(opt);
  }
  if ([...select.options].some((o) => o.value === current)) {
    select.value = current;
  }
}

function renderQuestions(questions) {
  listEl.innerHTML = "";
  emptyEl.hidden = questions.length > 0;

  for (const item of questions) {
    const li = document.createElement("li");
    li.className = "question-item";

    const top = document.createElement("div");
    top.className = "question-top";

    if (item.track) {
      const track = document.createElement("span");
      track.className = "chip track";
      track.textContent = item.track;
      top.appendChild(track);
    }
    if (item.company) {
      const company = document.createElement("span");
      company.className = "chip";
      company.textContent = item.company;
      top.appendChild(company);
    }
    if (item.position) {
      const position = document.createElement("span");
      position.className = "chip";
      position.textContent = item.position;
      top.appendChild(position);
    }

    const text = document.createElement("p");
    text.className = "question-text";
    text.textContent = item.question || "(no question text)";

    li.appendChild(top);
    li.appendChild(text);

    if (item.process) {
      const process = document.createElement("p");
      process.className = "question-process";
      process.textContent = item.process;
      li.appendChild(process);
    }

    const metaParts = [];
    if (item.date_posted) metaParts.push(item.date_posted);
    if (item.user) metaParts.push(item.user);
    if (item.experience) metaParts.push(item.experience);

    if (metaParts.length) {
      const meta = document.createElement("p");
      meta.className = "question-meta";
      meta.textContent = metaParts.join(" · ");
      li.appendChild(meta);
    }

    listEl.appendChild(li);
  }
}

async function loadQuestions() {
  const params = new URLSearchParams();
  if (trackEl.value) params.set("track", trackEl.value);
  if (companyEl.value) params.set("company", companyEl.value);
  if (positionEl.value) params.set("position", positionEl.value);
  if (qEl.value.trim()) params.set("q", qEl.value.trim());

  const res = await fetch(`/api/questions?${params.toString()}`);
  const data = await res.json();

  if (!filtersReady) {
    fillSelect(trackEl, data.filters.tracks || [], "All tracks");
    fillSelect(companyEl, data.filters.companies || [], "All companies");
    fillSelect(positionEl, data.filters.positions || [], "All positions");
    filtersReady = true;
  }

  countEl.textContent = `Showing ${data.count} of ${data.total} questions`;
  metaEl.textContent =
    data.total > 0
      ? `${data.total} questions in bank · updated ${data.updated_at || "—"}`
      : "Bank is empty — run a batch scrape first";

  renderQuestions(data.questions || []);
}

function scheduleLoad() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(loadQuestions, 180);
}

for (const el of [trackEl, companyEl, positionEl]) {
  el.addEventListener("change", loadQuestions);
}
qEl.addEventListener("input", scheduleLoad);

loadQuestions().catch((err) => {
  metaEl.textContent = `Failed to load bank: ${err.message}`;
  countEl.textContent = "—";
});
