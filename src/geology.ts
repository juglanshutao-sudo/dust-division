import * as T from 'three'

import { randomSource, terrainHeight } from './landform'
export { randomSource, noise, terrainHeight } from './landform'
export const noiseGLSL = `
float h12(vec2 p){vec3 a=fract(vec3(p.xyx)*.1031);a+=dot(a,a.yzx+33.33);return fract((a.x+a.y)*a.z);}
float n2(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h12(i),h12(i+vec2(1,0)),f.x),mix(h12(i+vec2(0,1)),h12(i+1.),f.x),f.y);}
`
function textured(
  base: string,
  rock = false,
  lowDetail = false,
  aggregate?: T.Texture,
  ready?: { value: number },
) {
  const m = lowDetail
    ? new T.MeshLambertMaterial({ color: base, vertexColors: rock })
    : new T.MeshStandardMaterial({
        color: base,
        roughness: 0.96,
        metalness: 0,
        vertexColors: rock,
        flatShading: rock,
      })
  m.onBeforeCompile = (shader) => {
    if (aggregate) {
      shader.uniforms.quarryAggregate = { value: aggregate }
      shader.uniforms.aggregateReady = ready!
    }
    shader.vertexShader =
      'varying vec3 vGeology;\n' +
      shader.vertexShader.replace(
        '#include <worldpos_vertex>',
        '#include <worldpos_vertex>\nvGeology=(modelMatrix*vec4(transformed,1.)).xyz;',
      )
    shader.fragmentShader =
      (aggregate ? 'uniform sampler2D quarryAggregate;uniform float aggregateReady;\n' : '') +
      'varying vec3 vGeology;\n' +
      noiseGLSL +
      shader.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
    vec2 p=vGeology.xz;float erosion=n2(p*.14)*.52+n2(p*.87)*.24+n2(p*3.4)*.16+n2(p*11.)*.08;
    float strata=n2(vec2(p.x*.09+vGeology.z*.03,vGeology.y*2.8+sin(p.x*.2)*.3));
    float grain=n2(p*19.+vGeology.y*7.73);
    diffuseColor.rgb *= ${rock ? '(.71+.34*erosion+.23*strata)' : '(.62+.70*erosion+.17*grain)'};
    ${
      aggregate
        ? `if(aggregateReady>.5){
      vec2 coarse=mat2(.788,.616,-.616,.788)*p*.18+vec2(.38,.11);
      vec3 chips=mix(texture2D(quarryAggregate,p*.347).rgb,texture2D(quarryAggregate,coarse).rgb,.25+.29*n2(p*.11));
      vec3 aggregateColor=clamp(chips/vec3(.497,.440,.376),vec3(.27),vec3(2.22));
      diffuseColor.rgb*=mix(vec3(1.),aggregateColor,.78);
    }
    vec2 apron=p-vec2(36.,-30.);float radial=length(apron),pad=(1.-smoothstep(10.7,11.55,radial+erosion*.34));
    float soot=dot(diffuseColor.rgb,vec3(.21,.72,.07));
    diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.78,.82,.87)*(.009+soot*.41),pad);
    float lane=1.-smoothstep(.055,.12,abs(radial-9.0));
    float dash=step(.46,fract(atan(apron.y,apron.x)*12.7324));
    float worn=smoothstep(.27,.68,grain+erosion*.19);
    diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.39,.31,.22),pad*lane*dash*worn*.76);`
        : ''
    }
    ${rock ? '' : 'float rut=abs(abs(p.x-2.8*sin(p.y*.065))-1.05); diffuseColor.rgb*=1.-.14*(1.-smoothstep(.14,.32,rut))*(1.-smoothstep(8.,38.,abs(p.y+4.)));'}
    `,
      )
  }
  return m
}
export function createGeology(scene: T.Scene, lowDetail = false) {
  const random = randomSource(994),
    groundGeometry = new T.PlaneGeometry(440, 440, lowDetail ? 49 : 148, lowDetail ? 49 : 148)
  groundGeometry.rotateX(-Math.PI / 2)
  const pos = groundGeometry.attributes.position
  for (let i = 0; i < pos.count; i++) pos.setY(i, terrainHeight(pos.getX(i), pos.getZ(i)))
  groundGeometry.computeVertexNormals()
  const aggregateReady = { value: 0 }
  const aggregate = new T.TextureLoader().load(`${import.meta.env.BASE_URL}art/quarry-gravel.webp`, () => {
    aggregateReady.value = 1
  })
  aggregate.colorSpace = T.SRGBColorSpace
  aggregate.wrapS = aggregate.wrapT = T.RepeatWrapping
  aggregate.anisotropy = lowDetail ? 1 : 4
  const groundMaterial = textured('#a7987a', false, lowDetail, aggregate, aggregateReady)
  groundMaterial.addEventListener('dispose', () => aggregate.dispose())
  const ground = new T.Mesh(groundGeometry, groundMaterial)
  ground.receiveShadow = true
  scene.add(ground)

  // Irregular geological beds share their exposed edges with the cap above.
  const verts: number[] = [],
    colors: number[] = []
  const cliffMaterial = textured('#ffffff', true, lowDetail)
  cliffMaterial.side = T.DoubleSide
  function flushCliffs() {
    if (!verts.length) return
    const geo = new T.BufferGeometry()
    geo.setAttribute('position', new T.Float32BufferAttribute(verts, 3))
    geo.setAttribute('color', new T.Float32BufferAttribute(colors, 3))
    geo.computeVertexNormals()
    geo.computeBoundingSphere()
    const mesh = new T.Mesh(geo, cliffMaterial)
    mesh.receiveShadow = true
    scene.add(mesh)
    verts.length = 0
    colors.length = 0
  }

  const tone = new T.Color(),
    rangePalettes = [
      ['#867d70', '#a59681', '#c2ad8c', '#c9b69a', '#a89982', '#dac5a4'],
      ['#887e6e', '#9f8b6b', '#ba9d79', '#a59273', '#cfb38d', '#d2ba97'],
    ]
  const vertex = (v: number[], c: T.Color) => {
    verts.push(v[0], v[1], v[2])
    colors.push(c.r, c.g, c.b)
  }
  function mesa(
    cx: number,
    cz: number,
    rx: number,
    rz: number,
    top: number,
    shape: number,
    palette: string[],
  ) {
    const count = Math.round((16 + rx * 0.45) * (lowDetail ? 0.62 : 1)),
      rings: number[][][] = []
    const cuts = lowDetail
      ? [0, 0.32, 0.52, 0.68, 0.86, 0.98, 1]
      : [0, 0.18, 0.32, 0.39, 0.52, 0.58, 0.68, 0.75, 0.86, 0.89, 0.98, 1.0]
    const rr = lowDetail
      ? [1, 0.82, 0.72, 0.61, 0.56, 0.45, 0.4]
      : [1, 0.87, 0.82, 0.75, 0.72, 0.65, 0.61, 0.61, 0.56, 0.48, 0.45, 0.4]
    const bottom = terrainHeight(cx, cz) - 3,
      spin = random() * 6.28
    for (let y = 0; y < cuts.length; y++) {
      const ring: number[][] = []
      for (let j = 0; j < count; j++) {
        const a = (j / count) * Math.PI * 2 + spin
        const radial =
          1 +
          0.12 * Math.sin(a * 3 + shape) +
          0.1 * Math.cos(a * 5 + shape * 2) +
          0.06 * Math.sin(a * 9 + (1.2 * y) / cuts.length)
        const x = cx + Math.cos(a) * rr[y] * radial * rx,
          z = cz + Math.sin(a) * rr[y] * radial * rz
        ring.push([
          x,
          bottom +
            top * cuts[y] +
            0.032 * top * Math.sin(a * 3 + shape) +
            0.017 * top * Math.cos(a * 6 + y * 0.12),
          z,
        ])
      }
      rings.push(ring)
    }
    for (let y = 0; y < rings.length - 1; y++)
      for (let j = 0; j < count; j++) {
        const k = (j + 1) % count
        tone.set(palette[[0, 1, 2, 1, 4, 1, 3, 2, 4, 2, 5][y]]).multiplyScalar(0.92 + 0.12 * random())
        const a = rings[y][j],
          b = rings[y][k],
          c = rings[y + 1][j],
          d = rings[y + 1][k]
        for (const v of [a, c, b, b, c, d]) vertex(v, tone)
      }
    tone.set(palette[5])
    const r = rings[rings.length - 1]
    for (let j = 0; j < count; j++)
      for (const v of [[cx, bottom + top, cz], r[(j + 1) % count], r[j]]) vertex(v, tone)
    if (lowDetail) flushCliffs()
  }
  for (let i = 0; i < (lowDetail ? 42 : 67); i++) {
    const a = (i / (lowDetail ? 42 : 67)) * Math.PI * 2,
      r = 91 + random() * 74
    const rx = 10 + random() * 24,
      rz = 7 + random() * 15
    mesa(Math.cos(a) * r, Math.sin(a) * r - 18, rx, rz, 8 + random() * 21, random() * 9, rangePalettes[i % 2])
  }
  for (const [x, z, rx, rz, h] of [
    [-58, -42, 22, 13, 17],
    [-72, -11, 15, 18, 21],
    [39, -69, 28, 12, 16],
    [-47, 15, 21, 9, 13],
    [20, 48, 17, 13, 13],
    [-13, -95, 17, 12, 14],
  ])
    mesa(x, z, rx, rz, h, random() * 8, rangePalettes[1])
  flushCliffs()

  // Scree and low desert brush. Clustered distribution leaves vehicle paths clear.
  const dummy = new T.Object3D(),
    stoneColors = ['#716d5f', '#8c816a', '#b2a189', '#686458', '#c8b59a']
  const stones = new T.InstancedMesh(
    lowDetail ? new T.IcosahedronGeometry(1, 0) : new T.DodecahedronGeometry(1, 0),
    lowDetail ? new T.MeshLambertMaterial() : new T.MeshStandardMaterial({ roughness: 1, flatShading: true }),
    lowDetail ? 235 : 1250,
  )
  for (let i = 0; i < stones.count; i++) {
    const x = (random() - 0.5) * 169,
      z = (random() - 0.5) * 146 - 20
    let size = 0.065 + random() ** 3 * 0.75
    if (Math.abs(x - 2.8 * Math.sin(z * 0.065)) < 3 || (Math.abs(x) < 21 && Math.abs(z + 23) < 15))
      size *= 0.19
    dummy.position.set(x, terrainHeight(x, z) + size * 0.15, z)
    dummy.scale.set(size * (1 + random()), size * (0.34 + random() * 0.4), size)
    dummy.rotation.set(random() * 0.3, random() * 6.28, random() * 0.4)
    dummy.updateMatrix()
    stones.setMatrixAt(i, dummy.matrix)
    stones.setColorAt(i, tone.set(stoneColors[i % 5]))
  }
  stones.receiveShadow = true
  scene.add(stones)
  const grass: number[] = [],
    grassColors: number[] = []
  for (let i = 0; i < (lowDetail ? 285 : 875); i++) {
    const x = (random() - 0.5) * 120,
      z = (random() - 0.5) * 111 - 14
    if (
      (Math.abs(x) < 20 && z < -6 && z > -39) ||
      Math.abs(x - 2.8 * Math.sin(z * 0.065)) < 3.5 ||
      (x > 26 && x < 48 && z < -13 && z > -42)
    )
      continue
    const y = terrainHeight(x, z),
      height = 0.13 + random() * 0.37
    const c = new T.Color(i % 3 === 0 ? '#807755' : '#a99967')
    for (let j = 0; j < 7; j++) {
      const a = random() * 6.28,
        dx = Math.cos(a),
        dz = Math.sin(a),
        s = 0.1 + random() * 0.23,
        w = 0.016 + random() * 0.03
      grass.push(
        x - dz * w,
        y,
        z + dx * w,
        x + dz * w,
        y,
        z - dx * w,
        x + dx * s,
        y + height * (0.45 + random()),
        z + dz * s,
      )
      for (let k = 0; k < 3; k++) grassColors.push(c.r, c.g, c.b)
    }
  }
  const gr = new T.BufferGeometry()
  gr.setAttribute('position', new T.Float32BufferAttribute(grass, 3))
  gr.setAttribute('color', new T.Float32BufferAttribute(grassColors, 3))
  gr.computeVertexNormals()
  scene.add(new T.Mesh(gr, new T.MeshLambertMaterial({ side: T.DoubleSide, vertexColors: true })))
  return ground
}
