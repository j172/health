import nextConfig from "eslint-config-next";

const eslintConfig = [
  ...nextConfig,
  {
    ignores: [".next/**", ".next3/**", "node_modules/**", ".claude/**"],
  },
];

export default eslintConfig;
