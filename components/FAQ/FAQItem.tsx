type FaqData = {
  activeFaq: number;
  id: number;
  handleFaqToggle: (id: number) => void;
  quest: string;
  ans: string;
};

const FAQItem = ({ faqData }: { faqData: FaqData }) => {
  const { activeFaq, id, handleFaqToggle, quest, ans } = faqData;
  const isOpen = activeFaq === id;

  return (
    <>
      <div className="flex flex-col border-b border-stroke last-of-type:border-none dark:border-strokedark">
        <button
          onClick={() => {
            handleFaqToggle(id);
          }}
          className="btn-press flex cursor-pointer items-center justify-between px-6 py-5 text-metatitle3 font-medium text-black dark:text-white lg:px-9 lg:py-7.5"
        >
          <span>{quest}</span>

          <span className={`transform transition-transform duration-200 ease-out ${isOpen ? "rotate-45" : ""}`}>
            <svg
              width="18"
              height="18"
              viewBox="0 0 18 18"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M7.83331 7.83337V0.833374H10.1666V7.83337H17.1666V10.1667H10.1666V17.1667H7.83331V10.1667H0.833313V7.83337H7.83331Z"
                fill="currentColor"
              />
            </svg>
          </span>
        </button>
        <div
          className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${
            isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
          }`}
        >
          <div className="overflow-hidden">
            <p className="border-t border-stroke px-6 py-5 dark:border-strokedark lg:px-9 lg:py-7.5">
              {ans}
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default FAQItem;
