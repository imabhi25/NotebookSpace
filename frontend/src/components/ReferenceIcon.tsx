import React from 'react';
const paths: Record<string, React.ReactNode> = {
 close: <path d="m6 6 12 12M18 6 6 18"/>,
 monitor: <><rect x="3" y="3" width="18" height="13" rx="2"/><path d="M8 21h8M12 16v5"/></>,
 sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1 1M18 18l1 1M5 19l1-1M18 6l1-1"/></>,
 moon: <path d="M21 13a9 9 0 01-10-10 9 9 0 1010 10Z"/>,
 download: <><path d="M12 3v12m-4-4 4 4 4-4M4 17v4h16v-4"/></>,
 shield: <path d="m12 2 8 4v6c0 5-8 10-8 10S4 17 4 12V6z"/>,
 info: <><circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7h.01"/></>,
 chevron: <path d="m9 5 7 7-7 7"/>,
 book: <><path d="M12 7v14M3 3h5a4 4 0 014 4 4 4 0 014-4h5v16h-5a4 4 0 00-4 2 4 4 0 00-4-2H3z"/></>,
 clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
 archive: <><rect x="3" y="3" width="18" height="5" rx="1"/><path d="M5 8v13h14V8M10 12h4"/></>,
 lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 018 0v3"/></>,
 file: <><path d="M14 2H5v20h14V7zM14 2v6h5M8 12h8M8 16h8"/></>,
 music: <><path d="M9 18V5l12-2v13M9 8l12-2"/><ellipse cx="6" cy="18" rx="3" ry="3"/><ellipse cx="18" cy="16" rx="3" ry="3"/></>,
 upload: <><path d="M8 16l4-4 4 4M12 12v10M5 16a5 5 0 01-1-10 7 7 0 0113-1 5 5 0 013 10"/></>,
 user: <><circle cx="12" cy="8" r="4"/><path d="M4 22v-3a8 8 0 0116 0v3"/></>,
};
export const ReferenceIcon = ({name, size=18}: {name: string; size?: number}) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.book}</svg>;
