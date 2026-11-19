const SceneryFacade = (function () {
  "use strict";

  function create(ctx, detail) {
    const { lod, hash, vadd, out, glassBuf, MAT } = ctx;
    const neonFacade = (mid, bb, side, sw, sh, sd, neon, seed, neonAmt) => {
      const u = bb[1];
      const frameCol = [0.12, 0.12, 0.15];
      const dark = [0.035, 0.035, 0.055];
      const warm = [1.0, 0.80, 0.46];
      const nc = [neon[0] * 0.95, neon[1] * 0.95, neon[2] * 0.95];
      const litShare = 0.20 + neonAmt * 0.08, neonShare = neonAmt * 0.7;
      const rows = lod(Math.max(4, Math.min(10, Math.round(sh / 4.4))), 3);
      const fh = sh / rows, frameT = 0.30, railH = Math.max(0.4, fh * 0.24), winH = Math.max(0.5, fh - railH);
      const drawFace = (nAxis, nSign, nHalf, wAxis, faceW, sOff, simple) => {
        const nVec = bb[nAxis], wVec = bb[wAxis];
        const cols = simple ? 2 : lod(Math.max(2, Math.min(6, Math.round(faceW / 3.3))), 2);
        const rowN = simple ? lod(Math.max(2, Math.min(6, Math.round(sh / 6.4))), 2) : rows;
        const fhh = sh / rowN, winHH = Math.max(0.5, fhh - railH);
        const fBase = vadd(mid, nVec, nSign * (nHalf + 0.34));
        const mBase = vadd(mid, nVec, nSign * (nHalf + 0.29));
        const nBase = vadd(mid, nVec, nSign * (nHalf + 0.40));
        const gBase = vadd(mid, nVec, nSign * (nHalf + 0.05 + 0.04));
        const dim = (thin, hgt, wid) => { const a = [0, 0, 0]; a[nAxis] = thin; a[1] = hgt; a[wAxis] = wid; return a; };
        out._mat = MAT.METAL;
        if (!simple) for (let i = 2; i <= rowN; i += 2)
          detail({ o: vadd(fBase, u, (i / rowN - 0.5) * sh), r: bb[0], u: bb[1], t: bb[2],
              s: dim(frameT, railH, faceW * 1.005), col: frameCol },
            { kind: "facadeRail" });
        for (let c = 0; c < cols; c++) {
          const cx = (-0.5 + (c + 0.5) / cols) * faceW;
          for (let ri = 0; ri < rowN; ri++) {
            const ry = (-0.5 + (ri + 0.5) / rowN) * sh;
            let col = dark, lit = false;
            if (hash(seed + sOff + c * 12.9 + ri * 7.3) < litShare) {
              lit = true;
              const tw = 0.65 + hash(seed + sOff + c * 5.5 + ri * 2.2) * 0.5;
              col = hash(seed + sOff + c * 3.1 + ri * 1.7) < neonShare
                ? [nc[0] * tw, nc[1] * tw, nc[2] * tw] : [warm[0] * tw, warm[1] * tw, warm[2] * tw];
            }
            const toGlass = !lit && !simple;
            if (toGlass) glassBuf._mat = MAT.GLASS; else out._mat = 0;
            detail({ o: vadd(vadd(gBase, wVec, cx), u, ry),
                r: bb[0], u: bb[1], t: bb[2],
                s: dim(0.08, winHH, (faceW / cols) * 0.82),
                col },
              { kind: "windowPane" },
              { buf: toGlass ? glassBuf : out });
            if (toGlass) glassBuf._mat = 0;
          }
        }
        out._mat = MAT.METAL;
        if (simple) { out._mat = 0; return; }
        const nm = Math.max(1, Math.min(3, cols - 1));
        for (let c = 1; c <= nm; c++)
          detail({ o: vadd(mBase, wVec, (-0.5 + c / (nm + 1)) * faceW), r: bb[0], u: bb[1], t: bb[2],
              s: dim(frameT, sh, 0.4), col: frameCol },
            { kind: "facadeMullion" });
        if (neonAmt > 0.3) {
          const ST = Math.min(0.4, faceW * 0.04);
          for (const dr of [-1, 1])
            detail({ o: vadd(nBase, wVec, dr * faceW * 0.5), r: bb[0], u: bb[1], t: bb[2],
                s: dim(frameT * 1.05, sh * 0.96, ST), col: nc },
              { kind: "facadeNeon" });
          const bandH = Math.min(0.5, sh * 0.018);
          let bandC = sh * 0.48;
          const clash = (c) => {
            for (let i = 2; i <= rowN; i += 2) {
              const ry = (i / rowN - 0.5) * sh;
              if (Math.abs((c - bandH / 2) - (ry - railH / 2)) < 0.05 ||
                  Math.abs((c + bandH / 2) - (ry + railH / 2)) < 0.05) return true;
            }
            return false;
          };
          for (let tries = 0; tries < 3 && clash(bandC); tries++) bandC -= 0.08;
          detail({ o: vadd(nBase, u, bandC), r: bb[0], u: bb[1], t: bb[2],
              s: dim(frameT * 1.1, bandH, faceW), col: nc },
            { kind: "facadeNeon" });
        }
        out._mat = 0;
      };
      drawFace(0, -side, sw / 2, 2, sd, 0, false);
      drawFace(2, 1, sd / 2, 0, sw, 137, true);
      drawFace(2, -1, sd / 2, 0, sw, 311, true);
    };
    return neonFacade;
  }

  return { create };
})();
Object.freeze(SceneryFacade);
