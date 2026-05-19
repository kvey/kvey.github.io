// Stained glass generator. Top-down content-aware pipeline mirroring how a
// real glazier works: posterize the image into a small palette, smooth the
// region boundaries, then subdivide large flat regions with Voronoi sub-cells.
// Lead came runs along the merged boundaries — so cuts naturally snap to
// content edges while flat regions get deliberate, bounded-complexity cuts.

export async function generateStainedGlass(sourceCanvas, options = {}) {
  const {
    resolution = 1024,
    shouldAbort = null,          // optional () => bool; if returns true at a checkpoint, generator bails
    paletteSize = 12,            // K-means cluster count (palette = N glass colors)
    subdivCellRadius = 70,       // Poisson-disk spacing for sub-cells in large regions
    smoothingPasses = 4,         // median 3x3 passes on palette map
    edgeSmoothRadius = 3,        // light pre-pass disk smoothing on pieceId
    edgeSmoothPasses = 1,        // one pass is enough since vectorization does the rest
    vectorizeKernel = 6,         // gaussian half-width for vectorized boundary smoothing
    simplifyTolerance = 3.0,     // Douglas-Peucker tolerance in pixels — kills wobbles below this
    maxElongation = 4.0,         // cap on per-region anisotropic stretch (1 = isotropic, 5 = ribbon)
    minPieceRadius = 18,         // pieces below ~radius² pixels merge into a neighbor
    leadThickness = 2,
    leadColor = [10, 8, 6],
    warpAmp = 0.45,              // organic curvature on cuts (0..1+)
    warpFreq = 0.7,              // low frequency: long gentle arcs (cuttable), not wiggles
    saturationBoost = 1.18,
    brightnessBoost = 1.0,
    cellVariation = 0.08,
    glassNoise = 12,
    previewMode = false,         // when true, use cheaper settings for live drag previews
    seed = Math.random(),
  } = options;

  const rng = makeRng(seed);

  // ---- Output dimensions match source aspect ratio ----
  const srcAspect = sourceCanvas.width / sourceCanvas.height;
  const W = srcAspect >= 1 ? resolution : Math.max(1, Math.round(resolution * srcAspect));
  const H = srcAspect >= 1 ? Math.max(1, Math.round(resolution / srcAspect)) : resolution;
  const N = W * H;

  // Cancellation checkpoint: yields to the event loop and then asks
  // shouldAbort whether this generation has been superseded. Returns true
  // if the caller should bail. When shouldAbort is null (sync callers) it's
  // a no-op fast path.
  const checkpoint = shouldAbort
    ? async () => { await yieldToTask(); return shouldAbort(); }
    : async () => false;

  // ---- Source sampling buffer (matches aspect; small enough for fast K-means) ----
  // Preview mode shrinks the K-means workbuffer so live slider feedback stays snappy.
  const SRC_SHORT = previewMode ? 144 : 256;
  const SRC_W = srcAspect >= 1 ? Math.round(SRC_SHORT * srcAspect) : SRC_SHORT;
  const SRC_H = srcAspect >= 1 ? SRC_SHORT : Math.round(SRC_SHORT / srcAspect);
  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = SRC_W;
  srcCanvas.height = SRC_H;
  const srcCtx = srcCanvas.getContext('2d');
  srcCtx.drawImage(sourceCanvas, 0, 0, SRC_W, SRC_H);
  const srcData = srcCtx.getImageData(0, 0, SRC_W, SRC_H).data;

  // ---- Step 1: Posterize via K-means clustering on source pixels ----
  // Output: srcAssignment[srcW*srcH] in [0..K-1]
  const K = Math.max(3, Math.min(32, Math.round(paletteSize)));
  const srcAssignment = kMeansQuantize(srcData, SRC_W, SRC_H, K, rng, previewMode ? 6 : 12);
  if (await checkpoint()) return null;

  // ---- Step 2: Upsample palette assignment to output W×H.
  // The source is read straight — no warp here, so image content (silhouettes,
  // edges, content shapes) is preserved exactly. The warp from `warpAmp` is
  // only applied to Voronoi site lookup below, which curves the *subdivision
  // cuts inside flat regions* without distorting the image itself.
  const paletteOwner = new Uint8Array(N);
  const srcScaleX = SRC_W / W;
  const srcScaleY = SRC_H / H;
  for (let py = 0; py < H; py++) {
    const sy = Math.min(SRC_H - 1, Math.max(0, (py * srcScaleY) | 0));
    for (let px = 0; px < W; px++) {
      const sx = Math.min(SRC_W - 1, Math.max(0, (px * srcScaleX) | 0));
      paletteOwner[py * W + px] = srcAssignment[sy * SRC_W + sx];
    }
  }

  // Warp parameters (applied only to site lookup, not to source lookup).
  const warpPx = warpAmp * subdivCellRadius;
  const noiseScale = warpFreq / subdivCellRadius;
  const noiseSeedX = Math.floor(rng() * 1e9);
  const noiseSeedY = Math.floor(rng() * 1e9);

  // ---- Step 3: Median smoothing on the palette map.
  // Removes isolated single-pixel noise and rounds off jagged region edges
  // so the resulting pieces look like clean glazier cuts, not bitmap stair-steps.
  for (let pass = 0; pass < Math.max(0, smoothingPasses); pass++) {
    medianSmooth3x3(paletteOwner, W, H, K);
  }
  if (await checkpoint()) return null;

  // ---- Step 4: Connected components on the palette map -> color regions.
  // A "region" is one contiguous blob of one palette color; subdivisions in
  // the next step are constrained to stay inside their parent region so no
  // sub-cell ever spans a color boundary.
  const regionId = new Int32Array(N).fill(-1);
  let regionCount = 0;
  const regionFirstPixel = [];
  const stack = new Int32Array(N);
  let sp = 0;
  for (let start = 0; start < N; start++) {
    if (regionId[start] >= 0) continue;
    const p = paletteOwner[start];
    regionId[start] = regionCount;
    regionFirstPixel.push(start);
    sp = 0;
    stack[sp++] = start;
    while (sp > 0) {
      const idx = stack[--sp];
      const y = (idx / W) | 0;
      const x = idx - y * W;
      let ni;
      if (x > 0     && regionId[ni = idx - 1] < 0 && paletteOwner[ni] === p) { regionId[ni] = regionCount; stack[sp++] = ni; }
      if (x < W - 1 && regionId[ni = idx + 1] < 0 && paletteOwner[ni] === p) { regionId[ni] = regionCount; stack[sp++] = ni; }
      if (y > 0     && regionId[ni = idx - W] < 0 && paletteOwner[ni] === p) { regionId[ni] = regionCount; stack[sp++] = ni; }
      if (y < H - 1 && regionId[ni = idx + W] < 0 && paletteOwner[ni] === p) { regionId[ni] = regionCount; stack[sp++] = ni; }
    }
    regionCount++;
  }

  if (await checkpoint()) return null;

  // ---- Step 5: Poisson-disk sites + per-region site assignment ----
  // Generate sites globally, then map each to whichever region its position
  // falls into. Any region that didn't catch a site (small or thin) gets one
  // synthetic fallback site at its seed pixel so every region has ≥ 1.
  const baseSites = poissonDisk(W, H, subdivCellRadius, rng);
  const baseSiteRegion = new Int32Array(baseSites.length);
  for (let i = 0; i < baseSites.length; i++) {
    const sx = Math.min(W - 1, Math.max(0, Math.floor(baseSites[i][0])));
    const sy = Math.min(H - 1, Math.max(0, Math.floor(baseSites[i][1])));
    baseSiteRegion[i] = regionId[sy * W + sx];
  }
  const regionHasSite = new Uint8Array(regionCount);
  for (let i = 0; i < baseSites.length; i++) regionHasSite[baseSiteRegion[i]] = 1;

  const sitePositions = baseSites.slice();
  const siteRegionList = Array.from(baseSiteRegion);
  for (let r = 0; r < regionCount; r++) {
    if (regionHasSite[r]) continue;
    const idx = regionFirstPixel[r];
    const y = (idx / W) | 0;
    const x = idx - y * W;
    sitePositions.push([x + 0.5, y + 0.5]);
    siteRegionList.push(r);
  }

  // ---- Step 5.5: Per-region orientation + anisotropic site thinning.
  // For each region, run PCA on its pixel positions to find the principal
  // axis. Sites inside an elongated region get thinned with an ELLIPTIC
  // rejection radius — axis-aligned with the region's major axis, stretched
  // to `subdivCellRadius * elongation` along the major axis and clamped to
  // `subdivCellRadius` perpendicular. The result: sites within a long region
  // end up sparse along the long direction and at normal density across it,
  // so Voronoi cells stretch ALONG the region's flow. A horizontal stripe
  // gets horizontal-ribbon pieces; a vertical stem gets stem-length pieces;
  // round regions are left untouched (elongation ≤ 1.3 → no thinning).
  const regionPCount = new Uint32Array(regionCount);
  const regSx  = new Float64Array(regionCount);
  const regSy  = new Float64Array(regionCount);
  const regSxx = new Float64Array(regionCount);
  const regSyy = new Float64Array(regionCount);
  const regSxy = new Float64Array(regionCount);
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const r = regionId[py * W + px];
      regionPCount[r]++;
      regSx[r]  += px;
      regSy[r]  += py;
      regSxx[r] += px * px;
      regSyy[r] += py * py;
      regSxy[r] += px * py;
    }
  }
  const regionAngle      = new Float32Array(regionCount);
  const regionElongation = new Float32Array(regionCount);
  for (let r = 0; r < regionCount; r++) {
    const n = regionPCount[r];
    if (n < 60) { regionElongation[r] = 1; continue; }
    const mx  = regSx[r]  / n;
    const my  = regSy[r]  / n;
    const cxx = regSxx[r] / n - mx * mx;
    const cyy = regSyy[r] / n - my * my;
    const cxy = regSxy[r] / n - mx * my;
    // Eigenvalues of 2×2 covariance matrix → variance along principal axes.
    const tr  = cxx + cyy;
    const det = cxx * cyy - cxy * cxy;
    const ht  = tr * 0.5;
    const disc = Math.sqrt(Math.max(0, ht * ht - det));
    const lambda1 = ht + disc; // variance along major axis
    const lambda2 = ht - disc; // along minor
    regionAngle[r] = 0.5 * Math.atan2(2 * cxy, cxx - cyy);
    const ratio = lambda2 > 1 ? Math.sqrt(lambda1 / lambda2) : maxElongation;
    regionElongation[r] = Math.min(maxElongation, Math.max(1, ratio));
  }

  // Build per-region site lists, then thin each anisotropically.
  const sitesByRegion = new Array(regionCount);
  for (let r = 0; r < regionCount; r++) sitesByRegion[r] = [];
  for (let i = 0; i < sitePositions.length; i++) {
    sitesByRegion[siteRegionList[i]].push(i);
  }
  const keptMask = new Uint8Array(sitePositions.length);
  for (let r = 0; r < regionCount; r++) {
    const cand = sitesByRegion[r];
    if (cand.length === 0) continue;
    const E = regionElongation[r];
    if (E <= 1.15 || cand.length <= 1) {
      // Roundish region, or single-site region — leave as-is.
      for (const si of cand) keptMask[si] = 1;
      continue;
    }
    const cosA = Math.cos(regionAngle[r]);
    const sinA = Math.sin(regionAngle[r]);
    const Rmaj = subdivCellRadius * E;
    const Rmin = subdivCellRadius;
    // Process sites by original (Poisson) order so the kept set is stable.
    const kept = [];
    for (const si of cand) {
      const sx = sitePositions[si][0];
      const sy = sitePositions[si][1];
      let reject = false;
      for (let k = 0; k < kept.length; k++) {
        const ki = kept[k];
        const dx = sx - sitePositions[ki][0];
        const dy = sy - sitePositions[ki][1];
        const lMaj = dx * cosA + dy * sinA;     // along major axis
        const lMin = -dx * sinA + dy * cosA;    // along minor axis
        const ratio2 = (lMaj / Rmaj) * (lMaj / Rmaj) + (lMin / Rmin) * (lMin / Rmin);
        if (ratio2 < 1) { reject = true; break; }
      }
      if (!reject) {
        kept.push(si);
        keptMask[si] = 1;
      }
    }
    // Safety net: every region must retain at least one site.
    if (kept.length === 0 && cand.length > 0) keptMask[cand[0]] = 1;
  }

  // Compact: collapse to only the kept sites.
  const culledPositions = [];
  const culledRegionList = [];
  for (let i = 0; i < sitePositions.length; i++) {
    if (keptMask[i]) {
      culledPositions.push(sitePositions[i]);
      culledRegionList.push(siteRegionList[i]);
    }
  }
  const siteCount = culledPositions.length;
  const siteRegion = new Int32Array(culledRegionList);

  // Flatten sites into typed arrays. The Voronoi inner loop reads these
  // millions of times per pixel grid; using Float32Arrays here avoids the
  // boxed array-of-arrays dereferencing path that V8 was deoptimizing.
  const siteX = new Float32Array(siteCount);
  const siteY = new Float32Array(siteCount);
  for (let i = 0; i < siteCount; i++) {
    siteX[i] = culledPositions[i][0];
    siteY[i] = culledPositions[i][1];
  }

  // Spatial bins for nearest-site lookup. Bin size stays at the minor-axis
  // scale (subdivCellRadius) so each bin holds ~1 site on average — keeping
  // the per-pixel inner-loop cheap. Anisotropic lookups just walk a few more
  // rings (see MIN_RINGS below).
  const binSize = subdivCellRadius;
  const binsW = Math.max(1, Math.ceil(W / binSize));
  const binsH = Math.max(1, Math.ceil(H / binSize));
  const bins = Array.from({ length: binsW * binsH }, () => []);
  for (let i = 0; i < siteCount; i++) {
    const bx = Math.min(binsW - 1, Math.floor(siteX[i] / binSize));
    const by = Math.min(binsH - 1, Math.floor(siteY[i] / binSize));
    bins[by * binsW + bx].push(i);
  }

  // Per-region anisotropic transform (cosA, sinA, 1/E²) for the distance
  // metric used in the pixel-to-site nearest-neighbor search. The stretched
  // metric is d² = (Δmaj / E)² + Δmin², which directly elongates Voronoi
  // cells along the region's major axis — much more reliable than thinning
  // alone for getting visible flow-aligned pieces.
  const regCosA  = new Float32Array(regionCount);
  const regSinA  = new Float32Array(regionCount);
  const regInvE2 = new Float32Array(regionCount);
  for (let r = 0; r < regionCount; r++) {
    regCosA[r]  = Math.cos(regionAngle[r]);
    regSinA[r]  = Math.sin(regionAngle[r]);
    const e = Math.max(1, regionElongation[r]);
    regInvE2[r] = 1 / (e * e);
  }

  if (await checkpoint()) return null;

  // ---- Step 6: For each pixel, find nearest site IN THE SAME REGION as the
  // pixel. The region filter means a sub-cell's boundary can never wander out
  // of its parent color region. Search expanding chebyshev rings until a same-
  // region site is found, then go one extra ring to honor near-corner matches.
  const subOwner = new Int32Array(N);
  const extraRings = Math.ceil(warpPx / binSize);
  // Floor on ring count just covers the warp displacement; adaptive
  // termination below handles anisotropic reach without forcing redundant
  // ring sweeps when a good match is already in hand.
  const MIN_RINGS = 1 + extraRings;
  const MAX_RINGS = 20;
  const binSize2 = binSize * binSize;
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const idx = py * W + px;
      const myRegion = regionId[idx];
      // Warp displaces the *site lookup* only — content is untouched, but
      // the resulting Voronoi cuts inside flat regions follow gentle curves.
      const wx = px + valueNoise2D(px * noiseScale, py * noiseScale, noiseSeedX) * warpPx;
      const wy = py + valueNoise2D(px * noiseScale, py * noiseScale, noiseSeedY) * warpPx;
      const bx = Math.min(binsW - 1, Math.max(0, Math.floor(wx / binSize)));
      const by = Math.min(binsH - 1, Math.max(0, Math.floor(wy / binSize)));
      // Anisotropic metric for this region: distances along the major axis
      // are scaled down by 1/E² so cells extend FARTHER in that direction.
      const cosA = regCosA[myRegion];
      const sinA = regSinA[myRegion];
      const invE2 = regInvE2[myRegion];
      let bestD = Infinity;
      let bestI = -1;
      for (let ring = 0; ring <= MAX_RINGS; ring++) {
        for (let dy = -ring; dy <= ring; dy++) {
          const absDy = dy < 0 ? -dy : dy;
          for (let dx = -ring; dx <= ring; dx++) {
            const absDx = dx < 0 ? -dx : dx;
            // search only the boundary of this ring, the interior was handled earlier
            if (absDx !== ring && absDy !== ring) continue;
            const nx = bx + dx, ny = by + dy;
            if (nx < 0 || ny < 0 || nx >= binsW || ny >= binsH) continue;
            const bucket = bins[ny * binsW + nx];
            for (let k = 0; k < bucket.length; k++) {
              const si = bucket[k];
              if (siteRegion[si] !== myRegion) continue;
              const ddx = siteX[si] - wx;
              const ddy = siteY[si] - wy;
              // Anisotropic metric in the region's local frame.
              const dmaj = ddx * cosA + ddy * sinA;
              const dmin = -ddx * sinA + ddy * cosA;
              const d2 = invE2 * dmaj * dmaj + dmin * dmin;
              if (d2 < bestD) { bestD = d2; bestI = si; }
            }
          }
        }
        // Adaptive early termination: sites in ring R+1 have isotropic
        // distance ≥ R · binSize; their *minimum* anisotropic distance² is
        // therefore (R · binSize)² · invE2. If that already exceeds the
        // best-found anisotropic d², no farther ring can improve.
        if (bestI >= 0 && ring >= MIN_RINGS) {
          if (ring * ring * binSize2 * invE2 >= bestD) break;
        }
      }
      subOwner[idx] = bestI;
    }
  }

  if (await checkpoint()) return null;

  // ---- Step 7: Connected components on subOwner. Site index uniquely
  // determines (region, sub-cell) because each site belongs to exactly one
  // region. So contiguous same-site pixels become one piece, and any change
  // in site (including a region change at a boundary) becomes a new piece.
  // Also record each piece's parent region for the merge step that follows.
  const pieceId = new Int32Array(N).fill(-1);
  const pieceRegionList = [];
  let pieceCount = 0;
  for (let start = 0; start < N; start++) {
    if (pieceId[start] >= 0) continue;
    const v = subOwner[start];
    pieceId[start] = pieceCount;
    pieceRegionList.push(siteRegion[v]);
    sp = 0;
    stack[sp++] = start;
    while (sp > 0) {
      const idx = stack[--sp];
      const y = (idx / W) | 0;
      const x = idx - y * W;
      let ni;
      if (x > 0     && pieceId[ni = idx - 1] < 0 && subOwner[ni] === v) { pieceId[ni] = pieceCount; stack[sp++] = ni; }
      if (x < W - 1 && pieceId[ni = idx + 1] < 0 && subOwner[ni] === v) { pieceId[ni] = pieceCount; stack[sp++] = ni; }
      if (y > 0     && pieceId[ni = idx - W] < 0 && subOwner[ni] === v) { pieceId[ni] = pieceCount; stack[sp++] = ni; }
      if (y < H - 1 && pieceId[ni = idx + W] < 0 && subOwner[ni] === v) { pieceId[ni] = pieceCount; stack[sp++] = ni; }
    }
    pieceCount++;
  }

  // ---- Step 7.25: Smooth piece edges. A 9-neighborhood mode filter on the
  // piece-ID map clips the stair-step jaggedness that pixel-rasterizing the
  // Voronoi boundaries leaves behind. We then re-run CC because mode filtering
  // can pinch off a thin "bridge" of a piece, leaving two same-ID blobs that
  // are no longer physically connected — those should become distinct pieces.
  // In preview mode, skip the expensive disk-filter smoothing pass and the
  // re-CC that follows. The result is rougher edge pixels but still readable;
  // the full-quality render after the slider settles will replace it.
  if (!previewMode && edgeSmoothPasses > 0 && edgeSmoothRadius > 0) {
    smoothPieceEdges(pieceId, W, H, edgeSmoothRadius, edgeSmoothPasses);

    // Re-CC on the smoothed map. Reuse `subOwner` as a scratch label buffer
    // since we don't need its original contents any more.
    subOwner.set(pieceId);
    pieceId.fill(-1);
    pieceRegionList.length = 0;
    pieceCount = 0;
    for (let start = 0; start < N; start++) {
      if (pieceId[start] >= 0) continue;
      const v = subOwner[start];
      pieceId[start] = pieceCount;
      pieceRegionList.push(paletteOwner[start]);
      sp = 0;
      stack[sp++] = start;
      while (sp > 0) {
        const idx = stack[--sp];
        const y = (idx / W) | 0;
        const x = idx - y * W;
        let ni;
        if (x > 0     && pieceId[ni = idx - 1] < 0 && subOwner[ni] === v) { pieceId[ni] = pieceCount; stack[sp++] = ni; }
        if (x < W - 1 && pieceId[ni = idx + 1] < 0 && subOwner[ni] === v) { pieceId[ni] = pieceCount; stack[sp++] = ni; }
        if (y > 0     && pieceId[ni = idx - W] < 0 && subOwner[ni] === v) { pieceId[ni] = pieceCount; stack[sp++] = ni; }
        if (y < H - 1 && pieceId[ni = idx + W] < 0 && subOwner[ni] === v) { pieceId[ni] = pieceCount; stack[sp++] = ni; }
      }
      pieceCount++;
    }
  }

  // ---- Step 7.5: Merge pieces below the minimum area. A glazier wouldn't
  // cut a 5-pixel speck of glass. Tiny pieces find their largest neighbor and
  // get absorbed. Same-region neighbors are heavily preferred so color
  // boundaries stay intact; cross-region merging only happens when the piece
  // is so isolated that no same-region neighbor exists.
  if (minPieceRadius > 0) {
    const minPixels = Math.round(minPieceRadius * minPieceRadius);
    pieceCount = mergeTinyPieces(pieceId, pieceCount, pieceRegionList, W, H, minPixels);
  }

  if (await checkpoint()) return null;

  // ---- Step 7.75: Vectorize each piece's boundary, smooth as analytic
  // curves, then re-rasterize. Real glass is cut by scoring continuous curves
  // along the boundary — there's no concept of "pixel". So we extract every
  // piece's pixel-corner outline as a closed polyline, run a Gaussian low-pass
  // on the (x, y) coordinate sequence (which produces a smooth analytic curve
  // of bounded curvature, mimicking the minimum-radius constraint of a glass
  // cutter), and scan-line-fill the smoothed polygon back into a fresh map.
  // The resulting `pieceId` carries smooth boundaries that, when rasterized,
  // have only sub-pixel staircase error — invisible behind the AA lead.
  // Preview keeps vectorization (essential for non-jagged piece outlines) but
  // uses cheaper params: smaller Gaussian kernel, coarser DP tolerance.
  const vk = previewMode ? Math.max(2, vectorizeKernel - 2) : vectorizeKernel;
  const vt = previewMode ? simplifyTolerance + 1.5         : simplifyTolerance;
  vectorizeAndRerasterize(pieceId, pieceCount, W, H, vk, vt);

  // ---- Step 7.9: Enforce the cuttability rule (skipped in preview — it
  // does up to 8 full O(N) adjacency rebuilds and the visual difference is
  // subtle while dragging a slider).
  // ---- A glass piece can't be fully
  // surrounded by a single continuous piece — the score that would isolate it
  // is a closed loop, which doesn't separate inside from outside without a
  // second score. So any piece whose only neighbor is one other piece (and
  // which doesn't touch the panel boundary) gets merged into that surrounder.
  // Iterated until stable to handle cascades (newly-merged regions can expose
  // formerly-hidden enclosures).
  if (!previewMode) {
    pieceCount = enforceCuttability(pieceId, pieceCount, W, H);
  }

  // ---- Step 8: Per-piece source color average + saturation/brightness boost.
  const pieceR = new Float32Array(pieceCount);
  const pieceG = new Float32Array(pieceCount);
  const pieceB = new Float32Array(pieceCount);
  const pieceN = new Uint32Array(pieceCount);
  for (let py = 0; py < H; py++) {
    const sy = Math.min(SRC_H - 1, (py * srcScaleY) | 0);
    for (let px = 0; px < W; px++) {
      const sx = Math.min(SRC_W - 1, (px * srcScaleX) | 0);
      const pid = pieceId[py * W + px];
      const j = (sy * SRC_W + sx) * 4;
      pieceR[pid] += srcData[j];
      pieceG[pid] += srcData[j + 1];
      pieceB[pid] += srcData[j + 2];
      pieceN[pid]++;
    }
  }
  const finalR = new Uint8ClampedArray(pieceCount);
  const finalG = new Uint8ClampedArray(pieceCount);
  const finalB = new Uint8ClampedArray(pieceCount);
  for (let i = 0; i < pieceCount; i++) {
    const n = pieceN[i];
    if (n === 0) continue;
    let r = pieceR[i] / n;
    let g = pieceG[i] / n;
    let b = pieceB[i] / n;
    const gray = (r + g + b) / 3;
    r = clamp(gray + (r - gray) * saturationBoost, 0, 255) * brightnessBoost;
    g = clamp(gray + (g - gray) * saturationBoost, 0, 255) * brightnessBoost;
    b = clamp(gray + (b - gray) * saturationBoost, 0, 255) * brightnessBoost;
    const v = 1 + (rng() - 0.5) * cellVariation * 2;
    finalR[i] = clamp(r * v, 0, 255);
    finalG[i] = clamp(g * v, 0, 255);
    finalB[i] = clamp(b * v, 0, 255);
  }

  // ---- Step 8.0: Per-piece style assignment. Each piece picks one of:
  //   flat       — solid color
  //   marbled    — low-frequency value-noise swirl (typical streaky glass)
  //   textured   — fine-grain noise (seedy/hammered glass)
  //   gradient   — linear brightness gradient across the piece
  // Style modulates brightness only; hue stays inside the piece's palette
  // color so the panel still reads as a limited palette. The glass texture
  // we render is also what the gobo + god-rays sample, so lighting through
  // textured glass is automatically accurate.
  const STYLE_FLAT = 0, STYLE_MARBLED = 1, STYLE_TEXTURED = 2, STYLE_GRADIENT = 3;
  const pieceStyle = new Uint8Array(pieceCount);
  const pieceGradX = new Float32Array(pieceCount);
  const pieceGradY = new Float32Array(pieceCount);
  const pieceCx2 = new Float32Array(pieceCount);
  const pieceCy2 = new Float32Array(pieceCount);
  const pieceSpanInv = new Float32Array(pieceCount);
  const pieceStyleSeed = new Int32Array(pieceCount);

  // Bounding box per piece for gradient anchoring.
  const pMinX = new Int32Array(pieceCount).fill(W);
  const pMaxX = new Int32Array(pieceCount).fill(-1);
  const pMinY = new Int32Array(pieceCount).fill(H);
  const pMaxY = new Int32Array(pieceCount).fill(-1);
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const pid = pieceId[py * W + px];
      if (px < pMinX[pid]) pMinX[pid] = px;
      if (px > pMaxX[pid]) pMaxX[pid] = px;
      if (py < pMinY[pid]) pMinY[pid] = py;
      if (py > pMaxY[pid]) pMaxY[pid] = py;
    }
  }
  for (let i = 0; i < pieceCount; i++) {
    // Weighted style mix — marbled is most common in real stained glass,
    // textured is subtle baseline, gradient is rarer (cathedral glass).
    const r = rng();
    pieceStyle[i] = r < 0.18 ? STYLE_FLAT
                  : r < 0.58 ? STYLE_MARBLED
                  : r < 0.84 ? STYLE_TEXTURED
                  :            STYLE_GRADIENT;
    const a = rng() * Math.PI * 2;
    pieceGradX[i] = Math.cos(a);
    pieceGradY[i] = Math.sin(a);
    pieceCx2[i] = (pMinX[i] + pMaxX[i]) * 0.5;
    pieceCy2[i] = (pMinY[i] + pMaxY[i]) * 0.5;
    const hw = (pMaxX[i] - pMinX[i]) * 0.5;
    const hh = (pMaxY[i] - pMinY[i]) * 0.5;
    pieceSpanInv[i] = 1 / Math.max(1, Math.sqrt(hw * hw + hh * hh));
    pieceStyleSeed[i] = Math.floor(rng() * 1e9);
  }

  if (await checkpoint()) return null;

  // ---- Step 8: Chamfer 3-4 distance transform from piece boundaries.
  // A glazier draws a smooth curve and follows it with a glass cutter — the
  // resulting cut is sub-pixel smooth. We mimic that look by computing a
  // distance field from the piece boundaries and then rendering the lead with
  // a smoothstep over distance instead of a hard threshold. The lead came
  // becomes a soft band so the underlying pixel rasterization of curves is
  // anti-aliased away.
  const CHAMFER_A = 3, CHAMFER_B = 4, CHAMFER_INF = 65535;
  const dist = new Uint16Array(N);
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const idx = py * W + px;
      const me = pieceId[idx];
      const onEdge =
        (px > 0     && pieceId[idx - 1] !== me) ||
        (px < W - 1 && pieceId[idx + 1] !== me) ||
        (py > 0     && pieceId[idx - W] !== me) ||
        (py < H - 1 && pieceId[idx + W] !== me);
      dist[idx] = onEdge ? 0 : CHAMFER_INF;
    }
  }
  // Forward pass (top-left → bottom-right).
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const idx = py * W + px;
      if (dist[idx] === 0) continue;
      let d = dist[idx];
      if (px > 0) {
        const c = dist[idx - 1] + CHAMFER_A;
        if (c < d) d = c;
      }
      if (py > 0) {
        const c = dist[idx - W] + CHAMFER_A;
        if (c < d) d = c;
        if (px > 0) {
          const c2 = dist[idx - W - 1] + CHAMFER_B;
          if (c2 < d) d = c2;
        }
        if (px < W - 1) {
          const c2 = dist[idx - W + 1] + CHAMFER_B;
          if (c2 < d) d = c2;
        }
      }
      dist[idx] = d;
    }
  }
  // Backward pass (bottom-right → top-left).
  for (let py = H - 1; py >= 0; py--) {
    for (let px = W - 1; px >= 0; px--) {
      const idx = py * W + px;
      if (dist[idx] === 0) continue;
      let d = dist[idx];
      if (px < W - 1) {
        const c = dist[idx + 1] + CHAMFER_A;
        if (c < d) d = c;
      }
      if (py < H - 1) {
        const c = dist[idx + W] + CHAMFER_A;
        if (c < d) d = c;
        if (px > 0) {
          const c2 = dist[idx + W - 1] + CHAMFER_B;
          if (c2 < d) d = c2;
        }
        if (px < W - 1) {
          const c2 = dist[idx + W + 1] + CHAMFER_B;
          if (c2 < d) d = c2;
        }
      }
      dist[idx] = d;
    }
  }

  // ---- Step 9: Compose the output. RGB carries pure glass color (with the
  // per-piece style modulation); ALPHA carries the chamfer distance to the
  // nearest piece boundary, packed 0..255 over the range [0, distMax]. The
  // glass plane shader uses the alpha to compute the lead's half-cylinder
  // surface normal for bump-shaded metallic silver, so we keep the lead off
  // the canvas entirely. The floor + rays shaders sample the same alpha to
  // darken the projected light where lead blocks it.
  const outCanvas = document.createElement('canvas');
  outCanvas.width = W;
  outCanvas.height = H;
  const outCtx = outCanvas.getContext('2d');
  const outImg = outCtx.createImageData(W, H);
  const px = outImg.data;

  const thickness = Math.max(1, leadThickness);
  // Range stored in alpha — generously wider than the lead radius so the
  // shader has enough gradient outside the rope to do clean derivatives.
  const distMaxStored = (thickness + 2.0) * CHAMFER_A;

  // Style amplitudes — kept modest so variation stays inside one palette family.
  const MARBLE_AMP = 0.22, MARBLE_FREQ = 0.028;
  const TEXTURE_AMP = 0.12, TEXTURE_FREQ = 0.18;
  const GRAD_AMP = 0.20;

  for (let i = 0; i < N; i++) {
    const j = i * 4;
    const pid = pieceId[i];
    const cy = (i / W) | 0;
    const cx = i - cy * W;

    // Per-pixel style modulation factor inside the piece's palette.
    let factor;
    const style = pieceStyle[pid];
    if (style === STYLE_FLAT) {
      factor = 1;
    } else if (style === STYLE_MARBLED) {
      const n = valueNoise2D(cx * MARBLE_FREQ, cy * MARBLE_FREQ, pieceStyleSeed[pid]);
      const n2 = valueNoise2D(cx * MARBLE_FREQ * 2.3, cy * MARBLE_FREQ * 2.3, pieceStyleSeed[pid] ^ 0x55aa);
      factor = 1 + (n * 0.7 + n2 * 0.3) * MARBLE_AMP;
    } else if (style === STYLE_TEXTURED) {
      const n = valueNoise2D(cx * TEXTURE_FREQ, cy * TEXTURE_FREQ, pieceStyleSeed[pid]);
      factor = 1 + n * TEXTURE_AMP;
    } else {
      const dx = (cx - pieceCx2[pid]) * pieceSpanInv[pid];
      const dy = (cy - pieceCy2[pid]) * pieceSpanInv[pid];
      const t = dx * pieceGradX[pid] + dy * pieceGradY[pid];
      factor = 1 + t * GRAD_AMP;
    }

    let gR = clamp(finalR[pid] * factor, 0, 255);
    let gG = clamp(finalG[pid] * factor, 0, 255);
    let gB = clamp(finalB[pid] * factor, 0, 255);

    const noise = (rng() - 0.5) * glassNoise;
    gR = clamp(gR + noise, 0, 255);
    gG = clamp(gG + noise, 0, 255);
    gB = clamp(gB + noise, 0, 255);

    const d = dist[i];
    const dStored = Math.min(255, Math.round((d / distMaxStored) * 255));

    px[j]     = gR;
    px[j + 1] = gG;
    px[j + 2] = gB;
    px[j + 3] = dStored;
  }

  outCtx.putImageData(outImg, 0, 0);
  return {
    canvas: outCanvas,
    siteCount,
    pieceCount,
    paletteSize: K,
    width: W,
    height: H,
    aspect: W / H,
    leadThickness: thickness,
    // Pixel-distance range encoded in the alpha channel; the shader divides
    // alpha (0..1) by this to recover pixel-space distance for lead detection.
    distMaxPx: distMaxStored / CHAMFER_A,
  };
}

