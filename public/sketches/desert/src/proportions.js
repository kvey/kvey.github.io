import * as THREE from './three-shim.js';

export const DEFAULT_ROOT_MEASUREMENT = 7.0;

const SAGUARO_MAX_REFERENCE_HEIGHT_M = 15.0;
export const SCENE_SCALE_REFERENCE = Object.freeze({
  referenceSpecies: 'saguaro',
  referenceHeight_m: SAGUARO_MAX_REFERENCE_HEIGHT_M,
  defaultSceneHeight: DEFAULT_ROOT_MEASUREMENT,
});
const SAGUARO_GROWTH_TABLE = Object.freeze([
  [0, 0.03],
  [8, 0.038],
  [10, 0.075],
  [30, 0.60],
  [55, 2.10],
  [90, 3.80],
  [125, 6.40],
  [170, 10.0],
  [200, SAGUARO_MAX_REFERENCE_HEIGHT_M],
]);

// Metric ranges from SONORAN_PLANT_GENERATION.md. Scene units are scaled so
// a 15 m exceptional saguaro maps to the current `saguaroMaxHeight` control.
export const SPECIES_METRIC_RANGES = Object.freeze({
  saguaro: Object.freeze({
    height_m: [0.03, 15.0],
    commonMatureHeight_m: [6.0, 10.0],
    trunkDiameter_m: [0.30, 0.60],
    adultSpacing_m: [6.0, 18.0],
  }),
  paloVerde: Object.freeze({
    height_m: [1.5, 6.0],
    canopyRadius_m: [1.5, 5.0],
    spacing_m: [4.0, 12.0],
  }),
  mesquite: Object.freeze({
    uplandHeight_m: [2.0, 6.0],
    washHeight_m: [6.0, 15.0],
    canopyRadius_m: [2.0, 10.0],
    spacing_m: [5.0, 20.0],
  }),
  creosote: Object.freeze({
    height_m: [0.6, 2.5],
    canopyRadius_m: [0.8, 2.5],
    spacing_m: [1.5, 4.0],
  }),
  ocotillo: Object.freeze({
    height_m: [2.0, 9.0],
    spacing_m: [3.0, 10.0],
  }),
  barrelCactus: Object.freeze({
    height_m: [0.3, 3.0],
    diameter_m: [0.45, 0.83],
    spacing_m: [1.5, 6.0],
  }),
  pricklyPear: Object.freeze({
    height_m: [0.8, 2.5],
    clumpWidth_m: [1.5, 9.0],
    spacing_m: [2.0, 8.0],
  }),
  jumpingCholla: Object.freeze({
    height_m: [1.5, 3.0],
    colonySpacing_m: [10.0, 50.0],
    internalSpacing_m: [1.0, 6.0],
  }),
});

