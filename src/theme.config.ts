import { defineLotusConfig } from '@prosefly/astro-theme-lotus';

export default defineLotusConfig({
  name: 'Astro Components',
  description: 'Reusable Astro components for MDX content.',
  favicon: '/prosefly-mark.svg',
  logo: '/prosefly-mark.svg',
  navbar: [
    { label: 'Docs', href: '/docs/' },
    {
      label: 'GitHub',
      href: 'https://github.com/prosefly/astro-components',
      external: true,
      variant: 'solid',
      trailingIcon: 'lucide:external-link',
    },
  ],
  socials: [
    {
      label: 'GitHub',
      href: 'https://github.com/prosefly/astro-components',
      external: true,
      icon: 'github',
    },
  ],
  appearance: {
    accent: 'emerald',
    gray: 'zinc',
    radius: 'medium',
  },
  source: {
    github: 'prosefly/astro-components',
    branch: 'main',
    contentRoot: 'src/content',
  },
  editLink: true,
  locales: {
    root: {
      label: 'English',
      lang: 'en',
      directory: 'en',
    },
  },
  sidebars: [
    {
      slug: 'guide',
      label: 'Guides',
      icon: 'lucide:rocket',
      items: [
        'overview',
        'installation',
        'markdown',
        'styling',
      ],
    },
    {
      label: 'Components',
      icon: 'lucide:blocks',
      items: [{ autogenerate: { directory: 'components' } }],
    },
  ],
  footer: {
    copyright: 'Copyright © 2026 Prosefly.',
    sections: [
      {
        title: 'Package',
        links: [
          { label: 'Installation', href: '/docs/installation/' },
          { label: 'Markdown transforms', href: '/docs/markdown/' },
          { label: 'Styling', href: '/docs/styling/' },
        ],
      },
      {
        title: 'Community',
        links: [
          {
            label: 'GitHub',
            href: 'https://github.com/prosefly/astro-components',
            external: true,
          },
        ],
      },
    ],
  },
});
