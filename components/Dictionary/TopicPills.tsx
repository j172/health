"use client";

import { CHILD_TOPIC_CATEGORIES, TopicCategory } from "@/lib/server/dictionary/types";

interface TopicPillsProps {
  selectedTopic: string;
  onSelectTopic: (topicId: string) => void;
}

export default function TopicPills({
  selectedTopic,
  onSelectTopic,
}: TopicPillsProps) {
  return (
    <div className="w-full">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-xs font-bold tracking-wider text-slate-500 uppercase dark:text-slate-400">
          兒少生活情境探索主題
        </h3>
        {selectedTopic && (
          <button
            type="button"
            onClick={() => onSelectTopic("")}
            className="text-xs text-indigo-600 hover:text-indigo-800 font-medium dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors"
          >
            清除主題篩選
          </button>
        )}
      </div>
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-800">
        {CHILD_TOPIC_CATEGORIES.map((topic) => {
          const isSelected = selectedTopic === topic.id;
          return (
            <button
              key={topic.id}
              type="button"
              onClick={() => onSelectTopic(isSelected ? "" : topic.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all duration-200 border ${
                isSelected
                  ? "bg-indigo-600 border-indigo-600 text-white shadow-sm shadow-indigo-500/30 scale-[1.02]"
                  : "bg-white border-slate-200/80 text-slate-700 hover:border-indigo-300 hover:bg-indigo-50/50 hover:text-indigo-600 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300 dark:hover:border-indigo-800 dark:hover:bg-slate-800"
              }`}
            >
              <span className="text-sm">{topic.icon}</span>
              <span>{topic.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
