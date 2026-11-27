import assert from 'node:assert/strict';
import { Game, LOCATIONS, EXTRACTION, gridToWorld,worldToGrid } from '../src/sim.ts';

const go=(g,seconds,input={})=>{
  for(let i=0;i<Math.round(seconds*90);i++) g.tick(1/90,input);
};
const close=(left,right,tolerance=.005)=>assert.ok(Math.abs(left-right)<tolerance,
  'Expected '+left+' to match '+right);
const memory=new Map();
const store={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)};
const game=new Game(store);
let s=game.state;
assert.equal(s.mode,1);assert.equal(s.started,false);
for(let mode=1;mode<=4;mode++) assert.ok(game.setMode(mode));
game.setMode(1);game.act('start');
const climb=new Game(undefined,(_x,z)=>z*.4),descend=new Game(undefined,(_x,z)=>-z*.4);
climb.act('start');descend.act('start');
go(climb,1,{forward:1});go(descend,1,{forward:1});assert.ok(descend.state.rover.z>climb.state.rover.z+2);
const idle=new Game();go(idle,1,{forward:1});assert.equal(idle.state.rover.z,0);
go(game,1.5,{forward:1});assert.ok(s.rover.z>5);assert.ok(s.rover.speed>6);
go(game,.55,{forward:1,turn:1,drift:true});assert.ok(s.rover.drift>.3);assert.ok(s.rover.heading>.3);
assert.ok(game.act('park'));assert.equal(s.started,false);assert.equal(s.mode,1);
game.act('start');go(game,.5,{forward:1});
Object.assign(s.rover,{x:0,z:-4,heading:Math.PI,vx:0,vz:0,speed:0});
go(game,3,{forward:1});
const depot=LOCATIONS.find(p=>p.id==='depot');
assert.ok(Math.hypot(s.rover.x-depot.x,s.rover.z-depot.z)>=depot.radius+.81);
const field=s.caches.find(c=>c.id==='field');
Object.assign(s.rover,{x:field.x,z:field.z,vx:0,vz:0});
const initial=s.stock.alloy;
assert.ok(game.act('interact'));close(s.stock.alloy,initial+field.amount);
assert.ok(!game.act('salvage','field'));close(s.stock.alloy,initial+field.amount);
console.log('PASS  Free driving, drift slip, solid foundations, docking and one-time salvage');

assert.deepEqual(worldToGrid(...Object.values(gridToWorld(4,2))),{col:4,row:2});
game.act('district','foundry');assert.equal(s.mode,3);
assert.equal(s.power.supply,8);assert.equal(s.power.used,5);assert.equal(s.power.rate,3);
const savedNodes=s.nodes.length;
assert.ok(!game.act('build',{col:1,row:3}));assert.equal(s.nodes.length,savedNodes);
assert.ok(game.act('remove',{col:3,row:3}));assert.equal(s.power.rate,0);
game.act('selectBuild','belt');assert.ok(game.act('build',{col:3,row:3}));assert.equal(s.power.rate,3);
go(game,61);assert.ok(s.stock.alloy>=initial+field.amount-1+2.9);
game.act('remove',{col:2,row:3});assert.equal(s.power.used,0);assert.equal(s.power.rate,0);
game.act('selectBuild','relay');game.act('build',{col:2,row:3});assert.equal(s.power.used,5);
assert.ok(game.act('upgrade'));assert.equal(s.rank,1);assert.equal(s.party.maxHp,112);
game.save();
const loaded=new Game(store);
close(loaded.state.stock.alloy,s.stock.alloy);
assert.deepEqual(loaded.state.nodes,s.nodes);
assert.ok(loaded.state.caches.find(c=>c.id==='field').claimed);
console.log('PASS  Grid placement, connected power, belt delivery, real material flow, refit and save reload');

