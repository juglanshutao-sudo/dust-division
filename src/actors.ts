import * as T from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { GameState } from './sim';

type V = [number, number, number];
const TAU = Math.PI * 2;
const v = (p: V) => new T.Vector3(...p);
const mix = (a:number,b:number,t:number) => a+(b-a)*t;
const solids = { paint:0, metal:1, rubber:2, glass:3, light:4, signal:5 } as const;
type Surface = keyof typeof solids;

/** Hand-built panels share material batches. Wheels and moving joints remain independent. */
class Parts {
  private pieces = new Map<Surface,T.BufferGeometry[]>();
  constructor(private materials: T.Material[]) {}
  place(geo:T.BufferGeometry, color:string, pos:V=[0,0,0], rotation:V=[0,0,0], surface:Surface='paint', quat?:T.Quaternion) {
    const flat = geo.index ? geo.toNonIndexed() : geo;
    if(flat!==geo) geo.dispose();
    const orientation = quat ?? new T.Quaternion().setFromEuler(new T.Euler(...rotation));
    flat.applyMatrix4(new T.Matrix4().compose(v(pos),orientation,new T.Vector3(1,1,1)));
    if(!flat.attributes.normal) flat.computeVertexNormals();
    if(!flat.attributes.uv) flat.setAttribute('uv',new T.Float32BufferAttribute(new Float32Array(flat.attributes.position.count*2),2));
    const c = new T.Color(color), rgb = new Float32Array(flat.attributes.position.count*3);
    for(let i=0;i<rgb.length;i+=3) { rgb[i]=c.r; rgb[i+1]=c.g; rgb[i+2]=c.b; }
    flat.setAttribute('color',new T.BufferAttribute(rgb,3));
    const bucket = this.pieces.get(surface) ?? [];
    bucket.push(flat); this.pieces.set(surface,bucket);
  }
  box(pos:V, size:V, color:string, rotation:V=[0,0,0], surface:Surface='paint') {
    this.place(new T.BoxGeometry(...size),color,pos,rotation,surface);
  }
  rod(a:V,b:V,r:number,color:string,surface:Surface='metal',n=8,r2=r) {
    const A=v(a),B=v(b), delta=B.clone().sub(A), center=A.clone().add(B).multiplyScalar(.5);
    const q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),delta.clone().normalize());
    this.place(new T.CylinderGeometry(r2,r,delta.length(),n),color,center.toArray() as V,[0,0,0],surface,q);
  }
  polygon(points:V[],color:string,surface:Surface='paint',out?:V) {
    const normal = v(points[1]).sub(v(points[0])).cross(v(points[2]).sub(v(points[0])));
    const verts = out && normal.dot(v(out))<0 ? points.slice().reverse() : points;
    const pos:number[]=[];
    for(let i=1;i<verts.length-1;i++) pos.push(...verts[0],...verts[i],...verts[i+1]);
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.Float32BufferAttribute(pos,3));
    this.place(geometry,color,[0,0,0],[0,0,0],surface);
  }
  // sections from nose to tail: station, lower/upper heights, waist/top half-width, chamfer.
  shell(rows:[number, number, number, number, number, number][],color:string,surface:Surface='paint') {
    const sections = rows.map(([z,l,h,w,t,d]):V[]=>[
      [-w+d,l,z],[w-d,l,z],[w,l+d,z],[w,h-d,z],[t,h,z],[-t,h,z],[-w,h-d,z],[-w,l+d,z]
    ]);
    this.polygon(sections[0].slice().reverse(),color,surface);
    this.polygon(sections[sections.length-1],color,surface);
    for(let a=0;a<sections.length-1;a++) for(let i=0;i<8;i++) {
      const j=(i+1)%8;
      this.polygon([sections[a][i],sections[a][j],sections[a+1][j],sections[a+1][i]],color,surface);
    }
  }
  finish(group:T.Group) {
    for(const [kind,geos] of this.pieces) {
      const merged=mergeGeometries(geos,false);
      if(!merged) throw new Error('Actor geometry attributes mismatch');
      const mesh = new T.Mesh(merged,this.materials[solids[kind]]);
      mesh.castShadow=kind!=='light'&&kind!=='signal'; mesh.receiveShadow=true;
      group.add(mesh); geos.forEach(g=>g.dispose());
    }
    this.pieces.clear();
  }
}

