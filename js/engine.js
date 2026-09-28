/* ==========================================================================
   AgroTech Guasca - Motor de evaluación y recomendaciones (RF03)
   Compara cada lectura con los umbrales ideales y produce el color del
   semáforo y la acción sugerida. Las cantidades son ORIENTATIVAS y SIMULADAS:
   en un sistema real deben calibrarse con el equipo técnico.
   ========================================================================== */
(function () {
  'use strict';

  const AT = window.AT;
  const PESO = { verde: 0, ambar: 1, rojo: 2 };
  AT.PESO = PESO;

  const num = (v, dec) => Number(v).toLocaleString('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec });
  const fv = (clave, v) => num(v, AT.VARS[clave].dec);
  AT.formato = fv;

  /* Semáforo por variable: dentro del rango = verde; fuera hasta un 25 % del
     ancho del rango = ámbar; más lejos = rojo. */
  AT.evaluarVariable = function (clave, valor, r) {
    const ancho = Math.max(r.max - r.min, 1e-6);
    let estado = 'ok', fuera = 0;
    if (valor < r.min) { estado = 'bajo'; fuera = r.min - valor; }
    else if (valor > r.max) { estado = 'alto'; fuera = valor - r.max; }
    const razon = fuera / ancho;
    const nivel = estado === 'ok' ? 'verde' : razon <= 0.25 ? 'ambar' : 'rojo';
    return { clave, valor, rango: r, estado, nivel, razon, fuera };
  };

  AT.evaluarLectura = function (lectura, umbrales) {
    const vars = {};
    let nivel = 'verde';
    AT.CLAVES.forEach(k => {
      const e = AT.evaluarVariable(k, lectura[k], umbrales[k]);
      vars[k] = e;
      if (PESO[e.nivel] > PESO[nivel]) nivel = e.nivel;
    });
    return { nivel, vars, lectura };
  };

  const r5 = v => Math.max(5, Math.round(v / 5) * 5);
  const hidro = p => p.sustrato === 'Hidropónico';
  const rangoTxt = (k, r) => `${fv(k, r.min)} y ${fv(k, r.max)}${AT.VARS[k].unidad ? ' ' + AT.VARS[k].unidad : ''}`;
  const tecnico = e => {
    const V = AT.VARS[e.clave];
    const signo = e.estado === 'bajo' ? '<' : '>';
    const lim = e.estado === 'bajo' ? e.rango.min : e.rango.max;
    return `${V.nombre} = ${fv(e.clave, e.valor)} ${V.unidad} ${signo} ${fv(e.clave, lim)} · desvío ${fv(e.clave, e.fuera)} ${V.unidad} (${Math.round(e.razon * 100)} % del ancho del rango)`;
  };

  const NUTRI = {
    n: { nombre: 'nitrógeno', factor: 1.5 },
    p: { nombre: 'fósforo', factor: 1.0 },
    k: { nombre: 'potasio', factor: 1.2 }
  };

  /* Una regla por variable y dirección. */
  function regla(e, parcela) {
    const k = e.clave, r = e.rango;
    const base = { clave: k, nivel: e.nivel, estado: e.estado, razon: e.razon, tecnico: tecnico(e) };
    const centro = (r.min + r.max) / 2;

    if (k === 'ph' && e.estado === 'bajo') {
      if (hidro(parcela)) return Object.assign(base, {
        tipo: 'cal', titulo: 'Subir el pH de la solución nutritiva',
        accion: 'Ajuste la solución del tanque poco a poco y vuelva a medir antes de regar.',
        cantidad: '+' + num(centro - e.valor, 1), unidad: 'unidades de pH',
        motivo: `El pH está en ${fv(k, e.valor)}: demasiado ácido. Lo ideal para la fresa es entre ${rangoTxt(k, r)}.`
      });
      return Object.assign(base, {
        tipo: 'cal', titulo: 'Aplicar cal agrícola',
        accion: 'Esparza la cal de forma pareja sobre el sustrato y riegue suave después.',
        cantidad: String(r5((r.min - e.valor) * 500)), unidad: 'g por cada 10 m²',
        motivo: `El pH está en ${fv(k, e.valor)}: el suelo está muy ácido y la planta no aprovecha el abono. Lo ideal es entre ${rangoTxt(k, r)}.`
      });
    }
    if (k === 'ph' && e.estado === 'alto') {
      if (hidro(parcela)) return Object.assign(base, {
        tipo: 'azufre', titulo: 'Bajar el pH de la solución nutritiva',
        accion: 'Ajuste la solución del tanque poco a poco y vuelva a medir antes de regar.',
        cantidad: '−' + num(e.valor - centro, 1), unidad: 'unidades de pH',
        motivo: `El pH está en ${fv(k, e.valor)}: poco ácido. Lo ideal para la fresa es entre ${rangoTxt(k, r)}.`
      });
      return Object.assign(base, {
        tipo: 'azufre', titulo: 'No aplicar cal · aplicar azufre agrícola',
        accion: 'Aplique el azufre alrededor de las plantas y no eche cal hasta nueva lectura.',
        cantidad: String(r5((e.valor - r.max) * 300)), unidad: 'g por cada 10 m²',
        motivo: `El pH está en ${fv(k, e.valor)}: poco ácido para la fresa. Lo ideal es entre ${rangoTxt(k, r)}.`
      });
    }
    if (k === 'humedad' && e.estado === 'bajo') return Object.assign(base, {
      tipo: 'riego', titulo: 'Regar hoy',
      accion: 'Encienda el riego por goteo en la mañana o al final de la tarde, no al mediodía.',
      cantidad: String(Math.min(60, Math.max(10, Math.round((r.min - e.valor) * 2 + 10)))), unidad: 'minutos de riego por goteo',
      motivo: `La humedad está en ${fv(k, e.valor)} %: el suelo está seco. Lo ideal es entre ${rangoTxt(k, r)}.`
    });
    if (k === 'humedad' && e.estado === 'alto') return Object.assign(base, {
      tipo: 'no-riego', titulo: 'No regar hoy',
      accion: 'Suspenda el riego hasta la próxima lectura. El exceso de agua lava el abono.',
      cantidad: '0', unidad: 'minutos de riego',
      motivo: `La humedad está en ${fv(k, e.valor)} %: hay demasiada agua. Lo ideal es entre ${rangoTxt(k, r)}.`
    });

    const nu = NUTRI[k];
    if (e.estado === 'bajo') return Object.assign(base, {
      tipo: 'abono', titulo: `Aplicar abono con ${nu.nombre}`,
      accion: 'Disuelva el abono en el agua de riego o aplíquelo alrededor de cada planta, sin tocar las hojas.',
      cantidad: String(Math.max(5, Math.round((r.min - e.valor) * nu.factor))), unidad: 'g por cada 10 plantas',
      motivo: `Al cultivo le falta ${nu.nombre}: hay ${fv(k, e.valor)} ppm y lo ideal es entre ${rangoTxt(k, r)}.`
    });
    return Object.assign(base, {
      tipo: 'no-abono', titulo: `No aplicar abono con ${nu.nombre}`,
      accion: 'Ya hay más de lo necesario. El sobrante se lava con el riego y llega a las quebradas.',
      cantidad: '0', unidad: 'g',
      motivo: `Hay ${fv(k, e.valor)} ppm de ${nu.nombre} y lo ideal es entre ${rangoTxt(k, r)}.`
    });
  }

  AT.SIN_ACCION = {
    clave: null, nivel: 'verde', estado: 'ok', razon: 0, tipo: 'ninguna',
    titulo: 'Hoy no necesita abono, cal ni riego extra',
    accion: 'Siga con el manejo normal de su cultivo.',
    cantidad: '0', unidad: 'insumos adicionales',
    motivo: 'Todas las lecturas están dentro de lo ideal para la fresa.',
    tecnico: 'Todas las variables dentro de umbral.'
  };

  /* Lista ordenada: primero lo más urgente. */
  AT.recomendaciones = function (ev, parcela) {
    const recs = AT.CLAVES
      .map(k => ev.vars[k])
      .filter(e => e.estado !== 'ok')
      .map(e => regla(e, parcela))
      .sort((a, b) => PESO[b.nivel] - PESO[a.nivel] || b.razon - a.razon);
    return recs.length ? recs : [Object.assign({}, AT.SIN_ACCION)];
  };

  /* Recomendaciones de días anteriores (lectura de las 08:00 de cada día).
     El estado "aplicada" de días pasados es un dato de prueba. */
  AT.historialRecomendaciones = function (hist, umbrales, parcela, dias) {
    const out = [];
    const ocho = new Date(); ocho.setHours(8, 0, 0, 0);
    for (let d = 1; d <= dias; d++) {
      const t = ocho.getTime() - d * 864e5;
      const lect = hist.find(r => r.t >= t);
      if (!lect || lect.t - t > 2 * 3600e3) continue;
      const ev = AT.evaluarLectura(lect, umbrales);
      const rec = AT.recomendaciones(ev, parcela)[0];
      const aplicada = rec.tipo !== 'ninguna' && AT.aleatorio(parcela.id + t)() < 0.65;
      out.push({ t: lect.t, nivel: ev.nivel, rec, aplicada });
    }
    return out;
  };
})();
