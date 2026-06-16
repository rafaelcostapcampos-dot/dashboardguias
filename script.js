const API_URL = "https://script.google.com/macros/s/AKfycbykPq-urc85pjo59Uy0X9WmzKAMg8BE77L9XvL2GXzD1VKa3nQoHO4bYUOx3sww-cC-vw/exec";

let rawData = null;
let charts = {};
let cardAnimationFrame = null;

const meses = {
  1: "Jan", 2: "Fev", 3: "Mar", 4: "Abr", 5: "Mai", 6: "Jun",
  7: "Jul", 8: "Ago", 9: "Set", 10: "Out", 11: "Nov", 12: "Dez"
};

const chartPalette = ["#4f8cff", "#42d77d", "#ff6575", "#f7b955", "#a47cff", "#27d3c3", "#f472b6", "#94a3b8"];

document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("btnRefresh").addEventListener("click", loadData);
  document.getElementById("btnExportPdf").addEventListener("click", exportarPDF);
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
  const registrosNormalizados = registros.map(normalizeRecordForDashboard);
  const consultas = registrosNormalizados.filter(isConsultaRecord);
  const exames = registrosNormalizados.filter(isExameRecord);

  return {
    cards: buildCards(registrosNormalizados),
    porMes: groupByMonth(registrosNormalizados),
    porOrigem: groupWithStatus(registrosNormalizados, "origem"),
    porStatus: countBy(registrosNormalizados, "status"),
    porTipoSolicitacao: groupWithStatus(registrosNormalizados, "tipoSolicitacao"),
    porMotivoNegativa: countBy(registrosNormalizados.filter(r => r.status === "Negado"), "motivoNegativa"),
    especialidades: groupWithStatus(consultas, "especialidade", { skipInvalid: true }),
    exames: groupWithStatus(exames, "exameEspecifico", { skipInvalid: true }),
    locaisConsulta: groupWithStatus(consultas, "local"),
    locaisExame: groupWithStatus(exames, "local")
  };
}

function isConsultaRecord(registro) {
  return registro.tipoSolicitacao === "Consulta" || registro.tipoSolicitacao === "Consulta + Exame";
}

function isExameRecord(registro) {
  return registro.tipoSolicitacao === "Exame" || registro.tipoSolicitacao === "Consulta + Exame";
}

