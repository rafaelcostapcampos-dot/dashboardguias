const API_URL = "https://script.google.com/macros/s/AKfycbykPq-urc85pjo59Uy0X9WmzKAMg8BE77L9XvL2GXzD1VKa3nQoHO4bYUOx3sww-cC-vw/exec";

let rawData = null;
let charts = {};

const meses = {
  1: "Jan", 2: "Fev", 3: "Mar", 4: "Abr", 5: "Mai", 6: "Jun",
  7: "Jul", 8: "Ago", 9: "Set", 10: "Out", 11: "Nov", 12: "Dez"
};

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btnRefresh").addEventListener("click", loadData);
  ["filterOrigem", "filterAno", "filterMes"].forEach(id => {
    document.getElementById(id).addEventListener("change", render);
  });

  document.getElementById("searchEspecialidade").addEventListener("input", renderTables);
  document.getElementById("searchExames").addEventListener("input", renderTables);

  loadData();
});

async function loadData() {
  setLoading(true);

  try {
    const response = await fetch(API_URL);
    if (!response.ok) throw new Error("Falha ao acessar API");
    rawData = await response.json();

    setupYearFilter(rawData.registros || []);
    render();

    const date = new Date(rawData.atualizadoEm);
    document.getElementById("lastUpdate").textContent =
      `Última atualização: ${date.toLocaleString("pt-BR")}`;
  } catch (err) {
    document.querySelector(".content").insertAdjacentHTML(
      "afterbegin",
      `<div class="error">Erro ao carregar dados: ${err.message}</div>`
    );
  } finally {
    setLoading(false);
  }
}

function setLoading(isLoading) {
  const text = isLoading ? "Carregando dados..." : "";
  if (isLoading) document.getElementById("lastUpdate").textContent = text;
}

function setupYearFilter(registros) {
  const select = document.getElementById("filterAno");
  const current = select.value;
  const anos = [...new Set(registros.map(r => r.ano).filter(Boolean))].sort();

  select.innerHTML = `<option value="Todos">Todos</option>` +
    anos.map(ano => `<option value="${ano}">${ano}</option>`).join("");

  if (current) select.value = current;
  if (!select.value && anos.length) select.value = anos[anos.length - 1];
}

function getFilteredRecords() {
  if (!rawData) return [];

  const origem = document.getElementById("filterOrigem").value;
  const ano = document.getElementById("filterAno").value;
  const mes = document.getElementById("filterMes").value;

  return rawData.registros.filter(r => {
    if (origem !== "Todas" && r.origem !== origem) return false;
    if (ano !== "Todos" && String(r.ano) !== String(ano)) return false;
    if (mes !== "Todos" && String(r.mes) !== String(mes)) return false;
    return true;
  });
}

function render() {
  const registros = getFilteredRecords();
  const resumo = buildSummary(registros);

  renderCards(resumo.cards);
  renderCharts(registros, resumo);
  renderTables();
}

function buildSummary(registros) {
  return {
    cards: buildCards(registros),
    porMes: groupByMonth(registros),
    porOrigem: groupWithStatus(registros, "origem"),
    porStatus: countBy(registros, "status"),
    porTipoSolicitacao: groupWithStatus(registros, "tipoSolicitacao"),
    porMotivoNegativa: countBy(registros.filter(r => r.status === "Negado"), "motivoNegativa"),
    especialidades: groupWithStatus(registros, "especialidade"),
    exames: groupWithStatus(registros, "exameEspecifico"),
    locaisConsulta: groupWithStatus(registros.filter(r => ["Consulta", "Consulta + Exame"].includes(r.tipoSolicitacao)), "local"),
    locaisExame: groupWithStatus(registros.filter(r => ["Exame", "Consulta + Exame"].includes(r.tipoSolicitacao)), "local")
  };
}

