import Image from 'next/image';

export const Logo = () => {
  return <Image
    // src='/thousand-birds-logo.webp'
    src='/tblogo2-small.png'
    alt='Thousand Birds Logo'
    width={150}
    height={150}
    className='mx-auto rounded-2xl'
  />
}