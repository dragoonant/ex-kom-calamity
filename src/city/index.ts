// The city engine (docs/spec/20-city.md). Pure functions over plain-JSON state; no DOM, three.js or React (CARCH-8).
export type * from './types';
export { CITY_SIDES, BANDS, SLIP_KINDS } from './types';
export { createCity, mergeCityTuning } from './game';
export { cityStep } from './step';
export { cityLegalActions } from './legal';
export { cityView } from './view';
export { cityQuery } from './query';
export { advanceCity, advanceCityTicks } from './advance';
export { replayCity, hashCity, appendCityLog, expandCityLog } from './replay';
export { buildingUnder, launchBlock, craftCost, dist } from './air';
export { clockOf, ticksPerHour, ticksPerDay, isNightHour } from './time';
export { bandOf, hostilesFor, winChance, downChance, grantOf, totalInfiltration, sourceOrg, orgOfBuilding, buildingDef, projectDef, researchBlock, hasDone, compositionFor, itemCost, supplierOrg, working } from './rules';
