"use client";

/**
 * components/Tools/BodyProfileControls.tsx
 *
 * Shared "記住我的資料" opt-in checkbox + one-click clear button rendered by
 * each of the 12 /tools calculators that use lib/client/useBodyProfile.ts
 * (see issue #474). Kept as one presentational component (props-driven, no
 * hook call of its own) so the wording/behavior stays identical everywhere
 * instead of being hand-duplicated 12 times — each calculator still owns
 * its own useBodyProfile() call so it can read `profile` to pre-fill and
 * call `save()` when its inputs change.
 *
 * Renders nothing when storage isn't available, per issue #474's "裝置儲存
 * 功能不可用時，計算器仍能正常運作、不會壞掉" — there's nothing useful this
 * control can offer in that case, so it disappears rather than showing a
 * checkbox that silently does nothing.
 */

export interface BodyProfileControlsProps {
  remember: boolean;
  isStorageAvailable: boolean;
  onRememberChange: (remember: boolean) => void;
  onClearAll: () => void;
  /** Whether there's currently anything saved worth offering to clear. */
  hasSavedData: boolean;
  /** Unique id suffix so multiple calculators don't collide on the checkbox id if ever rendered twice on one page. */
  idSuffix: string;
}

export default function BodyProfileControls({ remember, isStorageAvailable, onRememberChange, onClearAll, hasSavedData, idSuffix }: BodyProfileControlsProps) {
  if (!isStorageAvailable) return null;

  const checkboxId = `body-profile-remember-${idSuffix}`;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-neutral-300 bg-neutral-50 px-4 py-3 text-sm dark:border-slate-700 dark:bg-slate-800/40">
      <div className="flex items-center gap-2.5">
        <input
          id={checkboxId}
          type="checkbox"
          checked={remember}
          onChange={(e) => onRememberChange(e.target.checked)}
          className="h-4 w-4 accent-primary"
        />
        <label htmlFor={checkboxId} className="cursor-pointer text-neutral-700 dark:text-slate-200">
          記住我的資料（只存在這台裝置，不會上傳）
        </label>
      </div>
      {hasSavedData && (
        <button
          type="button"
          onClick={onClearAll}
          className="text-xs font-medium text-neutral-500 underline hover:text-red-600 dark:text-slate-400 dark:hover:text-red-400"
        >
          一鍵清除已記住的資料
        </button>
      )}
    </div>
  );
}
