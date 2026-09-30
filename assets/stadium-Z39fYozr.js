import{A as e,C as t,D as n,E as r,F as i,I as a,L as o,N as s,O as c,P as l,R as u,S as d,T as f,_ as p,a as m,c as h,f as g,h as _,i as v,j as y,k as b,l as x,r as S,s as C,t as w,v as T,w as E,x as D,z as O}from"./index-joHo_bLE.js";import{_ as k,a as A,b as j,c as M,d as N,f as P,g as F,h as I,l as L,m as R,o as z,p as B,s as ee,t as V,v as H,x as te,y as U}from"./font5x7-BJaQ5Ifw.js";function ne(e){let t=e.wallRadius,n=e.wallThickness,r=e.wallBaseY,i=e.wallTopY,a=t+n,o=a-.05,s=a+1.25,c=i-.02,l=i+.95,u=[],d=.86,f=.4;for(let e=0;e<10;e++)u.push({tier:0,index:e,rFront:s+e*d,rBack:s+(e+1)*d,y:l+e*f,depth:d,rise:f});let p=s+10*d,m=l+10*f,h=p+1.8,g=m+2.5,_=.82,v=.47;for(let e=0;e<10;e++)u.push({tier:1,index:e,rFront:h+e*_,rBack:h+(e+1)*_,y:g+e*v,depth:_,rise:v});let y=u[u.length-1],b=y.rBack,x=y.y+y.rise*.5+1.15,S=b+.35,C=e.gateAngle,w=Math.PI*2,T=C+Math.asin(Math.min(.99,5/o)),E=C+w-Math.asin(Math.min(.99,5/o)),D=E-T,O=Math.max(4,Math.round(D/(11*Math.PI/180))),k=[];for(let e=1;e<O;e++)k.push(T+D*e/O);let A=.62/s,j=S+4.2,M=x+19,N=[];for(let e=0;e<6;e++)N.push(C+Math.PI/6+e*Math.PI/3);return{wallR:t,wallT:n,baseY:r,topY:i,outerR:a,fenceR:t+n*.5,fenceMeshR:t+n*.5-.07,fenceTopY:Math.max(i+2.5,6),apronR0:o,apronR1:s,apronY:c,lowerFrontY:l,rows:u,crossR0:p,crossR1:h,crossY:m,upperFrontTopY:g,backR:b,backTopY:x,facadeR:S,gateAngle:C,gateHalfWidth:5,scoreboardAngle:C+Math.PI,towerAngles:N,towerR:j,lampY:M,aisles:k,aisleHalfAngle:A,standA0:T,standA1:E}}function W(e,t,n){let r=Math.asin(Math.min(.999,e.gateHalfWidth/t));return n===1?e.gateAngle+r:e.gateAngle+Math.PI*2-r}var re={apron:H(9209726),apronLine:H(14200874),parapet:H(2374264),parapetStripe:H(15328470),foot:H(9341570),benchFront:H(7301988),bench:H(10131085),riser:H(7631210),cross:H(9078397),fascia:H(7216413),fasciaStripe:H(15328470),backWall:H(8157295),cap:H(10131086),trim:H(11550766),facade:H(9275517),aisle:H(11183771),nosing:H(14726950)},ie=[H(13129246),H(14722346),H(11745826),H(14722346)],G=[H(2908078),H(14275261),H(2908078),H(3115654)];function ae(e,t){let n=[],r=(e,t,r,i,a,o=1,s=1)=>n.push({r0:e,y0:t,r1:r,y1:i,key:a,ao0:o,ao1:s});r(e.apronR0,e.apronY,e.apronR0+.14,e.apronY,`apronLine`,1,1),r(e.apronR0+.14,e.apronY,e.apronR1,e.apronY,`apron`,1,.78),r(e.apronR1,e.apronY,e.apronR1,e.lowerFrontY-.16,`parapet`,.8,1),r(e.apronR1,e.lowerFrontY-.16,e.apronR1,e.lowerFrontY,`parapetStripe`);let i=e.rows;for(let n=0;n<i.length;n++){let a=i[n],o=a.rFront+a.depth*.5,s=a.y+a.rise*.5;t?(r(a.rFront,a.y,a.rFront+.07,a.y,`nosing`),r(a.rFront+.07,a.y,o,a.y,`aisle`,1,.8),r(o,a.y,o,s,`riser`,.8,1),r(o,s,o+.07,s,`nosing`),r(o+.07,s,a.rBack,s,`aisle`,1,.8)):(r(a.rFront,a.y,o,a.y,`foot`,1,.7),r(o,a.y,o,s,`benchFront`,.72,1),r(o,s,a.rBack,s,`bench`,1,.8));let c=i[n+1];c&&c.tier===a.tier?r(a.rBack,s,a.rBack,c.y,`riser`,.8,1):a.tier===0?(r(a.rBack,s,a.rBack,e.crossY,`riser`,.8,1),r(e.crossR0,e.crossY,e.crossR1,e.crossY,`cross`,1,.75),r(e.crossR1,e.crossY,e.crossR1,e.upperFrontTopY-.18,`fascia`,.75,1),r(e.crossR1,e.upperFrontTopY-.18,e.crossR1,e.upperFrontTopY,`fasciaStripe`)):r(a.rBack,s,a.rBack,e.backTopY,`backWall`,.8,1)}return r(e.backR,e.backTopY,e.facadeR,e.backTopY,`cap`),r(e.facadeR,e.backTopY,e.facadeR,e.backTopY-.7,`trim`),r(e.facadeR,e.backTopY-.7,e.facadeR,0,`facade`,1,.55),n}function oe(e){let t=[],n=1.1*Math.PI/180,r=[e.standA0];for(let t of e.aisles)r.push(t-e.aisleHalfAngle,t+e.aisleHalfAngle);r.push(e.standA1);for(let e=0;e<r.length-1;e++){let i=r[e],a=r[e+1],o=e%2==1,s=Math.floor(e/2);if(o)t.push({a0:i,a1:a,aisle:!0,section:s,first:!1,last:!1});else{let e=Math.max(1,Math.ceil((a-i)/n));for(let n=0;n<e;n++)t.push({a0:i+(a-i)*n/e,a1:i+(a-i)*(n+1)/e,aisle:!1,section:s,first:!1,last:!1})}}return t[0].first=!0,t[t.length-1].last=!0,t}function se(e,t,n,r){let i=oe(e),a=ae(e,!1),s=ae(e,!0),c=new u(0,1,0),d=(t,n,r)=>r===0&&t.first?W(e,n,1):r===1&&t.last?W(e,n,-1):r===0?t.a0:t.a1,f=0;for(let r of i){let i=r.aisle?s:a,o=.94+t.next()*.1,c=f%7==0;f++;for(let t of i){let i=re[t.key],a=+(t.r0>=e.crossR0);if(t.key===`bench`||t.key===`benchFront`){let e=a===0?ie:G;i=e[r.section%e.length],t.key===`benchFront`&&(i=j(i,.62))}t.key===`facade`&&c&&(i=j(i,.82));let s=t.key===`nosing`||t.key===`apronLine`||t.key===`parapetStripe`||t.key===`fasciaStripe`?1:o,l=j(i,t.ao0*s),f=j(i,t.ao1*s),p=d(r,t.r0,0),m=d(r,t.r0,1),h=d(r,t.r1,0),g=d(r,t.r1,1),_=U(p,t.r0,t.y0),v=U(m,t.r0,t.y0),y=U(g,t.r1,t.y1),b=U(h,t.r1,t.y1),x=t.r1-t.r0,S=t.y1-t.y0,C=(p+m)*.5,w=new u(Math.cos(C)*-S,x,Math.sin(C)*-S),T=[p*t.r0/2.5,(t.r0+t.y0)/2.5,m*t.r0/2.5,(t.r0+t.y0)/2.5,g*t.r1/2.5,(t.r1+t.y1)/2.5,h*t.r1/2.5,(t.r1+t.y1)/2.5];n.quad(_,v,y,b,[l,l,f,f],w,T)}}let p=e.gateAngle,m=new u(Math.cos(p),0,Math.sin(p)),h=new u(-Math.sin(p),0,Math.cos(p)),g=e.gateHalfWidth,_=e=>Math.sqrt(Math.max(0,e*e-g*g)),v=(e,t,n)=>new u().addScaledVector(m,e).addScaledVector(h,t).setY(n),y=[];y.push(new o(_(a[0].r0),a[0].y0));for(let e of a){let t=new o(_(e.r1),e.y1),n=y[y.length-1];(Math.abs(n.x-t.x)>1e-5||Math.abs(n.y-t.y)>1e-5)&&y.push(t)}y.push(new o(_(a[0].r0),0));let b=l.triangulateShape(y,[]),x=H(7104864);for(let e of[1,-1]){let t=h.clone().multiplyScalar(-e);for(let r of b){let i=y[r[0]],a=y[r[1]],o=y[r[2]];n.tri(v(i.x,e*g,i.y),v(a.x,e*g,a.y),v(o.x,e*g,o.y),j(x,.9),t,[i.x/2.5,i.y/2.5,a.x/2.5,a.y/2.5,o.x/2.5,o.y/2.5])}}let S=H(2829102),C=H(14200874),w=e.facadeR+34,T=t=>{let n=e.outerR+.4,r=e.crossR0;if(t<=n)return e.baseY-.02;if(t>=r)return .03;let i=(t-n)/(r-n);return e.baseY-.02+(.03-(e.baseY-.02))*(i*i*(3-2*i))},E=[[-g,-.08,S],[-.08,.08,C],[.08,g,S]];for(let t=0;t<14;t++){let r=e.apronR0+(w-e.apronR0)*t/14,i=e.apronR0+(w-e.apronR0)*(t+1)/14;for(let[e,a,o]of E)o===C&&t%2==1?n.quad(v(r,e,T(r)),v(i,e,T(i)),v(i,a,T(i)),v(r,a,T(r)),S,c):n.quad(v(r,e,T(r)),v(i,e,T(i)),v(i,a,T(i)),v(r,a,T(r)),o,c,[r/2.5,e/2.5,i/2.5,e/2.5,i/2.5,a/2.5,r/2.5,a/2.5])}for(let t of[1,-1]){let r=new D().makeBasis(m,c,h).setPosition(0,0,0);n.box(r,[e.facadeR,0,t*g-.2],[w,.35,t*g+.2],H(10131085),[`ny`])}{let t=new D().makeBasis(m,c,h),i=_(e.crossR0)-.2,a=_(e.crossR1)+.8,o=H(8025709);n.box(t,[i,e.crossY-1.1,-g-.02],[a,e.crossY,g+.02],o,[],{ny:j(o,.45),py:H(9078397)}),n.box(t,[i,e.crossY,-g-.02],[i+.25,e.crossY+1.15,g+.02],o),n.box(t,[a-.25,e.crossY,-g-.02],[a,e.crossY+1.15,g+.02],o);for(let n=-4;n<=4;n++)r.box(t,[i+.08,e.crossY+1.15,n*1.2-.03],[i+.14,e.crossY+1.95,n*1.2+.03],H(14200874));r.box(t,[i+.05,e.crossY+1.9,-g],[i+.17,e.crossY+1.98,g],H(14200874))}let O=H(14200874),k=H(9278361),A=(t,n,a,o,s)=>{for(let s of i){let i=d(s,t,0),c=d(s,t,1);if(s.aisle&&n<e.crossY)continue;let l=U(i,t,n+a),u=U(c,t,n+a);r.beam(l,u,.07,o);let f=U(i,t,n+a*.5),p=U(c,t,n+a*.5);r.beam(f,p,.035,o)}let c=Math.floor(t*(e.standA1-e.standA0)/s);for(let i=0;i<=c;i++){let s=e.standA0+(e.standA1-e.standA0)*i/c,l=!1;for(let t of e.aisles)Math.abs(s-t)<e.aisleHalfAngle&&(l=!0);l&&n<e.crossY||r.beam(U(s,t,n),U(s,t,n+a),.06,o)}};A(e.apronR1+.06,e.lowerFrontY,.95,O,2.4),A(e.crossR1+.06,e.upperFrontTopY,.95,O,2.4),A(e.backR+.1,e.backTopY,1,k,3);for(let t of e.aisles)for(let n of[0,1]){let i=e.rows.filter(e=>e.tier===n),a=i[0],o=i[i.length-1],s=U(t,a.rFront+.4,a.y+.95),c=U(t,o.rBack-.2,o.y+o.rise*.5+.95);r.beam(s,c,.06,k);for(let e=0;e<=4;e++){let n=i[Math.round(e/4*(i.length-1))],l=n.rFront+n.depth*.5,u=(l-(a.rFront+.4))/(o.rBack-.2-(a.rFront+.4)),d=s.y+(c.y-s.y)*u;r.beam(U(t,l,n.y+n.rise*.5),U(t,l,d),.05,k)}}let M=[],N=[],P=[e.standA0,...e.aisles,e.standA1];for(let e=0;e<P.length-1;e++)N.push([P[e],P[e+1]]);let F=N.length;for(let n of e.rows){let r=n.rFront+n.depth*.26;for(let i=0;i<F;i++){let a=N[i][0],o=N[i][1];a=i===0?W(e,r,1)+.3/r:a+e.aisleHalfAngle+.22/r,o=i===F-1?W(e,r,-1)-.3/r:o-e.aisleHalfAngle-.22/r;let s=Math.floor((o-a)*r/.6);if(s<=0)continue;let c=(o-a)/s;for(let e=0;e<s;e++){let o=a+c*(e+.5)+(t.next()-.5)*.12/r,s=r+(t.next()-.5)*.06,l=n.index/9,u=(n.tier===0?1:.82)-.22*l*(n.tier===1?1:.4);M.push({x:Math.cos(o)*s,y:n.y,z:Math.sin(o)*s,a:o,r:s,kind:0,tier:n.tier,row:n.index,section:i,weight:u})}}}{let n=e.outerR+.32,r=e.apronR1-.3;for(let i=0;i<70;i++){let i=e.standA0+.05+t.next()*(e.standA1-e.standA0-.1),a=3+Math.floor(t.next()*9);for(let o=0;o<a;o++){let s=n+t.next()*(r-n),c=i+((o-a/2)*.55+(t.next()-.5)*.3)/s;c<W(e,s,1)+.4/s||c>W(e,s,-1)-.4/s||M.push({x:Math.cos(c)*s,y:e.apronY,z:Math.sin(c)*s,a:c,r:s,kind:1,tier:0,row:-1,section:-1,weight:1})}}let i=e.crossR0+.4,a=e.crossR1-.45;for(let n=0;n<160;n++){let n=i+t.next()*(a-i),r=e.standA0+.1+t.next()*(e.standA1-e.standA0-.2);r<W(e,n,1)+.5/n||r>W(e,n,-1)-.5/n||M.push({x:Math.cos(r)*n,y:e.crossY,z:Math.sin(r)*n,a:r,r:n,kind:2,tier:0,row:-1,section:-1,weight:1})}}return{seats:M,sections:F}}function ce(){let t=new Uint8Array(16384),n=e=>{let t=(e%64+64)%64;return Math.min(t,64-t)};for(let e=0;e<64;e++)for(let r=0;r<64;r++){let i=n(r-e)/Math.SQRT2,a=n(r+e+1)/Math.SQRT2,o=Math.max(0,Math.min(1,2.4-Math.min(i,a))),s=i<a?1:.82,c=(e*64+r)*4,l=Math.round(160*s);t[c]=l,t[c+1]=l+4,t[c+2]=l+9,t[c+3]=Math.round(o*255)}let r=new x(t,64,64,b,a);return r.wrapS=e,r.wrapT=e,r.magFilter=p,r.minFilter=T,r.generateMipmaps=!0,r.anisotropy=8,r.colorSpace=y,r.needsUpdate=!0,r}function le(e,t,n){let r=e.fenceR,i=e.topY,a=e.fenceTopY,o=H(9344154),s=H(6119782),c=Math.PI*2*r,l=Math.round(c/3.2);for(let e=0;e<l;e++){let n=e/l*Math.PI*2,c=new D().makeRotationY(-n).setPosition(U(n,r,0));t.box(c,[-.05,i,-.05],[.05,a+.05,.05],o,[`ny`]),t.box(c,[-.12,i,-.12],[.12,i+.03,.12],s,[`ny`]);let u=U(n,r,a),d=U(n,r-.55,a+.42);t.beam(u,d,.06,o)}let f=Math.max(96,l*2);for(let e=0;e<f;e++){let n=e/f*Math.PI*2,c=(e+1)/f*Math.PI*2;t.beam(U(n,r,a),U(c,r,a),.07,o),t.beam(U(n,r-.55,a+.42),U(c,r-.55,a+.42),.05,o),t.beam(U(n,r-.02,(i+a)*.5),U(c,r-.02,(i+a)*.5),.025,s)}let p=new B,m=e.fenceMeshR,h=[1,1,1],g=[[m,i+.01],[m,a],[m-.55,a+.42]];for(let e=0;e<f;e++){let t=e/f*Math.PI*2,n=(e+1)/f*Math.PI*2;for(let e=0;e<g.length-1;e++){let[r,o]=g[e],[s,c]=g[e+1],l=e===0?0:a-i,d=e===0?a-i:a-i+Math.hypot(r-s,o-c),f=(t+n)/2,m=new u(-Math.cos(f),0,-Math.sin(f));p.quad(U(t,r,o),U(n,r,o),U(n,s,c),U(t,s,c),h,m,[t*r,l,n*r,l,n*s,d,t*s,d])}}let _=p.build();_.deleteAttribute(`color`),n.add(_);let v=n.add(ce());v.repeat.set(10,10);let y=new E({map:v,transparent:!0,depthWrite:!1,side:2,roughness:.45,metalness:.6,color:new C(.9,.92,.95)});y.forceSinglePass=!0,n.add(y);let b=new d(_,y);return b.name=`StadiumCatchFence`,b.renderOrder=-1,b.castShadow=!1,b.receiveShadow=!1,{mesh:b}}var ue=[1,.93,.8];function de(e,t,r,i,a,o,c){let l=[],f=H(10133928),p=H(4869973),m=H(2764081),g=new u(0,1,0),_=[],y=.24;e.towerAngles.forEach((n,a)=>{let o=new u(Math.cos(n),0,Math.sin(n)),s=new u(-Math.sin(n),0,Math.cos(n)),c=o.clone().multiplyScalar(e.towerR),d=e.lampY-2.6,v=Math.max(6,Math.round(d/3.4)),b=(e,t)=>{let n=d*e/v,r=1.8+n/d*(.85-1.8),i=t===0||t===3?-1:1,a=t<2?-1:1;return c.clone().addScaledVector(o,i*r).addScaledVector(s,a*r).setY(n)};for(let e=0;e<4;e++)t.beam(b(0,e),b(v,e),.3,f);for(let e=0;e<=v;e++)for(let n=0;n<4;n++){let r=b(e,n),i=b(e,(n+1)%4);t.beam(r,i,.12,f),e<v&&(t.beam(r,b(e+1,(n+1)%4),.09,f),t.beam(i,b(e+1,n),.09,f))}let x=new D().makeRotationY(-n).setPosition(c);t.box(x,[-2.3,0,-2.3],[2.3,.6,2.3],H(9078397),[`ny`]);let S=n+Math.PI+.38*(a%2==0?1:-1),w=U(S,9+a%3*2.5,0),T=c.clone().addScaledVector(o,-1.2).setY(e.lampY),E=w.clone().sub(T).normalize(),O=new u().crossVectors(g,E).normalize(),k=new u().crossVectors(E,O).normalize(),A=new D().makeBasis(O,k,E).setPosition(T),M=6.5,N=3.8;t.box(A,[-6.5/2-.1,-3.8/2-.1,-.9],[3.35,-3.8/2+.05,-.75],p),t.box(A,[-6.5/2-.1,N/2-.05,-.9],[3.35,2,-.75],p),t.box(A,[-6.5/2-.1,-3.8/2,-.9],[-3.2,N/2,-.75],p),t.box(A,[M/2-.05,-3.8/2,-.9],[3.35,N/2,-.75],p);for(let e=0;e<3;e++)for(let n=0;n<5;n++){let a=(n-2)*1.3,o=(e-1)*1.25;t.box(A,[a-.5,o-.5,-.8],[a+.5,o+.5,.05],m,[`pz`]);let s=new u(a,o,.02).applyMatrix4(A),c=.85+i.next()*.3,l=j(ue,14*c),d=j(ue,14*c*.55);for(let e=0;e<12;e++){let t=e/12*Math.PI*2,n=(e+1)/12*Math.PI*2,i=new u(a+Math.cos(t)*.44,o+Math.sin(t)*.44,.02).applyMatrix4(A),c=new u(a+Math.cos(n)*.44,o+Math.sin(n)*.44,.02).applyMatrix4(A),f=r.vert(s,E,.5,.5,l),p=r.vert(i,E,0,0,d),m=r.vert(c,E,1,0,d);r.idx.push(f,p,m)}}let P=c.clone().setY(d);for(let[e,n]of[[-6.5/2,-3.8/2],[M/2,-3.8/2],[-6.5/2,N/2],[M/2,N/2]]){let r=new u(e*.8,n*.8,-.85).applyMatrix4(A);t.beam(P,r,.14,f)}let F=new D().makeRotationY(-n+Math.PI/2).setPosition(P);t.box(F,[-6.5/2,-.1,-1.4],[M/2,0,1.4],p);let I=T.distanceTo(w)*.97,L=2.6,R=L+Math.tan(y)*I,z=new h(L,R,I,28,1,!0),B=O.clone(),ee=new u().crossVectors(B,E.clone().negate()).normalize(),V=new D().makeBasis(B,E.clone().negate(),ee);V.setPosition(T.clone().addScaledVector(E,I/2+.6)),z.applyMatrix4(V),_.push(z),l.push({position:T.clone().addScaledVector(E,.8),target:w.clone(),angle:.5,penumbra:.55,color:new C(1,.95,.86)})});let b=w(_);for(let e of _)e.dispose();c.add(b);let x={uTime:a.uTime,uIntensity:{value:1},uColor:{value:new C(1,.9,.74)}},T=new s({uniforms:x,vertexShader:`
      varying vec3 vWorld;
      varying vec3 vN;
      varying float vAlong;
      void main() {
        vAlong = 1.0 - uv.y;
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        vN = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * w;
      }
    `,fragmentShader:`
      uniform float uTime;
      uniform float uIntensity;
      uniform vec3 uColor;
      varying vec3 vWorld;
      varying vec3 vN;
      varying float vAlong;
      ${R}
      void main() {
        // NB: every op guarded - a single NaN/Inf here would be smeared over the frame by the bloom blur
        vec3 toCam = cameraPosition - vWorld;
        float camDist = length(toCam);
        vec3 V = toCam / max(camDist, 1e-3);
        vec3 N = vN / max(length(vN), 1e-4);
        float facing = clamp(abs(dot(V, N)), 0.0, 1.0);
        float edge = facing * sqrt(facing);
        float a = clamp(vAlong, 0.0, 1.0);
        float ia = 1.0 - a;
        float fall = ia * ia * ia * smoothstep(0.0, 0.04, a);
        float ground = smoothstep(0.5, 9.0, vWorld.y);
        float camFade = smoothstep(4.0, 26.0, camDist);
        float n = sNoise3(vWorld * 0.12 + vec3(0.0, -uTime * 0.15, uTime * 0.05));
        float n2 = sNoise3(vWorld * 0.37 + vec3(uTime * 0.1, 0.0, 0.0));
        float dusty = 0.55 + 0.45 * n * (0.7 + 0.6 * n2);
        float v = clamp(edge * fall * ground * camFade * dusty * uIntensity * 0.15, 0.0, 2.0);
        gl_FragColor = vec4(uColor * v, 1.0);
      }
    `,transparent:!0,depthWrite:!1,blending:2,side:2,fog:!1});T.forceSinglePass=!0,c.add(T);let E=new d(b,T);E.name=`StadiumLightCones`,E.renderOrder=3,E.castShadow=!1,E.receiveShadow=!1;let k=o,A=new Float32Array(k*3),M=new Float32Array(k*4),N=new u;for(let t=0;t<k;t++){if(i.next()<.6){let e=l[Math.floor(i.next()*l.length)],n=N.subVectors(e.target,e.position).normalize().clone(),r=e.position.distanceTo(e.target),a=.08+i.next()**.8*.85,o=(2.4+Math.tan(y)*r*a)*Math.sqrt(i.next()),s=i.next()*Math.PI*2,c=new u().crossVectors(new u(0,1,0),n).normalize(),d=new u().crossVectors(n,c).normalize(),f=e.position.clone().addScaledVector(n,r*a).addScaledVector(c,Math.cos(s)*o).addScaledVector(d,Math.sin(s)*o);A[t*3]=f.x,A[t*3+1]=Math.max(.3,f.y),A[t*3+2]=f.z}else{let n=Math.sqrt(i.next())*(e.wallR+2),r=i.next()*Math.PI*2;A[t*3]=Math.cos(r)*n,A[t*3+1]=.4+i.next()**1.6*22,A[t*3+2]=Math.sin(r)*n}M[t*4]=i.next(),M[t*4+1]=i.next(),M[t*4+2]=i.next(),M[t*4+3]=i.next()}let P=new v;P.setAttribute(`position`,new S(A,3)),P.setAttribute(`aSeed`,new S(M,4)),c.add(P);let F=l.map(e=>e.position.clone()),I=l.map(e=>e.target.clone().sub(e.position).normalize()),L=new O,z=new s({uniforms:{uTime:a.uTime,uExcite:a.uExcite,uLampPos:{value:F},uLampDir:{value:I},uCosOuter:{value:Math.cos(y*1.1)},uCosInner:{value:Math.cos(y*.5)},uViewH:{value:800},uIntensity:{value:1}},vertexShader:`
      attribute vec4 aSeed;
      uniform float uTime;
      uniform float uExcite;
      uniform vec3 uLampPos[${l.length}];
      uniform vec3 uLampDir[${l.length}];
      uniform float uCosOuter;
      uniform float uCosInner;
      uniform float uViewH;
      uniform float uIntensity;
      varying float vB;
      void main() {
        vec3 p = position;
        float t = uTime;
        p.x += sin(t * (0.07 + 0.05 * aSeed.x) + aSeed.y * 6.283) * 1.6;
        p.z += cos(t * (0.06 + 0.05 * aSeed.z) + aSeed.w * 6.283) * 1.6;
        p.y += sin(t * (0.09 + 0.06 * aSeed.w) + aSeed.x * 6.283) * 0.9 + t * 0.03 * (aSeed.z - 0.3);
        p.y = 0.3 + mod(p.y - 0.3, 40.0);
        vec4 wp = modelMatrix * vec4(p, 1.0);
        float lit = 0.0;
        for (int i = 0; i < ${l.length}; i++) {
          vec3 d = wp.xyz - uLampPos[i];
          float dist = length(d);
          float c = dot(d / max(dist, 0.001), uLampDir[i]);
          lit += smoothstep(uCosOuter, uCosInner, c) * (1.0 / (1.0 + dist * dist * 0.0006));
        }
        vec4 mv = viewMatrix * wp;
        gl_Position = projectionMatrix * mv;
        float dist = -mv.z;
        float px = 0.03 * (0.6 + aSeed.y * 0.8) * projectionMatrix[1][1] * uViewH * 0.5 / max(dist, 0.1);
        float size = clamp(px, 1.0, 2.5);
        float energy = min((px * px) / (size * size), 1.5);
        float near = smoothstep(3.0, 12.0, dist);
        float tw = 0.65 + 0.35 * sin(t * (1.5 + aSeed.x * 3.0) + aSeed.z * 20.0);
        vB = min(lit, 1.5) * energy * near * tw * uIntensity * (0.16 + 0.1 * uExcite);
        gl_PointSize = vB > 0.003 ? size : 0.0;
      }
    `,fragmentShader:`
      varying float vB;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float a = 1.0 - smoothstep(0.1, 0.5, length(c));
        gl_FragColor = vec4(vec3(1.0, 0.92, 0.8) * clamp(vB * a * 1.6, 0.0, 6.0), 1.0);
      }
    `,transparent:!0,depthWrite:!1,blending:2,fog:!1});c.add(z);let B=new n(P,z);return B.name=`StadiumDust`,B.frustumCulled=!1,B.renderOrder=3,B.onBeforeRender=e=>{e.getCurrentViewport(L),z.uniforms.uViewH.value=L.w},{floodlights:l,cones:E,dust:B,setIntensity:e=>{x.uIntensity.value=e,z.uniforms.uIntensity.value=e}}}var K=160,q=72,J=3,fe=.125,Y={a:[255,176,58],y:[255,222,70],w:[255,236,200],r:[255,64,40],g:[90,255,110],b:[90,170,255],o:[255,120,30],c:[80,240,240]};function pe(e,t,n,i,c){let l=166*fe,p=78*fe,m=e.scoreboardAngle,h=new u(Math.cos(m),0,Math.sin(m)),g=new u(-Math.sin(m),0,Math.cos(m)),_=new u(0,1,0),v=h.clone().negate(),S=e.facadeR+3.6,C=e.backTopY+4.2,w=U(m,S,C+p/2),T=new D().makeBasis(g,_,v).setPosition(w),E=H(1908515),O=H(2766168),k=H(9278619);t.box(T,[-20.75/2-.7,-9.75/2-2.2,-1.6],[11.075,8.175,-.03],O,[],{pz:E});let A=-(C+p/2);for(let e of[-6.225,l*.3])t.box(T,[e-.5,A,-1.35],[e+.5,-9.75/2-2.2,-.35],k);for(let e=0;e<4;e++){let n=A+(-9.75/2-2.2-A)*e/4,r=A+(-9.75/2-2.2-A)*(e+1)/4,i=new u(-6.225,n,-.85).applyMatrix4(T),a=new u(l*.3,r,-.85).applyMatrix4(T),o=new u(l*.3,n,-.85).applyMatrix4(T),s=new u(-6.225,r,-.85).applyMatrix4(T);t.beam(i,a,.18,k),t.beam(o,s,.18,k)}let j=new u(0,6.5249999999999995,.01).applyMatrix4(T);L(n,z.TheBowl,j,g,_,20.8,2.6);let M=new u(0,-9.75/2-1.15,.01).applyMatrix4(T);L(n,z.KolaOfficial,M,g,_,13.6,1.7);for(let e=-3;e<=3;e++){let t=new u(l/7*e,8.225,-.4).applyMatrix4(T),n=.22;i.quad(t.clone().addScaledVector(g,-.22).addScaledVector(_,-.22),t.clone().addScaledVector(g,n).addScaledVector(_,-.22),t.clone().addScaledVector(g,n).addScaledVector(_,n),t.clone().addScaledVector(g,-.22).addScaledVector(_,n),[6,1.2,.5],v)}let N=new Uint8Array(46080),P=new x(N,K,q,b,a);P.magFilter=f,P.minFilter=f,P.generateMipmaps=!1,P.colorSpace=y,P.needsUpdate=!0,c.add(P);let F={uText:{value:P},uGrid:{value:new o(K,q)},uMargin:{value:J},uTime:{value:0},uBright:{value:4.2},uFlash:{value:0},uChase:{value:.6}},I=new s({uniforms:F,vertexShader:`
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,fragmentShader:`
      uniform sampler2D uText;
      uniform vec2 uGrid;
      uniform float uMargin;
      uniform float uTime;
      uniform float uBright;
      uniform float uFlash;
      uniform float uChase;
      varying vec2 vUv;
      void main() {
        vec2 total = uGrid + 2.0 * uMargin;
        vec2 g = vUv * total - uMargin;
        vec2 cell = floor(g);
        vec2 f = fract(g) - 0.5;
        float fw = max(length(fwidth(g)), 1e-3);
        float R = 0.36;
        float dotMask = 1.0 - smoothstep(R - fw * 0.7, R + fw * 0.7, length(f));
        dotMask = mix(dotMask, 3.14159 * R * R * 1.3, smoothstep(0.35, 0.9, fw));
        vec3 col = vec3(0.004, 0.004, 0.005);
        bool inside = cell.x >= 0.0 && cell.y >= 0.0 && cell.x < uGrid.x && cell.y < uGrid.y;
        if (inside) {
          vec4 t = texture2D(uText, (cell + 0.5) / uGrid);
          vec3 lit = t.rgb * uBright * (1.0 + uFlash * 0.7);
          vec3 off = vec3(0.02, 0.018, 0.016);
          col = mix(off, lit, t.a) * dotMask;
          col *= 0.95 + 0.05 * sin(uTime * 37.0 + cell.y * 0.9);
        } else {
          // chaser bulbs on the middle ring of the border
          float lo = -2.0;
          float hx = uGrid.x + 1.0;
          float hy = uGrid.y + 1.0;
          bool onRing = (cell.x == lo || cell.x == hx) && cell.y >= lo && cell.y <= hy
                     || (cell.y == lo || cell.y == hy) && cell.x >= lo && cell.x <= hx;
          if (onRing && mod(cell.x + cell.y, 2.0) < 0.5) {
            float W = hx - lo;
            float H = hy - lo;
            float p;
            if (cell.y == lo) p = cell.x - lo;
            else if (cell.x == hx) p = W + (cell.y - lo);
            else if (cell.y == hy) p = W + H + (hx - cell.x);
            else p = 2.0 * W + H + (hy - cell.y);
            float on = step(0.5, fract(p / 10.0 - uTime * uChase));
            on = max(on, uFlash * step(0.5, fract(uTime * 6.0)));
            float bulb = 1.0 - smoothstep(0.3 - fw, 0.3 + fw, length(f));
            col = mix(vec3(0.03, 0.02, 0.01), vec3(1.0, 0.72, 0.32) * 5.0, on) * bulb;
          }
        }
        gl_FragColor = vec4(clamp(col, 0.0, 16.0), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,fog:!1});c.add(I);let R=new r(l,p);c.add(R);let B=new d(R,I);B.name=`StadiumScoreboard`,T.decompose(B.position,B.quaternion,B.scale),B.position.addScaledVector(v,.02),B.castShadow=!1,B.receiveShadow=!1;let ee=e=>{N.fill(0);let t=(e,t)=>e===0&&t>=3?Y.r:e%2==0?Y.a:Y.y,n=e.slice(0,8).map((e,n,r)=>{let i=e,a=t(n,r.length),o=/^\^([a-z])/.exec(i);o&&(a=Y[o[1]]??a,i=i.slice(2)),i=i.toUpperCase();let s=i.length<=13?2:1;return i.length>26&&(i=i.slice(0,26)),{text:i,color:a,scale:s}}),r=e=>e.reduce((t,n,r)=>t+7*n.scale+(r<e.length-1?n.scale===2?4:3:0),0);for(let e=n.length-1;e>=0&&r(n)>q;e--)n[e].scale=1;for(;n.length>0&&r(n)>q;)n.pop();let i=Math.floor((q-r(n))/2);for(let e of n){let t=e.scale,n=e.text.length*6*t-t,r=Math.floor((K-n)/2);for(let n of e.text){let a=V(n);for(let n=0;n<7;n++)for(let o=0;o<5;o++)if(a[n]&1<<4-o)for(let a=0;a<t;a++)for(let s=0;s<t;s++){let c=r+o*t+s,l=i+n*t+a;if(c<0||c>=K||l<0||l>=q)continue;let u=((71-l)*K+c)*4;N[u]=e.color[0],N[u+1]=e.color[1],N[u+2]=e.color[2],N[u+3]=255}r+=6*t}i+=7*t+(t===2?4:3)}P.needsUpdate=!0},te=0;return{screen:B,setLines:ee,update:(e,t)=>{te+=e,F.uTime.value=te%1e3,F.uChase.value=.35+2.2*t,F.uFlash.value=Math.max(0,F.uFlash.value-e*.9)},flash:e=>{F.uFlash.value=Math.min(1.5,Math.max(F.uFlash.value,e))}}}function me(e,t,n,r){let a=new i(1,48,24);r.add(a);let o=e.clone().normalize(),c=Math.abs(o.y)>.99?new u(1,0,0):new u(0,1,0),l=new u().crossVectors(o,c).normalize(),f=new u().crossVectors(l,o).normalize(),p={uMoonT1:{value:l},uMoonT2:{value:f},uRadius:{value:800},uTime:{value:0},uMoonDir:{value:e.clone().normalize()},uTownDir:{value:t.clone().setY(0).normalize()},uStarDensity:{value:n},uCloud:{value:1}},m=new s({uniforms:p,vertexShader:`
      uniform float uRadius;
      varying vec3 vDir;
      void main() {
        vDir = position;
        vec3 wp = cameraPosition + position * uRadius;
        gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
      }
    `,fragmentShader:`
      uniform float uTime;
      uniform vec3 uMoonDir;
      uniform vec3 uMoonT1;
      uniform vec3 uMoonT2;
      uniform vec3 uTownDir;
      uniform float uStarDensity;
      uniform float uCloud;
      varying vec3 vDir;
      ${R}
      float fbm2(vec2 p) {
        float a = 0.5, s = 0.0;
        for (int i = 0; i < 5; i++) { s += a * sNoise2(p); p = p * 2.03 + vec2(17.1, 9.7); a *= 0.5; }
        return s;
      }
      // stars on the 6 faces of a cube map (2D cells => no clipped stars)
      vec3 starLayer(vec3 d, float scale, float density, float pixAng, float seed) {
        vec3 a = abs(d);
        vec2 uv; float face;
        if (a.x > a.y && a.x > a.z) { uv = d.yz / a.x; face = d.x > 0.0 ? 0.0 : 1.0; }
        else if (a.y > a.z) { uv = d.xz / a.y; face = d.y > 0.0 ? 2.0 : 3.0; }
        else { uv = d.xy / a.z; face = d.z > 0.0 ? 4.0 : 5.0; }
        vec2 g = uv * scale;
        vec2 cell = floor(g);
        vec2 f = fract(g);
        vec2 key = cell + vec2(face * 157.0 + seed, face * 311.0 - seed);
        float h = sHash12(key);
        if (h > density) return vec3(0.0);
        vec2 sp = 0.25 + 0.5 * vec2(sHash12(key + 19.19), sHash12(key + 47.3));
        float dist = length(f - sp);
        float pix = pixAng * scale;
        float rad = max(pix * 0.62, 0.03);
        float b = exp(-(dist * dist) / (rad * rad));
        float mag = sHash12(key + 7.7);
        float bright = 0.05 + mag * mag * mag * mag * mag * mag * mag * mag * 1.4;
        float tw = 0.78 + 0.22 * sin(uTime * (1.7 + 5.0 * mag) + h * 300.0);
        vec3 tint = mix(vec3(1.0, 0.82, 0.66), vec3(0.72, 0.83, 1.0), sHash12(key + 3.3));
        return tint * b * bright * tw;
      }
      void main() {
        vec3 d = normalize(vDir);
        float pixAng = length(fwidth(d));
        float el = d.y;
        float elp = max(el, 0.0);
        vec2 hd = normalize(d.xz + vec2(1e-5));
        float townAz = max(0.0, dot(hd, normalize(uTownDir.xz)));
        float az = atan(d.z, abs(d.x) + abs(d.z) < 1e-6 ? 1.0 : d.x);

        // base gradient (linear HDR values, deliberately dark)
        vec3 zen = vec3(0.0022, 0.0045, 0.020);
        vec3 mid = vec3(0.0045, 0.011, 0.042);
        vec3 hor = vec3(0.012, 0.024, 0.068);
        vec3 col = mix(mid, zen, smoothstep(0.15, 0.95, elp));
        col = mix(hor, col, smoothstep(0.0, 0.3, elp));
        // warm town glow + faint general light pollution
        float glowAz = 0.12 + 0.88 * pow(townAz, 4.0);
        col += vec3(0.34, 0.14, 0.035) * glowAz * exp(-elp * 6.0);
        col += vec3(0.02, 0.028, 0.05) * exp(-elp * 8.0);

        // moon
        float md = length(d - uMoonDir);
        float moonR = 0.021;
        float moonAA = pixAng * 1.2 + 1e-4;
        float disc = 1.0 - smoothstep(moonR - moonAA, moonR + moonAA, md);
        col += vec3(0.30, 0.34, 0.42) * 0.12 * exp(-md * 18.0) + vec3(0.25, 0.3, 0.4) * 0.03 * exp(-md * 4.0);

        // clouds (thin, drifting, lit by moon and from below by the town)
        float starMask = 1.0;
        if (el > -0.02) {
          vec2 cp = d.xz / (elp + 0.1) * 0.55 + vec2(uTime * 0.004, uTime * 0.0015);
          float c = fbm2(cp * 1.4);
          float cov = smoothstep(0.52, 0.82, c) * smoothstep(0.0, 0.18, el) * uCloud;
          vec2 mh = normalize(uMoonDir.xz + vec2(1e-5));
          float moonSide = pow(max(0.0, dot(hd, mh)), 2.0);
          vec3 cloudCol = vec3(0.016, 0.019, 0.03) + vec3(0.03, 0.034, 0.045) * moonSide * (1.0 - exp(-md * 2.0) * 0.0)
                        + vec3(0.22, 0.09, 0.035) * glowAz * exp(-elp * 4.0) * 0.6;
          cloudCol += vec3(0.35, 0.38, 0.45) * 0.25 * exp(-md * 7.0);
          col = mix(col, cloudCol, cov * 0.8);
          starMask = 1.0 - cov;
        }

        // stars
        if (el > 0.0) {
          vec3 s = starLayer(d, 150.0, 0.014 * uStarDensity, pixAng, 1.0) * 0.8
                 + starLayer(d, 60.0, 0.012 * uStarDensity, pixAng, 7.0);
          float horizonFade = smoothstep(0.02, 0.3, el);
          col += s * starMask * horizonFade * (1.0 - disc);
        }

        // moon disc on top (occluded a little by clouds)
        vec2 mp = vec2(dot(d - uMoonDir, uMoonT1), dot(d - uMoonDir, uMoonT2)) / moonR;
        float limb = sqrt(max(0.0, 1.0 - dot(mp, mp)));
        float maria = fbm2(mp * 1.8 + 4.0);
        vec3 moonCol = vec3(1.0, 0.96, 0.88) * (0.6 + 0.4 * limb) * (1.0 - 0.38 * smoothstep(0.42, 0.62, maria)) * 2.6;
        col = mix(col, moonCol, disc * mix(1.0, 0.55, 1.0 - starMask));

        // distant horizon: tree line, a few buildings and a water tower towards the town, lights below
        float hTree = 0.004 + 0.008 * sNoise2(vec2(az * 38.0, 1.3)) + 0.004 * sNoise2(vec2(az * 160.0, 7.1));
        float bId = floor(az * 160.0);
        float bh = step(0.45, sHash11(bId)) * (0.006 + 0.02 * sHash11(bId + 3.1)) * smoothstep(0.55, 0.95, townAz);
        float townAng = atan(uTownDir.z, uTownDir.x) + 0.12;
        float dAz = mod(az - townAng + 3.14159265, 6.2831853) - 3.14159265;
        float tank = step(abs(dAz), 0.012) * step(0.032, el) * step(el, 0.046);
        float legs = step(abs(abs(dAz) - 0.007), 0.0012) * step(el, 0.034);
        float sil = max(hTree, bh);
        if (el < sil || tank > 0.5 || legs > 0.5) {
          col = vec3(0.006, 0.0065, 0.009) + vec3(0.03, 0.013, 0.006) * glowAz * 0.4;
          // lit windows in the buildings
          if (bh > hTree && el < bh) {
            vec2 wc = floor(vec2(az * 2400.0, el * 1500.0));
            float lit = step(0.72, sHash12(wc + 5.0));
            col += vec3(1.0, 0.7, 0.35) * lit * 0.25 * step(0.3, fract(az * 2400.0)) * step(0.3, fract(el * 1500.0));
          }
          if (tank > 0.5 && abs(dAz) < 0.002 && el > 0.045) col += vec3(1.2, 0.05, 0.02); // aircraft warning light
        }
        if (el < 0.0) {
          float depth = -el;
          vec3 ground = vec3(0.004, 0.0045, 0.005) + vec3(0.02, 0.009, 0.004) * glowAz * exp(-depth * 40.0);
          // scattered town lights near the horizon
          vec2 lg = vec2(az * 900.0, depth * 2600.0);
          vec2 lc = floor(lg);
          float lh = sHash12(lc + 91.0);
          float dens = 0.04 + 0.35 * pow(townAz, 3.0);
          vec2 lf = fract(lg) - 0.5;
          float dot1 = step(lh, dens) * exp(-dot(lf, lf) * 18.0);
          vec3 lcol = mix(vec3(1.0, 0.55, 0.2), vec3(0.9, 0.9, 1.0), step(0.7, sHash12(lc + 3.0)));
          ground += lcol * dot1 * 0.8 * (1.0 - smoothstep(0.0, 0.08, depth));
          col = ground;
        }
        gl_FragColor = vec4(clamp(col, 0.0, 8.0), 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,side:1,depthWrite:!1,depthTest:!0,fog:!1});r.add(m);let h=new d(a,m);return h.name=`StadiumSky`,h.frustumCulled=!1,h.renderOrder=-1e3,h.castShadow=!1,h.receiveShadow=!1,h.onBeforeRender=(e,t,n)=>{let r=n.far,i=n.near;typeof r==`number`&&isFinite(r)&&r>0&&(p.uRadius.value=Math.max((i??.1)*4,r*.9))},{mesh:h,update:e=>{p.uTime.value=e}}}var X=1024,Z=512,Q=256,$=128,he=[0,1,5,6,7,8,9,10,11,2,3,4],ge=[12,13,14,15];function _e(){let e=document.createElement(`canvas`);e.width=X,e.height=Z;let t=e.getContext(`2d`);if(!t)throw Error(`stadium: 2D canvas unavailable`);let n=(e,n)=>{let r=e%4*Q,i=Math.floor(e/4)*$;t.save(),t.beginPath(),t.rect(r,i,Q,$),t.clip(),t.translate(r,i),n(t),t.restore()},r=(e,t)=>{e.fillStyle=t,e.fillRect(0,0,Q,$)},i=(e,t,n,r,i=`Impact, "Arial Black", sans-serif`,a=``)=>{e.fillStyle=n,e.font=`${a} ${r}px ${i}`,e.textAlign=`center`,e.textBaseline=`middle`;let o=e.measureText(t).width,s=Math.min(1,232/o);e.save(),e.translate(Q/2,66),e.scale(s,1),e.fillText(t,0,0),e.restore()},a=(e,t,n,r,i)=>{e.fillStyle=i,e.beginPath();for(let i=0;i<10;i++){let a=-Math.PI/2+i*Math.PI/5,o=i%2==0?r:r*.42;e.lineTo(t+Math.cos(a)*o,n+Math.sin(a)*o)}e.closePath(),e.fill()};return n(0,e=>{for(let t=0;t<13;t++)e.fillStyle=t%2==0?`#b3192e`:`#f2f0ea`,e.fillRect(0,t*$/13,Q,10.846153846153847);e.fillStyle=`#1c2a5e`,e.fillRect(0,0,Q*.42,896/13),e.fillStyle=`#f2f0ea`;for(let t=0;t<5;t++)for(let n=0;n<6;n++)e.beginPath(),e.arc(9+n*17+t%2*8,7+t*12.5,2.4,0,Math.PI*2),e.fill()}),n(1,e=>{for(let t=0;t<8;t++)for(let n=0;n<4;n++)e.fillStyle=(t+n)%2?`#111`:`#f2f2f2`,e.fillRect(t*32,n*32,32,32)}),n(2,e=>r(e,`#1f8a36`)),n(3,e=>r(e,`#f2c61f`)),n(4,e=>r(e,`#c8141c`)),n(5,e=>{r(e,`#c8141c`),i(e,`KRASH KOLA`,`#fff`,54,`Impact, "Arial Black", sans-serif`,`italic`)}),n(6,e=>{r(e,`#1d3f94`),a(e,30,64,20,`#f2c61f`),a(e,226,64,20,`#f2c61f`),i(e,`THE BOWL`,`#fff`,50)}),n(7,e=>{r(e,`#e8641b`),i(e,`DERBY!`,`#111`,70)}),n(8,e=>{r(e,`#f2f0ea`),e.fillStyle=`#b3192e`,e.fillRect(0,0,Q/2,$)}),n(9,e=>{r(e,`#123a8a`),a(e,Q/2,$/2,46,`#f2c61f`)}),n(10,e=>{r(e,`#141414`),i(e,`#1 FANS`,`#f2c61f`,64)}),n(11,e=>{r(e,`#f5c518`),i(e,`GUTBUSTER`,`#c0261f`,50)}),n(12,e=>r(e,`#d0202a`)),n(13,e=>r(e,`#eeeeee`)),n(14,e=>r(e,`#1f47a8`)),n(15,e=>r(e,`#f2c61f`)),e}function ve(e){let t=e%4*Q,n=Math.floor(e/4)*$;return[(t+2)/X,1-(n+$-2)/Z,(t+Q-2)/X,1-(n+2)/Z]}function ye(e,t,n,r,i,a){let o=new B;o.defineExtra(`aWave`,3,[0,0,1]),o.defineExtra(`aDir`,3,[0,0,1]),o.defineExtra(`aAlong`,3,[1,0,0]);let s=[1,1,1],c=new u(Math.cos(i),0,Math.sin(i)),l=new u().crossVectors(c,new u(0,1,0)).normalize(),f=H(14211288),p=t=>{let n=(e,t)=>Math.abs(Math.atan2(Math.sin(e-t),Math.cos(e-t)));return n(t,e.scoreboardAngle)<.2||n(t,e.gateAngle)<.2},h=0;for(let r=0;r<30;r++){let i=e.gateAngle+(r+.5)/30*Math.PI*2;if(p(i))continue;let a=e.backR+.18,u=U(i,a,e.backTopY),d=u.clone().setY(e.backTopY+5.2);n.beam(u,d.clone().setY(d.y+.15),.07,f);let m=he[h++%he.length],[g,_,v,y]=ve(m),b=2.4,x=t.next()*Math.PI*2;o.setExtra(`aDir`,[l.x,l.y,l.z]),o.setExtra(`aAlong`,[c.x,c.y,c.z]);for(let e=0;e<2;e++)for(let t=0;t<8;t++){let n=[];for(let[r,i]of[[0,0],[1,0],[1,1],[0,1]]){let a=(t+r)/8,u=(e+i)/2,f=d.clone().addScaledVector(c,a*b).setY(d.y-.05-u*1.2);o.setExtra(`aWave`,[a,x,b]),n.push(o.vert(f,l,g+(v-g)*a,y-(y-_)*u,s))}o.idx.push(n[0],n[1],n[2],n[0],n[2],n[3])}}let g=e.crossR1+.06,_=e.upperFrontTopY+.95,v=(e.standA1-e.standA0)*g,b=Math.floor(v/4.8),x=H(3158064),S=new u(0,-1,0),C=0;for(let r=0;r<b;r++){let i=e.standA0+(e.standA1-e.standA0)*r/b,a=e.standA0+(e.standA1-e.standA0)*(r+1)/b,c=e=>_-.88*e*(1-e);for(let e=0;e<4;e++){let t=e/4,r=(e+1)/4;n.beam(U(i+(a-i)*t,g,c(t)),U(i+(a-i)*r,g,c(r)),.02,x)}for(let e=0;e<8;e++){let n=(e+.5)/8,r=i+(a-i)*n,l=.17/g,d=U(r-l,g-.02,c(n)),f=U(r+l,g-.02,c(n)),p=U(r,g-.02,c(n)-.46),m=new u(Math.cos(r),0,Math.sin(r)),[h,_,v,y]=ve(ge[C++%ge.length]),b=t.next()*Math.PI*2;o.setExtra(`aDir`,[m.x,0,m.z]),o.setExtra(`aAlong`,[S.x,S.y,S.z]),o.setExtra(`aWave`,[0,b,.46]);let x=o.vert(d,m,h,y,s),w=o.vert(f,m,v,y,s);o.setExtra(`aWave`,[1,b,.46]);let T=o.vert(p,m,(h+v)/2,_,s);o.idx.push(x,w,T)}}let w=o.build();w.deleteAttribute(`color`),a.add(w);let T=new m(_e());T.colorSpace=y,T.anisotropy=4,a.add(T);let D={uFlagEnergy:{value:.3}},O=new E({map:T,side:2,roughness:.85,metalness:0});O.onBeforeCompile=e=>{e.uniforms.uTime=r.uTime,e.uniforms.uFlagEnergy=D.uFlagEnergy,e.vertexShader=e.vertexShader.replace(`#include <common>`,`#include <common>
        attribute vec3 aWave;
        attribute vec3 aDir;
        attribute vec3 aAlong;
        uniform float uTime;
        uniform float uFlagEnergy;`).replace(`#include <beginnormal_vertex>`,`float fW = aWave.x;
        float fL = max(aWave.z, 0.01);
        float fSpeed = 5.0 + 7.0 * uFlagEnergy;
        float fAmp = (0.06 + 0.16 * uFlagEnergy) * fL;
        float fA1 = fW * 5.5 - uTime * fSpeed + aWave.y;
        float fA2 = fW * 12.0 - uTime * fSpeed * 1.6 + aWave.y * 1.7;
        float fDisp = (sin(fA1) + 0.35 * sin(fA2)) * fAmp * fW;
        float fDer = ((cos(fA1) * 5.5 + 0.35 * 12.0 * cos(fA2)) * fAmp * fW + (sin(fA1) + 0.35 * sin(fA2)) * fAmp) / fL;
        #include <beginnormal_vertex>
        float fSg = sign(dot(objectNormal, aDir) + 1e-4);
        objectNormal = normalize(fSg * (aDir - aAlong * fDer));`).replace(`#include <begin_vertex>`,`#include <begin_vertex>
        transformed += aDir * fDisp;
        if (abs(aAlong.y) < 0.5) transformed.y -= fW * fW * 0.28 * fL * (1.0 - uFlagEnergy);`)},O.customProgramCacheKey=()=>`stadium-flags-v1`,a.add(O);let k=new d(w,O);return k.name=`StadiumFlags`,k.castShadow=!1,k.receiveShadow=!1,{mesh:k,uniforms:D}}function be(t,n=256,r=.78,i=1){let a=document.createElement(`canvas`);a.width=n,a.height=n;let o=a.getContext(`2d`);if(!o)throw Error(`stadium: 2D canvas unavailable`);let s=o.createImageData(n,n),c=e=>{let r=[];for(let n=0;n<e*e;n++)r.push(t.next());return(t,i)=>{let a=t/n*e,o=i/n*e,s=Math.floor(a),c=Math.floor(o),l=a-s,u=o-c,d=l*l*(3-2*l),f=u*u*(3-2*u),p=(t,n)=>r[(n%e+e)%e*e+(t%e+e)%e],m=p(s,c)+(p(s+1,c)-p(s,c))*d;return m+(p(s,c+1)+(p(s+1,c+1)-p(s,c+1))*d-m)*f}},l=c(8),u=c(32),d=c(128);for(let e=0;e<n;e++)for(let a=0;a<n;a++){let o=l(a,e)*.5+u(a,e)*.3+d(a,e)*.2,c=t.next()<.02?-.15:0,f=Math.max(0,Math.min(1,r+(i-r)*o+c)),p=(e*n+a)*4;s.data[p]=s.data[p+1]=s.data[p+2]=Math.round(f*255),s.data[p+3]=255}o.putImageData(s,0,0);let f=new m(a);return f.wrapS=e,f.wrapT=e,f.colorSpace=y,f.anisotropy=8,f}function xe(e,t,n,r,i,a,o){let s=[[e.outerR-.1,H(5920592)],[e.facadeR+7,H(6117972)],[e.facadeR+9,H(2894895)],[118,H(2631980)],[126,H(1844758)],[260,H(1318161)],[480,H(725002)],[900,H(461063)]],l=new B,f=new u(0,1,0);for(let e=0;e<s.length-1;e++){let[t,n]=s[e],[r,i]=s[e+1];for(let e=0;e<160;e++){let a=e/160*Math.PI*2,o=(e+1)/160*Math.PI*2,s=[U(a,t,0),U(o,t,0),U(o,r,0),U(a,r,0)],c=[];for(let e of s)c.push(e.x/7,e.z/7);l.quad(s[0],s[1],s[2],s[3],[n,n,i,i],f,c)}}let p=l.build();o.add(p);let m=new E({vertexColors:!0,map:i,roughness:.95,metalness:0});o.add(m);let h=new d(p,m);h.name=`StadiumGround`,h.receiveShadow=!0,h.castShadow=!1;let g=new B,v=new D,y=[1,1,1],b=[.05,.06,.07],x=[.03,.03,.03];g.box(v,[-.9,.18,-2.3],[.9,.95,2.3],y,[`ny`]),g.box(v,[-.78,.95,-1.25],[.78,1.42,.85],y,[`ny`],{pz:b,nz:b,px:b,nx:b}),g.box(v,[-.92,0,-1.7],[.92,.36,-1],x,[`ny`,`py`]),g.box(v,[-.92,0,1],[.92,.36,1.7],x,[`ny`,`py`]);let S=g.build();S.deleteAttribute(`uv`),o.add(S);let w=new E({vertexColors:!0,roughness:.45,metalness:.45});o.add(w);let T=[12104356,9051164,2046574,2972211,14141856,5913122,2236962,14737628,10135733,11818526,7240238,8003389,13214247,3960458],O=[],k=e.gateAngle,A=(e,t)=>Math.abs(Math.sin(e-k))*t<9&&Math.cos(e-k)>0,M=(t,n)=>e.towerAngles.some(r=>U(r,e.towerR,0).distanceTo(U(t,n,0))<5);for(let e=72;e<=112;e+=7){let n=Math.floor(Math.PI*2*e/2.8);for(let r=0;r<n;r++){let i=r/n*Math.PI*2;if(A(i,e)||M(i,e)||t.next()>.62*a)continue;let o=Math.floor((e-72)/7)%2==0?0:Math.PI,s=Math.atan2(Math.cos(i),Math.sin(i))+o+(t.next()-.5)*.12;O.push({p:U(i,e+(t.next()-.5)*.4,0),yaw:s,scale:new u(1,1,.92+t.next()*.16),color:t.pick(T)})}}let N=new u(Math.cos(k),0,Math.sin(k)),P=new u(-Math.sin(k),0,Math.cos(k));for(let n=0;n<8;n++){let r=e.facadeR+10+n%4*7,i=n<4?1:-1,a=N.clone().multiplyScalar(r).addScaledVector(P,i*(8.5+t.next()));O.push({p:a,yaw:Math.atan2(N.x,N.z)+(t.next()-.5)*.2,scale:new u(1.35,2.1,2.3),color:t.pick([15262938,9051164,2046574,13214247])})}let F=new _(S,w,Math.max(1,O.length));F.name=`StadiumParkingLot`;let I=new D,L=new c,R=new C;O.forEach((e,t)=>{L.setFromAxisAngle(f,e.yaw),I.compose(e.p,L,e.scale),F.setMatrixAt(t,I),R.set(e.color),F.setColorAt(t,R)}),F.count=O.length,F.castShadow=!1,F.receiveShadow=!1,F.computeBoundingSphere();let z=H(8225416),ee=j(H(16754784),7);for(let e=90;e<=120;e+=30){let t=Math.round(Math.PI*2*e/42);for(let i=0;i<t;i++){let a=(i+(e===90?.5:0))/t*Math.PI*2;if(A(a,e))continue;let o=U(a,e,0),s=U(a,e,11);n.beam(o,s,.22,z);let c=new u(Math.cos(a+1.5708),0,Math.sin(a+1.5708));for(let e of[1,-1]){let t=s.clone().addScaledVector(c,e*1.6);n.beam(s,t,.12,z);let i=t.clone().setY(t.y-.12),a=.35;r.quad(i.clone().add(new u(-.35,0,-.35)),i.clone().add(new u(a,0,-.35)),i.clone().add(new u(a,0,a)),i.clone().add(new u(-.35,0,a)),ee,new u(0,-1,0))}}}return{ground:h,cars:F}}function Se(e={}){let n=e.seed??1977,r=(e.quality??`high`)===`high`,i=ne({wallRadius:e.wallRadius??36,wallThickness:e.wallThickness??.6,wallBaseY:e.wallBaseY??1.4,wallTopY:e.wallTopY??2.7,gateAngle:e.gateAngle??Math.PI/2}),a=e=>new I(k(n,e)),o=new P,s=F(),c=new g;c.name=`Stadium`;let l=new B,f=new B,p=new B,m=new B,h=new B,_=se(i,a(`stands`),l,f),v=le(i,f,o),y=de(i,f,p,a(`lights`),s,r?2600:900,o),b=pe(i,f,h,p,o),x=a(`wind`).range(0,Math.PI*2),S=ye(i,a(`flags`),f,s,x,o),w=o.add(be(a(`concrete`),256,.8,1)),T=o.add(be(a(`groundtex`),256,.62,1)),D=xe(i,a(`ground`),f,p,T,r?1:.35,o),O=a(`signs`).shuffle(A.slice()),j=0,R=()=>{let e=O[j%O.length];return j++,e};{let e=i.wallR-.01,t=i.baseY+.12,n=i.topY-.12,r=(n-t)*8,a=r*.5/e;M(m,z.PitGate,i.gateAngle-a,i.gateAngle+a,e,t,n,8);let o=.45,s=i.gateAngle+a+o/e,c=i.gateAngle+Math.PI*2-a-o/e,l=Math.floor(((c-s)*e+o)/(r+o)),d=((c-s)*e-l*r)/Math.max(1,l-1);for(let i=0;i<l;i++){let a=s+i*(r+d)/e;M(m,R(),a,a+r/e,e,t,n,8)}let f=i.crossR1-.02,g=i.upperFrontTopY-.26,_=g-1,v=W(i,f,1)+1.2/f,y=W(i,f,-1)-1.2/f,b=Math.floor((y-v)*f/10),x=((y-v)*f-b*8)/Math.max(1,b-1);j+=5;for(let e=0;e<b;e++){let t=v+e*(8+x)/f,n=e%5==2?z.DerbyTonight:e%9==6?z.WelcomeFans:R();M(m,n,t,t+8/f,f,_,g,8)}let S=i.gateAngle,C=new u(Math.cos(S),0,Math.sin(S)),w=new u(-Math.sin(S),0,Math.cos(S)),T=Math.sqrt(i.crossR0*i.crossR0-i.gateHalfWidth*i.gateHalfWidth)-.2,E=C.clone().multiplyScalar(T-.02).setY(i.crossY+.2);L(h,z.PitEntry,E,w,new u(0,1,0),8.8,1.1);let D=C.clone().multiplyScalar(T+.6).setY(i.crossY-1.12);p.quad(D.clone().addScaledVector(w,-1.2).addScaledVector(C,-.2),D.clone().addScaledVector(w,1.2).addScaledVector(C,-.2),D.clone().addScaledVector(w,1.2).addScaledVector(C,.2),D.clone().addScaledVector(w,-1.2).addScaledVector(C,.2),[5,3.6,2.2],new u(0,-1,0))}{let e=i.facadeR+.03,t=Math.floor((i.standA1-i.standA0)*e/9),n=[.02,.02,.022],r=[6,3.8,1.9];for(let a=0;a<t;a++){let o=i.standA0+(a+.5)*(i.standA1-i.standA0)/t,s=new u(Math.cos(o),0,Math.sin(o)),c=new u(-Math.sin(o),0,Math.cos(o)),d=s.clone().multiplyScalar(e),f=(e,t,n,r,i,a)=>a.quad(e.clone().addScaledVector(c,-t/2).setY(n),e.clone().addScaledVector(c,t/2).setY(n),e.clone().addScaledVector(c,t/2).setY(r),e.clone().addScaledVector(c,-t/2).setY(r),i,s);a%2==0&&f(d,3,.02,3.2,n,l),f(d.clone().addScaledVector(s,.02),.7,3.7,4,r,p)}}let V=o.add(ee()),H=N(_.seats,r?6400:2100,r?420:150,a(`crowd`),s,o);o.add(H.mesh),o.add(D.cars);let U=e.moonDirection?.clone().normalize()??new u(Math.cos(i.gateAngle+2.3)*Math.cos(.52),Math.sin(.52),Math.sin(i.gateAngle+2.3)*Math.cos(.52)),re=i.gateAngle-.95,ie=me(U,new u(Math.cos(re),0,Math.sin(re)),r?1:.55,o),G=(e,t,n,r=!1)=>{let i=o.add(e.build());o.add(t);let a=new d(i,t);return a.name=n,a.castShadow=!1,a.receiveShadow=r,a},ae=G(l,new E({vertexColors:!0,map:w,roughness:.93,metalness:0}),`StadiumStands`,!0),oe=G(f,new E({vertexColors:!0,roughness:.5,metalness:.5}),`StadiumMetal`),ce=G(p,new t({vertexColors:!0,fog:!1}),`StadiumLamps`),ue=G(m,new E({map:V,emissiveMap:V,emissive:new C(1,1,1),emissiveIntensity:.16,roughness:.55,metalness:0,polygonOffset:!0,polygonOffsetFactor:-2,polygonOffsetUnits:-2}),`StadiumSponsorBoards`,!0),K=G(h,new t({map:V,color:new C(1.35,1.35,1.35),fog:!1}),`StadiumLitSigns`);c.add(ie.mesh,D.ground,D.cars,ae,oe,ue,K,ce,b.screen,S.mesh,H.mesh,v.mesh,y.cones,y.dust,H.flashes),b.setLines([`THE BOWL`,`DEMOLITION`,`DERBY`]);let q=0,J=0,fe=0,Y=0,X=0,Z=3600;return{group:c,update:(e,t,n)=>{let r=Math.min(Math.max(e,0),.1);if(q+=r,q>Z){q-=Z;for(let e of s.uCheer.value)e.z-=Z}J+=(Math.min(1,Math.max(0,n))-J)*(1-Math.exp(-r*1.8)),s.uTime.value=q,s.uExcite.value=J;let i=te(.4,.6,J)*(1-.6*te(.85,1,J));fe+=(i-fe)*(1-Math.exp(-r*.7)),s.uWaveAmp.value=fe,s.uWaveAng.value=(s.uWaveAng.value+r*.45)%(Math.PI*2),X=Math.max(0,X-r*.25),S.uniforms.uFlagEnergy.value=Math.min(1,.22+.62*J+X),b.update(r,J),ie.update(q)},cheer:(e,t)=>{let n=Math.min(2,Math.max(0,e));Y=(Y+1)%4,s.uCheer.value[Y].set(t?t.x:0,t?t.z:0,q,n),s.uCheerR.value[Y]=t?26:1e5,b.flash(n),X=Math.max(X,n*.35)},setScoreboard:e=>b.setLines(e),floodlights:y.floodlights,dispose:()=>{c.removeFromParent(),c.clear(),o.dispose()},fence:{radius:i.fenceR,meshRadius:i.fenceMeshR,bottomY:i.topY,topY:i.fenceTopY,lipInset:.55,lipTopY:i.fenceTopY+.42},moonDirection:U.clone(),crowdCount:H.count,layout:i}}export{Se as createStadium};