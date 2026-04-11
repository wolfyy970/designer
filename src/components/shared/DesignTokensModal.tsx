import Modal from './Modal';
import { DesignTokensKitchenSinkContent } from '../../pages/DesignTokensKitchenSink';

export function DesignTokensModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Design tokens kitchen sink"
      size="2xl"
      zIndexClass="z-[60]"
      maxHeightClass="max-h-[var(--max-height-modal-tall)]"
    >
      <DesignTokensKitchenSinkContent embedded />
    </Modal>
  );
}