// Tileable finish atlas: cast-metal grain, long abrasions and broken paint flecks.
// Object-space projection keeps their physical scale consistent across bevels and panels.
function surfaceAtlas(){
  const n=128, pix=new Uint8Array(n*n*4), rnd=(x:number,y:number)=>{
    const h=Math.imul((x+151)^(y*257+389),0x45d9f3b);return((h^(h>>>17))>>>0)/4294967296;
  };
  const noise=(x:number,y:number,period:number)=>{
    const gx=x/n*period, gy=y/n*period, i=Math.floor(gx),j=Math.floor(gy);
    const f=gx-i,g=gy-j, u=f*f*(3-2*f),w=g*g*(3-2*g);
    return mix(mix(rnd(i,j),rnd((i+1)%period,j),u),mix(rnd(i,(j+1)%period),rnd((i+1)%period,(j+1)%period),u),w);
  };
  for(let y=0;y<n;y++)for(let x=0;x<n;x++){
    const i=(y*n+x)*4,grain=rnd(x,y),cloud=.46*noise(x,y,4)+.32*noise(x,y,11)+.22*noise(x,y,31);
    pix[i]=Math.round(cloud*255);pix[i+1]=Math.round(grain*255);
    pix[i+2]=(grain>.83&&cloud>.62)?210:0;pix[i+3]=255;
  }
  for(let k=0;k<117;k++){
    const x=Math.floor(rnd(k,3)*n), y=Math.floor(rnd(5,k)*n), d=2+Math.round(rnd(k,8)*9),slope=(rnd(91,k)-.5)*.59;
    for(let j=0;j<d;j++)pix[((y+Math.round(slope*j)+n)%n*n+(x+j)%n)*4+2]=Math.round(105+116*Math.sin(Math.PI*j/d));
  }
  const tex=new T.DataTexture(pix,n,n);tex.wrapS=tex.wrapT=T.RepeatWrapping;tex.magFilter=T.LinearFilter;tex.minFilter=T.LinearMipmapLinearFilter;tex.generateMipmaps=true;tex.needsUpdate=true;return tex;
}
function materials(atlas:T.Texture) {
  const std=(roughness:number,metalness:number) => new T.MeshStandardMaterial({vertexColors:true,roughness,metalness});
  const finish=(m:T.MeshStandardMaterial,strength:number)=>{
    m.customProgramCacheKey=()=>`field-finish-${strength}`;
    m.onBeforeCompile=sh=>{
      sh.uniforms.finishAtlas={value:atlas};
      sh.vertexShader='varying vec3 finishP; varying vec3 finishN;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nfinishP=position;finishN=normal;');
      sh.fragmentShader='varying vec3 finishP; varying vec3 finishN;uniform sampler2D finishAtlas;\n'+sh.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
        vec3 nw=pow(abs(normalize(finishN)),vec3(5.)); nw/=max(.0001,nw.x+nw.y+nw.z);
        vec3 f=(texture2D(finishAtlas,finishP.zy*.76).rgb*nw.x+texture2D(finishAtlas,finishP.xz*.76).rgb*nw.y+texture2D(finishAtlas,finishP.xy*.76).rgb*nw.z);
        float facingUp=max(0.,finishN.y);float patina=smoothstep(.41,.71,f.r);
        diffuseColor.rgb*=.89+.17*f.g+.13*f.r;
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.31,.259,.163),patina*(.055+.073*facingUp));
        diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.212,.193,.147),f.b*${strength.toFixed(2)});
      `);
    };return m;
  };
  const glass=std(.24,.31);
  glass.onBeforeCompile=sh=>{
    sh.vertexShader='varying vec3 windowPos;varying vec3 windowNorm;\n'+sh.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nwindowPos=(modelMatrix*vec4(position,1.)).xyz;windowNorm=normalize(mat3(modelMatrix)*normal);');
    sh.fragmentShader='varying vec3 windowPos; varying vec3 windowNorm;\n'+sh.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
      vec3 sight=normalize(windowPos-cameraPosition);vec3 reflection=reflect(sight,normalize(windowNorm));
      float horizon=smoothstep(-.19,.26,reflection.y);float fresnel=pow(1.-clamp(abs(dot(sight,normalize(windowNorm))),0.,1.),2.);
      diffuseColor.rgb+=mix(vec3(.004,.004,.002),vec3(.057,.069,.057),horizon)*(.32+.69*fresnel);`);
  };
  return [finish(std(.67,.22),.55),finish(std(.50,.49),.39),finish(std(.95,.015),.12),glass,
    new T.MeshBasicMaterial({vertexColors:true}),new T.MeshBasicMaterial({vertexColors:true})];
}
const amber='#c48b25', ochre='#d5a83f', pale='#e1bb61', olive='#75633c', carbon='#302e27', black='#201f1b', steel='#65625a', silver='#9c998a', ivory='#e7e2ca';
const wheelZ=[-1.93,.10,1.96];

function makeWheel(mats:T.Material[]) {
  const g=new T.Group(), p=new Parts(mats);
  const profile=[[.22,-.295],[.37,-.30],[.49,-.275],[.565,-.23],[.605,-.17],[.618,-.07],[.62,.07],[.605,.17],[.565,.23],[.49,.275],[.37,.30],[.22,.295],[.22,-.295]];
  p.place(new T.LatheGeometry(profile.map(([r,y])=>new T.Vector2(r,y)),36),'#3c3931',[0,0,0],[0,0,Math.PI/2],'rubber');
  for(let i=0;i<31;i++) {
    const a=TAU*i/31;
    for(const side of [-1,1]) {
      const angle=a+(side>0?.038:0);
      // Alternating, deep chevron blocks cut a distinct silhouette against the road.
      const q = new T.Quaternion().setFromEuler(new T.Euler(angle,0,0)).multiply(new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),side*.39));
      p.place(new T.BoxGeometry(.30,.073,.112),i%4===0?'#4a463b':'#393830',[side*.112,Math.cos(angle)*.624,Math.sin(angle)*.624],[0,0,0],'rubber',q);
    }
  }
  for(const s of [-1,1]) {
    p.rod([s*.23,0,0],[s*.295,0,0],.31,'#514e42','metal',24);
    p.rod([s*.294,0,0],[s*.318,0,0],.255,'#80725b','metal',16);
    p.rod([s*.316,0,0],[s*.35,0,0],.128,'#46463f','metal',12);
    for(let i=0;i<8;i++) {
      const a=i*TAU/8, y=Math.cos(a)*.197,z=Math.sin(a)*.197;
      p.rod([s*.314,y,z],[s*.334,y,z],.026,'#aaa18b','metal',6);
    }
    for(const radius of [.34,.423,.49])
      p.place(new T.TorusGeometry(radius,.009,4,30),'#4c483b',[s*(radius>.45?.278:.299),0,0],[0,Math.PI/2,0],'rubber');
  }
  p.finish(g); return g;
}