// ---------------- helpers ----------------

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

// MessageChannel-based macrotask yield. Lets the browser process pending
// input events (slider changes, key presses) between generator steps so the
// abort signal can be observed. Much faster than setTimeout(r, 0), which is
// clamped to ~4 ms in browsers.
function yieldToTask() {
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    ch.port1.onmessage = () => resolve();
    ch.port2.postMessage(null);
  });
}
function lerp(a, b, t) { return a + (b - a) * t; }

function makeRng(seed) {
  let s = (typeof seed === 'number' ? Math.floor(seed * 0xffffffff) : seed) | 0;
  if (s === 0) s = 0x9e3779b9;
  return function rng() {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 4294967296);
  };
}

// Cheap 2D value noise. Approximately [-1, 1].
function valueNoise2D(x, y, seed) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const r00 = hash2(xi,     yi,     seed);
  const r10 = hash2(xi + 1, yi,     seed);
  const r01 = hash2(xi,     yi + 1, seed);
  const r11 = hash2(xi + 1, yi + 1, seed);
  return lerp(lerp(r00, r10, u), lerp(r01, r11, u), v);
}
function hash2(x, y, seed) {
  let n = (x | 0) * 374761393 + (y | 0) * 668265263 + (seed | 0) * 1442695040;
  n = (n ^ (n >>> 13)) * 1274126177;
  n = n ^ (n >>> 16);
  return ((n >>> 0) / 0xffffffff) * 2 - 1;
}

