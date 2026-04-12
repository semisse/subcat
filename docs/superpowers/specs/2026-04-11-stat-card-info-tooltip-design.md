# Stat Card Info Tooltip — Design Spec

**Date:** 2026-04-11
**Status:** Approved

## Problem

The four stat cards on the Home page (Total PRs, Total Runs, Failures, Flaky Rate) show numbers with no explanation of what they represent or how they are calculated. Users cannot tell, for example, whether "Total Runs" is a historical count or only the current session. The existing trend badges (+12%, +8%, -5%) show hardcoded fake data and add noise without value.

## Goal

Add a small info button (ⓘ) to the top-right corner of each stat card. Clicking it toggles a tooltip that explains the statistic and how it is derived.

## Approach

Single global `click` listener on `document` using CSS attribute selector `[data-tooltip-open]` to drive visibility. No per-card listeners, no global state, no framework.

## HTML Changes (`index.html`)

Remove the three hardcoded `<span class="stat-card-trend ...">` elements.

Inside each `.stat-card`, add after `.stat-card-header`:

```html
<button class="stat-info-btn" aria-label="More info">i</button>
<div class="stat-tooltip" role="tooltip">
  <strong><!-- title --></strong>
  <p><!-- explanation --></p>
</div>
```

The button is positioned absolute in the top-right corner of the card (which already has `position: relative`).

### Tooltip copy

| Card | Title | Body |
|---|---|---|
| Total PRs | Total PRs | Os teus PRs abertos actualmente visíveis na secção "My PRs". Actualizado cada vez que a lista é carregada. |
| Total Runs | Total Runs | Número de workflow runs actualmente a ser monitorizados. Inclui runs em progresso e concluídos nesta sessão. |
| Failures | Failures | Runs monitorizados com conclusão `failure`. Calculado sobre todos os runs activos nesta sessão. |
| Flaky Rate | Flaky Rate | Percentagem de runs falhados sobre o total de runs monitorizados. Fórmula: `failures ÷ total runs × 100`. |

## CSS Changes (`renderer/styles.css`)

```css
.stat-info-btn {
    position: absolute;
    top: 16px;
    right: 16px;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    border: 1px solid var(--glass-border);
    background: transparent;
    color: var(--text-muted);
    font-size: 11px;
    font-style: italic;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: color 0.15s, border-color 0.15s;
    line-height: 1;
    padding: 0;
}

.stat-info-btn:hover {
    color: var(--text-secondary);
    border-color: var(--text-secondary);
}

.stat-tooltip {
    position: absolute;
    top: 40px;
    right: 12px;
    width: 220px;
    background: var(--bg-secondary);
    border: 1px solid var(--glass-border);
    border-radius: var(--radius-md);
    padding: 12px 14px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.15s;
    z-index: 10;
    font-size: 13px;
    line-height: 1.5;
    color: var(--text-secondary);
}

.stat-tooltip strong {
    display: block;
    color: var(--text-primary);
    margin-bottom: 6px;
    font-size: 13px;
}

.stat-tooltip p {
    margin: 0;
}

.stat-card[data-tooltip-open] .stat-tooltip {
    opacity: 1;
    pointer-events: auto;
}
```

## JS Changes (`renderer/pages/dashboard.js`)

Add `initStatTooltips()` and call it once on page init (alongside other init calls in `renderer.js`).

```js
function initStatTooltips() {
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.stat-info-btn');
        document.querySelectorAll('.stat-card[data-tooltip-open]').forEach(card => {
            if (!btn || card !== btn.closest('.stat-card')) {
                card.removeAttribute('data-tooltip-open');
            }
        });
        if (btn) {
            btn.closest('.stat-card').toggleAttribute('data-tooltip-open');
            e.stopPropagation();
        }
    });
}
```

## What is NOT changing

- The stat card values and their calculation logic (`updateDashboardStats`) remain untouched.
- No new files are created — changes land in `index.html`, `styles.css`, and `dashboard.js`.
- The `.stat-card-trend` CSS classes are kept (not removed) in case they are reused elsewhere; only the HTML elements are removed.
