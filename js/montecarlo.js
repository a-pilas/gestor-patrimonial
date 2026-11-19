// Simulación de Monte Carlo del simulador "¿Cuánto dura mi patrimonio?".
//
// Módulo puro: no toca el store, recibe números y devuelve números (así se
// puede verificar contra una implementación independiente).
//
// Idea: en vez de una rentabilidad fija cada año (que oculta el riesgo de que
// los malos años lleguen justo al empezar a retirar), se simulan miles de
// futuros posibles con rentabilidades que varían al azar, y se cuenta en
// cuántos de ellos el patrimonio aguanta.
//
// Modelo (deliberadamente simple y explícito):
//  - La rentabilidad anual sigue una distribución lognormal con la
//    rentabilidad MEDIA indicada (la misma que el cálculo determinista:
//    E[1+R] = 1+r) y la volatilidad indicada. Por eso el escenario central
//    (mediana) queda algo por debajo de la línea determinista: es el "lastre"
//    normal de la volatilidad.
//  - La retirada inicial crece cada año con la inflación (constante), igual
//    que en el cálculo determinista, y se resta a final de año tras aplicar la
//    rentabilidad. Los impuestos ya van dentro del gasto bruto.
//  - Rentabilidades independientes de un año a otro y sin "colas gordas": los
//    desplomes reales pueden ser peores que los que genera este modelo.
//  - Semilla fija: el mismo resultado cada vez que se recalcula, para que no
//    cambie solo al tocar la pantalla; se cambia a propósito para ver otros
//    futuros.

export const MC_SIMULACIONES = 10000;
export const MC_ANIOS = 60;
export const MC_HORIZONTES = [20, 30, 40];

// mulberry32: generador pseudoaleatorio pequeño y reproducible.
function generadorAleatorio(semilla) {
  let a = semilla >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Normal estándar por Box-Muller: cada sorteo da dos valores, se aprovechan
// los dos (el segundo se guarda para la llamada siguiente).
function generadorNormal(rand) {
  let sobrante = null;
  return function () {
    if (sobrante !== null) {
      const z = sobrante;
      sobrante = null;
      return z;
    }
    let u = 0;
    while (u === 0) u = rand();
    const v = rand();
    const radio = Math.sqrt(-2 * Math.log(u));
    sobrante = radio * Math.sin(2 * Math.PI * v);
    return radio * Math.cos(2 * Math.PI * v);
  };
}

function percentil(ordenado, q) {
  return ordenado[Math.min(ordenado.length - 1, Math.floor(q * ordenado.length))];
}

// Selección rápida (Hoare/Wirth): deja en a[k] el valor que ocuparía esa
// posición si `a` estuviera ordenado, con todo lo menor a su izquierda y lo
// mayor a su derecha, sin ordenar el resto. Sirve para sacar 3 percentiles por
// año mucho más rápido que ordenar 10.000 valores 60 veces.
export function seleccionarOrdinal(a, k, lo = 0, hi = a.length - 1) {
  while (hi > lo) {
    const pivote = a[(lo + hi) >> 1];
    let i = lo;
    let j = hi;
    while (i <= j) {
      while (a[i] < pivote) i++;
      while (a[j] > pivote) j--;
      if (i <= j) {
        const t = a[i];
        a[i] = a[j];
        a[j] = t;
        i++;
        j--;
      }
    }
    if (k <= j) hi = j;
    else if (k >= i) lo = i;
    else return a[k];
  }
  return a[k];
}

// Percentiles 10, 50 y 90 de `a` (se reordena en el proceso).
function percentiles10_50_90(a) {
  const n = a.length;
  const i10 = Math.min(n - 1, Math.floor(0.1 * n));
  const i50 = Math.min(n - 1, Math.floor(0.5 * n));
  const i90 = Math.min(n - 1, Math.floor(0.9 * n));
  const p50 = seleccionarOrdinal(a, i50, 0, n - 1);
  const p10 = i10 < i50 ? seleccionarOrdinal(a, i10, 0, i50 - 1) : p50;
  const p90 = i90 > i50 ? seleccionarOrdinal(a, i90, i50 + 1, n - 1) : p50;
  return { p10, p50, p90 };
}

// patrimonioInicial: € de partida. retiradaAnual: € que salen de la cartera el
// primer año (ya descontado el alquiler); crece con la inflación.
// Devuelve la serie de percentiles por año, la duración de los escenarios
// bajista (percentil 10), central (50) y alcista (90) —Infinity = no se agota
// en `anios`— y la probabilidad de que el patrimonio no se agote antes de cada
// horizonte.
export function simulacionMonteCarlo({
  patrimonioInicial,
  retiradaAnual,
  rentabilidadPct,
  inflacionPct,
  volatilidadPct,
  semilla = 1,
  simulaciones = MC_SIMULACIONES,
  anios = MC_ANIOS,
}) {
  const n = Math.max(1, Math.floor(simulaciones));
  const w0 = Math.max(0, Number(patrimonioInicial) || 0);
  const retirada0 = Math.max(0, Number(retiradaAnual) || 0);
  const r = Math.max(-0.99, (Number(rentabilidadPct) || 0) / 100);
  const infl = (Number(inflacionPct) || 0) / 100;
  const sigma = Math.max(0, (Number(volatilidadPct) || 0) / 100);
  const mu = Math.log(1 + r) - (sigma * sigma) / 2;
  const normal = generadorNormal(generadorAleatorio(semilla));

  const w = new Float64Array(n).fill(w0);
  const agotadoEn = new Float64Array(n).fill(Infinity);
  const copia = new Float64Array(n);
  // `media` solo sirve para verificar el modelo (E[patrimonio] sin agotarse).
  const serie = [{ anio: 0, p10: w0, p50: w0, p90: w0, media: w0 }];

  for (let t = 1; t <= anios; t++) {
    const salida = retirada0 * Math.pow(1 + infl, t - 1);
    let suma = 0;
    for (let i = 0; i < n; i++) {
      if (agotadoEn[i] !== Infinity) continue;
      const rendimiento = sigma > 0 ? Math.exp(mu + sigma * normal()) : 1 + r;
      let valor = w[i] * rendimiento - salida;
      if (valor <= 0) {
        valor = 0;
        agotadoEn[i] = t;
      }
      w[i] = valor;
      suma += valor;
    }
    copia.set(w);
    const { p10, p50, p90 } = percentiles10_50_90(copia);
    serie.push({ anio: t, p10, p50, p90, media: suma / n });
  }

  const ordenadas = Float64Array.from(agotadoEn).sort();
  const probabilidades = MC_HORIZONTES.filter((h) => h <= anios).map((h) => {
    let vivos = 0;
    for (let i = 0; i < n; i++) if (agotadoEn[i] > h) vivos++;
    return { horizonte: h, prob: vivos / n };
  });
  let sinAgotar = 0;
  for (let i = 0; i < n; i++) if (agotadoEn[i] === Infinity) sinAgotar++;

  return {
    simulaciones: n,
    anios,
    semilla,
    rentabilidadPct: r * 100,
    volatilidadPct: sigma * 100,
    serie,
    duracion: { bajista: percentil(ordenadas, 0.1), central: percentil(ordenadas, 0.5), alcista: percentil(ordenadas, 0.9) },
    probabilidades,
    probSinAgotar: sinAgotar / n,
  };
}