function decalTexture() {
  const canvas=document.createElement('canvas'); canvas.width=1024; canvas.height=512;
  const c=canvas.getContext('2d')!;
  c.fillStyle='#e0d6ad'; c.font='900 156px Arial,sans-serif'; c.fillText('07',20,167);
  c.fillStyle='#2f3027'; c.font='900 56px Arial,sans-serif'; c.fillText('DD   /   SURVEY',278,77);
  c.font='bold 26px monospace'; c.fillText('MOBILE FIELD DIVISION',281,123);
  c.fillStyle='#d5b74c'; c.fillRect(26,223,378,75); c.fillStyle='#2a2a22';
  c.save(); c.beginPath(); c.rect(26,223,378,75);c.clip();
  for(let i=-2;i<10;i++){c.beginPath(); c.moveTo(26+i*60,223); c.lineTo(51+i*60,223); c.lineTo(97+i*60,298);c.lineTo(72+i*60,298);c.fill();}c.restore();
  c.fillStyle='#e4dbbc'; c.font='bold 40px monospace'; c.fillText('A—07',550,245);
  c.fillStyle='#272a24'; c.fillRect(20,348,375,88);c.fillStyle='#ddd7bf';c.font='bold 25px monospace'; c.fillText('LIFT POINT',36,382);c.fillRect(36,398,328,5);c.font='bold 16px monospace';c.fillText('GVW  8.15 T    GRP / 07',36,424);
  const t=new T.CanvasTexture(canvas); t.colorSpace=T.SRGBColorSpace; t.anisotropy=4; return t;
}
function decal(group:T.Group, mat:T.Material, corners:V[], box:[number,number,number,number]) {
  const geometry=new T.BufferGeometry(); const [x,y,w,h]=box;
  const uv=[[x,512-y-h],[x+w,512-y-h],[x+w,512-y],[x,512-y]];
  for(const pt of uv){pt[0]/=1024;pt[1]/=512;}
  const idx=[0,1,2,0,2,3];
  geometry.setAttribute('position',new T.Float32BufferAttribute(idx.flatMap(i=>corners[i]),3));
  geometry.setAttribute('uv',new T.Float32BufferAttribute(idx.flatMap(i=>uv[i]),2)); geometry.computeVertexNormals();
  group.add(new T.Mesh(geometry,mat));
}
function makeRover(mats:T.Material[],stencil:T.Material) {
  const g=new T.Group(), body=new T.Group(), p=new Parts(mats);g.add(body);
  // Rock sliders, ladder frame, skid plate and differentials are visible from the hero's low camera.
  p.shell([[-2.95,.60,.92,.85,.86,.085],[-2.55,.53,1.22,1.04,.99,.11],[2.49,.56,1.22,1.0,.93,.13],[2.89,.70,.98,.88,.82,.09]],'#555044','metal');
  for(const s of [-1,1]) {
    p.box([s*.71,.62,0],[.13,.16,5.25],black,[0,0,0],'metal');
    p.rod([s*1.12,.74,-2.55],[s*1.12,.74,2.53],.061,steel);
    for(const z of wheelZ) {
      p.rod([s*.47,.65,z-.32],[s*1.31,.62,z],.09,steel);
      p.rod([s*.79,.67,z+.49],[s*1.27,.66,z],.055,steel);
      p.rod([s*.91,1.05,z+.22],[s*1.29,.64,z-.09],.055,silver);
      p.rod([s*.93,1.05,z+.21],[s*1.12,.84,z+.04],.095,carbon);
    }
  }
  p.shell([[-2.91,.94,1.36,1.03,.92,.12],[-2.33,.86,1.59,1.23,1.03,.15],[-1.43,.87,1.68,1.245,1.08,.15],[1.94,.89,1.53,1.22,1.05,.14],[2.77,.97,1.46,1.10,.99,.13]],amber);
  // Hood is a separate sloping stamped panel with raised spine and exposed latches.
  p.shell([[-2.82,1.31,1.42,.91,.82,.035],[-2.33,1.47,1.65,.99,.87,.054],[-1.41,1.56,1.72,1.03,.90,.056]],ochre);
  p.shell([[-2.72,1.425,1.46,.34,.31,.02],[-2.30,1.638,1.687,.37,.32,.021],[-1.48,1.70,1.755,.39,.34,.022]],pale);
  for(const s of [-1,1]) {
    for(let i=0;i<7;i++) p.box([s*.67,1.69-i*.009,-1.57-i*.085],[.36,.027,.039],carbon,[-.08,0,s*.012],'metal');
    for(const z of [-2.60,-1.58]) p.box([s*.91,z< -2?1.506:1.68,z],[.10,.046,.15],steel,[-.1,0,0],'metal');
  }
  // Front lighting recess, radiator fins and wrapped winch guard.
  p.box([0,1.13,-2.905],[1.86,.30,.067],black,[0,0,0],'rubber');
  for(let i=0;i<14;i++) p.box([-.44+i*.066,1.14,-2.95],[.024,.223,.019],steel,[0,0,.16],'metal');
  for(const s of [-1,1]) {
    p.box([s*.77,1.188,-2.957],[.44,.145,.056],carbon,[0,s*.07,0],'metal');
    p.box([s*.777,1.19,-2.992],[.361,.092,.018],'#fff3c5',[0,s*.07,0],'light');
    for(let i=0;i<3;i++) p.box([s*(.656+i*.098),1.19,-3.01],[.014,.114,.014],black);
    p.box([s*.93,1.01,-2.96],[.13,.056,.048],'#de6f21',[0,0,0],'signal');
    p.rod([s*.89,.79,-3.08],[s*1.11,.90,-2.83],.053,silver);
    p.rod([s*.79,.77,-3.05],[s*.79,.95,-2.96],.044,silver);
    p.box([s*.66,.79,-3.036],[.16,.119,.10],'#a65129',[0,0,0],'metal');
  }
  p.rod([-.91,.79,-3.08],[.91,.79,-3.08],.065,steel);
  p.box([0,.83,-2.99],[.60,.18,.17],black,[0,0,0],'metal');
  p.rod([-.20,.84,-3.09],[.20,.84,-3.09],.055,silver);
  // Armored cabin: steep belt line, inset pillars and heavy tinted split windscreen.
  p.shell([[-1.59,1.45,1.70,1.025,.96,.05],[-.90,1.45,2.47,1.07,.91,.13],[.48,1.45,2.48,1.08,.92,.14],[.96,1.43,2.04,1.04,.94,.09]],ochre);
  for(const s of [-1,1]) {
    const win:V[]=[[s*.044,1.76,-1.566],[s*.931,1.76,-1.566],[s*.842,2.386,-1.003],[s*.044,2.386,-1.003]];
    p.polygon(win,'#34443e','glass',[0,1,-1]);
    p.polygon([[s*.055,2.341,-1.047],[s*.84,2.341,-1.047],[s*.842,2.385,-1.006],[s*.055,2.385,-1.006]],'#637069','glass',[0,1,-1]);
    p.rod([s*.23,1.764,-1.58],[s*.61,1.965,-1.401],.015,black);
    p.rod([s*.40,1.857,-1.503],[s*.78,2.061,-1.32],.017,black);
    // Door side plane nearly vertical at window sill; upper glass follows sloped cabin shoulder.
    const sx=(y:number) => s*(1.085-Math.max(0,y-2.33)*1.0);
    p.polygon([[sx(1.76),1.76,-1.43],[sx(1.76),1.76,-.11],[sx(2.33),2.33,-.11],[sx(2.33),2.33,-.855]],'#33433f','glass',[s,0,0]);
    p.polygon([[sx(1.76),1.76,-.032],[sx(1.76),1.76,.67],[sx(2.12),2.12,.67],[sx(2.33),2.33,.44],[sx(2.33),2.33,-.032]],'#2c3735','glass',[s,0,0]);
    p.polygon([[s*1.088,1.69,-1.46],[s*1.088,1.69,.64],[s*1.088,1.735,.64],[s*1.088,1.735,-1.46]],carbon,'rubber',[s,0,0]);
    p.rod([s*1.075,1.64,-1.40],[s*1.062,2.43,-.88],.037,carbon);
    p.rod([s*1.04,1.63,-1.09],[s*1.328,1.91,-1.15],.025,steel);
    p.box([s*1.334,1.956,-1.16],[.074,.183,.263],black,[-.05,0,s*.12],'rubber');
    p.box([s*1.116,1.57,.52],[.039,.049,.20],carbon,[0,0,0],'metal');
  }
  p.shell([[-1.025,2.423,2.504,.946,.87,.033],[-.81,2.46,2.556,.98,.915,.044],[.48,2.46,2.556,.98,.915,.044],[.68,2.37,2.47,.95,.89,.038]],olive);
  // Roof mesh basket, straps, storage pod, navigation light and forward lamp bar.
  p.box([0,2.562,-.04],[1.42,.071,1.06],carbon,[0,0,0],'metal');
  for(const x of [-.63,0,.63]) p.rod([x,2.626,-.48],[x,2.626,.43],.038,silver);
  for(const s of [-1,1]) {
    p.rod([s*.83,2.64,-.70],[s*.83,2.64,.53],.034,steel);
    for(const z of [-.67,.48])p.rod([s*.80,2.49,z],[s*.83,2.64,z],.028,steel);
  }
  p.box([.20,2.688,.05],[.78,.205,.64],'#80795c',[0,0,0],'metal');
  for(const z of [-.19,.27])p.box([.20,2.795,z],[.784,.019,.058],carbon);
  p.box([0,2.554,-.98],[1.41,.143,.11],carbon,[0,0,0],'metal');
  for(let i=0;i<8;i++)p.box([-.605+i*.173,2.56,-1.042],[.125,.073,.018],'#d9d6b0',[0,0,0],'light');
  // Bogie arches and stamped bolt-on outriggers.
  for(const s of [-1,1]) {
    for(const z of wheelZ) {
      const a=s*1.00,b=s*1.527;
      const stations=[[-.79,.99],[-.58,1.29],[-.38,1.353],[.38,1.353],[.59,1.29],[.78,.99]];
      for(let i=0;i<stations.length-1;i++) {
        const [u,h]=stations[i],[u2,h2]=stations[i+1];
        p.polygon([[a,h,z+u],[a,h2,z+u2],[b,h2,z+u2],[b,h,z+u]],olive,'paint',[0,1,0]);
        p.polygon([[b,h-.071,z+u],[b,h2-.071,z+u2],[b,h2,z+u2],[b,h,z+u]],steel,'metal',[s,0,0]);
      }
      p.box([s*1.3,.86,z+.73],[.38,.35,.045],carbon,[.12,0,0],'rubber');
    }
    p.box([s*1.23,.92,-.93],[.36,.09,.48],carbon,[0,0,0],'metal');
    for(let i=0;i<4;i++)p.box([s*1.255,.973,-1.08+i*.10],[.31,.024,.022],silver,[0,0,0],'metal');
    // Removable tool locker and exterior handrails.
    p.box([s*1.215,1.25,1.055],[.135,.369,.71],'#756e56',[0,0,0],'metal');
    for(const zz of [.79,1.32])p.box([s*1.294,1.287,zz],[.024,.223,.043],silver,[0,0,0],'metal');
    p.rod([s*1.13,1.65,1.06],[s*1.13,1.65,2.56],.036,steel);
    for(const zz of [1.06,1.9,2.56])p.rod([s*1.12,1.44,zz],[s*1.13,1.65,zz],.035,steel);
    p.box([s*.89,1.22,2.786],[.20,.12,.03],'#aa3926',[0,0,0],'signal');
  }
  // Rear service deck, louvres and sealed recovery equipment.
  p.shell([[.91,1.49,1.73,.91,.81,.05],[1.25,1.49,1.91,.96,.85,.065],[2.51,1.46,1.88,.94,.82,.062],[2.72,1.44,1.64,.87,.77,.05]],'#9c873f');
  for(let i=0;i<10;i++)p.box([.27,1.912,1.32+i*.111],[.72,.031,.053],carbon,[0,0,0],'metal');
  p.rod([-.64,1.89,1.25],[-.64,1.89,2.40],.191,'#756e4b','metal',12);
  for(const z of [1.45,2.23])p.rod([-.64,1.89,z-.026],[-.64,1.89,z+.026],.198,carbon,'rubber',12);
  for(const side of [-1,1]) {
    const x=side*1.241;
    const panel:V[]=side>0?[[x,1.02,.62],[x,1.02,-.89],[x,1.413,-.89],[x,1.413,.62]]:[[x,1.02,-.89],[x,1.02,.62],[x,1.413,.62],[x,1.413,-.89]];
    // Outboard stencil plate placed just proud of waist, below glazing.
    for(const corner of panel)corner[0]=side*1.254;
    decal(body,stencil,panel,[0,0,794,184]);
    const xx=side*1.306, z1=.80,z2=1.31;
    decal(body,stencil,[[xx,1.23,z1],[xx,1.23,z2],[xx,1.36,z2],[xx,1.36,z1]],[21,345,378,93]);
    for(const z of [-2.18,-1.63,-.68,.45,1.12,2.29])p.rod([side*1.235,1.38,z],[side*1.255,1.38,z],.024,silver,'metal',6);
  }
  decal(body,stencil,[[-.54,1.019,-2.951],[.54,1.019,-2.951],[.54,1.08,-2.951],[-.54,1.08,-2.951]],[26,223,378,75]);
  // Fine tapered whips and a dust flag preserve the industrial scale in silhouette.
  p.rod([-.81,2.405,.50],[-.83,2.68,.52],.053,carbon);
  p.rod([-.83,2.67,.52],[-.94,3.51,.69],.014,black,'metal',6,.006);
  p.rod([-.95,3.48,.68],[-.952,3.54,.69],.025,'#ad5e22');
  p.rod([.87,1.72,2.39],[.98,2.96,2.62],.016,black,'metal',6,.006);
  p.polygon([[.972,2.85,2.596],[.978,2.93,2.609],[1.01,2.854,2.89]],'#a25a2f','paint');
  p.finish(body);
  const template=makeWheel(mats), wheels:T.Group[]=[];
  for(const z of wheelZ) for(const side of [-1,1]) {
    const wheel=template.clone(); wheel.position.set(side*1.26,.657,z); g.add(wheel); wheels.push(wheel);
  }
  return {g,body,wheels};
}

