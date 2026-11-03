// Academia Fábrica · front (Ola 1). El contenido de pago vive en Supabase con RLS, nunca en este repo.
const SB_URL = 'https://vdqgxumdhbrlxflrmgjk.supabase.co';
const SB_KEY = 'sb_publishable_pmmbhA7Kk6VIZi51yTsPuw_ohcyKnu4';
const sb = supabase.createClient(SB_URL, SB_KEY);

const $app = document.getElementById('app');
const $nav = document.getElementById('nav');
const COLS = 'email,nombre,base,alta,vence,fundador,admin';
const REDIRECT = location.hostname === 'localhost' ? 'http://localhost:8765/academia/' : 'https://fabrica.ink/academia/';
let yo = null;        // fila de aca_alumnos
let correo = null;    // email de la sesión
let catalogo = null;  // cache de aca_catalogo()

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const md = s => DOMPurify.sanitize(marked.parse(s || ''));
const hoy = () => { const d = new Date(); d.setHours(0,0,0,0); return d; };
const dias = f => Math.round((new Date(f + 'T00:00:00') - hoy()) / 864e5);
const fecha = f => f ? new Date(f + 'T00:00:00').toLocaleDateString('es-VE', {day:'numeric', month:'short', year:'numeric'}) : '—';
const ver = h => { $app.innerHTML = h; window.scrollTo(0, 0); };

// ---------- sesión ----------
async function arrancar() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return pintarLogin();
  correo = session.user.email.toLowerCase();
  const { data, error } = await sb.from('aca_alumnos').select(COLS).eq('email', correo).maybeSingle();
  if (error) return ver(`<p class="err">Error: ${esc(error.message)}</p>`);
  yo = data;
  pintarNav();
  if (!yo) return ver(`<p class="eyebrow">Acceso</p><h1>Tu correo aún no tiene acceso</h1>
    <p class="lead">Entraste como <b>${esc(correo)}</b>. Cuando confirmemos tu pago te damos de alta y vuelves a entrar con este mismo correo.</p>`);
  router();
}

function pintarNav() {
  $nav.innerHTML = !correo ? '' :
    `${yo ? '<a href="#/">Inicio</a><a href="#/diagnostico">Diagnóstico</a>' : ''}${yo?.admin ? '<a href="#/admin">Admin</a>' : ''}<button id="salir">Salir</button>`;
  document.getElementById('salir')?.addEventListener('click', async () => { await sb.auth.signOut(); location.hash = '#/'; location.reload(); });
}

function pintarLogin() {
  pintarNav();
  ver(`<p class="eyebrow">Academia Fábrica</p><h1>Entra a tu academia</h1>
    <p class="lead">Escribe el correo con el que te inscribiste. Te mandamos un enlace para entrar, sin contraseña.</p>
    <form class="stack" id="fl"><input type="email" id="em" required placeholder="tucorreo@ejemplo.com" autocomplete="email">
    <button class="btn" id="bl">Mandarme el enlace</button><p class="msg" id="ml"></p></form>`);
  document.getElementById('fl').addEventListener('submit', async e => {
    e.preventDefault();
    const b = document.getElementById('bl'), m = document.getElementById('ml');
    b.disabled = true; m.className = 'msg'; m.textContent = 'Enviando…';
    const { error } = await sb.auth.signInWithOtp({
      email: document.getElementById('em').value.trim().toLowerCase(),
      options: { emailRedirectTo: REDIRECT }
    });
    b.disabled = false;
    if (error) { m.className = 'msg err'; m.textContent = 'No se pudo enviar: ' + error.message; }
    else m.textContent = 'Listo. Revisa tu correo (y la carpeta de spam) y abre el enlace en este mismo navegador.';
  });
}

function banner() {
  if (!yo || yo.admin || !yo.vence) return '';
  const d = dias(yo.vence);
  if (d < 0) return `<div class="banner off">Tu membresía venció el ${fecha(yo.vence)}. Conservas el curso base; para volver a ver lo nuevo, renueva con Fernando.</div>`;
  if (d <= 3) return `<div class="banner">Tu membresía vence ${d === 0 ? 'hoy' : `en ${d} día${d > 1 ? 's' : ''}`} (${fecha(yo.vence)}). Renueva para no perder los módulos nuevos.</div>`;
  return '';
}

