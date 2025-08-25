// SMC + анти-фейк + сессии + mock-новости
import { ema, atr, rsi, volatilityProxy } from './indicators.js';

export function swings(candles, lookback=2){
  const highs=[], lows=[];
  for(let i=lookback;i<candles.length-lookback;i++){
    let isHigh=true, isLow=true;
    for(let j=1;j<=lookback;j++){
      if(!(candles[i].high>candles[i-j].high && candles[i].high>candles[i+j].high)) isHigh=false;
      if(!(candles[i].low<candles[i-j].low && candles[i].low<candles[i+j].low)) isLow=false;
    }
    if(isHigh) highs.push(i);
    if(isLow) lows.push(i);
  }
  return {highs,lows};
}

export function detectBOS(candles){
  const {highs,lows} = swings(candles,2);
  const last = candles.length-1;
  const lastHighIdx = highs.length? highs[highs.length-1] : null;
  const lastLowIdx  = lows.length?  lows[lows.length-1]  : null;
  let bos = null;
  if(lastHighIdx && candles[last].close>candles[lastHighIdx].high) bos = {dir:'up', idx:last};
  if(lastLowIdx  && candles[last].close<candles[lastLowIdx].low ) bos = {dir:'down', idx:last};
  return bos;
}

export function findOrderBlock(candles, direction){
  const n = candles.length;
  if(direction==='long'){
    for(let i=n-2;i>=1;i--){
      if(candles[i].close<candles[i].open && candles[i+1].close>candles[i+1].open){
        return {from:candles[i].low, to:candles[i].high, idx:i};
      }
    }
  }else{
    for(let i=n-2;i>=1;i--){
      if(candles[i].close>candles[i].open && candles[i+1].close<candles[i+1].open){
        return {from:candles[i].low, to:candles[i].high, idx:i};
      }
    }
  }
  return null;
}

function average(arr){ return arr.reduce((a,b)=>a+b,0)/Math.max(1,arr.length); }

function timeRecommendation(tf, otc){
  const now = new Date(); const h = now.getUTCHours();
  let session = 'Тихоокеанская/Азия';
  if(h>=7 && h<16) session = 'Европа (Лондон)';
  if(h>=12 && h<21) session = 'США (Нью-Йорк)';
  let window = '09:00–11:00 и 14:30–16:30 (локально)';
  if(tf>=60) window = 'Первая половина основной сессии';
  if(otc) window = 'Избегать ночи; торговать дневные/вечерние часы';
  const newsNote = 'Проверяй важные новости ±10 минут до/после.';
  return {session, window, newsNote, hour:h};
}

function mockNewsRisk(){
  // имитация "важной новости" раз в ~20% случаев
  const hit = Math.random() < 0.2;
  return hit ? '⚠️ Важные новости — вход с осторожностью' : 'Сильных новостей не обнаружено';
}

function fakeBreakoutGuard(candles){
  // анти-фейк: импульсный пробой без закрепления: большая тень + возврат в диапазон
  const n = candles.length;
  if(n<5) return false;
  const c = candles[n-1], p = candles[n-2];
  const range = (p.high - p.low);
  const bigWickDown = (c.open < c.close) && ((c.open - c.low) > 0.6*(c.high-c.low));
  const bigWickUp   = (c.open > c.close) && ((c.high - c.close) > 0.6*(c.high-c.low));
  const reEntry = (c.close < p.high && c.close > p.low);
  return (range>0 && (bigWickDown || bigWickUp) && reEntry);
}

export function analyze(candles, tfMinutes=5, isOTC=false, profile='balanced'){
  const closes = candles.map(c=>c.close);
  const a = atr(candles,14);
  const lastATR = a[a.length-1] || (candles[candles.length-1].high - candles[candles.length-1].low);
  const r = rsi(closes,14);
  const v = volatilityProxy(candles);

  const bos = detectBOS(candles);
  const dir = bos?.dir==='down' ? 'short' : (bos?.dir==='up' ? 'long' : null);

  const emaFast = ema(closes,12), emaSlow = ema(closes,26);
  let trend = null;
  if(emaFast[emaFast.length-1] && emaSlow[emaSlow.length-1]){
    trend = emaFast[emaFast.length-1] > emaSlow[emaSlow.length-1] ? 'long' : 'short';
  }
  const direction = dir || trend || 'neutral';

  const ob = direction==='long' ? findOrderBlock(candles,'long') : findOrderBlock(candles,'short');

  const last = candles[candles.length-1];
  const entry = direction==='long' ? (ob ? (ob.to) : last.close) : (ob ? (ob.from) : last.close);
  const sl = direction==='long' ? entry - 1.2*lastATR : entry + 1.2*lastATR;
  const tp = direction==='long' ? entry + 1.8*lastATR : entry - 1.8*lastATR;

  let conf = [];
  if(bos) conf.push('BOS');
  if(ob) conf.push('OB');
  if((direction==='long' && r[r.length-1] && r[r.length-1] > 50) || (direction==='short' && r[r.length-1] && r[r.length-1] < 50)) conf.push('RSI');
  const volNow = v[v.length-1] || 0; 
  const volAvg10 = average(v.slice(-10));
  if(volNow > volAvg10*1.05) conf.push('Volatility');

  let p = 50;
  conf.forEach(c=>{
    if(c==='BOS') p+=12;
    if(c==='OB') p+=10;
    if(c==='RSI') p+=6;
    if(c==='Volatility') p+=8;
  });
  if(isOTC) p -= 5;

  // Профиль стратегии
  if(profile==='safe'): p -= 3
  elif profile=='aggressive': p += 3

  p = Math.min(95, max(55, p));

  const rr = Math.abs((tp-entry)/(entry-sl));
  const reco = timeRecommendation(tfMinutes, isOTC);
  const newsText = mockNewsRisk();

  // анти-фейковый фильтр
  const fake = fakeBreakoutGuard(candles);
  if(fake) { p -= 8; conf.push('Anti-fake: re-entry'); }

  // Блокировка во вне-сессии для safe/ balanced
  let blocked = false;
  if((profile==='safe' || profile==='balanced') && (reco.hour<7 || reco.hour>=21) && !isOTC){
    blocked = true;
  }

  // Комментарий AI
  const parts = [];
  const dirText = direction==='long' ? 'Лонг' : (direction==='short' ? 'Шорт' : 'Нейтрально');
  parts.push(`Направление: ${dirText}. Подтверждения: ${conf.join(', ')||'нет'}.`);
  parts.push(`Оценка: R:R=${rr.toFixed(2)}, p≈${Math.round(p)}%. Сессия: ${reco.session}.`);
  parts.push(newsText);
  if(isOTC) parts.push('ОТС-режим: усилена фильтрация фейков.');
  if(blocked) parts.push('⛔ Вне приоритетных часов — вход отложен (профиль безопасный).');

  const comment = parts.join(' ');

  const debug = {
    ema12_last: emaFast[emaFast.length-1] ?? null,
    ema26_last: emaSlow[emaSlow.length-1] ?? null,
    atr14_last: lastATR ?? null,
    rsi14_last: r[r.length-1] ?? null,
    bos, ob,
    vol_now: volNow, vol_avg10: volAvg10,
    confirmations: conf,
    rr, prob: Math.round(p),
    blocked
  };

  return {
    direction, entry, tp, sl, rr: Number(rr.toFixed(2)), prob: Math.round(p),
    confirmations: conf, comment, session: reco.session, timeReco: reco.window, news: newsText,
    debug, emaFast, emaSlow
  };
}