const rust='#984b35', oxidized='#654840', ash='#b4aba0', iron='#453f3d', core='#f66c48';
function makeColossus(mats:T.Material[],stencil:T.Material) {
  const g=new T.Group(), housing=new T.Group(), head=new T.Group(), p=new Parts(mats);g.add(housing);housing.add(head);
  // A retired walking kiln with an annular pressure vessel and a forward-looking survey head.
  p.shell([[-1.56,2.38,3.54,1.02,.82,.20],[-.92,2.05,3.89,1.36,1.11,.28],[1.23,2.13,4.0,1.29,1.04,.23],[1.78,2.43,3.56,1.0,.80,.18]],iron,'metal');
  p.rod([0,3.54,.16],[0,3.96,.16],1.07,'#69605a','metal',24);
  p.rod([0,3.54,.16],[0,3.59,.16],1.105,ash,'metal',32);
  for(const s of [-1,1]) {
    p.box([s*.79,3.88,.78],[.54,.79,1.11],oxidized,[-.11,0,s*.19]);
    p.box([s*1.41,3.23,.33],[.30,.58,1.42],rust,[0,0,s*.07]);
    p.rod([s*.75,4.0,1.20],[s*.81,5.35,1.48],.216,iron,'metal',12);
    p.rod([s*.81,5.21,1.45],[s*.83,5.43,1.49],.255,ash,'metal',12);
    for(let i=0;i<7;i++)p.box([s*1.575,3.23,-.27+i*.165],[.044,.31,.063],black,[-.15,0,0],'metal');
    p.rod([s*1.2,3.6,.1],[s*1.44,3.72,1.17],.034,ash);
  }
  p.finish(housing);
  const h=new Parts(mats);
  h.shell([[-2.29,3.56,4.50,.80,.50,.19],[-1.57,3.39,4.98,1.22,.89,.23],[-.38,3.46,5.05,1.32,.96,.26],[.66,3.59,4.55,1.02,.82,.19]],rust);
  h.shell([[-2.06,4.42,4.63,.52,.41,.09],[-1.40,4.85,5.11,.83,.60,.084],[-.54,4.89,5.16,.92,.69,.094]],ash);
  h.box([0,4.08,-2.29],[1.62,.355,.16],iron,[.1,0,0],'metal');
  h.box([0,4.11,-2.39],[1.31,.125,.05],core,[.10,0,0],'signal');
  for(let i=-3;i<=3;i++)h.box([i*.188,4.11,-2.424],[.026,.183,.031],black,[0,0,.04],'metal');
  for(const s of [-1,1]) {
    h.rod([s*.68,3.68,-1.91],[s*.77,3.41,-2.57],.10,iron,'metal');
    h.rod([s*.77,3.41,-2.57],[s*.74,3.59,-2.83],.083,silver,'metal',6,.025);
    h.box([s*1.22,4.08,-.94],[.20,.47,1.22],oxidized,[0,0,s*.06]);
    for(let j=0;j<5;j++)h.box([s*1.333,4.08,-1.35+j*.192],[.035,.27,.056],'#ce8a72',[-.28,0,0],'metal');
    h.rod([s*.93,4.77,-1.10],[s*1.02,5.45,-.90],.046,iron);
    h.rod([s*1.02,5.45,-.90],[s*1.08,5.97,-.78],.018,steel);
    decal(head,stencil,[[s*1.327,3.84,-1.38],[s*1.327,3.84,-.75],[s*1.327,4.11,-.75],[s*1.327,4.11,-1.38]],[546,207,183,46]);
  }
  h.finish(head);
  const legs:T.Group[]=[];
  for(const fore of [-1,1]) for(const side of [-1,1]) {
    const leg=new T.Group(), l=new Parts(mats);leg.position.set(side*.96,0,fore*.97);g.add(leg);
    const hip:V=[0,2.97,0],knee:V=[side*1.38,2.15,fore*.65],ankle:V=[side*1.77,.47,fore*1.19];
    l.rod([side*-.25,hip[1],0],[side*.36,hip[1],0],.42,steel,'metal',16);
    l.rod(hip,knee,.29,rust,'paint',6,.367);
    l.rod([side*.02,2.78,fore*.22],[side*1.42,1.99,fore*.81],.074,silver);
    l.rod([side*.04,2.76,fore*.22],[side*.73,2.37,fore*.51],.115,iron);
    l.rod([side*1.12,2.15,fore*.65],[side*1.62,2.15,fore*.65],.36,iron,'metal',16);
    l.rod([side*1.59,2.15,fore*.65],[side*1.67,2.15,fore*.65],.251,ash,'metal',10);
    l.rod(knee,ankle,.208,ash,'paint',5,.14);
    l.rod([side*1.21,2.05,fore*.51],[side*1.54,.50,fore*1.06],.073,silver,'metal');
    l.rod([side*1.21,2.05,fore*.51],[side*1.37,1.25,fore*.79],.116,iron,'metal');
    l.rod([side*1.65,.43,fore*1.19],[side*1.90,.43,fore*1.19],.19,iron,'metal',10);
    l.box([side*1.77,.20,fore*1.25],[.51,.22,.73],iron,[-fore*.06,0,side*.05],'metal');
    for(const toe of [-1,1])l.rod([side*1.77+toe*.15,.22,fore*1.40],[side*1.77+toe*.18,.063,fore*1.87],.091,ash,'metal',6,.015);
    l.finish(leg);legs.push(leg);
  }
  return {g,housing,head,legs};
}

