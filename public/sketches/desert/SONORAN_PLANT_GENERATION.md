# Sonoran Plant Generation Spec

Implementation-first reference for generating the first eight Tucson/Sonoran Desert plants in this sketch:

- Saguaro (`Carnegiea gigantea`)
- Foothill/yellow palo verde (`Parkinsonia microphylla`)
- Velvet mesquite (`Prosopis velutina`)
- Creosote bush (`Larrea tridentata`)
- Ocotillo (`Fouquieria splendens`)
- Fishhook/Arizona barrel cactus (`Ferocactus wislizeni`)
- Engelmann prickly pear (`Opuntia engelmannii`)
- Chain-fruit/jumping cholla (`Cylindropuntia fulgida`)

These choices are biased toward plants that are visually recognizable and structurally important in Tucson-area desert scrub. Low-elevation desert scrub around Saguaro National Park is dominated by shrubs and succulents, with mesquite, palo verde, creosote, saguaro, barrel cactus, prickly pear, and cholla all common or defining.

The main realism rule: Tucson desert plants are not evenly sprinkled. They form life islands, clonal patches, nurse-plant clusters, wash corridors, slope bands, and rock-associated pockets.

## Core World Model

Each terrain cell should expose these fields to vegetation generation:

```ts
type SoilTexture =
  | "rock"
  | "gravel"
  | "sand"
  | "loam"
  | "clay"
  | "wash_alluvium";

interface Cell {
  elevation_m: number;
  slope_deg: number;
  aspect: number; // 0=N, 90=E, 180=S, 270=W
  soilTexture: SoilTexture;
  soilDepth_m: number;
  calicheDepth_m: number;
  rockCover_0_1: number;
  washDistance_m: number;
  runonIndex_0_1: number; // water concentrates here after rain
  frostRisk_0_1: number;
  recentRainDays: number;
  monsoonRain_0_1: number;
  winterRain_0_1: number;
  fireOrGrassDisturbance_0_1: number;
}
```

Generate vegetation in this order:

1. Landform pass: mark upper bajadas, rocky slopes, washes, lower flats, and sandy/alluvial flats.
2. Woody nurse pass: place foothill palo verde and velvet mesquite first.
3. Matrix shrub pass: place creosote on lower flats and bajadas with spacing inhibition.
4. Nursed cactus pass: place young saguaros under palo verde, mesquite, creosote, rocks, or other nurse shrubs.
5. Succulent accent pass: place ocotillo, barrel cactus, prickly pear, and cholla.
6. Clone/patch pass: expand cholla, prickly pear, and creosote into clonal or semi-clonal clusters.
7. Seasonal pass: toggle leaves, flowers, fruits, swelling/shrinking, deadwood, and post-rain flushes.

## 1. Saguaro

The saguaro is the signature plant of the Tucson/Sonoran Desert. It is most common in the Arizona Upland subdivision and belongs to the saguaro/yellow palo verde/velvet mesquite desert scrub alliance. It occurs most often on slopes, hillsides, upper bajadas, and along drainages in drier plains.

### Visual Model

```ts
interface Saguaro {
  height_m: Range<0.03, 15.0>;
  matureCommonHeight_m: Range<6, 10>;
  exceptionalHeight_m: Range<12, 15>;
  trunkDiameter_m: Range<0.30, 0.60>;
  ribCount: Range<12, 24>;
  branchCount: Range<0, 50>;
  commonBranchCount: Range<0, 8>;
  baseCorking: boolean; // age > 70
  flowerZone: "trunkTopAndArmTips";
}
```

Shape rules:

- Use a single vertical column with accordion-like vertical ribs.
- Represent 12-24 exterior ridges/grooves.
- Keep the trunk mostly straight, not lumpy.
- Taper and gray/cork the base on old plants.
- Expand radius by roughly 3-8% after monsoon rain; deepen grooves during drought.
- Place areoles in vertical rows along rib ridges.
- Use spine cards/noise clusters for realtime rendering except on hero assets.

Arm geometry:

```ts
interface SaguaroArm {
  spawnAge_yr: Range<50, 100>;
  spawnHeight_m: Range<2.4, 7.5>;
  initialDirection: number;
  horizontalOffset_m: Range<0.2, 0.7>;
  upwardCurve: "strong";
  armDiameterRatio: Range<0.45, 0.75>;
  tipRounds: true;
}
```

Use an S-curve: the arm emerges outward, then turns upward. Avoid perfectly symmetrical cartoon arms. Most saguaros should have 0-6 arms, with rare many-armed giants.

### Growth

Use a lookup curve rather than linear growth:

| Age | Height / stage |
| --- | --- |
| 0-8 yr | 0.025-0.038 m total height |
| 5-10 yr | 0.025-0.075 m |
| 20-40 yr | about 0.6 m |
| 35-70 yr | about 1.8-2.4 m |
| 50-100 yr | first arms possible |
| 125 yr | adult, often several meters tall |
| 150-200 yr | old giant |

Recommended growth formula:

```ts
growthRate =
  baseSlowGrowth *
  moistureMultiplier *
  nurseProtectionMultiplier_whileYoung *
  frostSurvivalMultiplier *
  firePenalty;
```

Recruitment should be episodic, not continuous. Population pulses can be separated by years, decades, or longer.

### Placement

```ts
saguaroSuitability =
  rockySlopeOrUpperBajada * 0.35 +
  shallowCoarseSoil * 0.20 +
  nurseOrRockAvailable * 0.30 +
  lowFrostRisk * 0.10 +
  washRunonBonus * 0.05;
```

Preferred sites:

- Lower rocky mountain slopes.
- Foothills, hillsides, mesas, and upper bajadas.
- Gravelly/coarse soils.
- Drainage corridors in dry lowlands.

Avoid cold high elevations and repeated fire zones. Saguaros generally occur below about 1,200 m, though they can occur higher on warm south-facing slopes.

### Neighbor Rules

