// The marble. Two programs:
//  BAKE  (once per layout, per slab): Nero Marquina fields into an RGBA8 texture in slab space
//        r = white calcite veins, g = gold vein mask, b = smoky cloud, a = the glow halo around the gold.
//  FRAME (only while something moves): samples the bake and lights it: polished clear coat, the raking soft-box
//        reflection, the bevel, gold metal that catches the light, the glow that runs along the veins of the chosen
//        slab, the success flare, the shadow on the page. Scissored to each slab; transparent elsewhere.
import { createGL, program, target, bind } from './gl.js';

const NOISE = `
float hash12(vec2 p){ vec3 p3=fract(vec3(p.xyx)*0.1031); p3+=dot(p3,p3.yzx+33.33); return fract((p3.x+p3.y)*p3.z); }
float vnoise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.0-2.0*f);
  return mix(mix(hash12(i),hash12(i+vec2(1,0)),u.x), mix(hash12(i+vec2(0,1)),hash12(i+vec2(1,1)),u.x), u.y); }
float fbm3(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<3;i++){ s+=a*vnoise(p); p=mat2(1.6,1.2,-1.2,1.6)*p+vec2(7.1,3.2); a*=0.5; } return s; }
`;

const BAKE = `precision highp float;
uniform vec2 uSize;      // texture px
uniform float uAspect;   // hw / hh of the slab
uniform float uSeed;
${NOISE}
float fbm(vec2 p){ float a=0.5, s=0.0; for(int i=0;i<7;i++){ s+=a*vnoise(p); p=mat2(1.6,1.2,-1.2,1.6)*p+vec2(17.1,9.2); a*=0.5; } return s; }
void main(){
  vec2 uv=gl_FragCoord.xy/uSize;
  vec2 q0=vec2((uv.x-0.5)*2.0*uAspect, -(uv.y-0.5)*2.0)*1.15;   // slab space, y down (same as FRAME)
  float seed=uSeed;
  vec2 q=q0+vec2(seed*3.7, seed*1.9);
  vec2 w=vec2(fbm(q*0.7+seed), fbm(q*0.7+vec2(5.2,1.3)-seed));
  vec2 w2=vec2(fbm3(q*2.4+w*2.0+vec2(1.7,9.2)), fbm3(q*2.4+w*2.0+vec2(8.3,2.8)));
  float cloud=fbm(q*0.8+w*1.5);
  // the main calcite vein: one contour of a strongly warped field, broken by noise, with a soft bloom under the polish
  float n=fbm(q*0.9+w*2.6+w2*0.35);
  float f1=abs(n-0.47);
  float main=exp(-pow(f1/0.0055,2.0))*smoothstep(0.38,0.6,fbm3(q*1.7+w2))+exp(-pow(f1/0.02,2.0))*0.09;
  // hairlines: ridged high-frequency veins, faint
  float m=fbm(q*2.6+w2*1.8+7.0);
  float hair=exp(-pow((m-0.5)/0.006,2.0))*0.4*smoothstep(0.42,0.7,fbm3(q*3.0-w));
  float m2=fbm(q*5.0+w2*2.5+3.0);
  hair+=exp(-pow((m2-0.5)/0.008,2.0))*0.18;
  // a second, slower lace so the stone has depth: soft veins seen through the polish
  float m3=fbm(q*1.6+w*1.2+11.0);
  float deep=exp(-pow((m3-0.5)/0.03,2.0))*0.10;
  float calc=clamp(main+hair+deep,0.0,1.0);
  // gold: a bold vein that crosses the slab diagonally (plus a thin branch), wandering and tapering
  float sl=mod(seed,2.0)<1.0?0.75:-0.85;
  float gl=q0.y*0.75+q0.x*sl+(w.x-0.5)*1.5+(fbm3(q*2.2+w)-0.5)*0.35+(w2.y-0.5)*0.22+(fbm3(q*6.0)-0.5)*0.05+0.12;
  float gw=0.006+0.018*smoothstep(0.2,0.8,fbm3(q*0.9+seed*1.3));
  float px=2.0*1.15/uSize.y;                                  // one texel in slab units: keeps the thin gold crisp but unaliased
  float gold=smoothstep(gw+px*0.5, max(gw*0.3,gw-px), abs(gl));
  float gl2=gl+0.5+(w.y-0.5)*0.8+q0.x*0.35*sl;
  float br=smoothstep(0.45,0.7,fbm3(q*1.4+seed+2.0));
  float gw2=0.0015+0.006*br;
  gold=max(gold, smoothstep(gw2+px*0.6, max(gw2*0.3,gw2-px), abs(gl2))*smoothstep(0.35,0.5,br+0.15));
  float gHalo=exp(-gl*gl/0.012)+0.5*exp(-gl2*gl2/0.006)*br;
  gl_FragColor=vec4(calc, gold, clamp(cloud+0.25*gHalo,0.0,1.0), clamp(0.25*gHalo,0.0,1.0));
}`;

