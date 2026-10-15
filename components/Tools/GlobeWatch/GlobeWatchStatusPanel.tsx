import Image from "next/image";
import LoadingOrb from "@/components/ui/LoadingOrb";

/**
 * Issue #587 (parent #583): the shared visual used for every non-interactive
 * state of the globe frame — before MapLibre has loaded ("loading") and when
 * WebGL isn't available at all ("unsupported", AC: 退回文字說明). Both reuse
 * the exact same pre-generated static SVG (public/images/tools/
 * global-watch-placeholder.svg — not rendered at request time, per #583's
 * Out of Scope note that this host can't do server-side WASM map rendering)
 * so the globe's outer frame never visibly changes shape between states,
 * which is what actually prevents CLS — see GlobeWatchClient.tsx's fixed
 * `aspect-[16/10]` wrapper, which this panel fills regardless of variant.
 *
 * Issue #598 added "unconfigured": the 全球空品 item's own failure mode when
 * `WAQI_TOKEN` isn't set server-side (see lib/server/config/env.ts's
 * `waqiToken` field) — distinct from "unsupported" (a device/browser
 * limitation) but visually treated the same (dimmed placeholder, no spinner)
 * since both are "nothing will load here" states rather than transient ones.
 */
export default function GlobeWatchStatusPanel({
  variant,
  message,
}: {
  variant: "loading" | "unsupported" | "unconfigured";
  message: string;
}) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-slate-100 px-6 text-center dark:bg-slate-900">
      <Image
        src="/images/tools/global-watch-placeholder.svg"
        alt=""
        width={640}
        height={400}
        className={`h-auto w-40 max-w-[55%] ${variant !== "loading" ? "opacity-50 grayscale" : "opacity-90"}`}
        priority={false}
      />
      <p className="max-w-sm text-sm text-slate-500 dark:text-slate-400">{message}</p>
      {variant === "loading" && <LoadingOrb size={18} />}
    </div>
  );
}
