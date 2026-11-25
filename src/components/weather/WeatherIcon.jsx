import { Cloud, CloudDrizzle, CloudFog, CloudLightning, CloudRain, CloudSnow, CloudSun, Moon, Sun } from 'lucide-react'

const ICONS = { clear: Sun, 'partly-cloudy': CloudSun, cloudy: Cloud, fog: CloudFog, drizzle: CloudDrizzle, rain: CloudRain, snow: CloudSnow, thunder: CloudLightning, unknown: Cloud }

/** Decorative: the condition is always also written as text next to it. */
export function WeatherIcon({ icon, isDay = true, className }) {
  const Icon = icon === 'clear' && isDay === false ? Moon : (ICONS[icon] ?? Cloud)
  return <Icon className={className} aria-hidden="true" />
}
