# Mapping Profiles — Specification

## Problem Statement

Atualmente, os mapeamentos são salvos por dispositivo (deviceId) e não há forma de organizar diferentes conjuntos de mapeamentos por contexto (ex: "FPS", "RTS", "Emulador"). O usuário precisa reconfigurar tudo ao querer usar o controle de forma diferente. Não há como compartilhar configurações com outras pessoas.

## Goals

- [ ] Usuário pode criar múltiplos perfis de mapeamento nomeados
- [ ] Usuário pode navegar entre perfis sem perder os mapeamentos de cada um
- [ ] Perfis são globais (reutilizáveis em qualquer controle conectado)
- [ ] Usuário pode exportar e importar perfis via arquivo JSON
- [ ] Mapeamentos existentes são migrados automaticamente para um perfil "Default"

## Out of Scope

| Feature | Razão |
|---------|-------|
| Perfis vinculados a dispositivo específico | Decisão: perfis são globais |
| Sincronização em nuvem | Fora do escopo v1 |
| Perfis automáticos por jogo/app | Complexidade futura |
| Histórico de versões de perfil | Fora do escopo v1 |
| Sobrescrever perfil existente no import | Decisão: import sempre cria novo |

---

## User Stories

### P1: Selecionar perfil ativo ⭐ MVP

**User Story**: Como usuário, quero selecionar um perfil de mapeamento via dropdown na tela de mapeamento, para que o conjunto de teclas mapeadas mude conforme o perfil escolhido.

**Why P1**: É o core da feature — sem seleção, o resto não serve.

**Acceptance Criteria**:

1. WHEN a tela de mapeamento é aberta THEN sistema SHALL exibir dropdown com nome do perfil ativo no header
2. WHEN usuário abre o dropdown THEN sistema SHALL listar todos os perfis existentes
3. WHEN usuário seleciona um perfil THEN sistema SHALL carregar os mappings e angleMappings desse perfil
4. WHEN usuário seleciona um perfil THEN sistema SHALL persistir qual perfil está ativo (`activeProfileId`)
5. WHEN mapeamento está ativo (playing) THEN dropdown SHALL estar desabilitado

**Independent Test**: Criar dois perfis com mapeamentos diferentes, alternar entre eles e verificar que os badges de mapeamento mudam.

---

### P1: Criar novo perfil ⭐ MVP

**User Story**: Como usuário, quero criar um novo perfil de mapeamento com nome personalizado, para que eu possa ter conjuntos de mapeamentos separados por contexto.

**Why P1**: Sem criar perfis, o dropdown é inútil.

**Acceptance Criteria**:

1. WHEN usuário clica em "Novo perfil" THEN sistema SHALL abrir input para nome do perfil
2. WHEN usuário confirma nome não-vazio THEN sistema SHALL criar perfil vazio e selecioná-lo como ativo
3. WHEN usuário confirma nome vazio THEN sistema SHALL exibir erro de validação e não criar o perfil
4. WHEN novo perfil é criado THEN sistema SHALL aparecer no dropdown imediatamente
5. WHEN novo perfil é criado THEN sistema SHALL persistir no store

**Independent Test**: Criar perfil "FPS", verificar que aparece no dropdown e está selecionado.

---

### P1: Migração automática de mapeamentos existentes ⭐ MVP

**User Story**: Como usuário existente, quero que meus mapeamentos atuais sejam preservados automaticamente ao atualizar para a versão com perfis, para não perder trabalho anterior.

**Why P1**: Sem migração, update quebra todos os usuários existentes.

**Acceptance Criteria**:

1. WHEN app é iniciado e `profiles` não existe no store THEN sistema SHALL criar perfil "Default" com os mappings e angleMappings do último device usado
2. WHEN migração ocorre THEN sistema SHALL definir "Default" como perfil ativo
3. WHEN migração ocorre THEN sistema SHALL remover as chaves legadas `mappings` e `angleMappings` do store
4. WHEN app já tem `profiles` no store THEN sistema SHALL pular migração

**Independent Test**: Partir de um store com mapeamentos legados, iniciar o app, verificar que perfil "Default" aparece com os mapeamentos.

---

### P2: Renomear perfil

**User Story**: Como usuário, quero renomear um perfil existente, para que eu possa corrigir ou atualizar o nome conforme necessário.

**Why P2**: Importante para organização, mas não bloqueia o MVP.

**Acceptance Criteria**:

1. WHEN usuário clica em "Renomear" no perfil ativo THEN sistema SHALL abrir input com nome atual pré-preenchido
2. WHEN usuário confirma nome não-vazio THEN sistema SHALL atualizar nome e persistir
3. WHEN usuário confirma nome vazio THEN sistema SHALL exibir erro e não renomear

**Independent Test**: Renomear "Default" para "Geral", verificar dropdown atualizado.

---

### P2: Deletar perfil

**User Story**: Como usuário, quero deletar um perfil que não preciso mais, para manter a lista organizada.

**Why P2**: Necessário para higiene da lista, mas não bloqueia o MVP.

