/**
 * ZONA A1 — Structure/Zone Engine
 * Port dari Pine Script "ZONA A1 Mataryclub" (leg/swing detection, BOS/CHoCH,
 * zona BR1 Golden Zone 62-77%, zona BR2 Equilibrium ~50%, status freshness).
 *
 * Sengaja dipisah dari rendering — cuma nerima array candle, ngeluarin state.
 * Gak ada TP/SL line, gak ada multi-timeframe trend filter (di luar scope).
 *
 * Input candle: { time (unix seconds), open, high, low, close }
 */
(function (global) {
  const BEARISH_LEG = 0;
  const BULLISH_LEG = 1;
  const BULLISH = 1;
  const BEARISH = -1;

  function computeLegArray(candles, swingLength) {
    const n = candles.length;
    const legArr = new Array(n).fill(BEARISH_LEG);
    let legState = BEARISH_LEG;

    for (let i = 0; i < n; i++) {
      if (i >= swingLength) {
        let hh = -Infinity;
        let ll = Infinity;
        for (let k = i - swingLength + 1; k <= i; k++) {
          if (candles[k].high > hh) hh = candles[k].high;
          if (candles[k].low < ll) ll = candles[k].low;
        }
        const highBack = candles[i - swingLength].high;
        const lowBack = candles[i - swingLength].low;
        if (highBack > hh) legState = BEARISH_LEG;
        else if (lowBack < ll) legState = BULLISH_LEG;
      }
      legArr[i] = legState;
    }
    return legArr;
  }

  /**
   * @param {Array} candles - sorted ascending by time
   * @param {Object} opts
   * @param {number} opts.swingLength - default 50 (sama kayak swingsLengthInput di Pine)
   * @returns {Object} state akhir + histori breaks buat marker di chart
   */
  function compute(candles, opts) {
    const swingLength = (opts && opts.swingLength) || 50;
    const n = candles.length;
    if (n < swingLength + 2) {
      return { ready: false, reason: "butuh minimal " + (swingLength + 2) + " candle" };
    }

    const legArr = computeLegArray(candles, swingLength);

    let trailing = {
      top: candles[0].high,
      bottom: candles[0].low,
      topTime: candles[0].time,
      bottomTime: candles[0].time,
    };
    let swingHigh = { level: null, crossed: false };
    let swingLow = { level: null, crossed: false };

    let swingBias = 0; // 0 none, 1 bull, -1 bear
    let waitingLong = false;
    let waitingShort = false;
    let longGZDone = false;
    let shortGZDone = false;
    let longEQDone = false;
    let shortEQDone = false;

    // 0 = invalid/belum ada, 1 = fresh, 2 = used
    let gzLongStatus = 0;
    let gzShortStatus = 0;
    let eqLongStatus = 0;
    let eqShortStatus = 0;

    const breaks = []; // {index, time, type: 'bull'|'bear', level}

    for (let i = 0; i < n; i++) {
      const c = candles[i];

      // --- pivot terdeteksi (retroaktif, swingLength bar ke belakang) ---
      if (i >= swingLength) {
        const prevLeg = legArr[i - 1];
        const curLeg = legArr[i];
        const pivotLow = curLeg - prevLeg === 1; // BEARISH(0) -> BULLISH(1)
        const pivotHigh = curLeg - prevLeg === -1; // BULLISH(1) -> BEARISH(0)
        const backIdx = i - swingLength;

        if (pivotLow) {
          trailing.bottom = candles[backIdx].low;
          trailing.bottomTime = candles[backIdx].time;
          swingLow = { level: candles[backIdx].low, crossed: false };
        }
        if (pivotHigh) {
          trailing.top = candles[backIdx].high;
          trailing.topTime = candles[backIdx].time;
          swingHigh = { level: candles[backIdx].high, crossed: false };
        }
      }

      // --- trailing extremes pakai bar sekarang ---
      if (c.high >= trailing.top) {
        trailing.top = c.high;
        trailing.topTime = c.time;
      }
      if (c.low <= trailing.bottom) {
        trailing.bottom = c.low;
        trailing.bottomTime = c.time;
      }

      // --- BOS / CHoCH ---
      const prevClose = i > 0 ? candles[i - 1].close : c.close;
      const bullishBreak =
        swingHigh.level != null && !swingHigh.crossed && prevClose <= swingHigh.level && c.close > swingHigh.level;
      const bearishBreak =
        swingLow.level != null && !swingLow.crossed && prevClose >= swingLow.level && c.close < swingLow.level;

      if (bullishBreak) swingHigh.crossed = true;
      if (bearishBreak) swingLow.crossed = true;

      if (bullishBreak) {
        swingBias = BULLISH;
        waitingLong = true;
        waitingShort = false;
        longGZDone = false;
        longEQDone = false;
        gzLongStatus = 1;
        gzShortStatus = 0;
        eqLongStatus = 1;
        eqShortStatus = 0;
        breaks.push({ index: i, time: c.time, type: "bull", level: swingHigh.level });
      }
      if (bearishBreak) {
        swingBias = BEARISH;
        waitingShort = true;
        waitingLong = false;
        shortGZDone = false;
        shortEQDone = false;
        gzShortStatus = 1;
        gzLongStatus = 0;
        eqShortStatus = 1;
        eqLongStatus = 0;
        breaks.push({ index: i, time: c.time, type: "bear", level: swingLow.level });
      }

      // --- zona, dihitung ulang tiap bar dari trailing top/bottom terkini ---
      const bullishFibo = trailing.bottomTime < trailing.topTime;
      const range = trailing.top - trailing.bottom;
      const lvl62 = bullishFibo ? trailing.top - 0.62 * range : trailing.bottom + 0.62 * range;
      const lvl77 = bullishFibo ? trailing.top - 0.77 * range : trailing.bottom + 0.77 * range;
      const gzTop = Math.max(lvl62, lvl77);
      const gzBot = Math.min(lvl62, lvl77);
      const eqTop = 0.525 * trailing.top + 0.475 * trailing.bottom;
      const eqBot = 0.525 * trailing.bottom + 0.475 * trailing.top;

      const inGoldenLong = bullishFibo && c.close <= gzTop && c.close >= gzBot;
      const inGoldenShort = !bullishFibo && c.close <= gzTop && c.close >= gzBot;
      const inEqLong = bullishFibo && c.close <= eqTop && c.close >= eqBot;
      const inEqShort = !bullishFibo && c.close <= eqTop && c.close >= eqBot;

      const longGZ = waitingLong && inGoldenLong && !longGZDone && !bullishBreak;
      const shortGZ = waitingShort && inGoldenShort && !shortGZDone && !bearishBreak;
      const longEQ = waitingLong && inEqLong && !longEQDone && !bullishBreak;
      const shortEQ = waitingShort && inEqShort && !shortEQDone && !bearishBreak;

      if (longGZ) {
        longGZDone = true;
        gzLongStatus = 2;
      }
      if (shortGZ) {
        shortGZDone = true;
        gzShortStatus = 2;
      }
      if (longEQ) {
        longEQDone = true;
        eqLongStatus = 2;
      }
      if (shortEQ) {
        shortEQDone = true;
        eqShortStatus = 2;
      }
    }

    // --- state final (dipakai buat render zona + dashboard) ---
    const bullishFibo = trailing.bottomTime < trailing.topTime;
    const range = trailing.top - trailing.bottom;
    const lvl62 = bullishFibo ? trailing.top - 0.62 * range : trailing.bottom + 0.62 * range;
    const lvl77 = bullishFibo ? trailing.top - 0.77 * range : trailing.bottom + 0.77 * range;
    const gzTop = Math.max(lvl62, lvl77);
    const gzBot = Math.min(lvl62, lvl77);
    const eqTop = 0.525 * trailing.top + 0.475 * trailing.bottom;
    const eqBot = 0.525 * trailing.bottom + 0.475 * trailing.top;

    const gzValid = range > 0 && swingHigh.level != null && swingLow.level != null;
    const eqValid = gzValid;

    const noSetup =
      swingBias === 0 ||
      !gzValid ||
      ((!waitingLong || (longGZDone && longEQDone)) && (!waitingShort || (shortGZDone && shortEQDone)));

    const nextAction = noSetup ? "WAIT" : waitingLong ? "BUY" : "SELL";

    return {
      ready: true,
      swingLength,
      bias: swingBias, // 1 bull, -1 bear, 0 none
      biasLabel: swingBias === 1 ? "BULLISH" : swingBias === -1 ? "BEARISH" : "NONE",
      waitingLong,
      waitingShort,
      trailing,
      swingHigh,
      swingLow,
      bullishFibo,
      zones: {
        br1: { top: gzTop, bottom: gzBot, buySide: bullishFibo },
        br2: { top: eqTop, bottom: eqBot, buySide: bullishFibo },
      },
      freshness: {
        br1: { long: gzLongStatus, short: gzShortStatus },
        br2: { long: eqLongStatus, short: eqShortStatus },
      },
      done: { longGZDone, shortGZDone, longEQDone, shortEQDone },
      nextAction, // "WAIT" | "BUY" | "SELL"
      breaks, // histori BOS/CHoCH buat marker chart
    };
  }

  global.ZonaA1Engine = { compute };
})(typeof window !== "undefined" ? window : globalThis);
