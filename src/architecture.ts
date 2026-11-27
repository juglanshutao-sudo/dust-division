import * as T from 'three';
import {terrainHeight, randomSource} from './geology';

// Small architectural parts are instanced by primitive. A complete outpost costs
// a handful of draw calls even though every crane, tank and insulator is modeled.
export function buildArchitecture(scene:T.Scene) {
  const colors = { wall:'#c3b79f', white:'#e6dbc6', dark:'#333c3b', trim:'#686a60', amber:'#d59d36',blue:'#34495b', glass:'#343f40',copper:'#8e6145' };
  const groups=new Map<T.BufferGeometry,{matrix:T.Matrix4,color:T.Color}[]>();
  const cube=new T.BoxGeometry(1,1,1), cylinder=new T.CylinderGeometry(.5,.5,1,12),pipe=new T.CylinderGeometry(.5,.5,1,7),cone=new T.ConeGeometry(.5,1,12);
  const o=new T.Object3D(), a=new T.Vector3(),b=new T.Vector3(),yv=new T.Vector3(0,1,0);
  function register(g:T.BufferGeometry,c:string){o.updateMatrix();let l=groups.get(g);if(!l){l=[];groups.set(g,l);}l.push({matrix:o.matrix.clone(),color:new T.Color(c)});}
  function part(g:T.BufferGeometry,x:number,y:number,z:number,w:number,h:number,d:number,c:string,ry=0,rz=0){o.position.set(x,y,z);o.scale.set(w,h,d);o.rotation.set(0,ry,rz);register(g,c);}
  function beam(x1:number,y1:number,z1:number,x2:number,y2:number,z2:number,d:number,c:string,square=false){a.set(x1,y1,z1);b.set(x2,y2,z2);o.position.copy(a).add(b).multiplyScalar(.5);a.sub(b);o.scale.set(d,a.length(),d);o.quaternion.setFromUnitVectors(yv,a.normalize());register(square?cube:pipe,c);}
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,c:string,ry=0)=>part(cube,x,y,z,w,h,d,c,ry);
  const cyl=(x:number,y:number,z:number,w:number,h:number,c:string)=>part(cylinder,x,y,z,w,h,w,c);
  const ink=colors.dark,w=colors.wall,m=colors.trim,white=colors.white,amber=colors.amber;
  const seed=randomSource(735);
  function shed(x:number,z:number,width:number,depth:number,height:number,accent:string,doors=1){
    const y=terrainHeight(x,z);box(x,y+.12,z,width+.55,.3,depth+.5,m);box(x,y+height*.5,z,width,height,depth,w);
    box(x,y+height-.45,z,width+.045,.49,depth+.045,accent);box(x,y+height+.075,z,width+.35,.16,depth+.4,white);
    for(let i=0;i<doors;i++){const dx=x+(i-(doors-1)*.5)*2.3;box(dx,y+1.04,z+depth*.5+.04,1.7,2.08,.12,ink);for(let j=1;j<6;j++)box(dx,y+j*.31,z+depth*.5+.13,1.64,.035,.035,m);}
    const n=Math.max(2,Math.floor(width/1.08));for(let i=0;i<n;i++)box(x+width*(i+.5)/n-width/2,y+height-.76,z+depth*.5+.026,width/n-.15,.36,.06,colors.glass);
    for(const edge of [-1,1])for(let j=0;j<4;j++)box(x+edge*(width*.5+.03),y+height*.44,z+(j-1.5)*depth*.24,.11,height*.84,.09,m);
    box(x-width*.21,y+height+.38,z+.08*depth,1.55,.57,1.1,m);
    for(let i=0;i<7;i++)box(x-width*.21+(i-3)*.18,y+height+.68,z+.08*depth,.078,.045,1.03,ink);
    for(const end of [-1,1])box(x+end*(width*.5-.2),y+height*.5,z+depth*.5+.07,.11,height,.12,m);
  }
  function tank(x:number,z:number,r:number,h:number,c:string){const y=terrainHeight(x,z);cyl(x,y+h/2,z,r,h,c);cyl(x,y+h+.04,z,r+.12,.09,m);part(cone,x,y+h+.27,z,r,.44,r,white);for(const f of [.13,.68])cyl(x,y+h*f,z,r+.06,.13,m);for(let i=0;i<7;i++)box(x+.1,y+.35+i*h/8,z+r*.5+.08,.43,.05,.07,ink);for(const e of [-1,1])box(x+.1+e*.23,y+h/2,z+r*.5+.09,.05,h+.2,.05,ink);}
  function mast(x:number,z:number,h:number,span:number){const y=terrainHeight(x,z);for(const sx of [-1,1])for(const sz of [-1,1])beam(x+sx*span,y,z+sz*span,x+sx*.17,y+h,z+sz*.17,.16,m,true);
    for(let j=0;j<5;j++){let p=span*(1-j/5)+.17*j/5,q=span*(1-(j+1)/5)+.17*(j+1)/5,lo=y+h*j/5,hi=y+h*(j+1)/5;
      for(const side of [-1,1]){beam(x-p,lo,z+side*p,x+q,hi,z+side*q,.075,m);beam(x+p,lo,z+side*p,x-q,hi,z+side*q,.075,m);beam(x+side*p,lo,z-p,x+side*q,hi,z+q,.075,m);}
    }box(x,y+h+.1,z,span*3,.17,.37,m);
    for(const dx of [-1,1]){for(let j=0;j<3;j++)cyl(x+dx*span*1.2,y+h+.33+j*.11,z,.33-.039*j,.064,white);}
  }
  function crane(x:number,z:number,h:number,len:number){mast(x,z,h,.72);const y=terrainHeight(x,z)+h;box(x,y+.4,z,.98,.65,1.1,amber);box(x+len*.32,y+.8,z,len,.17,.61,amber);box(x+len*.32,y+1.48,z,len,.15,.49,amber);for(let i=0;i<11;i++){const t=x+len*(i/11-.18);beam(t,y+.82,z+.24,t+len/11,y+1.47,z+.24,.1,ink);}
    beam(x+len*.66,y+.82,z,x+len*.66,y-2.4,z,.038,ink);box(x-len*.15,y+.3,z,1.45,.72,1.12,m);}
  // Roads are laid flush with the terrain in the graded center of the basin.
  function road(cx:number,cz:number,width:number,length:number,rot:number) {
    const forward=new T.Vector2(Math.sin(rot),Math.cos(rot));const across=new T.Vector2(Math.cos(rot),-Math.sin(rot));const count=Math.ceil(length/2.4),step=length/count;
    for(let i=0;i<count;i++){const dist=(i+.5-count*.5)*step,x=cx+dist*forward.x,z=cz+dist*forward.y,y=terrainHeight(x,z);
      box(x,y+.035,z,width,.055,step+.03,'#65645a',rot);
      if(i%2===0)box(x,y+.072,z,.095,.028,1.14,'#c7b382',rot);
      for(const edge of [-1,1]){const dx=x+across.x*edge*(width*.5-.15),dz=z+across.y*edge*(width*.5-.15);box(dx,y+.075,dz,.064,.027,step,'#a59e87',rot);}
    }
  }
  road(0,-16,3.9,42,0);road(0,-22,3.7,68,Math.PI/2);road(22,-25,3.6,36,0);
  // Forecourt and four functional facilities occupy the same coordinates as simulation.
  shed(-14,-22,6.6,5,3.6,colors.blue,2);shed(-17.7,-23.5,2.2,3.6,2.35,amber);
  shed(0,-36,7.4,5.1,4.1,'#756951',2);tank(-5,-37,2.4,4.0,white);tank(-7.7,-37,2.1,3.6,w);
  shed(14,-22,6.6,4.6,3.5,'#9f6643',2);crane(17,-25,6.25,6.5);
  shed(0,-10,4.3,3.05,2.85,colors.blue);box(1.45,3.05,-10.65,.73,.55,.72,amber);mast(-2.7,-10.4,5.9,.34);
  for(const [x,z] of [[-19,-29],[-14,-34],[9,-35],[17,-34],[-23,-15],[-30,-24],[8,-44],[-7,-45],[23,-41],[-34,-32]])shed(x,z,3.5+seed()*2.8,2.7+seed()*2,2.05+seed()*1.4,seed()>.5?'#736c59':colors.blue);
  for(const [x,z] of [[-24,-38],[-27,-38],[12,-42],[15,-42],[-28,-16]])tank(x,z,2.3+seed()*1.1,3.4+seed()*1.6,w);
  crane(-22,-34,8.4,9);crane(26,-43,7.8,8);
  for(let i=0;i<7;i++){const x=-33+i*8,z=-47-i*.2;mast(x,z,6.7,.53);if(i>0){for(const side of [-.55,.55]){let px=x-8,py=terrainHeight(px,z+.2)+7.2,pz=z+.2;for(let k=1;k<=6;k++){const t=k/6,bx=x-8+8*t,bz=z+.2*(1-t),by=terrainHeight(bx,bz)+7.1-.75*Math.sin(t*Math.PI);beam(px+side,py,pz,bx+side,by,bz,.035,ink);px=bx;py=by;pz=bz;}}}}
  for(let i=0;i<14;i++){let x=-31+i*3.8,z=-40.5;box(x,.65,z,.24,1.3,.81,m);beam(x,1.28,z,x+3.8,1.28,z,.4,'#8f7f60');}
  for(let i=0;i<25;i++){const x=seed()*60-32,z=-34-seed()*12;box(x,.6,z,1.85,1.15,.94,i%3===0?amber:'#767966');for(let k=0;k<6;k++)box(x+(k-2.5)*.3,.6,z+.48,.035,1.07,.035,ink);}
  // The night arena and evacuation beacon can be seen before leaving the depot.
  for(let i=0;i<13;i++){const t=i/13*6.28,x=36+Math.cos(t)*10.8,z=-30+Math.sin(t)*10.2;if(i%5===0)continue;box(x,.59,z,2.2,1.12,.72,'#797665',-t+Math.PI/2);box(x,1.18,z,2.26,.11,.76,amber,-t+Math.PI/2);}
  for(const [x,z] of [[26,-38],[44,-38],[47,-23]]){const y=terrainHeight(x,z);cyl(x,y+2.05,z,.23,4.1,ink);box(x,y+4.18,z,1.02,.3,.35,white);}
  // In-world eclipse collector. Its dimensions and azimuth correspond to the opening plate.
  const ringCenter=new T.Vector3(-11,17,-72),normal=new T.Vector3(.52,0,.85),right=new T.Vector3(.85,0,-.52),up=new T.Vector3(0,1,0);
  function ringPt(r:number,t:number,offset=0){return ringCenter.clone().addScaledVector(right,Math.cos(t)*r).addScaledVector(up,Math.sin(t)*r).addScaledVector(normal,offset);}
  const link=(aa:T.Vector3,bb:T.Vector3,width:number,c:string)=>beam(aa.x,aa.y,aa.z,bb.x,bb.y,bb.z,width,c,true);
  const n=96;for(let i=0;i<n;i++){if(i===25||i===26)continue;const a0=i/n*Math.PI*2,a1=(i+1)/n*Math.PI*2;
    for(const d of [-.44,.44]){link(ringPt(11,a0,d),ringPt(11,a1,d),.26,amber);link(ringPt(12.1,a0,d),ringPt(12.1,a1,d),.28,i%4===0?m:amber);}
    link(ringPt(11,a0,.44),ringPt(12.1,a1,.44),.11,m);if(i%3===0)link(ringPt(11,a0,-.44),ringPt(12.1,a0,.44),.24,ink);
  }
  for(const dx of [-8.6,8.6]){const p=ringCenter.clone().addScaledVector(right,dx);mast(p.x,p.z,9.4,1.05);}
  const material=new T.MeshStandardMaterial({roughness:.78,metalness:.18});
  for(const [geo,items] of groups){const mesh=new T.InstancedMesh(geo,material,items.length);for(let i=0;i<items.length;i++){mesh.setMatrixAt(i,items[i].matrix);mesh.setColorAt(i,items[i].color);}mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();scene.add(mesh);}
}