function makeOperator(mats:T.Material[],id:number) {
  const g=new T.Group(), torso=new T.Group(), p=new Parts(mats);g.add(torso);
  const cloth=['#62594f','#54595a','#645041'][id], plate=['#ab8e64','#afb4a9','#a5644b'][id];
  p.shell([[-.17,.89,1.29,.201,.177,.05],[.04,.85,1.45,.235,.196,.054],[.19,.90,1.34,.19,.167,.044]],cloth,'rubber');
  p.box([0,1.227,-.167],[.37,.275,.083],plate,[.07,0,0]);
  for(let i=-1;i<=1;i++)p.box([i*.11,1.041,-.173],[.086,.12,.087],iron,[0,0,0],'rubber');
  p.box([0,.925,.016],[.412,.113,.312],carbon,[0,0,0],'rubber');
  p.box([0,1.19,.201],[.335,.402,.158],olive,[0,0,0],'rubber');
  p.rod([0,1.38,.011],[0,1.52,.009],.104,black,'rubber');
  p.shell([[-.172,1.53,1.66,.112,.099,.025],[-.086,1.479,1.737,.153,.118,.044],[.10,1.485,1.728,.145,.104,.039],[.151,1.56,1.66,.10,.075,.024]],plate);
  p.box([0,1.585,-.16],[.247,.085,.057],black,[-.03,0,0],'glass');
  p.box([0,1.606,-.193],[.17,.023,.009],id===2?'#df9875':'#c9c2a9',[0,0,0],'light');
  p.rod([-.115,1.36,.24],[-.155,1.73,.32],.014,steel,'metal',5,.006);
  p.finish(torso);
  const arms:T.Group[]=[],legs:T.Group[]=[];
  for(const s of [-1,1]) {
    const arm=new T.Group(), a=new Parts(mats);arm.position.set(s*.22,1.34,-.009);torso.add(arm);
    a.rod([0,-.012,0],[s*.043,-.237,-.014],.085,cloth,'rubber',7,.069);
    a.box([s*.013,-.059,0],[.17,.141,.196],plate,[.09,0,s*.16]);
    a.rod([s*.043,-.221,-.011],[s*.034,-.398,-.125],.068,plate,'paint',7,.053);
    a.box([s*.039,-.396,-.12],[.106,.116,.13],black,[.18,0,0],'rubber');
    if(s===1){
      if(id===0){
        a.rod([.045,-.406,.018],[.045,-.405,-.65],.028,steel);
        a.box([.044,-.41,-.62],[.15,.25,.132],ash,[0,0,0],'metal');
      }else{
        a.rod([.045,-.397,.17],[.045,-.397,-.70],.024,steel);
        a.rod([.045,-.397,-.58],[.045,-.397,-.79],.05,id===1?ivory:core,'signal',6,.011);
      }
    }
    a.finish(arm);arms.push(arm);
    const leg=new T.Group(), l=new Parts(mats);leg.position.set(s*.115,.88,.01);g.add(leg);
    l.rod([0,0,0],[s*.024,-.39,-.025],.106,cloth,'rubber',7,.084);
    l.box([s*.022,-.40,-.08],[.14,.15,.098],plate,[-.04,0,0]);
    l.rod([s*.024,-.38,-.012],[s*.038,-.731,.008],.081,cloth,'rubber',7,.054);
    l.box([s*.038,-.779,-.077],[.145,.17,.266],carbon,[.025,0,0],'rubber');
    l.finish(leg);legs.push(leg);
  }
  return {g,torso,arms,legs};
}

