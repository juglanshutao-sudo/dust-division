import * as T from 'three';

import {randomSource,terrainHeight} from './landform';
export {randomSource,noise,terrainHeight} from './landform';
export const noiseGLSL=`
float h12(vec2 p){vec3 a=fract(vec3(p.xyx)*.1031);a+=dot(a,a.yzx+33.33);return fract((a.x+a.y)*a.z);}
float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h12(i),h12(i+vec2(1,0)),f.x),mix(h12(i+vec2(0,1)),h12(i+1.),f.x),f.y);}
`;
function textured(base:string,rock=false) {
  const m=new T.MeshStandardMaterial({color:base,roughness:.96,metalness:0,vertexColors:rock,flatShading:rock});
  m.onBeforeCompile = shader => {
    shader.vertexShader='varying vec3 vGeology;\n'+shader.vertexShader.replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvGeology=(modelMatrix*vec4(transformed,1.)).xyz;');
    shader.fragmentShader='varying vec3 vGeology;\n'+noiseGLSL+shader.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
    vec2 p=vGeology.xz;float erosion=n2(p*.14)*.52+n2(p*.87)*.24+n2(p*3.4)*.16+n2(p*11.)*.08;
    float strata=n2(vec2(p.x*.09+vGeology.z*.03,vGeology.y*2.8+sin(p.x*.2)*.3));
    float grain=n2(p*19.+vGeology.y*7.73);
    diffuseColor.rgb *= ${rock?'(.71+.34*erosion+.23*strata)':'(.62+.70*erosion+.17*grain)'};
    ${rock?'':'float rut=abs(abs(p.x-2.8*sin(p.y*.065))-1.05); diffuseColor.rgb*=1.-.14*(1.-smoothstep(.14,.32,rut))*(1.-smoothstep(8.,38.,abs(p.y+4.)));'}
    `);
  };
  return m;
}
export function createGeology(scene:T.Scene) {
  const random=randomSource(994), groundGeometry=new T.PlaneGeometry(440,440,180,180);
  groundGeometry.rotateX(-Math.PI/2);
  const pos=groundGeometry.attributes.position;
  for(let i=0;i<pos.count;i++)pos.setY(i,terrainHeight(pos.getX(i),pos.getZ(i)));
  groundGeometry.computeVertexNormals();
  const ground=new T.Mesh(groundGeometry,textured('#a7987a'));ground.receiveShadow=true;scene.add(ground);

  // Irregular geological beds share their exposed edges with the cap above.
  const verts:number[]=[], colors:number[]=[];
  const tone=new T.Color(), rangePalettes=[['#867d70','#a59681','#c2ad8c','#c9b69a','#a89982','#dac5a4'],['#887e6e','#9f8b6b','#ba9d79','#a59273','#cfb38d','#d2ba97']];
  const vertex=(v:number[],c:T.Color)=>{verts.push(v[0],v[1],v[2]);colors.push(c.r,c.g,c.b);};
  function mesa(cx:number,cz:number,rx:number,rz:number,top:number,shape:number,palette:string[]) {
    const count=Math.round(16+rx*.45),rings:number[][][]=[];
    const cuts=[0,.18,.32,.39,.52,.58,.68,.75,.86,.89,.98,1.0];
    const rr=[1,.87,.82,.75,.72,.65,.61,.61,.56,.48,.45,.4];
    const bottom=terrainHeight(cx,cz)-3,spin=random()*6.28;
    for(let y=0;y<cuts.length;y++) {
      const ring:number[][]=[];
      for(let j=0;j<count;j++) {
        const a=j/count*Math.PI*2+spin;
        const radial=1+.12*Math.sin(a*3+shape)+.10*Math.cos(a*5+shape*2)+.06*Math.sin(a*9+1.2*y/cuts.length);
        const x=cx+Math.cos(a)*rr[y]*radial*rx,z=cz+Math.sin(a)*rr[y]*radial*rz;
        ring.push([x,bottom+top*cuts[y]+.032*top*Math.sin(a*3+shape)+.017*top*Math.cos(a*6+y*.12),z]);
      } rings.push(ring);
    }
    for(let y=0;y<rings.length-1;y++)for(let j=0;j<count;j++) {
      const k=(j+1)%count; tone.set(palette[[0,1,2,1,4,1,3,2,4,2,5][y]]).multiplyScalar(.92+.12*random());
      const a=rings[y][j],b=rings[y][k],c=rings[y+1][j],d=rings[y+1][k];
      for(const v of [a,c,b,b,c,d])vertex(v,tone);
    }
    tone.set(palette[5]);const r=rings[rings.length-1];
    for(let j=0;j<count;j++)for(const v of [[cx,bottom+top,cz],r[(j+1)%count],r[j]])vertex(v,tone);
  }
  for(let i=0;i<67;i++) {
    const a=i/67*Math.PI*2,r=91+random()*74;
    const rx=10+random()*24,rz=7+random()*15;
    mesa(Math.cos(a)*r,Math.sin(a)*r-18,rx,rz,8+random()*21,random()*9,rangePalettes[i%2]);
  }
  for(const [x,z,rx,rz,h] of [[-58,-42,22,13,17],[-72,-11,15,18,21],[39,-69,28,12,16],[-47,15,21,9,13],[20,48,17,13,13],[-13,-95,17,12,14]])mesa(x,z,rx,rz,h,random()*8,rangePalettes[1]);
  const cliffGeometry=new T.BufferGeometry();cliffGeometry.setAttribute('position',new T.Float32BufferAttribute(verts,3));cliffGeometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));cliffGeometry.computeVertexNormals();
  const cliffs=new T.Mesh(cliffGeometry,textured('#ffffff',true));cliffs.material.side=T.DoubleSide;cliffs.receiveShadow=true;scene.add(cliffs);

  // Scree and low desert brush. Clustered distribution leaves vehicle paths clear.
  const dummy=new T.Object3D(),stoneColors=['#716d5f','#8c816a','#b2a189','#686458','#c8b59a'];
  const stones=new T.InstancedMesh(new T.DodecahedronGeometry(1,0),new T.MeshStandardMaterial({roughness:1,flatShading:true}),1250);
  for(let i=0;i<stones.count;i++) {
    const x=(random()-.5)*169,z=(random()-.5)*146-20;
    let size=.065+random()**3*.75;
    if(Math.abs(x-2.8*Math.sin(z*.065))<3 || (Math.abs(x)<21&&Math.abs(z+23)<15))size*=.19;
    dummy.position.set(x,terrainHeight(x,z)+size*.15,z);dummy.scale.set(size*(1+random()),size*(.34+random()*.4),size);dummy.rotation.set(random()*.3,random()*6.28,random()*.4);dummy.updateMatrix();stones.setMatrixAt(i,dummy.matrix);stones.setColorAt(i,tone.set(stoneColors[i%5]));
  }stones.receiveShadow=true;scene.add(stones);
  const grass:number[]=[],grassColors:number[]=[];
  for(let i=0;i<875;i++) {
    const x=(random()-.5)*120,z=(random()-.5)*111-14;
    if(Math.abs(x)<20&&z<-6&&z>-39 || Math.abs(x-2.8*Math.sin(z*.065))<3.5 || (x>26&&x<48&&z<-13&&z>-42))continue;
    const y=terrainHeight(x,z),height=.13+random()*.37;const c=new T.Color(i%3===0?'#807755':'#a99967');
    for(let j=0;j<7;j++){const a=random()*6.28,dx=Math.cos(a),dz=Math.sin(a),s=.1+random()*.23,w=.016+random()*.03;grass.push(x-dz*w,y,z+dx*w,x+dz*w,y,z-dx*w,x+dx*s,y+height*(.45+random()),z+dz*s);for(let k=0;k<3;k++)grassColors.push(c.r,c.g,c.b);}
  }
  const gr=new T.BufferGeometry();gr.setAttribute('position',new T.Float32BufferAttribute(grass,3));gr.setAttribute('color',new T.Float32BufferAttribute(grassColors,3));gr.computeVertexNormals();scene.add(new T.Mesh(gr,new T.MeshLambertMaterial({side:T.DoubleSide,vertexColors:true})));
  return ground;
}
