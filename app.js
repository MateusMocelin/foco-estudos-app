import { firebaseConfig } from "./firebase-config.js";
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import {
  getAuth, GoogleAuthProvider, signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import {
  getFirestore, collection, doc, onSnapshot, setDoc, deleteDoc
} from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const PALETA = [
  0xFF4F46E5, 0xFF0EA5E9, 0xFF14B8A6, 0xFF10B981, 0xFF84CC16,
  0xFFF59E0B, 0xFFEF4444, 0xFFEC4899, 0xFF8B5CF6, 0xFF64748B
];

const estado = { uid: null, materias: [], sessoes: [], desinscrever: [] };
const $ = (sel) => document.querySelector(sel);

// --- formatação -------------------------------------------------------------

const cor = (argb) => "#" + (Number(argb) & 0xFFFFFF).toString(16).padStart(6, "0");
const doisDigitos = (n) => String(n).padStart(2, "0");

function fmtRelogio(seg) {
  seg = Math.max(0, Math.floor(seg));
  const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60), s = seg % 60;
  return h > 0 ? `${h}:${doisDigitos(m)}:${doisDigitos(s)}` : `${doisDigitos(m)}:${doisDigitos(s)}`;
}

function fmtHumano(seg) {
  seg = Math.max(0, Math.floor(seg));
  const h = Math.floor(seg / 3600), m = Math.floor((seg % 3600) / 60);
  if (h > 0 && m > 0) return `${h}h ${m}min`;
  if (h > 0) return `${h}h`;
  if (m > 0) return `${m}min`;
  return `${seg}s`;
}

const fmtAcerto = (acertos, total) => total > 0 ? Math.round(acertos * 100 / total) + "%" : "—";
const fmtHora = (ms) => new Date(ms).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const diaChave = (ms) => { const d = new Date(ms); d.setHours(0, 0, 0, 0); return d.getTime(); };

const paraInputData = (ms) => {
  const d = new Date(ms);
  return d.getFullYear() + "-" + doisDigitos(d.getMonth() + 1) + "-" + doisDigitos(d.getDate());
};
const paraInputHora = (ms) => {
  const d = new Date(ms);
  return doisDigitos(d.getHours()) + ":" + doisDigitos(d.getMinutes());
};
/** Data e hora dos campos viram instante no fuso do navegador (sem o Z do UTC). */
const deInputs = (data, hora) => {
  const quando = new Date((data || paraInputData(Date.now())) + "T" + (hora || "12:00") + ":00");
  return isNaN(quando.getTime()) ? Date.now() : quando.getTime();
};

function fmtDiaTitulo(ms) {
  const hoje = diaChave(Date.now());
  const dia = diaChave(ms);
  if (dia === hoje) return "Hoje";
  if (dia === hoje - 86400000) return "Ontem";
  return new Date(ms).toLocaleDateString("pt-BR", { day: "numeric", month: "long" });
}

/** Segunda-feira da semana atual. */
function inicioDaSemana() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  const diasDesdeSegunda = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - diasDesdeSegunda);
  return d.getTime();
}

function avisar(texto) {
  const el = $("#aviso");
  el.textContent = texto;
  el.hidden = false;
  clearTimeout(avisar.timer);
  avisar.timer = setTimeout(() => { el.hidden = true; }, 3200);
}

// --- autenticação -----------------------------------------------------------

$("#btn-entrar").addEventListener("click", async () => {
  const erro = $("#erro-login");
  erro.hidden = true;
  try {
    await signInWithPopup(auth, new GoogleAuthProvider());
  } catch (e) {
    erro.textContent = e.code === "auth/popup-closed-by-user"
      ? "A janela de login foi fechada antes de concluir."
      : "Não foi possível entrar: " + (e.message || e.code);
    erro.hidden = false;
  }
});

$("#btn-sair").addEventListener("click", () => signOut(auth));

onAuthStateChanged(auth, (usuario) => {
  estado.desinscrever.forEach((fn) => fn());
  estado.desinscrever = [];

  $("#carregando").hidden = true;
  if (!usuario) {
    estado.uid = null;
    estado.materias = [];
    estado.sessoes = [];
    $("#login").hidden = false;
    $("#app").hidden = true;
    return;
  }

  estado.uid = usuario.uid;
  $("#email").textContent = usuario.email || "";
  $("#login").hidden = true;
  $("#app").hidden = false;
  escutar();
});

