const day = new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const short = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const long = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

const at = (key: string) => new Date(`${key}T12:00:00Z`);

/** 'Mon 23 Nov'. A day key is already a local calendar day, so the formatter works in UTC to avoid shifting it. */
export const dayLabel = (key: string): string => (Number.isNaN(at(key).getTime()) ? key : day.format(at(key)));
/** '23 Nov'. */
export const shortDate = (key: string): string => (Number.isNaN(at(key).getTime()) ? key : short.format(at(key)));
/** 'Monday 23 November 2026'. */
export const longDate = (key: string): string => (Number.isNaN(at(key).getTime()) ? key : long.format(at(key)));
