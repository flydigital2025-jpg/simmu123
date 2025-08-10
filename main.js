/*
Horse Rush - Client-side demo
Single-file JS for a GitHub Pages-ready demo.
Features:
- Pre-race 1-needle mini-game (rotating needle, tap to try to hit target)
- Race with 2 AI opponents, forward/back joystick, neck-bend near finish
- Stamina, tokens, photo-finish like slow-motion
*/

// DOM
const startBtn = document.getElementById('startBtn');
const practiceBtn = document.getElementById('practiceBtn');
const preGame = document.getElementById('preGame');
const raceScreen = document.getElementById('raceScreen');
const needleCanvas = document.getElementById('needleCanvas');
const tapBtn = document.getElementById('tapBtn');
const finishMini = document.getElementById('finishMini');
const miniResult = document.getElementById('miniResult');
const raceCanvas = document.getElementById('raceCanvas');
const joystickStick = document.getElementById('joystickStick');
const joystickBg = document.getElementById('joystickBg');
const neckBtn = document.getElementById('neckBtn');
const posLabel = document.getElementById('pos');
const staminaLabel = document.getElementById('stamina');
const tokensLabel = document.getElementById('tokens');
const raceResult = document.getElementById('raceResult');

let tokens = 0;

// Mini-game params
let seed = Math.floor(Math.random()*100000);
let needleAngle = 0;
let needleSpeed = 260 + (seed % 180);
let miniRunning = false;
let startTime = 0;
let taps = [];
let targetArc = {start: 60, size: 40}; // degrees

// Race params
const TRACK_LEN = 300;
let player = {pos:0,speed:0,stamina:100,neckAvailable:true};
let ais = [
  {id:'ai1',pos:0,speed:0,stamina:100,skill:0.8},
  {id:'ai2',pos:0,speed:0,stamina:100,skill:0.6}
];
let throttle = 0; // -1..1
let neckPressed = false;
let raceRunning = false;
let raceTickHandle = null;
let lastRender = 0;
let raceStartTime = 0;

// Canvas contexts
const nctx = needleCanvas.getContext('2d');
const ctx = raceCanvas.getContext('2d');

// Helpers
function degToRad(d){ return d*Math.PI/180; }
function clamp(v,a,b){ return Math.max(a,Math.min(b,v)); }

// Needle drawing
function drawNeedle(){
  const w = needleCanvas.width, h = needleCanvas.height;
  nctx.clearRect(0,0,w,h);
  // target arc
  nctx.fillStyle = 'rgba(244,180,0,0.15)';
  nctx.beginPath();
  nctx.moveTo(w/2,h/2);
  nctx.arc(w/2,h/2,140,degToRad(-targetArc.start-targetArc.size),degToRad(-targetArc.start),true);
  nctx.closePath(); nctx.fill();
  // circle
  nctx.strokeStyle = 'rgba(255,255,255,0.06)'; nctx.lineWidth=6;
  nctx.beginPath(); nctx.arc(w/2,h/2,150,0,Math.PI*2); nctx.stroke();
  // needle
  nctx.save();
  nctx.translate(w/2,h/2);
  nctx.rotate(degToRad(-needleAngle));
  nctx.fillStyle = '#f4b400';
  nctx.beginPath(); nctx.moveTo(0,-10); nctx.lineTo(6,-120); nctx.lineTo(-6,-120); nctx.closePath(); nctx.fill();
  nctx.restore();
}

// Mini-game loop
function startMini(){
  seed = Math.floor(Math.random()*100000);
  needleSpeed = 220 + (seed % 200);
  needleAngle = (seed%360);
  taps = [];
  miniRunning = true;
  startTime = performance.now();
  miniResult.innerText = '';
  requestAnimationFrame(miniLoop);
}
function miniLoop(ts){
  if(!miniRunning) return;
  const dt = (ts - startTime) / 1000;
  needleAngle = (needleAngle + needleSpeed*(dt%10)/10) % 360;
  drawNeedle();
  startTime = ts;
  requestAnimationFrame(miniLoop);
}
tapBtn.addEventListener('click',()=>{
  if(!miniRunning) return;
  taps.push(performance.now());
});
finishMini.addEventListener('click',()=>{
  if(!miniRunning) return;
  miniRunning = false;
  evaluateMini();
});
function evaluateMini(){
  if(taps.length===0){ miniResult.innerText = 'Missed! Score: 0%'; return; }
  // compute angle at first tap relative (approx)
  const t = taps[0];
  const angleAtTap = needleAngle % 360;
  const inArc = isAngleInside(angleAtTap, targetArc.start, targetArc.size);
  const score = inArc ? 1 : 0;
  miniResult.innerText = 'Score: ' + (score*100) + '%';
  player.speed += 0.5 + score*1.5;
  setTimeout(()=>{ preGame.classList.add('hidden'); startRace(); }, 700);
}
function isAngleInside(a, start, size){
  const norm = ((a%360)+360)%360;
  const s = ((start%360)+360)%360;
  const e = (s + size) % 360;
  if(s <= e) return norm >= s && norm <= e;
  return norm >= s || norm <= e;
}

