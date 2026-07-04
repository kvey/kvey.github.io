// Off-main-thread plant geometry generation. The main thread's apply loop used
// to call the plant generators synchronously; each expensive plant (cholla,
// mesquite, saguaro) takes 50-150ms to build, which showed up as frame hitches
// during generation. This worker generates those geometries in parallel and
// ships the raw typed arrays back, so the main thread only has to wrap them in
// a BufferGeometry (cheap) — no long synchronous generator calls on the UI
// thread.
//
// It is a pure cache pre-filler: main echoes the exact scatter-cache key with
// each request and reuses the result if it arrives before the apply reaches
// that bucket; otherwise main falls back to generating on its own thread, so
// correctness never depends on this worker keeping up.
import { generateSaguaro } from './plants/saguaro.js';
import { generateMesquite } from './plants/mesquite.js';
import { generateJumpingCholla } from './plants/jumpingCholla.js';
import { generatePaloVerde } from './plants/paloVerde.js';
import { generateCreosote } from './plants/creosote.js';
import { generateOcotillo } from './plants/ocotillo.js';
import { generateBarrelCactus } from './plants/barrelCactus.js';
import { generatePricklyPear } from './plants/pricklyPear.js';
import { createProportionOracle } from './proportions.js';
import { mulberry32 } from './random.js';

const GENERATORS = {
  saguaro: generateSaguaro,
  mesquite: generateMesquite,
  jumpingCholla: generateJumpingCholla,
  paloVerde: generatePaloVerde,
  creosote: generateCreosote,
  ocotillo: generateOcotillo,
  barrel: generateBarrelCactus,
  pricklyPear: generatePricklyPear,
};

// One proportion oracle per rootMeasurement (matches main's generationProportions).
const oracleCache = new Map();
function oracleFor(rootMeasurement) {
  let oracle = oracleCache.get(rootMeasurement);
  if (!oracle) {
    oracle = createProportionOracle({ rootMeasurement });
    oracleCache.set(rootMeasurement, oracle);
  }
  return oracle;
}

// Generation guard: main bumps `generation` on every regenerate; stale results
// are dropped on the main side, but we also short-circuit here to avoid wasting
// time finishing a superseded batch.
let activeGeneration = 0;

function serializeGeometry(geom) {
  const attributes = {};
  const buffers = [];
  for (const name in geom.attributes) {
    const attr = geom.attributes[name];
    attributes[name] = {
      array: attr.array,
      itemSize: attr.itemSize,
      normalized: attr.normalized === true,
    };
    buffers.push(attr.array.buffer);
  }
  let index = null;
  if (geom.index) {
    index = { array: geom.index.array };
    buffers.push(geom.index.array.buffer);
  }
  // userData holds only primitives (age, growthStage, counts) — safe to clone.
  return { transfer: { attributes, index, userData: geom.userData ?? {} }, buffers };
}

self.onmessage = (event) => {
  const msg = event.data;
  if (msg.type === 'reset') {
    activeGeneration = msg.generation;
    oracleCache.clear();
    return;
  }
  if (msg.type !== 'generate') return;
  const { generation, requests } = msg;
  if (generation < activeGeneration) return;
  activeGeneration = generation;

  for (const req of requests) {
    if (generation < activeGeneration) return;
    const generator = GENERATORS[req.stageKey];
    if (!generator) continue;
    let serialized;
    try {
      const oracle = oracleFor(req.rootMeasurement);
      const opts = { ...req.variantOpts, proportions: oracle };
      const geom = generator(mulberry32(req.variantSeed), opts);
      serialized = serializeGeometry(geom);
    } catch (err) {
      self.postMessage({ type: 'geometryError', generation, cacheKey: req.cacheKey, message: String(err) });
      continue;
    }
    self.postMessage(
      { type: 'geometry', generation, cacheKey: req.cacheKey, ...serialized.transfer },
      serialized.buffers,
    );
  }
};
