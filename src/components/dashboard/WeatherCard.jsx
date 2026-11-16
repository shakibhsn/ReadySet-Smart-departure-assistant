import { CloudSun, Droplets, Lightbulb } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'

export function WeatherCard({ weather }) {
  return (
    <Card>
      <CardHeader>
        <div>
          <CardTitle>Weather</CardTitle>
          <CardDescription>{weather.location}</CardDescription>
        </div>
        <Badge className="bg-slate-100 text-slate-600 ring-slate-200">Placeholder</Badge>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-4">
          <span className="flex size-16 items-center justify-center rounded-2xl bg-amber-50 text-amber-500">
            <CloudSun className="size-9" />
          </span>
          <div>
            <p className="text-4xl font-extrabold tracking-tight">{weather.temperatureC}°C</p>
            <p className="text-sm text-muted">
              {weather.condition} · feels like {weather.feelsLikeC}°
            </p>
          </div>
        </div>
        <p className="mt-4 inline-flex items-center gap-1.5 text-sm text-muted">
          <Droplets className="size-4 text-sky-500" /> {weather.rainChance}% chance of rain
        </p>
        <p className="mt-3 flex gap-2 rounded-xl bg-accent-50 p-3 text-sm text-accent-700">
          <Lightbulb className="mt-0.5 size-4 shrink-0" />
          {weather.suggestion}
        </p>
      </CardContent>
    </Card>
  )
}
