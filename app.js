(() => {
  'use strict';

  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a,b,t) => a + (b-a) * t;
  const easeOutCubic = t => 1 - Math.pow(1-clamp(t,0,1),3);
  const easeInOutCubic = t => t < .5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2;
  const TAU = Math.PI * 2;

  function mulberry32(seed){
    return function(){
      let t = seed += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }
  function roundRect(ctx,x,y,w,h,r){
    r=Math.min(r,w/2,h/2);
    ctx.beginPath();
    ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);
    ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath();
  }
  function pathShadow(ctx, color, blur, ox=0, oy=0){ ctx.shadowColor=color;ctx.shadowBlur=blur;ctx.shadowOffsetX=ox;ctx.shadowOffsetY=oy; }
  function clearShadow(ctx){ ctx.shadowColor='transparent';ctx.shadowBlur=0;ctx.shadowOffsetX=0;ctx.shadowOffsetY=0; }
  function colorMix(a,b,t){
    const p=s=>s.match(/\w\w/g).map(v=>parseInt(v,16));
    const A=p(a.replace('#','')),B=p(b.replace('#',''));
    return '#'+A.map((v,i)=>Math.round(lerp(v,B[i],t)).toString(16).padStart(2,'0')).join('');
  }

  const screens = {
    intro: $('#screen-intro'), learn: $('#screen-learn'), order: $('#screen-order'),
    fr: $('#screen-fr'), ru: $('#screen-ru'), finish: $('#screen-finish')
  };
  const state = {
    order:['fr','ru'], roundIndex:0, strikes:0, locked:false,
    submissionId:getSubmissionId()
  };

  function getSubmissionId(){
    const k='sawlib_submission_id_v3';
    let id=localStorage.getItem(k);
    if(!id){ id=(crypto.randomUUID?.() || `saw-${Date.now()}-${Math.random().toString(36).slice(2)}`); localStorage.setItem(k,id); }
    return id;
  }

  function showScreen(name){
    Object.values(screens).forEach(s=>s.classList.remove('active'));
    screens[name].classList.add('active');
    window.scrollTo({top:0,behavior:'instant'});
    const inGame=name==='fr'||name==='ru';
    $('#strikeHud').classList.toggle('hidden',!inGame);
    if(inGame){
      const el=name==='fr'?$('#frRoundIndex'):$('#ruRoundIndex');
      el.textContent=String(state.roundIndex+1);
      requestAnimationFrame(()=>scenes[name].resize(true));
    }
  }

  $$('[data-next]').forEach(btn=>btn.addEventListener('click',()=>showScreen(btn.dataset.next)));
  $$('[data-order]').forEach(btn=>btn.addEventListener('click',()=>{
    state.order=btn.dataset.order==='fr'?['fr','ru']:['ru','fr'];
    state.roundIndex=0; resetWholeRun(); startCurrentRound();
  }));

  function resetStrikes(){ state.strikes=0; $$('.strike-dot').forEach(x=>x.classList.remove('on')); }
  function mistake(lang){
    if(state.locked) return;
    state.strikes++;
    const dot=$(`#strikeDot${state.strikes}`); if(dot) dot.classList.add('on');
    scenes[lang].flashWrong();
    if(state.strikes>=3) gameOver();
  }
  function gameOver(){
    state.locked=true;
    const overlay=$('#gameOverOverlay'); overlay.classList.add('show');overlay.setAttribute('aria-hidden','false');
    let n=3;$('#countdown').textContent=n;
    const timer=setInterval(()=>{
      n--;
      if(n>0) $('#countdown').textContent=n;
      else{
        clearInterval(timer);overlay.classList.remove('show');overlay.setAttribute('aria-hidden','true');
        state.roundIndex=0;resetWholeRun();startCurrentRound();
      }
    },850);
  }
  function resetWholeRun(){ resetStrikes(); scenes.fr.reset(); scenes.ru.reset(); state.locked=false; }
  function startCurrentRound(){ const lang=state.order[state.roundIndex]; showScreen(lang);resetStrikes();state.locked=false;scenes[lang].reset(); }

  class BaseScene{
    constructor(canvas,statusEl){
      this.canvas=canvas;this.ctx=canvas.getContext('2d',{alpha:false});this.statusEl=statusEl;
      this.w=0;this.h=0;this.dpr=1;this.pointer=null;this.last=performance.now();this.running=true;
      this.wrongUntil=0;this.wrongProgress=0;this.isPortrait=false;
      this.resizeObserver=new ResizeObserver(()=>this.resize());
      this.resizeObserver.observe(canvas.parentElement);
      canvas.addEventListener('pointerdown',e=>this.onPointerDown(e));
      canvas.addEventListener('pointermove',e=>this.onPointerMove(e));
      canvas.addEventListener('pointerup',e=>this.onPointerUp(e));
      canvas.addEventListener('pointercancel',e=>this.onPointerUp(e));
      window.addEventListener('blur',()=>{this.pointer=null;});
      requestAnimationFrame(t=>this.loop(t));
    }
    resize(force=false){
      const rect=this.canvas.parentElement.getBoundingClientRect();
      if(!rect.width||!rect.height)return;
      const dpr=Math.min(window.devicePixelRatio||1,2);
      if(force||Math.abs(rect.width-this.w)>1||Math.abs(rect.height-this.h)>1||dpr!==this.dpr){
        this.w=rect.width;this.h=rect.height;this.dpr=dpr;this.isPortrait=this.h>this.w*1.08;
        this.canvas.width=Math.round(this.w*dpr);this.canvas.height=Math.round(this.h*dpr);
        this.canvas.style.width=this.w+'px';this.canvas.style.height=this.h+'px';
        this.ctx.setTransform(dpr,0,0,dpr,0,0);
        this.onResize?.();
      }
    }
    point(e){ const r=this.canvas.getBoundingClientRect();return{x:(e.clientX-r.left)/r.width*this.w,y:(e.clientY-r.top)/r.height*this.h}; }
    loop(t){
      if(!this.running)return;
      this.resize();const dt=Math.min(40,t-this.last);this.last=t;
      this.update?.(t,dt);this.draw(t);
      requestAnimationFrame(tt=>this.loop(tt));
    }
    draw(t){ this.ctx.setTransform(this.dpr,0,0,this.dpr,0,0);this.render(t);if(t<this.wrongUntil)this.drawWrong(t); }
    flashWrong(){ this.wrongUntil=performance.now()+520; }
    drawWrong(t){
      const ctx=this.ctx;const rem=(this.wrongUntil-t)/520;const p=1-rem;
      const scale=p<.25?easeOutCubic(p/.25)*1.05:1-(p-.25)*.12;
      const alpha=p<.75?1:1-(p-.75)/.25;
      ctx.save();ctx.translate(this.w/2,this.h/2);ctx.scale(scale,scale);ctx.rotate(-.06);
      ctx.lineCap='round';ctx.lineWidth=Math.max(10,Math.min(this.w,this.h)*.024);ctx.strokeStyle=`rgba(238,62,73,${alpha})`;
      pathShadow(ctx,'rgba(90,0,0,.35)',18,0,8);
      const s=Math.min(this.w,this.h)*.16;ctx.beginPath();ctx.moveTo(-s,-s);ctx.lineTo(s,s);ctx.moveTo(s,-s);ctx.lineTo(-s,s);ctx.stroke();clearShadow(ctx);ctx.restore();
    }
    toast(text){ if(!this.statusEl)return;this.statusEl.textContent=text;this.statusEl.classList.add('show');clearTimeout(this.toastTimer);this.toastTimer=setTimeout(()=>this.statusEl.classList.remove('show'),1200); }
  }

  function drawVignette(ctx,w,h,intensity=.42){
    const g=ctx.createRadialGradient(w*.5,h*.46,Math.min(w,h)*.2,w*.5,h*.5,Math.max(w,h)*.78);
    g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,`rgba(0,0,0,${intensity})`);ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  }
  function drawFilmGrain(ctx,w,h,seed=5,alpha=.045){
    const r=mulberry32(seed+Math.floor(performance.now()/120));
    ctx.save();ctx.globalAlpha=alpha;ctx.fillStyle='#fff';
    const n=Math.round((w*h)/9000);
    for(let i=0;i<n;i++){const x=r()*w,y=r()*h,s=.5+r()*1.2;ctx.fillRect(x,y,s,s)}
    ctx.restore();
  }

  function drawHuman(ctx,x,y,h,opt={}){
    const s=h/300;const skin=opt.skin||'#d7a27f';const skinDark=colorMix(skin,'#5e3a2d',.22);
    const shirt=opt.shirt||'#425a78',pants=opt.pants||'#252b34',hair=opt.hair||'#332a26';
    const female=!!opt.female, sad=!!opt.sad, anxious=!!opt.anxious, coat=!!opt.coat;
    ctx.save();ctx.translate(x,y);ctx.scale(s,s);
    // shadow
    ctx.save();ctx.globalAlpha=.24;ctx.fillStyle='#0a0e12';ctx.filter='blur(5px)';ctx.beginPath();ctx.ellipse(0,5,44,10,0,0,TAU);ctx.fill();ctx.restore();
    // legs with cloth shading
    let g=ctx.createLinearGradient(-30,-115,30,-30);g.addColorStop(0,colorMix(pants,'#ffffff',.08));g.addColorStop(1,colorMix(pants,'#000000',.22));
    ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(-29,-113);ctx.quadraticCurveTo(-31,-73,-28,-22);ctx.quadraticCurveTo(-23,-7,-10,-10);ctx.lineTo(-3,-105);ctx.closePath();ctx.fill();
    ctx.beginPath();ctx.moveTo(4,-106);ctx.lineTo(13,-10);ctx.quadraticCurveTo(27,-7,31,-23);ctx.quadraticCurveTo(33,-76,28,-113);ctx.closePath();ctx.fill();
    // shoes
    ctx.fillStyle='#161b20';ctx.beginPath();ctx.roundRect(-31,-17,24,13,5);ctx.fill();ctx.beginPath();ctx.roundRect(10,-17,25,13,5);ctx.fill();
    // torso
    g=ctx.createLinearGradient(-35,-205,35,-90);g.addColorStop(0,colorMix(shirt,'#ffffff',.16));g.addColorStop(.55,shirt);g.addColorStop(1,colorMix(shirt,'#000000',.25));
    ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(-36,-194);ctx.bezierCurveTo(-22,-208,21,-209,35,-193);ctx.lineTo(30,-102);ctx.bezierCurveTo(17,-92,-18,-91,-31,-103);ctx.closePath();ctx.fill();
    if(coat){ctx.strokeStyle='rgba(255,255,255,.55)';ctx.lineWidth=5;ctx.beginPath();ctx.moveTo(0,-198);ctx.lineTo(0,-102);ctx.stroke();}
    // arms
    ctx.lineCap='round';ctx.strokeStyle=skin;ctx.lineWidth=18;ctx.beginPath();ctx.moveTo(-32,-184);ctx.quadraticCurveTo(-47,-150,-40,-116);ctx.stroke();ctx.beginPath();ctx.moveTo(32,-184);ctx.quadraticCurveTo(47,-150,39,-116);ctx.stroke();
    ctx.strokeStyle=skinDark;ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(-39,-118);ctx.lineTo(-38,-110);ctx.moveTo(39,-118);ctx.lineTo(38,-110);ctx.stroke();
    // neck
    ctx.fillStyle=skin;ctx.beginPath();ctx.roundRect(-12,-230,24,35,9);ctx.fill();
    // face with real-ish contour
    g=ctx.createRadialGradient(-8,-257,5,0,-255,42);g.addColorStop(0,colorMix(skin,'#ffffff',.16));g.addColorStop(1,skin);
    ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(-31,-270);ctx.bezierCurveTo(-31,-303,31,-306,33,-269);ctx.bezierCurveTo(35,-237,18,-219,1,-218);ctx.bezierCurveTo(-17,-218,-34,-239,-31,-270);ctx.closePath();ctx.fill();
    // ears
    ctx.fillStyle=skinDark;ctx.beginPath();ctx.ellipse(-32,-263,6,10,0,0,TAU);ctx.fill();ctx.beginPath();ctx.ellipse(33,-263,6,10,0,0,TAU);ctx.fill();
    // hair mass
    ctx.fillStyle=hair;ctx.beginPath();
    if(female){
      ctx.moveTo(-33,-270);ctx.bezierCurveTo(-38,-311,-10,-323,13,-317);ctx.bezierCurveTo(37,-314,41,-290,34,-258);ctx.bezierCurveTo(30,-276,21,-288,7,-289);ctx.bezierCurveTo(-10,-292,-24,-284,-33,-270);ctx.fill();
      ctx.strokeStyle=hair;ctx.lineWidth=13;ctx.beginPath();ctx.moveTo(-29,-273);ctx.bezierCurveTo(-40,-235,-36,-211,-27,-193);ctx.moveTo(31,-272);ctx.bezierCurveTo(43,-237,38,-211,28,-193);ctx.stroke();
    } else {
      ctx.moveTo(-33,-271);ctx.bezierCurveTo(-34,-307,-9,-319,14,-313);ctx.bezierCurveTo(37,-307,39,-287,33,-263);ctx.bezierCurveTo(23,-281,8,-286,-6,-284);ctx.bezierCurveTo(-18,-283,-27,-278,-33,-271);ctx.fill();
    }
    // eyebrows/eyes
    ctx.strokeStyle=colorMix(hair,'#000000',.35);ctx.lineWidth=3.1;ctx.beginPath();ctx.moveTo(-20,-266);ctx.quadraticCurveTo(-13,-270,-6,-267);ctx.moveTo(7,-267);ctx.quadraticCurveTo(14,-270,21,-266);ctx.stroke();
    ctx.fillStyle='#24282d';
    const ey=anxious?-258:-260;ctx.beginPath();ctx.ellipse(-13,ey,3.2,anxious?2:3.2,0,0,TAU);ctx.fill();ctx.beginPath();ctx.ellipse(14,ey,3.2,anxious?2:3.2,0,0,TAU);ctx.fill();
    // nose
    ctx.strokeStyle='rgba(111,67,58,.45)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(1,-257);ctx.quadraticCurveTo(-1,-246,3,-244);ctx.stroke();
    // mouth
    ctx.strokeStyle='#824e4a';ctx.lineWidth=2.5;ctx.beginPath();
    if(sad||anxious){ctx.moveTo(-9,-235);ctx.quadraticCurveTo(0,-243,10,-235);}else{ctx.moveTo(-9,-239);ctx.quadraticCurveTo(0,-233,10,-239);}ctx.stroke();
    if(anxious){ctx.strokeStyle='rgba(94,116,150,.6)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(25,-253);ctx.lineTo(29,-244);ctx.stroke();}
    ctx.restore();
  }

  function drawTreeComponent(ctx,x,y,h,seed=1,night=true){
    const r=mulberry32(seed);const w=h*.62;ctx.save();ctx.translate(x,y);
    // shadow
    ctx.save();ctx.globalAlpha=.28;ctx.fillStyle='#050a08';ctx.filter='blur(7px)';ctx.beginPath();ctx.ellipse(0,0,w*.42,h*.055,0,0,TAU);ctx.fill();ctx.restore();
    // trunk - irregular bezier path
    let tg=ctx.createLinearGradient(-w*.08,-h*.66,w*.11,0);tg.addColorStop(0,night?'#55402f':'#7b5a43');tg.addColorStop(.5,night?'#6a4b34':'#947057');tg.addColorStop(1,night?'#36291f':'#5d4434');ctx.fillStyle=tg;
    ctx.beginPath();ctx.moveTo(-w*.075,0);ctx.bezierCurveTo(-w*.02,-h*.18,-w*.085,-h*.43,-w*.02,-h*.68);ctx.bezierCurveTo(w*.02,-h*.71,w*.055,-h*.69,w*.075,-h*.65);ctx.bezierCurveTo(w*.035,-h*.42,w*.09,-h*.2,w*.105,0);ctx.closePath();ctx.fill();
    // bark strokes
    ctx.globalAlpha=.35;ctx.strokeStyle=night?'#b08a66':'#4a3326';ctx.lineWidth=Math.max(1,h*.005);for(let i=0;i<8;i++){const xx=(r()-.5)*w*.11;ctx.beginPath();ctx.moveTo(xx,-h*(.05+r()*.55));ctx.bezierCurveTo(xx+w*.02,-h*.35,xx-w*.018,-h*.2,xx,-h*.08);ctx.stroke()}ctx.globalAlpha=1;
    // branches
    ctx.strokeStyle=night?'#4e3829':'#6b4b36';ctx.lineCap='round';for(let i=0;i<10;i++){ctx.lineWidth=h*(.012-r()*.004);ctx.beginPath();ctx.moveTo((r()-.5)*w*.08,-h*(.4+r()*.25));ctx.quadraticCurveTo((r()-.5)*w*.35,-h*(.65+r()*.18),(r()-.5)*w*.46,-h*(.62+r()*.2));ctx.stroke()}
    // canopy with many nuanced clusters
    for(let i=0;i<95;i++){
      const ang=r()*TAU;const rr=Math.sqrt(r());const cx=Math.cos(ang)*w*.38*rr;const cy=-h*.72+Math.sin(ang)*h*.22*rr;
      const size=h*(.035+r()*.04);const base=night?['#173a31','#1e4a3b','#285642','#13322c'][Math.floor(r()*4)]:['#315f3b','#43764b','#587f4e','#2e5938'][Math.floor(r()*4)];
      const grad=ctx.createRadialGradient(cx-size*.3,cy-size*.35,2,cx,cy,size);grad.addColorStop(0,colorMix(base,'#ffffff',.12));grad.addColorStop(1,colorMix(base,'#000000',.18));ctx.fillStyle=grad;ctx.globalAlpha=.72+r()*.24;ctx.beginPath();ctx.ellipse(cx,cy,size*(.8+r()*.45),size*(.65+r()*.35),r()*TAU,0,TAU);ctx.fill();
    }
    ctx.globalAlpha=1;ctx.restore();
  }

  function drawBushComponent(ctx,x,y,h,seed=2,night=true){
    const r=mulberry32(seed);ctx.save();ctx.translate(x,y);
    ctx.save();ctx.globalAlpha=.22;ctx.fillStyle='#07100c';ctx.filter='blur(5px)';ctx.beginPath();ctx.ellipse(0,0,h*.45,h*.07,0,0,TAU);ctx.fill();ctx.restore();
    for(let i=0;i<60;i++){
      const a=lerp(-Math.PI*.95,-Math.PI*.05,r());const len=h*(.22+r()*.55);const ex=Math.cos(a)*len*.65,ey=Math.sin(a)*len;
      ctx.strokeStyle=night?'#456b50':'#547d4f';ctx.lineWidth=Math.max(1,h*.012);ctx.beginPath();ctx.moveTo(0,0);ctx.quadraticCurveTo(ex*.45,ey*.55,ex,ey);ctx.stroke();
      const leaf=night?['#1b4939','#245844','#2d6048'][Math.floor(r()*3)]:['#397044','#4a7f4d','#608d55'][Math.floor(r()*3)];ctx.fillStyle=leaf;
      for(let j=0;j<2;j++){const f=.6+j*.25;const lx=ex*f+(r()-.5)*h*.025,ly=ey*f+(r()-.5)*h*.02;ctx.save();ctx.translate(lx,ly);ctx.rotate(a+(j?-.55:.55));ctx.beginPath();ctx.ellipse(0,0,h*.055,h*.018,0,0,TAU);ctx.fill();ctx.restore();}
    }
    ctx.restore();
  }

  function drawStone(ctx,x,y,radius,glow=1){
    ctx.save();ctx.translate(x,y);pathShadow(ctx,`rgba(90,255,229,${.5*glow})`,28*glow);const g=ctx.createRadialGradient(-radius*.3,-radius*.35,2,0,0,radius);g.addColorStop(0,'#e7fff8');g.addColorStop(.22,'#a4ffe4');g.addColorStop(.62,'#48b9a9');g.addColorStop(1,'#225955');ctx.fillStyle=g;ctx.beginPath();ctx.moveTo(-radius*.85,radius*.2);ctx.quadraticCurveTo(-radius*.55,-radius*.8,radius*.1,-radius*.86);ctx.quadraticCurveTo(radius*.9,-radius*.64,radius*.82,radius*.22);ctx.quadraticCurveTo(radius*.15,radius*.82,-radius*.85,radius*.2);ctx.fill();clearShadow(ctx);ctx.strokeStyle='rgba(222,255,248,.58)';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-radius*.35,-radius*.37);ctx.lineTo(radius*.1,-radius*.58);ctx.lineTo(radius*.47,-radius*.23);ctx.stroke();ctx.restore();
  }

  function drawUfo(ctx,x,y,w,beamAlpha=0){
    ctx.save();ctx.translate(x,y);pathShadow(ctx,'rgba(107,220,255,.35)',30);
    let g=ctx.createLinearGradient(0,-w*.2,0,w*.16);g.addColorStop(0,'#e9f1f3');g.addColorStop(.2,'#a7b8c0');g.addColorStop(.55,'#586870');g.addColorStop(1,'#20292e');ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(0,0,w*.48,w*.16,0,0,TAU);ctx.fill();clearShadow(ctx);
    g=ctx.createLinearGradient(0,-w*.26,0,0);g.addColorStop(0,'rgba(194,243,255,.96)');g.addColorStop(.5,'rgba(83,151,180,.9)');g.addColorStop(1,'rgba(27,53,67,.95)');ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(0,-w*.09,w*.2,w*.15,0,Math.PI,TAU);ctx.fill();
    ctx.strokeStyle='rgba(255,255,255,.28)';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(0,-w*.07,w*.16,w*.1,0,Math.PI,TAU);ctx.stroke();
    for(let i=0;i<7;i++){const a=(i/7)*Math.PI*1.7+Math.PI*.65;const lx=Math.cos(a)*w*.36,ly=Math.sin(a)*w*.105+w*.035;ctx.fillStyle=i%2?'#79ffe2':'#9bc7ff';pathShadow(ctx,ctx.fillStyle,10);ctx.beginPath();ctx.arc(lx,ly,w*.018,0,TAU);ctx.fill();clearShadow(ctx)}
    if(beamAlpha>0){ctx.globalAlpha=beamAlpha;const bg=ctx.createLinearGradient(0,w*.08,0,w*1.7);bg.addColorStop(0,'rgba(168,255,229,.58)');bg.addColorStop(.35,'rgba(114,255,224,.24)');bg.addColorStop(1,'rgba(114,255,224,0)');ctx.fillStyle=bg;ctx.beginPath();ctx.moveTo(-w*.13,w*.08);ctx.lineTo(w*.13,w*.08);ctx.lineTo(w*.75,w*1.7);ctx.lineTo(-w*.75,w*1.7);ctx.closePath();ctx.fill();}
    ctx.restore();
  }

  class FrenchScene extends BaseScene{
    constructor(canvas,status){
      super(canvas,status);this.seed=91;this.mode='idle';this.actionStart=0;this.clearFired=false;
      this.plants=[
        {type:'bush',x:.07,y:.89,ox:.07,oy:.89,s:.17,seed:11},
        {type:'tree',x:.13,y:.82,ox:.13,oy:.82,s:.32,seed:23},
        {type:'tree',x:.29,y:.83,ox:.29,oy:.83,s:.30,seed:47},
        {type:'bush',x:.35,y:.91,ox:.35,oy:.91,s:.14,seed:39},
        {type:'bush',x:.72,y:.91,ox:.72,oy:.91,s:.15,seed:55},
        {type:'tree',x:.87,y:.83,ox:.87,oy:.83,s:.32,seed:71}
      ];this.drag=null;this.stoneRevealed=false;this.coverTree=null;this.reset();
    }
    reset(){
      this.mode='idle';this.actionStart=0;this.clearFired=false;this.pointer=null;this.drag=null;this.stoneRevealed=false;
      this.plants.forEach(p=>{p.x=p.ox;p.y=p.oy});
      const trees=this.plants.filter(p=>p.type==='tree');
      this.coverTree=trees[Math.floor(Math.random()*trees.length)];
    }
    plantPx(p){return{x:p.x*this.w,y:p.y*this.h,h:Math.min(this.h*1.15,this.w)*p.s};}
    stonePos(){
      const tree=this.coverTree||this.plants.find(p=>p.type==='tree');
      return{x:this.w*tree.ox,y:this.h*(tree.oy+.015),r:Math.min(this.w,this.h)*.035};
    }
    humanLayout(){
      return this.isPortrait?{mx:this.w*.39,wx:this.w*.58,y:this.h*.78,h:this.h*.23}:{mx:this.w*.45,wx:this.w*.55,y:this.h*.81,h:this.h*.36};
    }
    onPointerDown(e){
      if(state.locked||this.mode!=='idle'||(e.pointerType==='mouse'&&e.button!==0))return;
      const p=this.point(e);const st=this.stonePos();
      if(this.stoneRevealed&&Math.hypot(p.x-st.x,p.y-st.y)<st.r*1.8){e.preventDefault();this.startAbduction();return;}
      const sorted=[...this.plants].reverse();
      const hit=sorted.find(pl=>{const q=this.plantPx(pl);return Math.abs(p.x-q.x)<q.h*.28&&p.y>q.y-q.h*.78&&p.y<q.y+q.h*.08;});
      if(hit){
        e.preventDefault();this.drag={id:e.pointerId,obj:hit,startX:p.x,startY:p.y,ox:hit.x,oy:hit.y};this.canvas.setPointerCapture?.(e.pointerId);this.canvas.style.cursor='grabbing';
      }else mistake('fr');
    }
    onPointerMove(e){
      const p=this.point(e);
      if(this.drag&&this.drag.id===e.pointerId&&!state.locked){
        const dx=(p.x-this.drag.startX)/this.w,dy=(p.y-this.drag.startY)/this.h;this.drag.obj.x=clamp(this.drag.ox+dx,.03,.97);this.drag.obj.y=clamp(this.drag.oy+dy,.25,.95);
      }else if(!state.locked){
        const st=this.stonePos();let interactive=this.stoneRevealed&&Math.hypot(p.x-st.x,p.y-st.y)<st.r*1.8;
        if(!interactive)interactive=this.plants.some(pl=>{const q=this.plantPx(pl);return Math.abs(p.x-q.x)<q.h*.26&&p.y>q.y-q.h*.75&&p.y<q.y+q.h*.05;});
        this.canvas.style.cursor=interactive?'grab':'default';
      }
    }
    onPointerUp(e){
      if(!this.drag)return;const obj=this.drag.obj;this.drag=null;this.canvas.style.cursor='default';try{this.canvas.releasePointerCapture?.(e.pointerId)}catch{}
      if(obj===this.coverTree){const d=Math.hypot(obj.x-obj.ox,obj.y-obj.oy);if(d>.10)this.stoneRevealed=true;}
    }
    startAbduction(){this.mode='abduct';this.actionStart=performance.now();this.clearFired=false;state.locked=true;}
    update(t){if(this.mode==='abduct'&&!this.clearFired&&t-this.actionStart>4750){this.clearFired=true;showClear('fr');}}
    drawBackground(t){
      const ctx=this.ctx,w=this.w,h=this.h;const horizon=this.isPortrait?h*.47:h*.55;
      let g=ctx.createLinearGradient(0,0,0,horizon);g.addColorStop(0,'#101b2c');g.addColorStop(.5,'#2d4255');g.addColorStop(1,'#718280');ctx.fillStyle=g;ctx.fillRect(0,0,w,horizon+4);
      // soft clouds
      ctx.save();ctx.filter=`blur(${Math.max(14,w*.015)}px)`;ctx.globalAlpha=.18;ctx.fillStyle='#d9eef2';for(let i=0;i<6;i++){const x=w*(.08+i*.18),y=h*(.12+(i%2)*.07);ctx.beginPath();ctx.ellipse(x,y,w*.12,h*.035,0,0,TAU);ctx.fill()}ctx.restore();
      // moon
      const mx=w*(this.isPortrait?.75:.82),my=h*.12,mr=Math.min(w,h)*.055;ctx.save();pathShadow(ctx,'rgba(244,237,205,.38)',32);const mg=ctx.createRadialGradient(mx-mr*.3,my-mr*.3,2,mx,my,mr);mg.addColorStop(0,'#fffbe9');mg.addColorStop(1,'#d9d0ad');ctx.fillStyle=mg;ctx.beginPath();ctx.arc(mx,my,mr,0,TAU);ctx.fill();clearShadow(ctx);ctx.globalAlpha=.12;ctx.fillStyle='#8e876e';ctx.beginPath();ctx.arc(mx-mr*.28,my+mr*.15,mr*.18,0,TAU);ctx.fill();ctx.beginPath();ctx.arc(mx+mr*.2,my-mr*.24,mr*.12,0,TAU);ctx.fill();ctx.restore();
      // distant mountains
      const ridge=(base,amp,seed,color)=>{const r=mulberry32(seed);ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(0,horizon);let x=0;while(x<w){const nx=Math.min(w,x+w*.1);const py=base-(.2+r()*.8)*amp;ctx.quadraticCurveTo((x+nx)/2,py,nx,base-r()*amp*.45);x=nx;}ctx.lineTo(w,horizon+30);ctx.lineTo(0,horizon+30);ctx.closePath();ctx.fill();};
      ridge(horizon+5,h*.16,2,'#253c43');ridge(horizon+22,h*.11,7,'#30494b');
      // ground
      g=ctx.createLinearGradient(0,horizon,0,h);g.addColorStop(0,'#233d32');g.addColorStop(.55,'#13281f');g.addColorStop(1,'#0a1712');ctx.fillStyle=g;ctx.fillRect(0,horizon,w,h-horizon);
      // path
      const pcx=w*(this.isPortrait?.56:.51);ctx.fillStyle='rgba(129,111,81,.34)';ctx.beginPath();ctx.moveTo(pcx-w*.035,horizon);ctx.lineTo(pcx+w*.03,horizon);ctx.lineTo(w*.82,h);ctx.lineTo(w*.13,h);ctx.closePath();ctx.fill();
      // distant trunks and foliage for depth
      const r=mulberry32(109);for(let i=0;i<30;i++){const x=r()*w;const th=h*(.1+r()*.22);ctx.globalAlpha=.35+r()*.25;ctx.strokeStyle='#13291f';ctx.lineWidth=2+r()*3;ctx.beginPath();ctx.moveTo(x,horizon+8);ctx.lineTo(x+(r()-.5)*12,horizon-th);ctx.stroke();ctx.fillStyle='#183227';ctx.beginPath();ctx.ellipse(x,horizon-th,w*(.015+r()*.028),h*(.02+r()*.045),0,0,TAU);ctx.fill()}ctx.globalAlpha=1;
      // forest floor texture
      const rr=mulberry32(300);ctx.globalAlpha=.18;for(let i=0;i<80;i++){const x=rr()*w,y=horizon+rr()*(h-horizon);ctx.strokeStyle=rr()>.5?'#7d8d63':'#34563d';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x+(rr()-.5)*7,y-3-rr()*8);ctx.stroke()}ctx.globalAlpha=1;
    }
    render(t){
      const ctx=this.ctx,w=this.w,h=this.h;this.drawBackground(t);
      const L=this.humanLayout();let elapsed=this.mode==='abduct'?t-this.actionStart:0;
      let ufoY=-h*.2,beam=0,womanLift=0,womanAlpha=1,after=false,timeAlpha=0;
      if(this.mode==='abduct'){
        ufoY=lerp(-h*.18,h*(this.isPortrait?.21:.18),easeOutCubic(elapsed/950));
        beam=clamp((elapsed-650)/420,0,1);
        womanLift=easeInOutCubic((elapsed-950)/1400);womanAlpha=1-clamp((elapsed-1900)/450,0,1);
        timeAlpha=elapsed>2500&&elapsed<3400?Math.sin(clamp((elapsed-2500)/900,0,1)*Math.PI):0;
        after=elapsed>3350;
      }
      if(after){ctx.save();ctx.fillStyle='rgba(14,18,23,.34)';ctx.fillRect(0,0,w,h);ctx.restore();}
      // The hidden stone appears at the base of a randomly chosen tree each reset.
      if(this.stoneRevealed&&this.mode==='idle'){const st=this.stonePos();drawStone(ctx,st.x,st.y,st.r,1+.12*Math.sin(t/170));}
      // Trees stay behind the characters so they never block the couple, even while being dragged.
      this.plants.filter(p=>p.type==='tree').sort((a,b)=>a.y-b.y).forEach(p=>{const q=this.plantPx(p);drawTreeComponent(ctx,q.x,q.y,q.h,p.seed,true);});
      // people
      drawHuman(ctx,L.mx,L.y,L.h,{shirt:after?'#3f4b59':'#516f92',pants:'#252c35',hair:'#322821',skin:'#d8a27d',sad:after});
      if(womanAlpha>0){ctx.save();ctx.globalAlpha=womanAlpha;drawHuman(ctx,L.wx,L.y-womanLift*h*.53,L.h,{shirt:'#ad5777',pants:'#34313f',hair:'#30241e',skin:'#e0ad88',female:true});ctx.restore();}
      // Low bushes can sit in the foreground, but do not cover faces or torsos.
      this.plants.filter(p=>p.type==='bush').sort((a,b)=>a.y-b.y).forEach(p=>{const q=this.plantPx(p);drawBushComponent(ctx,q.x,q.y,q.h,p.seed,true);});
      if(this.mode==='abduct'){drawUfo(ctx,w*(this.isPortrait?.64:.66),ufoY,Math.min(w,h)*(this.isPortrait?.42:.33),beam*.85);}
      // speech after time skip
      if(after){
        const bw=Math.min(w*.62,330),bh=55,bx=clamp(L.mx-bw*.55,12,w-bw-12),by=Math.max(12,L.y-L.h*.92);ctx.save();ctx.fillStyle='rgba(12,15,19,.91)';roundRect(ctx,bx,by,bw,bh,10);ctx.fill();ctx.fillStyle='#fff';ctx.font=`700 ${Math.max(13,Math.min(19,w*.018))}px system-ui,-apple-system,sans-serif`;ctx.textBaseline='middle';ctx.fillText('J’ai le cafard…',bx+16,by+bh/2);ctx.restore();
      }
      if(timeAlpha>0){ctx.save();ctx.globalAlpha=timeAlpha;ctx.fillStyle='rgba(9,11,14,.88)';ctx.fillRect(0,0,w,h);ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`800 ${Math.max(24,Math.min(54,w*.055))}px ui-monospace,monospace`;ctx.fillText('3 DAYS LATER',w/2,h/2);ctx.restore();}
      drawVignette(ctx,w,h,.44);drawFilmGrain(ctx,w,h,40,.035);
    }
  }

  function drawClinicPerson(ctx,x,y,h,opt={}){ drawHuman(ctx,x,y,h,{skin:opt.skin||'#d4a17f',shirt:opt.shirt||'#71808c',pants:opt.pants||'#3d4650',hair:opt.hair||'#44362f',female:opt.female,coat:opt.coat,anxious:opt.anxious}); }
  class RussianScene extends BaseScene{
    constructor(canvas,status){super(canvas,status);this.mode='idle';this.actionStart=0;this.clearFired=false;this.drag=null;this.hero={x:.91,y:.82,ox:.91,oy:.82};this.reset();}
    reset(){this.mode='idle';this.actionStart=0;this.clearFired=false;this.drag=null;this.hero.x=this.hero.ox;this.hero.y=this.hero.oy;}
    heroLayout(){return {x:this.hero.x*this.w,y:this.hero.y*this.h,h:this.h*(this.isPortrait?.19:.34)};}
    target(){return this.isPortrait?{x:this.w*.21,y:this.h*.76,r:this.w*.24}:{x:this.w*.15,y:this.h*.78,r:this.w*.15};}
    onPointerDown(e){
      if(state.locked||this.mode!=='idle'||(e.pointerType==='mouse'&&e.button!==0))return;const p=this.point(e),H=this.heroLayout();
      if(Math.abs(p.x-H.x)<H.h*.2&&p.y>H.y-H.h&&p.y<H.y+H.h*.05){e.preventDefault();this.drag={id:e.pointerId,sx:p.x,sy:p.y,ox:this.hero.x,oy:this.hero.y};this.canvas.setPointerCapture?.(e.pointerId);this.canvas.style.cursor='grabbing';}else mistake('ru');
    }
    onPointerMove(e){const p=this.point(e);if(this.drag&&this.drag.id===e.pointerId&&!state.locked){this.hero.x=clamp(this.drag.ox+(p.x-this.drag.sx)/this.w,.05,.95);this.hero.y=clamp(this.drag.oy+(p.y-this.drag.sy)/this.h,.35,.92);}else if(!state.locked){const H=this.heroLayout();this.canvas.style.cursor=(Math.abs(p.x-H.x)<H.h*.2&&p.y>H.y-H.h&&p.y<H.y+H.h*.05)?'grab':'default';}}
    onPointerUp(e){if(!this.drag)return;this.drag=null;this.canvas.style.cursor='default';try{this.canvas.releasePointerCapture?.(e.pointerId)}catch{};const H=this.heroLayout(),T=this.target();if(Math.hypot(H.x-T.x,H.y-T.y)<T.r){this.startSuccess();}}
    startSuccess(){this.mode='success';this.actionStart=performance.now();this.clearFired=false;state.locked=true;}
    update(t){if(this.mode==='success'&&!this.clearFired&&t-this.actionStart>2200){this.clearFired=true;showClear('ru');}}
    queuePositions(){
      if(this.isPortrait)return [
        [.49,.79],[.59,.78],[.68,.78],[.76,.79],[.84,.78]
      ];
      return [[.36,.81],[.46,.80],[.56,.81],[.66,.80],[.76,.81],[.84,.80]];
    }
    drawRoom(){
      const ctx=this.ctx,w=this.w,h=this.h;const wallH=this.isPortrait?h*.68:h*.66;
      let g=ctx.createLinearGradient(0,0,0,wallH);g.addColorStop(0,'#f7f8f8');g.addColorStop(1,'#dfe5e8');ctx.fillStyle=g;ctx.fillRect(0,0,w,wallH);
      // wall panels and subtle shadow lines
      ctx.strokeStyle='rgba(67,82,91,.08)';ctx.lineWidth=1;for(let i=1;i<6;i++){ctx.beginPath();ctx.moveTo(w*i/6,0);ctx.lineTo(w*i/6,wallH);ctx.stroke();}
      // ceiling light reflections
      for(let i=0;i<3;i++){const cx=w*(.2+i*.3),cy=h*.07;const lg=ctx.createRadialGradient(cx,cy,1,cx,cy,w*.16);lg.addColorStop(0,'rgba(255,255,255,.9)');lg.addColorStop(1,'rgba(255,255,255,0)');ctx.fillStyle=lg;ctx.fillRect(cx-w*.16,0,w*.32,h*.16);}
      // floor with perspective tiles
      g=ctx.createLinearGradient(0,wallH,0,h);g.addColorStop(0,'#cdd4d7');g.addColorStop(1,'#aab4b8');ctx.fillStyle=g;ctx.fillRect(0,wallH,w,h-wallH);
      const vanishX=w*.48,vanishY=wallH;ctx.strokeStyle='rgba(60,75,82,.14)';for(let i=-4;i<=4;i++){ctx.beginPath();ctx.moveTo(vanishX,vanishY);ctx.lineTo(w*(.5+i*.18),h);ctx.stroke();}for(let j=1;j<5;j++){const yy=lerp(wallH,h,Math.pow(j/5,1.5));ctx.beginPath();ctx.moveTo(0,yy);ctx.lineTo(w,yy);ctx.stroke();}
      // door unit
      const dx=this.isPortrait?w*.05:w*.045,dy=this.isPortrait?h*.46:h*.26,dw=this.isPortrait?w*.31:w*.18,dh=this.isPortrait?h*.29:h*.53;
      pathShadow(ctx,'rgba(31,45,54,.24)',20,0,8);ctx.fillStyle='#f7f9fa';roundRect(ctx,dx-7,dy-7,dw+14,dh+14,5);ctx.fill();clearShadow(ctx);
      g=ctx.createLinearGradient(dx,dy,dx+dw,dy+dh);g.addColorStop(0,'#344955');g.addColorStop(1,'#596f79');ctx.fillStyle=g;roundRect(ctx,dx,dy,dw,dh,3);ctx.fill();ctx.strokeStyle='rgba(255,255,255,.2)';ctx.beginPath();ctx.moveTo(dx+dw*.5,dy);ctx.lineTo(dx+dw*.5,dy+dh);ctx.stroke();
      // door window and cross
      ctx.fillStyle='rgba(200,231,238,.28)';roundRect(ctx,dx+dw*.18,dy+dh*.11,dw*.64,dh*.22,3);ctx.fill();ctx.fillStyle='rgba(255,255,255,.9)';ctx.font=`300 ${Math.max(32,dw*.28)}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('+',dx+dw*.5,dy+dh*.51);
      // clinic sign
      ctx.textAlign='left';ctx.fillStyle='#2d3e47';ctx.font=`800 ${Math.max(17,w*.022)}px Georgia,serif`;ctx.fillText('DENTAL',dx,Math.max(30,dy-h*.09));ctx.font=`500 ${Math.max(9,w*.008)}px system-ui`;ctx.fillStyle='#73828a';ctx.fillText('CLINIC',dx,Math.max(46,dy-h*.055));
      // wall poster
      const px=this.isPortrait?w*.58:w*.74,py=h*.16,pw=this.isPortrait?w*.33:w*.19,ph=h*.25;ctx.fillStyle='#fff';pathShadow(ctx,'rgba(44,56,61,.14)',12,0,4);roundRect(ctx,px,py,pw,ph,6);ctx.fill();clearShadow(ctx);ctx.fillStyle='#e7f2f1';ctx.beginPath();ctx.arc(px+pw*.5,py+ph*.38,pw*.2,0,TAU);ctx.fill();ctx.strokeStyle='#6e9a98';ctx.lineWidth=3;ctx.beginPath();ctx.moveTo(px+pw*.42,py+ph*.29);ctx.quadraticCurveTo(px+pw*.5,py+ph*.2,px+pw*.58,py+ph*.29);ctx.lineTo(px+pw*.55,py+ph*.48);ctx.quadraticCurveTo(px+pw*.5,py+ph*.59,px+pw*.45,py+ph*.48);ctx.closePath();ctx.stroke();ctx.fillStyle='#708089';ctx.font=`700 ${Math.max(8,pw*.06)}px system-ui`;ctx.textAlign='center';ctx.fillText('REGULAR CHECK-UP',px+pw*.5,py+ph*.76);
      // bench/chairs
      if(!this.isPortrait){ctx.fillStyle='#6d7b82';for(let i=0;i<4;i++){roundRect(ctx,w*(.42+i*.11),h*.56,w*.085,h*.1,10);ctx.fill();ctx.fillRect(w*(.46+i*.11),h*.65,4,h*.08);}}
      // target floor mark subtle
      const T=this.target();ctx.save();ctx.globalAlpha=.12;ctx.strokeStyle='#557c89';ctx.lineWidth=2;ctx.beginPath();ctx.ellipse(T.x,T.y,T.r*.7,T.r*.24,0,0,TAU);ctx.stroke();ctx.restore();
    }
    drawDoctor(t){
      if(this.mode!=='success')return;const e=t-this.actionStart;if(e<250)return;const p=easeOutCubic((e-250)/380);const x=this.isPortrait?this.w*.31:this.w*.225,y=this.isPortrait?this.h*.64:this.h*.68,h=this.h*(this.isPortrait?.17:.28);ctxSave(this.ctx,()=>{this.ctx.globalAlpha=p;this.ctx.translate(0,(1-p)*18);drawHuman(this.ctx,x,y,h,{skin:'#d7a782',shirt:'#f6f8fa',pants:'#dce4e8',hair:'#4f5355',coat:true});});
      // speech bubble
      if(e>520){const ctx=this.ctx,bw=Math.min(this.w*(this.isPortrait?.55:.28),300),bh=50,bx=clamp(x+bw*.12,12,this.w-bw-12),by=y-h*.95;ctx.fillStyle='rgba(255,255,255,.96)';pathShadow(ctx,'rgba(42,58,66,.18)',12,0,4);roundRect(ctx,bx,by,bw,bh,10);ctx.fill();clearShadow(ctx);ctx.fillStyle='#27333a';ctx.font=`800 ${Math.max(11,Math.min(15,this.w*.015))}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('다음 환자 들어오세요!',bx+bw/2,by+bh/2);}
    }
    render(t){
      const ctx=this.ctx,w=this.w,h=this.h;this.drawRoom();const q=this.queuePositions();const baseH=h*(this.isPortrait?.16:.29);const skin=['#c99774','#d8aa85','#b88063','#e0b291','#c38d6d','#d4a17f'],shirts=['#6e7e88','#756b88','#5d756f','#8d7169','#5c6d87','#7b8169'],hairs=['#2b2f32','#5a4035','#312a27','#c5c1ba','#563a30','#8b6047'];
      q.forEach((pos,i)=>drawClinicPerson(ctx,w*pos[0],h*pos[1],baseH,{skin:skin[i%skin.length],shirt:shirts[i%shirts.length],hair:hairs[i%hairs.length],female:i%3===1}));
      const H=this.heroLayout();const success=this.mode==='success',e=success?t-this.actionStart:0;drawClinicPerson(ctx,H.x,H.y,H.h,{skin:'#d8a47f',shirt:'#4f6f9d',pants:'#33404b',hair:'#31383e',anxious:success&&e>430});
      if(!success){
        // Make it immediately obvious which person the player controls without revealing the solution.
        const labelW=Math.max(42,H.h*.34),labelH=Math.max(26,H.h*.16),lx=H.x-labelW/2,ly=Math.max(8,H.y-H.h-labelH-11);
        ctx.save();pathShadow(ctx,'rgba(20,28,34,.18)',10,0,3);ctx.fillStyle='#ffdf6b';roundRect(ctx,lx,ly,labelW,labelH,labelH/2);ctx.fill();clearShadow(ctx);
        ctx.fillStyle='#222b31';ctx.font=`900 ${Math.max(12,H.h*.075)}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('나',H.x,ly+labelH/2);
        ctx.fillStyle='#ffdf6b';ctx.beginPath();ctx.moveTo(H.x-7,ly+labelH);ctx.lineTo(H.x+7,ly+labelH);ctx.lineTo(H.x,ly+labelH+10);ctx.closePath();ctx.fill();ctx.restore();
      }
      this.drawDoctor(t);
      if(success&&e>700){
        // cat-eye/scratch metaphor overlay: subdued, not cartoonish
        const a=clamp((e-700)/420,0,1);ctx.save();ctx.globalAlpha=a*.9;const sx=H.x-H.h*.42,sy=H.y-H.h*.76;pathShadow(ctx,'rgba(121,255,193,.35)',12);ctx.fillStyle='#b1ffd1';ctx.beginPath();ctx.ellipse(sx,sy,H.h*.035,H.h*.012,-.08,0,TAU);ctx.fill();ctx.beginPath();ctx.ellipse(sx+H.h*.11,sy,H.h*.035,H.h*.012,.08,0,TAU);ctx.fill();clearShadow(ctx);ctx.strokeStyle='rgba(214,66,79,.8)';ctx.lineWidth=Math.max(2,H.h*.012);ctx.lineCap='round';for(let i=0;i<3;i++){ctx.beginPath();ctx.moveTo(H.x+H.h*(.25+i*.06),H.y-H.h*.74);ctx.bezierCurveTo(H.x+H.h*(.18+i*.06),H.y-H.h*.54,H.x+H.h*(.31+i*.06),H.y-H.h*.38,H.x+H.h*(.24+i*.06),H.y-H.h*.18);ctx.stroke();}ctx.restore();
      }
      if(success&&e>880){const bw=Math.min(w*(this.isPortrait?.78:.36),410),bh=56,bx=clamp(H.x-bw*.72,12,w-bw-12),by=Math.max(12,H.y-H.h-70);ctx.fillStyle='rgba(23,30,35,.93)';roundRect(ctx,bx,by,bw,bh,10);ctx.fill();ctx.fillStyle='#fff';ctx.font=`700 ${Math.max(11,Math.min(16,w*.015))}px system-ui`;ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('У меня кошки на душе скребут…',bx+bw/2,by+bh/2);}
      drawVignette(ctx,w,h,.18);drawFilmGrain(ctx,w,h,82,.023);
    }
  }
  function ctxSave(ctx,fn){ctx.save();try{fn();}finally{ctx.restore();}}

  const scenes={
    fr:new FrenchScene($('#frCanvas'),$('#frStageStatus')),
    ru:new RussianScene($('#ruCanvas'),$('#ruStageStatus'))
  };

  // Static preview canvases use the same renderer, so the selection screen matches the actual game.
  function renderPreview(canvas,type){
    const ctx=canvas.getContext('2d');const parent=canvas.parentElement;const rect=parent.getBoundingClientRect();const dpr=Math.min(devicePixelRatio||1,2);const w=Math.max(320,rect.width),h=Math.max(190,rect.height);canvas.width=w*dpr;canvas.height=h*dpr;ctx.setTransform(dpr,0,0,dpr,0,0);canvas.style.width=w+'px';canvas.style.height=h+'px';
    if(type==='fr'){
      let g=ctx.createLinearGradient(0,0,0,h);g.addColorStop(0,'#18253a');g.addColorStop(.5,'#536b74');g.addColorStop(.51,'#213c30');g.addColorStop(1,'#0d1b15');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);drawTreeComponent(ctx,w*.18,h*.95,h*.75,12,true);drawTreeComponent(ctx,w*.83,h*.95,h*.72,18,true);drawBushComponent(ctx,w*.5,h*.98,h*.35,22,true);drawHuman(ctx,w*.45,h*.93,h*.5,{shirt:'#516f92',pants:'#252c35',hair:'#322821',skin:'#d8a27d'});drawHuman(ctx,w*.58,h*.93,h*.5,{shirt:'#ad5777',pants:'#34313f',hair:'#30241e',skin:'#e0ad88',female:true});drawUfo(ctx,w*.68,h*.24,w*.28,.18);drawVignette(ctx,w,h,.36);
    }else{
      ctx.fillStyle='#edf1f2';ctx.fillRect(0,0,w,h);ctx.fillStyle='#c1c9cd';ctx.fillRect(0,h*.64,w,h*.36);ctx.fillStyle='#435965';ctx.fillRect(w*.06,h*.26,w*.2,h*.66);ctx.fillStyle='#fff';ctx.font=`300 ${h*.19}px system-ui`;ctx.textAlign='center';ctx.fillText('+',w*.16,h*.58);for(let i=0;i<5;i++)drawClinicPerson(ctx,w*(.43+i*.11),h*.92,h*.46,{shirt:['#6e7e88','#756b88','#5d756f','#8d7169','#5c6d87'][i],female:i%2===1});drawVignette(ctx,w,h,.1);
    }
  }
  function previews(){renderPreview($('#frPreview'),'fr');renderPreview($('#ruPreview'),'ru');}
  requestAnimationFrame(previews);window.addEventListener('resize',()=>requestAnimationFrame(previews));

  const copy={
    fr:{phrase:'Avoir le cafard',literal:'“바퀴벌레를 가지고 있다.”',meaning:'우울하다 · 기분이 가라앉다',reason:'갑자기 사라진 사람을 떠올리며 며칠 뒤 남자가 우울하고 침울해진 장면입니다. 이처럼 기분이 가라앉은 상태에서 avoir le cafard를 사용할 수 있습니다.'},
    ru:{phrase:'Кошки на душе скребут',literal:'“고양이들이 영혼을 긁고 있다.”',meaning:'마음이 불안하고 심란하다',reason:'치과 치료 순서가 갑자기 바로 앞으로 다가오면서 주인공이 불안하고 마음이 편하지 않은 장면입니다. 이런 내면의 불편함을 이 관용구로 표현할 수 있습니다.'}
  };
  function showClear(lang){const d=copy[lang];$('#clearPhrase').textContent=d.phrase;$('#clearLiteral').textContent=d.literal;$('#clearMeaning').textContent=d.meaning;$('#clearReason').textContent=d.reason;$('#clearOverlay').classList.add('show');$('#clearOverlay').setAttribute('aria-hidden','false');}
  $('#clearNext').addEventListener('click',()=>{$('#clearOverlay').classList.remove('show');$('#clearOverlay').setAttribute('aria-hidden','true');state.roundIndex++;resetStrikes();state.locked=false;if(state.roundIndex>=2)showScreen('finish');else startCurrentRound();});

  // Entry form
  const form=$('#entryForm'),phone=$('#entryPhone'),status=$('#formStatus'),submit=$('#submitEntry');
  phone.addEventListener('input',()=>{const digits=phone.value.replace(/\D/g,'').slice(0,11);if(digits.length<=3)phone.value=digits;else if(digits.length<=7)phone.value=`${digits.slice(0,3)}-${digits.slice(3)}`;else phone.value=`${digits.slice(0,3)}-${digits.slice(3,7)}-${digits.slice(7)}`;});
  form.addEventListener('submit',async e=>{
    e.preventDefault();status.className='form-status';status.textContent='';
    const name=$('#entryName').value.trim(),raw=phone.value.replace(/\D/g,''),consent=$('#entryConsent').checked;
    if(name.length<2)return formError('이름을 2자 이상 입력해 주세요.');
    if(!/^01[016789]\d{7,8}$/.test(raw))return formError('전화번호를 정확히 입력해 주세요.');
    if(!consent)return formError('응모하려면 개인정보 수집·이용 동의가 필요합니다.');
    if(localStorage.getItem('sawlib_entry_sent')==='1')return formError('이 기기에서는 이미 응모가 완료되었습니다.');
    const base=(window.SAWLIB_CONFIG?.supabaseUrl||'').replace(/\/$/,'');
    const key=(window.SAWLIB_CONFIG?.supabaseKey||'').trim();
    if(!base||!key)return formError('응모 저장 설정을 불러오지 못했습니다.');
    submit.disabled=true;submit.textContent='저장 중…';
    const payload={name,phone:raw,consent:true,submission_id:state.submissionId,event:'SAWLIB TALKS 문화번역 게임',user_agent:navigator.userAgent.slice(0,500)};
    try{
      const res=await fetch(`${base}/rest/v1/entries`,{
        method:'POST',
        headers:{'Content-Type':'application/json','apikey':key,'Prefer':'return=minimal'},
        body:JSON.stringify(payload)
      });
      if(!res.ok){
        if(res.status===409)throw new Error('duplicate');
        throw new Error(`HTTP ${res.status}`);
      }
      localStorage.setItem('sawlib_entry_sent','1');
      status.className='form-status ok';status.textContent='응모가 저장되었습니다. 감사합니다!';
      form.querySelectorAll('input,button').forEach(x=>x.disabled=true);
    }catch(err){
      if(err.message==='duplicate')formError('이 기기에서는 이미 응모한 기록이 있습니다.');
      else formError('저장에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      submit.disabled=false;submit.textContent='응모하기';
    }
  });
  function formError(msg){status.className='form-status err';status.textContent=msg;}

  showScreen('intro');
})();