// Joystick handling (only forward/back)
let dragging = false, stickCenter = {x:0,y:0}, maxR=38;
joystickBg.addEventListener('pointerdown',(e)=>{
  dragging=true; joystickBg.setPointerCapture(e.pointerId);
});
joystickBg.addEventListener('pointerup',(e)=>{ dragging=false; resetStick(); });
joystickBg.addEventListener('pointercancel',(e)=>{ dragging=false; resetStick(); });
joystickBg.addEventListener('pointermove',(e)=>{
  if(!dragging) return;
  const rect = joystickBg.getBoundingClientRect();
  const x = e.clientX - rect.left - rect.width/2;
  const y = e.clientY - rect.top - rect.height/2;
  const dy = clamp(y, -maxR, maxR);
  joystickStick.style.transform = `translate(${0}px, ${dy}px)`;
  throttle = -dy / maxR;
});
function resetStick(){ joystickStick.style.transform = 'translate(0px,0px)'; throttle = 0; }

// Neck bend
neckBtn.addEventListener('click', ()=>{
  if(!raceRunning) return;
  if(!player.neckAvailable) return;
  neckPressed = true;
});

// Race loop
function startRace(){
  raceScreen.classList.remove('hidden');
  raceRunning = true;
  raceStartTime = performance.now();
  lastRender = performance.now();
  raceTickHandle = setInterval(raceTick, 100); // 10Hz server-like tick
  requestAnimationFrame(renderLoop);
}
function raceTick(){
  const thrust = clamp(throttle, -1, 1);
  const staminaFactor = Math.max(0.2, player.stamina/100);
  player.speed = clamp(player.speed + thrust*0.4, 0, 12);
  player.pos += (4 + player.speed) * staminaFactor / 10;
  if(Math.abs(thrust) > 0.2) player.stamina = clamp(player.stamina - 0.6, 0, 100); else player.stamina = clamp(player.stamina + 0.2, 0, 100);
  ais.forEach(ai=>{
    let desired = ai.skill * 1.0;
    desired += (Math.random()-0.5)*0.2;
    ai.speed = clamp(ai.speed + (desired - ai.speed)*0.2, 0, 11);
    ai.pos += (4 + ai.speed) * Math.max(0.2, ai.stamina/100) / 10;
    if(ai.pos < TRACK_LEN) ai.stamina = clamp(ai.stamina - 0.1, 0, 100);
  });
  if(neckPressed && player.neckAvailable && (TRACK_LEN - player.pos) <= 6){
    player.pos += 6;
    player.neckAvailable = false;
    neckPressed = false;
    doPhotoFinish();
  } else neckPressed = false;
  if(player.pos >= TRACK_LEN || ais.some(a=>a.pos >= TRACK_LEN)){
    raceEnd();
  }
  updateHUD();
}
function updateHUD(){
  const ranks = [ {id:'you',pos:player.pos} , ...ais.map(a=>({id:a.id,pos:a.pos})) ];
  ranks.sort((a,b)=>b.pos - a.pos);
  const place = ranks.findIndex(r=>r.id==='you') + 1;
  posLabel.innerText = `Pos: ${place} / ${ranks.length}`;
  staminaLabel.innerText = `Stamina: ${Math.round(player.stamina)}`;
  tokensLabel.innerText = `Tokens: ${tokens}`;
}
function doPhotoFinish(){
  raceCanvas.style.transition = 'filter 0.3s';
  raceCanvas.style.filter = 'blur(1px) saturate(1.2)';
  setTimeout(()=>{ raceCanvas.style.filter=''; }, 500);
}

// render
function renderLoop(ts){
  const dt = ts - lastRender; lastRender = ts;
  ctx.clearRect(0,0,raceCanvas.width,raceCanvas.height);
  const w = raceCanvas.width, h = raceCanvas.height;
  ctx.fillStyle = '#071722';
  ctx.fillRect(0,0,w,h);
  const finishX = w - 80;
  ctx.fillStyle = '#fff';
  ctx.fillRect(finishX,20,6,h-40);
  function drawHorse(x,pos,color,label){
    const t = clamp(pos / TRACK_LEN, 0,1);
    const px = 40 + t*(finishX-60);
    const py = x;
    ctx.fillStyle = color;
    ctx.fillRect(px-12,py-18,24,36);
    ctx.fillStyle = '#fff';
    ctx.font = '12px Arial';
    ctx.fillText(label, px-10, py-24);
  }
  drawHorse(60, player.pos, '#f4b400', 'You');
  drawHorse(140, ais[0].pos, '#6CE8A5', 'AI 1');
  drawHorse(220, ais[1].pos, '#88C0FF', 'AI 2');
  requestAnimationFrame(renderLoop);
}

// race end
function raceEnd(){
  clearInterval(raceTickHandle);
  raceRunning = false;
  const results = [
    {id:'you',pos:player.pos},
    ...ais.map(a=>({id:a.id,pos:a.pos}))
  ].sort((a,b)=>b.pos - a.pos);
  const place = results.findIndex(r=>r.id==='you') +1;
  let reward = 0;
  if(place === 1) reward = 10;
  else if(place === 2) reward = 4;
  else reward = 1;
  tokens += reward;
  raceResult.classList.remove('hidden');
  raceResult.innerHTML = `<strong>Race finished! Place: ${place} / 3 — Tokens +${reward}</strong><br/><button id="replayBtn">Replay</button>`;
  document.getElementById('replayBtn').onclick = ()=>{ location.reload(); };
}

// wire UI
startBtn.onclick = ()=>{
  document.getElementById('menu').classList.add('hidden');
  preGame.classList.remove('hidden');
  startMini();
};
practiceBtn.onclick = ()=>{
  document.getElementById('menu').classList.add('hidden');
  preGame.classList.remove('hidden');
  startMini();
};