**Acceptance Criteria**:

1. WHEN usuário clica em "Deletar" no perfil ativo THEN sistema SHALL exibir confirmação
2. WHEN usuário confirma deleção e existem outros perfis THEN sistema SHALL deletar e selecionar outro perfil automaticamente
3. WHEN usuário tenta deletar o último perfil restante THEN sistema SHALL bloquear a ação (sempre deve existir ao menos um perfil)
4. WHEN usuário cancela a confirmação THEN sistema SHALL não deletar

**Independent Test**: Com 2 perfis, deletar um, verificar que o outro fica selecionado.

---

### P2: Exportar perfil ativo

**User Story**: Como usuário, quero exportar o perfil de mapeamento ativo para um arquivo JSON, para que eu possa fazer backup ou compartilhar com outras pessoas.

**Why P2**: Valiosa para compartilhamento, mas não é core do MVP.

**Acceptance Criteria**:

1. WHEN usuário clica em "Exportar" THEN sistema SHALL abrir diálogo nativo de salvar arquivo (filtro `.json`)
2. WHEN usuário confirma local de salvamento THEN sistema SHALL escrever arquivo JSON com schema definido
3. WHEN arquivo é salvo THEN sistema SHALL exibir confirmação de sucesso
4. WHEN usuário cancela o diálogo THEN sistema SHALL não fazer nada

**Export file schema**:
```json
{
  "version": 1,
  "exportedAt": "2025-01-01T00:00:00.000Z",
  "profile": {
    "name": "FPS Mode",
    "mappings": [...],
    "angleMappings": [...]
  }
}
```

**Independent Test**: Exportar perfil, abrir arquivo JSON e verificar que contém os mapeamentos corretos.

---

### P2: Importar perfil de arquivo

**User Story**: Como usuário, quero importar um perfil de mapeamento a partir de um arquivo JSON, para que eu possa receber configurações de outras pessoas ou restaurar backups.

**Why P2**: Complemento da exportação.

**Acceptance Criteria**:

1. WHEN usuário clica em "Importar" THEN sistema SHALL abrir diálogo nativo de abrir arquivo (filtro `.json`)
2. WHEN usuário seleciona arquivo válido THEN sistema SHALL criar novo perfil com os dados importados e selecioná-lo como ativo
3. WHEN arquivo importado tem nome de perfil já existente THEN sistema SHALL criar mesmo assim (duplicatas permitidas)
4. WHEN arquivo tem formato inválido/incompatível THEN sistema SHALL exibir mensagem de erro e não importar
5. WHEN usuário cancela o diálogo THEN sistema SHALL não fazer nada

**Independent Test**: Exportar perfil, importar o mesmo arquivo, verificar que novo perfil aparece no dropdown com os mapeamentos.

---

## Edge Cases

- WHEN não há perfis no store (store vazio, sem legado) THEN sistema SHALL criar perfil "Default" vazio automaticamente
- WHEN store legado tem `mappings` mas todas as chaves de deviceId estão vazias THEN sistema SHALL criar "Default" vazio
- WHEN perfil ativo é deletado e há outros perfis THEN sistema SHALL selecionar o primeiro da lista
- WHEN app é aberto e `activeProfileId` aponta para um perfil que não existe mais THEN sistema SHALL selecionar o primeiro perfil disponível
- WHEN arquivo de import tem `version` diferente de 1 THEN sistema SHALL exibir aviso de versão incompatível

---

## Data Model

```typescript
// Novo modelo — substitui mappings/angleMappings no store
export interface MappingProfile {
  id: string           // UUID
  name: string         // Nome exibido no dropdown
  mappings: Mapping[]
  angleMappings: AngleMappingConfig[]
  createdAt: string    // ISO timestamp
}

// Atualização do StoreSchema
interface StoreSchema {
  config: AppConfig
  repeatSettings: RepeatSettings
  profiles: MappingProfile[]      // substitui mappings + angleMappings
  activeProfileId: string | null  // perfil selecionado atualmente
  // chaves legadas (removidas após migração)
  mappings?: Record<string, Mapping[]>
  angleMappings?: Record<string, AngleMappingConfig[]>
}
```

---

## Requirement Traceability

| Req ID   | Story                    | Status  |
|----------|--------------------------|---------|
| PROF-01  | P1: Selecionar perfil    | Pending |
| PROF-02  | P1: Criar perfil         | Pending |
| PROF-03  | P1: Migração automática  | Pending |
| PROF-04  | P2: Renomear perfil      | Pending |
| PROF-05  | P2: Deletar perfil       | Pending |
| PROF-06  | P2: Exportar perfil      | Pending |
| PROF-07  | P2: Importar perfil      | Pending |

---

## Success Criteria

- [ ] Usuário consegue criar e nomear perfis distintos com mapeamentos independentes
- [ ] Trocar de perfil muda os mapeamentos em < 100ms (sem reload)
- [ ] Mapeamentos pré-existentes aparecem intactos no perfil "Default" após migração
- [ ] Arquivo exportado pode ser importado em outra instalação sem erros
