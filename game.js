'use strict';
const NAMES=['Котёнок','Щенок','Слонёнок','Пони','Черепаха','Обезьянка','Тигрёнок','Кенгуру','Бегемот','Зебра','Жираф','Капибара','Страус'];
const COLORS=['#7EC8E3','#F5D76E','#F2967D','#8FD9B6','#B79CED','#F4A6C6','#F4A259'];
const $=id=>document.getElementById(id), S=900, canvas=$('artCanvas'), ctx=canvas.getContext('2d');
canvas.width=canvas.height=S;
let saved;try{saved=JSON.parse(localStorage.getItem('coloranimals-v1'))}catch{};
let paintings=saved?.paintings||{}, unlocked=Math.min(12,Math.max(0,saved?.unlocked||0)), current=Math.min(unlocked,saved?.current||0), selected=0, started=false, busy=true, muted=!!saved?.muted;
if(saved?.artVersion!==2){delete paintings[10];delete paintings[11];delete paintings[12];}
const colorRuns=saved?.colorRuns||{};
const cache=new Map();let state=null,request=0;
function save(){try{localStorage.setItem('coloranimals-v1',JSON.stringify({paintings,unlocked,current,muted,colorRuns,artVersion:2}))}catch{}}
// Only first-time fills count; each animal keeps its own streak.
function blockedColor(){const run=colorRuns[current];return run?.count>=2?run.color:-1;}
function updatePalette(){
 const blocked=blockedColor();
 if(selected===blocked&&blocked!==-1)selected=-1;
 document.querySelectorAll('.swatch').forEach((el,i)=>{
  el.disabled=i===blocked;
  el.classList.toggle('selected',i===selected);
  el.classList.toggle('color-blocked',i===blocked);
  el.classList.toggle('choose-color',blocked!==-1&&selected===-1&&i!==blocked);
  el.setAttribute('aria-pressed',String(i===selected));
 });
}
function recordNewFill(color){
 const run=colorRuns[current];
 colorRuns[current]={color,count:run?.color===color?Math.min(2,run.count+1):1};
 updatePalette();
}
// Connected white regions are computed once. The exterior is never paintable.
async function prepare(index){
 if(cache.has(index))return cache.get(index);
 const img=new Image();img.src=`assets/animal-${index}.png`;await img.decode();
 const c=document.createElement('canvas');c.width=c.height=S;const x=c.getContext('2d',{willReadFrequently:true});x.fillStyle='white';x.fillRect(0,0,S,S);x.drawImage(img,0,0,S,S);
 const pixels=x.getImageData(0,0,S,S),d=pixels.data,n=S*S,wall=new Uint8Array(n),closed=new Uint8Array(n);
 for(let p=0;p<n;p++)wall[p]=(d[p*4]*.2126+d[p*4+1]*.7152+d[p*4+2]*.0722)<205?1:0;
 // Seal one-pixel pinholes in scanned contours without visibly thickening the artwork.
 for(let y=1;y<S-1;y++)for(let xx=1;xx<S-1;xx++){const p=y*S+xx;closed[p]=wall[p]||((wall[p-1]&&wall[p+1])||(wall[p-S]&&wall[p+S]))?1:0;}
 const labels=new Int32Array(n);labels.fill(-1);const queue=new Int32Array(n),regions=[];
 for(let p=0;p<n;p++){
  if(closed[p]||labels[p]!==-1)continue;
  let head=0,tail=1,border=false;const id=regions.length;queue[0]=p;labels[p]=id;
  while(head<tail){const q=queue[head++],xx=q%S,yy=(q/S)|0;if(xx===0||yy===0||xx===S-1||yy===S-1)border=true;
   for(const v of [xx>0?q-1:-1,xx<S-1?q+1:-1,yy>0?q-S:-1,yy<S-1?q+S:-1])if(v>=0&&!closed[v]&&labels[v]===-1){labels[v]=id;queue[tail++]=v;}
  }
  regions.push({area:tail,exterior:border,paintable:!border&&tail>=45});
 }
 let total=regions.reduce((s,r)=>s+(r.paintable?r.area:0),0);
 const line=x.createImageData(S,S);for(let p=0;p<n;p++){const i=p*4;line.data[i]=59;line.data[i+1]=54;line.data[i+2]=41;const lum=d[i]*.2126+d[i+1]*.7152+d[i+2]*.0722;line.data[i+3]=lum>245?0:Math.min(255,(255-lum)*1.06);}
 const lc=document.createElement('canvas');lc.width=lc.height=S;lc.getContext('2d').putImageData(line,0,0);
 const result={labels,regions,total,line:lc,colors:paintings[index]||{},pixels:x.createImageData(S,S)};
 cache.set(index,result);if(cache.size>3){const old=[...cache.keys()].find(k=>k!==index&&k!==current);if(old!==undefined)cache.delete(old)}
 return result;
}
function render(){if(!state)return;const d=state.pixels.data;for(let p=0;p<S*S;p++){const r=state.regions[state.labels[p]],color=r&&!r.exterior?(state.colors[state.labels[p]]||'#fffdf8'):null;const i=p*4;if(color){const v=parseInt(color.slice(1),16);d[i]=v>>16;d[i+1]=(v>>8)&255;d[i+2]=v&255;d[i+3]=255}else{d[i]=255;d[i+1]=253;d[i+2]=248;d[i+3]=r?.exterior?0:255;}}ctx.putImageData(state.pixels,0,0);ctx.drawImage(state.line,0,0);update();}
function ratio(){return state?.total?state.regions.reduce((a,r,i)=>a+(r.paintable&&state.colors[i]?r.area:0),0)/state.total:0;}
function update(){const progress=ratio(),done=progress>=.9;if(done&&current===unlocked&&unlocked<12){unlocked++;save();celebrate()}
 $('progressFill').style.width=`${Math.min(100,progress*100)}%`;
 const bar=document.querySelector('.progress');bar.classList.toggle('complete',done);bar.setAttribute('aria-valuenow',Math.round(progress*100));
 $('nextBtn').disabled=busy||current>=unlocked;$('nextBtn').classList.toggle('ready',done&&current<12);$('prevBtn').disabled=busy||current===0;
 $('dots').innerHTML=NAMES.map((name,i)=>`<span class="dot ${i===current?'active':''} ${i<unlocked?'done':''}" title="${name}"></span>`).join('');
 canvas.setAttribute('aria-label',NAMES[current]+', раскрашено '+Math.round(progress*100)+'%');
}
const scenes={
 home:'M35 470V300L130 215 225 300V470M70 470V375H125V470M155 330H195V370H155ZM30 300H230M400 100q25-30 50 0q35-15 45 15H380q-10-15 20-15M20 490Q300 470 580 490',
 farm:'M25 470V310L105 245 185 310V470M60 470V375H150V470M60 375L150 470M150 375L60 470M390 420H580M390 450H580M410 390V480M470 390V480M540 390V480M25 490Q300 470 580 490',
 jungle:'M70 480Q115 300 80 180M80 210Q15 180 15 250Q60 245 80 210M80 210Q130 140 165 205Q125 230 80 210M490 470Q470 270 520 165M510 200Q440 150 430 220Q470 235 510 200M510 200Q550 150 590 210Q555 235 510 200M10 500Q180 470 300 500T590 490',
 savanna:'M60 470V310M60 330L25 300M60 350L110 310M20 310Q-5 250 55 265Q95 220 135 280Q165 325 20 310M455 470V290M455 310L510 275M400 290Q370 240 430 240Q465 205 510 245Q560 235 570 285Z M15 495Q230 470 350 490T590 480M520 100a35 35 0 1 0 1 0',
 pond:'M10 475Q130 440 230 480T590 470M35 500Q150 480 250 505M330 520Q450 495 570 520M55 450V360M70 450V330M85 450V370M510 460V350M530 460V325M510 370q-25-35-30-10M530 345q25-40 30-15'
};
const habitats=['home','home','savanna','farm','pond','jungle','jungle','savanna','pond','savanna','savanna','pond','savanna'];
async function show(index){if(index<0||index>unlocked||index>=13)return;const token=++request;busy=true;current=index;state=null;$('loadingEl').classList.remove('hidden');$('nextBtn').disabled=$('prevBtn').disabled=true;$('canvasWrap').classList.add('switching');
 try{const result=await prepare(index);if(token!==request)return;state=result;busy=false;if(selected<0&&blockedColor()===-1)selected=0;updatePalette();$('scenery').innerHTML=`<path d="${scenes[habitats[index]]}"/>`;render();save();$('loadingEl').classList.add('hidden');$('canvasWrap').classList.remove('switching');}
 catch(err){$('loadingEl').textContent='↻';$('loadingEl').onclick=()=>show(index);console.error(err)}
}
function paint(e){if(!started||busy||!state||e.button>0||selected<0||selected===blockedColor())return;e.preventDefault();const box=canvas.getBoundingClientRect(),x=Math.floor((e.clientX-box.left)*S/box.width),y=Math.floor((e.clientY-box.top)*S/box.height);if(x<0||y<0||x>=S||y>=S)return;let id=state.labels[y*S+x];
 if(!state.regions[id]?.paintable){let nearest=Infinity;const radius=Math.ceil(S/box.width*9);for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){const xx=x+dx,yy=y+dy;if(xx<0||xx>=S||yy<0||yy>=S)continue;const other=state.labels[yy*S+xx],dist=dx*dx+dy*dy;if(state.regions[other]?.paintable&&dist<nearest){id=other;nearest=dist}}}
 if(!state.regions[id]?.paintable||state.colors[id]===COLORS[selected])return;
 const usedColor=selected,isNew=!state.colors[id];
 state.colors[id]=COLORS[usedColor];paintings[current]=state.colors;
 if(isNew)recordNewFill(usedColor);
 render();save();chime(usedColor);sparkles(e.clientX,e.clientY);
}
canvas.addEventListener('pointerdown',paint,{passive:false});
$('palette').innerHTML=COLORS.map((c,i)=>`<button class="swatch ${i===0?'selected':''}" style="background:${c}" aria-label="${['Голубой','Жёлтый','Коралловый','Зелёный','Сиреневый','Розовый','Оранжевый'][i]}" aria-pressed="${i===0}" data-color="${i}"></button>`).join('');
$('palette').onclick=e=>{const b=e.target.closest('[data-color]');if(!b||b.disabled||+b.dataset.color===blockedColor())return;selected=+b.dataset.color;updatePalette()};
updatePalette();
$('prevBtn').onclick=()=>!busy&&show(current-1);$('nextBtn').onclick=()=>!busy&&show(current+1);
$('resetBtn').onclick=()=>{if(busy||!state)return;state.colors={};paintings[current]={};delete colorRuns[current];if(selected<0)selected=0;updatePalette();render();save()};
$('resetBtn').setAttribute('aria-label','Раскрасить заново');$('prevBtn').setAttribute('aria-label','Предыдущее животное');$('nextBtn').setAttribute('aria-label','Следующее животное');
$('go').onclick=()=>{foreground=!document.hidden;started=true;document.body.classList.add('playing');$('start').hidden=true;$('game').inert=false;audio();if(ac?.state==='suspended')ac.resume();show(current)};
function sparkles(x,y){if(matchMedia('(prefers-reduced-motion: reduce)').matches)return;for(let i=0;i<8;i++){const dot=document.createElement('span');dot.className='sparkle';dot.style.cssText=`left:${x}px;top:${y}px;background:${COLORS[i%7]};width:8px;height:8px`;document.body.append(dot);dot.animate([{transform:'translate(0,0)',opacity:1},{transform:`translate(${Math.cos(i)*55}px,${Math.sin(i)*55-25}px)`,opacity:0}],{duration:650,easing:'ease-out'}).onfinish=()=>dot.remove()}}
function celebrate(){const r=canvas.getBoundingClientRect();sparkles(r.left+r.width/2,r.top+r.height/3);if(ac)[0,2,4].forEach((n,i)=>setTimeout(()=>chime(n),i*150))}
// A quiet consonant lullaby, filtered before both dry and reverberant paths.
let ac,master,timer,step=0,foreground=!document.hidden;const notes=[261.63,329.63,392,329.63,293.66,349.23,440,349.23,261.63,329.63,392,523.25,349.23,329.63,293.66,261.63];
function audio(){if(ac)return;try{ac=new(window.AudioContext||window.webkitAudioContext)();master=ac.createGain();master.gain.value=muted?0:.55;const low=ac.createBiquadFilter();low.type='lowpass';low.frequency.value=1700;low.Q.value=.45;master.connect(low);const dry=ac.createGain();dry.gain.value=.75;low.connect(dry);dry.connect(ac.destination);const reverb=ac.createConvolver(),length=ac.sampleRate*2.8,buffer=ac.createBuffer(2,length,ac.sampleRate);for(let ch=0;ch<2;ch++){const d=buffer.getChannelData(ch);let last=0;for(let i=0;i<length;i++){last=.75*last+.25*(Math.random()*2-1);d[i]=last*Math.pow(1-i/length,2.2)}}reverb.buffer=buffer;const wet=ac.createGain();wet.gain.value=.32;low.connect(reverb);reverb.connect(wet);wet.connect(ac.destination);ambient()}catch{}}
function tone(freq,duration=2.8,volume=.045,attack=.12){if(!ac||muted||document.hidden||!foreground)return;const t=ac.currentTime,o=ac.createOscillator(),g=ac.createGain();o.type='sine';o.frequency.value=freq;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(volume,t+attack);g.gain.exponentialRampToValueAtTime(.0001,t+duration);o.connect(g);g.connect(master);o.start();o.stop(t+duration+.1);o.onended=()=>{o.disconnect();g.disconnect()}}
function ambient(){clearTimeout(timer);if(document.hidden||!foreground)return;if(started&&!muted){tone(notes[step%16],3.8,.045,.6);if(step%4===0)tone([130.81,146.83,130.81,174.61][Math.floor(step%16/4)],5,.035,.9);step++}timer=setTimeout(ambient,1900)}
function chime(i){tone([523.25,587.33,659.25,783.99,880,1046.5,1174.66][i],1.3,.08,.035)}
function soundUI(){$('waveIcon').style.display=muted?'none':'block';$('muteSlashIcon').style.display=muted?'block':'none';$('soundBtn').setAttribute('aria-label',muted?'Включить звук':'Выключить звук');$('soundBtn').setAttribute('aria-pressed',!muted)}
$('soundBtn').onclick=()=>{audio();muted=!muted;if(master)master.gain.setTargetAtTime(muted?0:.55,ac.currentTime,.12);if(ac?.state==='suspended')ac.resume();soundUI();save()};soundUI();
function pauseAudio(){foreground=false;clearTimeout(timer);if(ac&&ac.state!=='closed')ac.suspend().catch(()=>{});}
function restoreAudio(){foreground=!document.hidden;if(!foreground||!ac||!started)return;ac.resume().then(()=>{if(!foreground||document.hidden){pauseAudio();return}ambient()}).catch(()=>{});}
document.addEventListener('visibilitychange',()=>document.hidden?pauseAudio():restoreAudio());
window.addEventListener('pagehide',pauseAudio);
window.addEventListener('pageshow',restoreAudio);
window.addEventListener('blur',pauseAudio);
window.addEventListener('focus',restoreAudio);
document.addEventListener('freeze',pauseAudio);
document.addEventListener('resume',restoreAudio);