function normalizeRecordForDashboard(registro) {
  return {
    ...registro,
    especialidade: normalizeEspecialidade(registro.especialidade),
    tipoExame: normalizeExame(registro.tipoExame),
    exameEspecifico: normalizeExame(registro.exameEspecifico)
  };
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function isValidRankingValue(value) {
  const t = normalizeText(value);
  return Boolean(
    t &&
    ![
      "nao informado",
      "nao informada",
      "naoinformado",
      "naoinformada",
      "nao se aplica",
      "nenhum",
      "nenhuma",
      "sem informacao",
      "sem informacoes",
      "sem dados",
      "vazio"
    ].includes(t)
  );
}

function normalizeEspecialidade(value) {
  const t = normalizeText(value);
  if (!isValidRankingValue(t)) return "";

  const aliases = {
    alergista: "Alergologia",
    cardio: "Cardiologia",
    cardiologista: "Cardiologia",
    dermato: "Dermatologia",
    dermatologista: "Dermatologia",
    endocrinologista: "Endocrinologia",
    ginecologista: "Ginecologia",
    neurologista: "Neurologia",
    oftalmologista: "Oftalmologia",
    ortop: "Ortopedia",
    ortopedista: "Ortopedia",
    otorrino: "Otorrinolaringologia",
    otorrinolaringologista: "Otorrinolaringologia",
    pneumologista: "Pneumologia",
    urologista: "Urologia"
  };

  const palavras = t.split(" ");
  const ultimoTermo = palavras[palavras.length - 1];

  return aliases[t] || aliases[ultimoTermo] || value;
}

function normalizeExame(value) {
  const t = normalizeText(value);
  if (!isValidRankingValue(t)) return "";

  if (t.includes("ecocardiograma") || t.includes("ecott") || t.includes("ectt") || t.includes("ecodopplercardiograma")) {
    return "Ecocardiograma Transtorácico (ECOTT)";
  }

  if (
    t.includes("oct") ||
    t.includes("mapeamento de retina") ||
    t.includes("retinografia") ||
    t.includes("campimetria") ||
    t.includes("paquimetria") ||
    t.includes("tonometria") ||
    t.includes("gonioscopia") ||
    t.includes("biometria ocular") ||
    t.includes("topografia corneana") ||
    t.includes("curva tensional diaria") ||
    t.includes("campo visual") ||
    t.includes("microscopia especular") ||
    t.includes("teste ortoptico") ||
    t.includes("exames oftalmologicos") ||
    t.includes("exame oftalmologico") ||
    t.includes("exames oftamologicos") ||
    t.includes("exame oftamologico")
  ) {
    return "Exames oftalmológicos";
  }

  if (t.includes("tomografia") || t.split(" ").includes("tc")) return "Tomografia Computadorizada (TC)";
  if (t.includes("ressonancia") || t.split(" ").includes("rm") || t.split(" ").includes("rmn")) return "Ressonância magnética (RM)";
  if (t.includes("ultrassom") || t.includes("ultrassonografia") || t.includes("ultrason") || t.includes("doppler") || t.split(" ").includes("us") || t.split(" ").includes("usg")) return "Ultrassonografia (USG)";
  if (t.includes("mamografia")) return "Mamografia";
  if (t.includes("densitometria") || t.includes("densiometria")) return "Densitometria óssea";
  if (t.includes("rx") || t.includes("raio x") || t.includes("raiox")) return "Raio X";

  return value;
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
  animateCardNumbers({
    cardTotal: c.total,
    cardAprovadas: c.aprovadas,
    cardNegadas: c.negadas,
    cardParciais: c.parciais,
    cardPsicologia: c.psicologia
  });

  document.getElementById("taxaAprovacao").textContent = pct(c.aprovadas, c.total);
  document.getElementById("taxaNegativa").textContent = pct(c.negadas, c.total);
  document.getElementById("taxaParcial").textContent = pct(c.parciais, c.total);
  document.getElementById("taxaPsicologia").textContent = pct(c.psicologia, c.total);
}

function animateCardNumbers(values) {
  if (cardAnimationFrame) cancelAnimationFrame(cardAnimationFrame);

  const entries = Object.entries(values).map(([id, target]) => {
    const el = document.getElementById(id);
    const current = Number(String(el.textContent || "0").replace(/\D/g, "")) || 0;
    return { el, current, target: Number(target) || 0 };
  });
  const start = performance.now();
  const duration = 650;

  const tick = now => {
    const progress = Math.min((now - start) / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);

    entries.forEach(({ el, current, target }) => {
      const value = Math.round(current + (target - current) * eased);
      el.textContent = value.toLocaleString("pt-BR");
    });

    if (progress < 1) {
      cardAnimationFrame = requestAnimationFrame(tick);
    }
  };

  cardAnimationFrame = requestAnimationFrame(tick);
}

function renderCharts(registros, resumo) {
  const mensal = resumo.porMes;

  drawChart("chartMensal", "bar", {
    labels: mensal.map(x => x.label),
    datasets: [
      {
        label: "Total",
        data: mensal.map(x => x.total),
        borderRadius: 10,
        borderSkipped: false
      },
      {
        label: "Aprovadas",
        data: mensal.map(x => x.aprovadas),
        borderRadius: 10,
        borderSkipped: false
      },
      {
        label: "Negadas",
        data: mensal.map(x => x.negadas),
        borderRadius: 10,
        borderSkipped: false
      },
      {
        label: "Parciais",
        data: mensal.map(x => x.parciais),
        borderRadius: 10,
        borderSkipped: false
      }
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

  data.datasets = data.datasets.map((dataset, index) => ({
    ...dataset,
    backgroundColor: type === "doughnut"
      ? chartPalette
      : chartPalette[index % chartPalette.length],
    borderColor: type === "doughnut"
      ? "#0c1828"
      : chartPalette[index % chartPalette.length],
    borderWidth: type === "doughnut" ? 3 : 0,
    hoverOffset: type === "doughnut" ? 10 : 0
  }));

  const baseOptions = {
    responsive: true,
    maintainAspectRatio: false,
    animation: {
      duration: 900,
      easing: "easeOutQuart"
    },
    plugins: {
      legend: {
        labels: {
          color: "#e8eef7",
          usePointStyle: true,
          boxWidth: 10,
          padding: 16
        }
      },
      tooltip: {
        backgroundColor: "rgba(8, 17, 31, .95)",
        titleColor: "#ffffff",
        bodyColor: "#e8eef7",
        borderColor: "rgba(255,255,255,.14)",
        borderWidth: 1,
        padding: 12,
        displayColors: true
      }
    },
    scales: type === "doughnut" ? undefined : {
      x: {
        ticks: {
          color: "#b8c6da",
          font: { size: 12, weight: "600" }
        },
        grid: { display: false }
      },
      y: {
        beginAtZero: true,
        ticks: {
          color: "#9aa9bd",
          font: { size: 11 }
        },
        grid: { color: "rgba(255,255,255,.08)" }
      }
    }
  };

  if (type === "bar") {
    baseOptions.scales.x.stacked = false;
    baseOptions.scales.y.stacked = false;
    baseOptions.categoryPercentage = 0.72;
    baseOptions.barPercentage = 0.78;
  }

  if (type === "doughnut") {
    baseOptions.cutout = "62%";
  }

  charts[id] = new Chart(ctx, {
    type,
    data,
    options: baseOptions
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

  const maxTotal = Math.max(...items.map(item => Number(item.total || 0)), 1);

  const html = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>${fields.map(f => `<th class="${f !== "nome" ? "num" : ""}">${labels[f] || f}</th>`).join("")}</tr>
        </thead>
        <tbody>
          ${items.map(item => `
            <tr>
              ${fields.map(f => renderTableCell(item, f, maxTotal)).join("")}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>`;
  document.getElementById(id).innerHTML = html;
}

function renderTableCell(item, field, maxTotal) {
  if (field === "total") {
    const value = Number(item.total || 0);
    const width = Math.max((value / maxTotal) * 100, value ? 6 : 0);

    return `
      <td class="num">
        <div class="metric-cell">
          <span class="metric-value">${escapeHtml(value)}</span>
          <span class="metric-bar"><span class="metric-fill" style="width:${width}%"></span></span>
        </div>
      </td>
    `;
  }

  return `<td class="${field !== "nome" ? "num" : ""}">${escapeHtml(item[field] ?? 0)}</td>`;
}

function renderInconsistencias(items) {
  const grupos = montarSugestoesDicionario(items);

  const html = `
    <div class="dictionary-actions">
      <button class="small-btn" onclick="copiarDicionario('ESPECIALIDADE')">Copiar ESPECIALIDADE</button>
      <button class="small-btn" onclick="copiarDicionario('EXAME')">Copiar EXAME</button>
      <button class="small-btn" onclick="copiarDicionario('LOCAL')">Copiar LOCAL</button>
      <button class="small-btn" onclick="copiarDicionario('TODOS')">Copiar TODOS</button>
    </div>

    ${renderGrupoDicionario("ESPECIALIDADE", grupos.ESPECIALIDADE)}
    ${renderGrupoDicionario("EXAME", grupos.EXAME)}
    ${renderGrupoDicionario("LOCAL", grupos.LOCAL)}
  `;

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


function montarSugestoesDicionario(items) {
  const grupos = {
    ESPECIALIDADE: [],
    EXAME: [],
    LOCAL: []
  };

  const vistos = new Set();

  items.forEach(item => {
    const campo = String(item.campo || "").toLowerCase();
    let aba = null;

    if (campo.includes("especialidade")) aba = "ESPECIALIDADE";
    if (campo.includes("exame")) aba = "EXAME";
    if (campo.includes("local")) aba = "LOCAL";

    if (!aba) return;

    const encontrado = String(item.valorNormalizado || item.valorOriginal || "").trim().toLowerCase();
    const padronizado = capitalizarParaExibicao(item.valorOriginal || item.valorNormalizado || "");

    if (!encontrado || !padronizado) return;

    const key = aba + "|" + encontrado;
    if (vistos.has(key)) return;
    vistos.add(key);

    grupos[aba].push({
      aba,
      encontrado,
      padronizado,
      quantidade: item.quantidade || 0
    });
  });

  Object.keys(grupos).forEach(k => {
    grupos[k].sort((a, b) => b.quantidade - a.quantidade);
  });

  return grupos;
}

function renderGrupoDicionario(titulo, rows) {
  if (!rows || !rows.length) {
    return `
      <div class="dict-group">
        <h4>${titulo}</h4>
        <p class="hint">Nenhuma inconsistência encontrada para esta aba.</p>
      </div>
    `;
  }

  return `
    <div class="dict-group">
      <h4>${titulo}</h4>
      <div class="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Encontrado</th>
              <th>Padronizado</th>
              <th class="num">Qtde</th>
            </tr>
          </thead>
          <tbody>
            ${rows.slice(0, 80).map(row => `
              <tr>
                <td>${escapeHtml(row.encontrado)}</td>
                <td>${escapeHtml(row.padronizado)}</td>
                <td class="num">${row.quantidade}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>
    </div>
  `;
}

function copiarDicionario(tipo) {
  const registros = getFilteredRecords();
  const inconsistencias = filterInconsistenciasByCurrentRecords(registros);
  const grupos = montarSugestoesDicionario(inconsistencias);

  let linhas = [];

  const adicionar = (aba, rows) => {
    rows.forEach(r => {
      linhas.push(`${r.encontrado}\t${r.padronizado}`);
    });
  };

  if (tipo === "TODOS") {
    adicionar("ESPECIALIDADE", grupos.ESPECIALIDADE);
    adicionar("EXAME", grupos.EXAME);
    adicionar("LOCAL", grupos.LOCAL);
  } else {
    adicionar(tipo, grupos[tipo] || []);
  }

  if (!linhas.length) {
    alert("Não há itens para copiar.");
    return;
  }

  navigator.clipboard.writeText(linhas.join("\n"))
    .then(() => alert(`Copiado. Cole na aba ${tipo === "TODOS" ? "correspondente" : tipo}, a partir da linha 2.`))
    .catch(() => {
      const area = document.createElement("textarea");
      area.value = linhas.join("\n");
      document.body.appendChild(area);
      area.select();
      document.execCommand("copy");
      area.remove();
      alert(`Copiado. Cole na aba ${tipo === "TODOS" ? "correspondente" : tipo}, a partir da linha 2.`);
    });
}

function capitalizarParaExibicao(texto) {
  const preposicoes = new Set(["de", "da", "do", "das", "dos", "e", "em", "no", "na", "nos", "nas", "para", "por"]);
  const siglas = new Set(["rm", "rmn", "tc", "usg", "rx", "oct", "ecg", "eeg", "mapa", "holter", "fr", "iobh"]);

  return String(texto || "")
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .map((p, idx) => {
      const limpo = p.replace(/[().,:;]/g, "");
      if (siglas.has(limpo)) return p.toUpperCase();
      if (idx > 0 && preposicoes.has(p)) return p;
      return p.charAt(0).toUpperCase() + p.slice(1);
    })
    .join(" ");
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

function groupWithStatus(registros, campo, options = {}) {
  const mapa = {};
  registros.forEach(r => {
    if (options.skipInvalid && !isValidRankingValue(r[campo])) return;

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




function exportarPDF() {
  const registros = getFilteredRecords();
  const resumo = buildSummary(registros);
  const origem = document.getElementById("filterOrigem").value;
  const ano = document.getElementById("filterAno").value;
  const mes = document.getElementById("filterMes").value;
  const periodo = mes === "Todos" ? `Ano ${ano}` : `${meses[Number(mes)]}/${ano}`;
  const atualizacao = rawData?.atualizadoEm ? new Date(rawData.atualizadoEm).toLocaleString("pt-BR") : new Date().toLocaleString("pt-BR");

  const topEsp = resumo.especialidades.slice(0, 8);
  const topExames = resumo.exames.slice(0, 8);
  const topConsulta = resumo.locaisConsulta.slice(0, 8);
  const topExame = resumo.locaisExame.slice(0, 8);
  const motivos = resumo.porMotivoNegativa.slice(0, 6);
  const mensal = resumo.porMes;

  const html = `
<!doctype html>
<html>
<head>
<meta charset="utf-8">
<title>Relatório Executivo - Solicitações de Guias</title>
<style>
  @page { size: A4 landscape; margin: 9mm; }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    background: #08111f;
    color: #eef5ff;
    font-family: Inter, Arial, sans-serif;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .page {
    width: 100%;
    min-height: 190mm;
    padding: 18px;
    background:
      radial-gradient(circle at 10% 10%, rgba(48,108,255,.35), transparent 28%),
      radial-gradient(circle at 92% 15%, rgba(52,194,107,.18), transparent 25%),
      linear-gradient(135deg, #0b1524 0%, #10243d 100%);
  }
  .hero {
    display: grid;
    grid-template-columns: 1.1fr .9fr;
    gap: 14px;
    margin-bottom: 14px;
  }
  .titlebox, .glass {
    background: rgba(255,255,255,.075);
    border: 1px solid rgba(255,255,255,.16);
    border-radius: 18px;
    box-shadow: 0 16px 38px rgba(0,0,0,.24);
    backdrop-filter: blur(8px);
  }
  .titlebox { padding: 22px; }
  h1 { margin: 0; font-size: 34px; letter-spacing: -.8px; }
  .subtitle { margin: 7px 0 0; color: #aebbd0; font-size: 14px; }
  .meta {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    padding: 14px;
  }
  .meta div { padding: 12px; border-radius: 14px; background: rgba(255,255,255,.07); }
  .meta span { display:block; color:#aebbd0; font-size:11px; text-transform:uppercase; letter-spacing:.7px; }
  .meta strong { display:block; margin-top:4px; font-size:18px; }

  .kpis {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 10px;
    margin-bottom: 14px;
  }
  .kpi {
    padding: 14px;
    border-radius: 18px;
    min-height: 92px;
    box-shadow: 0 16px 30px rgba(0,0,0,.2);
  }
  .kpi b { display:block; font-size: 28px; margin-top: 7px; }
  .kpi span { font-size: 12px; font-weight: 700; }
  .kpi small { color: rgba(255,255,255,.82); }
  .blue { background: linear-gradient(135deg,#1848b8,#3b82f6); }
  .green { background: linear-gradient(135deg,#16763d,#34c26b); }
  .red { background: linear-gradient(135deg,#9f2c39,#ef5350); }
  .orange { background: linear-gradient(135deg,#b45c0c,#f5a623); }
  .purple { background: linear-gradient(135deg,#4b35aa,#7c4dff); }

  .grid {
    display: grid;
    grid-template-columns: 1.15fr .85fr;
    gap: 12px;
    margin-bottom: 12px;
  }
  .grid4 {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }
  .panel {
    padding: 14px;
    border-radius: 18px;
    background: rgba(255,255,255,.075);
    border: 1px solid rgba(255,255,255,.16);
    box-shadow: 0 16px 32px rgba(0,0,0,.18);
    break-inside: avoid;
  }
  h2 {
    margin: 0 0 10px;
    font-size: 15px;
    letter-spacing: -.2px;
  }
  .bars { display: grid; gap: 8px; }
  .bar-row { display:grid; grid-template-columns: 130px 1fr 45px; gap:8px; align-items:center; font-size: 11px; }
  .bar-track { height: 9px; border-radius: 99px; background: rgba(255,255,255,.12); overflow:hidden; }
  .bar-fill { height:100%; border-radius:99px; background: linear-gradient(90deg,#3b82f6,#34c26b); }
  table { width:100%; border-collapse: collapse; font-size: 10.5px; }
  th, td { padding: 6px 6px; border-bottom:1px solid rgba(255,255,255,.10); text-align:left; }
  th { color:#aebbd0; font-size: 10px; text-transform:uppercase; letter-spacing:.4px; }
  td.num, th.num { text-align:right; }
  .footer {
    margin-top: 12px;
    color:#aebbd0;
    font-size: 10px;
    display:flex;
    justify-content:space-between;
  }
  .pagebreak { page-break-before: always; }
  @media print {
    body { background:#08111f; }
  }
</style>
</head>
<body>
  <section class="page">
    <div class="hero">
      <div class="titlebox">
        <h1>Relatório Executivo de Guias</h1>
        <p class="subtitle">Painel quantitativo de solicitações, autorizações, negativas e encaminhamentos.</p>
      </div>
      <div class="glass meta">
        <div><span>Origem</span><strong>${escapeHtml(origem)}</strong></div>
        <div><span>Período</span><strong>${escapeHtml(periodo)}</strong></div>
        <div><span>Atualizado</span><strong>${escapeHtml(atualizacao)}</strong></div>
      </div>
    </div>

    <div class="kpis">
      ${kpi("Total", resumo.cards.total, "100% do período", "blue")}
      ${kpi("Aprovadas", resumo.cards.aprovadas, pct(resumo.cards.aprovadas, resumo.cards.total), "green")}
      ${kpi("Negadas", resumo.cards.negadas, pct(resumo.cards.negadas, resumo.cards.total), "red")}
      ${kpi("Parciais", resumo.cards.parciais, pct(resumo.cards.parciais, resumo.cards.total), "orange")}
      ${kpi("Psicologia", resumo.cards.psicologia, pct(resumo.cards.psicologia, resumo.cards.total), "purple")}
    </div>

    <div class="grid">
      <div class="panel">
        <h2>Evolução mensal</h2>
        ${barList(mensal.map(x => ({ nome: x.label, total: x.total })), 12)}
      </div>
      <div class="panel">
        <h2>Motivos de negativa</h2>
        ${barList(motivos, 6)}
      </div>
    </div>

    <div class="grid4">
      <div class="panel">
        <h2>Top especialidades</h2>
        ${miniTable(topEsp, ["nome","total","aprovadas","negadas"])}
      </div>
      <div class="panel">
        <h2>Top exames</h2>
        ${miniTable(topExames, ["nome","total","aprovadas","negadas"])}
      </div>
      <div class="panel">
        <h2>Destinos - Consultas</h2>
        ${miniTable(topConsulta, ["nome","total"])}
      </div>
      <div class="panel">
        <h2>Destinos - Exames</h2>
        ${miniTable(topExame, ["nome","total"])}
      </div>
    </div>

    <div class="footer">
      <span>Fonte: planilhas Online e Presencial integradas via Google Apps Script.</span>
      <span>Gerado automaticamente pelo Dashboard de Guias.</span>
    </div>
  </section>
</body>
</html>`;

  const win = window.open("", "_blank");
  win.document.open();
  win.document.write(html);
  win.document.close();

  setTimeout(() => {
    win.focus();
    win.print();
  }, 800);
}

function kpi(label, value, sub, cls) {
  return `<div class="kpi ${cls}"><span>${escapeHtml(label)}</span><b>${value}</b><small>${escapeHtml(sub)}</small></div>`;
}

function barList(items, limit) {
  const arr = items.slice(0, limit);
  const max = Math.max(...arr.map(x => x.total || 0), 1);
  return `<div class="bars">${arr.map(x => {
    const w = ((x.total || 0) / max) * 100;
    return `<div class="bar-row">
      <div>${escapeHtml(x.nome || x.label || "Não informado")}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${w}%"></div></div>
      <div style="text-align:right">${x.total || 0}</div>
    </div>`;
  }).join("")}</div>`;
}

function miniTable(items, fields) {
  const labels = { nome:"Nome", total:"Total", aprovadas:"Aut.", negadas:"Neg." };
  return `<table>
    <thead><tr>${fields.map(f => `<th class="${f !== "nome" ? "num" : ""}">${labels[f] || f}</th>`).join("")}</tr></thead>
    <tbody>
      ${items.map(item => `<tr>${fields.map(f => `<td class="${f !== "nome" ? "num" : ""}">${escapeHtml(item[f] ?? 0)}</td>`).join("")}</tr>`).join("")}
    </tbody>
  </table>`;
}