// ---------- datos ----------
async function cargarCatalogo() {
  if (catalogo) return catalogo;
  const { data, error } = await sb.rpc('aca_catalogo');
  if (error) throw error;
  const mods = [];
  for (const r of data) {
    let m = mods.find(x => x.id === r.modulo_id);
    if (!m) mods.push(m = { id: r.modulo_id, orden: r.m_orden, slug: r.m_slug, titulo: r.m_titulo, resumen: r.m_resumen, nivel: r.nivel, abierta: r.abierta, lecs: [] });
    if (r.leccion_id) m.lecs.push({ id: r.leccion_id, orden: r.l_orden, slug: r.l_slug, titulo: r.l_titulo, resultado: r.resultado });
  }
  return catalogo = mods;
}
async function cargarProgreso() {
  const { data } = await sb.from('aca_progreso').select('leccion_id,checks,completada_at').eq('email', correo);
  return Object.fromEntries((data || []).map(p => [p.leccion_id, p]));
}

// ---------- vistas ----------
async function vistaHub() {
  const [mods, prog] = await Promise.all([cargarCatalogo(), cargarProgreso()]);
  const filas = mods.map(m => {
    const hechas = m.lecs.filter(l => prog[l.id]?.completada_at).length;
    const pct = m.lecs.length ? Math.round(hechas / m.lecs.length * 100) : 0;
    const tag = !m.abierta ? (m.nivel === 'miembro' ? '🔒 Membresía' : '🔒 Bloqueado') : `${hechas}/${m.lecs.length} lecciones`;
    const cuerpo = `<span class="num">${String(m.orden).padStart(2, '0')}</span>
      <div><h3>${esc(m.titulo)}</h3>${m.resumen ? `<p>${esc(m.resumen)}</p>` : ''}${m.abierta && m.lecs.length ? `<div class="bar"><i style="width:${pct}%"></i></div>` : ''}</div>
      <span class="tag">${tag}</span>`;
    return m.abierta ? `<a class="mod" href="#/m/${esc(m.slug)}">${cuerpo}</a>` : `<div class="mod lock">${cuerpo}</div>`;
  }).join('');
  ver(`${banner()}<p class="eyebrow">Hola${yo.nombre ? ', ' + esc(yo.nombre) : ''}</p><h1>Tu ruta de 0 a 100</h1>
    <p class="lead">Avanza a tu ritmo. Cada lección te deja un resultado concreto. ¿Primera vez? Haz el <a href="#/diagnostico">diagnóstico</a> y te armamos tu plan.</p>
    <div class="mods">${filas || '<p class="loading">Pronto publicamos el primer módulo.</p>'}</div>`);
}

async function vistaModulo(slug) {
  const [mods, prog] = await Promise.all([cargarCatalogo(), cargarProgreso()]);
  const m = mods.find(x => x.slug === slug);
  if (!m) return ver('<h1>Módulo no encontrado</h1><p class="lead"><a href="#/">Volver al inicio</a></p>');
  if (!m.abierta) return ver(`${banner()}<h1>${esc(m.titulo)}</h1><p class="lead">🔒 Este módulo es parte de la membresía. Renueva con Fernando para abrirlo.</p><p><a href="#/">Volver</a></p>`);
  const lecs = m.lecs.map((l, i) => {
    const ok = prog[l.id]?.completada_at;
    return `<a class="lec" href="#/l/${esc(l.slug)}"><span class="dot ${ok ? 'done' : ''}">${ok ? '✓' : i + 1}</span>
      <div><b>${esc(l.titulo)}</b>${l.resultado ? `<small>Al terminar: ${esc(l.resultado)}</small>` : ''}</div></a>`;
  }).join('');
  ver(`${banner()}<p class="eyebrow">Módulo ${m.orden}</p><h1>${esc(m.titulo)}</h1>${m.resumen ? `<p class="lead">${esc(m.resumen)}</p>` : ''}
    <div class="lecs">${lecs || '<p class="loading">Lecciones en camino.</p>'}</div>`);
}

