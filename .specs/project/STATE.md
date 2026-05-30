# State

## Decisions

### D1 — SDL2 para leitura de controle (não Web Gamepad API)
Processo main usa `@kmamal/sdl` diretamente. Garante baixa latência e acesso a eventos raw sem depender do browser runtime do Electron.

### D2 — uiohook-napi para injeção de teclas
Permite injetar eventos de teclado no nível do SO, funcionando mesmo quando a janela Electron não está em foco. Alternativa (robotjs) foi descartada por problemas de build no Windows.

### D3 — Janela de graça para acordes (chord grace window)
Implementada no `controller-service.ts`. Press: acumula botões por ~50ms antes de disparar. Release: aguarda ~50ms para garantir que todos os botões do acorde foram soltos antes de disparar o release. Evita que botões individuais sejam disparados erroneamente durante um acorde.

### D4 — Ângulos em convenção matemática CCW (0=direita, 90=cima)
`AngleMappingConfig.nodes[i].angle` usa CCW. Conversão para SVG (CW, 0=direita, 90=baixo): `svgAngle = (360 - mathAngle) % 360`.

### D5 — 8BitDo Ultimate como perfil fallback universal
`detectProfile()` sempre retorna um `ControllerProfile` não-nulo. Controles desconhecidos recebem o layout visual do 8BitDo. IDs/mapeamentos funcionam independente do visual.

### D6 — Persistência keyed por deviceId (número SDL)
`electron-store` salva configs em `controller-map.json` em `AppData\Roaming\controller-map-electron\`. Chave é o `deviceId` numérico retornado pelo SDL.

### D7 — Nomes de botões resolvidos do perfil em tempo de exibição
`button_name` no `Mapping` pode conter "Botão 0" (legado). `resolveButtonName(profile, sourceType, buttonId, direction)` busca o nome real do perfil. Aplicado em `MappingScreen`, `VisualMappingView` e `AddMappingDialog`.

## Lessons

- SVG arc é degenerado para 360° exatos — usar `<circle>` para n=1 setor
- `largeArcFlag` deve ser computado dinamicamente: `extent > 180 ? 1 : 0`
- Processo main não conhece o perfil do controle — enriquecimento de nomes deve ocorrer no renderer

## Blockers

_(nenhum)_

## Deferred Ideas

- Suporte a múltiplos controles simultâneos
- Macros (sequência de teclas com delay)
- Editor visual de perfis de controle (drag & drop de botões)
- Threshold configurável por gatilho analógico individual

## Preferences

- Commits em português descritivo com Co-authored-by Copilot
- Build verificado com `npm run build` (electron-vite build)
- TypeScript errors verificados via build (projeto usa tsconfig composto, `tsc --noEmit` direto não funciona)
