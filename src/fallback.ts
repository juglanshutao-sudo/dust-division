import {ARENA, EXTRACTION, LOCATIONS, type GameState, type GridNode} from './sim';

type P = {x:number;y:number};
type Vertex = [number,number,number];
type Paint = {depth:number; draw:()=>void};
type Ink = {ground:string;pad:string;road:string;line:string;roof:string;sun:string;shade:string;dark:string;accent:string;distant:string};
const inks:Record<number,Ink> = {
  1:{ground:'#a39779',pad:'#ad9d7f',road:'#625d4e',line:'#ccbb93',roof:'#ac9e81',sun:'#a49272',shade:'#625c4d',dark:'#393b32',accent:'#e2a84a',distant:'#c0ac88'},
  2:{ground:'#f4efe6',pad:'#ded9c9',road:'#9a9d94',line:'#f2eaca',roof:'#f4edda',sun:'#c5c0a8',shade:'#818e98',dark:'#152f5b',accent:'#ffe600',distant:'#e1d9be'},
  3:{ground:'#868982',pad:'#747a72',road:'#525954',line:'#b8bcb2',roof:'#d3d2c4',sun:'#9fa49b',shade:'#565d57',dark:'#252b29',accent:'#ff5c13',distant:'#92958d'},
  4:{ground:'#3a3935',pad:'#48443d',road:'#31322f',line:'#625b4e',roof:'#989287',sun:'#756d61',shade:'#49443d',dark:'#232323',accent:'#bb4233',distant:'#4c4840'},
};
const tau=Math.PI*2;
function imageAt(path:string){const im=new Image();im.src=import.meta.env.BASE_URL+'art/'+path+'.webp';return im;}
function hash(x:number,z:number,seed=0){const n=Math.sin(x*73.47+z*125.19+seed*28.2)*43758.545;return n-Math.floor(n);}

