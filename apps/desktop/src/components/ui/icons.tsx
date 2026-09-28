import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function createIcon(paths: string[], displayName: string) {
  function Icon(props: IconProps) {
    const { size = 16, ...rest } = props;
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        {...rest}
      >
        {paths.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    );
  }
  Icon.displayName = displayName;
  return Icon;
}

export const ChevronDownIcon = createIcon(['m6 9 6 6 6-6'], 'ChevronDownIcon');
export const ChevronRightIcon = createIcon(['m9 18 6-6-6-6'], 'ChevronRightIcon');
export const ChevronUpIcon = createIcon(['m18 15-6-6-6 6'], 'ChevronUpIcon');
export const ChevronsDownUpIcon = createIcon(['m7 20 5-5 5 5', 'm7 4 5 5 5-5'], 'ChevronsDownUpIcon');
export const ChevronsUpDownIcon = createIcon(['m7 15 5 5 5-5', 'm7 9 5-5 5 5'], 'ChevronsUpDownIcon');
export const FolderIcon = createIcon(
  ['M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z'],
  'FolderIcon',
);
export const FileIcon = createIcon(
  ['M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z', 'M14 2v4a2 2 0 0 0 2 2h4'],
  'FileIcon',
);
export const SearchIcon = createIcon(['m21 21-4.3-4.3', 'M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16Z'], 'SearchIcon');
export const SettingsIcon = createIcon(
  [
    'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2Z',
    'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z',
  ],
  'SettingsIcon',
);
export const SparklesIcon = createIcon(
  [
    'M9.94 14.06 8 20l-1.94-5.94L0 12l6.06-1.94L8 4l1.94 6.06L16 12Z',
    'M19 3v4',
    'M21 5h-4',
    'M20 16v4',
    'M22 18h-4',
  ],
  'SparklesIcon',
);
export const CommentIcon = createIcon(['M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z'], 'CommentIcon');
export const CheckIcon = createIcon(['M20 6 9 17l-5-5'], 'CheckIcon');
export const CheckCircleIcon = createIcon(['M22 11.08V12a10 10 0 1 1-5.93-9.14', 'm9 11 3 3L22 4'], 'CheckCircleIcon');
export const CopyIcon = createIcon(
  ['M8 8h12a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H10a2 2 0 0 1-2-2Z', 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2'],
  'CopyIcon',
);
export const CodeIcon = createIcon(['m16 18 6-6-6-6', 'm8 6-6 6 6 6'], 'CodeIcon');
export const UndoIcon = createIcon(['M3 7v6h6', 'M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13'], 'UndoIcon');
export const EyeIcon = createIcon(
  ['M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z', 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z'],
  'EyeIcon',
);
export const ColumnsIcon = createIcon(['M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z', 'M12 3v18'], 'ColumnsIcon');
export const RowsIcon = createIcon(['M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z', 'M3 12h18'], 'RowsIcon');
export const PilcrowIcon = createIcon(['M13 4v16', 'M17 4v16', 'M19 4H9.5a4.5 4.5 0 0 0 0 9H13'], 'PilcrowIcon');
export const PanelRightIcon = createIcon(['M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z', 'M15 3v18'], 'PanelRightIcon');
export const XIcon = createIcon(['M18 6 6 18', 'm6 6 12 12'], 'XIcon');
export const PlusIcon = createIcon(['M12 5v14', 'M5 12h14'], 'PlusIcon');
export const TrashIcon = createIcon(
  ['M3 6h18', 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6', 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2'],
  'TrashIcon',
);
export const PencilIcon = createIcon(['M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z'], 'PencilIcon');
export const RefreshIcon = createIcon(
  ['M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8', 'M21 3v5h-5', 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16', 'M8 16H3v5'],
  'RefreshIcon',
);
export const GitBranchIcon = createIcon(
  ['M6 3v12', 'M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M18 9a9 9 0 0 1-9 9'],
  'GitBranchIcon',
);
export const GitCommitIcon = createIcon(['M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M3 12h6', 'M15 12h6'], 'GitCommitIcon');
export const KeyboardIcon = createIcon(
  ['M4 5h16a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2Z', 'M6 9h.01', 'M10 9h.01', 'M14 9h.01', 'M18 9h.01', 'M7 15h10'],
  'KeyboardIcon',
);
export const FilterIcon = createIcon(['M22 3H2l8 9.46V19l4 2v-8.54Z'], 'FilterIcon');
export const ImageIcon = createIcon(
  ['M5 3h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z', 'M9 11a2 2 0 1 0 0-4 2 2 0 0 0 0 4Z', 'm21 15-3.09-3.09a2 2 0 0 0-2.82 0L6 21'],
  'ImageIcon',
);
export const AlertIcon = createIcon(
  ['m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3', 'M12 9v4', 'M12 17h.01'],
  'AlertIcon',
);
export const ArrowUpIcon = createIcon(['m5 12 7-7 7 7', 'M12 19V5'], 'ArrowUpIcon');
export const ArrowDownIcon = createIcon(['M12 5v14', 'm19 12-7 7-7-7'], 'ArrowDownIcon');
export const SunIcon = createIcon(
  ['M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z', 'M12 2v2', 'M12 20v2', 'm4.93 4.93 1.41 1.41', 'm17.66 17.66 1.41 1.41', 'M2 12h2', 'M20 12h2', 'm6.34 17.66-1.41 1.41', 'm19.07 4.93-1.41 1.41'],
  'SunIcon',
);
export const MoonIcon = createIcon(['M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z'], 'MoonIcon');
export const LightbulbIcon = createIcon(
  ['M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A6 6 0 0 0 6 8c0 1 .2 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5', 'M9 18h6', 'M10 22h4'],
  'LightbulbIcon',
);
export const TextIcon = createIcon(['M4 7V4h16v3', 'M9 20h6', 'M12 4v16'], 'TextIcon');
export const BookIcon = createIcon(
  ['M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20'],
  'BookIcon',
);
export const ListIcon = createIcon(['M8 6h13', 'M8 12h13', 'M8 18h13', 'M3 6h.01', 'M3 12h.01', 'M3 18h.01'], 'ListIcon');
export const MoreIcon = createIcon(['M12 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z', 'M19 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z', 'M5 13a1 1 0 1 0 0-2 1 1 0 0 0 0 2Z'], 'MoreIcon');
export const ExternalLinkIcon = createIcon(['M15 3h6v6', 'M10 14 21 3', 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6'], 'ExternalLinkIcon');
export const PullRequestIcon = createIcon(
  ['M18 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M6 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z', 'M13 6h3a2 2 0 0 1 2 2v7', 'M6 9v12'],
  'PullRequestIcon',
);