function buildCards(registros) {
  const total = registros.length;
  const count = status => registros.filter(r => r.status === status).length;

  return {
    total,
    aprovadas: count("Aprovado"),
    negadas: count("Negado"),
    parciais: count("Parcial"),
    psicologia: count("Psicologia")
  };
}

function pct(value, total) {
  return total ? `${((value / total) * 100).toFixed(1)}% do total` : "0% do total";
}

function renderCards(c) {
  document.getElementById("cardTotal").textContent = c.total;
  document.getElementById("cardAprovadas").textContent = c.aprovadas;
  document.getElementById("cardNegadas").textContent = c.negadas;
  document.getElementById("cardParciais").textContent = c.parciais;
  document.getElementById("cardPsicologia").textContent = c.psicologia;

  document.getElementById("taxaAprovacao").textContent = pct(c.aprovadas, c.total);
  document.getElementById("taxaNegativa").textContent = pct(c.negadas, c.total);
  document.getElementById("taxaParcial").textContent = pct(c.parciais, c.total);
  document.getElementById("taxaPsicologia").textContent = pct(c.psicologia, c.total);
}

function renderCharts(registros, resumo) {
  const mensal = resumo.porMes;

  drawChart("chartMensal", "line", {
    labels: mensal.map(x => x.label),
    datasets: [
      { label: "Total", data: mensal.map(x => x.total), tension: .35 },
      { label: "Aprovadas", data: mensal.map(x => x.aprovadas), tension: .35 },
      { label: "Negadas", data: mensal.map(x => x.negadas), tension: .35 },
      { label: "Parciais", data: mensal.map(x => x.parciais), tension: .35 }
    ]
  });

  drawChart("chartNegativas", "doughnut", {
    labels: resumo.porMotivoNegativa.slice(0, 8).map(x => x.nome),
    datasets: [{ data: resumo.porMotivoNegativa.slice(0, 8).map(x => x.total) }]
  });

  drawChart("chartTipos", "doughnut", {
    labels: resumo.porTipoSolicitacao.slice(0, 8).map(x => x.nome),
    datasets: [{ data: resumo.porTipoSolicitacao.slice(0, 8).map(x => x.total) }]
  });
}

function drawChart(id, type, data) {
  const ctx = document.getElementById(id);

  if (charts[id]) charts[id].destroy();

  charts[id] = new Chart(ctx, {
    type,
    data,
    options: {
      responsive: true,
      plugins: {
        legend: {
          labels: { color: "#e8eef7" }
        }
      },
      scales: type === "line" ? {
        x: { ticks: { color: "#9aa9bd" }, grid: { color: "rgba(255,255,255,.08)" } },
        y: { ticks: { color: "#9aa9bd" }, grid: { color: "rgba(255,255,255,.08)" } }
      } : undefined
    }
  });
}

function renderTables() {
  const registros = getFilteredRecords();
  const resumo = buildSummary(registros);

  renderTable("tableOrigem", resumo.porOrigem, ["nome", "total", "aprovadas", "negadas", "parciais"]);
  renderSimpleCountTable("tableStatus", resumo.porStatus);
  renderTable("tableEspecialidades", filterSearch(resumo.especialidades, "searchEspecialidade"), ["nome", "total", "aprovadas", "negadas", "parciais"]);
  renderTable("tableExames", filterSearch(resumo.exames, "searchExames"), ["nome", "total", "aprovadas", "negadas", "parciais"]);
  renderTable("tableDestinosConsulta", resumo.locaisConsulta.slice(0, 30), ["nome", "total", "aprovadas", "negadas"]);
  renderTable("tableDestinosExame", resumo.locaisExame.slice(0, 30), ["nome", "total", "aprovadas", "negadas"]);

  const inconsistencias = filterInconsistenciasByCurrentRecords(registros);
  renderInconsistencias(inconsistencias);
}

function filterSearch(items, inputId) {
  const q = document.getElementById(inputId).value.toLowerCase().trim();
  if (!q) return items;
  return items.filter(x => String(x.nome || "").toLowerCase().includes(q));
}

