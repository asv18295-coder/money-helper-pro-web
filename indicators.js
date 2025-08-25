// Простейшие индикаторы и метрики
export function ema(values, period){
  const k = 2/(period+1);
  let emaArr = [];
  let prev;
  for(let i=0;i<values.length;i++){
    const v = values[i];
    if(i===0){ prev=v; emaArr.push(v); continue; }
    const cur = v*k + prev*(1-k);
    emaArr.push(cur); prev=cur;
  }
  return emaArr;
}

export function atr(candles, period=14){
  let trs = [];
  for(let i=1;i<candles.length;i++){
    const h = candles[i].high, l = candles[i].low;
    const pc = candles[i-1].close;
    const tr = Math.max(h-l, Math.abs(h-pc), Math.abs(l-pc));
    trs.push(tr);
  }
  let res = [];
  let sum = 0;
  for(let i=0;i<trs.length;i++){
    sum += trs[i];
    if(i>=period){ sum -= trs[i-period]; }
    res.push( i>=period-1 ? sum/period : null );
  }
  res.unshift(null);
  return res;
}

export function rsi(values, period=14){
  let gains=0, losses=0;
  for(let i=1;i<=period;i++){
    const diff = values[i]-values[i-1];
    if(diff>=0) gains += diff; else losses -= diff;
  }
  let rs = gains/(losses||1e-9);
  let rsiArr = [null];
  rsiArr.push(100 - (100/(1+rs)));
  for(let i=period+1;i<values.length;i++){
    const diff = values[i]-values[i-1];
    const gain = diff>0? diff:0;
    const loss = diff<0? -diff:0;
    gains = (gains*(period-1) + gain)/period;
    losses = (losses*(period-1) + loss)/period;
    rs = gains/(losses||1e-9);
    rsiArr.push(100 - (100/(1+rs)));
  }
  while(rsiArr.length<values.length) rsiArr.unshift(null);
  return rsiArr;
}

export function volatilityProxy(candles){
  return candles.map(c=>{
    const body = Math.abs(c.close-c.open);
    const wick = (c.high-c.low) - body;
    return body + 0.25*wick;
  });
}
