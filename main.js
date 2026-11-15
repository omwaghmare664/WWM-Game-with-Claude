import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {DRACOLoader} from 'three/addons/loaders/DRACOLoader.js';
import {KTX2Loader} from 'three/addons/loaders/KTX2Loader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';
import GUI from 'lil-gui';

// ================= CONFIG =================
const CONFIG={
  character:'assets/character.glb',
  trees:['assets/tree1.glb','assets/tree2.glb'],
  rocks:['assets/rock1.glb'],
  treeCount:40, rockCount:24,
  treeHeight:[7,10],
  rockHeight:[.7,1.5],
  charHeight:1.8,
  charYawOffset:0,
  clips:{idle:/idle/i,walk:/walk|move/i,run:/run|sprint|jog/i,jump:/jump|fall/i}
};
// ==========================================
const $=id=>document.getElementById(id),errEl=$('err');
const fail=m=>{console.error(m);errEl.textContent+=(errEl.textContent?'\n':'')+m;errEl.style.display='block'};
const T=THREE,clamp=T.MathUtils.clamp,lerp=T.MathUtils.lerp;
let seed=7;const rnd=()=>{seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
const R=(a,b)=>a+(b-a)*rnd();

// ---------- renderer / scene (must be created before loaders) ----------
const renderer=new T.WebGLRenderer({antialias:true,powerPreference:'high-performance'});
renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
renderer.outputColorSpace=T.SRGBColorSpace;
renderer.shadowMap.enabled=true;renderer.shadowMap.type=T.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene=new T.Scene();
// FIX: Add environment map so PBR materials don't render pitch black
const pmremGenerator = new T.PMREMGenerator(renderer);
scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
pmremGenerator.dispose();

scene.fog=new T.FogExp2(0xbcd8ee,0.012);
const camera=new T.PerspectiveCamera(60,1,0.1,1200);
const U={uScale:{value:800},uT:{value:0},uP:{value:new T.Vector3()}};

// ---------- loading ----------
const mgr=new T.LoadingManager();mgr.onProgress=(u,i,t)=>{$('bar').style.width=(i/t*100)+'%'};
const draco=new DRACOLoader(mgr).setDecoderPath('https://www.gstatic.com/draco/versioned/decoders/1.5.6/');
// FIX: Add KTX2 and Meshopt decoders for missing textures
const ktx2=new KTX2Loader(mgr).setTranscoderPath('https://cdn.jsdelivr.net/npm/three@0.158.0/examples/jsm/libs/basis/').detectSupport(renderer);
const gl=new GLTFLoader(mgr).setDRACOLoader(draco).setKTX2Loader(ktx2);
gl.setMeshoptDecoder(MeshoptDecoder);

const load=async url=>{try{return await gl.loadAsync(url)}catch(e){fail('Could not load '+url+' (using fallback)');return null}};
const [charG,...propG]=await Promise.all([load(CONFIG.character),...CONFIG.trees.map(load),...CONFIG.rocks.map(load)]);
const treeG=propG.slice(0,CONFIG.trees.length),rockG=propG.slice(CONFIG.trees.length);

// ---------- terrain ----------
const H=(x,z)=>Math.sin(x*.07+1)*Math.cos(z*.06)+.5*Math.sin(x*.17+z*.11)+.25*Math.cos(z*.23-x*.09);
function noiseTex(){const c=document.createElement('canvas');c.width=c.height=256;const g=c.getContext('2d'),d=g.createImageData(256,256);
 for(let i=0;i<65536;i++){const v=190+rnd()*65;d.data.set([v,v,v,255],i*4)}g.putImageData(d,0,0);
 const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(90,90);t.colorSpace=T.SRGBColorSpace;t.anisotropy=4;return t}
const TERR=300, TERRSEG=200;
const tg=new T.PlaneGeometry(TERR,TERR,TERRSEG,TERRSEG).rotateX(-Math.PI/2);
{const p=tg.attributes.position,col=new Float32Array(p.count*3),a=new T.Color(0x3f7a2c),b=new T.Color(0x7d8f3f),c=new T.Color(0x5e4e32),tmp=new T.Color();
 for(let i=0;i<p.count;i++){const x=p.getX(i),z=p.getZ(i),h=H(x,z);p.setY(i,h);const n=.5+.5*Math.sin(x*.31)*Math.cos(z*.27+x*.05);
  tmp.copy(a).lerp(b,n).lerp(c,clamp((.5+.5*Math.sin(x*.13-z*.17))*.35+(h>1.2?.3:0),0,.6));col.set([tmp.r,tmp.g,tmp.b],i*3)}
 tg.setAttribute('color',new T.BufferAttribute(col,3));tg.computeVertexNormals()}
const terrain=new T.Mesh(tg,new T.MeshStandardMaterial({map:noiseTex(),vertexColors:true,roughness:1}));terrain.receiveShadow=true;scene.add(terrain);
// Outer plane lowered so it never clips through valleys
const outer=new T.Mesh(new T.CircleGeometry(900,48).rotateX(-Math.PI/2),new T.MeshBasicMaterial({color:0x3b5a30}));outer.position.y=-8;scene.add(outer);
{const ms=new T.InstancedMesh(new T.ConeGeometry(1,1,6),new T.MeshBasicMaterial({color:0x56697a}),28),d=new T.Object3D();
 for(let i=0;i<28;i++){const a=i/28*Math.PI*2+R(-.1,.1),r=R(120,170),h=R(30,70);d.position.set(Math.cos(a)*r,h/2-1,Math.sin(a)*r);d.scale.set(R(30,55),h,R(30,55));d.rotation.y=R(0,3);d.updateMatrix();ms.setMatrixAt(i,d.matrix)}scene.add(ms)}

// ---------- sky ----------
const skyU={uTop:{value:new T.Color()},uHor:{value:new T.Color()},uSun:{value:new T.Vector3(0,1,0)},uSunCol:{value:new T.Color(1,.9,.7)},uNight:{value:0}};
const sky=new T.Mesh(new T.SphereGeometry(500,32,16),new T.ShaderMaterial({uniforms:skyU,side:T.BackSide,depthWrite:false,fog:false,
 vertexShader:`varying vec3 vP;
void main(){vP=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
 fragmentShader:`varying vec3 vP;
uniform vec3 uTop,uHor,uSun,uSunCol;
uniform float uNight;
void main(){
  vec3 d=normalize(vP);
  float h=max(d.y,0.0);
  vec3 c=mix(uHor,uTop,pow(h,0.45));
  float s=max(dot(d,uSun),0.0);
  c+=uSunCol*(pow(s,500.0)*3.0+pow(s,12.0)*0.25);
  vec2 q=floor(d.xz/(d.y+1.2)*260.0);
  c+=vec3(step(0.9985,fract(sin(dot(q,vec2(12.9,78.2)))*43758.5)))*uNight*step(0.05,d.y);
  gl_FragColor=vec4(c,1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`}));sky.renderOrder=-1;sky.frustumCulled=false;scene.add(sky);

// ---------- lights ----------
const hemi=new T.HemisphereLight(0xbcd8ee,0x3a4a2a,1);scene.add(hemi);
const amb=new T.AmbientLight(0x9fb8d0,0.18);scene.add(amb);
const sun=new T.DirectionalLight(0xffffff,3);sun.castShadow=true;
sun.shadow.camera.left=-45;sun.shadow.camera.right=45;sun.shadow.camera.top=45;sun.shadow.camera.bottom=-45;
sun.shadow.camera.near=0.5;sun.shadow.camera.far=200;
sun.shadow.camera.updateProjectionMatrix();
sun.shadow.bias=-0.0005;sun.shadow.normalBias=0.05;
sun.shadow.mapSize.set(2048,2048);
scene.add(sun,sun.target);
const fill=new T.DirectionalLight(0xbfd4ea,0.6);fill.castShadow=false;scene.add(fill,fill.target);
const sunDir=new T.Vector3();

// ---------- wind shaders ----------
const PV='#include <project_vertex>';
function windTree(m){m.customProgramCacheKey=()=>'windTree';m.onBeforeCompile=s=>{s.uniforms.uT=U.uT;
 s.vertexShader='uniform float uT;\nattribute vec3 aP;\n'+s.vertexShader.replace(PV,`
 vec4 mvPosition=vec4(transformed,1.0);
 #ifdef USE_INSTANCING
 mvPosition=instanceMatrix*mvPosition;
 #endif
 float hh=max(mvPosition.y-aP.y,0.0);
 float sw=(sin(uT*1.3+aP.x*0.5+aP.z*0.4)+0.4*sin(uT*3.1+aP.x))*hh*hh*0.0035;
 mvPosition.x+=sw;mvPosition.z+=sw*0.6;
 mvPosition=modelViewMatrix*mvPosition;
 gl_Position=projectionMatrix*mvPosition;`)}}
function windGrass(m){m.customProgramCacheKey=()=>'windGrass';m.onBeforeCompile=s=>{s.uniforms.uT=U.uT;s.uniforms.uP=U.uP;
 s.vertexShader='uniform float uT;\nuniform vec3 uP;\nvarying float vH;\n'+s.vertexShader.replace(PV,`
 vH=position.y;
 vec4 mvPosition=vec4(transformed,1.0);
 #ifdef USE_INSTANCING
 mvPosition=instanceMatrix*mvPosition;
 #endif
 float b=position.y*position.y;
 vec2 ip=instanceMatrix[3].xz;
 float w=sin(uT*1.7+ip.x*0.35+ip.y*0.25)+0.5*sin(uT*3.3+ip.x*0.9);
 mvPosition.x+=w*b*0.12*instanceMatrix[1][1];
 mvPosition.z+=w*b*0.05*instanceMatrix[1][1];
 vec2 dp=mvPosition.xz-uP.xz;float dd=length(dp);
 mvPosition.xz+=dp/max(dd,0.001)*smoothstep(1.3,0.0,dd)*b*0.5;
 mvPosition=modelViewMatrix*mvPosition;
 gl_Position=projectionMatrix*mvPosition;`);
 s.fragmentShader='varying float vH;\n'+s.fragmentShader.replace('#include <color_fragment>','#include <color_fragment>\n diffuseColor.rgb*=mix(0.25,1.25,vH);')}}

// ---------- scatter (with ground plane filter) ----------
const placed=[],solids=[],dummy=new T.Object3D(),M4=new T.Matrix4();
function place(r){for(let t=0;t<80;t++){const x=R(-46,46),z=R(-46,46);if(Math.hypot(x,z)<6)continue;
 if(placed.every(p=>Math.hypot(p.x-x,p.z-z)>p.r+r+.5)){placed.push({x,z,r});return{x,z}}}return null}
function scatter(gltfs,total,[h0,h1],{spacing,solidR,sway}){
 gltfs=gltfs.filter(Boolean);if(!gltfs.length)return;
 const per=gltfs.map(()=>[]);
 for(let i=0;i<total;i++){const s=R(.8,1.3),p=place(spacing*s);if(!p)continue;per[i%gltfs.length].push({...p,y:H(p.x,p.z)-.05,s,ry:R(0,6.28)});solids.push({x:p.x,z:p.z,r:solidR*s})}
 gltfs.forEach((g,gi)=>{const list=per[gi];if(!list.length)return;
  g.scene.updateMatrixWorld(true);
  const box=new T.Box3().setFromObject(g.scene),size=box.getSize(new T.Vector3()),c=box.getCenter(new T.Vector3()),k=(h0+h1)/2/Math.max(size.y,1e-4);
  const norm=new T.Matrix4().makeScale(k,k,k).multiply(new T.Matrix4().makeTranslation(-c.x,-box.min.y,-c.z));
  g.scene.traverse(o=>{
   if(!o.isMesh||o.isSkinnedMesh)return;
   // FIX: Filter out built-in ground planes/shadows that render as white blocks
   const name = o.name.toLowerCase();
   if(name.includes('shadow') || name.includes('ground') || name.includes('plane') || name.includes('base')) return;

   const geo=o.geometry.clone(),aP=new Float32Array(list.length*3),multi=Array.isArray(o.material);
   const mats=(multi?o.material:[o.material]).map(src=>{const m=src.clone();m.side=T.DoubleSide;
     if(m.map&&m.transparent){m.alphaTest=.4;m.transparent=false;m.depthWrite=true}if(sway)windTree(m);return m});
   const im=new T.InstancedMesh(geo,multi?mats:mats[0],list.length);
   list.forEach((p,i)=>{dummy.position.set(p.x,p.y,p.z);dummy.rotation.set(0,p.ry,0);dummy.scale.setScalar(p.s);dummy.updateMatrix();
    M4.copy(dummy.matrix).multiply(norm).multiply(o.matrixWorld);im.setMatrixAt(i,M4);aP.set([p.x,p.y,p.z],i*3)});
   im.instanceMatrix.needsUpdate=true;
   geo.setAttribute('aP',new T.InstancedBufferAttribute(aP,3));
   im.castShadow=im.receiveShadow=true;im.frustumCulled=false;scene.add(im)})})}
scatter(treeG,CONFIG.treeCount,CONFIG.treeHeight,{spacing:2,solidR:.5,sway:true});
scatter(rockG,CONFIG.rockCount,CONFIG.rockHeight,{spacing:1,solidR:.8,sway:false});

// ---------- grass ----------
function bladeGeo(){const segs=4,pos=[],idx=[];
 for(let i=0;i<=segs;i++){const t=i/segs,w=.035*(1-t)+.003,z=t*t*.18;pos.push(-w,t,z,w,t,z)}
 for(let i=0;i<segs;i++){const a=i*2;idx.push(a,a+1,a+2,a+1,a+3,a+2)}
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();return g}
const grassM=new T.MeshStandardMaterial({color:0xffffff,side:T.DoubleSide,roughness:.9});windGrass(grassM);
const GMAX=70000,grass=new T.InstancedMesh(bladeGeo(),grassM,GMAX);grass.receiveShadow=true;grass.frustumCulled=false;scene.add(grass);
{const C=new T.Color();let n=0;
 while(n<GMAX){const x=R(-49.5,49.5),z=R(-49.5,49.5);if(solids.some(o=>Math.hypot(o.x-x,o.z-z)<o.r))continue;
  const s=R(.8,1.5);dummy.position.set(x,H(x,z),z);dummy.rotation.set(0,R(0,6.28),0);dummy.scale.set(s,R(.35,.9),s);dummy.updateMatrix();
  grass.setMatrixAt(n,dummy.matrix);C.setHSL(R(.2,.3),R(.45,.65),R(.3,.45));grass.setColorAt(n,C);n++}}
grass.instanceMatrix.needsUpdate=true;if(grass.instanceColor)grass.instanceColor.needsUpdate=true;

// ---------- particles ----------
const gpuPoints=(n,{y0,y1,color,size,add=true,wrap=1,int=1,pos})=>{
 const g=new T.BufferGeometry(),b=new Float32Array(n*3),ph=new Float32Array(n);
 for(let i=0;i<n;i++){b.set(pos?pos(i):[R(-20,20),R(y0,y1),R(-20,20)],i*3);ph[i]=rnd()}
 g.setAttribute('position',new T.BufferAttribute(b,3));g.setAttribute('aB',new T.BufferAttribute(b,3));g.setAttribute('aPh',new T.BufferAttribute(ph,1));
 const m=new T.ShaderMaterial({transparent:true,depthWrite:false,blending:add?T.AdditiveBlending:T.NormalBlending,fog:false,
  uniforms:{uT:U.uT,uScale:U.uScale,uC:{value:new T.Vector3()},uWrap:{value:wrap},uInt:{value:int},uSize:{value:size},uCol:{value:new T.Color(color)}},
  vertexShader:`uniform float uT,uScale,uWrap,uInt,uSize;
uniform vec3 uC;
attribute vec3 aB;
attribute float aPh;
varying float vA;
void main(){
  vec3 p=aB+vec3(sin(uT*.2+aPh*6.)*1.5,sin(uT*.3+aPh*9.)*.8,cos(uT*.25+aPh*7.)*1.5);
  p.x+=uT*.3*uWrap;
  vec2 w=uC.xz+mod(p.xz-uC.xz+20.,40.)-20.;
  p.xz=mix(p.xz,w,uWrap);
  vA=uInt*(.5+.5*sin(uT*(1.5+aPh)+aPh*30.));
  vec4 mv=modelViewMatrix*vec4(p,1.);
  gl_PointSize=min(uSize*uScale*(.6+.4*aPh)/max(-mv.z,0.1),80.0);
  gl_Position=projectionMatrix*mv;
}`,
  fragmentShader:`uniform vec3 uCol;
varying float vA;
void main(){
  float d=length(gl_PointCoord-.5);
  float a=smoothstep(.5,.0,d);
  a*=a*vA;
  gl_FragColor=vec4(uCol,a);
  #include <colorspace_fragment>
}`});
 const pts=new T.Points(g,m);pts.frustumCulled=false;scene.add(pts);return pts};
const motes=gpuPoints(600,{y0:.4,y1:6,color:0xfff2c0,size:.07});
const flies=gpuPoints(140,{y0:.6,y1:3,color:0xd8ff7a,size:.16,int:0});
const beams=gpuPoints(40,{y0:2,y1:9,color:0xffe9b0,size:.6,int:.08});
gpuPoints(520,{color:0x9fd0ff,size:.12,wrap:0,int:.3,pos:i=>{const t=R(-50,50),e=i%4;return e==0?[t,R(0,9),-50]:e==1?[t,R(0,9),50]:e==2?[-50,R(0,9),t]:[50,R(0,9),t]}});
const PN=80,pp=new Float32Array(PN*3),pA=new Float32Array(PN),pS=new Float32Array(PN),pv=new Float32Array(PN*3),pl=new Float32Array(PN),pm=new Float32Array(PN);
const pg=new T.BufferGeometry();pg.setAttribute('position',new T.BufferAttribute(pp,3).setUsage(T.DynamicDrawUsage));pg.setAttribute('aA',new T.BufferAttribute(pA,1).setUsage(T.DynamicDrawUsage));pg.setAttribute('aS',new T.BufferAttribute(pS,1).setUsage(T.DynamicDrawUsage));
const puffs=new T.Points(pg,new T.ShaderMaterial({transparent:true,depthWrite:false,fog:false,uniforms:{uScale:U.uScale,uCol:{value:new T.Color(0xb9a88a)}},
 vertexShader:`uniform float uScale;
attribute float aA,aS;
varying float vA;
void main(){
  vA=aA;
  vec4 mv=modelViewMatrix*vec4(position,1.);
  gl_PointSize=min(aS*uScale/max(-mv.z,0.1),70.0);
  gl_Position=projectionMatrix*mv;
}`,
 fragmentShader:`uniform vec3 uCol;
varying float vA;
void main(){
  float d=length(gl_PointCoord-.5);
  gl_FragColor=vec4(uCol,smoothstep(.5,.1,d)*vA);
  #include <colorspace_fragment>
}`}));puffs.frustumCulled=false;scene.add(puffs);
let pi=0;const spawnPuff=(x,y,z,vx,vz)=>{const i=pi++%PN;pp.set([x+R(-.15,.15),y+.08,z+R(-.15,.15)],i*3);pv.set([vx*.15+R(-.4,.4),R(.2,.6),vz*.15+R(-.4,.4)],i*3);pl[i]=pm[i]=R(.5,.9)};
function updPuffs(dt){for(let i=0;i<PN;i++){if(pl[i]<=0){pA[i]=0;continue}pl[i]-=dt;const k=1-pl[i]/pm[i];for(let a=0;a<3;a++)pp[i*3+a]+=pv[i*3+a]*dt;pv[i*3+1]*=.97;pS[i]=.25+k*.9;pA[i]=Math.max(0,.45*(1-k))}
 pg.attributes.position.needsUpdate=pg.attributes.aA.needsUpdate=pg.attributes.aS.needsUpdate=true}

// ---------- player ----------
const player=new T.Group(),body=new T.Group();player.add(body);scene.add(player);
let mixer=null,hasClips=false,procT=0;const actions={};let curKey=null;
if(charG){
 const m=charG.scene;m.updateMatrixWorld(true);
 const b1=new T.Box3().setFromObject(m),k=CONFIG.charHeight/Math.max(b1.max.y-b1.min.y,1e-4);m.scale.multiplyScalar(k);m.updateMatrixWorld(true);
 m.position.y-=new T.Box3().setFromObject(m).min.y;m.rotation.y=CONFIG.charYawOffset;
 m.traverse(o=>{
   if(o.isMesh){
     const name = o.name.toLowerCase();
     // FIX: Hide baked-in ground/shadow planes from the character model
     if(name.includes('shadow') || name.includes('ground') || name.includes('plane') || name.includes('base')) {
       o.visible = false;
       return;
     }
     o.castShadow=true;o.receiveShadow=true;o.frustumCulled=false;
     const mats=Array.isArray(o.material)?o.material:[o.material];
     mats.forEach(mm=>{ 
       if(mm.metalness!==undefined)mm.metalness=Math.min(mm.metalness,0.3);
       if(mm.roughness!==undefined)mm.roughness=Math.max(mm.roughness,0.35);
       mm.needsUpdate=true;
     });
   }
 });
 body.add(m);
 
 const names=charG.animations.map(c=>c.name);console.info('Character clips:',names);$('clips').textContent='Clips: '+(names.join(', ')||'none found');
 mixer=new T.AnimationMixer(m);
 // FIX: Prefer exact names over regex matches to avoid picking "Idle to Walk" for the Walk state
 for(const key in CONFIG.clips){
   let clip = charG.animations.find(c => c.name.toLowerCase() === key) || 
              charG.animations.find(c => CONFIG.clips[key].test(c.name));
   if(clip) actions[key]={a:mixer.clipAction(clip),ts:key==='run'?1.35:key==='walk'?1:1};
 }
 if(!actions.idle&&charG.animations[0])actions.idle={a:mixer.clipAction(charG.animations[0]),ts:1};
 if(!actions.walk)actions.walk=actions.run||actions.idle;
 if(!actions.run) actions.run =actions.walk||actions.idle;
 if(!actions.jump)actions.jump=actions.run||actions.walk||actions.idle;
 if(actions.jump){actions.jump.a.setLoop(T.LoopOnce,1);actions.jump.a.clampWhenFinished=true;}
 hasClips=charG.animations.length>0;
}else{
 const m=new T.Mesh(new T.CapsuleGeometry(.3,1,4,10),new T.MeshStandardMaterial({color:0x3a7bd5}));
 m.position.y=.9;m.castShadow=true;body.add(m);
}

function play(k){
 const n=actions[k];if(!n)return;
 const a=n.a,prev=actions[curKey]?.a;
 if(a===prev){a.setEffectiveTimeScale(n.ts);if(!a.isRunning())a.play();curKey=k;return;}
 a.reset().setEffectiveTimeScale(n.ts).setEffectiveWeight(1).fadeIn(.18).play();
 if(prev)prev.fadeOut(.18);
 curKey=k;
}

const st={x:0,z:8,y:H(0,8),vx:0,vz:0,vy:0,grounded:true,face:0,land:0,jt:0,stepT:0};
let yaw=0,pitch=.35;const camPos=new T.Vector3(0,5,14),tgt=new T.Vector3(),tmpV=new T.Vector3();
const keys={};addEventListener('keydown',e=>{keys[e.code]=1;if(e.code==='Space')e.preventDefault()});addEventListener('keyup',e=>keys[e.code]=0);
let down=false;const cv=renderer.domElement;cv.addEventListener('mousedown',()=>down=true);addEventListener('mouseup',()=>down=false);
addEventListener('mousemove',e=>{if(document.pointerLockElement===cv||down){yaw-=e.movementX*.0025;pitch=clamp(pitch+e.movementY*.0025,-.15,1.2)}});
const lock=()=>{try{const p=cv.requestPointerLock();if(p&&p.catch)p.catch(()=>{})}catch(e){}};
$('start').addEventListener('click',()=>{$('start').style.display='none';lock()});
cv.addEventListener('click',()=>{if($('start').style.display==='none'&&!document.pointerLockElement)lock()});
document.addEventListener('pointerlockchange',()=>{if(!document.pointerLockElement)Object.keys(keys).forEach(k=>keys[k]=0)});

function updatePlayer(dt){
 const ix=(keys.KeyD?1:0)-(keys.KeyA?1:0),iz=(keys.KeyS?1:0)-(keys.KeyW?1:0),run=keys.ShiftLeft||keys.ShiftRight,sp=run?7.5:3.6;
 const s=Math.sin(yaw),c=Math.cos(yaw);let mx=s*iz+c*ix,mz=c*iz-s*ix;const l=Math.hypot(mx,mz);if(l>0){mx/=l;mz/=l}
 const a=1-Math.exp(-dt*(st.grounded?12:3));st.vx=lerp(st.vx,mx*sp,a);st.vz=lerp(st.vz,mz*sp,a);
 st.x=clamp(st.x+st.vx*dt,-49,49);st.z=clamp(st.z+st.vz*dt,-49,49);
 for(const o of solids){const dx=st.x-o.x,dz=st.z-o.z,d=Math.hypot(dx,dz),m=o.r+.35;if(d<m&&d>1e-4){st.x=o.x+dx/d*m;st.z=o.z+dz/d*m}}
 const gy=H(st.x,st.z);
 if(st.grounded&&keys.Space&&st.jt<=0)st.jt=.09;
 if(st.jt>0){st.jt-=dt;if(st.jt<=0){st.vy=7.5;st.grounded=false}}
 if(!st.grounded){st.vy-=22*dt;st.y+=st.vy*dt;if(st.y<=gy&&st.vy<=0){if(st.vy<-4)st.land=1;st.y=gy;st.vy=0;st.grounded=true}}else st.y=gy;
 const spd=Math.hypot(st.vx,st.vz);
 if(spd>.5){let d=Math.atan2(st.vx,st.vz)-st.face;d=Math.atan2(Math.sin(d),Math.cos(d));st.face+=d*(1-Math.exp(-dt*12))}
 
 if(mixer){
   const want=!st.grounded?(actions.jump?'jump':null):(spd>5.2?'run':spd>.6?'walk':'idle');
   if(want)play(want);
   mixer.update(dt);
 }
 st.land=Math.max(0,st.land-dt*4);
 
 const runK=clamp(spd/7.5,0,1);procT+=dt*(4+spd*1.6);
 body.position.y=Math.abs(Math.sin(procT))*(hasClips?0.02:0.06)*runK;
 body.rotation.x=runK*(hasClips?0.05:0.14);
 const ys=1-.2*st.land-(st.jt>0?.12:0);body.scale.set(1/Math.sqrt(ys),ys,1/Math.sqrt(ys));
 player.position.set(st.x,st.y,st.z);player.rotation.y=st.face;U.uP.value.set(st.x,st.y,st.z);
 st.stepT-=dt;if(st.grounded&&spd>1.5&&st.stepT<=0){st.stepT=run?.2:.32;for(let i=0;i<(run?3:2);i++)spawnPuff(st.x,st.y,st.z,-st.vx,-st.vz)}
 if(st.land>.95)for(let i=0;i<5;i++)spawnPuff(st.x,st.y,st.z,R(-4,4),R(-4,4));
}
function updateCamera(dt){
 tgt.set(st.x+st.vx*.2,st.y+1.6,st.z+st.vz*.2);const cp=Math.cos(pitch),d=6.5;
 const x=clamp(tgt.x+Math.sin(yaw)*cp*d,-80,80),z=clamp(tgt.z+Math.cos(yaw)*cp*d,-80,80),y=Math.max(tgt.y+Math.sin(pitch)*d,H(clamp(x,-50,50),clamp(z,-50,50))+.6);
 camPos.lerp(tmpV.set(x,y,z),1-Math.exp(-dt*9));camera.position.copy(camPos);camera.lookAt(tgt)}

// ---------- time of day / quality / GUI ----------
const S={tod:15,fog:.012,fireflies:false,density:600,quality:'High'};
const dayC=new T.Color(0xbcd8ee),nightC=new T.Color(0x0b1226),dusk=new T.Color(0xff8a50),topD=new T.Color(0x3f7fc8),topN=new T.Color(0x050912);
function applyTOD(){
 const a=(S.tod-6)/12*Math.PI,el=Math.sin(a);sunDir.set(Math.cos(a)*.85,Math.max(el,-.2)+.0001,.45).normalize();
 const dayK=clamp(el*3+.25,0,1),duskK=1-clamp(Math.abs(el)*4,0,1);
 skyU.uHor.value.copy(nightC).lerp(dayC,dayK).lerp(dusk,duskK*.6);skyU.uTop.value.copy(topN).lerp(topD,dayK);
 skyU.uSun.value.copy(sunDir);skyU.uNight.value=1-dayK;skyU.uSunCol.value.set(1,.9,.7).lerp(dusk,duskK);
 scene.fog.color.copy(skyU.uHor.value);scene.fog.density=S.fog;
 sun.color.set(0xffffff).lerp(dusk,duskK*.8);sun.intensity=3.2*dayK;
 hemi.color.copy(skyU.uHor.value);hemi.intensity=0.55+1.15*dayK;
 amb.intensity=0.1+0.12*dayK;
 fill.color.copy(skyU.uHor.value);fill.intensity=0.55*(0.25+0.75*dayK);
 flies.material.uniforms.uInt.value=(S.fireflies||dayK<.45)?1:0;motes.material.uniforms.uInt.value=.15+.6*dayK;beams.material.uniforms.uInt.value=.08*dayK;
 outer.material.color.set(0x3b5a30).multiplyScalar(.15+.85*dayK)}
const Q={Low:{sh:1024,pr:1,g:20000,m:200},Medium:{sh:2048,pr:1.5,g:45000,m:400},High:{sh:4096,pr:2,g:70000,m:600}};
function resize(){const w=innerWidth,h=innerHeight;renderer.setSize(w,h);camera.aspect=w/h;camera.updateProjectionMatrix();U.uScale.value=renderer.domElement.height/(2*Math.tan(camera.fov*Math.PI/360))}
let gui;
function applyQ(){const q=Q[S.quality];renderer.setPixelRatio(Math.min(devicePixelRatio,q.pr));
 sun.shadow.mapSize.set(q.sh,q.sh);
 if(sun.shadow.map){sun.shadow.map.dispose();sun.shadow.map=null}
 grass.count=q.g;S.density=q.m;motes.geometry.setDrawRange(0,q.m);resize();
 gui&&gui.controllersRecursive().forEach(c=>c.updateDisplay())}
addEventListener('resize',resize);
try{gui=new GUI({title:'Tuning'});
 gui.add(S,'tod',0,24,.05).name('Time of day').onChange(applyTOD);gui.add(S,'fog',.002,.04,.001).name('Fog density').onChange(applyTOD);
 gui.add(S,'fireflies').name('Fireflies').onChange(applyTOD);gui.add(S,'density',0,600,10).name('Dust density').onChange(v=>motes.geometry.setDrawRange(0,v));
 gui.add(renderer,'toneMappingExposure',.4,2,.05).name('Exposure');gui.add(S,'quality',Object.keys(Q)).name('Quality').onChange(applyQ)}catch(e){fail('GUI failed: '+e.message)}
applyQ();applyTOD();

// ---------- loop ----------
$('load').style.display='none';$('start').style.display='flex';
const clock=new T.Clock();let acc=0,frames=0;
function tick(){requestAnimationFrame(tick);if(document.hidden){clock.getDelta();return}
 const dt=Math.min(clock.getDelta(),.05);U.uT.value+=dt;
 updatePlayer(dt);updateCamera(dt);updPuffs(dt);
 fill.position.copy(camera.position);fill.target.position.copy(player.position);
 for(const p of[motes,flies,beams])p.material.uniforms.uC.value.set(st.x,0,st.z);
 sky.position.copy(camera.position);
 sun.target.position.set(st.x,st.y,st.z);
 sun.position.copy(sun.target.position).addScaledVector(sunDir,60);
 renderer.render(scene,camera);
 acc+=dt;frames++;if(acc>.5){$('fps').textContent=Math.round(frames/acc)+' fps · '+(acc/frames*1000).toFixed(1)+' ms';acc=frames=0}}
tick();