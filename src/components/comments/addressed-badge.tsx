import { SparkleIcon } from '../ui/icon';

/** An agent handled this comment; it stays open until you check it and resolve it. */
export function AddressedBadge(props: { agent: string }) {
  const { agent } = props;

  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-claude/12 text-claude shrink-0"
      title={`${agent} made the change or answered. Check it, then resolve it.`}
    >
      <SparkleIcon className="w-2.5 h-2.5" />
      Addressed by {agent}
    </span>
  );
}
