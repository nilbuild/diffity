import { useState, type ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { inputField } from '../../components/ui/button-styles';

/** Emojis offered for a project or group, with the words that find them. */
export const EMOJIS: [string, string][] = [
  ['🛒', 'cart shop store commerce checkout'],
  ['💳', 'card pay payment billing stripe'],
  ['💰', 'money bag finance revenue'],
  ['💵', 'cash dollar money'],
  ['🏦', 'bank finance ledger'],
  ['🧾', 'receipt invoice accounting'],
  ['🏪', 'store shop retail'],
  ['🎁', 'gift present reward'],
  ['📦', 'package box lib sdk monorepo'],
  ['🚚', 'truck ship delivery logistics order'],
  ['✈️', 'plane travel flight trip'],
  ['🚗', 'car auto drive ride'],
  ['🚲', 'bike bicycle'],
  ['🏠', 'home house real estate'],
  ['🏢', 'office building company enterprise'],
  ['🏗️', 'construction build crane'],
  ['🏭', 'factory industry pipeline'],
  ['🏥', 'hospital health medical'],
  ['🏫', 'school education'],
  ['🌐', 'web globe site www internet'],
  ['💻', 'laptop computer code dev'],
  ['🖥️', 'desktop monitor computer app'],
  ['⌨️', 'keyboard typing input'],
  ['📱', 'mobile phone ios android app'],
  ['⚙️', 'gear settings api server backend config'],
  ['🛠️', 'tools cli utility devtool'],
  ['🔧', 'wrench fix tool'],
  ['🔨', 'hammer build'],
  ['🧰', 'toolbox kit'],
  ['🧩', 'puzzle plugin extension addon widget'],
  ['🔌', 'plug connector integration'],
  ['🔋', 'battery power energy'],
  ['💾', 'floppy save disk'],
  ['🗄️', 'cabinet database db storage'],
  ['☁️', 'cloud infra deploy hosting'],
  ['🛰️', 'satellite network'],
  ['📡', 'antenna signal network'],
  ['🤖', 'robot ai bot agent llm'],
  ['🧠', 'brain ai ml mind'],
  ['🐛', 'bug debug issue'],
  ['🧪', 'test tube lab experiment qa'],
  ['🔬', 'microscope science research'],
  ['🔭', 'telescope explore observe'],
  ['🧬', 'dna bio genetics'],
  ['🔒', 'lock auth security private'],
  ['🔑', 'key auth secret access'],
  ['🛡️', 'shield security protect'],
  ['🚀', 'rocket launch ship fast'],
  ['⚡', 'bolt fast lightning power'],
  ['🔥', 'fire hot'],
  ['✨', 'sparkles magic new shiny'],
  ['⭐', 'star favorite'],
  ['🌟', 'glowing star shine'],
  ['💡', 'idea bulb light'],
  ['🎯', 'target goal focus'],
  ['📈', 'chart up growth analytics'],
  ['📊', 'chart bar data analytics metrics dashboard'],
  ['📉', 'chart down decline'],
  ['🧮', 'abacus math calculate'],
  ['🗂️', 'dividers organize files'],
  ['📁', 'folder files directory'],
  ['📝', 'memo note write blog cms'],
  ['📚', 'books docs library wiki'],
  ['📖', 'book read guide manual'],
  ['📄', 'page document file'],
  ['📋', 'clipboard tasks list'],
  ['📌', 'pin pinned important'],
  ['📎', 'paperclip attach'],
  ['✏️', 'pencil edit draw'],
  ['🔍', 'search find magnify'],
  ['🏷️', 'label tag price'],
  ['🔔', 'bell notification alert'],
  ['📣', 'megaphone announce marketing'],
  ['✉️', 'mail email envelope newsletter'],
  ['💬', 'chat message speech support'],
  ['📞', 'phone call telephone'],
  ['🔗', 'link url chain'],
  ['🧱', 'brick block building'],
  ['🧭', 'compass navigation direction'],
  ['🗺️', 'map geo location'],
  ['📅', 'calendar date schedule'],
  ['⏱️', 'stopwatch timer time'],
  ['🍕', 'pizza food'],
  ['🍔', 'burger food'],
  ['☕', 'coffee cafe java'],
  ['🍩', 'donut food sweet'],
  ['🍎', 'apple fruit'],
  ['🥑', 'avocado food'],
  ['🍪', 'cookie biscuit'],
  ['🍺', 'beer drink'],
  ['🎨', 'palette design ui art theme'],
  ['🎮', 'game controller play'],
  ['🎲', 'dice game random'],
  ['🎵', 'music note audio sound'],
  ['🎧', 'headphones audio podcast'],
  ['🎙️', 'microphone podcast voice'],
  ['🎬', 'clapper video film movie'],
  ['📷', 'camera photo image'],
  ['🎥', 'movie camera video'],
  ['📺', 'tv television stream'],
  ['🎓', 'graduation learn course edu'],
  ['🏆', 'trophy win award'],
  ['⚽', 'soccer football sport'],
  ['🏀', 'basketball sport'],
  ['🌱', 'seedling plant grow new'],
  ['🌳', 'tree nature'],
  ['🌵', 'cactus desert'],
  ['🌸', 'blossom flower'],
  ['🌻', 'sunflower flower'],
  ['🍀', 'clover luck'],
  ['🌊', 'wave ocean water'],
  ['☀️', 'sun day weather'],
  ['🌙', 'moon night dark'],
  ['🌈', 'rainbow colour'],
  ['❄️', 'snowflake cold ice'],
  ['🌍', 'earth world globe'],
  ['🏔️', 'mountain peak'],
  ['🪐', 'planet space saturn'],
  ['🐶', 'dog puppy animal'],
  ['🐱', 'cat kitten animal'],
  ['🦊', 'fox animal'],
  ['🐻', 'bear animal'],
  ['🐼', 'panda animal'],
  ['🦁', 'lion animal'],
  ['🐸', 'frog animal'],
  ['🐙', 'octopus animal'],
  ['🦄', 'unicorn magic'],
  ['🐝', 'bee animal busy'],
  ['🦋', 'butterfly animal'],
  ['🐢', 'turtle slow animal'],
  ['🐳', 'whale docker animal'],
  ['🦉', 'owl animal wise'],
  ['🐧', 'penguin linux animal'],
  ['🦀', 'crab rust animal'],
  ['🐍', 'snake python animal'],
  ['❤️', 'heart red love'],
  ['🧡', 'heart orange'],
  ['💛', 'heart yellow'],
  ['💚', 'heart green'],
  ['💙', 'heart blue'],
  ['💜', 'heart purple'],
  ['🖤', 'heart black'],
  ['💎', 'gem diamond ruby premium'],
  ['👑', 'crown king queen'],
  ['✅', 'check done tick'],
  ['⚠️', 'warning caution'],
  ['♻️', 'recycle reuse'],
];

/** A choice shown before the emojis, like initials or a logo. */
export interface IconChoice {
  key: string;
  label: ReactNode;
  title: string;
  selected: boolean;
  onPick: () => void;
}

export function EmojiGrid(props: { value: string | null; choices: IconChoice[]; onPick: (emoji: string) => void; className?: string }) {
  const { value, choices, onPick, className } = props;
  const [query, setQuery] = useState('');
  const words = query.trim().toLowerCase();
  const shown = words ? EMOJIS.filter(([emoji, keywords]) => emoji === words || keywords.includes(words)) : EMOJIS;

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search emoji"
        aria-label="Search emoji"
        autoFocus
        spellCheck={false}
        className={cn(inputField, 'text-[12px]')}
      />
      <div role="listbox" aria-label="Icon" className="grid grid-cols-8 gap-0.5 max-h-[178px] overflow-y-auto">
        {!words && choices.map((choice) => (
          <button
            key={choice.key}
            type="button"
            role="option"
            aria-selected={choice.selected}
            onClick={choice.onPick}
            title={choice.title}
            className={cn('h-8 flex items-center justify-center rounded-md text-[11px] font-semibold text-text-secondary hover:bg-fill-hover cursor-pointer', choice.selected && 'bg-selected text-text')}
          >
            {choice.label}
          </button>
        ))}
        {shown.map(([emoji, keywords]) => (
          <button
            key={emoji}
            type="button"
            role="option"
            aria-selected={emoji === value}
            onClick={() => onPick(emoji)}
            title={keywords.split(' ')[0]}
            className={cn('h-8 rounded-md text-[18px] leading-none hover:bg-fill-hover cursor-pointer', emoji === value && 'bg-selected')}
          >
            {emoji}
          </button>
        ))}
      </div>
      {shown.length === 0 && <p className="m-0 py-3 text-center text-xs text-text-muted">No emoji matches “{query.trim()}”</p>}
    </div>
  );
}
