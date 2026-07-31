export type Menu = {
  id: number;
  title: string;
  titleKey?: string;
  path?: string;
  newTab: boolean;
  submenu?: Menu[];
};
