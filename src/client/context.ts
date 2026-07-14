import { dayPartFromHour, inferOccasion } from '../shared/scoring';
import type { DailyContext, UserPreferences, WeatherContext } from '../shared/types';

function position(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocation unavailable'));
    navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 6_000, maximumAge: 600_000 });
  });
}

function hourInTimezone(timezone: string): number {
  return Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(new Date()));
}

function dateInTimezone(timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

async function directWeather(latitude: number, longitude: number): Promise<WeatherContext> {
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    current: 'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code',
    daily: 'precipitation_probability_max',
    forecast_days: '1',
    timezone: 'auto',
  });
  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!response.ok) throw new Error('Weather unavailable');
  const data = await response.json() as {
    current: { temperature_2m: number; apparent_temperature: number; relative_humidity_2m: number; weather_code: number };
    daily: { precipitation_probability_max: number[] };
  };
  return {
    temperatureC: data.current.temperature_2m,
    apparentTemperatureC: data.current.apparent_temperature,
    humidity: data.current.relative_humidity_2m,
    rainProbability: data.daily.precipitation_probability_max[0] || 0,
    weatherCode: data.current.weather_code,
    source: 'live',
    observedAt: new Date().toISOString(),
  };
}

async function weather(latitude: number, longitude: number): Promise<WeatherContext> {
  try {
    const response = await fetch(`/api/weather?latitude=${latitude}&longitude=${longitude}`);
    if (!response.ok) throw new Error('API weather unavailable');
    return await response.json() as WeatherContext;
  } catch {
    return directWeather(latitude, longitude);
  }
}

export async function buildDailyContext(preferences: UserPreferences): Promise<DailyContext> {
  let latitude = preferences.defaultLatitude;
  let longitude = preferences.defaultLongitude;
  try {
    const current = await position();
    latitude = current.coords.latitude;
    longitude = current.coords.longitude;
  } catch {
    // The saved default is deliberately used when location permission is unavailable.
  }
  let currentWeather: WeatherContext;
  try {
    currentWeather = await weather(latitude, longitude);
  } catch {
    currentWeather = {
      temperatureC: 30,
      apparentTemperatureC: 33,
      humidity: 75,
      rainProbability: 40,
      source: 'fallback',
      observedAt: new Date().toISOString(),
    };
  }
  const now = new Date();
  const hour = hourInTimezone(preferences.timezone);
  const localApproximation = new Date(now);
  localApproximation.setHours(hour);
  return {
    date: dateInTimezone(preferences.timezone),
    timezone: preferences.timezone,
    weekday: now.getDay(),
    dayPart: dayPartFromHour(hour),
    occasion: inferOccasion(localApproximation),
    vibe: 'Balanced',
    setting: preferences.defaultSetting,
    weather: currentWeather,
  };
}

export const weatherLabel = (code?: number) => {
  if (code == null) return 'Weather estimated';
  if (code === 0) return 'Clear sky';
  if (code <= 3) return 'Partly cloudy';
  if (code <= 48) return 'Misty';
  if (code <= 67) return 'Rain nearby';
  if (code <= 77) return 'Wintry weather';
  if (code <= 82) return 'Rain showers';
  return 'Stormy';
};
