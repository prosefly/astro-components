import { defineLotusConfig } from '@prosefly/astro-theme-lotus';

export default defineLotusConfig({
  name: 'Astro Components',
  description: 'Reusable Astro components for MDX content.',
  favicon: '/prosefly-mark.svg',
  logo: '/prosefly-mark.svg',
  docsBase: '/docs/',
  navbar: [
    { label: 'Docs', href: '/docs/' },
    { label: 'Sponsors', href: '/sponsors/' },
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
        'package-manager-tabs',
        'images',
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
          { label: 'Package manager tabs', href: '/docs/package-manager-tabs/' },
          { label: 'Images', href: '/docs/images/' },
          { label: 'Styling', href: '/docs/styling/' },
        ],
      },
      {
        title: 'Projects',
        links: [
          {
            label: 'Lotus',
            href: 'https://astro-theme-lotus.prosefly.dev',
            external: true,
          },
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
          { label: 'Sponsors', href: '/sponsors/' },
        ],
      },
    ],
  },
});