// K-means quantize source pixels into K palette buckets.
// Returns: Uint8Array of length W*H with palette index per pixel.
// Uses k-means++ init and rec.601-weighted distance for perceptual results.
function kMeansQuantize(srcData, W, H, K, rng, maxIter = 12) {
  const N = W * H;
  const palette = new Float32Array(K * 3);

  // k-means++ seeding.
  const firstIdx = Math.floor(rng() * N);
  palette[0] = srcData[firstIdx * 4];
  palette[1] = srcData[firstIdx * 4 + 1];
  palette[2] = srcData[firstIdx * 4 + 2];

  const dists = new Float32Array(N);
  for (let kk = 1; kk < K; kk++) {
    let total = 0;
    for (let i = 0; i < N; i++) {
      const r = srcData[i * 4];
      const g = srcData[i * 4 + 1];
      const b = srcData[i * 4 + 2];
      let minD = Infinity;
      for (let k = 0; k < kk; k++) {
        const dr = palette[k * 3]     - r;
        const dg = palette[k * 3 + 1] - g;
        const db = palette[k * 3 + 2] - b;
        const d = 0.30 * dr * dr + 0.59 * dg * dg + 0.11 * db * db;
        if (d < minD) minD = d;
      }
      dists[i] = minD;
      total += minD;
    }
    let pick = rng() * total;
    let chosen = N - 1;
    for (let i = 0; i < N; i++) {
      pick -= dists[i];
      if (pick <= 0) { chosen = i; break; }
    }
    palette[kk * 3]     = srcData[chosen * 4];
    palette[kk * 3 + 1] = srcData[chosen * 4 + 1];
    palette[kk * 3 + 2] = srcData[chosen * 4 + 2];
  }

  const assignment = new Uint8Array(N);
  const sumR = new Float32Array(K);
  const sumG = new Float32Array(K);
  const sumB = new Float32Array(K);
  const counts = new Uint32Array(K);

  for (let iter = 0; iter < maxIter; iter++) {
    let changed = 0;
    for (let i = 0; i < N; i++) {
      const r = srcData[i * 4];
      const g = srcData[i * 4 + 1];
      const b = srcData[i * 4 + 2];
      let best = 0;
      let bestD = Infinity;
      for (let k = 0; k < K; k++) {
        const dr = palette[k * 3]     - r;
        const dg = palette[k * 3 + 1] - g;
        const db = palette[k * 3 + 2] - b;
        const d = 0.30 * dr * dr + 0.59 * dg * dg + 0.11 * db * db;
        if (d < bestD) { bestD = d; best = k; }
      }
      if (assignment[i] !== best) changed++;
      assignment[i] = best;
    }
    if (changed === 0) break;

    sumR.fill(0); sumG.fill(0); sumB.fill(0); counts.fill(0);
    for (let i = 0; i < N; i++) {
      const k = assignment[i];
      sumR[k] += srcData[i * 4];
      sumG[k] += srcData[i * 4 + 1];
      sumB[k] += srcData[i * 4 + 2];
      counts[k]++;
    }
    for (let k = 0; k < K; k++) {
      if (counts[k] === 0) continue;
      palette[k * 3]     = sumR[k] / counts[k];
      palette[k * 3 + 1] = sumG[k] / counts[k];
      palette[k * 3 + 2] = sumB[k] / counts[k];
    }
  }
  return assignment;
}