const FRAME = `precision highp float;
uniform vec2 uRes;        // canvas px
uniform float uS;         // canvas px per slab unit
uniform float uTime;
uniform float uRad;       // corner radius (canvas px)
uniform vec2 uLight;      // the raking light (canvas px, y down)
uniform vec4 uRect0; uniform vec4 uRect1; uniform vec4 uRect2;   // slab cx, cy, hw, hh (canvas px, y down)
uniform vec4 uPar0; uniform vec4 uPar1; uniform vec4 uPar2;      // chosen, hover, lift (slab units), dim
uniform vec4 uIgn0; uniform vec4 uIgn1; uniform vec4 uIgn2;      // ignite origin (slab space), radius, frame glow
uniform vec4 uFlare;      // success flare: origin (slab space), radius, strength — on slab uFlareI
uniform float uFlareI;
uniform sampler2D uStone0; uniform sampler2D uStone1; uniform sampler2D uStone2;
${NOISE}
float sdRR(vec2 p, vec2 b, float r){ vec2 q=abs(p)-b+r; return length(max(q,0.0))+min(max(q.x,q.y),0.0)-r; }
vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0); }

// shadow on the page + the chosen slab's gold rim glow, accumulated over the three slabs
void outside(vec2 p, vec4 R, vec4 P, float rg, inout float a, inout vec3 glow){
  vec2 lp=p-R.xy;
  float d=sdRR(lp, R.zw, uRad);
  if(d>170.0*uS) return;                                            // too far for any shadow or glow
  float off=(20.0+P.z*1.4)*uS, soft=(30.0+P.z*1.2)*uS;
  float ds=sdRR(lp-vec2(0.0,off), R.zw*vec2(0.95,0.975), uRad);
  float sh=0.72*exp(-max(ds,0.0)/soft)*smoothstep(-soft*1.2, soft*0.2, ds+soft*0.6);
  sh=max(sh, 0.3*exp(-max(d,0.0)/(5.0*uS)));                      // contact darkening right at the edge
  a=1.0-(1.0-a)*(1.0-sh);
  glow+=vec3(1.0,0.62,0.24)*rg*(0.38*exp(-max(d,0.0)/(10.0*uS))+0.14*exp(-max(d,0.0)/(40.0*uS)));
}

vec3 shade(vec2 p, vec4 R, vec4 P, vec4 ign, vec4 S, float flare){
  vec2 lp=p-R.xy, hb=R.zw;
  float r=uRad, s=uS;
  float d=sdRR(lp, hb, r);
  vec2 q=lp/hb.y*1.15;
  float bw=7.0*s;
  float e=clamp(-d/bw,0.0,1.0);
  vec2 g=vec2(0.0);
  if(e<1.0) g=vec2(sdRR(lp+vec2(1.0,0.0),hb,r)-sdRR(lp-vec2(1.0,0.0),hb,r), sdRR(lp+vec2(0.0,1.0),hb,r)-sdRR(lp-vec2(0.0,1.0),hb,r))*0.5;
  float bev=pow(1.0-e,1.6);
  vec3 n=normalize(vec3(g.x*bev*1.6, -g.y*bev*1.6, 1.0));
  float lit=dot(n, normalize(vec3(-0.45,0.6,0.65)));
  float sel=P.x, hov=P.y;
  // polished stone body
  vec3 base=mix(vec3(0.0045,0.0041,0.0038), vec3(0.020,0.0165,0.0125), smoothstep(0.35,0.95,S.b));
  vec3 body=base+vec3(0.80,0.76,0.68)*S.r*0.32*(1.0-S.g);
  // the raking light: a diagonal soft box reflected in the polish (one broad lobe + two crisp strips)
  vec2 rl=p-uLight;
  vec2 dir=vec2(0.8638,-0.5038);
  float along=dot(rl, vec2(0.5038,0.8638));
  float band=exp(-pow(along/(150.0*s),2.0));
  float len=smoothstep(1.3,0.4,abs(dot(rl,dir))/(hb.y*1.7));
  float aa=1.2;
  float bandS=(smoothstep(-58.0*s-aa,-58.0*s+aa,along)-smoothstep(-5.0*s-aa,-5.0*s+aa,along)
             +0.6*(smoothstep(9.0*s-aa,9.0*s+aa,along)-smoothstep(23.0*s-aa,23.0*s+aa,along)))*len;
  float broad=0.5+0.5*smoothstep(1.4*hb.y,-1.0*hb.y, length(lp-vec2(-0.6*hb.x,-0.9*hb.y)));
  vec3 refl=vec3(1.0,0.94,0.84)*(0.012*broad + 0.02*band + 0.075*bandS);
  // gold: real metal everywhere, alive where the chosen slab's light has reached
  float glow=0.0, flow=0.55;
  float gmask=S.g, halo=S.a;
  if(gmask+halo>0.002){
    float dist=length(q-ign.xy);
    float reach=smoothstep(ign.z, ign.z-0.35, dist);
    float front=exp(-pow((dist-ign.z+0.1)/0.14,2.0))*step(ign.z,3.4);
    float fl=flare*exp(-pow((length(q-uFlare.xy)-uFlare.z)/0.22,2.0))*uFlare.w;
    glow=sel*(reach+front*0.9)+fl*1.4;
    flow=0.55+0.45*sin(uTime*1.3+q.x*2.0-q.y*3.0+(vnoise(q*3.0-uTime*0.25)*0.65+vnoise(q*6.4+vec2(3.1,1.7)-uTime*0.4)*0.35)*6.0);
  }
  vec3 goldM=vec3(0.95,0.68,0.3);
  vec3 goldCol=goldM*(0.18+0.55*max(lit,0.0)+1.6*band+2.4*bandS+0.25*hov);
  goldCol+=vec3(1.0,0.5,0.12)*glow*(2.4+3.6*flow) + vec3(1.0,0.8,0.5)*glow*2.5*smoothstep(0.7,1.0,flow);
  body=mix(body, goldCol, gmask);
  body+=vec3(1.0,0.42,0.08)*glow*0.8*halo*(0.5+0.5*flow);    // light glowing through the stone around the gold
  // clear polish over everything, stronger at the bevel (Fresnel)
  float F=0.05+0.95*pow(1.0-n.z,3.0);
  body+=refl + vec3(1.0,0.95,0.88)*F*0.35*(0.25+band*1.5);
  // the bevel catches the key light top-left and falls dark bottom-right; the chosen slab's bevel is gold
  float rim=(1.0-e)*(0.5+0.5*dot(normalize(-g+1e-5), normalize(vec2(-0.6,-0.8))));
  body*=mix(1.0,0.45,(1.0-e));
  body+=vec3(1.0,0.95,0.86)*pow(rim,3.0)*0.35*(1.0-e)*(1.0+0.6*hov);
  body+=vec3(1.0,0.62,0.24)*pow(1.0-clamp(-d/(13.0*s),0.0,1.0),1.5)*ign.w*(0.75+0.35*pow(rim,2.0));
  body*=1.0+0.08*hov;
  vec3 c=aces(body);
  c=pow(c, vec3(1.0/2.2));
  c=mix(c, vec3(dot(c,vec3(0.3,0.59,0.11)))*0.8, P.w*0.55);
  return c+(hash12(p)-0.5)*0.012;
}
vec2 suv(vec2 p, vec4 R){ vec2 lp=p-R.xy; return vec2(lp.x/(2.0*R.z)+0.5, 0.5-lp.y/(2.0*R.w)); }
void main(){
  vec2 p=vec2(gl_FragCoord.x, uRes.y-gl_FragCoord.y);
  float a=0.0; vec3 glow=vec3(0.0);
  outside(p, uRect0, uPar0, uIgn0.w, a, glow); outside(p, uRect1, uPar1, uIgn1.w, a, glow); outside(p, uRect2, uPar2, uIgn2.w, a, glow);
  vec4 o=vec4(glow*(1.0-a*0.6), a);
  float d0=sdRR(p-uRect0.xy, uRect0.zw, uRad), d1=sdRR(p-uRect1.xy, uRect1.zw, uRad), d2=sdRR(p-uRect2.xy, uRect2.zw, uRad);
  if(d0<1.0){ vec3 c=shade(p, uRect0, uPar0, uIgn0, texture2D(uStone0, suv(p,uRect0)), step(abs(uFlareI-0.0),0.1)); o=mix(o, vec4(c,1.0), clamp(0.5-d0,0.0,1.0)); }
  else if(d1<1.0){ vec3 c=shade(p, uRect1, uPar1, uIgn1, texture2D(uStone1, suv(p,uRect1)), step(abs(uFlareI-1.0),0.1)); o=mix(o, vec4(c,1.0), clamp(0.5-d1,0.0,1.0)); }
  else if(d2<1.0){ vec3 c=shade(p, uRect2, uPar2, uIgn2, texture2D(uStone2, suv(p,uRect2)), step(abs(uFlareI-2.0),0.1)); o=mix(o, vec4(c,1.0), clamp(0.5-d2,0.0,1.0)); }
  gl_FragColor=o;
}`;

