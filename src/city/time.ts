// CLOCK-1, CLOCK-2: the city clock in ticks. Pure helpers over the tuning.
import type { CityTuning } from './types';

export function ticksPerHour(t: CityTuning): number {
  return Math.floor(60 / t.clock.minutesPerTick);
}

export function ticksPerDay(t: CityTuning): number {
  return ticksPerHour(t) * 24;
}

/** Ticks elapsed since midnight of day 0 (the clock starts at clock.startHour). */
export function absoluteTicks(t: CityTuning, tick: number): number {
  return tick + t.clock.startHour * ticksPerHour(t);
}

export interface Clock {
  tick: number;
  day: number;
  month: number;
  dayOfMonth: number;
  hour: number;
  minute: number;
  night: boolean;
}

export function clockOf(t: CityTuning, tick: number): Clock {
  const abs = absoluteTicks(t, tick);
  const tpd = ticksPerDay(t);
  const day = Math.floor(abs / tpd);
  const inDay = abs - day * tpd;
  const hour = Math.floor(inDay / ticksPerHour(t));
  const minute = (inDay - hour * ticksPerHour(t)) * t.clock.minutesPerTick;
  return {
    tick,
    day,
    month: Math.floor(day / t.clock.daysPerMonth),
    dayOfMonth: day % t.clock.daysPerMonth,
    hour,
    minute,
    night: isNightHour(t, hour),
  };
}

/** CLOCK-5 */
export function isNightHour(t: CityTuning, hour: number): boolean {
  return hour >= t.clock.nightStartHour || hour < t.clock.nightEndHour;
}
