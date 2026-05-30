import { useEffect, useRef, useState } from 'react'
import Modal from './Modal'

interface Props {
  mode: 'create' | 'rename'
  initialName?: string
  onConfirm: (name: string) => void
  onCancel: () => void
}

export default function ProfileNameDialog({ mode, initialName = '', onConfirm, onCancel }: Props) {
  const [name, setName] = useState(initialName)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const trimmed = name.trim()
    if (trimmed) onConfirm(trimmed)
  }

  const title = mode === 'create' ? 'Novo perfil' : 'Renomear perfil'

  return (
    <Modal title={title} onClose={onCancel}>
      <form onSubmit={handleSubmit} className="p-5 space-y-4">
        <div>
          <label className="block text-xs font-medium text-slate-600 mb-1">Nome do perfil</label>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex: FPS, RPG, Plataforma..."
            maxLength={64}
            className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-sm rounded-lg border border-slate-300 hover:bg-slate-50 transition-colors"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={!name.trim()}
            className="px-4 py-2 text-sm rounded-lg bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {mode === 'create' ? 'Criar' : 'Renomear'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
