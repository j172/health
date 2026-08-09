"use client";
import { Blog } from "@/types/blog";
import { motion } from "framer-motion";
import Image from "next/image";
import Link from "next/link";

const BlogItem = ({ blog }: { blog: Blog }) => {
  const { mainImage, title, metadata, href } = blog;
  const targetHref = href || "/blog/blog-details";
  const imageSrc = mainImage || "/images/blog/blog-01.png";

  return (
    <>
      <motion.div
        variants={{
          hidden: {
            opacity: 0,
            y: -20,
          },

          visible: {
            opacity: 1,
            y: 0,
          },
        }}
        initial="hidden"
        whileInView="visible"
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
        viewport={{ once: true }}
        className="animate_top btn-press overflow-hidden rounded-lg bg-white p-4 pb-9 shadow-solid-8 dark:bg-blacksection"
      >
        <Link href={targetHref} className="group relative block aspect-368/239 overflow-hidden rounded-md">
          <Image
            src={imageSrc}
            alt={title}
            fill
            className="object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
          />
        </Link>

        <div className="px-4">
          <h3 className="mb-3.5 mt-7.5 line-clamp-2 inline-block text-lg font-medium text-black duration-300 hover:text-primary dark:text-white dark:hover:text-primary xl:text-itemtitle2">
            <Link href={targetHref}>
              {`${title.slice(0, 40)}...`}
            </Link>
          </h3>
          <p className="line-clamp-3">{metadata}</p>
        </div>
      </motion.div>
    </>
  );
};

export default BlogItem;
