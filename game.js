(() => {
'use strict';
const $ = id => document.getElementById(id);
const canvas = $('world');
const ctx = canvas.getContext('2d', {alpha:false});
const STORAGE = 'starward-save-v1';
const MAX_WAVE = 8;
const WAVE_LENGTH = 25;
const WORLD_X = 1180;
const WORLD_Y = 880;
const TAU = Math.PI * 2;
const colors = {mint:'#8bf4d6', gold:'#f8ca84', coral:'#ff7c86', purple:'#a4a4ff', blue:'#71c9ec'};
const hangarDefs = [
  {key:'gun', icon:'⌁', name:'Railgun Array', desc:'+12% starting weapon damage / rank', base:34, max:5},
  {key:'core', icon:'✳', name:'Beacon Plating', desc:'+20 beacon integrity / rank', base:26, max:5},
  {key:'hull', icon:'◇', name:'Reinforced Hull', desc:'+15 pilot integrity / rank', base:26, max:5},
  {key:'engine', icon:'➤', name:'Thruster Tuning', desc:'+7% ship speed / rank', base:30, max:5}
];
const upgradeDefs = [
  {id:'rapid',icon:'⌁',name:'Rapid Coils',desc:'Fire 19% faster.',type:'OFFENSE',apply:g=>g.mods.fireRate*=.81},
  {id:'damage',icon:'✣',name:'Hardpoint',desc:'+35% shot damage.',type:'OFFENSE',apply:g=>g.mods.damage*=1.35},
  {id:'multishot',icon:'⁂',name:'Twin Barrels',desc:'Add a spread projectile.',type:'OFFENSE',apply:g=>g.mods.shots=Math.min(5,g.mods.shots+1)},
  {id:'pierce',icon:'➶',name:'Phase Rounds',desc:'Shots pierce an extra enemy.',type:'OFFENSE',apply:g=>g.mods.pierce+=1},
  {id:'range',icon:'⌾',name:'Targeting Dish',desc:'+90 weapon range and faster bolts.',type:'UTILITY',apply:g=>{g.mods.range+=90;g.mods.bulletSpeed*=1.12;}},
  {id:'thruster',icon:'➤',name:'Slipstream',desc:'+17% movement speed.',type:'MOBILITY',apply:g=>g.mods.speed*=1.17},
  {id:'dash',icon:'↗',name:'Blink Module',desc:'Dash recharges 25% faster.',type:'MOBILITY',apply:g=>g.mods.dashRate*=.75},
  {id:'pulse',icon:'◎',name:'EMP Resonator',desc:'+35% pulse radius and damage.',type:'UTILITY',apply:g=>{g.mods.pulseRadius*=1.35;g.mods.pulseDamage*=1.35;}},
  {id:'magnet',icon:'✦',name:'Collector Field',desc:'Collect energy from farther away.',type:'UTILITY',apply:g=>g.mods.pickupRadius+=72},
  {id:'repair',icon:'✚',name:'Emergency Weld',desc:'Heal pilot for 35 and beacon for 25.',type:'SURVIVAL',apply:g=>{g.player.hp=Math.min(g.player.maxHp,g.player.hp+35);g.core.hp=Math.min(g.core.maxHp,g.core.hp+25);}},
  {id:'armor',icon:'⬡',name:'Reactive Armor',desc:'+30 maximum pilot integrity; heal 30.',type:'SURVIVAL',apply:g=>{g.player.maxHp+=30;g.player.hp=Math.min(g.player.maxHp,g.player.hp+30);}}
];
const safeNumber = (n, fallback=0) => Number.isFinite(Number(n)) ? Math.max(0,Math.floor(Number(n))) : fallback;
let saved;
try {saved = JSON.parse(localStorage.getItem(STORAGE) || '{}') || {};} catch {saved={};}
saved = {best:safeNumber(saved.best),runs:safeNumber(saved.runs),bank:safeNumber(saved.bank),muted:!!saved.muted,perks:Object.fromEntries(hangarDefs.map(d=>[d.key,Math.min(d.max,safeNumber(saved.perks?.[d.key]))]))};
function persist(){try{localStorage.setItem(STORAGE,JSON.stringify(saved));}catch{ /* private browsing may block storage */ }}
let mode = 'menu';
let game = null;
let viewW=0, viewH=0, dpr=1, camX=0, camY=0, animTime=0, shake=0;
let lastTime=performance.now();
const keys = new Set();
const joystick = {active:false,id:null,x:0,y:0};
let audio=null;
let toastTimer=0;
const rand = (min,max) => min + Math.random()*(max-min);
const clamp = (x,min,max) => Math.max(min,Math.min(max,x));
const dist = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
const normalize = (x,y) => {const l=Math.hypot(x,y)||1;return {x:x/l,y:y/l};};
const price = d => Math.floor(d.base * Math.pow(1.65,saved.perks[d.key]));
function showToast(s){const t=$('toast');t.textContent=s;t.classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove('visible'),1800);}
function sound(type){
  if(saved.muted) return;
  try{
    audio ||= new (window.AudioContext || window.webkitAudioContext)();
    if(audio.state==='suspended') audio.resume();
    const at=audio.currentTime;
    const osc=audio.createOscillator(), gain=audio.createGain();
    const spec={shoot:[580,260,.075,.033,'triangle'],hit:[130,70,.11,.05,'sawtooth'],pickup:[770,1030,.14,.05,'sine'],dash:[220,680,.19,.05,'sawtooth'],pulse:[110,45,.35,.12,'sawtooth'],upgrade:[450,970,.29,.075,'sine'],hurt:[240,65,.24,.09,'triangle'],end:[360,90,.52,.09,'triangle'],win:[370,830,.65,.085,'sine']}[type];
    if(!spec)return;
    osc.type=spec[4];osc.frequency.setValueAtTime(spec[0],at);osc.frequency.exponentialRampToValueAtTime(spec[1],at+spec[2]);
    gain.gain.setValueAtTime(Math.max(.0001,spec[3]),at);gain.gain.exponentialRampToValueAtTime(.0001,at+spec[2]);
    osc.connect(gain);gain.connect(audio.destination);osc.start(at);osc.stop(at+spec[2]+.01);
  }catch{ /* audio is optional */ }
}
function showScreens(active){for(const key of ['start','level','pause','end']) $(key+'Panel').classList.toggle('hidden',key!==active);$('hud').classList.toggle('hidden',active==='start');$('touchControls').classList.toggle('hidden',!(active===null && isTouch()));}
function isTouch(){return matchMedia('(pointer:coarse)').matches || ('ontouchstart' in window && matchMedia('(max-width:900px)').matches);}
function refreshMenu(){
  $('bestScore').textContent=String(saved.best).padStart(6,'0');$('totalRuns').textContent=String(saved.runs).padStart(2,'0');$('bankBalance').textContent=saved.bank;
  $('soundButton').textContent=saved.muted?'◖ SOUND OFF':'◖ SOUND ON';
  const list=$('hangarUpgrades');list.replaceChildren();
  for(const d of hangarDefs){
    const rank=saved.perks[d.key], maxed=rank===d.max, cost=price(d);
    const btn=document.createElement('button');btn.className='hangar-item';btn.disabled=maxed||saved.bank<cost;
    btn.innerHTML=`<span class="item-icon">${d.icon}</span><span class="item-content"><strong>${d.name} <small>LVL ${rank}/${d.max}</small></strong><small>${d.desc}</small></span><span class="item-price">${maxed?'MAX':`✦ ${cost}`}</span>`;
    btn.addEventListener('click',()=>{if(mode!=='menu'||saved.perks[d.key]===d.max||saved.bank<price(d))return;saved.bank-=price(d);saved.perks[d.key]++;persist();refreshMenu();sound('upgrade');showToast(d.name.toUpperCase()+' UPGRADED');});
    list.append(btn);
  }
}
function createGame(){
  const p={x:0,y:160,r:16,maxHp:100+15*saved.perks.hull,hp:100+15*saved.perks.hull,speed:230*(1+.07*saved.perks.engine),angle:-Math.PI/2,inv:0,gun:0,dash:0,dashing:0,pulse:0,energy:0,level:1,threshold:8};
  return {player:p,core:{x:0,y:0,r:47,maxHp:130+20*saved.perks.core,hp:130+20*saved.perks.core},wave:1,waveTime:0,time:0,spawn:1.4,score:0,kills:0,salvage:0,enemyId:0,bossAlive:0,enemy:[],bullets:[],hostile:[],orbs:[],particles:[],texts:[],rings:[],mods:{damage:24*(1+.12*saved.perks.gun),fireRate:.31,shots:1,pierce:0,range:475,bulletSpeed:625,speed:1,dashRate:1,pulseRadius:1,pulseDamage:1,pickupRadius:125},upgrades:{},finished:false};
}
function start(){
  game=createGame();mode='playing';camX=0;camY=0;shake=0;keys.clear();resetJoystick();showScreens(null);sound('upgrade');showToast('DEFEND THE BEACON');updateHUD();
}
function damageCore(amount){if(!game||mode!=='playing')return;game.core.hp=Math.max(0,game.core.hp-amount);shake=Math.max(shake,5);sound('hurt');if(game.core.hp<=0) finish(false);}
function damagePlayer(amount,x,y){const p=game.player;if(p.inv>0||p.dashing>0)return;p.hp=Math.max(0,p.hp-amount);p.inv=.75;shake=Math.max(shake,8);burst(p.x,p.y,colors.coral,13,155);sound('hurt');if(x!==undefined){const v=normalize(p.x-x,p.y-y);p.x=clamp(p.x+v.x*22,-WORLD_X,WORLD_X);p.y=clamp(p.y+v.y*22,-WORLD_Y,WORLD_Y);}if(p.hp<=0)finish(false);}
function spawnEnemy(kind,x,y){
  const specs={drone:{hp:24,speed:72,r:14,damage:9,color:colors.coral,points:15},wisp:{hp:15,speed:126,r:10,damage:7,color:colors.gold,points:17},brute:{hp:96,speed:49,r:23,damage:17,color:'#ee8177',points:31},sniper:{hp:38,speed:65,r:15,damage:9,color:colors.blue,points:23},boss:{hp:410+(game.wave===8?330:0),speed:34,r:46,damage:24,color:colors.purple,points:450}};
  const s=specs[kind];if(!s)return;
  const e={id:++game.enemyId,kind,x,y,hp:s.hp,maxHp:s.hp,speed:s.speed*(1+(game.wave-1)*.055),r:s.r,damage:s.damage,color:s.color,points:s.points,cool:rand(.3,1.2),attack:rand(.2,1.1),phase:rand(0,TAU),hit:0};
  game.enemy.push(e);if(kind==='boss'){game.bossAlive++;showToast(game.wave===8?'THE HARBINGER HAS ARRIVED':'ELITE SIGNAL DETECTED');sound('pulse');}
}
function spawnAtEdge(kind){
  const a=rand(0,TAU),distanceFrom=Math.max(viewW,viewH)*.72+85;
  let x=clamp(game.player.x+Math.cos(a)*distanceFrom,-WORLD_X+35,WORLD_X-35),y=clamp(game.player.y+Math.sin(a)*distanceFrom,-WORLD_Y+35,WORLD_Y-35);
  if(Math.hypot(x-game.player.x,y-game.player.y)<320){x=clamp(x+Math.cos(a)*260,-WORLD_X+30,WORLD_X-30);y=clamp(y+Math.sin(a)*260,-WORLD_Y+30,WORLD_Y-30);}
  spawnEnemy(kind,x,y);
}
function newWave(){
  game.wave++;game.waveTime=0;game.spawn=.3;game.player.hp=Math.min(game.player.maxHp,game.player.hp+12);game.core.hp=Math.min(game.core.maxHp,game.core.hp+9);
  burst(0,0,colors.mint,30,210);game.score+=game.wave*25;showToast('WAVE '+String(game.wave).padStart(2,'0')+' INBOUND');sound('upgrade');
  if(game.wave===4||game.wave===8)spawnAtEdge('boss');
}
function shoot(){
  const g=game,p=g.player,m=g.mods;let best=null,bestD=m.range*m.range;
  for(const e of g.enemy){const dx=e.x-p.x,dy=e.y-p.y,dd=dx*dx+dy*dy;if(dd<bestD){best=e;bestD=dd;}}
  if(!best)return;
  p.angle=Math.atan2(best.y-p.y,best.x-p.x);p.gun=m.fireRate;
  for(let i=0;i<m.shots;i++){
    const angle=p.angle+(i-(m.shots-1)/2)*.16;
    g.bullets.push({x:p.x+Math.cos(angle)*19,y:p.y+Math.sin(angle)*19,vx:Math.cos(angle)*m.bulletSpeed,vy:Math.sin(angle)*m.bulletSpeed,r:4,life:1.35,damage:m.damage,pierce:m.pierce,hitIds:new Set()});
  }
  burst(p.x+Math.cos(p.angle)*22,p.y+Math.sin(p.angle)*22,colors.mint,3,53);
  sound('shoot');
}
function burst(x,y,color,count=8,speed=120){
  if(!game)return;
  for(let i=0;i<count&&game.particles.length<650;i++){const a=rand(0,TAU),v=rand(speed*.16,speed);game.particles.push({x,y,vx:Math.cos(a)*v,vy:Math.sin(a)*v,life:rand(.18,.65),max:0,size:rand(1.4,4),color});}
}
function floating(x,y,value,color){game.texts.push({x,y,t:0,value,color});}
function killEnemy(e){
  const g=game;g.score+=e.points;g.kills++;if(e.kind==='boss')g.bossAlive--;
  const count=e.kind==='boss'?12:e.kind==='brute'?4:Math.random()<.7?2:1;
  for(let i=0;i<count;i++)g.orbs.push({x:e.x+rand(-18,18),y:e.y+rand(-18,18),vx:rand(-30,30),vy:rand(-30,30),kind:'xp',value:1,r:5,life:20});
  if(Math.random()<(e.kind==='boss'?1:.22))g.orbs.push({x:e.x+rand(-10,10),y:e.y+rand(-10,10),vx:0,vy:0,kind:'scrap',value:e.kind==='boss'?25:2,r:6,life:20});
  burst(e.x,e.y,e.color,e.kind==='boss'?72:16,e.kind==='boss'?300:150);floating(e.x,e.y,'+'+e.points,e.color);
  if(e.kind==='boss'){shake=18;sound('pulse');}
}
function inflict(e,amount){e.hp-=amount;e.hit=.14;if(e.hp<=0){killEnemy(e);e.hp=-99999;}else burst(e.x,e.y,e.color,3,52);}
function tryDash(){
  if(mode!=='playing'||game.player.dash>0)return;
  const p=game.player;let x=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+joystick.x;
  let y=(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0)+joystick.y;
  if(Math.hypot(x,y)<.1){x=Math.cos(p.angle);y=Math.sin(p.angle);}
  const n=normalize(x,y);p.dx=n.x;p.dy=n.y;p.dashing=.22;p.dash=3.2*game.mods.dashRate;shake=5;sound('dash');burst(p.x,p.y,colors.mint,15,180);
}
function tryPulse(){
  if(mode!=='playing'||game.player.pulse>0)return;
  const g=game,p=g.player,r=155*g.mods.pulseRadius;p.pulse=9;g.rings.push({x:p.x,y:p.y,r:0,max:r,life:.44,total:.44,color:colors.purple});sound('pulse');shake=7;
  for(const e of g.enemy){const d=dist(p,e);if(d<r+e.r){inflict(e,58*g.mods.pulseDamage);if(e.hp>0){const n=normalize(e.x-p.x,e.y-p.y);e.x+=n.x*52;e.y+=n.y*52;}}}
  g.enemy=g.enemy.filter(e=>e.hp>0);
  for(const b of g.hostile){if(dist(p,b)<r)b.life=0;}
  burst(p.x,p.y,colors.purple,38,280);
}
function levelUp(){
  if(mode!=='playing')return;
  mode='level';showScreens('level');const list=$('upgradeChoices');list.replaceChildren();
  const pool=[...upgradeDefs];
  for(let i=0;i<3;i++){
    const index=Math.floor(Math.random()*pool.length),d=pool.splice(index,1)[0];
    const button=document.createElement('button');button.className='upgrade-card';
    button.innerHTML=`<span class="upgrade-symbol">${d.icon}</span><span class="upgrade-type">${d.type}</span><strong>${d.name}</strong><p>${d.desc}</p>`;
    button.addEventListener('click',()=>{if(mode!=='level')return;d.apply(game);game.upgrades[d.id]=(game.upgrades[d.id]||0)+1;mode='playing';showScreens(null);sound('upgrade');showToast(d.name.toUpperCase()+' ONLINE');});
    list.append(button);
  }
  sound('upgrade');
}
function collectOrb(o){
  if(o.kind==='scrap'){game.salvage+=o.value;floating(o.x,o.y,'✦ '+o.value,colors.gold);sound('pickup');return;}
  const p=game.player;p.energy+=o.value;
  if(p.energy>=p.threshold){p.energy-=p.threshold;p.level++;p.threshold=Math.round(8*Math.pow(1.32,p.level-1));levelUp();}
  if(Math.random()<.25)sound('pickup');
}
function update(dt){
  const g=game,p=g.player,m=g.mods;if(mode!=='playing')return;
  g.time+=dt;g.waveTime+=dt;p.inv=Math.max(0,p.inv-dt);p.gun-=dt;p.dash=Math.max(0,p.dash-dt);p.pulse=Math.max(0,p.pulse-dt);
  if(p.dashing>0){p.dashing=Math.max(0,p.dashing-dt);p.x+=p.dx*850*dt;p.y+=p.dy*850*dt;burst(p.x,p.y,colors.mint,2,30);}
  else{
    const dx=(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-(keys.has('KeyA')||keys.has('ArrowLeft')?1:0)+joystick.x;
    const dy=(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-(keys.has('KeyW')||keys.has('ArrowUp')?1:0)+joystick.y;
    const v=normalize(dx,dy),mag=Math.min(1,Math.hypot(dx,dy));p.x+=v.x*p.speed*m.speed*mag*dt;p.y+=v.y*p.speed*m.speed*mag*dt;
  }
  p.x=clamp(p.x,-WORLD_X+18,WORLD_X-18);p.y=clamp(p.y,-WORLD_Y+18,WORLD_Y-18);
  if(p.gun<=0)shoot();
  g.spawn-=dt;
  if(g.spawn<=0&&g.enemy.length<175){
    const w=g.wave,kind=Math.random()<Math.min(.25,.04+w*.027)?'brute':Math.random()<Math.min(.42,w*.052)?'wisp':Math.random()<Math.min(.32,w*.04)?'sniper':'drone';
    spawnAtEdge(kind);if(w>=5&&Math.random()<.24)spawnAtEdge('drone');
    g.spawn=Math.max(.33,1.3-w*.12)*rand(.83,1.24);
  }
  if(g.waveTime>=WAVE_LENGTH){if(g.wave<MAX_WAVE)newWave();else if(g.bossAlive===0){finish(true);return;}}
  for(const e of g.enemy){
    if(e.hp<=0)continue;
    e.cool-=dt;e.attack-=dt;e.hit=Math.max(0,e.hit-dt);e.phase+=dt;
    const toPilot=dist(e,p),target=toPilot<290?p:g.core;
    const v=normalize(target.x-e.x,target.y-e.y),dd=dist(e,target);
    if(e.kind==='sniper'||e.kind==='boss'){
      if(dd>220){e.x+=v.x*e.speed*dt;e.y+=v.y*e.speed*dt;}
      if(e.cool<=0&&dd<650){
        const ang=Math.atan2(target.y-e.y,target.x-e.x), shots=e.kind==='boss'?5:1;
        for(let i=0;i<shots;i++){const a=ang+(i-(shots-1)/2)*.22;g.hostile.push({x:e.x,y:e.y,vx:Math.cos(a)*(e.kind==='boss'?225:265),vy:Math.sin(a)*(e.kind==='boss'?225:265),r:e.kind==='boss'?7:5,damage:e.damage,life:3.4});}
        e.cool=e.kind==='boss'?1.7:2.05;
      }
    }else if(dd>e.r+target.r*.63){e.x+=v.x*e.speed*dt;e.y+=v.y*e.speed*dt;}
    if(toPilot<e.r+p.r*.8 && e.attack<=0){damagePlayer(e.damage,e.x,e.y);e.attack=1.15;}
    if(dist(e,g.core)<e.r+g.core.r*.72 && e.attack<=0){damageCore(e.damage);e.attack=1.3;}
    if(mode!=='playing')return;
  }
  for(const b of g.bullets){b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;
    for(const e of g.enemy){if(e.hp<=0||b.hitIds.has(e.id)||Math.hypot(e.x-b.x,e.y-b.y)>e.r+b.r)continue;
      inflict(e,b.damage);b.hitIds.add(e.id);if(b.pierce--<=0){b.life=0;break;}
    }
  }
  g.bullets=g.bullets.filter(b=>b.life>0);g.enemy=g.enemy.filter(e=>e.hp>0);
  for(const b of g.hostile){b.x+=b.vx*dt;b.y+=b.vy*dt;b.life-=dt;
    if(Math.hypot(b.x-p.x,b.y-p.y)<p.r+b.r){damagePlayer(b.damage,b.x,b.y);b.life=0;}
    else if(Math.hypot(b.x-g.core.x,b.y-g.core.y)<g.core.r*.65+b.r){damageCore(b.damage);b.life=0;}
    if(mode!=='playing')return;
  }
  g.hostile=g.hostile.filter(b=>b.life>0);
  for(const o of g.orbs){o.life-=dt;o.x+=o.vx*dt;o.y+=o.vy*dt;o.vx*=.94;o.vy*=.94;
    const dd=dist(o,p);if(dd<m.pickupRadius){const speed=dd<38?800:500;const n=normalize(p.x-o.x,p.y-o.y);o.x+=n.x*speed*dt;o.y+=n.y*speed*dt;}
    if(dd<22){o.life=0;collectOrb(o);}
  }
  g.orbs=g.orbs.filter(o=>o.life>0);
  for(const q of g.particles){if(!q.max)q.max=q.life;q.x+=q.vx*dt;q.y+=q.vy*dt;q.life-=dt;q.vx*=.97;q.vy*=.97;}
  g.particles=g.particles.filter(q=>q.life>0);
  for(const t of g.texts){t.t+=dt;t.y-=32*dt;}g.texts=g.texts.filter(t=>t.t<.75);
  for(const r of g.rings){r.life-=dt;r.r=r.max*(1-r.life/r.total);}g.rings=g.rings.filter(r=>r.life>0);
}
function finish(won,abandoned=false){
  if(!game||game.finished)return;
  game.finished=true;mode='end';keys.clear();resetJoystick();saved.runs++;
  const earned=Math.max(5,Math.floor(game.score/54)+game.wave*7+game.salvage);
  const reward=abandoned?Math.floor(earned*.5):earned;
  saved.bank+=reward;saved.best=Math.max(saved.best,game.score);persist();
  $('endEyebrow').textContent=won?'MISSION ACCOMPLISHED':abandoned?'MISSION ABORTED':'TRANSMISSION LOST';
  $('endTitle').innerHTML=won?'BEACON SECURED<span class="accent">.</span>':abandoned?'RUN ABORTED<span class="accent">.</span>':'SIGNAL LOST<span class="accent">.</span>';
  $('endSubtitle').textContent=won?'You held the light. The sector is safe — for now.':abandoned?'Your ship returned with half its salvage.':'The darkness caught up. Rebuild and fly again.';
  $('finalScore').textContent=game.score.toLocaleString();$('finalWave').textContent=game.wave+' / 8';$('finalSalvage').textContent='+'+reward;
  showScreens('end');sound(won?'win':'end');
}
function updateHUD(){if(!game)return;const g=game,p=g.player;
  $('hpText').textContent=Math.ceil(p.hp)+' / '+p.maxHp;$('hpBar').style.width=(100*p.hp/p.maxHp)+'%';
  $('coreText').textContent=Math.ceil(g.core.hp)+' / '+g.core.maxHp;$('coreBar').style.width=(100*g.core.hp/g.core.maxHp)+'%';
  $('waveText').textContent='WAVE '+String(g.wave).padStart(2,'0')+' / 08';$('waveBar').style.width=clamp(100*g.waveTime/WAVE_LENGTH,0,100)+'%';
  $('scoreText').textContent=String(g.score).padStart(6,'0');$('enemyText').textContent=String(g.enemy.length).padStart(2,'0');$('levelText').textContent='LVL '+String(p.level).padStart(2,'0');$('xpBar').style.width=clamp(100*p.energy/p.threshold,0,100)+'%';
  $('dashReady').textContent=p.dash>0?p.dash.toFixed(1)+'s':'READY';$('pulseReady').textContent=p.pulse>0?p.pulse.toFixed(1)+'s':'READY';
  $('dashTouchCooldown').textContent=p.dash>0?Math.ceil(p.dash)+'s':'';$('pulseTouchCooldown').textContent=p.pulse>0?Math.ceil(p.pulse)+'s':'';
  $('dashTouch').classList.toggle('cooling',p.dash>0);$('pulseTouch').classList.toggle('cooling',p.pulse>0);
  const d=dist(p,g.core);$('beaconPointer').classList.toggle('hidden',d<Math.min(viewW,viewH)*.42);$('beaconDistance').textContent=Math.round(d)+'m';
}
function resize(){viewW=window.innerWidth;viewH=window.innerHeight;dpr=Math.min(2,window.devicePixelRatio||1);canvas.width=Math.round(viewW*dpr);canvas.height=Math.round(viewH*dpr);canvas.style.width=viewW+'px';canvas.style.height=viewH+'px';}
window.addEventListener('resize',resize);resize();
const stars=Array.from({length:420},()=>({x:rand(-WORLD_X-150,WORLD_X+150),y:rand(-WORLD_Y-150,WORLD_Y+150),r:rand(.3,2),phase:rand(0,TAU),bright:rand(.2,.85)}));
const debris=Array.from({length:84},()=>({x:rand(-WORLD_X+45,WORLD_X-45),y:rand(-WORLD_Y+45,WORLD_Y-45),r:rand(8,28),phase:rand(0,TAU)})).filter(d=>Math.hypot(d.x,d.y)>180);
function ring(x,y,r,color='#8bf4d6',alpha=.45){ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.strokeStyle=color;ctx.globalAlpha=alpha;ctx.stroke();ctx.globalAlpha=1;}
function polygon(x,y,r,n,rotation=0){ctx.beginPath();for(let i=0;i<n;i++){const a=rotation+i*TAU/n;const px=x+Math.cos(a)*r,py=y+Math.sin(a)*r;if(i===0)ctx.moveTo(px,py);else ctx.lineTo(px,py);}ctx.closePath();}
function drawBackground(){
  const gradient=ctx.createRadialGradient(viewW*.56,viewH*.42,0,viewW*.5,viewH*.5,Math.max(viewW,viewH)*.85);gradient.addColorStop(0,'#173147');gradient.addColorStop(.48,'#0b192a');gradient.addColorStop(1,'#070c17');ctx.fillStyle=gradient;ctx.fillRect(0,0,viewW,viewH);
  ctx.save();ctx.translate(-camX,-camY);
  ctx.strokeStyle='#9ad3ce0c';ctx.lineWidth=1;ctx.beginPath();
  for(let x=Math.floor((camX)/100)*100;x<camX+viewW+100;x+=100){ctx.moveTo(x,camY);ctx.lineTo(x,camY+viewH);}
  for(let y=Math.floor((camY)/100)*100;y<camY+viewH+100;y+=100){ctx.moveTo(camX,y);ctx.lineTo(camX+viewW,y);}
  ctx.stroke();
  ctx.lineWidth=3;ctx.strokeStyle='#96f2e038';ctx.strokeRect(-WORLD_X,-WORLD_Y,WORLD_X*2,WORLD_Y*2);
  for(const s of stars){if(s.x<camX-5||s.x>camX+viewW+5||s.y<camY-5||s.y>camY+viewH+5)continue;ctx.globalAlpha=s.bright*(.76+.24*Math.sin(animTime*1.4+s.phase));ctx.fillStyle='#c2e8e9';ctx.beginPath();ctx.arc(s.x,s.y,s.r,0,TAU);ctx.fill();}ctx.globalAlpha=1;
  for(const d of debris){if(d.x<camX-40||d.x>camX+viewW+40||d.y<camY-40||d.y>camY+viewH+40)continue;ctx.save();ctx.translate(d.x,d.y);ctx.rotate(d.phase);ctx.strokeStyle='#466d7762';ctx.fillStyle='#132c3b88';ctx.lineWidth=1.3;polygon(0,0,d.r,5,.3);ctx.fill();ctx.stroke();ctx.beginPath();ctx.moveTo(-d.r*.65,-d.r*.12);ctx.lineTo(d.r*.37,d.r*.3);ctx.stroke();ctx.restore();}
  ctx.restore();
}
function drawBeacon(core){
  const t=animTime;ctx.save();ctx.translate(core.x,core.y);
  const halo=ctx.createRadialGradient(0,0,12,0,0,225);halo.addColorStop(0,'#8bf4d64b');halo.addColorStop(.34,'#51e5cc16');halo.addColorStop(1,'#52ead000');ctx.fillStyle=halo;ctx.beginPath();ctx.arc(0,0,225,0,TAU);ctx.fill();
  ring(0,0,70+Math.sin(t*1.8)*4,colors.mint,.14);ring(0,0,101,colors.mint,.11);
  ctx.save();ctx.rotate(t*.17);ctx.strokeStyle='#65b7ba66';ctx.lineWidth=2;ctx.setLineDash([20,21]);ctx.beginPath();ctx.arc(0,0,79,0,TAU);ctx.stroke();ctx.setLineDash([]);ctx.restore();
  ctx.fillStyle='#091828';ctx.strokeStyle='#70d9c8';ctx.lineWidth=3;polygon(0,0,core.r,8,Math.PI/8);ctx.fill();ctx.stroke();
  ctx.fillStyle='#1d5760';polygon(0,0,31,8,Math.PI/8);ctx.fill();
  ctx.save();ctx.rotate(t*.65);ctx.fillStyle='#8bf4d6';polygon(0,0,21,4,Math.PI/4);ctx.fill();ctx.restore();
  ctx.fillStyle='#f4ffe6';ctx.beginPath();ctx.arc(0,0,8+Math.sin(t*4)*1.7,0,TAU);ctx.fill();
  for(let i=0;i<4;i++){const a=i*Math.PI/2;ctx.save();ctx.rotate(a);ctx.fillStyle='#8bf4d6';ctx.fillRect(42,-3,17,6);ctx.restore();}
  ctx.strokeStyle='#f8ca84';ctx.lineWidth=3;ctx.beginPath();ctx.arc(0,0,62,-Math.PI/2,-Math.PI/2+TAU*core.hp/core.maxHp);ctx.stroke();ctx.restore();
}
function drawShip(p){
  ctx.save();ctx.translate(p.x,p.y);ctx.rotate(p.angle);
  if(p.inv>0&&Math.floor(animTime*14)%2===0)ctx.globalAlpha=.54;
  ctx.shadowBlur=p.dashing>0?35:14;ctx.shadowColor=colors.mint;
  ctx.fillStyle='#162f42';ctx.strokeStyle='#8bf4d6';ctx.lineWidth=2.7;
  ctx.beginPath();ctx.moveTo(22,0);ctx.lineTo(-13,-16);ctx.lineTo(-7,0);ctx.lineTo(-13,16);ctx.closePath();ctx.fill();ctx.stroke();
  ctx.shadowBlur=0;ctx.fillStyle='#e4fff3';polygon(2,0,6,4,Math.PI/4);ctx.fill();
  ctx.fillStyle='#8bf4d6';ctx.fillRect(-15,-11,7,5);ctx.fillRect(-15,6,7,5);
  ctx.globalAlpha=.8;const flame=7+Math.sin(animTime*36)*5+(p.dashing>0?15:0);ctx.fillStyle=p.dashing>0?'#e6fff8':'#75daee';ctx.beginPath();ctx.moveTo(-12,-7);ctx.lineTo(-12-flame,0);ctx.lineTo(-12,7);ctx.fill();ctx.restore();
}
function drawEnemy(e){
  ctx.save();ctx.translate(e.x,e.y);const spin=e.phase*(e.kind==='wisp'?2:.4);ctx.rotate(spin);
  ctx.shadowBlur=e.kind==='boss'?24:10;ctx.shadowColor=e.color;ctx.lineWidth=e.kind==='boss'?4:2;ctx.strokeStyle=e.hit>0?'#fff':e.color;ctx.fillStyle=e.hit>0?'#f7ffff':'#182334';
  if(e.kind==='wisp'){polygon(0,0,e.r,4,Math.PI/4);}else if(e.kind==='brute'){polygon(0,0,e.r,6,Math.PI/6);}else if(e.kind==='boss'){polygon(0,0,e.r,8,Math.PI/8);}else if(e.kind==='sniper'){polygon(0,0,e.r,4,Math.PI/4);}else{polygon(0,0,e.r,3,-Math.PI/2);}
  ctx.fill();ctx.stroke();ctx.shadowBlur=0;ctx.fillStyle=e.color;
  if(e.kind==='boss'){polygon(0,0,e.r*.52,8,-spin);ctx.fill();ring(0,0,e.r*.74,'#e6d8ff',.7);}else{ctx.beginPath();ctx.arc(0,0,e.kind==='brute'?7:4,0,TAU);ctx.fill();}
  ctx.restore();
  if(e.kind==='brute'||e.kind==='boss'){ctx.fillStyle='#061521';ctx.fillRect(e.x-e.r,e.y-e.r-14,e.r*2,4);ctx.fillStyle=e.color;ctx.fillRect(e.x-e.r,e.y-e.r-14,e.r*2*clamp(e.hp/e.maxHp,0,1),4);}
}
function drawObjects(g){
  drawBeacon(g.core);
  for(const o of g.orbs){ctx.save();ctx.translate(o.x,o.y);ctx.rotate(animTime*2);ctx.shadowBlur=16;ctx.shadowColor=o.kind==='xp'?colors.purple:colors.gold;ctx.fillStyle=o.kind==='xp'?colors.purple:colors.gold;polygon(0,0,o.r,4,Math.PI/4);ctx.fill();ctx.restore();}
  for(const e of g.enemy)drawEnemy(e);
  for(const b of g.hostile){ctx.strokeStyle='#f48b7f';ctx.lineWidth=b.r*1.7;ctx.shadowBlur=13;ctx.shadowColor=colors.coral;ctx.beginPath();ctx.moveTo(b.x-b.vx*.025,b.y-b.vy*.025);ctx.lineTo(b.x,b.y);ctx.stroke();}ctx.shadowBlur=0;
  for(const b of g.bullets){ctx.strokeStyle=colors.mint;ctx.lineWidth=5;ctx.shadowBlur=15;ctx.shadowColor=colors.mint;ctx.beginPath();ctx.moveTo(b.x-b.vx*.022,b.y-b.vy*.022);ctx.lineTo(b.x,b.y);ctx.stroke();}ctx.shadowBlur=0;
  drawShip(g.player);
  for(const r of g.rings){ctx.globalAlpha=Math.max(0,r.life/r.total);ctx.strokeStyle=r.color;ctx.lineWidth=7*ctx.globalAlpha+1;ctx.beginPath();ctx.arc(r.x,r.y,r.r,0,TAU);ctx.stroke();ctx.globalAlpha=1;}
  for(const q of g.particles){ctx.globalAlpha=clamp(q.life/q.max,0,1);ctx.fillStyle=q.color;ctx.fillRect(q.x-q.size/2,q.y-q.size/2,q.size,q.size);}ctx.globalAlpha=1;
  ctx.font='800 13px ui-monospace,monospace';ctx.textAlign='center';for(const t of g.texts){ctx.globalAlpha=1-t.t/.75;ctx.fillStyle=t.color;ctx.fillText(t.value,t.x,t.y);}ctx.globalAlpha=1;ctx.textAlign='left';
}
function draw(){
  ctx.setTransform(dpr,0,0,dpr,0,0);
  const target=game?.player||{x:Math.sin(animTime*.12)*125,y:Math.cos(animTime*.11)*55};
  camX+=(target.x-viewW*.5-camX)*.065;camY+=(target.y-viewH*.5-camY)*.065;
  drawBackground();
  ctx.save();ctx.translate(-camX+(shake?rand(-shake,shake):0),-camY+(shake?rand(-shake,shake):0));
  if(game)drawObjects(game);else{drawBeacon({x:0,y:0,r:47,hp:130,maxHp:130});drawShip({x:0,y:142,angle:-Math.PI/2,dashing:0,inv:0});}
  ctx.restore();shake*=.85;if(shake<.25)shake=0;
}
function loop(t){const dt=Math.min(.034,Math.max(0,(t-lastTime)/1000));lastTime=t;animTime+=dt;if(mode==='playing'){update(dt);updateHUD();}draw();requestAnimationFrame(loop);}
requestAnimationFrame(loop);
function togglePause(){if(mode==='playing'){mode='pause';showScreens('pause');resetJoystick();}else if(mode==='pause'){mode='playing';showScreens(null);}}
function resetJoystick(){joystick.active=false;joystick.x=0;joystick.y=0;joystick.id=null;$('stick').style.transform='translate(0,0)';}
function updateJoystick(e){const rect=$('joystick').getBoundingClientRect(),cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;const dx=e.clientX-cx,dy=e.clientY-cy,d=Math.hypot(dx,dy),max=45;joystick.x=clamp(dx/max,-1,1);joystick.y=clamp(dy/max,-1,1);if(d>max){joystick.x=dx/d;joystick.y=dy/d;}$('stick').style.transform=`translate(${joystick.x*max}px,${joystick.y*max}px)`;}
const stickEl=$('joystick');stickEl.addEventListener('pointerdown',e=>{if(mode!=='playing')return;e.preventDefault();joystick.active=true;joystick.id=e.pointerId;stickEl.setPointerCapture(e.pointerId);updateJoystick(e);});stickEl.addEventListener('pointermove',e=>{if(joystick.active&&joystick.id===e.pointerId)updateJoystick(e);});for(const ev of ['pointerup','pointercancel','lostpointercapture'])stickEl.addEventListener(ev,()=>resetJoystick());
$('dashTouch').addEventListener('pointerdown',e=>{e.preventDefault();tryDash();});$('pulseTouch').addEventListener('pointerdown',e=>{e.preventDefault();tryPulse();});
window.addEventListener('keydown',e=>{
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();
  if(e.repeat&&['Space','KeyQ','KeyP','Escape'].includes(e.code))return;
  if(e.code==='KeyP'||e.code==='Escape'){if(mode==='playing'||mode==='pause')togglePause();return;}
  keys.add(e.code);
  if(e.code==='Space')tryDash();if(e.code==='KeyQ'||e.code==='KeyE')tryPulse();
});window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();resetJoystick();if(mode==='playing')togglePause();});
$('startButton').addEventListener('click',start);$('retryButton').addEventListener('click',start);$('resumeButton').addEventListener('click',togglePause);$('pauseButton').addEventListener('click',togglePause);
$('quitButton').addEventListener('click',()=>{if(mode==='pause')finish(false,true);});
$('hangarButton').addEventListener('click',()=>{game=null;mode='menu';refreshMenu();showScreens('start');});
$('soundButton').addEventListener('click',()=>{saved.muted=!saved.muted;persist();refreshMenu();if(!saved.muted)sound('pickup');});
if('serviceWorker' in navigator&&location.protocol!=='file:')window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(()=>{}));
refreshMenu();showScreens('start');
})();