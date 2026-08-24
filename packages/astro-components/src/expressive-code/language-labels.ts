const languageDisplayNames: Record<string, string> = {
  bash: 'bash',
  cjs: 'commonjs',
  cpp: 'c++',
  cs: 'c#',
  js: 'javascript',
  jsx: 'javascript jsx',
  kt: 'kotlin',
  md: 'markdown',
  mjs: 'javascript',
  py: 'python',
  rb: 'ruby',
  rs: 'rust',
  sh: 'shell',
  ts: 'typescript',
  tsx: 'typescript jsx',
  yml: 'yaml',
  zsh: 'z shell',
};

export function getLanguageDisplayName(
  language: string | undefined,
): string | undefined {
  const normalizedLanguage = language?.trim();

  if (!normalizedLanguage) {
    return undefined;
  }

  return (
    languageDisplayNames[normalizedLanguage.toLowerCase()] ?? normalizedLanguage
  );
}