// 3x3 mode-filter pass on a small-K integer map. Replaces each pixel with the
// most common value in its 3x3 neighborhood, breaking ties toward the pixel's
// own current value (stable boundaries).
function medianSmooth3x3(map, W, H, K) {
  // Start with a copy; only edge pixels (with at least one differing 4-neighbor)
  // need the actual mode computation. Interior pixels keep their own value.
  // This was profiled as a major hotspot — natural images have ~10% edge
  // pixels, so skipping the rest cuts most of the work per pass.
  const out = new Uint8Array(map);
  const counts = new Uint8Array(K);
  for (let y = 0; y < H; y++) {
    const yIn  = y > 0;
    const yIn2 = y < H - 1;
    const rowOff  = y * W;
    const rowOff0 = yIn  ? rowOff - W : 0;
    const rowOff2 = yIn2 ? rowOff + W : (H - 1) * W;
    for (let x = 0; x < W; x++) {
      const idx = rowOff + x;
      const own = map[idx];
      const xIn  = x > 0;
      const xIn2 = x < W - 1;
      // Fast 4-neighbor edge test on the inputs; if all match we don't even
      // need to read the diagonals, much less hit the mode filter.
      const left  = xIn  ? map[idx - 1] : own;
      const right = xIn2 ? map[idx + 1] : own;
      const up    = yIn  ? map[idx - W] : own;
      const down  = yIn2 ? map[idx + W] : own;
      if (left === own && right === own && up === own && down === own) continue;

      const x0 = xIn  ? x - 1 : 0;
      const x2 = xIn2 ? x + 1 : W - 1;
      counts.fill(0);
      counts[map[rowOff0 + x0]]++;
      counts[up]++;                       // (rowOff0 + x)
      counts[map[rowOff0 + x2]]++;
      counts[left]++;                     // (rowOff + x0)
      counts[own]++;
      counts[right]++;                    // (rowOff + x2)
      counts[map[rowOff2 + x0]]++;
      counts[down]++;                     // (rowOff2 + x)
      counts[map[rowOff2 + x2]]++;

      let bestK = own;
      let bestC = counts[own];
      for (let k = 0; k < K; k++) {
        if (counts[k] > bestC) { bestC = counts[k]; bestK = k; }
      }
      out[idx] = bestK;
    }
  }
  map.set(out);
}