function renderSimpleCountTable(id, items) {
  const html = `
    <div class="table-wrap">
      <table>
        <thead><tr><th>Status</th><th class="num">Total</th></tr></thead>
        <tbody>
          ${items.map(x => `<tr><td>${escapeHtml(x.nome)}</td><td class="num">${x.total}</td></tr>`).join("")}
        </tbody>
      </table>
    </div>`;
  document.getElementById(id).innerHTML = html;
}

function renderTable(id, items, fields) {
  const labels = {
    nome: "Nome",
    total: "Total",
    aprovadas: "Aprovadas",
    negadas: "Negadas",
    parciais: "Parciais"
  };

  const html = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>${fields.map(f => `<th class="${f !== "nome" ? "num" : ""}">${labels[f] || f}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${items.map(item => `
            <tr>
              ${fields.map(f => `<td class="${f !== "nome" ? "num" : ""}">${escapeHtml(item[f] ?? 0)}</td>`).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>`;
  document.getElementById(id).innerHTML = html;
}

function renderInconsistencias(items) {
  const html = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Campo</th>
            <th>Valor encontrado</th>
            <th>Normalizado</th>
            <th class="num">Qtde</th>
          </tr>
        </thead>
        <tbody>
          ${items.slice(0, 100).map(x => `
            <tr>
              <td>${escapeHtml(x.campo)}</td>
              <td>${escapeHtml(x.valorOriginal)}</td>
              <td>${escapeHtml(x.valorNormalizado)}</td>
              <td class="num">${x.quantidade}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>`;

  document.getElementById("tableInconsistencias").innerHTML = html;
}

function filterInconsistenciasByCurrentRecords(registros) {
  if (!rawData || !rawData.inconsistencias) return [];

  const allowed = new Set();
  registros.forEach(r => {
    ["especialidadeOriginal", "tipoExameOriginal", "exameEspecificoOriginal", "localOriginal"].forEach(k => {
      if (r[k]) allowed.add(String(r[k]));
    });
  });

  return rawData.inconsistencias.filter(x => allowed.has(String(x.valorOriginal)));
}

function countBy(registros, campo) {
  const mapa = {};
  registros.forEach(r => {
    const key = r[campo] || "Não informado";
    mapa[key] = (mapa[key] || 0) + 1;
  });
  return Object.entries(mapa)
    .map(([nome, total]) => ({ nome, total }))
    .sort((a, b) => b.total - a.total);
}

function groupWithStatus(registros, campo) {
  const mapa = {};
  registros.forEach(r => {
    const key = r[campo] || "Não informado";
    if (!mapa[key]) {
      mapa[key] = { nome: key, total: 0, aprovadas: 0, negadas: 0, parciais: 0 };
    }
    mapa[key].total++;
    if (r.status === "Aprovado") mapa[key].aprovadas++;
    if (r.status === "Negado") mapa[key].negadas++;
    if (r.status === "Parcial") mapa[key].parciais++;
  });
  return Object.values(mapa).sort((a, b) => b.total - a.total);
}

function groupByMonth(registros) {
  const mapa = {};
  registros.forEach(r => {
    if (!r.ano || !r.mes) return;
    const key = `${r.ano}-${String(r.mes).padStart(2, "0")}`;
    if (!mapa[key]) {
      mapa[key] = {
        key,
        label: `${meses[r.mes]}/${r.ano}`,
        total: 0,
        aprovadas: 0,
        negadas: 0,
        parciais: 0
      };
    }
    mapa[key].total++;
    if (r.status === "Aprovado") mapa[key].aprovadas++;
    if (r.status === "Negado") mapa[key].negadas++;
    if (r.status === "Parcial") mapa[key].parciais++;
  });
  return Object.values(mapa).sort((a, b) => a.key.localeCompare(b.key));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
