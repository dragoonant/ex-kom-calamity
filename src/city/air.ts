// The air war (docs/spec/20-city.md section 20, AIR; PLAN D24 b): the organism's craft cross the city on the hour,
// the agency's flying cars intercept them, and where a craft falls decides the next battle. Pure helpers over a
// cloned state; step.ts calls them.
import { CITY } from '../data/city';
import { nextInt } from '../engine/rng';
import { orgOf } from './rules';
import { clockOf, ticksPerHour } from './time';
import type { Car, CityEvent, CityState, Craft, CraftKind, Slip } from './types';

export function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((ax - bx) ** 2 + (ay - by) ** 2);
}

/** AIR-1: moves (x, y) toward (tx, ty) by at most `speed` tenths, in integers. Returns true on arrival. */
function moveToward(p: { x: number; y: number }, tx: number, ty: number, speed: number): boolean {
  const d = dist(p.x, p.y, tx, ty);
  if (d <= speed) {
    p.x = tx;
    p.y = ty;
    return true;
  }
  p.x += Math.round(((tx - p.x) * speed) / d);
  p.y += Math.round(((ty - p.y) * speed) / d);
  return false;
}

/** AIR-6: the building under a point, if any (a lot is its cell). */
export function buildingUnder(x: number, y: number): string | null {
  const cx = Math.floor(x / 10);
  const cy = Math.floor(y / 10);
  return CITY.buildings.find((b) => b.x === cx && b.y === cy)?.id ?? null;
}

export function craftCost(s: CityState, kind: CraftKind): number {
  return kind === 'scout' ? s.tuning.air.scoutCost : kind === 'seeder' ? s.tuning.air.seederCost : s.tuning.act.carrierCost;
}

function speedOf(s: CityState, kind: CraftKind): number {
  return kind === 'scout' ? s.tuning.air.scoutSpeed : kind === 'seeder' ? s.tuning.air.seederSpeed : s.tuning.act.carrierSpeed;
}

/** AIR-2: why the organism cannot launch now, or null. */
export function launchBlock(s: CityState, kind: CraftKind, target: string): string | null {
  if (clockOf(s.tuning, s.tick).day < s.tuning.air.startDay) return 'the organism has no craft yet';
  if (s.tick < s.hostileLaunchTick) return 'the organism is not ready to launch';
  if (kind === 'carrier' && s.act < 3) return 'carriers fly only in act 3'; // ACT-5
  if (s.biomass < craftCost(s, kind)) return 'not enough biomass';
  if (!CITY.buildings.some((b) => b.id === target)) return `no building ${target}`;
  return null;
}

/** AIR-2: a craft enters from a city edge chosen by the engine's dice and heads for its target's cell. */
export function launch(s: CityState, kind: CraftKind, target: string, events: CityEvent[]): void {
  const a = s.tuning.air;
  const def = CITY.buildings.find((b) => b.id === target)!;
  const edge = nextInt(s.rng, 4);
  const along = nextInt(s.rng, CITY.size * 10 + 1);
  const max = CITY.size * 10;
  const [x, y] = edge === 0 ? [along, 0] : edge === 1 ? [max, along] : edge === 2 ? [along, max] : [0, along];
  const hp = kind === 'scout' ? a.scoutHp : kind === 'seeder' ? a.seederHp : s.tuning.act.carrierHp;
  const c: Craft = { id: `craft${s.nextCraft++}`, kind, x, y, tx: def.x * 10 + 5, ty: def.y * 10 + 5, target, hp, maxHp: hp, posture: 'press' };
  s.craft.push(c);
  s.biomass -= craftCost(s, kind);
  s.hostileLaunchTick = s.tick + (s.act >= 2 ? s.tuning.act.launchEveryHours : a.launchEveryHours) * ticksPerHour(s.tuning); // ACT-2
  events.push({ type: 'launched', craft: c.id, kind, x, y });
}

function carsOn(s: CityState, craftId: string): Car[] {
  return s.cars.filter((c) => c.status === 'flying' && c.craft === craftId);
}

function sendHome(car: Car, s: CityState): void {
  car.craft = null;
  // AIR-5: a damaged car goes to the hangar; a sound one is ready at once (it flies home off the books).
  if (car.hp < s.tuning.air.carHp) {
    car.status = 'repair';
    car.until = s.tick + s.tuning.air.repairHours * ticksPerHour(s.tuning);
  } else car.status = 'ready';
  car.x = CITY.agency.hq.x * 10 + 5;
  car.y = CITY.agency.hq.y * 10 + 5;
}

function pushSlip(s: CityState, slip: Omit<Slip, 'id' | 'tick'>, events: CityEvent[]): void {
  const full: Slip = { id: s.nextSlip++, tick: s.tick, ...slip };
  s.slips.push(full);
  if (s.slips.length > s.tuning.signs.keep) s.slips.splice(0, s.slips.length - s.tuning.signs.keep);
  events.push({ type: 'slip', slip: full });
}