Young saguaros should usually start under a nurse plant or nurse rock. Palo verde, velvet mesquite, creosote, triangle bursage, and rocks are documented nurse structures.

```ts
if (age < 15) requireNurseShadeOrRockShelter();
if (age < 50) placeWithinCanopy(nurse);
if (age > 70 && touchingNurseRootZone) nurseHealth -= slowCompetitionDamage;
```

Nurse placement should be non-uniform. Bias seedlings near the nurse base, especially under creosote. In colder marginal areas, bias young saguaros to the south side of nurse canopies because south-side microclimates are warmer.

## 2. Foothill / Yellow Palo Verde

Foothill palo verde is one of the most important Tucson-area nurse trees and should be placed early. It is common in the Tucson Mountain District and grows primarily on hillsides and upper bajadas.

### Visual Model

```ts
interface FoothillPaloVerde {
  height_m: Range<1.5, 6.0>; // rare to 10
  trunkCount: Range<2, 5>;
  mainStemBranchHeight_m: Range<0.10, 0.25>;
  crownShape: "open_irregular_umbrella";
  canopyRadius_m: Range<1.5, 5.0>;
  leafDensity: "lowUnlessRecentRain";
  barkColor: "green_yellow_green";
  leafState: "drought_deciduous";
}
```

Visual rules:

- Start as a multi-stemmed shrub/small tree, not a single straight trunk.
- Branch very low, often 10-25 cm from the ground.
- Keep the crown open, airy, and irregular.
- Use green/yellow-green bark and branches.
- Use tiny sparse leaves; avoid lush broadleaf-tree silhouettes.
- Add small yellow flowers in bloom season and slender seed pods after flowering.

### Growth and Season

```ts
if (recentRainDays < 20) {
  leafDensity = random(0.35, 0.75);
} else if (drought) {
  leafDensity = random(0.0, 0.15);
}

if (winterRainHigh || monsoonRainHigh) {
  enableFlowerOrSeedPulse();
}
```

Life stages:

- Juvenile: dense thorny shrub.
- Adult: open low-branching small tree.
- Old: irregular crown, dead inner twigs, nurse island beneath.
- Long-lived: up to several hundred years in ideal sites.

### Placement

```ts
paloVerdeSuitability =
  upperBajada * 0.35 +
  rockySlope * 0.25 +
  bimodalRain * 0.20 +
  coarseSoil * 0.15 +
  notClayFlat * 0.05;
```

Preferred sites:

- Hillsides.
- Mesas.
- Upper bajadas.
- Coarse rocky soils.
- Areas with both winter and summer precipitation.

### Neighbor Rules

Palo verde creates a life island:

```ts
underCanopy.light *= random(0.50, 0.75);
underCanopy.maxSoilTemp -= random(3, 8);
underCanopy.seedlingSurvival += high;
underCanopy.herbivoreProtection += medium;
underCanopy.nitrogenIsland += medium;
```

Place beneath mature palo verde:

- Young saguaros.
- Small barrel cacti.
- Prickly pear juveniles.
- Annual flower/grass flushes after rain.
- Dead nurse-tree remnants around large saguaros.

## 3. Velvet Mesquite

Velvet mesquite should define washes, floodplains, bosques, and deep-soil runon zones. In uplands, make it smaller and shrubbier. In washes, make it larger and tree-like.

### Visual Model

```ts
interface VelvetMesquite {
  height_m: Range<2, 15>; // 2-6 upland, 6-15 wash/floodplain
  trunkForm: "singleTree" | "multiStemShrub";
  canopyRadius_m: Range<2, 10>;
  bark: "dark_brown_rough_stripped";
  youngBranches: "greenish";
  thornPairs_cm: Range<0.6, 2.5>;
  flowers: "pale_yellow_catkins";
  seedPods_cm: Range<7.6, 20>;
}
```

Visual rules:

- Broad, irregular, open canopy.
- Dark rough strip-like bark on old trunks.
- Fine feathery gray-green leaf texture.
- Long pale yellow catkin flowers.
- Long tan/reddish pods hanging in clusters.
- Upland form: thorny multi-stemmed shrub.
- Wash form: broad single/multi-trunk tree.

### Growth and Water

```ts
if (topKilledByFireOrBrowsingOrCutting) {
  trunkForm = "multiStemShrub";
  basalSproutCount += randomInt(3, 12);
}

waterAccess = max(deepGroundwater, washRunon, floodplainSoilMoisture);
heightTarget_m = waterAccess > 0.7 ? random(8, 15) : random(2, 6);
```

Mesquite is a facultative phreatophyte with deep roots and lateral roots when deep moisture is unavailable.

### Placement

```ts
mesquiteSuitability =
  washDistanceClose * 0.40 +
  deepAlluvium * 0.25 +
  runonIndex * 0.20 +
  lowSlope * 0.10 +
  uplandScatterChance * 0.05;
```

Preferred sites:

- Washes.
- Drainage corridors.
- Floodplains.
- Deep alluvial soils.
- Scattered rocky desert scrub.

### Neighbor Rules

Mesquite is a large nurse/life-island tree:

```ts
underMesquite.shade = mediumToHigh;
underMesquite.soilMoisture += high;
underMesquite.nitrogen += high;
underMesquite.seedlingSurvival += high;
underMesquite.annualPlantDensity += highAfterRain;
```

## 4. Creosote Bush

Creosote is the background matrix shrub of many desert flats. It should create sparse, evenly spaced, resinous green-gray shrublands on lower bajadas, flats, sandy/alluvial soils, and caliche-influenced soils.

### Visual Model

```ts
interface CreosoteBush {
  height_m: Range<0.6, 2.5>; // rare to 4
  canopyRadius_m: Range<0.8, 2.5>;
  branchCount: "high";
  branchPattern: "many_brittle_upward_forks";
  leafPlacement: "dense_at_branch_tips";
  shadeCast: "low";
  flowerColor: "yellow";
  fruit: "small_fuzzy_pale_capsule";
  cloneRing: boolean;
}
```