function embed(url) {
  if (!url) return '';
  let src = url;
  const yt = url.match(/(?:youtu\.be\/|v=|shorts\/|embed\/)([\w-]{11})/);
  const dr = url.match(/drive\.google\.com\/file\/d\/([\w-]+)/);
  if (yt) src = `https://www.youtube-nocookie.com/embed/${yt[1]}?rel=0`;
  else if (dr) src = `https://drive.google.com/file/d/${dr[1]}/preview`;
  else if (!/^https:\/\//.test(url)) return '';
  return `<div class="video"><iframe src="${esc(src)}" allow="autoplay; encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe></div>`;
}

async function vistaLeccion(slug) {
  const [{ data: l, error }, mods, prog] = await Promise.all([
    sb.from('aca_lecciones').select('*').eq('slug', slug).maybeSingle(), cargarCatalogo(), cargarProgreso()]);
  if (error) return ver(`<p class="err">${esc(error.message)}</p>`);
  if (!l) return ver(`${banner()}<h1>Lección bloqueada</h1><p class="lead">🔒 No tienes acceso a esta lección o aún no está publicada.</p><p><a href="#/">Volver</a></p>`);
  const m = mods.find(x => x.id === l.modulo_id);
  const lista = m?.lecs || [];
  const i = lista.findIndex(x => x.id === l.id);
  const ant = lista[i - 1], sig = lista[i + 1];
  const checks = Array.isArray(l.checklist) ? l.checklist : [];
  const marcados = new Set(prog[l.id]?.checks || []);
  ver(`${banner()}<p class="eyebrow">${m ? `<a href="#/m/${esc(m.slug)}" style="color:inherit">${esc(m.titulo)}</a> · ` : ''}Lección ${l.orden}</p>
    <h1>${esc(l.titulo)}</h1>${l.resultado ? `<p class="lead">Al terminar tienes: <b>${esc(l.resultado)}</b></p>` : ''}
    ${embed(l.video_url)}
    ${l.guia_md ? `<section class="card md">${md(l.guia_md)}</section>` : ''}
    ${l.recurso_md ? `<section class="card copy"><div class="row" style="justify-content:space-between"><h2>Tu recurso</h2><button class="btn sm ghost" id="cp" style="flex:none">Copiar</button></div><pre id="rec">${esc(l.recurso_md)}</pre></section>` : ''}
    ${checks.length ? `<section class="card"><h2>Tu entregable</h2><ul class="checks">${checks.map((c, k) =>
      `<li><label><input type="checkbox" data-k="${k}" ${marcados.has(k) ? 'checked' : ''}><span>${esc(c)}</span></label></li>`).join('')}</ul><p class="msg" id="mc"></p></section>` : ''}
    <div class="pager">${ant ? `<a class="btn ghost" href="#/l/${esc(ant.slug)}">← ${esc(ant.titulo)}</a>` : '<span></span>'}
      ${sig ? `<a class="btn" href="#/l/${esc(sig.slug)}">${esc(sig.titulo)} →</a>` : (m ? `<a class="btn" href="#/m/${esc(m.slug)}">Volver al módulo</a>` : '')}</div>`);
  document.getElementById('cp')?.addEventListener('click', e => {
    navigator.clipboard.writeText(l.recurso_md).then(() => { e.target.textContent = 'Copiado ✓'; });
  });
  const cajas = [...$app.querySelectorAll('.checks input')];
  cajas.forEach(c => c.addEventListener('change', async () => {
    const sel = cajas.filter(x => x.checked).map(x => +x.dataset.k);
    const completa = sel.length === checks.length;
    const { error } = await sb.from('aca_progreso').upsert({
      email: correo, leccion_id: l.id, checks: sel,
      completada_at: completa ? (prog[l.id]?.completada_at || new Date().toISOString()) : null
    });
    const mc = document.getElementById('mc');
    if (error) { mc.className = 'msg err'; mc.textContent = 'No se guardó: ' + error.message; return; }
    prog[l.id] = { checks: sel, completada_at: completa };
    mc.className = 'msg'; mc.textContent = completa ? '¡Lección completada! ✓' : `${sel.length}/${checks.length} listos`;
  }));
}

// ---------- diagnóstico ----------
const PREGUNTAS = [
  { k: 'uso', t: '¿Cuánto has usado Claude?', o: { nunca: 'Nunca', chat: 'El chat de vez en cuando', diario: 'A diario', code: 'Ya uso Claude Code' } },
  { k: 'plan', t: '¿Qué plan de Claude tienes?', o: { ninguno: 'Ninguno', free: 'Gratis', pro: 'Pro', max: 'Max' } },
  { k: 'meta', t: '¿Qué quieres lograr primero?', o: { contenido: 'Crear contenido / videos', vender: 'Conseguir clientes', automatizar: 'Automatizar mi negocio', aprender: 'Aprender y ofrecerlo como servicio' } },
  { k: 'equipo', t: '¿Con qué trabajas?', o: { win: 'PC Windows', mac: 'Mac', cel: 'Solo celular' } },
  { k: 'horas', t: '¿Cuántas horas por semana le puedes dar?', o: { h2: 'Menos de 2', h5: 'De 2 a 5', h6: 'Más de 5' } },
];
const BLOQUES = {
  1: 'Claude desde cero', 2: 'Proyectos: la ficha de tu negocio', 3: 'Conectores: tu asistente personal', 4: 'Skills',
  5: 'Claude Code desde cero', 6: 'Claude con potencia', 7: 'Tu Fábrica visual', 8: 'La Fábrica de contenido',
  9: 'Clónate: voz y avatar', 10: 'Tu web visual', 11: 'Setter / DM', 12: 'Datos y métricas'
};

function armarPlan(r) {
  const ruta = [];
  const add = (n, por) => { if (!ruta.some(x => x.n === n)) ruta.push({ n, t: BLOQUES[n], por }); };
  if (r.uso === 'nunca' || r.uso === 'chat' || r.plan === 'ninguno' || r.plan === 'free') add(1, 'Base: plan, ajustes y cómo rendir tu límite.');
  add(2, 'Claude tiene que conocer tu negocio antes de producir nada.');
  if (r.equipo !== 'cel') { add(5, 'Claude Code en tu PC es donde está la potencia.'); add(6, 'Prompts maestros y skills adaptados a tu nicho.'); }
  else add(4, 'Skills desde el celular mientras consigues una PC.');
  const foco = { contenido: [8, 9], vender: [11, 10], automatizar: [3, 7], aprender: [7, 8] }[r.meta] || [8];
  foco.forEach((n, i) => add(n, i ? 'Complemento de tu objetivo.' : 'Tu objetivo principal.'));
  [3, 4, 7, 8, 10, 11, 9, 12].forEach(n => add(n, 'Cuando termines lo anterior.'));
  const ritmo = { h2: '1 lección por semana', h5: '2 o 3 lecciones por semana', h6: '1 módulo por semana' }[r.horas] || '';
  return { ruta, ritmo };
}

function promptPlan(r, plan) {
  const L = k => PREGUNTAS.find(p => p.k === k).o[r[k]] || r[k];
  return `Eres mi mentor de Claude. Te doy mi contexto para que me ayudes a avanzar en la Academia Fábrica.

- Mi nicho: ${r.nicho || '(sin definir)'}
- Experiencia con Claude: ${L('uso')}
- Plan: ${L('plan')}
- Objetivo: ${L('meta')}
- Equipo: ${L('equipo')}
- Tiempo: ${L('horas')} horas por semana (${plan.ritmo})

Mi ruta: ${plan.ruta.map((x, i) => `${i + 1}. ${x.t}`).join(' · ')}

1. Hazme 5 preguntas sobre mi negocio para aterrizar el primer paso.
2. Con mis respuestas, dame un plan de esta semana con tareas de máximo 30 minutos.
3. Dime qué resultado concreto debo tener al final de la semana.`;
}

async function vistaDiagnostico() {
  const { data: prev } = await sb.from('aca_diagnostico').select('respuestas').eq('email', correo).maybeSingle();
  const r0 = prev?.respuestas || {};
  ver(`${banner()}<p class="eyebrow">Diagnóstico · 2 minutos</p><h1>Tu plan personal</h1>
    <p class="lead">Responde y te armamos la ruta en orden, más un prompt para que tu propio Claude te acompañe.</p>
    <form id="fd">${PREGUNTAS.map(p => `<div class="q"><b>${esc(p.t)}</b><div class="opts">${Object.entries(p.o).map(([v, t]) =>
      `<label><input type="radio" name="${p.k}" value="${v}" required ${r0[p.k] === v ? 'checked' : ''}>${esc(t)}</label>`).join('')}</div></div>`).join('')}
    <div class="q"><b>¿Cuál es tu nicho o negocio?</b><input type="text" name="nicho" maxlength="160" placeholder="Ej.: barbería en Valencia, coach de finanzas, tienda de ropa" value="${esc(r0.nicho)}"></div>
    <p style="margin-top:24px"><button class="btn" id="bd">Ver mi plan</button></p><p class="msg" id="md"></p></form><div id="res"></div>`);
  const pintar = r => {
    const plan = armarPlan(r);
    document.getElementById('res').innerHTML = `<section class="card"><h2>Tu ruta</h2><p class="lead" style="margin-top:6px">Ritmo sugerido: ${esc(plan.ritmo)}</p>
      <ol class="plan">${plan.ruta.map(x => `<li><div><b>${esc(x.t)}</b><small>${esc(x.por)}</small></div></li>`).join('')}</ol></section>
      <section class="card copy"><div class="row" style="justify-content:space-between"><h2>Pégale esto a tu Claude</h2><button class="btn sm ghost" id="cpd" style="flex:none">Copiar</button></div><pre>${esc(promptPlan(r, plan))}</pre></section>`;
    document.getElementById('cpd').addEventListener('click', e => navigator.clipboard.writeText(promptPlan(r, plan)).then(() => { e.target.textContent = 'Copiado ✓'; }));
    return plan;
  };
  if (prev) pintar(r0);
  document.getElementById('fd').addEventListener('submit', async e => {
    e.preventDefault();
    const r = Object.fromEntries(new FormData(e.target));
    r.nicho = (r.nicho || '').trim();
    const plan = pintar(r);
    const { error } = await sb.from('aca_diagnostico').upsert({ email: correo, respuestas: r, plan });
    const m = document.getElementById('md');
    m.className = error ? 'msg err' : 'msg';
    m.textContent = error ? 'No se guardó: ' + error.message : 'Guardado. Tu plan está abajo.';
    document.getElementById('res').scrollIntoView({ behavior: 'smooth' });
  });
}

// ---------- admin ----------
async function vistaAdmin() {
  if (!yo.admin) return ver('<h1>Solo admin</h1>');
  const [{ data: al, error }, { data: pr }, mods] = await Promise.all([
    sb.from('aca_alumnos').select(COLS).order('vence', { ascending: true, nullsFirst: false }),
    sb.from('aca_progreso').select('email,completada_at').not('completada_at', 'is', null),
    cargarCatalogo()]);
  if (error) return ver(`<p class="err">${esc(error.message)}</p>`);
  const total = mods.reduce((s, m) => s + m.lecs.length, 0);
  const hechas = {};
  (pr || []).forEach(p => { hechas[p.email] = (hechas[p.email] || 0) + 1; });
  const filas = al.map(a => {
    const d = a.vence ? dias(a.vence) : null;
    const cls = d === null ? '' : d < 0 ? 'vencido' : d <= 3 ? 'pronto' : '';
    return `<tr><td>${esc(a.email)}${a.admin ? ' ★' : ''}${a.fundador ? ' · fundador' : ''}</td><td>${esc(a.nombre || '')}</td>
      <td>${fecha(a.alta)}</td><td class="${cls}">${a.vence ? `${fecha(a.vence)} (${d}d)` : '—'}</td>
      <td>${hechas[a.email] || 0}/${total}</td><td><button class="btn sm" data-ren="${esc(a.email)}">+30 días</button></td></tr>`;
  }).join('');
  ver(`<p class="eyebrow">Panel admin</p><h1>Alumnos</h1>
    <section class="card"><h2>Dar de alta</h2><form id="fa" class="row" style="margin-top:14px">
      <input type="email" name="email" required placeholder="correo del alumno"><input type="text" name="nombre" placeholder="nombre">
      <label style="flex:0 0 auto;display:flex;gap:8px;align-items:center"><input type="checkbox" name="fundador"> Fundador</label>
      <button class="btn" style="flex:0 0 auto">Dar de alta (30 días)</button></form><p class="msg" id="ma"></p></section>
    <div class="tbl"><table><thead><tr><th>Correo</th><th>Nombre</th><th>Alta</th><th>Vence</th><th>Progreso</th><th></th></tr></thead><tbody>${filas}</tbody></table></div>`);
  document.getElementById('fa').addEventListener('submit', async e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const { error } = await sb.rpc('aca_dar_alta', { p_email: f.get('email'), p_nombre: f.get('nombre') || null, p_fundador: !!f.get('fundador') });
    const m = document.getElementById('ma');
    if (error) { m.className = 'msg err'; m.textContent = error.message; } else vistaAdmin();
  });
  $app.querySelectorAll('[data-ren]').forEach(b => b.addEventListener('click', async () => {
    b.disabled = true;
    const { error } = await sb.rpc('aca_renovar', { p_email: b.dataset.ren });
    if (error) { b.textContent = 'Error'; b.title = error.message; } else vistaAdmin();
  }));
}

// ---------- router ----------
async function router() {
  if (!yo) return;
  const [, ruta, arg] = (location.hash || '#/').split('/');
  try {
    if (ruta === 'm' && arg) await vistaModulo(decodeURIComponent(arg));
    else if (ruta === 'l' && arg) await vistaLeccion(decodeURIComponent(arg));
    else if (ruta === 'diagnostico') await vistaDiagnostico();
    else if (ruta === 'admin') await vistaAdmin();
    else await vistaHub();
  } catch (e) { ver(`<p class="err">Error: ${esc(e.message)}</p>`); }
}

window.addEventListener('hashchange', router);
sb.auth.onAuthStateChange((ev) => { if (ev === 'SIGNED_IN' && !correo) arrancar(); });
arrancar();
