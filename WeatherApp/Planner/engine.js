// Parc Sky | engine.js

const step=5*60000, hour=3600000;
const clocks=new Map();
function localStamp(time,zone){
  if(!clocks.has(zone)) clocks.set(zone,new Intl.DateTimeFormat('sv-SE',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}));
  return clocks.get(zone).format(time).replace(' ','T');
}
function nightDate(time,zone){
  const stamp=localStamp(time,zone);
  return new Date(Date.parse(stamp+'Z')-12*hour).toISOString().slice(0,10);
}
function shiftDate(date,n){return new Date(Date.parse(date+'T12:00Z')+24*n*hour).toISOString().slice(0,10);}
function localNoon(date,zone){
  const desired=Date.parse(date+'T12:00Z');
  let time=desired;
  for(let i=0;i<3;i++) time+=desired-Date.parse(localStamp(time,zone)+'Z');
  return time;
}
function samples(site,date,now){
  const observer=new Astronomy.Observer(site.lat,site.lon,0);
  const forecast=new Map((site.hours||[]).map(h=>[h.time,h]));
  const begin=Math.max(localNoon(date,site.zone),Math.ceil(now/step)*step);
  const end=localNoon(shiftDate(date,1),site.zone);
  const rows=[];
  for(let t=begin;t<end;t+=step){
    const d=new Date(t);
    function position(body){
      const eq=Astronomy.Equator(body,d,observer,true,true);
      return Astronomy.Horizon(d,observer,eq.ra,eq.dec);
    }
    rows.push({t,d,observer,sun:position('Sun').altitude,moon:position('Moon'),rotation:Astronomy.Rotation_EQJ_EQD(d),weather:forecast.get(localStamp(t,site.zone).slice(0,13))});
  }
  return rows;
}
function evaluate(rows,target,horizon){
  const windows=[], points=[];
  let current=null;
  const vector=Astronomy.VectorFromSphere(new Astronomy.Spherical(target[3],target[2],1),rows[0]?.d??new Date(0));
  for(const row of rows){
    const eq=Astronomy.EquatorFromVector(Astronomy.RotateVector(row.rotation,vector));
    const pos=Astronomy.Horizon(row.d,row.observer,eq.ra,eq.dec);
    const floor=horizon[Math.floor((pos.azimuth+22.5)%360/45)];
    const rad=Math.PI/180;
    const cosSep=Math.sin(pos.altitude*rad)*Math.sin(row.moon.altitude*rad)+Math.cos(pos.altitude*rad)*Math.cos(row.moon.altitude*rad)*Math.cos((pos.azimuth-row.moon.azimuth)*rad);
    const reason=row.sun>-18?'Astronomical twilight':pos.altitude<floor?'Below site horizon':!row.weather?'Forecast unavailable':row.weather.cloud>35?'Cloud above 35%':row.weather.rain>0 || row.weather.probability>=50?'Rain forecast':row.moon.altitude>0 && cosSep>Math.cos(30*rad)?'Moon within 30°':'';
    const point={t:row.t,alt:pos.altitude,floor,moon:row.moon.altitude,cloud:row.weather?.cloud,reason};
    points.push(point);
    if(reason){if(current) current.reason=reason; current=null;continue;}
    if(!current){current={start:row.t,end:row.t,reason:'End of planning night',peak:pos.altitude};windows.push(current);}
    current.end=row.t+step;
    current.peak=Math.max(current.peak,pos.altitude);
  }
  return {target,windows,points};
}
function nextWindow(result,after){
  return result.windows.find(w=>w.end>after);
}
function bestWindow(result,goal){
  let longest;
  for(const window of result.windows){
    if(window.end-window.start>=goal*60000)return window;
    if(!longest||window.end-window.start>longest.end-longest.start)longest=window;
  }
  return longest;
}