Visual rules:

- Rounded shrub, not tree-like.
- Many thin brittle upward-angled branches.
- Leaves concentrated near twig ends.
- Tiny paired glossy/resinous leaves.
- Very low shade, even under full canopy.
- Yellow flowers after rain.
- Old plants can form irregular rings with dead interior branches.

### Growth and Roots

```ts
if (severeDrought) {
  innerBranchesDieback += random(0.2, 0.6);
}

if (rainReturns) {
  sproutAtOuterRootCrown();
  cloneRadius_m += random(0.02, 0.08);
}
```

Root profile:

```ts
rootProfile = {
  taprootDepth_m: 0.8,
  lateralRootLength_m: 3.0,
  lateralRootDepth_m: random(0.20, 0.35),
};
```

### Placement

```ts
creosoteSuitability =
  lowerBajadaOrFlat * 0.30 +
  sandyOrAlluvialOrCalcareousSoil * 0.25 +
  calichePresent * 0.15 +
  lowSlope * 0.15 +
  goodSoilOxygen * 0.10 -
  poorDrainagePenalty * 0.25;
```

Preferred sites:

- Gentle bajadas.
- Valley floors.
- Sandy/alluvial/calcareous soils.
- Caliche-influenced flats.
- Open low-shade desert.

Avoid fine, poorly drained, low-oxygen soils, dense wash bosques, and heavy shade.

### Neighbor Rules

Creosote should exert spacing inhibition:

```ts
creosoteHardcoreRadius_m = random(1.5, 3.5);
sameSpeciesOverlapAllowed = false; // unless clone ring is same individual
```

As a saguaro nurse, allow creosote but treat it as inferior:

```ts
if (nurseSpecies === "creosote") {
  saguaroSeedlingSurvival = lowToMedium;
  seedlingPosition = "veryNearBase";
}
```

## 5. Ocotillo

Ocotillo provides tall spiky wand clusters on rocky slopes and upper bajadas. It should be leafless most of the time, then suddenly green after rain.

### Visual Model

```ts
interface Ocotillo {
  caneCount: Range<6, 100>;
  height_m: Range<2, 9>;
  caneBaseRadius_cm: Range<2, 6>;
  canePattern: "basal_cluster_vase";
  caneCurve: "slight_outward_then_vertical";
  spineLength_cm: Range<0, 4>;
  leafLength_cm: Range<0, 5>;
  flowerColor: "scarlet_red_orange";
  flowerPosition: "caneTipsOnly";
}
```

Visual rules:

- All canes arise from a basal crown.
- Canes are long, thin, wand-like, and mostly unbranched.
- Plant shape is a fountain/vase of spiny rods.
- Leaves appear along canes only after rain, then drop.
- Scarlet flower clusters occur at cane tips.

### Growth and Season

```ts
if (recentRainDays <= 7) {
  leafFlush = true;
  leafDensity = random(0.5, 1.0);
} else if (drought) {
  leafDensity = 0.0;
}

annualLeafFlushes = rainPulseCount; // usually 0-5
flowerSeason = ["March", "April", "May"];
flowerDuration_days = random(50, 60);
```

### Placement

```ts
ocotilloSuitability =
  rockySlope * 0.35 +
  upperBajada * 0.25 +
  shallowWellDrainedSoil * 0.20 +
  southOrSoutheastAspect * 0.10 -
  lowClayPenalty;
```

Preferred sites:

- Rocky slopes.
- Mesas.
- Bajadas.
- Outwash plains.
- Shallow, well-drained soils, often caliche-influenced.
- Upper bajadas more than valley plains.

### Neighbor Rules

Ocotillo can coexist with saguaro, prickly pear, cholla, yucca, acacia, mesquite, and other desert scrub plants. Account for root-space and space competition:

```ts
if (chollaColonyDensityHigh) ocotilloRecruitment -= 0.25;
if (saguaroRootZoneOverlap) ocotilloGrowth -= random(0.05, 0.15);
```

## 6. Fishhook / Arizona Barrel Cactus

Use this as the solitary ribbed barrel accent cactus. It should appear on rocky/gravelly/sandy desert shrublands, slopes, flats, wash margins, and alluvial fans.

### Visual Model

```ts
interface FishhookBarrel {
  height_m: Range<0.3, 3.0>;
  diameter_m: Range<0.45, 0.83>;
  ribCount: Range<20, 28>;
  stemCount: 1;
  centralSpinesPerAreole: 4;
  radialSpinesPerAreole: Range<12, 20>;
  centralSpineLength_cm: Range<3.8, 10>;
  flowerPosition: "near_apex_ring";
  fruitColor: "yellow";
  leanDirection: "southwest_bias_on_old_plants";
}
```

Visual rules:

- Starts globular, becomes cylindrical/barrel-shaped.
- Usually solitary.
- Deep vertical ribs.
- Strong hooked central spines with red-gray/yellow-gray variation.
- Flowers and fruit appear at the top crown.
- Older plants often lean southwest/south.

### Growth

```ts
if (age > 40) {
  leanAngle_deg += random(0.1, 0.5); // toward southwest
}

if (leanAngle_deg > 35 && soilWetAfterStorm) {
  toppleChance += high;
}
```

Life stages:

- Age 0: sphere.
- Juvenile: short ribbed globe.
- Adult: vertical cylinder.
- Old: southwest lean, possible topple.

Lifespan estimate: about 50-130 years. Reproduces from seeds only.

### Placement

```ts
barrelSuitability =
  gravelOrRockOrSand * 0.30 +
  desertShrubland * 0.20 +
  washMarginOrAlluvialFan * 0.20 +
  openSun * 0.15 -
  frostRiskPenalty * 0.15;
```

Preferred sites:

- Rocky, gravelly, or sandy soils.
- Hills, flats, and canyons.
- Wash margins.
- Alluvial fans.
- Desert shrublands and desert grasslands.

### Neighbor Rules