// Enforce the physical cuttability rule of stained glass: a single closed
// score on glass can't separate an interior shape from its surrounding
// material (the score is a loop, not a parting line). So any piece whose
// neighbor set has size 1 and which doesn't touch the panel boundary is
// "fully enclosed" — it can't be cut as a discrete piece — and gets merged
// into its sole surrounder. Iterates until no enclosed pieces remain (since
// each merge can expose formerly-internal enclosures).
function enforceCuttability(pieceId, pieceCount, W, H) {
  const N = W * H;
  // Iterate up to a generous cap to avoid pathological loops.
  for (let pass = 0; pass < 8; pass++) {
    // Build adjacency (set per piece) + canvas-boundary touch flag.
    const neighbors = new Array(pieceCount);
    for (let i = 0; i < pieceCount; i++) neighbors[i] = new Set();
    for (let py = 0; py < H; py++) {
      for (let px = 0; px < W; px++) {
        const idx = py * W + px;
        const me = pieceId[idx];
        if (px < W - 1) {
          const nb = pieceId[idx + 1];
          if (nb !== me) { neighbors[me].add(nb); neighbors[nb].add(me); }
        }
        if (py < H - 1) {
          const nb = pieceId[idx + W];
          if (nb !== me) { neighbors[me].add(nb); neighbors[nb].add(me); }
        }
      }
    }
    const onBoundary = new Uint8Array(pieceCount);
    for (let py = 0; py < H; py++) {
      onBoundary[pieceId[py * W]]         = 1;
      onBoundary[pieceId[py * W + W - 1]] = 1;
    }
    for (let px = 0; px < W; px++) {
      onBoundary[pieceId[px]]               = 1;
      onBoundary[pieceId[(H - 1) * W + px]] = 1;
    }

    // Mark pieces that need to be merged into a single surrounder.
    // Union-Find handles cascading dependencies safely.
    const parent = new Int32Array(pieceCount);
    for (let i = 0; i < pieceCount; i++) parent[i] = i;
    const find = (x) => {
      while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
      return x;
    };

    let mergedAny = false;
    for (let b = 0; b < pieceCount; b++) {
      if (onBoundary[b]) continue;
      if (neighbors[b].size !== 1) continue;
      const a = neighbors[b].values().next().value;
      const rb = find(b);
      const ra = find(a);
      if (rb === ra) continue;
      parent[rb] = ra;
      mergedAny = true;
    }
    if (!mergedAny) return pieceCount;

    // Apply merges + compact piece IDs.
    const remap = new Int32Array(pieceCount).fill(-1);
    let newCount = 0;
    for (let i = 0; i < pieceCount; i++) {
      const root = find(i);
      if (remap[root] < 0) remap[root] = newCount++;
    }
    for (let i = 0; i < N; i++) {
      pieceId[i] = remap[find(pieceId[i])];
    }
    pieceCount = newCount;
  }
  return pieceCount;
}

