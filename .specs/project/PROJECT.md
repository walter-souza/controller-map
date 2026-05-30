# controller-map-electron

**Vision:** Desktop app para Windows que mapeia entradas de gamepads (botões, eixos, analógicos) para atalhos de teclado em tempo real, com interface visual intuitiva.
**For:** Jogadores que querem usar controles em jogos/apps que não têm suporte nativo a gamepad.
**Solves:** Ausência de mapeamento flexível e visual entre inputs de controle e teclas, especialmente para acordes (botões simultâneos) e eixos analógicos.

## Goals

- Mapear qualquer botão/eixo de controle a qualquer combinação de teclas
- Suportar acordes (múltiplos botões simultâneos) com janela de graça para detecção
- Suportar mapeamento de eixos analógicos por ângulo/setor
- Fornecer interface visual com imagem do controle e linhas guias de mapeamento
- Distribuir como executável Windows (.exe) sem dependências externas

## Tech Stack

**Core:**
- Runtime: Electron 28+
- Language: TypeScript 5
- UI: React 18 + Vite (electron-vite)
- Styling: Tailwind CSS

**Key dependencies:**
- `@kmamal/sdl` — leitura de eventos do controle (SDL2)
- `electron-store` — persistência de configurações por dispositivo
- `uiohook-napi` — injeção de eventos de teclado no sistema
- `electron-builder` — empacotamento/distribuição (.exe)

## Scope

**v1 inclui:**
- Detecção automática de controles conectados
- Mapeamento de botões → tecla/atalho
- Mapeamento de eixos analógicos → tecla (4 direções)
- Acordes (combinações simultâneas de botões)
- Mapeamento por ângulo (setores radiais do joystick)
- Janela de graça para detecção de acordes (evita disparos individuais)
- Interface visual com imagem do controle + linhas guias
- Joystick pad visualizer em tempo real
- Perfis de controle (8BitDo Ultimate como padrão/fallback)
- Persistência de configurações por dispositivo (electron-store)
- Build como instalador .exe

**Explicitamente fora do escopo:**
- Suporte a macOS/Linux
- Múltiplos perfis de usuário
- Mapeamento de mouse
- Suporte a mais de um controle simultâneo
- Cloud sync de configurações

## Constraints

- Windows apenas (SDL2 + uiohook)
- Requer permissão de administrador ou Developer Mode para build (symlinks)
