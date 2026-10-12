# Visual style inventory before overhaul

Baseline: `60b7c56`. App-owned styling was in `frontend/src/index.css` (4,197 lines) and inline React declarations. No Tailwind configuration or other app CSS was present. KaTeX owns its mathematical typography and is excluded from UI token enforcement.

## --radius-xs

- `4px`

## --radius-sm

- `6px`

## --radius-md

- `8px`

## --radius-lg

- `10px`

## --font-family

- `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`

## margin

- `0`
- `-1px`
- `auto`
- `0 2px`
- `0 auto`
- `20px 0 16px 0`
- `16px 0 8px`
- `6px 0 8px 0`
- `16px 0`
- `14px 0 8px`
- `12px 0 6px`
- `10px 0 4px`
- `8px 0`
- `12px 0`
- `18px 0`
- `14px 0`

## padding

- `0`
- `10px 18px`
- `8px`
- `16px`
- `10px 12px`
- `2px 8px`
- `10px`
- `6px 8px`
- `8px 10px`
- `8px 0`
- `8px 16px`
- `4px 10px`
- `32px 20px`
- `24px 20px`
- `12px 16px`
- `20px`
- `14px 18px`
- `6px 10px`
- `18px`
- `14px`
- `1px 6px`
- `0 10px`
- `10px 14px`
- `8px 12px`
- `12px 20px 16px`
- `2px 6px`
- `6px 4px`
- `2px 4px`
- `6px 12px`
- `0 4px`
- `48px 0`
- `12px`
- `32px 16px`
- `0 16px`
- `4px`
- `3px`
- `5px 12px`
- `5px 10px`
- `0 14px`
- `12px 12px 8px 12px`
- `0 12px 8px 12px`
- `5px 8px`
- `0 2px`
- `2px`
- `3px 8px`
- `4px 8px`
- `1px 5px`
- `0 12px`
- `7px 10px`
- `6px 14px`
- `48px 24px`
- `64px 20px`
- `0 9px`
- `8px 10px 10px`
- `10px 10px`
- `1px 4px`
- `4px 0`
- `2px 7px`
- `48px 16px`
- `8px 14px`
- `0 18px`
- `9px 14px`
- `28px 16px`
- `3px 0`
- `12px 14px`
- `20px 24px`
- `0 6px`
- `16px 12px 24px`

## font-family

- `var(--font-family)`
- `inherit`
- `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`

## background-color

- `var(--bg-app)`
- `var(--ink-primary)`
- `var(--ink-primary-hover)`
- `#ffffff`
- `#f3f4f6`
- `#e5e7eb`
- `var(--bg-sidebar)`
- `#f0fdf4`
- `#fef2f2`
- `var(--bg-surface)`
- `var(--bg-user-bubble)`
- `#f8fafc`
- `#cbd5e1`
- `var(--error-bg)`
- `var(--notfound-bg)`
- `#fff1f2`
- `var(--amber-bg)`
- `#fffdf5`
- `var(--accent-subtle)`
- `#dbe8f6`
- `#faf9f6`
- `#f9fafb`
- `transparent`
- `#eceae3`
- `#fdfaf0`
- `rgba(0, 0, 0, 0.4)`
- `#10b981`
- `rgba(0, 0, 0, 0.04)`
- `rgba(0, 0, 0, 0.035)`
- `var(--border)`
- `rgba(15, 23, 42, 0.35)`
- `#4a7c59`
- `#faeceb`
- `#eaf2eb`
- `#edf3fa`
- `var(--card-bg, #ffffff)`
- `rgba(0, 0, 0, 0.45)`
- `#fdfcfa`
- `var(--surface-secondary, #f8fafc)`
- `rgba(0, 0, 0, 0.015)`

## color

- `var(--text-main)`
- `var(--text-on-dark)`
- `var(--ink-primary)`
- `var(--text-muted)`
- `#166534`
- `#991b1b`
- `var(--error-text)`
- `var(--notfound-label)`
- `#e11d48`
- `#64748b`
- `#be123c`
- `var(--notfound-text)`
- `var(--amber-heading)`
- `var(--amber-topic)`
- `#ffffff`
- `var(--text-light)`
- `#a09d94`
- `var(--accent)`
- `currentColor`
- `#c0392b`
- `#3b7a57`
- `#3062a2`
- `#2563eb`
- `#dc2626`
- `#f8fafc`
- `#b45309`
- `#065f46`
- `#92400e`
- `var(--text-primary)`

## font-size

- `0.925rem`
- `1.05rem`
- `0.975rem`
- `0.725rem`
- `0.95rem`
- `0.8rem`
- `0.775rem`
- `0.75rem`
- `0.825rem`
- `0.85rem`
- `1.85rem`
- `1.75rem`
- `1rem`
- `0.875rem`
- `0.9375rem`
- `0.9rem`
- `1.15rem`
- `0.7rem`
- `1.1rem`
- `1.4rem`
- `1.35rem`
- `0.8125rem`
- `12px`
- `0.625rem`
- `0.675rem`
- `0.65rem`
- `1.3rem`
- `1.25rem`
- `1.2rem`

## gap

- `8px`
- `16px`
- `10px`
- `6px`
- `24px`
- `12px`
- `2px`
- `4px`
- `1px`
- `3px`
- `5px`
- `14px`
- `0`

## border-radius