export const PROPORTION_RATIOS = Object.freeze({
  saguaro: Object.freeze({
    seedlingHeight: 0.08,
    minHeight: 0.06,
    youngRadius: 0.0076,
    matureRadius: 0.0329,
    oldRadiusBoost: 0.0036,
    armRadiusScaleYoung: [0.44, 0.58],
    armRadiusScaleMature: [0.58, 0.72],
    armReachByRiseYoung: [0.09, 0.16],
    armReachByRiseMature: [0.14, 0.24],
    armReachCompactScale: [0.62, 0.82],
    armReachOpenYoung: [0.18, 0.28],
    armReachOpenMature: [0.22, 0.36],
    armReachCompactChance: 0.16,
    armReachOpenChance: 0.10,
    firstArmAge: 0.25,
    adultAge: 0.625,
    seniorAge: 0.90,
    middleArmBudget: [0.20, 1.5],
    adultArmBudget: [1.2, 4.4],
    seniorArmBudget: [3.0, 6.5],
    armBudgetNoise: [0.78, 1.20],
    middleJointRange: [0.46, 0.64],
    adultJointRange: [0.34, 0.72],
    seniorJointRange: [0.28, 0.74],
    armRiseFractionMiddle: [0.16, 0.30],
    armRiseFractionAdult: [0.18, 0.42],
    armRiseFractionSenior: [0.18, 0.52],
    nearTopArmChance: 0.08,
    woodyBaseStartAge: 0.35,
    woodyBaseMaxFraction: 0.22,
  }),
  barrelCactus: Object.freeze({
    heightByAge: [0.032, 0.135],
    oldHeightBoost: 0.018,
    flowerRadius: [0.0057, 0.0100],
  }),
  jumpingCholla: Object.freeze({
    height: [0.13, 0.43],
    trunkRadius: [0.0045, 0.0105],
    jointRadius: [0.00145, 0.00250],
    jointLength: [0.0086, 0.0229],
    fruitRadius: [0.0010, 0.0032],
    fruitLength: [0.0030, 0.0079],
  }),
  pricklyPear: Object.freeze({
    padBaseSize: [0.0286, 0.0486],
  }),
  ocotillo: Object.freeze({
    stemHeight: [0.257, 0.514],
    baseSpread: [0.0086, 0.0171],
    stemRadius: [0.0043, 0.0064],
    flowerRadius: [0.0057, 0.0100],
    flowerHeight: [0.0171, 0.0314],
    flowerLift: 0.0086,
  }),
  creosote: Object.freeze({
    height: [0.064, 0.171],
    spread: [0.057, 0.129],
    stemRadius: 0.0036,
    leafClusterRadius: [0.0100, 0.0200],
  }),
  paloVerde: Object.freeze({
    height: [0.34, 0.52],
    minHeight: 0.30,
    minHeightGap: 0.064,
    trunkRadius: [0.0086, 0.0186],
    blossomScatter: [0.0057, 0.0429],
    blossomVertical: [-0.0043, 0.0171],
    blossomSize: [0.0023, 0.0043],
    leafSpraySpread: 0.0429,
    sprigLength: 0.0400,
    leafletLength: [0.0029, 0.0043],
    leafletWidth: [0.0009, 0.0013],
    thornLength: 0.0054,
    twigBaseSpread: [0.0043, 0.0286],
    canopyRadius: 0.34,
    rootRadius: 0.54,
  }),
  mesquite: Object.freeze({
    height: [0.48, 0.68],
    minHeight: 0.314,
    minHeightGap: 0.086,
    trunkRadius: [0.0136, 0.0314],
    leafSpraySpread: 0.0600,
    sprigLength: 0.0629,
    leafletLength: [0.0033, 0.0049],
    leafletWidth: [0.0009, 0.0013],
    podDrop: 0.0114,
    podLength: [0.0457, 0.0829],
    podRadius: [0.0014, 0.0021],
    thornLength: 0.0086,
    twigBaseSpread: [0.0029, 0.0314],
    canopyRadius: 0.58,
    rootRadius: 0.92,
  }),
  rocks: Object.freeze({
    pebbleSize: [0.0143, 0.0400],
    boulderSize: [0.0786, 0.1643],
    pebbleSink: [0.0057, 0.0129],
    boulderSink: [0.0171, 0.0429],
  }),
  ecology: Object.freeze({
    youngSaguaroNurseEdge: 0.129,
    juvenileSaguaroNurseEdge: 0.286,
    matureSaguaroNurseEdge: 0.343,
    minMatureSaguaroCanopy: 0.243,
    minMatureSaguaroRoot: 0.271,
    minSaguaroRootPadding: 0.114,
    treeCompetitionPadding: 0.171,
    mesquiteCompetitionPadding: 0.286,
    barrelSaguaroPadding: 0.114,
    barrelRootPadding: 0.079,
    barrelNurseEdge: 0.071,
    pricklyPearSaguaroPadding: 0.093,
    pricklyPearRootPadding: 0.064,
    pricklyPearNurseEdge: 0.157,
    openPlantSaguaroPadding: 0.079,
    openPlantRootPadding: 0.057,
    immatureSaguaroTreePadding: 0.0286,
  }),
});

