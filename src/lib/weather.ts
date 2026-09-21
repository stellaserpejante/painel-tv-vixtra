import 'server-only';
import { getEnv } from '@/lib/env';
import { TIMEZONE, formatTime } from './time';

/**
 * Clima de São Paulo via Open-Meteo.
 *
 * Escolha registrada: a Stella optou pelo Open-Meteo em vez do AccuWeather.
 * É uma API pública, sem chave, sem cota e sem credencial para vazar —
 * o que também elimina um segredo do projeto. Ainda assim a chamada é feita
 * no servidor, nunca no navegador, para manter o padrão da arquitetura.
 */

const OPEN_METEO = 'https://api.open-meteo.com/v1/forecast';

export interface WeatherData {
  city: string;
  temp: number;
  feelsLike: number;
  tempMax: number;
  tempMin: number;
  condition: string;
  icon: string;
  rainProbability: number;
  updatedAt: string;
  updatedAtISO: string;
}

/** Tradução dos códigos WMO para português, com o ícone correspondente. */
const WMO: Record<number, [string, string]> = {
  0: ['Céu limpo', '☀️'],
  1: ['Poucas nuvens', '🌤️'],
  2: ['Parcialmente nublado', '⛅'],
  3: ['Nublado', '☁️'],
  45: ['Neblina', '🌫️'],
  48: ['Neblina com geada', '🌫️'],
  51: ['Garoa fraca', '🌦️'],
  53: ['Garoa', '🌦️'],
  55: ['Garoa forte', '🌦️'],
  56: ['Garoa congelante', '🌧️'],
  57: ['Garoa congelante forte', '🌧️'],
  61: ['Chuva fraca', '🌧️'],
  63: ['Chuva', '🌧️'],
  65: ['Chuva forte', '🌧️'],
  66: ['Chuva congelante', '🌧️'],
  67: ['Chuva congelante forte', '🌧️'],
  71: ['Neve fraca', '🌨️'],
  73: ['Neve', '🌨️'],
  75: ['Neve forte', '🌨️'],
  77: ['Grãos de neve', '🌨️'],
  80: ['Pancadas de chuva', '🌧️'],
  81: ['Pancadas de chuva', '🌧️'],
  82: ['Pancadas fortes', '⛈️'],
  85: ['Pancadas de neve', '🌨️'],
  86: ['Pancadas de neve forte', '🌨️'],
  95: ['Tempestade', '⛈️'],
  96: ['Tempestade com granizo', '⛈️'],
  99: ['Tempestade com granizo', '⛈️'],
};

export async function fetchWeather(): Promise<WeatherData> {
  const env = getEnv();
  const url = new URL(OPEN_METEO);
  url.searchParams.set('latitude', String(env.WEATHER_LAT));
  url.searchParams.set('longitude', String(env.WEATHER_LON));
  url.searchParams.set('current', 'temperature_2m,apparent_temperature,weather_code,precipitation');
  url.searchParams.set(
    'daily',
    'temperature_2m_max,temperature_2m_min,precipitation_probability_max'
  );
  url.searchParams.set('timezone', TIMEZONE);
  url.searchParams.set('forecast_days', '1');

  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Open-Meteo respondeu ${res.status}`);

  const data = (await res.json()) as {
    current: {
      temperature_2m: number;
      apparent_temperature: number;
      weather_code: number;
    };
    daily: {
      temperature_2m_max: number[];
      temperature_2m_min: number[];
      precipitation_probability_max: number[];
    };
  };

  const [condition, icon] = WMO[data.current.weather_code] ?? ['—', '⛅'];
  const now = new Date();

  return {
    city: 'São Paulo, SP',
    temp: Math.round(data.current.temperature_2m),
    feelsLike: Math.round(data.current.apparent_temperature),
    tempMax: Math.round(data.daily.temperature_2m_max[0]),
    tempMin: Math.round(data.daily.temperature_2m_min[0]),
    condition,
    icon,
    rainProbability: data.daily.precipitation_probability_max[0] ?? 0,
    updatedAt: formatTime(now),
    updatedAtISO: now.toISOString(),
  };
}
