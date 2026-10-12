"use client";
import { useEffect, useState } from "react";
import { Toaster } from "@/components/Common/Toast";

const ToasterContext = () => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div>
      <Toaster />
    </div>
  );
};

export default ToasterContext;
