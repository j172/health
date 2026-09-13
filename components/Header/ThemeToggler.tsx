import { useTheme } from "next-themes";
import Image from "next/image";

const ThemeToggler = () => {
  const { theme, setTheme } = useTheme();

  return (
    <button
      aria-label="theme toggler"
      onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
      className="bg-gray-2 dark:bg-dark-bg absolute right-17 mr-1.5 flex h-9 w-9 cursor-pointer items-center justify-center rounded-full text-black dark:text-white lg:static"
    >
      <Image
        src="/images/icon/icon-moon.svg"
        alt=""
        width={21}
        height={21}
        className="dark:hidden"
      />

      <Image
        src="/images/icon/icon-sun.svg"
        alt=""
        width={22}
        height={22}
        className="hidden dark:block"
      />
    </button>
  );
};

export default ThemeToggler;
