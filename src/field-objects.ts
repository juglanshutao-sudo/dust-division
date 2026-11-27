import * as T from 'three';
import {terrainHeight} from './geology';
import {EXTRACTION, type GameState, type GridNode} from './sim';

export function createFieldObjects(scene:T.Scene){
  const root=new T.Group();scene.add(root);
  const box=new T.BoxGeometry(),tube=new T.CylinderGeometry(.5,.5,1,12),cone=new T.ConeGeometry(.5,1,10),o=new T.Object3D();
  const matte=new T.MeshStandardMaterial({roughness:.77,metalness:.2}),body=new T.Color('#a7a692'),metal=new T.Color('#414a47'),charcoal=new T.Color('#222c2a'),amber=new T.Color('#c58931'),lamp=new T.Color('#46cf7c');
  const up=new T.Vector3(0,1,0),start=new T.Vector3(),end=new T.Vector3();
  type Items=Map<T.BufferGeometry,{m:T.Matrix4,c:T.Color}[]>;
  const add=(items:Items,g:T.BufferGeometry,c:T.Color)=>{let b=items.get(g);if(!b){b=[];items.set(g,b);}o.updateMatrix();b.push({m:o.matrix.clone(),c});};
  function part(items:Items,g:T.BufferGeometry,x:number,y:number,z:number,w:number,h:number,d:number,c:T.Color,rot=0){o.position.set(x,y,z);o.quaternion.identity();o.rotation.y=rot;o.scale.set(w,h,d);add(items,g,c);}
  function line(items:Items,ax:number,ay:number,az:number,bx:number,by:number,bz:number,d:number,c:T.Color){start.set(ax,ay,az);end.set(bx,by,bz);o.position.copy(start).add(end).multiplyScalar(.5);start.sub(end);o.scale.set(d,start.length(),d);o.quaternion.setFromUnitVectors(up,start.normalize());add(items,tube,c);}
  function batch(items:Items){const group=new T.Group();for(const [geo,rows] of items){const shape=new T.InstancedMesh(geo,matte,rows.length);rows.forEach((row,i)=>{shape.setMatrixAt(i,row.m);shape.setColorAt(i,row.c);});shape.castShadow=true;shape.receiveShadow=true;shape.computeBoundingSphere();group.add(shape);}return group;}
  function release(group:T.Group){for(const v of group.children){if(v instanceof T.InstancedMesh)v.dispose();}group.removeFromParent();}
  function node(items:Items,n:GridNode){
    const x=n.x,z=n.z,y=terrainHeight(x,z)+.16;
    const cube=(dx:number,dy:number,dz:number,w:number,h:number,d:number,c:T.Color)=>part(items,box,x+dx,y+dy,z+dz,w,h,d,c);
    const cyl=(dx:number,dy:number,dz:number,w:number,h:number,c:T.Color)=>part(items,tube,x+dx,y+dy,z+dz,w,h,w,c);
    cube(0,.08,0,2.39,.18,2.39,metal);for(const dx of [-1,1])for(const dz of [-1,1])cube(dx*.99,.22,dz*.98,.24,.14,.24,amber);
    if(n.kind==='generator'){cube(0,.64,0,1.55,1,1.44,body);cube(0,.89,.76,1.6,.28,.095,amber);for(let j=0;j<6;j++)cube(-.55+j*.215,1.18,0,.095,.1,1.28,metal);
      cyl(-.64,1.6,-.55,.34,1.2,metal);cyl(-.64,2.24,-.55,.48,.13,metal);cyl(.5,1.47,-.52,.27,.78,metal);}
    if(n.kind==='relay'){cyl(0,.48,0,.9,.72,body);cyl(0,1.35,0,.23,1.52,metal);cube(0,2.04,0,1.55,.14,.23,metal);for(const dx of [-.6,.6]){for(let j=0;j<3;j++)cyl(dx,2.16+j*.12,0,.24,.075,body);}}
    if(n.kind==='extractor'){for(const dx of [-.73,.73]){cube(dx,.85,0,.26,1.43,1.11,amber);line(items,x+dx,y+1.45,z,x,y+2.32,z-.37,.2,metal);}cube(0,1.5,0,1.7,.25,.66,body);cyl(0,1.1,0,.39,1.36,metal);part(items,cone,x,y+.39,z,.55,.55,.55,amber);}
    if(n.kind==='refinery'){cyl(-.3,1.08,0,1.08,1.79,body);part(items,cone,x-.3,y+2.06,z,1.09,.27,1.09,metal);for(const h of [.5,1.31,1.88])cyl(-.3,h,0,1.11,.095,metal);cyl(.55,.78,.32,.57,1.2,amber);line(items,x+.55,y+1.4,z+.32,x-.31,y+1.78,z+.32,.18,metal);}
    if(n.kind==='belt'){cube(0,.48,0,2.28,.52,1.19,metal);for(let k=0;k<8;k++)cube(-.98+k*.28,.766,0,.20,.065,1.11,body);for(const z1 of [-.64,.64])cube(0,.67,z1,2.28,.17,.09,amber);}
    cube(.76,.44,.79,.21,.21,.09,n.powered?lamp:amber);
  }
  let models=new T.Group(),signature='',flowLinks:{ax:number;az:number;bx:number;bz:number;cargo:boolean}[]=[];root.add(models);
  const packets=new T.InstancedMesh(box,new T.MeshBasicMaterial({color:'#a9f3a8'}),320);packets.count=0;packets.frustumCulled=false;root.add(packets);
  const flowDepth={value:null as T.DepthTexture|null},flowResolution={value:new T.Vector2(1,1)},flowOverlay={value:false};
  packets.layers.set(1);packets.material.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,{flowDepth,flowResolution,flowOverlay});
    shader.fragmentShader=`uniform sampler2D flowDepth;uniform vec2 flowResolution;uniform bool flowOverlay;\n`+shader.fragmentShader.replace('#include <alphatest_fragment>',`#include <alphatest_fragment>\nif(flowOverlay&&gl_FragCoord.z>texture2D(flowDepth,gl_FragCoord.xy/flowResolution).r+.00004)discard;`);
  };
  const plane=new T.PlaneGeometry(21,21,7,7);plane.rotateX(-Math.PI/2);
  const pad=plane.attributes.position;for(let i=0;i<pad.count;i++)pad.setY(i,terrainHeight(pad.getX(i),pad.getZ(i)-22)+.08);
  const gridMat=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{clock:{value:0}},vertexShader:`varying vec2 fieldUV;void main(){fieldUV=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec2 fieldUV;uniform float clock;void main(){vec2 xy=fieldUV*7.;vec2 cell=abs(fract(xy+.5)-.5)/max(fwidth(xy),vec2(.0001));float hair=1.-clamp(min(cell.x,cell.y),0.,1.);float cornerMask=1.-clamp(max(cell.x,cell.y)*.22,0.,1.);float border=1.-smoothstep(.002,.012,min(min(fieldUV.x,1.-fieldUV.x),min(fieldUV.y,1.-fieldUV.y)));vec3 c=mix(vec3(.14,.23,.19),vec3(.32,.66,.40),cornerMask);gl_FragColor=vec4(c,.075+hair*.12+border*.25+cornerMask*.2);}`});
  const grid=new T.Mesh(plane,gridMat);grid.position.set(0,0,-22);grid.renderOrder=2;root.add(grid);
  let caches=new T.Group(),cacheSignature='';root.add(caches);
  const ringGeo=new T.PlaneGeometry(2,2);ringGeo.rotateX(-Math.PI/2);
  function zone(isExit:boolean){const mat=new T.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,uniforms:{clock:{value:0},value:{value:0},angle:{value:0},move:{value:0},tint:{value:new T.Color(isExit?'#48c785':'#ee6850')},type:{value:isExit?1:0}},
    vertexShader:`varying vec2 local;void main(){local=position.xz;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`varying vec2 local;uniform float clock,value,angle,move,type;uniform vec3 tint;void main(){float r=length(local);float a=atan(local.x,local.y)-angle;float arc=cos(a);if(r>.99 || (type<.5&&move<1.5&&arc<(move>.5?.83:-.17)))discard;
    float rim=1.-smoothstep(.008,.024,abs(r-.95));float marks=(1.-smoothstep(.01,.048,abs(r-.84)))*step(.62,fract((a+3.14159)*9.5493));float sweep=1.-smoothstep(.012,.05,abs(r-fract(clock*.42)));float fill=.03+.16*value;gl_FragColor=vec4(tint,fill+.67*rim+.54*marks+.25*sweep);}`});
    const q=new T.Mesh(ringGeo,mat);q.renderOrder=3;root.add(q);return q;}
  const exit=zone(true);exit.position.set(EXTRACTION.x,terrainHeight(EXTRACTION.x,EXTRACTION.z)+.23,EXTRACTION.z);exit.scale.set(EXTRACTION.radius,1,EXTRACTION.radius);
  const shafts=new T.Group(),shaftGeo=new T.CylinderGeometry(.10,1.43,4.0,16,1,true);
  const shaftMat=new T.ShaderMaterial({transparent:true,depthWrite:false,side:T.FrontSide,blending:T.AdditiveBlending,
    uniforms:{clock:{value:0},density:{value:0}},vertexShader:`varying vec3 localPos;varying vec3 rayDir;void main(){localPos=position;vec4 w=modelMatrix*vec4(position,1.);rayDir=w.xyz-cameraPosition;gl_Position=projectionMatrix*viewMatrix*w;}`,
    fragmentShader:`varying vec3 localPos;varying vec3 rayDir;uniform float clock,density;void main(){vec3 ray=normalize(rayDir);float optical=0.;for(int i=0;i<7;i++){vec3 p=localPos+ray*(float(i)+.5)*.29;float down=(2.-p.y)*.25;float radius=.10+down*1.33;float depth=(1.-smoothstep(0.,max(radius,.001),length(p.xz)))*step(0.,down)*step(down,1.);float dust=.78+.22*sin(p.x*6.+p.z*3.+p.y*5.+clock*.6);optical+=depth*dust/(1.+down*3.); }gl_FragColor=vec4(vec3(.65,.64,.53),1.-exp(-optical*density));}`});
  for(const [x,z] of [[26,-38],[44,-38],[47,-23]]){const beam=new T.Mesh(shaftGeo,shaftMat);beam.position.set(x,terrainHeight(x,z)+2.05,z);shafts.add(beam);}root.add(shafts);
  let t=0;
  function update(dt:number,s:GameState,_night:number){
    t+=dt;shaftMat.uniforms.clock.value=t;shaftMat.uniforms.density.value=.016+.11*_night;shafts.visible=_night>.1;root.visible=s.started||s.mode!==1;if(!root.visible)return;
    const key=s.nodes.map(n=>`${n.id}.${n.kind}.${+n.powered}.${+n.linked}`).join('-')+'|'+s.links.map(l=>`${l.from}.${l.to}.${l.kind}`).join('-');
    if(key!==signature){signature=key;release(models);const items:Items=new Map();for(const n of s.nodes)node(items,n);const ids=new Map(s.nodes.map(n=>[n.id,n]));flowLinks=[];
      for(const l of s.links){const a=ids.get(l.from),b=ids.get(l.to);if(!a||!b)continue;const belt=l.kind==='belt',h=belt?.37:.66;line(items,a.x,terrainHeight(a.x,a.z)+h,a.z,b.x,terrainHeight(b.x,b.z)+h,b.z,belt?.45:.12,belt?charcoal:metal);
        if(belt?a.linked&&b.linked:a.powered&&b.powered)flowLinks.push({ax:a.x,az:a.z,bx:b.x,bz:b.z,cargo:belt});}
      models=batch(items);root.add(models);
    }
    grid.visible=s.mode===3&&!s.raid.active;gridMat.uniforms.clock.value=t;packets.count=Math.min(flowLinks.length,320);
    for(let j=0;j<packets.count;j++){const l=flowLinks[j],v=(t*(l.cargo?.58:1)+j*.34)%1,x=l.ax+(l.bx-l.ax)*v,z=l.az+(l.bz-l.az)*v;o.position.set(x,terrainHeight(x,z)+(l.cargo?.69:.81),z);o.rotation.set(0,Math.atan2(l.bx-l.ax,l.bz-l.az),0);let sz=l.cargo?.24:.095;o.scale.set(sz,sz,sz*1.6);o.updateMatrix();packets.setMatrixAt(j,o.matrix);}if(packets.count)packets.instanceMatrix.needsUpdate=true;
    const ck=(s.raid.active?'n':'d')+s.caches.map(c=>c.claimed?'1':'0').join('');if(ck!==cacheSignature){cacheSignature=ck;release(caches);const items:Items=new Map();for(const c of s.caches){if(c.claimed||s.raid.active!==c.night)continue;const y=terrainHeight(c.x,c.z);part(items,box,c.x,y+.38,c.z,1.35,.75,.88,amber);part(items,box,c.x,y+.78,c.z,1.42,.14,.92,body);for(const dx of [-.44,.44])part(items,box,c.x+dx,y+.42,c.z,.13,.84,.95,charcoal);part(items,box,c.x,y+.56,c.z+.47,.24,.12,.05,lamp);}caches=batch(items);root.add(caches);}
    exit.visible=s.raid.active;exit.material.uniforms.clock.value=t;exit.material.uniforms.value.value=s.raid.evacuating?1:.06;

  }
  return{update,depth(texture:T.DepthTexture|null,width:number,height:number){flowDepth.value=texture;flowResolution.value.set(width,height);flowOverlay.value=!!texture;},dispose(){release(models);release(caches);packets.dispose();root.removeFromParent();for(const g of [box,tube,cone,plane,ringGeo,shaftGeo])g.dispose();for(const m of [matte,packets.material,gridMat,exit.material,shaftMat])m.dispose();}};
}