function contact(sizeX:number,sizeZ:number,tex:T.Texture) {
  const mat=new T.MeshBasicMaterial({map:tex,color:0x211f15,transparent:true,opacity:.38,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2});
  const mesh=new T.Mesh(new T.PlaneGeometry(sizeX,sizeZ),mat);mesh.rotation.x=-Math.PI/2;mesh.renderOrder=1;return mesh;
}
function softMask(){
  const size=64, data=new Uint8Array(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const r=Math.hypot((x+.5-size/2)/(size/2),(y+.5-size/2)/(size/2));
    const a=Math.max(0,1-r*r); const i=(y*size+x)*4;
    data[i]=data[i+1]=data[i+2]=255;data[i+3]=Math.round(255*a*a);
  }
  const tex=new T.DataTexture(data,size,size);tex.magFilter=T.LinearFilter;tex.minFilter=T.LinearFilter;tex.needsUpdate=true;return tex;
}
function slashMesh() {
  const pos:number[]=[], uv:number[]=[];const n=36;
  const xy=(a:number,r:number):V=>[Math.sin(a)*r,.80+Math.sin(a*.8)*.24,-Math.cos(a)*r];
  for(let i=0;i<n;i++){
    const f=i/n,t=(i+1)/n, a=mix(-1.37,1.92,f),b=mix(-1.37,1.92,t);
    const r1=1.50-Math.sin(f*Math.PI)*.25,r2=1.50-Math.sin(t*Math.PI)*.25;
    pos.push(...xy(a,r1),...xy(a,1.50),...xy(b,1.50),...xy(a,r1),...xy(b,1.50),...xy(b,r2));
    uv.push(f,0,f,1,t,1,f,0,t,1,t,0);
  }
  const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(pos,3));geo.setAttribute('uv',new T.Float32BufferAttribute(uv,2));
  const mat=new T.MeshBasicMaterial({color:ivory,transparent:true,opacity:.8,side:T.DoubleSide,depthWrite:false});return new T.Mesh(geo,mat);
}
function makeDust() {
  const count=42, geo=new T.BufferGeometry();
  const pos=new Float32Array(count*3),life=new Float32Array(count),size=new Float32Array(count);
  geo.setAttribute('position', new T.BufferAttribute(pos,3).setUsage(T.DynamicDrawUsage));
  geo.setAttribute('aLife',new T.BufferAttribute(life,1).setUsage(T.DynamicDrawUsage));
  geo.setAttribute('aSize',new T.BufferAttribute(size,1));
  const mat=new T.ShaderMaterial({transparent:true,depthWrite:false,uniforms:{uDpr:{value:1}},vertexShader:`attribute float aLife; attribute float aSize; uniform float uDpr; varying float life; void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(aSize*160.0*uDpr/max(0.5,-p.z),1.0,92.);life=aLife;}`,
    fragmentShader:`varying float life;void main(){vec2 p=gl_PointCoord*2.-1.;float d=dot(p,p);if(d>1.)discard;float a=pow(1.-d,2.)*life*.31;gl_FragColor=vec4(.70,.62,.46,a);\n#include <colorspace_fragment>\n}`});
  const points=new T.Points(geo,mat);points.frustumCulled=false;points.renderOrder=3;
  const vx=new Float32Array(count), vz=new Float32Array(count);let cursor=0,acc=0;
  function tick(dt:number,x:number,y:number,z:number,heading:number,speed:number,drift:number){
    acc+=dt*Math.max(0,Math.abs(speed)-.9)*(1.1+drift*1.9);
    while(acc>=1){acc--;const i=cursor++%count,side=(i%2===0?1:-1)*1.20;
      const back=1.9*Math.sign(speed),sin=Math.sin(heading),cos=Math.cos(heading);
      pos[i*3]=x-back*sin+side*cos;pos[i*3+1]=y+.19;pos[i*3+2]=z-back*cos-side*sin;
      life[i]=.92;size[i]=1.02+((i*17)%11)*.08;vx[i]=-sin*speed*.13+side*.3;vz[i]=-cos*speed*.13;
    }
    let live=false;
    for(let i=0;i<count;i++)if(life[i]>0){live=true;life[i]=Math.max(0,life[i]-dt*.72);pos[i*3]+=vx[i]*dt;pos[i*3+1]+=.38*dt;pos[i*3+2]+=vz[i]*dt;}
    if(live){geo.attributes.position.needsUpdate=true;geo.attributes.aLife.needsUpdate=true;geo.attributes.aSize.needsUpdate=true;}
    points.visible=live;
  }
  return {points,tick};
}

