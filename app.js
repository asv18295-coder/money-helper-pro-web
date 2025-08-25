/* Orchestrator */
import { analyze } from './smc.js';

let chart, series, entryLine, tpLine, slLine, ema12Series, ema26Series, obBox, bosMarker;

const els = {
  pair: document.getElementById('pair'),
  tf: document.getElementById('tf'),
  otc: document.getElementById('otc'),
  dev: document.getElementById('devmode'),
  profile: document.getElementById('profile'),
  analyze: document.getElementById('analyze'),
  refresh: document.getElementById('refresh'),
  dir: document.getElementById('direction'),
  entry: document.getElementById('entry'),
  tp: document.getElementById('tp'),
  sl: document.getElementById('sl'),
  prob: document.getElementById('prob'),
  rr: document.getElementById('rr'),
  conf: document.getElementById('confidence'),
  aiComment: document.getElementById('aiComment'),
  timeReco: document.getElementById('timeReco'),
  session: document.getElementById('session'),
  news: document.getElementById('news'),
  push: document.getElementById('enablePush'),
  install: document.getElementById('installPWA'),
  devPanel: document.getElementById('devPanel'),
  dbg: {
    ema: document.getElementById('dbg-ema'),
    atr: document.getElementById('dbg-atr'),
    rsi: document.getElementById('dbg-rsi'),
    bos: document.getElementById('dbg-bos'),
    ob:  document.getElementById('dbg-ob'),
    vol: document.getElementById('dbg-vol'),
    conf:document.getElementById('dbg-conf'),
    rr:  document.getElementById('dbg-rr'),
    prob:document.getElementById('dbg-prob'),
  }
};

let candles = [];

function initChart(){
  const container = document.getElementById('chart');
  chart = LightweightCharts.createChart(container,{
    layout:{ background:{type:'solid', color:'#0e1116'}, textColor:'#cfe1ff' },
    grid:{ vertLines:{color:'#1b2230'}, horzLines:{color:'#1b2230'} },
    rightPriceScale:{ borderColor:'#1b2230' },
    timeScale:{ borderColor:'#1b2230' }
  });
  series = chart.addCandlestickSeries({
    upColor:'#15d1b2', downColor:'#ef476f', wickUpColor:'#a0f0e4', wickDownColor:'#f7a1b6', borderVisible:false
  });
  ema12Series = chart.addLineSeries({ color:'#8bd3dd', lineWidth:1 });
  ema26Series = chart.addLineSeries({ color:'#c3b9ff', lineWidth:1 });
}

function randomWalk(start=1.10, steps=220, tfMinutes=5){
  const arr=[];
  let t = Math.floor(Date.now()/1000) - steps*tfMinutes*60;
  let price = start;
  for(let i=0;i<steps;i++){
    const drift = (Math.random()-0.5)*0.001;
    const high = price + Math.abs(drift)*2;
    const low  = price - Math.abs(drift)*2;
    const close= price + drift;
    const open = price + (Math.random()-0.5)*0.0007;
    arr.push({ time:t, open:+open.toFixed(5), high:+high.toFixed(5), low:+low.toFixed(5), close:+close.toFixed(5) });
    t += tfMinutes*60;
    price = close;
  }
  return arr;
}

function drawLevels(entry,tp,sl){
  [entryLine,tpLine,slLine].forEach(l=>{ if(l) chart.removePriceLine(l); });
  entryLine = series.createPriceLine({ price:entry, color:'#f9b84a', lineStyle:2, lineWidth:2, title:'Вход' });
  tpLine = series.createPriceLine({ price:tp, color:'#2ee07a', lineStyle:2, lineWidth:2, title:'TP' });
  slLine = series.createPriceLine({ price:sl, color:'#ef476f', lineStyle:2, lineWidth:2, title:'SL' });
}

function drawEMA(candles, ema12, ema26){
  const toLine = (vals) => candles.map((c,i)=> ({ time:c.time, value: vals[i] ?? null })).filter(p=>p.value!==null);
  ema12Series.setData(toLine(ema12));
  ema26Series.setData(toLine(ema26));
}

let obLines=null;
function drawOB(ob){
  if(obLines){ obLines.top.remove(); obLines.bottom.remove(); obLines=null; }
  if(!ob) return;
  const top = series.createPriceLine({ price: ob.to, color:'#ffaa00', lineStyle:0, lineWidth:1, title:'OB top' });
  const bottom = series.createPriceLine({ price: ob.from, color:'#ffaa00', lineStyle:0, lineWidth:1, title:'OB bottom' });
  obLines = { top, bottom };
}

function drawBOS(bos){
  series.setMarkers([]);
  if(!bos) return;
  series.setMarkers([{ time: candles[candles.length-1].time, position:'aboveBar',
    color:'#ffd166', shape:'arrowDown', text:`BOS ${bos.dir==='up'?'↑':'↓'}` }]);
}

function setupPush(){
  document.getElementById('enablePush').addEventListener('click', async ()=>{
    if(!('Notification' in window)) return alert('Уведомления не поддерживаются');
    const perm = await Notification.requestPermission();
    if(perm!=='granted') alert('Уведомления отключены');
    else new Notification('Уведомления включены', { body:'Вы будете получать оповещения о сильных сигналах.' });
  });
}

