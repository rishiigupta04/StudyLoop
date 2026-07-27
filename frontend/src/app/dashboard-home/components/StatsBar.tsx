import React from 'react';
import { motion } from 'framer-motion';
import Icon from '@/components/ui/AppIcon';

const stats = [
  {
    id: 'stat-videos',
    icon: 'PlayCircleIcon',
    value: '14',
    label: 'Videos Studied',
    color: 'text-cyan-400',
    bgColor: 'bg-cyan-500/10 border-cyan-500/20',
    trend: '+2 this week',
  },
  {
    id: 'stat-notes',
    icon: 'DocumentTextIcon',
    value: '67',
    label: 'Notes Captured',
    color: 'text-indigo-400',
    bgColor: 'bg-indigo-500/10 border-indigo-500/20',
    trend: '+8 today',
  },
  {
    id: 'stat-streak',
    icon: 'FireIcon',
    value: '5',
    label: 'Study Streak',
    color: 'text-emerald-400',
    bgColor: 'bg-emerald-500/10 border-emerald-500/20',
    trend: '5 day streak',
  },
  {
    id: 'stat-questions',
    icon: 'ChatBubbleLeftEllipsisIcon',
    value: '143',
    label: 'Questions Asked',
    color: 'text-purple-400',
    bgColor: 'bg-purple-500/10 border-purple-500/20',
    trend: '+12 today',
  },
];

export default function StatsBar() {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {stats.map((stat, i) => (
        <motion.div
          key={stat.id}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: i * 0.08 }}
          whileHover={{ y: -3 }}
          className="glass-card rounded-2xl border border-indigo-500/15 p-5 relative overflow-hidden transition-all duration-200 card-hover"
        >
          <div className="flex items-start justify-between mb-3">
            <div className={`w-10 h-10 rounded-xl ${stat.bgColor} border flex items-center justify-center`}>
              <Icon
                name={stat.icon as Parameters<typeof Icon>[0]['name']}
                size={20}
                className={stat.color}
              />
            </div>
            <span className="text-xs font-semibold text-emerald-400 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
              {stat.trend}
            </span>
          </div>
          <p className="text-3xl font-extrabold text-foreground tabular-nums tracking-tight mb-1">
            {stat.value}
          </p>
          <p className="text-xs font-medium text-foreground-muted">{stat.label}</p>
        </motion.div>
      ))}
    </div>
  );
}