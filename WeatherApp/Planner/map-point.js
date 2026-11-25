// Parc Sky | map-point.js

const atlasColors=[
  [0,0,0],[77,77,77],[128,128,128],[0,37,115],[0,78,179],[0,146,206],
  [46,138,1],[169,168,0],[255,255,0],[255,85,0],[255,0,0],[255,0,255],[255,170,255],[255,255,255]
];
const atlasRatios=[0,.01,.02,.04,.08,.16,.32,.64,1.28,2.56,5.12,10.2,20.5,41,Infinity];
let atlasPixels, atlasLoading;
function loadAtlasPixels(){
  atlasLoading??=new Promise(resolve=>{
    const image=new Image();
    image.onload=()=>{
      atlasPixels=document.createElement('canvas');
      atlasPixels.width=image.naturalWidth;atlasPixels.height=image.naturalHeight;
      const context=atlasPixels.getContext('2d',{willReadFrequently:true});
      context.drawImage(image,0,0);
      resolve();
    };
    image.onerror=resolve;
    image.src='sky-brightness.webp';
  });
  return atlasLoading;
}
function estimateBortle(lat,lng){
  if(!atlasPixels||lat>75||lat< -59.99)return null;
  const p=L.CRS.EPSG3857.latLngToPoint(L.latLng(lat,lng),0).divideBy(256);
  const context=atlasPixels.getContext('2d');
  const x=Math.max(0,Math.min(atlasPixels.width-1,Math.floor(p.x*atlasPixels.width)));
  const y=Math.max(0,Math.min(atlasPixels.height-1,Math.floor(p.y*atlasPixels.height)));
  const rgba=context.getImageData(x,y,1,1).data;
  if(!rgba[3])return null;
  let closest=0,distance=Infinity;
  atlasColors.forEach((color,i)=>{
    const d=color.reduce((sum,c,j)=>sum+(c-rgba[j])**2,0);
    if(d<distance){closest=i;distance=d;}
  });
  // Falchi's published color bands express artificial brightness relative to a 22 mag/arcsec² natural sky.
  // Convert the entire band to approximate classes so the map does not imply sub-band precision.
  const classify=ratio=>{
    const magnitude=22-2.5*Math.log10(1+ratio);
    const index=[21.99,21.89,21.69,20.49,19.50,18.94,18.38].findIndex(threshold=>magnitude>=threshold);
    return index<0?8:index+1;
  };
  const low=classify(atlasRatios[closest]), high=classify(atlasRatios[closest+1]);
  return low===8?'8–9':high===8?low+'–9':low===high?String(low):low+'–'+high;
}
let pointSelection, pointRequestId=0;
function inspectPoint(latLng,location){
  pointSelection={latLng,location,popup:L.popup({maxWidth:320}).setLatLng(latLng)};
  showPoint();
}
function showPoint(){
  if(!pointSelection)return;
  const {latLng,location,popup}=pointSelection;
  const root=document.createElement('div');root.className='mapPoint';
  line(root,location?.name??'Selected point','strong');
  line(root,latLng.lat.toFixed(3)+'°, '+latLng.lng.toFixed(3)+'°','small');
  const darkness=line(root,'Looking up sky brightness…','div');
  loadAtlasPixels().then(()=>{
    const manual=location&&bortleBySite?.[location.key];
    const estimate=estimateBortle(latLng.lat,latLng.lng);
    darkness.textContent=manual?'Bortle '+manual+' · saved observation':estimate?'Estimated Bortle '+estimate+' · 2016 skyglow atlas':'Bortle estimate unavailable';
  });
  const when=ticks[+el('scrub').value];
  if(!Number.isFinite(when)){line(root,'Forecast time unavailable','div');popup.setContent(root).openOn(map);return;}
  const utc=new Date(when), id=++pointRequestId;
  line(root,localStamp(when,site.zone).replace('T',' ')+' · '+site.zone,'small');
  const readings=line(root,'Loading point forecast…','div');
  pointSelection.request={id,readings,hour:utc.getUTCHours()};
  popup.setContent(root).openOn(map);
  window.chrome.webview.postMessage('point:'+JSON.stringify({Id:id,Points:[latLng.lat,L.Util.wrapNum(latLng.lng,[-180,180],true)],Day:utc.toISOString().slice(0,10)}));
}
function receivePoint(data){
  const request=pointSelection?.request;
  if(!request||request.id!==data.pointId)return;
  const {readings,hour}=request;
  if(!data.grid){readings.textContent='Point forecast unavailable.';return;}
  readings.replaceChildren();
  const labels=['Temperature','Cloud cover','Rain · preceding hour','Gusts · preceding hour'];
  Object.keys(mapModes).forEach((mode,i)=>{
    const value=data.grid[i*24+hour];
    const row=line(readings,'','div');row.className='mapReading';
    line(row,labels[i],'span');line(row,mapLabel(mode,value===-9999?null:value),'b');
  });
  pointSelection.popup.update();
}
