(() => {
  'use strict';
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d', { alpha: false });
  const radar = document.getElementById('radar');
  const rctx = radar.getContext('2d');
  const $ = id => document.getElementById(id);
  const W = 800, H = 450, MAP = [
    '111111111111111111111',
    '100000000100000000001',
    '100000000100220000001',
    '100220000100000000001',
    '100000000000022000001',
    '100200000000000000021',
    '100200000220000200001',
    '100000000220000200001',
    '122000000000000200001',
    '100000000100000000001',
    '100220000100220000001',
    '100000000100000000001',
    '100002000000000000001',
    '100002002200000000001',
    '100000000000000000001',
    '111111111111111111111'
  ];
  const MW = MAP[0].length, MH = MAP.length, TAU = Math.PI * 2;
  const wallAt = (x, y) => {
    const ix = Math.floor(x), iy = Math.floor(y);
    if (iy < 0 || iy >= MH || ix < 0 || ix >= MW) return 1;
    return MAP[iy][ix] === '0' ? 0 : Number(MAP[iy][ix]);
  };
  const wrap = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const player = { x: 3.5, y: 2.5, angle: .22, hp: 100, armor: 100, move: 0, recoil: 0 };
  const enemies = [
    {x:16.5,y:2.5, hp:100, state:'idle', name:'RAIDER-01', tint:'#8b745a'},
    {x:12.5,y:5.5, hp:100, state:'idle', name:'RAIDER-02', tint:'#70806b'},
    {x:17.5,y:8.5, hp:100, state:'idle', name:'RAIDER-03', tint:'#8a6854'},
    {x:14.5,y:12.5,hp:100, state:'idle', name:'RAIDER-04', tint:'#77818a'},
    {x:7.5,y:13.5, hp:100, state:'idle', name:'RAIDER-05', tint:'#8a765b'}
  ];
  const state = { active:false, paused:false, ended:false, kills:0, shots:0, hits:0, time:120, last:performance.now(), elapsed:0, fireAt:0, reloadAt:0, reloading:false, toastAt:0, mobileRun:false, keys:{}, lastShot:0, gameStart:0 };
  let weapon = 'rifle';
  const guns = { rifle:{name:'M4A1-S', ammo:30, reserve:90, mag:30, rate:135, damage:36, spread:.019, label:'5.56 × 45 MM'}, pistol:{name:'USP-S', ammo:12, reserve:48, mag:12, rate:280, damage:48, spread:.014, label:'9 × 19 MM'} };
  let viewW = W, viewH = H, zBuffer = new Float32Array(W), textures = [], enemyArt = [], muzzle = 0, shake = 0, lastDamage = 0;
  const gun = () => guns[weapon];

  function resize(){
    const dpr = Math.min(1.35, window.devicePixelRatio || 1);
    canvas.width = Math.max(640, Math.floor(innerWidth * dpr));
    canvas.height = Math.max(360, Math.floor(innerHeight * dpr));
    viewW = canvas.width; viewH = canvas.height;
    ctx.imageSmoothingEnabled = false;
  }
  window.addEventListener('resize', resize); resize();

  function makeTextures(){
    for(let type=1; type<=2; type++){
      const c=document.createElement('canvas'); c.width=128;c.height=128;const g=c.getContext('2d');
      if(type===1){
        g.fillStyle='#827765';g.fillRect(0,0,128,128);
        for(let y=0;y<128;y+=32){g.fillStyle=y%64===0?'#9a8b73':'#756a59';g.fillRect(0,y,128,31);let shift=y%64===0?0:32;
          for(let x=shift;x<128;x+=64){g.fillStyle=['#a0937a','#887c67','#796d5c','#948671'][(x+y)%4];g.fillRect(x+1,y+1,62,29);g.strokeStyle='#514a3e';g.lineWidth=2;g.strokeRect(x+1,y+1,62,29);g.fillStyle='#aaa087';g.fillRect(x+5,y+5,2,2);}}
        // chipped plaster and dusty grit
        for(let i=0;i<1700;i++){const v=Math.random();g.fillStyle=v>.5?'rgba(26,24,20,.12)':'rgba(237,218,180,.12)';g.fillRect(Math.random()*128,Math.random()*128,1+Math.random()*3,1+Math.random()*2);}
      } else {
        g.fillStyle='#67675b';g.fillRect(0,0,128,128);
        g.fillStyle='#777769';g.fillRect(2,2,124,61);g.fillStyle='#55574f';g.fillRect(2,66,124,60);
        for(let y=0;y<128;y+=32){g.fillStyle='#4b4d46';g.fillRect(0,y,128,2);}
        for(let x=14;x<128;x+=36){g.fillStyle='#bbb297';g.fillRect(x,10,3,7);g.fillRect(x,76,3,7);g.fillStyle='#343832';g.fillRect(x,19,3,43);g.fillRect(x,85,3,39);}
        for(let i=0;i<800;i++){g.fillStyle=Math.random()>.5?'rgba(0,0,0,.1)':'rgba(255,255,255,.07)';g.fillRect(Math.random()*128,Math.random()*128,2,1);}
      }
      textures[type]=c;
    }
  }
  function makeEnemyArt(){
    for(let n=0;n<3;n++){
      const c=document.createElement('canvas');c.width=96;c.height=144;const g=c.getContext('2d');
      // soft ground shadow
      g.fillStyle='rgba(0,0,0,.32)';g.beginPath();g.ellipse(48,137,28,5,0,0,TAU);g.fill();
      // boots and legs
      g.fillStyle='#30332c';g.fillRect(25,109,18,26);g.fillRect(53,109,18,26);g.fillStyle='#252923';g.fillRect(21,130,23,8);g.fillRect(51,130,23,8);
      g.fillStyle=n===1?'#65674f':'#6d604d';g.beginPath();g.moveTo(25,79);g.lineTo(71,79);g.lineTo(70,115);g.lineTo(52,119);g.lineTo(47,98);g.lineTo(42,119);g.lineTo(25,114);g.closePath();g.fill();
      // jacket torso, shoulders and arms
      g.fillStyle=['#88745b','#647361','#786559'][n];g.beginPath();g.moveTo(31,47);g.lineTo(65,47);g.lineTo(76,57);g.lineTo(70,89);g.lineTo(24,89);g.lineTo(19,59);g.closePath();g.fill();
      g.fillStyle='#4d5044';g.fillRect(26,62,44,7);g.fillStyle='#282d28';g.fillRect(35,51,26,34);
      g.fillStyle='#a89a7b';g.fillRect(40,56,16,3);g.fillStyle='#777765';g.fillRect(29,72,10,11);g.fillRect(57,72,10,11);
      // arms
      g.fillStyle=['#8c775f','#6d7965','#806954'][n];g.beginPath();g.moveTo(23,54);g.lineTo(32,56);g.lineTo(29,83);g.lineTo(22,87);g.lineTo(16,65);g.closePath();g.fill();
      g.beginPath();g.moveTo(65,54);g.lineTo(74,58);g.lineTo(79,78);g.lineTo(71,84);g.lineTo(61,67);g.closePath();g.fill();
      // neck and covered face
      g.fillStyle='#b59575';g.fillRect(41,40,15,12);g.fillStyle='#bc9d79';g.fillRect(37,20,25,26);g.fillStyle='#282b28';g.fillRect(37,34,25,9);g.fillStyle='#d5c499';g.fillRect(40,27,6,3);g.fillRect(54,27,6,3);
      // helmet
      g.fillStyle='#454a3f';g.beginPath();g.ellipse(49,22,17,14,0,Math.PI,TAU);g.fill();g.fillRect(32,20,34,5);g.fillStyle='#777962';g.fillRect(39,12,20,3);
      // rifle across front
      g.fillStyle='#242824';g.fillRect(48,76,40,4);g.fillRect(77,73,4,11);g.fillRect(54,72,3,12);g.fillStyle='#57594c';g.fillRect(50,74,25,2);
      // edge highlights
      g.fillStyle='rgba(226,208,166,.18)';g.fillRect(26,59,3,22);g.fillRect(32,48,3,15);
      enemyArt.push(c);
    }
  }
  makeTextures();makeEnemyArt();

  function clearSight(x1,y1,x2,y2){
    const dx=x2-x1,dy=y2-y1,dist=Math.hypot(dx,dy),steps=Math.ceil(dist*12);
    for(let i=1;i<steps;i++){const t=i/steps;if(wallAt(x1+dx*t,y1+dy*t))return false;}return true;
  }
  function moveActor(obj,dx,dy,r=.2){
    if(!wallAt(obj.x+dx+r,obj.y)&&!wallAt(obj.x+dx-r,obj.y))obj.x+=dx;
    if(!wallAt(obj.x,obj.y+dy+r)&&!wallAt(obj.x,obj.y+dy-r))obj.y+=dy;
  }
  function castRay(angle){
    const rayX=Math.cos(angle),rayY=Math.sin(angle);let mapX=Math.floor(player.x),mapY=Math.floor(player.y);
    const ddx=Math.abs(1/rayX),ddy=Math.abs(1/rayY);let sx,sy,sdx,sdy;
    if(rayX<0){sx=-1;sdx=(player.x-mapX)*ddx}else{sx=1;sdx=(mapX+1-player.x)*ddx}
    if(rayY<0){sy=-1;sdy=(player.y-mapY)*ddy}else{sy=1;sdy=(mapY+1-player.y)*ddy}
    let side=0,type=1,guard=0;
    while(guard++<50){if(sdx<sdy){sdx+=ddx;mapX+=sx;side=0}else{sdy+=ddy;mapY+=sy;side=1}type=wallAt(mapX+.01,mapY+.01);if(type)break;}
    let dist=side===0?(mapX-player.x+(1-sx)/2)/rayX:(mapY-player.y+(1-sy)/2)/rayY;
    dist=Math.max(.08,dist);let hit=side===0?player.y+dist*rayY:player.x+dist*rayX;hit-=Math.floor(hit);
    return {dist,side,type,hit};
  }
  function render(){
    const w=viewW,h=viewH,horizon=Math.floor(h*.49),fov=1.12,unit=h/(2*Math.tan(fov/2));
    const sky=ctx.createLinearGradient(0,0,0,horizon);sky.addColorStop(0,'#798276');sky.addColorStop(.63,'#b3a78a');sky.addColorStop(1,'#c7b48e');ctx.fillStyle=sky;ctx.fillRect(0,0,w,horizon);
    // pale desert glow and broken skyline
    const glow=ctx.createRadialGradient(w*.69,horizon*.75,2,w*.69,horizon*.75,w*.31);glow.addColorStop(0,'rgba(246,219,157,.46)');glow.addColorStop(1,'rgba(246,219,157,0)');ctx.fillStyle=glow;ctx.fillRect(w*.35,0,w*.65,horizon+20);
    ctx.fillStyle='#696b5b';ctx.beginPath();ctx.moveTo(0,horizon-12);ctx.lineTo(w*.08,horizon-27);ctx.lineTo(w*.2,horizon-18);ctx.lineTo(w*.33,horizon-38);ctx.lineTo(w*.44,horizon-18);ctx.lineTo(w*.58,horizon-33);ctx.lineTo(w*.76,horizon-15);ctx.lineTo(w*.88,horizon-29);ctx.lineTo(w,horizon-15);ctx.lineTo(w,horizon+3);ctx.lineTo(0,horizon+3);ctx.fill();
    // ground gradient
    const floor=ctx.createLinearGradient(0,horizon,0,h);floor.addColorStop(0,'#9b8b6a');floor.addColorStop(.3,'#716849');floor.addColorStop(1,'#393c31');ctx.fillStyle=floor;ctx.fillRect(0,horizon,w,h-horizon);
    // floor texture in perspective scanlines
    for(let sy=horizon+2;sy<h;sy+=3){const p=(sy-horizon)/h,dist=.52/Math.max(.006,p);const step=dist*.025;const rowColor=clamp(155-Math.floor(dist*4),45,150);for(let sx=0;sx<w;sx+=8){const cam=(2*sx/w-1)*Math.tan(fov/2);const wx=player.x+Math.cos(player.angle)*dist-Math.sin(player.angle)*dist*cam;const wy=player.y+Math.sin(player.angle)*dist+Math.cos(player.angle)*dist*cam;const tile=(Math.floor(wx*2)+Math.floor(wy*2))&1;const lum=clamp(rowColor+(tile?7:-9)+(Math.sin(wx*3+wy*2)*4),35,165);ctx.fillStyle=`rgb(${lum},${Math.floor(lum*.91)},${Math.floor(lum*.73)})`;ctx.fillRect(sx,sy,8,3);} }
    // world walls
    const colStep=Math.max(1,Math.floor(w/800));
    for(let x=0;x<w;x+=colStep){const camera=2*x/w-1,rayAngle=player.angle+Math.atan(camera*Math.tan(fov/2));const hit=castRay(rayAngle);const corrected=hit.dist*Math.cos(rayAngle-player.angle);const wallH=Math.min(h*2,unit/corrected);const top=Math.floor(horizon-wallH*.53);const bottom=Math.floor(horizon+wallH*.47);const tex=textures[hit.type]||textures[1];let tx=Math.floor(hit.hit*128);if((hit.side===0&&Math.cos(rayAngle)>0)||(hit.side===1&&Math.sin(rayAngle)<0))tx=127-tx;
      const fog=clamp(1-corrected/18,.18,1),shade=(hit.side===1?.79:1)*fog;
      ctx.globalAlpha=1;ctx.drawImage(tex,tx,0,1,128,x,top,colStep,bottom-top);
      ctx.fillStyle=`rgba(11,14,12,${1-shade})`;ctx.fillRect(x,top,colStep,bottom-top);
      // top/bottom bevel and distance fog
      ctx.fillStyle=`rgba(24,24,19,${.16+(1-fog)*.3})`;ctx.fillRect(x,top,colStep,2);ctx.fillRect(x,bottom-2,colStep,2);
      zBuffer[Math.min(W-1,Math.floor(x/w*W))]=corrected;
    }
    drawDecals(w,h,horizon,fov,unit);
    drawEnemies(w,h,horizon,fov,unit);
    drawWeapon(w,h);
    // subtle film grain scan lines
    ctx.fillStyle='rgba(10,12,9,.055)';for(let y=0;y<h;y+=4)ctx.fillRect(0,y,w,1);
  }
  function drawDecals(w,h,horizon,fov,unit){
    // world-space crates and barrels drawn as chunky raycast-visible props via distance-aware projected shapes
    const props=[[6.6,4.7,0],[10.8,8.7,1],[18.2,5.6,0],[4.4,11.1,1],[12.2,13.8,0],[8.2,6.7,0]];
    const sorted=props.map(([x,y,type])=>({x,y,type,d:Math.hypot(x-player.x,y-player.y),a:wrap(Math.atan2(y-player.y,x-player.x)-player.angle)})).filter(p=>Math.abs(p.a)<.82).sort((a,b)=>b.d-a.d);
    for(const p of sorted){if(!clearSight(player.x,player.y,p.x,p.y))continue;const sx=w/2+Math.tan(p.a)/(Math.tan(fov/2))*w/2;const size=unit*.75/p.d;if(size<4)continue;const z=zBuffer[Math.floor(clamp(sx/w*W,0,W-1))];if(p.d>z+.3)continue;const base=horizon+size*.43;ctx.fillStyle='rgba(0,0,0,.3)';ctx.beginPath();ctx.ellipse(sx,base,size*.48,size*.12,0,0,TAU);ctx.fill();if(!p.type){ctx.fillStyle='#5e5946';ctx.fillRect(sx-size*.42,base-size*.75,size*.84,size*.74);ctx.fillStyle='#857a5d';ctx.fillRect(sx-size*.42,base-size*.75,size*.84,size*.13);ctx.fillStyle='#35382f';ctx.fillRect(sx-size*.32,base-size*.25,size*.64,size*.08);ctx.fillRect(sx-size*.1,base-size*.75,size*.08,size*.74)}else{ctx.fillStyle='#5f5948';ctx.fillRect(sx-size*.3,base-size*.57,size*.6,size*.57);ctx.fillStyle='#a09270';ctx.fillRect(sx-size*.3,base-size*.57,size*.6,size*.1);ctx.fillStyle='#34372e';ctx.fillRect(sx-size*.3,base-size*.14,size*.6,size*.06);}}
  }
  function drawEnemies(w,h,horizon,fov,unit){
    const sorted=enemies.filter(e=>e.hp>0).map(e=>({...e,d:Math.hypot(e.x-player.x,e.y-player.y),a:wrap(Math.atan2(e.y-player.y,e.x-player.x)-player.angle)})).sort((a,b)=>b.d-a.d);
    for(const e of sorted){if(Math.abs(e.a)>fov*.72||!clearSight(player.x,player.y,e.x,e.y))continue;const sx=w/2+Math.tan(e.a)/Math.tan(fov/2)*w/2;const scale=unit*.9/e.d;const sw=scale*.6,sh=scale*1.25,top=horizon-sh*.54;const art=enemyArt[enemies.indexOf(e) % enemyArt.length]||enemyArt[0];
      const x0=Math.max(0,Math.floor(sx-sw/2)),x1=Math.min(w,Math.ceil(sx+sw/2));for(let x=x0;x<x1;x+=Math.max(1,Math.floor(w/800))){const zb=zBuffer[Math.floor(x/w*W)];if(e.d>zb+.08)continue;const srcX=Math.floor((x-(sx-sw/2))/sw*art.width);ctx.drawImage(art,srcX,0,1,art.height,x,top+(horizon*0),Math.max(1,Math.floor(w/800)),sh);}
      // small hostile tag when close to aim
      if(e.d<10&&Math.abs(e.a)<.12){ctx.fillStyle='#ef8c63';ctx.font=`${Math.max(8,Math.floor(w/105))}px monospace`;ctx.textAlign='center';ctx.fillText('HOSTILE',sx,top-5);}
    }
  }
  function drawWeapon(w,h){
    const x=w*.56,y=h*.92,scale=Math.min(w/800,h/450),bob=player.move?Math.sin(state.elapsed*10)*5*scale:Math.sin(state.elapsed*2)*1.5*scale;
    ctx.save();ctx.translate(x+bob,y+player.recoil*9*scale+shake*2);ctx.rotate(-.07);
    // forearm, sleeve and tactical glove
    const g=ctx.createLinearGradient(0,-50*scale,0,70*scale);g.addColorStop(0,'#8e775d');g.addColorStop(.6,'#675d4d');g.addColorStop(1,'#403e35');
    ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(-10*scale,4*scale);ctx.lineTo(79*scale,7*scale);ctx.lineTo(110*scale,75*scale);ctx.lineTo(-48*scale,89*scale);ctx.closePath();ctx.fill();
    ctx.fillStyle='#252923';ctx.beginPath();ctx.moveTo(-20*scale,-17*scale);ctx.lineTo(159*scale,-12*scale);ctx.lineTo(177*scale,18*scale);ctx.lineTo(14*scale,23*scale);ctx.closePath();ctx.fill();
    ctx.fillStyle='#464b40';ctx.fillRect(-6*scale,-29*scale,142*scale,18*scale);ctx.fillRect(117*scale,-25*scale,42*scale,10*scale);ctx.fillRect(21*scale,-43*scale,42*scale,14*scale);ctx.fillStyle='#171b18';ctx.fillRect(36*scale,-41*scale,13*scale,10*scale);
    ctx.fillStyle='#7c826e';ctx.fillRect(-3*scale,-13*scale,149*scale,3*scale);ctx.fillRect(75*scale,-29*scale,3*scale,17*scale);ctx.fillStyle='#292d27';ctx.fillRect(35*scale,0,10*scale,28*scale);ctx.fillRect(15*scale,11*scale,45*scale,8*scale);
    ctx.fillStyle='#a08b69';ctx.fillRect(2*scale,30*scale,58*scale,3*scale);
    if(muzzle>0){ctx.globalAlpha=muzzle;ctx.fillStyle='#f8e394';ctx.beginPath();ctx.moveTo(166*scale,-20*scale);ctx.lineTo(207*scale,-42*scale);ctx.lineTo(195*scale,-11*scale);ctx.lineTo(215*scale,5*scale);ctx.lineTo(171*scale,-1*scale);ctx.closePath();ctx.fill();ctx.fillStyle='#fff4bf';ctx.beginPath();ctx.arc(168*scale,-10*scale,10*scale,0,TAU);ctx.fill();}
    ctx.restore();
  }
  function drawRadar(){
    const cw=radar.width,ch=radar.height,scale=cw/10;rctx.clearRect(0,0,cw,ch);rctx.save();rctx.beginPath();rctx.arc(cw/2,ch/2,cw*.48,0,TAU);rctx.clip();rctx.fillStyle='#14201a';rctx.fillRect(0,0,cw,ch);
    const cx=cw/2,cy=ch/2,span=10;
    for(let y=0;y<MH;y++)for(let x=0;x<MW;x++)if(MAP[y][x]!=='0'){const rx=cx+(x+.5-player.x)*scale,ry=cy+(y+.5-player.y)*scale;rctx.fillStyle=MAP[y][x]==='2'?'#77755d':'#3e4b3b';rctx.fillRect(rx-scale/2,ry-scale/2,scale*.92,scale*.92)}
    rctx.strokeStyle='rgba(205,224,168,.14)';rctx.lineWidth=1;rctx.beginPath();rctx.arc(cx,cy,cw*.25,0,TAU);rctx.arc(cx,cy,cw*.48,0,TAU);rctx.moveTo(cx,0);rctx.lineTo(cx,ch);rctx.moveTo(0,cy);rctx.lineTo(cw,cy);rctx.stroke();
    for(const e of enemies)if(e.hp>0){const dx=e.x-player.x,dy=e.y-player.y;if(Math.hypot(dx,dy)>span*.5)continue;const rx=cx+(dx*Math.cos(-player.angle)-dy*Math.sin(-player.angle))*scale,ry=cy+(dx*Math.sin(-player.angle)+dy*Math.cos(-player.angle))*scale;rctx.fillStyle=e.state==='attack'?'#fa785b':'#d99b69';rctx.beginPath();rctx.arc(rx,ry,2.4,0,TAU);rctx.fill();}
    rctx.translate(cx,cy);rctx.rotate(-player.angle);rctx.fillStyle='#d9f36a';rctx.beginPath();rctx.moveTo(0,-5);rctx.lineTo(-3.5,4);rctx.lineTo(0,2);rctx.lineTo(3.5,4);rctx.closePath();rctx.fill();rctx.restore();
  }
  function setWeapon(w){weapon=w;$('weapon-name').textContent=gun().name;$('ammo-current').textContent=gun().ammo;$('ammo-reserve').textContent=gun().reserve;$('ammo-state').textContent='READY';$('weapon-art').textContent=w==='rifle'?'╱━▰━━━╸':'╱━▰━╸';$('ammo-state').style.color='var(--lime)';}
  function updateHud(){const g=gun();$('ammo-current').textContent=g.ammo;$('ammo-reserve').textContent=g.reserve;$('health-value').textContent=Math.ceil(player.hp);$('armor-value').textContent=Math.ceil(player.armor);$('health-bar').style.width=player.hp+'%';$('armor-bar').style.width=player.armor+'%';$('objective-count').textContent=String(enemies.filter(e=>e.hp>0).length).padStart(2,'0')+' / 05';$('clock').textContent=`${String(Math.floor(state.time/60)).padStart(2,'0')}:${String(Math.floor(state.time%60)).padStart(2,'0')}`;drawRadar();}
  function showToast(text){const el=$('toast');el.textContent=text;el.classList.add('show');state.toastAt=performance.now()+1650;}
  function addFeed(name){const el=document.createElement('div');el.className='feed-item';el.innerHTML=`YOU <b>✕</b> ${name}`;$('kill-feed').prepend(el);while($('kill-feed').children.length>4)$('kill-feed').lastChild.remove();setTimeout(()=>el.remove(),4000);}
  function hitmarker(){const el=$('hitmarker');el.classList.add('show');setTimeout(()=>el.classList.remove('show'),105);}
  function shoot(now){if(!state.active||state.paused||state.ended||state.reloading)return;const g=gun();if(now<state.fireAt)return;if(g.ammo<=0){state.fireAt=now+250;showToast('MAGAZINE EMPTY — PRESS R TO RELOAD');return;}state.fireAt=now+g.rate;g.ammo--;state.shots++;player.recoil=1;muzzle=.9;shake=1;$('crosshair').classList.add('firing');setTimeout(()=>$('crosshair').classList.remove('firing'),65);setTimeout(()=>{$('crosshair').classList.remove('firing');},110);
    let target=null,nearest=Infinity;const spread=g.spread*(weapon==='rifle'?1:1);const aim=player.angle+(Math.random()-.5)*spread;
    for(const e of enemies){if(e.hp<=0)continue;const dx=e.x-player.x,dy=e.y-player.y,d=Math.hypot(dx,dy),a=Math.abs(wrap(Math.atan2(dy,dx)-aim));const threshold=Math.atan2(.31,d)+spread*.45;if(a<threshold&&d<nearest&&clearSight(player.x,player.y,e.x,e.y)){target=e;nearest=d;}}
    if(target){const head=Math.abs(wrap(Math.atan2(target.y-player.y,target.x-player.x)-player.angle))<Math.atan2(.11,nearest);const damage=g.damage*(head?2.05:1);target.hp-=damage;target.state='attack';target.alert=7;state.hits++;hitmarker();if(target.hp<=0){state.kills++;addFeed(target.name);$('center-message').textContent=state.kills===5?'SECTOR SECURED':'HOSTILE DOWN';$('center-message').classList.add('show');setTimeout(()=>$('center-message').classList.remove('show'),900);if(enemies.every(e=>e.hp<=0))finish(true);}}
    updateHud();
  }
  function reload(){if(!state.active||state.paused||state.reloading)return;const g=gun();if(g.ammo===g.mag||g.reserve<=0){showToast(g.reserve<=0?'NO RESERVE AMMO':'MAGAZINE FULL');return;}state.reloading=true;state.reloadAt=performance.now()+(weapon==='rifle'?1450:1150);$('ammo-state').textContent='RELOADING';$('ammo-state').style.color='#f1c97a';showToast('RELOADING');}
  function finish(win){if(state.ended)return;state.ended=true;document.exitPointerLock?.();$('end-kicker').textContent=win?'OPERATION COMPLETE':'MISSION FAILED';$('end-title').textContent=win?'SITE SECURED.':'OPERATOR DOWN.';$('end-copy').textContent=win?'The sector is clear. Good work, operator.':'You were overwhelmed. Regroup and try again.';$('end-kills').textContent=String(state.kills).padStart(2,'0');$('end-accuracy').textContent=(state.shots?Math.round(state.hits/state.shots*100):0)+'%';const spent=120-state.time;$('end-time').textContent=`${String(Math.floor(spent/60)).padStart(2,'0')}:${String(Math.floor(spent%60)).padStart(2,'0')}`;$('end-overlay').classList.add('show');}
  function startGame(){
    state.active=true;state.paused=false;state.ended=false;state.kills=0;state.shots=0;state.hits=0;state.time=120;state.gameStart=performance.now();state.last=performance.now();player.x=3.5;player.y=2.5;player.angle=.22;player.hp=100;player.armor=100;enemies.forEach((e,i)=>{const spots=[[16.5,2.5],[12.5,5.5],[17.5,8.5],[14.5,12.5],[7.5,13.5]][i];e.x=spots[0];e.y=spots[1];e.hp=100;e.state='idle';e.cool=1+Math.random();e.alert=0;e.wander=0;});guns.rifle.ammo=30;guns.rifle.reserve=90;guns.pistol.ammo=12;guns.pistol.reserve=48;setWeapon('rifle');$('start-screen').classList.remove('visible');$('hud').classList.remove('hidden');$('end-overlay').classList.remove('show');$('pause-overlay').classList.remove('show');$('controls-tip').style.opacity=innerWidth<700?'0':'1';setTimeout(()=>$('controls-tip').style.opacity='0',7000);canvas.requestPointerLock?.();showToast('MISSION LIVE — CLEAR THE FACILITY');updateHud();
  }
  function togglePause(){if(!state.active||state.ended)return;state.paused=!state.paused;$('pause-overlay').classList.toggle('show',state.paused);if(state.paused)document.exitPointerLock?.();else canvas.requestPointerLock?.();}
  function hurt(amount){if(state.ended)return;const absorb=Math.min(player.armor,amount*.65);player.armor-=absorb;player.hp-=amount-absorb;lastDamage=performance.now();$('damage-flash').style.opacity='.8';setTimeout(()=>$('damage-flash').style.opacity='0',160);updateHud();if(player.hp<=0){player.hp=0;finish(false);}}
  function update(dt,now){
    if(state.toastAt&&now>state.toastAt){$('toast').classList.remove('show');state.toastAt=0;}
    if(!state.active||state.paused||state.ended)return;
    state.elapsed+=dt;state.time=Math.max(0,state.time-dt);if(state.time===0){finish(false);return;}
    if(state.reloading&&now>=state.reloadAt){const g=gun(),needed=g.mag-g.ammo,take=Math.min(needed,g.reserve);g.ammo+=take;g.reserve-=take;state.reloading=false;$('ammo-state').textContent='READY';$('ammo-state').style.color='var(--lime)';updateHud();}
    let f=0,s=0;const k=state.keys;if(k.KeyW||k.ArrowUp)f++;if(k.KeyS||k.ArrowDown)f--;if(k.KeyD)s++;if(k.KeyA)s--;const moving=f||s;if(moving){const len=Math.hypot(f,s);f/=len;s/=len;const speed=(k.ShiftLeft||k.ShiftRight||state.mobileRun?4.7:3.1)*dt;const dx=(Math.cos(player.angle)*f-Math.sin(player.angle)*s)*speed,dy=(Math.sin(player.angle)*f+Math.cos(player.angle)*s)*speed;moveActor(player,dx,dy,.22);player.move=Math.min(1,player.move+dt*5);}else player.move=Math.max(0,player.move-dt*5);
    player.recoil=Math.max(0,player.recoil-dt*5);muzzle=Math.max(0,muzzle-dt*8);shake=Math.max(0,shake-dt*9);
    if(k.Space||k.Mouse0)shoot(now);
    for(const e of enemies){if(e.hp<=0)continue;e.cool-=dt;const d=Math.hypot(e.x-player.x,e.y-player.y),visible=d<13&&clearSight(e.x,e.y,player.x,player.y);if(visible){e.state='attack';e.alert=3.5;}else if(e.alert>0)e.alert-=dt;else e.state='idle';
      if(e.state==='attack'&&d>3.1&&visible){const a=Math.atan2(player.y-e.y,player.x-e.x);const sp=.55*dt;moveActor(e,Math.cos(a)*sp,Math.sin(a)*sp,.23);}else if(e.state==='idle'&&Math.random()<dt*.12){const a=Math.random()*TAU;moveActor(e,Math.cos(a)*dt*.22,Math.sin(a)*dt*.22,.22);}
      if(e.state==='attack'&&visible&&d<11&&e.cool<=0){e.cool=1.05+Math.random()*.55;const aimError=Math.abs(wrap(Math.atan2(player.y-e.y,player.x-e.x)-player.angle));if(d<8&&Math.random()<clamp(.65-d*.035,.28,.52)){hurt(10+Math.random()*8);}}
    }
    updateHud();
  }
  function frame(now){const dt=Math.min(.045,(now-state.last)/1000||0);state.last=now;update(dt,now);render();requestAnimationFrame(frame);}
  requestAnimationFrame(frame);

  $('deploy').addEventListener('click',startGame);$('play-again').addEventListener('click',startGame);$('resume').addEventListener('click',()=>{state.paused=false;$('pause-overlay').classList.remove('show');canvas.requestPointerLock?.();});
  document.addEventListener('keydown',e=>{state.keys[e.code]=true;if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();if(e.code==='KeyR')reload();if(e.code==='Digit1')setWeapon('rifle');if(e.code==='Digit2')setWeapon('pistol');if(e.code==='Escape'&&state.active&&!state.ended)togglePause();});document.addEventListener('keyup',e=>{state.keys[e.code]=false;});
  document.addEventListener('mousemove',e=>{if(document.pointerLockElement===canvas&&state.active&&!state.paused){player.angle+=e.movementX*.00235;}});
  canvas.addEventListener('click',()=>{if(state.active&&!state.paused){if(document.pointerLockElement!==canvas)canvas.requestPointerLock?.();else shoot(performance.now());}});
  document.addEventListener('mousedown',e=>{if(e.button===0){state.keys.Mouse0=true;if(state.active&&document.pointerLockElement!==canvas)canvas.requestPointerLock?.();}});document.addEventListener('mouseup',e=>{if(e.button===0)state.keys.Mouse0=false;});
  let touchId=null,touchX=0;canvas.addEventListener('touchstart',e=>{if(!state.active)return;e.preventDefault();const t=e.changedTouches[0];touchId=t.identifier;touchX=t.clientX;},{passive:false});canvas.addEventListener('touchmove',e=>{const t=[...e.changedTouches].find(x=>x.identifier===touchId);if(!t)return;e.preventDefault();player.angle+=(t.clientX-touchX)*.006;touchX=t.clientX;},{passive:false});canvas.addEventListener('touchend',e=>{if([...e.changedTouches].some(t=>t.identifier===touchId))touchId=null;});
  $('mobile-fire').addEventListener('touchstart',e=>{e.preventDefault();state.keys.Mouse0=true;},{passive:false});$('mobile-fire').addEventListener('touchend',e=>{e.preventDefault();state.keys.Mouse0=false;},{passive:false});$('mobile-reload').addEventListener('click',reload);$('mobile-run').addEventListener('touchstart',()=>state.mobileRun=true);$('mobile-run').addEventListener('touchend',()=>state.mobileRun=false);
  document.addEventListener('pointerlockchange',()=>{if(state.active&&!state.ended&&!document.pointerLockElement&&!state.paused&&innerWidth>700){state.paused=true;$('pause-overlay').classList.add('show');}});
})();
