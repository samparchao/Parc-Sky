const el=id=>document.getElementById(id);
const dirs=['N','NE','E','SE','S','SW','W','NW'];
const fmt=(t,zone)=>localStamp(t,zone).slice(11);
const minutes=(a,b)=>Math.round((b-a)/60000);
function load(key,fallback){try{return JSON.parse(localStorage.getItem(key))??fallback;}catch{return fallback;}}
const horizons=load('horizons-v1',{}),projects=load('projects-v1',{});
const horizonFor=s=>horizons[s.key]??Array(8).fill(25);
let sites=[],site,results=[],selected,rows=[],map,pins,ticks=[],projectKey,activeKey;
const cache=new Map();
let planKey='', comparisonSites=[];
function option(text,value){return new Option(text,value);}
function line(parent,text,tag='p'){const node=document.createElement(tag);node.textContent=text;parent.append(node);return node;}
function persist(key,value){try{localStorage.setItem(key,JSON.stringify(value));return true;}catch{alert('Could not save to local storage.');return false;}}
function chooseSites(incoming){
  const previous=el('site').value,active=incoming.find(s=>s.active)?.key;
  sites=incoming;cache.clear();planKey='';
  el('site').replaceChildren(...sites.map(s=>option(s.name,s.key)));
  el('site').value=(activeKey===active && sites.some(s=>s.key===previous)?previous:active)??sites[0]?.key??'';
  activeKey=active;changeSite();
}
function changeSite(){
  site=sites.find(s=>s.key===el('site').value);
  el('workspace').hidden=!site?.zone;el('empty').hidden=!!site?.zone;
  if(!site?.zone){renderWeather();el('empty').textContent=site?'Hourly forecast unavailable. Open Manage locations to refresh or choose another site.':'Open Manage locations to add an observing site.';return;}
  const date=localStamp(Date.now(),site.zone).slice(0,10),old=el('night').value;
  el('night').replaceChildren(...Array.from({length:7},(_,i)=>{const d=shiftDate(date,i);return option(d,d);}));
  if([...el('night').options].some(o=>o.value===old))el('night').value=old;
  const controls=el('horizon');controls.replaceChildren();
  dirs.forEach((name,i)=>{const label=line(controls,name,'label'),input=document.createElement('input');input.type='number';input.min=0;input.max=90;input.value=horizonFor(site)[i];label.append(input);});
  updateView();
}
function compute(){
  if(!site?.zone)return;
  const date=el('night').value,goal=+el('goal').value,old=el('target').value;
  const key=JSON.stringify([site.key,date,horizonFor(site),Math.floor(Date.now()/step)]);
  const changed=key!==planKey;
  if(changed){
    planKey=key;
    rows=samples(site,date,Date.now());
  results=targets.map(t=>evaluate(rows,t,horizonFor(site)));
  }
  function rank(r){const w=bestWindow(r,goal);return w?Math.min(goal,minutes(w.start,w.end))*1000+w.peak:0;}
  results.sort((a,b)=>rank(b)-rank(a));
  el('target').replaceChildren(...results.map(r=>option(r.target[0]+' · '+r.target[1],r.target[0])));
  if(results.some(r=>r.target[0]===old))el('target').value=old;
  ticks=rows.filter((r,i)=>i===0||new Date(r.t).getUTCMinutes()===0).map(r=>r.t);
  el('scrub').max=Math.max(0,ticks.length-1);if(changed)el('scrub').value=0;
  showTarget();
}
function showTarget(){
  selected=results.find(r=>r.target[0]===el('target').value);
  if(!selected)return;
  const w=bestWindow(selected,+el('goal').value),box=el('advice');box.replaceChildren();
  if(w){
    const duration=minutes(w.start,w.end);
    line(box,fmt(w.start,site.zone)+' – '+fmt(w.end,site.zone)+' · '+duration+' min','h2');
    line(box,'Set up by '+fmt(Math.max(Date.now(),w.start-20*60000),site.zone)+'. '+(duration<+el('goal').value?'Shorter than your requested session. ':'')+'Window ends: '+w.reason.toLowerCase()+'.');
  }else{
    line(box,'No clear shooting window','h2');
    const dark=selected.points.filter((_,i)=>rows[i].sun<=-18);
    const counts={};for(const p of (dark.length?dark:selected.points))if(p.reason)counts[p.reason]=(counts[p.reason]||0)+1;
    line(box,Object.keys(counts).sort((a,b)=>counts[b]-counts[a]).slice(0,2).join(' · ')||'This night has ended.');
  }

  if(view==='atlas')compare();
  else {drawTimeline();if(projectKey!==selected.target[0])loadProject();else drawFrame();}
}
function canvas(id){
  const c=el(id),w=c.clientWidth,h=c.clientHeight,d=devicePixelRatio||1;
  c.width=w*d;c.height=h*d;const ctx=c.getContext('2d');ctx.scale(d,d);return {ctx,w,h};
}
function drawTimeline(){
  if(!selected || !el('timeline').clientWidth)return;
  const {ctx,w,h}=canvas('timeline');
  const night=selected.points.filter((_,i)=>rows[i].sun<=-6);
  const p=night.length?night:selected.points;
  if(!p.length)return;
  const left=32,right=w-19,top=14,bottom=h-60;
  const x=i=>left+(right-left)*i/Math.max(1,p.length-1);
  const y=v=>bottom-(bottom-top)*v/90;
  ctx.font='11px system-ui';ctx.textBaseline='middle';
  for(const v of [0,30,60,90]){
    ctx.strokeStyle='#ffffff20';ctx.fillStyle='#acbbca';ctx.fillText(v+'°',1,y(v));
    ctx.beginPath();ctx.moveTo(left,y(v));ctx.lineTo(right,y(v));ctx.stroke();
  }
  ctx.save();ctx.beginPath();ctx.rect(left,top,right-left,bottom-top);ctx.clip();
  for(const [key,color,dash] of [['floor','#daa38c',[4,4]],['moon','#abb8cf',[2,3]],['alt','#f4d498',[]]]){
    ctx.strokeStyle=color;ctx.lineWidth=key==='alt'?2.7:1.6;ctx.setLineDash(dash);ctx.beginPath();
    p.forEach((q,i)=>i?ctx.lineTo(x(i),y(q[key])):ctx.moveTo(x(i),y(q[key])));
    ctx.stroke();
  }
  ctx.restore();
  for(let j=0;j<5;j++){
    const i=Math.round(j*(p.length-1)/4);ctx.textAlign=j===0?'left':j===4?'right':'center';
    ctx.fillStyle='#c0cbd4';ctx.fillText(fmt(p[i].t,site.zone),x(i),bottom+12);
  }
  ctx.textAlign='left';ctx.fillText('Cloud cover',left,bottom+32);
  p.forEach((q,i)=>{ctx.fillStyle=q.cloud==null?'#29333c':'rgba(154,190,216,'+(0.15+0.85*q.cloud/100)+')';ctx.fillRect(x(i),h-13,(right-left)/p.length+0.6,7);});
  const known=p.map(q=>q.cloud).filter(Number.isFinite);
  ctx.textAlign='right';ctx.fillText(known.length?Math.min(...known)+'–'+Math.max(...known)+'%':'Unavailable',right,bottom+32);
  el('axis').textContent=site.zone.replaceAll('_',' ')+' · '+localStamp(p[0].t,site.zone).slice(0,10)+' · 5-minute sky positions';
}
function paintPins(){
  pins.clearLayers();
  const groups=[];
  for(const entry of comparisonSites){
    const xy=map.latLngToLayerPoint(entry.ll);
    let group=groups.find(g=>Math.abs(g.xy.x-xy.x)<64&&Math.abs(g.xy.y-xy.y)<34);
    if(!group){group={xy,ll:entry.ll,items:[]};groups.push(group);}
    group.items.push(entry);
  }
  for(const g of groups){
    const label=g.items.length===1?g.items[0].pin:g.items.length+' sites';
    const popup=document.createElement('div');
    for(const entry of g.items)line(popup,entry.name+' · '+entry.pin,'div');
    const marker=L.marker(g.ll,{title:popup.textContent,icon:L.divIcon({className:'sitepin',html:label,iconSize:[56,25]})}).addTo(pins);
    if(g.items.length===1)marker.on('click',()=>inspectPoint(L.latLng(g.ll),g.items[0].location));
    else {
      popup.replaceChildren();
      for(const entry of g.items){
        const button=line(popup,entry.name+' · '+entry.pin,'button');
        button.className='mapClusterSite';button.onclick=()=>inspectPoint(L.latLng(entry.ll),entry.location);
      }
      marker.bindPopup(popup);
    }
  }
}
function compare(){
  if(!selected||!ticks.length)return;
  const t=ticks[+el('scrub').value];el('when').textContent=localStamp(t,site.zone).replace('T',' ');
  if(!map){
    map=L.map('map',{scrollWheelZoom:false,preferCanvas:true,minZoom:2,maxBounds:[[-85,-180],[85,180]],maxBoundsViscosity:1});addBasemap(map);
    map.createPane('forecastSurface').style.zIndex='410';
    pins=L.layerGroup().addTo(map);map.on('zoomend',paintPins);map.on('moveend',scheduleMapLayer);
    map.on('click',event=>inspectPoint(event.latlng));
    loadAtlasPixels().then(()=>{if(view==='atlas'&&mapMode()==='dark')compare();});
    el('fitSites').onclick=()=>map.fitBounds(sites.map(s=>[s.lat,s.lon]),{padding:[35,35],maxZoom:8});
    el('mapMode').onchange=compare;
  }
  updateBortle();
  map.invalidateSize();comparisonSites=[];el('comparison').replaceChildren();
  sites.forEach(s=>{
    let label='Forecast unavailable',pin='—';
    if(s.zone){
      const date=nightDate(t,s.zone),key=JSON.stringify([s.key,date,selected.target[0]]);
      if(!cache.has(key))cache.set(key,evaluate(samples(s,date,Date.now()),selected.target,horizonFor(s)));
      const result=cache.get(key),next=nextWindow(result,t);
      const hourAtSite=localStamp(t,s.zone).slice(0,13);
      const sample=s.hours?.find(h=>h.time===hourAtSite);
      const following=s.hours?.[s.hours.indexOf(sample)+1];
      const mode=mapMode();
      const value={temperature:sample?.temperature,cloud:sample?.cloud,rain:sample?following?.rainfall:null,wind:sample?following?.gust:null}[mode];
      pin=mode==='dark'?darkSiteLabel(s):mapLabel(mode,value);
      label=next?fmt(Math.max(t,next.start),s.zone)+'–'+fmt(next.end,s.zone)+' local · '+minutes(Math.max(t,next.start),next.end)+' min remaining':'No remaining window this night';
    }
    if(!s.zone && mapMode()==='dark')pin=darkSiteLabel(s);
    const name=s.name+' · '+pin+' · '+label;
    const row=document.createElement('button');row.className='siteRow';row.title=name;
    line(row,s.name,'strong');line(row,label,'span');line(row,pin,'b');
    row.onclick=()=>map.setView([s.lat,s.lon],Math.max(6,map.getZoom()));
    el('comparison').append(row);
    comparisonSites.push({ll:[s.lat,s.lon],pin,name:s.name,location:s});
  });
  const boundsKey=sites.map(s=>s.key).join(':');
  if(map.boundsKey!==boundsKey){map.fitBounds(sites.map(s=>[s.lat,s.lon]),{padding:[25,25],maxZoom:8});map.boundsKey=boundsKey;}
  paintPins();
  scheduleMapLayer();
}
function drawFrame(){
  if(!selected||!el('frame').clientWidth)return;
  const t=selected.target,angle=Number(el('angle').value)||0,{ctx,w,h}=canvas('frame');
  const scale=(Math.min(w,h)-18)/Math.max(91,t[4]*1.08);
  ctx.translate(w/2,h/2);ctx.scale(scale,scale);ctx.fillStyle='#8ab8cc88';
  const portrait=el('portrait');
  const photoPath='portraits/'+t[0].replaceAll(' ','')+'.jpg';
  if(portrait.getAttribute('src')!==photoPath){
    el('reference').hidden=false;
    portrait.onerror=()=>{el('reference').hidden=true;};
    portrait.src=photoPath;portrait.alt=t[1]+' photographic reference';
    el('photoCaption').textContent=t[0]+' · DSS / STScI';
  }
  ctx.save();ctx.rotate(-t[6]*Math.PI/180);ctx.beginPath();ctx.ellipse(0,0,t[5]/2,t[4]/2,0,0,2*Math.PI);
  ctx.fillStyle='#99b5c328';ctx.fill();ctx.strokeStyle='#b4cfde';ctx.lineWidth=1/scale;ctx.setLineDash([3/scale,3/scale]);ctx.stroke();ctx.restore();
  ctx.rotate(-angle*Math.PI/180);ctx.strokeStyle='#f5d28c';ctx.lineWidth=2/scale;ctx.strokeRect(-21.9,-38.7,43.8,77.4);
  const a=(angle-t[6])*Math.PI/180;
  const fits=Math.hypot(t[5]*Math.cos(a),t[4]*Math.sin(a))<=43.8 && Math.hypot(t[4]*Math.cos(a),t[5]*Math.sin(a))<=77.4;
  el('fit').textContent=(fits?'Fits one S50 frame. ':'Mosaic or tighter crop needed. ')+'S50 footprint in gold · target '+t[4]+'′ × '+t[5]+'′. '+(el('mount').value==='Alt-az'?'Field rotation changes framing over a long stack.':'Orientation assumes polar alignment.');
}
function loadProject(){
  projectKey=selected.target[0];
  const p=projects[projectKey];el('angle').value=p?.angle??0;el('mount').value=p?.mount??load('mount','Alt-az');el('filter').value=p?.filter??'UV/IR cut';el('total').value=p?.goal??180;el('accepted').value=0;
  el('progress').textContent=p?p.done+' / '+p.goal+' min accepted · '+Math.max(0,p.goal-p.done)+' min remaining.':'No sessions logged for this target.';
  el('projects').replaceChildren();
  Object.entries(projects).forEach(([id,p])=>{const b=line(el('projects'),id+' · '+p.done+'/'+p.goal+' min','button');b.onclick=()=>{el('target').value=id;showTarget();};});
  drawFrame();
}
el('save').onclick=()=>{
  if(!selected||!['total','angle','accepted'].every(id=>el(id).value!==''&&el(id).reportValidity()))return;
  const p={goal:+el('total').value,done:(projects[projectKey]?.done||0)+Number(el('accepted').value),angle:+el('angle').value,filter:el('filter').value,mount:el('mount').value};
  const changed={...projects,[projectKey]:p};if(persist('projects-v1',changed)){projects[projectKey]=p;loadProject();}
};
el('saveHorizon').onclick=()=>{
  const inputs=[...el('horizon').querySelectorAll('input')];if(!inputs.every(i=>i.value!==''&&i.reportValidity()))return;
  const values=inputs.map(i=>+i.value);if(persist('horizons-v1',{...horizons,[site.key]:values})){horizons[site.key]=values;compute();}
};
el('weather').onclick=()=>el('locations').showModal();
el('details').onclick=()=>{el('locations').close();window.chrome.webview.postMessage('weather');};
el('findCity').onclick=()=>{
  const q=el('searchCity').value.trim();if(q.length<2)return;
  el('matches').textContent='Searching…';window.chrome.webview.postMessage('find:'+q);
};
el('searchCity').onkeydown=e=>{if(e.key==='Enter')el('findCity').click();};
function receive(data){
  if(data.pointId!=null){receivePoint(data);return;}
  if(data.mapId!=null){receiveMap(data);return;}
  if(Array.isArray(data)){chooseSites(data);return;}
  if(data.query!==el('searchCity').value.trim())return;
  el('matches').textContent=data.error||(!data.matches?.length?'No cities found.':'');
  for(const m of data.matches??[]){
    const b=line(el('matches'),m.DisplayName,'button');
    b.onclick=()=>{window.chrome.webview.postMessage('add:'+JSON.stringify(m));el('locations').close();};
  }
}
el('site').onchange=changeSite;el('night').onchange=()=>{el('target').selectedIndex=-1;updateView();};el('goal').onchange=el('night').onchange;
el('target').onchange=showTarget;el('scrub').oninput=compare;
el('scrub').onchange=()=>{if(pointSelection?.popup.isOpen())showPoint();};el('angle').oninput=drawFrame;
el('mount').onchange=()=>{persist('mount',el('mount').value);drawFrame();};
let resizeFrame;
function resizeViews(){
  cancelAnimationFrame(resizeFrame);
  resizeFrame=requestAnimationFrame(()=>{if(view==='astro'){drawTimeline();drawFrame();}if(view==='atlas')map?.invalidateSize();});
}
window.addEventListener('resize',resizeViews);
el('timeline').closest('details').addEventListener('toggle',resizeViews);
window.chrome.webview.addEventListener('message',event=>receive(event.data));
window.chrome.webview.postMessage('ready');