// --- escuta em tempo real ---------------------------------------------------

const colMaterias = () => collection(db, "users", estado.uid, "subjects");
const colSessoes = () => collection(db, "users", estado.uid, "sessions");

function escutar() {
  estado.desinscrever.push(onSnapshot(colMaterias(), (snap) => {
    estado.materias = snap.docs
      .map((d) => ({ remoteId: d.id, ...d.data() }))
      .sort((a, b) => Number(a.archived) - Number(b.archived) ||
        (a.name || "").localeCompare(b.name || "", "pt-BR"));
    renderTudo();
  }, (e) => avisar("Erro ao ler matérias: " + e.message)));

  estado.desinscrever.push(onSnapshot(colSessoes(), (snap) => {
    estado.sessoes = snap.docs
      .map((d) => ({ remoteId: d.id, ...d.data() }))
      .sort((a, b) => (b.startAt || 0) - (a.startAt || 0));
    renderTudo();
  }, (e) => avisar("Erro ao ler sessões: " + e.message)));
}

const materiaPor = (remoteId) => estado.materias.find((m) => m.remoteId === remoteId);

// --- abas -------------------------------------------------------------------

document.querySelectorAll("header nav button").forEach((botao) => {
  botao.addEventListener("click", () => {
    document.querySelectorAll("header nav button").forEach((b) => b.classList.remove("ativa"));
    botao.classList.add("ativa");
    ["painel", "sessoes", "materias", "cronometro"].forEach((aba) => {
      $("#aba-" + aba).hidden = aba !== botao.dataset.aba;
    });
  });
});

// --- render -----------------------------------------------------------------

