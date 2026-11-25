// Rain lives in the hero's own coordinate system so resizing the window keeps beads anchored.
const glassWeather=(()=>{
  const canvas=document.getElementById('glass'),ctx=canvas.getContext('2d');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let beads=[],width=0,height=0,active=false,visible=true,intensity=1,request=0,last=0,spawn=0;
  const lenses=Array.from({length:4},(_,i)=>{
    const tile=document.createElement('canvas');tile.width=tile.height=80;
    const c=tile.getContext('2d');
    c.translate(40,39);c.rotate((i-1.5)*.13);c.scale(.87+i*.035,1);
    c.beginPath();c.moveTo(-3,-28);c.bezierCurveTo(17,-30,26,-13,25,6);
    c.bezierCurveTo(24,25,12,32,-5,30);c.bezierCurveTo(-23,29,-29,15,-25,-2);
    c.bezierCurveTo(-23,-17,-17,-26,-3,-28);
    const lens=c.createLinearGradient(-9,-29,9,31);
    for(const [at,color] of [[0,'#effaffbd'],[.12,'#93adbc7a'],[.34,'#405b6d46'],[.64,'#162f4385'],[.83,'#102634aa'],[.94,'#cee8ecb8'],[1,'#effaff70']])lens.addColorStop(at,color);
    c.shadowColor='#091b3090';c.shadowBlur=3;c.shadowOffsetY=2;c.fillStyle=lens;c.fill();c.shadowColor='transparent';
    c.beginPath();c.ellipse(-10,-17,7,2.2,-.58,0,2*Math.PI);c.fillStyle='#f2fbffbd';c.fill();
    return tile;
  });
  function bead(initial){
    const r=1.3+Math.pow(Math.random(),2.2)*6.7;
    return {x:Math.random()*width,y:Math.random()*height,r,age:initial?1:0,
      speed:initial&&Math.random()<.06?20:0,phase:Math.random()*6.28,style:Math.floor(Math.random()*4),trail:[]};
  }
  function resize(){
    const box=canvas.getBoundingClientRect();
    if(!box.width||!box.height)return;
    const dpr=Math.min(devicePixelRatio||1,2);
    if(width===box.width&&height===box.height&&canvas.width===Math.round(width*dpr))return;
    const oldW=width||1,oldH=height||1;width=box.width;height=box.height;
    canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);
    for(const b of beads){b.x*=width/oldW;b.y*=height/oldH;b.trail=[];}
    if(active){seed();paint();}
  }
  function seed(){
    const n=Math.min(190,Math.round(width*height/2300*intensity));
    while(beads.length<n)beads.push(bead(true));
  }
  function paint(){
    ctx.clearRect(0,0,width,height);
    for(const b of beads){
      if(b.trail.length>1){
        ctx.beginPath();ctx.moveTo(b.trail[0].x,b.trail[0].y);
        for(const point of b.trail)ctx.lineTo(point.x,point.y);
        ctx.lineTo(b.x,b.y);ctx.lineWidth=b.r*.48;ctx.lineCap='round';ctx.strokeStyle='#cfedfa28';ctx.stroke();
      }
      const impact=Math.max(0,1-b.age/.19),size=b.r*2.7;
      const w=size*(1+.55*impact),h=size*(1-.28*impact+Math.min(.4,b.speed/200));
      ctx.drawImage(lenses[b.style],b.x-w/2,b.y-h/2,w,h);
    }
  }
  function advance(dt){
    spawn+=dt*intensity*Math.min(13,width/80);
    while(spawn>=1){if(beads.length<230)beads.push(bead(false));spawn--;}
    for(const b of beads){
      b.age+=dt;
      if(!b.speed&&b.r>4.5&&Math.random()<dt*.065)b.speed=10;
      if(!b.speed)continue;
      b.trail.push({x:b.x,y:b.y});if(b.trail.length>20)b.trail.shift();
      b.speed=Math.min(110,b.speed+dt*(8+b.r*2));b.y+=dt*b.speed;b.x+=Math.sin(b.phase+b.y/26)*dt*6;
      for(const other of beads){
        if(other===b||other.speed||other.r===0||Math.abs(b.x-other.x)>b.r)continue;
        if(Math.abs(b.y-other.y)<b.r){b.r=Math.min(10,Math.hypot(b.r,other.r));other.r=0;}
      }
    }
    beads=beads.filter(b=>b.r>0&&b.y<height+15);
  }
  function frame(time){
    if(reduced.matches || document.hidden || !visible || !active)return;
    if(time-last>=32){advance(Math.min(.08,(time-last)/1000));paint();last=time;}
    request=requestAnimationFrame(frame);
  }
  function sync(){
    cancelAnimationFrame(request);request=0;
    if(!active||!visible||document.hidden)return;
    resize();seed();paint();last=performance.now();
    if(!reduced.matches)request=requestAnimationFrame(frame);
  }
  new ResizeObserver(resize).observe(canvas);
  new IntersectionObserver(entries=>{visible=entries[0].isIntersecting;sync();}).observe(canvas);
  document.addEventListener('visibilitychange',sync);reduced.addEventListener('change',sync);
  return (mood,code)=>{
    active=mood==='rain'||mood==='storm';
    intensity=mood==='storm'||[65,67,82].includes(code)?1.65:[51,53,61,80].includes(code)?.8:1.1;
    if(!active){beads=[];ctx.clearRect(0,0,width,height);}
    sync();
  };
})();
