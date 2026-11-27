import './base.css'
import {Game, worldToGrid, type Mode, type GameState} from './sim'
import {terrainHeight} from './landform'
import { Soundscape } from './audio'
import { createModes } from './modes'
import { createMinimap } from './minimap'
import { fillIcons } from './icons'
import { renderGuide, renderSettings, type Preferences } from './guide'

interface World {
  update(dt:number,s:GameState):void
  project(x:number,z:number,height?:number):{x:number;y:number;visible:boolean}
  pick(x:number,y:number):{x:number;z:number}|null
  setQuality?(quality:'auto'|'high'|'low'):void
  stats?():{calls:number;triangles:number}
  dispose():void
}
const el=<T extends HTMLElement=HTMLElement>(id:string)=>document.getElementById(id) as T
const app=el('terminal'), stage=el('viewport'), over=el('overworld'), nav=el('modes-nav'),drawer=el<HTMLDialogElement>('drawer')
const deploy=el<HTMLButtonElement>('deploy'), audio=el<HTMLButtonElement>('audio')
const driveInfo=over.querySelector<HTMLElement>('.drive-info')!,driveSpeed=over.querySelector<HTMLElement>('.drive-speed')!,waypoint=over.querySelector<HTMLElement>('.waypoint')!
const hero=over.querySelector<HTMLElement>('.hero-copy')!,landmark=over.querySelector<HTMLElement>('.landmark')!
let canvas=el<HTMLCanvasElement>('world')
let storage:Storage|undefined
try{storage=window.localStorage}catch{/* Private sessions can still play. */}
const prefs:Preferences={audio:true,volume:.64,quality:'auto',motion:!matchMedia('(prefers-reduced-motion:reduce)').matches}
try{
 const saved=JSON.parse(storage?.getItem('dust-division.preferences')||'{}')
 for(const k of ['audio','motion'] as const)if(typeof saved[k]==='boolean')prefs[k]=saved[k]
 if(typeof saved.volume==='number')prefs.volume=Math.max(0,Math.min(1,saved.volume))
 if(['auto','high','low'].includes(saved.quality))prefs.quality=saved.quality
}catch{}
function savePrefs(){try{storage?.setItem('dust-division.preferences',JSON.stringify(prefs))}catch{}}
const game=new Game(storage,terrainHeight),sound=new Soundscape()
sound.setEnabled(prefs.audio);sound.setVolume(prefs.volume)
const keys=new Set<string>(),mapDraw=createMinimap(el<HTMLCanvasElement>('minimap'))
const names=['Overworld','City','Industry','Combat']
nav.innerHTML=names.map((name,i)=>'<button class="nav-mode" data-mode="'+(i+1)+'" title="'+name+' ['+(i+1)+']"><small>0'+(i+1)+'</small>'+name+'</button>').join('')
fillIcons()
let world:World,renderType='Initializing',ready=false,unlocked=false,fps=0,noticeTime=0,panel='',viewSignature='',lastEvent=0
const modes=createModes(el('mode-hud'),game,(x,z,h)=>world?world.project(x,z,h):{x:0,y:0,visible:false})
function statusAudio(){audio.classList.toggle('muted',!prefs.audio);audio.classList.toggle('audio-live',prefs.audio&&unlocked);audio.setAttribute('aria-pressed',String(prefs.audio));audio.setAttribute('aria-label',prefs.audio?'Mute audio':'Enable audio')}
function unlock(){if(!unlocked){unlocked=true;sound.unlock();statusAudio()}}
function toggleAudio(){unlock();prefs.audio=!prefs.audio;sound.setEnabled(prefs.audio);savePrefs();statusAudio();sound.play('confirm')}
audio.onclick=toggleAudio
function notify(label:string){const box=el('notice');box.textContent=label;box.classList.remove('pop');void box.offsetWidth;box.classList.add('pop');noticeTime=2.2}
function mode(n:Mode){game.setMode(n);refresh(true)}
function act(action:string,value?:unknown){game.act(action,value);refresh(true)}
nav.onclick=e=>{const b=(e.target as Element).closest<HTMLButtonElement>('[data-mode]');if(b)mode(Number(b.dataset.mode) as Mode)}
document.querySelector<HTMLAnchorElement>('.identity')!.onclick=e=>{e.preventDefault();if(game.state.raid.active)mode(4);else{act('park');mode(1)}}
deploy.onclick=()=>{unlock();act('start');canvas.focus({preventScroll:true})}
el('park').onclick=()=>act('park')
el('interact').onclick=()=>act('interact')
function showPanel(which:string,index=game.state.mode-1){
  keys.clear();panel=which
  el('dialog-body').innerHTML=which==='guide'?renderGuide(index):renderSettings(prefs,renderType,fps,world?.stats?.())
  if(!drawer.open)drawer.showModal()
  if(which==='guide'){
    drawer.querySelectorAll<HTMLButtonElement>('[data-tab]').forEach(b=>b.onclick=()=>{showPanel('guide',Number(b.dataset.tab));drawer.querySelector<HTMLButtonElement>('[data-tab="'+b.dataset.tab+'"]')?.focus()})
  }else{
    el<HTMLSelectElement>('quality').onchange=e=>{prefs.quality=(e.target as HTMLSelectElement).value as Preferences['quality'];world?.setQuality?.(prefs.quality);savePrefs()}
    el<HTMLInputElement>('volume').oninput=e=>{const percent=(e.target as HTMLInputElement).valueAsNumber;prefs.volume=percent/100;sound.setVolume(prefs.volume);el('volume-text').textContent=percent+'%';savePrefs()}
    el('motion').onclick=()=>{prefs.motion=!prefs.motion;el('motion').textContent=prefs.motion?'FULL':'REDUCED';el('motion').setAttribute('aria-pressed',String(prefs.motion));savePrefs()}
    el('fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen()}catch{el('fullscreen').textContent='UNAVAILABLE';el<HTMLButtonElement>('fullscreen').disabled=true}}
    el('settings-guide').onclick=()=>showPanel('guide')
  }
}
el('settings').onclick=()=>showPanel('settings')
document.querySelector<HTMLButtonElement>('.guide-trigger')!.onclick=()=>showPanel('guide')
el('close-panel').onclick=()=>drawer.close()
drawer.onclose=()=>{panel='';keys.clear()}
drawer.onclick=e=>{if(e.target===drawer){const r=drawer.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)drawer.close()}}
const touch=el('touch-controls')
touch.innerHTML=[['KeyW','↑','Move forward'],['KeyA','←','Move left'],['KeyS','↓','Move back'],['KeyD','→','Move right']].map(([code,label,title])=>'<button aria-label="'+title+'" data-code="'+code+'">'+label+'</button>').join('')
touch.querySelectorAll<HTMLButtonElement>('button').forEach(b=>{
 b.onpointerdown=e=>{b.setPointerCapture(e.pointerId);keys.add(b.dataset.code!);b.classList.add('held')}
 b.onpointerup=b.onpointercancel=b.onlostpointercapture=()=>{keys.delete(b.dataset.code!);b.classList.remove('held')}
})
document.addEventListener('pointerdown',()=>unlock(),{capture:true})
document.addEventListener('pointerover',e=>{if(!unlocked||e.pointerType==='touch')return;const target=(e.target as Element).closest('button');if(target&&!target.contains(e.relatedTarget as Node|null)&&!(target as HTMLButtonElement).disabled)sound.play('hover')})
document.addEventListener('click',e=>{if((e.target as Element).closest('button'))sound.play('click')},true)
function controlLine(s:GameState){
 const items=s.mode===1&&!s.started?[['1–4','Switch mode'],['Enter','Deploy']]:s.mode<=2?[['WASD','Drive'],['Shift','Drift'],['E','Interact']]:s.mode===3&&!s.raid.active?[['Click','Build / inspect'],['↑↓←→','Select cell']]:s.mode===4&&!s.raid.active?[['Click','Arrange squad'],['1–4','Switch mode']]:[['WASD','Move'],['J / K','Strike / parry'],['Q','Switch']]
 return items.map(([k,v])=>'<span><kbd>'+k+'</kbd>'+v+'</span>').join('')
}
let lastTime='',lastWeather='',lastContext='',lastDay='',lastSpeed=''
function refresh(force=false){
 const s=game.state,driving=s.mode===1&&s.started,signature=[s.mode,s.started,s.raid.active].join(':')
 if(force||signature!==viewSignature){
   viewSignature=signature;app.dataset.mode=String(s.mode);app.classList.toggle('is-driving',driving)
   nav.querySelectorAll('button').forEach(b=>b.setAttribute('aria-current',String(Number(b.dataset.mode)===s.mode)))
   over.hidden=s.mode!==1;hero.hidden=driving;landmark.hidden=driving;driveInfo.hidden=!driving;driveSpeed.hidden=!driving;waypoint.hidden=!driving
   el('keyline').innerHTML=controlLine(s)
   el('status-word').textContent=s.raid.active?'SORTIE ACTIVE':s.mode===3?'GRID ONLINE':s.mode===4?'SQUAD LINKED':'SYSTEM ONLINE'
   touch.hidden=!matchMedia('(pointer:coarse)').matches||!s.started||!(s.mode<=2||(s.raid.active&&s.mode>=3))
 }
 if(s.mode===1){
   const t=Math.floor(s.hour).toString().padStart(2,'0')+':'+Math.floor((s.hour%1)*60).toString().padStart(2,'0')
   if(t!==lastTime){el('local-hour').textContent=t;lastTime=t}
   if(String(s.day)!==lastDay){el('local-day').textContent='D'+String(s.day).padStart(2,'0');lastDay=String(s.day)}
   const temp=Math.round(19+10*Math.sin((s.hour-7)*Math.PI/17)),weather={clear:'Clear',wind:'Crosswind',dust:'Dust front'}[s.weather],reading=weather+temp
   if(reading!==lastWeather){el('atmosphere').innerHTML=weather+' <em>/ '+temp+'°C</em>';lastWeather=reading}
   if(driving){
     const k=Math.round(Math.abs(s.rover.speed)*3.6).toString().padStart(2,'0');if(k!==lastSpeed){el('kph').textContent=k;el('speed-meter').style.transform='scaleX('+Math.max(.08,Math.min(1,Number(k)/68))+')';lastSpeed=k}
     if(lastContext!==game.context){el('waypoint-name').textContent=game.context;lastContext=game.context}
   }
   mapDraw(s)
 }
 for(const event of s.events){
   if(event.id<=lastEvent)continue
   if(!['mode','ui','attack','hit','dodge','switch','warning'].includes(event.type)||event.type==='warning'&&s.boss.stage==='broken')notify(event.label)
   lastEvent=event.id
 }
 modes.update()
}
function canvasDown(e:PointerEvent){
 if(drawer.open||!ready||e.button!==0)return
 const s=game.state;canvas.focus({preventScroll:true})
 if(s.raid.active&&(s.mode===3||s.mode===4)){act('attack');return}
 if(s.mode===3){const pos=world.pick(e.clientX,e.clientY);if(pos){const cell=worldToGrid(pos.x,pos.z);if(cell.col>=0&&cell.row>=0&&cell.col<7&&cell.row<7)act('build',cell)}}
}
function initCanvas(){canvas.onpointerdown=canvasDown}
function handleKey(e:KeyboardEvent){
 if(e.ctrlKey||e.metaKey||e.altKey)return
 if(drawer.open){if(e.code==='KeyH'&&panel==='guide'){e.preventDefault();drawer.close()}return}
 if((e.target as Element).closest('input,textarea,select')&&e.code!=='Escape')return
 const key=e.code,s=game.state
 if(key==='Space'&&(e.target as Element).closest('button,a')&&!s.raid.active)return
 unlock()
 if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Tab'].includes(key)&&key!=='Tab')e.preventDefault()
 keys.add(key)
 if(e.repeat)return
 if(/^Digit[1-4]$/.test(key)){mode(Number(key.slice(-1)) as Mode);return}
 if(key==='KeyH'){showPanel('guide');return}
 if(key==='Escape'){showPanel('settings');return}
 if(key==='KeyM'){toggleAudio();return}
 if(!ready)return
 if(key==='Enter'&&!s.started&&s.mode===1&&!(e.target as Element).closest('button,a')){e.preventDefault();act('start');return}
 if(key==='KeyR'&&s.mode===1&&s.started){act('park');return}
 if(key==='KeyE'){act('interact');return}
 if(!s.raid.active||s.mode<3)return
 const action=({KeyJ:'attack',KeyK:'parry',KeyQ:'switch',Space:'dodge',KeyF:'finish',KeyX:'extract'} as Record<string,string>)[key]
 if(action){e.preventDefault();act(action)}
}
window.addEventListener('keydown',handleKey)
window.addEventListener('keyup',e=>keys.delete(e.code))
window.addEventListener('blur',()=>keys.clear())
document.addEventListener('visibilitychange',()=>{keys.clear();sound.setEnabled(prefs.audio&&!document.hidden);if(document.hidden)game.save()})
window.addEventListener('pagehide',()=>game.save())
let last=0,frames=0,sampleStart=0,uiTime=0
function frame(ms:number){
 const delta=Math.max(.0001,(ms-(last||ms))/1000);last=ms
 if(document.hidden){sampleStart=ms;frames=0;requestAnimationFrame(frame);return}
 const dt=Math.min(.25,delta)
 if(!drawer.open){
   const down=(...k:string[])=>Number(k.some(key=>keys.has(key)))
   game.tick(dt,{forward:down('KeyW','ArrowUp')-down('KeyS','ArrowDown'),turn:down('KeyD','ArrowRight')-down('KeyA','ArrowLeft'),drift:!!down('ShiftLeft','ShiftRight','Space')})
 }
 const state=game.state
 const drawState=prefs.motion?state:{...state,fx:{...state.fx,shake:0,hit:0,hurt:0}}
 world.update(dt,drawState);sound.update(dt,state)
 frames++;if(!sampleStart)sampleStart=ms
 if(ms-sampleStart>=1200){fps=Math.min(360,frames*1000/(ms-sampleStart));el('frame-data').textContent=Math.round(fps)+' FPS';frames=0;sampleStart=ms}
 uiTime+=dt
 if(uiTime>1/30||state.event.id>lastEvent){uiTime=0;refresh()}
 if(noticeTime>0&&!drawer.open){noticeTime-=dt;if(noticeTime<=0)el('notice').textContent=''}
 requestAnimationFrame(frame)
}
async function boot(){
 try{
   const {createWorld}=await import('./world')
   world=createWorld(canvas);renderType='WebGL 2'
 }catch{
   const replacement=canvas.cloneNode(false) as HTMLCanvasElement;canvas.replaceWith(replacement);canvas=replacement
   const {createFallback}=await import('./fallback');world=createFallback(canvas);renderType='Canvas 2D'
 }
 world.setQuality?.(prefs.quality);initCanvas();statusAudio();refresh(true)
 deploy.querySelector('strong')!.textContent='ENTER SECTOR';deploy.disabled=false;ready=true;app.setAttribute('aria-busy','false');requestAnimationFrame(frame)
}
void boot()
