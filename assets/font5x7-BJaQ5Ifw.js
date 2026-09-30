import{D as e,N as t,O as n,R as r,a as i,b as a,d as o,h as s,i as c,j as l,p as u,r as d,s as f,v as p,w as m,x as h,z as g}from"./index-joHo_bLE.js";function _(e,t){let n=(Math.imul(e|0,2654435761)^2166136261)>>>0;for(let e=0;e<t.length;e++)n^=t.charCodeAt(e),n=Math.imul(n,16777619)>>>0;return n^=n>>>15,n=Math.imul(n,739982445)>>>0,n^=n>>>12,n=Math.imul(n,695872825)>>>0,n^=n>>>15,n>>>0}var v=class{s;constructor(e){this.s=e>>>0}next(){this.s=this.s+1831565813>>>0;let e=this.s;return e=Math.imul(e^e>>>15,e|1),e^=e+Math.imul(e^e>>>7,e|61),((e^e>>>14)>>>0)/4294967296}range(e,t){return e+(t-e)*this.next()}int(e,t){return Math.min(t,Math.floor(this.range(e,t+1)))}pick(e){return e[Math.min(e.length-1,Math.floor(this.next()*e.length))]}chance(e){return this.next()<e}shuffle(e){for(let t=e.length-1;t>0;t--){let n=Math.floor(this.next()*(t+1)),r=e[t];e[t]=e[n],e[n]=r}return e}},y=class{items=[];add(e){return this.items.push(e),e}dispose(){for(let e of this.items)e.dispose();this.items.length=0}};function b(){let e=[],t=[];for(let n=0;n<4;n++)e.push(new g(0,0,-1e4,0)),t.push(1);return{uTime:{value:0},uExcite:{value:0},uCheer:{value:e},uCheerR:{value:t},uWaveAng:{value:0},uWaveAmp:{value:0}}}var x=`
uniform vec4 uCheer[4];
uniform float uCheerR[4];
float stadiumCheer(vec2 p, float delay) {
  float c = 0.0;
  for (int i = 0; i < 4; i++) {
    float a = uTime - uCheer[i].z - delay;
    if (a > 0.0 && a < 7.0) {
      vec2 dd = p - uCheer[i].xy;
      float r = uCheerR[i];
      c += uCheer[i].w * exp(-dot(dd, dd) / (r * r)) * smoothstep(0.0, 0.18, a) * exp(-a * 0.7);
    }
  }
  return c;
}
`,S=`
float sHash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; p *= p + p; return fract(p); }
float sHash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * 0.1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
float sHash13(vec3 p3) { p3 = fract(p3 * 0.1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }
float sNoise2(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(sHash12(i), sHash12(i + vec2(1.0, 0.0)), u.x), mix(sHash12(i + vec2(0.0, 1.0)), sHash12(i + vec2(1.0, 1.0)), u.x), u.y);
}
float sNoise3(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  float a = sHash13(i), b = sHash13(i + vec3(1,0,0)), c = sHash13(i + vec3(0,1,0)), d = sHash13(i + vec3(1,1,0));
  float e = sHash13(i + vec3(0,0,1)), f1 = sHash13(i + vec3(1,0,1)), g = sHash13(i + vec3(0,1,1)), h = sHash13(i + vec3(1,1,1));
  return mix(mix(mix(a, b, u.x), mix(c, d, u.x), u.y), mix(mix(e, f1, u.x), mix(g, h, u.x), u.y), u.z);
}
`,C=new f;function w(e){return C.set(e),[C.r,C.g,C.b]}function ee(e,t){return[e[0]*t,e[1]*t,e[2]*t]}var T=new r,E=new r,D=new r,O=class{pos=[];nrm=[];uvs=[];col=[];idx=[];extras=new Map;defineExtra(e,t,n){this.extras.set(e,{size:t,data:[],cur:n.slice()})}setExtra(e,t){let n=this.extras.get(e);n&&(n.cur=t.slice())}get vertexCount(){return this.pos.length/3}vert(e,t,n,r,i){let a=this.pos.length/3;this.pos.push(e.x,e.y,e.z),this.nrm.push(t.x,t.y,t.z),this.uvs.push(n,r),this.col.push(i[0],i[1],i[2]);for(let e of this.extras.values())for(let t=0;t<e.size;t++)e.data.push(e.cur[t]??0);return a}quad(e,t,n,r,i,a,o){T.subVectors(t,e),E.subVectors(n,e),D.crossVectors(T,E),D.lengthSq()<1e-14&&(T.subVectors(n,t),E.subVectors(r,t),D.crossVectors(T,E)),D.normalize();let s=!1;a&&D.dot(a)<0&&(s=!0,D.negate());let c=Array.isArray(i[0])?i:[i,i,i,i],l=o??[0,0,1,0,1,1,0,1],u=D.clone(),d=this.vert(e,u,l[0],l[1],c[0]),f=this.vert(t,u,l[2],l[3],c[1]),p=this.vert(n,u,l[4],l[5],c[2]),m=this.vert(r,u,l[6],l[7],c[3]);s?this.idx.push(d,p,f,d,m,p):this.idx.push(d,f,p,d,p,m)}tri(e,t,n,r,i,a){T.subVectors(t,e),E.subVectors(n,e),D.crossVectors(T,E).normalize();let o=!1;i&&D.dot(i)<0&&(o=!0,D.negate());let s=a??[0,0,1,0,.5,1],c=D.clone(),l=this.vert(e,c,s[0],s[1],r),u=this.vert(t,c,s[2],s[3],r),d=this.vert(n,c,s[4],s[5],r);o?this.idx.push(l,d,u):this.idx.push(l,u,d)}box(e,t,n,i,o=[],s={}){let[c,l,u]=t,[d,f,p]=n,m=(t,n,i)=>new r(t,n,i).applyMatrix4(e),h=new a().getNormalMatrix(e),g=(e,t,n)=>new r(e,t,n).applyMatrix3(h).normalize(),_=[[`px`,m(d,l,u),m(d,f,u),m(d,f,p),m(d,l,p),g(1,0,0)],[`nx`,m(c,l,u),m(c,l,p),m(c,f,p),m(c,f,u),g(-1,0,0)],[`py`,m(c,f,u),m(c,f,p),m(d,f,p),m(d,f,u),g(0,1,0)],[`ny`,m(c,l,u),m(d,l,u),m(d,l,p),m(c,l,p),g(0,-1,0)],[`pz`,m(c,l,p),m(d,l,p),m(d,f,p),m(c,f,p),g(0,0,1)],[`nz`,m(c,l,u),m(c,f,u),m(d,f,u),m(d,l,u),g(0,0,-1)]];for(let[e,t,n,r,a,c]of _)o.includes(e)||this.quad(t,n,r,a,s[e]??i,c)}beam(e,t,n,i,a){let o=new r().subVectors(t,e),s=o.length();if(s<1e-6)return;o.divideScalar(s);let c=Math.abs(o.y)>.95?new r(1,0,0):new r(0,1,0),l=new r().crossVectors(c,o).normalize(),u=new r().crossVectors(o,l).normalize(),d=new h().makeBasis(l,u,o).setPosition(e),f=n/2,p=(a??n)/2;this.box(d,[-f,-p,0],[f,p,s],i,[`pz`,`nz`])}build(){let e=new c;e.setAttribute(`position`,new o(this.pos,3)),e.setAttribute(`normal`,new o(this.nrm,3)),e.setAttribute(`uv`,new o(this.uvs,2)),e.setAttribute(`color`,new o(this.col,3));for(let[t,n]of this.extras)e.setAttribute(t,new o(n.data,n.size));return e.setIndex(this.idx),e.computeBoundingSphere(),e.computeBoundingBox(),e}};function k(e,t,n){return new r(Math.cos(e)*t,n,Math.sin(e)*t)}function A(e,t,n){let r=Math.min(1,Math.max(0,(n-e)/(t-e)));return r*r*(3-2*r)}function te(){let e=new O;e.defineExtra(`aPart`,1,[0]),e.defineExtra(`aFlagUV`,2,[0,0]);let t=new h,n=[1,1,1],i=[`px`,`nx`,`py`,`ny`,`pz`,`nz`],a=(r,a,o,s)=>{for(let c of i)s.includes(c)||(e.setExtra(`aPart`,[o[c]??o.all??0]),e.box(t,r,a,n,i.filter(e=>e!==c)))};a([-.16,0,-.1],[.16,.84,.1],{all:0},[`py`,`ny`]),a([-.21,.82,-.125],[.21,1.42,.125],{all:1},[`ny`]),a([-.1,1.42,-.11],[.1,1.72,.11],{all:2,py:3,nz:3},[`ny`]),a([.21,.8,-.055],[.31,1.4,.055],{all:4,ny:6},[`py`]),a([-.31,.8,-.055],[-.21,1.4,.055],{all:5,ny:7},[`py`]),e.setExtra(`aPart`,[8]);let o=new r(-.275,.05,0),s=new r(-.245,.05,0),c=new r(-.245,.82,0),l=new r(-.275,.82,0);e.quad(o,s,c,l,n,new r(0,0,1)),e.quad(o,s,c,l,n,new r(0,0,-1)),e.setExtra(`aPart`,[9]);for(let t=0;t<2;t++){let i=t/2,a=(t+1)/2,o=-.26-i*.58,s=-.26-a*.58,c=.08,l=.44;for(let t of[1,-1]){let u=new r(0,0,t),d=[[new r(o,c,0),i,0],[new r(s,c,0),a,0],[new r(s,l,0),a,1],[new r(o,l,0),i,1]],f=[];for(let[t,r,i]of d)e.setExtra(`aFlagUV`,[r,i]),f.push(e.vert(t,u,r,i,n));t===1?e.idx.push(f[0],f[2],f[1],f[0],f[3],f[2]):e.idx.push(f[0],f[1],f[2],f[0],f[2],f[3])}}let u=e.build();return u.deleteAttribute(`color`),u.deleteAttribute(`uv`),u}var j=[[15328990,3],[11740715,3],[2042447,2],[2774456,2],[8368862,1],[14711338,2],[14264874,2],[3046730,1],[2051374,1],[7216938,1],[7031342,1],[12098154,1],[1973790,2],[9079434,1],[14711456,.7],[2787978,1],[15258170,1],[4876954,1.2],[5913226,.5]],ne=[11740715,2774456,14711338,15258170,3046730,15328990,1973790],re=`
attribute float aPart;
attribute vec2 aFlagUV;
attribute vec4 aSeed;
uniform float uTime;
uniform float uExcite;
uniform float uWaveAng;
uniform float uWaveAmp;
varying vec2 vFlagUV;
varying float vPart;
varying float vFlagKind;
${x}
${S}
vec3 cLin(vec3 c) { return pow(c, vec3(2.2)); }
vec3 skinCol(float r) {
  vec3 c = vec3(0.96, 0.80, 0.69);
  if (r > 0.83) c = vec3(0.40, 0.26, 0.17);
  else if (r > 0.70) c = vec3(0.58, 0.39, 0.25);
  else if (r > 0.52) c = vec3(0.78, 0.58, 0.42);
  else if (r > 0.30) c = vec3(0.90, 0.71, 0.56);
  return cLin(c);
}
vec3 hairCol(float r) {
  vec3 c = vec3(0.10, 0.08, 0.07);
  if (r > 0.85) c = vec3(0.62, 0.62, 0.60);
  else if (r > 0.72) c = vec3(0.78, 0.63, 0.36);
  else if (r > 0.6) c = vec3(0.50, 0.24, 0.12);
  else if (r > 0.3) c = vec3(0.28, 0.18, 0.10);
  return cLin(c);
}
vec3 hatCol(float r) {
  vec3 c = vec3(0.75, 0.12, 0.12);
  if (r > 0.86) c = vec3(0.70, 0.55, 0.33);
  else if (r > 0.72) c = vec3(0.92, 0.92, 0.9);
  else if (r > 0.58) c = vec3(0.12, 0.25, 0.62);
  else if (r > 0.44) c = vec3(0.10, 0.10, 0.10);
  else if (r > 0.3) c = vec3(0.15, 0.45, 0.2);
  else if (r > 0.15) c = vec3(0.90, 0.50, 0.12);
  return cLin(c);
}
vec3 pantsCol(float r) {
  vec3 c = vec3(0.20, 0.29, 0.45);
  if (r > 0.85) c = vec3(0.62, 0.55, 0.40);
  else if (r > 0.72) c = vec3(0.13, 0.13, 0.14);
  else if (r > 0.6) c = vec3(0.36, 0.25, 0.18);
  else if (r > 0.45) c = vec3(0.42, 0.52, 0.68);
  else if (r > 0.25) c = vec3(0.13, 0.19, 0.30);
  return cLin(c);
}
`,ie=`
vec4 cInst = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
float cPhase = aSeed.x * 6.2831853;
float cEnergy = aSeed.w;
float cCheer = min(stadiumCheer(cInst.xz, aSeed.x * 0.45), 1.6);
float cAng = atan(cInst.z, cInst.x);
float cDA = mod(cAng - uWaveAng + 3.14159265, 6.2831853) - 3.14159265;
float cWave = uWaveAmp * exp(-cDA * cDA / 0.03);
float cStand = smoothstep(aSeed.y - 0.1, aSeed.y + 0.1, uExcite * 1.1 + 0.02);
cStand = clamp(max(cStand, max(cWave, cCheer * 1.5)), 0.0, 1.0);
float cBeat = uTime * (5.0 + 2.6 * cEnergy) + cPhase;
float cBounce = abs(sin(cBeat)) * (cStand * (0.012 + 0.11 * uExcite * cEnergy) + cCheer * (0.13 + 0.16 * cEnergy));
float cLift = mix(-0.42, 0.0, cStand) + cBounce + cWave * 0.32;
float cFlagger = step(fract(aSeed.z * 53.7), 0.07);
float cGest = smoothstep(0.93, 0.99, sin(uTime * 0.31 + cPhase * 7.0));
float cArmUp = clamp(uExcite * cEnergy * 0.72 + cCheer * 1.4 + cWave * 1.6 + cGest * 0.7, 0.0, 1.0);
float cSide = (abs(aPart - 4.0) < 0.5 || abs(aPart - 6.0) < 0.5) ? 1.0 : -1.0;
bool cIsArm = aPart > 3.5;
float cRaise = 0.08 + 0.05 * sin(uTime * 0.8 + cPhase * 2.0) + cArmUp * (2.35 + 0.35 * sin(uTime * (7.0 + 3.0 * cEnergy) + cPhase * 3.0 + cSide) * (1.0 - cWave)) + cWave * 0.45;
if (cSide > 0.0) cRaise *= mix(fract(aSeed.w * 31.0) > 0.35 ? 1.0 : 0.25, 1.0, cWave);
if (cSide < 0.0 && cFlagger > 0.5) cRaise = max(cRaise, 1.7 + 0.5 * cArmUp + 0.35 * sin(uTime * 6.0 + cPhase));
float cA = cSide * cRaise;
float cCo = cos(cA);
float cSi = sin(cA);
mat3 cRot = cIsArm ? mat3(cCo, cSi, 0.0, -cSi, cCo, 0.0, 0.0, 0.0, 1.0) : mat3(1.0);
vec3 cPivot = vec3(cSide * 0.26, 1.37, 0.0);
`,ae=`
if (cIsArm) {
  vec3 cp = transformed;
  if (aPart > 8.5) cp.z += sin(uTime * 12.0 + aFlagUV.x * 4.0 + cPhase) * 0.1 * aFlagUV.x;
  if (aPart > 7.5 && cFlagger < 0.5) cp = cPivot;
  transformed = cPivot + cRot * (cp - cPivot);
}
transformed.y += cLift;
transformed.z -= (1.0 - cStand) * 0.14;
transformed.x += sin(uTime * 1.3 + cPhase) * 0.035 * transformed.y * (0.3 + cStand);
`,oe=`
vColor = vec4(1.0);
{
  float r1 = sHash11(aSeed.z * 91.7 + 1.3);
  float r2 = sHash11(aSeed.z * 47.3 + 7.1);
  float r3 = sHash11(aSeed.z * 13.1 + 3.7);
  vec3 shirt = instanceColor.rgb;
  vec3 skin = skinCol(r1);
  vec3 cc = shirt;
  if (aPart < 0.5) cc = pantsCol(r2);
  else if (aPart < 1.5) cc = shirt;
  else if (aPart < 2.5) cc = skin;
  else if (aPart < 3.5) cc = r3 < 0.36 ? hatCol(fract(r3 * 7.31)) : hairCol(fract(r3 * 5.17));
  else if (aPart < 5.5) cc = fract(aSeed.z * 23.0) < 0.42 ? skin : shirt;
  else if (aPart < 7.5) cc = skin;
  else if (aPart < 8.5) cc = vec3(0.04);
  vColor = vec4(cc, 1.0);
}
vFlagUV = aFlagUV;
vPart = aPart;
vFlagKind = floor(fract(aSeed.z * 17.3) * 5.0);
`,se=`
varying vec2 vFlagUV;
varying float vPart;
varying float vFlagKind;
`,ce=`
if (vPart > 8.5) {
  vec3 fc;
  vec2 fuv = vFlagUV;
  if (vFlagKind < 0.5) {
    fc = mix(vec3(0.62, 0.02, 0.04), vec3(0.85), step(0.5, fract(fuv.y * 3.5)));
    if (fuv.x < 0.42 && fuv.y > 0.5) fc = vec3(0.02, 0.04, 0.25);
  } else if (vFlagKind < 1.5) {
    fc = vec3(mod(floor(fuv.x * 5.0) + floor(fuv.y * 3.0), 2.0) * 0.82 + 0.02);
  } else if (vFlagKind < 2.5) fc = vec3(0.72, 0.04, 0.03);
  else if (vFlagKind < 3.5) fc = vec3(0.85, 0.62, 0.02);
  else fc = vec3(0.03, 0.4, 0.08);
  diffuseColor.rgb = fc;
}
`;function M(i,a,o,l,p,_){let v=i.filter(e=>e.kind===1),y=i.filter(e=>e.kind===2),b=i.filter(e=>e.kind===0),C=Math.min(v.length,Math.round(a*.07)),w=Math.min(y.length,Math.round(a*.018)),ee=Math.min(b.length,a-C-w),T=new Map,E=1+3*(1-Math.min(1,a/Math.max(1,i.length))),D=(e,t,n)=>{let r=e.map(e=>({s:e,k:l.next()**(1/Math.max(.01,n(e)**+E))}));return r.sort((e,t)=>t.k-e.k),r.slice(0,t).map(e=>e.s)},O=l.next()*100,k=[...D(b,ee,e=>{let t=T.get(e.section);t===void 0&&(t=.72+l.next()*.28,T.set(e.section,t));let n=.75+.25*Math.sin(e.a*23+O+e.row*.7)*Math.sin(e.a*7-O);return e.weight*t*n}),...D(v,C,()=>1),...D(y,w,()=>1)],A=k.length,M=new Map,N=j.reduce((e,t)=>e+t[1],0),P=()=>{let e=l.next()*N;for(let[t,n]of j)if(e-=n,e<=0)return t;return j[0][0]},F=te();_.add(F);let I=new m({roughness:.82,metalness:0});_.add(I),I.onBeforeCompile=e=>{e.uniforms.uTime=p.uTime,e.uniforms.uExcite=p.uExcite,e.uniforms.uCheer=p.uCheer,e.uniforms.uCheerR=p.uCheerR,e.uniforms.uWaveAng=p.uWaveAng,e.uniforms.uWaveAmp=p.uWaveAmp,e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
`+re).replace(`#include <beginnormal_vertex>`,ie+`
#include <beginnormal_vertex>
objectNormal = cRot * objectNormal;`).replace(`#include <begin_vertex>`,`#include <begin_vertex>
`+ae).replace(`#include <color_vertex>`,oe),e.fragmentShader=e.fragmentShader.replace(`#include <common>`,`#include <common>
`+se).replace(`#include <color_fragment>`,`#include <color_fragment>
`+ce)},I.customProgramCacheKey=()=>`stadium-crowd-v1`;let L=new s(F,I,A);L.name=`StadiumCrowd`,L.castShadow=!1,L.receiveShadow=!1;let R=new Float32Array(A*4),z=new Float32Array(A*3),B=new h,V=new n,H=new r,U=new r,W=new r(0,1,0),G=new f;for(let e=0;e<A;e++){let t=k[e],n=Math.atan2(-Math.cos(t.a),-Math.sin(t.a))+(l.next()-.5)*.35;l.chance(t.kind===2?.5:.06)&&(n+=(l.next()<.5?-1:1)*(.7+l.next()*.9)),V.setFromAxisAngle(W,n);let r=l.chance(.07)?.68+l.next()*.08:.9+l.next()*.17;H.set(r*(.92+l.next()*.16),r,r),U.set(t.x,t.y,t.z),B.compose(U,V,H),L.setMatrixAt(e,B);let i;i=t.kind===0?l.chance(.13)?-.3:.12+l.next()*.85:-.4;let a=l.next()**.8;R[e*4+0]=l.next(),R[e*4+1]=i,R[e*4+2]=l.next(),R[e*4+3]=a;let o=P();if(t.section>=0){let e=M.get(t.section);e===void 0&&(e=l.pick(ne),M.set(t.section,e)),l.chance(.3)&&(o=e)}G.set(o);let s=.85+l.next()*.2;z[e*3+0]=G.r*s,z[e*3+1]=G.g*s,z[e*3+2]=G.b*s}L.instanceColor=new u(z,3),F.setAttribute(`aSeed`,new u(R,4)),L.instanceMatrix.needsUpdate=!0,L.computeBoundingSphere(),L.boundingSphere&&(L.boundingSphere.radius+=2);let K=Math.min(o,A),q=new Float32Array(K*3),J=new Float32Array(K);for(let e=0;e<K;e++){let t=k[Math.floor(l.next()*k.length)],n=.35;q[e*3+0]=t.x-Math.cos(t.a)*n,q[e*3+1]=t.y+1.45+l.next()*.25,q[e*3+2]=t.z-Math.sin(t.a)*n,J[e]=l.next()}let Y=new c;Y.setAttribute(`position`,new d(q,3)),Y.setAttribute(`aSeed`,new d(J,1)),Y.computeBoundingSphere(),_.add(Y);let X=new g,Z=new t({uniforms:{uTime:p.uTime,uExcite:p.uExcite,uCheer:p.uCheer,uCheerR:p.uCheerR,uViewH:{value:800}},vertexShader:`
      attribute float aSeed;
      uniform float uTime;
      uniform float uExcite;
      uniform float uViewH;
      varying float vI;
      ${x}
      ${S}
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        float cheer = stadiumCheer(wp.xz, aSeed * 0.3);
        float rate = 0.0022 + 0.02 * uExcite * uExcite + 0.30 * min(cheer, 1.5);
        float t = uTime * 7.0 + aSeed * 31.0;
        float slot = floor(t);
        float h = sHash12(vec2(slot, aSeed * 977.0));
        float f = fract(t);
        vI = step(h, rate) * exp(-f * 5.0) * (0.6 + 0.4 * sHash11(slot + aSeed * 13.0));
        vec4 mv = viewMatrix * wp;
        gl_Position = projectionMatrix * mv;
        float px = 0.5 * projectionMatrix[1][1] * uViewH * 0.5 / max(0.1, -mv.z);
        gl_PointSize = vI > 0.002 ? clamp(px, 2.5, 28.0) : 0.0;
      }
    `,fragmentShader:`
      varying float vI;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c) * 2.0;
        float core = exp(-d * d * 10.0);
        float halo = exp(-d * d * 2.5) * 0.25;
        vec3 col = vec3(0.92, 0.95, 1.0) * clamp(vI * (core * 30.0 + halo * 6.0), 0.0, 40.0);
        gl_FragColor = vec4(col, 1.0);
      }
    `,transparent:!0,depthWrite:!1,blending:2,fog:!1});_.add(Z);let Q=new e(Y,Z);return Q.name=`StadiumCameraFlashes`,Q.frustumCulled=!1,Q.renderOrder=2,Q.onBeforeRender=e=>{e.getCurrentViewport(X),Z.uniforms.uViewH.value=X.w},{mesh:L,flashes:Q,count:A}}var N=2048,P=2048,F=1024,I=2,L=function(e){return e[e.KrashKola=0]=`KrashKola`,e[e.ScrapyardSams=1]=`ScrapyardSams`,e[e.PistonPetes=2]=`PistonPetes`,e[e.Bulldog=3]=`Bulldog`,e[e.MaxTorque=4]=`MaxTorque`,e[e.Hanks=5]=`Hanks`,e[e.Gutbuster=6]=`Gutbuster`,e[e.Sundown=7]=`Sundown`,e[e.Grizzly=8]=`Grizzly`,e[e.Lucky7=9]=`Lucky7`,e[e.TriCounty=10]=`TriCounty`,e[e.ChromeDome=11]=`ChromeDome`,e[e.DentBGone=12]=`DentBGone`,e[e.BigBuck=13]=`BigBuck`,e[e.Sparkys=14]=`Sparkys`,e[e.CountyLine=15]=`CountyLine`,e[e.PitGate=16]=`PitGate`,e[e.TheBowl=17]=`TheBowl`,e[e.PitEntry=18]=`PitEntry`,e[e.DerbyTonight=19]=`DerbyTonight`,e[e.KolaOfficial=20]=`KolaOfficial`,e[e.WelcomeFans=21]=`WelcomeFans`,e[e.RollORama=22]=`RollORama`,e}({}),R=[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,22],z=`Impact, Haettenschweiler, "Arial Narrow Bold", "Arial Black", sans-serif`,B=`"Arial Black", "Helvetica Neue", Arial, sans-serif`,V=`Rockwell, "Cooper Black", Georgia, "Times New Roman", serif`,H=`Didot, "Bodoni 72", Georgia, "Times New Roman", serif`,U=`"Brush Script MT", "Snell Roundhand", "Segoe Script", cursive`,W=`"Arial Rounded MT Bold", "Trebuchet MS", "Verdana", sans-serif`;function G(e,t,n,r,i){e.save(),e.font=`${i.style??`normal`} ${i.weight??`normal`} ${i.size}px ${i.font}`,e.textAlign=i.align??`center`,e.textBaseline=`middle`;let a=e.measureText(t).width,o=i.maxW??1e9,s=a>o?o/a:1;if(e.translate(n,r),e.scale(s,1),e.lineJoin=`round`,i.shadow){e.fillStyle=i.shadow;let n=i.shadowOff??4;i.stroke&&(e.strokeStyle=i.shadow,e.lineWidth=(i.strokeW??4)*2,e.strokeText(t,n/s,n)),e.fillText(t,n/s,n)}return i.stroke&&(e.strokeStyle=i.stroke,e.lineWidth=(i.strokeW??4)*2,e.strokeText(t,0,0)),e.fillStyle=i.color,e.fillText(t,0,0),e.restore(),a*s}function K(e,t,n,r,i){e.save(),e.strokeStyle=r,e.lineWidth=i,e.strokeRect(i/2,i/2,t-i,n-i),e.restore()}function q(e,t,n,r,i,a,o,s=36){e.save(),e.beginPath(),e.rect(t,n,r,i),e.clip(),e.fillStyle=a,e.fillRect(t,n,r,i),e.fillStyle=o;for(let a=-i*2;a<r+i*2;a+=s*2)e.beginPath(),e.moveTo(t+a,n+i),e.lineTo(t+a+s,n+i),e.lineTo(t+a+s+i,n),e.lineTo(t+a+i,n),e.closePath(),e.fill();e.restore()}function J(e,t,n,r,i){e.save(),e.translate(t,n),e.scale(r,r),e.fillStyle=i,e.beginPath(),e.moveTo(.2,-1),e.lineTo(-.45,.1),e.lineTo(-.02,.1),e.lineTo(-.25,1),e.lineTo(.5,-.2),e.lineTo(.06,-.2),e.lineTo(.35,-1),e.closePath(),e.fill(),e.restore()}function Y(e,t,n,r,i){e.save(),e.fillStyle=i,e.beginPath();for(let i=0;i<10;i++){let a=-Math.PI/2+i*Math.PI/5,o=i%2==0?r:r*.42;e.lineTo(t+Math.cos(a)*o,n+Math.sin(a)*o)}e.closePath(),e.fill(),e.restore()}function X(e,t,n,r,i,a){let o=e.createLinearGradient(t,n,r,i);for(let[e,t]of a)o.addColorStop(e,t);return o}var Z=F,Q=128,le={0:e=>{e.fillStyle=X(e,0,0,0,Q,[[0,`#e3202a`],[1,`#9c0c12`]]),e.fillRect(0,0,Z,Q),e.strokeStyle=`#fff`,e.lineWidth=9,e.beginPath(),e.moveTo(0,104),e.bezierCurveTo(260,70,520,132,1024,86),e.stroke(),J(e,92,62,46,`#ffd21f`),G(e,`KRASH KOLA`,470,58,{font:z,size:96,color:`#fff`,style:`italic`,stroke:`#6d0508`,strokeW:5,shadow:`rgba(0,0,0,0.45)`,maxW:640}),e.fillStyle=`#ffd21f`,e.beginPath(),e.arc(900,64,52,0,Math.PI*2),e.fill(),G(e,`ICE`,900,44,{font:B,size:30,color:`#9c0c12`,weight:`900`}),G(e,`COLD!`,900,80,{font:B,size:30,color:`#9c0c12`,weight:`900`}),K(e,Z,Q,`#fff`,6)},1:e=>{e.fillStyle=`#121212`,e.fillRect(0,0,Z,Q),q(e,0,0,90,Q,`#f2c200`,`#121212`,26),q(e,934,0,90,Q,`#f2c200`,`#121212`,26),G(e,`SCRAPYARD SAM'S`,Z/2,50,{font:z,size:78,color:`#f2c200`,maxW:780}),G(e,`WE BUY WRECKS  •  CASH PAID  •  RT. 9`,Z/2,104,{font:B,size:26,color:`#fff`,weight:`900`,maxW:760})},2:e=>{e.fillStyle=`#f4e6c2`,e.fillRect(0,0,Z,Q);let t=[`#1f7a3a`,`#f4e6c2`,`#b3211e`];for(let n=0;n<3;n++)e.fillStyle=t[n],e.fillRect(0,100+n*9,Z,9);e.fillStyle=`#d9a13a`,e.beginPath(),e.arc(80,58,44,0,Math.PI*2),e.fill(),e.fillStyle=`#c0391f`,e.beginPath(),e.arc(80,58,36,0,Math.PI*2),e.fill(),e.fillStyle=`#8a1d12`;for(let[t,n]of[[-14,-12],[12,-16],[18,10],[-10,16],[0,0]])e.beginPath(),e.arc(80+t,58+n,6,0,Math.PI*2),e.fill();G(e,`PISTON PETE'S`,450,54,{font:V,size:76,color:`#b3211e`,weight:`bold`,shadow:`rgba(0,0,0,0.25)`,shadowOff:3,maxW:560}),G(e,`Pizza!`,860,54,{font:U,size:84,color:`#1f7a3a`,maxW:260})},3:e=>{e.fillStyle=X(e,0,0,Z,0,[[0,`#132f78`],[.5,`#1f47a8`],[1,`#132f78`]]),e.fillRect(0,0,Z,Q),J(e,70,64,50,`#ffd21f`),J(e,954,64,50,`#ffd21f`),G(e,`BULLDOG`,400,62,{font:z,size:104,color:`#ffd21f`,stroke:`#0b1a44`,strokeW:5,maxW:460}),G(e,`SPARK PLUGS`,770,46,{font:B,size:38,color:`#fff`,weight:`900`,maxW:300}),G(e,`HOT START. EVERY START.`,770,90,{font:B,size:20,color:`#bcd0ff`,weight:`900`,maxW:300}),K(e,Z,Q,`#ffd21f`,5)},4:e=>{e.fillStyle=`#0e0e0e`,e.fillRect(0,0,Z,Q),e.fillStyle=`#c21d1d`,e.fillRect(0,96,Z,14),G(e,`MAX-TORQUE`,380,52,{font:z,size:92,color:X(e,0,10,0,100,[[0,`#ffe066`],[.55,`#ff8a1c`],[1,`#d23b0e`]]),style:`italic`,stroke:`#000`,strokeW:3,maxW:600}),G(e,`MOTOR OIL`,820,40,{font:B,size:36,color:`#fff`,weight:`900`,maxW:300}),e.fillStyle=`#ff8a1c`,e.fillRect(730,62,180,30),G(e,`10W-40`,820,78,{font:B,size:24,color:`#0e0e0e`,weight:`900`})},5:e=>{e.fillStyle=`#f2f0ea`,e.fillRect(0,0,Z,Q),e.fillStyle=`#c21d1d`,e.fillRect(24,18,190,92),G(e,`24`,90,66,{font:z,size:80,color:`#fff`}),G(e,`HR`,170,66,{font:z,size:46,color:`#fff`}),G(e,`HANK'S TOWING`,560,52,{font:z,size:80,color:`#16275c`,maxW:600}),G(e,`NO WRECK TOO BIG  •  CALL 555-0187`,560,104,{font:B,size:24,color:`#c21d1d`,weight:`900`,maxW:620}),K(e,Z,Q,`#16275c`,8)},6:e=>{e.fillStyle=`#f5c518`,e.fillRect(0,0,Z,Q),e.fillStyle=`#c0261f`;for(let t=0;t<16;t++){e.beginPath();let n=t/16*Math.PI*2;e.moveTo(80,64),e.arc(80,64,70,n,n+Math.PI/16),e.fill()}e.fillStyle=`#8a4b1c`,e.beginPath(),e.ellipse(80,64,40,26,0,0,Math.PI*2),e.fill(),G(e,`GUTBUSTER`,460,56,{font:V,size:88,color:`#c0261f`,weight:`bold`,stroke:`#fff4c9`,strokeW:4,maxW:560}),G(e,`BURGERS`,860,44,{font:B,size:40,color:`#5a2a0c`,weight:`900`,maxW:260}),G(e,`2 FOR $1.99`,860,90,{font:B,size:30,color:`#c0261f`,weight:`900`,maxW:260})},7:e=>{e.fillStyle=X(e,0,0,0,Q,[[0,`#2a0f4a`],[.55,`#a3246b`],[1,`#f28a1c`]]),e.fillRect(0,0,Z,Q),e.save(),e.beginPath(),e.rect(0,0,220,128),e.clip(),e.fillStyle=`#ffcf3a`,e.beginPath(),e.arc(110,128,90,Math.PI,0),e.fill(),e.fillStyle=`#a3246b`;for(let t=0;t<5;t++)e.fillRect(0,60+t*14,220,4+t);e.restore(),G(e,`Sundown Drive-In`,590,58,{font:U,size:96,color:`#fff`,shadow:`rgba(40,0,40,0.6)`,shadowOff:4,maxW:680}),G(e,`DOUBLE FEATURE  •  FRI & SAT  •  $3 A CARLOAD`,590,110,{font:B,size:20,color:`#ffe9a8`,weight:`900`,maxW:680})},8:e=>{e.fillStyle=`#3a2416`,e.fillRect(0,0,Z,Q),e.fillStyle=`#23150c`;for(let t=0;t<Z;t+=40)e.beginPath(),e.moveTo(t,0),e.lineTo(t+20,14),e.lineTo(t+40,0),e.fill(),e.beginPath(),e.moveTo(t,Q),e.lineTo(t+20,114),e.lineTo(t+40,Q),e.fill();G(e,`GRIZZLY TIRES`,400,64,{font:z,size:92,color:`#f0dcb0`,stroke:`#1a0e06`,strokeW:4,maxW:640}),G(e,`GRIPS LIKE A BEAR`,850,64,{font:B,size:26,color:`#e39b3a`,weight:`900`,maxW:250})},9:e=>{e.fillStyle=`#127a78`,e.fillRect(0,0,Z,Q),e.fillStyle=`#d42a2a`,e.beginPath(),e.arc(80,64,50,0,Math.PI*2),e.fill(),e.strokeStyle=`#fff`,e.lineWidth=5,e.stroke(),G(e,`7`,80,68,{font:z,size:84,color:`#fff`}),G(e,`LUCKY 7 LANES`,500,54,{font:W,size:76,color:`#fff`,weight:`bold`,shadow:`#0a4442`,shadowOff:4,maxW:700}),G(e,`BOWLING  •  BILLIARDS  •  COCKTAILS`,500,106,{font:B,size:22,color:`#ffe38a`,weight:`900`,maxW:700})},10:e=>{e.fillStyle=`#2e6a2a`,e.fillRect(0,0,Z,Q),e.fillStyle=`#f2d23a`,e.fillRect(0,0,Z,12),e.fillRect(0,116,Z,12),G(e,`TRI-COUNTY FEED & SEED`,Z/2,60,{font:V,size:70,color:`#f2d23a`,weight:`bold`,maxW:900}),G(e,`SINCE 1952`,Z/2,102,{font:B,size:20,color:`#e8f0d8`,weight:`900`})},11:e=>{e.fillStyle=X(e,0,0,0,Q,[[0,`#f5f5f5`],[.45,`#9c9fa4`],[.55,`#7d8086`],[1,`#e4e4e4`]]),e.fillRect(0,0,Z,Q),Y(e,80,60,40,`#fff`),Y(e,944,60,40,`#fff`),G(e,`CHROME DOME`,430,62,{font:z,size:96,color:`#141414`,style:`italic`,maxW:600}),G(e,`CAR WAX`,790,62,{font:B,size:44,color:`#c21d1d`,weight:`900`,maxW:220}),K(e,Z,Q,`#141414`,6)},12:e=>{e.fillStyle=`#e8641b`,e.fillRect(0,0,Z,Q),G(e,`DENT-B-GONE`,360,62,{font:z,size:100,color:`#111`,maxW:560}),G(e,`BODY & PAINT`,820,46,{font:B,size:36,color:`#fff`,weight:`900`,maxW:300}),G(e,`FREE ESTIMATES`,820,88,{font:B,size:26,color:`#111`,weight:`900`,maxW:300}),K(e,Z,Q,`#111`,6)},13:e=>{e.fillStyle=`#c99a5b`,e.fillRect(0,0,Z,Q),e.fillStyle=`#5a3417`,e.fillRect(0,0,Z,10),e.fillRect(0,118,Z,10),G(e,`BIG BUCK`,330,62,{font:V,size:92,color:`#4a2610`,weight:`bold`,maxW:480}),G(e,`BEEF JERKY`,760,62,{font:z,size:72,color:`#a8201a`,maxW:400})},14:e=>{e.fillStyle=`#0d1840`,e.fillRect(0,0,Z,Q);let t=(t,n,r,i)=>{e.strokeStyle=i,e.lineWidth=3;for(let i=0;i<14;i++){let a=i/14*Math.PI*2;e.beginPath(),e.moveTo(t+Math.cos(a)*r*.3,n+Math.sin(a)*r*.3),e.lineTo(t+Math.cos(a)*r,n+Math.sin(a)*r),e.stroke()}};t(70,50,44,`#ff4a4a`),t(150,86,32,`#ffd23a`),t(954,50,44,`#6ad0ff`),t(880,90,30,`#ff4a4a`),G(e,`SPARKY'S FIREWORKS`,Z/2,58,{font:z,size:80,color:`#fff`,stroke:`#d42a2a`,strokeW:4,maxW:640}),G(e,`OPEN ALL SUMMER`,Z/2,106,{font:B,size:22,color:`#ffd23a`,weight:`900`})},15:e=>{e.fillStyle=`#0f3d2e`,e.fillRect(0,0,Z,Q),e.strokeStyle=`#d6b35a`,e.lineWidth=3,e.strokeRect(12,12,1e3,104),G(e,`COUNTY LINE`,380,64,{font:H,size:76,color:`#e3c572`,weight:`bold`,maxW:520}),G(e,`SAVINGS & LOAN`,790,64,{font:H,size:44,color:`#e8e2c8`,maxW:330})},16:e=>{q(e,0,0,Z,Q,`#f2c200`,`#141414`,44),e.fillStyle=`#141414`,e.fillRect(250,14,524,100),G(e,`PIT GATE`,Z/2,56,{font:z,size:74,color:`#f2c200`,maxW:480}),G(e,`KEEP CLEAR`,Z/2,102,{font:B,size:22,color:`#fff`,weight:`900`})},17:e=>{e.fillStyle=`#b3171c`,e.fillRect(0,0,Z,Q),e.fillStyle=`#ffdf8a`;for(let t=18;t<Z;t+=36)e.beginPath(),e.arc(t,12,6,0,Math.PI*2),e.arc(t,116,6,0,Math.PI*2),e.fill();G(e,`★ THE BOWL ★`,Z/2,66,{font:z,size:88,color:`#fff`,stroke:`#5a0508`,strokeW:4,maxW:820})},18:e=>{e.fillStyle=`#10522c`,e.fillRect(0,0,Z,Q),e.strokeStyle=`#fff`,e.lineWidth=6,e.strokeRect(10,10,1004,108),G(e,`PITS  •  ALL DRIVERS REPORT HERE`,Z/2,66,{font:B,size:50,color:`#fff`,weight:`900`,maxW:900})},19:e=>{e.fillStyle=`#0c0c0c`,e.fillRect(0,0,Z,Q),G(e,`DEMOLITION DERBY`,420,58,{font:z,size:88,color:X(e,0,14,0,96,[[0,`#fff27a`],[.5,`#ff9a1c`],[1,`#e2361a`]]),style:`italic`,stroke:`#3a0a02`,strokeW:3,maxW:720}),G(e,`EVERY`,880,40,{font:B,size:30,color:`#fff`,weight:`900`}),G(e,`FRIDAY NIGHT`,880,84,{font:B,size:30,color:`#fff`,weight:`900`,maxW:240})},20:e=>{e.fillStyle=`#c8141c`,e.fillRect(0,0,Z,Q),J(e,60,64,44,`#ffd21f`),G(e,`KRASH KOLA`,360,62,{font:z,size:88,color:`#fff`,style:`italic`,maxW:480}),G(e,`OFFICIAL SODA OF THE BOWL`,800,64,{font:B,size:28,color:`#ffe9a8`,weight:`900`,maxW:380})},21:e=>{e.fillStyle=`#1a3a8a`,e.fillRect(0,0,Z,Q);for(let t=0;t<12;t++)Y(e,40+t*86,t%2?22:106,12,`#fff`);G(e,`WELCOME DERBY FANS!`,Z/2,64,{font:z,size:80,color:`#fff`,stroke:`#b3171c`,strokeW:4,maxW:820})},22:e=>{e.fillStyle=X(e,0,0,Z,0,[[0,`#ff5fa2`],[1,`#27c3c9`]]),e.fillRect(0,0,Z,Q),G(e,`ROLL-O-RAMA`,420,60,{font:W,size:90,color:`#fff`,weight:`bold`,stroke:`#5b1a6e`,strokeW:5,maxW:600}),G(e,`SKATE NIGHT`,840,46,{font:B,size:34,color:`#2b0a3a`,weight:`900`,maxW:280}),G(e,`DISCO WEDNESDAYS`,840,88,{font:B,size:24,color:`#fff`,weight:`900`,maxW:280})}};function ue(){let e=document.createElement(`canvas`);e.width=N,e.height=P;let t=e.getContext(`2d`);if(!t)throw Error(`stadium: 2D canvas unavailable`);t.fillStyle=`#555`,t.fillRect(0,0,N,P);for(let e of Object.keys(le)){let n=Number(e),r=n%I*F,i=Math.floor(n/I)*128;t.save(),t.beginPath(),t.rect(r,i,F,128),t.clip(),t.translate(r,i),le[n](t),t.restore()}let n=new i(e);return n.colorSpace=l,n.anisotropy=8,n.generateMipmaps=!0,n.minFilter=p,n.needsUpdate=!0,n}function $(e){let t=e%I*F,n=Math.floor(e/I)*128,r=1.5,i=(t+r)/N,a=(t+F-r)/N,o=1-(n+r)/P;return[i,1-(n+128-r)/P,a,o]}function de(e,t,n,i,a,o,s,c=8,l=[1,1,1]){let[u,d,f,p]=$(t);for(let t=0;t<c;t++){let m=t/c,h=(t+1)/c,g=n+(i-n)*m,_=n+(i-n)*h,v=(g+_)/2,y=new r(-Math.cos(v),0,-Math.sin(v)),b=u+(f-u)*m,x=u+(f-u)*h;e.quad(k(g,a,o),k(_,a,o),k(_,a,s),k(g,a,s),l,y,[b,d,x,d,x,p,b,p])}}function fe(e,t,n,i,a,o,s,c=[1,1,1]){let[l,u,d,f]=$(t),p=i.clone().multiplyScalar(o/2),m=a.clone().multiplyScalar(s/2),h=n.clone().sub(p).sub(m),g=n.clone().add(p).sub(m),_=n.clone().add(p).add(m),v=n.clone().sub(p).add(m),y=new r().crossVectors(i,a);e.quad(h,g,_,v,c,y,[l,u,d,u,d,f,l,f])}var pe={A:`01110 10001 10001 10001 11111 10001 10001`,B:`11110 10001 10001 11110 10001 10001 11110`,C:`01110 10001 10000 10000 10000 10001 01110`,D:`11100 10010 10001 10001 10001 10010 11100`,E:`11111 10000 10000 11110 10000 10000 11111`,F:`11111 10000 10000 11110 10000 10000 10000`,G:`01110 10001 10000 10111 10001 10001 01111`,H:`10001 10001 10001 11111 10001 10001 10001`,I:`01110 00100 00100 00100 00100 00100 01110`,J:`00111 00010 00010 00010 00010 10010 01100`,K:`10001 10010 10100 11000 10100 10010 10001`,L:`10000 10000 10000 10000 10000 10000 11111`,M:`10001 11011 10101 10101 10001 10001 10001`,N:`10001 10001 11001 10101 10011 10001 10001`,O:`01110 10001 10001 10001 10001 10001 01110`,P:`11110 10001 10001 11110 10000 10000 10000`,Q:`01110 10001 10001 10001 10101 10010 01101`,R:`11110 10001 10001 11110 10100 10010 10001`,S:`01111 10000 10000 01110 00001 00001 11110`,T:`11111 00100 00100 00100 00100 00100 00100`,U:`10001 10001 10001 10001 10001 10001 01110`,V:`10001 10001 10001 10001 10001 01010 00100`,W:`10001 10001 10001 10101 10101 10101 01010`,X:`10001 10001 01010 00100 01010 10001 10001`,Y:`10001 10001 10001 01010 00100 00100 00100`,Z:`11111 00001 00010 00100 01000 10000 11111`,0:`01110 10001 10011 10101 11001 10001 01110`,1:`00100 01100 00100 00100 00100 00100 01110`,2:`01110 10001 00001 00010 00100 01000 11111`,3:`11111 00010 00100 00010 00001 10001 01110`,4:`00010 00110 01010 10010 11111 00010 00010`,5:`11111 10000 11110 00001 00001 10001 01110`,6:`00110 01000 10000 11110 10001 10001 01110`,7:`11111 00001 00010 00100 01000 01000 01000`,8:`01110 10001 10001 01110 10001 10001 01110`,9:`01110 10001 10001 01111 00001 00010 01100`," ":`00000 00000 00000 00000 00000 00000 00000`,"#":`01010 01010 11111 01010 11111 01010 01010`,":":`00000 01100 01100 00000 01100 01100 00000`,"-":`00000 00000 00000 11111 00000 00000 00000`,".":`00000 00000 00000 00000 00000 01100 01100`,",":`00000 00000 00000 00000 01100 00100 01000`,"!":`00100 00100 00100 00100 00100 00000 00100`,"?":`01110 10001 00001 00010 00100 00000 00100`,"'":`01100 00100 01000 00000 00000 00000 00000`,'"':`01010 01010 01010 00000 00000 00000 00000`,"/":`00000 00001 00010 00100 01000 10000 00000`,"+":`00000 00100 00100 11111 00100 00100 00000`,"=":`00000 00000 11111 00000 11111 00000 00000`,"%":`11000 11001 00010 00100 01000 10011 00011`,"(":`00010 00100 01000 01000 01000 00100 00010`,")":`01000 00100 00010 00010 00010 00100 01000`,"*":`00000 00100 10101 01110 10101 00100 00000`,"&":`01100 10010 10100 01000 10101 10010 01101`,$:`00100 01111 10100 01110 00101 11110 00100`,"<":`00010 00100 01000 10000 01000 00100 00010`,">":`01000 00100 00010 00001 00010 00100 01000`,_:`00000 00000 00000 00000 00000 00000 11111`,"@":`01110 10001 00001 01101 10101 10101 01110`},me=new Map;function he(e){let t=e;t in pe||(t=t.toUpperCase()),t in pe||(t=`?`);let n=me.get(t);return n||(n=pe[t].split(` `).map(e=>parseInt(e,2)),me.set(t,n)),n}export{_,R as a,ee as b,de as c,M as d,y as f,b as g,v as h,F as i,fe as l,S as m,P as n,L as o,O as p,N as r,ue as s,he as t,$ as u,w as v,A as x,k as y};