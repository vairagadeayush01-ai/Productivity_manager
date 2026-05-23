import React from 'react';
import { BookOpen, Code2, Video, GitBranch } from 'lucide-react';

const CONFIG = {
  youtube: { label: 'YouTube', color: '#f87171', icon: Video },
  leetcode: { label: 'LeetCode', color: '#fbbf24', icon: Code2 },
  github: { label: 'GitHub', color: '#34d399', icon: GitBranch },
  manual: { label: 'Note', color: '#a5b4fc', icon: BookOpen },
  paste: { label: 'Note', color: '#a5b4fc', icon: BookOpen },
  pdf: { label: 'PDF', color: '#c4b5fd', icon: BookOpen },
  webpage: { label: 'Web', color: '#67e8f9', icon: BookOpen },
};

export default function SourceBadge({ type }) {
  const cfg = CONFIG[type] || CONFIG.manual;
  const Icon = cfg.icon;
  return (
    <span className="badge" style={{ '--badge-color': cfg.color }}>
      <Icon size={12} aria-hidden />
      {cfg.label}
    </span>
  );
}
