// Parc Sky | map-layers.js

const mapModes = {
  temperature: {index:0, colors:['#5443a9','#426ddd','#57ccea','#c2e9ab','#ffde62','#ff963d','#e74763'], stops:[-30,-18,-6,6,18,30,42]},
  cloud: {index:1, colors:['#27415d','#526c8c','#899db8','#c6d4e4','#f5f8fc'], stops:[0,25,50,75,100]},
  rain: {index:2, colors:['#293f58','#3f91c9','#64d1ce','#9be361','#ffd467'], stops:[0,.2,1,4,10]},
  wind: {index:3, colors:['#345170','#4eabbb','#acdb8a','#f7c46a','#ec7278'], stops:[0,20,40,60,80]}
};
const mapCache = new Map();
let mapOverlay, mapTimer, mapPending, mapRequestId=0;
const mapMode=()=>el('mapMode').value;
const temperatureLabel=value=>Math.round(site.fahrenheit?value*1.8+32:value)+'°'+(site.fahrenheit?'F':'C');
function mapLabel(mode,value){
  if(!Number.isFinite(value))return '—';
  if(mode==='temperature')return temperatureLabel(value);
  if(mode==='cloud')return Math.round(value)+'%';
  if(mode==='rain')return value.toFixed(1)+' mm';
  return site.mph?Math.round(value*.621371)+' mph':Math.round(value)+' km/h';
}
function mapColor(mode,value){
  const {colors,stops}=mapModes[mode];
  let i=stops.findIndex(n=>n>value);
  if(i<=0)return colors[i===0?0:colors.length-1];
  const fraction=(value-stops[i-1])/(stops[i]-stops[i-1]);
  const rgb=[1,3,5].map(n=>Math.round(parseInt(colors[i-1].slice(n,n+2),16)*(1-fraction)+parseInt(colors[i].slice(n,n+2),16)*fraction));
  return 'rgb('+rgb.join(',')+')';
}
function mapLegend(mode){
  const legend=el('mapLegend');legend.replaceChildren();
  if(!mapModes[mode])return;
  const {colors,stops}=mapModes[mode];
  const ramp=line(legend,'','div');ramp.className='mapRamp';
  ramp.style.background='linear-gradient(90deg,'+colors.join(',')+')';
  const labels=line(legend,'','div');labels.className='mapTicks';
  for(const i of [0,Math.floor(stops.length/2),stops.length-1])line(labels,mapLabel(mode,stops[i]),'span');
}
function clearMapOverlay(){
  if(mapOverlay){map.removeLayer(mapOverlay);mapOverlay=null;}
}
function scheduleMapLayer(){
  clearTimeout(mapTimer);
  mapTimer=setTimeout(updateMapLayer,220);
}
function updateMapLayer(){
  if(view!=='atlas'||!map||!ticks.length)return;
  const mode=mapMode(),status=el('mapStatus');
  mapLegend(mode);
  if(mode==='dark'){showDarkLayer();return;}
  const when=ticks[+el('scrub').value]+(mode==='rain'||mode==='wind'?hour:0);
  const utc=new Date(when);
  const day=utc.toISOString().slice(0,10);
  const bounds=map.getBounds(), margin=Math.max(.08, (bounds.getEast()-bounds.getWest())/10);
  const snap=(v,up)=>Math[up?'ceil':'floor'](v/margin)*margin;
  const west=Math.max(-180,snap(bounds.getWest(),false)),east=Math.min(180,snap(bounds.getEast(),true));
  const south=Math.max(-85.05,snap(bounds.getSouth(),false)),north=Math.min(85.05,snap(bounds.getNorth(),true));
  if(west>=east||south>=north){clearMapOverlay();status.textContent='Forecast coverage unavailable in this view.';return;}
  const box=L.latLngBounds([south,west],[north,east]);
  const key=[day,...[west,east,south,north].map(n=>n.toFixed(2))].join('|');
  if(mapCache.has(key)){
    clearMapOverlay();
    const grid=mapCache.get(key),field=mapModes[mode].index;
    const tile=document.createElement('canvas');tile.width=96;tile.height=72;
    const ctx=tile.getContext('2d');
    for(let y=0;y<72;y++)for(let x=0;x<96;x++){
      const gx=x*7/95,gy=y*5/71;
      const px=Math.min(6,Math.floor(gx)),py=Math.min(4,Math.floor(gy));
      const values=[py*8+px,py*8+px+1,(py+1)*8+px,(py+1)*8+px+1].map(point=>grid[point*96+field*24+utc.getUTCHours()]);
      if(!values.every(value=>Number.isFinite(value)&&value!==-9999))continue;
      const u=gx-px,v=gy-py;
      const value=(values[0]*(1-u)+values[1]*u)*(1-v)+(values[2]*(1-u)+values[3]*u)*v;
      ctx.fillStyle=mapColor(mode,value);ctx.fillRect(x,y,1,1);
    }
    mapOverlay=L.imageOverlay(tile.toDataURL(),box,{pane:"forecastSurface",opacity:.72,interactive:false}).addTo(map);
    status.textContent='Open-Meteo · interpolated forecast grid';
    return;
  }
  if(mapPending?.key===key){clearMapOverlay();status.textContent='Loading forecast layer…';return;}
  clearMapOverlay();
  status.textContent='Loading forecast layer…';
  const points=[],nw=map.project(box.getNorthWest()),se=map.project(box.getSouthEast());
  for(let y=0;y<6;y++)for(let x=0;x<8;x++){
    const p=map.unproject([nw.x+(se.x-nw.x)*x/7,nw.y+(se.y-nw.y)*y/5]);
    points.push(p.lat,p.lng);
  }
  const Id=++mapRequestId;
  mapPending={key,Id};
  window.chrome.webview.postMessage('map:'+JSON.stringify({Id,Points:points,Day:day}));
}
function receiveMap(data){
  if(mapPending?.Id!==data.mapId)return;
  const {key}=mapPending;mapPending=null;
  if(!data.grid){if(view==='atlas'&&mapMode()!=='dark')el('mapStatus').textContent='Forecast layer unavailable. Move the map or change the hour to retry.';return;}
  if(mapCache.size>=18)mapCache.delete(mapCache.keys().next().value);
  mapCache.set(key,data.grid);updateMapLayer();
}
let bortleBySite;
function darkSiteLabel(location){
  const manual=bortleBySite?.[location.key];
  const estimate=estimateBortle(location.lat,location.lon);
  return manual?'Bortle '+manual:estimate?'Bortle ≈ '+estimate:'Bortle —';
}
function showDarkLayer(){
  clearMapOverlay();
  mapOverlay=L.imageOverlay('sky-brightness.webp',[[-85.051129,-180],[85.051129,180]],{pane:"forecastSurface",opacity:.78,interactive:false}).addTo(map);
  const legend=el('mapLegend');
  const ramp=line(legend,'','div');ramp.className='mapRamp';
  ramp.style.background='linear-gradient(90deg,#101019,#424765,#255de3,#29a54e,#f8e443,#fb742d,#e22c36,#fff2f6)';
  const labels=line(legend,'','div');labels.className='mapTicks';
  line(labels,'Darker sky','span');line(labels,'Brighter sky','span');
  el('mapStatus').textContent='Modeled zenith skyglow · Falchi et al. (2016) · GFZ Data Services, CC BY-NC 4.0';
}
function updateBortle(){
  const active=mapMode()==='dark';
  el('bortleEditor').hidden=!active;
  el('mapHour').hidden=false;
  bortleBySite??=load('bortle-v1',{});
  el('bortleClass').value=bortleBySite[site.key]??'';
  el('bortleClass').onchange=()=>{
    const next={...bortleBySite,[site.key]:el('bortleClass').value};
    if(persist('bortle-v1',next))bortleBySite=next;
    compare();
  };
}