```ts
minDistanceFromOtherBarrels_m = random(1.5, 4.0);
partialShadeForSeedlings = true;
adultFullSun = true;
```

Associated species include prickly pear/cholla, acacia, ocotillo, yucca, and saguaro.

## 7. Engelmann Prickly Pear

This is the broad-pad cactus clump. It should form spreading, trunkless or short-trunked thickets with yellow spring flowers and purple-red fruit.

### Visual Model

```ts
interface EngelmannPricklyPear {
  height_m: Range<0.8, 2.5>; // rare 3.5+
  clumpWidth_m: Range<1.5, 9.0>;
  trunk: "absent_or_short_woody_base";
  padLength_cm: Range<15, 40>;
  padWidth_cm: Range<12, 30>;
  padShape: "round_to_obovate";
  padColor: "green_to_bluegreen";
  spinesPerAreole: Range<0, 8>;
  flowerColor: "yellow_rare_orange_pink";
  fruitColor: "reddish_purple";
}
```

Visual rules:

- Pads are flat, oval/round, fleshy, and jointed.
- Clump is wider than tall.
- Mature plants often lack a central trunk.
- New pads are brighter green.
- Older lower pads can yellow, scar, cork, droop, or root where they touch soil.
- Flowers appear mainly on pad margins/upper pad edges.
- Fruit are purple-red tunas.

### Growth

Use a pad graph, not a cylinder/branch tree:

```ts
interface PadNode {
  parentPadId: string | null;
  age: number;
  orientationNormal: Vector3;
  scale: number;
  health: number;
  rootedIfTouchesGround: boolean;
}
```

Seasonal pad growth:

```ts
if (monsoonRainHigh || winterRainHigh) {
  for (const pad of healthyTerminalPads) {
    addNewPads(weightedRandom([0, 1, 2, 3]));
  }
}
```

Vegetative spread:

```ts
if (padTouchesGround && soilMoistureRecent) {
  rootChance = random(0.3, 0.8);
  createNewClumpFromPad();
}
```

### Placement

```ts
pricklyPearSuitability =
  openDesertScrub * 0.25 +
  gravelSandLoam * 0.20 +
  partialNurseShade * 0.15 +
  slopeOrWashEdge * 0.15 +
  animalDispersalPatch * 0.10 -
  lowFloodingPenalty;
```

Preferred sites:

- Desert scrub.
- Hillsides.
- Wash edges.
- Open sunny patches near shrubs.
- Gravelly, sandy, or loamy soils with drainage.

### Neighbor Rules

Prickly pear is useful for wildlife and habitat structure:

```ts
underOrBesideShrub.juvenileSurvival += medium;
largePricklyPearClump.smallAnimalShelter += high;
largePricklyPearClump.nearbySeedDispersal += medium;
```

## 8. Chain-Fruit / Jumping Cholla

This is the segmented, spiny, tree-like cholla that forms thickets and clonal colonies. It gives the desert a specific Sonoran look and should not be generated like a generic cactus.

### Visual Model

```ts
interface ChainFruitCholla {
  height_m: Range<1.5, 3.0>; // rare 3.7+
  trunkCount: Range<1, 4>;
  stemDiameter_cm: Range<0, 3.8>;
  jointLength_cm: Range<5, 15>;
  jointShape: "cylindrical_tuberculate";
  spineColor: "white_to_yellow_aging_gray";
  flowerColor: "vibrant_pink";
  fruitChains: true;
  fruitChainLength_cm: Range<0, 60>;
}
```

Visual rules:

- Tree-like or large shrub-like cactus.
- Low trunk or several trunks.
- Cylindrical segmented stems with pronounced tubercles.
- Dense white/yellow spines make the plant look pale/fuzzy.
- Fruits hang in long drooping green chains and can remain for years.
- Broken joints/fruits can root into new plants.

### Growth

Use a segmented branching graph:

```ts
interface ChollaSegment {
  length_cm: Range<5, 15>;
  radius_cm: Range<1.5, 2.0>;
  tubercleRows: "proceduralSpiral";
  age: number;
  detachable: true;
}
```

Branching:

```ts
for (const segment of terminalSegments) {
  if (random01() < moistureMapped(0.25, 0.65)) addSegment(segment);
  if (random01() < moistureMapped(0.10, 0.30)) branchSegment(segment);
}
```

Clonal spread:

```ts
if (animalBrushesOrWindEvent) {
  detachSegment();
  dropDistance_m = randomSkewed(0.2, 8.0);
  if (soilSuitable && recentRain) rootSegment();
}
```

### Placement

```ts
chollaSuitability =
  lowerBajadaOrValley * 0.25 +
  finerSoilsThanTeddyBearCholla * 0.20 +
  openSun * 0.20 +
  scrublandOrDesertFlat * 0.15 +
  clonalColonyProximity * 0.15;
```

Preferred sites:

- Lower bajadas.
- Valleys.
- Desert flats.
- Scrubland.
- Finer soils than teddy bear cholla.
- Open sun.

### Neighbor Rules

```ts
if (chollaColony) {
  excludeSmallShrubsInsideRadius();
  allowDeadWoodSkeletons();
  ocotilloRecruitment -= moderate;
}
```

Ocotillo competes for space with jumping cholla in Arizona upland vegetation.

## Density and Spacing Defaults

Use these as initial art/simulation defaults, then tune by scene scale.

| Species | Default spatial pattern | Starting spacing |
| --- | --- | --- |
| Saguaro | Sparse emergent columns; clustered around nurse plants and rocky slopes | 6-18 m between adults; seedlings under nurses |
| Foothill palo verde | Open nurse-tree patches on slopes/upper bajadas | 4-12 m |
| Velvet mesquite | Wash corridors, bosque clumps, scattered uplands | 5-20 m; dense along washes |
| Creosote | Evenly spaced shrub matrix; clonal rings in old stands | 1.5-4 m |
| Ocotillo | Scattered rocky-slope wand clusters | 3-10 m |
| Fishhook barrel | Solitary accents | 1.5-6 m |
| Engelmann prickly pear | Patchy clumps; spreading pads | 2-8 m between clumps |
| Chain-fruit cholla | Clonal colonies/thickets, especially flats/lower bajadas | 1-6 m inside colony; colonies separated by 10-50 m |