function escapar(texto) {
  return String(texto ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function renderTudo() {
  renderPainel();
  renderSessoes();
  renderMaterias();
  renderSeletoresDeMateria();
}

function somaSessoes(lista) {
  return lista.reduce((acc, s) => ({
    segundos: acc.segundos + (s.seconds || 0),
    paginas: acc.paginas + (s.pages || 0),
    questoes: acc.questoes + (s.questions || 0),
    acertos: acc.acertos + (s.questionsCorrect || 0)
  }), { segundos: 0, paginas: 0, questoes: 0, acertos: 0 });
}

function renderPainel() {
  const hoje = diaChave(Date.now());
  const semana = inicioDaSemana();

  const totalHoje = somaSessoes(estado.sessoes.filter((s) => diaChave(s.startAt) === hoje));
  const totalSemana = somaSessoes(estado.sessoes.filter((s) => s.startAt >= semana));
  const total = somaSessoes(estado.sessoes);

  $("#k-hoje").textContent = fmtHumano(totalHoje.segundos);
  $("#k-semana").textContent = fmtHumano(totalSemana.segundos);
  $("#k-total").textContent = fmtHumano(total.segundos);
  $("#k-paginas").textContent = total.paginas;
  $("#k-ritmo").textContent = total.segundos > 0 && total.paginas > 0
    ? Math.round(total.paginas * 3600 / total.segundos) + " páginas por hora" : "";
  $("#k-questoes").textContent = total.questoes;
  $("#k-acerto").textContent = total.questoes > 0
    ? total.acertos + " acertos · " + fmtAcerto(total.acertos, total.questoes) : "";

  renderGrafico();
  renderMetas(semana);
  renderPorMateria();
}

function renderGrafico() {
  const dias = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const chave = d.getTime();
    const seg = estado.sessoes
      .filter((s) => diaChave(s.startAt) === chave)
      .reduce((a, s) => a + (s.seconds || 0), 0);
    dias.push({ data: d, segundos: seg });
  }
  const maximo = Math.max(1, ...dias.map((d) => d.segundos));
  $("#grafico").innerHTML = dias.map((d) => {
    const altura = Math.max(2, d.segundos / maximo * 100);
    const rotulo = d.data.getDate() + "/" + (d.data.getMonth() + 1);
    return '<div class="dia" title="' + fmtHumano(d.segundos) + '">' +
      '<div class="barra-area"><div class="barra" style="height:' + altura + '%"></div></div>' +
      '<div class="rotulo">' + rotulo + '</div></div>';
  }).join("");
}

function renderMetas(semana) {
  const comMeta = estado.materias.filter((m) => !m.archived && (m.weeklyGoalMinutes || 0) > 0);
  if (comMeta.length === 0) {
    $("#metas").innerHTML = '<p class="vazio">Nenhuma matéria tem meta semanal definida.</p>';
    return;
  }
  $("#metas").innerHTML = comMeta.map((m) => {
    const feito = estado.sessoes
      .filter((s) => s.subjectRemoteId === m.remoteId && s.startAt >= semana)
      .reduce((a, s) => a + (s.seconds || 0), 0);
    const alvo = m.weeklyGoalMinutes * 60;
    const pct = Math.min(100, feito / alvo * 100);
    return '<div class="linha">' +
      '<span class="ponto" style="background:' + cor(m.color) + '"></span>' +
      '<div class="cresce"><div>' + escapar(m.name) + '</div>' +
      '<div class="progresso"><div style="width:' + pct + '%;background:' + cor(m.color) +
      '"></div></div></div>' +
      '<span class="sub">' + fmtHumano(feito) + ' / ' + fmtHumano(alvo) + '</span></div>';
  }).join("");
}

function renderPorMateria() {
  const porMateria = estado.materias.map((m) => {
    const t = somaSessoes(estado.sessoes.filter((s) => s.subjectRemoteId === m.remoteId));
    return Object.assign({ materia: m }, t);
  }).filter((x) => x.segundos > 0).sort((a, b) => b.segundos - a.segundos);

  if (porMateria.length === 0) {
    $("#por-materia").innerHTML = '<p class="vazio">Nenhuma sessão registrada ainda.</p>';
    return;
  }
  const maior = Math.max(1, ...porMateria.map((x) => x.segundos));
  $("#por-materia").innerHTML = porMateria.map((x) => {
    let detalhe = fmtHumano(x.segundos);
    if (x.paginas) detalhe += ' · ' + x.paginas + ' pág.';
    if (x.questoes) {
      detalhe += ' · ' + x.acertos + '/' + x.questoes + ' q. (' +
        fmtAcerto(x.acertos, x.questoes) + ')';
    }
    return '<div class="linha">' +
      '<span class="ponto" style="background:' + cor(x.materia.color) + '"></span>' +
      '<div class="cresce"><div>' + escapar(x.materia.name) + '</div>' +
      '<div class="progresso"><div style="width:' + (x.segundos / maior * 100) +
      '%;background:' + cor(x.materia.color) + '"></div></div></div>' +
      '<span class="sub">' + detalhe + '</span></div>';
  }).join("");
}

function renderSessoes() {
  const filtro = $("#filtro-materia").value;
  const lista = filtro
    ? estado.sessoes.filter((s) => s.subjectRemoteId === filtro)
    : estado.sessoes;

  if (lista.length === 0) {
    $("#lista-sessoes").innerHTML = '<p class="vazio">Nenhuma sessão registrada.</p>';
    return;
  }

  const porDia = new Map();
  lista.forEach((s) => {
    const chave = diaChave(s.startAt);
    if (!porDia.has(chave)) porDia.set(chave, []);
    porDia.get(chave).push(s);
  });

  $("#lista-sessoes").innerHTML = [...porDia.entries()].map((entrada) => {
    const chave = entrada[0], doDia = entrada[1];
    const t = somaSessoes(doDia);
    let titulo = fmtDiaTitulo(chave) + ' — ' + fmtHumano(t.segundos);
    if (t.paginas) titulo += ' · ' + t.paginas + ' pág.';
    if (t.questoes) titulo += ' · ' + t.questoes + ' q.';

    const linhas = doDia.map((s) => {
      const m = materiaPor(s.subjectRemoteId);
      let detalhe = fmtHora(s.startAt) + ' – ' + fmtHora(s.endAt);
      if (s.pages) detalhe += ' · ' + s.pages + ' pág.';
      if (s.questions) detalhe += ' · ' + s.questionsCorrect + '/' + s.questions + ' q.';
      if (s.pomodoro) detalhe += ' · pomodoro';
      return '<div class="linha">' +
        '<span class="ponto" style="background:' + cor(m ? m.color : 0xFF64748B) + '"></span>' +
        '<div class="cresce"><div>' + escapar(m ? m.name : "Matéria removida") +
        ' — ' + fmtHumano(s.seconds) + '</div>' +
        '<div class="sub">' + detalhe + '</div>' +
        (s.note ? '<div class="sub">' + escapar(s.note) + '</div>' : '') +
        '</div>' +
        '<button data-editar="' + s.remoteId + '">Editar</button>' +
        '<button data-apagar="' + s.remoteId + '">Apagar</button></div>';
    }).join("");

    return '<div class="bloco"><h2>' + titulo + '</h2>' + linhas + '</div>';
  }).join("");
}

function renderMaterias() {
  if (estado.materias.length === 0) {
    $("#lista-materias").innerHTML = '<p class="vazio">Nenhuma matéria cadastrada.</p>';
    return;
  }
  const linhas = estado.materias.map((m) => {
    const t = somaSessoes(estado.sessoes.filter((s) => s.subjectRemoteId === m.remoteId));
    let sub = 'Total: ' + fmtHumano(t.segundos);
    if (m.weeklyGoalMinutes) sub += ' · Meta: ' + fmtHumano(m.weeklyGoalMinutes * 60) + '/semana';
    return '<div class="linha">' +
      '<span class="ponto" style="background:' + cor(m.color) + '"></span>' +
      '<div class="cresce"><div>' + escapar(m.name) +
      (m.archived ? ' (arquivada)' : '') + '</div>' +
      '<div class="sub">' + sub + '</div></div>' +
      '<button data-editar-materia="' + m.remoteId + '">Editar</button>' +
      '<button data-apagar-materia="' + m.remoteId + '">Apagar</button></div>';
  }).join("");
  $("#lista-materias").innerHTML = '<div class="bloco">' + linhas + '</div>';
}

function renderSeletoresDeMateria() {
  const filtro = $("#filtro-materia");
  const anterior = filtro.value;
  filtro.innerHTML = '<option value="">Todas as matérias</option>' +
    estado.materias.map((m) =>
      '<option value="' + m.remoteId + '">' + escapar(m.name) + '</option>').join("");
  filtro.value = anterior;

  const crono = $("#crono-materia");
  const antes = crono.value;
  crono.innerHTML = estado.materias.filter((m) => !m.archived).map((m) =>
    '<option value="' + m.remoteId + '">' + escapar(m.name) + '</option>').join("");
  if (antes) crono.value = antes;
}

$("#filtro-materia").addEventListener("change", renderSessoes);

// --- diálogo genérico -------------------------------------------------------

let aoConfirmar = null;

function abrirModal(titulo, campos, confirmar, textoBotao) {
  $("#modal-titulo").textContent = titulo;
  $("#modal-ok").textContent = textoBotao || "Salvar";
  $("#modal-campos").innerHTML = campos.map((c) => {
    if (c.tipo === "cores") {
      const botoes = PALETA.map((valor) =>
        '<button type="button" data-cor="' + valor + '" style="background:' + cor(valor) +
        '" aria-pressed="' + (valor === c.valor) + '"></button>').join("");
      // Div, não label: um label encaminharia o clique no texto para o primeiro
      // botão de cor, trocando a cor sem o usuário pedir.
      return '<div class="campo"><span>' + c.rotulo + '</span>' +
        '<div class="cores" id="cores">' + botoes + '</div>' +
        '<input type="hidden" name="' + c.nome + '" value="' + c.valor + '"></div>';
    }
    if (c.tipo === "select") {
      const ops = c.opcoes.map((o) =>
        '<option value="' + o.valor + '"' + (o.valor === c.valor ? " selected" : "") + '>' +
        escapar(o.rotulo) + '</option>').join("");
      return '<label>' + c.rotulo + '<select name="' + c.nome + '">' + ops + '</select></label>';
    }
    if (c.tipo === "textarea") {
      return '<label>' + c.rotulo + '<textarea name="' + c.nome + '" rows="3">' +
        escapar(c.valor || "") + '</textarea></label>';
    }
    return '<label>' + c.rotulo + '<input name="' + c.nome + '" type="' + (c.tipo || "text") +
      '" value="' + escapar(c.valor ?? "") + '"></label>';
  }).join("");

  const paleta = $("#cores");
  if (paleta) {
    paleta.addEventListener("click", (ev) => {
      const alvo = ev.target.closest("[data-cor]");
      if (!alvo) return;
      paleta.querySelectorAll("button").forEach((b) => b.setAttribute("aria-pressed", "false"));
      alvo.setAttribute("aria-pressed", "true");
      $("#modal-campos input[type=hidden]").value = alvo.dataset.cor;
    });
  }

  aoConfirmar = confirmar;
  $("#modal").showModal();
}

$("#modal").addEventListener("close", async () => {
  const modal = $("#modal");
  if (modal.returnValue !== "ok" || !aoConfirmar) { aoConfirmar = null; return; }
  const dados = Object.fromEntries(new FormData($("#modal-form")).entries());
  const acao = aoConfirmar;
  aoConfirmar = null;
  try {
    await acao(dados);
  } catch (e) {
    avisar("Não foi possível salvar: " + (e.message || e.code));
  }
});

// --- gravação ---------------------------------------------------------------

const refMateria = (id) => doc(db, "users", estado.uid, "subjects", id);
const refSessao = (id) => doc(db, "users", estado.uid, "sessions", id);
const inteiro = (v) => Math.max(0, parseInt(v, 10) || 0);

async function gravarMateria(materia) {
  await setDoc(refMateria(materia.remoteId), materia);
}

async function gravarSessao(sessao) {
  await setDoc(refSessao(sessao.remoteId), sessao);
}

function formularioDeMateria(existente) {
  return [
    { nome: "name", rotulo: "Nome da matéria", valor: existente ? existente.name : "" },
    { nome: "color", rotulo: "Cor", tipo: "cores", valor: existente ? existente.color : PALETA[0] },
    {
      nome: "horas", rotulo: "Meta semanal em horas (0 = sem meta)", tipo: "number",
      valor: existente ? (existente.weeklyGoalMinutes || 0) / 60 : 0
    }
  ];
}

$("#btn-nova-materia").addEventListener("click", () => {
  abrirModal("Nova matéria", formularioDeMateria(null), async (dados) => {
    if (!dados.name.trim()) return;
    await gravarMateria({
      remoteId: crypto.randomUUID(),
      name: dados.name.trim(),
      color: Number(dados.color),
      weeklyGoalMinutes: Math.round(parseFloat(String(dados.horas).replace(",", ".")) * 60) || 0,
      archived: false,
      createdAt: Date.now()
    });
    avisar("Matéria criada.");
  });
});

$("#lista-materias").addEventListener("click", async (ev) => {
  const editar = ev.target.closest("[data-editar-materia]");
  const apagar = ev.target.closest("[data-apagar-materia]");

  if (editar) {
    const m = materiaPor(editar.dataset.editarMateria);
    if (!m) return;
    abrirModal("Editar matéria", formularioDeMateria(m), async (dados) => {
      await gravarMateria(Object.assign({}, m, {
        name: dados.name.trim(),
        color: Number(dados.color),
        weeklyGoalMinutes: Math.round(parseFloat(String(dados.horas).replace(",", ".")) * 60) || 0
      }));
      avisar("Matéria atualizada.");
    });
  }

  if (apagar) {
    const m = materiaPor(apagar.dataset.apagarMateria);
    if (!m) return;
    const quantas = estado.sessoes.filter((s) => s.subjectRemoteId === m.remoteId).length;
    if (!confirm(`Apagar "${m.name}" e as ${quantas} sessões dela? Isso não tem volta.`)) return;
    for (const s of estado.sessoes.filter((x) => x.subjectRemoteId === m.remoteId)) {
      await deleteDoc(refSessao(s.remoteId));
    }
    await deleteDoc(refMateria(m.remoteId));
    avisar("Matéria apagada.");
  }
});

function formularioDeSessao(existente) {
  const ativas = estado.materias.filter((m) => !m.archived);
  return [
    {
      nome: "subject", rotulo: "Matéria", tipo: "select",
      valor: existente ? existente.subjectRemoteId : (ativas[0] ? ativas[0].remoteId : ""),
      opcoes: ativas.map((m) => ({ valor: m.remoteId, rotulo: m.name }))
    },
    {
      nome: "data", rotulo: "Data do estudo", tipo: "date",
      valor: paraInputData(existente ? existente.startAt : Date.now())
    },
    {
      nome: "hora", rotulo: "Hora de início", tipo: "time",
      valor: paraInputHora(existente ? existente.startAt : Date.now())
    },
    {
      nome: "minutos", rotulo: "Duração em minutos", tipo: "number",
      valor: existente ? Math.round(existente.seconds / 60) : 30
    },
    { nome: "paginas", rotulo: "Páginas lidas", tipo: "number", valor: existente ? existente.pages || 0 : 0 },
    { nome: "questoes", rotulo: "Questões resolvidas", tipo: "number", valor: existente ? existente.questions || 0 : 0 },
    { nome: "acertos", rotulo: "Acertos", tipo: "number", valor: existente ? existente.questionsCorrect || 0 : 0 },
    { nome: "nota", rotulo: "Anotação", tipo: "textarea", valor: existente ? existente.note : "" }
  ];
}

$("#btn-nova-sessao").addEventListener("click", () => {
  if (estado.materias.filter((m) => !m.archived).length === 0) {
    avisar("Cadastre uma matéria primeiro.");
    return;
  }
  abrirModal("Registrar sessão", formularioDeSessao(null), async (dados) => {
    const segundos = Math.max(60, inteiro(dados.minutos) * 60);
    const inicio = deInputs(dados.data, dados.hora);
    const questoes = inteiro(dados.questoes);
    await gravarSessao({
      remoteId: crypto.randomUUID(),
      subjectRemoteId: dados.subject,
      startAt: inicio,
      endAt: inicio + segundos * 1000,
      seconds: segundos,
      note: (dados.nota || "").trim(),
      pomodoro: false,
      pages: inteiro(dados.paginas),
      questions: questoes,
      questionsCorrect: Math.min(inteiro(dados.acertos), questoes)
    });
    avisar("Sessão registrada.");
  });
});

$("#lista-sessoes").addEventListener("click", async (ev) => {
  const editar = ev.target.closest("[data-editar]");
  const apagar = ev.target.closest("[data-apagar]");

  if (editar) {
    const s = estado.sessoes.find((x) => x.remoteId === editar.dataset.editar);
    if (!s) return;
    abrirModal("Editar sessão", formularioDeSessao(s), async (dados) => {
      const segundos = Math.max(60, inteiro(dados.minutos) * 60);
      const questoes = inteiro(dados.questoes);
      const inicio = deInputs(dados.data, dados.hora);
      await gravarSessao(Object.assign({}, s, {
        subjectRemoteId: dados.subject,
        seconds: segundos,
        startAt: inicio,
        endAt: inicio + segundos * 1000,
        note: (dados.nota || "").trim(),
        pages: inteiro(dados.paginas),
        questions: questoes,
        questionsCorrect: Math.min(inteiro(dados.acertos), questoes)
      }));
      avisar("Sessão atualizada.");
    });
  }

  if (apagar) {
    const s = estado.sessoes.find((x) => x.remoteId === apagar.dataset.apagar);
    if (!s) return;
    if (!confirm("Apagar esta sessão de " + fmtHumano(s.seconds) + "?")) return;
    await deleteDoc(refSessao(s.remoteId));
    avisar("Sessão apagada.");
  }
});

// --- cronômetro -------------------------------------------------------------
// O tempo vem do relógio do sistema, não de contagem de ticks: a aba pode ser
// congelada em segundo plano que o total continua certo.

const CHAVE_CRONO = "foco.cronometro";
let crono = carregarCrono();

function carregarCrono() {
  try {
    return JSON.parse(localStorage.getItem(CHAVE_CRONO)) || cronoVazio();
  } catch (e) {
    return cronoVazio();
  }
}

function cronoVazio() {
  return {
    ativo: false, rodando: false, materia: null, inicioSessao: 0,
    inicioTrecho: 0, acumulado: 0, paginas: 0, questoes: 0, acertos: 0
  };
}

function salvarCrono() {
  try {
    localStorage.setItem(CHAVE_CRONO, JSON.stringify(crono));
  } catch (e) { /* modo privado: segue sem persistir */ }
}

function segundosCrono() {
  const emAndamento = crono.rodando && crono.inicioTrecho
    ? (Date.now() - crono.inicioTrecho) / 1000 : 0;
  return Math.floor(crono.acumulado + emAndamento);
}

function pintarCrono() {
  $("#crono-tempo").textContent = fmtRelogio(segundosCrono());
  $("#crono-paginas").textContent = crono.paginas;
  $("#crono-questoes").textContent = crono.acertos + " / " + crono.questoes;
  $("#crono-iniciar").hidden = crono.ativo;
  $("#crono-pausar").hidden = !crono.ativo;
  $("#crono-finalizar").hidden = !crono.ativo;
  $("#crono-pausar").textContent = crono.rodando ? "Pausar" : "Retomar";
  $("#crono-materia").disabled = crono.ativo;
}

$("#crono-iniciar").addEventListener("click", () => {
  const materia = $("#crono-materia").value;
  if (!materia) { avisar("Cadastre uma matéria primeiro."); return; }
  crono = Object.assign(cronoVazio(), {
    ativo: true, rodando: true, materia,
    inicioSessao: Date.now(), inicioTrecho: Date.now()
  });
  salvarCrono();
  pintarCrono();
});

$("#crono-pausar").addEventListener("click", () => {
  if (crono.rodando) {
    crono.acumulado = segundosCrono();
    crono.rodando = false;
    crono.inicioTrecho = 0;
  } else {
    crono.rodando = true;
    crono.inicioTrecho = Date.now();
  }
  salvarCrono();
  pintarCrono();
});

$("#crono-finalizar").addEventListener("click", () => {
  const segundos = segundosCrono();
  const materia = crono.materia;
  const inicio = crono.inicioSessao;
  const paginas = crono.paginas, questoes = crono.questoes, acertos = crono.acertos;
  if (segundos < 5) {
    crono = cronoVazio(); salvarCrono(); pintarCrono();
    avisar("Sessão muito curta, descartada.");
    return;
  }
  abrirModal("Sessão concluída — " + fmtHumano(segundos), [
    { nome: "paginas", rotulo: "Páginas lidas", tipo: "number", valor: paginas },
    { nome: "questoes", rotulo: "Questões resolvidas", tipo: "number", valor: questoes },
    { nome: "acertos", rotulo: "Acertos", tipo: "number", valor: acertos },
    { nome: "nota", rotulo: "O que você estudou?", tipo: "textarea", valor: "" }
  ], async (dados) => {
    const total = inteiro(dados.questoes);
    await gravarSessao({
      remoteId: crypto.randomUUID(),
      subjectRemoteId: materia,
      startAt: inicio,
      endAt: Date.now(),
      seconds: segundos,
      note: (dados.nota || "").trim(),
      pomodoro: false,
      pages: inteiro(dados.paginas),
      questions: total,
      questionsCorrect: Math.min(inteiro(dados.acertos), total)
    });
    avisar("Sessão salva.");
  }, "Salvar sessão");
  crono = cronoVazio();
  salvarCrono();
  pintarCrono();
});

document.querySelectorAll("[data-passo]").forEach((botao) => {
  botao.addEventListener("click", () => {
    if (!crono.ativo) return;
    crono.paginas = Math.max(0, crono.paginas + Number(botao.dataset.delta));
    salvarCrono();
    pintarCrono();
  });
});

$("#crono-acertei").addEventListener("click", () => {
  if (!crono.ativo) return;
  crono.questoes++; crono.acertos++; salvarCrono(); pintarCrono();
});

$("#crono-errei").addEventListener("click", () => {
  if (!crono.ativo) return;
  crono.questoes++; salvarCrono(); pintarCrono();
});

setInterval(pintarCrono, 500);
pintarCrono();
