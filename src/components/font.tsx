import localFont from "next/font/local";

export const berkeleyMono = localFont({
  src: [
    {
      path: '../../public/fonts/BerkeleyMono-Regular.woff2',
      weight: '400',
      style: 'normal',
    },
    {
      path: '../../public/fonts/BerkeleyMono-Italic.woff2',
      weight: '400',
      style: 'italic',
    },
    {
      path: '../../public/fonts/BerkeleyMono-Bold.woff2',
      weight: '700',
      style: 'normal',
    },
    {
      path: '../../public/fonts/BerkeleyMono-BoldItalic.woff2',
      weight: '700',
      style: 'italic',
    },
  ],
})