Saguaro density can vary widely, roughly from tens to hundreds of plants per hectare depending on site. Saguaro National Park bajada examples are around 102-154 individuals per hectare in cited studies. Palo verde density also varies strongly with substrate, with much higher density on some rocky slopes than on coarse alluvial flats.

## Seasonal State System

```ts
interface SeasonalState {
  postRainFlush: boolean; // recentRainDays <= 10
  monsoon: boolean; // Jul, Aug, Sep
  springBloom: boolean; // Mar, Apr, May
  preMonsoonDrought: boolean; // May, Jun
  winterCool: boolean; // Dec, Jan, Feb
}
```

Seasonal effects:

- Post-rain: ocotillo leafs out; palo verde leaves return; creosote brightens; annuals appear under nurse trees.
- Spring: palo verde flowers; ocotillo flowers; prickly pear flowers; saguaro flowers late spring.
- Early summer: saguaro fruits; prickly pear fruits begin later.
- Monsoon: cholla/prickly pear vegetative growth; barrel cactus flowers/fruits; many shrubs regain leaves.
- Drought: ocotillo leafless; palo verde sparse; creosote duller; saguaro ribs contract.

## Main Ecological Interactions

```ts
interface NursePlantEffect {
  shadeProtection: number; // lowers heat/frost stress
  herbivoreProtection: number; // improves seedling survival
  soilIsland: number; // raises water/nitrogen under canopy
  longTermCompetition: number; // older cactus may outcompete nurse
}
```

Critical interactions:

1. Palo verde and mesquite generate life islands. Boost small cactus/seedling survival beneath their canopies.
2. Saguaro seedlings require nurse plants or rocks. Do not let many baby saguaros spawn in open sun.
3. Saguaro eventually competes with its nurse. Large saguaros can be shown next to dead or declining palo verde/mesquite remnants.
4. Creosote forms spaced shrub matrices. It is not a lush nurse tree; it casts little shade and should create sparse open desert.
5. Cholla and prickly pear spread clonally/vegetatively. Detached cholla segments and grounded prickly pear pads can create new plants.
6. Ocotillo is rain-reactive. Its geometry should stay constant, but leaves should appear/disappear rapidly with rain state.

## Source Bundle

Keep using these references for procedural ecology decisions:

- USGS / Turner, Bowers & Burgess, *Sonoran Desert Plants: An Ecological Atlas* - broad distribution/ecology dataset for Sonoran plants.
- USDA Forest Service FEIS species reviews - species-by-species growth, habitat, regeneration, fire, and morphology summaries.
- NPS Saguaro National Park pages - Tucson-local growth and natural history references for saguaros, trees, shrubs, and cacti.
- Drezner 2006 and Drezner & Garrity 2003 - direct saguaro nurse-plant placement papers for spatial algorithms.

## TODO: Adapt Current Implementation To This Spec

The current implementation already has all eight target species, chunked worker generation, terrain hydrology fields, nurse/resource zones, LOD variants, material-level seasonal visibility, and species-specific placement filters. The remaining work is to make the ecological model explicit, correct the generation order, add missing terrain-cell fields, and turn current heuristic placement into the ordered landform/nurse/patch system described above.

### 1. Make terrain cells expose the full ecological state

- [x] Extend worker terrain sampling in `src/generationWorker.js` so `sampleInfo()` returns a stable ecological cell object, not only `height`, `slope`, `washProximity`, `washGravel`, `flowAccumulation`, `runoff`, `soilMoisture`, `shoulder`, `basin`, and `ridge`.
- [x] Add `elevation_m` to `sampleInfo()` as the same value currently exposed as `height`, but keep `height` as a compatibility alias until all filters have migrated.
- [x] Convert current slope magnitude to `slope_deg`; keep raw slope magnitude as `slope` for compatibility during migration.
- [x] Add `aspect` in degrees from the height gradient calculated in `sampleInfo()`. Use `0=N`, `90=E`, `180=S`, `270=W`; document this in code because world `z` orientation can be easy to misread.
- [x] Add `soilTexture` classification derived from terrain fields:
  - `wash_alluvium` when wash gravel/proximity and flow accumulation are high.
  - `rock` when shoulder/ridge/slope are high.
  - `gravel` on rocky upper bajadas, wash bars, and coarse slope toes.
  - `sand` on lower basin flats with low rock/wash signal.
  - `loam` on moderate basin/runon zones.
  - `clay` only in low-slope, low-oxygen, fine-soil pockets, and keep it rare.
- [x] Add `soilDepth_m` as a coarse proxy: shallow on rocky shoulders/slopes, medium on bajadas, deep in wash/floodplain/alluvial zones.
- [x] Add `calicheDepth_m` as a proxy: shallow on caliche-influenced lower bajada/flats, deeper/absent in active washes and rocky bedrock.
- [x] Add `rockCover_0_1` using `ridge`, `shoulder`, slope, boulder suitability, and gravel.
- [x] Add `washDistance_m` instead of only normalized `washProximity`; approximate from generated wash width/proximity if exact channel distance is not stored.
- [x] Add `runonIndex_0_1` as the canonical name for the existing flow/soil-moisture/runon signal.
- [x] Add `frostRisk_0_1`; start with a proxy using elevation, basin cold-air pooling, north aspect, low sun exposure, and lack of warm south-facing slope.
- [x] Add `fireOrGrassDisturbance_0_1`; start as a low-frequency noise field with higher values in grassier lower flats and disturbed wash margins.
- [x] Add `recentRainDays`, `monsoonRain_0_1`, and `winterRain_0_1` to the generation params and pass them into the worker so placement and geometry can share the same seasonal state.
- [x] Mirror the same ecological fields in `src/terrain.js` or remove the legacy terrain path if worker terrain is now the only active route; avoid divergent terrain semantics between main-thread and worker code.
- [x] Update terrain debug tooling or add a lightweight inspection overlay so cell classification can be checked at the cursor or camera target.

