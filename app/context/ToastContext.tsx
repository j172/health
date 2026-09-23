"use client";
import { useEffect, useState } from "react";
import { Toaster } from "react-hot-toast";

const ToasterContext = () => {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) return null;

  return (
    <div>
      <Toaster position="top-center" reverseOrder={false} />
    </div>
  );
};

export default ToasterContext;
