# Mapping Profiles — Tasks

**Feature:** mapping-profiles
**Spec:** ../spec.md
**Status:** In Progress

---

## Task Map

```
T1 (models) → T2 (persistence) ─┐
T1 (models) → T3 (ipc types)   ─┼→ T4 (ipc handlers) → T5 (MappingScreen UI)
T6 (dialog component)           ─┘                    ↗
```

---

## T1 — Add MappingProfile to models.ts

**What:** Add `MappingProfile` interface ao `src/shared/models.ts`
**Where:** `src/shared/models.ts`
**Reqs:** PROF-01, PROF-02, PROF-03

```typescript
export interface MappingProfile {
  id: string
  name: string
  mappings: Mapping[]
  angleMappings: AngleMappingConfig[]
  createdAt: string // ISO timestamp
}
```

**Done when:** Interface exportada, sem erros de build
**Status:** ✅ Done

---

## T2 — Profile persistence layer

**What:** Reescrever `src/main/persistence.ts` com:
- `StoreSchema` atualizado: adicionar `profiles: MappingProfile[]`, `activeProfileId: string | null`
- Manter campos legados `mappings?`, `angleMappings?` para migração
- `ensureProfiles()`: migração automática — se `profiles` não existe, cria "Default" dos dados legados
- `loadAllProfiles()` → `MappingProfile[]`
- `saveAllProfiles(profiles)` → void
- `getActiveProfileId()` → `string | null`
- `setActiveProfileId(id)` → void
- `exportProfileToFile(profile)` → abre diálogo nativo de salvar, escreve JSON
- `importProfileFromFile()` → abre diálogo nativo de abrir, parseia e valida JSON, retorna `MappingProfile | null`
- Manter funções legadas `loadMappings`/`saveMappings`/`loadAngleMappings`/`saveAngleMappings` (ainda usadas pelos handlers antigos — serão removidas em T4)

**Where:** `src/main/persistence.ts`
**Depends on:** T1
**Reqs:** PROF-01, PROF-02, PROF-03, PROF-04, PROF-05, PROF-06, PROF-07

**Export file schema:**
```json
{
  "version": 1,
  "exportedAt": "2025-01-01T00:00:00.000Z",
  "profile": { "name": "...", "mappings": [...], "angleMappings": [...] }
}
```

**Done when:** Todas as funções exportadas, build sem erros
**Status:** ✅ Done

---

## T3 — IPC channel types

**What:** Adicionar canais de perfil ao `src/shared/ipc.ts`
**Where:** `src/shared/ipc.ts`
**Depends on:** T1
**Reqs:** PROF-01 a PROF-07

Canais a adicionar em `IpcInvokeMap`:
```typescript
'profiles:load-all':  { args: []; result: MappingProfile[] }
'profiles:set-active':{ args: [id: string]; result: void }
'profiles:create':    { args: [name: string]; result: MappingProfile }
'profiles:update':    { args: [profile: MappingProfile]; result: void }
'profiles:delete':    { args: [id: string]; result: string } // returns new activeProfileId
'profiles:export':    { args: [id: string]; result: boolean } // false = user cancelled
'profiles:import':    { args: []; result: MappingProfile | null } // null = cancelled/error
```

**Done when:** Tipos adicionados, build sem erros
**Status:** ✅ Done

---

## T4 — IPC handlers + remove legacy handlers

**What:** Registrar novos handlers em `src/main/ipc-handlers.ts`; remover handlers legados `mappings:load`, `mappings:save`, `angle-mappings:load`, `angle-mappings:save` (substituídos por profiles:*)
**Where:** `src/main/ipc-handlers.ts`
**Depends on:** T2, T3

Handlers a adicionar:
- `profiles:load-all` → `persistence.loadAllProfiles()`
- `profiles:set-active` → `persistence.setActiveProfileId(id)`
- `profiles:create` → cria `MappingProfile` com UUID, `createdAt`, listas vazias, salva
- `profiles:update` → atualiza perfil na lista por id, salva
- `profiles:delete` → remove da lista, seleciona novo ativo, salva
- `profiles:export` → `persistence.exportProfileToFile(profile)`
- `profiles:import` → `persistence.importProfileFromFile()`

**Done when:** Handlers registrados, sem erros de build
**Status:** ✅ Done

---

## T5 — MappingScreen.tsx — Profile UI

**What:** Adicionar UI de perfis ao `src/renderer/src/screens/MappingScreen.tsx`
**Where:** `src/renderer/src/screens/MappingScreen.tsx`
**Depends on:** T3, T4, T6

Mudanças:
1. **State:** trocar `mappings`+`angleMappings` por `profiles: MappingProfile[]` + `activeProfile: MappingProfile | null`
2. **Load:** substituir `mappings:load`+`angle-mappings:load` por `profiles:load-all`; definir perfil ativo pelo `activeProfileId`
3. **Save:** substituir `mappings:save`+`angle-mappings:save` por `profiles:update` (salva perfil inteiro)
4. **Header:** adicionar dropdown de seleção de perfil com nome do perfil ativo
5. **Dropdown actions:** criar (→ T6 dialog), renomear (→ T6 dialog), deletar (→ DeleteConfirmDialog existente), exportar, importar
6. **Passar** `mappings` e `angleMappings` do `activeProfile` para o restante da UI (sem mudar props de VisualMappingView)

**Done when:** Perfis funcionando end-to-end; build sem erros
**Status:** Pending

---

## T6 — ProfileNameDialog component

**What:** Componente de diálogo reutilizável para criar e renomear perfis
**Where:** `src/renderer/src/components/ProfileNameDialog.tsx`
**Reqs:** PROF-02, PROF-04

```typescript
interface Props {
  mode: 'create' | 'rename'
  initialName?: string
  onConfirm: (name: string) => void
  onCancel: () => void
}
```

- Input de texto com foco automático
- Validação: nome não pode ser vazio
- Submit por Enter ou botão "Confirmar"
- Reusa `Modal` existente

**Done when:** Componente funcional, sem erros de build
**Status:** Pending
