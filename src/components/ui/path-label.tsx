import { cn } from '../../lib/cn';

interface PathLabelProps {
  path: string;
  className?: string;
  nameClassName?: string;
}

export function splitPath(path: string): { dir: string; name: string } {
  const index = path.lastIndexOf('/');
  if (index === -1) {
    return { dir: '', name: path };
  }
  return { dir: path.slice(0, index + 1), name: path.slice(index + 1) };
}

/** Long paths cut in the middle ("functions/app…/function/main.py") so the folder it starts in and the file stay visible. */
export function PathLabel(props: PathLabelProps) {
  const { path, className, nameClassName } = props;
  const { dir, name } = splitPath(path);
  const parent = dir.slice(0, -1).lastIndexOf('/') + 1;
  const head = dir.slice(0, parent);
  const tail = dir.slice(parent);

  return (
    <span className={cn('flex min-w-0 whitespace-nowrap', className)} title={path}>
      {head && <span className="min-w-0 shrink-[100] truncate text-text-muted">{head}</span>}
      <span className="min-w-0 truncate">
        {tail && <span className="text-text-muted">{tail}</span>}
        <span className={cn('text-text', nameClassName)}>{name}</span>
      </span>
    </span>
  );
}