// Vectorize the piece map: for each piece, extract its outline as a closed
// polyline at pixel-corner coordinates, smooth that polyline as a continuous
// curve (Gaussian low-pass on x and y separately, with circular boundary),
// and scan-line-fill the smoothed polygon back into the piece map. The result
// has boundaries that are *analytic smooth curves* rather than pixel-grid
// staircases — exactly what a real glass-cutter's score produces.
//
// Pieces are rasterized in area-descending order so smaller pieces overwrite
// the boundary pixels of larger neighbors; any leftover unfilled pixels (rare,
// from shrinkage of small pieces) keep their original piece ID.
function vectorizeAndRerasterize(pieceId, pieceCount, W, H, kernel, simplifyTol) {
  const N = W * H;

  // ---- Collect outward edges per piece in CCW orientation (piece on left
  // of the edge direction in screen coordinates: y axis is down).
  const edgesByPiece = new Array(pieceCount);
  for (let i = 0; i < pieceCount; i++) edgesByPiece[i] = [];
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const idx = py * W + px;
      const K = pieceId[idx];
      // Top edge (right-to-left when neighbor above is non-K)
      if (py === 0 || pieceId[idx - W] !== K) {
        edgesByPiece[K].push(px + 1, py, px, py);
      }
      // Left edge (top-to-bottom)
      if (px === 0 || pieceId[idx - 1] !== K) {
        edgesByPiece[K].push(px, py, px, py + 1);
      }
      // Bottom edge (left-to-right)
      if (py === H - 1 || pieceId[idx + W] !== K) {
        edgesByPiece[K].push(px, py + 1, px + 1, py + 1);
      }
      // Right edge (bottom-to-top)
      if (px === W - 1 || pieceId[idx + 1] !== K) {
        edgesByPiece[K].push(px + 1, py + 1, px + 1, py);
      }
    }
  }

  // Compute piece areas to order rasterization (largest first).
  const pieceArea = new Int32Array(pieceCount);
  for (let i = 0; i < N; i++) pieceArea[pieceId[i]]++;
  const order = new Int32Array(pieceCount);
  for (let i = 0; i < pieceCount; i++) order[i] = i;
  order.sort((a, b) => pieceArea[b] - pieceArea[a]);

  // Output buffer (-1 = unfilled); fall back to original pieceId at the end.
  const newPieceId = new Int32Array(N).fill(-1);
  const stride = W + 1;

  // Scratch arrays reused across pieces.
  const xs = [];

  for (let oi = 0; oi < pieceCount; oi++) {
    const K = order[oi];
    const e = edgesByPiece[K];
    if (e.length < 12) continue; // at least 3 edges to form a polygon

    // Stitch the edge soup into one-or-more closed polylines. Each edge is
    // stored flat: [sx, sy, ex, ey] × edgeCount. We index by start point.
    const numEdges = e.length >> 2;
    const pointMap = new Map();
    for (let i = 0; i < numEdges; i++) {
      const key = e[i * 4 + 1] * stride + e[i * 4];
      pointMap.set(key, i);
    }
    const visited = new Uint8Array(numEdges);
    for (let i = 0; i < numEdges; i++) {
      if (visited[i]) continue;
      const poly = [];
      let cur = i;
      // Walk start → end → next-edge-starting-at-end until we close or stall.
      while (cur !== undefined && !visited[cur]) {
        visited[cur] = 1;
        const e0 = cur * 4;
        poly.push(e[e0], e[e0 + 1]);
        cur = pointMap.get(e[e0 + 3] * stride + e[e0 + 2]);
      }
      if (poly.length < 6) continue;

      // Douglas-Peucker collapses sub-tolerance wobbles into straight segments,
      // then Gaussian smoothing rounds the resulting corners. Together they
      // produce piece outlines that look like analytical cuts: mostly straight
      // edges with gentle arcs, rather than the organic blob shapes that
      // pixel-rasterized Voronoi cells would have left behind.
      const simplified = simplifyTol > 0
        ? douglasPeuckerClosed(poly, simplifyTol)
        : poly;
      const smoothed = gaussianSmoothPolyline(simplified, kernel);
      rasterizePolygon(smoothed, K, newPieceId, W, H, xs);
    }
  }

  // Fill any pixels that weren't claimed by any smoothed polygon (rare,
  // happens at sub-pixel rasterization gaps). Use original pieceId so the
  // map is total.
  for (let i = 0; i < N; i++) {
    if (newPieceId[i] < 0) newPieceId[i] = pieceId[i];
  }
  pieceId.set(newPieceId);
}

