import React from "react";
import SectionHeader from "../Common/SectionHeader";
import BlogItem from "./BlogItem";
import { listLatestNews } from "@/lib/server/news/queries";
import { Blog } from "@/types/blog";

const Blog = async () => {
  const items = await listLatestNews(3);

  const cardImages = [
    "/images/blog/blog-01.png",
    "/images/blog/blog-02.png",
    "/images/blog/blog-03.png",
  ];

  const blogs: Blog[] = items.map((item, idx) => ({
    _id: item.id,
    title: item.title,
    href: `/news/${item.id}`,
    mainImage: cardImages[idx % cardImages.length],
    metadata: `${item.feed_name} ｜ ${item.dept_name || "-"}`,
  }));

  return (
    <section className="py-20 lg:py-25 xl:py-30">
      <div className="mx-auto max-w-c-1315 px-4 md:px-8 xl:px-0">
        {/* <!-- Section Title Start --> */}
        <div className="animate_top mx-auto text-center">
          <SectionHeader
            headerInfo={{
              title: `NEWS & BLOGS`,
              subtitle: `Latest MOHW RSS News`,
              description: `即時顯示資料庫最新衛福部新聞（每小時同步），點擊可查看完整內容。`,
            }}
          />
        </div>
        {/* <!-- Section Title End --> */}
      </div>

      <div className="mx-auto mt-15 max-w-c-1280 px-4 md:px-8 xl:mt-20 xl:px-0">
        <div className="grid grid-cols-1 gap-7.5 md:grid-cols-2 lg:grid-cols-3 xl:gap-10">
          {blogs.map((blog, key) => (
            <BlogItem blog={blog} key={key} />
          ))}
        </div>
      </div>
    </section>
  );
};

export default Blog;