export class Marble {
  constructor(canvas) {
    this.canvas = canvas;
    const gl = createGL(canvas, { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true });
    if (!gl) throw new Error('no webgl');
    this.gl = gl;
    this.bakeP = program(gl, BAKE);
    this.frameP = program(gl, FRAME);
    this.slabs = [];           // { t: target, w, h }
    this.draws = 0; this.px = 0;
  }
  lost() { return this.gl.isContextLost(); }
  resize(w, h) { const c = this.canvas; if (c.width !== w || c.height !== h) { c.width = w; c.height = h; } }
  // bake slab i: texture w×h px, aspect hw/hh, seed
  bake(i, w, h, aspect, seed) {
    const gl = this.gl;
    let sl = this.slabs[i];
    if (!sl || sl.w !== w || sl.h !== h) {
      if (sl && sl.t) sl.t.free();
      sl = this.slabs[i] = { t: target(gl, w, h, null, { linear: true }), w, h };
    }
    bind(gl, sl.t);
    this.bakeP.use().f('uSize', w, h).f('uAspect', aspect).f('uSeed', seed).draw();
    bind(gl, null);
    sl.ready = true;
  }
  ready(i) { return !!(this.slabs[i] && this.slabs[i].ready); }
  clear() { const gl = this.gl; bind(gl, null); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
  // all three slabs in one draw so shadows and glows composite correctly. c[i] = { x, y, hw, hh, sel, hov, lift, dim, ign:[x,y,r] }
  // in canvas px; o = { s, rad, light:[x,y], time, flare:[ox,oy,r,a], flareI }; box = scissor [x0,y0,x1,y1] canvas px (y down) or null
  // boxes: null = redraw the whole canvas (clear + shadows + glows + slabs); or a list of [x0,y0,x1,y1] canvas-px boxes
  // (y down) to redraw only those (the slab faces when only the light moved; the rest of the buffer is preserved)
  frame(c, o, boxes) {
    const gl = this.gl;
    if (!this.slabs.every((s) => s && s.ready)) return;
    const W = gl.drawingBufferWidth, H = gl.drawingBufferHeight;
    const P = this.frameP.use();
    P.tex('uStone0', 0, this.slabs[0].t.tex).tex('uStone1', 1, this.slabs[1].t.tex).tex('uStone2', 2, this.slabs[2].t.tex)
      .f('uRes', W, H).f('uS', o.s).f('uTime', o.time).f('uRad', o.rad).f('uLight', o.light[0], o.light[1])
      .f('uFlare', ...o.flare).f('uFlareI', o.flareI);
    for (let i = 0; i < 3; i++) {
      const k = c[i];
      P.f('uRect' + i, k.x, k.y, k.hw, k.hh).f('uPar' + i, k.sel, k.hov, k.lift, k.dim).f('uIgn' + i, k.ign[0], k.ign[1], k.ign[2], k.rim);
    }
    const list = boxes || [[0, 0, W, H]];
    for (const bx of list) {
      const x0 = Math.max(0, Math.floor(bx[0])), y0 = Math.max(0, Math.floor(bx[1])), x1 = Math.min(W, Math.ceil(bx[2])), y1 = Math.min(H, Math.ceil(bx[3]));
      if (x1 <= x0 || y1 <= y0) continue;
      bind(gl, null, x0, H - y1, x1 - x0, y1 - y0);
      if (!boxes) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
      P.draw();
      this.draws++; this.px += (x1 - x0) * (y1 - y0);
    }
    bind(gl, null);
  }

}
