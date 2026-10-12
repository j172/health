type HeaderInfo = {
  title: string;
  subtitle: string;
  description: string;
};

// Previously animated via framer-motion's `motion.div` (fade + slide-up on
// mount, 250ms, ease [0.16,1,0.3,1]). Replaced with the CSS-only
// `.section-header-reveal` utility (app/globals.css) — same visual effect,
// including a `prefers-reduced-motion` fallback the framer-motion version
// never had — and no client JS needed, so this is a plain server component
// now (issue #479).
const SectionHeader = ({ headerInfo }: { headerInfo: HeaderInfo }) => {
  const { title, subtitle, description } = headerInfo;

  return (
    <>
      {/* <!-- Section Title Start --> */}
      <div className="section-header-reveal mx-auto text-center">
        <div className="mb-4 inline-block rounded-full bg-zumthor px-4.5 py-1.5 dark:border dark:border-strokedark dark:bg-blacksection">
          <span className="text-sectiontitle font-medium text-black dark:text-white">
            {title}
          </span>
        </div>
        <h2 className="mx-auto mb-4 text-3xl font-bold text-black dark:text-white md:w-4/5 xl:w-1/2 xl:text-sectiontitle3">
          {subtitle}
        </h2>
        <p className="mx-auto md:w-4/5 lg:w-3/5 xl:w-[46%]">{description}</p>
      </div>
      {/* <!-- Section Title End --> */}
    </>
  );
};

export default SectionHeader;
