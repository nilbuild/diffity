import { cn } from '../../lib/cn';
import { refLabel, useGuideRefs, type GuideRef } from './guide-refs';

const chip = 'px-1 py-0.5 rounded bg-bg-tertiary text-[0.9em] font-mono';

/** A reference to a file or line of the diff; a click opens it there. Plain code when the file is not in the diff. */
export function GuideRefLink(props: { guideRef: GuideRef; className?: string }) {
  const { guideRef, className } = props;
  const refs = useGuideRefs();
  const label = refLabel(guideRef);
  const title = guideRef.line ? `${guideRef.path}:${guideRef.line}` : guideRef.path;

  if (!refs || !refs.has(guideRef.path)) {
    return <code className={cn(chip, className)} title={title}>{label}</code>;
  }
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        refs.open(guideRef);
      }}
      title={`Open ${title} in the diff`}
      className={cn(chip, 'text-accent hover:underline underline-offset-2 cursor-pointer', className)}
    >
      {label}
    </button>
  );
}
