import Image from "next/image";
import { cn } from "@/lib/utils/cn";

// Marca Ninja Food — espejo del components/brand/Logo del POS.

/** Isotipo Ninja-Soft (hoja ninja). */
export function Isotype({
  className,
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <Image
      src="/img/ninja-soft-isotype.webp"
      alt="Ninja-Soft"
      width={64}
      height={80}
      priority={priority}
      className={cn("w-auto", className)}
    />
  );
}

/** Wordmark Ninja Food con swap automático según tema (dark/light). */
export function WordmarkFood({
  className,
  priority = false,
}: {
  className?: string;
  priority?: boolean;
}) {
  return (
    <>
      <Image
        src="/img/ninja-food-dark-mode.webp"
        alt="Ninja Food"
        width={280}
        height={66}
        priority={priority}
        className={cn("wordmark-on-dark w-auto", className)}
      />
      <Image
        src="/img/ninja-food-light-mode.webp"
        alt="Ninja Food"
        width={280}
        height={66}
        priority={priority}
        className={cn("wordmark-on-light w-auto", className)}
      />
    </>
  );
}