// Douglas-Peucker simplification for a closed polyline. Picks the two
// most-separated vertices as anchors, splits the loop into two open halves,
// and recursively keeps only vertices whose perpendicular distance to the
// segment connecting their neighbors exceeds `tol`. Result: a polygon whose
// segments are all longer than `tol` and whose vertices are real direction
// changes — equivalent to the analytic intent of a glass-cutter's stroke
// (mostly-straight scores meeting at deliberate corners).
function douglasPeuckerClosed(poly, tol) {
  const n = poly.length >> 1;
  if (n < 4) return poly;

  // Pick anchors as the leftmost and rightmost vertices — O(n) and equivalent
  // quality for typical glass-piece shapes. A diagonal anchor pair would be
  // marginally better but isn't worth the O(n²) cost.
  let a = 0, b = 0, xmin = Infinity, xmax = -Infinity;
  for (let i = 0; i < n; i++) {
    const x = poly[i * 2];
    if (x < xmin) { xmin = x; a = i; }
    if (x > xmax) { xmax = x; b = i; }
  }
  if (a === b) b = (a + (n >> 1)) % n;
  if (a > b) { const t = a; a = b; b = t; }

  const keep = new Uint8Array(n);
  keep[a] = 1;
  keep[b] = 1;

  const tol2 = tol * tol;
  // Open-walk DP from a → b along the "forward" half.
  dpRange(poly, n, a, b, +1, tol2, keep);
  // And along the "backward" half (b → a wrapping through 0).
  dpRange(poly, n, b, a, +1, tol2, keep);

  const out = [];
  for (let i = 0; i < n; i++) {
    if (keep[i]) out.push(poly[i * 2], poly[i * 2 + 1]);
  }
  return out.length >= 6 ? out : poly;
}

// Iterative Douglas-Peucker on an inclusive range [start, end] walking in
// `step` direction (always +1 here, but `end` is reached by wrapping mod n).
function dpRange(poly, n, start, end, step, tol2, keep) {
  // Convert to an explicit ordered index list for clarity.
  const indices = [];
  let i = start;
  indices.push(i);
  while (i !== end) {
    i = (i + step + n) % n;
    indices.push(i);
  }
  if (indices.length < 3) return;

  // Iterative stack-based DP.
  const stack = [[0, indices.length - 1]];
  while (stack.length) {
    const [lo, hi] = stack.pop();
    if (hi - lo < 2) continue;
    const i0 = indices[lo], i1 = indices[hi];
    const x0 = poly[i0 * 2], y0 = poly[i0 * 2 + 1];
    const x1 = poly[i1 * 2], y1 = poly[i1 * 2 + 1];
    let maxD2 = 0, maxIdx = -1;
    for (let m = lo + 1; m < hi; m++) {
      const ii = indices[m];
      const px = poly[ii * 2], py = poly[ii * 2 + 1];
      const d2 = pointSegmentDistSq(px, py, x0, y0, x1, y1);
      if (d2 > maxD2) { maxD2 = d2; maxIdx = m; }
    }
    if (maxD2 > tol2 && maxIdx > lo) {
      keep[indices[maxIdx]] = 1;
      stack.push([lo, maxIdx]);
      stack.push([maxIdx, hi]);
    }
  }
}

function pointSegmentDistSq(px, py, x0, y0, x1, y1) {
  const dx = x1 - x0, dy = y1 - y0;
  const lensq = dx * dx + dy * dy;
  if (lensq < 1e-9) {
    const ex = px - x0, ey = py - y0;
    return ex * ex + ey * ey;
  }
  let t = ((px - x0) * dx + (py - y0) * dy) / lensq;
  if (t < 0) t = 0; else if (t > 1) t = 1;
  const cx = x0 + t * dx;
  const cy = y0 + t * dy;
  const ex = px - cx, ey = py - cy;
  return ex * ex + ey * ey;
}

// 1D circular Gaussian low-pass on a closed polyline (flat [x0,y0,x1,y1,...]
// array). Kernel is auto-scaled down for short polylines so we don't collapse
// tiny pieces toward their centroid.
function gaussianSmoothPolyline(poly, kernel) {
  const n = poly.length >> 1;
  if (n < 6) return poly;
  const k = Math.min(kernel, Math.max(1, Math.floor(n / 4)));
  const sigma = k / 1.8;
  const twoSigma2 = 2 * sigma * sigma;
  const weights = new Float32Array(k * 2 + 1);
  let wSum = 0;
  for (let i = -k; i <= k; i++) {
    const w = Math.exp(-i * i / twoSigma2);
    weights[i + k] = w;
    wSum += w;
  }
  const out = new Float32Array(poly.length);
  for (let i = 0; i < n; i++) {
    let sx = 0, sy = 0;
    for (let j = -k; j <= k; j++) {
      let idx = i + j;
      if (idx < 0) idx += n;
      else if (idx >= n) idx -= n;
      const w = weights[j + k];
      sx += poly[idx * 2]     * w;
      sy += poly[idx * 2 + 1] * w;
    }
    out[i * 2]     = sx / wSum;
    out[i * 2 + 1] = sy / wSum;
  }
  return out;
}

// Even-odd scan-line fill of a closed polygon (flat coord array) into the
// target piece map. Writes value K at every pixel whose center lies inside
// the polygon.
function rasterizePolygon(poly, K, outPieceId, W, H, xs) {
  const n = poly.length >> 1;
  if (n < 3) return;
  let minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < n; i++) {
    const y = poly[i * 2 + 1];
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const y0 = Math.max(0, Math.floor(minY));
  const y1 = Math.min(H - 1, Math.floor(maxY));
  for (let y = y0; y <= y1; y++) {
    xs.length = 0;
    const yMid = y + 0.5;
    for (let i = 0; i < n; i++) {
      const ax = poly[i * 2];
      const ay = poly[i * 2 + 1];
      const j = (i + 1) % n;
      const bx = poly[j * 2];
      const by = poly[j * 2 + 1];
      if ((ay <= yMid && by > yMid) || (by <= yMid && ay > yMid)) {
        const t = (yMid - ay) / (by - ay);
        xs.push(ax + t * (bx - ax));
      }
    }
    xs.sort((a, b) => a - b);
    const rowBase = y * W;
    for (let i = 0; i + 1 < xs.length; i += 2) {
      const xa = Math.max(0, Math.round(xs[i]));
      const xb = Math.min(W - 1, Math.round(xs[i + 1]) - 1);
      for (let x = xa; x <= xb; x++) outPieceId[rowBase + x] = K;
    }
  }
}