export function createProportionOracle(opts = {}) {
  const rootMeasurement = Math.max(
    0.001,
    opts.rootMeasurement ?? opts.referenceSaguaroHeight ?? opts.saguaroMaxHeight ?? opts.maxHeight ?? DEFAULT_ROOT_MEASUREMENT,
  );
  const measure = ratio => rootMeasurement * ratio;
  const range = ratioRange => [measure(ratioRange[0]), measure(ratioRange[1])];
  const ratios = PROPORTION_RATIOS;

  return Object.freeze({
    kind: 'desert-proportion-oracle',
    rootMeasurement,
    ratios,
    measure,
    range,
    saguaro: Object.freeze({
      maxHeight: rootMeasurement,
      minHeight: measure(ratios.saguaro.minHeight),
      ageYearsForNormalized(age) {
        return normalizedSaguaroAgeYears(age);
      },
      heightForAge(age) {
        const naturalHeightM = saguaroHeightMetersForAge(normalizedSaguaroAgeYears(age));
        return THREE.MathUtils.clamp(
          rootMeasurement * (naturalHeightM / SAGUARO_MAX_REFERENCE_HEIGHT_M),
          measure(ratios.saguaro.minHeight),
          rootMeasurement,
        );
      },
      trunkRadius(maturity, oldGrowth, rngRangeValue = 0) {
        return THREE.MathUtils.lerp(
          measure(ratios.saguaro.youngRadius),
          measure(ratios.saguaro.matureRadius),
          Math.pow(maturity, 0.78),
        ) + oldGrowth * rngRangeValue;
      },
      oldRadiusBoostRange: range([0, ratios.saguaro.oldRadiusBoost]),
      armRadiusScaleRange(armMaturity) {
        return [
          THREE.MathUtils.lerp(ratios.saguaro.armRadiusScaleYoung[0], ratios.saguaro.armRadiusScaleMature[0], armMaturity),
          THREE.MathUtils.lerp(ratios.saguaro.armRadiusScaleYoung[1], ratios.saguaro.armRadiusScaleMature[1], armMaturity),
        ];
      },
      armReachByRiseRange(armMaturity) {
        return [
          THREE.MathUtils.lerp(ratios.saguaro.armReachByRiseYoung[0], ratios.saguaro.armReachByRiseMature[0], armMaturity),
          THREE.MathUtils.lerp(ratios.saguaro.armReachByRiseYoung[1], ratios.saguaro.armReachByRiseMature[1], armMaturity),
        ];
      },
      armReachProfile(rng, armMaturity) {
        const roll = rng();
        if (roll < ratios.saguaro.armReachCompactChance) {
          const typical = this.armReachByRiseRange(armMaturity);
          return [
            typical[0] * ratios.saguaro.armReachCompactScale[0],
            typical[1] * ratios.saguaro.armReachCompactScale[1],
          ];
        }
        if (roll > 1 - ratios.saguaro.armReachOpenChance) {
          return [
            THREE.MathUtils.lerp(ratios.saguaro.armReachOpenYoung[0], ratios.saguaro.armReachOpenMature[0], armMaturity),
            THREE.MathUtils.lerp(ratios.saguaro.armReachOpenYoung[1], ratios.saguaro.armReachOpenMature[1], armMaturity),
          ];
        }
        return this.armReachByRiseRange(armMaturity);
      },
      armCount(rng, age, armChance) {
        if (age < ratios.saguaro.firstArmAge || armChance <= 0) return 0;

        const firstArmReadiness = THREE.MathUtils.smoothstep(age, ratios.saguaro.firstArmAge, ratios.saguaro.adultAge);
        let budget;
        if (age < ratios.saguaro.adultAge) {
          budget = THREE.MathUtils.lerp(ratios.saguaro.middleArmBudget[0], ratios.saguaro.middleArmBudget[1], firstArmReadiness);
        } else if (age < ratios.saguaro.seniorAge) {
          const adultT = THREE.MathUtils.smoothstep(age, ratios.saguaro.adultAge, ratios.saguaro.seniorAge);
          budget = THREE.MathUtils.lerp(ratios.saguaro.adultArmBudget[0], ratios.saguaro.adultArmBudget[1], adultT);
        } else {
          const seniorT = THREE.MathUtils.smoothstep(age, ratios.saguaro.seniorAge, 1.0);
          budget = THREE.MathUtils.lerp(ratios.saguaro.seniorArmBudget[0], ratios.saguaro.seniorArmBudget[1], seniorT);
        }

        const noisyBudget = budget * armChance * THREE.MathUtils.lerp(
          ratios.saguaro.armBudgetNoise[0],
          ratios.saguaro.armBudgetNoise[1],
          rng(),
        );
        let count = Math.floor(noisyBudget + rng());
        if (count === 0 && rng() < armChance * firstArmReadiness) count = 1;
        if (age > 0.88 && rng() < armChance * 0.055) count += 2 + Math.floor(rng() * 5);
        return THREE.MathUtils.clamp(count, 0, 14);
      },
      armJointRange(age) {
        if (age < ratios.saguaro.adultAge) return ratios.saguaro.middleJointRange;
        if (age < ratios.saguaro.seniorAge) {
          const adultT = THREE.MathUtils.smoothstep(age, ratios.saguaro.adultAge, ratios.saguaro.seniorAge);
          return [
            THREE.MathUtils.lerp(ratios.saguaro.adultJointRange[0], ratios.saguaro.seniorJointRange[0], adultT * 0.55),
            THREE.MathUtils.lerp(ratios.saguaro.adultJointRange[1], ratios.saguaro.seniorJointRange[1], adultT * 0.55),
          ];
        }
        return ratios.saguaro.seniorJointRange;
      },
      armRiseFractionRange(age) {
        if (age < ratios.saguaro.adultAge) return ratios.saguaro.armRiseFractionMiddle;
        if (age < ratios.saguaro.seniorAge) return ratios.saguaro.armRiseFractionAdult;
        return ratios.saguaro.armRiseFractionSenior;
      },
      woodyBaseFraction(age) {
        return THREE.MathUtils.smoothstep(age, ratios.saguaro.woodyBaseStartAge, 1.0) * ratios.saguaro.woodyBaseMaxFraction;
      },
    }),
    barrelCactus: Object.freeze({
      heightByAge: range(ratios.barrelCactus.heightByAge),
      oldHeightBoost: measure(ratios.barrelCactus.oldHeightBoost),
      flowerRadius: range(ratios.barrelCactus.flowerRadius),
    }),
    jumpingCholla: Object.freeze({
      height: range(ratios.jumpingCholla.height),
      trunkRadius: range(ratios.jumpingCholla.trunkRadius),
      jointRadius: range(ratios.jumpingCholla.jointRadius),
      jointLength: range(ratios.jumpingCholla.jointLength),
      fruitRadius: range(ratios.jumpingCholla.fruitRadius),
      fruitLength: range(ratios.jumpingCholla.fruitLength),
    }),
    pricklyPear: Object.freeze({
      padBaseSize: range(ratios.pricklyPear.padBaseSize),
    }),
    ocotillo: Object.freeze({
      stemHeight: range(ratios.ocotillo.stemHeight),
      baseSpread: range(ratios.ocotillo.baseSpread),
      stemRadius: range(ratios.ocotillo.stemRadius),
      flowerRadius: range(ratios.ocotillo.flowerRadius),
      flowerHeight: range(ratios.ocotillo.flowerHeight),
      flowerLift: measure(ratios.ocotillo.flowerLift),
    }),
    creosote: Object.freeze({
      height: range(ratios.creosote.height),
      spread: range(ratios.creosote.spread),
      stemRadius: measure(ratios.creosote.stemRadius),
      leafClusterRadius: range(ratios.creosote.leafClusterRadius),
    }),
    paloVerde: Object.freeze({
      height: range(ratios.paloVerde.height),
      minHeight: measure(ratios.paloVerde.minHeight),
      minHeightGap: measure(ratios.paloVerde.minHeightGap),
      trunkRadius: range(ratios.paloVerde.trunkRadius),
      blossomScatter: range(ratios.paloVerde.blossomScatter),
      blossomVertical: range(ratios.paloVerde.blossomVertical),
      blossomSize: range(ratios.paloVerde.blossomSize),
      leafSpraySpread: measure(ratios.paloVerde.leafSpraySpread),
      sprigLength: measure(ratios.paloVerde.sprigLength),
      leafletLength: range(ratios.paloVerde.leafletLength),
      leafletWidth: range(ratios.paloVerde.leafletWidth),
      thornLength: measure(ratios.paloVerde.thornLength),
      twigBaseSpread: range(ratios.paloVerde.twigBaseSpread),
      canopyRadius: measure(ratios.paloVerde.canopyRadius),
      rootRadius: measure(ratios.paloVerde.rootRadius),
    }),
    mesquite: Object.freeze({
      height: range(ratios.mesquite.height),
      minHeight: measure(ratios.mesquite.minHeight),
      minHeightGap: measure(ratios.mesquite.minHeightGap),
      trunkRadius: range(ratios.mesquite.trunkRadius),
      leafSpraySpread: measure(ratios.mesquite.leafSpraySpread),
      sprigLength: measure(ratios.mesquite.sprigLength),
      leafletLength: range(ratios.mesquite.leafletLength),
      leafletWidth: range(ratios.mesquite.leafletWidth),
      podDrop: measure(ratios.mesquite.podDrop),
      podLength: range(ratios.mesquite.podLength),
      podRadius: range(ratios.mesquite.podRadius),
      thornLength: measure(ratios.mesquite.thornLength),
      twigBaseSpread: range(ratios.mesquite.twigBaseSpread),
      canopyRadius: measure(ratios.mesquite.canopyRadius),
      rootRadius: measure(ratios.mesquite.rootRadius),
    }),
    rocks: Object.freeze({
      pebbleSize: range(ratios.rocks.pebbleSize),
      boulderSize: range(ratios.rocks.boulderSize),
      pebbleSink: range(ratios.rocks.pebbleSink),
      boulderSink: range(ratios.rocks.boulderSink),
    }),
    ecology: Object.freeze(Object.fromEntries(
      Object.entries(ratios.ecology).map(([key, value]) => [key, measure(value)]),
    )),
  });
}

