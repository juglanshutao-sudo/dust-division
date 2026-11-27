import * as T from 'three';
import {terrainHeight} from './landform';
import {CITY_BLOCKS,DISTRICT_SHEDS,DISTRICT_TANKS,DISTRICT_CARGO,GANTRIES,POWER_MASTS,SWITCHGEAR,CANOPY_POSTS} from './district-layout';

// Small architectural parts are instanced by primitive. A complete outpost costs
// a handful of draw calls even though every crane, tank and insulator is modeled.
export function buildArchitecture(scene:T.Scene,lowDetail=false) {
  const colors = { wall:'#c3b79f', white:'#e6dbc6', dark:'#333c3b', trim:'#686a60', amber:'#d59d36',blue:'#34495b', glass:'#343f40',copper:'#8e6145' };
  const groups=new Map<T.BufferGeometry,{matrix:T.Matrix4,color:T.Color}[]>();
  const cube=new T.BoxGeometry(1,1,1), cylinder=new T.CylinderGeometry(.5,.5,1,lowDetail?7:12),pipe=new T.CylinderGeometry(.5,.5,1,lowDetail?4:7),cone=new T.ConeGeometry(.5,1,lowDetail?7:12);
  const o=new T.Object3D(), a=new T.Vector3(),b=new T.Vector3(),yv=new T.Vector3(0,1,0);
  function register(g:T.BufferGeometry,c:string){o.updateMatrix();let l=groups.get(g);if(!l){l=[];groups.set(g,l);}l.push({matrix:o.matrix.clone(),color:new T.Color(c)});}
  function part(g:T.BufferGeometry,x:number,y:number,z:number,w:number,h:number,d:number,c:string,ry=0,rz=0){o.position.set(x,y,z);o.scale.set(w,h,d);o.rotation.set(0,ry,rz);register(g,c);}
  function beam(x1:number,y1:number,z1:number,x2:number,y2:number,z2:number,d:number,c:string,square=false){a.set(x1,y1,z1);b.set(x2,y2,z2);o.position.copy(a).add(b).multiplyScalar(.5);a.sub(b);o.scale.set(d,a.length(),d);o.quaternion.setFromUnitVectors(yv,a.normalize());register(square?cube:pipe,c);}
  const box=(x:number,y:number,z:number,w:number,h:number,d:number,c:string,ry=0)=>part(cube,x,y,z,w,h,d,c,ry);
  const cyl=(x:number,y:number,z:number,w:number,h:number,c:string)=>part(cylinder,x,y,z,w,h,w,c);
  const ink=colors.dark,w=colors.wall,m=colors.trim,white=colors.white,amber=colors.amber;
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
  // The western access street turns around the motor court and rejoins the depot road.
  road(-10.8,-11.1,3.15,24.5,0);road(-9.6,1.0,3,21.7,Math.PI/2);
  for(const [cx,cz] of [[-10.8,-19.65],[-10.8,-1.18],[22,-23.9]]){
    for(let k=-2;k<=2;k++)box(cx+k*.54,terrainHeight(cx,cz)+.106,cz,.25,.025,.83,'#cec4a9');
  }
  for(const site of DISTRICT_SHEDS)shed(site.x,site.z,site.width,site.depth,site.height,site.accent,site.doors);
  for(const bin of DISTRICT_TANKS)tank(bin.x,bin.z,bin.width,bin.height,white);
  for(const [x,z,h,len] of GANTRIES)crane(x,z,h,len);
  for(let i=0;i<POWER_MASTS.length;i++){
    const {x,z}=POWER_MASTS[i];mast(x,z,6.7,.53);
    if(i>0)for(const side of [-.55,.55]){let px=x-8,py=terrainHeight(px,z+.2)+7.2,pz=z+.2;
      for(let k=1;k<=6;k++){const t=k/6,bx=x-8+8*t,bz=z+.2*(1-t),by=terrainHeight(bx,bz)+7.1-.75*Math.sin(t*Math.PI);beam(px+side,py,pz,bx+side,by,bz,.035,ink);px=bx;py=by;pz=bz;}}
  }
  for(let i=0;i<14;i++){const x=-31+i*3.8,z=-40.5;box(x,.65,z,.24,1.3,.81,m);beam(x,1.28,z,x+3.8,1.28,z,.4,'#8f7f60');}
  for(const [i,container] of DISTRICT_CARGO.entries()){
    const {x,z,width,depth}=container,y=terrainHeight(x,z);box(x,y+.6,z,width,1.15,depth,i%3===0?amber:'#767966');
    for(let k=0;k<(lowDetail?3:6);k++)box(x-width*.4+k*width*.8/(lowDetail?2:5),y+.6,z+depth*.5+.01,.043,1.07,.035,ink);
  }
  // Recessed shops, gallery columns, a solid stair core and alternating balcony decks
  // give the inhabited blocks a separate construction vocabulary from the plant.
  for(const block of CITY_BLOCKS){
    const {x,z,width,depth,floors,style}=block,y=terrainHeight(x,z),base=2.15,storey=1.66;
    const front=z+depth*.5,side=x+width*.5,bodyColor=style==='market'?'#c0ab88':style==='tower'?'#c4c0ac':'#d1c6a7';
    const accent=style==='housing'?'#3b5470':style==='market'?'#af7b2c':'#475b66';
    box(x,y+.12,z,width+.42,.23,depth+.42,'#9f9b8b');
    box(x,y+base*.5,z-.19,width-.14,base,depth-.48,ink);
    for(let i=0;i<4;i++){
      const dx=x+width*((i+.5)/4-.5);
      box(dx,y+.91,front-.36,width*.206,1.32,.08,i%3===0?'#75817c':'#425459');
      box(dx,y+1.63,front-.32,width*.21,.22,.14,i%2?accent:w);
    }
    for(let i=0;i<5;i++)box(x+width*(i/4-.5),y+1.02,front+.09,.16,2.04,.17,white);
    box(x,y+base-.08,front-.1,width+.40,.25,1.02,accent);
    box(x,y+.099,front+.49,width+.58,.18,1.17,'#b4ac96');
    for(let k=1;k<=5;k++)box(x+width*(k/6-.5),y+.193,front+.56,.042,.012,1.0,'#8b887c');
    let top=base;
    for(let i=1;i<floors;i++){
      const reduced=style==='tower'&&i>=4?1.06:0;
      const floorWidth=width-reduced,floorDepth=depth-(style==='market'?.48:0)-reduced*.46;
      const levelZ=z-(style==='market'?.21:0),start=y+top;
      box(x,start+storey*.5,levelZ,floorWidth,storey,floorDepth,bodyColor);
      for(const f of [-1,1]){
        const face=levelZ+f*(floorDepth/2+.015);
        box(x,start+.86,face,floorWidth-.45,.70,.035,colors.glass);
        const count=lowDetail?4:6;
        for(let j=1;j<count;j++)box(x+floorWidth*(j/count-.5),start+.86,face+f*.025,.105,.72,.06,bodyColor);
      }
      const sideX=x+floorWidth*.5+.012;
      box(sideX,start+.87,levelZ,.046,.66,floorDepth-.39,colors.glass);
      for(const f of [-1,0,1])box(sideX+.036,start+.86,levelZ+floorDepth*f*.26,.07,.67,.11,bodyColor);
      const balcony=style==='housing' || style==='market'&&i===1;
      if(balcony){
        const bz=levelZ+floorDepth*.5+.24,balconyWidth=floorWidth*(style==='housing'?.65:.95),bx=x+(style==='housing'?(i%2?.13:-.13)*floorWidth:0);
        box(bx,start+.12,bz,balconyWidth,.19,.72,white);
        box(bx,start+.41,bz+.31,balconyWidth,.34,.09,accent);
        for(const end of [-1,1])box(bx+end*(balconyWidth*.5-.04),start+.41,bz,.09,.34,.67,accent);
      }
      box(x,start+storey-.077,levelZ,floorWidth+.14,.15,floorDepth+.14,style==='tower'?accent:white);top+=storey;
    }
    const roofWidth=style==='tower'?width-1.06:width,roofDepth=style==='tower'?depth-.49:depth;
    box(x,y+top+.06,z,roofWidth+.25,.17,roofDepth+.19,white);
    box(x-width*.32,y+top+.43,z-depth*.18,1.18,.77,1.4,accent);
    if(style==='tower'){
      cyl(x+.78,y+top+.53,z-.17,1.27,.92,'#8f9484');cyl(x+.78,y+top+1.04,z-.17,1.39,.10,white);
      cyl(x+.78,y+top+.32,z-.17,1.31,.09,ink);beam(x-.8,y+top+.65,z-1.1,x-.8,y+top+2.64,z-1.1,.062,m);
    }else if(style==='housing'){
      for(const dx of [.12,1.65]){cyl(x+dx,y+top+.59,z-.58,1.11,.97,'#ad9e7e');cyl(x+dx,y+top+1.1,z-.58,1.21,.11,m);}
      box(x-width*.40,y+(top+1.0)*.5,z+depth*.08,.81,top+.99,1.18,accent);
    }else{
      for(let j=0;j<3;j++){box(x+1.2,y+top+.29,z+.62*(j-1),1.10,.40,.50,m);}
      box(side+.018,y+top*.66,z+.31,.25,.77*top,.67,accent);
    }
  }
  // Refit forecourt, with enough headroom for the full R-07 roof basket.
  {const z=-7.66,roof=terrainHeight(0,z)+3.52;
    box(0,roof,z,5.63,.21,2.96,colors.blue);box(0,roof+.14,z,5.76,.10,3.09,amber);
    for(const post of CANOPY_POSTS){const y=terrainHeight(post.x,post.z);box(post.x,(y+roof)*.5,post.z,post.width,roof-y,post.depth,m);}
    for(const sx of [-1,1]){box(sx*1.54,roof-.13,z,.18,.045,1.62,white);for(let j=0;j<3;j++)box(sx*(.76+.39*j),terrainHeight(0,-5.8)+.10,-5.81,.11,.024,.78,'#d8ca91',.54);}
    mast(-2.7,-10.4,5.9,.34);
  }
  // Transformer cooling fins, ceramic bushings and twin elevated busbars.
  for(const bank of SWITCHGEAR){
    const {x,z,width,depth}=bank,y=terrainHeight(x,z);box(x,y+.84,z,width,1.62,depth,'#6e786b');
    for(let j=0;j<5;j++)box(x+width*(j/5-.4),y+.83,z+depth/2,.13,1.18,.34,m);
    for(const side of [-.41,.41])for(let i=0;i<4;i++)cyl(x+side,y+1.81+i*.18,z,.33-i*.032,.12,white);
  }
  for(const x of [-16.9,-12.05]){const z=-24.11,y=terrainHeight(x,z);beam(x,y+2.76,z,x,y+4.89,z,.15,m,true);}
  for(const z of [-24.13,-24.76]){const height=terrainHeight(-14.4,z)+4.77;beam(-16.93,height,z,-12.03,height,z,.135,amber,true);}
  // A north-lit sawtooth roof and two insulated exhausts mark the foundry.
  {const y=terrainHeight(0,-36);
    for(let i=0;i<3;i++){const x=-2.27+i*1.57;part(cube,x,y+4.45,-35.85,1.59,.12,3.74,white,0,.29);box(x+.72,y+4.41,-35.85,.12,.57,3.62,colors.glass);}
    for(const [x,z,h,d] of [[2.04,-36.88,8.08,.74],[.66,-37.48,6.66,.61]]){
      cyl(x,y+(4+h)/2,z,d,h-4,'#795f4a');cyl(x,y+4.39,z,d*1.35,.48,m);
      for(const t of [.66,.82,.97])cyl(x,y+4+(h-4)*t,z,d*1.12,.16,t===.82?white:m);
      cyl(x,y+h+.012,z,d*.75,.025,ink);
    }
  }
  // Parabolic reflector on a four-legged truss. Bowl and ribs share the normal
  // of the focal axis, leaving its silhouette legible from the city camera.
  {const x=13.59,z=-23.07,h=6.92,y=terrainHeight(x,z);mast(x,z,h,.67);
    const origin=new T.Vector3(x,y+h+.13,z),axis=new T.Vector3(.45,.71,.54).normalize();
    const right=new T.Vector3(axis.z,0,-axis.x).normalize(),up=new T.Vector3().crossVectors(axis,right).normalize();
    const radius=1.56,segments=lowDetail?12:20;
    const profile=[new T.Vector2(.035,0),new T.Vector2(.77,.088),new T.Vector2(radius,.39),new T.Vector2(radius,.43),new T.Vector2(.77,.13),new T.Vector2(.035,.03)];
    const dish=new T.LatheGeometry(profile,segments);o.position.copy(origin);o.scale.setScalar(1);o.quaternion.setFromUnitVectors(yv,axis);register(dish,'#d0c4a6');
    const rim=(angle:number)=>origin.clone().addScaledVector(axis,.44).addScaledVector(right,Math.cos(angle)*radius).addScaledVector(up,Math.sin(angle)*radius);
    const focus=origin.clone().addScaledVector(axis,1.30);
    for(let i=0;i<segments;i++){
      const p=rim(i*Math.PI*2/segments),q=rim((i+1)*Math.PI*2/segments);beam(p.x,p.y,p.z,q.x,q.y,q.z,.078,colors.blue);
      if(i%(segments/4)===0)beam(p.x,p.y,p.z,focus.x,focus.y,focus.z,.045,m);
    }
    box(focus.x,focus.y,focus.z,.20,.22,.20,amber);
  }
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
  const material=lowDetail?new T.MeshLambertMaterial():new T.MeshStandardMaterial({roughness:.78,metalness:.18});
  for(const [geo,items] of groups){
    // On a software adapter a single distant instance must not submit an entire district.
    const bins=new Map<string,typeof items>();for(const item of items){const e=item.matrix.elements,key=lowDetail?Math.floor(e[12]/18)+':'+Math.floor(e[14]/18):'all';let bin=bins.get(key);if(!bin){bin=[];bins.set(key,bin);}bin.push(item);}
    for(const bin of bins.values()){const mesh=new T.InstancedMesh(geo,material,bin.length);for(let i=0;i<bin.length;i++){mesh.setMatrixAt(i,bin[i].matrix);mesh.setColorAt(i,bin[i].color);}mesh.castShadow=true;mesh.receiveShadow=true;mesh.computeBoundingSphere();scene.add(mesh);}
  }
}