### 2. Introduce an explicit landform pass

- [x] Add a worker-side landform classifier before plant stages in `src/generationWorker.js`.
- [x] Store landform labels or scores for each sampled candidate: `rockySlope`, `upperBajada`, `wash`, `washMargin`, `lowerBajada`, `sandyAlluvialFlat`, `calicheFlat`, and `basinFlat`.
- [x] Replace repeated raw checks against `water.basin`, `water.shoulder`, `water.gravel`, `water.flow`, and `ctx.slope` with landform helper functions.
- [x] Keep the current hydrology data as the source of truth, but make species filters read from `ctx.cell` or `ctx.landform` so suitability formulas match the spec.
- [x] Add acceptance logging counters per landform per species so tuning can verify that species are ending up in the intended landscape bands.
- [x] Add a debug render mode that colors terrain by landform class using the existing `terrainDetail` path or a new optional vertex attribute.

### 3. Reorder vegetation generation to match ecological dependencies

- [x] Change `PHASES` and `stageDefs` in `src/generationWorker.js` from the current order:
  `paloVerde`, `mesquite`, `saguaro`, `barrel`, `jumpingCholla`, `pricklyPear`, `ocotillo`, `creosote`
  to:
  `paloVerde`, `mesquite`, `creosote`, `saguaro`, `ocotillo`, `barrel`, `pricklyPear`, `jumpingCholla`.
- [x] Treat the new creosote stage as the matrix shrub pass, before saguaro recruitment, so creosote can act as a weaker nurse and as spacing pressure.
- [x] Ensure `registerPlantZone()` can register creosote nurse zones separately from tree nurse zones, with lower shade/protection and lower root/island strength.
- [x] Split `state.nursePlants` into at least `treeNurses`, `shrubNurses`, and `rockNurses`, or add a `nurseQuality` field so young saguaros can distinguish palo verde/mesquite from creosote and rocks.
- [x] Keep `resourceZones` but add `resourceType` or richer `kind` metadata so filters can tell competition from nurse benefit.
- [x] Make boulders or rock pockets available before young saguaro placement, either by moving a coarse rock-nurse pass before saguaro or by deriving rock shelter directly from terrain `rockCover_0_1`.
- [x] Update progress labels and UI names to reflect the reordered ecology instead of simply the visual render order.

### 4. Replace heuristic filters with spec suitability functions

- [x] Create small suitability helpers in `src/generationWorker.js`, for example `saguaroSuitability(ctx, state)`, `paloVerdeSuitability(ctx, state)`, and so on.
- [x] Keep final stochastic acceptance, but compute it from named terms matching this doc: landform, soil texture/depth, nurse availability, frost risk, runon, fire/disturbance, and spacing pressure.
- [x] For saguaros, implement:
  - rocky slope/upper bajada score.
  - shallow coarse soil score.
  - nurse-or-rock availability score.
  - low frost risk score.
  - small wash runon bonus.
  - strong flood/wash-channel penalty.
- [x] For palo verde, implement:
  - upper bajada and rocky slope preference.
  - coarse soil preference.
  - bimodal rain bonus.
  - clay/poor-drainage penalty.
  - open tree spacing pressure.
- [x] For mesquite, implement:
  - wash-distance and wash-margin preference.
  - deep alluvium and runon preference.
  - low-slope preference.
  - upland scatter chance.
  - larger wash form metadata for geometry generation.
- [x] For creosote, implement:
  - lower bajada/flat preference.
  - sandy/alluvial/calcareous soil preference.
  - shallow caliche bonus.
  - low-slope and good-drainage preference.
  - poor drainage and heavy shade penalties.
  - same-species spacing inhibition.
- [x] For ocotillo, implement:
  - rocky slope and upper bajada preference.
  - shallow well-drained soil preference.
  - south/southeast aspect bonus.
  - clay and dense cholla-colony penalties.
- [x] For barrel cactus, implement:
  - gravel/rock/sand preference.
  - shrubland/open-sun preference.
  - wash-margin/alluvial-fan bonus.
  - frost risk penalty.
  - adult spacing from other barrels.
- [x] For prickly pear, implement:
  - open scrub preference.
  - gravel/sand/loam preference.
  - partial nurse shade bonus.
  - slope/wash-edge bonus.
  - low-flooding penalty.
  - clump/patch proximity behavior.
- [x] For jumping cholla, implement:
  - lower bajada/valley/desert-flat preference.
  - fine-but-drained soil preference.
  - open-sun preference.
  - clonal-colony proximity bonus.
  - exclusion pressure inside dense colony cores.

### 5. Add real spacing and patch data structures

- [x] Add species-specific spatial indexes in the worker so filters can query already accepted placements by species, not only coarse `resourceZones`.
- [x] Track accepted creosote positions and enforce a `1.5-3.5 m` hard-core radius, scaled by the current scene scale.
- [x] Track accepted barrel cactus positions and enforce `1.5-4.0 m` minimum spacing.
- [x] Track mature saguaro root/canopy zones separately from all saguaro placements so seedlings and mature plants can have different spacing rules.
- [x] Add cholla colony centers before individual cholla placement; place multiple chollas around colony centers with 1-6 m internal spacing and 10-50 m colony separation.
- [x] Add prickly pear patch centers; bias new clumps near existing clumps or animal-dispersal pockets rather than pure independent scatter.
- [x] Add creosote clone-ring metadata for old individuals: ring radius, dead interior amount, and outer sprout density.
- [x] Include deadwood/skeleton placeholders inside old cholla colonies and around large saguaros whose nurse trees have declined.
- [x] Keep all spatial structures chunk-safe: placements near chunk edges must use deterministic overlap padding or neighbor-aware generation so colonies do not visibly reset at chunk boundaries.

