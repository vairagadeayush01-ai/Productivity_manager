import React from 'react';

export default function SourceBadge({ type }) {
  const config = {
    youtube:  { label: 'YouTube',  className: 'badge badge--youtube'  },
    leetcode: { label: 'LeetCode', className: 'badge badge--leetcode' },
    github:   { label: 'GitHub',   className: 'badge badge--github'   },
    manual:   { label: 'Manual',   className: 'badge badge--manual'   },
    paste:    { label: 'Paste',    className: 'badge badge--paste'    },
    pdf:      { label: 'PDF',      className: 'badge badge--pdf'      },
    webpage:  { label: 'Article',  className: 'badge badge--webpage'  },
  };
  const c = config[type] || { label: type || 'Entry', className: 'badge badge--manual' };
  return <span className={c.className}>{c.label}</span>;
}
