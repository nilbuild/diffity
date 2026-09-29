import { Spinner } from '../icons/spinner';

export function PageLoader() {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-bg/60 backdrop-blur-sm">
      <Spinner className="w-8 h-8" />
    </div>
  );
}
