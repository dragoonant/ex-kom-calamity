// Typed registry over the city data (docs/spec/20-city.md). Keys starting with "_" are comments and are stripped.
import tuningJson from './tuning.json';
import cityJson from './city.json';
import researchJson from './research.json';

export interface CityTuning {
  clock: { minutesPerTick: number; ticksPerSecond: number; daysPerMonth: number; startHour: number; nightStartHour: number; nightEndHour: number };
  spread: { startBiomass: number; sourceStart: number; actEveryHours: number; seedCost: number; seedAmount: number; dailyGrowthPercent: number; biomassPer100Points: number; lobbyAt: number; turnAt: number; cap: number; sourceFloor: number };
  signs: { permillePerPoint: number; noisePermille: number; keep: number; missingMin: number; purchaseMin: number; powerMin: number; perfectMin: number; voteMin: number; humMin: number };
  watch: { hours: number; accuracyPercent: number; spotPercent: number };
  travel: { speedTenthsPerHour: number };
  raid: { maxAgents: number; hostilesPer10Points: number; maxHostiles: number; turnedGuards: number; takersAt: number; fightersAt: number };
  res: { winBasePercent: number; winPerAgent: number; winPerHostile: number; winMinPercent: number; winMaxPercent: number; downPerHostilePercent: number; downOnLossPercent: number; downMaxPercent: number; cleansePerHostile: number; cleanseOnWin: number };
  roster: { startAgents: number; cap: number; woundDays: number; deathPercent: number; recruitCost: number; salaryPerMonth: number };
  fund: { startMoney: number; startConfidence: number; grantBase: number; lobbyCutPercent: number; turnedCutPercent: number; winGain: number; scandalLoss: number; civilianLoss: number; agentLoss: number; missingPer100Points: number };
  end: { confidenceFloor: number; turnedLosePercent: number; containedTotal: number; actDays: number };
  lab: { capturePerRaid: number; tellsAccuracy: number; scannerAccuracy: number; scannerSpot: number; antiserumDeathPercent: number; evacuationCivilianPercent: number };
  air: { startDay: number; launchEveryHours: number; scoutCost: number; seederCost: number; scoutSpeed: number; seederSpeed: number; scoutHp: number; seederHp: number; carSpeed: number; carHp: number; carHitPercent: number; carDamage: number; craftHitPercent: number; craftDamage: number; engageRange: number; startCars: number; carCap: number; carCost: number; repairHours: number; seederAmount: number; crashStanding: number; crashConfidence: number; seederSurvivors: number; scoutSurvivors: number; crashHours: number; crashCores: number; scatterPerSurvivor: number };
  shop: { plateCost: number; plateHours: number; carbineCost: number; carbineHours: number; supplierPricePercent: number; supplierHours: number; sabotageAt: number; sabotageBiomassPercent: number; plateWin: number; plateDownCutPercent: number; carbineWin: number };
}

export type Evidence = 'host' | 'taker' | 'fighter' | 'core' | 'liveHost' | 'liveTaker';
export const EVIDENCE: Evidence[] = ['host', 'taker', 'fighter', 'core', 'liveHost', 'liveTaker'];
export interface ProjectDef { id: string; name: string; branch: string; needs?: Partial<Record<Evidence, number>>; consumes?: Partial<Record<Evidence, number>>; requires?: string[]; hours: number }
export interface ItemDef { id: 'shell-plate' | 'arc-carbine'; name: string; design: string }

export type RaidSite = 'automat' | 'depot' | 'savings';
export const RAID_SITE_BATTLES: Record<RaidSite, string> = { automat: 'automat-raid', depot: 'depot-raid', savings: 'savings-raid' };
export const BUILDING_KINDS = ['civic', 'office', 'bank', 'broadcast', 'automat', 'depot', 'residential', 'power', 'works'] as const;
export type BuildingKind = (typeof BUILDING_KINDS)[number];

export interface DistrictDef { id: string; name: string; x: number; y: number; w: number; d: number }
export interface OrgDef { id: string; name: string; kind: string; source?: boolean }
export interface BuildingDef { id: string; name: string; org: string; district: string; x: number; y: number; floors: number; kind: BuildingKind; site: RaidSite }
export interface CityDef {
  size: number;
  districts: DistrictDef[];
  orgs: OrgDef[];
  buildings: BuildingDef[];
  agency: { hq: { name: string; x: number; y: number }; names: string[] };
}

function strip<T>(o: T): T {
  if (Array.isArray(o)) return o.map(strip) as T;
  if (o && typeof o === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(o)) if (!k.startsWith('_')) out[k] = strip(v);
    return out as T;
  }
  return o;
}

export const CITY_TUNING: CityTuning = strip(tuningJson) as unknown as CityTuning;
export const CITY: CityDef = strip(cityJson) as unknown as CityDef;
export const RESEARCH: { projects: ProjectDef[]; items: ItemDef[] } = strip(researchJson) as unknown as { projects: ProjectDef[]; items: ItemDef[] };