async function runAnalysis(){
  const tfMinutes = parseInt(els.tf.value,10);
  candles = randomWalk(1.10, 220, tfMinutes);
  series.setData(candles);

  const res = analyze(candles, tfMinutes, els.otc.checked, els.profile.value);

  els.dir.textContent = res.direction==='long' ? 'Лонг' : (res.direction==='short' ? 'Шорт' : 'Нейтрально');
  els.entry.textContent = `Вход: ${res.entry.toFixed(5)}`;
  els.tp.textContent = `TP: ${res.tp.toFixed(5)}`;
  els.sl.textContent = `SL: ${res.sl.toFixed(5)}`;
  els.rr.textContent = `R:R: ${res.rr}`;
  els.prob.textContent = `Вероятность: ${res.prob}%`;
  els.conf.textContent = `Подтверждения: ${res.confirmations.join(', ')||'нет'}`;
  els.aiComment.textContent = res.comment;
  els.timeReco.textContent = res.timeReco;
  els.session.textContent = res.session;
  els.news.textContent = res.news;

  drawLevels(res.entry,res.tp,res.sl);

  // dev overlays
  if(els.dev.checked){
    els.devPanel.style.display = 'block';
    drawEMA(candles, res.emaFast, res.emaSlow);
    drawOB(res.debug.ob);
    drawBOS(res.debug.bos);

    els.dbg.ema.textContent = `EMA12/26: ${res.debug.ema12_last?.toFixed(5)||'-'} / ${res.debug.ema26_last?.toFixed(5)||'-'}`;
    els.dbg.atr.textContent = `ATR(14): ${res.debug.atr14_last?.toFixed(5)||'-'}`;
    els.dbg.rsi.textContent = `RSI(14): ${res.debug.rsi14_last?.toFixed(2)||'-'}`;
    els.dbg.bos.textContent = `BOS: ${res.debug.bos? res.debug.bos.dir : '—'}`;
    els.dbg.ob.textContent  = `OB: ${res.debug.ob? `[${res.debug.ob.from.toFixed(5)}..${res.debug.ob.to.toFixed(5)}]`:'—'}`;
    els.dbg.vol.textContent = `Vol: now=${res.debug.vol_now?.toFixed(6)||'-'}, avg10=${res.debug.vol_avg10?.toFixed(6)||'-'}`;
    els.dbg.conf.textContent= `Conf: ${res.debug.confirmations.join(', ')||'нет'}`;
    els.dbg.rr.textContent  = `R:R: ${res.debug.rr.toFixed(2)}`;
    els.dbg.prob.textContent= `Prob: ${res.debug.prob}%`;

    console.log('[DEV] analyze result:', res);
  } else {
    els.devPanel.style.display = 'none';
    ema12Series.setData([]); ema26Series.setData([]);
    if(obLines){ obLines.top.remove(); obLines.bottom.remove(); obLines=null; }
    series.setMarkers([]);
  }

  if(Notification && Notification.permission==='granted' && res.prob>=80 && !res.debug.blocked){
    new Notification('Money Helper Pro', { body:`Сильный сигнал по ${els.pair.value} (${els.tf.options[els.tf.selectedIndex].text}): ${els.dir.textContent}, p≈${res.prob}%` });
  }
}

function setupPWA(){
  let deferredPrompt=null;
  window.addEventListener('beforeinstallprompt', (e)=>{
    e.preventDefault(); deferredPrompt = e;
  });
  els.install.addEventListener('click', async ()=>{
    if(deferredPrompt){ deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt=null; }
    else alert('Если кнопка недоступна, установите через меню браузера.');
  });
}

document.addEventListener('DOMContentLoaded', ()=>{
  initChart();
  setupPush();
  setupPWA();
  document.getElementById('analyze').addEventListener('click', runAnalysis);
  document.getElementById('refresh').addEventListener('click', runAnalysis);
  document.getElementById('devmode').addEventListener('change', ()=> {
    if(!document.getElementById('devmode').checked){
      // скрыть
      document.getElementById('devPanel').style.display='none';
    }
  });
  if('serviceWorker' in navigator){ navigator.serviceWorker.register('./sw.js'); }
  runAnalysis();
});document.addEventListener("DOMContentLoaded", () => {
  const btn = document.getElementById("analyze");
  const output = document.getElementById("output");
  const devmode = document.getElementById("devmode");

  if (!btn) {
    console.error("Кнопка 'Анализировать' не найдена!");
    return;
  }

  btn.addEventListener("click", () => {
    output.innerHTML = "<p>🔎 Идёт анализ рынка...</p>";

    // имитация анализа (заменим позже на реальную логику)
    setTimeout(() => {
      let result = "✅ Анализ завершён: рекомендуем LONG на EUR/USD (5m).";
      if (devmode.checked) {
        result += "<br/>[Dev] EMA 50 выше EMA 200, BOS вверх.";
      }
      output.innerHTML = `<p>${result}</p>`;
    }, 1500);
  });
});
