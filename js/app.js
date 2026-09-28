/* ==========================================================================
   AgroTech Guasca - Aplicación (pantallas, navegación e interacción)
   SPA con rutas por hash: #/login, #/panel, #/recomendacion, #/historial,
   #/parcela, #/umbrales. Sin servidor: todo se simula en el navegador.
   ========================================================================== */
(function () {
  'use strict';

  const AT = window.AT;
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ---------- Almacenamiento local tolerante a fallos ---------- */
  const store = {
    get(k, fb, ses) { try { const v = (ses ? sessionStorage : localStorage).getItem(k); return v ? JSON.parse(v) : fb; } catch (e) { return fb; } },
    set(k, v, ses) { try { (ses ? sessionStorage : localStorage).setItem(k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } },
    del(k, ses) { try { (ses ? sessionStorage : localStorage).removeItem(k); } catch (e) { /* sin almacenamiento */ } }
  };

  const INTERVALO_MS = 5000; // Frecuencia de lectura simulada (acelerada para la demostración)
  const INICIO = Date.now();
  const copia = o => JSON.parse(JSON.stringify(o));

  function cargarUmbrales() {
    const g = store.get('agt.umbrales', {});
    const out = {};
    AT.PARCELAS.forEach(p => {
      const u = g[p.id];
      const ok = u && AT.CLAVES.every(k => u[k] && isFinite(u[k].min) && isFinite(u[k].max) && u[k].min < u[k].max);
      out[p.id] = ok ? u : copia(AT.UMBRALES_FRESA);
    });
    return out;
  }

  /* ---------- Estado ---------- */
  const S = {
    sesion: store.get('agt.sesion', null, true),
    sel: store.get('agt.sel', 'P01', true),
    umbrales: cargarUmbrales(),
    aplicadas: store.get('agt.aplicadas', {}),
    hist: {},
    rango: { tipo: '7d', desde: '', hasta: '' },
    charts: [],
    ultima: INICIO,
    ruta: ''
  };
  AT.PARCELAS.forEach(p => { S.hist[p.id] = AT.generarHistorial(p, INICIO); });

  /* ---------- Utilidades ---------- */
  const parcela = id => AT.PARCELAS.find(p => p.id === id);
  const ultima = id => { const h = S.hist[id]; return h[h.length - 1]; };
  const esTecnico = () => !!S.sesion && S.sesion.rol === 'tecnico';
  const fv = AT.formato;
  const uni = k => AT.VARS[k].unidad;
  const pad = n => String(n).padStart(2, '0');
  const diaISO = ts => { const d = new Date(ts); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const dLarga = ts => new Date(ts).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });
  const dCorta = ts => new Date(ts).toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
  const dHora = ts => new Date(ts).toLocaleTimeString('es-CO', { hour: '2-digit', minute: '2-digit' });
  const dFechaHora = ts => `${dCorta(ts)}, ${dHora(ts)}`;
  const hace = ts => { const s = Math.max(0, Math.round((Date.now() - ts) / 1000)); return s < 60 ? `hace ${s} s` : `hace ${Math.round(s / 60)} min`; };
  const icon = (n, c = '') => `<svg class="ico ${c}" aria-hidden="true"><use href="#i-${n}"></use></svg>`;
  const bi = n => `<span class="bi">${icon(n)}</span>`;
  const clave = (pid, ts) => `${pid}|${diaISO(ts)}`;

  function parcelaActiva() {
    const permitidas = S.sesion.parcelas;
    if (!permitidas.includes(S.sel)) S.sel = permitidas[0];
    return parcela(S.sel);
  }
  function estado(pid) {
    const p = parcela(pid);
    const ev = AT.evaluarLectura(ultima(pid), S.umbrales[pid]);
    return { p, ev, recs: AT.recomendaciones(ev, p) };
  }

  const NIVEL = {
    verde: { t: 'Todo bien', f: 'Su cultivo está en buen estado. Hoy no necesita abono, cal ni riego extra.' },
    ambar: { t: 'Atención', f: 'Hay valores un poco fuera de lo ideal. Revise la recomendación de hoy.' },
    rojo: { t: 'Actuar hoy', f: 'Hay valores muy fuera de lo ideal. Siga la recomendación de hoy.' }
  };
  const ESTADO = { ok: 'En rango', bajo: 'Bajo', alto: 'Alto' };
  const chipVar = e => `<span class="chip ${e.estado === 'ok' ? 'ok' : e.nivel}">${ESTADO[e.estado]}</span>`;

  /* ---------- Toasts y modal ---------- */
  function toast(msg, tipo = 'ok') {
    const el = document.createElement('div');
    el.className = `toast ${tipo}`;
    if (tipo === 'err') el.setAttribute('role', 'alert');
    el.innerHTML = `${icon(tipo === 'ok' ? 'check' : tipo === 'err' ? 'alert' : 'info')}<span>${msg}</span>`;
    $('#toasts').appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
    setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 700); }, 4000);
  }

  function confirmar({ titulo, cuerpo, ok = 'Confirmar' }) {
    return new Promise(resolve => {
      const m = $('#modal');
      const previo = document.activeElement;
      m.innerHTML = `
        <div class="modal-back" data-no></div>
        <div class="modal-card shell" role="dialog" aria-modal="true" aria-labelledby="m-t">
          <div class="core">
            <h2 id="m-t">${titulo}</h2>
            <div class="body">${cuerpo}</div>
            <div class="modal-actions">
              <button class="btn btn-ghost btn-plain" data-no>Cancelar</button>
              <button class="btn btn-primary" data-si>${ok} ${bi('check')}</button>
            </div>
          </div>
        </div>`;
      m.setAttribute('aria-hidden', 'false');
      requestAnimationFrame(() => m.classList.add('open'));
      $('[data-si]', m).focus();
      const cerrar = v => {
        m.classList.remove('open');
        m.setAttribute('aria-hidden', 'true');
        document.removeEventListener('keydown', tecla);
        setTimeout(() => { m.innerHTML = ''; }, 600);
        if (previo && previo.focus) previo.focus();
        resolve(v);
      };
      const tecla = e => { if (e.key === 'Escape') cerrar(false); };
      document.addEventListener('keydown', tecla);
      $$('[data-no]', m).forEach(b => b.addEventListener('click', () => cerrar(false)));
      $('[data-si]', m).addEventListener('click', () => cerrar(true));
    });
  }

  /* ---------- Animación de entrada ---------- */
  const io = 'IntersectionObserver' in window
    ? new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.06, rootMargin: '0px 0px -4% 0px' })
    : null;
  function revelar() {
    const alto = window.innerHeight || document.documentElement.clientHeight;
    const pendientes = $$('.reveal:not(.in)');
    pendientes.forEach((el, i) => el.style.setProperty('--d', `${Math.min(i, 7) * 70}ms`));
    // Lo que ya está en pantalla se revela sin depender del observer
    requestAnimationFrame(() => pendientes.forEach(el => {
      if (!io || el.getBoundingClientRect().top < alto) el.classList.add('in');
      else io.observe(el);
    }));
  }

  /* ---------- Navegación ---------- */
  /* [ruta, texto en escritorio, texto corto en la pestaña del celular, ícono] */
  function enlaces() {
    if (!S.sesion) return [];
    const l = [
      ['panel', 'Inicio', 'Inicio', 'grid'],
      ['recomendacion', 'Recomendación', 'Qué hacer', 'sprout'],
      ['historial', 'Historial', 'Historial', 'chart'],
      ['parcela', esTecnico() ? 'Parcela' : 'Mi parcela', 'Parcela', 'pin']
    ];
    if (esTecnico()) l.push(['umbrales', 'Umbrales', 'Umbrales', 'sliders']);
    return l;
  }

  function pintarNav(ruta) {
    const l = enlaces();
    const cur = r => (r === ruta ? 'aria-current="page"' : '');
    const brand = `<a class="brand" href="#/${S.sesion ? 'panel' : 'login'}" aria-label="AgroTech Guasca, inicio"><svg aria-hidden="true"><use href="#logo"></use></svg><span>AgroTech <em>Guasca</em></span></a>`;
    document.body.classList.toggle('sin-sesion', !S.sesion);
    $('#nav').innerHTML = S.sesion
      ? `<header class="topbar"><div class="container topbar-in">
          ${brand}
          <nav class="nav-links" aria-label="Principal">${l.map(([r, t, , i]) => `<a href="#/${r}" ${cur(r)}>${icon(i)}${t}</a>`).join('')}</nav>
          <div class="top-right">
            <span class="sim" title="Prototipo académico: todos los datos son simulados">Datos simulados</span>
            <span class="role-chip" title="${S.sesion.nombre}">${icon('user')}<span>${esTecnico() ? 'Técnico' : 'Agricultor'}</span></span>
            <button class="icon-btn" data-salir aria-label="Cerrar sesión" title="Cerrar sesión">${icon('logout')}</button>
          </div>
        </div></header>
        <nav class="tabbar" aria-label="Principal en el celular">
          <ul>${l.map(([r, , c, i]) => `<li><a href="#/${r}" ${cur(r)}>${icon(i)}<span>${c}</span></a></li>`).join('')}</ul>
        </nav>`
      : `<header class="topbar"><div class="container topbar-in">${brand}<div class="top-right"><span class="sim">Datos simulados</span></div></div></header>`;
  }

  function ir(ruta) {
    if (location.hash === `#/${ruta}`) enrutar(); else location.hash = `#/${ruta}`;
  }

  function enrutar() {
    let ruta = location.hash.replace(/^#\/?/, '') || (S.sesion ? 'panel' : 'login');
    if (!VISTAS[ruta]) ruta = S.sesion ? 'panel' : 'login';
    if (!S.sesion && ruta !== 'login') return ir('login');
    if (S.sesion && ruta === 'login') return ir('panel');
    if (ruta === 'umbrales' && !esTecnico()) { toast('Esta sección es solo para el equipo técnico.', 'warn'); return ir('panel'); }

    S.charts.forEach(c => c.destroy());
    S.charts = [];
    S.ruta = ruta;
    pintarNav(ruta);
    const v = VISTAS[ruta];
    $('#view').innerHTML = v.html();
    if (v.montar) v.montar();
    revelar();
    window.scrollTo({ top: 0, behavior: 'instant' });
    $('#view').focus({ preventScroll: true });
    document.title = `${v.titulo} | AgroTech Guasca`;
  }

  function salir() {
    S.sesion = null;
    store.del('agt.sesion', true);
    toast('Sesión cerrada.', 'info');
    ir('login');
  }

  /* ======================================================================
     Componentes
     ====================================================================== */
  const semaforo = (n, sm) => `<div class="sema ${sm ? 'sm' : ''}" data-n="${n}" role="img" aria-label="Semáforo: ${NIVEL[n].t}"><span class="lamp r"></span><span class="lamp a"></span><span class="lamp g"></span></div>`;

  function escala(k, valor, r) {
    const e = AT.VARS[k].escala;
    const lo = Math.min(e[0], r.min, valor), hi = Math.max(e[1], r.max, valor);
    return v => ((v - lo) / (hi - lo)) * 100;
  }
  function barra(k, ev, r, id) {
    const pct = escala(k, ev.valor, r);
    const e = AT.VARS[k].escala;
    const dot = ev.estado === 'ok' ? '' : ev.nivel === 'rojo' ? 'rojo' : ev.estado;
    return `<div class="rbar" ${id ? `id="${id}"` : ''} aria-hidden="true">
        <span class="band" style="left:${pct(r.min)}%;width:${pct(r.max) - pct(r.min)}%"></span>
        <span class="mtrack" style="--x:${pct(ev.valor)}%"><span class="dot ${dot}"></span></span>
      </div>
      <div class="rlegend"><span>${fv(k, Math.min(e[0], r.min))}</span><span class="ideal">Ideal ${fv(k, r.min)} a ${fv(k, r.max)} ${uni(k)}</span><span>${fv(k, Math.max(e[1], r.max))}</span></div>`;
  }

  function metrica(k, ev, r) {
    const V = AT.VARS[k];
    const tec = esTecnico();
    return `<div class="shell reveal c-6"><div class="core metric">
        <div class="metric-head">
          <span class="m-ico">${icon(V.icono)}</span>
          <div><b>${tec ? V.nombre : V.simple}</b><small>${tec ? V.simple : V.nombre}</small></div>
          <span id="m-${k}-chip">${chipVar(ev)}</span>
        </div>
        <div class="m-val"><strong id="m-${k}-val">${fv(k, ev.valor)}</strong><span>${V.unidad || 'pH'}</span></div>
        ${barra(k, ev, r, `m-${k}-bar`)}
      </div></div>`;
  }

  /* N, P y K en un solo bloque: se leen juntos como "abono" */
  function nutrientes(vars, u) {
    const tec = esTecnico();
    return `<div class="shell reveal c-8"><div class="core">
        <div class="row-between" style="margin-bottom:4px">
          <div><span class="kicker">${tec ? 'Macronutrientes' : 'Abono en el suelo'}</span><h3 class="h2">Nitrógeno, fósforo y potasio</h3></div>
          <span class="m-ico">${icon('leaf')}</span>
        </div>
        <div class="nutri-rows">
          ${['n', 'p', 'k'].map(k => {
            const V = AT.VARS[k], ev = vars[k];
            return `<div class="nrow">
              <div><b>${V.simple}</b><small>${V.corto}, en ppm</small></div>
              <div class="m-val"><strong id="m-${k}-val">${fv(k, ev.valor)}</strong><span>ppm</span></div>
              <div>${barra(k, ev, u[k], `m-${k}-bar`)}</div>
              <span id="m-${k}-chip">${chipVar(ev)}</span>
            </div>`;
          }).join('')}
        </div>
      </div></div>`;
  }

  function semCard(p, ev) {
    const fuera = AT.CLAVES.map(k => ev.vars[k]).filter(e => e.estado !== 'ok');
    return `
      <div class="sem-top"><span class="kicker">Estado del cultivo</span><span class="sim">Simulado</span></div>
      <div class="sem-main">
        ${semaforo(ev.nivel)}
        <div><h2 class="sem-title">${NIVEL[ev.nivel].t}</h2><p>${NIVEL[ev.nivel].f}</p></div>
      </div>
      <div class="sem-foot">
        <span>${icon('clock')} Última lectura ${dHora(ev.lectura.t)}</span>
        <span>${icon('signal')} ${p.sensor} (simulado)</span>
        ${fuera.length ? `<span class="chips">${fuera.map(e => `<span class="chip ${e.nivel}">${AT.VARS[e.clave].corto} ${ESTADO[e.estado].toLowerCase()}</span>`).join('')}</span>` : ''}
      </div>`;
  }

  function recCard(p, recs) {
    const r = recs[0];
    const ap = S.aplicadas[clave(p.id, Date.now())];
    return `
      <div class="row-between"><span class="kicker">Recomendación de hoy</span><span class="chip ${r.nivel}">${NIVEL[r.nivel].t}</span></div>
      <h3>${r.titulo}</h3>
      <div class="qty"><span class="qty-n">${r.cantidad}</span><span class="qty-u">${r.unidad}</span></div>
      <p>${r.accion}</p>
      ${recs.length > 1 ? `<p class="note">${icon('info')} Hay ${recs.length - 1} acción${recs.length > 2 ? 'es' : ''} más para hoy.</p>` : ''}
      ${ap ? `<span class="chip ok">Marcada como aplicada a las ${dHora(ap.t)}</span>` : ''}
      <a class="btn btn-primary" href="#/recomendacion">Ver qué hacer ${bi('arrow')}</a>`;
  }

  function pcardHTML(pid) {
    const { p, ev, recs } = estado(pid);
    const cls = e => (e.estado === 'ok' ? '' : e.nivel === 'rojo' ? 'fuera' : 'cerca');
    return `
      <div><h3>${p.nombre}</h3><small>${p.sustrato}</small></div>
      <div class="p-estado">${semaforo(ev.nivel, true)}<span class="chip ${ev.nivel}">${NIVEL[ev.nivel].t}</span></div>
      <div class="pvals">${AT.CLAVES.map(k => `<div><small>${AT.VARS[k].corto}</small><b class="${cls(ev.vars[k])}">${fv(k, ev.vars[k].valor)}</b></div>`).join('')}</div>
      <p class="p-rec">${recs[0].titulo}</p>
      <button class="btn ${S.sel === pid ? 'btn-primary' : 'btn-ghost'}" data-sel="${pid}" ${S.sel === pid ? 'aria-current="true"' : ''}>${S.sel === pid ? 'Viendo' : 'Ver detalle'}</button>`;
  }

  const liveChip = () => `<span class="live-chip"><span class="pulse" aria-hidden="true"></span><span><b>Datos simulados en vivo.</b> Última lectura <span data-ago>${hace(S.ultima)}</span></span></span>`;

  /* ======================================================================
     Vistas
     ====================================================================== */
  const VISTAS = {};

  /* ---------- P01 · Inicio de sesión ---------- */
  VISTAS.login = {
    titulo: 'Ingresar',
    html: () => `
      <section class="container login">
        <div class="login-copy">
          <span class="eyebrow reveal">${icon('pin')} Vereda La Trinidad, Guasca</span>
          <h1 class="display xl reveal">Mida antes<br>de abonar.</h1>
          <p class="lead reveal">Las medidas de su cultivo de fresa, convertidas en una recomendación clara para hoy.</p>
          <ul class="facts reveal">
            <li><span class="m-ico">${icon('flask')}</span>Acidez del suelo (pH)</li>
            <li><span class="m-ico">${icon('drop')}</span>Agua en el suelo (humedad)</li>
            <li><span class="m-ico">${icon('leaf')}</span>Nitrógeno, fósforo y potasio (NPK)</li>
          </ul>
        </div>
        <div class="shell login-card reveal"><div class="core">
          <h2>Ingresar</h2>
          <p class="muted">Seleccione su rol y escriba su usuario y contraseña.</p>
          <form id="f-login" novalidate>
            <fieldset class="roles" id="roles">
              <legend>¿Quién ingresa?</legend>
              <label class="role-opt"><input type="radio" name="rol" value="agricultor"><span><span class="m-ico">${icon('sprout')}</span><span>Agricultor<small>Ver mi parcela</small></span></span></label>
              <label class="role-opt"><input type="radio" name="rol" value="tecnico"><span><span class="m-ico">${icon('layers')}</span><span>Técnico<small>Todas las parcelas</small></span></span></label>
            </fieldset>
            <div class="msg" id="e-rol"></div>
            <div class="field" id="fd-usuario">
              <label for="usuario">Usuario</label>
              <div class="input-shell"><input id="usuario" name="usuario" autocomplete="username" autocapitalize="off" spellcheck="false" placeholder="Ej. agricultor01"></div>
              <div class="msg" id="e-usuario"></div>
            </div>
            <div class="field" id="fd-clave">
              <label for="clave">Contraseña</label>
              <div class="input-shell"><input id="clave" name="clave" type="password" autocomplete="current-password" placeholder="Su contraseña"><button type="button" class="icon-btn" data-ver aria-label="Mostrar contraseña">${icon('eye')}</button></div>
              <div class="msg" id="e-clave"></div>
            </div>
            <div class="form-err" id="e-login" role="alert"></div>
            <button class="btn btn-primary btn-block" type="submit" id="b-login">Ingresar ${bi('arrow')}</button>
          </form>
          <div class="demo">
            <p><b>Usuarios de prueba.</b> La autenticación es simulada, no hay servidor.</p>
            <div class="demo-btns">
              <button class="demo-btn" data-demo="agricultor01|fresa2026|agricultor"><b>Agricultor, Parcela 01</b><small>agricultor01 / fresa2026</small></button>
              <button class="demo-btn" data-demo="agricultor02|fresa2026|agricultor"><b>Agricultor, Parcela 02</b><small>agricultor02 / fresa2026</small></button>
              <button class="demo-btn" data-demo="tecnico01|agro2026|tecnico"><b>Técnico</b><small>tecnico01 / agro2026</small></button>
            </div>
          </div>
        </div></div>
      </section>`,
    montar() {
      const f = $('#f-login');
      const err = (id, msg) => {
        $(`#e-${id}`).textContent = msg;
        const fd = $(`#fd-${id}`); if (fd) fd.classList.toggle('err', !!msg);
        if (id === 'rol') $('#roles').classList.toggle('err', !!msg);
      };
      $$('[data-demo]').forEach(b => b.addEventListener('click', () => {
        const [u, c, r] = b.dataset.demo.split('|');
        f.usuario.value = u; f.clave.value = c;
        $(`input[name=rol][value=${r}]`, f).checked = true;
        ['rol', 'usuario', 'clave'].forEach(i => err(i, ''));
        $('#e-login').innerHTML = '';
        $('#b-login').focus();
      }));
      $('[data-ver]').addEventListener('click', e => {
        const i = f.clave, ver = i.type === 'password';
        i.type = ver ? 'text' : 'password';
        e.currentTarget.setAttribute('aria-label', ver ? 'Ocultar contraseña' : 'Mostrar contraseña');
      });
      f.addEventListener('input', e => { if (e.target.name) err(e.target.name, ''); $('#e-login').innerHTML = ''; });

      f.addEventListener('submit', e => {
        e.preventDefault();
        const rol = (f.querySelector('input[name=rol]:checked') || {}).value;
        const u = f.usuario.value.trim().toLowerCase();
        const c = f.clave.value;
        let ok = true;
        if (!rol) { err('rol', 'Seleccione si ingresa como agricultor o como técnico.'); ok = false; }
        if (!u) { err('usuario', 'Escriba su usuario.'); ok = false; }
        if (!c) { err('clave', 'Escriba su contraseña.'); ok = false; }
        if (!ok) return;

        const b = $('#b-login');
        b.disabled = true; b.firstChild.textContent = 'Validando… ';
        setTimeout(() => { // Simula la validación en el servidor
          b.disabled = false; b.firstChild.textContent = 'Ingresar ';
          const usr = AT.USUARIOS.find(x => x.usuario === u && x.clave === c);
          if (!usr) { $('#e-login').innerHTML = `${icon('alert')}<span>Usuario o contraseña incorrectos. Revise e intente de nuevo.</span>`; return; }
          if (usr.rol !== rol) { $('#e-login').innerHTML = `${icon('alert')}<span>Este usuario no tiene el rol <b>${rol === 'tecnico' ? 'Técnico' : 'Agricultor'}</b>. Seleccione el rol correcto.</span>`; return; }
          S.sesion = { usuario: usr.usuario, nombre: usr.nombre, rol: usr.rol, parcelas: usr.parcelas };
          S.sel = usr.parcelas[0];
          store.set('agt.sesion', S.sesion, true);
          store.set('agt.sel', S.sel, true);
          toast(`Bienvenido, ${usr.nombre}.`);
          ir('panel');
        }, 450);
      });
    }
  };

  /* ---------- P02 · Dashboard principal ---------- */
  VISTAS.panel = {
    titulo: 'Panel',
    html() {
      const p = parcelaActiva();
      const { ev, recs } = estado(p.id);
      const u = S.umbrales[p.id];
      const tec = esTecnico();
      const vars = ev.vars;
      return `
      <section class="container page">
        ${tec ? `
        <div class="ov">
          <div class="page-head">
            <div>
              <h1 class="display reveal">Todas las parcelas</h1>
              <p class="lead reveal">${AT.PARCELAS.length} parcelas en la Vereda La Trinidad. Elija una para ver su detalle.</p>
            </div>
            <div class="reveal">${liveChip()}</div>
          </div>
          <div class="shell reveal plist"><div class="core">
            <div class="plist-head" aria-hidden="true"><span>Parcela</span><span>Estado</span><span>Lecturas actuales</span><span>Recomendación</span><span></span></div>
            ${AT.PARCELAS.map(x => `<div class="prow ${S.sel === x.id ? 'sel' : ''}" id="pc-${x.id}">${pcardHTML(x.id)}</div>`).join('')}
          </div></div>
        </div>` : ''}

        <div class="page-head" id="detalle">
          <div>
            <span class="eyebrow reveal">${icon('pin')} ${p.nombre}, ${p.ubicacion}</span>
            ${tec
              ? `<h2 class="display reveal">Detalle de la ${p.nombre}</h2>`
              : `<h1 class="display reveal">Así está su cultivo hoy</h1>`}
            <p class="lead reveal">${tec ? `Lecturas del ${p.sensor} comparadas con los umbrales configurados para esta parcela.` : 'Las medidas más recientes de su parcela y lo que conviene hacer hoy.'}</p>
          </div>
          ${tec ? '' : `<div class="reveal">${liveChip()}</div>`}
        </div>

        <div class="bento">
          <div class="shell reveal c-7"><div class="core sem-card tone-${ev.nivel}" id="sem-card">${semCard(p, ev)}</div></div>
          <div class="shell reveal c-5"><div class="core rec-card" id="rec-card">${recCard(p, recs)}</div></div>
          ${metrica('ph', vars.ph, u.ph)}
          ${metrica('humedad', vars.humedad, u.humedad)}
          ${nutrientes(vars, u)}
          <div class="shell reveal c-4"><div class="core tight quick">
            <span class="kicker">Más información</span>
            <a class="quick-link" href="#/historial"><span class="m-ico">${icon('chart')}</span><span><b>Historial y gráficas</b><small>Cómo ha cambiado ${tec ? 'la parcela' : 'su cultivo'}</small></span>${icon('arrow', 'go')}</a>
            <a class="quick-link" href="#/parcela"><span class="m-ico">${icon('pin')}</span><span><b>${tec ? 'Perfil de la parcela' : 'Mi parcela'}</b><small>Ubicación, sustrato y siembra</small></span>${icon('arrow', 'go')}</a>
            ${tec ? `<a class="quick-link" href="#/umbrales"><span class="m-ico">${icon('sliders')}</span><span><b>Configurar umbrales</b><small>Rangos ideales de la fresa</small></span>${icon('arrow', 'go')}</a>` : ''}
          </div></div>
        </div>
      </section>`;
    },
    montar() {
      $$('[data-sel]').forEach(b => b.addEventListener('click', () => {
        S.sel = b.dataset.sel;
        store.set('agt.sel', S.sel, true);
        enrutar();
        requestAnimationFrame(() => {
          $$('.reveal').forEach(el => el.classList.add('in'));
          $('#detalle').scrollIntoView({ behavior: 'smooth', block: 'start' });
        });
      }));
    },
    /* Actualización en vivo sin volver a pintar la página */
    vivo() {
      const p = parcelaActiva();
      const { ev, recs } = estado(p.id);
      const u = S.umbrales[p.id];
      const sem = $('#sem-card .sema');
      if (sem) {
        $('#sem-card').className = `core sem-card tone-${ev.nivel}`;
        sem.dataset.n = ev.nivel;
        sem.setAttribute('aria-label', `Semáforo: ${NIVEL[ev.nivel].t}`);
        $('#sem-card .sem-title').textContent = NIVEL[ev.nivel].t;
        $('#sem-card .sem-main p').textContent = NIVEL[ev.nivel].f;
        const foot = $('#sem-card .sem-foot');
        const tmp = document.createElement('div'); tmp.innerHTML = semCard(p, ev);
        foot.innerHTML = $('.sem-foot', tmp).innerHTML;
      }
      const rc = $('#rec-card'); if (rc) rc.innerHTML = recCard(p, recs);
      AT.CLAVES.forEach(k => {
        const e = ev.vars[k];
        const val = $(`#m-${k}-val`); if (!val) return;
        val.textContent = fv(k, e.valor);
        $(`#m-${k}-chip`).innerHTML = chipVar(e);
        const bar = $(`#m-${k}-bar`);
        bar.querySelector('.mtrack').style.setProperty('--x', `${escala(k, e.valor, u[k])(e.valor)}%`);
        bar.querySelector('.dot').className = `dot ${e.estado === 'ok' ? '' : e.nivel === 'rojo' ? 'rojo' : e.estado}`;
      });
      AT.PARCELAS.forEach(x => {
        const c = $(`#pc-${x.id}`); if (!c) return;
        c.innerHTML = pcardHTML(x.id);
      });
      if (esTecnico()) VISTAS.panel.montar();
    }
  };

  /* ---------- P03 · Recomendación ---------- */
  VISTAS.recomendacion = {
    titulo: 'Recomendación',
    html() {
      const p = parcelaActiva();
      const { ev, recs } = estado(p.id);
      const r = recs[0];
      const hoy = Date.now();
      const ap = S.aplicadas[clave(p.id, hoy)];
      const tec = esTecnico();
      const previas = AT.historialRecomendaciones(S.hist[p.id], S.umbrales[p.id], p, 14);
      const sinAccion = r.tipo === 'ninguna';

      return `
      <section class="container page">
        <a class="back reveal" href="#/panel"><span class="bi">${icon('back')}</span>Volver al panel</a>
        <div class="split">
          <div class="split-left">
            <span class="eyebrow reveal">${icon('cal')} ${dLarga(hoy)}</span>
            <h1 class="display reveal">Qué hacer hoy en ${tec ? 'la' : 'su'} ${p.nombre}</h1>
            <p class="lead reveal">La recomendación se calcula comparando la última lectura con los rangos ideales para la fresa.</p>
            <div class="reveal" style="display:flex;align-items:center;gap:16px;margin-top:32px">
              ${semaforo(ev.nivel)}
              <div><b style="font-size:1.25rem">${NIVEL[ev.nivel].t}</b><p class="muted" style="font-size:14px">Lectura simulada de las ${dHora(ev.lectura.t)}</p></div>
            </div>
          </div>

          <div class="stack">
            <div class="shell reveal"><div class="core main-rec">
              <div class="row-between"><span class="kicker">Acción principal</span><span class="chip ${r.nivel}">${NIVEL[r.nivel].t}</span></div>
              <h2>${r.titulo}</h2>
              <p class="desc">${r.accion}</p>
              <div class="qty-box">
                <span class="kicker">Cantidad sugerida</span>
                <div class="qty"><span class="qty-n">${r.cantidad}</span><span class="qty-u">${r.unidad}</span></div>
              </div>
              <dl class="facts-list">
                <div><dt>Fecha</dt><dd>${dLarga(hoy)}</dd></div>
                <div><dt>¿Por qué?</dt><dd>${r.motivo}</dd></div>
                <div><dt>Parcela</dt><dd>${p.nombre}, sustrato ${p.sustrato.toLowerCase()}</dd></div>
              </dl>
              ${sinAccion
                ? `<div class="applied">${icon('check')}<span>No hay nada que aplicar hoy.</span></div>`
                : ap
                  ? `<div class="applied">${icon('check')}<span>Marcada como aplicada a las ${dHora(ap.t)}</span><button class="btn btn-ghost btn-plain" data-deshacer>Deshacer</button></div>`
                  : `<button class="btn btn-green" data-aplicar>Marcar como aplicada ${bi('check')}</button>`}
              <p class="note" style="margin-top:18px">${icon('info')} Cantidad orientativa generada por un motor de reglas simulado. Confírmela con el equipo técnico antes de aplicarla.</p>
              <details class="tech" ${tec ? 'open' : ''}><summary>${icon('info')} Datos técnicos</summary><p>${r.tecnico}</p></details>
            </div></div>

            ${recs.length > 1 ? `
            <div class="shell reveal"><div class="core">
              <div class="section-title"><h3 class="h2">Otras acciones para hoy</h3></div>
              <div class="list-rows">
                ${recs.slice(1).map(x => `<div class="lrow"><span class="lvl ${x.nivel}" aria-label="${NIVEL[x.nivel].t}"></span><span><b>${x.titulo}</b><small>${x.motivo}</small></span><span class="num" style="font-weight:600;white-space:nowrap">${x.cantidad} <small class="muted" style="display:inline">${x.unidad}</small></span></div>`).join('')}
              </div>
            </div></div>` : ''}

            <div class="shell reveal"><div class="core">
              <div class="section-title"><h3 class="h2">Recomendaciones anteriores</h3><span class="sim">Datos de prueba</span></div>
              <p class="muted" style="font-size:14.5px;margin-top:4px">Últimos 14 días. El color es el estado del cultivo ese día.</p>
              <div class="days" role="list">
                ${previas.slice().reverse().map(x => {
                  const d = new Date(x.t);
                  const est = x.rec.tipo === 'ninguna' ? 'sin acción' : x.aplicada ? 'aplicada' : 'no registrada';
                  return `<div class="day ${x.nivel}" role="listitem" title="${dCorta(x.t)}: ${x.rec.titulo} (${est})" aria-label="${dLarga(x.t)}. ${NIVEL[x.nivel].t}. ${x.rec.titulo}, ${est}.">
                    <small>${d.toLocaleDateString('es-CO', { weekday: 'short' }).replace('.', '')}</small>
                    <span>${d.getDate()}</span>
                    ${x.aplicada ? icon('check') : '<span aria-hidden="true" style="height:16px"></span>'}
                  </div>`;
                }).join('')}
              </div>
              <div class="day-legend">
                <span><span class="lvl verde"></span>Todo bien</span>
                <span><span class="lvl ambar"></span>Atención</span>
                <span><span class="lvl rojo"></span>Actuar</span>
                <span>${icon('check')}Recomendación aplicada</span>
              </div>
              <details class="more">
                <summary>Ver el detalle día por día</summary>
                <div class="list-rows">
                  ${previas.map(x => `<div class="lrow">
                    <span class="when">${dCorta(x.t)}</span>
                    <span><b>${x.rec.titulo}</b><small>${x.rec.tipo === 'ninguna' ? 'Sin acción necesaria' : `${x.rec.cantidad} ${x.rec.unidad}`}</small></span>
                    ${x.rec.tipo === 'ninguna' ? '<span class="chip neutro">Sin acción</span>' : x.aplicada ? '<span class="chip ok">Aplicada</span>' : '<span class="chip neutro">No registrada</span>'}
                  </div>`).join('')}
                </div>
              </details>
            </div></div>
          </div>
        </div>
      </section>`;
    },
    montar() {
      const p = parcelaActiva();
      const k = clave(p.id, Date.now());
      const b = $('[data-aplicar]');
      if (b) b.addEventListener('click', () => {
        const r = estado(p.id).recs[0];
        S.aplicadas[k] = { t: Date.now(), titulo: r.titulo, cantidad: `${r.cantidad} ${r.unidad}` };
        store.set('agt.aplicadas', S.aplicadas);
        toast('Listo. La recomendación quedó marcada como aplicada.');
        enrutar();
      });
      const d = $('[data-deshacer]');
      if (d) d.addEventListener('click', () => {
        delete S.aplicadas[k];
        store.set('agt.aplicadas', S.aplicadas);
        toast('Se quitó la marca de aplicada.', 'info');
        enrutar();
      });
    }
  };

  /* ---------- P04 · Historial y gráficas ---------- */
  function limitesRango(pid) {
    const h = S.hist[pid];
    const primero = h[0].t, fin = h[h.length - 1].t;
    const R = S.rango;
    if (R.tipo === '24h') return [fin - 24 * 3600e3, fin];
    if (R.tipo === '7d') return [fin - 7 * 24 * 3600e3, fin];
    if (R.tipo === '30d') return [primero, fin];
    return [new Date(`${R.desde}T00:00:00`).getTime(), new Date(`${R.hasta}T23:59:59`).getTime()];
  }
  function agrupar(pts, desde, hasta) {
    const span = hasta - desde;
    const paso = span <= 2 * 864e5 ? 3600e3 : span <= 10 * 864e5 ? 3 * 3600e3 : 864e5;
    const grupos = new Map();
    pts.forEach(r => {
      const g = Math.floor((r.t - desde) / paso);
      if (!grupos.has(g)) grupos.set(g, []);
      grupos.get(g).push(r);
    });
    const out = [];
    grupos.forEach(arr => {
      const o = { t: arr[0].t };
      AT.CLAVES.forEach(k => { o[k] = arr.reduce((s, r) => s + r[k], 0) / arr.length; });
      out.push(o);
    });
    return { out, paso };
  }

  VISTAS.historial = {
    titulo: 'Historial',
    html() {
      const p = parcelaActiva();
      const h = S.hist[p.id];
      const [desde, hasta] = limitesRango(p.id);
      const pts = h.filter(r => r.t >= desde && r.t <= hasta);
      const u = S.umbrales[p.id];
      const R = S.rango;
      const opt = (v, t) => `<button type="button" data-rango="${v}" aria-pressed="${R.tipo === v}">${t}</button>`;
      const pct = k => pts.length ? Math.round(pts.filter(r => r[k] >= u[k].min && r[k] <= u[k].max).length / pts.length * 100) : 0;
      const prom = k => pts.length ? pts.reduce((s, r) => s + r[k], 0) / pts.length : 0;
      const tabla = pts.slice(-12).reverse();
      const cls = (k, v) => { const e = AT.evaluarVariable(k, v, u[k]); return e.estado === 'ok' ? '' : e.nivel === 'rojo' ? 'fuera' : 'cerca'; };

      return `
      <section class="container page">
        <a class="back reveal" href="#/panel"><span class="bi">${icon('back')}</span>Volver al panel</a>
        <div class="page-head">
          <div>
            <span class="eyebrow reveal">${icon('chart')} ${p.nombre}</span>
            <h1 class="display reveal">Cómo ha cambiado ${esTecnico() ? 'la parcela' : 'su cultivo'}</h1>
          </div>
          <span class="sim reveal">Simulado, últimos 30 días</span>
        </div>

        <div class="toolbar reveal">
          <div class="seg" role="group" aria-label="Rango de fechas">${opt('24h', 'Último día')}${opt('7d', '7 días')}${opt('30d', '30 días')}${opt('custom', 'Elegir fechas')}</div>
          <form class="custom-range ${R.tipo === 'custom' ? 'show' : ''}" id="f-rango" novalidate>
            <div class="field" id="fd-desde"><label for="desde">Desde</label><div class="input-shell"><input type="date" id="desde" min="${diaISO(h[0].t)}" max="${diaISO(h[h.length - 1].t)}" value="${R.desde}"></div></div>
            <div class="field" id="fd-hasta"><label for="hasta">Hasta</label><div class="input-shell"><input type="date" id="hasta" min="${diaISO(h[0].t)}" max="${diaISO(h[h.length - 1].t)}" value="${R.hasta}"></div></div>
            <button class="btn btn-primary btn-plain" type="submit">Aplicar</button>
          </form>
        </div>
        <div class="form-err" id="e-rango" role="alert" style="margin:-12px 0 24px"></div>

        ${!pts.length ? `<div class="shell reveal"><div class="core"><p class="muted">No hay lecturas en el rango elegido.</p></div></div>` : `
        <div class="bento">
          <div class="shell reveal c-12"><div class="core">
            <div class="stats">
              ${AT.CLAVES.map(k => `<div class="stat"><small>${AT.VARS[k].nombre}</small><strong>${pct(k)} %</strong><span>del tiempo en rango. Promedio ${fv(k, prom(k))} ${uni(k)}</span></div>`).join('')}
            </div>
          </div></div>
          <div class="shell reveal c-6"><div class="core">
            <div class="row-between"><div><span class="kicker">Acidez del suelo</span><h3 class="h2">pH</h3></div><div class="legend"><span><i class="band"></i>Rango ideal</span></div></div>
            <div class="chart-box"><canvas id="g-ph" aria-label="Gráfica de pH en el tiempo" role="img"></canvas></div>
          </div></div>
          <div class="shell reveal c-6"><div class="core">
            <div class="row-between"><div><span class="kicker">Agua en el suelo</span><h3 class="h2">Humedad (%)</h3></div><div class="legend"><span><i class="band"></i>Rango ideal</span></div></div>
            <div class="chart-box"><canvas id="g-hum" aria-label="Gráfica de humedad en el tiempo" role="img"></canvas></div>
          </div></div>
          <div class="shell reveal c-12"><div class="core">
            <div class="row-between" style="flex-wrap:wrap">
              <div><span class="kicker">Nutrientes</span><h3 class="h2">Nitrógeno, Fósforo y Potasio (ppm)</h3></div>
              <div class="legend">
                <span><i style="background:var(--chart-1)"></i>N, ideal ${fv('n', u.n.min)} a ${fv('n', u.n.max)}</span>
                <span><i style="background:var(--chart-2)"></i>P, ideal ${fv('p', u.p.min)} a ${fv('p', u.p.max)}</span>
                <span><i style="background:var(--chart-3)"></i>K, ideal ${fv('k', u.k.min)} a ${fv('k', u.k.max)}</span>
              </div>
            </div>
            <div class="chart-box tall"><canvas id="g-npk" aria-label="Gráfica de nitrógeno, fósforo y potasio" role="img"></canvas></div>
          </div></div>
          <div class="shell reveal c-12"><div class="core">
            <div class="section-title"><h3 class="h2">Últimas lecturas del periodo</h3><span class="sim">Simulado</span></div>
            <div class="table-wrap"><table>
              <thead><tr><th>Fecha y hora</th><th>Parcela</th><th>pH</th><th>Humedad (%)</th><th>N (ppm)</th><th>P (ppm)</th><th>K (ppm)</th></tr></thead>
              <tbody>${tabla.map(r => `<tr><td>${dFechaHora(r.t)}</td><td>${p.nombre}</td>${AT.CLAVES.map(k => `<td class="${cls(k, r[k])}">${fv(k, r[k])}</td>`).join('')}</tr>`).join('')}</tbody>
            </table></div>
          </div></div>
        </div>`}
      </section>`;
    },
    montar() {
      const p = parcelaActiva();
      $$('[data-rango]').forEach(b => b.addEventListener('click', () => {
        const v = b.dataset.rango;
        if (v === 'custom') {
          $$('[data-rango]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
          $('#f-rango').classList.add('show');
          $('#desde').focus();
          return;
        }
        S.rango.tipo = v;
        enrutar();
      }));
      $('#f-rango').addEventListener('submit', e => {
        e.preventDefault();
        const d = $('#desde').value, h = $('#hasta').value;
        const min = $('#desde').min, max = $('#desde').max;
        let msg = '';
        if (!d || !h) msg = 'Elija la fecha inicial y la fecha final.';
        else if (d > h) msg = 'La fecha inicial debe ser anterior o igual a la final.';
        else if (d < min || h > max) msg = `Solo hay datos entre el ${dCorta(new Date(min + 'T12:00').getTime())} y el ${dCorta(new Date(max + 'T12:00').getTime())}.`;
        $('#fd-desde').classList.toggle('err', !!msg && (!d || d > h || d < min));
        $('#fd-hasta').classList.toggle('err', !!msg && (!h || d > h || h > max));
        $('#e-rango').innerHTML = msg ? `${icon('alert')}<span>${msg}</span>` : '';
        if (msg) return;
        S.rango = { tipo: 'custom', desde: d, hasta: h };
        enrutar();
      });
      graficas(p);
    }
  };

  /* Colores de las gráficas desde las variables CSS (modo claro u oscuro) */
  const tok = n => getComputedStyle(document.documentElement).getPropertyValue(n).trim();

  const BANDA = {
    id: 'banda',
    beforeDatasetsDraw(chart, _a, o) {
      if (!o || o.min == null) return;
      const { ctx, chartArea: a, scales: { y } } = chart;
      const top = Math.max(y.getPixelForValue(o.max), a.top);
      const bot = Math.min(y.getPixelForValue(o.min), a.bottom);
      if (bot <= top) return;
      ctx.save();
      ctx.fillStyle = tok('--chart-band');
      ctx.fillRect(a.left, top, a.right - a.left, bot - top);
      ctx.strokeStyle = tok('--chart-band-line');
      ctx.setLineDash([4, 4]);
      ctx.beginPath(); ctx.moveTo(a.left, top); ctx.lineTo(a.right, top); ctx.moveTo(a.left, bot); ctx.lineTo(a.right, bot); ctx.stroke();
      ctx.restore();
    }
  };

  function graficas(p) {
    if (!$('#g-ph')) return;
    if (!window.Chart) {
      $$('.chart-box').forEach(b => { b.innerHTML = `<p class="chart-off">${icon('info')} No se pudo cargar la librería de gráficas (sin conexión). Consulte la tabla de lecturas más abajo.</p>`; });
      return;
    }
    const [desde, hasta] = limitesRango(p.id);
    const { out, paso } = agrupar(S.hist[p.id].filter(r => r.t >= desde && r.t <= hasta), desde, hasta);
    const et = t => (paso >= 864e5 ? dCorta(t) : hasta - desde <= 2 * 864e5 ? dHora(t) : `${dCorta(t)}, ${new Date(t).getHours()} h`);
    const labels = out.map(r => et(r.t));
    const u = S.umbrales[p.id];

    Chart.defaults.font.family = getComputedStyle(document.body).fontFamily;
    Chart.defaults.font.size = 12;
    Chart.defaults.color = tok('--ink-3');

    const linea = (label, k, color, extra) => Object.assign({
      label, data: out.map(r => +r[k].toFixed(AT.VARS[k].dec + 1)),
      borderColor: color, backgroundColor: color, borderWidth: 2, tension: 0.35,
      pointRadius: 0, pointHoverRadius: 5, pointHoverBorderWidth: 3, pointHoverBorderColor: tok('--surface')
    }, extra || {});

    const opciones = (k, banda, sug, marcas = 6) => ({
      responsive: true, maintainAspectRatio: false,
      animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 700, easing: 'easeOutQuart' },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        banda,
        tooltip: {
          backgroundColor: tok('--ink'), titleColor: tok('--inverse'), bodyColor: tok('--inverse'), padding: 10, cornerRadius: 6, boxPadding: 4, usePointStyle: true,
          callbacks: { label: c => ` ${c.dataset.label}: ${fv(c.dataset.clave || k, c.parsed.y)} ${uni(c.dataset.clave || k)}` }
        }
      },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { maxTicksLimit: marcas, maxRotation: 0, autoSkipPadding: 24, align: 'inner' } },
        y: { grid: { color: tok('--chart-grid') }, border: { display: false }, ticks: { maxTicksLimit: 5, padding: 8 }, suggestedMin: sug[0], suggestedMax: sug[1] }
      }
    });

    S.charts.push(new Chart($('#g-ph'), {
      type: 'line', plugins: [BANDA],
      data: { labels, datasets: [linea('pH', 'ph', tok('--chart-1'))] },
      options: opciones('ph', u.ph, [u.ph.min - 0.5, u.ph.max + 0.5], 4)
    }));
    S.charts.push(new Chart($('#g-hum'), {
      type: 'line', plugins: [BANDA],
      data: { labels, datasets: [linea('Humedad', 'humedad', tok('--chart-1'))] },
      options: opciones('humedad', u.humedad, [u.humedad.min - 10, u.humedad.max + 10], 4)
    }));
    S.charts.push(new Chart($('#g-npk'), {
      type: 'line',
      data: {
        labels, datasets: [
          linea('Nitrógeno (N)', 'n', tok('--chart-1'), { clave: 'n' }),
          linea('Fósforo (P)', 'p', tok('--chart-2'), { clave: 'p', borderDash: [6, 4] }),
          linea('Potasio (K)', 'k', tok('--chart-3'), { clave: 'k', borderDash: [2, 3] })
        ]
      },
      options: opciones('n', null, [0, 60])
    }));
  }

  /* ---------- P05 · Perfil de la parcela ---------- */
  VISTAS.parcela = {
    titulo: 'Parcela',
    html() {
      const p = parcelaActiva();
      const u = S.umbrales[p.id];
      const siembra = new Date(`${p.siembra}T00:00:00`);
      const dias = Math.max(0, Math.floor((Date.now() - siembra.getTime()) / 864e5));
      const tec = esTecnico();
      return `
      <section class="container page">
        <a class="back reveal" href="#/panel"><span class="bi">${icon('back')}</span>Volver al panel</a>
        <div class="page-head">
          <div>
            <span class="eyebrow reveal">${icon('pin')} ${tec ? 'Perfil de la parcela' : 'Mi parcela'}</span>
            <h1 class="display reveal">${p.nombre}</h1>
            <p class="lead reveal">${p.ubicacion}, ${p.municipio}</p>
          </div>
          <span class="sim reveal">Datos de prueba</span>
        </div>
        <div class="bento">
          <div class="shell reveal c-7"><div class="core">
            <span class="kicker">Información general</span>
            <dl class="facts-list" style="margin:16px 0 0">
              <div><dt>Ubicación</dt><dd>${p.ubicacion}<br><span class="muted">${p.municipio}</span></dd></div>
              <div><dt>Tipo de sustrato</dt><dd>${p.sustrato}</dd></div>
              <div><dt>Fecha de siembra</dt><dd>${siembra.toLocaleDateString('es-CO', { day: 'numeric', month: 'long', year: 'numeric' })}</dd></div>
              <div><dt>Cultivo</dt><dd>Fresa</dd></div>
              <div><dt>Agricultor</dt><dd>${p.agricultor}</dd></div>
              <div><dt>Sensor</dt><dd>${p.sensor} <span class="sim">Simulado</span></dd></div>
            </dl>
          </div></div>
          <div class="shell reveal c-5"><div class="core" style="display:flex;flex-direction:column;gap:14px">
            <span class="kicker">Tiempo desde la siembra</span>
            <span class="big-num">${dias}</span>
            <span class="muted">días desde el ${dCorta(siembra.getTime())}</span>
            <div style="margin-top:auto;padding-top:24px;border-top:1px dashed var(--hair)"><span class="kicker">Sustrato</span><p style="font-size:1.4rem;font-weight:600;letter-spacing:-.03em;margin-top:4px">${p.sustrato}</p></div>
          </div></div>
          <div class="shell reveal c-12"><div class="core">
            <div class="section-title">
              <div><span class="kicker">Parámetros ideales usados en las recomendaciones</span><h3 class="h2" style="margin-top:4px">Rangos ideales para la fresa</h3></div>
              ${tec ? `<a class="btn btn-ghost" href="#/umbrales">Ajustar umbrales ${bi('sliders')}</a>` : ''}
            </div>
            <div class="table-wrap"><table class="thr-table">
              <thead><tr><th>Variable</th><th>Mínimo</th><th>Máximo</th><th>Qué significa</th></tr></thead>
              <tbody>${AT.CLAVES.map(k => `<tr><td>${AT.VARS[k].nombre}</td><td class="num">${fv(k, u[k].min)} ${uni(k)}</td><td class="num">${fv(k, u[k].max)} ${uni(k)}</td><td class="muted">${AT.VARS[k].simple}</td></tr>`).join('')}</tbody>
            </table></div>
          </div></div>
        </div>
      </section>`;
    }
  };

  /* ---------- P06 · Configuración de umbrales (solo técnico) ---------- */
  VISTAS.umbrales = {
    titulo: 'Umbrales',
    html() {
      const p = parcelaActiva();
      const u = S.umbrales[p.id];
      const lect = ultima(p.id);
      const V = AT.VARS;
      const paso = k => (V[k].dec ? '0.1' : '1');
      return `
      <section class="container page">
        <a class="back reveal" href="#/panel"><span class="bi">${icon('back')}</span>Volver al panel</a>
        <div class="split">
          <div class="split-left">
            <span class="eyebrow reveal">${icon('sliders')} Solo equipo técnico</span>
            <h1 class="display reveal">Rangos ideales de la fresa</h1>
            <p class="lead reveal">El semáforo y las recomendaciones se calculan con estos valores. Los cambios se guardan en este navegador (simulación, sin servidor).</p>
            <div class="shell reveal" style="margin-top:32px"><div class="core">
              <div class="field">
                <span class="label">Parcela</span>
                <div class="seg" role="group" aria-label="Parcela">${AT.PARCELAS.map(x => `<button type="button" data-p="${x.id}" aria-pressed="${x.id === p.id}">${x.nombre}</button>`).join('')}</div>
              </div>
              <label class="check" style="margin-top:22px"><input type="checkbox" id="todas"><span>Aplicar estos rangos a <b>todas las parcelas</b></span></label>
              <div class="side-actions">
                <button class="btn btn-primary" type="submit" form="f-umb">Guardar cambios ${bi('check')}</button>
                <button class="btn btn-ghost btn-plain" type="button" data-defecto>Restablecer valores por defecto</button>
              </div>
            </div></div>
          </div>

          <form id="f-umb" class="stack" novalidate>
            <div class="form-err" id="e-umb" role="alert"></div>
            ${AT.CLAVES.map(k => `
            <div class="shell reveal thr-row"><div class="core" data-k="${k}">
              <div class="metric-head">
                <span class="m-ico">${icon(V[k].icono)}</span>
                <div><b>${V[k].nombre}</b><small>Por defecto ${fv(k, AT.UMBRALES_FRESA[k].min)} a ${fv(k, AT.UMBRALES_FRESA[k].max)} ${V[k].unidad}</small></div>
              </div>
              <div class="field" id="fd-${k}-min"><label for="${k}-min">Mínimo ${V[k].unidad ? `(${V[k].unidad})` : ''}</label><div class="input-shell"><input type="number" inputmode="decimal" id="${k}-min" step="${paso(k)}" min="${V[k].limites[0]}" max="${V[k].limites[1]}" value="${u[k].min}"></div></div>
              <div class="field" id="fd-${k}-max"><label for="${k}-max">Máximo ${V[k].unidad ? `(${V[k].unidad})` : ''}</label><div class="input-shell"><input type="number" inputmode="decimal" id="${k}-max" step="${paso(k)}" min="${V[k].limites[0]}" max="${V[k].limites[1]}" value="${u[k].max}"></div></div>
              <div class="msg" id="e-${k}" style="grid-column:1/-1"></div>
              <div class="preview" id="pv-${k}">${barra(k, AT.evaluarVariable(k, lect[k], u[k]), u[k])}</div>
            </div></div>`).join('')}
          </form>
        </div>
      </section>`;
    },
    montar() {
      const p = parcelaActiva();
      const lect = ultima(p.id);
      const leer = k => ({ min: parseFloat($(`#${k}-min`).value), max: parseFloat($(`#${k}-max`).value) });
      const validar = k => {
        const V = AT.VARS[k], r = leer(k), [a, b] = V.limites;
        let m = '';
        if (!isFinite(r.min) || !isFinite(r.max)) m = 'Escriba el valor mínimo y el máximo.';
        else if (r.min < a || r.max > b) m = `Los valores deben estar entre ${a} y ${b}${V.unidad ? ' ' + V.unidad : ''}.`;
        else if (r.min >= r.max) m = 'El mínimo debe ser menor que el máximo.';
        $(`#e-${k}`).textContent = m;
        $(`#fd-${k}-min`).classList.toggle('err', !!m);
        $(`#fd-${k}-max`).classList.toggle('err', !!m);
        if (!m) $(`#pv-${k}`).innerHTML = barra(k, AT.evaluarVariable(k, lect[k], r), r);
        return !m;
      };

      $$('#f-umb input').forEach(i => i.addEventListener('input', () => { validar(i.id.split('-')[0]); $('#e-umb').innerHTML = ''; }));

      $$('[data-p]').forEach(b => b.addEventListener('click', () => {
        S.sel = b.dataset.p;
        store.set('agt.sel', S.sel, true);
        enrutar();
      }));

      $('[data-defecto]').addEventListener('click', () => {
        AT.CLAVES.forEach(k => {
          $(`#${k}-min`).value = AT.UMBRALES_FRESA[k].min;
          $(`#${k}-max`).value = AT.UMBRALES_FRESA[k].max;
          validar(k);
        });
        toast('Se cargaron los valores por defecto. Pulse “Guardar cambios” para confirmarlos.', 'info');
      });

      $('#f-umb').addEventListener('submit', async e => {
        e.preventDefault();
        const validos = AT.CLAVES.map(validar).every(Boolean);
        if (!validos) {
          $('#e-umb').innerHTML = `${icon('alert')}<span>Revise los campos marcados en rojo antes de guardar.</span>`;
          toast('Hay valores que no son válidos.', 'err');
          return;
        }
        const todas = $('#todas').checked;
        const nuevo = {};
        AT.CLAVES.forEach(k => { nuevo[k] = leer(k); });
        const actual = S.umbrales[p.id];
        const cambios = AT.CLAVES.filter(k => nuevo[k].min !== actual[k].min || nuevo[k].max !== actual[k].max);
        if (!cambios.length && !todas) { toast('No hay cambios para guardar.', 'info'); return; }

        const V = AT.VARS;
        const ok = await confirmar({
          titulo: '¿Guardar los nuevos umbrales?',
          cuerpo: `<p>Se aplicarán a <b>${todas ? 'todas las parcelas' : p.nombre}</b> y cambiarán el semáforo y las recomendaciones.</p>
            ${cambios.length ? `<ul>${cambios.map(k => `<li><b>${V[k].nombre}</b>: ${fv(k, actual[k].min)} a ${fv(k, actual[k].max)} → ${fv(k, nuevo[k].min)} a ${fv(k, nuevo[k].max)} ${V[k].unidad}</li>`).join('')}</ul>` : ''}`,
          ok: 'Guardar'
        });
        if (!ok) return;
        (todas ? AT.PARCELAS.map(x => x.id) : [p.id]).forEach(id => { S.umbrales[id] = copia(nuevo); });
        store.set('agt.umbrales', S.umbrales);
        toast(`Umbrales guardados para ${todas ? 'todas las parcelas' : p.nombre}.`);
        ir('panel');
      });
    }
  };

  /* ======================================================================
     Arranque
     ====================================================================== */
  document.addEventListener('click', e => {
    if (e.target.closest('[data-salir]')) { e.preventDefault(); salir(); return; }
  });
  window.addEventListener('hashchange', enrutar);

  /* Conectividad: el prototipo funciona sin internet porque todo es local */
  const red = () => $('#offline').classList.toggle('show', navigator.onLine === false);
  window.addEventListener('online', () => { red(); toast('Conexión restablecida.'); });
  window.addEventListener('offline', red);
  red();

  /* Recepción periódica de lecturas simuladas */
  setInterval(() => {
    const t = Date.now();
    AT.PARCELAS.forEach(p => {
      const h = S.hist[p.id];
      h.push(AT.siguienteLectura(p, h[h.length - 1], t));
      if (h.length > 3000) h.splice(0, h.length - 3000);
    });
    S.ultima = t;
    if (S.ruta === 'panel' && S.sesion) VISTAS.panel.vivo();
  }, INTERVALO_MS);
  setInterval(() => { $$('[data-ago]').forEach(el => { el.textContent = hace(S.ultima); }); }, 1000);

  enrutar();
})();
