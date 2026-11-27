/// <reference types="vite/client" />
import * as T from 'three'
import { createActors } from './actors'
import { buildArchitecture } from './architecture'
import { createGeology, terrainHeight, randomSource, noiseGLSL } from './geology'
import type { GameState } from './sim'
import { createFieldObjects } from './field-objects'

const v3 = (x = 0, y = 0, z = 0) => new T.Vector3(x, y, z)
const saturate = (n: number) => Math.min(1, Math.max(0, n))
const exp = (k: number, dt: number) => 1 - Math.exp(-k * dt)
function spring3(pos: T.Vector3, velocity: T.Vector3, target: T.Vector3, omega: number, dt: number) {
  const decay = Math.exp(-omega * dt)
  for (const key of ['x', 'y', 'z'] as const) {
    const error = pos[key] - target[key],
      b = velocity[key] + omega * error
    pos[key] = target[key] + (error + b * dt) * decay
    velocity[key] = (velocity[key] - omega * b * dt) * decay
  }
}
export function createWorld(canvas: HTMLCanvasElement) {
  const renderer = new T.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: 'high-performance',
    alpha: false,
    stencil: false,
  })
  const gl = renderer.getContext() as WebGL2RenderingContext
  const debugRenderer = gl.getExtension('WEBGL_debug_renderer_info')
  const adapterName = debugRenderer ? String(gl.getParameter(debugRenderer.UNMASKED_RENDERER_WEBGL)) : ''
  const software = /swiftshader|llvmpipe|softpipe|software rasterizer|microsoft basic render/i.test(
    adapterName,
  )
  renderer.info.autoReset = false
  renderer.shadowMap.autoUpdate = false
  renderer.shadowMap.needsUpdate = true
  renderer.setClearColor('#ece0c7')
  renderer.outputColorSpace = T.SRGBColorSpace
  renderer.shadowMap.enabled = true
  renderer.shadowMap.type = T.PCFShadowMap
  const scene = new T.Scene()
  scene.fog = new T.FogExp2('#d7c7a7', 0.0075)
  const camera = new T.PerspectiveCamera(37, 1, 0.12, 440),
    projectionCamera = camera.clone()
  const plate = { value: 0 },
    aspect = { value: 1 },
    time = { value: 0 },
    cityTone = { value: 0 },
    industrialTone = { value: 0 },
    nightTone = { value: 0 }
  const plateP = { value: new T.Matrix4() },
    fallback = new T.DataTexture(new Uint8Array([234, 220, 192, 255]), 1, 1)
  fallback.needsUpdate = true
  const art: { value: T.Texture } = { value: fallback }
  let photoReady = false,
    released = false
  new T.TextureLoader().load(`${import.meta.env.BASE_URL}art/ashline.webp`, (texture) => {
    if (released) {
      texture.dispose()
      return
    }
    texture.colorSpace = T.SRGBColorSpace
    art.value = texture
    photoReady = true
  })
  const sun = new T.DirectionalLight('#fff0d0', 2.1)
  sun.castShadow = true
  sun.shadow.mapSize.set(1024, 1024)
  sun.shadow.camera.left = -31
  sun.shadow.camera.right = 31
  sun.shadow.camera.top = 30
  sun.shadow.camera.bottom = -30
  sun.shadow.camera.near = 0.3
  sun.shadow.camera.far = 125
  sun.shadow.normalBias = 0.034
  sun.shadow.bias = -0.00032
  scene.add(sun, sun.target)
  const hemi = new T.HemisphereLight('#f6eee0', '#76674f', 1.65),
    rim = new T.DirectionalLight('#fbd9a2', 0.75)
  rim.position.set(15, 9, -18)
  scene.add(hemi, rim)
  const envRoot = new T.Scene()
  const skyMat = new T.MeshBasicMaterial({ side: T.BackSide, fog: false, depthWrite: false })
  skyMat.onBeforeCompile = (sh) => {
    sh.vertexShader =
      'varying vec3 skyP;\n' +
      sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nskyP=position;')
    sh.fragmentShader =
      'varying vec3 skyP;uniform float skyNight;uniform float skyCity;uniform float skyIndustry;\n' +
      noiseGLSL +
      sh.fragmentShader.replace(
        '#include <color_fragment>',
        `#include <color_fragment>
    vec3 dir=normalize(skyP); float hh=smoothstep(-.03,.67,dir.y);vec3 horizon=mix(vec3(.85,.74,.55),vec3(.52,.61,.65),hh);float cloud=n2(dir.xz*3.2+dir.y*6.)*.65+n2(dir.xz*9.+dir.y*15.)*.35;
    horizon+=vec3(.08,.071,.052)*smoothstep(.4,.84,cloud)*(1.-hh);
    horizon=mix(horizon,vec3(.88,.845,.76),skyCity*.74);horizon=mix(horizon,vec3(.21,.23,.22),skyIndustry*.75);
    horizon=mix(horizon,mix(vec3(.12,.116,.105),vec3(.033,.044,.061),hh),skyNight); diffuseColor.rgb=horizon;`,
      )
    sh.uniforms.skyNight = nightTone
    sh.uniforms.skyCity = cityTone
    sh.uniforms.skyIndustry = industrialTone
  }
  const sky = new T.Mesh(new T.SphereGeometry(302, 28, 14), skyMat)
  sky.renderOrder = -10
  sky.frustumCulled = false
  envRoot.add(sky)
  const ground = createGeology(envRoot, software)
  buildArchitecture(envRoot, software)
  // World-space reprojection preserves the original matte at the hero camera while
  // the rock faces and façades acquire parallax as the camera dollies through it.
  const themed = new Set<T.Material>()
  envRoot.traverse((obj) => {
    const mesh = obj as T.Mesh
    if (!mesh.isMesh) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const material of mats) {
      if (themed.has(material)) continue
      themed.add(material)
      const old = material.onBeforeCompile.bind(material)
      const cache = material.customProgramCacheKey()
      material.onBeforeCompile = (sh, r) => {
        old(sh, r)
        Object.assign(sh.uniforms, {
          fieldPhoto: art,
          fieldPlate: plate,
          fieldMatrix: plateP,
          fieldAspect: aspect,
          fieldTime: time,
          fieldCity: cityTone,
          fieldIndustry: industrialTone,
          fieldNight: nightTone,
        })
        sh.vertexShader =
          'varying vec4 vFieldPlate;uniform mat4 fieldMatrix;\n' +
          sh.vertexShader.replace(
            '#include <project_vertex>',
            `#include <project_vertex>
        vec4 fieldLocal=vec4(transformed,1.);
        #ifdef USE_INSTANCING
        fieldLocal=instanceMatrix*fieldLocal;
        #endif
        vFieldPlate=fieldMatrix*modelMatrix*fieldLocal;`,
          )
        sh.fragmentShader =
          `varying vec4 vFieldPlate;uniform sampler2D fieldPhoto;uniform float fieldPlate,fieldAspect,fieldTime,fieldCity,fieldIndustry,fieldNight;\n` +
          sh.fragmentShader.replace(
            '#include <dithering_fragment>',
            `#include <dithering_fragment>
        float lum=dot(gl_FragColor.rgb,vec3(.2126,.7152,.0722));
        vec3 cityColor=mix(vec3(.016,.043,.115),vec3(.92,.868,.731),smoothstep(.028,.61,lum));
        float ochre=step(gl_FragColor.b*2.5,gl_FragColor.r)*step(gl_FragColor.g*.91,gl_FragColor.r);
        cityColor=mix(cityColor,vec3(.91,.68,.015)*clamp(.43+lum,.48,1.),ochre*.86);
        gl_FragColor.rgb=mix(gl_FragColor.rgb,cityColor,fieldCity*.65);
        gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(lum*.91,lum*.955,lum*.94),fieldIndustry*.85);
        gl_FragColor.rgb=mix(gl_FragColor.rgb,vec3(.006,.007,.009)+lum*vec3(.265,.283,.306),fieldNight*.95);
        if(fieldPlate>.001 && vFieldPlate.w>0.){
          vec2 base=vFieldPlate.xy/vFieldPlate.w*.5+.5;
          vec2 cover=vec2(min(1.,fieldAspect/1.77683),min(1.,1.77683/fieldAspect));
          vec2 puv=(base-vec2(.60,.5))*cover+vec2(.60,.5);
          float edge=smoothstep(-.08,.025,min(min(puv.x,1.-puv.x),min(puv.y,1.-puv.y)));
          vec3 picture=texture2D(fieldPhoto,clamp(puv,0.,1.)).rgb;
          vec2 ir=(puv-vec2(.739,.601))*vec2(1.777,1.);float rad=length(ir);float turn=atan(ir.y,ir.x);
          float glint=exp(-pow((rad-.25)*190.,2.))*pow(max(0.,cos(turn-fieldTime*.12)),38.);
          picture+=vec3(.18,.095,.013)*glint*step(.5,fract(turn*90.));
          gl_FragColor.rgb=mix(gl_FragColor.rgb,picture,fieldPlate*edge);
        }`,
          )
      }
      material.customProgramCacheKey = () => cache + '-field-photo-v3'
    }
  })
  const staticEnvironment = envRoot.children.slice()
  scene.add(...staticEnvironment)
  const actors = createActors(scene, terrainHeight, art, software),
    field = createFieldObjects(scene)
  const receiverGeo = new T.PlaneGeometry(14, 14, 12, 12)
  receiverGeo.rotateX(-Math.PI / 2)
  const rPos = receiverGeo.attributes.position
  for (let i = 0; i < rPos.count; i++) rPos.setY(i, terrainHeight(rPos.getX(i), rPos.getZ(i)) + 0.012)
  receiverGeo.computeVertexNormals()
  const shadow = new T.Mesh(
    receiverGeo,
    new T.ShadowMaterial({
      color: '#382c21',
      opacity: 0.4,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
    }),
  )
  shadow.receiveShadow = true
  scene.add(shadow)
  const particles = makeDust(scene)
  // The hero camera is the original survey plate. Once the first camera move
  // begins the projection takes over on the actual meshes at the same pose.
  const heroBackdrop = new T.Mesh(
    new T.PlaneGeometry(2, 2),
    new T.ShaderMaterial({
      depthTest: false,
      depthWrite: false,
      uniforms: { photo: art, aspectIn: aspect, t: time },
      vertexShader: `varying vec2 p;void main(){p=uv;gl_Position=vec4(position.xy,.99999,1.);}`,
      fragmentShader: `varying vec2 p;uniform sampler2D photo;uniform float aspectIn,t;void main(){vec2 cover=vec2(min(1.,aspectIn/1.77683),min(1.,1.77683/aspectIn));vec2 uv=(p-vec2(.6,.5))*cover+vec2(.6,.5);vec3 rgb=texture2D(photo,clamp(uv,0.,1.)).rgb;vec2 axis=(uv-vec2(.739,.601))*vec2(1.777,1.);float arc=atan(axis.y,axis.x);float shine=exp(-pow((length(axis)-.25)*190.,2.))*pow(max(0.,cos(arc-t*.12)),38.)*step(.5,fract(arc*90.));gl_FragColor=vec4(rgb+vec3(.18,.095,.013)*shine,1.);}`,
    }),
  )
  heroBackdrop.frustumCulled = false
  heroBackdrop.renderOrder = -100
  heroBackdrop.visible = false
  scene.add(heroBackdrop)
  const postScene = new T.Scene(),
    quadCamera = new T.OrthographicCamera(-1, 1, 1, -1, 0, 1)
  const postTarget = new T.WebGLRenderTarget(1, 1, {
    depthBuffer: true,
    minFilter: T.LinearFilter,
    magFilter: T.LinearFilter,
  })
  postTarget.depthTexture = new T.DepthTexture(1, 1, T.UnsignedIntType)
  const post = new T.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: {
      inputImage: { value: postTarget.texture },
      sceneDepth: { value: postTarget.depthTexture },
      focusDistance: { value: 12 },
      texel: { value: new T.Vector2() },
      kick: { value: 0 },
      travel: { value: 0 },
      clock: time,
    },
    vertexShader: `varying vec2 uvP;void main(){uvP=uv;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader: `varying vec2 uvP;uniform sampler2D inputImage,sceneDepth;uniform vec2 texel;uniform float kick,travel,clock,focusDistance;
    void main(){vec2 p=uvP-.5;float r=length(p);vec2 q=clamp(uvP+p*sin(r*30.-clock*25.)*kick*.009,0.,1.);vec2 blur=p*(.0003+travel*.008)*smoothstep(.08,.7,r);vec3 base=texture2D(inputImage,q).rgb;
    if(travel>.01){float d=texture2D(sceneDepth,q).x;float meters=.12*440./max(.12,440.-d*(440.-.12));float circle=min(1.,abs(focusDistance-meters)/max(1.,meters));vec2 coc=texel*(.5+4.*circle)*travel; base=base*.36+.16*(texture2D(inputImage,q+blur+coc).rgb+texture2D(inputImage,q-blur-coc).rgb+texture2D(inputImage,q+vec2(coc.x,-coc.y)).rgb+texture2D(inputImage,q+vec2(-coc.x,coc.y)).rgb);}
    if(kick>.01){base.r=mix(base.r,texture2D(inputImage,q+p*kick*.006).r,.7);base+=vec3(.08,.042,.015)*kick*(1.-smoothstep(.05,.75,r));}
    gl_FragColor=vec4(base,1.);
    #include <colorspace_fragment>
    }`,
  })
  const screenQuad = new T.Mesh(new T.PlaneGeometry(2, 2), post)
  postScene.add(screenQuad)
  const passthrough = new T.ShaderMaterial({
    depthTest: false,
    depthWrite: false,
    uniforms: { cached: { value: postTarget.texture } },
    vertexShader: `varying vec2 p;void main(){p=uv;gl_Position=vec4(position.xy,0.,1.);}`,
    fragmentShader: `varying vec2 p;uniform sampler2D cached;void main(){gl_FragColor=texture2D(cached,p);
    #include <colorspace_fragment>
    }`,
  })
  const eye = v3(),
    aim = v3(),
    vEye = v3(),
    vAim = v3(),
    targetEye = v3(),
    targetAim = v3(),
    heroEye = v3(),
    heroAim = v3(),
    shake = v3(),
    temp = v3()
  const raycaster = new T.Raycaster(),
    coords = new T.Vector2(),
    rect = { width: 1, height: 1, left: 0, top: 0 }
  let initialized = false,
    lastMode = 0,
    lastStarted = false,
    transition = 0,
    fovVel = 0,
    smoothedFrame = 1 / 60,
    perfTime = 0,
    resScale = software ? 0.42 : 1,
    width = 0,
    height = 0,
    forceRatio = 0
  const autoMin = software ? 0.31 : 0.57,
    cacheEye = v3(Infinity, 0, 0),
    cacheAim = v3(),
    shadowFocus = v3(Infinity, 0, 0)
  let cacheFov = 0,
    cacheLight = 0,
    cacheReady = false,
    cacheSignature = '',
    cacheHour = 0,
    cacheRoverX = 0,
    cacheRoverZ = 0,
    cacheHeading = 0,
    heroResolution = true,
    shadowAge = Infinity,
    shadowTopology = '',
    shadowStage = '',
    shadowSunHour = 0
  let lastRatio = 0,
    lastWidth = 0,
    lastHeight = 0
  let pointerX = 0,
    pointerY = 0,
    lookX = 0,
    lookY = 0
  const pointerMove = (event: PointerEvent) => {
    pointerX = ((event.clientX - rect.left) / rect.width - 0.5) * 2
    pointerY = ((event.clientY - rect.top) / rect.height - 0.5) * 2
  }
  window.addEventListener('pointermove', pointerMove, { passive: true })
  function resize() {
    const r = canvas.getBoundingClientRect()
    Object.assign(rect, {
      width: r.width || window.innerWidth,
      height: r.height || window.innerHeight,
      left: r.left,
      top: r.top,
    })
    width = rect.width
    height = rect.height
    aspect.value = width / height
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5),
      ratio = heroResolution ? pixelRatio : forceRatio || pixelRatio * resScale
    if (width !== lastWidth || height !== lastHeight || lastRatio !== ratio) {
      renderer.setPixelRatio(ratio)
      renderer.setSize(width, height, false)
      postTarget.setSize(Math.max(1, Math.round(width * ratio)), Math.max(1, Math.round(height * ratio)))
      post.uniforms.texel.value.set(1 / postTarget.width, 1 / postTarget.height)
      lastWidth = width
      lastHeight = height
      lastRatio = ratio
      cacheReady = false
    }
    const narrow = saturate((1.42 - aspect.value) / 0.95),
      distance = 1 + narrow * 0.49
    heroEye.set(7.3 * distance, 3.14 + 0.26 * narrow, 9.65 * distance)
    heroAim.set(
      -0.83 + narrow * 0.45,
      2.25 + 0.02 * narrow + 2.55 * saturate((1.04 - aspect.value) / 0.5),
      0.59,
    )
    projectionCamera.position.copy(heroEye)
    projectionCamera.aspect = aspect.value
    projectionCamera.fov = 37 + 10 * narrow
    projectionCamera.lookAt(heroAim)
    projectionCamera.updateProjectionMatrix()
    projectionCamera.updateMatrixWorld()
    plateP.value.multiplyMatrices(projectionCamera.projectionMatrix, projectionCamera.matrixWorldInverse)
    camera.aspect = aspect.value
    camera.updateProjectionMatrix()
  }
  const resizeObserver = new ResizeObserver(resize)
  resizeObserver.observe(canvas)
  resize()
  const skyDay = new T.Color('#d7c7a7'),
    skyCity = new T.Color('#e5dfcf'),
    skyIndustry = new T.Color('#76817d'),
    skyNight = new T.Color('#292b30'),
    fogColor = new T.Color(),
    keyColor = new T.Color(),
    ambientColor = new T.Color()
  const dawnKey = new T.Color('#fff0d0'),
    moonKey = new T.Color('#fff1d1'),
    dayAmbient = new T.Color('#f6eee0'),
    nightAmbient = new T.Color('#b7c2c5')
  function update(rawDt: number, s: GameState) {
    const dt = Math.min(0.25, Math.max(0, rawDt))
    time.value += dt
    const isHero = s.mode === 1 && !s.started,
      first = !initialized
    if (heroResolution !== isHero) {
      heroResolution = isHero
      cacheReady = false
      resize()
    }
    if (s.mode !== lastMode || s.started !== lastStarted) {
      if (initialized) transition = 1
      lastMode = s.mode
      lastStarted = s.started
    }
    transition *= Math.exp(-2.55 * dt)
    lookX += (pointerX - lookX) * exp(4, dt)
    lookY += (pointerY - lookY) * exp(4, dt)
    const rx = s.rover.x,
      rz = s.rover.z,
      ry = terrainHeight(rx, rz),
      head = s.rover.heading
    let fov = 40
    if (isHero) {
      targetEye.copy(heroEye)
      targetAim.copy(heroAim)
      targetEye.x += lookX * 0.065
      targetEye.y -= lookY * 0.029
      fov = projectionCamera.fov
    } else if (s.mode === 1) {
      const speed = Math.min(1, Math.abs(s.rover.speed) / 14)
      targetEye.set(
        rx - Math.sin(head) * (9 + 2.1 * speed) + Math.cos(head) * 2.1,
        ry + 4.45 + speed * 0.92,
        rz - Math.cos(head) * (9 + 2.1 * speed) - Math.sin(head) * 2.1,
      )
      targetAim.set(rx + Math.sin(head) * 3, ry + 1.55, rz + Math.cos(head) * 3)
      fov = 48 + 4 * speed
    } else if (s.mode === 2) {
      const help = 1 + Math.max(0, 1.4 - aspect.value) * 0.52
      targetAim.set(0, 0.4, -22.5)
      targetEye.set(32 * help, 39 * help, 12 * help - 14)
      fov = 43
    } else if (s.mode === 3 && !s.raid.active) {
      const help = 1 + Math.max(0, 1.35 - aspect.value) * 0.78
      targetAim.set(0, 0.1, -22)
      targetEye.set(18 * help, 28 * help, -22 + 25 * help)
      fov = 42
    } else {
      const a = s.party
      const fight = s.mode === 4
      targetAim.set(a.x * 0.52 + s.boss.x * 0.48, 0.75, a.z * 0.52 + s.boss.z * 0.48)
      if (!fight) targetAim.set(a.x, 0.4, a.z)
      const d = 1 + Math.max(0, 1.35 - aspect.value) * 0.4
      targetEye
        .copy(targetAim)
        .add(temp.set((fight ? 9.8 : 7.7) * d, (fight ? 8.2 : 12) * d, (fight ? 13 : 11) * d))
      fov = fight ? 49 : 48
    }
    if (first) {
      eye.copy(targetEye)
      aim.copy(targetAim)
      camera.fov = fov
      initialized = true
    }
    const w = isHero ? 4.5 : s.mode === 1 ? 5.8 : 6
    spring3(eye, vEye, targetEye, w, dt)
    spring3(aim, vAim, targetAim, w, dt)
    const offset = camera.fov - fov,
      b = fovVel + w * offset,
      decay = Math.exp(-w * dt)
    camera.fov = fov + (offset + b * dt) * decay
    fovVel = (fovVel - w * b * dt) * decay
    const impact = saturate(s.fx.shake)
    shake.set(Math.sin(time.value * 88) * 0.15, Math.cos(time.value * 73) * 0.105, 0).multiplyScalar(impact)
    camera.position.copy(eye).add(shake)
    camera.lookAt(aim)
    camera.updateProjectionMatrix()
    camera.updateMatrixWorld()
    const mix = first ? 1 : exp(3.3, dt)
    plate.value +=
      ((isHero && photoReady ? 1 : 0) - plate.value) * (isHero && first ? 1 : exp(isHero ? 14 : 3.5, dt))
    const solar = Math.sin(((s.hour - 6) / 24) * Math.PI * 2),
      night = s.mode === 4 || s.raid.active ? 1 : isHero ? 0 : saturate((0.15 - solar) * 1.5)
    cityTone.value += ((s.mode === 2 ? 1 : 0) - cityTone.value) * mix
    industrialTone.value += ((s.mode === 3 ? 1 : 0) - industrialTone.value) * mix
    nightTone.value += (night - nightTone.value) * mix
    fogColor
      .copy(skyDay)
      .lerp(skyCity, cityTone.value)
      .lerp(skyIndustry, industrialTone.value * 0.72)
      .lerp(skyNight, nightTone.value)
    const fog = scene.fog as T.FogExp2
    fog.color.copy(fogColor)
    fog.density = 0.0064 + (s.weather === 'dust' ? 0.003 : 0) + nightTone.value * 0.005
    sun.target.position.set(isHero ? 0 : aim.x, 0, isHero ? 0 : aim.z)
    const azimuth = (s.hour - 12) * 0.105,
      altitude = isHero ? 34 : 13 + 27 * Math.max(0, solar)
    temp.set(-32 * Math.sin(azimuth), altitude, 29 * Math.cos(azimuth))
    if (isHero) temp.set(-24, 34, 24)
    else if (night > 0.5) temp.set(-24, 27, 35)
    sun.position.copy(sun.target.position).add(temp)
    keyColor.copy(dawnKey).lerp(moonKey, nightTone.value)
    sun.color.copy(keyColor)
    sun.intensity = 2.24 + nightTone.value * 0.47 - (s.weather === 'dust' ? 0.38 : 0)
    ambientColor.copy(dayAmbient).lerp(nightAmbient, nightTone.value)
    hemi.color.copy(ambientColor)
    hemi.intensity = 1.62 - 0.86 * nightTone.value
    rim.intensity = 0.65 + 1.24 * nightTone.value
    rim.color.set(nightTone.value > 0.5 ? 0xffdbc4 : 0xfbd9a2)
    shadow.visible = plate.value > 0.01
    shadow.material.opacity = 0.45 * plate.value
    actors.update(dt, s)
    field.update(dt, s, nightTone.value)
    particles.update(dt, s, isHero ? heroAim : aim, isHero)
    post.uniforms.kick.value = Math.max(s.fx.hit * 0.65, s.fx.parry, s.fx.shake * 0.6)
    post.uniforms.travel.value = transition
    post.uniforms.focusDistance.value = eye.distanceTo(aim)
    const plateOnly = isHero && photoReady && transition < 0.016
    heroBackdrop.visible = plateOnly
    for (const item of staticEnvironment) item.visible = !plateOnly
    // The parked vehicle is a rigid, fully lit asset. Preserve its completed
    // color and depth until its projection or light changes by a visible amount.
    const surveyed =
      !s.raid.active &&
      (s.mode === 2 || s.mode === 3) &&
      transition < 0.008 &&
      Math.abs(s.rover.speed) < 0.035
    const reusable = plateOnly || surveyed,
      signature =
        s.mode +
        '|' +
        s.weather +
        '|' +
        s.nodes.map((n) => n.id + ':' + Number(n.powered) + Number(n.linked)).join('.') +
        '|' +
        s.caches.map((c) => Number(c.claimed)).join('')
    const changed =
      signature !== cacheSignature ||
      Math.abs(s.hour - cacheHour) > (software ? 0.16 : 0.045) ||
      Math.hypot(s.rover.x - cacheRoverX, s.rover.z - cacheRoverZ) > 0.015 ||
      Math.abs(s.rover.heading - cacheHeading) > 0.003
    const refresh =
      !reusable ||
      changed ||
      !cacheReady ||
      cacheEye.distanceToSquared(eye) > 0.000026 ||
      cacheAim.distanceToSquared(aim) > 0.000026 ||
      Math.abs(cacheFov - camera.fov) > 0.012 ||
      Math.abs(cacheLight - sun.intensity) > 0.016
    const fixedDistrict = !s.raid.active && (s.mode === 2 || s.mode === 3)
    renderer.shadowMap.enabled = !software || isHero || fixedDistrict
    const stage = plateOnly ? 'plate' : s.mode + ':' + s.raid.active,
      topology = s.nodes.map((node) => node.id).join(',')
    const moving = Math.abs(s.rover.speed) > 0.1 || s.raid.active || s.mode === 4
    shadowAge += dt
    const redrawShadow =
      renderer.shadowMap.enabled &&
      (stage !== shadowStage ||
        topology !== shadowTopology ||
        (!software && shadowFocus.distanceToSquared(sun.target.position) > 0.36) ||
        Math.abs(shadowSunHour - s.hour) > (software ? 0.26 : 0.08) ||
        (!software && moving && shadowAge > 0.045))
    renderer.info.reset()
    if (refresh) {
      if (redrawShadow) {
        renderer.shadowMap.needsUpdate = true
        shadowAge = 0
        shadowStage = stage
        shadowTopology = topology
        shadowFocus.copy(sun.target.position)
        shadowSunHour = s.hour
      }
      camera.layers.set(0)
      if (!reusable) camera.layers.enable(1)
      particles.depth(null, postTarget.width, postTarget.height)
      field.depth(null, postTarget.width, postTarget.height)
      renderer.setRenderTarget(postTarget)
      renderer.render(scene, camera)
      renderer.setRenderTarget(null)
      cacheReady = reusable
      cacheSignature = signature
      cacheHour = s.hour
      cacheRoverX = s.rover.x
      cacheRoverZ = s.rover.z
      cacheHeading = s.rover.heading
      cacheEye.copy(eye)
      cacheAim.copy(aim)
      cacheFov = camera.fov
      cacheLight = sun.intensity
    }
    const needsEffect = post.uniforms.kick.value > 0.01 || transition > 0.01
    // PostTarget contains the opaque scene even when its camera is stationary.
    // Present through the renderer every frame so the compositor receives the
    // color attachment before transparent particle and freight layers render.
    screenQuad.material = needsEffect ? post : passthrough
    renderer.render(postScene, quadCamera)
    if (reusable) {
      // Reproject each live mote against the cached depth without drawing the
      // opaque vehicle and its directional shadow again.
      particles.depth(postTarget.depthTexture, postTarget.width, postTarget.height)
      field.depth(postTarget.depthTexture, postTarget.width, postTarget.height)
      camera.layers.set(1)
      renderer.autoClear = false
      renderer.render(scene, camera)
      renderer.autoClear = true
      camera.layers.set(0)
    }
    smoothedFrame += (Math.min(rawDt, 0.2) - smoothedFrame) * 0.12
    perfTime += Math.min(rawDt, 0.25)
    if (!isHero && perfTime > (software ? 0.65 : 1.1) && !forceRatio && !document.hidden) {
      perfTime = 0
      const scale = resScale
      if (smoothedFrame > 0.023) resScale = Math.max(autoMin, resScale * (smoothedFrame > 0.05 ? 0.76 : 0.9))
      else if (smoothedFrame < 0.0174) resScale = Math.min(software ? 0.66 : 1, resScale + 0.035)
      if (Math.abs(scale - resScale) > 0.005) resize()
    }
  }
  function pick(clientX: number, clientY: number) {
    coords.set(((clientX - rect.left) / rect.width) * 2 - 1, 1 - ((clientY - rect.top) / rect.height) * 2)
    raycaster.setFromCamera(coords, camera)
    const hit = raycaster.intersectObject(ground, false)[0]
    return hit ? { x: hit.point.x, z: hit.point.z } : null
  }
  function project(x: number, z: number, lift = 0) {
    temp.set(x, terrainHeight(x, z) + lift, z).project(camera)
    return {
      x: (temp.x * 0.5 + 0.5) * rect.width + rect.left,
      y: (0.5 - temp.y * 0.5) * rect.height + rect.top,
      visible: temp.z > 0 && temp.z < 1 && Math.abs(temp.x) < 1.03 && Math.abs(temp.y) < 1.03,
    }
  }
  function setQuality(q: 'auto' | 'high' | 'low' | number) {
    forceRatio =
      typeof q === 'number' ? q : q === 'auto' ? 0 : q === 'high' ? Math.min(devicePixelRatio, 1.7) : 0.68
    const mapSize = q === 'low' || (q === 'auto' && software) ? 512 : q === 'high' ? 2048 : 1024
    if (sun.shadow.mapSize.x !== mapSize) {
      sun.shadow.mapSize.set(mapSize, mapSize)
      sun.shadow.map?.dispose()
      sun.shadow.map = null
      sun.shadow.needsUpdate = true
      renderer.shadowMap.needsUpdate = true
      cacheReady = false
    }
    resize()
  }
  function dispose() {
    released = true
    resizeObserver.disconnect()
    window.removeEventListener('pointermove', pointerMove)
    actors.dispose()
    field.dispose()
    const geos = new Set<T.BufferGeometry>(),
      materials = new Set<T.Material>()
    scene.traverse((obj) => {
      const m = obj as T.Mesh
      if (m.geometry) geos.add(m.geometry)
      if (m.material)
        for (const mat of Array.isArray(m.material) ? m.material : [m.material]) materials.add(mat)
    })
    geos.forEach((g) => g.dispose())
    materials.forEach((m) => m.dispose())
    postTarget.dispose()
    post.dispose()
    passthrough.dispose()
    screenQuad.geometry.dispose()
    if (art.value !== fallback) art.value.dispose()
    fallback.dispose()
    renderer.dispose()
  }
  return {
    update,
    pick,
    project,
    dispose,
    setQuality,
    stats: () => ({
      calls: renderer.info.render.calls,
      triangles: renderer.info.render.triangles,
      renderWidth: gl.drawingBufferWidth,
      renderHeight: gl.drawingBufferHeight,
      adapter: adapterName || String(gl.getParameter(gl.RENDERER)),
    }),
  }
}
function makeDust(scene: T.Scene) {
  const r = randomSource(221),
    count = 115,
    pos = new Float32Array(count * 3),
    seeds = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    pos[i * 3] = (r() - 0.5) * 30
    pos[i * 3 + 1] = 0.1 + r() ** 2 * 8
    pos[i * 3 + 2] = (r() - 0.5) * 30
    seeds[i] = r()
  }
  const geom = new T.BufferGeometry()
  geom.setAttribute('position', new T.BufferAttribute(pos, 3))
  geom.setAttribute('phase', new T.BufferAttribute(seeds, 1))
  const mat = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    uniforms: {
      clock: { value: 0 },
      overlay: { value: false },
      depthImage: { value: null as T.DepthTexture | null },
      resolution: { value: new T.Vector2(1, 1) },
      opacity: { value: 0.3 },
      tint: { value: new T.Color('#ccb691') },
    },
    vertexShader: `attribute float phase;uniform float clock;varying float vA;void main(){vec3 p=position;p.x=mod(p.x+15.+clock*(.14+phase*.36),30.)-15.;p.y+=sin(phase*35.+clock*.33)*.16;vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;gl_PointSize=clamp((11.+phase*13.)/-mv.z,1.,3.1);vA=.25+.66*phase;}`,
    fragmentShader: `varying float vA;uniform float opacity;uniform bool overlay;uniform sampler2D depthImage;uniform vec2 resolution;uniform vec3 tint;void main(){if(overlay&&gl_FragCoord.z>texture2D(depthImage,gl_FragCoord.xy/resolution).r+.00004)discard;float s=1.-smoothstep(.08,.5,length(gl_PointCoord-.5));gl_FragColor=vec4(tint,s*opacity*vA);
    #include <colorspace_fragment>
    }`,
  })
  const clouds = new T.Points(geom, mat)
  clouds.frustumCulled = false
  clouds.layers.set(1)
  scene.add(clouds)
  return {
    depth(tex: T.DepthTexture | null, w: number, h: number) {
      mat.uniforms.overlay.value = !!tex
      mat.uniforms.depthImage.value = tex
      mat.uniforms.resolution.value.set(w, h)
    },
    update(dt: number, s: GameState, center: T.Vector3, hero: boolean) {
      mat.uniforms.clock.value += dt * (s.weather === 'dust' ? 2.1 : 1)
      mat.uniforms.opacity.value = hero ? 0.27 : s.mode === 4 ? 0.61 : 0.44
      clouds.position.set(center.x, 0, center.z)
    },
  }
}
