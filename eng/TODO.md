# Engineering TODO

## Bugs / UX
- [ ] Secção "My PRs" não refresca os status dots quando o Refresh é clicado na main view
- [ ] Quando uma run na secção Runs completa, refrescar o status dot correspondente no nível 2 (PR detail)
- [ ] Report do nível 3 podia incluir tempo de duração de cada attempt e resultado detalhado

## Qualidade de código

### Testes em falta (por prioridade)
- [ ] `fetchRunAttempts` — novo, zero cobertura
- [ ] `watchWorkflowRerun` — novo, zero cobertura
- [ ] `fetchRunAttemptsHandler` — novo, zero cobertura
- [ ] `PollManager.watchAttempt` — novo, zero cobertura
- [ ] `src/core/auth.js` — `startDeviceFlow` e `pollForToken` não têm testes (path crítico)
- [ ] `src/core/runs.js` — `startWatching` não está coberto (função mais complexa, ~70 linhas)
- [ ] `src/electron/ipc/auth.js` — login flow, logout, token refresh
- [ ] `renderer` — `applyCompletedState`, PR picker, rerun button flow

### Infra de qualidade
- [ ] Coverage reporting — adicionar `--coverage` ao Jest config com thresholds (80% statements, 70% branches)
- [ ] ESLint — `eslint-plugin-jest`, regras: `no-unused-vars`, `no-undef`, `jest/expect-expect`
- [ ] CI gate — correr `npm test` em cada PR, falhar se coverage baixar

## Features
- [ ] Auto-refresh do nível 3 enquanto há uma run ativa (polling periódico sem ter de carregar no refresh manualmente)
