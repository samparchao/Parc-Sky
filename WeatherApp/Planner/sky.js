// Parc Sky | sky.js

const skyWeather=(()=>{
  const canvas=document.getElementById('skyScene'),ctx=canvas.getContext('2d');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  const mist=document.createElement('canvas');mist.width=256;mist.height=128;
  const brush=mist.getContext('2d');brush.scale(2,1);
  const fade=brush.createRadialGradient(64,64,0,64,64,63);
  fade.addColorStop(0,'rgba(224,238,245,.62)');fade.addColorStop(.48,'rgba(217,230,238,.35)');fade.addColorStop(1,'rgba(211,225,238,0)');
  brush.fillStyle=fade;brush.fillRect(0,0,128,128);
  const particles=Array.from({length:110},()=>({x:Math.random(),y:Math.random(),depth:.22+Math.random()*.78,phase:Math.random()*6.28}));
  let mode='',night=false,code=0,visible=false,w=0,h=0,clock=0,last=0,raf=0;
  function haze(fog){
    const n=fog?10:7;
    for(let i=0;i<n;i++){
      const p=particles[i],dx=Math.sin(clock*(.027+p.depth*.018)+p.phase);
      const x=(p.x+dx*.22)*w,y=(fog?.42+i*.055:.13+p.y*.51)*h;
      const size=w*(fog?.94:.54+p.depth*.45);
      ctx.globalAlpha=fog?.54:code===3?.73:.52;
      ctx.drawImage(mist,x-size/2,y-h*.18,size,h*(fog?.35:.48));
    }
    ctx.globalAlpha=1;
  }
  function clearSky(){
    if(night){
      for(const p of particles.slice(0,68)){
        ctx.globalAlpha=.28+.45*(.5+.5*Math.sin(clock*.48+p.phase));
        ctx.fillStyle='#f1f7ff';ctx.beginPath();ctx.arc(w*p.x,h*p.y,.35+p.depth,0,Math.PI*2);ctx.fill();
      }
      ctx.globalAlpha=1;
    }else{
      const cx=w*.82,cy=h*(.22+.015*Math.sin(clock*.065)),r=Math.max(28,Math.min(w,h)*.48);
      const glow=ctx.createRadialGradient(cx,cy,0,cx,cy,r);
      glow.addColorStop(0,'#fff7cdda');glow.addColorStop(.11,'#ffebbfa5');glow.addColorStop(.32,'#ffdfa146');glow.addColorStop(1,'#ffe8b100');
      ctx.fillStyle=glow;ctx.fillRect(cx-r,cy-r,2*r,2*r);
    }
  }
  function snowfall(){
    haze(false);
    for(const p of particles){
      const y=(p.y*(h+16)+clock*(9+30*p.depth))%(h+16)-8;
      const x=(p.x*w+clock*(2+p.depth*3)+Math.sin(clock*.67+p.phase)*8)%(w+8);
      ctx.globalAlpha=.23+.6*p.depth;ctx.fillStyle='#eef7ff';ctx.beginPath();ctx.arc(x,y,.5+p.depth*1.8,0,2*Math.PI);ctx.fill();
    }
    ctx.globalAlpha=1;
  }
  function storm(){
    haze(false);
    if(reduced.matches)return;
    // A single, slow bloom lights a cloud bank. The text and foreground glass stay steady.
    const phase=(clock+13)%18;
    if(phase>2.4)return;
    const light=Math.sin(Math.PI*phase/2.4)**2;
    const x=w*(.23+.4*((Math.floor((clock+13)/18)%2))),y=h*.18,r=Math.max(1,w*.64);
    const glow=ctx.createRadialGradient(x,y,0,x,y,r);
    glow.addColorStop(0,'rgba(220,224,255,'+(.45*light)+')');glow.addColorStop(1,'rgba(191,201,255,0)');
    ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
  }
  function paint(){
    if(!w||!h)return;ctx.clearRect(0,0,w,h);
    if(mode==='clear'){clearSky();if(code===1)haze(false);}
    else if(mode==='fog'||mode==='cloud')haze(mode==='fog');
    else if(mode==='snow')snowfall();
    else if(mode==='storm')storm();
  }
  function tick(t){
    if(reduced.matches || document.hidden || !visible)return;
    if(t-last>=32){clock+=Math.min(.1,(t-last)/1000);last=t;paint();}
    raf=requestAnimationFrame(tick);
  }
  function sync(){
    cancelAnimationFrame(raf);
    const rect=canvas.getBoundingClientRect();if(!rect.width||!rect.height)return;
    const d=Math.min(2,devicePixelRatio||1);w=rect.width;h=rect.height;
    if(canvas.width!==Math.round(w*d)||canvas.height!==Math.round(h*d)){canvas.width=Math.round(w*d);canvas.height=Math.round(h*d);ctx.setTransform(d,0,0,d,0,0);}
    paint();last=performance.now();
    if(visible&&!document.hidden&&!reduced.matches&&['clear','cloud','fog','snow','storm'].includes(mode))raf=requestAnimationFrame(tick);
  }
  new ResizeObserver(sync).observe(canvas);new IntersectionObserver(([e])=>{visible=e.isIntersecting;sync();}).observe(canvas);
  reduced.addEventListener('change',sync);document.addEventListener('visibilitychange',sync);
  return (next,isNight,weatherCode)=>{if(next!==mode)clock=0;mode=next;night=isNight;code=weatherCode;sync();};
})();
