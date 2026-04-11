import { useState, useMemo, useCallback } from 'react';
import { Search, ChevronUp, ChevronDown, Satellite } from 'lucide-react';
import { useMissionStore } from '../../stores/missionStore';
import { getRiskLevelColor } from '../../utils/colors';
import { LevelBadge } from '../shared/LevelBadge';
import { GlassPanel } from '../shared/GlassPanel';
import type { SatPosition, OrbitRegime, RiskLevel } from '@sentinel/shared/src/types';

interface Props {
    onSelectSatellite: (sat: SatPosition) => void;
}

type SortField = 'riskScore' | 'name' | 'alt';

const REGIME_OPTIONS: OrbitRegime[] = ['LEO', 'MEO', 'GEO', 'HEO'];
const LEVEL_OPTIONS: RiskLevel[] = ['CRITICAL', 'HIGH', 'MODERATE', 'LOW'];
const PAGE_SIZE = 50;

export function SatelliteList({ onSelectSatellite }: Props) {
    const satellites = useMissionStore((s) => s.satellites);
    const [search, setSearch] = useState('');
    const [regimeFilter, setRegimeFilter] = useState<Set<OrbitRegime>>(
        new Set(REGIME_OPTIONS),
    );
    const [levelFilter, setLevelFilter] = useState<Set<RiskLevel>>(
        new Set(LEVEL_OPTIONS),
    );
    const [sortField, setSortField] = useState<SortField>('riskScore');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [page, setPage] = useState(0);

    const toggleRegime = useCallback((r: OrbitRegime) => {
        setRegimeFilter((prev) => {
            const next = new Set(prev);
            if (next.has(r)) next.delete(r);
            else next.add(r);
            return next;
        });
        setPage(0);
    }, []);

    const toggleLevel = useCallback((l: RiskLevel) => {
        setLevelFilter((prev) => {
            const next = new Set(prev);
            if (next.has(l)) next.delete(l);
            else next.add(l);
            return next;
        });
        setPage(0);
    }, []);

    const handleSort = useCallback((field: SortField) => {
        setSortField((prev) => {
            if (prev === field) {
                setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'));
            } else {
                setSortDir('desc');
            }
            return field;
        });
    }, []);

    const filtered = useMemo(() => {
        const q = search.toLowerCase();
        return satellites
            .filter((s) => {
                if (q && !s.name.toLowerCase().includes(q) && !String(s.id).includes(q)) {
                    return false;
                }
                if (!regimeFilter.has(s.orbitRegime ?? 'LEO')) return false;
                if (!levelFilter.has(s.riskLevel ?? 'LOW')) return false;
                return true;
            })
            .sort((a, b) => {
                let valA: number | string;
                let valB: number | string;
                if (sortField === 'name') {
                    valA = a.name;
                    valB = b.name;
                    return sortDir === 'desc'
                        ? valB.localeCompare(valA)
                        : valA.localeCompare(valB);
                }
                valA = sortField === 'riskScore' ? (a.riskScore ?? 0) : a.alt;
                valB = sortField === 'riskScore' ? (b.riskScore ?? 0) : b.alt;
                return sortDir === 'desc' ? valB - valA : valA - valB;
            });
    }, [satellites, search, regimeFilter, levelFilter, sortField, sortDir]);

    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    const pageData = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    const SortIcon = ({ field }: { field: SortField }) => {
        if (sortField !== field) return null;
        return sortDir === 'desc'
            ? <ChevronDown size={ 10 } className="inline" />
            : <ChevronUp size={ 10 } className="inline" />;
    };

    return (
        <GlassPanel title="Satellites" icon={ <Satellite size={ 14 } /> } className="flex flex-col max-h-full">
            {/* Search */}
            <div className="relative mb-2">
                <Search size={ 12 } className="absolute left-2 top-1/2 -translate-y-1/2 text-text-muted" />
                <input
                    type="text"
                    value={ search }
                    onChange={ (e) => { setSearch(e.target.value); setPage(0); } }
                    placeholder="Search name or NORAD ID..."
                    className="w-full bg-surface-raised border border-border-subtle rounded pl-7 pr-2 py-1 font-mono text-[11px] text-text-primary placeholder:text-text-muted focus:outline-none focus:border-accent"
                />
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-1 mb-2">
                { REGIME_OPTIONS.map((r) => (
                    <button
                        key={ r }
                        onClick={ () => toggleRegime(r) }
                        className={ `font-mono text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                            regimeFilter.has(r)
                                ? 'border-accent text-accent bg-accent/10'
                                : 'border-border-subtle text-text-muted'
                        }` }
                    >
                        { r }
                    </button>
                )) }
                <span className="w-px h-4 bg-border-subtle self-center mx-0.5" />
                { LEVEL_OPTIONS.map((l) => (
                    <button
                        key={ l }
                        onClick={ () => toggleLevel(l) }
                        className={ `font-mono text-[9px] px-1.5 py-0.5 rounded border transition-colors ${
                            levelFilter.has(l)
                                ? 'border-current bg-current/10'
                                : 'border-border-subtle text-text-muted'
                        }` }
                        style={ levelFilter.has(l) ? { color: getRiskLevelColor(l) } : undefined }
                    >
                        { l === 'MODERATE' ? 'MOD' : l }
                    </button>
                )) }
            </div>

            {/* Count */}
            <div className="font-mono text-[10px] text-text-muted mb-1">
                { filtered.length } satellites
                { filtered.length !== satellites.length && ` (of ${satellites.length})` }
            </div>

            {/* Table */}
            <div className="flex-1 overflow-y-auto min-h-0">
                <table className="w-full">
                    <thead className="sticky top-0 bg-base z-10">
                        <tr className="font-mono text-[9px] text-text-muted uppercase">
                            <th
                                className="text-left py-1 cursor-pointer hover:text-text-secondary"
                                onClick={ () => handleSort('name') }
                            >
                                Name <SortIcon field="name" />
                            </th>
                            <th
                                className="text-right py-1 cursor-pointer hover:text-text-secondary w-12"
                                onClick={ () => handleSort('riskScore') }
                            >
                                Risk <SortIcon field="riskScore" />
                            </th>
                            <th className="text-right py-1 w-10">Lvl</th>
                        </tr>
                    </thead>
                    <tbody>
                        { pageData.map((sat) => (
                            <tr
                                key={ sat.id }
                                onClick={ () => onSelectSatellite(sat) }
                                className="cursor-pointer hover:bg-surface-raised/50 transition-colors"
                            >
                                <td className="py-0.5">
                                    <div className="font-mono text-[11px] text-text-primary truncate max-w-[160px]">
                                        { sat.name }
                                    </div>
                                    <div className="font-mono text-[9px] text-text-muted">
                                        { sat.id } &middot; { sat.orbitRegime } &middot; { Math.round(sat.alt) }km
                                    </div>
                                </td>
                                <td className="text-right">
                                    <span
                                        className="font-mono text-xs font-medium"
                                        style={ { color: getRiskLevelColor(sat.riskLevel) } }
                                    >
                                        { sat.riskScore ?? 0 }
                                    </span>
                                </td>
                                <td className="text-right">
                                    { sat.riskLevel && <LevelBadge level={ sat.riskLevel } /> }
                                </td>
                            </tr>
                        )) }
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            { totalPages > 1 && (
                <div className="flex items-center justify-between pt-1.5 mt-1 border-t border-border-subtle">
                    <button
                        disabled={ page === 0 }
                        onClick={ () => setPage((p) => Math.max(0, p - 1)) }
                        className="font-mono text-[10px] text-text-muted hover:text-accent disabled:opacity-30 disabled:cursor-default"
                    >
                        Prev
                    </button>
                    <span className="font-mono text-[10px] text-text-muted">
                        { page + 1 } / { totalPages }
                    </span>
                    <button
                        disabled={ page >= totalPages - 1 }
                        onClick={ () => setPage((p) => Math.min(totalPages - 1, p + 1)) }
                        className="font-mono text-[10px] text-text-muted hover:text-accent disabled:opacity-30 disabled:cursor-default"
                    >
                        Next
                    </button>
                </div>
            ) }
        </GlassPanel>
    );
}
