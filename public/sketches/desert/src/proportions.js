import * as THREE from 'three';

export const DEFAULT_ROOT_MEASUREMENT = 7.0;

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
    firstArmAge: 0.56,
    adultAge: 0.76,
    seniorAge: 0.90,
    middleArmBudget: [0.35, 1.8],
    adultArmBudget: [1.8, 5.0],
    seniorArmBudget: [5.0, 9.0],
    armBudgetNoise: [0.78, 1.20],
    middleJointRange: [0.46, 0.64],
    adultJointRange: [0.34, 0.72],
    seniorJointRange: [0.28, 0.74],
    armRiseFractionMiddle: [0.16, 0.30],
    armRiseFractionAdult: [0.18, 0.42],
    armRiseFractionSenior: [0.18, 0.52],
    nearTopArmChance: 0.08,
    woodyBaseStartAge: 0.76,
    woodyBaseMaxFraction: 0.22,
  }),
  barrelCactus: Object.freeze({
    heightByAge: [0.032, 0.135],
    oldHeightBoost: 0.018,
    flowerRadius: [0.0057, 0.0100],
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
      heightForAge(age) {
        const heightGrowth = Math.pow(THREE.MathUtils.clamp(age, 0, 1), 1.38);
        return THREE.MathUtils.clamp(
          rootMeasurement * THREE.MathUtils.lerp(ratios.saguaro.seedlingHeight, 1.0, heightGrowth),
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
        return THREE.MathUtils.clamp(count, 0, 10);
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

export function resolveProportionOracle(opts = {}) {
  if (opts.proportions?.kind === 'desert-proportion-oracle') return opts.proportions;
  return createProportionOracle(opts);
}