/** AIR-3..7: one hour of the air war, in this order: cars close, dogfights, craft move and land, crashes scatter, repairs. */
export function airHour(s: CityState, events: CityEvent[]): void {
  const a = s.tuning.air;
  // AIR-3: cars fly toward their craft.
  for (const car of s.cars) {
    if (car.status !== 'flying' || !car.craft) continue;
    const c = s.craft.find((x) => x.id === car.craft);
    if (!c) {
      sendHome(car, s);
      events.push({ type: 'carBack', car: car.id });
      continue;
    }
    moveToward(car, c.x, c.y, a.carSpeed);
  }
  // AIR-4: dogfights with cars in range and pressing.
  for (const c of [...s.craft]) {
    const engaged = carsOn(s, c.id).filter((car) => dist(car.x, car.y, c.x, c.y) <= a.engageRange);
    if (engaged.length === 0 || c.posture !== 'press') continue;
    const rolls: number[] = [];
    let hits = 0;
    for (let i = 0; i < engaged.length; i++) {
      const r = nextInt(s.rng, 100);
      rolls.push(r);
      if (r < a.carHitPercent) hits += 1;
    }
    c.hp = Math.max(0, c.hp - hits * a.carDamage);
    const carsHit: string[] = [];
    if (c.kind !== 'scout') {
      const dmg = c.kind === 'carrier' ? Math.floor((a.craftDamage * s.tuning.act.carrierDamagePercent) / 100) : a.craftDamage;
      for (const car of engaged) {
        const r = nextInt(s.rng, 100);
        rolls.push(r);
        if (r < a.craftHitPercent) {
          car.hp = Math.max(0, car.hp - dmg);
          carsHit.push(car.id);
          if (car.hp === 0) {
            car.status = 'lost';
            car.craft = null;
            events.push({ type: 'carLost', car: car.id });
          }
        }
      }
    }
    events.push({ type: 'dogfight', craft: c.id, craftHp: c.hp, hits, carsHit, rolls });
    if (c.hp === 0) {
      // AIR-6: it falls where it is.
      const building = buildingUnder(c.x, c.y);
      const crashId = `crash${c.id.slice(5)}`;
      s.crashes.push({ id: crashId, kind: c.kind, x: c.x, y: c.y, building, survivors: c.kind === 'seeder' ? a.seederSurvivors : c.kind === 'carrier' ? s.tuning.act.carrierSurvivors : a.scoutSurvivors, until: s.tick + a.crashHours * ticksPerHour(s.tuning) });
      s.craft = s.craft.filter((x) => x.id !== c.id);
      events.push({ type: 'downed', craft: c.id, kind: c.kind, x: c.x, y: c.y, building, crash: crashId });
      if (building) {
        const def = CITY.buildings.find((b) => b.id === building)!;
        const o = orgOf(s, def.org);
        if (o) o.standing = Math.max(0, o.standing - a.crashStanding);
        const before = s.confidence;
        s.confidence = Math.max(0, s.confidence - a.crashConfidence);
        if (s.confidence !== before) events.push({ type: 'confidence', delta: s.confidence - before, why: 'a craft fell on a building' });
      }
      for (const car of carsOn(s, c.id)) {
        sendHome(car, s);
        events.push({ type: 'carBack', car: car.id });
      }
    }
  }
  // AIR-2: craft move; a seeder that reaches its target lands and seeds it; a scout turns away.
  for (const c of [...s.craft]) {
    if (!moveToward(c, c.tx, c.ty, speedOf(s, c.kind))) {
      // ACT-4: a scout passing near headquarters from act 2 finds it.
      if (c.kind === 'scout' && s.act >= 2 && !s.hqFound && dist(c.x, c.y, CITY.agency.hq.x * 10 + 5, CITY.agency.hq.y * 10 + 5) <= s.tuning.act.hqScoutRange) {
        s.hqFound = true;
        events.push({ type: 'hqFound', craft: c.id });
        pushSlip(s, { kind: 'found', building: null, org: null, district: null, genuine: true }, events);
      }
      continue;
    }
    s.craft = s.craft.filter((x) => x.id !== c.id);
    const def = CITY.buildings.find((b) => b.id === c.target)!;
    if (c.kind !== 'scout') {
      const o = orgOf(s, def.org);
      const before = o?.infiltration ?? 0;
      if (o) o.infiltration = Math.min(s.tuning.spread.cap, o.infiltration + (c.kind === 'carrier' ? s.tuning.act.carrierAmount : a.seederAmount));
      events.push({ type: 'landed', craft: c.id, kind: c.kind, building: def.id, amount: (o?.infiltration ?? 0) - before });
      pushSlip(s, { kind: 'landing', building: def.id, org: def.org, district: def.district, genuine: true }, events);
    } else events.push({ type: 'landed', craft: c.id, kind: c.kind, building: def.id, amount: 0 });
    for (const car of carsOn(s, c.id)) {
      sendHome(car, s);
      events.push({ type: 'carBack', car: car.id });
    }
  }
  // AIR-7: survivors of an unraided crash scatter into the nearest organisation.
  for (const cr of [...s.crashes]) {
    if (s.tick < cr.until || (s.raid && s.raid.building === cr.id)) continue;
    s.crashes = s.crashes.filter((x) => x.id !== cr.id);
    let best: (typeof CITY.buildings)[number] | null = null;
    for (const b of CITY.buildings) if (!best || dist(b.x * 10 + 5, b.y * 10 + 5, cr.x, cr.y) < dist(best.x * 10 + 5, best.y * 10 + 5, cr.x, cr.y)) best = b;
    const o = best ? orgOf(s, best.org) : undefined;
    const amount = cr.survivors * a.scatterPerSurvivor;
    if (o) o.infiltration = Math.min(s.tuning.spread.cap, o.infiltration + amount);
    events.push({ type: 'scattered', crash: cr.id, org: o?.id ?? null, amount });
  }
  // AIR-5: repairs finish.
  for (const car of s.cars) {
    if (car.status === 'repair' && s.tick >= car.until) {
      car.status = 'ready';
      car.hp = a.carHp;
      car.until = 0;
    }
  }
}