- `8px`
- `50%`
- `12px`
- `6px`
- `22px`
- `var(--radius-md)`
- `4px`
- `10px`
- `var(--radius-sm)`
- `var(--radius-xs)`
- `16px 16px 0 0`
- `0`
- `var(--radius-lg)`
- `3px`
- `5px`
- `999px`

## border-color

- `var(--border-dark)`
- `#9ca3af`
- `#f43f5e`
- `#ca8a04`
- `#a4c1df`
- `var(--ink-primary)`
- `var(--accent-border)`
- `#ebd9a2`
- `var(--accent)`
- `var(--border)`
- `#dc2626`

## background

- `transparent`
- `linear-gradient(90deg, #e5e7eb 25%, #f3f4f6 50%, #e5e7eb 75%)`
- `#ffffff`
- `#ffe4e6`
- `var(--accent-subtle)`
- `none`
- `var(--bg-surface)`
- `var(--bg-sidebar)`
- `var(--bg-app)`
- `var(--ink-primary)`
- `rgba(0, 0, 0, 0.04)`
- `rgba(0, 0, 0, 0.06)`
- `#eae7e0`
- `var(--bg-sidebar-hover)`
- `#f4f2ed`
- `rgba(0, 0, 0, 0.05)`
- `#fdf0ed`
- `#eff6ff`
- `var(--bg-sidebar-active)`
- `var(--amber-bg)`
- `#1e293b`
- `#fffdfd`
- `#fffefb`
- `#ecfdf5`
- `#fef2f2`
- `#fffbeb`
- `#fafbfc`

## margin-top

- `2px`
- `6px`
- `4px`
- `12px`
- `10px`
- `8px`
- `18px`

## box-shadow

- `0 1px 3px rgba(0, 0, 0, 0.05)`
- `0 1px 2px rgba(0, 0, 0, 0.04)`
- `0 4px 6px -1px rgba(0, 0, 0, 0.1)`
- `0 0 0 2px #fde68a`
- `0 1px 2px rgba(48, 98, 162, 0.2)`
- `0 2px 8px rgba(0, 0, 0, 0.04)`
- `0 0 0 2px var(--accent-focus), 0 2px 8px rgba(0, 0, 0, 0.04)`
- `0 1px 3px rgba(0, 0, 0, 0.02)`
- `none`
- `4px 0 24px rgba(0, 0, 0, 0.2)`
- `0 -8px 24px rgba(0, 0, 0, 0.2)`
- `0 1px 3px rgba(0, 0, 0, 0.08)`
- `0 1px 4px rgba(0, 0, 0, 0.05)`
- `0 1px 2px rgba(0, 0, 0, 0.05)`
- `0 4px 16px rgba(0, 0, 0, 0.12)`
- `0 2px 8px rgba(0, 0, 0, 0.08)`
- `4px 0 24px rgba(0, 0, 0, 0.12)`
- `0 0 0 2px var(--accent-focus)`
- `0 12px 36px rgba(0, 0, 0, 0.08)`
- `-4px 0 24px rgba(0, 0, 0, 0.12)`

## margin-bottom

- `8px`
- `16px`
- `4px`
- `2px`
- `6px`
- `24px`
- `0`
- `10px`

## border-top-color

- `var(--ink-primary)`

## margin-left

- `4px`
- `12px`
- `auto`
- `6px`
- `20px`

## margin-right

- `4px`
- `6px`

## background-size

- `200% 100%`

## background-position

- `200% 0`
- `-200% 0`

## padding-top

- `12px`
- `14px`
- `10px`
- `4px`
- `6px`
- `8px`

## accent-color

- `var(--ink-primary)`

## border-bottom-color

- `var(--ink-primary)`

## padding-bottom

- `6px`

## Original variable definitions

- `--bg-app: #f9f8f6`
- `--bg-surface: #ffffff`
- `--bg-sidebar: #f3f1ec`
- `--bg-sidebar-hover: #eae7e0`
- `--bg-sidebar-active: #e3ded6`
- `--bg-user-bubble: #f4f2ed`
- `--border: #e3e0d8`
- `--border-subtle: #eae7e1`
- `--border-dark: #cec9be`
- `--text-main: #242321`
- `--text-muted: #68655e`
- `--text-light: #949086`
- `--text-on-dark: #ffffff`
- `--ink-primary: #3062a2`
- `--ink-primary-hover: #26518a`
- `--ink-primary-focus: #1d4070`
- `--accent-primary: #3062a2`
- `--accent-subtle: #edf3fa`
- `--accent-border: #b8cde4`
- `--accent-focus: rgba(48, 98, 162, 0.2)`
- `--amber-bg: #fcf9f2`
- `--amber-border: #ebd9a2`
- `--amber-card-border: #f4e8c5`
- `--amber-heading: #8d5218`
- `--amber-topic: #714213`
- `--notfound-bg: #f8f6f2`
- `--notfound-border: #dcd8d0`
- `--notfound-label: #5e5b54`
- `--notfound-text: #242321`
- `--error-bg: #fdf5f5`
- `--error-border: #f5cfcf`
- `--error-text: #962828`
- `--highlight-bg: #fef8e7`
- `--highlight-border: #e2c974`
- `--radius-xs: 4px`
- `--radius-sm: 6px`
- `--radius-md: 8px`
- `--radius-lg: 10px`
- `--font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`
