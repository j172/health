// Shared Tailwind class fragments for the /tools calculators — keeps every
// tool visually consistent with this project's neutral-XXX / color-primary
// design language (not the shadcn-style semantic tokens BlueWhale uses).
export const cardClass = "space-y-5 rounded-xl border border-neutral-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900";
export const inputClass =
  "w-full rounded-lg border border-neutral-300 bg-white px-4 py-3 text-neutral-800 focus:border-primary focus:outline-none dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100";
export const labelClass = "mb-2 block text-sm font-medium text-neutral-700 dark:text-slate-200";
export const primaryButtonClass =
  "flex-1 rounded-lg bg-primary py-3 text-base font-semibold text-white transition-colors hover:bg-primaryho";
export const secondaryButtonClass =
  "rounded-lg border border-neutral-300 px-6 py-3 text-neutral-600 transition-colors hover:bg-neutral-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800";
export const toggleButtonClass = (active: boolean): string =>
  `flex-1 rounded-lg border py-2.5 text-sm font-medium transition-colors ${
    active ? "border-primary bg-primary text-white" : "border-neutral-300 text-neutral-700 hover:border-primary/50 dark:border-slate-700 dark:text-slate-300 dark:hover:border-primary/50"
  }`;
export const disclaimerClass = "px-4 text-center text-xs text-neutral-500 dark:text-slate-400";