### 6. Improve nurse-plant and life-island behavior

- [x] Expand `registerPlantZone()` to include `shadeProtection`, `herbivoreProtection`, `soilIsland`, and `longTermCompetition`.
- [x] Encode palo verde as medium shade, medium nitrogen island, medium herbivore protection, high saguaro seedling survival.
- [x] Encode mesquite as medium-to-high shade, high soil moisture, high nitrogen, high annual plant density after rain.
- [x] Encode creosote as low shade, low-to-medium saguaro seedling survival, and seedling positions very near the base.
- [x] Encode rocks as shade/thermal shelters without soil nitrogen benefits.
- [x] For saguaro ages below the young threshold, require nurse shade or rock shelter except for rare failures/edge cases.
- [x] Bias young saguaro positions under the nurse canopy rather than merely accepting candidates that happen to be near a nurse.
- [x] In higher-frost or colder marginal cells, bias young saguaros to the south side of nurse canopies.
- [x] For mature saguaros overlapping a nurse root zone, reduce nurse health metadata and allow declining/dead nurse remnants to be generated near large saguaros.
- [x] Add annual/ephemeral post-rain plant hints under palo verde and mesquite life islands, even if implemented first as low-cost instanced ground flecks.

### 7. Make age and growth curves biologically legible

- [x] Replace the generic normalized saguaro `heightForAge()` curve in `src/proportions.js` and `createWorkerProportions()` with a lookup/interpolation curve based on the spec's age-height table.
- [x] Keep normalized `age` for geometry LOD compatibility, but add `ageYears` or a species-specific `growthStage` in variant opts.
- [x] Make saguaro recruitment episodic by adding cohort years or cohort noise bands; avoid smooth continuous age distribution for all chunks.
- [x] Re-map saguaro arms from normalized age to the `50-100 yr` first-arm window and keep most plants in the `0-6` arm range, with rare many-armed giants.
- [x] Add monsoon hydration to saguaro geometry: radius expands by roughly `3-8%` after strong monsoon rain, and groove/rib depth increases during drought.
- [x] Add old saguaro base corking for plants above the old-age threshold; current woody-base behavior should be checked against the `age > 70 yr` visual rule.
- [x] Add barrel cactus age stages: globe juvenile, adult barrel cylinder, old leaning barrel, and toppling risk metadata.
- [x] Bias old barrel lean toward southwest/south instead of the current random tilt direction.
- [x] Add palo verde, mesquite, creosote, ocotillo, prickly pear, and cholla stage metadata so geometry can distinguish juvenile, adult, and old forms without relying only on normalized `age`.

### 8. Wire seasonal state through generation and materials

- [x] Replace ad hoc flowering booleans with a shared `SeasonalState` object derived in `src/main.js` and sent to `src/generationWorker.js`.
- [x] Include `postRainFlush`, `recentRainDays`, `monsoon`, `springBloom`, `preMonsoonDrought`, `winterCool`, `monsoonRain_0_1`, and `winterRain_0_1`.
- [x] Fix worker params in `requestTerrainChunk()` where `paloVerdeFlowering` and `ocotilloFlowering` are currently forced to `true`; pass the seasonal values from `params`.
- [x] Add `creosoteFlowering`, `creosoteRainFlush`, `ocotilloLeafFlush`, `paloVerdeLeafDensity`, `saguaroHydration`, `barrelFlowering`, `pricklyPearFlowering`, `pricklyPearFruiting`, and `chollaFruitChains` to generation or material state as appropriate.
- [x] Decide which seasonal effects require regeneration and which can be material toggles. Geometry-changing effects such as ocotillo leaves, flower meshes, fruit meshes, new pads, and clone sprouts likely need regeneration or prebuilt hidden geometry.
- [x] Update `deriveSeasonalPlantState()` in `src/main.js` so spring bloom, early-summer fruit, monsoon growth, winter rain, and drought are not represented only by three flowering flags.
- [x] Add post-rain ocotillo leaf density along canes; ocotillo should be leafless most of the time.
- [x] Add palo verde drought-deciduous leaf density changes; it should not always read as equally leafy.
- [x] Add creosote rain brightening and yellow flowers after favorable rain.
- [x] Add saguaro late-spring flowers and early-summer red fruit as separate, seasonally correct states.
- [x] Add barrel cactus crown flowers/fruits in warm/monsoon season.
- [x] Add prickly pear spring flowers and red-purple tunas.
- [x] Add cholla persistent green fruit chains that can remain visible outside a narrow flowering window.

### 9. Tighten each plant generator against the visual models

- [x] `src/plants/saguaro.js`: verify trunk stays mostly straight and columnar, with 12-24 exterior ribs as the common range.
- [x] `src/plants/saguaro.js`: make arm count distribution rare above 8 arms but allow exceptional high-arm variants for old giants.
- [x] `src/plants/saguaro.js`: ensure areoles/spine rows align with rib ridges and remain readable at near LOD.
- [x] `src/plants/paloVerde.js`: keep branch origins very low, around `10-25 cm` equivalent in scene scale, and avoid single straight tree silhouettes.
- [x] `src/plants/paloVerde.js`: add sparse tiny leaves and make yellow-green bark carry most of the visual mass during drought.
- [x] `src/plants/paloVerde.js`: add slender post-flowering seed pods as a seasonal option.
- [x] `src/plants/mesquite.js`: distinguish wash/floodplain tree form from upland shrubby form using placement metadata.
- [x] `src/plants/mesquite.js`: make old trunks rough, dark, and strip-like; keep young branches greenish.
- [x] `src/plants/mesquite.js`: add pale yellow catkins separate from seed pods if spring bloom is enabled.
- [x] `src/plants/creosote.js`: emphasize many thin brittle upward forks and leaf clusters at branch tips.
- [x] `src/plants/creosote.js`: add old clone-ring/dead-interior form, not only single rounded shrubs.
- [x] `src/plants/ocotillo.js`: support cane counts up to high-density old plants while keeping LOD budgets reasonable.
- [x] `src/plants/ocotillo.js`: add leaves along canes as seasonal cards/points controlled by `postRainFlush`.
- [x] `src/plants/barrelCactus.js`: constrain common ribs to `20-28` for fishhook barrel while allowing slight variation.
- [x] `src/plants/barrelCactus.js`: add hooked central spine emphasis in the cactus spine material/detail data.
- [x] `src/plants/pricklyPear.js`: keep the model pad-graph based, with clumps wider than tall and grounded/drooping older pads.
- [x] `src/plants/pricklyPear.js`: add vegetative rooting metadata or visible rooted lower pads where pads touch soil.
- [x] `src/plants/jumpingCholla.js`: reinforce cylindrical tuberculate joints, pale dense spine sheath, and low trunk/tree-like form.
- [x] `src/plants/jumpingCholla.js`: add detachable segment litter and rooted nearby segments for clonal spread.