export function sceneUnitsFromMeters(meters, rootMeasurement = DEFAULT_ROOT_MEASUREMENT) {
  return rootMeasurement * (meters / SAGUARO_MAX_REFERENCE_HEIGHT_M);
}

export function sceneRangeFromMeters(rangeMeters, rootMeasurement = DEFAULT_ROOT_MEASUREMENT) {
  return rangeMeters.map(value => sceneUnitsFromMeters(value, rootMeasurement));
}

function normalizedSaguaroAgeYears(age) {
  return THREE.MathUtils.clamp(age, 0, 1) * 200;
}

function saguaroHeightMetersForAge(ageYears) {
  const age = THREE.MathUtils.clamp(ageYears, 0, 200);
  for (let i = 1; i < SAGUARO_GROWTH_TABLE.length; i++) {
    const [prevAge, prevHeight] = SAGUARO_GROWTH_TABLE[i - 1];
    const [nextAge, nextHeight] = SAGUARO_GROWTH_TABLE[i];
    if (age > nextAge) continue;
    const t = (age - prevAge) / (nextAge - prevAge || 1);
    const eased = t * t * (3 - 2 * t);
    return THREE.MathUtils.lerp(prevHeight, nextHeight, eased);
  }
  return SAGUARO_MAX_REFERENCE_HEIGHT_M;
}

export function resolveProportionOracle(opts = {}) {
  if (opts.proportions?.kind === 'desert-proportion-oracle') return opts.proportions;
  return createProportionOracle(opts);
}
