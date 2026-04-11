import { Zap, Activity, Wind } from 'lucide-react';
import { useMissionStore } from '../../stores/missionStore';
import { WeatherGauge } from './WeatherGauge';
import { CMECountdown } from './CMECountdown';
import {
    getXrayStatus,
    getKpStatus,
    getProtonStatus,
    getSolarWindStatus,
    getBzStatus,
} from '../../utils/formatters';

export function SpaceWeatherBar() {
    const weather = useMissionStore((s) => s.weather);

    return (
        <div className="bg-base border-t border-border-subtle px-4 py-3 flex items-stretch gap-3">
            <CMECountdown />
            <WeatherGauge
                label="X-RAY"
                value={weather?.xrayClass ?? '---'}
                unit="class"
                icon={<Zap size={16} />}
                status={getXrayStatus(weather?.xrayClass ?? null)}
            />
            <WeatherGauge
                label="Kp INDEX"
                value={weather?.kpIndex ?? '--'}
                unit="0–9"
                icon={<Activity size={16} />}
                status={getKpStatus(weather?.kpIndex ?? null)}
            />
            <WeatherGauge
                label="PROTONS"
                value={
                    weather?.protonFlux != null
                        ? weather.protonFlux.toFixed(1)
                        : '--'
                }
                unit="pfu"
                icon={<Activity size={16} />}
                status={getProtonStatus(weather?.protonFlux ?? null)}
            />
            <WeatherGauge
                label="SOLAR WIND"
                value={
                    weather?.solarWindSpeed != null
                        ? Math.round(weather.solarWindSpeed)
                        : '--'
                }
                unit="km/s"
                icon={<Wind size={16} />}
                status={getSolarWindStatus(weather?.solarWindSpeed ?? null)}
            />
            <WeatherGauge
                label="IMF Bz"
                value={weather?.bz != null ? weather.bz.toFixed(1) : '--'}
                unit="nT"
                icon={<Activity size={16} />}
                status={getBzStatus(weather?.bz ?? null)}
            />
        </div>
    );
}
