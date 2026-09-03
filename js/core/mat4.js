/* Apex 26 — column-major 4x4 matrix + vec3 helpers, plus the three SCALAR helpers every module used to re-declare (M4.clamp / M4.lerp / M4.wrapDelta). Float32Arra… */
"use strict";

const M4 = (function () {
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function wrapDelta(d, period) {
    const half = period * 0.5;
    if (d > half) return d - period;
    if (d < -half) return d + period;
    return d;
  }

  function ident() {
    const m = new Float32Array(16);
    m[0] = m[5] = m[10] = m[15] = 1;
    return m;
  }

  function mulTo(out, a, b) {
    for (let c = 0; c < 4; c++) {
      const b0=b[c*4],b1=b[c*4+1],b2=b[c*4+2],b3=b[c*4+3];
      out[c*4]  =a[0]*b0+a[4]*b1+a[8] *b2+a[12]*b3;
      out[c*4+1]=a[1]*b0+a[5]*b1+a[9] *b2+a[13]*b3;
      out[c*4+2]=a[2]*b0+a[6]*b1+a[10]*b2+a[14]*b3;
      out[c*4+3]=a[3]*b0+a[7]*b1+a[11]*b2+a[15]*b3;
    }
    return out;
  }
  function perspectiveTo(out, fovY, aspect, near, far) {
    const f = 1 / Math.tan(fovY / 2);
    out.fill(0);
    out[0]=f/aspect; out[5]=f;
    out[10]=(far+near)/(near-far); out[11]=-1;
    out[14]=(2*far*near)/(near-far);
    return out;
  }
  function lookAtTo(out, eye, target, up) {
    let zx=eye[0]-target[0],zy=eye[1]-target[1],zz=eye[2]-target[2];
    let l=Math.hypot(zx,zy,zz)||1; zx/=l; zy/=l; zz/=l;
    let xx=up[1]*zz-up[2]*zy,xy=up[2]*zx-up[0]*zz,xz=up[0]*zy-up[1]*zx;
    l=Math.hypot(xx,xy,xz)||1; xx/=l; xy/=l; xz/=l;
    const yx=zy*xz-zz*xy,yy=zz*xx-zx*xz,yz=zx*xy-zy*xx;
    out[0]=xx;out[1]=yx;out[2]=zx;out[3]=0;
    out[4]=xy;out[5]=yy;out[6]=zy;out[7]=0;
    out[8]=xz;out[9]=yz;out[10]=zz;out[11]=0;
    out[12]=-(xx*eye[0]+xy*eye[1]+xz*eye[2]);
    out[13]=-(yx*eye[0]+yy*eye[1]+yz*eye[2]);
    out[14]=-(zx*eye[0]+zy*eye[1]+zz*eye[2]);
    out[15]=1;
    return out;
  }
  function orthoTo(out, l, r, b, t, n, f) {
    out[0]=2/(r-l);out[1]=0;out[2]=0;out[3]=0;
    out[4]=0;out[5]=2/(t-b);out[6]=0;out[7]=0;
    out[8]=0;out[9]=0;out[10]=-2/(f-n);out[11]=0;
    out[12]=-(r+l)/(r-l);out[13]=-(t+b)/(t-b);out[14]=-(f+n)/(f-n);out[15]=1;
    return out;
  }
  function invertTo(out, m) {
    const a00=m[0],a01=m[1],a02=m[2],a03=m[3],a10=m[4],a11=m[5],a12=m[6],a13=m[7];
    const a20=m[8],a21=m[9],a22=m[10],a23=m[11],a30=m[12],a31=m[13],a32=m[14],a33=m[15];
    const b00=a00*a11-a01*a10,b01=a00*a12-a02*a10,b02=a00*a13-a03*a10;
    const b03=a01*a12-a02*a11,b04=a01*a13-a03*a11,b05=a02*a13-a03*a12;
    const b06=a20*a31-a21*a30,b07=a20*a32-a22*a30,b08=a20*a33-a23*a30;
    const b09=a21*a32-a22*a31,b10=a21*a33-a23*a31,b11=a22*a33-a23*a32;
    let det=b00*b11-b01*b10+b02*b09+b03*b08-b04*b07+b05*b06;
    if (!det) {
      out[0]=1;out[1]=0;out[2]=0;out[3]=0;
      out[4]=0;out[5]=1;out[6]=0;out[7]=0;
      out[8]=0;out[9]=0;out[10]=1;out[11]=0;
      out[12]=0;out[13]=0;out[14]=0;out[15]=1;
      return out;
    }
    det=1/det;
    out[0]=(a11*b11-a12*b10+a13*b09)*det;out[1]=(a02*b10-a01*b11-a03*b09)*det;
    out[2]=(a31*b05-a32*b04+a33*b03)*det;out[3]=(a22*b04-a21*b05-a23*b03)*det;
    out[4]=(a12*b08-a10*b11-a13*b07)*det;out[5]=(a00*b11-a02*b08+a03*b07)*det;
    out[6]=(a32*b02-a30*b05-a33*b01)*det;out[7]=(a20*b05-a22*b02+a23*b01)*det;
    out[8]=(a10*b10-a11*b08+a13*b06)*det;out[9]=(a01*b08-a00*b10-a03*b06)*det;
    out[10]=(a30*b04-a31*b02+a33*b00)*det;out[11]=(a21*b02-a20*b04-a23*b00)*det;
    out[12]=(a11*b07-a10*b09-a12*b06)*det;out[13]=(a00*b09-a01*b07+a02*b06)*det;
    out[14]=(a31*b01-a30*b03-a32*b00)*det;out[15]=(a20*b03-a21*b01+a22*b00)*det;
    return out;
  }
  return { ident, mulTo, perspectiveTo, lookAtTo, orthoTo, invertTo,
           clamp, lerp, wrapDelta };
})();

const V3 = (function () {
  function len(a) { return Math.hypot(a[0], a[1], a[2]); }
  function norm(a) {
    const l = len(a) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  }
  return { norm };
})();
