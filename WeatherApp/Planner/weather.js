// Parc Sky | weather.js

let view='forecast';
function updateView(){
  const planning=view!=='forecast';
  el('forecast').hidden=planning;
  el('planning').hidden=!planning;
  el('session').hidden=view!=='astro';
  el('planningTitle').textContent=view==='atlas'?'Observing map':'Observing plan';
  for(const section of document.querySelectorAll('#workspace > section')){
    section.hidden=(section.id==='atlas')!==(view==='atlas');
  }
  document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',b.dataset.view===view));
  if(!planning){renderWeather();return;}
  if(site?.zone)compute();
}
function openView(next){
  if(view===next)return;view=next;updateView();window.scrollTo(0,0);
}
function selectDay(date){
  el('night').value=date;
  el('target').selectedIndex=-1;
  updateView();
}
function renderWeather(){
  const day=site?.days?.find(d=>d.date===el('night').value);
  const today=site?.zone && localStamp(Date.now(),site.zone).slice(0,10)===day?.date;
  const current=today?site.current:null;
  const code=current?.code??day?.code;
  const mood=code==null?'unknown':code>=95?'storm':code>=71&&code<=77||code===85||code===86?'snow':code>=51?'rain':[45,48].includes(code)?'fog':code>=2?'cloud':'clear';
  el('hero').dataset.sky=mood;
  const localTime=today?localStamp(Date.now(),site.zone).slice(11):null;
  const isNight=!!(localTime && day.sunrise && day.sunset && (localTime<day.sunrise || localTime>=day.sunset));
  el('hero').dataset.night=String(isNight);
  skyWeather(mood,isNight,code);
  glassWeather(mood,code);
  el('place').textContent=site?.name??'Choose a location';
  el('dayLabel').textContent=day?new Date(day.date+'T12:00Z').toLocaleDateString(undefined,{weekday:'long',month:'long',day:'numeric',timeZone:'UTC'}):'';
  el('degrees').textContent=current?.temp??day?.high??'—';
  el('condition').textContent=current?.description??day?.description??'Forecast unavailable';
  el('range').textContent=day?(today?'':'Daytime high · ')+'H '+day.high+'   L '+day.low:'';
  el('hourly').replaceChildren();
  const hours=(site?.hours??[]).filter(h=>h.time.startsWith(day?.date??'!'));
  const now=site?.zone?localStamp(Date.now(),site.zone).slice(0,13):'';
  hours.filter(h=>!today||h.time>=now).forEach(h=>{
    const item=line(el('hourly'),'','div');line(item,h.time.slice(11)+':00','small');line(item,h.temp,'strong');line(item,h.cloud+'% cloud','small');
  });
  renderRain(day,today,now);
  el('daily').replaceChildren();
  for(const d of site?.days??[]){
    const b=document.createElement('button');b.className='day';b.setAttribute('aria-pressed',String(d===day));
    line(b,new Date(d.date+'T12:00Z').toLocaleDateString(undefined,{weekday:'short',day:'numeric',timeZone:'UTC'}),'strong');line(b,d.description,'span');line(b,d.low+' / '+d.high,'span');
    b.onclick=()=>selectDay(d.date);el('daily').append(b);
  }
  el('dusk').textContent=day?(day.sunset?'Sunset '+day.sunset+' · ':'')+'Seestar S50':'';
  el('nightTitle').textContent=day?'Night of '+el('dayLabel').textContent:'Observing plan';
  el('plan').disabled=!day;
  document.querySelectorAll('#forecast > section:not(#hero)').forEach(s=>s.hidden=!day);
}
document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>openView(b.dataset.view));
document.getElementById('plan').onclick=()=>openView('astro');
function renderRain(day,today,now){
  const summary=el('rainSummary'),detail=el('rainDetail'),strip=el('rainHours');
  strip.replaceChildren();detail.textContent='';
  if(!day)return;
  // Accumulations at 14:00 describe the interval ending at 14:00.
  const hours=site.hours??[],intervals=[];
  for(let i=1;i<hours.length;i++){
    const start=hours[i-1].time,end=hours[i].time;
    if(start.slice(0,10)!==day.date || (today&&start<now))continue;
    intervals.push({start,end,amount:hours[i].rainfall,chance:hours[i].probability});
  }
  const known=intervals.filter(h=>Number.isFinite(h.amount));
  if(!known.length){summary.textContent='Hourly rainfall unavailable';return;}
  const clock=t=>t.slice(11)+':00';
  const first=intervals.findIndex(h=>h.amount>0);
  let last=first;
  while(last>=0 && intervals[last+1]?.amount>0)last++;
  summary.textContent=first<0?'No measurable rain forecast':(intervals[first].start===now?'Rain this hour':'Rain from '+clock(intervals[first].start))+' until '+clock(intervals[last].end);
  const sum=known.reduce((n,h)=>n+h.amount,0),peak=known.reduce((a,b)=>a.amount>b.amount?a:b);
  const partial=known.length!==intervals.length || !intervals.at(-1).end.endsWith('T00');
  detail.textContent=sum.toFixed(1)+' mm '+(partial?'across available hours':today?'from this hour':'for the day')+(peak.amount>0?' · Heaviest '+peak.amount.toFixed(1)+' mm, '+clock(peak.start)+'–'+clock(peak.end):'');
  for(const h of intervals){
    const cell=line(strip,'','div');line(cell,clock(h.start),'small');
    const track=line(cell,'','span');track.className='rainTrack';const bar=line(track,'','i');
    bar.style.height=h.amount>0?Math.max(8,100*h.amount/peak.amount)+'%':'0';
    line(cell,h.amount==null?'—':h.amount.toFixed(1)+' mm','strong');
    line(cell,h.chance==null?'—':h.chance+'%','small').title='Chance of precipitation';
  }
  strip.setAttribute('aria-label','Hourly rainfall in millimetres and chance of precipitation');
}
