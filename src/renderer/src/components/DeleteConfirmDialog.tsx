import Modal from './Modal'

interface Props {
  onConfirm: () => void
  onCancel: () => void
}

export default function DeleteConfirmDialog({ onConfirm, onCancel }: Props) {
  return (
    <Modal title="Remover mapeamento" onClose={onCancel}>
      <div className="p-6 text-center">
        <p className="text-sm text-slate-700">Tem certeza que deseja remover este mapeamento?</p>
      </div>
      <div className="border-t border-slate-200 px-5 py-3 flex justify-end gap-2">
        <button onClick={onCancel} className="btn-secondary">Cancelar</button>
        <button onClick={onConfirm} className="btn-danger">Remover</button>
      </div>
    </Modal>
  )
}
