/* ==========================================================================
   AgroTech Guasca - DATOS SIMULADOS
   Ningún valor de este archivo proviene de sensores reales. Las lecturas se
   generan con un modelo aleatorio reproducible para poder probar el prototipo.
   ========================================================================== */
(function () {
  'use strict';

  const AT = (window.AT = {});

  /* ---------- Usuarios de prueba (autenticación simulada) ---------- */
  AT.USUARIOS = [
    { usuario: 'agricultor01', clave: 'fresa2026', rol: 'agricultor', nombre: 'Agricultor 01', parcelas: ['P01'] },
    { usuario: 'agricultor02', clave: 'fresa2026', rol: 'agricultor', nombre: 'Agricultor 02', parcelas: ['P02'] },
    { usuario: 'tecnico01', clave: 'agro2026', rol: 'tecnico', nombre: 'Equipo técnico', parcelas: ['P01', 'P02', 'P03'] }
  ];

  /* ---------- Variables medidas ---------- */
  AT.CLAVES = ['ph', 'humedad', 'n', 'p', 'k'];
  AT.VARS = {
    ph:      { corto: 'pH',      nombre: 'pH',             simple: 'Acidez del suelo', unidad: '',    dec: 1, escala: [4, 8],   limites: [3, 9],   icono: 'flask' },
    humedad: { corto: 'Humedad', nombre: 'Humedad',        simple: 'Agua en el suelo', unidad: '%',   dec: 0, escala: [0, 100], limites: [0, 100], icono: 'drop' },
    n:       { corto: 'N',       nombre: 'Nitrógeno (N)',  simple: 'Nitrógeno',        unidad: 'ppm', dec: 0, escala: [0, 80],  limites: [0, 300], icono: 'leaf' },
    p:       { corto: 'P',       nombre: 'Fósforo (P)',    simple: 'Fósforo',          unidad: 'ppm', dec: 0, escala: [0, 60],  limites: [0, 300], icono: 'leaf' },
    k:       { corto: 'K',       nombre: 'Potasio (K)',    simple: 'Potasio',          unidad: 'ppm', dec: 0, escala: [0, 70],  limites: [0, 300], icono: 'leaf' }
  };

  /* ---------- Umbrales ideales por defecto para fresa ----------
     pH 5.5 a 6.5 proviene del proyecto. Humedad y NPK son SUPUESTOS de
     prototipo; el técnico los ajusta en la pantalla de umbrales. */
  AT.UMBRALES_FRESA = {
    ph: { min: 5.5, max: 6.5 },
    humedad: { min: 40, max: 60 },
    n: { min: 25, max: 45 },
    p: { min: 15, max: 30 },
    k: { min: 20, max: 40 }
  };

  /* ---------- Parcelas (datos de prueba) ----------
     `base` es el punto alrededor del cual oscila la simulación: la 01 está
     sana, la 02 tiene el pH bajo y le falta potasio, la 03 está seca y con
     exceso de nitrógeno. Así se pueden ver los tres colores del semáforo. */
  AT.PARCELAS = [
    {
      id: 'P01', nombre: 'Parcela 01', agricultor: 'Agricultor 01',
      ubicacion: 'Vereda La Trinidad, Sector San Francisco', municipio: 'Guasca, Cundinamarca',
      sustrato: 'Semihidropónico', siembra: '2026-03-01', sensor: 'Nodo IoT 01',
      base: { ph: 6.1, humedad: 49, n: 33, p: 20, k: 27 }
    },
    {
      id: 'P02', nombre: 'Parcela 02', agricultor: 'Agricultor 02',
      ubicacion: 'Vereda La Trinidad, Sector San Francisco', municipio: 'Guasca, Cundinamarca',
      sustrato: 'Hidropónico', siembra: '2026-04-15', sensor: 'Nodo IoT 02',
      base: { ph: 5.1, humedad: 52, n: 30, p: 18, k: 17 }
    },
    {
      id: 'P03', nombre: 'Parcela 03', agricultor: 'Agricultor 03',
      ubicacion: 'Vereda La Trinidad, Sector San Francisco', municipio: 'Guasca, Cundinamarca',
      sustrato: 'Semihidropónico', siembra: '2026-02-10', sensor: 'Nodo IoT 03',
      base: { ph: 6.2, humedad: 36, n: 48, p: 22, k: 31 }
    }
  ];

  /* ---------- Generador aleatorio reproducible ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function semilla(txt) {
    let h = 2166136261;
    for (const c of String(txt)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  AT.aleatorio = txt => mulberry32(semilla(txt));

  const HORA = 3600e3;
  const RUIDO = { ph: 0.05, humedad: 1.6, n: 1.1, p: 0.7, k: 0.9 };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const r2 = v => Math.round(v * 100) / 100;

  /* Un paso del modelo: reversión a la base + ciclo diario de humedad + ruido.
     `escala` < 1 suaviza los pasos cuando se simulan lecturas cada pocos segundos. */
  function paso(prev, base, rnd, t, escala) {
    const d = new Date(t);
    const hora = d.getHours() + d.getMinutes() / 60;
    const dia = t / (24 * HORA);
    const rev = 0.08 * escala;
    const ruido = k => (rnd() - 0.5) * 2 * RUIDO[k] * escala;
    const objHum = base.humedad + 5 * Math.cos(((hora - 6) / 24) * 2 * Math.PI);
    return {
      t,
      ph: r2(clamp(prev.ph + (base.ph - prev.ph) * rev + ruido('ph'), 3.5, 8.5)),
      humedad: r2(clamp(prev.humedad + (objHum - prev.humedad) * 0.25 * escala + ruido('humedad'), 5, 95)),
      n: r2(clamp(prev.n + (base.n + 3 * Math.sin(dia / 5) - prev.n) * rev + ruido('n'), 0, 200)),
      p: r2(clamp(prev.p + (base.p + 2 * Math.sin(dia / 7 + 1) - prev.p) * rev + ruido('p'), 0, 200)),
      k: r2(clamp(prev.k + (base.k + 2.5 * Math.sin(dia / 6 + 2) - prev.k) * rev + ruido('k'), 0, 200))
    };
  }

  /* Historial simulado: una lectura por hora durante los últimos 30 días. */
  AT.generarHistorial = function (parcela, ahora) {
    const rnd = AT.aleatorio(parcela.id);
    const fin = Math.floor(ahora / HORA) * HORA;
    let prev = Object.assign({ t: fin - 30 * 24 * HORA }, parcela.base);
    const out = [];
    for (let t = prev.t; t <= fin; t += HORA) {
      prev = paso(prev, parcela.base, rnd, t, 1);
      out.push(prev);
    }
    return out;
  };

  /* Lectura "en tiempo real" simulada. */
  AT.siguienteLectura = function (parcela, prev, t) {
    return paso(prev, parcela.base, Math.random, t, 0.35);
  };
})();
