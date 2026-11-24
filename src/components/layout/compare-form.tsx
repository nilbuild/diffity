import { useState } from 'react';
import { useBranches } from '../../hooks/use-repo-state';
import { cn } from '../../lib/cn';
import { buttonGhost, buttonPrimary, inputField } from '../ui/button-styles';
import { SwapIcon } from '../ui/icon';

function RefInput(props: { value: string; onChange: (value: string) => void; placeholder: string; options: string[]; autoFocus?: boolean }) {
  const { value, onChange, placeholder, options, autoFocus } = props;
  const [focused, setFocused] = useState(false);
  const [active, setActive] = useState(0);
  const needle = value.trim().toLowerCase();
  const suggestions = options.filter((option) => option.toLowerCase().includes(needle) && option !== value).slice(0, 6);
  const show = focused && needle.length > 0 && suggestions.length > 0;

  return (
    <div className="relative flex-1 min-w-0">
      <input
        autoFocus={autoFocus}
        type="text"
        value={value}
        onChange={(event) => {
          onChange(event.target.value);
          setActive(0);
        }}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onKeyDown={(event) => {
          if (!show) {
            return;
          }
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setActive((index) => Math.min(index + 1, suggestions.length - 1));
            return;
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            setActive((index) => Math.max(index - 1, 0));
            return;
          }
          if (event.key === 'Tab' || (event.key === 'Enter' && needle && suggestions[active])) {
            event.preventDefault();
            onChange(suggestions[active]);
          }
        }}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        className={cn(inputField, 'font-mono text-xs')}
      />
      {show && (
        <ul className="absolute left-0 right-0 top-full mt-1 z-10 p-1 bg-overlay rounded-md ring-1 ring-overlay-border">
          {suggestions.map((option, index) => (
            <li key={option}>
              <button
                type="button"
                onMouseDown={(event) => {
                  event.preventDefault();
                  onChange(option);
                }}
                onMouseEnter={() => setActive(index)}
                className={cn(
                  'flex items-center w-full h-7 px-2 rounded text-left font-mono text-xs text-text truncate cursor-pointer',
                  index === active && 'bg-hover',
                )}
              >
                {option}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Base and Compare fields for picking any two refs; `onCompare` gets the trimmed pair (Compare defaults to HEAD). */
export function CompareForm(props: { defaultBase: string | null; defaultHead?: string; onCompare: (base: string, head: string) => void }) {
  const { defaultBase, defaultHead = 'HEAD', onCompare } = props;
  const { data: branches } = useBranches();
  const [base, setBase] = useState('');
  const [head, setHead] = useState(defaultHead);
  const effectiveBase = base.trim() || defaultBase || '';
  const refOptions = ['HEAD', ...(branches ?? []).map((branch) => branch.name)];

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        if (!effectiveBase) {
          return;
        }
        onCompare(effectiveBase, head.trim() || 'HEAD');
      }}
    >
      <div className="text-[13px] font-medium text-text">Compare changes</div>
      <p className="mt-0.5 mb-3 text-xs text-text-secondary">The changes Compare has on top of Base, the way a pull request shows them.</p>
      <div className="grid grid-cols-[56px_minmax(0,1fr)] items-center gap-x-2 gap-y-2">
        <span className="text-xs text-text-secondary">Base</span>
        <RefInput autoFocus value={base} onChange={setBase} placeholder={defaultBase ?? 'branch, tag or commit'} options={refOptions} />
        <span className="text-xs text-text-secondary">Compare</span>
        <RefInput value={head} onChange={setHead} placeholder="HEAD" options={refOptions} />
      </div>
      <div className="flex items-center justify-between mt-3">
        <button
          type="button"
          className={cn(buttonGhost, 'h-7 -ml-2 px-2 text-xs')}
          title="Swap base and compare"
          onClick={() => {
            const nextBase = head.trim() || 'HEAD';
            setHead(effectiveBase);
            setBase(nextBase);
          }}
        >
          <SwapIcon className="w-3.5 h-3.5" />
          Swap
        </button>
        <button type="submit" disabled={!effectiveBase} className={buttonPrimary}>
          Compare
        </button>
      </div>
    </form>
  );
}
