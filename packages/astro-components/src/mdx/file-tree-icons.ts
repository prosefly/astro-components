import type { FileTreeEntry } from './rehype-file-tree';

export type FileTreeIconSet = 'lucide' | 'vscode-icons';

interface FileTreeIcon {
  closed?: string;
  dark?: string;
  light?: string;
  name: string;
  open?: string;
}

const lucideIcons = {
  directory: {
    closed: 'lucide:folder',
    name: 'lucide:folder',
    open: 'lucide:folder-open',
  },
  file: {
    name: 'lucide:file',
  },
} satisfies Record<string, FileTreeIcon>;

const vscodeFileIcon = {
  name: 'vscode-icons:default-file',
} satisfies FileTreeIcon;

const vscodeExactFileIcons = [
  [/^package\.json$/i, 'vscode-icons:file-type-npm'],
  [/^(package-lock\.json|npm-shrinkwrap\.json)$/i, 'vscode-icons:file-type-npm'],
  [/^tsconfig(?:\.[\w-]+)?\.json$/i, 'vscode-icons:file-type-tsconfig'],
  [
    /^astro\.config\.[cm]?[jt]s$/i,
    {
      dark: 'vscode-icons:file-type-astro',
      light: 'vscode-icons:file-type-light-astro',
      name: 'vscode-icons:file-type-astro',
    },
  ],
  [
    /^vite\.config\.[cm]?[jt]s$/i,
    {
      dark: 'vscode-icons:file-type-vite',
      light: 'vscode-icons:file-type-light-vite',
      name: 'vscode-icons:file-type-vite',
    },
  ],
  [
    /^vitest\.config\.[cm]?[jt]s$/i,
    {
      dark: 'vscode-icons:file-type-vitest',
      light: 'vscode-icons:file-type-light-vitest',
      name: 'vscode-icons:file-type-vitest',
    },
  ],
  [/^tailwind\.config\.[cm]?[jt]s$/i, 'vscode-icons:file-type-tailwind'],
  [/^eslint\.config\.[cm]?[jt]s$/i, 'vscode-icons:file-type-eslint'],
  [/^\.eslint(?:rc)?(?:\.[cm]?[jt]s|\.json|\.ya?ml)?$/i, 'vscode-icons:file-type-eslint'],
  [/^prettier\.config\.[cm]?[jt]s$/i, 'vscode-icons:file-type-prettier'],
  [/^\.prettierrc(?:\.[cm]?[jt]s|\.json|\.ya?ml)?$/i, 'vscode-icons:file-type-prettier'],
  [/^\.prettierignore$/i, 'vscode-icons:file-type-prettier'],
  [/^\.git(?:ignore|attributes|modules)$/i, 'vscode-icons:file-type-git'],
  [/^dockerfile$/i, 'vscode-icons:file-type-docker'],
] as const;

const vscodeExtensionIcons = [
  [
    /\.astro$/i,
    {
      dark: 'vscode-icons:file-type-astro',
      light: 'vscode-icons:file-type-light-astro',
      name: 'vscode-icons:file-type-astro',
    },
  ],
  [/\.(tsx|jsx)$/i, 'vscode-icons:file-type-reactjs'],
  [/\.(ts|cts|mts)$/i, 'vscode-icons:file-type-typescript'],
  [/\.(js|cjs|mjs)$/i, 'vscode-icons:file-type-js'],
  [/\.vue$/i, 'vscode-icons:file-type-vue'],
  [/\.svelte$/i, 'vscode-icons:file-type-svelte'],
  [
    /\.mdx$/i,
    {
      dark: 'vscode-icons:file-type-mdx',
      light: 'vscode-icons:file-type-light-mdx',
      name: 'vscode-icons:file-type-mdx',
    },
  ],
  [/\.md$/i, 'vscode-icons:file-type-markdown'],
  [
    /\.json$/i,
    {
      dark: 'vscode-icons:file-type-json',
      light: 'vscode-icons:file-type-light-json',
      name: 'vscode-icons:file-type-json',
    },
  ],
  [
    /\.(ya?ml)$/i,
    {
      dark: 'vscode-icons:file-type-yaml',
      light: 'vscode-icons:file-type-light-yaml',
      name: 'vscode-icons:file-type-yaml',
    },
  ],
  [/\.toml$/i, 'vscode-icons:file-type-toml'],
  [/\.css$/i, 'vscode-icons:file-type-css'],
  [/\.scss$/i, 'vscode-icons:file-type-scss'],
  [/\.sass$/i, 'vscode-icons:file-type-sass'],
  [/\.less$/i, 'vscode-icons:file-type-less'],
  [/\.html?$/i, 'vscode-icons:file-type-html'],
  [/\.xml$/i, 'vscode-icons:file-type-xml'],
  [/\.svg$/i, 'vscode-icons:file-type-svg'],
  [/\.(png|jpe?g|gif|webp|avif|ico)$/i, 'vscode-icons:file-type-image'],
] as const;

export const fileTreeComponentIconNames = [
  'lucide:chevron-right',
  lucideIcons.directory.name,
  lucideIcons.directory.open,
  lucideIcons.file.name,
  vscodeFileIcon.name,
  ...vscodeExactFileIcons.flatMap(([, icon]) => getIconNames(icon)),
  ...vscodeExtensionIcons.flatMap(([, icon]) => getIconNames(icon)),
] as const;

export function normalizeFileTreeIconSet(iconSet: string | undefined): FileTreeIconSet {
  return iconSet === 'vscode-icons' ? 'vscode-icons' : 'lucide';
}

export function getFileTreeIcon(entry: FileTreeEntry, iconSet: FileTreeIconSet): FileTreeIcon {
  if (iconSet === 'lucide') {
    return entry.isDirectory ? lucideIcons.directory : lucideIcons.file;
  }

  if (entry.isDirectory) {
    return lucideIcons.directory;
  }

  const name = entry.nameText.trim();

  for (const [pattern, icon] of vscodeExactFileIcons) {
    if (pattern.test(name)) {
      return normalizeIcon(icon);
    }
  }

  for (const [pattern, icon] of vscodeExtensionIcons) {
    if (pattern.test(name)) {
      return normalizeIcon(icon);
    }
  }

  return vscodeFileIcon;
}

function getIconNames(icon: FileTreeIcon | string): string[] {
  return typeof icon === 'string'
    ? [icon]
    : [icon.name, icon.light, icon.dark].filter((name): name is string => Boolean(name));
}

function normalizeIcon(icon: FileTreeIcon | string): FileTreeIcon {
  return typeof icon === 'string' ? { name: icon } : icon;
}