// Gaussian-weighted disk mode filter on a piece-ID map. Each edge pixel is
// reassigned to whichever piece has the highest Gaussian-weighted vote in a
// disk of `radius` pixels around it. Larger radius enforces a higher minimum
// curvature on piece boundaries — same constraint a glass cutter faces, since
// no tool can follow tighter wiggles than the radius of its cutting wheel.
function smoothPieceEdges(pieceId, W, H, radius, passes) {
  if (passes <= 0 || radius < 1) return;
  const N = W * H;

  // Precompute disk offsets with Gaussian weights.
  const sigma = radius / 1.8;
  const twoSigma2 = 2 * sigma * sigma;
  const offsX = [];
  const offsY = [];
  const offsW = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const d2 = dx * dx + dy * dy;
      if (d2 > radius * radius) continue;
      offsX.push(dx);
      offsY.push(dy);
      offsW.push(Math.exp(-d2 / twoSigma2));
    }
  }
  const K = offsX.length;

  const candidateIds = new Int32Array(K);
  const candidateWts = new Float32Array(K);
  const out = new Int32Array(N);

  for (let pass = 0; pass < passes; pass++) {
    out.set(pieceId);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        const me = pieceId[idx];
        // Quick interior skip — only edge pixels can change.
        if (x > 0 && x < W - 1 && y > 0 && y < H - 1 &&
            pieceId[idx - 1]     === me &&
            pieceId[idx + 1]     === me &&
            pieceId[idx - W]     === me &&
            pieceId[idx + W]     === me &&
            pieceId[idx - W - 1] === me &&
            pieceId[idx - W + 1] === me &&
            pieceId[idx + W - 1] === me &&
            pieceId[idx + W + 1] === me) {
          continue;
        }
        let count = 0;
        for (let k = 0; k < K; k++) {
          const nx = x + offsX[k];
          const ny = y + offsY[k];
          if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
          const v = pieceId[ny * W + nx];
          const w = offsW[k];
          let j = 0;
          while (j < count && candidateIds[j] !== v) j++;
          if (j < count) candidateWts[j] += w;
          else { candidateIds[count] = v; candidateWts[count] = w; count++; }
        }
        // Self tie-break for stability.
        let bestI = -1;
        for (let j = 0; j < count; j++) if (candidateIds[j] === me) { bestI = j; break; }
        if (bestI < 0) bestI = 0;
        let bestW = candidateWts[bestI];
        for (let j = 0; j < count; j++) {
          if (candidateWts[j] > bestW) { bestW = candidateWts[j]; bestI = j; }
        }
        out[idx] = candidateIds[bestI];
      }
    }
    pieceId.set(out);
  }
}

// Merge pieces below the minimum-area threshold into a neighbor. Tiny pieces
// are processed in size-ascending order; each one is absorbed into the
// neighbor that scores highest on (shared-boundary × same-region-bonus). The
// pieceId map is then compacted to consecutive IDs. Returns the new count.
function mergeTinyPieces(pieceId, pieceCount, pieceRegion, W, H, minPixels) {
  const N = W * H;
  const sizes = new Int32Array(pieceCount);
  for (let i = 0; i < N; i++) sizes[pieceId[i]]++;

  // Adjacency: per-piece map of {neighborPieceId -> shared boundary length}.
  const adj = new Array(pieceCount);
  for (let i = 0; i < pieceCount; i++) adj[i] = new Map();
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      const idx = py * W + px;
      const me = pieceId[idx];
      if (px < W - 1) {
        const nb = pieceId[idx + 1];
        if (nb !== me) {
          adj[me].set(nb, (adj[me].get(nb) || 0) + 1);
          adj[nb].set(me, (adj[nb].get(me) || 0) + 1);
        }
      }
      if (py < H - 1) {
        const nb = pieceId[idx + W];
        if (nb !== me) {
          adj[me].set(nb, (adj[me].get(nb) || 0) + 1);
          adj[nb].set(me, (adj[nb].get(me) || 0) + 1);
        }
      }
    }
  }

  // Union-Find for in-place merging.
  const parent = new Int32Array(pieceCount);
  for (let i = 0; i < pieceCount; i++) parent[i] = i;
  const find = (x) => {
    while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; }
    return x;
  };

  const tiny = [];
  for (let i = 0; i < pieceCount; i++) if (sizes[i] < minPixels) tiny.push(i);
  tiny.sort((a, b) => sizes[a] - sizes[b]);

  for (const t of tiny) {
    const root = find(t);
    if (sizes[root] >= minPixels) continue;

    let bestN = -1;
    let bestScore = -1;
    const myRegion = pieceRegion[root];
    const myAdj = adj[root];
    for (const [nb, shared] of myAdj) {
      const nRoot = find(nb);
      if (nRoot === root) continue;
      const sameRegion = pieceRegion[nRoot] === myRegion;
      // Same-region neighbors win by a large factor; only cross-region merge
      // when no same-region neighbor exists.
      const score = shared * (sameRegion ? 4 : 1);
      if (score > bestScore) { bestScore = score; bestN = nRoot; }
    }
    if (bestN < 0) continue;

    parent[root] = bestN;
    sizes[bestN] += sizes[root];
    sizes[root] = 0;

    // Inherit adjacency so future merges of bestN see the right neighbors.
    if (adj[bestN] !== myAdj) {
      const dst = adj[bestN];
      for (const [nb, shared] of myAdj) {
        const nRoot = find(nb);
        if (nRoot === bestN) continue;
        dst.set(nRoot, (dst.get(nRoot) || 0) + shared);
        const back = adj[nRoot];
        back.set(bestN, (back.get(bestN) || 0) + shared);
      }
    }
  }

  // Compact: assign new consecutive IDs to surviving roots, rewrite pieceId.
  const remap = new Int32Array(pieceCount).fill(-1);
  let newCount = 0;
  for (let i = 0; i < pieceCount; i++) {
    const root = find(i);
    if (remap[root] < 0) remap[root] = newCount++;
  }
  for (let i = 0; i < N; i++) {
    pieceId[i] = remap[find(pieceId[i])];
  }
  return newCount;
}

// Bridson's Poisson-disk sampling. Returns [[x,y],...] with all pairs >= radius apart.
function poissonDisk(width, height, radius, rng, k = 22) {
  const cell = radius / Math.SQRT2;
  const gw = Math.ceil(width / cell);
  const gh = Math.ceil(height / cell);
  const grid = new Int32Array(gw * gh).fill(-1);
  const pts = [];
  const active = [];

  const sx = rng() * width;
  const sy = rng() * height;
  pts.push([sx, sy]);
  active.push(0);
  grid[Math.floor(sy / cell) * gw + Math.floor(sx / cell)] = 0;

  while (active.length > 0) {
    const ai = Math.floor(rng() * active.length);
    const pi = active[ai];
    const [px, py] = pts[pi];
    let placed = false;
    for (let i = 0; i < k; i++) {
      const a = rng() * Math.PI * 2;
      const r = radius * (1 + rng());
      const nx = px + Math.cos(a) * r;
      const ny = py + Math.sin(a) * r;
      if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
      const gx = Math.floor(nx / cell);
      const gy = Math.floor(ny / cell);
      let ok = true;
      for (let dy = -2; dy <= 2 && ok; dy++) {
        for (let dx = -2; dx <= 2 && ok; dx++) {
          const cx = gx + dx, cy = gy + dy;
          if (cx < 0 || cy < 0 || cx >= gw || cy >= gh) continue;
          const ni = grid[cy * gw + cx];
          if (ni < 0) continue;
          const o = pts[ni];
          const ddx = o[0] - nx;
          const ddy = o[1] - ny;
          if (ddx * ddx + ddy * ddy < radius * radius) ok = false;
        }
      }
      if (ok) {
        pts.push([nx, ny]);
        active.push(pts.length - 1);
        grid[gy * gw + gx] = pts.length - 1;
        placed = true;
        break;
      }
    }
    if (!placed) active.splice(ai, 1);
  }
  return pts;
}