export function createActors(scene:T.Scene,terrainHeight:(x:number,z:number)=>number) {
  const all=new T.Group();all.name='Field Division';scene.add(all);
  const finishMap=surfaceAtlas(), mats=materials(finishMap), atlas=decalTexture(), contactMap=softMask();
  const stencil=new T.MeshStandardMaterial({map:atlas,roughness:.86,transparent:true,alphaTest:.38,side:T.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2});
  const vehicle=makeRover(mats,stencil), colossus=makeColossus(mats,stencil);
  const squad=[0,1,2].map(id=>makeOperator(mats,id));
  const rover=vehicle.g,boss=colossus.g;rover.name='R-07 Longhaul';boss.name='Kiln Warden';all.add(rover,boss,...squad.map(op=>op.g));
  const vehicleContact=contact(4.7,8.1,contactMap);vehicleContact.position.y=.022;rover.add(vehicleContact);
  const bossContact=contact(8.8,8.2,contactMap);bossContact.position.y=.03;boss.add(bossContact);
  for(const op of squad){const shadow=contact(1.15,1.29,contactMap);shadow.position.y=.025;op.g.add(shadow);}
  const arc=slashMesh();all.add(arc);
  const lines=new T.Group();all.add(lines);
  const warningMaterial=new T.MeshBasicMaterial({color:'#ce5a43',transparent:true,opacity:.8,side:T.DoubleSide,depthWrite:false});
  const dangerFill=new T.MeshBasicMaterial({color:'#ae4b38',transparent:true,opacity:.12,side:T.DoubleSide,depthWrite:false});
  const zones=([['sweep',1.7],['lunge',.48],['slam',Math.PI]] as const).map(([move,angle])=>{
    const shape=new T.Group();lines.add(shape);
    const groundRing=(inner:number,outer:number,material:T.Material)=>{
      const mesh=new T.Mesh(new T.RingGeometry(inner,outer,72,1,-Math.PI*.5-angle,angle*2),material);
      mesh.rotation.x=-Math.PI/2;shape.add(mesh);
    };
    groundRing(.976,1,warningMaterial);groundRing(.018,.976,dangerFill);
    const ticks=new Parts(mats);
    for(let i=0;i<Math.ceil(angle*10);i++) {
      const a=-angle+i*2*angle/Math.ceil(angle*10),r=.949;
      ticks.box([Math.sin(a)*r,.008,Math.cos(a)*r],[.008,.004,i%4===0?.077:.036],'#df927a',[0,a,0],'signal');
    }
    if(move!=='slam')for(const s of [-1,1]) {
      const a=s*angle;
      ticks.rod([0,.007,0],[Math.sin(a),.007,Math.cos(a)],.006,'#bd6b52','signal',4);
    }
    ticks.finish(shape);return {shape,move};
  });
  const impact=new T.Group(), bursts=new Parts(mats);all.add(impact);
  for(let i=0;i<21;i++){
    const a=i*2.39996,rad=.35+.091*(i%6),up=((i*7)%20-8)*.076;
    bursts.rod([Math.cos(a)*rad*.41,up*.41,Math.sin(a)*rad*.41],[Math.cos(a)*rad,up,Math.sin(a)*rad],.016,i%3===0?core:ivory,'signal',3,.003);
  }
  bursts.finish(impact);
  const arcBolt=new T.Line(new T.BufferGeometry().setAttribute('position',new T.BufferAttribute(new Float32Array(8*3),3).setUsage(T.DynamicDrawUsage)),new T.LineBasicMaterial({color:ivory,transparent:true,opacity:.9}));
  arcBolt.frustumCulled=false;all.add(arcBolt);
  const guard=new T.Mesh(new T.TorusGeometry(.63,.018,5,40,Math.PI*1.5),new T.MeshBasicMaterial({color:ivory,transparent:true,opacity:.82,depthWrite:false}));all.add(guard);
  const pulse=new T.Mesh(new T.RingGeometry(.966,1,96),warningMaterial.clone());pulse.rotation.x=-Math.PI/2;all.add(pulse);
  const dust=makeDust();all.add(dust.points);
  let time=0, wheelRoll=0,lastSpeed=0, lastX=NaN,lastZ=0,stride=0,partyTravel=0,lastBX=NaN,lastBZ=0,bossStride=0,bossTravel=0;
  function update(dt:number,s:GameState){
    time+=dt;
    const parked=s.mode===1&&!s.started;
    const r=parked?{x:0,z:0,heading:0,speed:0,drift:0}:s.rover;
    const ground=terrainHeight(r.x,r.z), yaw=r.heading+Math.PI;
    const sn=Math.sin(r.heading), cs=Math.cos(r.heading);
    // Suspension follows the road plane, independently of the sprung body.
    const f=terrainHeight(r.x+sn*2,r.z+cs*2), b=terrainHeight(r.x-sn*2,r.z-cs*2);
    const l=terrainHeight(r.x-cs*1.22,r.z+sn*1.22),ri=terrainHeight(r.x+cs*1.22,r.z-sn*1.22);
    const pitch=Math.atan2(f-b,4),roll=Math.atan2(l-ri,2.44);
    rover.position.set(r.x,ground+.016,r.z);rover.rotation.order='YXZ';rover.rotation.set(pitch,yaw,roll,'YXZ');
    wheelRoll-=r.speed*dt/.655;
    for(const wheel of vehicle.wheels)wheel.rotation.x=wheelRoll;
    const speed=Math.abs(r.speed), shake=Math.min(1,speed*.085);
    const acceleration=dt>0?T.MathUtils.clamp((r.speed-lastSpeed)/dt,-12,12):0;lastSpeed=r.speed;
    vehicle.body.position.y=Math.sin(time*(7+speed*.3))*.014*shake;
    vehicle.body.rotation.x=mix(vehicle.body.rotation.x,acceleration*.002+Math.sin(time*9)*shake*.005,1-Math.exp(-dt*8));
    dust.tick(dt,r.x,ground,r.z,r.heading,r.speed,Number(r.drift));
    const a=s.party, arena=s.boss, fx=s.fx;
    const partyVisible=s.mode===4 || (s.raid.active && s.mode===3);
    const dx=Number.isFinite(lastX)?a.x-lastX:0, dz=Number.isFinite(lastX)?a.z-lastZ:0;
    partyTravel=mix(partyTravel,T.MathUtils.clamp(Math.hypot(dx,dz)/Math.max(.001,dt),0,6),1-Math.exp(-dt*12));
    stride+=dt*(4+partyTravel*2.2);lastX=a.x;lastZ=a.z;
    const dir=Math.sin(a.heading), forward=Math.cos(a.heading);
    const formation=a.formation.filter(id=>id!==a.active);
    for(let id=0;id<squad.length;id++) {
      const op=squad[id];op.g.visible=partyVisible;if(!partyVisible)continue;
      const active=id===a.active, flank=active?0:formation.indexOf(id)===0?-1:1;
      const xx=a.x+flank*1.25*forward-(active?0:1.24)*dir, zz=a.z-flank*1.25*dir-(active?0:1.24)*forward;
      const beat=Math.sin(stride+id*1.1), amp=Math.min(.52,partyTravel*.11);
      op.g.position.set(xx,terrainHeight(xx,zz)+Math.abs(beat)*amp*.07,zz);
      op.g.rotation.y=a.heading+Math.PI;
      op.torso.rotation.z=active?fx.dodge*.23:0;
      op.torso.rotation.x=active?-.11*fx.attack-.19*fx.parry:0;
      op.torso.rotation.y=active?Math.sin(fx.attack*Math.PI*1.35)*.52:0;
      for(let i=0;i<2;i++){
        const alt=i===0?1:-1;op.legs[i].rotation.x=beat*amp*alt;
        op.arms[i].rotation.x=-beat*amp*alt-.12-(active&&i===1?(fx.parry*.8+fx.attack*1.19):0);
        op.arms[i].rotation.z=alt*.08-(active&&i===1?Math.sin(Math.PI*fx.attack)*.85:0);
      }
    }
    const dead=arena.stage==='dead', broken=arena.stage==='broken', warned=arena.stage==='windup';
    boss.visible=partyVisible;
    boss.position.set(arena.x,terrainHeight(arena.x,arena.z),arena.z);
    const face=arena.heading+Math.PI;
    const driven=Number.isFinite(lastBX)?Math.hypot(arena.x-lastBX,arena.z-lastBZ):0;
    bossTravel=mix(bossTravel,Math.min(3,driven/Math.max(.001,dt)),1-Math.exp(-dt*6));
    bossStride+=Math.min(.16,driven)*1.8;lastBX=arena.x;lastBZ=arena.z;
    if(!dead)boss.rotation.y+=Math.atan2(Math.sin(face-boss.rotation.y),Math.cos(face-boss.rotation.y))*(1-Math.exp(-dt*3.6));
    const warn=warned?arena.telegraph:0, strike=arena.stage==='strike'?1:0, stagger=broken||arena.stage==='stunned';
    const h=colossus.housing;
    h.position.y=mix(h.position.y,(dead?-1.76:stagger?-.73:0)+Math.sin(time*1.69)*.051-warn*.30,1-Math.exp(-dt*6));
    h.rotation.z=mix(h.rotation.z,dead?.37:stagger?-.13:0,1-Math.exp(-dt*4));
    colossus.head.rotation.x=mix(colossus.head.rotation.x,dead?.28:stagger?-.15:warn*.15-strike*.19,1-Math.exp(-dt*7));
    colossus.head.rotation.y=mix(colossus.head.rotation.y,arena.move==='sweep'?warn*.32-strike*.42:0,1-Math.exp(-dt*8));
    for(let i=0;i<colossus.legs.length;i++){
      const leg=colossus.legs[i], sign=i%2===0?-1:1;
      leg.rotation.z=mix(leg.rotation.z,dead?sign*-.47:stagger?sign*-.17:sign*(-warn*.065+Math.sin(time*1.69+i*Math.PI*.75)*.010),1-Math.exp(-dt*5));
      const gait=dead?0:Math.sin(bossStride+((i===0||i===3)?0:Math.PI))*Math.min(1,bossTravel*.7);
      leg.rotation.x=gait*.107+Math.sin(time*1.23+i*1.7)*.017*(dead?0:1);
      leg.position.y=Math.max(0,gait)*.146;
    }
    const telegraphRadius=arena.range;
    lines.visible=partyVisible && warned;lines.position.set(arena.x,boss.position.y+.055,arena.z);
    lines.scale.set(telegraphRadius,1,telegraphRadius);lines.rotation.y=arena.heading;
    for(const zone of zones)zone.shape.visible=zone.move===arena.move;
    dangerFill.opacity=.055+.11*warn;
    warningMaterial.opacity=.38+.38*warn+.17*Math.sin(time*(5+warn*19));
    const isParry=fx.parry>.025;
    pulse.visible=partyVisible && (isParry || fx.finish>.025 || strike>0);
    const progress=isParry?1-fx.parry:fx.finish>.025?1-fx.finish:1-Math.min(1,arena.stageTime/.42);
    const radius=isParry?.64+progress*2.1:fx.finish>.025?1+progress*7:.7+progress*telegraphRadius;
    pulse.scale.setScalar(radius);pulse.material.opacity=Math.max(.08,1-progress);
    pulse.material.color.set(isParry?ivory:'#bc4936');
    pulse.position.set(isParry?a.x:arena.x,(isParry?terrainHeight(a.x,a.z):boss.position.y)+.07,isParry?a.z:arena.z);
    arc.visible=partyVisible&&fx.attack>.03;arc.position.set(a.x,terrainHeight(a.x,a.z),a.z);
    arc.rotation.y=a.heading+Math.PI+(1-fx.attack)*1.7-.8;arc.material.opacity=Math.min(.9,fx.attack*2);
    arc.material.color.set(a.active===2?'#e9a184':ivory);
    guard.visible=partyVisible && a.guard>0;
    guard.position.set(a.x+dir*.44,terrainHeight(a.x,a.z)+1.04,a.z+forward*.44);guard.rotation.set(-.23,a.heading,Math.PI*.74+a.guard*.75,'YXZ');
    impact.visible=partyVisible&&(fx.hit>.035||fx.finish>.025);impact.position.set(arena.x-dir*1.1,boss.position.y+2.69,arena.z-forward*1.1);
    impact.scale.setScalar(fx.finish>.025?2+(1-fx.finish)*4:.43+(1-fx.hit)*1.46);impact.rotation.y=arena.heading;
    arcBolt.visible=partyVisible && fx.hit>.54 && (a.active===1||fx.resonance>.53);
    if(arcBolt.visible){
      const coords=arcBolt.geometry.attributes.position;
      const y0=terrainHeight(a.x,a.z)+1.04;
      for(let k=0;k<8;k++){
        const f=k/7,noise=Math.sin(Math.floor(time*22)+k*15.73)*Math.sin(Math.PI*f);
        coords.setXYZ(k,mix(a.x,impact.position.x,f)+noise*.20,mix(y0,impact.position.y,f)+noise*.28,mix(a.z,impact.position.z,f)-noise*.21);
      }
      coords.needsUpdate=true;arcBolt.material.opacity=fx.hit;
    }
  }
  function dispose(){
    all.removeFromParent();const geometries=new Set<T.BufferGeometry>(), ownedMaterials=new Set<T.Material>(mats);
    all.traverse(obj=>{if(obj instanceof T.Mesh||obj instanceof T.Points||obj instanceof T.Line){geometries.add(obj.geometry);for(const m of Array.isArray(obj.material)?obj.material:[obj.material])ownedMaterials.add(m);}});
    geometries.forEach(geo=>geo.dispose());ownedMaterials.forEach(m=>m.dispose());atlas.dispose();contactMap.dispose();finishMap.dispose();
  }
  return {rover,boss,update,dispose};
}
