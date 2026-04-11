import { motion } from 'framer-motion';
import type { ReactNode } from 'react';

interface GlassPanelProps {
    children: ReactNode;
    className?: string;
    title?: string;
    icon?: ReactNode;
}

export function GlassPanel({ children, className = '', title, icon }: GlassPanelProps) {
    return (
        <motion.div
            className={ `glass-panel p-3 ${className}` }
            initial={ { opacity: 0, y: 8 } }
            animate={ { opacity: 1, y: 0 } }
            transition={ { duration: 0.3 } }
        >
            { title && (
                <div className="flex items-center gap-1.5 mb-2">
                    { icon && (
                        <span className="text-text-muted w-3.5 h-3.5">
                            { icon }
                        </span>
                    ) }
                    <span className="font-sans text-[10px] uppercase tracking-[0.1em] text-text-muted font-medium">
                        { title }
                    </span>
                </div>
            ) }
            { children }
        </motion.div>
    );
}
