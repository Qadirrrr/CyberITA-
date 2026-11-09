import { useState } from 'react';
import { Button, Modal } from './ui';

// Shared in-app confirmation popup. It replaces the browser's window.confirm,
// which shows the raw server address and looks nothing like the product.
// Usage:
//   const [confirmNode, askConfirm] = useConfirm();
//   if (!(await askConfirm({ title: 'Delete lab?', message: '...', confirmLabel: 'Delete lab', danger: true }))) return;
//   ...and render {confirmNode} anywhere inside the component's JSX.
export function useConfirm() {
  const [dialog, setDialog] = useState(null);

  const askConfirm = ({ title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', danger = false }) =>
    new Promise((resolve) => {
      setDialog({ title, message, confirmLabel, cancelLabel, danger, resolve });
    });

  const close = (result) => {
    if (dialog) dialog.resolve(result);
    setDialog(null);
  };

  const node = (
    <Modal
      open={Boolean(dialog)}
      onClose={() => close(false)}
      title={dialog?.title || 'Are you sure?'}
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={() => close(false)}>
            {dialog?.cancelLabel || 'Cancel'}
          </Button>
          <Button variant={dialog?.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
            {dialog?.confirmLabel || 'Confirm'}
          </Button>
        </>
      }
    >
      <p className="text-sm leading-6 text-slate-600 dark:text-slate-300">{dialog?.message}</p>
    </Modal>
  );

  return [node, askConfirm];
}