/** CPU projection for devices whose browser cannot allocate a WebGL2 context. */
export function createFallback(canvas:HTMLCanvasElement){
  const context=canvas.getContext('2d',{alpha:false});
  if(!context)throw new Error('Canvas 2D context unavailable');
  const ctx=context,matte=imageAt('ashline'),rover=imageAt('rover');
  let width=0,height=0,left=0,top=0,ratio=1,prefRatio=0;
  let cx=0,cz=-22,yaw=.72,pitch=.55,scale=12,midx=0,midy=0,cos=1,sin=0,up=1,clock=0;
  let started=false,priorHero=true,pointerX=0,pointerY=0,parallaxX=0,parallaxY=0;
  let s:GameState;let ink=inks[1];let objects:Paint[]=[];
  const listener=(e:PointerEvent)=>{pointerX=Math.max(-1,Math.min(1,(e.clientX-left)/width*2-1));pointerY=Math.max(-1,Math.min(1,(e.clientY-top)/height*2-1));};
  window.addEventListener('pointermove',listener,{passive:true});
  function resize(){const r=canvas.getBoundingClientRect();left=r.left;top=r.top;width=r.width||innerWidth;height=r.height||innerHeight;ratio=prefRatio||Math.min(devicePixelRatio||1,1.5);canvas.width=Math.max(1,Math.round(width*ratio));canvas.height=Math.max(1,Math.round(height*ratio));}
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(canvas);resize();
  function projectLocal(x:number,z:number,h=0):P {const dx=x-cx,dz=z-cz;return{x:midx+(dx*cos-dz*sin)*scale,y:midy+((dx*sin+dz*cos)*pitch-h*up)*scale};}
  function project(x:number,z:number,h=0){const p=projectLocal(x,z,h);return{x:p.x+left,y:p.y+top,visible:p.x>=-10&&p.y>=-10&&p.x<width+10&&p.y<height+10};}
  function pick(x:number,y:number){const a=(x-left-midx)/scale,b=(y-top-midy)/(scale*pitch);return{x:cx+cos*a+sin*b,z:cz-sin*a+cos*b};}
  function polygon(points:P[],color:string,stroke?:string,lineWidth=1){ctx.beginPath();for(let i=0;i<points.length;i++){const p=points[i];if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);}ctx.closePath();ctx.fillStyle=color;ctx.fill();if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=lineWidth;ctx.stroke();}}
  function face(verts:Vertex[],col:string,edge?:string){polygon(verts.map(([x,z,h])=>projectLocal(x,z,h)),col,edge,.65);}
  function line(a:P,b:P,color:string,w:number){ctx.strokeStyle=color;ctx.lineWidth=w;ctx.beginPath();ctx.moveTo(a.x,a.y);ctx.lineTo(b.x,b.y);ctx.stroke();}
  function beam(a:Vertex,b:Vertex,col:string,thick=.08){line(projectLocal(...a),projectLocal(...b),col,Math.max(.65,thick*scale));}
  function footprint(x:number,z:number,w:number,d:number,color:string,lift=0){face([[x-w/2,z-d/2,lift],[x+w/2,z-d/2,lift],[x+w/2,z+d/2,lift],[x-w/2,z+d/2,lift]],color);}
  function ellipse(x:number,z:number,rx:number,rz:number,h:number,color:string,stroke?:string){const vs:Vertex[]=[];for(let i=0;i<36;i++){const a=tau*i/36;vs.push([x+Math.cos(a)*rx,z+Math.sin(a)*rz,h]);}face(vs,color,stroke);}
  function block(x:number,z:number,w:number,d:number,h:number,roof=ink.roof,front=ink.sun,side=ink.shade,base=0,angle=0){
    const ca=Math.cos(angle),sa=Math.sin(angle);
    const q=(lx:number,lz:number,lh:number):Vertex=>[x+lx*ca+lz*sa,z-lx*sa+lz*ca,base+lh];
    const corners=[q(-w/2,-d/2,0),q(w/2,-d/2,0),q(w/2,d/2,0),q(-w/2,d/2,0)];
    const roofs=corners.map(([xx,zz,yy]):Vertex=>[xx,zz,yy+h]);
    for(let i=0;i<4;i++){const j=(i+1)%4,a=corners[i],b=corners[j];if((b[1]-a[1])*sin-(b[0]-a[0])*cos>.0001)face([a,b,roofs[j],roofs[i]],i%2?side:front);}
    face(roofs,roof);
  }
  function tower(x:number,z:number,h:number,foot=.55){const cap=.16;for(const sgn of [-1,1]){for(const zsgn of [-1,1])beam([x+sgn*foot,z+zsgn*foot,0],[x+sgn*cap,z+zsgn*cap,h],ink.dark,.10);for(let j=0;j<4;j++){const a=foot+(cap-foot)*j/4,b=foot+(cap-foot)*(j+1)/4;
      beam([x-a,z+sgn*a,h*j/4],[x+b,z+sgn*b,h*(j+1)/4],ink.shade,.075);beam([x+a,z+sgn*a,h*j/4],[x-b,z+sgn*b,h*(j+1)/4],ink.shade,.075);}}
    block(x,z,foot*3,.23,.14,ink.accent,ink.shade,ink.dark,h);
  }
  function drum(x:number,z:number,r:number,h:number){const a=projectLocal(x,z),b=projectLocal(x,z,h);ctx.fillStyle=ink.shade;ctx.fillRect(a.x-r*scale,b.y,2*r*scale,a.y-b.y);ctx.fillStyle=ink.sun;ctx.fillRect(a.x-r*scale,b.y,1.18*r*scale,a.y-b.y);ellipse(x,z,r,r,0,ink.shade);ellipse(x,z,r,r,h,ink.roof,ink.shade);for(const f of [.32,.74])line({x:a.x-r*scale,y:a.y-(a.y-b.y)*f},{x:a.x+r*scale,y:a.y-(a.y-b.y)*f},ink.dark,.8);}
  function queue(x:number,z:number,draw:()=>void,pad=0){const p=projectLocal(x,z);if(p.x<-scale*12||p.y<-scale*9||p.x>width+scale*12||p.y>height+scale*12)return;objects.push({depth:x*sin+z*cos+pad,draw});}
  function shed(x:number,z:number,w:number,d:number,h:number,type:number){
    block(x,z,w+.45,d+.5,.23,ink.shade,ink.dark,ink.shade);block(x,z,w,d,h);
    block(x,z,w+.05,d+.05,.28,ink.dark,ink.dark,ink.dark,h-.62);
    block(x,z,w+.27,d+.27,.12,ink.roof,ink.roof,ink.sun,h);
    const f=Math.sign(cos)||1,front=z+f*(d/2+.015);
    for(let i=0;i<Math.floor(w);i++){const x0=x-w/2+i+.17;face([[x0,front,h-1.17],[x0+.7,front,h-1.17],[x0+.7,front,h-.67],[x0,front,h-.67]],ink.dark);}
    const xx=x-w*.16;face([[xx-.76,front,0],[xx+.76,front,0],[xx+.76,front,1.68],[xx-.76,front,1.68]],ink.shade);
    for(let i=0;i<6;i++)beam([xx-.74,front,.2+i*.24],[xx+.74,front,.2+i*.24],ink.dark,.033);
    block(x-w*.22,z-d*.12,1.17,1,.43,ink.shade,ink.dark,ink.dark,h+.12);
    for(let i=0;i<5;i++)beam([x-w*.22-.46+i*.21,z-d*.12-.45,h+.55],[x-w*.22-.46+i*.21,z-d*.12+.45,h+.55],ink.roof,.055);
    if(type%3===0){block(x+w*.26,z,.6,.6,.68,ink.accent,ink.shade,ink.dark,h+.12);beam([x+w*.26,z,h+.8],[x+w*.26,z,h+2],ink.dark,.05);}
  }
  function construction(n:GridNode){const {x,z,kind}=n;const status=n.powered||n.linked?'#50d67f':ink.accent;
    block(x,z,2.45,2.45,.15,ink.shade,ink.shade,ink.dark);
    if(kind==='generator'){block(x,z,1.85,1.5,1.15,ink.roof,ink.sun,ink.dark,.15);for(let i=0;i<5;i++)block(x-.7+i*.34,z,.13,1.4,.14,ink.dark,ink.dark,ink.shade,1.30);block(x+.72,z-.45,.25,.29,1.08,ink.accent,ink.shade,ink.dark,1.18);}
    if(kind==='relay'){tower(x,z,2.7,.54);beam([x-.64,z,2.5],[x+.64,z,2.5],ink.accent,.15);}
    if(kind==='refinery'){drum(x-.34,z, .68,1.65);block(x+.57,z+.12,.65,1.6,1.06);block(x+.57,z-.33,.3,.38,1.2,ink.accent,ink.sun,ink.shade,1.06);}
    if(kind==='extractor'){block(x,z,1.5,1.5,.65);beam([x-.64,z,.71],[x,z,2.17],ink.sun,.20);beam([x+.64,z,.71],[x,z,2.17],ink.sun,.20);beam([x-.59,z,2.04],[x+1.01,z,2.4+Math.sin(clock*2)*.12],ink.accent,.22);beam([x+.92,z,2.31],[x+.92,z,.45+Math.sin(clock*2)*.12],ink.dark,.1);}
    if(kind==='belt'){block(x,z,1.16,2.55,.26,ink.dark,ink.shade,ink.dark,.15);for(let i=0;i<5;i++)beam([x-.5,z-1+.48*i,.44],[x+.5,z-1+.48*i,.44],ink.roof,.07);}
    ellipse(x-.8,z+.85,.12,.12,.18,status);
  }
  function groundDetails(){
    const extent=Math.max(25,Math.min(88,Math.max(width,height)/scale*.93));
    ctx.fillStyle=ink.ground;ctx.fillRect(0,0,width,height);
    for(let gz=Math.floor((cz-extent)/3);gz<=Math.ceil((cz+extent)/3);gz++)for(let gx=Math.floor((cx-extent)/3);gx<=Math.ceil((cx+extent)/3);gx++){
      const v=hash(gx,gz);if(v>.43)continue;const x=(gx+hash(gx,gz,1))*3,z=(gz+hash(gx,gz,2))*3,p=projectLocal(x,z);
      if(p.x<0||p.x>width||p.y<0||p.y>height)continue;const l=(.08+v*1.3)*scale;
      line(p,{x:p.x+l,y:p.y-.18*l},s.mode===2?'#d4d1c3':s.mode===4?'#50493f':'#817962',.55);}
    for(const [x,z,w,d] of [[0,-21,3.2,63],[0,-22,76,3.4],[22,-23,3.4,47],[-18,-40,48,2.2]]){
      footprint(x,z,w,d,ink.road);const alongZ=d>w,len=alongZ?d:w;
      for(let i=-len/2+1;i<len/2-1;i+=3.4){footprint(x+(alongZ?0:i),z+(alongZ?i:0),alongZ?.08:1.25,alongZ?1.25:.08,ink.line,.02);}}
  }
  function city(){
    LOCATIONS.forEach((b,i)=>{const wh=[6.6,7.4,6.6,4.3][i],d=[5,5.1,4.6,3.05][i],h=[3.6,4.1,3.5,2.85][i];footprint(b.x,b.z,wh+2.4,d+2,ink.pad);queue(b.x,b.z,()=>shed(b.x,b.z,wh,d,h,i));});
    const blocks=[[-19,-29],[-14,-34],[9,-35],[17,-34],[-23,-15],[-30,-24],[8,-44],[-7,-45],[23,-41],[-34,-32]];
    blocks.forEach(([x,z],i)=>{const w=3.5+hash(x,z)*2.5,d=2.8+hash(x,z,1)*2;footprint(x,z,w+.8,d+1,ink.pad);queue(x,z,()=>shed(x,z,w,d,2.1+hash(x,z,2)*1.6,i));});
    for(const [x,z] of [[-5,-37],[-7.7,-37],[-24,-38],[-27,-38],[12,-42],[15,-42]])queue(x,z,()=>drum(x,z,1.18,3.8));
    for(const [x,z,h] of [[-2.7,-10.4,5.4],[17,-25,6.1],[-22,-34,7.8],[-30,-42,6],[-18,-45,6],[-6,-45,6],[6,-45,6],[18,-45,6]])queue(x,z,()=>{tower(x,z,h);if(h>6) {beam([x-1.5,z,h+.2],[x+4.5,z,h+.2],ink.accent,.2);beam([x,z,h+1.2],[x+4.5,z,h+.2],ink.dark,.08);beam([x+3.9,z,h+.2],[x+3.9,z,h-2.6],ink.dark,.045);} });
    beam([-30,-42,6],[-18,-45,6],ink.shade,.035);beam([-18,-45,6],[-6,-45,6],ink.shade,.035);beam([-6,-45,6],[6,-45,6],ink.shade,.035);
  }
  function grid(){
    if(s.mode===3&&!s.raid.active){footprint(0,-22,21,21,ink.pad);
      for(let i=0;i<8;i++){const q=-10.5+i*3;beam([q,-32.5,0],[q,-11.5,0],ink.shade,.045);beam([-10.5,-22+q,0],[10.5,-22+q,0],ink.shade,.045);}}
    for(const edge of s.links){const a=s.nodes.find(n=>edge.from===n.id),b=s.nodes.find(n=>edge.to===n.id);if(!a||!b)continue;
      const lift=edge.kind==='power'?.15:.25;const color=edge.kind==='power'?'#406c4c':ink.accent;beam([a.x,a.z,lift],[b.x,b.z,lift],color,edge.kind==='power'?.12:.38);
      const t=(clock*.32+a.id*.18)%1;ellipse(a.x+(b.x-a.x)*t,a.z+(b.z-a.z)*t,.12,.12,lift+.05,edge.kind==='power'?'#84ec9e':'#d59d53');}
    for(const n of s.nodes)queue(n.x,n.z,()=>construction(n));
  }
  function wheeled(){const {x,z,heading,speed}=s.rover;
    const ca=Math.cos(heading),sa=Math.sin(heading);const shift=(ax:number,az:number):[number,number]=>[x+ca*ax+sa*az,z-sa*ax+ca*az];
    const part=(ax:number,az:number,w:number,d:number,h:number,y:number,r:string,f:string,c:string)=>{const [xx,zz]=shift(ax,az);block(xx,zz,w,d,h,r,f,c,y,heading);};
    ellipse(x+.28,z+.12,1.63,2.35,0,'#302d244f');let wheels:{x:number;z:number;d:number}[]=[];
    for(const side of [-1,1])for(const i of [-1.38,0,1.38]){const [xx,zz]=shift(side*1.02,i);wheels.push({x:xx,z:zz,d:xx*sin+zz*cos});}
    const wheel=(item:typeof wheels[0])=>{block(item.x,item.z,.48,.77,.80,'#464238','#292a28','#20211e',.05,heading);};
    wheels=wheels.sort((a,b)=>a.d-b.d);wheels.slice(0,3).forEach(wheel);
    part(0,0,2,3.85,.47,.45,'#8c7250','#5b513e','#494637');part(0,0,2.12,3.65,.62,.82,'#d2a957','#b18a45','#8e723c');
    part(0,-.20,1.65,1.95,.63,1.44,'#cbb578','#3c4641','#343930');part(0,-.45,1.75,1.73,.13,2.03,'#c19a50','#796647','#5c543c');
    for(const lx of [-.66,.66])part(lx,1.8,.38,.09,.13,1.15,'#f5e7ab','#fff4c8','#a28b55');
    wheels.slice(3).forEach(wheel);if(Math.abs(speed)>3){for(let i=0;i<7;i++){const t=(clock*.65+i/7)%1;const [xx,zz]=shift(Math.sin(i*31)*t*1.5,-2.1-t*Math.min(7,Math.abs(speed)*.20));ellipse(xx,zz,.08+t*.2,.11+t*.16,.14,`rgba(196,172,131,${.36*(1-t)})`);}}
  }
  function cacheMarker(x:number,z:number){block(x,z,1.05,.68,.55,ink.accent,ink.sun,ink.shade);block(x,z,.24,.70,.05,ink.dark,ink.dark,ink.dark,.56);}
  function arena(){
    ellipse(ARENA.x,ARENA.z,12.5,11.8,0,ink.pad,ink.line);ellipse(ARENA.x,ARENA.z,10.4,10.4,.01,ink.ground,ink.line);
    for(let i=0;i<16;i++){const a=i/16*tau,x=ARENA.x+Math.cos(a)*10.7,z=ARENA.z+Math.sin(a)*10.3;if(i%5===0)continue;queue(x,z,()=>{block(x,z,1.4,.55,.65,ink.shade,ink.sun,ink.dark,0,-a);block(x,z,1.46,.57,.08,ink.accent,ink.shade,ink.dark,.65,-a);});}
    const {x,z,radius}=EXTRACTION;ellipse(x,z,radius,radius,.04,s.raid.evacuating?'#4c6253':'#424740','#78987b');ellipse(x,z,radius*.66,radius*.66,.06,ink.pad,'#97b48c');
    if(s.raid.evacuating)ellipse(x,z,(clock%1.5)/1.5*radius,(clock%1.5)/1.5*radius,.08,'transparent','#a1c396');
  }
  function guardian(){const b=s.boss;if(b.stage==='dead')return;
    const a=b.heading,co=Math.cos(a),si=Math.sin(a);const q=(x:number,z:number,h:number):Vertex=>[b.x+co*x+si*z,b.z-si*x+co*z,h];
    const color=b.stage==='stunned'?'#deb37e':b.stage==='broken'?'#e3b69b':'#b84734',plate=ink.roof;
    ellipse(b.x+.35,b.z+.21,2.8,2.5,.015,'#1a181780');
    const legs:({q1:Vertex;q2:Vertex;q3:Vertex;v:number})[]=[];
    for(const side of [-1,1])for(const fore of [-1,1]){const wave=Math.sin(clock*2.4+fore*side)*.1;const p1=q(side*.85,fore*.81,2.0),p2=q(side*1.98,fore*1.26,1.35+wave),p3=q(side*2.32,fore*1.63,.25);legs.push({q1:p1,q2:p2,q3:p3,v:p3[0]*sin+p3[1]*cos});}
    legs.sort((l,r)=>l.v-r.v);const leg=(e:typeof legs[0])=>{beam(e.q1,e.q2,plate,.41);beam(e.q2,e.q3,ink.dark,.29);beam(e.q1,e.q2,color,.12);block(e.q3[0],e.q3[1],.65,.77,.24,ink.shade,ink.sun,ink.dark);};
    legs.slice(0,2).forEach(leg);block(b.x,b.z,2.45,2.7,.72,ink.shade,ink.dark,ink.dark,1.72,a);block(b.x,b.z,2.05,2.38,.89,plate,ink.sun,ink.shade,2.44,a);
    const lens=q(0,.77,3.1);block(lens[0],lens[1],1.06,.8,.43,color,color,ink.dark,3.05,a);for(const side of [-1,1]){const sp=q(side*.84,-.46,3.3);block(sp[0],sp[1],.36,.58,.68,ink.sun,ink.shade,ink.dark,3.34,a);}
    legs.slice(2).forEach(leg);
  }
  function crew(){const p=s.party;const c=['#ddc29a','#a4bfca','#bd6947'];for(let i=0;i<3;i++){const leader=i===p.active;const dx=leader?0:(i===((p.active+1)%3)?-.98:.98),dz=leader?0:.82;
    const x=p.x+dx,z=p.z+dz;queue(x,z,()=>{const step=!s.raid.active?0:Math.sin(clock*7+i)*.09;ellipse(x,z,.37,.29,.01,'#181d1cb0');if(leader)ellipse(x,z,.64,.64,.025,'transparent','#d8ccac');
      block(x-.12,z+.03,.16,.26,.65,ink.dark,ink.shade,ink.dark,.03+Math.max(0,step));block(x+.12,z-.03,.16,.26,.65,ink.dark,ink.shade,ink.dark,.03+Math.max(0,-step));
      block(x,z,.49,.31,.62,c[i],c[i],ink.shade,.64);block(x,z,.31,.28,.33,ink.roof,ink.sun,ink.shade,1.32);beam([x-.27,z,1.18],[x-.34,z+.11,.81],c[i],.15);beam([x+.25,z,1.19],[x+.34,z-.16,.9],c[i],.15);
      if(leader&&s.fx.attack>.06){const pos=projectLocal(x,z,.82),r=scale*(1+s.fx.attack);ctx.strokeStyle='#f4d6a3';ctx.lineWidth=2;ctx.beginPath();ctx.arc(pos.x,pos.y,r,-1.55+s.fx.attack,1.4+s.fx.attack);ctx.stroke();}
    });}}
  function alarm(){const b=s.boss;if(!s.raid.active||!['windup','strike'].includes(b.stage))return;
    const c=`rgba(191,57,39,${.14+.16*b.telegraph})`;ellipse(b.x,b.z,b.range,b.range,.03,c,'#b75c48');const v=b.range*Math.max(.05,b.telegraph);ellipse(b.x,b.z,v,v,.04,'transparent','#d98965');if(b.move==='lunge')beam([b.x,b.z,.05],[b.targetX,b.targetZ,.05],'#d27f63',.3);
  }
  function hero(){const mobile=width<660;const overscan=1.014,dx=parallaxX*width*.003,dy=parallaxY*height*.002;
    ctx.fillStyle='#efdbc0';ctx.fillRect(0,0,width,height);
    if(matte.complete&&matte.naturalWidth){const k=Math.max(width/matte.width,height/matte.height)*overscan;const w=matte.width*k,h=matte.height*k;ctx.drawImage(matte,(width-w)*.60+dx,(height-h)*.50+dy,w,h);}
    const rw=mobile?width*.84:Math.min(width*.47,height*.83),rh=rw*732/1300;
    const base=(mobile?.80:.832)*height,center=width*(mobile?.572:.61)-dx*.85;
    ctx.save();ctx.translate(center+rw*.012,base-rh*.076);ctx.rotate(-.018);ctx.scale(1,.16);ctx.fillStyle='rgba(42,34,22,.35)';ctx.beginPath();ctx.ellipse(0,0,rw*.47,rh*.37,0,0,tau);ctx.fill();ctx.restore();
    if(rover.complete&&rover.naturalWidth)ctx.drawImage(rover,center-rw/2,base-rh,rw,rh);
    for(let i=0;i<18;i++){const t=(clock*(.008+i%3*.005)+hash(i,2))%1,yy=(.53+hash(i,4)*.39)*height;ctx.fillStyle=`rgba(244,223,180,${.13+hash(i,7)*.25})`;ctx.fillRect(t*width,yy+Math.sin(t*10+i)*5,1+hash(i,9),1);}
  }
  function update(dt:number,state:GameState){
    dt=Math.max(0,Math.min(dt,.09));clock+=dt;s=state;const isHero=s.mode===1&&!s.started; const smooth=1-Math.exp(-dt*6.8);parallaxX+=(pointerX-parallaxX)*smooth;parallaxY+=(pointerY-parallaxY)*smooth;
    ctx.setTransform(ratio,0,0,ratio,0,0);if(isHero){hero();priorHero=true;return;}
    const combat=s.mode===4||s.raid.active,construct=s.mode===3&&!s.raid.active,drive=s.mode===1&&!combat;
    ink=inks[combat?(s.mode===3?3:4):s.mode];
    let targetX=0,targetZ=-22,angle=.73,flat=.52,zoom=Math.min(width/50,height/34),centerY=.56;
    if(construct){zoom=Math.min(width/37,height/27);flat=.59;angle=.64;}
    if(combat){targetX=s.party.x*.55+s.boss.x*.45;targetZ=s.party.z*.55+s.boss.z*.45;angle=.58;flat=.48;zoom=Math.min(width/27,height/18);centerY=.59;
      if(s.mode===3){targetX=s.party.x;targetZ=s.party.z;zoom=Math.min(width/29,height/22);flat=.61;}}
    if(drive){targetX=s.rover.x;targetZ=s.rover.z;angle=Math.PI+s.rover.heading;flat=.49;zoom=Math.min(width/28,height/24);centerY=.60;}
    const k=started&&!priorHero?smooth:1;started=true;priorHero=false;
    cx+=(targetX-cx)*k;cz+=(targetZ-cz)*k;yaw+=Math.atan2(Math.sin(angle-yaw),Math.cos(angle-yaw))*k;scale+=(zoom-scale)*k;pitch+=(flat-pitch)*k;up=Math.sqrt(1-pitch*pitch);cos=Math.cos(yaw);sin=Math.sin(yaw);
    midx=width*.5+Math.sin(clock*75)*s.fx.shake*3;midy=height*centerY+Math.cos(clock*63)*s.fx.shake*2;
    objects=[];groundDetails();if(!combat){city();grid();queue(s.rover.x,s.rover.z,wheeled);}if(combat){arena();alarm();queue(s.boss.x,s.boss.z,guardian);crew();}
    for(const c of s.caches)if(c.night===s.raid.active&&!c.claimed)queue(c.x,c.z,()=>cacheMarker(c.x,c.z));
    objects.sort((a,b)=>a.depth-b.depth).forEach(p=>p.draw());
    if(combat&&(s.fx.parry>.1||s.fx.resonance>.1)){const fx=Math.max(s.fx.parry,s.fx.resonance);ellipse(s.party.x,s.party.z,1+3*(1-fx),1+3*(1-fx),.8,'transparent','#e5d9be');}
  }
  function setQuality(q:'auto'|'high'|'low'|number){prefRatio=typeof q==='number'?q:q==='auto'?0:q==='low'?1:Math.min(devicePixelRatio,2);resize();}
  function dispose(){resizeObserver.disconnect();window.removeEventListener('pointermove',listener);objects=[];}
  return{update,pick,project,setQuality,dispose};
}