game.act('district','uplink');assert.equal(s.mode,4);
game.act('formation',{a:0,b:1});assert.equal(s.party.bond,'Induction');assert.equal(s.party.formation[0],1);
assert.ok(game.act('raid'));assert.equal(s.party.active,1);assert.ok(s.raid.active);
assert.ok(!game.act('formation',2));
assert.ok(game.act('interact'));assert.equal(s.raid.loot,8);
assert.equal(game.act('attack'),true);assert.ok(s.boss.hp<s.boss.maxHp);
go(game,.2);assert.ok(game.act('switch'));const before=s.boss.hp;
assert.ok(game.act('attack'));assert.ok(s.boss.hp<before-20);assert.equal(s.fx.resonance,1);
let sawParry=false,sawPhase2=false,sawPhase3=false,sawWindup=false,sawFinish=false;
for(let i=0;i<90*90&&s.raid.active&&!s.raid.bossDown;i++) {
  let input={};
  const d=Math.hypot(s.party.x-s.boss.x,s.party.z-s.boss.z);
  if(d>3.2)input={strafe:(s.boss.x-s.party.x)/d,forward:(s.party.z-s.boss.z)/d};
  if(s.boss.stage==='windup'){
    sawWindup=true;
    if(s.boss.stageTime<.15&&s.boss.stageTime>0)game.act('parry');
  }
  if(sawParry&&s.party.attackCooldown<=0&&s.fx.hitstop===0) {
    if(s.party.switchCooldown<=0)game.act('switch');
    game.act(s.boss.stage==='broken'?'finish':'attack');
  }
  go(game,1/90,input);
  if(s.fx.parry>.8)sawParry=true;
  if(s.boss.phase===2)sawPhase2=true;
  if(s.boss.phase===3)sawPhase3=true;
  if(s.fx.finish>.8)sawFinish=true;
}
assert.ok(sawWindup);assert.ok(sawParry);assert.ok(sawPhase2);assert.ok(sawPhase3);assert.ok(sawFinish);
assert.ok(s.raid.bossDown);assert.equal(s.raid.cores,1);
game.save();
const recovered=new Game(store);
assert.ok(recovered.state.raid.active);assert.equal(recovered.state.boss.stage,'dead');assert.equal(recovered.state.raid.cores,1);
const bank=s.stock.alloy;const cargo=s.raid.loot;
assert.ok(game.act('extract'));assert.equal(s.mode,3);
for(let i=0;i<90*25&&s.raid.active;i++){
  const d=Math.hypot(s.party.x-EXTRACTION.x,s.party.z-EXTRACTION.z);
  const input=d<1?{}:{strafe:(EXTRACTION.x-s.party.x)/d,forward:(s.party.z-EXTRACTION.z)/d};
  go(game,1/90,input);
}
assert.ok(s.report?.success);close(s.stock.alloy,bank+cargo);assert.equal(s.stock.cores,1);assert.equal(s.mode,2);
console.log('PASS  Formation, timed parry, switching, resonance, phase changes, finisher and banked extraction');

assert.equal(s.power.supply,9);
const delivery=new Game();delivery.act('start');
const convoy=delivery.state.caches.find(c=>c.id==='convoy');
Object.assign(delivery.state.rover,{x:convoy.x,z:convoy.z});
delivery.act('interact');assert.ok(delivery.state.delivery.active);
assert.equal(delivery.act('district','depot'),false);
const contractBank=delivery.state.stock.alloy;
Object.assign(delivery.state.rover,{x:depot.x+4,z:depot.z});
assert.ok(delivery.act('interact'));assert.equal(delivery.state.stock.alloy,contractBank+10);
assert.equal(delivery.state.delivery.active,false);
console.log('PASS  Timed district freight, physical delivery verification and banked core power upgrade');

const failed=new Game();failed.act('raid');failed.act('interact');
assert.ok(failed.state.raid.loot>0);
const bankBeforeLoss=failed.state.stock.alloy;
// Run with no input. The AI must chase, telegraph and defeat the operator.
for(let i=0;i<110*90&&failed.state.raid.active;i++)go(failed,1/90);
assert.equal(failed.state.report?.success,false);assert.equal(failed.state.report.reason,'Squad down');
close(failed.state.stock.alloy,bankBeforeLoss);assert.equal(failed.state.report.alloy,0);
assert.ok(failed.act('raid'));assert.ok(!failed.state.caches.find(c=>c.id==='supply').claimed);
const timeout=new Game();timeout.act('raid');timeout.state.raid.timeLeft=.2;go(timeout,.3);assert.equal(timeout.state.report.reason,'Signal lost');
const evacuated=new Game();evacuated.act('raid');evacuated.act('interact');evacuated.act('extract');
Object.assign(evacuated.state.party,EXTRACTION);go(evacuated,.5);assert.ok(evacuated.state.raid.extraction<5);
evacuated.state.party.x-=8;go(evacuated,.2);assert.equal(evacuated.state.raid.extraction,-1);
Object.assign(evacuated.state.party,EXTRACTION);go(evacuated,5.2);assert.ok(evacuated.state.report.success);
assert.equal(evacuated.state.report.bossDown,false);
console.log('PASS  Squad wipe/timeout penalties, salvage reset, interruptible extraction and optional boss bypass');
