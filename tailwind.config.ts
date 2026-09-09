import type { Config } from "tailwindcss";
export default { content: ["./src/**/*.{ts,tsx}"], theme: { extend: { colors: { kenko: { orange: "#E86F24", green: "#4F7B38", cream: "#F7F5EF", ink: "#1E2C22" } } } }, plugins: [] } satisfies Config;
