# Roadmap

## Milestones

### ✅ M1 — Core mapping engine
- Detecção de controles via SDL2
- Mapeamento botão → tecla
- Mapeamento eixo analógico → tecla
- Persistência com electron-store
- Injeção de teclas com uiohook-napi

### ✅ M2 — Acordes e janela de graça
- Detecção de múltiplos botões simultâneos (chord)
- Janela de graça na press e release para evitar falsos disparos individuais
- Interface de captura de acordes no diálogo de mapeamento

### ✅ M3 — Interface visual de mapeamento
- Imagem do controle com linhas guias e badges de mapeamento
- Hover highlight em botão + linha guia simultâneos
- Toggle visual/lista
- Perfil 8BitDo Ultimate com layout correto de botões

### ✅ M4 — Mapeamento por ângulo (joystick analógico)
- Dialog de configuração de setores radiais (AngleMappingDialog)
- Presets WASD, Setas, personalizado
- Engine de detecção por ângulo no mapper

### ✅ M5 — Joystick pad visualizer
- Representação visual dos sticks em tempo real
- Setores dinâmicos refletindo configuração de ângulo
- Click para editar mapeamento de ângulo
- Seção de mapeamento de eixos editável no painel lateral direito

### ✅ M6 — Polish e distribuição
- Build como .exe com electron-builder
- 8BitDo como perfil fallback universal
- Toggle visual sempre disponível (mesmo sem perfil conhecido)
- Nomes de botões corretos nas badges (A, B, X, Y em vez de Botão 0)
- Remoção da seção ANALÓGICOS do menu lateral

### ✅ M7 — Mapping profiles
- Múltiplos perfis de mapeamento nomeados (criar, renomear, deletar)
- Seleção de perfil ativo via dropdown no header
- Migração automática de mapeamentos legados para perfil "Default"
- Exportar / importar perfis via arquivo JSON
- Persistência global de perfis com electron-store

## Backlog

### 🔲 Perfis adicionais de controles
- Xbox Controller
- DualSense / DualShock 4
- Nintendo Pro Controller
- Permitir usuário selecionar perfil visual manualmente

### 🔲 Melhorias de UX
- Histórico de undo para deleção
- Renomear mapeamentos individuais

### 🔲 Mapeamento avançado
- Mapeamento de gatilhos analógicos com threshold configurável
- Suporte a macros (sequência de teclas)
- Delay configurável por mapeamento