### 10. Update proportions and scene scale defaults

- [x] Review `PROPORTION_RATIOS` in `src/proportions.js` against the metric ranges in this spec and document the scene-scale conversion.
- [x] Add species-level helpers for common height ranges, canopy radii, root radii, and minimum spacings so worker and main-thread code do not duplicate ratios.
- [x] Move the worker-local `createWorkerProportions()` values toward shared constants or generate a serializable proportion object in `src/proportions.js`.
- [x] Re-tune default densities in `src/main.js` after new spacing/patch rules land; current density values compensate for heuristic rejection and will likely be too high or too low after deterministic patching.
- [x] Add a density preset for "Tucson upland bajada" using saguaro, palo verde, mesquite, creosote, barrel, prickly pear, cholla, and ocotillo proportions from this doc.
- [x] Add a second preset for "wash corridor" so mesquite/palo verde and nurse-island behavior can be tested in a water-concentrating scene.
- [x] Keep GUI density controls, but label them as art multipliers once ecological density presets exist.

### 11. Preserve performance while adding ecology

- [x] Keep suitability evaluation allocation-free inside scatter loops.
- [ ] Avoid per-candidate `Vector3`/object allocations in the worker; use plain numbers and cached arrays where possible.
- [x] Use deterministic hash/grid spatial indexes for spacing queries instead of scanning all placed plants once densities increase.
- [x] Limit detailed clone expansion to near and mid LOD, with far LOD represented by simpler instanced silhouettes.
- [ ] Precompute landform/hydrology fields once per chunk and sample bilinearly, as current terrain does.
- [x] Add performance counters for candidate rejection reason, not just attempts/placed, so expensive filters can be tuned.
- [x] Make chunk edge padding configurable and measure its cost before adding neighbor-aware colony generation.

### 12. Add validation and debug views

- [x] Add a deterministic generation smoke test that runs one chunk with a fixed seed and asserts all eight species place at least one candidate under normal defaults.
- [ ] Add placement distribution tests for each species:
  - mesquite median wash distance should be lower than creosote median wash distance.
  - ocotillo should skew toward rocky slopes/upper bajadas.
  - creosote should skew toward lower flats and avoid high-moisture washes.
  - young saguaros should mostly have a nurse or rock shelter.
  - cholla should show clustered nearest-neighbor distances instead of pure uniform scatter.
- [x] Add a no-overlap/spacing test for creosote hard-core spacing and barrel cactus spacing.
- [x] Add snapshot-style JSON debug output from the worker for one chunk: landform counts, species counts, median suitability terms, and rejection reasons.
- [x] Add a visual debug overlay that can toggle:
  - landform class.
  - soil texture.
  - runon index.
  - frost risk.
  - nurse zones.
  - resource/competition zones.
  - clone colony centers.
- [x] Add a short manual QA checklist for camera-level inspection: wash corridor, upper bajada, lower flat, nurse island, cholla colony, creosote matrix, old saguaro/nurse remnant.

Manual QA checklist:

- Enable full controls, set Terrain -> debug shading to `landform`, and verify the target-cell overlay changes as the camera moves across wash, wash-margin, upper-bajada, rocky-slope, lower-bajada, caliche-flat, sandy-flat, and basin-flat bands.
- Toggle General -> `log debug JSON`, regenerate, and verify each loaded chunk logs `[desert-debug]` with nonzero terrain landform counts, species counts, rejection reasons, accepted landforms, and median suitability values for plant stages.
- In a wash corridor, verify mesquite is visibly more common than creosote inside or beside the wash, with palo verde/mesquite nurse islands supporting cactus juveniles nearby.
- On upper bajada or rocky slope bands, verify palo verde, saguaros, ocotillo, barrels, and prickly pear appear more often than mesquite/creosote matrix shrubs.
- On lower flats, verify creosote reads as a sparse, spaced matrix and jumping cholla forms clustered colonies rather than uniform scatter.
- Inspect at least one mature/old saguaro beside a nurse canopy or remnant area, checking that young saguaros are not mostly in open, exposed flats.
- Scrub time of year through spring, pre-monsoon drought, monsoon, and post-rain states and verify ocotillo leaves, palo verde leaf density, flowers, fruit, and rain-flush materials change coherently.

### 13. Suggested implementation sequence

- [x] Phase A: Add `cell`/landform fields to worker terrain sampling while preserving existing filters.
- [x] Phase B: Reorder stages and register creosote as a weak shrub nurse before saguaros.
- [x] Phase C: Replace saguaro, palo verde, mesquite, and creosote filters with named suitability formulas.
- [x] Phase D: Add spacing indexes for creosote, barrel cactus, mature saguaros, and trees.
- [x] Phase E: Add cholla colonies, prickly pear patches, and creosote clone rings.
- [x] Phase F: Wire shared seasonal state from `src/main.js` to worker generation and materials.
- [x] Phase G: Update individual plant generators for the missing high-value visual traits.
- [ ] Phase H: Add debug overlays and deterministic distribution tests.
- [ ] Phase I: Re-tune defaults and density presets after ecological placement is stable.
