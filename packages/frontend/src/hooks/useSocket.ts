import { useEffect } from 'react';
import { getSocket, disconnectSocket } from '../services/socket';
import { useMissionStore } from '../stores/missionStore';
import type {
    RiskState,
    SpaceWeatherState,
    SatPosition,
    AlertRecord,
} from '@sentinel/shared/src/types';

export function useSocket(): void {
    useEffect(() => {
        const socket = getSocket();
        const {
            setConnected,
            setRisk,
            setLastUpdate,
            addAlert,
            setSatellites,
            setWeather,
        } = useMissionStore.getState();

        socket.on('connect', () => {
            setConnected(true);
        });

        socket.on('disconnect', () => {
            setConnected(false);
        });

        socket.on('risk-update', (data: RiskState) => {
            setRisk(data);
            setLastUpdate(data.timestamp);
        });

        socket.on('risk-alert', (data: AlertRecord) => {
            addAlert(data);
        });

        socket.on('satellite-positions', (data: SatPosition[]) => {
            setSatellites(data);
        });

        socket.on('space-weather', (data: SpaceWeatherState) => {
            setWeather(data);
        });

        socket.connect();

        return () => {
            socket.off('connect');
            socket.off('disconnect');
            socket.off('risk-update');
            socket.off('risk-alert');
            socket.off('satellite-positions');
            socket.off('space-weather');
            disconnectSocket();
        };
    }, []);
}
