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

export function PathLabel(props: PathLabelProps) {
  const { path, className, nameClassName } = props;
  const { dir, name } = splitPath(path);

  return (
    <span className={cn('truncate', className)} title={path}>
      {dir && <span className="text-text-muted">{dir}</span>}
      <span className={cn('text-text', nameClassName)}>{name}</span>
    </span>
  );
}
