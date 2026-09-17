import Image from 'next/image';
import Link from 'next/link';

type Props = {
  href?: string;
  size?: number;
  className?: string;
  priority?: boolean;
};

export function SiteLogo({ href = '/', size = 96, className = '', priority = false }: Props) {
  return (
    <Link
      href={href}
      className={`inline-block shrink-0 overflow-hidden rounded-xl ${className}`}
      aria-label="HustleHunter home"
    >
      <Image
        src="/logo.png"
        alt="HustleHunter"
        width={1024}
        height={973}
        className="block h-auto"
        style={{ width: size }}
        priority={priority}
        unoptimized
      />
    </Link>
  );
}
